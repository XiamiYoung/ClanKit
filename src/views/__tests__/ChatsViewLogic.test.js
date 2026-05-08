import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, reactive, computed, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mocks ──────────────────────────────────────────────────────────────────────

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `uuid-${++uuidCounter}`,
}))

const mockChat = reactive({
  id: 'chat-1',
  title: 'Test Chat',
  isRunning: false,
  isThinking: false,
  isCallingTool: false,
  currentToolCall: null,
  messages: [],
  systemAgentId: 'agent1',
  userAgentId: null,
  groupAgentIds: [],
  permissionMode: 'inherit',
  chatAllowList: [],
  chatDangerOverrides: [],
  maxAgentRounds: 10,
  workingPath: null,
  mode: 'chat',
  contextMetrics: { inputTokens: 0 },
  type: 'chat',
})

const mockChatsStore = {
  chats: [mockChat],
  activeChatId: 'chat-1',
  activeChat: mockChat,
  addMessage: vi.fn(async (chatId, msg) => {
    const chat = mockChatsStore.chats.find(c => c.id === chatId)
    if (chat) chat.messages.push({ id: msg.id || `msg-auto-${Date.now()}`, ...msg })
  }),
  deleteMessage: vi.fn((chatId, msgId) => {
    const chat = mockChatsStore.chats.find(c => c.id === chatId)
    if (chat) {
      const idx = chat.messages.findIndex(m => m.id === msgId)
      if (idx >= 0) chat.messages.splice(idx, 1)
    }
  }),
  persist: vi.fn(async () => {}),
  setPlanState: vi.fn(),
  markCompleted: vi.fn(),
  markPermissionPending: vi.fn(),
  clearPermissionPending: vi.fn(),
}

const mockConfigStore = {
  config: { language: 'en', providers: [] },
  language: 'en',
}

const mockAgentsStore = {
  getAgentById: vi.fn((id) => {
    if (id === 'agent1') return { id: 'agent1', name: 'Agent One', prompt: 'Test', providerId: 'anthropic', modelId: 'claude-3' }
    return null
  }),
  isAgentDeleted: vi.fn(() => false),
  defaultSystemAgent: { id: 'agent1', name: 'Agent One', prompt: 'Test', providerId: 'anthropic', modelId: 'claude-3' },
  defaultUserAgent: { id: 'user1', name: 'User' },
}

const mockModelsStore = {
  getAllContextWindows: vi.fn(() => ({})),
}

const mockElectronAPI = {
  sendMessage: vi.fn().mockResolvedValue({}),
  stopAgent: vi.fn().mockResolvedValue({}),
  runAgent: vi.fn().mockResolvedValue({ success: true }),
}
vi.stubGlobal('window', { electronAPI: mockElectronAPI })

