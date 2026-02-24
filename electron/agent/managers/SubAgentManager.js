/**
 * SubAgentManager — spawns focused sub-agents for specific tasks.
 *
 * A sub-agent is a lightweight AgentLoop with a narrower system prompt and
 * tool set, designed to handle one specific subtask and return a result.
 * The parent agent can delegate tasks via the `dispatch_subagent` tool.
 */
const { logger } = require('../../logger')

class SubAgentManager {
  constructor(anthropicClient, toolRegistry) {
    this.anthropicClient = anthropicClient
    this.toolRegistry = toolRegistry
    this.activeSubAgents = new Map()
  }

  /** Get the tool definition for dispatching sub-agents */
  getToolDefinition() {
    return {
      name: 'dispatch_subagent',
      description: 'Dispatch a focused sub-agent to handle a specific subtask. The sub-agent runs independently and returns its result. Use this for tasks that can be done in parallel or that require specialized focus (research, code analysis, data processing).',
      input_schema: {
        type: 'object',
        properties: {
          task:        { type: 'string', description: 'Clear description of what the sub-agent should do' },
          specialization: { type: 'string', enum: ['researcher', 'coder', 'analyst', 'reviewer'], description: 'Sub-agent specialization' },
          context:     { type: 'string', description: 'Relevant context the sub-agent needs' },
          max_turns:   { type: 'number', description: 'Maximum turns for the sub-agent (default 5, max 10)' }
        },
        required: ['task', 'specialization']
      }
    }
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
    const tools = this.toolRegistry.getToolDefinitions()

    const messages = [{ role: 'user', content: task }]
    let finalText = ''

    try {
      for (let turn = 0; turn < safeTurns; turn++) {
        const params = {
          model,
          max_tokens: 4096,
          system: fullSystem,
          messages,
        }
        if (tools.length > 0) params.tools = tools

        const response = await client.messages.create(params)

        const textBlocks = response.content.filter(b => b.type === 'text')
        finalText = textBlocks.map(b => b.text).join('\n')

        messages.push({ role: 'assistant', content: response.content })

        if (onProgress) onProgress({ turn: turn + 1, maxTurns: safeTurns, preview: finalText.slice(0, 200) })

        if (response.stop_reason === 'end_turn') break

        // Handle tool use
        if (response.stop_reason === 'tool_use') {
          const toolResults = []
          for (const block of response.content) {
            if (block.type === 'tool_use') {
              const result = await this.toolRegistry.execute(block.name, block.input)
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result)
              })
            }
          }
          messages.push({ role: 'user', content: toolResults })
        } else {
          break
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
