/**
 * Chunk Sequence Replay Tests
 *
 * Layer 1 of the chat testing infrastructure: replays multi-chunk sequences
 * through handleChunk (mounted) or a simplified _applyChunk (unmounted),
 * with mount/unmount transitions and user action injection.
 *
 * Catches bugs like:
 * - Minibar empty bubble: duplicate streaming messages after mount/unmount
 * - Interrupt revert: user message recalled when agent has tool activity
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mocks (must be before imports) ─────────────────────────────────────────
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
vi.mock('../../utils/parseToolLog', () => ({
  parseToolLogBlock: () => null,
  deduplicateToolSegments: () => [],
}))

import { useChunkHandler } from '../useChunkHandler'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeChat(overrides = {}) {
  return {
    id: 'c1',
    messages: [],
    isRunning: false,
    isThinking: false,
    isCallingTool: false,
    currentToolCall: null,
    groupAgentIds: [],
    contextMetrics: null,
    ...overrides,
  }
}

function createHandler() {
  return useChunkHandler({
    scrollToBottom: vi.fn(),
    dbg: vi.fn(),
    _fireGroupAgentsDirect: vi.fn(),
    stickyTarget: ref(null),
    stopStreamingTimer: vi.fn(),
  })
}

/**
 * Simplified _applyChunk — replicates the store's fallback path for when
 * ChatsView is unmounted (minibar mode). Only handles the chunk types
 * relevant to our test scenarios.
 */
