import { ref, reactive, computed, nextTick } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useChatsStore } from '../stores/chats'
import { useConfigStore } from '../stores/config'
import { useAgentsStore } from '../stores/agents'
import { useVoiceStore } from '../stores/voice'
import { useModelsStore } from '../stores/models'
import { parseMentions } from '../utils/mentions'
import { useI18n } from '../i18n/useI18n'
import { useInterrupt } from './useInterrupt'

/**
 * Build a tool execution log string from tool segments.
 * Appended to assistant message content so the LLM can see previous tool
 * interactions and learn from failures across turns.
 * @param {Array} toolSegs - Array of {type:'tool', name, input, output} segments
 * @returns {string} Tool log text to append, or '' if no tool segments
 */
const TOOL_ERROR_RE = /Error|error|Traceback|ENOENT|not found|command not|fatal:|No such file|Invalid switch|ModuleNotFoundError|ImportError|No module named|exit.code[:\s]+[1-9]/i
export function buildToolLog(toolSegs) {
  if (!toolSegs || toolSegs.length === 0) return ''
  const log = toolSegs.map((s, i) => {
    const outStr = String(s.output || '')
    const ok = outStr && !TOOL_ERROR_RE.test(outStr.slice(0, 300))
    const inputSummary = typeof s.input === 'string' ? s.input.slice(0, 500) : JSON.stringify(s.input || {}).slice(0, 500)
    const outputSummary = outStr.slice(0, 200)
    return `${i + 1}. ${ok ? '✓' : '✗'} ${s.name}(${inputSummary}) → ${outputSummary}`
  }).join('\n')
  return `\n\n[Tool execution log from this response:\n${log}\n]`
}

