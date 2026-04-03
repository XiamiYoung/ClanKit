import { ref, reactive } from 'vue'
import { useChatsStore } from '../stores/chats'
import { useAgentsStore } from '../stores/agents'
import { v4 as uuidv4 } from 'uuid'
import { parseToolLogBlock, deduplicateToolSegments } from '../utils/parseToolLog'

/**
 * Streaming chunk handler: manages per-chat streaming state, segment flushing,
 * history context banners, collaboration tracking, and IPC chunk routing.
 *
 * @param {Object}   deps
 * @param {Function} deps.scrollToBottom        - scrollToBottom(smooth, chatId)
 * @param {Function} deps.dbg                   - dbg(msg, level) debug logger
 * @param {Function} deps._fireGroupAgentsDirect - internal group-agent fire function
 */
export function useChunkHandler({
  scrollToBottom,
  dbg,
  _fireGroupAgentsDirect,
  stickyTarget,
  stopStreamingTimer,
} = {}) {
  const chatsStore = useChatsStore()
  const agentsStore = useAgentsStore()

  const perChatStreamingMsgId = new Map()    // chatId → string
  const perChatStreamingSegments = new Map() // chatId → segment[]

  // ── History context banner ─────────────────────────────────────────────────
  // chatId → [{ chatId, snippet }] sources from historical search
  const historyContextSources = reactive(new Map())
  const historyContextCountdown = ref(0)
  let _historyCountdownTimer = null

  function _startHistoryCountdown(chatId) {
    if (_historyCountdownTimer) clearInterval(_historyCountdownTimer)
    historyContextCountdown.value = 15
    _historyCountdownTimer = setInterval(() => {
      historyContextCountdown.value--
      if (historyContextCountdown.value <= 0) {
        clearInterval(_historyCountdownTimer)
        _historyCountdownTimer = null
        historyContextSources.delete(chatId)
      }
    }, 1000)
  }

  function _clearHistoryCountdown() {
    if (_historyCountdownTimer) { clearInterval(_historyCountdownTimer); _historyCountdownTimer = null }
    historyContextCountdown.value = 0
  }

  const streamingSeconds = ref(0)
  let streamingTimer = null
  const collaborationCancelled = ref(false)
  const runningAgentKeys = reactive(new Set()) // "chatId:agentId" — tracks which agents are currently running
  const isInCollaborationLoop = ref(false)    // true while triggerAgentCollaboration is executing

  // Helper: get or create last text segment for a chat
  function lastTextSeg(chatId) {
    const segments = perChatStreamingSegments.get(chatId) || []
    if (segments.length > 0 && segments[segments.length - 1].type === 'text') {
      return segments[segments.length - 1]
    }
    const seg = { type: 'text', content: '' }
    segments.push(seg)
    perChatStreamingSegments.set(chatId, segments)
    return seg
  }

  // Helper: find last tool segment (waiting for result) for a chat
  function lastToolSeg(chatId) {
    const segments = perChatStreamingSegments.get(chatId) || []
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].type === 'tool' && segments[i].output === undefined) return segments[i]
    }
    return null
  }

  // Helper: push segments to the live streaming message for a chat or agent
  // key can be chatId or chatId:agentId
  function flushSegments(key) {
    const chatId = key.includes(':') ? key.split(':')[0] : key
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (!chat || !chat.messages) return
    const msgId = perChatStreamingMsgId.get(key)
    const segments = perChatStreamingSegments.get(key) || []
    const msg = chat.messages.find(m => m.id === msgId)
    if (!msg) return
    // Preserve resolved permission statuses — the user may have clicked a button before
    // the agent finishes, mutating msg.segments[i].status. Don't overwrite with 'pending'.
    const prevSegs = msg.segments || []
    msg.segments = segments.map(s => {
      if (s.type === 'permission') {
        const live = prevSegs.find(p => p.type === 'permission' && p.blockId === s.blockId)
        if (live && live.status !== 'pending') return { ...s, status: live.status }
      }
      return { ...s }
    })
    msg.content = segments.filter(s => s.type === 'text').map(s => s.content).join('')
    msg.streaming = true
  }

  /**
   * Wait for all agent_end IPC events to be processed for the given agent keys.
   *
   * The invoke reply (`runGroupAgents` promise) and `event.sender.send` chunks travel
   * on different Electron IPC channels with NO ordering guarantee. The invoke can
   * resolve BEFORE the renderer has processed the last text chunks + agent_end events.
   * If we scan messages before agent_end fires, msg.content is incomplete and @mentions
   * at the end of a response are missed → collaboration loop silently exits.
   *
   * This function polls `perChatStreamingMsgId` — agent_end deletes the key, so absence
   * means the agent's message has been fully finalized (content + segments synced).
   */
  async function waitForAgentEnd(chatId, agentIds, timeoutMs = 10000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const pending = agentIds.filter(id => perChatStreamingMsgId.has(`${chatId}:${id}`))
      if (pending.length === 0) return
      // Yield to let IPC event handlers run
      await new Promise(r => setTimeout(r, 50))
    }
    dbg(`waitForAgentEnd timed out after ${timeoutMs}ms — proceeding with potentially incomplete messages`, 'warn')
  }

  async function handleChunk(cId, chunk) {
    if (chunk.type === 'plan_submitted') {
      const chat = chatsStore.chats.find(c => c.id === cId)
      if (chat?.messages) {
        const msg = [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
        if (msg) {
          msg.planData  = chunk.plan
          msg.planState = 'pending'
        }
      }
      return
    }

    if (chunk.type === 'history_context') {
      if (Array.isArray(chunk.sources) && chunk.sources.length > 0) {
        historyContextSources.set(cId, chunk.sources)
        _startHistoryCountdown(cId)
      }
      return
    }

    const targetChat = chatsStore.chats.find(c => c.id === cId)
    if (!targetChat || !targetChat.messages) return

    // ── Group chat: agent_start / agent_end bracket each agent's response ──
    if (chunk.type === 'agent_start') {
      const agentKey = `${cId}:${chunk.agentId}`
      const waitingIdx = targetChat.messages.findIndex(m => m.isWaitingIndicator && m.waitingState === 'running')
      if (waitingIdx >= 0) targetChat.messages.splice(waitingIdx, 1)
      // Guard: skip if a streaming message already exists for this agent (prevent duplicates)
      if (perChatStreamingMsgId.has(agentKey)) {
        dbg(`agent_start DUPLICATE skipped: ${chunk.agentName} (${chunk.agentId})`, 'warn')
        return
      }
      // Single-agent path: a placeholder was already created under the bare chatId key.
      // Re-use it (stamp agentId, migrate key from chatId to chatId:agentId).
      const existingBareId = perChatStreamingMsgId.get(cId)
      if (existingBareId) {
        const existingMsg = targetChat.messages.find(m => m.id === existingBareId)
        if (existingMsg) {
          existingMsg.agentId = chunk.agentId
          existingMsg.agentName = chunk.agentName
        }
        const existingSegs = perChatStreamingSegments.get(cId) || []
        perChatStreamingMsgId.set(agentKey, existingBareId)
        perChatStreamingSegments.set(agentKey, existingSegs)
        perChatStreamingMsgId.delete(cId)
        perChatStreamingSegments.delete(cId)
        dbg(`agent_start (single): migrated bare placeholder to ${agentKey}`, 'info')
        scrollToBottom(false, cId)
        return
      }
      const msgId = uuidv4()
      perChatStreamingMsgId.set(agentKey, msgId)
      perChatStreamingSegments.set(agentKey, [])
      // Add a streaming placeholder message for this agent
      targetChat.messages.push({
        id: msgId,
        role: 'assistant',
        content: '',
        streaming: true,
        streamingStartedAt: Date.now(),
        agentId: chunk.agentId,
        agentName: chunk.agentName,
        segments: []
      })
      dbg(`agent_start: ${chunk.agentName} (${chunk.agentId})`, 'info')
      scrollToBottom(false, cId)
      return
    }

    if (chunk.type === 'agent_error') {
      // Store error detail + code on the streaming message so agent_end can display it
      const errKey = `${cId}:${chunk.agentId}`
      const errMsgId = perChatStreamingMsgId.get(errKey)
      if (errMsgId && targetChat) {
        const errMsg = targetChat.messages.find(m => m.id === errMsgId)
        if (errMsg) {
          errMsg.errorDetail = chunk.error
          errMsg.errorCode = chunk.errorCode || 'unknown'
        }
      }
      dbg(`agent_error: [${chunk.errorCode}] ${chunk.agentName}`, 'error')
      return
    }

    if (chunk.type === 'agent_end') {
      const agentKey = `${cId}:${chunk.agentId}`
      const msgId = perChatStreamingMsgId.get(agentKey)
      if (msgId) {
        const msg = targetChat.messages.find(m => m.id === msgId)
        if (msg) {
          // Final flush: ensure msg.content mirrors segments text before collaboration
          // scanning. flushSegments syncs during streaming, but do it one last time
          // to guarantee consistency when agent_end fires.
          const finalSegs = perChatStreamingSegments.get(agentKey) || []
          if (finalSegs.length > 0) {
            msg.segments = finalSegs.map(s => ({ ...s }))
            msg.content = finalSegs.filter(s => s.type === 'text').map(s => s.content).join('')
          }
          // ── Post-processing: parse tool execution log text into tool segments ──
          // DeepSeek and some OpenAI-compatible models echo the buildToolLog() text
          // as part of their streamed response. Detect and convert to real tool segments.
          const toolLogResult = parseToolLogBlock(msg.content)
          if (toolLogResult) {
            const existingTools = msg.segments.filter(s => s.type === 'tool' && !s._fromLog)
            const uniqueParsed = deduplicateToolSegments(existingTools, toolLogResult.parsedTools)
            // Rebuild segments: replace text content, keep non-text segs, append parsed tools
            const newSegs = []
            let textReplaced = false
            for (const seg of msg.segments) {
              if (seg.type === 'text') {
                if (!textReplaced) {
                  if (toolLogResult.cleanedText) {
                    newSegs.push({ type: 'text', content: toolLogResult.cleanedText })
                  }
                  textReplaced = true
                }
              } else {
                newSegs.push(seg)
              }
            }
            newSegs.push(...uniqueParsed)
            msg.segments = newSegs
            msg.content = toolLogResult.cleanedText
          }

          msg.streaming = false
          if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
          // If no text content: distinguish user-initiated stop from real error.
          // When user pressed stop/escape, silently remove the empty placeholder.
          // Otherwise mark as error (the agent produced nothing — likely a backend error).
          const hasTextContent = msg.content || (msg.segments || []).some(s => s.type === 'text' && s.content)
          if (!hasTextContent) {
            if (collaborationCancelled.value) {
              // User-initiated stop — silently remove empty placeholder
              const rmIdx = targetChat.messages.indexOf(msg)
              if (rmIdx !== -1) targetChat.messages.splice(rmIdx, 1)
            } else {
              msg.isError = true
              msg.content = '_No response_'
              msg.segments = [{ type: 'text', content: '_No response_' }]
            }
          }

          // ── Post-processing: truncate multi-turn roleplay ──
          // If the agent wrote dialogue for other participants after its own turn,
          // trim everything after the first @OtherAgent mention (keeping the @mention itself
          // so the collaboration loop can detect the turn-pass).
          if (msg.content && msg.agentId) {
            const thisAgentId = msg.agentId
            const groupIds = (targetChat.groupAgentIds || [])
            if (groupIds.length > 1) {
              const otherAgents = groupIds
                .filter(id => id !== thisAgentId)
                .map(id => agentsStore.getAgentById(id))
                .filter(Boolean)
              // Find the first @OtherAgent mention position
              let firstMentionEnd = -1
              for (const other of otherAgents) {
                const escaped = other.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const regex = new RegExp(`@${escaped}(?=\\W|$)`, 'i')
                const match = regex.exec(msg.content)
                if (match) {
                  const end = match.index + match[0].length
                  if (firstMentionEnd === -1 || end < firstMentionEnd) firstMentionEnd = end
                }
              }
              // If we found an @mention, allow a short tail (up to next double newline
              // or 80 chars), then truncate. This keeps "..@OtherAgent, your turn" intact
              // but removes any follow-up dialogue the agent wrote for other participants.
              if (firstMentionEnd > 0 && firstMentionEnd < msg.content.length - 5) {
                const tail = msg.content.slice(firstMentionEnd)
                const doubleNewline = tail.indexOf('\n\n')
                const cutAt = doubleNewline >= 0 && doubleNewline <= 80
                  ? firstMentionEnd + doubleNewline
                  : firstMentionEnd + Math.min(tail.length, 80)
                if (cutAt < msg.content.length - 5) {
                  const trimmed = msg.content.slice(0, cutAt).trimEnd()
                  dbg(`Truncated multi-turn roleplay for ${chunk.agentName}: ${msg.content.length} → ${trimmed.length} chars`)
                  msg.content = trimmed
                  // Preserve non-text segments (tool calls, tool results, images, etc.);
                  // only truncate the text portion to match the trimmed content.
                  let textConsumed = 0
                  const newSegs = []
                  for (const seg of msg.segments) {
                    if (seg.type !== 'text') {
                      newSegs.push(seg)
                      continue
                    }
                    if (textConsumed >= trimmed.length) continue
                    const segText = seg.content || ''
                    const remaining = trimmed.length - textConsumed
                    if (segText.length <= remaining) {
                      newSegs.push(seg)
                      textConsumed += segText.length
                    } else {
                      newSegs.push({ ...seg, content: segText.slice(0, remaining) })
                      textConsumed += remaining
                    }
                  }
                  msg.segments = newSegs
                }
              }
            }
          }
        }
      }
      perChatStreamingMsgId.delete(agentKey)
      perChatStreamingSegments.delete(agentKey)
      runningAgentKeys.delete(agentKey)
      dbg(`agent_end: ${chunk.agentName}`, 'info')
      scrollToBottom(false, cId)

      // Check if ALL agents for this chat are now idle — if so, clear isRunning.
      if (!isInCollaborationLoop.value) {
        const anyStillRunning = [...runningAgentKeys].some(k => k.startsWith(cId + ':'))
        if (!anyStillRunning) {
          const fc = chatsStore.chats.find(c => c.id === cId)
          if (fc && fc.isRunning) {
            dbg(`Last agent done — isRunning → false for ${cId}`)
            fc.isRunning = false
            fc.isThinking = false
            fc.isCallingTool = false
            fc.currentToolCall = null
            chatsStore.markCompleted(cId)
          }
        }
      }
      return
    }

    // For group chat chunks tagged with agentId, route to the right agent's streaming message
    const routeKey = chunk.agentId ? `${cId}:${chunk.agentId}` : cId

    if (chunk.type === 'text') {
      const hasMsgId = perChatStreamingMsgId.has(routeKey)
      if (!hasMsgId) {
      }
      targetChat.isThinking = false
      lastTextSeg(routeKey).content += chunk.text
      flushSegments(routeKey)
      scrollToBottom(false, cId)
    } else if (chunk.type === 'agent_step') {
      // Agent progress step - replace existing or add new (only keep current step)
      const segments = perChatStreamingSegments.get(routeKey) || []
      const existingStepIndex = segments.findIndex(s => s.type === 'agent_step')
      const newStep = {
        type: 'agent_step',
        id: chunk.id,
        title: chunk.title,
        status: chunk.status,
        duration: chunk.duration,
        details: chunk.details || {},
        timestamp: chunk.timestamp,
      }

      if (existingStepIndex >= 0) {
        segments[existingStepIndex] = newStep
      } else {
        segments.push(newStep)
      }
      perChatStreamingSegments.set(routeKey, segments)
      flushSegments(routeKey)
      // Save latest token counts directly on the streaming message for persistence after stream ends
      const d = chunk.details || {}
      if ((d.inputTokens || d.outputTokens) && targetChat) {
        const msgId = perChatStreamingMsgId.get(routeKey)
        const streamMsg = msgId ? targetChat.messages?.find(m => m.id === msgId) : targetChat.messages?.slice().reverse().find(m => m.role === 'assistant' && m.streaming)
        if (streamMsg) streamMsg.tokenUsage = { input: d.inputTokens || 0, output: d.outputTokens || 0 }
      }
    } else if (chunk.type === 'tool_call') {
      dbg(`tool_call: ${chunk.name} input=${JSON.stringify(chunk.input).slice(0,80)}`, 'warn')
      if (targetChat) {
        targetChat.isCallingTool = true
        targetChat.currentToolCall = chunk.name || null
      }
      const segments = perChatStreamingSegments.get(routeKey) || []
      segments.push({ type: 'tool', name: chunk.name, input: chunk.input ?? {}, output: undefined, toolCallId: chunk.toolCallId || null })
      perChatStreamingSegments.set(routeKey, segments)
      flushSegments(routeKey)
      scrollToBottom(false, cId)
    } else if (chunk.type === 'tool_result') {
      dbg(`tool_result: ${chunk.name} result=${JSON.stringify(chunk.result).slice(0,80)}`, 'warn')
      if (targetChat) {
        targetChat.isCallingTool = false
        targetChat.currentToolCall = null
      }
      const toolSeg = lastToolSeg(routeKey)
      const outputText = typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result, null, 2)
      if (toolSeg) {
        toolSeg.output = outputText
        if (chunk.toolCallId && !toolSeg.toolCallId) toolSeg.toolCallId = chunk.toolCallId
      } else if (chunk.name) {
        // No pending tool seg — this result arrived out-of-band (e.g. subagent auto todo update).
        // Append a fully-formed tool segment so the todo panel and tool list stay up to date.
        const segments = perChatStreamingSegments.get(routeKey) || []
        segments.push({ type: 'tool', name: chunk.name, input: chunk.input ?? {}, output: outputText, toolCallId: chunk.toolCallId || null })
        perChatStreamingSegments.set(routeKey, segments)
      }
      // Images — push a single inline image segment (deduplicated)
      if (chunk.images && chunk.images.length > 0) {
        const seen = new Set()
        const unique = chunk.images.filter(img => {
          const key = img.url || `${img.mimeType}:${(img.data || '').length}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        if (unique.length > 0) {
          const imgSegments = perChatStreamingSegments.get(routeKey) || []
          imgSegments.push({ type: 'image', images: unique, source: chunk.name })
          perChatStreamingSegments.set(routeKey, imgSegments)
        }
      }
      flushSegments(routeKey)
      scrollToBottom(false, cId)
    } else if (chunk.type === 'tool_output') {
      // Live streaming output from a running tool (e.g. shell stdout/stderr)
      // Defense in depth: skip stale chunks after user stopped the agent
      if (collaborationCancelled.value || !targetChat.isRunning) return
      const toolSeg = lastToolSeg(routeKey)
      if (toolSeg) {
        toolSeg.streamingOutput = (toolSeg.streamingOutput || '') + (chunk.text || '')
        flushSegments(routeKey)
        scrollToBottom(false, cId)
      }
    } else if (chunk.type === 'permission_request') {
      const segments = perChatStreamingSegments.get(routeKey) || []
      segments.push({
        type: 'permission',
        blockId: chunk.blockId,
        toolName: chunk.toolName,
        command: chunk.command,
        toolInput: chunk.toolInput,
        chatId: cId,
        status: 'pending',
      })
      perChatStreamingSegments.set(routeKey, segments)
      flushSegments(routeKey)
      scrollToBottom(false, cId)
      chatsStore.markPermissionPending(cId)
    } else if (chunk.type === 'context_update') {
      if (chunk.metrics) {
        targetChat.contextMetrics = { ...chunk.metrics }
        // Store per-agent metrics for group chat inspector
        if (chunk.agentId) {
          if (!targetChat.perAgentContextMetrics) targetChat.perAgentContextMetrics = {}
          targetChat.perAgentContextMetrics[chunk.agentId] = { agentName: chunk.agentName || chunk.agentId, ...chunk.metrics }
        }
        const msgId = perChatStreamingMsgId.get(routeKey)
        const streamMsg = msgId
          ? targetChat.messages?.find(m => m.id === msgId)
          : targetChat.messages?.slice().reverse().find(m => m.role === 'assistant' && m.streaming)
        if (streamMsg && ((chunk.metrics.inputTokens || 0) > 0 || (chunk.metrics.outputTokens || 0) > 0)) {
          streamMsg.tokenUsage = {
            input: chunk.metrics.inputTokens || 0,
            output: chunk.metrics.outputTokens || 0,
          }
        }
      }
      dbg(`context: ${chunk.metrics?.percentage ?? 0}% used (${chunk.metrics?.inputTokens ?? 0} in / ${chunk.metrics?.outputTokens ?? 0} out) compactions=${chunk.metrics?.compactionCount ?? 0}`, 'info')
    } else if (chunk.type === 'thinking_start') {
      targetChat.isThinking = true
      dbg('thinking started…', 'info')
    } else if (chunk.type === 'thinking') {
      dbg(`thinking: ${chunk.text?.slice(0,60) ?? ''}…`, 'chunk')
    } else if (chunk.type === 'compaction') {
      dbg(`compaction: ${chunk.message || 'context compacted'}`, 'warn')
    } else if (chunk.type === 'warning') {
      dbg(`warning: ${chunk.code || chunk.message || 'unknown'}`, 'warn')
      // Show warning as a persistent segment in the chat bubble
      const warnRouteKey = chunk.agentId ? `${cId}:${chunk.agentId}` : cId
      const warnSegs = perChatStreamingSegments.get(warnRouteKey) || []
      warnSegs.push({
        type: 'warning',
        code: chunk.code || null,
        from: chunk.from || null,
        to: chunk.to || null,
        message: chunk.message || null,
      })
      perChatStreamingSegments.set(warnRouteKey, warnSegs)
      flushSegments(warnRouteKey)
    } else if (chunk.type === 'max_tokens_reached') {
      dbg(`max_tokens reached (limit=${chunk.limit})`, 'warn')
    } else if (chunk.type === 'subagent_progress') {
      dbg(`subagent: ${chunk.agent || 'unknown'} — ${chunk.status || JSON.stringify(chunk).slice(0,60)}`, 'info')

    } else if (chunk.type === 'collaboration_summary') {
      // Node.js collaboration loop reached MAX_ITERATIONS — inject summary message into chat
      if (targetChat && chunk.content) {
        targetChat.messages.push({
          id: uuidv4(),
          role: 'assistant',
          content: chunk.content,
          segments: [{ type: 'text', content: chunk.content }],
          isCollaborationSummary: true,
          streaming: false,
        })
        scrollToBottom(false, cId)
      }

    } else if (chunk.type === 'collaboration_round_done') {
      // Each sequential round completed — scroll to show new messages
      scrollToBottom(false, cId)

    } else if (chunk.type === 'send_message_complete' || chunk.type === 'send_message_error') {
      // Node.js orchestration finished — do final cleanup for both single and group paths.
      // Remove any stale waiting indicator (may survive if agent_start never fired, e.g. on stop or error)
      if (targetChat?.messages) {
        const waitingIdx = targetChat.messages.findIndex(m => m.isWaitingIndicator)
        if (waitingIdx >= 0) targetChat.messages.splice(waitingIdx, 1)
      }

      if (chunk.type === 'send_message_error') {
        dbg(`send_message_error from Node.js: ${chunk.error}`, 'error')
        // Mark any still-streaming messages as errored (waiting indicator already removed above)
        let foundStreaming = false
        if (targetChat?.messages) {
          for (const m of targetChat.messages) {
            if (m.streaming) {
              foundStreaming = true
              m.content = m.content || `Error: ${chunk.error}`
              m.segments = [{ type: 'text', content: m.content }]
              m.streaming = false
              m.isError = true
              m.errorDetail = chunk.error
              if (m.streamingStartedAt) m.durationMs = Date.now() - m.streamingStartedAt
            }
          }
          // If no streaming message exists (error before agent_start), create an error message
          if (!foundStreaming) {
            targetChat.messages.push({
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: `Error: ${chunk.error}`,
              segments: [{ type: 'text', content: `Error: ${chunk.error}` }],
              streaming: false,
              isError: true,
              errorDetail: chunk.error,
              timestamp: new Date().toISOString(),
            })
          }
        }
      }

      // Stop streaming timer now that all agents are done
      stopStreamingTimer?.()
      streamingSeconds.value = 0

      // Clean up group streaming state
      for (const key of [...perChatStreamingMsgId.keys()]) {
        if (key === cId || key.startsWith(cId + ':')) {
          perChatStreamingMsgId.delete(key)
          perChatStreamingSegments.delete(key)
        }
      }
      for (const key of [...runningAgentKeys]) {
        if (key.startsWith(cId + ':')) runningAgentKeys.delete(key)
      }
      isInCollaborationLoop.value = false

      // Clear isRunning on the chat
      if (targetChat) {
        targetChat.isRunning = false
        targetChat.isThinking = false
        targetChat.isCallingTool = false
        targetChat.currentToolCall = null
      }
      const finChat = chatsStore.chats.find(c => c.id === cId)
      if (finChat) {
        finChat.isRunning = false
        finChat.isThinking = false
        finChat.isCallingTool = false
        finChat.currentToolCall = null
      }
      // Always mark completed when send_message_complete arrives (regardless of active status)
      // The display logic in ChatsView already checks "chat !== activeChatId" to only show
      // the "Done" label for background chats. This ensures background chats always get
      // the completed status and spinner disappears properly.
      chatsStore.markCompleted(cId)

      // Persist chat
      chatsStore.persist?.()

      scrollToBottom(false, cId)
      dbg(`send_message_complete for ${cId}`, 'info')

      // (queue system removed — interrupt & steer replaces queuing)
    }
  }

  return {
    perChatStreamingMsgId,
    perChatStreamingSegments,
    historyContextSources,
    historyContextCountdown,
    _startHistoryCountdown,
    _clearHistoryCountdown,
    streamingSeconds,
    collaborationCancelled,
    runningAgentKeys,
    isInCollaborationLoop,
    lastTextSeg,
    lastToolSeg,
    flushSegments,
    waitForAgentEnd,
    handleChunk,
  }
}
