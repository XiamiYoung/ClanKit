import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { storage } from '../services/storage'

export const useChatsStore = defineStore('chats', () => {
  const chats = ref([])
  const activeChatId = ref(null)
  const isLoading = ref(false)

  const activeChat = computed(() => chats.value.find(c => c.id === activeChatId.value) || null)

  const defaultContextMetrics = () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, maxTokens: 200000, percentage: 0, compactionCount: 0 })

  async function loadChats() {
    const stored = await storage.getChats()
    if (stored && stored.length > 0) {
      for (const chat of stored) {
        // Reset runtime state — never trust persisted values
        chat.isRunning = false
        chat.isThinking = false
        chat.contextMetrics = chat.contextMetrics || defaultContextMetrics()
        // Backfill persona fields for older chats
        if (chat.systemPersonaId === undefined) chat.systemPersonaId = null
        if (chat.userPersonaId === undefined) chat.userPersonaId = null
        // Backfill provider/model fields for older chats
        if (chat.provider === undefined) chat.provider = null
        if (chat.model === undefined) chat.model = null
        // Clear stale streaming flags from messages persisted mid-stream
        for (const msg of chat.messages) {
          if (msg.streaming) msg.streaming = false
        }
      }
      chats.value = stored
      activeChatId.value = stored[0].id
    } else {
      await createChat('New Chat')
    }
  }

  async function createChat(title = 'New Chat') {
    const chat = {
      id: uuidv4(),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Per-chat runtime state
      isRunning: false,
      isThinking: false,
      contextMetrics: defaultContextMetrics(),
      // Persona assignments (null = use default)
      systemPersonaId: null,
      userPersonaId: null,
      // Per-chat provider/model (null = use global default from config)
      provider: null,
      model: null,
    }
    chats.value.unshift(chat)
    activeChatId.value = chat.id
    await persist()
    return chat
  }

  async function removeChat(id) {
    const idx = chats.value.findIndex(c => c.id === id)
    if (idx === -1) return
    chats.value.splice(idx, 1)
    if (activeChatId.value === id) {
      activeChatId.value = chats.value[0]?.id || null
      if (!activeChatId.value) await createChat()
    }
    await persist()
  }

  async function renameChat(id, title) {
    const chat = chats.value.find(c => c.id === id)
    if (chat) {
      chat.title = title
      chat.updatedAt = Date.now()
      await persist()
    }
  }

  function setActiveChat(id) {
    activeChatId.value = id
  }

  async function addMessage(chatId, message) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.messages.push({ timestamp: Date.now(), ...message, id: message.id || uuidv4() })
    chat.updatedAt = Date.now()
    // Auto-title from first user message
    if (chat.messages.length === 1 && message.role === 'user' && chat.title === 'New Chat') {
      chat.title = message.content.substring(0, 40) + (message.content.length > 40 ? '…' : '')
    }
    await persist()
  }

  async function updateLastAssistantMessage(chatId, content) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    const last = [...chat.messages].reverse().find(m => m.role === 'assistant')
    if (last) {
      last.content = content
      last.streaming = false
    }
    await persist()
  }

  async function setChatPersona(chatId, type, personaId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    if (type === 'system') chat.systemPersonaId = personaId
    else if (type === 'user') chat.userPersonaId = personaId
    chat.updatedAt = Date.now()
    await persist()
  }

  async function setChatProvider(chatId, provider) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.provider = provider
    chat.updatedAt = Date.now()
    await persist()
  }

  async function setChatModel(chatId, model) {
    const chat = chats.value.find(c => c.id === chatId)
    if (!chat) return
    chat.model = model
    chat.updatedAt = Date.now()
    await persist()
  }

  async function clearChat(chatId) {
    const chat = chats.value.find(c => c.id === chatId)
    if (chat) {
      chat.messages = []
      await persist()
    }
  }

  async function persist() {
    // JSON round-trip strips Vue reactive Proxy wrappers before IPC structured-clone
    await storage.saveChats(JSON.parse(JSON.stringify(chats.value)))
  }

  return {
    chats, activeChatId, activeChat, isLoading,
    loadChats, createChat, removeChat, renameChat,
    setActiveChat, addMessage, updateLastAssistantMessage, setChatPersona,
    setChatProvider, setChatModel, clearChat, persist
  }
})
