import { v4 as uuidv4 } from 'uuid'
import { useChatsStore } from '../stores/chats'
import { useAgentsStore, BUILTIN_SYSTEM_AGENT_ID } from '../stores/agents'
import { useConfigStore } from '../stores/config'

// Tracks chats that already have a greeting in flight so we never start two.
const _inFlight = new Set()

let _subscribed = false
let _unsubscribe = null
const _activeMsgIdByChat = new Map() // chatId -> placeholder messageId

function _ensureSubscription(chatsStore) {
  if (_subscribed) return
  if (!window.electronAPI?.onGreetChunk) return
  _unsubscribe = window.electronAPI.onGreetChunk((data) => {
    if (!data || !data.chatId) return
    const { chatId, type, text } = data
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (!chat || !Array.isArray(chat.messages)) return
    const msgId = _activeMsgIdByChat.get(chatId)
    if (!msgId) return
    const msg = chat.messages.find(m => m.id === msgId)
    if (!msg) return

    if (type === 'delta' && text) {
      msg.content = (msg.content || '') + text
      msg.segments = [{ type: 'text', content: msg.content }]
    } else if (type === 'done') {
      msg.streaming = false
      if (!msg.content) {
        // Empty greeting — drop the placeholder so the chat doesn't show a blank bubble.
        const idx = chat.messages.indexOf(msg)
        if (idx >= 0) chat.messages.splice(idx, 1)
      }
      _activeMsgIdByChat.delete(chatId)
      _inFlight.delete(chatId)
      chat.updatedAt = Date.now()
      chatsStore.persist?.()
    } else if (type === 'error') {
      // Drop the placeholder silently — greeting is best-effort.
      const idx = chat.messages.indexOf(msg)
      if (idx >= 0) chat.messages.splice(idx, 1)
      _activeMsgIdByChat.delete(chatId)
      _inFlight.delete(chatId)
    }
  })
  _subscribed = true
}

/**
 * Streams an in-character greeting from the system agent into a freshly
 * created chat. No-op for user personas, group chats, or chats that already
 * have messages.
 */
export async function triggerAgentGreeting({ chatId, agentId }) {
  if (!chatId || !agentId) return
  if (_inFlight.has(chatId)) return
  if (!window.electronAPI?.generateGreeting) return

  const chatsStore = useChatsStore()
  const agentsStore = useAgentsStore()
  const configStore = useConfigStore()

  const chat = chatsStore.chats.find(c => c.id === chatId)
  if (!chat) return
  if (Array.isArray(chat.messages) && chat.messages.length > 0) return

  // Resolve the agent. Builtin id is allowed.
  let agent = agentsStore.getAgentById?.(agentId)
  if (!agent && agentId === BUILTIN_SYSTEM_AGENT_ID) {
    agent = agentsStore.defaultSystemAgent || agentsStore.systemAgents?.[0] || null
  }
  if (!agent) return
  if (agent.type === 'user') return

  // Resolve the user persona this chat is being held with (chat-specific
  // override → default user persona). Used so the greeting can address the
  // user by name and tailor tone to who they are.
  let userPersona = null
  const chatUserAgentId = chat.userAgentId || null
  if (chatUserAgentId) userPersona = agentsStore.getAgentById?.(chatUserAgentId) || null
  if (!userPersona) userPersona = agentsStore.defaultUserAgent || null
  const userPersonaPayload = userPersona
    ? {
        name: userPersona.name || '',
        description: userPersona.description || '',
        prompt: userPersona.prompt || '',
      }
    : null

  _ensureSubscription(chatsStore)
  _inFlight.add(chatId)

  // Push a streaming placeholder so the UI renders text as deltas arrive.
  const msgId = uuidv4()
  if (!Array.isArray(chat.messages)) chat.messages = []
  chat.messages.push({
    id: msgId,
    role: 'assistant',
    content: '',
    streaming: true,
    streamingStartedAt: Date.now(),
    agentId: agent.id,
    agentName: agent.name,
    segments: [],
  })
  _activeMsgIdByChat.set(chatId, msgId)

  try {
    await window.electronAPI.generateGreeting({
      chatId,
      agentId: agent.id,
      language: configStore.language || 'en',
      userPersona: userPersonaPayload,
    })
  } catch (err) {
    // Best-effort: drop placeholder on hard failure.
    const placeholder = chat.messages.find(m => m.id === msgId)
    if (placeholder) {
      const idx = chat.messages.indexOf(placeholder)
      if (idx >= 0) chat.messages.splice(idx, 1)
    }
    _activeMsgIdByChat.delete(chatId)
    _inFlight.delete(chatId)
  }
}