vi.mock('../../stores/chats', () => ({ useChatsStore: () => mockChatsStore }))
vi.mock('../../stores/config', () => ({ useConfigStore: () => mockConfigStore }))
vi.mock('../../stores/agents', () => ({ useAgentsStore: () => mockAgentsStore }))
vi.mock('../../stores/voice', () => ({ useVoiceStore: () => ({ isCallActive: false }) }))
vi.mock('../../stores/models', () => ({ useModelsStore: () => mockModelsStore }))
vi.mock('../../i18n/useI18n', () => ({ useI18n: () => ({ t: (k) => k, locale: ref('en') }) }))
vi.mock('../../utils/mentions', () => ({
  parseMentions: vi.fn(() => ({ mentions: [], mentionAll: false })),
}))
vi.mock('../../utils/parseToolLog', () => ({
  parseToolLogBlock: vi.fn(() => null),
  deduplicateToolSegments: vi.fn(() => []),
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { useChunkHandler } from '../../composables/useChunkHandler'
import { useSendMessage } from '../../composables/useSendMessage'

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetChat() {
  mockChat.id = 'chat-1'
  mockChat.isRunning = false
  mockChat.isThinking = false
  mockChat.isCallingTool = false
  mockChat.currentToolCall = null
  mockChat.messages = []
  mockChat.systemAgentId = 'agent1'
  mockChat.userAgentId = null
  mockChat.groupAgentIds = []
  mockChatsStore.chats = [mockChat]
  mockChatsStore.activeChatId = 'chat-1'
}

/**
 * Create both composables wired together (as ChatsView does in onMounted).
 */
function createWired(overrides = {}) {
  const inputText = ref(overrides.inputText ?? '')
  const attachments = ref([])

  const chunkHandler = useChunkHandler({
    scrollToBottom: vi.fn(),
    dbg: vi.fn(),
    _fireGroupAgentsDirect: vi.fn(),
    stickyTarget: ref(null),
    stopStreamingTimer: vi.fn(),
  })

  const sender = useSendMessage({
    inputText,
    attachments,
    quotedMessage: ref(null),
    mentionInputRef: ref({ resetHeight: vi.fn(), focus: vi.fn() }),
    userScrolled: ref(false),
    scrollToBottom: vi.fn(),
    dbg: vi.fn(),
    getQuotedSenderName: vi.fn(() => 'User'),
    // Wire shared refs from chunkHandler
    perChatStreamingMsgId: chunkHandler.perChatStreamingMsgId,
    perChatStreamingSegments: chunkHandler.perChatStreamingSegments,
    collaborationCancelled: chunkHandler.collaborationCancelled,
    isInCollaborationLoop: chunkHandler.isInCollaborationLoop,
    runningAgentKeys: chunkHandler.runningAgentKeys,
    streamingSeconds: chunkHandler.streamingSeconds,
    historyContextSources: chunkHandler.historyContextSources,
    _clearHistoryCountdown: chunkHandler._clearHistoryCountdown,
    applyProviderCredsToConfig: vi.fn(),
    _fireGroupAgentsDirect: vi.fn().mockResolvedValue(undefined),
    activeRunning: computed(() => mockChat.isRunning),
    activeSystemAgentIds: computed(() => overrides.groupIds ?? ['agent1']),
    enabledSkillObjects: computed(() => []),
    stickyTarget: ref(null),
    programmaticScroll: { increment: vi.fn(), decrement: vi.fn() },
  })

  return { inputText, attachments, chunkHandler, sender }
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  uuidCounter = 0
  vi.clearAllMocks()
  resetChat()
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ChatsView page-level logic (composable integration)', () => {

  // ─── 1. Full send → stream → complete flow ──────────────────────────────
  describe('full send → stream → complete flow', () => {
    it('produces 1 user + 1 assistant message with correct final state', async () => {
      const { inputText, chunkHandler, sender } = createWired({ inputText: 'Hello' })

      await sender.sendMessage()
      await nextTick()

      // sendMessage should have: added user msg, added streaming placeholder, called IPC
      expect(mockElectronAPI.sendMessage).toHaveBeenCalledTimes(1)
      // inputText cleared
      expect(inputText.value).toBe('')

      // Simulate agent response via chunks
      chunkHandler.handleChunk('chat-1', { type: 'agent_start', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'text', text: 'Hi there!', agentId: 'agent1' })
      chunkHandler.handleChunk('chat-1', { type: 'agent_end', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'send_message_complete' })

      await nextTick()

      // Filter out waiting indicators
      const realMessages = mockChat.messages.filter(m => !m.isWaitingIndicator)
      const userMsgs = realMessages.filter(m => m.role === 'user')
      const assistantMsgs = realMessages.filter(m => m.role === 'assistant')

      expect(userMsgs).toHaveLength(1)
      expect(userMsgs[0].content).toBe('Hello')
      expect(assistantMsgs).toHaveLength(1)
      expect(assistantMsgs[0].content).toBe('Hi there!')
      expect(assistantMsgs[0].streaming).toBe(false)
      expect(mockChat.isRunning).toBe(false)
    })
  })

  // ─── 2. Send → escape while streaming text ──────────────────────────────
  describe('send → escape while streaming text', () => {
    it('keeps user message and marks assistant with interrupt', async () => {
      const { inputText, chunkHandler, sender } = createWired({ inputText: 'Tell me a story' })

      await sender.sendMessage()
      await nextTick()

      // Simulate partial agent output
      chunkHandler.handleChunk('chat-1', { type: 'agent_start', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'text', text: 'Once upon a time', agentId: 'agent1' })

      // User presses Escape
      await sender.interrupt('chat-1')
      await nextTick()

      // User message should be kept (not reverted) because agent had activity
      const userMsgs = mockChat.messages.filter(m => m.role === 'user')
      expect(userMsgs).toHaveLength(1)
      expect(userMsgs[0].content).toBe('Tell me a story')

      // inputText should NOT have the message restored (agent had output)
      expect(inputText.value).toBe('')
    })
  })

  // ─── 3. Send → escape while agent has only tool activity ─────────────────
  describe('send → escape while agent has tool activity but no text', () => {
    it('keeps user message when agent has tool segments but no text', async () => {
      const { inputText, chunkHandler, sender } = createWired({ inputText: 'Search for info' })

      await sender.sendMessage()
      await nextTick()

      // Simulate tool activity without text
      chunkHandler.handleChunk('chat-1', { type: 'agent_start', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'tool_call', agentId: 'agent1', name: 'web_search', input: { q: 'test' } })
      chunkHandler.handleChunk('chat-1', { type: 'tool_result', agentId: 'agent1', name: 'web_search', result: 'results' })

      // User presses Escape
      await sender.interrupt('chat-1')
      await nextTick()

      // User message should be kept because agent had tool activity
      const userMsgs = mockChat.messages.filter(m => m.role === 'user')
      expect(userMsgs).toHaveLength(1)
      expect(userMsgs[0].content).toBe('Search for info')

      // inputText should NOT be restored
      expect(inputText.value).toBe('')
    })
  })

  // ─── 4. Send → escape before any agent output ───────────────────────────
  describe('send → escape before any agent output', () => {
    it('reverts user message to inputText and removes both bubbles', async () => {
      const { inputText, chunkHandler, sender } = createWired({ inputText: 'Quick question' })

      await sender.sendMessage()
      await nextTick()

      // User presses Escape before any agent output
      await sender.interrupt('chat-1')
      await nextTick()

      // User message should be reverted to inputText
      expect(inputText.value).toBe('Quick question')

      // The user message bubble should be removed
      const userMsgs = mockChat.messages.filter(m => m.role === 'user')
      expect(userMsgs).toHaveLength(0)
    })
  })

  // ─── 5. Collaboration flags lifecycle ────────────────────────────────────
  describe('collaboration flags lifecycle', () => {
    it('tracks flag transitions through the send/stream/complete cycle', async () => {
      const { chunkHandler, sender } = createWired({ inputText: 'Hello' })

      // Before send
      expect(chunkHandler.collaborationCancelled.value).toBe(false)

      await sender.sendMessage()
      await nextTick()

      // During stream
      expect(mockChat.isRunning).toBe(true)

      // Simulate complete response
      chunkHandler.handleChunk('chat-1', { type: 'agent_start', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'text', text: 'Reply', agentId: 'agent1' })
      chunkHandler.handleChunk('chat-1', { type: 'agent_end', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'send_message_complete' })

      // After complete
      expect(mockChat.isRunning).toBe(false)
      expect(chunkHandler.isInCollaborationLoop.value).toBe(false)
      expect(typeof chunkHandler.collaborationCancelled.value).toBe('boolean')
    })

    it('sets collaborationCancelled when interrupt is called', async () => {
      const { chunkHandler, sender } = createWired({ inputText: 'Hello' })

      await sender.sendMessage()
      await nextTick()

      expect(chunkHandler.collaborationCancelled.value).toBe(false)

      await sender.interrupt('chat-1')

      expect(chunkHandler.collaborationCancelled.value).toBe(true)
    })
  })

  // ─── 6. Draft save on chat switch ────────────────────────────────────────
  describe('draft save on chat switch', () => {
    it('saves and restores draft text when switching chats', () => {
      const { inputText, sender } = createWired()

      // Type something in chat-1
      inputText.value = 'draft message for chat-1'
      sender._saveDraftForChat('chat-1')

      // Switch away: clear input
      inputText.value = ''

      // Switch back: restore draft
      sender._restoreDraftForChat('chat-1')
      expect(inputText.value).toBe('draft message for chat-1')
    })

    it('clears draft when input is empty', () => {
      const { inputText, sender } = createWired()

      // Save a draft
      inputText.value = 'something'
      sender._saveDraftForChat('chat-1')

      // Clear and save again
      inputText.value = ''
      sender._saveDraftForChat('chat-1')

      // Restore should give empty
      sender._restoreDraftForChat('chat-1')
      expect(inputText.value).toBe('')
    })
  })

  // ─── 7. Streaming seconds timer lifecycle ────────────────────────────────
  describe('streaming seconds timer', () => {
    it('resets streamingSeconds on send_message_complete', async () => {
      const { chunkHandler, sender } = createWired({ inputText: 'Hi' })

      await sender.sendMessage()
      await nextTick()

      // Manually bump streamingSeconds to simulate timer ticks
      chunkHandler.streamingSeconds.value = 5

      chunkHandler.handleChunk('chat-1', { type: 'agent_start', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'text', text: 'Done', agentId: 'agent1' })
      chunkHandler.handleChunk('chat-1', { type: 'agent_end', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'send_message_complete' })

      expect(chunkHandler.streamingSeconds.value).toBe(0)
    })
  })

  // ─── 8. Tool call + result segments survive through full cycle ───────────
  describe('tool segments survive through full cycle', () => {
    it('preserves tool segments in the final message after agent_end', async () => {
      const { chunkHandler, sender } = createWired({ inputText: 'Use a tool' })

      await sender.sendMessage()
      await nextTick()

      chunkHandler.handleChunk('chat-1', { type: 'agent_start', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'tool_call', agentId: 'agent1', name: 'shell', input: { cmd: 'ls' } })
      chunkHandler.handleChunk('chat-1', { type: 'tool_result', agentId: 'agent1', name: 'shell', result: 'file1.txt' })
      chunkHandler.handleChunk('chat-1', { type: 'text', text: 'Here are the files.', agentId: 'agent1' })
      chunkHandler.handleChunk('chat-1', { type: 'agent_end', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'send_message_complete' })

      const assistantMsg = mockChat.messages.find(m => m.role === 'assistant' && !m.isWaitingIndicator)
      expect(assistantMsg).toBeDefined()
      expect(assistantMsg.streaming).toBe(false)
      expect(assistantMsg.content).toBe('Here are the files.')

      const toolSegs = assistantMsg.segments.filter(s => s.type === 'tool')
      expect(toolSegs).toHaveLength(1)
      expect(toolSegs[0].name).toBe('shell')
      expect(toolSegs[0].output).toBe('file1.txt')
    })
  })

  // ─── 9. send_message_error creates error message ─────────────────────────
  describe('send_message_error flow', () => {
    it('marks streaming message as error and clears running state', async () => {
      const { chunkHandler, sender } = createWired({ inputText: 'Trigger error' })

      await sender.sendMessage()
      await nextTick()

      // Agent starts but then errors
      chunkHandler.handleChunk('chat-1', { type: 'agent_start', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'send_message_error', error: 'Rate limit exceeded' })

      const assistantMsgs = mockChat.messages.filter(m => m.role === 'assistant' && !m.isWaitingIndicator)
      expect(assistantMsgs.length).toBeGreaterThanOrEqual(1)

      const errorMsg = assistantMsgs.find(m => m.isError)
      expect(errorMsg).toBeDefined()
      expect(errorMsg.streaming).toBe(false)
      expect(mockChat.isRunning).toBe(false)
    })
  })

  // ─── 10. Multiple text chunks accumulate correctly ───────────────────────
  describe('multiple text chunks accumulate', () => {
    it('concatenates text chunks into a single message content', async () => {
      const { chunkHandler, sender } = createWired({ inputText: 'Stream test' })

      await sender.sendMessage()
      await nextTick()

      chunkHandler.handleChunk('chat-1', { type: 'agent_start', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'text', text: 'Part 1 ', agentId: 'agent1' })
      chunkHandler.handleChunk('chat-1', { type: 'text', text: 'Part 2 ', agentId: 'agent1' })
      chunkHandler.handleChunk('chat-1', { type: 'text', text: 'Part 3', agentId: 'agent1' })
      chunkHandler.handleChunk('chat-1', { type: 'agent_end', agentId: 'agent1', agentName: 'Agent One' })
      chunkHandler.handleChunk('chat-1', { type: 'send_message_complete' })

      const assistantMsg = mockChat.messages.find(m => m.role === 'assistant' && !m.isWaitingIndicator)
      expect(assistantMsg.content).toBe('Part 1 Part 2 Part 3')
    })
  })
})
