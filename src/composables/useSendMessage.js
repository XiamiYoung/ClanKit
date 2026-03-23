import { ref, reactive, computed, nextTick } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useChatsStore } from '../stores/chats'
import { useConfigStore } from '../stores/config'
import { useAgentsStore } from '../stores/agents'
import { useVoiceStore } from '../stores/voice'
import { parseMentions } from '../utils/mentions'
import { useI18n } from '../i18n/useI18n'

export function useSendMessage({
  inputText,
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
  perChatQueue,  // reactive Map — created by caller, shared with useChunkHandler
  programmaticScroll,
}) {
  const chatsStore = useChatsStore()
  const configStore = useConfigStore()
  const agentsStore = useAgentsStore()
  const voiceStore = useVoiceStore()
  const { t } = useI18n()

  // ── Internal state ──────────────────────────────────────────────────────────
  const pendingQueue = computed(() => {
    const cid = chatsStore.activeChatId
    if (!cid) return []
    const items = []
    for (const [key, queue] of perChatQueue) {
      if (key === cid || key.startsWith(cid + ':')) {
        const agentId = key.includes(':') ? key.split(':').slice(1).join(':') : null
        const agentName = agentId ? agentsStore.getAgentById(agentId)?.name : null
        for (const item of queue) {
          items.push({ ...item, _queueKey: key, _targetAgent: agentName })
        }
      }
    }
    return items
  })

  const perChatDrafts = new Map() // chatId → { text, attachments }
  let streamingTimer = null
  const isCompacting = ref(false)
  const _codingModeContext = ref(null)

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
    if (!inputText.value && attachments.value.length === 0) {
      perChatDrafts.delete(chatId)
      return
    }
    perChatDrafts.set(chatId, { text: inputText.value, attachments: [...attachments.value] })
  }

  function _restoreDraftForChat(chatId) {
    const draft = perChatDrafts.get(chatId)
    inputText.value = draft?.text || ''
    attachments.value = draft?.attachments ? [...draft.attachments] : []
  }

  // ── Queue management ────────────────────────────────────────────────────────
  function removeFromQueue(idx) {
    const items = pendingQueue.value
    if (idx < 0 || idx >= items.length) return
    const item = items[idx]
    const queueKey = item._queueKey
    if (!queueKey) return
    const queue = perChatQueue.get(queueKey)
    if (!queue) return
    // Compute offset: count items from matching queue keys that precede this one
    const cid = chatsStore.activeChatId
    let offset = 0
    for (const [key, q] of perChatQueue) {
      if (key === queueKey) break
      if (key === cid || key.startsWith(cid + ':')) offset += q.length
    }
    const innerIdx = idx - offset
    if (innerIdx >= 0 && innerIdx < queue.length) {
      queue.splice(innerIdx, 1)
      if (queue.length === 0) perChatQueue.delete(queueKey)
    }
  }

  // ── Last active message + interrupt helpers ─────────────────────────────────
  function getLastActiveMessage(chatId) {
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (!chat?.messages?.length) return { chat: null, msg: null }
    const streaming = [...chat.messages].reverse().find(m => m.streaming)
    return { chat, msg: streaming ?? ([...chat.messages].reverse().find(m => m.role === 'assistant') ?? null) }
  }

  // If the message has content: append inline marker (LLM sees it on resume).
  // If the message is empty (agent stopped before outputting anything): delete the
  // pointless placeholder and push a system bubble instead.
  // type: 'pause' — queue preserved, will auto-continue
  //       'stop'  — queue cleared, waiting for user input
  function _applyInterrupt(chat, msg, type) {
    const inlineMarker = type === 'stop'
      ? '[Request interrupted by user. Queue cleared.]'
      : '[Request interrupted by user]'
    const bubbleText = type === 'stop'
      ? 'Request stopped by user. Queue cleared — type a new message to continue.'
      : 'Request interrupted by user. Queued prompts will resume automatically.'

    if (!msg) {
      chat?.messages?.push({
        id: uuidv4(), role: 'system', interruptType: type, content: bubbleText,
        segments: [{ type: 'text', content: bubbleText }],
        streaming: false, timestamp: Date.now(),
      })
      return
    }

    const hasContent = msg.content?.trim().length > 0
    if (hasContent) {
      msg.content += `\n\n${inlineMarker}`
      msg.streaming = false
    } else {
      const idx = chat?.messages?.indexOf(msg) ?? -1
      if (idx !== -1) chat.messages.splice(idx, 1)
      chat?.messages?.push({
        id: uuidv4(), role: 'system', interruptType: type, content: bubbleText,
        segments: [{ type: 'text', content: bubbleText }],
        streaming: false, timestamp: Date.now(),
      })
    }
  }

  // ── Stop agent ──────────────────────────────────────────────────────────────
  // Stop (hard stop): clear the queue first, then interrupt — nothing auto-runs afterwards.
  async function stopAgent(chatId) {
    if (!chatId) chatId = chatsStore.activeChatId
    // Clear all queues for this chat (both chat-level and per-agent keys)
    for (const key of [...perChatQueue.keys()]) {
      if (key === chatId || key.startsWith(chatId + ':')) perChatQueue.delete(key)
    }
    // Cancel collaboration loop and clear running agent tracking
    collaborationCancelled.value = true
    isInCollaborationLoop.value = false
    for (const key of [...runningAgentKeys]) {
      if (key.startsWith(chatId + ':')) runningAgentKeys.delete(key)
    }
    if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(chatId)
    const { chat, msg } = getLastActiveMessage(chatId)
    _applyInterrupt(chat, msg, 'stop')
  }

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

    // Queue the prompt if THIS chat's agent is already running — it will be picked up after completion
    const cid = chatsStore.activeChatId
    const thisChat = chatsStore.chats.find(c => c.id === cid)
    if (thisChat?.isRunning) {
      if (!cid) return
      const groupIds = activeSystemAgentIds.value
      const isGroup = groupIds.length > 1

      if (isGroup) {
        // ── Group chat: per-agent queue logic ──
        const groupAgents = groupIds.map(id => agentsStore.getAgentById(id)).filter(Boolean)
        const { mentions, mentionAll } = parseMentions(text, groupAgents)
        let targetIds
        if (mentionAll) {
          targetIds = [...groupIds]
        } else if (mentions.length > 0) {
          targetIds = [...new Set(mentions)]
        } else if (stickyTarget.value?.length > 0) {
          targetIds = stickyTarget.value.filter(id => groupIds.includes(id))
          if (targetIds.length === 0) targetIds = [...groupIds]
        } else {
          targetIds = [...groupIds]
        }

        // Capture attachments before clearing UI
        const capturedAttachments = [...attachments.value]

        // Split targets into idle (fire immediately) vs busy (queue for later)
        const idleTargets = targetIds.filter(id => !runningAgentKeys.has(`${cid}:${id}`))
        const busyTargets = targetIds.filter(id => runningAgentKeys.has(`${cid}:${id}`))

        // Queue messages for busy agents (per-agent key)
        for (const id of busyTargets) {
          const qKey = `${cid}:${id}`
          if (!perChatQueue.has(qKey)) perChatQueue.set(qKey, [])
          perChatQueue.get(qKey).push({ text, attachments: [...capturedAttachments] })
          dbg(`Queued for busy agent ${agentsStore.getAgentById(id)?.name || id}: "${text.slice(0,30)}…"`, 'info')
        }

        // Fire idle agents immediately via runAgentAdditional (does NOT stop existing loops)
        if (idleTargets.length > 0) {
          // Add user message once, then fire with skipUserMessage
          await chatsStore.addMessage(cid, {
            role: 'user',
            content: text,
            ...(capturedAttachments.length > 0 ? { attachments: capturedAttachments } : {}),
          })
          dbg(`Firing idle agents: ${idleTargets.map(id => agentsStore.getAgentById(id)?.name || id).join(', ')}`)
          _fireGroupAgentsDirect(cid, thisChat, text, idleTargets, capturedAttachments, { skipUserMessage: true })
            .catch(err => dbg(`_fireGroupAgentsDirect idle fire error: ${err.message}`, 'error'))
        }

        // Clear UI immediately
        inputText.value = ''
        attachments.value = []
        perChatDrafts.delete(cid)
        mentionInputRef.value?.resetHeight()
        userScrolled.value = false
        scrollToBottom(true, cid)
        return
      }

      // ── Single agent: queue as before ──
      if (!perChatQueue.has(cid)) perChatQueue.set(cid, [])
      perChatQueue.get(cid).push({ text, attachments: [...attachments.value] })
      inputText.value = ''
      attachments.value = []
      perChatDrafts.delete(cid)
      mentionInputRef.value?.resetHeight()
      // Resume auto-scroll: user sent a new prompt, so re-engage scrolling for the current stream
      userScrolled.value = false
      scrollToBottom(true, cid)
      dbg(`Prompt queued (#${perChatQueue.get(cid).length}): "${text.slice(0,30)}…"`, 'info')
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
        content: 'Agent loop is not available in browser mode. Please open the app via `npm run dev` in WSL and use the Electron window (not localhost:5173 in a browser).'
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
      ...(attachmentMeta.length > 0 ? { attachments: attachmentMeta } : {})
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

    // Release the guard and force-scroll to show the new messages
    programmaticScroll.decrement()
    scrollToBottom(true)

    // Flush Vue's DOM update so the streaming bubble (spinner) renders immediately
    // before the synchronous config-building work below blocks the JS thread.
    await nextTick()

    targetChat.isRunning = true

    // Build messages for API — keep _agentId/_userAgentId metadata so the single-agent
    // path can prefix messages from previous agents (identity-aware history).
    dbg(`targetChat=${targetChat.id} messages=${targetChat.messages?.length ?? 'N/A'}`)

    const apiMessagesRaw = targetChat.messages
      .filter(m => {
        if (m.role === 'user') return !!m.content
        if (m.role === 'assistant' && !m.streaming) return !!(m.content || m.segments?.length)
        return false
      })
      .map(m => ({ role: m.role, content: m.content, _agentId: m.agentId || null, _userAgentId: m.userAgentId || null }))
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
      window.electronAPI.sendMessage({
        chatId,
        messages: JSON.parse(JSON.stringify(apiMessagesRaw)),
        groupIds: JSON.parse(JSON.stringify(activeSystemAgentIds.value)),
        isGroup,
        text,
        pendingAttachments: pendingAttachments.length > 0 ? JSON.parse(JSON.stringify(pendingAttachments)) : [],
        enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value)),
        stickyTargetIds: JSON.parse(JSON.stringify(stickyTarget.value || [])),
        targetChatMeta: {
          permissionMode: targetChat.permissionMode || 'inherit',
          chatAllowList: JSON.parse(JSON.stringify(targetChat.chatAllowList || [])),
          chatDangerOverrides: JSON.parse(JSON.stringify(targetChat.chatDangerOverrides || [])),
          maxOutputTokens: targetChat.maxOutputTokens || null,
          maxAgentRounds: targetChat.maxAgentRounds ?? 10,
          workingPath: targetChat.workingPath || null,
          codingMode: !!targetChat.codingMode,
          claudeContext: claudeContext ? JSON.parse(JSON.stringify(claudeContext)) : null,
          userAgentId: targetChat.userAgentId || null,
          systemAgentId: isGroup ? null : (activeSystemAgentIds.value[0] || targetChat.systemAgentId || null),
          agentModelOverrides: JSON.parse(JSON.stringify(targetChat.agentModelOverrides || {})),
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

        // If this chat is not active, show a "Completed" chip (and stop the unread pulse)
        if (chatId !== chatsStore.activeChatId) {
          chatsStore.markCompleted(chatId)
        }
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

      // Pick up next queued prompt.
      // Per-agent dequeue (group chat) is now handled in agent_end via _fireGroupAgentsDirect.
      // The finally block only handles:
      // 1. Per-agent queues that remain when ALL agents are done (safety net)
      // 2. Chat-level (single agent) queue dequeue
      if (!hasActiveAgents) {
        let dequeued = false
        for (const [key, agentQueue] of [...perChatQueue.entries()]) {
          if (!key.startsWith(chatId + ':') || agentQueue.length === 0) continue
          const agentId = key.split(':').slice(1).join(':')
          const queued = agentQueue.shift()
          if (agentQueue.length === 0) perChatQueue.delete(key)
          dbg(`Finally: picking up remaining per-agent queued prompt for ${agentId}: "${queued.text.slice(0,30)}…"`, 'info')
          nextTick(() => _fireGroupAgentsDirect(chatId, finChat || targetChat, queued.text, [agentId], queued.attachments)
            .catch(err => dbg(`_fireGroupAgentsDirect finally dequeue error: ${err.message}`, 'error')))
          dequeued = true
          break // One at a time; agent_end will pick up the next
        }
        if (!dequeued) {
          const queue = perChatQueue.get(chatId)
          if (queue && queue.length > 0) {
            const queued = queue.shift()
            if (queue.length === 0) perChatQueue.delete(chatId)
            dbg(`Picking up queued prompt (#${(queue?.length ?? 0) + 1} remaining): "${queued.text.slice(0,30)}…"`, 'info')
            userScrolled.value = false
            inputText.value = queued.text
            attachments.value = queued.attachments || []
            await nextTick()
            sendMessage()
          }
        }
      }
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
    chatsStore.setPlanState(chatId, msg.id, 'approved')

    const savedParams = chatsStore.getPlanRunParams(chatId)
    if (!savedParams) return

    // Format plan as injected text
    const injectedPlan = `Title: ${msg.planData.title}\n` +
      msg.planData.steps.map((s, i) => `${i + 1}. ${s.label}`).join('\n')

    // Create a new streaming assistant message
    const newMsgId = uuidv4()
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (!chat?.messages) return

    chat.messages.push({
      id: newMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
      streamingStartedAt: Date.now(),
      segments: []
    })
    chat.isRunning = true
    perChatStreamingSegments.set(chatId, [])
    perChatStreamingMsgId.set(chatId, newMsgId)
    scrollToBottom()

    try {
      const res = await window.electronAPI.runAgent({ ...savedParams, injectedPlan })

      const finalSegments = perChatStreamingSegments.get(chatId) || []
      const execMsg = chat.messages.find(m => m.id === newMsgId)
      if (execMsg) {
        execMsg.streaming = false
        execMsg.segments = finalSegments.map(s => ({ ...s }))
        execMsg.content = finalSegments.filter(s => s.type === 'text').map(s => s.content).join('')
        if (!execMsg.content && res.result) {
          execMsg.segments = [{ type: 'text', content: res.result }]
          execMsg.content = res.result
        }
        if (!res.success) {
          execMsg.segments = [{ type: 'text', content: `Error: ${res.error}` }]
          execMsg.content = `Error: ${res.error}`
        }
        if (execMsg.streamingStartedAt) execMsg.durationMs = Date.now() - execMsg.streamingStartedAt
      }
    } catch (err) {
      const execMsg = chat.messages.find(m => m.id === newMsgId)
      if (execMsg) {
        execMsg.streaming = false
        execMsg.segments = [{ type: 'text', content: `Error: ${err.message}` }]
        execMsg.content = `Error: ${err.message}`
      }
    } finally {
      chat.isRunning = false
      perChatStreamingMsgId.delete(chatId)
      perChatStreamingSegments.delete(chatId)
      await chatsStore.persist?.()
      scrollToBottom()
    }
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
  async function compactContext() {
    const chatId = chatsStore.activeChatId
    if (!chatId) return

    // If agent is running, set the flag for next iteration (existing behavior)
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

    const tokensBefore = targetChat.contextMetrics?.inputTokens || 0

    isCompacting.value = true
    dbg('Starting standalone compaction…', 'info')

    try {
      const apiMessages = targetChat.messages
        .filter(m => (m.role === 'user' && m.content) || (m.role === 'assistant' && !m.streaming && m.content))
        .map(m => ({ role: m.role, content: m.content }))

      // Build a flat config the AgentLoop constructor expects (same pattern as sendMessage).
      // AnthropicClient reads config.apiKey / config.baseURL at the top level.
      const raw = configStore.config
      const sysAgentId = targetChat.systemAgentId || agentsStore.defaultSystemAgent?.id
      const sysAgent = sysAgentId ? agentsStore.getAgentById(sysAgentId) : agentsStore.defaultSystemAgent
      const chatProvider = sysAgent?.providerId || 'anthropic'
      const cfg = { ...raw }
      applyProviderCredsToConfig(cfg, chatProvider)
      const resolvedModel = sysAgent?.modelId || null
      if (resolvedModel) cfg.customModel = resolvedModel

      const res = await window.electronAPI.compactContextStandalone({
        chatId,
        messages: JSON.parse(JSON.stringify(apiMessages)),
        config: JSON.parse(JSON.stringify(cfg)),
        enabledAgents: [],
        enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value))
      })

      if (res.success) {
        dbg(`Compaction done — input tokens: ${res.metrics?.inputTokens?.toLocaleString() ?? '?'}`, 'success')

        if (res.metrics) targetChat.contextMetrics = { ...res.metrics }

        // Hidden user/assistant pair preserves the compaction exchange in LLM context,
        // while the visible system banner is the only thing shown in the UI.
        await chatsStore.addMessage(chatId, {
          role: 'user',
          content: '[Context compaction requested]',
          compaction: true,
          hidden: true,
        })
        await chatsStore.addMessage(chatId, {
          role: 'assistant',
          content: res.assistantContent || '[Context compacted]',
          compaction: true,
          hidden: true,
        })
        // Visible indicator shown in chat
        const tokensAfter = res.metrics?.inputTokens || 0
        await chatsStore.addMessage(chatId, {
          role: 'system',
          compaction: true,
          tokensBefore,
          tokensAfter,
          content: 'Context compacted',
          segments: [{ type: 'text', content: 'Context compacted' }],
          streaming: false,
        })
        scrollToBottom()
      } else {
        dbg(`Compaction failed: ${res.error}`, 'error')
        // Surface the error to the user
        const errMsg = res.error || 'Compaction failed'
        await chatsStore.addMessage(chatId, {
          role: 'system',
          content: `Context compaction failed: ${errMsg}`
        })
      }
    } catch (err) {
      dbg(`Compaction error: ${err.message}`, 'error')
    } finally {
      isCompacting.value = false
    }
  }

  // ── Return public API ───────────────────────────────────────────────────────
  return {
    sendMessage,
    stopAgent,
    approvePlan,
    rejectPlan,
    refinePlan,
    compactContext,
    pendingQueue,
    removeFromQueue,
    _saveDraftForChat,
    _restoreDraftForChat,
    _codingModeContext,
    isCompacting,
    streamingTimer,
    startStreamingTimer,
    stopStreamingTimer,
    getLastActiveMessage,
    _applyInterrupt,
  }
}
