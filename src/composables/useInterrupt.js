import { nextTick } from 'vue'
import { useChatsStore } from '../stores/chats'

/**
 * Per-chat interrupt composable — THE SOLE ENTRY POINT for stopping/recalling.
 *
 * Contract:
 *   - Agent has NOT started (no text / tool / image / plan in system bubble):
 *       interrupt → terminate, delete user + system bubble, recall user prompt to textarea
 *   - Agent HAS started (any visible content):
 *       interrupt → terminate, keep all bubbles, append [Request interrupted by user.] marker
 *
 * @param {Object}   opts
 * @param {string|()=>string} opts.chatId
 * @param {Ref<string>}  opts.inputText
 * @param {Ref<Array>}   opts.attachments
 * @param {Ref}          opts.mentionInputRef
 * @param {Ref<boolean>} opts.collaborationCancelled
 * @param {Ref<boolean>} opts.isInCollaborationLoop
 * @param {Set}          opts.runningAgentKeys
 */
export function useInterrupt({
  chatId,
  inputText,
  attachments,
  mentionInputRef,
  collaborationCancelled,
  isInCollaborationLoop,
  runningAgentKeys,
}) {
  const chatsStore = useChatsStore()

  function _resolveChatId(override) {
    if (override) return override
    return typeof chatId === 'function' ? chatId() : chatId
  }

  // True when the streaming msg has produced anything the user can see.
  // Pending tool calls (no output yet) do NOT count — user sees "loading" state.
  function _hasActivity(msg) {
    if (!msg || msg.isWaitingIndicator) return false
    if (msg.content?.trim().length > 0) return true
    if (msg.planData) return true
    return (msg.segments || []).some(s => {
      if (s.type === 'text') return !!s.content?.trim()
      if (s.type === 'tool') return s.output !== undefined
      if (s.type === 'agent_step') return false
      return true // image, permission, etc.
    })
  }

  function _applyInterruptMarker(chat, msg) {
    if (!msg || !chat) return
    if (_hasActivity(msg)) {
      msg.content = (msg.content || '') + '\n\n[Request interrupted by user.]'
      msg.streaming = false
    } else {
      const idx = chat.messages?.indexOf(msg) ?? -1
      if (idx !== -1) chat.messages.splice(idx, 1)
    }
  }

  // ── Private: terminate the agent, clean up streaming state ──
  async function _stopAgent(cid) {
    collaborationCancelled.value = true
    isInCollaborationLoop.value = false
    for (const key of [...runningAgentKeys]) {
      if (key.startsWith(cid + ':')) runningAgentKeys.delete(key)
    }
    if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(cid)

    const chat = chatsStore.chats.find(c => c.id === cid)
    if (chat) {
      if (chat.messages) {
        const waitIdx = chat.messages.findIndex(m => m.isWaitingIndicator)
        if (waitIdx >= 0) chat.messages.splice(waitIdx, 1)
      }
      const streamingMsg = chat.messages?.slice().reverse().find(
        m => m.streaming && m.role === 'assistant' && !m.isWaitingIndicator
      )
      if (streamingMsg) _applyInterruptMarker(chat, streamingMsg)
      chat.isRunning = false
      chat.isThinking = false
      chat.isCallingTool = false
      chat.currentToolCall = null
    }
  }

  // ── THE SOLE PUBLIC ENTRY POINT ──
  let _busy = false

  async function interrupt(overrideChatId) {
    if (_busy) return
    const cid = _resolveChatId(overrideChatId)
    if (!cid) return

    const chat = chatsStore.chats.find(c => c.id === cid)
    if (!chat?.messages?.length) return

    // Find the last assistant msg that is streaming or waiting
    const lastAssistantMsg = [...chat.messages].reverse().find(
      m => m.role === 'assistant' && (m.streaming || m.isWaitingIndicator)
    )
    if (!lastAssistantMsg) return

    _busy = true

    // Capture activity BEFORE stopping (stop will modify/remove the msg)
    const hasActivity = _hasActivity(lastAssistantMsg)

    // Step 1: terminate the agent (await ensures cleanup is done before recall)
    await _stopAgent(cid)

    // Step 2: agent had activity → keep all bubbles, done
    if (hasActivity) {
      _busy = false
      return
    }

    // Step 3: agent hadn't started → recall user message to textarea
    const lastUserMsg = [...chat.messages].reverse().find(m => m.role === 'user')
    if (!lastUserMsg) {
      _busy = false
      return
    }

    const retrievedText = lastUserMsg.content || ''
    const retrievedAttachments = lastUserMsg.attachments || []

    if (inputText?.value?.trim()) {
      inputText.value = inputText.value + '\n' + retrievedText
    } else if (inputText) {
      inputText.value = retrievedText
    }
    if (retrievedAttachments.length > 0 && attachments) {
      attachments.value = [...attachments.value, ...retrievedAttachments]
    }

    // Delete the user message bubble
    await chatsStore.deleteMessage(cid, lastUserMsg.id)

    nextTick(() => mentionInputRef?.value?.focus?.())
    _busy = false
  }

  return {
    interrupt,
    _stopAgent,           // internal: used by confirmInterrupt only
    _applyInterruptMarker, // internal: exposed for tests
  }
}
