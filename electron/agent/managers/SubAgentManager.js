/**
 * SubAgentManager — spawns focused sub-agents for specific tasks.
 *
 * Architectural contract (LESSONS.md "AgentLoop entry-point Iron Law"):
 *   A sub-agent IS a configured AgentLoop instance — NOT a parallel mini-loop.
 *   Construction goes through `withIsolatedAgentLoop` so normalize/validate/
 *   register/unregister are guaranteed. The sub-agent inherits the parent
 *   loopConfig (provider, credentials, permissions, identity, language,
 *   memory) — only three things are overridden:
 *     1. `excludedToolNames` — drop recursion + noise tools (+ writes if readonly)
 *     2. `subagentSuffix`    — appended to system prompt with HARD RULES
 *                              (no @mentions, no questions, your reply IS the result)
 *     3. `_subagentDepth`    — incremented; depth>=1 dispatch is rejected
 *
 * There is intentionally NO "specialization" enum. A sub-agent is just a
 * focused instance of the parent agent, scoped to one subtask. The parent's
 * own persona / tool set already defines what kind of agent it is. Adding
 * "researcher/coder/analyst/reviewer" sub-personas would double-classify
 * identity in a way no other ClanKit feature does.
 */
const { logger }      = require('../../logger')
const { randomUUID }  = require('crypto')
// NOT destructured: tests monkey-patch `_helperMod.withIsolatedAgentLoop` at
// runtime (LESSONS.md "Vitest 4.x" — destructuring captures the function at
// load time and tests' patches are then invisible).
const _helperMod      = require('../runIsolatedAgentLoop')

// Always blocked for sub-agents, regardless of mode:
// - dispatch_subagent / dispatch_subagents : prevents recursion + cost blow-up
// - fetch_newsfeed                          : noise; parent's news pull (if any) was already done upstream
// - background_task                         : sub-agents are themselves a foreground delegation; nesting another async layer obscures completion
const ALWAYS_BLOCKED = [
  'dispatch_subagent',
  'dispatch_subagents',
  'fetch_newsfeed',
  'background_task',
]

// Additional tools blocked when the caller asks for readonly mode.
// Note: file_operation isn't tool-level blockable (read/write are parameter
// modes of the same tool) — the suffix below carries the prose constraint.
const READONLY_EXTRA_BLOCKED = [
  'execute_shell',
  'update_memory',
]

const SUBAGENT_SUFFIX_BASE = `
---
## SUB-AGENT MODE — HARD RULES (overrides anything above that conflicts)

You are running as a focused sub-agent dispatched by the main agent. The block above describes your identity, voice, and capabilities; the rules below tell you HOW to operate in this dispatched context.

- **Investigate before answering.** If a file/path read fails, use list / glob / grep to verify before concluding "not found". Do NOT stop on the first error.
- **No questions back to the user.** You are NOT in conversation with a human — the user is not in this loop. Make the most reasonable assumption from the task description and proceed. If truly blocked, return what you found plus a one-line "blocker: ..." note instead of asking.
- **Not a group participant.** You are NOT a member of any group chat for this dispatch. NEVER write \`@SomeName\` in your output — your reply is read only by the parent agent who dispatched you. Any \`@\`-mention in your output is a bug that may misroute the parent's group conversation.
- **No nested sub-agents.** Do NOT call \`dispatch_subagent\` / \`dispatch_subagents\` from inside a sub-agent.
- **Your final assistant message IS the result returned to the parent.** End with the concrete deliverable — not "shall I continue?" or "let me know if you want X". The parent will read your full reply text verbatim and decide the next step.
- **Surgical scope.** Do only what the task description asks. Don't refactor adjacent code, fix unrelated bugs, or extend the task scope.`

const SUBAGENT_SUFFIX_READONLY_EXTRA = `
- **Read-only mode.** Do NOT modify any file. \`file_operation\` may be used only in \`read\` / \`list\` / \`glob\` / \`grep\` modes — \`write\` and \`edit\` modes are forbidden for this dispatch.`

function _buildSuffix(readonly) {
  return readonly ? SUBAGENT_SUFFIX_BASE + SUBAGENT_SUFFIX_READONLY_EXTRA : SUBAGENT_SUFFIX_BASE
}

function _buildExcludedToolNames(parentExclusions, readonly) {
  return [
    ...(parentExclusions || []),
    ...ALWAYS_BLOCKED,
    ...(readonly ? READONLY_EXTRA_BLOCKED : []),
  ]
}

