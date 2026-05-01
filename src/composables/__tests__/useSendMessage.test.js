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
  mode: 'chat',
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
  deleteMessage: vi.fn(async (chatId, msgId) => {
    const chat = mockChatsStore.chats.find(c => c.id === chatId)
    if (chat?.messages) {
      const idx = chat.messages.findIndex(m => m.id === msgId)
      if (idx >= 0) chat.messages.splice(idx, 1)
    }
  }),
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

  // ─── 4. interrupt clears collaboration state and calls IPC ───────────────

  it('sets collaborationCancelled, clears runningAgentKeys, calls IPC stopAgent', async () => {
    const collaborationCancelled = ref(false)
    const isInCollaborationLoop = ref(true)
    const runningAgentKeys = reactive(new Set(['chat-1:agent1', 'chat-1:agent2', 'chat-2:agent1']))

    // Add a streaming assistant message so interrupt finds something to act on
    mockChat.messages = [
      { id: 'u1', role: 'user', content: 'Hello' },
      { id: 'msg1', role: 'assistant', content: 'Streaming...', streaming: true },
    ]

    const { interrupt } = createSendMessage({
      collaborationCancelled,
      isInCollaborationLoop,
      runningAgentKeys,
    })

    await interrupt('chat-1')

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

  // ─── 8. interrupt does nothing when no streaming/waiting msg ─────────────

  it('interrupt does nothing when no streaming/waiting assistant msg exists', async () => {
    mockChat.isRunning = false
    mockChat.messages = [{ id: 'u1', role: 'user', content: 'Hello' }]
    const inputText = ref('')
    const { interrupt } = createSendMessage({ inputText })

    await interrupt('chat-1')

    // Input should remain empty since there's no streaming/waiting msg
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

  // ─── 12. interrupt recall behaviour ───────────────────────────────────────

  it('interrupt with activity keeps bubbles and appends marker', async () => {
    mockChat.messages = [
      { id: 'u1', role: 'user', content: 'Hello' },
      { id: 'a1', role: 'assistant', content: 'Partial response', streaming: true },
    ]
    const inputText = ref('')
    const { interrupt } = createSendMessage({ inputText })

    await interrupt('chat-1')

    // User msg should remain, assistant msg should have marker
    expect(mockChat.messages.find(m => m.id === 'u1')).toBeTruthy()
    const assistantMsg = mockChat.messages.find(m => m.id === 'a1')
    expect(assistantMsg.content).toContain('[Request interrupted by user.]')
    expect(assistantMsg.streaming).toBe(false)
    expect(inputText.value).toBe('')
  })

  it('interrupt without activity recalls user msg and deletes both bubbles', async () => {
    mockChat.messages = [
      { id: 'u1', role: 'user', content: 'Hello' },
      { id: 'a1', role: 'assistant', content: '', streaming: true },
    ]
    const inputText = ref('')
    const { interrupt } = createSendMessage({ inputText })

    await interrupt('chat-1')

    // User msg should be recalled to textarea
    expect(inputText.value).toBe('Hello')
    // Both messages should be gone
    expect(mockChat.messages.find(m => m.id === 'u1')).toBeFalsy()
    expect(mockChat.messages.find(m => m.id === 'a1')).toBeFalsy()
  })

  // ─── 13. chat.mode flows through to loopConfig ───────────────────────────

  describe('chat.mode flows through to loopConfig', () => {
    it('productivity mode chat passes mode="productivity" and chatWorkingPath', async () => {
      mockChat.mode = 'productivity'
      mockChat.workingPath = '/work'
      const inputText = ref('Hello')
      const { sendMessage } = createSendMessage({ inputText })

      await sendMessage()

      expect(mockElectronAPI.sendMessage).toHaveBeenCalledTimes(1)
      const meta = mockElectronAPI.sendMessage.mock.calls[0][0].targetChatMeta
      expect(meta.mode).toBe('productivity')
      expect(meta.chatWorkingPath).toBe('/work')
      expect(meta).not.toHaveProperty('codingMode')
      expect(meta).not.toHaveProperty('codingProvider')
    })

    it('chat mode passes mode="chat" and chatWorkingPath=null (ignores workingPath)', async () => {
      mockChat.mode = 'chat'
      mockChat.workingPath = '/should-be-ignored'
      const inputText = ref('Hello')
      const { sendMessage } = createSendMessage({ inputText })

      await sendMessage()

      expect(mockElectronAPI.sendMessage).toHaveBeenCalledTimes(1)
      const meta = mockElectronAPI.sendMessage.mock.calls[0][0].targetChatMeta
      expect(meta.mode).toBe('chat')
      expect(meta.chatWorkingPath).toBeNull()
      expect(meta).not.toHaveProperty('codingMode')
    })

    it('productivity mode without workingPath yields chatWorkingPath=null', async () => {
      mockChat.mode = 'productivity'
      mockChat.workingPath = null
      const inputText = ref('Hello')
      const { sendMessage } = createSendMessage({ inputText })

      await sendMessage()

      expect(mockElectronAPI.sendMessage).toHaveBeenCalledTimes(1)
      const meta = mockElectronAPI.sendMessage.mock.calls[0][0].targetChatMeta
      expect(meta.mode).toBe('productivity')
      expect(meta.chatWorkingPath).toBeNull()
    })
  })
})


// ── buildToolLog (tool history injection) ────────────────────────────────────

import { buildToolLog } from '../useSendMessage'

describe('buildToolLog', () => {
  it('returns empty string for empty/null segments', () => {
    expect(buildToolLog(null)).toBe('')
    expect(buildToolLog([])).toBe('')
    expect(buildToolLog(undefined)).toBe('')
  })

  it('marks successful tool calls with ✓', () => {
    const segs = [{ name: 'execute_shell', input: { command: 'ls' }, output: 'file.txt\ndir/' }]
    const log = buildToolLog(segs)
    expect(log).toContain('1. ✓ execute_shell')
    expect(log).toContain('file.txt')
  })

  it('marks failed tool calls with ✗ for common error patterns', () => {
    const errorOutputs = [
      'Error: spawn cd ENOENT',
      'Traceback (most recent call last):',
      'ModuleNotFoundError: No module named foo',
      'fatal: not a git repository',
      '/bin/bash: python: command not found',
      'No such file or directory',
      'FIND: Invalid switch',
      'ImportError: cannot import name xyz',
    ]
    for (const output of errorOutputs) {
      const segs = [{ name: 'shell', input: {}, output }]
      const log = buildToolLog(segs)
      expect(log).toContain('1. ✗ shell'), `Should mark as error: ${output}`
    }
  })

  it('marks non-zero exit codes as errors', () => {
    // Real tool output format: JSON with exit_code field
    const segs = [{ name: 'shell', input: {}, output: '{\n  "text": "FIND: Invalid switch",\n  "exit_code": 2\n}' }]
    const log = buildToolLog(segs)
    expect(log).toContain('✗')
  })

  it('includes full input up to 500 chars (not truncated at 120)', () => {
    const longCmd = 'cd /d Z:\\home\\young\\.claude && python -m skills.jira.scripts.jira_cli search --jql project=RNDDS ORDER BY created DESC --max-results 5 --fields summary,status,assignee,priority'
    const segs = [{
      name: 'execute_shell',
      input: { command: 'cmd', args: ['/c', longCmd] },
      output: 'Found 5 issues',
    }]
    const log = buildToolLog(segs)
    // The full command should be visible (it's ~190 chars as JSON, well under 500)
    expect(log).toContain('project=RNDDS')
    expect(log).toContain('ORDER BY created DESC')
    expect(log).toContain('--max-results 5')
  })

  it('shows both failed and successful commands so LLM can see the difference', () => {
    const segs = [
      {
        name: 'execute_shell',
        input: { command: 'cmd', args: ['/c', 'python -m jira search --jql "project = RNDDS"'] },
        output: 'Error: Validation error: The quoted string has not been completed',
      },
      {
        name: 'execute_shell',
        input: { command: 'cmd', args: ['/c', 'python -m jira search --jql project=RNDDS'] },
        output: 'Found 5 issue(s)',
      },
    ]
    const log = buildToolLog(segs)
    // Failed: with quotes (JSON-escaped as \")
    expect(log).toContain('1. ✗')
    expect(log).toContain('\\"project = RNDDS\\"')
    // Succeeded: without quotes
    expect(log).toContain('2. ✓')
    expect(log).toContain('project=RNDDS')
  })

  it('wraps output in [Tool execution log...] block', () => {
    const segs = [{ name: 'test_tool', input: {}, output: 'ok' }]
    const log = buildToolLog(segs)
    expect(log).toMatch(/^\n\n\[Tool execution log from this response:\n/)
    expect(log).toMatch(/\n\]$/)
  })

  it('handles multiple tool calls in sequence', () => {
    const segs = [
      { name: 'load_skill', input: { skill_id: 'jira' }, output: '{"success":true}' },
      { name: 'execute_shell', input: { command: 'cd' }, output: 'Error: ENOENT' },
      { name: 'execute_shell', input: { command: 'bash' }, output: 'success' },
    ]
    const log = buildToolLog(segs)
    expect(log).toContain('1. ✓ load_skill')
    expect(log).toContain('2. ✗ execute_shell')
    expect(log).toContain('3. ✓ execute_shell')
  })

  it('handles string input format', () => {
    const segs = [{ name: 'tool', input: 'raw string input that is quite long', output: 'ok' }]
    const log = buildToolLog(segs)
    expect(log).toContain('raw string input')
  })

  it('handles missing/undefined output gracefully', () => {
    const segs = [{ name: 'tool', input: {}, output: undefined }]
    const log = buildToolLog(segs)
    expect(log).toContain('1. ✗ tool') // no output = error
  })
})
