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

    // ── Empty agent-stamped row cleanup (regression for LESSONS.md "agentId-stamp
    // orphans bypass agent_end splice"). These rows escape to disk when an
    // abnormal exit path (send_message_error, IPC failure, user-stop before
    // agent_start) skips useChunkHandler's agent_end empty-splice, leaving a
    // bare role:'assistant' row stamped with agentId but no content.
    it('drops empty assistant rows with agentId set, no content, no segments, no error', async () => {
      storage.getChat.mockResolvedValue({
        id: 'c1',
        messages: [
          { id: 'u1', role: 'user', content: 'Hi' },
          { id: 'orphan', role: 'assistant', agentId: '__default_system__', content: '', segments: [] },
          { id: 'real', role: 'assistant', agentId: '__default_system__', content: 'real reply', segments: [{ type: 'text', content: 'real reply' }] },
        ],
      })
      storage.getChatIndex.mockResolvedValue([{ type: 'chat', id: 'c1', title: 'Test' }])
      const store = useChatsStore()
      await store.loadChats()
      await store.ensureMessages('c1')
      const msgs = store.chats[0].messages
      expect(msgs.find(m => m.id === 'orphan')).toBeUndefined()
      expect(msgs.find(m => m.id === 'real')).toBeDefined()
    })

    it('KEEPS assistant rows that have a non-text segment (tool, permission, plan)', async () => {
      storage.getChat.mockResolvedValue({
        id: 'c1',
        messages: [
          { id: 'tool-only', role: 'assistant', agentId: 'a1', content: '', segments: [{ type: 'tool', name: 'execute_shell', input: {} }] },
          { id: 'perm-only', role: 'assistant', agentId: 'a1', content: '', segments: [{ type: 'permission', blockId: 'b1', status: 'pending' }] },
          { id: 'plan-only', role: 'assistant', agentId: 'a1', content: '', segments: [], planData: { title: 'p', steps: [] } },
        ],
      })
      storage.getChatIndex.mockResolvedValue([{ type: 'chat', id: 'c1', title: 'Test' }])
      const store = useChatsStore()
      await store.loadChats()
      await store.ensureMessages('c1')
      const msgs = store.chats[0].messages
      expect(msgs.find(m => m.id === 'tool-only')).toBeDefined()
      expect(msgs.find(m => m.id === 'perm-only')).toBeDefined()
      expect(msgs.find(m => m.id === 'plan-only')).toBeDefined()
    })

    it('KEEPS empty assistant rows that have errorDetail or isError set', async () => {
      storage.getChat.mockResolvedValue({
        id: 'c1',
        messages: [
          { id: 'err-detail', role: 'assistant', agentId: 'a1', content: '', segments: [], errorDetail: 'rate limited' },
          { id: 'err-flag', role: 'assistant', agentId: 'a1', content: '', segments: [], isError: true },
        ],
      })
      storage.getChatIndex.mockResolvedValue([{ type: 'chat', id: 'c1', title: 'Test' }])
      const store = useChatsStore()
      await store.loadChats()
      await store.ensureMessages('c1')
      const msgs = store.chats[0].messages
      expect(msgs.find(m => m.id === 'err-detail')).toBeDefined()
      expect(msgs.find(m => m.id === 'err-flag')).toBeDefined()
    })

    // Read-side oversize defense: ChatStore returns empty content/segments
    // for placeholder rows. The empty-orphan filter would otherwise drop them
    // before ChatWindow gets a chance to render the red maintenance card.
    it('KEEPS oversize placeholder rows (content empty by design)', async () => {
      storage.getChat.mockResolvedValue({
        id: 'c1',
        messages: [
          { id: 'normal', role: 'user', content: 'Hi' },
          {
            id: 'huge', role: 'assistant', agent_id: 'a1', agent_name: 'Clank',
            content: '', segments: [],
            oversize: true, totalBytes: 22_000_000, contentBytes: 10_500_000,
          },
        ],
      })
      storage.getChatIndex.mockResolvedValue([{ type: 'chat', id: 'c1', title: 'Test' }])
      const store = useChatsStore()
      await store.loadChats()
      await store.ensureMessages('c1')
      const msgs = store.chats[0].messages
      const placeholder = msgs.find(m => m.id === 'huge')
      expect(placeholder).toBeDefined()
      expect(placeholder.oversize).toBe(true)
      expect(placeholder.totalBytes).toBe(22_000_000)
    })
  })

  // ── _serializeChat (regression: write-side guard against agent-stamped orphans) ──
  describe('_serializeChat empty-row filter', () => {
    async function setupChatWithMessages(messages) {
      storage.getChat.mockResolvedValue({ id: 'c1', messages: [{ id: 'u1', role: 'user', content: 'Hi' }] })
      storage.getChatIndex.mockResolvedValue([{ type: 'chat', id: 'c1', title: 'Test' }])
      const store = useChatsStore()
      await store.loadChats()
      await store.ensureMessages('c1')
      // Push the test messages directly (bypass addMessage so we control the shape exactly)
      store.chats[0].messages.push(...messages)
      return store
    }

    it('drops empty non-streaming assistant rows on persist', async () => {
      const store = await setupChatWithMessages([
        { id: 'orphan', role: 'assistant', agentId: 'a1', content: '', segments: [], streaming: false },
        { id: 'real', role: 'assistant', agentId: 'a1', content: 'hi', segments: [{ type: 'text', content: 'hi' }] },
      ])
      storage.saveChat.mockClear()
      await store.persist()
      const saved = storage.saveChat.mock.calls.find(c => c[0].id === 'c1')[0]
      expect(saved.messages.find(m => m.id === 'orphan')).toBeUndefined()
      expect(saved.messages.find(m => m.id === 'real')).toBeDefined()
    })

    it('KEEPS streaming=true rows even when content is empty (in-flight reply)', async () => {
      const store = await setupChatWithMessages([
        { id: 'in-flight', role: 'assistant', agentId: 'a1', content: '', segments: [], streaming: true },
      ])
      storage.saveChat.mockClear()
      await store.persist()
      const saved = storage.saveChat.mock.calls.find(c => c[0].id === 'c1')[0]
      expect(saved.messages.find(m => m.id === 'in-flight')).toBeDefined()
    })

    it('KEEPS empty assistant rows that have planData', async () => {
      const store = await setupChatWithMessages([
        { id: 'plan', role: 'assistant', agentId: 'a1', content: '', segments: [], streaming: false, planData: { title: 'p', steps: [] } },
      ])
      storage.saveChat.mockClear()
      await store.persist()
      const saved = storage.saveChat.mock.calls.find(c => c[0].id === 'c1')[0]
      expect(saved.messages.find(m => m.id === 'plan')).toBeDefined()
    })

    // Data-loss regression guard for the oversize-message defense.
    // Read-side placeholders carry empty content/segments by design — if they
    // round-tripped through the normal persist path they'd UPSERT over the
    // original (oversized) DB row and wipe it. _serializeChat must filter
    // them out so the heavy DB row survives untouched.
    it('NEVER persists oversize placeholder messages (data-loss guard)', async () => {
      const store = await setupChatWithMessages([
        {
          id: 'huge', role: 'assistant', agentId: 'a1',
          content: '', segments: [],
          oversize: true, totalBytes: 22_000_000, contentBytes: 10_500_000,
        },
        { id: 'real', role: 'assistant', agentId: 'a1', content: 'hi', segments: [{ type: 'text', content: 'hi' }] },
      ])
      storage.saveChat.mockClear()
      await store.persist()
      const saved = storage.saveChat.mock.calls.find(c => c[0].id === 'c1')[0]
      expect(saved.messages.find(m => m.id === 'huge')).toBeUndefined()
      // The real message still persists alongside
      expect(saved.messages.find(m => m.id === 'real')).toBeDefined()
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

  // ── chat.setMode action ──
  describe('chat.setMode action', () => {
    it('setMode updates chat.mode and appends to modeTransitions', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('t')
      chat.messages.push({ id: 'm1', role: 'user', content: 'hi' })
      await store.setMode(chat.id, 'productivity')
      expect(chat.mode).toBe('productivity')
      expect(chat.modeTransitions.length).toBe(1)
      expect(chat.modeTransitions[0]).toMatchObject({
        from: 'chat',
        to: 'productivity',
        afterMessageId: 'm1'
      })
      expect(chat.modeTransitions[0].at).toBeTypeOf('number')
      expect(chat.modeTransitionPending).toMatchObject({
        from: 'chat',
        to: 'productivity'
      })
    })

    it('setMode is a no-op when mode unchanged', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('t')
      await store.setMode(chat.id, 'chat')
      expect(chat.modeTransitions.length).toBe(0)
      expect(chat.modeTransitionPending).toBeNull()
    })

    it('setMode sets productivityModeNoticeShown=true on first productivity switch', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('t')
      expect(chat.productivityModeNoticeShown).toBe(false)
      await store.setMode(chat.id, 'productivity')
      expect(chat.productivityModeNoticeShown).toBe(true)
      // switching back must NOT clear the flag
      await store.setMode(chat.id, 'chat')
      expect(chat.productivityModeNoticeShown).toBe(true)
      // switching back to productivity must leave it true
      await store.setMode(chat.id, 'productivity')
      expect(chat.productivityModeNoticeShown).toBe(true)
    })

    it('setMode rejects invalid mode values', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('t')
      await expect(store.setMode(chat.id, 'xyz')).rejects.toThrow()
    })

    it('setMode is a no-op for unknown chatId (no throw)', async () => {
      const store = useChatsStore()
      await expect(store.setMode('does-not-exist', 'productivity')).resolves.toBeUndefined()
    })

    it('clearModeTransitionPending nulls the field', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('t')
      await store.setMode(chat.id, 'productivity')
      expect(chat.modeTransitionPending).not.toBeNull()
      store.clearModeTransitionPending(chat.id)
      expect(chat.modeTransitionPending).toBeNull()
    })

    it('setMode with empty messages records afterMessageId=null', async () => {
      const store = useChatsStore()
      const chat = await store.createChat('t')
      // chat.messages is empty
      await store.setMode(chat.id, 'productivity')
      expect(chat.modeTransitions[0].afterMessageId).toBeNull()
    })
  })
})
