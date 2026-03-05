import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { storage } from '../services/storage'

export const useChatsStore = defineStore('chats', () => {
  const chats = ref([])
  const activeChatId = ref(null)
  const isLoading = ref(false)
  const unreadChatIds = ref(new Set())
  const completedChatIds = ref(new Set())
  const pendingPermissionChatIds = ref(new Set())

  // UI chunk callback — set by ChatsView when mounted, cleared on unmount
  let _uiChunkCallback = null

  const activeChat = computed(() => chats.value.find(c => c.id === activeChatId.value) || null)

  const defaultContextMetrics = () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, maxTokens: 200000, percentage: 0, compactionCount: 0, voiceInputTokens: 0, voiceOutputTokens: 0, whisperCalls: 0, whisperSecs: 0 })

  // ── Debounce timers ────────────────────────────────────────────────────────
  const _chatTimers = {}      // { [chatId]: timeoutId }
  let _indexTimer = null
  const DEBOUNCE_MS = 300

  function backfillChat(chat) {
    chat.isRunning = false
    chat.isThinking = false
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

  async function loadChats() {
    isLoading.value = true
    try {
      const index = await storage.getChatIndex()
      if (index && index.length > 0) {
        for (const meta of index) {
          // Index entries have no messages — set to null (lazy)
          meta.messages = null
          backfillChat(meta)
        }
        chats.value = index
        activeChatId.value = index[0].id
        // Only load the active chat eagerly — others load on demand when selected
        ensureMessages(activeChatId.value)  // fire-and-forget, non-blocking
      } else {
        await createChat('New Chat')
      }
    } finally {
      isLoading.value = false
    }
  }

  async function createChat(title = 'New Chat', personaConfig = null) {
    const chat = {
      id: uuidv4(),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isRunning: false,
      isThinking: false,
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
    chats.value.unshift(chat)
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
      id: uuidv4(),
      title,
      messages: copiedMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isRunning: false,
      isThinking: false,
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
    chats.value.unshift(chat)
    activeChatId.value = chat.id
    await persistChat(chat.id)
    await persistIndex()
    return chat
  }

  async function removeChat(id) {
    const idx = chats.value.findIndex(c => c.id === id)
    if (idx === -1) return
    chats.value.splice(idx, 1)
    // Cancel any pending debounce for this chat
    if (_chatTimers[id]) { clearTimeout(_chatTimers[id]); delete _chatTimers[id] }
    if (activeChatId.value === id) {
      activeChatId.value = chats.value[0]?.id || null
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
    ensureMessages(id)  // fire-and-forget: UI shows loading indicator, never blocks
  }

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

  async function setChatPersona(chatId, type, personaId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (type === 'system') chat.systemPersonaId = personaId
    else if (type === 'user') chat.userPersonaId = personaId
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

  function setChatPersonaModelOverride(chatId, personaId, modelId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (!chat.personaModelOverrides) chat.personaModelOverrides = {}
    if (modelId === null) {
      delete chat.personaModelOverrides[personaId]
    } else {
      chat.personaModelOverrides[personaId] = modelId
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

  async function setGroupPersonaOverride(chatId, personaId, overrides) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (!chat.groupPersonaOverrides) chat.groupPersonaOverrides = {}
    chat.groupPersonaOverrides[personaId] = { ...overrides }
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function removeGroupPersona(chatId, personaId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.groupPersonaIds = chat.groupPersonaIds.filter(id => id !== personaId)
    if (chat.groupPersonaOverrides) delete chat.groupPersonaOverrides[personaId]
    chat.updatedAt = Date.now()
    await persistChat(chatId)
    await persistIndex()
  }

  async function addGroupPersona(chatId, personaId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (!chat.groupPersonaIds.includes(personaId)) {
      chat.groupPersonaIds.push(personaId)
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

  async function reorderChats(fromIndex, toIndex) {
    if (fromIndex === toIndex) return
    const item = chats.value.splice(fromIndex, 1)[0]
    chats.value.splice(toIndex, 0, item)
    await persistIndex()
  }

  // ── Persistence helpers ────────────────────────────────────────────────────

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

  async function persistIndex() {
    if (_indexTimer) { clearTimeout(_indexTimer); _indexTimer = null }
    const index = chats.value.map(c => {
      const { messages, ...meta } = JSON.parse(JSON.stringify(c))
      return meta
    })
    await storage.saveChatIndex(index)
  }

  function debouncedPersistIndex() {
    if (_indexTimer) clearTimeout(_indexTimer)
    _indexTimer = setTimeout(() => {
      _indexTimer = null
      const index = chats.value.map(c => {
        const { messages, ...meta } = JSON.parse(JSON.stringify(c))
        return meta
      })
      storage.saveChatIndex(index)
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

  function initChunkListener() {
    if (!window.electronAPI?.onAgentChunk) return
    window.electronAPI.onAgentChunk(({ chatId, chunk }) => {
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
        msg.content = (msg.content || '') +
          `\n\n---\n⚠️ **Output truncated** — the model reached the ${(chunk.limit || 0).toLocaleString()}-token output limit. Send a follow-up to continue.`
      }
    }
    // tool_call, tool_result, compaction, subagent_progress handled by UI callback only
    // (they need the perChatStreamingSegments map which lives in ChatsView)

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

  return {
    chats, activeChatId, activeChat, isLoading, unreadChatIds, completedChatIds, pendingPermissionChatIds,
    loadChats, createChat, createChatFromHistory, removeChat, renameChat,
    setActiveChat, addMessage, updateLastAssistantMessage, setChatPersona,
    setChatProvider, setChatModel, setChatPersonaModelOverride, setChatSettings, deleteMessage, clearChat, persist, ensureMessages,
    setGroupPersonas, toggleGroupMode, setGroupPersonaOverride,
    removeGroupPersona, addGroupPersona, reorderChats,
    initChunkListener, setUiChunkCallback, clearUiChunkCallback, markAsRead, markCompleted,
    markPermissionPending, clearPermissionPending,
    setPlanState, storePlanRunParams, getPlanRunParams,
  }
})