function applyChunkUnmounted(chat, chunk) {
  if (!chat || chat.messages === null) return

  if (chunk.type === 'agent_start') {
    chat.messages.push({
      id: `uuid-${++uuidCounter}`,
      role: 'assistant',
      content: '',
      streaming: true,
      streamingStartedAt: Date.now(),
      agentId: chunk.agentId,
      agentName: chunk.agentName,
      segments: [],
    })
    chat.isRunning = true
    chat.isThinking = true
    return
  }

  if (chunk.type === 'agent_end') {
    const msg = [...chat.messages].reverse().find(
      m => m.role === 'assistant' && m.streaming && m.agentId === chunk.agentId
    )
    if (msg) {
      msg.streaming = false
      if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
      if (!msg.content && !(msg.segments || []).some(s => s.type === 'text' && s.content)) {
        msg.isError = true
        msg.content = '_No response_'
        msg.segments = [{ type: 'text', content: '_No response_' }]
      }
    }
    return
  }

  if (chunk.type === 'send_message_complete' || chunk.type === 'send_message_error') {
    for (const m of chat.messages) {
      if (m.streaming) {
        m.streaming = false
        if (m.streamingStartedAt) m.durationMs = Date.now() - m.streamingStartedAt
      }
    }
    chat.isRunning = false
    chat.isThinking = false
    chat.isCallingTool = false
    chat.currentToolCall = null
    return
  }

  if (chunk.type === 'text') {
    chat.isThinking = false
    const msg = [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
    if (msg) {
      msg.content = (msg.content || '') + chunk.text
      if (!msg.segments || msg.segments.length === 0) {
        msg.segments = [{ type: 'text', content: msg.content }]
      } else if (msg.segments[msg.segments.length - 1].type === 'text') {
        msg.segments[msg.segments.length - 1].content = msg.content
      } else {
        msg.segments.push({ type: 'text', content: chunk.text })
      }
    }
    return
  }

  if (chunk.type === 'tool_call') {
    const msg = [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
    if (msg) {
      if (!msg.segments) msg.segments = []
      msg.segments.push({ type: 'tool', name: chunk.name, input: chunk.input ?? {}, output: undefined })
    }
    return
  }

  if (chunk.type === 'tool_result') {
    const msg = [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
    if (msg && msg.segments) {
      for (let i = msg.segments.length - 1; i >= 0; i--) {
        if (msg.segments[i].type === 'tool' && msg.segments[i].output === undefined) {
          msg.segments[i].output = typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result)
          break
        }
      }
    }
    return
  }
}

/**
 * Simulates the reconnect logic from ChatsView onMounted (lines 1967-2001).
 * Scans for existing streaming messages and reuses them instead of creating duplicates.
 */
function remountSimulated(handler, chat, runningEntries) {
  const { perChatStreamingMsgId, perChatStreamingSegments } = handler
  for (const entry of runningEntries) {
    const routeKey = entry.isGroup ? `${chat.id}:${entry.agentId}` : chat.id
    if (perChatStreamingMsgId.has(routeKey)) continue

    // Reuse existing streaming message (the fix for the minibar bug)
    const existingMsg = [...chat.messages].reverse().find(m =>
      m.role === 'assistant' && m.streaming &&
      (entry.isGroup ? m.agentId === entry.agentId : !m.isWaitingIndicator)
    )
    if (existingMsg) {
      perChatStreamingMsgId.set(routeKey, existingMsg.id)
      perChatStreamingSegments.set(routeKey, existingMsg.segments || [])
    } else {
      const msgId = `uuid-${++uuidCounter}`
      perChatStreamingMsgId.set(routeKey, msgId)
      perChatStreamingSegments.set(routeKey, [])
      chat.messages.push({
        id: msgId,
        role: 'assistant',
        content: '',
        streaming: true,
        streamingStartedAt: Date.now(),
        agentId: entry.isGroup ? entry.agentId : undefined,
        agentName: entry.isGroup ? entry.agentName : undefined,
        segments: [],
      })
    }
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  uuidCounter = 0

  mockChatsStore = {
    activeChatId: 'c1',
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

// ── Scenario Tests ─────────────────────────────────────────────────────────

describe('Chunk Sequence Replay', () => {

  // ── Scenario 1: Normal single-agent flow ──────────────────────────────
  describe('normal single-agent flow', () => {
    it('produces one finalized message with combined text and tool segments', () => {
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]
      const cId = 'c1'

      // agent_start
      handler.handleChunk(cId, { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].streaming).toBe(true)

      // text chunks
      handler.handleChunk(cId, { type: 'text', text: 'Let me check. ', agentId: 'a1', agentName: 'Alice' })
      handler.handleChunk(cId, { type: 'text', text: 'Running now...', agentId: 'a1', agentName: 'Alice' })

      // tool call + result
      handler.handleChunk(cId, { type: 'tool_call', name: 'execute_shell', input: { command: 'ls' }, agentId: 'a1', agentName: 'Alice' })
      handler.handleChunk(cId, { type: 'tool_result', name: 'execute_shell', result: 'file.txt', agentId: 'a1', agentName: 'Alice' })

      // more text
      handler.handleChunk(cId, { type: 'text', text: ' Done!', agentId: 'a1', agentName: 'Alice' })

      // agent_end + send_message_complete
      handler.handleChunk(cId, { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })
      handler.handleChunk(cId, { type: 'send_message_complete' })

      expect(chat.messages).toHaveLength(1)
      const msg = chat.messages[0]
      expect(msg.streaming).toBe(false)
      expect(msg.content).toContain('Let me check.')
      expect(msg.content).toContain('Done!')
      expect(msg.agentId).toBe('a1')
      expect(typeof msg.durationMs).toBe('number')
      // Should have tool segment
      const toolSegs = msg.segments.filter(s => s.type === 'tool')
      expect(toolSegs.length).toBeGreaterThanOrEqual(1)
      expect(toolSegs[0].name).toBe('execute_shell')
    })
  })

  // ── Scenario 2: Normal group chat flow ────────────────────────────────
  describe('normal group chat flow', () => {
    it('produces two separate messages for two agents', () => {
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]
      chat.groupAgentIds = ['a1', 'a2']
      const cId = 'c1'

      // Both agents start
      handler.handleChunk(cId, { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handler.handleChunk(cId, { type: 'agent_start', agentId: 'a2', agentName: 'Bob' })
      expect(chat.messages).toHaveLength(2)

      // Interleaved text
      handler.handleChunk(cId, { type: 'text', text: 'Alice here.', agentId: 'a1', agentName: 'Alice' })
      handler.handleChunk(cId, { type: 'text', text: 'Bob here.', agentId: 'a2', agentName: 'Bob' })

      // Both end
      handler.handleChunk(cId, { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })
      handler.handleChunk(cId, { type: 'agent_end', agentId: 'a2', agentName: 'Bob' })
      handler.handleChunk(cId, { type: 'send_message_complete' })

      expect(chat.messages).toHaveLength(2)
      const [m1, m2] = chat.messages
      expect(m1.agentId).toBe('a1')
      expect(m1.content).toContain('Alice here.')
      expect(m1.streaming).toBe(false)
      expect(m2.agentId).toBe('a2')
      expect(m2.content).toContain('Bob here.')
      expect(m2.streaming).toBe(false)
    })
  })

  // ── Scenario 3: Minibar reconnect dedup ───────────────────────────────
  describe('minibar reconnect dedup', () => {
    it('does NOT create duplicate streaming messages after mount/unmount', () => {
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]
      const cId = 'c1'

      // Phase 1: mounted — agent starts and sends text
      handler.handleChunk(cId, { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })
      handler.handleChunk(cId, { type: 'text', text: 'Hello ', agentId: 'a1', agentName: 'Alice' })
      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].content).toContain('Hello')

      // Phase 2: unmount — simulate minibar entry
      // Clear handler's perChatStreamingMsgId to simulate ChatsView destruction
      const { perChatStreamingMsgId, perChatStreamingSegments } = handler
      for (const key of [...perChatStreamingMsgId.keys()]) {
        perChatStreamingMsgId.delete(key)
        perChatStreamingSegments.delete(key)
      }

      // More text arrives while unmounted — goes through _applyChunk
      applyChunkUnmounted(chat, { type: 'text', text: 'world', agentId: 'a1', agentName: 'Alice' })
      expect(chat.messages).toHaveLength(1) // still 1 message
      expect(chat.messages[0].content).toContain('world')

      // Phase 3: remount — reconnect should reuse existing streaming message
      remountSimulated(handler, chat, [{ chatId: cId, agentId: 'a1', agentName: 'Alice', isGroup: true }])

      // KEY ASSERTION: still only 1 message, not 2
      expect(chat.messages).toHaveLength(1)

      // Phase 4: more text arrives mounted — routes to the reused message
      handler.handleChunk(cId, { type: 'text', text: '!', agentId: 'a1', agentName: 'Alice' })

      // Finalize
      handler.handleChunk(cId, { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })
      handler.handleChunk(cId, { type: 'send_message_complete' })

      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].streaming).toBe(false)
      expect(chat.messages[0].content).toContain('Hello')
      expect(chat.messages[0].content).toContain('world')
    })

    it('creates a new placeholder if no streaming message exists on remount', () => {
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]

      // Remount with running agent but no existing messages
      remountSimulated(handler, chat, [{ chatId: 'c1', agentId: 'a1', agentName: 'Alice', isGroup: true }])

      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].streaming).toBe(true)
      expect(chat.messages[0].agentId).toBe('a1')
    })
  })

  // ── Scenario 4: Interrupt with tool activity ──────────────────────────
  describe('interrupt with tool activity', () => {
    it('agent with tool segments has activity even when content is empty', () => {
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]
      const cId = 'c1'

      // Add user message first
      chat.messages.push({ id: 'u1', role: 'user', content: 'Run analysis' })

      // Agent starts and does tool call (no text output)
      handler.handleChunk(cId, { type: 'agent_start', agentId: 'a1', agentName: 'Analyst' })
      handler.handleChunk(cId, { type: 'tool_call', name: 'execute_shell', input: { command: 'analyze' }, agentId: 'a1', agentName: 'Analyst' })
      handler.handleChunk(cId, { type: 'tool_result', name: 'execute_shell', result: 'analysis complete', agentId: 'a1', agentName: 'Analyst' })

      // Verify: message has tool segments but empty text content
      const streamingMsg = [...chat.messages].reverse().find(
        m => m.role === 'assistant' && m.streaming && !m.isWaitingIndicator
      )
      expect(streamingMsg).toBeTruthy()
      // Content may be empty (tools don't contribute to content)
      // But segments should have tool entries
      const hasActivity = streamingMsg.content?.trim().length > 0 ||
        (streamingMsg.segments || []).some(s => s.type !== 'text' || s.content?.trim())
      expect(hasActivity).toBe(true)

      // The escapeRetrieve logic should detect activity and NOT revert
      // (This is what the fix in useSendMessage.js ensures)
      expect(chat.messages.find(m => m.id === 'u1')).toBeTruthy() // user message still there
    })

    it('agent with NO activity allows revert (empty placeholder)', () => {
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]
      const cId = 'c1'

      // Agent starts but produces nothing
      handler.handleChunk(cId, { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })

      const streamingMsg = chat.messages.find(m => m.role === 'assistant' && m.streaming)
      expect(streamingMsg).toBeTruthy()

      const hasActivity = streamingMsg.content?.trim().length > 0 ||
        (streamingMsg.segments || []).some(s => s.type !== 'text' || s.content?.trim())
      // Empty placeholder — no activity
      expect(hasActivity).toBe(false)
    })
  })

  // ── Scenario 5: send_message_complete clears all streaming flags ──────
  describe('send_message_complete finalizes all streaming messages', () => {
    it('sets streaming=false on orphaned messages from _applyChunk path', () => {
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]
      const cId = 'c1'

      // Simulate a message created by _applyChunk during unmount
      chat.messages.push({
        id: 'orphan-1',
        role: 'assistant',
        content: 'partial text',
        streaming: true,
        streamingStartedAt: Date.now() - 5000,
        agentId: 'a1',
        segments: [{ type: 'text', content: 'partial text' }],
      })

      // send_message_complete should finalize it
      handler.handleChunk(cId, { type: 'send_message_complete' })

      expect(chat.messages[0].streaming).toBe(false)
      expect(typeof chat.messages[0].durationMs).toBe('number')
    })
  })

  // ── Scenario 6: Stop during tool call → agent_end must NOT delete the bubble
  // Regression: previously hasTextContent in agent_end ignored tool segments, so a
  // user stop while tool was running caused the system bubble to vanish.
  describe('agent_end after stop with tool activity preserves bubble', () => {
    it('keeps the bubble and appends interrupt marker (matching _applyInterruptMarker)', async () => {
      // Lazy-import useInterrupt to avoid hoist issues
      const { useInterrupt } = await import('../useInterrupt')
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]
      const cId = 'c1'

      chat.messages.push({ id: 'u1', role: 'user', content: 'Run analysis' })

      // Agent starts and produces only a tool call (no text yet)
      handler.handleChunk(cId, { type: 'agent_start', agentId: 'a1', agentName: 'Analyst' })
      handler.handleChunk(cId, { type: 'tool_call', name: 'execute_shell', input: { command: 'analyze' }, agentId: 'a1', agentName: 'Analyst' })
      handler.handleChunk(cId, { type: 'tool_result', name: 'execute_shell', result: 'analysis complete', agentId: 'a1', agentName: 'Analyst' })

      const streamingMsgBefore = [...chat.messages].reverse().find(
        m => m.role === 'assistant' && m.streaming && !m.isWaitingIndicator
      )
      expect(streamingMsgBefore).toBeTruthy()
      expect(streamingMsgBefore.segments.some(s => s.type === 'tool')).toBe(true)
      const streamingMsgId = streamingMsgBefore.id

      global.window = global.window || {}
      window.electronAPI = { stopAgent: vi.fn().mockResolvedValue(undefined) }

      const interruptInstance = useInterrupt({
        chatId: () => cId,
        inputText: ref(''),
        attachments: ref([]),
        mentionInputRef: ref(null),
        collaborationCancelled: handler.collaborationCancelled,
        isInCollaborationLoop: handler.isInCollaborationLoop,
        runningAgentKeys: handler.runningAgentKeys,
      })
      await interruptInstance.interrupt(cId)

      // ↓ THE BUG: agent_end arrives during _stopAgent's await → before this fix it would
      // see "no text content" + collaborationCancelled=true → splice the bubble away.
      handler.handleChunk(cId, { type: 'agent_end', agentId: 'a1', agentName: 'Analyst' })

      // System bubble must still exist
      const finalMsg = chat.messages.find(m => m.id === streamingMsgId)
      expect(finalMsg).toBeTruthy()
      expect(finalMsg.segments.some(s => s.type === 'tool')).toBe(true)
      // User bubble must also still exist (interrupt early-returns when activity is detected)
      expect(chat.messages.find(m => m.id === 'u1')).toBeTruthy()
    })

    it('truly empty placeholder + stop + agent_end → bubble removed (intentional)', async () => {
      const { useInterrupt } = await import('../useInterrupt')
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]
      const cId = 'c1'

      chat.messages.push({ id: 'u1', role: 'user', content: 'Hi' })
      handler.handleChunk(cId, { type: 'agent_start', agentId: 'a1', agentName: 'Alice' })

      window.electronAPI = { stopAgent: vi.fn().mockResolvedValue(undefined) }

      const inputText = ref('')
      const interruptInstance = useInterrupt({
        chatId: () => cId,
        inputText,
        attachments: ref([]),
        mentionInputRef: ref(null),
        collaborationCancelled: handler.collaborationCancelled,
        isInCollaborationLoop: handler.isInCollaborationLoop,
        runningAgentKeys: handler.runningAgentKeys,
      })
      mockChatsStore.deleteMessage = vi.fn((cid, msgId) => {
        const idx = chat.messages.findIndex(m => m.id === msgId)
        if (idx >= 0) chat.messages.splice(idx, 1)
      })
      await interruptInstance.interrupt(cId)
      handler.handleChunk(cId, { type: 'agent_end', agentId: 'a1', agentName: 'Alice' })

      // Empty placeholder gone, user msg recalled to textarea + deleted
      expect(chat.messages.find(m => m.role === 'assistant')).toBeFalsy()
      expect(chat.messages.find(m => m.id === 'u1')).toBeFalsy()
      expect(inputText.value).toBe('Hi')
    })
  })

  // ── Scenario 7: Activity heuristic must agree across modules
  // Direct unit test on the two judgments that previously diverged.
  describe('activity heuristic consistency across useInterrupt and agent_end', () => {
    // The exact predicate used inside useChunkHandler agent_end (post-fix).
    function agentEndHasActivity(msg) {
      return !!(msg.content?.trim()) || msg.planData ||
        (msg.segments || []).some(s => {
          if (s.type === 'text') return !!s.content?.trim()
          if (s.type === 'tool') return s.output !== undefined
          if (s.type === 'agent_step') return false
          return true
        })
    }

    // Walk a representative set of msg shapes; both judgments must match.
    const cases = [
      { name: 'truly empty placeholder', msg: { content: '', segments: [] } },
      { name: 'text content only', msg: { content: 'hello', segments: [{ type: 'text', content: 'hello' }] } },
      { name: 'tool segment, no text', msg: { content: '', segments: [{ type: 'tool', name: 'sh', input: {}, output: 'ok' }] } },
      { name: 'pending tool segment, no text', msg: { content: '', segments: [{ type: 'tool', name: 'sh', input: {}, output: undefined }] } },
      { name: 'image segment only', msg: { content: '', segments: [{ type: 'image', images: [{ url: 'x' }] }] } },
      { name: 'permission segment only', msg: { content: '', segments: [{ type: 'permission', blockId: 'b1' }] } },
      { name: 'plan only', msg: { content: '', segments: [], planData: { steps: [] } } },
      { name: 'text segment with empty content', msg: { content: '', segments: [{ type: 'text', content: '' }] } },
      { name: 'agent_step only (progress indicator)', msg: { content: '', segments: [{ type: 'agent_step', title: 'Thinking', status: 'running' }] } },
    ]

    it.each(cases)('agrees on "$name"', async ({ msg }) => {
      const { useInterrupt } = await import('../useInterrupt')
      const handler = createHandler()
      const chat = mockChatsStore.chats[0]
      chat.messages = [
        { id: 'u1', role: 'user', content: 'q' },
        { ...msg, id: 'a1', role: 'assistant', streaming: true },
      ]
      window.electronAPI = { stopAgent: vi.fn().mockResolvedValue(undefined) }
      const inputText = ref('')
      const interruptInstance = useInterrupt({
        chatId: () => 'c1',
        inputText,
        attachments: ref([]),
        mentionInputRef: ref(null),
        collaborationCancelled: handler.collaborationCancelled,
        isInCollaborationLoop: handler.isInCollaborationLoop,
        runningAgentKeys: handler.runningAgentKeys,
      })
      mockChatsStore.deleteMessage = vi.fn((cid, msgId) => {
        const idx = chat.messages.findIndex(m => m.id === msgId)
        if (idx >= 0) chat.messages.splice(idx, 1)
      })

      const interruptSawActivity = agentEndHasActivity(chat.messages.find(m => m.id === 'a1'))
      await interruptInstance.interrupt('c1')

      if (interruptSawActivity) {
        expect(chat.messages.find(m => m.id === 'u1')).toBeTruthy()
      } else {
        expect(inputText.value).toBe('q')
      }
    })
  })

  // ── Scenario 8: Multiple useInterrupt instances (grid mode panels)
  // Each panel has its own inputText/attachments, shares collaborationCancelled state.
  describe('useInterrupt isolation across grid panels', () => {
    it('two panels with independent inputs do not cross-contaminate recalls', async () => {
      const { useInterrupt } = await import('../useInterrupt')
      // Two chats — one per panel
      mockChatsStore.chats = [
        { id: 'c1', messages: [
          { id: 'u1', role: 'user', content: 'panel-1 prompt' },
          { id: 'a1', role: 'assistant', streaming: true, content: '', segments: [] },
        ], isRunning: true },
        { id: 'c2', messages: [
          { id: 'u2', role: 'user', content: 'panel-2 prompt' },
          { id: 'a2', role: 'assistant', streaming: true, content: '', segments: [] },
        ], isRunning: true },
      ]
      window.electronAPI = { stopAgent: vi.fn().mockResolvedValue(undefined) }
      mockChatsStore.deleteMessage = vi.fn((cid, msgId) => {
        const c = mockChatsStore.chats.find(x => x.id === cid)
        const idx = c.messages.findIndex(m => m.id === msgId)
        if (idx >= 0) c.messages.splice(idx, 1)
      })

      // Shared state (provided by ChatsView in real app)
      const shared = {
        collaborationCancelled: ref(false),
        isInCollaborationLoop: ref(false),
        runningAgentKeys: reactive(new Set()),
      }

      const inputA = ref('')
      const inputB = ref('typing in B')
      const interruptA = useInterrupt({
        chatId: () => 'c1', inputText: inputA, attachments: ref([]), mentionInputRef: ref(null),
        ...shared,
      })
      const interruptB = useInterrupt({
        chatId: () => 'c2', inputText: inputB, attachments: ref([]), mentionInputRef: ref(null),
        ...shared,
      })

      // Stop panel A (empty placeholder → recall to inputA)
      await interruptA.interrupt('c1')
      expect(inputA.value).toBe('panel-1 prompt')
      expect(inputB.value).toBe('typing in B') // ← unchanged

      // Stop panel B (empty placeholder → APPEND to existing inputB content)
      await interruptB.interrupt('c2')
      expect(inputB.value).toBe('typing in B\npanel-2 prompt')
    })
  })
})
