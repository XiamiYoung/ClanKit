import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, reactive, computed, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mock stores ────────────────────────────────────────────────────────────────

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
  maxOutputTokens: null,
  maxAgentRounds: 10,
  workingPath: null,
  codingMode: false,
  contextMetrics: { inputTokens: 0 },
})

const mockChatsStore = {
  chats: [mockChat],
  activeChatId: 'chat-1',
  activeChat: mockChat,
  addMessage: vi.fn(async (chatId, msg) => {
    const chat = mockChatsStore.chats.find(c => c.id === chatId)
    if (chat) chat.messages.push({ id: msg.id || `msg-${Date.now()}`, ...msg })
  }),
  persist: vi.fn(async () => {}),
  setPlanState: vi.fn(),
  getPlanRunParams: vi.fn(() => null),
  markCompleted: vi.fn(),
}

const mockConfigStore = {
  config: { anthropic: {}, openrouter: {}, openai: {}, language: 'en' },
  language: 'en',
}

const mockAgentsStore = {
  getAgentById: vi.fn((id) => {
    if (id === 'agent1') return { id: 'agent1', name: 'Agent One', prompt: 'Test agent', providerId: 'anthropic', modelId: 'claude-3' }
    if (id === 'agent2') return { id: 'agent2', name: 'Agent Two', prompt: 'Test agent 2', providerId: 'anthropic', modelId: 'claude-3' }
    return null
  }),
  defaultSystemAgent: { id: 'agent1', name: 'Agent One', prompt: 'Test agent', providerId: 'anthropic', modelId: 'claude-3' },
  defaultUserAgent: { id: 'user1', name: 'User' },
}

// ── Mock window.electronAPI ────────────────────────────────────────────────────

const mockElectronAPI = {
  sendMessage: vi.fn().mockResolvedValue({}),
  stopAgent: vi.fn().mockResolvedValue({}),
  runAgent: vi.fn().mockResolvedValue({ success: true }),
  compactContext: vi.fn().mockResolvedValue({}),
  compactContextStandalone: vi.fn().mockResolvedValue({ success: true, metrics: {} }),
  claude: { loadContext: vi.fn().mockResolvedValue(null) },
}
vi.stubGlobal('window', { electronAPI: mockElectronAPI })

// ── Mock modules ───────────────────────────────────────────────────────────────

vi.mock('../../stores/chats', () => ({ useChatsStore: () => mockChatsStore }))
vi.mock('../../stores/config', () => ({ useConfigStore: () => mockConfigStore }))
vi.mock('../../stores/agents', () => ({ useAgentsStore: () => mockAgentsStore }))
vi.mock('../../stores/voice', () => ({ useVoiceStore: () => ({ isCallActive: false }) }))
vi.mock('../../i18n/useI18n', () => ({ useI18n: () => ({ t: (k) => k }) }))
vi.mock('../../utils/mentions', () => ({
  parseMentions: vi.fn(() => ({ mentions: [], mentionAll: false })),
}))
vi.mock('uuid', () => ({ v4: () => 'mock-uuid-' + Math.random().toString(36).slice(2, 8) }))

// ── Import after mocks ─────────────────────────────────────────────────────────

import { useSendMessage } from '../useSendMessage'

// ── Helper to instantiate composable ───────────────────────────────────────────

