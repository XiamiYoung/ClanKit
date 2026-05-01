import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

let uuidCounter = 0
vi.mock('uuid', () => ({ v4: () => `uuid-${++uuidCounter}` }))

vi.mock('../../services/storage', () => ({
  storage: {
    getChatIndex: vi.fn().mockResolvedValue([]),
    saveChatIndex: vi.fn().mockResolvedValue(true),
    getChat: vi.fn().mockResolvedValue(null),
    saveChat: vi.fn().mockResolvedValue(true),
    deleteChat: vi.fn().mockResolvedValue(true),
  },
}))

import { useChatsStore } from '../chats'
import { storage } from '../../services/storage'

// Stub window + localStorage for loadChats
vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: { onAgentChunk: vi.fn() },
})
vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() })

beforeEach(() => {
  setActivePinia(createPinia())
  uuidCounter = 0
  vi.clearAllMocks()
  storage.getChatIndex.mockResolvedValue([])
  storage.getChat.mockResolvedValue(null)
})

describe('chatsStore', () => {

  // ── loadChats ──
  describe('loadChats', () => {
    it('loads empty tree and produces empty chats list', async () => {
      const store = useChatsStore()
      await store.loadChats()
      expect(store.chats).toEqual([])
      expect(store.chatTree).toEqual([])
    })

    it('loads tree with chats and backfills runtime fields', async () => {
      storage.getChatIndex.mockResolvedValue([
        { type: 'chat', id: 'c1', title: 'Test Chat' },
        { type: 'folder', id: 'f1', name: 'Work', children: [
          { type: 'chat', id: 'c2', title: 'Work Chat' },
        ]},
      ])
      const store = useChatsStore()
      await store.loadChats()
      expect(store.chats).toHaveLength(2)
      const c1 = store.chats.find(c => c.id === 'c1')
      expect(c1.title).toBe('Test Chat')
      expect(c1.isRunning).toBe(false) // backfilled
      // loadChats calls ensureMessages for the initial active chat (fire-and-forget)
      // so messages may already be loaded as [] (getChat returns null → empty array fallback)
      expect(c1.groupAgentIds).toEqual([]) // backfilled
    })
  })

  // ── createChat ──
  describe('createChat', () => {
    it('creates a chat with title and adds to tree', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('My Chat')
      expect(chat.id).toBe('uuid-1')
      expect(chat.title).toBe('My Chat')
      expect(chat.messages).toEqual([])
      expect(store.chats).toHaveLength(1)
    })

    it('creates chat with single agent → systemAgentId', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('Single Agent', ['a1'])
      expect(chat.systemAgentId).toBe('a1')
      expect(chat.groupAgentIds).toEqual([])
    })

    it('creates chat with multiple agents → groupAgentIds', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('Group Chat', ['a1', 'a2'])
      expect(chat.isGroupChat).toBe(true)
      expect(chat.groupAgentIds).toEqual(['a1', 'a2'])
    })
  })

  // ── addMessage ──
  describe('addMessage', () => {
    it('adds a message to a chat', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('Test')
      await store.addMessage(chat.id, { role: 'user', content: 'Hello' })
      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].role).toBe('user')
      expect(chat.messages[0].content).toBe('Hello')
      expect(chat.messages[0].id).toBeTruthy()
    })

    it('adds timestamp to messages', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('Test')
      await store.addMessage(chat.id, { role: 'assistant', content: 'Hi' })
      expect(chat.messages[0].timestamp).toBeTruthy()
    })
  })

  // ── deleteMessage ──
  describe('deleteMessage', () => {
    it('removes a message by id', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('Test')
      await store.addMessage(chat.id, { id: 'm1', role: 'user', content: 'Hello' })
      await store.addMessage(chat.id, { id: 'm2', role: 'assistant', content: 'Hi' })
      store.deleteMessage(chat.id, 'm1')
      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].id).toBe('m2')
    })
  })

  // ── setActiveChat ──
  describe('setActiveChat', () => {
    it('sets the activeChatId', async () => {
      const store = useChatsStore()
      await store.createChat('Chat 1')
      store.setActiveChat('uuid-1')
      expect(store.activeChatId).toBe('uuid-1')
    })
  })

  // ── renameChat ──
  describe('renameChat', () => {
    it('updates chat title and icon', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('Old Title')
      await store.renameChat(chat.id, 'New Title', '🚀')
      expect(chat.title).toBe('New Title')
      expect(chat.icon).toBe('🚀')
    })
  })

  // ── removeChat ──
  describe('removeChat', () => {
    it('removes a chat from the tree', async () => {
      const store = useChatsStore()
      await store.createChat('To Delete')
      expect(store.chats).toHaveLength(1)
      await store.removeChat('uuid-1')
      expect(store.chats).toHaveLength(0)
    })
  })

  // ── ensureMessages ──
  describe('ensureMessages', () => {
    it('loads messages from storage for a chat', async () => {
      // Create a chat directly (not via loadChats which auto-loads)
      const store = useChatsStore()
      const chat = await store.createChat('Test')
      // Manually set messages to null to simulate lazy state
      chat.messages = null
      storage.getChat.mockResolvedValue({
        id: chat.id,
        messages: [{ id: 'm1', role: 'user', content: 'Hello' }],
      })
      await store.ensureMessages(chat.id)
      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].content).toBe('Hello')
    })

    it('strips stale streaming flags on load', async () => {
      storage.getChat.mockResolvedValue({
        id: 'c1',
        messages: [{ id: 'm1', role: 'assistant', content: 'partial', streaming: true }],
      })
      storage.getChatIndex.mockResolvedValue([
        { type: 'chat', id: 'c1', title: 'Test' },
      ])
      const store = useChatsStore()
      await store.loadChats()
      await store.ensureMessages('c1')
      const msg = store.chats[0].messages[0]
      expect(msg.streaming).toBe(false) // cleaned on load
    })

    it('strips waiting indicators on load', async () => {
      storage.getChat.mockResolvedValue({
        id: 'c1',
        messages: [
          { id: 'w1', isWaitingIndicator: true, role: 'assistant' },
          { id: 'm1', role: 'user', content: 'Hello' },
        ],
      })
      storage.getChatIndex.mockResolvedValue([
        { type: 'chat', id: 'c1', title: 'Test' },
      ])
      const store = useChatsStore()
      await store.loadChats()
      await store.ensureMessages('c1')
      const msgs = store.chats[0].messages
      expect(msgs.find(m => m.isWaitingIndicator)).toBeUndefined()
      expect(msgs).toHaveLength(1)
    })
  })

  // ── Folder operations ──
  describe('folder operations', () => {
    it('createFolder adds a folder to the tree', async () => {
      const store = useChatsStore()
      await store.createFolder('Work', null, '📁')
      expect(store.chatTree).toHaveLength(1)
      expect(store.chatTree[0].type).toBe('folder')
      expect(store.chatTree[0].name).toBe('Work')
      expect(store.chatTree[0].emoji).toBe('📁')
    })

    it('renameFolder updates folder name', async () => {
      const store = useChatsStore()
      await store.createFolder('Old', null, '📁')
      const folder = store.chatTree[0]
      await store.renameFolder(folder.id, 'New Name', '🗂️')
      expect(folder.name).toBe('New Name')
      expect(folder.emoji).toBe('🗂️')
    })
  })

  // ── Group chat operations ──
  describe('group chat', () => {
    it('setGroupAgents updates group agent ids', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('Group')
      store.setGroupAgents(chat.id, ['a1', 'a2', 'a3'])
      expect(chat.groupAgentIds).toEqual(['a1', 'a2', 'a3'])
    })

    it('addGroupAgent appends without duplicates', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('Group', ['a1', 'a2'])
      store.addGroupAgent(chat.id, 'a3')
      expect(chat.groupAgentIds).toEqual(['a1', 'a2', 'a3'])
      store.addGroupAgent(chat.id, 'a1') // duplicate
      expect(chat.groupAgentIds).toEqual(['a1', 'a2', 'a3'])
    })

    it('removeGroupAgent removes agent from group', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('Group', ['a1', 'a2', 'a3'])
      store.removeGroupAgent(chat.id, 'a2')
      expect(chat.groupAgentIds).toEqual(['a1', 'a3'])
    })
  })

  // ── Chunk recording (dev mode) ──
  describe('chunk recording', () => {
    it('getChunkLog returns empty array', () => {
      const store = useChatsStore()
      expect(store.getChunkLog()).toEqual([])
    })

    it('clearChunkLog does not throw', () => {
      const store = useChatsStore()
      expect(() => store.clearChunkLog()).not.toThrow()
    })
  })

  // ── markAsRead / markCompleted ──
  describe('status tracking', () => {
    it('markAsRead removes from unread set', async () => {
      const store = useChatsStore()
      await store.createChat('Test')
      // Simulate unread
      store.unreadChatIds = new Set(['uuid-1'])
      store.markAsRead('uuid-1')
      expect(store.unreadChatIds.has('uuid-1')).toBe(false)
    })

    it('markCompleted adds to completed set', async () => {
      const store = useChatsStore()
      store.markCompleted('c1')
      expect(store.completedChatIds.has('c1')).toBe(true)
    })
  })

  // ── chat.mode field ──
  describe('chat.mode field', () => {
    it('createChat defaults mode to "chat"', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('test')
      expect(chat.mode).toBe('chat')
      expect(chat.modeTransitions).toEqual([])
      expect(chat.modeTransitionPending).toBeNull()
      expect(chat.productivityModeNoticeShown).toBe(false)
    })

    it('createChat accepts explicit mode in options', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('test', null, null, { mode: 'productivity' })
      expect(chat.mode).toBe('productivity')
    })

    it('createChatFromHistory inherits mode and workingPath but resets transitions', async () => {
      const store = useChatsStore()
      const source = await store.createChat('source', null, null, { mode: 'productivity' })
      source.workingPath = '/tmp/x'
      source.modeTransitions = [{ from: 'chat', to: 'productivity', at: 1, afterMessageId: null }]
      source.productivityModeNoticeShown = true
      const fork = await store.createChatFromHistory(source.id, 'fork')
      expect(fork.mode).toBe('productivity')
      expect(fork.workingPath).toBe('/tmp/x')
      expect(fork.modeTransitions).toEqual([])
      expect(fork.productivityModeNoticeShown).toBe(false)
    })

    it('backfillChat sets mode="chat" for legacy chats and drops coding fields', () => {
      const legacy = { id: 'x', title: 't', messages: [], codingMode: true, codingProvider: 'claude-code' }
      const store = useChatsStore()
      store._testBackfill(legacy)
      expect(legacy.mode).toBe('chat')
      expect(legacy.modeTransitions).toEqual([])
      expect(legacy.modeTransitionPending).toBeNull()
      expect(legacy.productivityModeNoticeShown).toBe(false)
      expect(legacy).not.toHaveProperty('codingMode')
      expect(legacy).not.toHaveProperty('codingProvider')
    })
  })
})