export function useSendMessage({
  inputText,
  inputLongBlobs,
  attachments,
  quotedMessage,
  mentionInputRef,
  userScrolled,
  scrollToBottom,
  dbg,
  getQuotedSenderName,
  perChatStreamingMsgId,
  perChatStreamingSegments,
  collaborationCancelled,
  isInCollaborationLoop,
  runningAgentKeys,
  streamingSeconds,
  historyContextSources,
  _clearHistoryCountdown,
  applyProviderCredsToConfig,
  _fireGroupAgentsDirect,
  activeRunning,
  activeSystemAgentIds,
  enabledSkillObjects,
  stickyTarget,
  programmaticScroll,
}) {
  const chatsStore = useChatsStore()
  const configStore = useConfigStore()
  const agentsStore = useAgentsStore()
  const voiceStore = useVoiceStore()
  const modelsStore = useModelsStore()
  const { t } = useI18n()

  // ── Internal state ──────────────────────────────────────────────────────────
  const pendingInterrupt = reactive({ text: '', attachments: [], visible: false, countdown: 0 })
  let _interruptTimerId = null
  // longBlobs for the current pending send (set by handleChatWindowSend before calling sendMessage)
  let _pendingLongBlobs = null

  const perChatDrafts = new Map() // chatId → { text, attachments }
  let streamingTimer = null
  const isCompacting = ref(false)
  const _codingModeContext = ref(null)

  // Interrupt logic — shared with grid panels via the useInterrupt composable.
  const { interrupt, _stopAgent } = useInterrupt({
    chatId: () => chatsStore.activeChatId,
    inputText, attachments, mentionInputRef,
    collaborationCancelled, isInCollaborationLoop, runningAgentKeys,
    dbg,
  })

  // ── Streaming timer ─────────────────────────────────────────────────────────
  function startStreamingTimer() {
    stopStreamingTimer()
    streamingSeconds.value = 0
    streamingTimer = setInterval(() => { streamingSeconds.value++ }, 1000)
  }
  function stopStreamingTimer() {
    if (streamingTimer) { clearInterval(streamingTimer); streamingTimer = null }
  }

  // ── Draft save/restore ──────────────────────────────────────────────────────
  function _saveDraftForChat(chatId) {
    if (!chatId) return
    const blobs = inputLongBlobs?.value || {}
    const hasBlobs = Object.keys(blobs).length > 0
    if (!inputText.value && attachments.value.length === 0 && !hasBlobs) {
      perChatDrafts.delete(chatId)
      return
    }
    perChatDrafts.set(chatId, {
      text: inputText.value,
      attachments: [...attachments.value],
      longBlobs: hasBlobs ? { ...blobs } : {},
    })
  }

  function _restoreDraftForChat(chatId) {
    const draft = perChatDrafts.get(chatId)
    inputText.value = draft?.text || ''
    attachments.value = draft?.attachments ? [...draft.attachments] : []
    if (inputLongBlobs) inputLongBlobs.value = draft?.longBlobs ? { ...draft.longBlobs } : {}
  }

  // ── Interrupt management ─────────────────────────────────────────────────────
  function _clearInterruptTimer() {
    if (_interruptTimerId) { clearInterval(_interruptTimerId); _interruptTimerId = null }
  }

  function showInterruptConfirm(text, capturedAttachments) {
    _clearInterruptTimer()
    pendingInterrupt.text = text
    pendingInterrupt.attachments = [...capturedAttachments]
    pendingInterrupt.countdown = 3
    pendingInterrupt.visible = true
    _interruptTimerId = setInterval(() => {
      pendingInterrupt.countdown--
      if (pendingInterrupt.countdown <= 0) {
        confirmInterrupt()
      }
    }, 1000)
  }

  async function confirmInterrupt() {
    _clearInterruptTimer()
    const text = pendingInterrupt.text
    const atts = [...pendingInterrupt.attachments]
    pendingInterrupt.visible = false
    pendingInterrupt.text = ''
    pendingInterrupt.attachments = []
    pendingInterrupt.countdown = 0

    const chatId = chatsStore.activeChatId
    if (!chatId) return

    // Stop all running agents first (internal _stopAgent, not the public interrupt)
    await _stopAgent(chatId)
    // Wait briefly for stop to propagate
    await new Promise(r => setTimeout(r, 100))

    // Re-fill input and send
    inputText.value = text
    attachments.value = atts
    await nextTick()
    sendMessage()
  }

  function cancelInterrupt() {
    _clearInterruptTimer()
    // Put message back in input box
    inputText.value = pendingInterrupt.text
    attachments.value = [...pendingInterrupt.attachments]
    pendingInterrupt.visible = false
    pendingInterrupt.text = ''
    pendingInterrupt.attachments = []
    pendingInterrupt.countdown = 0
    nextTick(() => mentionInputRef.value?.focus())
  }

  // interrupt / _stopAgent live in useInterrupt (initialized at top of this composable).

  // ── sendMessage ─────────────────────────────────────────────────────────────
  async function sendMessage() {
    collaborationCancelled.value = false
    // Clear any history context banner when user sends a new message
    if (chatsStore.activeChatId) { _clearHistoryCountdown(); historyContextSources.delete(chatsStore.activeChatId) }
    const rawText = inputText.value.trim()
    const hasAttachments = attachments.value.length > 0
    dbg(`sendMessage called: text="${rawText.slice(0,30)}" attachments=${attachments.value.length} isRunning=${activeRunning.value} activeChatId=${chatsStore.activeChatId}`)
    if (!rawText && !hasAttachments) {
      dbg('sendMessage early return: nothing to send', 'warn')
      return
    }

    // Prepend quoted message if present
    let text = rawText
    const pendingQuote = quotedMessage.value
    if (pendingQuote) {
      const quotedName = getQuotedSenderName(pendingQuote)
      text = `> **${quotedName}:** ${pendingQuote.content.slice(0, 500)}${pendingQuote.content.length > 500 ? '...' : ''}\n\n${rawText}`
      quotedMessage.value = null
    }

    // Pull any chip-backed long blobs from the unified editor. Callers that use
    // the legacy explicit path (setPendingLongBlobs + inputText with markers)
    // still work — we merge rather than overwrite.
    if (inputLongBlobs?.value && Object.keys(inputLongBlobs.value).length > 0) {
      _pendingLongBlobs = { ...(_pendingLongBlobs || {}), ...inputLongBlobs.value }
      inputLongBlobs.value = {}
    }

    // If agents are running, show interrupt confirmation instead of sending directly
    const cid = chatsStore.activeChatId
    const thisChat = chatsStore.chats.find(c => c.id === cid)
    if (thisChat?.isRunning) {
      if (!cid) return
      // Capture attachments before clearing UI
      const capturedAttachments = [...attachments.value]
      inputText.value = ''
      attachments.value = []
      perChatDrafts.delete(cid)
      mentionInputRef.value?.resetHeight()
      // Show interrupt confirmation bar with 3s countdown
      showInterruptConfirm(text, capturedAttachments)
      dbg(`Interrupt confirm shown: "${text.slice(0,30)}…"`, 'info')
      return
    }

    const chatId = chatsStore.activeChatId
    if (!chatId) {
      dbg('sendMessage early return: no activeChatId', 'error')
      return
    }

    // Guard: agent loop only works in Electron
    if (!window.electronAPI?.runAgent) {
      dbg('ERROR: window.electronAPI is not available — running in browser, not Electron', 'error')
      await chatsStore.addMessage(chatId, { role: 'user', content: text })
      await chatsStore.addMessage(chatId, {
        role: 'assistant',
        content: 'Agent loop is not available in browser mode. Please use the Electron window (not localhost:5173 in a browser).'
      })
      scrollToBottom()
      return
    }

    // Capture and clear attachments before resetting UI
    const pendingAttachments = [...attachments.value]
    attachments.value = []
    inputText.value = ''
    perChatDrafts.delete(cid)
    mentionInputRef.value?.resetHeight()

    let waitingMsgId = null
    let userMsgId = null
    let waitingTimeoutTimer = null

    const clearWaitingIndicator = () => {
      if (waitingTimeoutTimer) { clearTimeout(waitingTimeoutTimer); waitingTimeoutTimer = null }
      const c = chatsStore.chats.find(x => x.id === chatId)
      if (!c?.messages) return
      const idx = c.messages.findIndex(m => m.id === waitingMsgId || (m.isWaitingIndicator && m.waitingState === 'running'))
      if (idx >= 0) c.messages.splice(idx, 1)
    }

    const failWaitingIndicator = (errorText) => {
      if (waitingTimeoutTimer) { clearTimeout(waitingTimeoutTimer); waitingTimeoutTimer = null }
      const c = chatsStore.chats.find(x => x.id === chatId)
      if (!c?.messages) return
      const idx = c.messages.findIndex(m => m.id === waitingMsgId || (m.isWaitingIndicator && m.sourceUserMessageId === userMsgId))
      if (idx < 0) return
      const wait = c.messages[idx]
      wait.waitingState = 'error'
      wait.waitingError = errorText || t('chats.preResponseFailed')
      wait.streaming = false
      if (wait.streamingStartedAt) wait.durationMs = Date.now() - wait.streamingStartedAt
    }

    try {
    // Reset scroll-lock for this new answer
    userScrolled.value = false

    // Capture and clear longBlobs for this send
    const longBlobs = _pendingLongBlobs || {}
    _pendingLongBlobs = null

    // Display content — paths are already in the textarea text
    let displayContent = text

    // Store attachment metadata (without heavy base64 data) on the user message for display
    const attachmentMeta = pendingAttachments.map(a => ({
      id: a.id, name: a.name, type: a.type, path: a.path, size: a.size, preview: a.preview, mediaType: a.mediaType
    }))

    // Guard: suppress onMessagesScroll from re-setting userScrolled while we add messages.
    // Adding messages changes scrollHeight without scrollTop, which fires a scroll event
    // that would otherwise re-enable the scroll lock before scrollToBottom runs.
    programmaticScroll.increment()

    // Add user message (stamp userAgentId so we can track agent switches in history)
    dbg('adding user message…')
    userMsgId = uuidv4()
    const stampChat = chatsStore.chats.find(c => c.id === chatId)
    const stampUserAgentId = stampChat?.userAgentId || agentsStore.defaultUserAgent?.id || null
    await chatsStore.addMessage(chatId, {
      id: userMsgId,
      role: 'user',
      content: displayContent,
      ...(stampUserAgentId ? { userAgentId: stampUserAgentId } : {}),
      ...(attachmentMeta.length > 0 ? { attachments: attachmentMeta } : {}),
      ...(Object.keys(longBlobs).length > 0 ? { longBlobs } : {})
    })

    // Add temporary "waiting for response" indicator
    waitingMsgId = uuidv4()
    await chatsStore.addMessage(chatId, {
      id: waitingMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
      isWaitingIndicator: true,
      waitingState: 'running',
      sourceUserMessageId: userMsgId,
      streamingStartedAt: Date.now()
    })
    await nextTick()
    scrollToBottom(true)

    // Start 15-second timeout: if no response or error comes in time, show failure state
    waitingTimeoutTimer = setTimeout(() => {
      failWaitingIndicator(t('chats.requestTimeout'))
    }, 15000)

    // Clear any stale streaming flags from previous runs that didn't finish cleanly
    const currentChat = chatsStore.chats.find(c => c.id === chatId)
    if (currentChat) {
      for (const m of currentChat.messages) {
        if (m.streaming && !m.isWaitingIndicator) m.streaming = false
      }
    }

    // Mark THIS chat as running (per-chat state, not global)
    const targetChat = chatsStore.chats.find(c => c.id === chatId)
    if (!targetChat) throw new Error('targetChat is null after addMessage')

    // Detect group chat mode — unified: multiple system agents = group
    const isGroup = activeSystemAgentIds.value.length > 1

    // ── Single-agent mode: add streaming placeholder as before ──
    let streamingMsgId = null
    if (!isGroup) {
      clearWaitingIndicator()
      streamingMsgId = uuidv4()
      perChatStreamingMsgId.set(chatId, streamingMsgId)
      streamingSeconds.value = 0
      streamingTimer = setInterval(() => { streamingSeconds.value++ }, 1000)
      perChatStreamingSegments.set(chatId, [])
      dbg('adding streaming placeholder…')
      await chatsStore.addMessage(chatId, {
        id: streamingMsgId,
        role: 'assistant',
        content: '',
        streaming: true,
        streamingStartedAt: Date.now()
      })
    } else {
      // Group mode: streaming placeholders are created by handleChunk(agent_start)
      streamingSeconds.value = 0
      streamingTimer = setInterval(() => { streamingSeconds.value++ }, 1000)
    }

    // Mark running BEFORE nextTick so Escape/Stop buttons appear with the wavebar
    targetChat.isRunning = true

    // Release the guard and force-scroll to show the new messages
    programmaticScroll.decrement()
    scrollToBottom(true)

    // Flush Vue's DOM update so the streaming bubble (spinner) renders immediately
    // before the synchronous config-building work below blocks the JS thread.
    await nextTick()

    // Build messages for API — keep _agentId/_userAgentId metadata so the single-agent
    // path can prefix messages from previous agents (identity-aware history).
    dbg(`targetChat=${targetChat.id} messages=${targetChat.messages?.length ?? 'N/A'}`)

    const apiMessagesRaw = targetChat.messages
      .filter(m => {
        if (m.role === 'user') return !!m.content
        if (m.role === 'assistant' && !m.streaming) return !!(m.content || m.segments?.length)
        return false
      })
      .map(m => {
        let content = m.content || ''
        // Resolve long-blob markers so the LLM sees the full content
        if (m.longBlobs && Object.keys(m.longBlobs).length > 0) {
          content = content.replace(/\{\{BLOB:([a-z0-9-]+)\}\}/g, (_, id) => m.longBlobs[id] ?? '')
        }
        // Inject tool execution log so the LLM can see previous tool interactions
        // and learn from failures across turns (avoid repeating the same mistakes).
        const toolSegs = (m.segments || []).filter(s => s.type === 'tool' && !s._fromLog)
        if (toolSegs.length > 0) {
          content += buildToolLog(toolSegs)
        }
        return { role: m.role, content, _agentId: m.agentId || null, _userAgentId: m.userAgentId || null }
      })
      .filter(m => !!m.content)

    // Resolve agent for this run — use activeSystemAgentIds (honours groupAgentIds fallback)
    // instead of targetChat.systemAgentId directly, because after agent switches the
    // persisted systemAgentId may still point to the old agent.
    const sysAgentId = isGroup
      ? null  // group path resolves per-agent below
      : (activeSystemAgentIds.value[0] || targetChat.systemAgentId || agentsStore.defaultSystemAgent?.id)
    const sysAgent = sysAgentId ? agentsStore.getAgentById(sysAgentId) : agentsStore.defaultSystemAgent

    // Stamp agentId on the single-agent streaming placeholder now that sysAgent is known.
    // Without this, persisted messages have no agentId, so mid-chat agent switches cannot
    // detect which AI wrote earlier turns and prevent identity confusion.
    if (!isGroup && streamingMsgId && sysAgent?.id) {
      const streamingMsg = targetChat.messages.find(m => m.id === streamingMsgId)
      if (streamingMsg) streamingMsg.agentId = sysAgent.id
    }

    dbg(`sendMessage → chatId=${chatId} isGroup=${isGroup} msgs=${apiMessagesRaw.length} skills=${enabledSkillObjects.value.length}`)

    // Coding Mode: load CLAUDE.md context (Primary: watcher-cached, Fallback: IPC read)
    let claudeContext = null
    if (targetChat.codingMode && targetChat.workingPath) {
      try {
        const cached = targetChat.id === chatsStore.activeChatId ? _codingModeContext.value : null
        claudeContext = cached ?? (
          window.electronAPI?.claude?.loadContext
            ? await window.electronAPI.claude.loadContext(targetChat.workingPath)
            : null
        )
      } catch (err) {
        console.warn('[CodingMode] Failed to load CLAUDE.md context:', err)
      }
    }

    // Chunks are handled by the persistent handleChunk listener registered in onMounted

    try {
      // Guard: if user pressed Escape/Stop during config building (between isRunning=true
      // and this point), abort before sending the IPC call. Without this, stopAgent clears
      // Vue state but the IPC fires afterwards, starting an unstoppable agent loop.
      if (collaborationCancelled.value || !targetChat.isRunning) {
        dbg('sendMessage aborted: user interrupted during setup', 'info')
        clearWaitingIndicator()
        return // falls through to finally block for cleanup
      }

      if (isGroup) {
        // Set isInCollaborationLoop BEFORE calling IPC so agent_end events
        // during the first round don't prematurely clear isRunning.
        isInCollaborationLoop.value = true
      }

      // Pre-mark agents as running so the finally block doesn't clear isRunning
      // before agent_end chunks arrive (sendMessage returns immediately).
      for (const id of activeSystemAgentIds.value) runningAgentKeys.add(`${chatId}:${id}`)

      // ── Unified dispatch — both single and group paths ──
      // Electron handles: provider resolution, @mention parsing, resolveAddressees,
      // dispatchGroupTasks, buildAgentRuns, collaboration loop, memory extraction.
      // Completion is signalled via send_message_complete / send_message_error chunks.
      // Resolve blob markers for the IPC call (LLM always sees full content)
      const resolvedText = Object.keys(longBlobs).length > 0
        ? text.replace(/\{\{BLOB:([a-z0-9-]+)\}\}/g, (_, id) => longBlobs[id] ?? '')
        : text
      window.electronAPI.sendMessage({
        chatId,
        messages: JSON.parse(JSON.stringify(apiMessagesRaw)),
        groupIds: JSON.parse(JSON.stringify(activeSystemAgentIds.value)),
        isGroup,
        text: resolvedText,
        pendingAttachments: pendingAttachments.length > 0 ? JSON.parse(JSON.stringify(pendingAttachments)) : [],
        enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value)),
        stickyTargetIds: JSON.parse(JSON.stringify(stickyTarget.value || [])),
        targetChatMeta: {
          permissionMode: targetChat.permissionMode || 'inherit',
          chatAllowList: JSON.parse(JSON.stringify(targetChat.chatAllowList || [])),
          chatDangerOverrides: JSON.parse(JSON.stringify(targetChat.chatDangerOverrides || [])),
          maxAgentRounds: targetChat.maxAgentRounds ?? 10,
          workingPath: targetChat.workingPath || null,
          codingMode: !!targetChat.codingMode,
          claudeContext: claudeContext ? JSON.parse(JSON.stringify(claudeContext)) : null,
          userAgentId: targetChat.userAgentId || null,
          systemAgentId: isGroup ? null : (activeSystemAgentIds.value[0] || targetChat.systemAgentId || null),
          groupAudienceMode: targetChat.groupAudienceMode || 'auto',
          groupAudienceAgentIds: JSON.parse(JSON.stringify(targetChat.groupAudienceAgentIds || [])),
          modelContextWindows: modelsStore.getAllContextWindows(),
          chatType: targetChat.type || 'chat',
          analysisTargetAgentId: targetChat.analysisTargetAgentId || null,
        },
      }).catch(err => dbg(`sendMessage IPC error: ${err.message}`, 'error'))

      // Return immediately — completion is signalled via send_message_complete chunk in handleChunk.
      // handleChunk(agent_end) finalizes single-agent streaming messages just as it does for group.

      await chatsStore.persist?.()
      scrollToBottom()
    } catch (err) {
      dbg(`EXCEPTION in runAgent: ${err.message}`, 'error')
      failWaitingIndicator(err.message)
      const chat = chatsStore.chats.find(c => c.id === chatId)
      if (chat && chat.messages) {
        if (streamingMsgId) {
          const msg = chat.messages.find(m => m.id === streamingMsgId)
          if (msg) {
            msg.content = `Error: ${err.message}`
            msg.streaming = false
            if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
          }
        }
        // Also stop any streaming group messages
        for (const m of chat.messages) {
          if (m.streaming) m.streaming = false
        }
      }
    } finally {
      // Check if side-fired agents (via runAgentAdditional) are still running for this chat
      const hasActiveAgents = [...runningAgentKeys].some(k => k.startsWith(chatId + ':'))

      // Only stop the streaming timer when all agents are done.
      // sendMessage now returns immediately (fire-and-forget IPC), so the timer should
      // keep counting until send_message_complete arrives.
      if (!hasActiveAgents) {
        if (streamingTimer) { clearInterval(streamingTimer); streamingTimer = null; streamingSeconds.value = 0 }
      }
      dbg(`Agent loop done. Side-fired agents still active: ${hasActiveAgents}`)

      // Use fresh lookup to guarantee we clear the live reactive object
      // (targetChat ref could theoretically become stale if the array was mutated)
      const finChat = chatsStore.chats.find(c => c.id === chatId)

      // Only clear isRunning if no side-fired agents remain — otherwise the chat
      // should stay in "running" state until ALL agents finish.
      if (!hasActiveAgents) {
        if (finChat) {
          finChat.isRunning = false
          finChat.isThinking = false
          finChat.isCallingTool = false
          finChat.currentToolCall = null
        }
        targetChat.isRunning = false
        targetChat.isThinking = false
        targetChat.isCallingTool = false
        targetChat.currentToolCall = null

        // Always mark completed (display logic checks if active before showing "Done" label)
        chatsStore.markCompleted(chatId)
      } else {
        // Still clear thinking/tool state for the primary run — the side-fired agent(s)
        // will manage their own flags via their own IPC flow
        if (finChat) {
          finChat.isThinking = false
          finChat.isCallingTool = false
          finChat.currentToolCall = null
        }
        targetChat.isThinking = false
        targetChat.isCallingTool = false
        targetChat.currentToolCall = null
      }

      // Only clear streaming maps when no agents are still running.
      // Since sendMessage now returns immediately (fire-and-forget), agents remain
      // in runningAgentKeys until their agent_end chunks arrive — defer cleanup there.
      if (!hasActiveAgents) {
        perChatStreamingMsgId.delete(chatId)
        perChatStreamingSegments.delete(chatId)
        for (const key of [...perChatStreamingMsgId.keys()]) {
          if (key.startsWith(chatId + ':')) {
            perChatStreamingMsgId.delete(key)
            perChatStreamingSegments.delete(key)
          }
        }
      }
      // Only clear runningAgentKeys if no side-fired agents remain
      if (!hasActiveAgents) {
        for (const key of [...runningAgentKeys]) {
          if (key.startsWith(chatId + ':')) runningAgentKeys.delete(key)
        }
      }
      // Only clear collaboration loop flag if no agents are still running.
      // When group chat is delegated to Node.js (agent:send-message), agents remain
      // in runningAgentKeys until agent_end chunks arrive — so this is gated correctly.
      if (!hasActiveAgents) isInCollaborationLoop.value = false

      // Also clear streaming flag on any remaining streaming messages (safety net).
      // But only if no side-fired agents are still running — otherwise their streaming
      // messages would be incorrectly terminated.
      if (!hasActiveAgents && finChat?.messages) {
        for (const m of finChat.messages) {
          if (m.streaming) {
            m.streaming = false
            if (m.streamingStartedAt) m.durationMs = Date.now() - m.streamingStartedAt
          }
        }
      }

      // Voice notification + context snapshot only when all agents are done
      if (!hasActiveAgents) {
        if (voiceStore.isCallActive && voiceStore.activeChatId === chatId) {
          const lastMsg = finChat?.messages?.filter(m => m.role === 'assistant').pop()
          const summary = (typeof lastMsg?.content === 'string' ? lastMsg.content : null)
          if (window.electronAPI?.voice?.notifyTaskComplete) {
            window.electronAPI.voice.notifyTaskComplete(summary)
          }
        }

      }

      // (queue system removed — interrupt & steer replaces queuing)
    }
    } catch (outerErr) {
      // Catch errors from addMessage, activeChat access, etc.
      dbg(`OUTER EXCEPTION: ${outerErr.message}\n${outerErr.stack?.split('\n').slice(0,3).join(' | ')}`, 'error')
      failWaitingIndicator(outerErr.message)
      // Clear running state on the target chat
      const errChat = chatsStore.chats.find(c => c.id === chatId)
      if (errChat) {
        errChat.isRunning = false
        errChat.isThinking = false
      }
      // Clear streaming flag on the message so the indicator stops
      const outerMsgId = perChatStreamingMsgId.get(chatId)
      if (outerMsgId) {
        if (errChat && errChat.messages) {
          const msg = errChat.messages.find(m => m.id === outerMsgId)
          if (msg) {
            msg.streaming = false
            if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
          }
        }
      }
      perChatStreamingMsgId.delete(chatId)
      perChatStreamingSegments.delete(chatId)
      // Also clean up group agent keys (chatId:agentId) that the outer catch path misses
      for (const key of [...perChatStreamingMsgId.keys()]) {
        if (key.startsWith(chatId + ':')) {
          perChatStreamingMsgId.delete(key)
          perChatStreamingSegments.delete(key)
        }
      }
    } finally {
      // Last-resort safety net: always ensure isRunning is cleared for this chat.
      // Skip if agents are still running (group chat delegated to Node.js orchestration).
      const safetyChat = chatsStore.chats.find(c => c.id === chatId)
      const safetyHasActiveAgents = [...runningAgentKeys].some(k => k.startsWith((chatId || '') + ':'))
      if (safetyChat && safetyChat.isRunning && !safetyHasActiveAgents) {
        dbg('SAFETY NET: isRunning was still true after outer catch — force-clearing', 'warn')
        safetyChat.isRunning = false
        safetyChat.isThinking = false
      }
      if (waitingTimeoutTimer) { clearTimeout(waitingTimeoutTimer); waitingTimeoutTimer = null }
    }
  }

  // ── Plan Approval Functions ────────────────────────────────────────────────────
  async function approvePlan(msg) {
    const chatId = chatsStore.activeChatId
    if (!chatId) return
    chatsStore.setPlanState(chatId, msg.id, 'approved')

    const targetChat = chatsStore.chats.find(c => c.id === chatId)
    if (!targetChat?.messages) return

    // Resume streaming on the SAME assistant message (no new user bubble)
    msg.streaming = true
    msg.streamingStartedAt = Date.now()
    targetChat.isRunning = true
    collaborationCancelled.value = false

    // Route incoming chunks to the existing message
    perChatStreamingMsgId.set(chatId, msg.id)
    perChatStreamingSegments.set(chatId, [...(msg.segments || [])])
    startStreamingTimer()

    // Pre-mark agents as running
    for (const id of activeSystemAgentIds.value) runningAgentKeys.add(`${chatId}:${id}`)

    // Build messages array (same logic as sendMessage)
    const apiMessagesRaw = targetChat.messages
      .filter(m => {
        if (m.role === 'user') return !!m.content
        if (m.role === 'assistant' && !m.streaming) return !!(m.content || m.segments?.length)
        return false
      })
      .map(m => {
        let content = m.content || ''
        const toolSegs = (m.segments || []).filter(s => s.type === 'tool' && !s._fromLog)
        if (toolSegs.length > 0) content += buildToolLog(toolSegs)
        return { role: m.role, content, _agentId: m.agentId || null, _userAgentId: m.userAgentId || null }
      })
      .filter(m => !!m.content)

    // Append plan approval instruction as a user message so the agent sees it
    const planInstruction = `[Plan Approved — Execute Now]\n\nTitle: ${msg.planData.title}\n` +
      msg.planData.steps.map((s, i) => `${i + 1}. ${s.label}`).join('\n') +
      '\n\nThe user has approved this plan. Execute it step by step now.'
    apiMessagesRaw.push({ role: 'user', content: planInstruction })

    const isGroup = activeSystemAgentIds.value.length > 1
    if (isGroup) isInCollaborationLoop.value = true

    // Coding Mode context
    let claudeContext = null
    if (targetChat.codingMode && targetChat.workingPath) {
      try {
        const cached = targetChat.id === chatsStore.activeChatId ? _codingModeContext.value : null
        claudeContext = cached ?? (
          window.electronAPI?.claude?.loadContext
            ? await window.electronAPI.claude.loadContext(targetChat.workingPath)
            : null
        )
      } catch {}
    }

    // Fire the same unified IPC — chunks route to existing msg via perChatStreamingMsgId
    window.electronAPI.sendMessage({
      chatId,
      messages: JSON.parse(JSON.stringify(apiMessagesRaw)),
      groupIds: JSON.parse(JSON.stringify(activeSystemAgentIds.value)),
      isGroup,
      text: planInstruction,
      pendingAttachments: [],
      enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value)),
      stickyTargetIds: JSON.parse(JSON.stringify(stickyTarget.value || [])),
      targetChatMeta: {
        permissionMode: targetChat.permissionMode || 'inherit',
        chatAllowList: JSON.parse(JSON.stringify(targetChat.chatAllowList || [])),
        chatDangerOverrides: JSON.parse(JSON.stringify(targetChat.chatDangerOverrides || [])),
        maxAgentRounds: targetChat.maxAgentRounds ?? 10,
        workingPath: targetChat.workingPath || null,
        codingMode: !!targetChat.codingMode,
        claudeContext: claudeContext ? JSON.parse(JSON.stringify(claudeContext)) : null,
        userAgentId: targetChat.userAgentId || null,
        systemAgentId: isGroup ? null : (activeSystemAgentIds.value[0] || targetChat.systemAgentId || null),
        groupAudienceMode: targetChat.groupAudienceMode || 'auto',
        groupAudienceAgentIds: JSON.parse(JSON.stringify(targetChat.groupAudienceAgentIds || [])),
        modelContextWindows: modelsStore.getAllContextWindows(),
        chatType: targetChat.type || 'chat',
        analysisTargetAgentId: targetChat.analysisTargetAgentId || null,
      },
    }).catch(err => dbg(`approvePlan IPC error: ${err.message}`, 'error'))

    scrollToBottom()
  }

  function rejectPlan(msg) {
    chatsStore.setPlanState(chatsStore.activeChatId, msg.id, 'rejected')
  }

  function refinePlan(msg) {
    chatsStore.setPlanState(chatsStore.activeChatId, msg.id, 'rejected')
    // Pre-fill the textarea with a refinement prompt and focus
    inputText.value = 'Refine the plan: '
    nextTick(() => mentionInputRef.value?.focus())
  }

  // ── Compact Context ─────────────────────────────────────────────────────────
  // Run one standalone compaction for a single agent. Inserts a hidden user/assistant
  // summary pair tagged with `_compactionAgentId` (so only this agent sees it in
  // `_buildAgentRuns` on the next turn) and a visible banner naming the agent.
  async function _compactStandaloneForAgent(chatId, targetChat, agent, { isGroup = false } = {}) {
    const agentId   = agent?.id || null
    // Only expose the agent name in the banner for group chats — single-agent chats
    // only have one participant so the label is redundant noise.
    const agentName = (isGroup && agent?.name) ? agent.name : null
    const tokensBefore = targetChat.contextMetrics?.inputTokens || 0

    const apiMessages = targetChat.messages
      .filter(m => (m.role === 'user' && m.content) || (m.role === 'assistant' && !m.streaming && m.content))
      // Filter to this agent's relevant history: drop other agents' compaction pairs
      // so this compaction call doesn't re-summarize another agent's summary.
      .filter(m => !(m.compaction && m._compactionAgentId && m._compactionAgentId !== agentId))
      .map(m => ({ role: m.role, content: m.content }))

    const raw = configStore.config
    const chatProvider = agent?.providerId || 'anthropic'
    const cfg = { ...raw }
    applyProviderCredsToConfig(cfg, chatProvider)
    const resolvedModel = agent?.modelId || null
    if (resolvedModel) cfg.customModel = resolvedModel

    try {
      const res = await window.electronAPI.compactContextStandalone({
        chatId,
        messages: JSON.parse(JSON.stringify(apiMessages)),
        config: JSON.parse(JSON.stringify(cfg)),
        enabledAgents: [],
        enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value))
      })

      if (res.success) {
        dbg(`Compaction done for ${agentName || 'agent'} — input tokens: ${res.metrics?.inputTokens?.toLocaleString() ?? '?'}`, 'success')

        // Update chat-level metrics only for single-agent chats; group chats keep per-agent.
        if (res.metrics && !agentId) targetChat.contextMetrics = { ...res.metrics }

        await chatsStore.addMessage(chatId, {
          role: 'user',
          content: '[Context compaction requested]',
          compaction: true,
          hidden: true,
          _compactionAgentId: agentId,
        })
        await chatsStore.addMessage(chatId, {
          role: 'assistant',
          content: res.assistantContent || '[Context compacted]',
          compaction: true,
          hidden: true,
          _compactionAgentId: agentId,
        })
        const tokensAfter = res.metrics?.inputTokens || 0
        await chatsStore.addMessage(chatId, {
          role: 'system',
          compaction: true,
          compactionKind: 'manual',
          agentId,
          agentName,
          tokensBefore,
          tokensAfter,
          content: 'Context compacted',
          segments: [{ type: 'text', content: 'Context compacted' }],
          streaming: false,
        })
      } else {
        dbg(`Compaction failed for ${agentName || 'agent'}: ${res.error}`, 'error')
        await chatsStore.addMessage(chatId, {
          role: 'system',
          agentId,
          agentName,
          content: `Context compaction failed${agentName ? ' for ' + agentName : ''}: ${res.error || 'unknown error'}`
        })
      }
    } catch (err) {
      dbg(`Compaction error for ${agentName || 'agent'}: ${err.message}`, 'error')
    }
  }

  async function compactContext() {
    const chatId = chatsStore.activeChatId
    if (!chatId) return

    // If agent is running: backend iterates active loops (single + group) and calls
    // requestCompaction on each. Per-agent banners are then emitted via compaction_applied
    // chunks, which useChunkHandler renders into the chat.
    if (activeRunning.value) {
      if (window.electronAPI?.compactContext) {
        dbg('Requesting in-loop compaction…', 'info')
        await window.electronAPI.compactContext(chatId)
      }
      return
    }

    // Standalone compaction when not running
    if (!window.electronAPI?.compactContextStandalone) return

    const targetChat = chatsStore.chats.find(c => c.id === chatId)
    if (!targetChat || !targetChat.messages) return

    isCompacting.value = true
    dbg('Starting standalone compaction…', 'info')

    try {
      const groupIds = targetChat.groupAgentIds || []
      const isGroup  = groupIds.length > 1

      if (!isGroup) {
        // Single-agent path (system agent of this chat, or default)
        const sysAgentId = targetChat.systemAgentId || agentsStore.defaultSystemAgent?.id
        const sysAgent   = sysAgentId ? agentsStore.getAgentById(sysAgentId) : agentsStore.defaultSystemAgent
        await _compactStandaloneForAgent(chatId, targetChat, sysAgent, { isGroup: false })
      } else {
        // Group path: compact each agent's view in parallel using that agent's own provider.
        const agents = groupIds.map(id => agentsStore.getAgentById(id)).filter(Boolean)
        dbg(`Group compaction — ${agents.length} agent(s): ${agents.map(a => a.name).join(', ')}`, 'info')
        await Promise.all(agents.map(a => _compactStandaloneForAgent(chatId, targetChat, a, { isGroup: true })))
      }

      scrollToBottom()
    } catch (err) {
      dbg(`Compaction error: ${err.message}`, 'error')
    } finally {
      isCompacting.value = false
    }
  }

  // ── Queue stubs (queue system removed — interrupt & steer replaces queuing) ──
  const pendingQueue = computed(() => [])
  function removeFromQueue() {}
  function processQueuedMessage() {}

  function setPendingLongBlobs(blobs) { _pendingLongBlobs = blobs || null }

  // ── Return public API ───────────────────────────────────────────────────────
  return {
    sendMessage,
    setPendingLongBlobs,
    interrupt,
    approvePlan,
    rejectPlan,
    refinePlan,
    compactContext,
    pendingInterrupt,
    confirmInterrupt,
    cancelInterrupt,
    pendingQueue,
    removeFromQueue,
    processQueuedMessage,
    _saveDraftForChat,
    _restoreDraftForChat,
    _codingModeContext,
    isCompacting,
    streamingTimer,
    startStreamingTimer,
    stopStreamingTimer,
  }
}
