/**
 * useChatTree — chat tree sidebar management.
 *
 * Covers: drag-drop, sidebar resize, chat rename, chat filter/search,
 * tree context menu, folder CRUD, new chat modal, delete confirm.
 *
 * Extracted from ChatsView.vue.
 */
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useChatsStore } from '../stores/chats'
import { useAgentsStore } from '../stores/agents'
import { useVoiceStore } from '../stores/voice'
import { useI18n } from '../i18n/useI18n'

export function useChatTree({ mentionInputRef } = {}) {
  const chatsStore = useChatsStore()
  const agentsStore = useAgentsStore()
  const voiceStore = useVoiceStore()
  const { t } = useI18n()

  // ── Sorted agents (used by new chat agent picker) ──────────────────────────
  const sortedSystemAgents = computed(() =>
    [...agentsStore.systemAgents].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
  )

  const sortedUserAgents = computed(() =>
    [...agentsStore.userAgents].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
  )

  // ── Drag & drop (tree-based) ───────────────────────────────────────────────
  const draggingNodeId = ref(null)
  const treeDropTarget = ref(null)
  const rootDragOver = ref(false)

  function onTreeDrop(nodeId, targetId, position) {
    if (!nodeId) return
    chatsStore.reorderNode(nodeId, targetId, position)
    draggingNodeId.value = null
    treeDropTarget.value = null
  }

  function onRootDragOver(e) {
    if (!draggingNodeId.value) return
    e.preventDefault()
    rootDragOver.value = true
  }

  function onRootDragLeave(e) {
    // Only clear if leaving the list entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      rootDragOver.value = false
    }
  }

  function onRootDrop(e) {
    if (!draggingNodeId.value) return
    rootDragOver.value = false
    // Drop onto root area = move to root
    chatsStore.moveNodeToFolder(draggingNodeId.value, null)
    draggingNodeId.value = null
  }

  // ── Resizable sidebar ──────────────────────────────────────────────────────
  function getDefaultSidebarWidth() {
    if (window.innerWidth >= 2560) return 340
    if (window.innerWidth >= 1920) return 300
    return 260
  }

  const sidebarWidth = ref(getDefaultSidebarWidth())
  const chatHeaderRef = ref(null)
  const chatSidebarCollapsed = ref(false)
  // Tracks the last-clicked tree node: { type: 'folder'|'chat', id }
  const treeLastSelected = ref(null)
  const selectedFolderId = ref(null)
  const rootExpanded = ref(true)
  const isResizing = ref(false)

  const anyFolderExpanded = computed(() => {
    function check(nodes) {
      for (const node of nodes) {
        if (node.type === 'folder') {
          if (node.expanded) return true
          if (node.children?.length && check(node.children)) return true
        }
      }
      return false
    }
    return check(chatsStore.chatTree)
  })

  const hasFolders = computed(() => {
    function has(nodes) {
      for (const node of nodes) {
        if (node.type === 'folder') return true
      }
      return false
    }
    return has(chatsStore.chatTree)
  })

  function startResize(e) {
    isResizing.value = true
    const startX = e.clientX
    const startWidth = sidebarWidth.value

    function onMouseMove(e) {
      const delta = e.clientX - startX
      const minW = window.innerWidth >= 2560 ? 200 : 180
      const maxW = window.innerWidth >= 2560 ? 480 : 400
      sidebarWidth.value = Math.max(minW, Math.min(maxW, startWidth + delta))
    }

    function onMouseUp() {
      isResizing.value = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // ── Rename ─────────────────────────────────────────────────────────────────
  const renameInput = ref(null)
  const showRenameModal = ref(false)
  const editingChatId = ref(null)
  const editingTitle = ref('')
  const editingIcon = ref('')
  const showRenameIconPicker = ref(false)
  const renameComposing = ref(false)

  function startRename(chat) {
    editingChatId.value = chat.id
    editingTitle.value = chat.title
    editingIcon.value = chat.icon || ''
    showRenameIconPicker.value = false
    showRenameModal.value = true
    nextTick(() => renameInput.value?.focus())
  }

  function onRenameIconSelect(emoji) {
    editingIcon.value = emoji || ''
    showRenameIconPicker.value = false
  }

  async function confirmRename() {
    if (editingChatId.value && editingTitle.value.trim()) {
      await chatsStore.renameChat(editingChatId.value, editingTitle.value.trim(), editingIcon.value.trim())
    }
    showRenameModal.value = false
    editingChatId.value = null
    showRenameIconPicker.value = false
  }

  function cancelRename() {
    showRenameModal.value = false
    editingChatId.value = null
    showRenameIconPicker.value = false
  }

  function onRenameKeydown(e) {
    // Ignore Enter during IME composition (e.g. Chinese input)
    if (e.isComposing || renameComposing.value) return
    confirmRename()
  }

  // ── Chat Filter ────────────────────────────────────────────────────────────
  const chatFilterQuery = ref('')
  const chatSearchCache = ref({}) // { chatId: 'lowercased message text' }

  // Load messages and cache searchable text for a chat
  async function ensureChatSearchable(chatId) {
    if (chatSearchCache.value[chatId] !== undefined) return
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (!chat) return
    if (chat.messages === null) {
      await chatsStore.ensureMessages(chatId)
    }
    const msgs = chat.messages || []
    chatSearchCache.value[chatId] = msgs
      .map(m => {
        if (typeof m.content === 'string') return m.content
        if (m.segments) return m.segments.filter(s => s.type === 'text').map(s => s.content).join(' ')
        return ''
      })
      .join(' ')
      .toLowerCase()
  }

  // When filter query changes, preload message history for all chats
  watch(chatFilterQuery, async (q) => {
    if (!q.trim()) return
    for (const chat of chatsStore.chats) {
      if (chatSearchCache.value[chat.id] === undefined) {
        ensureChatSearchable(chat.id)
      }
    }
  })

  // Build a map of chatId → folderName for search badges
  function _buildFolderNameMap(nodes, parentName = null, result = {}) {
    for (const node of nodes) {
      if (node.type === 'folder') {
        _buildFolderNameMap(node.children || [], node.name, result)
      } else {
        result[node.id] = parentName
      }
    }
    return result
  }

  const filteredChats = computed(() => {
    const q = chatFilterQuery.value.trim().toLowerCase()
    const allChats = chatsStore.chats
    if (!q) return allChats
    const folderNameMap = _buildFolderNameMap(chatsStore.chatTree)
    const sorted = [...allChats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    return sorted
      .filter(chat => {
        if (chat.title.toLowerCase().includes(q)) return true
        const cached = chatSearchCache.value[chat.id]
        if (cached && cached.includes(q)) return true
        return false
      })
      .map(chat => ({ ...chat, _folderName: folderNameMap[chat.id] || null }))
  })

  // ── Tree Context Menu (DocsView pattern) ───────────────────────────────────
  const treeCtxMenu = ref({ visible: false, x: 0, y: 0, node: null })
  const treeCtxDialog = ref({ visible: false, type: '', title: '', placeholder: '', value: '', x: 0, y: 0, folderId: null })
  const FOLDER_EMOJI_POOL = ['📁', '📂', '🗂️', '📦', '🧰', '📝', '📚', '🎯', '✨', '🌟', '🚀', '🪄']
  function pickRandomFolderEmoji() {
    return FOLDER_EMOJI_POOL[Math.floor(Math.random() * FOLDER_EMOJI_POOL.length)]
  }
  const folderModal = ref({ visible: false, mode: 'create', initial: { name: '', emoji: pickRandomFolderEmoji() }, parentFolderId: null, editFolderId: null })
  const ctxDialogInputRef = ref(null)
  const treeTooltip = ref({ visible: false, text: '', right: 0, top: 0 })

  function openTreeContextMenu(e, node, action = null) {
    e.preventDefault?.()
    e.stopPropagation?.()
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - 200)
    if (node?.type === 'folder') {
      // Folders are not selectable — context menu only
      treeLastSelected.value = { type: 'folder', id: node.id }
    } else if (node?.type === 'chat') {
      selectedFolderId.value = null
      chatsStore.setActiveChat(node.id)
      treeLastSelected.value = { type: 'chat', id: node.id }
    }
    // If an action was passed directly (from hover button click), run it immediately
    if (action === 'rename' && node?.type === 'folder') {
      openCtxDialog('rename', node.name, node.id, x, y)
      return
    }
    if (action === 'delete' && node?.type === 'folder') {
      closeTreeCtxMenu()
      doDeleteFolder(node.id)
      return
    }
    treeCtxMenu.value = { visible: true, x, y, node }
  }

  function closeTreeCtxMenu() {
    treeCtxMenu.value.visible = false
  }

  function openCtxDialog(type, defaultValue, folderId, x, y) {
    closeTreeCtxMenu()
    if (type === 'newFolder') {
      folderModal.value = { visible: true, mode: 'create', initial: { name: '', emoji: pickRandomFolderEmoji() }, parentFolderId: folderId, editFolderId: null }
      return
    }
    if (type === 'rename') {
      // Find the folder node to get current emoji
      const found = chatsStore.chatTree ? _findFolderNode(folderId, chatsStore.chatTree) : null
      folderModal.value = { visible: true, mode: 'rename', initial: { name: defaultValue || '', emoji: found?.emoji || '📁' }, parentFolderId: null, editFolderId: folderId }
      return
    }
    // newChat — keep old inline dialog path
    treeCtxDialog.value = {
      visible: true, type,
      title: 'New Chat',
      placeholder: 'Chat name',
      value: defaultValue || '',
      x: Math.min(x, window.innerWidth - 240),
      y: Math.min(y, window.innerHeight - 160),
      folderId,
    }
    nextTick(() => {
      ctxDialogInputRef.value?.focus()
      ctxDialogInputRef.value?.select()
    })
  }

  function _findFolderNode(id, nodes) {
    for (const n of nodes) {
      if (n.id === id) return n
      if (n.children?.length) {
        const found = _findFolderNode(id, n.children)
        if (found) return found
      }
    }
    return null
  }

  function cancelCtxDialog() {
    treeCtxDialog.value.visible = false
  }

  async function commitCtxDialog() {
    const { type, value, folderId } = treeCtxDialog.value
    const name = value.trim()
    treeCtxDialog.value.visible = false
    if (!name) return
    // Only newChat remains here; folder ops moved to folderModal
    if (type === 'newChat') {
      // handled elsewhere
    }
  }

  async function onFolderModalConfirm({ name, emoji }) {
    const { mode, parentFolderId, editFolderId } = folderModal.value
    folderModal.value.visible = false
    if (mode === 'create') {
      await chatsStore.createFolder(name, parentFolderId, emoji)
    } else {
      await chatsStore.renameFolder(editFolderId, name, emoji)
    }
  }

  // Context menu action handlers
  function ctxNewChat() {
    const node = treeCtxMenu.value.node
    const folderId = node?.type === 'folder' ? node.id : null
    closeTreeCtxMenu()
    // Open the standard new-chat modal (agent selection) with folder context
    newChat(folderId)
  }

  function ctxNewFolder() {
    const node = treeCtxMenu.value.node
    const parentFolderId = node?.type === 'folder' ? node.id : null
    const pos = { x: treeCtxMenu.value.x, y: treeCtxMenu.value.y }
    closeTreeCtxMenu()
    openCtxDialog('newFolder', '', parentFolderId, pos.x, pos.y)
  }

  function ctxRenameFolder() {
    const node = treeCtxMenu.value.node
    const pos = { x: treeCtxMenu.value.x, y: treeCtxMenu.value.y }
    closeTreeCtxMenu()
    if (node?.type === 'folder') openCtxDialog('rename', node.name, node.id, pos.x, pos.y)
  }

  function ctxDeleteFolder() {
    const node = treeCtxMenu.value.node
    closeTreeCtxMenu()
    if (node?.type === 'folder') doDeleteFolder(node.id)
  }

  const folderNonEmptyAlert = ref(null)

  function doDeleteFolder(folderId) {
    const node = _findFolderNodeById(folderId)
    if (node && node.children && node.children.length > 0) {
      folderNonEmptyAlert.value = node.name
      return
    }
    confirmDeleteTarget.value = { type: 'folder', id: folderId, label: node?.name || 'this folder' }
  }

  function _findFolderNodeById(folderId) {
    function walk(nodes) {
      for (const n of nodes) {
        if (n.id === folderId) return n
        if (n.children?.length) { const r = walk(n.children); if (r) return r }
      }
      return null
    }
    return walk(chatsStore.chatTree)
  }

  // ── Chat Management ────────────────────────────────────────────────────────
  const showNewChatModal = ref(false)
  const newChatName = ref('')
  const newChatIcon = ref('')
  const newChatUserAgentId = ref('')
  const showNewChatIconPicker = ref(false)
  const newChatFolderId = ref(null)
  const newChatNameInputRef = ref(null)
  const newChatAgentIds = ref([])
  const showNewChatAgentPopover = ref(false)
  const newChatAgentSearch = ref('')
  const newChatAgentSearchEl = ref(null)
  const showNewChatUserPopover = ref(false)
  const newChatUserSearch = ref('')
  const newChatUserSearchEl = ref(null)
  const newChatFolderTreeExpanded = ref(new Set())
  const ncpExpandedCatIds = ref(new Set())
  const nupExpandedCatIds = ref(new Set())

  const NEW_CHAT_ICON_POOL = ['💬', '✨', '🚀', '🎯', '🧠', '📌', '🌟', '🪄', '🗂️', '📝', '🎉', '🔥']

  function pickRandomNewChatIcon() {
    return NEW_CHAT_ICON_POOL[Math.floor(Math.random() * NEW_CHAT_ICON_POOL.length)]
  }

  function toggleNcpCat(id) {
    const s = new Set(ncpExpandedCatIds.value)
    s.has(id) ? s.delete(id) : s.add(id)
    ncpExpandedCatIds.value = s
  }

  function toggleNupCat(id) {
    const s = new Set(nupExpandedCatIds.value)
    s.has(id) ? s.delete(id) : s.add(id)
    nupExpandedCatIds.value = s
  }

  function toggleNewChatFolderExpand(folderId) {
    const s = newChatFolderTreeExpanded.value
    if (s.has(folderId)) s.delete(folderId)
    else s.add(folderId)
    // Trigger reactivity
    newChatFolderTreeExpanded.value = new Set(s)
  }

  const filteredNewChatAgents = computed(() => {
    const q = newChatAgentSearch.value.toLowerCase().trim()
    const list = sortedSystemAgents.value
    if (!q) return list
    return list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    )
  })

  const filteredNewChatUsers = computed(() => {
    const q = newChatUserSearch.value.toLowerCase().trim()
    const list = sortedUserAgents.value
    if (!q) return list
    return list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    )
  })

  const activeNewChatUserAgent = computed(() => {
    const id = newChatUserAgentId.value || agentsStore.defaultUserAgent?.id
    return id ? agentsStore.getAgentById(id) : null
  })

  const effectiveNewChatUserAgentId = computed(() =>
    newChatUserAgentId.value || agentsStore.defaultUserAgent?.id || ''
  )

  const displayedSystemPersonaAgents = computed(() => {
    if (newChatAgentIds.value.length > 0) {
      return newChatAgentIds.value.map(id => agentsStore.getAgentById(id)).filter(Boolean)
    }
    const fallbackId = agentsStore.defaultSystemAgent?.id
    const fallback = fallbackId ? agentsStore.getAgentById(fallbackId) : null
    return fallback ? [fallback] : []
  })

  watch(showNewChatAgentPopover, (open) => {
    if (open) {
      newChatAgentSearch.value = ''
      ncpExpandedCatIds.value = new Set()
      nextTick(() => newChatAgentSearchEl.value?.focus())
    }
  })

  watch(showNewChatUserPopover, (open) => {
    if (open) {
      newChatUserSearch.value = ''
      nupExpandedCatIds.value = new Set()
      nextTick(() => newChatUserSearchEl.value?.focus())
    }
  })

  function onNewChatIconSelect(emoji) {
    newChatIcon.value = emoji || ''
    showNewChatIconPicker.value = false
  }

  function selectNewChatUserAgent(agentId) {
    const defaultId = agentsStore.defaultUserAgent?.id || ''
    newChatUserAgentId.value = agentId === defaultId ? '' : agentId
  }

  function isNewChatUserSelected(agentId) {
    return effectiveNewChatUserAgentId.value === agentId
  }

  function clearNewChatUserSelection() {
    newChatUserAgentId.value = ''
  }

  function removeNewChatSystemAgent(agentId) {
    const idx = newChatAgentIds.value.indexOf(agentId)
    if (idx !== -1) newChatAgentIds.value.splice(idx, 1)
  }

  function toggleNewChatAgent(agentId) {
    const idx = newChatAgentIds.value.indexOf(agentId)
    if (idx >= 0) {
      newChatAgentIds.value.splice(idx, 1)
    } else {
      newChatAgentIds.value.push(agentId)
    }
  }

  // folderId: null = root, undefined = use active folder context
  function newChat(folderId) {
    const resolvedFolder = folderId !== undefined ? folderId : (chatsStore.activeFolderId?.value ?? null)
    showNewChatModal.value = true
    newChatName.value = ''
    newChatIcon.value = pickRandomNewChatIcon()
    newChatUserAgentId.value = ''
    showNewChatIconPicker.value = false
    newChatFolderId.value = resolvedFolder
    newChatAgentIds.value = []
    showNewChatAgentPopover.value = false
    newChatAgentSearch.value = ''
    showNewChatUserPopover.value = false
    newChatUserSearch.value = ''
    // Pre-expand ancestors of pre-selected folder
    newChatFolderTreeExpanded.value = new Set(getAncestorFolderIds(resolvedFolder, chatsStore.chatTree))
    nextTick(() => newChatNameInputRef.value?.focus())
  }

  function getAncestorFolderIds(targetId, nodes, path = []) {
    if (!targetId) return []
    for (const n of nodes) {
      if (n.type !== 'folder') continue
      if (n.id === targetId) return path.map(p => p.id)
      if (n.children?.length) {
        const found = getAncestorFolderIds(targetId, n.children, [...path, n])
        if (found !== null) return found
      }
    }
    return null
  }

  async function confirmNewChat() {
    showNewChatModal.value = false
    const typedName = newChatName.value.trim()
    const title = typedName || t('chats.newChat')
    let selectedIds = newChatAgentIds.value
    if (selectedIds.length === 0) {
      const def = agentsStore.defaultSystemAgent
      selectedIds = def ? [def.id] : []
    }
    const chatIcon = newChatIcon.value.trim()
    const userAgentId = newChatUserAgentId.value || null
    const agentCfg = selectedIds.length > 0 ? [...selectedIds] : null
    const folderId = newChatFolderId.value
    await chatsStore.createChat(title, agentCfg, folderId, {
      icon: chatIcon,
      userAgentId,
      autoTitleEligible: !typedName,
    })
    // Expand the target folder and all its ancestors so the new chat is visible
    if (folderId) {
      const ancestors = getAncestorFolderIds(folderId, chatsStore.chatTree) || []
      for (const aid of ancestors) chatsStore.expandFolder(aid)
      chatsStore.expandFolder(folderId)
    }
    nextTick(() => mentionInputRef?.value?.focus())
  }

  function cancelNewChat() {
    showNewChatModal.value = false
    newChatName.value = ''
    newChatIcon.value = ''
    newChatUserAgentId.value = ''
    showNewChatIconPicker.value = false
    newChatFolderId.value = null
    newChatAgentIds.value = []
    showNewChatAgentPopover.value = false
    newChatAgentSearch.value = ''
    showNewChatUserPopover.value = false
    newChatUserSearch.value = ''
  }

  // ── Delete Confirm ─────────────────────────────────────────────────────────
  const confirmDeleteTarget = ref(null) // { type: 'chat'|'groupAgent'|'message'|'folder', id, pid?, label }

  function requestDeleteChat(id) {
    if (voiceStore.isCallActive && voiceStore.activeChatId === id) return
    const chat = chatsStore.chats.find(c => c.id === id)
    confirmDeleteTarget.value = {
      type: 'chat',
      id,
      label: chat?.title || 'this chat',
    }
  }

  function requestRemoveGroupAgent(chatId, pid) {
    const agent = agentsStore.getAgentById(pid)
    confirmDeleteTarget.value = {
      type: 'groupAgent',
      id: chatId,
      pid,
      label: agent?.name || 'this agent',
    }
  }

  async function executeConfirmedDelete() {
    if (!confirmDeleteTarget.value) return
    const target = confirmDeleteTarget.value
    confirmDeleteTarget.value = null

    if (target.type === 'chat') {
      await chatsStore.removeChat(target.id)
    } else if (target.type === 'groupAgent') {
      chatsStore.removeGroupAgent(target.id, target.pid)
    } else if (target.type === 'message') {
      await chatsStore.deleteMessage(target.id, target.msgId)
    } else if (target.type === 'folder') {
      await chatsStore.deleteFolder(target.id)
    }
  }

  return {
    // Sorted agents
    sortedSystemAgents,
    sortedUserAgents,
    // Drag & drop
    draggingNodeId,
    treeDropTarget,
    rootDragOver,
    onTreeDrop,
    onRootDragOver,
    onRootDragLeave,
    onRootDrop,
    // Sidebar
    sidebarWidth,
    chatHeaderRef,
    chatSidebarCollapsed,
    treeLastSelected,
    selectedFolderId,
    rootExpanded,
    isResizing,
    anyFolderExpanded,
    hasFolders,
    startResize,
    // Rename
    renameInput,
    showRenameModal,
    editingChatId,
    editingTitle,
    editingIcon,
    showRenameIconPicker,
    renameComposing,
    startRename,
    confirmRename,
    cancelRename,
    onRenameKeydown,
    onRenameIconSelect,
    // Filter
    chatFilterQuery,
    chatSearchCache,
    filteredChats,
    ensureChatSearchable,
    // Tree context menu
    treeCtxMenu,
    treeCtxDialog,
    folderModal,
    ctxDialogInputRef,
    treeTooltip,
    openTreeContextMenu,
    closeTreeCtxMenu,
    openCtxDialog,
    cancelCtxDialog,
    commitCtxDialog,
    onFolderModalConfirm,
    ctxNewChat,
    ctxNewFolder,
    ctxRenameFolder,
    ctxDeleteFolder,
    doDeleteFolder,
    folderNonEmptyAlert,
    // New chat modal
    showNewChatModal,
    newChatName,
    newChatIcon,
    newChatUserAgentId,
    showNewChatIconPicker,
    newChatFolderId,
    newChatNameInputRef,
    newChatAgentIds,
    showNewChatAgentPopover,
    newChatAgentSearch,
    newChatAgentSearchEl,
    showNewChatUserPopover,
    newChatUserSearch,
    newChatUserSearchEl,
    newChatFolderTreeExpanded,
    ncpExpandedCatIds,
    nupExpandedCatIds,
    filteredNewChatAgents,
    filteredNewChatUsers,
    activeNewChatUserAgent,
    effectiveNewChatUserAgentId,
    displayedSystemPersonaAgents,
    onNewChatIconSelect,
    selectNewChatUserAgent,
    isNewChatUserSelected,
    clearNewChatUserSelection,
    removeNewChatSystemAgent,
    toggleNewChatAgent,
    toggleNcpCat,
    toggleNupCat,
    toggleNewChatFolderExpand,
    newChat,
    confirmNewChat,
    cancelNewChat,
    // Delete confirm
    confirmDeleteTarget,
    requestDeleteChat,
    requestRemoveGroupAgent,
    executeConfirmedDelete,
  }
}