function createSendMessage(overrides = {}) {
  return useSendMessage({
    inputText: ref(''),
    attachments: ref([]),
    quotedMessage: ref(null),
    mentionInputRef: ref({ resetHeight: vi.fn(), focus: vi.fn() }),
    userScrolled: ref(false),
    scrollToBottom: vi.fn(),
    dbg: vi.fn(),
    getQuotedSenderName: vi.fn(() => 'User'),
    perChatStreamingMsgId: reactive(new Map()),
    perChatStreamingSegments: reactive(new Map()),
    collaborationCancelled: ref(false),
    isInCollaborationLoop: ref(false),
    runningAgentKeys: reactive(new Set()),
    streamingSeconds: ref(0),
    historyContextSources: reactive(new Map()),
    _clearHistoryCountdown: vi.fn(),
    applyProviderCredsToConfig: vi.fn(),
    _fireGroupAgentsDirect: vi.fn().mockResolvedValue(undefined),
    activeRunning: computed(() => mockChat.isRunning),
    activeSystemAgentIds: computed(() => ['agent1']),
    enabledSkillObjects: computed(() => []),
    stickyTarget: ref(null),
    programmaticScroll: { increment: vi.fn(), decrement: vi.fn() },
    ...overrides,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useSendMessage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // Reset mock chat state
    mockChat.isRunning = false
    mockChat.isThinking = false
    mockChat.isCallingTool = false
    mockChat.currentToolCall = null
    mockChat.messages = []
    mockChat.systemAgentId = 'agent1'
    mockChat.groupAgentIds = []

    mockChatsStore.activeChatId = 'chat-1'
    mockChatsStore.chats = [mockChat]
  })

  // ─── 1. Empty input rejected ──────────────────────────────────────────────

  it('returns early when input text is empty and no attachments', async () => {
    const inputText = ref('')
    const attachments = ref([])
    const dbg = vi.fn()
    const { sendMessage } = createSendMessage({ inputText, attachments, dbg })

    await sendMessage()

    expect(mockElectronAPI.sendMessage).not.toHaveBeenCalled()
    expect(dbg).toHaveBeenCalledWith(expect.stringContaining('nothing to send'), 'warn')
  })

  // ─── 2. Fire IPC when idle ────────────────────────────────────────────────

  it('calls window.electronAPI.sendMessage when chat is idle', async () => {
    const inputText = ref('Hello world')
    const { sendMessage } = createSendMessage({ inputText })

    await sendMessage()

    expect(mockElectronAPI.sendMessage).toHaveBeenCalledTimes(1)
    const callArg = mockElectronAPI.sendMessage.mock.calls[0][0]
    expect(callArg.chatId).toBe('chat-1')
    expect(callArg.text).toBe('Hello world')
    expect(callArg.isGroup).toBe(false)
  })

  // ─── 3. Shows interrupt confirmation when busy ─────────────────────────────

  it('shows interrupt confirmation instead of sending when chat.isRunning is true', async () => {
    mockChat.isRunning = true
    const inputText = ref('New message')
    const activeRunning = computed(() => mockChat.isRunning)
    const { sendMessage, pendingInterrupt } = createSendMessage({ inputText, activeRunning })

    await sendMessage()

    // Should NOT call IPC
    expect(mockElectronAPI.sendMessage).not.toHaveBeenCalled()
    // Should show interrupt confirmation
    expect(pendingInterrupt.visible).toBe(true)
    expect(pendingInterrupt.text).toBe('New message')
    expect(pendingInterrupt.countdown).toBe(3)
    // Input should be cleared
    expect(inputText.value).toBe('')
  })

  // ─── 4. stopAgent clears everything ───────────────────────────────────────

  it('sets collaborationCancelled, clears runningAgentKeys, calls IPC stopAgent', async () => {
    const collaborationCancelled = ref(false)
    const isInCollaborationLoop = ref(true)
    const runningAgentKeys = reactive(new Set(['chat-1:agent1', 'chat-1:agent2', 'chat-2:agent1']))

    // Add an assistant message to apply interrupt to
    mockChat.messages = [
      { id: 'msg1', role: 'assistant', content: 'Streaming...', streaming: true },
    ]

    const { stopAgent } = createSendMessage({
      collaborationCancelled,
      isInCollaborationLoop,
      runningAgentKeys,
    })

    await stopAgent('chat-1')

    // collaborationCancelled should be set to true
    expect(collaborationCancelled.value).toBe(true)

    // isInCollaborationLoop should be cleared
    expect(isInCollaborationLoop.value).toBe(false)

    // runningAgentKeys for chat-1 should be cleared, chat-2 preserved
    expect(runningAgentKeys.has('chat-1:agent1')).toBe(false)
    expect(runningAgentKeys.has('chat-1:agent2')).toBe(false)
    expect(runningAgentKeys.has('chat-2:agent1')).toBe(true)

    // IPC stopAgent should be called
    expect(mockElectronAPI.stopAgent).toHaveBeenCalledWith('chat-1')
  })

  // ─── 5. Draft save/restore ────────────────────────────────────────────────

  it('saves and restores draft text and attachments for a chat', () => {
    const inputText = ref('My draft text')
    const attachments = ref([{ id: 'a1', name: 'file.png' }])
    const { _saveDraftForChat, _restoreDraftForChat } = createSendMessage({ inputText, attachments })

    _saveDraftForChat('chat-1')

    // Clear input to simulate switching chats
    inputText.value = ''
    attachments.value = []

    _restoreDraftForChat('chat-1')

    expect(inputText.value).toBe('My draft text')
    expect(attachments.value).toHaveLength(1)
    expect(attachments.value[0].name).toBe('file.png')
  })

  it('deletes draft when input text and attachments are both empty', () => {
    const inputText = ref('Some text')
    const attachments = ref([])
    const { _saveDraftForChat, _restoreDraftForChat } = createSendMessage({ inputText, attachments })

    // Save a draft first
    _saveDraftForChat('chat-1')

    // Now clear and save empty
    inputText.value = ''
    _saveDraftForChat('chat-1')

    // Restore should give empty values
    inputText.value = 'leftover'
    _restoreDraftForChat('chat-1')
    expect(inputText.value).toBe('')
    expect(attachments.value).toHaveLength(0)
  })

  // ─── 6. Quote prepended ───────────────────────────────────────────────────

  it('prepends quoted message to text when quotedMessage is set', async () => {
    const inputText = ref('My reply')
    const quotedMessage = ref({
      content: 'Original quoted text',
      role: 'assistant',
    })
    const getQuotedSenderName = vi.fn(() => 'Agent One')
    const { sendMessage } = createSendMessage({ inputText, quotedMessage, getQuotedSenderName })

    await sendMessage()

    expect(mockElectronAPI.sendMessage).toHaveBeenCalledTimes(1)
    const callArg = mockElectronAPI.sendMessage.mock.calls[0][0]
    expect(callArg.text).toContain('> **Agent One:**')
    expect(callArg.text).toContain('Original quoted text')
    expect(callArg.text).toContain('My reply')
    // quotedMessage should be cleared after sending
    expect(quotedMessage.value).toBeNull()
  })

  // ─── 7. cancelInterrupt restores text to input ────────────────────────────

  it('cancelInterrupt puts message back in input box', async () => {
    mockChat.isRunning = true
    const inputText = ref('Interrupt me')
    const attachments = ref([{ id: 'a1', name: 'file.png' }])
    const activeRunning = computed(() => mockChat.isRunning)
    const { sendMessage, pendingInterrupt, cancelInterrupt } = createSendMessage({ inputText, attachments, activeRunning })

    await sendMessage()

    // Interrupt bar should be visible
    expect(pendingInterrupt.visible).toBe(true)
    expect(pendingInterrupt.text).toBe('Interrupt me')
    expect(pendingInterrupt.attachments).toHaveLength(1)

    // Cancel interrupt
    cancelInterrupt()

    // Text and attachments should be restored to input
    expect(inputText.value).toBe('Interrupt me')
    expect(attachments.value).toHaveLength(1)
    expect(pendingInterrupt.visible).toBe(false)
  })

  // ─── 8. escapeRetrieve does nothing when not running ─────────────────────

  it('escapeRetrieve does nothing when agents are not running', () => {
    mockChat.isRunning = false
    mockChat.messages = [{ id: 'u1', role: 'user', content: 'Hello' }]
    const inputText = ref('')
    const { escapeRetrieve } = createSendMessage({ inputText })

    escapeRetrieve('chat-1')

    // Input should remain empty since agents were not running
    expect(inputText.value).toBe('')
  })

  // ─── 9. rejectPlan ────────────────────────────────────────────────────────

  it('calls setPlanState with rejected', () => {
    const { rejectPlan } = createSendMessage()
    const msg = { id: 'plan-1' }

    rejectPlan(msg)

    expect(mockChatsStore.setPlanState).toHaveBeenCalledWith('chat-1', 'plan-1', 'rejected')
  })

  // ─── 10. refinePlan ───────────────────────────────────────────────────────

  it('rejects the plan and prefills inputText with refinement prompt', async () => {
    const inputText = ref('')
    const mentionInputRef = ref({ resetHeight: vi.fn(), focus: vi.fn() })
    const { refinePlan } = createSendMessage({ inputText, mentionInputRef })
    const msg = { id: 'plan-2' }

    refinePlan(msg)

    expect(mockChatsStore.setPlanState).toHaveBeenCalledWith('chat-1', 'plan-2', 'rejected')
    expect(inputText.value).toBe('Refine the plan: ')

    // After nextTick, focus should be called
    await nextTick()
    expect(mentionInputRef.value.focus).toHaveBeenCalled()
  })

  // ─── 11. sendMessage clears input after dispatch ──────────────────────────

  it('clears inputText, attachments, and draft after dispatching', async () => {
    const inputText = ref('Hello')
    const attachments = ref([{ id: 'a1', name: 'file.pdf' }])
    const { sendMessage } = createSendMessage({ inputText, attachments })

    await sendMessage()

    expect(inputText.value).toBe('')
    expect(attachments.value).toHaveLength(0)
  })

  // ─── 12. _applyInterrupt behaviour ────────────────────────────────────────

  it('appends inline marker to a message with content on stop', () => {
    const { _applyInterrupt } = createSendMessage()
    const chat = { messages: [] }
    const msg = { content: 'Partial response', streaming: true }
    chat.messages.push(msg)

    _applyInterrupt(chat, msg, 'stop')

    expect(msg.content).toContain('[Request interrupted by user.]')
    expect(msg.streaming).toBe(false)
  })

  it('silently removes empty message without adding system bubble', () => {
    const { _applyInterrupt } = createSendMessage()
    const emptyMsg = { content: '', streaming: true }
    const chat = { messages: [emptyMsg] }

    _applyInterrupt(chat, emptyMsg, 'stop')

    // Empty msg should be removed silently — no system bubble
    expect(chat.messages).toHaveLength(0)
  })
})
