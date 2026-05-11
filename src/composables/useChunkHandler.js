import { ref, reactive } from 'vue'
import { useChatsStore } from '../stores/chats'
import { useAgentsStore } from '../stores/agents'
import { v4 as uuidv4 } from 'uuid'
import { parseToolLogBlock, deduplicateToolSegments } from '../utils/parseToolLog'
import { useI18n } from '../i18n/useI18n'

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
  const { t } = useI18n()

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
      // Add a streaming placeholder message for this agent.
      // Stamp timestamp at creation so SQL ORDER BY ts preserves chronological
      // position even if the message is persisted later when streaming completes.
      const startedAt = Date.now()
      targetChat.messages.push({
        id: msgId,
        role: 'assistant',
        content: '',
        timestamp: startedAt,
        createdAt: startedAt,
        streaming: true,
        streamingStartedAt: startedAt,
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
            // Preserve resolved permission statuses — user may have clicked allow/reject
            // on msg.segments while perChatStreamingSegments still has status:'pending'
            const prevSegs = msg.segments || []
            msg.segments = finalSegs.map(s => {
              if (s.type === 'permission') {
                const live = prevSegs.find(p => p.type === 'permission' && p.blockId === s.blockId)
                if (live && live.status !== 'pending') return { ...s, status: live.status }
              }
              return { ...s }
            })
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

          // Strip tool result echo: if a text segment after a tool segment
          // contains raw timestamps from search results, truncate the leaked portion.
          if (msg.segments && msg.segments.length > 1) {
            const toolResultPattern = /\s*(?:Me|User|Assistant|[\u4e00-\u9fff]+):\s*.+\\n\[\d{4}-\d{2}-\d{2}/
            let sawTool = false
            for (const seg of msg.segments) {
              if (seg.type === 'tool') { sawTool = true; continue }
              if (sawTool && seg.type === 'text' && seg.content) {
                const match = seg.content.match(toolResultPattern)
                if (match) {
                  seg.content = seg.content.slice(0, match.index).trimEnd()
                }
              }
            }
            // Update msg.content to match cleaned segments
            const textParts = msg.segments.filter(s => s.type === 'text' && s.content).map(s => s.content)
            if (textParts.length > 0) msg.content = textParts.join('\n\n')
          }

          msg.streaming = false
          if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
          msg.timestamp = Date.now()
          // If the backend tagged this message with an error (agent_error chunk
          // attached errorDetail/errorCode), mark isError so ChatWindow renders
          // the red bubble — regardless of whether partial content was produced.
          // Rate-limit / mid-stream failures (e.g. 429 after the model already
          // wrote some text) need the banner just as much as empty failures.
          if (msg.errorDetail) {
            msg.isError = true
          }
          // Must match useInterrupt._hasActivity — pending tool calls (no output) don't count.
          const hasActivity = !!(msg.content?.trim()) || msg.planData ||
            (msg.segments || []).some(s => {
              if (s.type === 'text') return !!s.content?.trim()
              if (s.type === 'tool') return s.output !== undefined
              if (s.type === 'agent_step') return false
              return true
            })
          if (!hasActivity && !msg.errorDetail) {
            // Empty placeholder — agent produced no text, no completed tools, no plan,
            // and no error to report. Common causes: user cancelled mid-stream, group
            // sequential-dispatch agent had nothing to add yet (waiting on a peer), or
            // a collab round fired an agent that ended without speaking.
            const rmIdx = targetChat.messages.indexOf(msg)
            if (rmIdx !== -1) targetChat.messages.splice(rmIdx, 1)
          }

          // ── Post-processing: truncate multi-turn roleplay ──
          // Only triggers when the agent actually started impersonating another
          // participant (explicit speaker-turn markers like "\n\n@Name:" or
          // "\n\n[Name]:" or an immediate "@Name:" right after the @-mention).
          // A bare @-mention followed by the agent's own continuing prose is NOT
          // roleplay and must be left intact — previously a 80-char hard cap
          // chopped legitimate sentences mid-word.
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
              let firstMentionedName = ''
              for (const other of otherAgents) {
                const escaped = other.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const regex = new RegExp(`@${escaped}(?=\\W|$)`, 'i')
                const match = regex.exec(msg.content)
                if (match) {
                  const end = match.index + match[0].length
                  if (firstMentionEnd === -1 || end < firstMentionEnd) {
                    firstMentionEnd = end
                    firstMentionedName = other.name
                  }
                }
              }
              if (firstMentionEnd > 0) {
                const tail = msg.content.slice(firstMentionEnd)
                let cutAt = -1
                // Pattern A: "@Name:" — agent immediately impersonates after the mention.
                if (/^\s*[:：]/.test(tail)) {
                  cutAt = firstMentionEnd
                }
                // Pattern B: speaker-turn after a paragraph break. Requires \n\n
                // followed by an EXPLICIT impersonation marker: [Name]:, @Name:,
                // or "Name:" — the colon is what flags "Name said". A bare @Name
                // after \n\n is a normal address (e.g. agent reads file, then
                // writes "\n\n@Other 我看到几个问题..."), NOT roleplay, and must
                // be left intact — otherwise the agent's own review prose gets
                // chopped off.
                if (cutAt === -1) {
                  const speakerTurn = tail.match(/\n\n[\s]*(?:\[[^\]]{1,40}\][:：]|@\S+?[:：]|[A-Z][\w一-鿿]{0,30}[:：])/)
                  if (speakerTurn) cutAt = firstMentionEnd + speakerTurn.index
                }
                if (cutAt !== -1 && cutAt < msg.content.length - 5) {
                  const trimmed = msg.content.slice(0, cutAt).trimEnd()
                  dbg(`Truncated multi-turn roleplay for ${chunk.agentName} (mention=${firstMentionedName}): ${msg.content.length} → ${trimmed.length} chars`)
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
      const seg = lastTextSeg(routeKey)
      seg.content += chunk.text
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
      // Detect a tool error from any of: (1) explicit isError flag carried
      // through messageConverter.uiResult, (2) the BaseTool._err text prefix
      // "Error: " surfaced as either chunk.result.text or as the raw output
      // text (when chunk.result is a string). Mirrors the renderer's badge
      // logic so failed-tool calls don't render with the green success badge.
      const isError = !!(chunk.result?.isError)
        || (typeof chunk.result?.text === 'string' && chunk.result.text.startsWith('Error:'))
        || (typeof chunk.result === 'string' && chunk.result.startsWith('Error:'))
      if (toolSeg) {
        toolSeg.output = outputText
        if (isError) toolSeg.isError = true
        if (chunk.toolCallId && !toolSeg.toolCallId) toolSeg.toolCallId = chunk.toolCallId
      } else if (chunk.name) {
        // No pending tool seg — this result arrived out-of-band (e.g. subagent auto todo update).
        // Append a fully-formed tool segment so the todo panel and tool list stay up to date.
        const segments = perChatStreamingSegments.get(routeKey) || []
        segments.push({ type: 'tool', name: chunk.name, input: chunk.input ?? {}, output: outputText, ...(isError ? { isError: true } : {}), toolCallId: chunk.toolCallId || null })
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
    } else if (chunk.type === 'permission_auto_resolved') {
      // Triggered when user switches to all_permissions mode mid-run — mark pending
      // permission segments as allowed so the UI hides the action buttons.
      const blockIds = new Set(chunk.blockIds || [])
      const chat = chatsStore.chats.find(c => c.id === cId)
      if (chat?.messages) {
        for (const msg of chat.messages) {
          if (!msg.segments) continue
          for (const seg of msg.segments) {
            if (seg.type === 'permission' && seg.status === 'pending' && blockIds.has(seg.blockId)) {
              seg.status = 'allowed'
            }
          }
        }
      }
      chatsStore.clearPermissionPending(cId)
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
    } else if (chunk.type === 'compaction_applied') {
      // Reactive/auto/manual compaction happened inside the agent loop.
      // Insert a visible system banner so the user sees when the loop
      // recovered from overflow or auto-compacted at threshold.
      // For group chats the IPC wrapper adds `agentId` / `agentName` to the chunk
      // so the banner can tell the user which agent got compacted.
      dbg(`compaction_applied: kind=${chunk.kind || 'auto'}${chunk.agentName ? ' agent=' + chunk.agentName : ''}`, 'warn')
      if (targetChat?.messages) {
        targetChat.messages.push({
          id: uuidv4(),
          role: 'system',
          timestamp: Date.now(),
          createdAt: Date.now(),
          compaction: true,
          compactionKind: chunk.kind || 'auto',
          agentId:   chunk.agentId   || null,
          agentName: chunk.agentName || null,
          tokensBefore: chunk.tokensBefore || 0,
          tokensAfter: chunk.tokensAfter || 0,
          content: chunk.message || 'Context compacted',
          segments: [{ type: 'text', content: chunk.message || 'Context compacted' }],
          streaming: false,
          timestamp: Date.now(),
        })
        scrollToBottom(false, cId)
      }
    } else if (chunk.type === 'max_tokens_reached') {
      dbg(`max_tokens reached (limit=${chunk.limit}, truncated=${chunk.truncated || 'unknown'})`, 'warn')
      // Push a visible system banner so the user sees what happened even
      // when there's no streaming assistant message to append to (e.g. when
      // the model burned the entire budget on thinking blocks and emitted
      // no text). Complements the suffix-append handler in chats.js.
      if (targetChat?.messages) {
        const limitStr = (chunk.limit || 0).toLocaleString()
        const hint = chunk.truncated === 'mid-tool_use'
          ? `Output hit the ${limitStr}-token limit mid-tool call. Tool was executed; the loop will continue.`
          : `Output hit the ${limitStr}-token limit. Send a follow-up to continue.`
        targetChat.messages.push({
          id: uuidv4(),
          role: 'system',
          timestamp: Date.now(),
          createdAt: Date.now(),
          maxTokensReached: true,
          truncated: chunk.truncated || null,
          content: hint,
          segments: [{ type: 'text', content: hint }],
          streaming: false,
        })
        scrollToBottom(false, cId)
      }
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
          timestamp: Date.now(),
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
              m.timestamp = Date.now()
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
              timestamp: Date.now(),
              createdAt: Date.now(),
            })
          }
        }
      }

      // Finalize ALL still-streaming messages for this chat. This is a safety net
      // matching _applyChunk's send_message_complete handler — without it, messages
      // created by _applyChunk while ChatsView was unmounted (e.g. minibar) can
      // retain streaming=true forever since agent_end only finalizes the message
      // registered in perChatStreamingMsgId.
      if (targetChat?.messages) {
        for (const m of targetChat.messages) {
          if (m.streaming && !m.isWaitingIndicator) {
            m.streaming = false
            if (m.streamingStartedAt) m.durationMs = Date.now() - m.streamingStartedAt
            m.timestamp = Date.now()
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

      // Transition plan state: approved → completed
      if (targetChat?.messages) {
        for (const m of targetChat.messages) {
          if (m.planState === 'approved') { m.planState = 'completed'; break }
        }
      }

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
