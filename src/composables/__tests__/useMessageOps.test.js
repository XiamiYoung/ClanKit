import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }))

let mockChatsStore, mockAgentsStore
vi.mock('../../stores/chats', () => ({ useChatsStore: () => mockChatsStore }))
vi.mock('../../stores/agents', () => ({ useAgentsStore: () => mockAgentsStore }))
vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
const mockStorageDeleteMessage = vi.fn().mockResolvedValue({ success: true })
vi.mock('../../services/storage', () => ({
  storage: {
    deleteMessage: (...args) => mockStorageDeleteMessage(...args),
  },
}))

// Stub clipboard
const mockClipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
vi.stubGlobal('navigator', { clipboard: mockClipboard })

import { useMessageOps } from '../useMessageOps'

function createOps(overrides = {}) {
  return useMessageOps({
    copiedId: ref(null),
    quotedMessage: ref(null),
    attachments: ref([]),
    inputText: ref(''),
    mentionInputRef: ref({ focus: vi.fn() }),
    confirmDeleteTarget: ref(null),
    sendMessage: vi.fn(),
    ...overrides,
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockClipboard.writeText.mockClear()
  mockChatsStore = {
    activeChatId: 'c1',
    activeChat: { systemAgentId: 'sys1', userAgentId: null },
    chats: [{ id: 'c1', messages: [] }],
    deleteMessage: vi.fn(),
  }
  mockAgentsStore = {
    defaultSystemAgent: { id: 'sys1', name: 'Assistant' },
    defaultUserAgent: { id: 'usr1', name: 'User' },
    getAgentById: vi.fn((id) => ({ id, name: `Agent-${id}` })),
  }
})

describe('useMessageOps', () => {
  it('copyMessage copies text content to clipboard', async () => {
    const ops = createOps()
    await ops.copyMessage({ id: 'm1', content: 'Hello world' })
    expect(mockClipboard.writeText).toHaveBeenCalledWith('Hello world')
  })

  it('copyMessage extracts text from segments', async () => {
    const ops = createOps()
    await ops.copyMessage({
      id: 'm1',
      content: '',
      segments: [
        { type: 'text', content: 'Part 1' },
        { type: 'tool', name: 'shell', output: 'ok' },
        { type: 'text', content: 'Part 2' },
      ],
    })
    expect(mockClipboard.writeText).toHaveBeenCalledWith('Part 1\n\nPart 2')
  })

  it('requestDeleteMessage sets confirmDeleteTarget', () => {
    const target = ref(null)
    const ops = createOps({ confirmDeleteTarget: target })
    ops.requestDeleteMessage({ id: 'm1', content: 'Hello world' })
    expect(target.value).toEqual({
      type: 'message',
      id: 'c1',
      msgId: 'm1',
      label: 'Hello world',
    })
  })

  it('quoteMessage sets quotedMessage ref', () => {
    const quoted = ref(null)
    const ops = createOps({ quotedMessage: quoted })
    ops.quoteMessage({ role: 'assistant', content: 'Reply to this', agentId: 'a1' })
    expect(quoted.value).toEqual({ role: 'assistant', content: 'Reply to this', agentId: 'a1' })
  })

  it('clearQuote resets quotedMessage', () => {
    const quoted = ref({ role: 'assistant', content: 'test' })
    const ops = createOps({ quotedMessage: quoted })
    ops.clearQuote()
    expect(quoted.value).toBeNull()
  })

  it('getQuotedSenderName returns agent name for assistant', () => {
    const ops = createOps()
    const name = ops.getQuotedSenderName({ role: 'assistant', agentId: 'a1' })
    expect(name).toBe('Agent-a1')
  })

  it('getQuotedSenderName returns user name for user role', () => {
    // activeChat.userAgentId is null → falls back to defaultUserAgent
    const ops = createOps()
    const name = ops.getQuotedSenderName({ role: 'user' })
    expect(name).toBe('User')
  })

  it('formatTime returns YYYY-MM-DD HH:mm', () => {
    const ops = createOps()
    const d = new Date(2026, 3, 17, 14, 30)
    expect(ops.formatTime(d.toISOString())).toBe('2026-04-17 14:30')
  })

  it('formatTokenCount formats thousands with k suffix', () => {
    const ops = createOps()
    expect(ops.formatTokenCount(0)).toBe('0')
    expect(ops.formatTokenCount(500)).toBe('500')
    expect(ops.formatTokenCount(1500)).toBe('1.5k')
    expect(ops.formatTokenCount(10000)).toBe('10.0k')
  })

  it('handleChatWindowSend sets inputText and calls sendMessage', () => {
    const inputText = ref('')
    const sendMessage = vi.fn()
    const ops = createOps({ inputText, sendMessage })
    ops.handleChatWindowSend('Hello')
    expect(inputText.value).toBe('Hello')
    expect(sendMessage).toHaveBeenCalled()
  })

  it('handleQuoteImage adds image attachment', () => {
    const atts = ref([])
    const ops = createOps({ attachments: atts })
    ops.handleQuoteImage({
      img: { data: 'base64data', mimeType: 'image/png' },
      src: 'data:image/png;base64,base64data',
    })
    expect(atts.value).toHaveLength(1)
    expect(atts.value[0].type).toBe('image')
    expect(atts.value[0].base64).toBe('base64data')
    expect(atts.value[0]._quoted).toBe(true)
  })

  it('handleResendMessage puts content back in input and calls sendMessage', () => {
    const inputText = ref('')
    const sendMessage = vi.fn()
    const chat = mockChatsStore.chats[0]
    chat.messages = [
      { id: 'u1', role: 'user', content: 'Original message' },
      { id: 'w1', isWaitingIndicator: true, sourceUserMessageId: 'u1' },
    ]
    const ops = createOps({ inputText, sendMessage })
    ops.handleResendMessage({ id: 'u1', content: 'Original message' })
    expect(inputText.value).toBe('Original message')
    expect(sendMessage).toHaveBeenCalled()
    // Waiting indicator should be removed
    expect(chat.messages.find(m => m.isWaitingIndicator)).toBeUndefined()
  })

  describe('deleteOversizeMessage', () => {
    beforeEach(() => {
      mockStorageDeleteMessage.mockClear()
      mockStorageDeleteMessage.mockResolvedValue({ success: true })
    })

    it('calls storage.deleteMessage IPC + splices in-memory on success', async () => {
      const chat = mockChatsStore.chats[0]
      chat.messages = [
        { id: 'a', role: 'user', content: 'hi' },
        { id: 'huge', role: 'assistant', oversize: true, content: '', segments: [] },
        { id: 'c', role: 'assistant', content: 'reply' },
      ]
      const ops = createOps()
      const r = await ops.deleteOversizeMessage('c1', 'huge')
      expect(r.success).toBe(true)
      expect(mockStorageDeleteMessage).toHaveBeenCalledWith('c1', 'huge')
      expect(chat.messages.find(m => m.id === 'huge')).toBeUndefined()
      expect(chat.messages).toHaveLength(2)
    })

    it('does NOT splice when IPC reports failure', async () => {
      mockStorageDeleteMessage.mockResolvedValue({ success: false, error: 'db locked' })
      const chat = mockChatsStore.chats[0]
      chat.messages = [{ id: 'huge', role: 'assistant', oversize: true }]
      const ops = createOps()
      const r = await ops.deleteOversizeMessage('c1', 'huge')
      expect(r.success).toBe(false)
      expect(chat.messages.find(m => m.id === 'huge')).toBeDefined()
    })

    it('no-ops on missing chatId or messageId', async () => {
      const ops = createOps()
      const r1 = await ops.deleteOversizeMessage(null, 'm1')
      const r2 = await ops.deleteOversizeMessage('c1', null)
      expect(r1.success).toBe(false)
      expect(r2.success).toBe(false)
      expect(mockStorageDeleteMessage).not.toHaveBeenCalled()
    })
  })
})
