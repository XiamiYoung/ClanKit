import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, reactive, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mocks ──────────────────────────────────────────────────────────────────────
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `uuid-${++uuidCounter}`,
}))

let mockChatsStore
let mockAgentsStore

vi.mock('../../stores/chats', () => ({
  useChatsStore: () => mockChatsStore,
}))
vi.mock('../../stores/agents', () => ({
  useAgentsStore: () => mockAgentsStore,
}))
vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))

// Import after mocks are declared
import { useChunkHandler } from '../useChunkHandler'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeChat(overrides = {}) {
  return {
    id: 'chat1',
    messages: [],
    isRunning: false,
    isThinking: false,
    isCallingTool: false,
    currentToolCall: null,
    groupAgentIds: [],
    ...overrides,
  }
}

function createHandler(overrides = {}) {
  return useChunkHandler({
    scrollToBottom: vi.fn(),
    dbg: vi.fn(),
    _fireGroupAgentsDirect: vi.fn(),
    stickyTarget: ref(null),
    stopStreamingTimer: vi.fn(),
    ...overrides,
  })
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  uuidCounter = 0

  mockChatsStore = {
    activeChatId: 'chat1',
    chats: [makeChat()],
    persistChat: vi.fn(),
    persist: vi.fn(),
    markCompleted: vi.fn(),
    markPermissionPending: vi.fn(),
  }
  mockAgentsStore = {
    getAgentById: vi.fn((id) => ({ id, name: `Agent-${id}` })),
  }
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useChunkHandler', () => {
  // ─── 1. agent_start creates a streaming placeholder ──────────────────────
  describe('agent_start chunk', () => {
    it('creates a streaming message placeholder with correct agentId and agentName', () => {
      const { handleChunk, perChatStreamingMsgId } = createHandler()

      handleChunk('chat1', {
        type: 'agent_start',
        agentId: 'a1',
        agentName: 'Alice',
      })

      const chat = mockChatsStore.chats[0]
      expect(chat.messages).toHaveLength(1)

      const msg = chat.messages[0]
      expect(msg.role).toBe('assistant')
      expect(msg.content).toBe('')
      expect(msg.streaming).toBe(true)
      expect(msg.agentId).toBe('a1')
      expect(msg.agentName).toBe('Alice')
      expect(msg.segments).toEqual([])

      // Streaming maps keyed by chatId:agentId
      expect(perChatStreamingMsgId.has('chat1:a1')).toBe(true)
      expect(perChatStreamingMsgId.get('chat1:a1')).toBe(msg.id)
    })

    it('removes an existing waiting indicator when agent_start fires', () => {
      const { handleChunk } = createHandler()
      const chat = mockChatsStore.chats[0]
      chat.messages.push({ id: 'w1', isWaitingIndicator: true, waitingState: 'running' })

      handleChunk('chat1', {
        type: 'agent_start',
        agentId: 'a1',
        agentName: 'Alice',
      })

      const waitingMsgs = chat.messages.filter(m => m.isWaitingIndicator)
      expect(waitingMsgs).toHaveLength(0)
      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].agentId).toBe('a1')
    })

    it('skips duplicate agent_start for the same agent', () => {
      const dbg = vi.fn()
      const { handleChunk } = createHandler({ dbg })

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })

      const chat = mockChatsStore.chats[0]
      expect(chat.messages).toHaveLength(1)
      expect(dbg).toHaveBeenCalledWith(
        expect.stringContaining('DUPLICATE skipped'),
        'warn'
      )
    })
  })

  // ─── 2. text chunk appends to correct streaming message ──────────────────
  describe('text chunk', () => {
    it('appends text to the correct streaming message by agent key', () => {
      const { handleChunk, perChatStreamingMsgId } = createHandler()

      // Start agent
      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })

      // Send text chunks
      handleChunk('chat1', { type: 'text', text: 'Hello ', agentId: 'a1' })
      handleChunk('chat1', { type: 'text', text: 'World!', agentId: 'a1' })

      const chat = mockChatsStore.chats[0]
      const msg = chat.messages[0]
      expect(msg.content).toBe('Hello World!')
      expect(msg.streaming).toBe(true)
      expect(msg.segments).toEqual([{ type: 'text', content: 'Hello World!' }])
    })

    it('clears isThinking when first text chunk arrives', () => {
      const { handleChunk } = createHandler()
      const chat = mockChatsStore.chats[0]
      chat.isThinking = true

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', { type: 'text', text: 'Hi', agentId: 'a1' })

      expect(chat.isThinking).toBe(false)
    })
  })

  // ─── 3. agent_end finalizes message ──────────────────────────────────────
  describe('agent_end chunk', () => {
    it('finalizes message: streaming=false, computes durationMs', () => {
      const { handleChunk, perChatStreamingMsgId, runningAgentKeys } = createHandler()

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', { type: 'text', text: 'Done.', agentId: 'a1' })

      // Simulate runningAgentKeys being populated (normally done externally)
      runningAgentKeys.add('chat1:a1')

      handleChunk('chat1', { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })

      const msg = mockChatsStore.chats[0].messages[0]
      expect(msg.streaming).toBe(false)
      expect(msg.content).toBe('Done.')
      expect(typeof msg.durationMs).toBe('number')

      // Streaming maps are cleaned up
      expect(perChatStreamingMsgId.has('chat1:a1')).toBe(false)
      // runningAgentKeys cleared
      expect(runningAgentKeys.has('chat1:a1')).toBe(false)
    })

    it('silently removes empty placeholder when agent produces no content (group sequential / collab no-op)', () => {
      const { handleChunk } = createHandler()

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      expect(mockChatsStore.chats[0].messages.length).toBe(1)

      handleChunk('chat1', { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })

      // Empty placeholder removed — no visual noise from agents that ran but said nothing
      expect(mockChatsStore.chats[0].messages.length).toBe(0)
    })

    it('keeps the bubble (marked isError) when agent_end fires after an explicit agent_error', () => {
      const { handleChunk } = createHandler()

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', { type: 'agent_error', agentId: 'a1', agentName: 'Alice', error: 'rate limit', errorCode: 'rate_limit' })
      handleChunk('chat1', { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })

      const msg = mockChatsStore.chats[0].messages[0]
      expect(msg).toBeDefined()
      expect(msg.isError).toBe(true)
      expect(msg.errorDetail).toBe('rate limit')
      expect(msg.streaming).toBe(false)
    })
  })

  // ─── 4. Segment preservation on agent_end truncation ─────────────────────
  describe('segment preservation on agent_end (roleplay truncation)', () => {
    it('preserves non-text segments (tool_call, tool_result) when truncating roleplay', () => {
      const { handleChunk, perChatStreamingSegments } = createHandler()

      // Set up a group chat with two agents
      const chat = mockChatsStore.chats[0]
      chat.groupAgentIds = ['a1', 'a2']
      mockAgentsStore.getAgentById = vi.fn((id) => {
        if (id === 'a1') return { id: 'a1', name: 'Alice' }
        if (id === 'a2') return { id: 'a2', name: 'Bob' }
        return null
      })

      // Start agent a1
      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })

      // Simulate tool_call + tool_result segments, then text with @Bob mention + extra roleplay
      handleChunk('chat1', {
        type: 'tool_call',
        agentId: 'a1',
        name: 'search',
        input: { query: 'test' },
      })
      handleChunk('chat1', {
        type: 'tool_result',
        agentId: 'a1',
        name: 'search',
        result: 'found it',
      })

      // Build a long text that mentions @Bob and then continues with fake roleplay dialogue
      const textBeforeMention = 'Here are the results. '
      const mentionAndTail = '@Bob, please review this.\n\nBob: Sure, I will look at this. Alice: Great, let me also add more context about the issue we are debugging together.'
      handleChunk('chat1', {
        type: 'text',
        text: textBeforeMention + mentionAndTail,
        agentId: 'a1',
      })

      // End agent — triggers truncation
      handleChunk('chat1', { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })

      const msg = chat.messages[0]
      // Tool segment must survive truncation
      const toolSegments = msg.segments.filter(s => s.type === 'tool')
      expect(toolSegments.length).toBeGreaterThanOrEqual(1)
      expect(toolSegments[0].name).toBe('search')
      expect(toolSegments[0].output).toBe('found it')

      // Text was truncated — should NOT contain the fake "Bob: Sure" dialogue
      expect(msg.content).not.toContain('Bob: Sure')
      // But should contain the @Bob mention itself
      expect(msg.content).toContain('@Bob')
    })

    it('does NOT truncate when @-mention is a salutation followed by the agent\'s own continuing text', () => {
      const { handleChunk } = createHandler()
      const chat = mockChatsStore.chats[0]
      chat.groupAgentIds = ['a1', 'a2']
      mockAgentsStore.getAgentById = vi.fn((id) => {
        if (id === 'a1') return { id: 'a1', name: 'Alice' }
        if (id === 'a2') return { id: 'a2', name: '文档大师' }
        return null
      })

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })

      // Salutation: @-mention at start, then a long single-paragraph self-introduction
      // (no double-newline, no roleplay markers). Must be preserved in full.
      const fullText = '@文档大师  \n你好！我是 Alice — 一个能写代码、读网页、跑工具、拆任务、生成报告、也懂怎么把一句话变成结构清晰的 Markdown 或 .docx 的实操派。'
      handleChunk('chat1', { type: 'text', text: fullText, agentId: 'a1' })
      handleChunk('chat1', { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })

      const msg = chat.messages[0]
      expect(msg.content).toBe(fullText)
      expect(msg.content).toContain('Markdown 或 .docx 的实操派')
    })

    it('truncates when agent immediately impersonates other (\"@Bob: ...\" pattern)', () => {
      const { handleChunk } = createHandler()
      const chat = mockChatsStore.chats[0]
      chat.groupAgentIds = ['a1', 'a2']
      mockAgentsStore.getAgentById = vi.fn((id) => {
        if (id === 'a1') return { id: 'a1', name: 'Alice' }
        if (id === 'a2') return { id: 'a2', name: 'Bob' }
        return null
      })

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      const fullText = 'Done. @Bob: thanks Alice, I will take it from here and finish the review tonight.'
      handleChunk('chat1', { type: 'text', text: fullText, agentId: 'a1' })
      handleChunk('chat1', { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })

      const msg = chat.messages[0]
      expect(msg.content).toContain('@Bob')
      expect(msg.content).not.toContain('thanks Alice')
    })

    it('does NOT truncate when \\n\\n@OtherName is followed by plain prose (review addressing, not impersonation)', () => {
      const { handleChunk } = createHandler()
      const chat = mockChatsStore.chats[0]
      chat.groupAgentIds = ['a1', 'a2']
      mockAgentsStore.getAgentById = vi.fn((id) => {
        if (id === 'a1') return { id: 'a1', name: 'Alice' }
        if (id === 'a2') return { id: 'a2', name: 'Bob' }
        return null
      })

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      // Common pattern: opener mentions @Bob, then (after tool calls in real flow)
      // a review paragraph that ALSO addresses @Bob without a colon. Joining text
      // segments produces a \n\n@Bob boundary that previously got mis-truncated as
      // a roleplay marker, eating the agent's own review prose.
      const fullText = 'Let me check @Bob the latest fix.\n\n@Bob I confirmed all the fixes are in place. Specifically: timeout is added, exit code is correct. No remaining issues.'
      handleChunk('chat1', { type: 'text', text: fullText, agentId: 'a1' })
      handleChunk('chat1', { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })

      const msg = chat.messages[0]
      expect(msg.content).toBe(fullText)
      expect(msg.content).toContain('No remaining issues')
    })
  })

  // ─── 5. send_message_complete chunk ──────────────────────────────────────
  describe('send_message_complete chunk', () => {
    it('clears isRunning and marks chat completed on send_message_complete', async () => {
      const chat = makeChat({ isRunning: true })
      mockChatsStore.chats = [chat]
      const { handleChunk } = createHandler()

      await handleChunk('chat1', { type: 'send_message_complete' })

      expect(chat.isRunning).toBe(false)
      expect(mockChatsStore.markCompleted).toHaveBeenCalledWith('chat1')
    })

    it('does not mutate stickyTarget when completion arrives', () => {
      const stickyTarget = ref(['a1'])
      const { handleChunk } = createHandler({ stickyTarget })

      handleChunk('chat1', {
        type: 'send_message_complete',
        stickyTargetIds: ['a1', 'a2'],
      })

      expect(stickyTarget.value).toEqual(['a1'])
    })

    it('clears isInCollaborationLoop and chat running state', () => {
      const { handleChunk, isInCollaborationLoop } = createHandler()
      isInCollaborationLoop.value = true

      const chat = mockChatsStore.chats[0]
      chat.isRunning = true
      chat.isThinking = true
      chat.isCallingTool = true
      chat.currentToolCall = 'someTool'

      handleChunk('chat1', { type: 'send_message_complete' })

      expect(isInCollaborationLoop.value).toBe(false)
      expect(chat.isRunning).toBe(false)
      expect(chat.isThinking).toBe(false)
      expect(chat.isCallingTool).toBe(false)
      expect(chat.currentToolCall).toBeNull()
    })

    it('removes stale waiting indicator', () => {
      const { handleChunk } = createHandler()
      const chat = mockChatsStore.chats[0]
      chat.messages.push({ id: 'w1', isWaitingIndicator: true })

      handleChunk('chat1', { type: 'send_message_complete' })

      expect(chat.messages.filter(m => m.isWaitingIndicator)).toHaveLength(0)
    })

    it('cleans up streaming maps for the chat', () => {
      const { handleChunk, perChatStreamingMsgId, perChatStreamingSegments, runningAgentKeys } = createHandler()

      // Simulate leftover state from agents
      perChatStreamingMsgId.set('chat1:a1', 'msg1')
      perChatStreamingMsgId.set('chat1:a2', 'msg2')
      perChatStreamingMsgId.set('chat2:a1', 'msg3') // different chat — should survive
      perChatStreamingSegments.set('chat1:a1', [])
      runningAgentKeys.add('chat1:a1')
      runningAgentKeys.add('chat1:a2')

      handleChunk('chat1', { type: 'send_message_complete' })

      expect(perChatStreamingMsgId.has('chat1:a1')).toBe(false)
      expect(perChatStreamingMsgId.has('chat1:a2')).toBe(false)
      expect(perChatStreamingMsgId.has('chat2:a1')).toBe(true) // untouched
      expect(runningAgentKeys.has('chat1:a1')).toBe(false)
      expect(runningAgentKeys.has('chat1:a2')).toBe(false)
    })

    it('calls persist on the chats store', () => {
      const { handleChunk } = createHandler()
      handleChunk('chat1', { type: 'send_message_complete' })
      expect(mockChatsStore.persist).toHaveBeenCalled()
    })
  })

  // ─── 6. send_message_error chunk ─────────────────────────────────────────
  describe('send_message_error chunk', () => {
    it('marks still-streaming messages as errored and clears running state', () => {
      const { handleChunk } = createHandler()

      const chat = mockChatsStore.chats[0]
      chat.isRunning = true
      chat.messages.push({
        id: 'm1',
        role: 'assistant',
        content: '',
        streaming: true,
        streamingStartedAt: Date.now() - 1000,
      })

      handleChunk('chat1', {
        type: 'send_message_error',
        error: 'Provider rate limit exceeded',
      })

      const msg = chat.messages.find(m => m.id === 'm1')
      expect(msg.streaming).toBe(false)
      expect(msg.content).toContain('Error: Provider rate limit exceeded')
      expect(typeof msg.durationMs).toBe('number')
      expect(chat.isRunning).toBe(false)
    })

    it('removes waiting indicator on error', () => {
      const { handleChunk } = createHandler()
      const chat = mockChatsStore.chats[0]
      chat.messages.push({ id: 'w1', isWaitingIndicator: true })

      handleChunk('chat1', { type: 'send_message_error', error: 'fail' })

      expect(chat.messages.filter(m => m.isWaitingIndicator)).toHaveLength(0)
    })
  })

  // ─── 7. runningAgentKeys tracking ────────────────────────────────────────
  describe('runningAgentKeys tracking', () => {
    it('agent_end removes key from runningAgentKeys', () => {
      const { handleChunk, runningAgentKeys } = createHandler()

      // Start agent and manually add to runningAgentKeys (normally done by the caller)
      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      runningAgentKeys.add('chat1:a1')
      expect(runningAgentKeys.has('chat1:a1')).toBe(true)

      handleChunk('chat1', { type: 'text', text: 'Hi', agentId: 'a1' })
      handleChunk('chat1', { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })

      expect(runningAgentKeys.has('chat1:a1')).toBe(false)
    })

    it('send_message_complete clears all runningAgentKeys for the chat', () => {
      const { handleChunk, runningAgentKeys } = createHandler()

      runningAgentKeys.add('chat1:a1')
      runningAgentKeys.add('chat1:a2')
      runningAgentKeys.add('chat2:a1') // different chat

      handleChunk('chat1', { type: 'send_message_complete' })

      expect(runningAgentKeys.has('chat1:a1')).toBe(false)
      expect(runningAgentKeys.has('chat1:a2')).toBe(false)
      expect(runningAgentKeys.has('chat2:a1')).toBe(true)
    })
  })

  // ─── 8. perChatStreamingMsgId keying for group chat ──────────────────────
  describe('perChatStreamingMsgId keying (group chat)', () => {
    it('creates separate streaming entries keyed by chatId:agentId for each agent', () => {
      const { handleChunk, perChatStreamingMsgId } = createHandler()

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', { type: 'agent_start', agentId: 'a2', agentName: 'Bob' })

      expect(perChatStreamingMsgId.has('chat1:a1')).toBe(true)
      expect(perChatStreamingMsgId.has('chat1:a2')).toBe(true)
      expect(perChatStreamingMsgId.get('chat1:a1')).not.toBe(
        perChatStreamingMsgId.get('chat1:a2')
      )

      const chat = mockChatsStore.chats[0]
      expect(chat.messages).toHaveLength(2)
      expect(chat.messages[0].agentId).toBe('a1')
      expect(chat.messages[1].agentId).toBe('a2')
    })

    it('routes text chunks to the correct agent message via routeKey', () => {
      const { handleChunk } = createHandler()

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', { type: 'agent_start', agentId: 'a2', agentName: 'Bob' })

      handleChunk('chat1', { type: 'text', text: 'From Alice', agentId: 'a1' })
      handleChunk('chat1', { type: 'text', text: 'From Bob', agentId: 'a2' })

      const chat = mockChatsStore.chats[0]
      expect(chat.messages[0].content).toBe('From Alice')
      expect(chat.messages[1].content).toBe('From Bob')
    })
  })

  // ─── 9. tool_call and tool_result segments ───────────────────────────────
  describe('tool_call and tool_result chunks', () => {
    it('creates a tool segment on tool_call and fills output on tool_result', () => {
      const { handleChunk } = createHandler()

      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', {
        type: 'tool_call',
        agentId: 'a1',
        name: 'web_search',
        input: { query: 'vitest' },
      })

      const chat = mockChatsStore.chats[0]
      let msg = chat.messages[0]
      let toolSeg = msg.segments.find(s => s.type === 'tool')
      expect(toolSeg).toBeDefined()
      expect(toolSeg.name).toBe('web_search')
      expect(toolSeg.output).toBeUndefined()

      // Tool result fills the output
      handleChunk('chat1', {
        type: 'tool_result',
        agentId: 'a1',
        name: 'web_search',
        result: { data: 'results here' },
      })

      msg = chat.messages[0]
      toolSeg = msg.segments.find(s => s.type === 'tool')
      expect(toolSeg.output).toBe(JSON.stringify({ data: 'results here' }, null, 2))

      // isCallingTool lifecycle
      expect(chat.isCallingTool).toBe(false)
      expect(chat.currentToolCall).toBeNull()
    })

    it('marks tool segment as isError when tool_result carries the isError flag', () => {
      const { handleChunk } = createHandler()
      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', { type: 'tool_call', agentId: 'a1', name: 'analyze_agent_history', input: { action: 'extract_sections' } })
      handleChunk('chat1', {
        type: 'tool_result',
        agentId: 'a1',
        name: 'analyze_agent_history',
        result: { text: 'Error: extract_sections requires a cached analysis. Call action="analyze_all" first.', isError: true },
      })
      const seg = mockChatsStore.chats[0].messages[0].segments.find(s => s.type === 'tool')
      expect(seg.isError).toBe(true)
    })

    it('marks tool segment as isError when tool_result text starts with "Error:" but has no flag', () => {
      const { handleChunk } = createHandler()
      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', { type: 'tool_call', agentId: 'a1', name: 'mcp_legacy', input: {} })
      handleChunk('chat1', {
        type: 'tool_result',
        agentId: 'a1',
        name: 'mcp_legacy',
        result: { text: 'Error: connection timed out' },
      })
      const seg = mockChatsStore.chats[0].messages[0].segments.find(s => s.type === 'tool')
      expect(seg.isError).toBe(true)
    })

    it('does NOT mark tool segment as isError on a successful result', () => {
      const { handleChunk } = createHandler()
      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handleChunk('chat1', { type: 'tool_call', agentId: 'a1', name: 'web_search', input: {} })
      handleChunk('chat1', { type: 'tool_result', agentId: 'a1', name: 'web_search', result: { data: 'ok' } })
      const seg = mockChatsStore.chats[0].messages[0].segments.find(s => s.type === 'tool')
      expect(seg.isError).toBeUndefined()
    })
  })

  // ─── 10. waitForAgentEnd polls until keys are cleared ────────────────────
  describe('waitForAgentEnd', () => {
    it('resolves immediately when no streaming keys exist for the given agents', async () => {
      const { waitForAgentEnd } = createHandler()

      // No keys set — should resolve instantly
      const start = Date.now()
      await waitForAgentEnd('chat1', ['a1', 'a2'])
      expect(Date.now() - start).toBeLessThan(200)
    })

    it('resolves after streaming keys are deleted', async () => {
      const { waitForAgentEnd, perChatStreamingMsgId } = createHandler()

      perChatStreamingMsgId.set('chat1:a1', 'msg1')

      // Simulate agent_end deleting the key after 100ms
      setTimeout(() => {
        perChatStreamingMsgId.delete('chat1:a1')
      }, 100)

      const start = Date.now()
      await waitForAgentEnd('chat1', ['a1'], 5000)
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(50) // waited for deletion
      expect(elapsed).toBeLessThan(2000) // didn't time out
    })
  })

  // ─── 11. agent_start migrates bare chatId key to chatId:agentId ──────────
  describe('agent_start bare key migration (single-agent path)', () => {
    it('migrates existing bare chatId placeholder to chatId:agentId key', () => {
      const { handleChunk, perChatStreamingMsgId, perChatStreamingSegments } = createHandler()

      const chat = mockChatsStore.chats[0]
      // Simulate a pre-existing bare placeholder (created by single-agent code path)
      const bareMsg = {
        id: 'bare-msg-1',
        role: 'assistant',
        content: '',
        streaming: true,
        segments: [],
      }
      chat.messages.push(bareMsg)
      perChatStreamingMsgId.set('chat1', 'bare-msg-1')
      perChatStreamingSegments.set('chat1', [])

      // agent_start should migrate, not create a new message
      handleChunk('chat1', { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })

      // Bare key is gone, agent key exists
      expect(perChatStreamingMsgId.has('chat1')).toBe(false)
      expect(perChatStreamingMsgId.has('chat1:a1')).toBe(true)
      expect(perChatStreamingMsgId.get('chat1:a1')).toBe('bare-msg-1')

      // Message was stamped with agent info, no new message created
      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].agentId).toBe('a1')
      expect(chat.messages[0].agentName).toBe('Alice')
    })
  })

  // ─── 12. history_context chunk ───────────────────────────────────────────
  describe('history_context chunk', () => {
    it('stores history context sources and starts countdown', () => {
      const { handleChunk, historyContextSources, historyContextCountdown } = createHandler()

      handleChunk('chat1', {
        type: 'history_context',
        sources: [
          { chatId: 'old-chat-1', snippet: 'something relevant' },
        ],
      })

      expect(historyContextSources.has('chat1')).toBe(true)
      expect(historyContextSources.get('chat1')).toHaveLength(1)
      expect(historyContextCountdown.value).toBe(15)
    })

    it('ignores history_context with empty sources array', () => {
      const { handleChunk, historyContextSources } = createHandler()

      handleChunk('chat1', {
        type: 'history_context',
        sources: [],
      })

      expect(historyContextSources.has('chat1')).toBe(false)
    })
  })
})
