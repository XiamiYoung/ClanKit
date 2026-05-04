/**
 * SubAgentManager — spawns focused sub-agents for specific tasks.
 *
 * A sub-agent is a lightweight AgentLoop with a narrower system prompt and
 * tool set, designed to handle one specific subtask and return a result.
 * The parent agent can delegate tasks via the `dispatch_subagent` tool.
 */
const { logger } = require('../../logger')

/** Serialize a tool result (unified or legacy format) for LLM context. */
function serializeToolResult(result) {
  if (Array.isArray(result?.content) && result.content[0]?.type === 'text') {
    return result.content[0].text
  }
  return JSON.stringify(result)
}

class SubAgentManager {
  constructor(anthropicClient, toolRegistry, isOpenAI = false) {
    this.anthropicClient = anthropicClient
    this.toolRegistry = toolRegistry
    this.isOpenAI = isOpenAI
    this.activeSubAgents = new Map()
  }

  /** Get the tool definition for batch-dispatching multiple sub-agents in parallel */
  getBatchToolDefinition() {
    return {
      name: 'dispatch_subagents',
      description: 'Dispatch MULTIPLE sub-agents in parallel in a single call. Use this instead of multiple dispatch_subagent calls when you have 2 or more independent subtasks — all agents run concurrently, saving significant time. Returns an array of results in the same order as the input agents.',
      input_schema: {
        type: 'object',
        properties: {
          agents: {
            type: 'array',
            description: 'Array of sub-agent tasks to run in parallel',
            items: {
              type: 'object',
              properties: {
                task:           { type: 'string', description: 'Clear description of what this sub-agent should do' },
                specialization: { type: 'string', enum: ['researcher', 'coder', 'analyst', 'reviewer'], description: 'Sub-agent specialization' },
                context:        { type: 'string', description: 'Relevant context the sub-agent needs' },
                max_turns:      { type: 'number', description: 'Maximum turns (default 5, max 10)' },
                todo_id:        { type: 'number', description: 'Optional: todo item ID to mark as completed when this agent finishes' },
                todo_chat_id:   { type: 'string', description: 'Optional: chatId scope of the todo item (required when todos were created with a custom chatId)' }
              },
              required: ['task', 'specialization']
            }
          }
        },
        required: ['agents']
      }
    }
  }

  /** Get the tool definition for dispatching sub-agents */
  getToolDefinition() {
    return {
      name: 'dispatch_subagent',
      description: 'Dispatch a focused sub-agent to handle a specific subtask. The sub-agent runs independently and returns its result. Use this for tasks that can be done in parallel or that require specialized focus (research, code analysis, data processing). When dispatching multiple sub-agents, make multiple parallel dispatch_subagent tool calls in a single response to run them concurrently. Pass todo_chat_id and todo_id to auto-mark the corresponding todo item as completed when the sub-agent finishes.',
      input_schema: {
        type: 'object',
        properties: {
          task:        { type: 'string', description: 'Clear description of what the sub-agent should do' },
          specialization: { type: 'string', enum: ['researcher', 'coder', 'analyst', 'reviewer'], description: 'Sub-agent specialization' },
          context:     { type: 'string', description: 'Relevant context the sub-agent needs' },
          max_turns:   { type: 'number', description: 'Maximum turns for the sub-agent (default 5, max 10)' },
          todo_id:      { type: 'number', description: 'Optional: todo item ID to mark as completed when this sub-agent finishes' },
          todo_chat_id: { type: 'string', description: 'Optional: chatId scope of the todo item (required when todos were created with a custom chatId)' }
        },
        required: ['task', 'specialization']
      }
    }
  }

  /** Dispatch multiple sub-agents in parallel and auto-update todos */
  async dispatchBatch(input, onChunk, toolRegistry) {
    const agents = input.agents || []
    logger.agent('SubAgent batch dispatch', { count: agents.length })

    const results = await Promise.all(
      agents.map(async (agentInput, idx) => {
        const result = await this.dispatch(agentInput, (progress) => {
          onChunk({ type: 'subagent_progress', agentIndex: idx, ...progress })
        })
        // Emit tool_call + tool_result back-to-back so they pair correctly in the UI
        onChunk({ type: 'tool_call', name: 'dispatch_subagent', input: { task: agentInput.task, specialization: agentInput.specialization } })
        onChunk({ type: 'tool_result', name: 'dispatch_subagent', result: { success: result.success, result: (result.result || '').slice(0, 300) } })
        // Auto-update the linked todo item
        if (agentInput.todo_id != null && toolRegistry) {
          try {
            const todoStatus = result.success ? 'completed' : 'blocked'
            const todoTool = toolRegistry.getTodoTool()
            const todoChatId = agentInput.todo_chat_id || todoTool.findChatIdForTodo(agentInput.todo_id) || 'default'
            logger.agent('todo auto-update (batch)', { todoId: agentInput.todo_id, chatId: todoChatId, status: todoStatus })
            const todoInput = { action: 'update', chatId: todoChatId, id: agentInput.todo_id, status: todoStatus }
            const todoResult = await toolRegistry.execute('todo_manager', todoInput)
            logger.agent('todo auto-update result (batch)', { todoId: agentInput.todo_id, result: serializeToolResult(todoResult).slice(0, 120) })
            onChunk({ type: 'tool_call', name: 'todo_manager', input: todoInput })
            onChunk({ type: 'tool_result', name: 'todo_manager', result: serializeToolResult(todoResult) })
          } catch (e) { logger.error('todo auto-update failed (batch)', e.message) }
        }
        return { index: idx, task: (agentInput.task || '').slice(0, 80), ...result }
      })
    )

    const successCount = results.filter(r => r.success).length
    return { success: true, completed: successCount, total: agents.length, results }
  }

