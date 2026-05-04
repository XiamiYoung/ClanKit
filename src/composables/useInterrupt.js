import { nextTick } from 'vue'
import { useChatsStore } from '../stores/chats'

/**
 * Per-chat interrupt composable — THE SOLE ENTRY POINT for stopping/recalling.
 *
 * Contract (single & group chat unified):
 *   Find every streaming-or-waiting assistant msg in this chat (pendingMsgs).
 *   Compute `anyActivity = pendingMsgs.some(_hasActivity)` — OR across ALL pending
 *   bubbles, never look only at the last one. Single chat is the N=1 degenerate
 *   case of group chat.
 *
 *   - anyActivity = true:
 *       terminate, then for each pending msg: append [Request interrupted by user.]
 *       on the ones with activity, splice-remove the empty placeholders so no
 *       "marker on an empty bubble" ghosts remain. user msg + textarea untouched.
 *
 *   - anyActivity = false (every pending bubble is empty):
 *       terminate, splice-remove all empty placeholders, delete the user msg,
 *       recall user text + attachments back to textarea.
 *
 *   Iron law: NEVER decide based on the last pending msg alone — that's the
 *   group-chat regression that keeps coming back. Iterating across pendingMsgs
 *   is mandatory.
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
      // Apply marker / splice on ALL streaming assistant msgs — group chat may
      // have N. Single chat is the N=1 degenerate case. _applyInterruptMarker:
      //   has activity → append marker, streaming=false
      //   empty       → splice out
      const streamingMsgs = (chat.messages || []).filter(
        m => m.streaming && m.role === 'assistant' && !m.isWaitingIndicator
      )
      for (const msg of streamingMsgs) {
        _applyInterruptMarker(chat, msg)
      }
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

    // Collect ALL streaming-or-waiting assistant msgs (group chat: up to N).
    // Single chat is the N=1 degenerate case.
    const pendingMsgs = chat.messages.filter(
      m => m.role === 'assistant' && (m.streaming || m.isWaitingIndicator)
    )
    if (pendingMsgs.length === 0) return

    _busy = true

    // anyActivity must cover the WHOLE turn, not just msgs still streaming.
    // Sequence that motivates this: user sends → Cindy starts (empty) → Esc
    // marks Cindy and stops → Aisha is queued and starts (empty) → Esc again.
    // At second Esc, pendingMsgs=[Aisha (empty)] so pending-only check would
    // flip anyActivity=false → recall path → user msg deleted, even though
    // Cindy already produced output earlier in this same turn. Look at every
    // assistant msg since the last user msg; if any of them has any content,
    // we are NOT in the "recall" branch.
    const lastUserIdx = chat.messages.map(m => m.role).lastIndexOf('user')
    const turnSlice = lastUserIdx === -1 ? chat.messages : chat.messages.slice(lastUserIdx + 1)
    const anyActivity = turnSlice.some(
      m => m.role === 'assistant' && !m.isWaitingIndicator && _hasActivity(m)
    )

    // Step 1: terminate every running agent in this chat. _stopAgent matches
    // by chatId prefix (all chatId:agentId loops stop together) AND iterates
    // every streaming assistant msg to apply marker (with activity) or splice
    // (empty placeholder).
    await _stopAgent(cid)

    // Step 2: at least one agent had activity → bubbles already handled by
    // _stopAgent (active ones marked, empty ones spliced). user msg untouched.
    if (anyActivity) {
      _busy = false
      return
    }

    // Step 3: every pending bubble was empty → all spliced by _stopAgent.
    // Recall the user's prompt to the textarea.
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
