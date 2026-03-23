import { nextTick } from 'vue'
import { useChatsStore } from '../stores/chats'
import { useAgentsStore } from '../stores/agents'
import { useI18n } from '../i18n/useI18n'
import { v4 as uuidv4 } from 'uuid'

/**
 * Message-level operations: copy, delete, quote, resend, retry, format helpers.
 *
 * @param {Object} deps
 * @param {import('vue').Ref} deps.copiedId        - ref(null) for copy-flash state
 * @param {import('vue').Ref} deps.quotedMessage   - ref(null) for quoted message
 * @param {import('vue').Ref} deps.attachments     - ref([]) for pending attachments
 * @param {import('vue').Ref} deps.inputText       - ref('') for input text
 * @param {import('vue').Ref} deps.mentionInputRef - ref to the ChatMentionInput component
 * @param {import('vue').Ref} deps.confirmDeleteTarget - ref for delete-confirm modal state
 * @param {Function}          deps.sendMessage     - sendMessage() function from ChatsView
 */
export function useMessageOps({
  copiedId,
  quotedMessage,
  attachments,
  inputText,
  mentionInputRef,
  confirmDeleteTarget,
  sendMessage,
} = {}) {
  const chatsStore = useChatsStore()
  const agentsStore = useAgentsStore()
  const { t } = useI18n()

  async function copyMessage(msg) {
    try {
      let text = msg.content || ''
      if (msg.segments && msg.segments.length > 0) {
        text = msg.segments.filter(s => s.type === 'text').map(s => s.content).join('\n\n').trim()
      }
      await navigator.clipboard.writeText(text)
      copiedId.value = msg.id
      setTimeout(() => { copiedId.value = null }, 2000)
    } catch (e) {
      console.error('Copy failed', e)
    }
  }

  function requestDeleteMessage(msg) {
    if (!chatsStore.activeChatId) return
    confirmDeleteTarget.value = {
      type: 'message',
      id: chatsStore.activeChatId,
      msgId: msg.id,
      label: (msg.content || '').slice(0, 60) || '(empty message)',
    }
  }

  function quoteMessage(msg) {
    const content = msg.content || ''
    quotedMessage.value = { role: msg.role, content, agentId: msg.agentId || null }
    nextTick(() => mentionInputRef.value?.focus())
  }

  function handleQuoteImage({ img, src }) {
    const mediaType = img.mimeType || 'image/png'
    const base64 = img.data
      || (src.startsWith('data:') ? src.split(',')[1] : null)

    if (!base64) return  // URL-only images not supported

    attachments.value.push({
      id: uuidv4(),
      name: t('chats.quotedImage'),
      type: 'image',
      base64,
      mediaType,
      preview: src,
      size: Math.round(base64.length * 0.75),
      path: null,
      _quoted: true,
    })
    nextTick(() => mentionInputRef.value?.focus())
  }

  function getQuotedSenderName(q) {
    if (!q) return 'Assistant'
    const ac = chatsStore.activeChat
    if (q.role === 'user') {
      const uid = ac?.userAgentId
      const up = uid ? agentsStore.getAgentById(uid) : agentsStore.defaultUserAgent
      return up?.name || 'You'
    }
    if (q.agentId) {
      const p = agentsStore.getAgentById(q.agentId)
      if (p?.name) return p.name
    }
    const sysId = ac?.systemAgentId
    if (sysId) {
      const p = agentsStore.getAgentById(sysId)
      if (p?.name) return p.name
    }
    return agentsStore.defaultSystemAgent?.name || 'Assistant'
  }

  function clearQuote() {
    quotedMessage.value = null
  }

  function formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const Y = d.getFullYear()
    const M = String(d.getMonth() + 1).padStart(2, '0')
    const D = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${Y}-${M}-${D} ${h}:${m}`
  }

  function formatTokenCount(n) {
    if (!n || n === 0) return '0'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return String(n)
  }

  // Bridge for ChatWindow's send event (only fires if default input is used)
  function handleChatWindowSend(text) {
    if (text) inputText.value = text
    sendMessage()
  }

  function handleRetryWaitingIndicator(msg) {
    const chatId = chatsStore.activeChatId
    if (!chatId || !msg) return
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (!chat?.messages) return

    // Find the original user message
    const userMsg = msg.sourceUserMessageId
      ? chat.messages.find(m => m.id === msg.sourceUserMessageId)
      : null

    // Remove the error waiting indicator
    const waitIdx = chat.messages.findIndex(m => m.id === msg.id)
    if (waitIdx >= 0) chat.messages.splice(waitIdx, 1)

    // Remove any empty/streaming assistant placeholders placed after the user message
    if (userMsg) {
      const userMsgIdx = chat.messages.findIndex(m => m.id === userMsg.id)
      if (userMsgIdx >= 0) {
        let i = userMsgIdx + 1
        while (i < chat.messages.length) {
          const m = chat.messages[i]
          if (m.role === 'assistant' && (m.streaming || (!m.content && !(m.segments?.length)))) {
            chat.messages.splice(i, 1)
          } else {
            i++
          }
        }
      }
    }

    if (!userMsg) return

    // Pull the user message back out so sendMessage can re-add it
    const userMsgIdxFinal = chat.messages.findIndex(m => m.id === userMsg.id)
    if (userMsgIdxFinal >= 0) chat.messages.splice(userMsgIdxFinal, 1)

    inputText.value = typeof userMsg.content === 'string' ? userMsg.content : ''
    if (Array.isArray(userMsg.attachments) && userMsg.attachments.length > 0) {
      attachments.value = JSON.parse(JSON.stringify(userMsg.attachments))
    }
    sendMessage()
  }

  function handleResendMessage(msg) {
    const chatId = chatsStore.activeChatId
    if (!chatId || !msg) return
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (!chat?.messages) return

    const waitIdx = chat.messages.findIndex(m => m.isWaitingIndicator && m.sourceUserMessageId === msg.id)
    if (waitIdx >= 0) chat.messages.splice(waitIdx, 1)

    inputText.value = msg.content || ''
    attachments.value = Array.isArray(msg.attachments)
      ? JSON.parse(JSON.stringify(msg.attachments))
      : []
    sendMessage()
  }

  return {
    copyMessage,
    requestDeleteMessage,
    quoteMessage,
    handleQuoteImage,
    getQuotedSenderName,
    clearQuote,
    formatTime,
    formatTokenCount,
    handleChatWindowSend,
    handleRetryWaitingIndicator,
    handleResendMessage,
  }
}
