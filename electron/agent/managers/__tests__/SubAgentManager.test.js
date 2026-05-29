/**
 * Tests for SubAgentManager — focused sub-agent dispatch via AgentLoop.
 *
 * Strategy (per LESSONS.md "Vitest 4.x"):
 *   - Monkey-patch withIsolatedAgentLoop at the module-export level
 *   - Stub-loop's run() lets each test return whatever shape it wants
 *   - We assert on what the manager BUILDS (excludedToolNames, prompts suffix,
 *     subagent chunk tagging, depth guard) — NOT on AgentLoop internals
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const helperMod   = require('../../runIsolatedAgentLoop')
const ipcAgentMod = require('../../../ipc/agent')

const originalHelper     = helperMod.withIsolatedAgentLoop
const originalIsCancelled = ipcAgentMod.isChatCancelled
const originalConsume    = ipcAgentMod.consumePendingStop

const { SubAgentManager } = require('../SubAgentManager')

// Per-test captured args + run() result
let captured
let stubRun

beforeEach(() => {
  captured = { helperCalls: [], runCalls: [] }
  stubRun = vi.fn(async () => ({ content: 'subagent reply', finalText: 'subagent reply' }))

  helperMod.withIsolatedAgentLoop = vi.fn(async (opts, block) => {
    captured.helperCalls.push(opts)
    const fakeLoop = { run: stubRun }
    return await block(fakeLoop, opts.loopConfig)
  })
  ipcAgentMod.isChatCancelled = vi.fn(() => false)
  ipcAgentMod.consumePendingStop = vi.fn(() => false)
})

afterEach(() => {
  helperMod.withIsolatedAgentLoop = originalHelper
  ipcAgentMod.isChatCancelled     = originalIsCancelled
  ipcAgentMod.consumePendingStop  = originalConsume
})

function makeParentContext(overrides = {}) {
  return {
    chatId: 'chat-1',
    parentAgentId: 'agent-parent',
    parentLoopConfig: {
      chatId: 'chat-1',
      systemAgentId: 'agent-parent',
      customModel: 'claude-opus-4-7',
      apiKey: 'k',
      baseURL: 'https://x',
      // Parent's existing exclusions should be preserved + extended
      excludedToolNames: ['parent-existing-block'],
      enabledAgents: ['agent-X'],
      enabledSkills: [],
    },
    parentAgentPrompts: {
      systemAgentId: 'agent-parent',
      systemAgentName: 'Parent',
      systemAgentPrompt: 'I am the parent agent persona.',
      // These three MUST be stripped for sub-agent (sub-agent is NOT in a group)
      groupChatContext: { otherParticipants: [{ name: 'Bob' }] },
      chatHandoverNote: 'note',
      analysisTargetAgentId: 'aid',
    },
    depth: 0,
    ...overrides,
  }
}

describe('SubAgentManager.dispatch', () => {
  it('rejects nested dispatch (depth >= 1)', async () => {
    const mgr = new SubAgentManager()
    const result = await mgr.dispatch({ task: 'do thing' }, vi.fn(), makeParentContext({ depth: 1 }))
    expect(result).toEqual({ success: false, error: expect.stringMatching(/nested subagent not allowed/) })
    expect(helperMod.withIsolatedAgentLoop).not.toHaveBeenCalled()
  })

  it('rejects when parentContext is missing chatId or parentLoopConfig', async () => {
    const mgr = new SubAgentManager()
    const r1 = await mgr.dispatch({ task: 't' }, vi.fn(), { chatId: null, parentLoopConfig: {} })
    expect(r1.success).toBe(false)
    const r2 = await mgr.dispatch({ task: 't' }, vi.fn(), { chatId: 'c', parentLoopConfig: null })
    expect(r2.success).toBe(false)
    expect(helperMod.withIsolatedAgentLoop).not.toHaveBeenCalled()
  })

  it('rejects when task is empty', async () => {
    const mgr = new SubAgentManager()
    const r = await mgr.dispatch({ task: '   ' }, vi.fn(), makeParentContext())
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/task is required/)
  })

  it('skips construction when chat is already cancelled', async () => {
    ipcAgentMod.isChatCancelled = vi.fn(() => true)
    const mgr = new SubAgentManager()
    const r = await mgr.dispatch({ task: 'go' }, vi.fn(), makeParentContext())
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/cancelled/)
    expect(helperMod.withIsolatedAgentLoop).not.toHaveBeenCalled()
  })

  it('extends parent excludedToolNames with ALWAYS_BLOCKED for sub-agents', async () => {
    const mgr = new SubAgentManager()
    await mgr.dispatch({ task: 'research X' }, vi.fn(), makeParentContext())

    const passedConfig = captured.helperCalls[0].loopConfig
    expect(passedConfig.excludedToolNames).toContain('parent-existing-block')   // inherited
    expect(passedConfig.excludedToolNames).toContain('dispatch_subagent')        // ALWAYS_BLOCKED: prevents nesting
    expect(passedConfig.excludedToolNames).toContain('dispatch_subagents')
    expect(passedConfig.excludedToolNames).toContain('fetch_newsfeed')
    expect(passedConfig.excludedToolNames).toContain('background_task')
  })

  it('adds READONLY_EXTRA_BLOCKED when readonly: true', async () => {
    const mgr = new SubAgentManager()
    await mgr.dispatch({ task: 'review X', readonly: true }, vi.fn(), makeParentContext())

    const passedConfig = captured.helperCalls[0].loopConfig
    expect(passedConfig.excludedToolNames).toContain('execute_shell')
    expect(passedConfig.excludedToolNames).toContain('update_memory')
  })

  it('does NOT add READONLY_EXTRA_BLOCKED when readonly is false / omitted', async () => {
    const mgr = new SubAgentManager()
    await mgr.dispatch({ task: 'code X' }, vi.fn(), makeParentContext())

    const passedConfig = captured.helperCalls[0].loopConfig
    expect(passedConfig.excludedToolNames).not.toContain('execute_shell')
    expect(passedConfig.excludedToolNames).not.toContain('update_memory')
  })

  it('strips group/analysis context from sub-agent prompts (sub-agent is not in a group)', async () => {
    const mgr = new SubAgentManager()
    await mgr.dispatch({ task: 'go' }, vi.fn(), makeParentContext())

    const subAgentPrompts = stubRun.mock.calls[0][5]  // 6th param of loop.run
    expect(subAgentPrompts.groupChatContext).toBeUndefined()
    expect(subAgentPrompts.chatHandoverNote).toBeUndefined()
    expect(subAgentPrompts.analysisTargetAgentId).toBeUndefined()
    // Persona/identity inherited
    expect(subAgentPrompts.systemAgentId).toBe('agent-parent')
    expect(subAgentPrompts.systemAgentPrompt).toBe('I am the parent agent persona.')
    // Suffix carries HARD RULES (no @, no questions, your reply IS the result, no nesting)
    expect(subAgentPrompts.subagentSuffix).toMatch(/SUB-AGENT MODE/)
    expect(subAgentPrompts.subagentSuffix).toMatch(/NEVER write `@SomeName`/)
    expect(subAgentPrompts.subagentSuffix).toMatch(/No nested sub-agents/)
    expect(subAgentPrompts.subagentSuffix).toMatch(/final assistant message IS the result/)
  })

  it('readonly suffix adds the read-only mode HARD RULE', async () => {
    const mgr = new SubAgentManager()
    await mgr.dispatch({ task: 'review', readonly: true }, vi.fn(), makeParentContext())

    const subAgentPrompts = stubRun.mock.calls[0][5]
    expect(subAgentPrompts.subagentSuffix).toMatch(/Read-only mode/)
    expect(subAgentPrompts.subagentSuffix).toMatch(/file_operation.{0,5}may be used only/i)
  })

  it('registration key uses chatId:sub:parentAgentId:uuid format', async () => {
    const mgr = new SubAgentManager()
    await mgr.dispatch({ task: 'go' }, vi.fn(), makeParentContext())

    const opts = captured.helperCalls[0]
    expect(opts.registrationKey).toMatch(/^chat-1:sub:agent-parent:[0-9a-f-]{36}$/)
    expect(opts.registrationMeta).toMatchObject({
      chatId: 'chat-1',
      isGroup: false,
      type: 'subagent',
      parentAgentId: 'agent-parent',
    })
  })

  it('tags every onChunk emission with subagentId so the renderer can drop them from msg.content', async () => {
    const parentOnChunk = vi.fn()
    // Make stub-loop's run actually emit chunks via the onChunk arg (4th param)
    stubRun = vi.fn(async (_messages, _agents, _skills, onChunk) => {
      onChunk({ type: 'text', text: 'hello from sub' })
      onChunk({ type: 'tool_call', name: 'read_file', input: { path: '/x' } })
      return { content: 'final' }
    })

    const mgr = new SubAgentManager()
    await mgr.dispatch({ task: 'go' }, parentOnChunk, makeParentContext())

    expect(parentOnChunk).toHaveBeenCalledTimes(2)
    for (const call of parentOnChunk.mock.calls) {
      expect(call[0].subagentId).toMatch(/^sub:agent-parent:/)
      expect(call[0].parentAgentId).toBe('agent-parent')
    }
  })

  it('passes empty mcpServers + httpTools + null ragContext (sub-agent is isolated)', async () => {
    const mgr = new SubAgentManager()
    await mgr.dispatch({ task: 'go' }, vi.fn(), makeParentContext())

    const args = stubRun.mock.calls[0]
    // signature: (messages, enabledAgents, enabledSkills, onChunk, attachments, agentPrompts, mcp, http, rag)
    expect(args[6]).toEqual([])    // mcpServers
    expect(args[7]).toEqual([])    // httpTools
    expect(args[8]).toBeNull()      // ragContext
    expect(args[4]).toEqual([])    // attachments
  })

  it('returns success + extracted final text on a successful run', async () => {
    const mgr = new SubAgentManager()
    const r = await mgr.dispatch({ task: 'go' }, vi.fn(), makeParentContext())
    expect(r).toEqual({ success: true, result: 'subagent reply' })
  })

  it('returns failure when AgentLoop throws inside helper', async () => {
    stubRun = vi.fn(async () => { throw new Error('rate limit') })
    const mgr = new SubAgentManager()
    const r = await mgr.dispatch({ task: 'go' }, vi.fn(), makeParentContext())
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/rate limit/)
  })

  it('embeds optional context block into the user message', async () => {
    const mgr = new SubAgentManager()
    await mgr.dispatch({ task: 'extract titles', context: 'Working on /tmp/big.html' }, vi.fn(), makeParentContext())
    const messages = stubRun.mock.calls[0][0]
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toMatch(/extract titles/)
    expect(messages[0].content).toMatch(/Context from parent/)
    expect(messages[0].content).toMatch(/Working on \/tmp\/big\.html/)
  })
})

describe('SubAgentManager.dispatchBatch', () => {
  it('dispatches all entries concurrently and aggregates success/failure counts', async () => {
    // Make every alternate run succeed/fail
    let n = 0
    stubRun = vi.fn(async () => {
      const i = n++
      if (i % 2 === 0) return { content: `ok-${i}` }
      throw new Error(`fail-${i}`)
    })

    const mgr = new SubAgentManager()
    const onChunk = vi.fn()
    const result = await mgr.dispatchBatch({
      agents: [
        { task: 'a' }, { task: 'b' }, { task: 'c' }, { task: 'd' },
      ],
    }, onChunk, /*toolRegistry*/ null, makeParentContext())

    expect(result.success).toBe(true)
    expect(result.total).toBe(4)
    expect(result.completed).toBe(2)   // i=0, i=2 succeed
    expect(result.results).toHaveLength(4)
    // Each call should have produced a paired tool_call + tool_result chunk
    const callTypes = onChunk.mock.calls.map(c => c[0].type)
    expect(callTypes.filter(t => t === 'tool_call').length).toBeGreaterThanOrEqual(4)
    expect(callTypes.filter(t => t === 'tool_result').length).toBeGreaterThanOrEqual(4)
  })

  it('each batch entry gets its own subagentId (no collision)', async () => {
    const subagentIdsSeen = new Set()
    stubRun = vi.fn(async (_messages, _agents, _skills, onChunk) => {
      onChunk({ type: 'text', text: 'x' })
      return { content: 'x' }
    })
    const mgr = new SubAgentManager()
    const onChunk = (chunk) => {
      if (chunk.subagentId) subagentIdsSeen.add(chunk.subagentId)
    }
    await mgr.dispatchBatch({
      agents: [{ task: 'a' }, { task: 'b' }, { task: 'c' }],
    }, onChunk, null, makeParentContext())
    expect(subagentIdsSeen.size).toBe(3)
  })
})