class SubAgentManager {
  constructor() {
    // Diagnostic map of currently-running sub-agents in this parent loop.
    // Lifecycle ownership is shared with ipcAgent.activeLoops (registered/
    // unregistered by withIsolatedAgentLoop); this map exists only for
    // logging and `dispatchBatch` accounting.
    this.activeSubAgents = new Map()
  }

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
                task:         { type: 'string',  description: 'Clear description of what this sub-agent should do.' },
                context:      { type: 'string',  description: 'Optional relevant context the sub-agent needs (file paths, prior findings, constraints).' },
                readonly:     { type: 'boolean', description: 'If true, sub-agent cannot run shell, write/edit files, or update memory. Use for pure research / review tasks. Default false.' },
                todo_id:      { type: 'number',  description: 'Optional: todo item ID to mark as completed when this agent finishes.' },
                todo_chat_id: { type: 'string',  description: 'Optional: chatId scope of the todo item (required when todos were created with a custom chatId).' },
              },
              required: ['task'],
            },
          },
        },
        required: ['agents'],
      },
    }
  }

  getToolDefinition() {
    return {
      name: 'dispatch_subagent',
      description: 'Dispatch a focused sub-agent to handle a specific subtask. The sub-agent runs independently with the same identity, model, and credentials as you, but in an isolated conversation that only sees the task you give it. Use this for tasks that benefit from a fresh context window (large file reads, multi-step research) or that can be done in parallel with your other work. For 2+ independent subtasks prefer `dispatch_subagents` to run them concurrently.',
      input_schema: {
        type: 'object',
        properties: {
          task:         { type: 'string',  description: 'Clear description of what the sub-agent should do. This becomes the sub-agent\'s user message.' },
          context:      { type: 'string',  description: 'Optional relevant context the sub-agent needs (file paths, prior findings, constraints).' },
          readonly:     { type: 'boolean', description: 'If true, sub-agent cannot run shell, write/edit files, or update memory. Use for pure research / review tasks. Default false.' },
          todo_id:      { type: 'number',  description: 'Optional: todo item ID to mark as completed when this sub-agent finishes.' },
          todo_chat_id: { type: 'string',  description: 'Optional: chatId scope of the todo item (required when todos were created with a custom chatId).' },
        },
        required: ['task'],
      },
    }
  }

  /**
   * Dispatch multiple sub-agents in parallel and auto-update linked todos.
   * Each entry goes through the same `dispatch()` path so isolation,
   * registration, and cancellation behavior match the single-dispatch case.
   */
  async dispatchBatch(input, onChunk, toolRegistry, parentContext) {
    const agents = input.agents || []
    logger.agent('SubAgent batch dispatch', { count: agents.length, depth: parentContext?.depth ?? 0 })

    const results = await Promise.all(
      agents.map(async (agentInput, idx) => {
        const result = await this.dispatch(agentInput, onChunk, parentContext)

        // Emit a paired tool_call + tool_result for each batch entry so the
        // renderer can render one card per dispatched sub-agent.
        onChunk?.({ type: 'tool_call',   name: 'dispatch_subagent',
          input:  { task: agentInput.task, readonly: !!agentInput.readonly, batchIndex: idx } })
        onChunk?.({ type: 'tool_result', name: 'dispatch_subagent',
          result: { success: result.success, result: (result.result || '').slice(0, 300) } })

        // Auto-update the linked todo item (if any).
        if (agentInput.todo_id != null && toolRegistry) {
          try {
            const todoStatus = result.success ? 'completed' : 'blocked'
            const todoTool   = toolRegistry.getTodoTool()
            const todoChatId = agentInput.todo_chat_id || todoTool.findChatIdForTodo(agentInput.todo_id) || 'default'
            const todoInput  = { action: 'update', chatId: todoChatId, id: agentInput.todo_id, status: todoStatus }
            const todoResult = await toolRegistry.execute('todo_manager', todoInput)
            const todoText   = Array.isArray(todoResult?.content) && todoResult.content[0]?.type === 'text'
              ? todoResult.content[0].text : JSON.stringify(todoResult)
            onChunk?.({ type: 'tool_call',   name: 'todo_manager', input: todoInput })
            onChunk?.({ type: 'tool_result', name: 'todo_manager', result: todoText })
          } catch (e) { logger.error('todo auto-update failed (batch)', e.message) }
        }
        return { index: idx, task: (agentInput.task || '').slice(0, 80), ...result }
      }),
    )

    const successCount = results.filter(r => r.success).length
    return { success: true, completed: successCount, total: agents.length, results }
  }

  /**
   * Execute a single sub-agent task.
   *
   * @param {object} input            { task, context?, readonly? }
   * @param {function} onChunk        Parent's chunk callback. Sub-agent chunks
   *                                  are tagged with subagentId / parentAgentId
   *                                  so the renderer can keep them OUT of the
   *                                  parent's msg.content (prevents @mention
   *                                  bleed in group chat).
   * @param {object} parentContext    { chatId, parentAgentId, parentLoopConfig,
   *                                    parentAgentPrompts, depth }
   *                                  Injected by AgentLoop's dispatch_subagent
   *                                  tool-execution sites — see agentLoop.js.
   */
  async dispatch(input, onChunk, parentContext = {}) {
    const { task, context = '', readonly = false } = input
    const { chatId, parentAgentId, parentLoopConfig, parentAgentPrompts, depth } = parentContext

    // ── Depth guard: no nested sub-agents (cost / runaway protection) ───────
    if ((depth ?? 0) >= 1) {
      logger.warn('[SubAgent] nested dispatch rejected', { depth })
      return { success: false, error: 'nested subagent not allowed (depth >= 1)' }
    }
    if (!chatId || !parentLoopConfig) {
      logger.warn('[SubAgent] missing parentContext', { hasChatId: !!chatId, hasConfig: !!parentLoopConfig })
      return { success: false, error: 'subagent dispatch requires parentContext { chatId, parentLoopConfig }' }
    }
    if (!task || !String(task).trim()) {
      return { success: false, error: 'task is required' }
    }

    const ipcAgent = require('../../ipc/agent')

    const subagentId  = `sub:${parentAgentId || 'anon'}:${randomUUID()}`
    const subagentKey = `${chatId}:${subagentId}`

    // Pre-flight cancel: parent may have been Esc'd between tool_use emission
    // and our dispatch entry. Skip the whole construction in that case.
    if (ipcAgent.isChatCancelled(chatId)) {
      return { success: false, error: 'cancelled before subagent start' }
    }

    // ── Build sub-agent loopConfig (inherit parent; override 3 fields) ──────
    const subLoopConfig = {
      ...parentLoopConfig,
      chatId,
      excludedToolNames:        _buildExcludedToolNames(parentLoopConfig.excludedToolNames, readonly),
      _subagentDepth:           (depth ?? 0) + 1,
      _subagentReadonly:        !!readonly,
    }
    // Strip parent-only chunk listener — sub-agent has its own (wrappedOnChunk below).
    delete subLoopConfig.onChunk

    // ── Build sub-agent agentPrompts: inherit parent's persona, strip group/
    //    analysis context (sub-agent is NOT in a group; suffix forbids @mentions),
    //    append subagentSuffix (consumed verbatim by spb.buildSystemPrompt). ──
    const subAgentPrompts = {
      ...(parentAgentPrompts || {}),
      groupChatContext: undefined,
      chatHandoverNote: undefined,
      analysisTargetAgentId: undefined,
      analysisTargetAgentName: undefined,
      analysisTargetAgentType: undefined,
      subagentSuffix: _buildSuffix(readonly),
    }

    // ── Build sub-agent's initial message — single user turn ────────────────
    const userContent = context && String(context).trim()
      ? `${task}\n\n---\nContext from parent:\n${context}`
      : task
    const messages = [{ role: 'user', content: userContent }]

    // ── Chunk wrapper: tag every emission with subagentId so the renderer
    //    (and the parent's persistence layer) can keep sub-agent output OUT
    //    of the parent agent's msg.content (prevents @mention bleed in group). ──
    const wrappedOnChunk = (chunk) => {
      if (typeof onChunk !== 'function') return
      onChunk({
        ...chunk,
        subagentId,
        parentAgentId: parentAgentId || null,
      })
    }

    this.activeSubAgents.set(subagentKey, { chatId, parentAgentId, readonly: !!readonly })
    logger.agent('SubAgent dispatch', {
      subagentKey, readonly: !!readonly, depth: (depth ?? 0) + 1,
      task: String(task).slice(0, 100),
    })

    try {
      const result = await _helperMod.withIsolatedAgentLoop({
        loopConfig: subLoopConfig,
        registrationKey:  subagentKey,
        registrationMeta: {
          chatId,
          agentId:       subagentId,
          agentName:     'subagent',
          isGroup:       false,
          type:          'subagent',
          parentAgentId: parentAgentId || null,
        },
        systemAgentId: parentLoopConfig.systemAgentId || null,
      }, async (loop, _normalized) => {
        // Honor any pending stop that arrived during construction race window.
        ipcAgent.consumePendingStop(chatId)
        if (ipcAgent.isChatCancelled(chatId)) {
          return { __cancelled: true }
        }

        // No attachments, no MCP / http tools, no RAG context.
        return await loop.run(
          messages,
          subLoopConfig.enabledAgents || [],
          subLoopConfig.enabledSkills || [],
          wrappedOnChunk,
          [],     // currentAttachments
          subAgentPrompts,
          [],     // mcpServers — explicitly excluded for sub-agents
          [],     // httpTools  — explicitly excluded for sub-agents
          null,   // ragContext
        )
      })

      if (result?.__cancelled) {
        return { success: false, error: 'cancelled during subagent setup' }
      }
      const finalText = _extractFinalText(result)
      logger.agent('SubAgent done', { subagentKey, resultLen: finalText.length })
      return { success: true, result: finalText }
    } catch (err) {
      logger.error('[SubAgent] run error', err.message)
      return { success: false, error: err.message }
    } finally {
      this.activeSubAgents.delete(subagentKey)
    }
  }
}

// AgentLoop.run() returns a result object. Different shapes have been observed
// historically; defensive extraction so a shape drift doesn't silently turn
// into an empty string — surface whatever the call returned.
function _extractFinalText(result) {
  if (!result) return ''
  if (typeof result === 'string') return result
  if (typeof result.content === 'string') return result.content
  if (typeof result.finalText === 'string') return result.finalText
  if (Array.isArray(result.messages) && result.messages.length > 0) {
    const last = result.messages[result.messages.length - 1]
    if (last && typeof last.content === 'string') return last.content
  }
  return ''
}

module.exports = { SubAgentManager }
