import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { storage } from '../services/storage'

export const useChatsStore = defineStore('chats', () => {
  // chatTree holds ChatTreeNode[] — folders and chats in a nested structure
  const chatTree = ref([])
  const activeChatId = ref(null)
  const activeFolderId = ref(null)  // folder context for new chats
  const isLoading = ref(false)
  const unreadChatIds = ref(new Set())
  const completedChatIds = ref(new Set())
  const pendingPermissionChatIds = ref(new Set())

  // Minibar quick-send signal: set by MinibarOverlay, consumed by ChatsView
  const pendingMinibarSend = ref(null) // { text, chatId } | null

  // UI chunk callback — set by ChatsView when mounted, cleared on unmount
  let _uiChunkCallback = null
  // Task chunk callback — set by TaskEngineView when a plan is running manually
  let _taskChunkCallback = null

  // ── Tree helpers ──────────────────────────────────────────────────────────

  // Recursively flatten tree to get only chat nodes (for backward compat)
  function flattenChats(nodes) {
    const result = []
    for (const node of nodes) {
      if (node.type === 'folder') {
        result.push(...flattenChats(node.children || []))
      } else {
        result.push(node)
      }
    }
    return result
  }

  // Backward-compat flat list — all callers using chatsStore.chats continue working
  const chats = computed(() => flattenChats(chatTree.value))

  const activeChat = computed(() => chats.value.find(c => c.id === activeChatId.value) || null)

  const defaultContextMetrics = () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, maxTokens: 200000, percentage: 0, compactionCount: 0, voiceInputTokens: 0, voiceOutputTokens: 0, whisperCalls: 0, whisperSecs: 0 })

  // ── Debounce timers ────────────────────────────────────────────────────────
  const _chatTimers = {}      // { [chatId]: timeoutId }
  let _indexTimer = null
  const DEBOUNCE_MS = 300

  function backfillChat(chat) {
    chat.isRunning = false
    chat.isThinking = false
    chat.isCallingTool = false
    chat.currentToolCall = null
    chat.isLoadingMessages = false
    chat.contextMetrics = chat.contextMetrics || defaultContextMetrics()
    if (chat.systemPersonaId === undefined) chat.systemPersonaId = null
    if (chat.userPersonaId === undefined) chat.userPersonaId = null
    if (chat.provider === undefined) chat.provider = null
    if (chat.model === undefined) chat.model = null
    if (chat.groupPersonaIds === undefined) chat.groupPersonaIds = []
    if (chat.isGroupChat === undefined) chat.isGroupChat = false
    if (chat.groupPersonaOverrides === undefined) chat.groupPersonaOverrides = {}
    if (chat.workingPath === undefined) chat.workingPath = null
    if (chat.enabledToolIds === undefined) chat.enabledToolIds = null    // null = "use defaults"
    if (chat.enabledMcpIds === undefined) chat.enabledMcpIds = null      // null = "use defaults"
    if (chat.permissionMode === undefined) chat.permissionMode = 'inherit'
    if (chat.permissionMode === 'sandbox') chat.permissionMode = 'chat_only' // migrate old value
    if (chat.chatAllowList === undefined) chat.chatAllowList = []
    if (chat.chatDangerOverrides === undefined) chat.chatDangerOverrides = []
    if (chat.codingMode === undefined) chat.codingMode = false
    if (chat.maxPersonaRounds === undefined) chat.maxPersonaRounds = null  // null = use default (10)
    if (chat.codingProvider === undefined) chat.codingProvider = 'claude-code'
    if (chat.personaModelOverrides === undefined) chat.personaModelOverrides = {}
    if (chat.usage === undefined) chat.usage = null  // null = no usage data yet
    // messages === null means "not loaded yet" (lazy)
    if (chat.messages) {
      for (const msg of chat.messages) {
        if (msg.streaming) msg.streaming = false
      }
    }
  }

  // Recursively backfill runtime fields for all nodes in the tree
  function wrapTree(nodes) {
    return (nodes || []).map(node => {
      if (node.type === 'folder') {
        return {
          ...node,
          children: wrapTree(node.children || []),
        }
      } else {
        // chat node
        const chat = { ...node, messages: null }
        backfillChat(chat)
        return chat
      }
    })
  }

  // Collect all chat IDs that are nested inside folders (at any depth)
  function _collectFolderChatIds(nodes, ids = new Set()) {
    for (const node of nodes) {
      if (node.type === 'folder') {
        for (const child of node.children || []) {
          if (child.type !== 'folder') ids.add(child.id)
          else _collectFolderChatIds([child], ids)
        }
      }
    }
    return ids
  }

  // Remove root-level chat duplicates that also appear inside folders
  function _deduplicateTree(nodes) {
    const nestedIds = _collectFolderChatIds(nodes)
    return nodes.filter(n => !(n.type !== 'folder' && nestedIds.has(n.id)))
  }

  // ── Lazy loading ───────────────────────────────────────────────────────────
  const _loadingPromises = {}  // { [chatId]: Promise } — dedup concurrent loads

  async function ensureMessages(chatId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat || chat.messages !== null) return
    // Dedup: if already loading, return the existing promise
    if (_loadingPromises[chatId]) return _loadingPromises[chatId]

    chat.isLoadingMessages = true
    _loadingPromises[chatId] = (async () => {
      try {
        const full = await storage.getChat(chatId)
        // Re-check: another path may have set messages while we were loading
        if (chat.messages !== null) return
        if (full && full.messages) {
          chat.messages = full.messages
          for (const msg of chat.messages) {
            if (msg.streaming) msg.streaming = false
          }
          if (full.segmentCount) {
            chat.segmentCount = full.segmentCount
            chat._nextSegToLoad = full.segmentCount
          }
        } else {
          chat.messages = []
        }
      } finally {
        chat.isLoadingMessages = false
        delete _loadingPromises[chatId]
      }
    })()
    return _loadingPromises[chatId]
  }

  async function loadOlderSegments(chatId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat || chat.messages === null) return false
    if (!chat.segmentCount || chat.segmentCount < 1) return false
    if (chat._nextSegToLoad === undefined) chat._nextSegToLoad = chat.segmentCount
    if (chat._nextSegToLoad < 1) return false  // all segments already loaded

    const toSeg = chat._nextSegToLoad
    const fromSeg = toSeg
    const olderMessages = await storage.getChatSegments({ chatId, fromSeg, toSeg })
    if (!olderMessages || olderMessages.length === 0) {
      chat._nextSegToLoad = toSeg - 1
      return false
    }
    // Prepend older messages to the front of the in-memory array
    chat.messages = [...olderMessages, ...chat.messages]
    chat._nextSegToLoad = toSeg - 1
    return true
  }

  function hasOlderSegments(chatId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return false
    const nextSeg = chat._nextSegToLoad !== undefined ? chat._nextSegToLoad : (chat.segmentCount || 0)
    return nextSeg >= 1
  }

  async function loadChats() {
    isLoading.value = true
    try {
      const index = await storage.getChatIndex()
      if (index && index.length > 0) {
        // Migration: if first item has no 'type', it's the old flat format
        if (index[0]?.type === undefined) {
          // Old flat format — wrap each entry as a chat node
          chatTree.value = index.map(meta => {
            const chat = { type: 'chat', ...meta, messages: null }
            backfillChat(chat)
            return chat
          })
        } else {
          chatTree.value = _deduplicateTree(wrapTree(index))
        }
        // Find first chat to set active
        const firstChat = flattenChats(chatTree.value)[0]
        if (firstChat) {
          activeChatId.value = firstChat.id
          ensureMessages(firstChat.id)  // fire-and-forget, non-blocking
        }
      } else {
        await createChat('New Chat')
      }
    } finally {
      isLoading.value = false
    }
  }

  // ── Find node helpers ─────────────────────────────────────────────────────

  // Find a node by id in the tree, returns { node, parent (array), index }
  function _findNode(id, nodes, parent = null) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (node.id === id) return { node, parent: nodes, index: i }
      if (node.type === 'folder') {
        const found = _findNode(id, node.children || [], nodes)
        if (found) return found
      }
    }
    return null
  }

  // Find the parent array for a given folderId (null = root)
  function _getTargetChildren(folderId) {
    if (!folderId) return chatTree.value
    const found = _findNode(folderId, chatTree.value)
    if (found && found.node.type === 'folder') return found.node.children
    return chatTree.value
  }

  // Get the folder id that contains a node (null = root)
  function _getParentFolderId(nodeId) {
    function search(nodes, parentFolderId) {
      for (const node of nodes) {
        if (node.id === nodeId) return parentFolderId
        if (node.type === 'folder') {
          const found = search(node.children || [], node.id)
          if (found !== undefined) return found
        }
      }
      return undefined
    }
    return search(chatTree.value, null)
  }

  // Returns the ancestor folder path for a chat as a string, e.g. "A/B"
  // Returns "" if the chat is at the root level.
  function getChatFolderPath(chatId) {
    function search(nodes, ancestors) {
      for (const node of nodes) {
        if (node.type === 'chat' && node.id === chatId) return ancestors
        if (node.type === 'folder') {
          const found = search(node.children || [], [...ancestors, node.name])
          if (found) return found
        }
      }
      return null
    }
    const parts = search(chatTree.value, [])
    if (!parts) return ''
    return parts.join('/')
  }

  async function createChat(title = 'New Chat', personaConfig = null, folderId = null) {
    const chat = {
      type: 'chat',
      id: uuidv4(),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isRunning: false,
      isThinking: false,
      isCallingTool: false,
      currentToolCall: null,
      contextMetrics: defaultContextMetrics(),
      systemPersonaId: null,
      userPersonaId: null,
      provider: null,
      model: null,
      isGroupChat: false,
      groupPersonaIds: [],
      groupPersonaOverrides: {},
      workingPath: null,
      enabledToolIds: null,
      enabledMcpIds: null,
      codingMode: false,
      codingProvider: 'claude-code',
      maxOutputTokens: null,    // null = use global default from config
      personaModelOverrides: {},
    }
    if (personaConfig && personaConfig.length === 1) {
      chat.systemPersonaId = personaConfig[0]
    } else if (personaConfig && personaConfig.length >= 2) {
      chat.isGroupChat = true
      chat.groupPersonaIds = [...personaConfig]
    }
    // Insert at top of target folder (or active folder if no explicit folderId)
    const targetFolderId = folderId !== undefined ? folderId : activeFolderId.value
    const target = _getTargetChildren(targetFolderId)
    target.unshift(chat)
    activeChatId.value = chat.id
    await persistChat(chat.id)
    await persistIndex()
    return chat
  }

  async function createChatFromHistory(sourceChatId, title = 'New Chat', personaOverride = null) {
    const source = chats.value.find(c => c.id === sourceChatId)
    if (!source) return createChat(title)
    // Ensure messages are loaded
    await ensureMessages(sourceChatId)
    // Deep-copy messages, assign new IDs, strip streaming flags
    const copiedMessages = (source.messages || []).map(m => {
      const copy = JSON.parse(JSON.stringify(m))
      copy.id = uuidv4()
      copy.streaming = false
      delete copy.streamingStartedAt
      delete copy.durationMs
      return copy
    })
    const chat = {
      type: 'chat',
      id: uuidv4(),
      title,
      messages: copiedMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isRunning: false,
      isThinking: false,
      isCallingTool: false,
      currentToolCall: null,
      isLoadingMessages: false,
      contextMetrics: defaultContextMetrics(),
      systemPersonaId: source.systemPersonaId,
      userPersonaId: source.userPersonaId,
      provider: source.provider,
      model: source.model,
      isGroupChat: source.isGroupChat,
      groupPersonaIds: [...(source.groupPersonaIds || [])],
      groupPersonaOverrides: JSON.parse(JSON.stringify(source.groupPersonaOverrides || {})),
      workingPath: source.workingPath || null,
      enabledToolIds: source.enabledToolIds ? [...source.enabledToolIds] : null,
      enabledMcpIds: source.enabledMcpIds ? [...source.enabledMcpIds] : null,
      codingMode: source.codingMode || false,
      codingProvider: source.codingProvider || 'claude-code',
      personaModelOverrides: {},  // overrides are not copied — intentional
    }
    // Override personas if provided
    if (personaOverride && personaOverride.length > 0) {
      if (personaOverride.length === 1) {
        chat.systemPersonaId = personaOverride[0]
        chat.isGroupChat = false
        chat.groupPersonaIds = []
        chat.groupPersonaOverrides = {}
      } else {
        chat.isGroupChat = true
        chat.groupPersonaIds = [...personaOverride]
        chat.systemPersonaId = null
        chat.groupPersonaOverrides = {}
      }
    }
    // Insert at root (copy from history goes to root)
    chatTree.value.unshift(chat)
    activeChatId.value = chat.id
    await persistChat(chat.id)
    await persistIndex()
    return chat
  }

  async function removeChat(id) {
    const found = _findNode(id, chatTree.value)
    if (!found) return
    found.parent.splice(found.index, 1)
    // Cancel any pending debounce for this chat
    if (_chatTimers[id]) { clearTimeout(_chatTimers[id]); delete _chatTimers[id] }
    if (activeChatId.value === id) {
      const remaining = flattenChats(chatTree.value)
      activeChatId.value = remaining[0]?.id || null
      if (!activeChatId.value) await createChat()
    }
    await storage.deleteChat(id)
    await persistIndex()
  }

  async function renameChat(id, title) {
    const chat = chats.value.find(c => c.id === id)
    if (chat) {
      chat.title = title
      chat.updatedAt = Date.now()
      await persistIndex()
    }
  }

  async function setActiveChat(id) {
    activeChatId.value = id
    // Update active folder context based on which folder the chat is in
    const parentFolderId = _getParentFolderId(id)
    if (parentFolderId !== undefined) activeFolderId.value = parentFolderId
    ensureMessages(id)  // fire-and-forget: UI shows loading indicator, never blocks
  }

  function clearActiveChat() {
    activeChatId.value = null
  }

  // ── Folder CRUD ───────────────────────────────────────────────────────────

  async function createFolder(name, parentFolderId = null, emoji = '📁') {
    const folder = {
      type: 'folder',
      id: uuidv4(),
      name: name || 'New Folder',
      emoji,
      expanded: true,
      children: [],
    }
    const target = _getTargetChildren(parentFolderId)
    target.unshift(folder)
    await persistIndex()
    return folder
  }

  async function renameFolder(folderId, newName, emoji = null) {
    const found = _findNode(folderId, chatTree.value)
    if (found && found.node.type === 'folder') {
      found.node.name = newName
      if (emoji !== null) found.node.emoji = emoji
      await persistIndex()
    }
  }

  // Returns false if folder is not empty (block delete)
  async function deleteFolder(folderId) {
    const found = _findNode(folderId, chatTree.value)
    if (!found || found.node.type !== 'folder') return false
    const folder = found.node
    if (folder.children && folder.children.length > 0) return false
    found.parent.splice(found.index, 1)
    // If active folder was this one, reset
    if (activeFolderId.value === folderId) activeFolderId.value = null
    await persistIndex()
    return true
  }

  function toggleFolder(folderId) {
    const found = _findNode(folderId, chatTree.value)
    if (found && found.node.type === 'folder') {
      found.node.expanded = !found.node.expanded
      // Don't persist for every expand/collapse — debounce it
      debouncedPersistIndex()
    }
  }

  function expandFolder(folderId) {
    const found = _findNode(folderId, chatTree.value)
    if (found && found.node.type === 'folder' && !found.node.expanded) {
      found.node.expanded = true
      debouncedPersistIndex()
    }
  }

  function setAllFoldersExpanded(expanded) {
    function walk(nodes) {
      for (const node of nodes) {
        if (node.type === 'folder') {
          node.expanded = expanded
          if (node.children?.length) walk(node.children)
        }
      }
    }
    walk(chatTree.value)
    debouncedPersistIndex()
  }

  // Move a node (chat or folder) to a new parent folder (null = root), inserting at top
  async function moveNodeToFolder(nodeId, targetFolderId) {
    const found = _findNode(nodeId, chatTree.value)
    if (!found) return
    // Prevent moving a folder into itself or its descendants
    if (found.node.type === 'folder') {
      const targetFound = _findNode(targetFolderId, chatTree.value)
      if (targetFound) {
        // Check if targetFolderId is inside nodeId's subtree
        function isDescendant(folder, id) {
          for (const child of (folder.children || [])) {
            if (child.id === id) return true
            if (child.type === 'folder' && isDescendant(child, id)) return true
          }
          return false
        }
        if (targetFolderId === nodeId || isDescendant(found.node, targetFolderId)) return
      }
    }
    // Remove from current location
    const node = found.parent.splice(found.index, 1)[0]
    // Insert into target
    const target = _getTargetChildren(targetFolderId)
    target.unshift(node)
    await persistIndex()
  }

  // Reorder a node relative to another node (before/after/inside)
  async function reorderNode(nodeId, targetId, position) {
    const found = _findNode(nodeId, chatTree.value)
    if (!found) return
    const node = found.parent.splice(found.index, 1)[0]

    if (position === 'inside') {
      const targetFound = _findNode(targetId, chatTree.value)
      if (targetFound && targetFound.node.type === 'folder') {
        targetFound.node.children.unshift(node)
      } else {
        // Fallback: put back where we took it
        found.parent.splice(found.index, 0, node)
        return
      }
    } else {
      // before or after
      const targetFound = _findNode(targetId, chatTree.value)
      if (!targetFound) {
        found.parent.splice(found.index, 0, node)
        return
      }
      let insertIdx = targetFound.index
      if (position === 'after') insertIdx++
      targetFound.parent.splice(insertIdx, 0, node)
    }
    await persistIndex()
  }

  // Legacy reorderChats — now works on root-level chat nodes
  async function reorderChats(fromIndex, toIndex) {
    if (fromIndex === toIndex) return
    const flatRoot = chatTree.value.filter(n => n.type === 'chat')
    // This is a best-effort for root-level chats only; tree drag handles the rest
    const item = chatTree.value.splice(fromIndex, 1)[0]
    chatTree.value.splice(toIndex, 0, item)
    await persistIndex()
  }

  // ── Message operations (unchanged) ────────────────────────────────────────

  async function addMessage(chatId, message) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (chat.messages === null) await ensureMessages(chatId)
    chat.messages.push({ timestamp: Date.now(), ...message, id: message.id || uuidv4() })
    chat.updatedAt = Date.now()
    // Auto-title from first user message
    if (chat.messages.length === 1 && message.role === 'user' && chat.title === 'New Chat') {
      chat.title = message.content.substring(0, 40) + (message.content.length > 40 ? '…' : '')
      debouncedPersistIndex()
    }
    debouncedPersistChat(chatId)
  }

  async function updateLastAssistantMessage(chatId, content) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (chat.messages === null) await ensureMessages(chatId)
    const last = [...chat.messages].reverse().find(m => m.role === 'assistant')
    if (last) {
      last.content = content
      last.streaming = false
    }
    debouncedPersistChat(chatId)
  }

  async function setChatPersona(chatId, type, agentId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (type === 'system') chat.systemPersonaId = agentId
    else if (type === 'user') chat.userPersonaId = agentId
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function setChatProvider(chatId, provider) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.provider = provider
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function setChatModel(chatId, model) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.model = model
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  function setChatPersonaModelOverride(chatId, agentId, providerId, modelId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (!chat.personaModelOverrides) chat.personaModelOverrides = {}
    if (providerId === null && modelId === null) {
      delete chat.personaModelOverrides[agentId]
    } else {
      chat.personaModelOverrides[agentId] = { provider: providerId, model: modelId }
    }
    chat.updatedAt = Date.now()
    debouncedPersistChat(chatId)
  }

  async function setGroupPersonas(chatId, personaIds) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.groupPersonaIds = personaIds
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function toggleGroupMode(chatId, enabled) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.isGroupChat = enabled
    if (enabled) {
      if (chat.systemPersonaId && !chat.groupPersonaIds.includes(chat.systemPersonaId)) {
        chat.groupPersonaIds.unshift(chat.systemPersonaId)
      }
    } else {
      if (chat.groupPersonaIds.length > 0) {
        chat.systemPersonaId = chat.groupPersonaIds[0]
      }
      chat.groupPersonaIds = []
      chat.groupPersonaOverrides = {}
    }
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function setGroupPersonaOverride(chatId, agentId, overrides) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (!chat.groupPersonaOverrides) chat.groupPersonaOverrides = {}
    chat.groupPersonaOverrides[agentId] = { ...overrides }
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function removeGroupPersona(chatId, agentId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.groupPersonaIds = chat.groupPersonaIds.filter(id => id !== agentId)
    if (chat.groupPersonaOverrides) delete chat.groupPersonaOverrides[agentId]
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function addGroupPersona(chatId, agentId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (!chat.groupPersonaIds.includes(agentId)) {
      chat.groupPersonaIds.push(agentId)
    }
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function setChatSettings(chatId, settings) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if ('workingPath' in settings) chat.workingPath = settings.workingPath
    if ('codingMode' in settings) chat.codingMode = settings.codingMode
    if ('codingProvider' in settings) chat.codingProvider = settings.codingProvider
    if ('enabledToolIds' in settings) chat.enabledToolIds = settings.enabledToolIds
    if ('enabledMcpIds' in settings) chat.enabledMcpIds = settings.enabledMcpIds
    if ('permissionMode' in settings) chat.permissionMode = settings.permissionMode
    if ('chatAllowList' in settings) chat.chatAllowList = settings.chatAllowList
    if ('chatDangerOverrides' in settings) chat.chatDangerOverrides = settings.chatDangerOverrides
    if ('maxPersonaRounds' in settings) chat.maxPersonaRounds = settings.maxPersonaRounds
    chat.updatedAt = Date.now()
    // persistChat → store:save-chat already updates the index, no separate persistIndex needed
    await persistChat(chatId)
  }

  async function deleteMessage(chatId, messageId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat || !chat.messages) return
    const idx = chat.messages.findIndex(m => m.id === messageId)
    if (idx === -1) return
    chat.messages.splice(idx, 1)
    chat.updatedAt = Date.now()
    await persistChat(chatId)
  }

  async function clearChat(chatId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (chat) {
      chat.messages = []
      await persistChat(chatId)
    }
  }

  // ── Persistence helpers ────────────────────────────────────────────────────

  const TOOL_OUTPUT_TRUNCATE_CHARS = 50000

  function _truncateToolOutputs(messages) {
    if (!messages) return messages
    for (const msg of messages) {
      if (!msg.segments) continue
      for (const seg of msg.segments) {
        if (seg.type === 'tool' && typeof seg.output === 'string' && seg.output.length > TOOL_OUTPUT_TRUNCATE_CHARS) {
          const original = seg.output.length
          seg.output = seg.output.slice(0, TOOL_OUTPUT_TRUNCATE_CHARS) +
            `\n\n[output truncated — original length: ${original.toLocaleString()} chars]`
        }
      }
    }
    return messages
  }

  function _serializeChat(chatId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return null
    // JSON round-trip strips Vue reactive Proxy wrappers
    const raw = JSON.parse(JSON.stringify(chat))
    // If messages were never loaded (null), persist without them so we don't
    // overwrite the existing per-chat file with an empty messages array.
    if (chat.messages === null) {
      delete raw.messages
      // For an index-only chat (messages not loaded), we shouldn't write the
      // per-chat file — only the index. Return null to signal that.
      return null
    }
    raw.messages = _truncateToolOutputs(raw.messages)
    return raw
  }

  async function persistChat(chatId) {
    // Cancel any pending debounce for this chat
    if (_chatTimers[chatId]) { clearTimeout(_chatTimers[chatId]); delete _chatTimers[chatId] }
    const raw = _serializeChat(chatId)
    if (raw) await storage.saveChat(raw)
  }

  function debouncedPersistChat(chatId) {
    if (_chatTimers[chatId]) clearTimeout(_chatTimers[chatId])
    _chatTimers[chatId] = setTimeout(() => {
      delete _chatTimers[chatId]
      const raw = _serializeChat(chatId)
      if (raw) storage.saveChat(raw)
    }, DEBOUNCE_MS)
  }

  // Serialize the tree for the index file — strips runtime fields from chats
  function _serializeTree(nodes) {
    return nodes.map(node => {
      if (node.type === 'folder') {
        return {
          type: 'folder',
          id: node.id,
          name: node.name,
          emoji: node.emoji || '📁',
          expanded: node.expanded,
          children: _serializeTree(node.children || []),
        }
      } else {
        // chat node — strip messages and runtime flags
        const { messages, isRunning, isThinking, isLoadingMessages, contextMetrics, ...meta } = JSON.parse(JSON.stringify(node))
        return meta
      }
    })
  }

  async function persistIndex() {
    if (_indexTimer) { clearTimeout(_indexTimer); _indexTimer = null }
    const tree = _serializeTree(chatTree.value)
    await storage.saveChatIndex(tree)
  }

  function debouncedPersistIndex() {
    if (_indexTimer) clearTimeout(_indexTimer)
    _indexTimer = setTimeout(() => {
      _indexTimer = null
      const tree = _serializeTree(chatTree.value)
      storage.saveChatIndex(tree)
    }, DEBOUNCE_MS)
  }

  // Backward-compat: full persist (used only by external callers if any)
  async function persist() {
    await persistIndex()
    // Persist all chats that have messages loaded
    for (const chat of chats.value) {
      if (chat.messages !== null) {
        await persistChat(chat.id)
      }
    }
  }

  // ── Chunk listener (persistent, lives for the app's lifetime) ────────────
  function setUiChunkCallback(cb) { _uiChunkCallback = cb }
  function clearUiChunkCallback() { _uiChunkCallback = null }
  function setTaskChunkCallback(cb) { _taskChunkCallback = cb }
  function clearTaskChunkCallback() { _taskChunkCallback = null }

  function initChunkListener() {
    if (!window.electronAPI?.onAgentChunk) return
    window.electronAPI.onAgentChunk(({ chatId, chunk }) => {
      // Task chunks — route to task callback and skip all chat logic
      if (chatId.startsWith('task:') && _taskChunkCallback) {
        _taskChunkCallback(chatId, chunk)
        return
      }

      // Always update volatile tool-call state — needed by minibar regardless of
      // whether ChatsView is mounted and handling the UI callback
      if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
        const _chat = chats.value.find(c => c.id === chatId)
        if (_chat) {
          if (chunk.type === 'tool_call') {
            _chat.isCallingTool = true
            _chat.currentToolCall = chunk.name || null
          } else {
            _chat.isCallingTool = false
            _chat.currentToolCall = null
          }
        }
      }

      // If ChatsView is mounted and has a UI callback, let it handle everything
      // (it manages segments, scroll, timers, AND updates message content)
      if (_uiChunkCallback) {
        _uiChunkCallback(chatId, chunk)
      } else {
        // ChatsView is NOT mounted — store handles data persistence
        _applyChunk(chatId, chunk)
      }

      // Mark unread if not the active chat
      if (chatId !== activeChatId.value) {
        const s = new Set(unreadChatIds.value)
        s.add(chatId)
        unreadChatIds.value = s
      }
    })
  }

  function _applyChunk(chatId, chunk) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat || chat.messages === null) return

    // Group persona chunks (tagged with personaId) are handled exclusively by
    // ChatsView.handleChunk via the perChatStreamingMsgId keying system.
    // The store must NOT touch them — doing so causes duplicate content writes,
    // race conditions with the streaming flag, and merged/shared bubbles.
    if (chunk.personaId) {
      // Only propagate state flags that don't mutate messages
      if (chunk.type === 'thinking_start') chat.isThinking = true
      else if (chunk.type === 'text') chat.isThinking = false
      else if (chunk.type === 'context_update' && chunk.metrics) chat.contextMetrics = { ...chunk.metrics }
      debouncedPersistChat(chatId)
      return
    }

    if (chunk.type === 'text') {
      chat.isThinking = false
      const msg = [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
      if (msg) {
        msg.content = (msg.content || '') + chunk.text
        // Keep a minimal segments array so MessageRenderer can display the text
        if (!msg.segments || msg.segments.length === 0) {
          msg.segments = [{ type: 'text', content: msg.content }]
        } else if (msg.segments[msg.segments.length - 1].type === 'text') {
          msg.segments[msg.segments.length - 1].content = msg.content
        } else {
          msg.segments.push({ type: 'text', content: chunk.text })
        }
      }
    } else if (chunk.type === 'thinking_start') {
      chat.isThinking = true
    } else if (chunk.type === 'plan_submitted') {
      const msg = [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
      if (msg) {
        msg.planData  = chunk.plan   // { title, steps: [{ label }] }
        msg.planState = 'pending'    // 'pending' | 'approved' | 'rejected'
      }
    } else if (chunk.type === 'context_update' && chunk.metrics) {
      chat.contextMetrics = { ...chunk.metrics }
    } else if (chunk.type === 'max_tokens_reached') {
      const msg = [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
      if (msg) {
        const suffix = `\n\n---\n⚠️ **Output truncated** — the model reached the ${(chunk.limit || 0).toLocaleString()}-token output limit. Send a follow-up to continue.`
        msg.content = (msg.content || '') + suffix
        if (!msg.segments) msg.segments = []
        const lastSeg = msg.segments[msg.segments.length - 1]
        if (lastSeg?.type === 'text') lastSeg.content = msg.content
        else msg.segments.push({ type: 'text', content: msg.content })
      }
    }
    // tool_call/tool_result segment rendering handled by UI callback in ChatsView
    // (isCallingTool/currentToolCall are updated in initChunkListener unconditionally)

    debouncedPersistChat(chatId)
  }

  function markAsRead(chatId) {
    if (unreadChatIds.value.has(chatId)) {
      const s = new Set(unreadChatIds.value)
      s.delete(chatId)
      unreadChatIds.value = s
    }
    if (completedChatIds.value.has(chatId)) {
      const s = new Set(completedChatIds.value)
      s.delete(chatId)
      completedChatIds.value = s
    }
  }

  function markCompleted(chatId) {
    // Remove from unread (stop the pulse dot) and add to completed
    if (unreadChatIds.value.has(chatId)) {
      const s = new Set(unreadChatIds.value)
      s.delete(chatId)
      unreadChatIds.value = s
    }
    const s = new Set(completedChatIds.value)
    s.add(chatId)
    completedChatIds.value = s
    // Clear any pending permission indicator
    if (pendingPermissionChatIds.value.has(chatId)) {
      const p = new Set(pendingPermissionChatIds.value)
      p.delete(chatId)
      pendingPermissionChatIds.value = p
    }
  }

  function markPermissionPending(chatId) {
    const s = new Set(pendingPermissionChatIds.value)
    s.add(chatId)
    pendingPermissionChatIds.value = s
  }

  function clearPermissionPending(chatId) {
    if (!pendingPermissionChatIds.value.has(chatId)) return
    const s = new Set(pendingPermissionChatIds.value)
    s.delete(chatId)
    pendingPermissionChatIds.value = s
  }

  function setPlanState(chatId, msgId, state) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat?.messages) return
    const msg = chat.messages.find(m => m.id === msgId)
    if (msg) {
      msg.planState = state
      debouncedPersistChat(chatId)
    }
  }

  // keyed by chatId — holds last runAgent params for plan approval re-run
  const _planRunParams = {}

  function storePlanRunParams(chatId, params) {
    _planRunParams[chatId] = params
  }

  function getPlanRunParams(chatId) {
    return _planRunParams[chatId] || null
  }

  function triggerMinibarSend(text, chatId) {
    pendingMinibarSend.value = { text, chatId }
  }
  function clearMinibarSend() {
    pendingMinibarSend.value = null
  }

  async function sendMinibarMessage(text, chatId) {
    const { useConfigStore }   = await import('./config')
    const { useAgentsStore } = await import('./agents')
    const configStore   = useConfigStore()
    const agentsStore = useAgentsStore()

    const targetChat = chats.value.find(c => c.id === chatId)
    if (!targetChat) return

    await ensureMessages(chatId)
    activeChatId.value = chatId

    // Add user message
    await addMessage(chatId, { role: 'user', content: text })

    // Streaming placeholder
    const streamingMsgId = uuidv4()
    await addMessage(chatId, { id: streamingMsgId, role: 'assistant', content: '', streaming: true, streamingStartedAt: Date.now() })

    targetChat.isRunning = true

    // Build API messages (history before this send)
    const apiMessages = (targetChat.messages || [])
      .filter(m => (m.role === 'user' && m.content) || (m.role === 'assistant' && !m.streaming && m.content))
      .map(m => ({ role: m.role, content: m.content }))

    // Resolve persona + provider
    const sysAgentId = targetChat.systemPersonaId || agentsStore.defaultSystemPersona?.id
    const sysAgent   = sysAgentId ? agentsStore.getPersonaById(sysAgentId) : agentsStore.defaultSystemPersona
    const chatProvider = sysAgent?.providerId || 'anthropic'
    const cfg = { ...configStore.config }

    if (chatProvider === 'anthropic') {
      cfg.apiKey = cfg.anthropic?.apiKey || ''; cfg.baseURL = cfg.anthropic?.baseURL || ''
    } else if (chatProvider === 'openrouter') {
      cfg.apiKey = cfg.openrouter?.apiKey || ''; cfg.baseURL = cfg.openrouter?.baseURL || ''
    } else if (chatProvider === 'openai') {
      cfg.openaiApiKey = cfg.openai?.apiKey || ''; cfg.openaiBaseURL = cfg.openai?.baseURL || ''
      cfg._resolvedProvider = 'openai'; cfg.defaultProvider = 'openai'
    } else if (chatProvider === 'deepseek') {
      cfg.openaiApiKey = cfg.deepseek?.apiKey || ''
      cfg.openaiBaseURL = (cfg.deepseek?.baseURL || '').replace(/\/+$/, '')
      cfg._resolvedProvider = 'openai'; cfg._directAuth = true; cfg.defaultProvider = 'openai'
    }

    // Per-chat model override
    const rawOverride = targetChat.personaModelOverrides?.[sysAgentId]
    const overrideModel    = rawOverride ? (typeof rawOverride === 'object' ? rawOverride.model    : rawOverride) : null
    const overrideProvider = rawOverride && typeof rawOverride === 'object' ? rawOverride.provider : null
    if (overrideProvider && overrideProvider !== chatProvider) {
      if (overrideProvider === 'anthropic') {
        cfg.apiKey = cfg.anthropic?.apiKey || ''; cfg.baseURL = cfg.anthropic?.baseURL || ''
        delete cfg._directAuth; delete cfg.openaiApiKey; delete cfg.openaiBaseURL
        cfg._resolvedProvider = undefined; cfg.defaultProvider = undefined
      } else if (overrideProvider === 'openrouter') {
        cfg.apiKey = cfg.openrouter?.apiKey || ''; cfg.baseURL = cfg.openrouter?.baseURL || ''
        delete cfg._directAuth; delete cfg.openaiApiKey; delete cfg.openaiBaseURL
        cfg._resolvedProvider = undefined; cfg.defaultProvider = undefined
      } else if (overrideProvider === 'openai') {
        cfg.openaiApiKey = cfg.openai?.apiKey || ''; cfg.openaiBaseURL = cfg.openai?.baseURL || ''
        cfg._resolvedProvider = 'openai'; cfg.defaultProvider = 'openai'; delete cfg._directAuth
      } else if (overrideProvider === 'deepseek') {
        cfg.openaiApiKey = cfg.deepseek?.apiKey || ''
        cfg.openaiBaseURL = (cfg.deepseek?.baseURL || '').replace(/\/+$/, '')
        cfg._resolvedProvider = 'openai'; cfg._directAuth = true; cfg.defaultProvider = 'openai'
      }
    }
    const resolvedModel = overrideModel || sysAgent?.modelId || null
    if (resolvedModel) cfg.customModel = resolvedModel
    if (targetChat.workingPath) cfg.chatWorkingPath = targetChat.workingPath

    const usrAgentId = targetChat.userPersonaId
    const usrAgent   = usrAgentId ? agentsStore.getPersonaById(usrAgentId) : agentsStore.defaultUserPersona
    const userAgentPrompt = usrAgent?.prompt || null

    const agentPrompts = {
      systemPersonaPrompt:       sysAgent?.prompt || null,
      systemPersonaName:         sysAgent?.name || null,
      systemPersonaDescription:  sysAgent?.description || null,
      systemPersonaId:           sysAgent?.id || '__default_system__',
      userPersonaId:             usrAgent?.id || '__default_user__',
      userAgentPrompt: userAgentPrompt,
    }

    try {
      const res = await window.electronAPI.runAgent({
        chatId,
        messages: JSON.parse(JSON.stringify(apiMessages)),
        config: JSON.parse(JSON.stringify(cfg)),
        enabledAgents: [],
        enabledSkills: [],
        personaPrompts: agentPrompts,
        streamingMsgId,
        mcpServers: [],
        httpTools: [],
        chatPermissionMode: targetChat.permissionMode || 'inherit',
        chatAllowList: JSON.parse(JSON.stringify(targetChat.chatAllowList || [])),
        chatDangerOverrides: JSON.parse(JSON.stringify(targetChat.chatDangerOverrides || [])),
        maxOutputTokens: targetChat.maxOutputTokens || null,
        knowledgeConfig: { ragEnabled: false },
      })

      // Chunks already updated msg.content+segments via _applyChunk; just finalize streaming flag
      const msg = (targetChat.messages || []).find(m => m.id === streamingMsgId)
      if (msg) {
        if (!msg.content && res?.result) {
          msg.content = res.result
          msg.segments = [{ type: 'text', content: res.result }]
        }
        msg.streaming = false
        if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
      }
    } catch (err) {
      console.error('[minibar send] runAgent error:', err)
      const msg = (targetChat.messages || []).find(m => m.id === streamingMsgId)
      if (msg) {
        msg.content = `Error: ${err.message}`
        msg.segments = [{ type: 'text', content: msg.content }]
        msg.streaming = false
      }
    } finally {
      targetChat.isRunning = false
      targetChat.isCallingTool = false
      targetChat.currentToolCall = null
      debouncedPersistChat(chatId)
    }
  }

  return {
    chatTree, chats, activeChatId, activeFolderId, activeChat, isLoading,
    unreadChatIds, completedChatIds, pendingPermissionChatIds,
    loadChats, createChat, createChatFromHistory, removeChat, renameChat,
    setActiveChat, clearActiveChat, addMessage, updateLastAssistantMessage, setChatPersona,
    setChatProvider, setChatModel, setChatPersonaModelOverride, setChatSettings, deleteMessage, clearChat, persist, ensureMessages,
    loadOlderSegments, hasOlderSegments,
    setGroupPersonas, toggleGroupMode, setGroupPersonaOverride,
    removeGroupPersona, addGroupPersona, reorderChats,
    getChatFolderPath,
    createFolder, renameFolder, deleteFolder, toggleFolder, expandFolder, setAllFoldersExpanded,
    moveNodeToFolder, reorderNode,
    initChunkListener, setUiChunkCallback, clearUiChunkCallback, setTaskChunkCallback, clearTaskChunkCallback, markAsRead, markCompleted,
    markPermissionPending, clearPermissionPending,
    setPlanState, storePlanRunParams, getPlanRunParams,
    pendingMinibarSend, triggerMinibarSend, clearMinibarSend, sendMinibarMessage,
  }
})