  /** Execute a sub-agent task */
  async dispatch(input, onProgress) {
    const { task, specialization, context = '', max_turns = 5 } = input
    const safeTurns = Math.min(max_turns || 5, 10)

    const systemPrompts = {
      researcher: 'You are a focused research agent. Gather information, search files, and summarize findings concisely. Do not make changes — only read and report.',
      coder:      'You are a focused coding agent. Write, modify, or fix code as requested. Be precise and concise. Return only the relevant code and a brief explanation.',
      analyst:    'You are a data analysis agent. Analyze data, compute statistics, identify patterns, and present insights clearly.',
      reviewer:   'You are a code review agent. Review code for bugs, security issues, performance problems, and style. Be specific with line numbers and suggestions.'
    }

    const system = systemPrompts[specialization] || systemPrompts.researcher
    const fullSystem = `${system}\n\nTask context:\n${context}`

    logger.agent('SubAgent dispatch', { specialization, task: task.slice(0, 100), maxTurns: safeTurns })

    const client = this.anthropicClient.getClient()
    const model = this.anthropicClient.resolveModel()
    const anthropicTools = this.toolRegistry.getToolDefinitions()

    let finalText = ''

    try {
      if (this.isOpenAI) {
        // ── OpenAI-format sub-agent ──
        const openaiTools = anthropicTools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description || '',
            parameters: t.input_schema || { type: 'object', properties: {} }
          }
        }))

        const messages = [
          { role: 'system', content: fullSystem },
          { role: 'user', content: task }
        ]

        for (let turn = 0; turn < safeTurns; turn++) {
          const params = { model, max_tokens: 4096, messages }
          if (openaiTools.length > 0) params.tools = openaiTools

          const response = await client.chat.completions.create(params)
          const choice = response.choices?.[0]
          if (!choice) break

          finalText = choice.message?.content || finalText
          messages.push(choice.message)

          if (onProgress) onProgress({ turn: turn + 1, maxTurns: safeTurns, preview: (finalText || '').slice(0, 200) })

          if (choice.finish_reason === 'tool_calls' || (choice.message?.tool_calls?.length > 0)) {
            for (const tc of choice.message.tool_calls || []) {
              let parsedArgs = {}
              try { parsedArgs = JSON.parse(tc.function.arguments || '{}') } catch {}
              const result = await this.toolRegistry.execute(tc.function.name, parsedArgs, tc.id)
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: serializeToolResult(result)
              })
            }
          } else {
            break
          }
        }
      } else {
        // ── Anthropic-format sub-agent (existing) ──
        const messages = [{ role: 'user', content: task }]

        for (let turn = 0; turn < safeTurns; turn++) {
          const params = {
            model,
            max_tokens: 4096,
            system: fullSystem,
            messages,
          }
          if (anthropicTools.length > 0) params.tools = anthropicTools

          const response = await client.messages.create(params)

          const textBlocks = response.content.filter(b => b.type === 'text')
          finalText = textBlocks.map(b => b.text).join('\n')

          messages.push({ role: 'assistant', content: response.content })

          if (onProgress) onProgress({ turn: turn + 1, maxTurns: safeTurns, preview: finalText.slice(0, 200) })

          if (response.stop_reason === 'end_turn') break

          if (response.stop_reason === 'tool_use') {
            const toolResults = []
            for (const block of response.content) {
              if (block.type === 'tool_use') {
                const result = await this.toolRegistry.execute(block.name, block.input, block.id)
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: serializeToolResult(result)
                })
              }
            }
            messages.push({ role: 'user', content: toolResults })
          } else {
            break
          }
        }
      }

      logger.agent('SubAgent done', { specialization, resultLen: finalText.length })
      return { success: true, result: finalText }
    } catch (err) {
      logger.error('SubAgent error', err.message)
      return { success: false, error: err.message }
    }
  }
}

module.exports = { SubAgentManager }
