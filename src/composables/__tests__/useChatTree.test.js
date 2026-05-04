import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// Stub window for resize listener
vi.stubGlobal('window', {
  ...globalThis.window,
  innerWidth: 1920,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})

let mockChatsStore, mockAgentsStore, mockVoiceStore
vi.mock('../../stores/chats', () => ({ useChatsStore: () => mockChatsStore }))
vi.mock('../../stores/agents', () => ({ useAgentsStore: () => mockAgentsStore }))
vi.mock('../../stores/voice', () => ({ useVoiceStore: () => mockVoiceStore }))
vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('../../utils/guestLimits', () => ({
  PREVIEW_LIMITS: {},
  isLimitEnforced: () => false,
}))

import { useChatTree } from '../useChatTree'

function createTree(overrides = {}) {
  return useChatTree({ mentionInputRef: ref(null), ...overrides })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockChatsStore = {
    chats: [
      { id: 'c1', title: 'Alpha Chat', messages: [{ content: 'hello world' }], updatedAt: 300 },
      { id: 'c2', title: 'Beta Chat', messages: [{ content: 'foo bar' }], updatedAt: 200 },
      { id: 'c3', title: 'Gamma Chat', messages: null, updatedAt: 100 },
    ],
    chatTree: [
      { type: 'chat', id: 'c1' },
      { type: 'folder', id: 'f1', name: 'Work', emoji: '📁', expanded: true, children: [
        { type: 'chat', id: 'c2' },
      ]},
      { type: 'chat', id: 'c3' },
    ],
    activeChatId: 'c1',
    setActiveChat: vi.fn(),
    reorderNode: vi.fn(),
    moveNodeToFolder: vi.fn(),
    renameChat: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    ensureMessages: vi.fn(),
    createChat: vi.fn().mockResolvedValue({ id: 'c-new' }),
  }
  mockAgentsStore = {
    systemAgents: [
      { id: 'sys1', name: 'Assistant', isDefault: true },
      { id: 'sys2', name: 'Coder', isDefault: false },
    ],
    userAgents: [
      { id: 'usr1', name: 'Me', isDefault: true },
    ],
    defaultSystemAgent: { id: 'sys1', name: 'Assistant' },
    defaultUserAgent: { id: 'usr1', name: 'Me' },
    getAgentById: vi.fn((id) => ({ id, name: `Agent-${id}` })),
  }
  mockVoiceStore = {
    isCallActive: false,
  }
})

describe('useChatTree', () => {
  // ── Search/Filter ──
  describe('chat filter', () => {
    it('returns all chats when query is empty', () => {
      const tree = createTree()
      expect(tree.filteredChats.value).toHaveLength(3)
    })

    it('filters by title (case-insensitive)', () => {
      const tree = createTree()
      tree.chatFilterQuery.value = 'alpha'
      expect(tree.filteredChats.value).toHaveLength(1)
      expect(tree.filteredChats.value[0].id).toBe('c1')
    })

    it('includes _folderName from tree structure', () => {
      const tree = createTree()
      tree.chatFilterQuery.value = 'beta'
      expect(tree.filteredChats.value).toHaveLength(1)
      expect(tree.filteredChats.value[0]._folderName).toBe('Work')
    })
  })

  // ── Rename ──
  describe('rename', () => {
    it('startRename opens modal with chat data', () => {
      const tree = createTree()
      tree.startRename({ id: 'c1', title: 'Alpha Chat', icon: '🚀' })
      expect(tree.showRenameModal.value).toBe(true)
      expect(tree.editingChatId.value).toBe('c1')
      expect(tree.editingTitle.value).toBe('Alpha Chat')
      expect(tree.editingIcon.value).toBe('🚀')
    })

    it('confirmRename calls store and closes modal', async () => {
      const tree = createTree()
      tree.startRename({ id: 'c1', title: 'Old', icon: '' })
      tree.editingTitle.value = 'New Title'
      await tree.confirmRename()
      expect(mockChatsStore.renameChat).toHaveBeenCalledWith('c1', 'New Title', '')
      expect(tree.showRenameModal.value).toBe(false)
    })

    it('cancelRename closes modal without saving', () => {
      const tree = createTree()
      tree.startRename({ id: 'c1', title: 'Test' })
      tree.cancelRename()
      expect(tree.showRenameModal.value).toBe(false)
      expect(mockChatsStore.renameChat).not.toHaveBeenCalled()
    })
  })

  // ── Drag & Drop ──
  describe('drag and drop', () => {
    it('onTreeDrop calls reorderNode and clears state', () => {
      const tree = createTree()
      tree.draggingNodeId.value = 'c1'
      tree.onTreeDrop('c1', 'c2', 'after')
      expect(mockChatsStore.reorderNode).toHaveBeenCalledWith('c1', 'c2', 'after')
      expect(tree.draggingNodeId.value).toBeNull()
    })

    it('onRootDrop moves node to root', () => {
      const tree = createTree()
      tree.draggingNodeId.value = 'c2'
      tree.onRootDrop({ preventDefault: vi.fn() })
      expect(mockChatsStore.moveNodeToFolder).toHaveBeenCalledWith('c2', null)
      expect(tree.draggingNodeId.value).toBeNull()
    })
  })

  // ── Folders ──
  describe('folder operations', () => {
    it('hasFolders detects folders in tree', () => {
      const tree = createTree()
      expect(tree.hasFolders.value).toBe(true)
    })

    it('anyFolderExpanded detects expanded folders', () => {
      const tree = createTree()
      expect(tree.anyFolderExpanded.value).toBe(true)
    })

    it('onFolderModalConfirm creates folder', async () => {
      const tree = createTree()
      tree.folderModal.value = { visible: true, mode: 'create', parentFolderId: null, editFolderId: null }
      await tree.onFolderModalConfirm({ name: 'New Folder', emoji: '📁' })
      expect(mockChatsStore.createFolder).toHaveBeenCalledWith('New Folder', null, '📁')
    })

    it('onFolderModalConfirm renames folder', async () => {
      const tree = createTree()
      tree.folderModal.value = { visible: true, mode: 'rename', parentFolderId: null, editFolderId: 'f1' }
      await tree.onFolderModalConfirm({ name: 'Renamed', emoji: '🗂️' })
      expect(mockChatsStore.renameFolder).toHaveBeenCalledWith('f1', 'Renamed', '🗂️')
    })

    it('doDeleteFolder blocks non-empty folders', () => {
      const tree = createTree()
      tree.doDeleteFolder('f1') // f1 has children
      expect(tree.folderNonEmptyAlert.value).toBe('Work')
    })
  })

  // ── Sidebar ──
  describe('sidebar', () => {
    it('gets default sidebar width based on screen size', () => {
      const tree = createTree()
      // window.innerWidth = 1920 → 280
      expect(tree.sidebarWidth.value).toBe(280)
    })

    it('chatSidebarCollapsed starts false', () => {
      const tree = createTree()
      expect(tree.chatSidebarCollapsed.value).toBe(false)
    })
  })

  // ── Sorted agents ──
  describe('sorted agents', () => {
    it('sortedSystemAgents puts default first', () => {
      const tree = createTree()
      expect(tree.sortedSystemAgents.value[0].isDefault).toBe(true)
    })
  })
})
