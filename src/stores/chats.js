import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { storage } from '../services/storage'
import { en, zh } from '../i18n'
import { parseToolLogBlock, deduplicateToolSegments } from '../utils/parseToolLog'
import { PREVIEW_LIMITS, isLimitEnforced } from '../utils/guestLimits'

const NEW_CHAT_TITLES = new Set([
  en.chats.newChat,
  zh.chats.newChat,
])

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

  // Wizard first chat — set by SetupWizard, consumed by ChatsView to highlight AI Docs nav
  const wizardFirstChatId = ref(null)

// Input prefill signal: set by useChatToCreate, consumed by ChatsView to populate input box
  const pendingInputPrefill = ref(null) // { text, chatId } | null

  // Scroll-to-bottom signal: increment to request ChatWindow to scroll to bottom
  const scrollToBottomSignal = ref(0)
  function requestScrollToBottom() { scrollToBottomSignal.value++ }

  // UI chunk callback — set by ChatsView when mounted, cleared on unmount
  let _uiChunkCallback = null
  // Task chunk callback — set by TaskEngineView when a plan is running manually
  let _taskChunkCallback = null

  // Dev-mode chunk recording — captures every agent:chunk for replay testing.
  // Access from devtools: useChatsStore().getChunkLog()
  const _chunkLog = import.meta.env.DEV ? [] : null

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

  const defaultContextMetrics = () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, maxTokens: 1000000, percentage: 0, compactionCount: 0, voiceInputTokens: 0, voiceOutputTokens: 0, whisperCalls: 0, whisperSecs: 0 })
  const AUTO_TITLE_CHECKPOINTS = [1, 3, 5]
  const _autoTitleInFlight = new Set()

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
    if (!chat.perAgentContextMetrics) chat.perAgentContextMetrics = {}
    if (!chat.lastContextSnapshot) chat.lastContextSnapshot = null
    if (chat.systemAgentId === undefined) chat.systemAgentId = null
    if (chat.userAgentId === undefined) chat.userAgentId = null
    if (chat.provider === undefined) chat.provider = null
    if (chat.model === undefined) chat.model = null
    if (chat.icon === undefined) chat.icon = ''
    if (chat.autoTitleEligible === undefined) chat.autoTitleEligible = NEW_CHAT_TITLES.has(chat.title)
    if (chat.autoTitleLocked === undefined) chat.autoTitleLocked = false
    if (chat.autoTitleAttemptCount === undefined) chat.autoTitleAttemptCount = 0
    if (chat.groupAgentIds === undefined) chat.groupAgentIds = []
    if (chat.isGroupChat === undefined) chat.isGroupChat = false
    if (chat.groupAgentOverrides === undefined) chat.groupAgentOverrides = {}
    if (chat.workingPath === undefined) chat.workingPath = null
    if (chat.permissionMode === undefined) chat.permissionMode = 'inherit'
    if (chat.permissionMode === 'sandbox') chat.permissionMode = 'chat_only' // migrate old value
    if (chat.chatAllowList === undefined) chat.chatAllowList = []
    if (chat.chatDangerOverrides === undefined) chat.chatDangerOverrides = []
    if (chat.codingMode === undefined) chat.codingMode = false
    if (chat.maxAgentRounds === undefined) chat.maxAgentRounds = null  // null = use default (10)
    if (chat.codingProvider === undefined) chat.codingProvider = 'claude-code'
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
          // Strip stale waiting indicators — they were never meant to be persisted
          chat.messages = full.messages.filter(m => !m.isWaitingIndicator)
          for (const msg of chat.messages) {
            if (msg.streaming) {
              msg.streaming = false
              // If the message was mid-stream with no content, mark it clearly
              if (msg.role === 'assistant' && !msg.content && (!msg.segments || msg.segments.length === 0)) {
                msg.content = '_No response_'
                msg.segments = [{ type: 'text', content: '_No response_' }]
              }
            }
          }
          // Migrate: parse tool execution log text into proper tool segments
          // (for messages saved before the parseToolLog parser was added)
          for (const msg of chat.messages) {
            if (msg.role !== 'assistant') continue
            const segs = msg.segments
            if (!segs || segs.length === 0) {
              // Legacy messages with content but no segments
              if (msg.content && msg.content.includes('[Tool execution log from this response:')) {
                const result = parseToolLogBlock(msg.content)
                if (result) {
                  const newSegs = []
                  if (result.cleanedText) newSegs.push({ type: 'text', content: result.cleanedText })
                  newSegs.push(...result.parsedTools)
                  msg.segments = newSegs
                  msg.content = result.cleanedText
                }
              }
              continue
            }
            const textContent = segs.filter(s => s.type === 'text').map(s => s.content).join('')
            if (!textContent.includes('[Tool execution log from this response:')) continue
            const result = parseToolLogBlock(textContent)
            if (!result) continue
            const existingTools = segs.filter(s => s.type === 'tool' && !s._fromLog)
            const uniqueParsed = deduplicateToolSegments(existingTools, result.parsedTools)
            const newSegs = []
            let textReplaced = false
            for (const seg of segs) {
              if (seg.type === 'text') {
                if (!textReplaced) {
                  if (result.cleanedText) newSegs.push({ type: 'text', content: result.cleanedText })
                  textReplaced = true
                }
              } else {
                newSegs.push(seg)
              }
            }
            newSegs.push(...uniqueParsed)
            msg.segments = newSegs
            msg.content = result.cleanedText
          }
          if (full.contextMetrics) chat.contextMetrics = full.contextMetrics
          if (full.perAgentContextMetrics) chat.perAgentContextMetrics = full.perAgentContextMetrics
          if (full.lastContextSnapshot) chat.lastContextSnapshot = full.lastContextSnapshot
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
        // Collapse all folders first, then only expand ancestors of the active chat
        _collapseAllFolders(chatTree.value)
        // Restore last active chat, or fall back to the first chat
        const allChats = flattenChats(chatTree.value)
        let restoredId = null
        try { restoredId = localStorage.getItem('clankai_lastActiveChatId') || null } catch {}
        const targetChat = restoredId ? allChats.find(c => c.id === restoredId) : null
        const initialChat = targetChat || allChats[0]
        if (initialChat) {
          activeChatId.value = initialChat.id
          _expandAncestorFolders(initialChat.id)
          ensureMessages(initialChat.id)  // fire-and-forget, non-blocking
        }
      } else {
        // No chats on disk — start with empty state (user creates via New Chat)
        activeChatId.value = null
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

  async function createChat(title = en.chats.newChat, agentConfig = null, folderId = null, options = null) {
    if (isLimitEnforced() && chats.value.length >= PREVIEW_LIMITS.maxChats) {
      throw new Error('preview_limit:maxChats')
    }
    const normalizedIcon = typeof options?.icon === 'string' ? options.icon.trim() : ''
    const normalizedUserAgentId = options?.userAgentId ? String(options.userAgentId) : null
    const autoTitleEligible = options?.autoTitleEligible !== undefined
      ? !!options.autoTitleEligible
      : NEW_CHAT_TITLES.has(title)
    const chatType = options?.chatType || 'chat'
    const analysisTargetAgentId = options?.analysisTargetAgentId || null
    const chat = {
      type: chatType,
      id: uuidv4(),
      title,
      icon: normalizedIcon,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isRunning: false,
      isThinking: false,
      isCallingTool: false,
      currentToolCall: null,
      contextMetrics: defaultContextMetrics(),
      systemAgentId: null,
      userAgentId: normalizedUserAgentId,
      autoTitleEligible,
      autoTitleLocked: chatType === 'analysis',
      autoTitleAttemptCount: 0,
      provider: null,
      model: null,
      isGroupChat: false,
      groupAgentIds: [],
      groupAgentOverrides: {},
      groupAudienceMode: 'auto',
      groupAudienceAgentIds: [],
      workingPath: null,
      codingMode: false,
      codingProvider: 'claude-code',
      ...(analysisTargetAgentId ? { analysisTargetAgentId } : {}),
    }
    if (agentConfig && agentConfig.length === 1) {
      chat.systemAgentId = agentConfig[0]
    } else if (agentConfig && agentConfig.length >= 2) {
      chat.isGroupChat = true
      chat.groupAgentIds = [...agentConfig]
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

  async function createChatFromHistory(sourceChatId, title = en.chats.newChat, agentOverride = null) {
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
      icon: source.icon || '',
      messages: copiedMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isRunning: false,
      isThinking: false,
      isCallingTool: false,
      currentToolCall: null,
      isLoadingMessages: false,
      contextMetrics: defaultContextMetrics(),
      systemAgentId: source.systemAgentId,
      userAgentId: source.userAgentId,
      autoTitleEligible: false,
      autoTitleLocked: true,
      autoTitleAttemptCount: source.autoTitleAttemptCount || 0,
      provider: source.provider,
      model: source.model,
      isGroupChat: source.isGroupChat,
      groupAgentIds: [...(source.groupAgentIds || [])],
      groupAgentOverrides: JSON.parse(JSON.stringify(source.groupAgentOverrides || {})),
      groupAudienceMode: source.groupAudienceMode || 'auto',
      groupAudienceAgentIds: JSON.parse(JSON.stringify(source.groupAudienceAgentIds || [])),
      workingPath: source.workingPath || null,
      codingMode: source.codingMode || false,
      codingProvider: source.codingProvider || 'claude-code',
    }
    // Override agents if provided
    if (agentOverride && agentOverride.length > 0) {
      if (agentOverride.length === 1) {
        chat.systemAgentId = agentOverride[0]
        chat.isGroupChat = false
        chat.groupAgentIds = []
        chat.groupAgentOverrides = {}
      } else {
        chat.isGroupChat = true
        chat.groupAgentIds = [...agentOverride]
        chat.systemAgentId = null
        chat.groupAgentOverrides = {}
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
    }
    await storage.deleteChat(id)
    await persistIndex()
  }

  async function renameChat(id, title, icon) {
    const chat = chats.value.find(c => c.id === id)
    if (chat) {
      chat.title = title
      if (icon !== undefined) chat.icon = icon
      chat.autoTitleEligible = false
      chat.autoTitleLocked = true
      chat.updatedAt = Date.now()
      await persistIndex()
    }
  }

  async function setActiveChat(id) {
    activeChatId.value = id
    // Update active folder context based on which folder the chat is in
    const parentFolderId = _getParentFolderId(id)
    if (parentFolderId !== undefined) activeFolderId.value = parentFolderId
    // Expand ancestor folders so the chat is visible in the sidebar tree
    _expandAncestorFolders(id)
    // Persist last active chat so it restores on next app launch
    try { localStorage.setItem('clankai_lastActiveChatId', id || '') } catch {}
    ensureMessages(id)  // fire-and-forget: UI shows loading indicator, never blocks
  }

  // Collapse all folders in the tree (used on load to reset expand state)
  function _collapseAllFolders(nodes) {
    for (const node of nodes) {
      if (node.type === 'folder') {
        node.expanded = false
        if (node.children?.length) _collapseAllFolders(node.children)
      }
    }
  }

  // Expand all ancestor folders for a given chat so it's visible in the tree
  function _expandAncestorFolders(chatId) {
    function search(nodes) {
      for (const node of nodes) {
        if (node.type === 'chat' && node.id === chatId) return true
        if (node.type === 'folder') {
          if (search(node.children || [])) {
            node.expanded = true
            return true
          }
        }
      }
      return false
    }
    search(chatTree.value)
  }

  function clearActiveChat() {
    activeChatId.value = null
  }

  // Expand ancestor folders of the currently active chat so it is visible in
  // the sidebar tree. Called when re-entering the /chats view to re-reveal the
  // active chat even if the user had manually collapsed its parent folder.
  function revealActiveChat() {
    if (activeChatId.value) _expandAncestorFolders(activeChatId.value)
  }

  // ── Folder CRUD ───────────────────────────────────────────────────────────

  function _countFolders(nodes) {
    let count = 0
    for (const node of nodes) {
      if (node.type === 'folder') {
        count++
        if (node.children?.length) count += _countFolders(node.children)
      }
    }
    return count
  }

  async function createFolder(name, parentFolderId = null, emoji = '📁') {
    if (isLimitEnforced() && _countFolders(chatTree.value) >= PREVIEW_LIMITS.maxFolders) {
      throw new Error('preview_limit:maxFolders')
    }
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

  function _messageToPlainText(msg) {
    if (!msg) return ''
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter(part => part && (part.type === 'text' || part.type === 'input_text'))
        .map(part => part.text || part.content || '')
        .join('\n')
    }
    if (Array.isArray(msg.segments)) {
      return msg.segments
        .filter(seg => seg?.type === 'text')
        .map(seg => seg.content || '')
        .join('\n')
    }
    return ''
  }

  async function _tryAutoTitle(chat) {
    if (!chat || chat.autoTitleLocked || !chat.autoTitleEligible) return
    const chatId = chat.id
    if (_autoTitleInFlight.has(chatId)) return
    const userMessages = (chat.messages || []).filter(m => m.role === 'user')
    const userTurns = userMessages.length
    const attemptCount = chat.autoTitleAttemptCount || 0
    if (attemptCount >= AUTO_TITLE_CHECKPOINTS.length) return
    const targetTurns = AUTO_TITLE_CHECKPOINTS[attemptCount]
    if (userTurns < targetTurns) return
    if (!window.electronAPI?.suggestChatTitle) return

    chat.autoTitleAttemptCount = attemptCount + 1
    debouncedPersistChat(chatId)
    debouncedPersistIndex()

    const recent = (chat.messages || [])
      .slice(-12)
      .map(m => ({ role: m.role, content: _messageToPlainText(m).trim() }))
      .filter(m => m.content)

    _autoTitleInFlight.add(chatId)
    try {
      const res = await window.electronAPI.suggestChatTitle({
        chatId,
        messages: recent,
        attempt: chat.autoTitleAttemptCount,
      })
      if (res?.success && res?.title && chat.autoTitleEligible && !chat.autoTitleLocked) {
        chat.title = String(res.title).trim()
        chat.updatedAt = Date.now()
        chat.autoTitleLocked = true
        chat.autoTitleEligible = false
        await persistChat(chatId)
        await persistIndex()
      }
    } catch (err) {
      console.warn('[chats] suggestChatTitle failed:', err?.message || err)
    } finally {
      _autoTitleInFlight.delete(chatId)
    }
  }

  async function addMessage(chatId, message) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (chat.messages === null) await ensureMessages(chatId)
    chat.messages.push({ timestamp: Date.now(), ...message, id: message.id || uuidv4() })
    chat.updatedAt = Date.now()
    if (message.role === 'user') _tryAutoTitle(chat)
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
      last.segments = [{ type: 'text', content }]
    }
    debouncedPersistChat(chatId)
  }

  async function setChatAgent(chatId, type, agentId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (type === 'system') chat.systemAgentId = agentId
    else if (type === 'user') chat.userAgentId = agentId
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

  async function setGroupAgents(chatId, agentIds) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.groupAgentIds = agentIds
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function toggleGroupMode(chatId, enabled) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.isGroupChat = enabled
    if (enabled) {
      if (chat.systemAgentId && !chat.groupAgentIds.includes(chat.systemAgentId)) {
        chat.groupAgentIds.unshift(chat.systemAgentId)
      }
    } else {
      if (chat.groupAgentIds.length > 0) {
        chat.systemAgentId = chat.groupAgentIds[0]
      }
      chat.groupAgentIds = []
      chat.groupAgentOverrides = {}
    }
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function setGroupAgentOverride(chatId, agentId, overrides) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (!chat.groupAgentOverrides) chat.groupAgentOverrides = {}
    chat.groupAgentOverrides[agentId] = { ...overrides }
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function removeGroupAgent(chatId, agentId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.groupAgentIds = chat.groupAgentIds.filter(id => id !== agentId)
    if (chat.groupAgentOverrides) delete chat.groupAgentOverrides[agentId]
    // Auto-downgrade to single mode when only 1 agent remains
    if (chat.groupAgentIds.length <= 1) {
      chat.isGroupChat = false
      if (chat.groupAgentIds.length === 1) {
        chat.systemAgentId = chat.groupAgentIds[0]
      }
      chat.groupAgentIds = []
      chat.groupAgentOverrides = {}
    }
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function addGroupAgent(chatId, agentId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (!chat.groupAgentIds.includes(agentId)) {
      chat.groupAgentIds.push(agentId)
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
    if ('permissionMode' in settings) chat.permissionMode = settings.permissionMode
    if ('chatAllowList' in settings) chat.chatAllowList = settings.chatAllowList
    if ('chatDangerOverrides' in settings) chat.chatDangerOverrides = settings.chatDangerOverrides
    if ('maxAgentRounds' in settings) chat.maxAgentRounds = settings.maxAgentRounds
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
        const { messages, isRunning, isThinking, isLoadingMessages, contextMetrics, perAgentContextMetrics, lastContextSnapshot, ...meta } = JSON.parse(JSON.stringify(node))
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
      // Dev-mode: record every chunk for replay testing
      if (_chunkLog) {
        _chunkLog.push({ chatId, chunk: JSON.parse(JSON.stringify(chunk)), ts: Date.now() })
      }

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

      // IM bridge chunks: always route through _applyChunk (useChunkHandler
      // doesn't know about IM streaming messages in its perChatStreamingMsgId map)
      const chat = chats.value.find(c => c.id === chatId)
      if (chunk.type === 'im_user_message' || chunk.type === 'im_stream_start' || chunk.type === 'im_stream_end') {
        _applyChunk(chatId, chunk)
        return
      }
      if (chat?._imStreaming) {
        _applyChunk(chatId, chunk)
        return
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
    if (!chat) return
    if (chat.messages === null) {
      // Messages not loaded yet — trigger lazy load then replay this chunk.
      // Handles chunks that arrive before ChatsView mounts after a page refresh.
      ensureMessages(chatId).then(() => _applyChunk(chatId, chunk)).catch(() => {})
      return
    }

    // IM bridge: inject messages into in-memory store
    if (chunk.type === 'im_user_message' && chunk.message) {
      if (!chat.messages.find(m => m.id === chunk.message.id)) {
        chat.messages.push({ ...chunk.message })
      }
      return
    }
    if (chunk.type === 'im_stream_start' && chunk.message) {
      let msg = chat.messages.find(m => m.id === chunk.message.id)
      if (!msg) {
        msg = { ...chunk.message }
        chat.messages.push(msg)
      }
      // Force streaming=true — disk may already have the finalized version
      msg.streaming = true
      msg.content = ''
      msg.segments = [{ type: 'text', content: '' }]
      chat.isRunning = true
      chat._imStreaming = true
      chat._imStreamingMsgId = chunk.message.id
      return
    }
    if (chunk.type === 'im_stream_end') {
      const msg = chat.messages.find(m => m.id === chunk.messageId)
      if (msg) msg.streaming = false
      chat.isRunning = false
      chat._imStreaming = false
      chat._imStreamingMsgId = null
      debouncedPersistChat(chatId)
      return
    }

    // When _uiChunkCallback is set (ChatsView mounted), group agent chunks
    // (tagged with agentId) are handled exclusively by handleChunk. The store
    // must NOT touch them — doing so causes duplicate content writes.
    // BUT when _uiChunkCallback is null (minibar, other routes), the store is
    // the ONLY handler and must process the full lifecycle.
    if (chunk.agentId && _uiChunkCallback) {
      if (chunk.type === 'thinking_start') chat.isThinking = true
      else if (chunk.type === 'text') chat.isThinking = false
      else if (chunk.type === 'context_update' && chunk.metrics) chat.contextMetrics = { ...chunk.metrics }
      debouncedPersistChat(chatId)
      return
    }

    // ── Lifecycle: agent_start / agent_end / send_message_complete ──
    if (chunk.type === 'agent_start') {
      // Create streaming placeholder for this agent
      const msgId = uuidv4()
      chat.messages.push({
        id: msgId,
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
      debouncedPersistChat(chatId)
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
      debouncedPersistChat(chatId)
      return
    }

    if (chunk.type === 'send_message_complete' || chunk.type === 'send_message_error') {
      // Remove stale waiting indicators
      if (chat.messages) {
        const waitIdx = chat.messages.findIndex(m => m.isWaitingIndicator)
        if (waitIdx >= 0) chat.messages.splice(waitIdx, 1)
      }
      // Finalize any still-streaming messages
      for (const m of chat.messages) {
        if (m.streaming) {
          m.streaming = false
          if (m.streamingStartedAt) m.durationMs = Date.now() - m.streamingStartedAt
        }
      }
      if (chunk.type === 'send_message_error') {
        const errMsg = [...chat.messages].reverse().find(m => m.role === 'assistant')
        if (errMsg && !errMsg.content) {
          errMsg.content = `Error: ${chunk.error}`
          errMsg.segments = [{ type: 'text', content: errMsg.content }]
          errMsg.isError = true
        }
      }
      chat.isRunning = false
      chat.isThinking = false
      chat.isCallingTool = false
      chat.currentToolCall = null
      const cs = new Set(completedChatIds.value)
      cs.add(chatId)
      completedChatIds.value = cs
      debouncedPersistChat(chatId)
      return
    }

    if (chunk.type === 'text') {
      chat.isThinking = false
      const msg = chat._imStreamingMsgId
        ? chat.messages.find(m => m.id === chat._imStreamingMsgId)
        : [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
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
        msg.planData  = chunk.plan
        msg.planState = 'pending'
      }
    } else if (chunk.type === 'context_update' && chunk.metrics) {
      chat.contextMetrics = { ...chunk.metrics }
    } else if (chunk.type === 'agent_step') {
      const msg = [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
      if (msg) {
        if (!msg.segments) msg.segments = []
        const existingStepIndex = msg.segments.findIndex(s => s.type === 'agent_step')
        const newStep = {
          type: 'agent_step',
          id: chunk.id,
          title: chunk.title,
          status: chunk.status,
          duration: chunk.duration,
          details: chunk.details || {},
          timestamp: chunk.timestamp,
        }
        if (existingStepIndex >= 0) msg.segments[existingStepIndex] = newStep
        else msg.segments.push(newStep)
      }
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
    // Only show the ✅ indicator if the user is NOT currently viewing this chat.
    // If they're watching it, they already saw the completion — no need to notify.
    if (chatId === activeChatId.value) return
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
    const { useAgentsStore } = await import('./agents')
    const { useSkillsStore } = await import('./skills')
    const agentsStore = useAgentsStore()
    const skillsStore = useSkillsStore()

    const targetChat = chats.value.find(c => c.id === chatId)
    if (!targetChat) return

    await ensureMessages(chatId)
    activeChatId.value = chatId

    const stampUsrId = targetChat.userAgentId || agentsStore.defaultUserAgent?.id || null
    await addMessage(chatId, { role: 'user', content: text, ...(stampUsrId ? { userAgentId: stampUsrId } : {}) })

    const groupIds = targetChat.groupAgentIds?.length > 0
      ? targetChat.groupAgentIds
      : [targetChat.systemAgentId || agentsStore.defaultSystemAgent?.id].filter(Boolean)
    const isGroup = groupIds.length > 1

    targetChat.isRunning = true
    targetChat.isThinking = true
    const messages = (targetChat.messages || [])
      .filter(m => (m.role === 'user' && m.content) || (m.role === 'assistant' && !m.streaming && m.content))
      .map(m => ({ role: m.role, content: m.content, _agentId: m.agentId || null, _userAgentId: m.userAgentId || null }))
      .filter(m => !!m.content)

    window.electronAPI.sendMessage({
      chatId,
      messages: JSON.parse(JSON.stringify(messages)),
      groupIds: JSON.parse(JSON.stringify(groupIds)),
      isGroup,
      text,
      pendingAttachments: [],
      enabledSkills: JSON.parse(JSON.stringify(skillsStore.allSkillObjects || [])),
      stickyTargetIds: [],
      targetChatMeta: {
        permissionMode: targetChat.permissionMode || 'inherit',
        chatAllowList: JSON.parse(JSON.stringify(targetChat.chatAllowList || [])),
        chatDangerOverrides: JSON.parse(JSON.stringify(targetChat.chatDangerOverrides || [])),
        maxAgentRounds: targetChat.maxAgentRounds ?? 10,
        workingPath: targetChat.workingPath || null,
        codingMode: !!targetChat.codingMode,
        claudeContext: null,
        userAgentId: targetChat.userAgentId || null,
        systemAgentId: isGroup ? null : (groupIds[0] || null),
        groupAudienceMode: targetChat.groupAudienceMode || 'auto',
        groupAudienceAgentIds: JSON.parse(JSON.stringify(targetChat.groupAudienceAgentIds || [])),
        chatType: targetChat.type || 'chat',
        analysisTargetAgentId: targetChat.analysisTargetAgentId || null,
      },
    }).catch(err => console.error('[minibar send] IPC error:', err.message))
  }

  async function reconnectRunningAgents() {
    if (!window.electronAPI?.getRunningAgents) return []
    try {
      const running = await window.electronAPI.getRunningAgents()
      if (!running?.length) return []
      const byChatId = {}
      for (const entry of running) {
        if (!byChatId[entry.chatId]) byChatId[entry.chatId] = []
        byChatId[entry.chatId].push(entry)
      }
      const reconnected = []
      for (const [chatId, entries] of Object.entries(byChatId)) {
        const chat = chats.value.find(c => c.id === chatId)
        if (!chat) continue
        chat.isRunning = true
        await ensureMessages(chatId)
        reconnected.push({ chatId, entries })
      }
      return reconnected
    } catch (err) {
      console.warn('[chats] reconnectRunningAgents failed:', err.message)
      return []
    }
  }

  return {
    chatTree, chats, activeChatId, activeFolderId, activeChat, isLoading,
    unreadChatIds, completedChatIds, pendingPermissionChatIds,
    loadChats, createChat, createChatFromHistory, removeChat, renameChat,
    setActiveChat, clearActiveChat, revealActiveChat, addMessage, updateLastAssistantMessage, setChatAgent,
    setChatProvider, setChatModel, setChatSettings, deleteMessage, clearChat, persist, ensureMessages,
    loadOlderSegments, hasOlderSegments,
    setGroupAgents, toggleGroupMode, setGroupAgentOverride,
    removeGroupAgent, addGroupAgent, reorderChats,
    getChatFolderPath,
    createFolder, renameFolder, deleteFolder, toggleFolder, expandFolder, setAllFoldersExpanded,
    moveNodeToFolder, reorderNode,
    initChunkListener, setUiChunkCallback, clearUiChunkCallback, setTaskChunkCallback, clearTaskChunkCallback, markAsRead, markCompleted,
    markPermissionPending, clearPermissionPending,
    setPlanState, storePlanRunParams, getPlanRunParams,
    pendingMinibarSend, triggerMinibarSend, clearMinibarSend, sendMinibarMessage,
    scrollToBottomSignal, requestScrollToBottom,
    wizardFirstChatId,
    pendingInputPrefill,
    reconnectRunningAgents,
    getChunkLog: () => _chunkLog ? [..._chunkLog] : [],
    clearChunkLog: () => { if (_chunkLog) _chunkLog.length = 0 },
  }
})
