/**
 * IPC handlers for the Agent Loop — the core AI execution engine.
 * Channels: agent:*
 *
 * This is the largest and most complex IPC module. It manages:
 * - Agent execution (single + group/multi-agent mode)
 * - Streaming response chunks to renderer
 * - Tool execution permissions
 * - Context compaction
 * - Memory extraction (post-turn)
 * - Document editing (inline edit + full doc agent)
 * - Utility model calls (prompt enhancement, @mention resolution, task dispatch, title suggestion)
 * - Provider testing
 */
const path = require('path')
const fs = require('fs')
const { ipcMain } = require('electron')
const { v4: uuidv4 } = require('uuid')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')
const memHelpers = require('../lib/memoryHelpers')
const { AgentLoop } = require('../agent/agentLoop')
const { mcpManager } = require('../agent/mcp/McpManager')
const { MemoryExtractor } = require('../agent/core/MemoryExtractor')

const { HistoryIndex } = require('../memory/HistoryIndex')
const { accumulateUsage, accumulateUtilityUsage } = require('./store')
const { queryRAG } = require('./knowledge')
const { createChunkAccumulator } = require('../agent/chunkAccumulator')
const { normalizeAgents, normalizeTools, normalizeMcpServers } = require('../agent/dataNormalizers')
const {
  detectModelProviderType: _detectModelProviderType,
  isProviderActive: _isProviderActive,
  applyProviderCredsToConfig: _applyProviderCredsToConfig,
  normalizeLoopConfig: _normalizeLoopConfig,
  validateLoopConfig: _validateLoopConfig,
  buildHeuristicSequentialDispatch: _buildHeuristicSequentialDispatch,
} = require('./agentRuntimeUtils')


// --- IPC: Agent Loop ---------------------------------------------------------
// is resolved. im-bridge modules use lazy getDataDir() so they pick it up.
const activeLoops = new Map()          // chatId -> AgentLoop
const activeLoopMeta = new Map()       // same key as activeLoops → { chatId, agentId, agentName, isGroup }
const pendingStops = new Set()         // chatIds where stop was requested before loop existed
const lastContextSnapshots = new Map() // chatId -> snapshot
const chatLoadedSkills = new Map()     // chatId -> Map(skillId -> content) — persists load_skill results across turns
const lastExtractedMsgCount = new Map() // chatId -> message count at last extraction
const pendingMemoryFacts = new Map()    // chatId -> Array of pending fact objects (medium-confidence)

/**
 * Build synthetic skill-injection message pair from a Map of loaded skills.
 * Returns an array of two messages (user + assistant) if skills exist, empty array otherwise.
 */
function _buildSkillInjectionMessages(loadedSkills) {
  if (!loadedSkills || loadedSkills.size === 0) return []
  const skillEntries = []
  for (const [id, content] of loadedSkills) {
    skillEntries.push(`[SKILL: ${id}]\n${content}`)
  }
  return [
    { role: 'user', content: skillEntries.join('\n\n---\n\n') },
    { role: 'assistant', content: 'Skills loaded. I will follow these instructions.' },
  ]
}

/**
 * Prepend skill-injection messages to each agentRun's messages array.
 * Mutates the runs in-place.
 */
function _injectSkillsIntoRuns(agentRuns, loadedSkills) {
  const skillMessages = _buildSkillInjectionMessages(loadedSkills)
  if (skillMessages.length === 0) return
  for (const run of agentRuns) {
    if (run.messages) {
      run.messages = [...skillMessages, ...run.messages]
    }
  }
}

/** Read a soul file from disk. Returns null if not found. */
function readSoulFileSync(agentId, agentType) {
  if (!agentId) return null
  try {
    const filePath = path.join(ds.paths().SOULS_DIR, agentType, `${agentId}.md`)
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    logger.error('readSoulFileSync error', err.message)
  }
  return null
}

/**
 * Run post-turn memory extraction using the configured utility model.
 * Non-fatal -- failures are logged and silently ignored.
 *
 * High-confidence (≥0.8): auto-saved directly to soul files.
 * Medium-confidence (0.5–0.8): stored as pending facts for conversational confirmation.
 * Low-confidence (<0.5): discarded (filtered out in MemoryExtractor).
 */
async function runMemoryExtraction(event, chatId, messages, config, agentPrompts, participants) {
  try {
    // Use the globally configured utility model — supports all providers.
    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      logger.debug('[Memory] skip: utility model not configured', { chatId })
      return
    }
    const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
    if (!providerCfg?.apiKey) {
      logger.debug('[Memory] skip: provider missing apiKey', { chatId, provider: um.provider })
      return
    }
    if (!providerCfg?.baseURL && um.provider !== 'google') {
      logger.debug('[Memory] skip: provider missing baseURL', { chatId, provider: um.provider })
      return
    }

    logger.debug('[Memory] start', { chatId, provider: um.provider, model: um.model, msgCount: messages?.length })

    const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
    const extractor = new MemoryExtractor({
      model:        um.model,
      apiKey:       providerCfg.apiKey,
      baseURL:      providerCfg.baseURL,
      isOpenAI,
      directAuth:   um.provider === 'openai_official' || um.provider === 'deepseek',
      providerType: um.provider,
    })

    // Extract last user message + last assistant response
    const reversed = [...messages].reverse()
    const lastUser = reversed.find(m => m.role === 'user')
    const lastAssistant = reversed.find(m => m.role === 'assistant')
    if (!lastUser || !lastAssistant) {
      logger.debug('[Memory] skip: no user+assistant pair', { chatId })
      return
    }

    const lastUserText = typeof lastUser.content === 'string'
      ? lastUser.content
      : (Array.isArray(lastUser.content) ? lastUser.content.filter(b => b.type === 'text').map(b => b.text).join(' ') : '')
    const lastAssistantText = typeof lastAssistant.content === 'string'
      ? lastAssistant.content
      : (Array.isArray(lastAssistant.content) ? lastAssistant.content.filter(b => b.type === 'text').map(b => b.text).join(' ') : '')

    if (!lastUserText.trim() || !lastAssistantText.trim()) {
      logger.debug('[Memory] skip: empty text', { chatId })
      return
    }

    let userAgentId = agentPrompts?.userAgentId || null
    // Resolve default user agent when chat has no explicit user agent
    if (!userAgentId || userAgentId === '__default_user__') {
      try {
        const allAgents = normalizeAgents(ds.readJSON(ds.paths().AGENTS_FILE, { agents: [] }))
        const defaultUsr = (allAgents || []).find(a => a.type === 'user' && a.isDefault)
        userAgentId = defaultUsr?.id || '__default_user__'
      } catch (_) { userAgentId = '__default_user__' }
    }
    const systemAgentId = agentPrompts?.systemAgentId || '__default_system__'

    logger.debug('[Memory] agentIds', { chatId, userAgentId, systemAgentId })

    const userSoulContent = readSoulFileSync(userAgentId, 'users')
    const systemSoulContent = readSoulFileSync(systemAgentId, 'system')

    const suggestions = await extractor.extract({
      lastUserMessage: lastUserText,
      lastAssistantMessage: lastAssistantText,
      userSoulContent,
      systemSoulContent,
      userAgentId,
      systemAgentId,
      participants: participants || null,
      language: config.language || 'en',
    })

    logger.debug('[Memory] suggestions', { chatId, count: suggestions.length })

    if (suggestions.length === 0) return

    logger.agent('Memory extraction', { chatId, count: suggestions.length, model: um.model, provider: um.provider })

    const autoSave = suggestions.filter(s => s.confidence >= 0.8)
    const pending  = suggestions.filter(s => s.confidence >= 0.5 && s.confidence < 0.8)

    logger.debug('[Memory] confidence split', { chatId, autoSave: autoSave.length, pending: pending.length })

    // Auto-save high-confidence facts directly to soul files
    if (autoSave.length > 0) {
      const { SoulUpdateTool: SoulUpdateToolForMemory } = require('../agent/tools/SoulTool')
      const soulTool = new SoulUpdateToolForMemory(ds.paths().SOULS_DIR)
      for (const item of autoSave) {
        const filePath = require('path').join(ds.paths().SOULS_DIR, item.agentType, `${item.agentId}.md`)
        logger.debug('[Memory] writing', { filePath, section: item.section, entry: item.entry?.slice(0, 80) })
        await soulTool.execute('memory-auto', {
          agent_id: item.agentId,
          agent_type: item.agentType,
          section: item.section,
          action: 'add',
          entry: item.entry,
        }).catch(err => logger.warn('Memory auto-save failed', { entry: item.entry, error: err.message }))
      }
      logger.agent('Memory auto-saved', { chatId, count: autoSave.length })

      // Also write to new memory files (USER.md / MEMORY.md)
      const userAgentIdForMemory = userAgentId
      for (const item of autoSave) {
        appendMemoryEntry(
          item.agentId,
          userAgentIdForMemory,
          item.target,
          item.section,
          item.entry
        )
      }
    }

    // Store medium-confidence facts for conversational AI confirmation
    if (pending.length > 0) {
      const existing = pendingMemoryFacts.get(chatId) || []
      pendingMemoryFacts.set(chatId, [...existing, ...pending])
      logger.agent('Memory pending confirmation', { chatId, count: pending.length })
    }
  } catch (err) {
    logger.error('Memory extraction failed (non-fatal)', { chatId, error: err.message })
  }
}

async function _runStartupIndexRecovery() {
  try {
    const indexFile = ds.paths().CHATS_INDEX_FILE
    if (!fs.existsSync(indexFile)) return
    const chatsIndex = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
    if (!Array.isArray(chatsIndex)) return

    logger.debug('[Startup] checking for unindexed chats', { total: chatsIndex.length })

    for (const meta of chatsIndex) {
      const agentId = meta.systemAgentId
      if (!agentId) continue

      const chatIndexer = new HistoryIndex(ds.paths().AGENT_MEMORY_DIR)
      const indexed     = chatIndexer.getIndexedChatIds(agentId)
      if (indexed.has(meta.id)) continue

      // Yield to event loop between each chat to stay non-blocking
      await new Promise(resolve => setImmediate(resolve))

      try {
        const chatFile = path.join(ds.paths().CHATS_DIR, `${meta.id}.json`)
        if (!fs.existsSync(chatFile)) continue
        const chat = JSON.parse(fs.readFileSync(chatFile, 'utf8'))
        if (chat.messages && chat.messages.length > 0) {
          chatIndexer.indexChat(meta.id, chat.messages, agentId)
        }
      } catch (err) {
        logger.error('[Startup] failed to index chat', { chatId: meta.id, error: err.message })
      }
    }

    logger.debug('[Startup] index recovery complete')
  } catch (err) {
    logger.error('[Startup] index recovery failed (non-fatal)', err.message)
  }
}

// ── Error classification ───────────────────────────────────────────────────────

function _classifyError(err) {
  const msg = (err.message || '').toLowerCase()
  const status = err.status || err.statusCode || 0
  if (msg.includes('maximum context length') || msg.includes('context_length_exceeded')) return 'context_overflow'
  if (msg.includes('max_tokens') || msg.includes('max_completion_tokens')) return 'max_tokens_invalid'
  if (msg.includes('rate limit') || status === 429) return 'rate_limited'
  if (msg.includes('authentication') || msg.includes('unauthorized') || msg.includes('invalid.*api.key') || status === 401 || status === 403) return 'auth_error'
  if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound') || msg.includes('fetch failed')) return 'connection_error'
  if (msg.includes('tool use') || msg.includes('tool_use')) return 'tool_not_supported'
  if (msg.includes('content filter') || msg.includes('content_policy')) return 'content_filtered'
  if (status === 400) return 'bad_request'
  if (status >= 500) return 'server_error'
  return 'unknown'
}

// ── Provider credential helpers (mirrors useAgentCollaboration.js) ─────────────

function _filterByRequired(items, requiredIds) {
  if (!requiredIds || requiredIds.length === 0) return items
  return (items || []).filter(item => requiredIds.includes(item.id))
}

function _buildAgentKnowledgeConfig(agent, knowledgeCfg) {
  const requiredIds = agent?.requiredKnowledgeBaseIds ?? []
  const includeAll = agent?.id === '__default_system__' && agent?.isBuiltin
  const kbConfigs = knowledgeCfg.knowledgeBases || {}
  const enabledKbs = {}
  for (const [kbId, cfg] of Object.entries(kbConfigs)) {
    if ((includeAll || requiredIds.includes(kbId)) && cfg.enabled !== false) enabledKbs[kbId] = { ...cfg }
  }
  if (Object.keys(enabledKbs).length === 0) return null
  return { ragEnabled: true, knowledgeBases: enabledKbs }
}

function _buildUserAgentPrompt(usrAgent) {
  if (!usrAgent) return null
  const parts = []
  if (usrAgent.name) parts.push(`User: ${usrAgent.name}${usrAgent.description ? ` — ${usrAgent.description}` : ''}.`)
  if (usrAgent.prompt) parts.push(usrAgent.prompt)
  return parts.length > 0 ? parts.join('\n\n') : null
}

/**
 * Build per-agent isolated agentRuns[] from disk-read data.
 * allData = { agents[], mcpServers[], tools[], knowledgeCfg{}, enabledSkills[] }
 */
function _buildAgentRuns(respondingIds, groupIds, baseCfg, rawMessages, targetChatMeta, allData) {
  const { agents, mcpServers, tools, knowledgeCfg, enabledSkills } = allData
  const agentsById = Object.fromEntries((agents || []).map(a => [a.id, a]))

  const usrAgentId = targetChatMeta.userAgentId || null
  const usrAgent   = usrAgentId ? agentsById[usrAgentId]
    : (agents || []).find(a => a.type === 'user' && a.isDefault) || null
  const userAgentPrompt = _buildUserAgentPrompt(usrAgent)

  return respondingIds.map(pid => {
    const agent = agentsById[pid]
    if (!agent) return null

    const agentCfg = { ...baseCfg }

    // Apply per-chat model override if present (takes priority over agent global default)
    const perChatOverride = targetChatMeta.agentModelOverrides?.[pid]
    const resolvedProvider = perChatOverride?.provider || agent.providerId || null
    const resolvedModel    = perChatOverride?.model    || agent.modelId    || null

    const isBuiltinOrDefault = agent.isBuiltin || agent.isDefault
    const hasGlobalProvider = baseCfg.providers?.some(p => p.isActive)
    if (!resolvedProvider && !isBuiltinOrDefault && !hasGlobalProvider) return null
    // Non-builtin agents must have a model configured
    if (!isBuiltinOrDefault && !resolvedModel) {
      logger.warn('Skipping agent — no model configured', { agentId: pid, agentName: agent.name })
      return { _skipError: `Agent "${agent.name}" has no model configured. Please set a model in Agent settings.` }
    }

    const effectiveProvider = resolvedProvider || baseCfg.defaultProvider || 'anthropic'
    _applyProviderCredsToConfig(agentCfg, effectiveProvider)
    if (resolvedModel) {
      agentCfg.customModel = resolvedModel
    } else {
      // No explicit model on agent — use provider's configured default model
      const providerEntry = (baseCfg.providers || []).find(p => p.type === effectiveProvider || p.id === effectiveProvider)
      if (providerEntry?.model) agentCfg.customModel = providerEntry.model
    }
    // Pass model context window from Vue metadata (if known)
    const ctxWindows = targetChatMeta.modelContextWindows
    if (resolvedModel && ctxWindows?.[resolvedModel]) {
      agentCfg.modelContextWindow = ctxWindows[resolvedModel]
    }

    const otherParticipants = (groupIds || [])
      .filter(id => id !== pid)
      .map(id => {
        const p = agentsById[id]
        return { id, name: p?.name || 'Unknown', description: p?.description || '', prompt: p?.prompt || '' }
      })

    // Handover note for user-agent switches
    const prevUsrIds = new Set()
    const curUsrId = usrAgent?.id || null
    for (const m of rawMessages) {
      const mid = m.userAgentId || m._userAgentId || null
      if (m.role === 'user' && mid && mid !== curUsrId) prevUsrIds.add(mid)
    }
    let handoverNote = null
    if (prevUsrIds.size > 0) {
      const notes = []
      for (const id of prevUsrIds) {
        const a = agentsById[id]
        if (a) notes.push(`Previous user "${a.name}" (messages prefixed with [${a.name}]:) is no longer in this conversation.`)
      }
      if (notes.length > 0) handoverNote = notes.join(' ')
    }

    const agentPrompts = {
      systemAgentPrompt: agent.prompt || '',
      userAgentPrompt:   userAgentPrompt || '',
      systemAgentId:     pid,
      userAgentId:       usrAgent?.id || '__default_user__',
      userAgentName:        usrAgent?.name || null,
      userAgentDescription: usrAgent?.description || null,
      groupChatContext: { agentName: agent.name, agentDescription: agent.description || '', otherParticipants },
      ...(handoverNote ? { chatHandoverNote: handoverNote } : {}),
    }

    const agentSkills    = _filterByRequired(enabledSkills,  agent.requiredSkillIds      ?? [])
    const agentMcp       = _filterByRequired(mcpServers,     agent.requiredMcpServerIds  ?? [])
    const agentTools     = _filterByRequired(tools,          agent.requiredToolIds        ?? [])
    const agentKnowledge = _buildAgentKnowledgeConfig(agent, knowledgeCfg || {})

    // Per-agent conversation view: other agents' messages prefixed with [Name]:
    const otherNamesList = otherParticipants.map(p => p.name).join(', ')
    const currentUsrId   = usrAgent?.id || null
    const agentMessages  = rawMessages
      .filter(m => (m.role === 'user' && m.content) || (m.role === 'assistant' && !m.streaming && m.content))
      .map(m => {
        const msgAgentId = m.agentId || m._agentId || null
        const msgUsrId   = m.userAgentId || m._userAgentId || null
        if (m.role === 'assistant' && msgAgentId && msgAgentId !== pid) {
          const other = agentsById[msgAgentId]
          return { role: 'assistant', content: `[${other?.name || 'Agent'}]: ${m.content}` }
        }
        if (m.role === 'user' && msgUsrId && msgUsrId !== currentUsrId) {
          const prev = agentsById[msgUsrId]
          return { role: 'user', content: `[${prev?.name || 'Previous User'}]: ${m.content}` }
        }
        return { role: m.role, content: m.content }
      })

    // Structural safeguard: append one-turn constraint to last user message (group only)
    if ((groupIds || []).length > 1 && agentMessages.length > 0) {
      const lastIdx = agentMessages.length - 1
      if (agentMessages[lastIdx].role === 'user') {
        agentMessages[lastIdx] = {
          ...agentMessages[lastIdx],
          content: agentMessages[lastIdx].content + `\n\n[SYSTEM: ${agent.name}, write ONLY your own single response. Do NOT write lines, dialogue, quoted transcript, or speaker labels for ${otherNamesList}. Do NOT output text like [Name]: ... for anyone else. Do NOT continue, summarize, or repeat another participant's answer. The other participants will reply in their own separate turns.]`,
        }
      }
    }

    return {
      agentId:      pid,
      agentName:    agent.name,
      config:       JSON.parse(JSON.stringify(agentCfg)),
      enabledAgents: [],
      enabledSkills: JSON.parse(JSON.stringify(agentSkills)),
      agentPrompts:  JSON.parse(JSON.stringify(agentPrompts)),
      mcpServers:    JSON.parse(JSON.stringify(agentMcp)),
      httpTools:     JSON.parse(JSON.stringify(agentTools)),
      knowledgeConfig: agentKnowledge ? JSON.parse(JSON.stringify(agentKnowledge)) : null,
      messages:     agentMessages,
    }
  }).filter(Boolean)
}

/**
 * Build identity-aware API messages for single-agent path.
 * Prefixes messages from previous agents with [AgentName]: to prevent identity confusion.
 */
function _buildIdentityAwareMessages(rawMessages, currentSysId, currentUsrId, agentsById) {
  const prevSysIds = new Set()
  const prevUsrIds = new Set()
  for (const m of rawMessages) {
    if (m.role === 'assistant') { const id = m._agentId || m.agentId; if (id && id !== currentSysId) prevSysIds.add(id) }
    if (m.role === 'user')      { const id = m._userAgentId || m.userAgentId; if (id && id !== currentUsrId) prevUsrIds.add(id) }
  }
  const hasSysSwitch = prevSysIds.size > 0
  const hasUsrSwitch = prevUsrIds.size > 0
  return rawMessages.map(m => {
    let content = m.content
    const msgAgentId = m._agentId || m.agentId || null
    const msgUsrId   = m._userAgentId || m.userAgentId || null
    if (m.role === 'assistant') {
      if (msgAgentId && msgAgentId !== currentSysId) {
        const prev = agentsById[msgAgentId]
        content = `[${prev?.name || 'Previous Assistant'}]: ${content}`
      } else if (!msgAgentId && hasSysSwitch) {
        content = `[Previous Assistant]: ${content}`
      }
    } else if (m.role === 'user') {
      if (msgUsrId && msgUsrId !== currentUsrId) {
        const prev = agentsById[msgUsrId]
        content = `[${prev?.name || 'Previous User'}]: ${content}`
      } else if (!msgUsrId && hasUsrSwitch) {
        content = `[Previous User]: ${content}`
      }
    }
    const result = { role: m.role, content }
    return result
  })
}

// Register memory:* IPC handlers now that runMemoryExtraction is defined
function register() {

ipcMain.handle('agent:run', async (event, { chatId, messages, config, enabledAgents, enabledSkills, currentAttachments, agentPrompts, mcpServers, httpTools, agentRuns, knowledgeConfig, injectedPlan, chatPermissionMode, chatAllowList, chatDangerOverrides, maxOutputTokens }) => {
  const normalizedIncomingConfig = _normalizeLoopConfig(config, agentPrompts?.systemAgentId || null)
  logger.agent('IPC agent:run received', { chatId, model: normalizedIncomingConfig?.customModel || normalizedIncomingConfig?.anthropic?.activeModel || normalizedIncomingConfig?.activeModel, msgCount: messages?.length, agentRuns: agentRuns?.length || 0 })
  logger.agent('config', {
    provider: normalizedIncomingConfig?.provider?.type || normalizedIncomingConfig?._resolvedProvider || normalizedIncomingConfig?.defaultProvider || _detectModelProviderType(normalizedIncomingConfig?.customModel) || 'anthropic',
    model: normalizedIncomingConfig?.customModel || normalizedIncomingConfig?.anthropic?.activeModel,
    hasKey: !!(normalizedIncomingConfig?.openaiApiKey || normalizedIncomingConfig?.apiKey),
  })

  // If this chat already has a running loop, stop it first
  for (const [key, loop] of activeLoops) {
    if (key === chatId || key.startsWith(chatId + ':')) {
      loop.stop()
      activeLoops.delete(key)
    }
  }

  // -- RAG retrieval helper: query local knowledge bases for a given config + messages --
  async function queryRagContext(kCfg, msgs) {
    if (!kCfg) return null
    // Merge with file-based config so we always have the latest knowledgeBases
    const fileCfg = ds.readJSON(ds.paths().KNOWLEDGE_FILE, {})
    if (!kCfg.knowledgeBases || Object.keys(kCfg.knowledgeBases).length === 0) {
      kCfg.knowledgeBases = fileCfg.knowledgeBases || {}
    }
    if (kCfg.ragEnabled === undefined) kCfg.ragEnabled = fileCfg.ragEnabled !== false

    if (!kCfg.ragEnabled) return null

    try {
      const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
      const queryText = typeof lastUserMsg?.content === 'string'
        ? lastUserMsg.content
        : (Array.isArray(lastUserMsg?.content)
          ? lastUserMsg.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
          : '')

      if (!queryText.trim()) return null

      const enabledKbIds = Object.entries(kCfg.knowledgeBases || {})
        .filter(([, cfg]) => cfg.enabled !== false)
        .map(([kbId]) => kbId)

      if (enabledKbIds.length === 0) return null

      logger.agent('RAG query', { chatId, queryLen: queryText.length, knowledgeBases: enabledKbIds })
      const allMatches = []
      for (const kbId of enabledKbIds) {
        try {
          const ragResult = await queryRAG({ query: queryText, knowledgeBaseId: kbId, topK: 5 })
          if (ragResult.success && ragResult.matches.length > 0) {
            allMatches.push(...ragResult.matches)
          }
        } catch (kbErr) {
          logger.error('RAG kb query error (non-fatal)', { chatId, kbId, error: kbErr.message })
        }
      }
      if (allMatches.length > 0) {
        allMatches.sort((a, b) => (b.score || 0) - (a.score || 0))
        const result = allMatches.slice(0, 5)
        logger.agent('RAG matches found', { chatId, count: result.length, topScore: result[0]?.score })
        return result
      }
      return null
    } catch (err) {
      logger.error('RAG retrieval error (non-fatal)', { chatId, error: err.message })
      return null
    }
  }

  // -- Single agent: query RAG once using top-level knowledgeConfig --
  const singleAgentRagContext = agentRuns && agentRuns.length >= 1 ? null : await queryRagContext(knowledgeConfig, messages)

  // -- Group chat: one or more agent runs (concurrent) --
  if (agentRuns && agentRuns.length >= 1) {
    logger.agent('Group chat mode (concurrent)', { chatId, agentCount: agentRuns.length })
    const baseMessages = [...messages]

    // Emit all agent_start events upfront so UI creates all message bubbles immediately
    for (const run of agentRuns) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:chunk', {
          chatId,
          chunk: { type: 'agent_start', agentId: run.agentId, agentName: run.agentName }
        })
      }
    }

    // Launch all agent loops concurrently
    const groupCfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
    const promises = agentRuns.map(run => {
      const loopKey = `${chatId}:${run.agentId}`
      const loopConfig = _normalizeLoopConfig({ ...(run.config || normalizedIncomingConfig), soulsDir: ds.paths().SOULS_DIR }, run.agentId)
      if (injectedPlan) loopConfig.injectedPlan = injectedPlan
      loopConfig.sandboxConfig = groupCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
      loopConfig.chatPermissionMode = chatPermissionMode || 'inherit'
      loopConfig.chatAllowList = chatAllowList || []
      // Per-chat value takes precedence; fall back to global config default
      loopConfig.maxOutputTokens = maxOutputTokens || groupCfg.maxOutputTokens || null
      loopConfig._maxOutputTokensExplicit = !!maxOutputTokens
      loopConfig.smtpConfig = groupCfg.smtp || null
      // Inject config-backed paths — all agents share the same global paths
      loopConfig.dataPath     = ds.paths().DATA_DIR
      loopConfig.artifactPath = groupCfg.artifactPath || groupCfg.artyfactPath || ''
      loopConfig.skillsPath   = groupCfg.skillsPath   || ''
      loopConfig.DoCPath      = groupCfg.DoCPath      || ''
      loopConfig.memoryDir    = ds.paths().MEMORY_DIR
      loopConfig.chatId       = chatId
      const loopConfigError = _validateLoopConfig(loopConfig)
      if (loopConfigError) {
        logger.error('agent:run invalid group loop config', { chatId, agentId: run.agentId, error: loopConfigError })
        throw new Error(loopConfigError)
      }

      if (pendingStops.has(chatId)) {
        pendingStops.delete(chatId)
        logger.agent('agent:run — pendingStop found, skipping loop', { chatId, agentId: run.agentId })
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk: { type: 'agent_end', agentId: run.agentId, agentName: run.agentName } })
        }
        return async () => ({ agentId: run.agentId, agentName: run.agentName, success: false, error: 'Cancelled before start', text: '' })
      }

      const loop = new AgentLoop(loopConfig)
      activeLoops.set(loopKey, loop)
      activeLoopMeta.set(loopKey, { chatId, agentId: run.agentId, agentName: run.agentName, isGroup: true })

      return (async () => {
        try {
          // Query RAG per-agent using agent's own knowledgeConfig
          const runRagContext = await queryRagContext(run.knowledgeConfig ? { ...run.knowledgeConfig } : null, baseMessages)

          // Inject pending memory facts for conversational confirmation (one-shot per run)
          const runAgentPrompts = run.agentPrompts || agentPrompts
          const groupPending = pendingMemoryFacts.get(chatId)
          if (groupPending?.length > 0) {
            pendingMemoryFacts.delete(chatId)
            const block = [
              '\n\n[MEMORY PENDING CONFIRMATION]',
              'The following facts were observed but need user confirmation.',
              'At an appropriate moment, naturally ask the user if they want you to remember them.',
              'If confirmed, call update_soul_memory. Do not be abrupt — integrate naturally.',
              ...groupPending.map(p => `- [${p.section}] ${p.entry} (for ${p.target})`),
              '[/MEMORY PENDING CONFIRMATION]',
            ].join('\n')
            if (runAgentPrompts) {
              runAgentPrompts.systemAgentPrompt = (runAgentPrompts.systemAgentPrompt || '') + block
            }
          }
          // Use per-agent messages if provided (includes speaker tags for other agents).
          // Falls back to global baseMessages for backward compatibility.
          const runMessages = run.messages || baseMessages
          const result = await loop.run(
            runMessages,
            run.enabledAgents ?? enabledAgents,
            run.enabledSkills ?? enabledSkills,
            (chunk) => {
              if (!event.sender.isDestroyed()) {
                event.sender.send('agent:chunk', {
                  chatId,
                  chunk: { ...chunk, agentId: run.agentId, agentName: run.agentName }
                })
              }
            },
            currentAttachments,
            runAgentPrompts,
            run.mcpServers ?? mcpServers,
            run.httpTools ?? httpTools,
            runRagContext
          )
          return { agentId: run.agentId, agentName: run.agentName, success: true, result }
        } catch (err) {
          logger.error('agent:run agent error', { chatId, agentId: run.agentId, error: err.message })
          return { agentId: run.agentId, agentName: run.agentName, success: false, error: err.message }
        } finally {
          // Emit agent_end
          if (!event.sender.isDestroyed()) {
            event.sender.send('agent:chunk', {
              chatId,
              chunk: { type: 'agent_end', agentId: run.agentId, agentName: run.agentName }
            })
          }
          if (activeLoops.has(loopKey)) {
            lastContextSnapshots.set(loopKey, activeLoops.get(loopKey).getContextSnapshot())
          }
          activeLoops.delete(loopKey)
          activeLoopMeta.delete(loopKey)
          // Persist cumulative usage
          const _pMetrics  = loop.contextManager.getMetrics()
          const _pProvider = (run.config || config).defaultProvider || 'anthropic'
          const _pModel    = loop.anthropicClient.resolveModel()
          accumulateUsage(chatId, {
            inputTokens:         _pMetrics.inputTokens         || 0,
            outputTokens:        _pMetrics.outputTokens        || 0,
            cacheCreationTokens: _pMetrics.cacheCreationInputTokens || 0,
            cacheReadTokens:     _pMetrics.cacheReadInputTokens     || 0,
          }, _pProvider, _pModel).catch(() => {})
        }
      })()
    })

    const results = await Promise.all(promises)

    // Build a combined context snapshot for the inspector (uses first agent's snapshot as base)
    const agentSnapshots = agentRuns.map(run => {
      const key = `${chatId}:${run.agentId}`
      const snap = lastContextSnapshots.get(key)
      return snap ? { agentName: run.agentName, ...snap } : null
    }).filter(Boolean)
    if (agentSnapshots.length > 0) {
      const base = { ...agentSnapshots[0] }
      base.model = agentSnapshots.map(s => `${s.agentName}: ${s.model || 'default'}`).join(' | ')
      lastContextSnapshots.set(chatId, base)
    }

    // Fire-and-forget memory extraction for group chat -- pass all participants for routing
    // N=10 trigger: only extract when at least 10 new messages since last extraction
    if (agentRuns.length > 0) {
      const prevCount = lastExtractedMsgCount.get(chatId) || 0
      if (messages.length - prevCount >= 10) {
        lastExtractedMsgCount.set(chatId, messages.length)
        const groupParticipants = agentRuns.map(r => ({ id: r.agentId, name: r.agentName, type: 'system' }))
        runMemoryExtraction(event, chatId, messages, config, agentRuns[0].agentPrompts || agentPrompts, groupParticipants)
      }
    }

    return { success: true, results }
  }

  // -- Single agent (backward compat) --
  const fullCfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
  const loopConfig = _normalizeLoopConfig({ ...normalizedIncomingConfig, soulsDir: ds.paths().SOULS_DIR }, agentPrompts?.systemAgentId || null)
  if (injectedPlan) loopConfig.injectedPlan = injectedPlan
  loopConfig.sandboxConfig = fullCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
  loopConfig.chatPermissionMode = chatPermissionMode || 'inherit'
  loopConfig.chatAllowList = chatAllowList || []
  loopConfig.chatDangerOverrides = chatDangerOverrides || []
  // Per-chat value takes precedence; fall back to global config default
  loopConfig.maxOutputTokens = maxOutputTokens || fullCfg.maxOutputTokens || null
  loopConfig._maxOutputTokensExplicit = !!maxOutputTokens
  loopConfig.smtpConfig = fullCfg.smtp || null
  // Inject config-backed paths so the agent always has them regardless of what the renderer sent
  loopConfig.dataPath     = ds.paths().DATA_DIR
  loopConfig.artifactPath = fullCfg.artifactPath || fullCfg.artyfactPath || ''
  loopConfig.skillsPath   = fullCfg.skillsPath   || ''
  loopConfig.DoCPath      = fullCfg.DoCPath      || ''
  loopConfig.memoryDir    = ds.paths().MEMORY_DIR
  loopConfig.chatId       = chatId
  const loopConfigError = _validateLoopConfig(loopConfig)
  if (loopConfigError) {
    logger.error('agent:run invalid loop config', { chatId, error: loopConfigError })
    return { success: false, error: loopConfigError }
  }
  const loop = new AgentLoop(loopConfig)
  activeLoops.set(chatId, loop)
  activeLoopMeta.set(chatId, { chatId, agentId: agentPrompts?.systemAgentId || null, agentName: null, isGroup: false })

  logger.agent('run start', { chatId, model: loopConfig.customModel || loopConfig.anthropic?.activeModel || loopConfig.activeModel, msgCount: messages.length, agents: enabledAgents?.length || 0, skills: (enabledSkills || []).map(s => s.id) })

  // Inject pending memory facts for conversational confirmation (one-shot per run)
  const singlePending = pendingMemoryFacts.get(chatId)
  if (singlePending?.length > 0) {
    pendingMemoryFacts.delete(chatId)
    const block = [
      '\n\n[MEMORY PENDING CONFIRMATION]',
      'The following facts were observed but need user confirmation.',
      'At an appropriate moment, naturally ask the user if they want you to remember them.',
      'If confirmed, call update_soul_memory. Do not be abrupt — integrate naturally.',
      ...singlePending.map(p => `- [${p.section}] ${p.entry} (for ${p.target})`),
      '[/MEMORY PENDING CONFIRMATION]',
    ].join('\n')
    if (!agentPrompts) agentPrompts = {}
    agentPrompts.systemAgentPrompt = (agentPrompts.systemAgentPrompt || '') + block
  }

  try {
    const result = await loop.run(
      messages,
      enabledAgents,
      enabledSkills,
      (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk })
        }
      },
      currentAttachments,
      agentPrompts,
      mcpServers,
      httpTools,
      singleAgentRagContext
    )
    logger.agent('run done', { chatId, success: result !== undefined, resultLen: typeof result === 'string' ? result.length : 0 })
    // Persist cumulative usage to chat JSON
    const _usageMetrics = loop.contextManager.getMetrics()
    const _provider = loopConfig.defaultProvider || loopConfig._resolvedProvider || _detectModelProviderType(loopConfig.customModel) || 'anthropic'
    const _model    = loop.anthropicClient.resolveModel()
    accumulateUsage(chatId, {
      inputTokens:         _usageMetrics.inputTokens         || 0,
      outputTokens:        _usageMetrics.outputTokens        || 0,
      cacheCreationTokens: _usageMetrics.cacheCreationInputTokens || 0,
      cacheReadTokens:     _usageMetrics.cacheReadInputTokens     || 0,
    }, _provider, _model).catch(() => {})
    // Fire-and-forget memory extraction -- N=10 trigger: only when 10+ new messages since last extraction
    const prevCount = lastExtractedMsgCount.get(chatId) || 0
    if (messages.length - prevCount >= 10) {
      lastExtractedMsgCount.set(chatId, messages.length)
      const singleParticipants = agentPrompts?.systemAgentId
        ? [{ id: agentPrompts.systemAgentId, name: agentPrompts.groupChatContext?.agentName || 'Assistant', type: 'system' }]
        : null
      runMemoryExtraction(event, chatId, messages, config, agentPrompts, singleParticipants)
    }
    return { success: true, result }
  } catch (err) {
    logger.error('agent:run error', { chatId, error: err.message })
    return { success: false, error: err.message }
  } finally {
    // Save snapshot before cleanup
    if (activeLoops.has(chatId)) {
      lastContextSnapshots.set(chatId, activeLoops.get(chatId).getContextSnapshot())
    }
    activeLoops.delete(chatId)
    activeLoopMeta.delete(chatId)
  }
})

ipcMain.handle('agent:accumulate-voice-usage', async (_, { chatId, usage }) => {
  await accumulateUsage(chatId, usage)
  return true
})

// ── Run additional agents for a chat WITHOUT stopping existing loops ──────────
// Used by the renderer for the idle-agent queue path (new message while agents running).
// Accepts minimal params — builds agentRuns from disk data internally.
ipcMain.handle('agent:run-additional', async (event, {
  chatId, messages, agentIds, currentAttachments, groupIds,
  targetChatMeta, enabledSkills,
}) => {
  if (!agentIds || agentIds.length === 0) return { success: false, error: 'agentIds required' }
  logger.agent('IPC agent:run-additional received', { chatId, agentIds })

  // Read from disk
  const fullCfg     = ds.readJSON(ds.paths().CONFIG_FILE, {})
  const agentsData  = normalizeAgents(ds.readJSON(ds.paths().AGENTS_FILE, { agents: [] }))
  const mcpData     = normalizeMcpServers(ds.readJSON(ds.paths().MCP_SERVERS_FILE, []))
  const toolsData   = normalizeTools(ds.readJSON(ds.paths().TOOLS_FILE, {}))
  const knowledgeData = ds.readJSON(ds.paths().KNOWLEDGE_FILE, {})
  const meta = targetChatMeta || {}

  const agentRuns = _buildAgentRuns(agentIds, groupIds || agentIds, fullCfg, messages || [], meta, {
    agents: agentsData, mcpServers: mcpData, tools: toolsData,
    knowledgeCfg: knowledgeData, enabledSkills: enabledSkills || [],
  })

  // Skip agents that already have a running loop (safety guard)
  const filteredRuns = agentRuns.filter(run => {
    const loopKey = `${chatId}:${run.agentId}`
    if (activeLoops.has(loopKey)) {
      logger.agent('Skipping already-running agent', { chatId, agentId: run.agentId })
      return false
    }
    return true
  })
  if (filteredRuns.length === 0) return { success: true, results: [] }

  const baseMessages = [...(messages || [])]
  const groupCfg = fullCfg

  for (const run of filteredRuns) {
    if (!event.sender.isDestroyed()) {
      event.sender.send('agent:chunk', { chatId, chunk: { type: 'agent_start', agentId: run.agentId, agentName: run.agentName } })
    }
  }

  const promises = filteredRuns.map(run => {
    const loopKey = `${chatId}:${run.agentId}`
    const loopConfig = { ...(run.config || groupCfg), soulsDir: ds.paths().SOULS_DIR }
    loopConfig.sandboxConfig       = groupCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
    loopConfig.chatPermissionMode  = meta.permissionMode || 'inherit'
    loopConfig.chatAllowList       = meta.chatAllowList || []
    loopConfig.chatDangerOverrides = meta.chatDangerOverrides || []
    loopConfig.maxOutputTokens     = meta.maxOutputTokens || groupCfg.maxOutputTokens || null
    loopConfig._maxOutputTokensExplicit = !!meta.maxOutputTokens
    loopConfig.smtpConfig          = groupCfg.smtp || null
    loopConfig.dataPath            = ds.paths().DATA_DIR
    loopConfig.artifactPath        = groupCfg.artifactPath || groupCfg.artyfactPath || ''
    loopConfig.skillsPath          = groupCfg.skillsPath || ''
    loopConfig.DoCPath             = groupCfg.DoCPath || ''
    loopConfig.memoryDir           = ds.paths().MEMORY_DIR
    loopConfig.chatId              = chatId

    if (pendingStops.has(chatId)) {
      pendingStops.delete(chatId)
      logger.agent('agent:run-additional — pendingStop found, skipping loop', { chatId, agentId: run.agentId })
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:chunk', { chatId, chunk: { type: 'agent_end', agentId: run.agentId, agentName: run.agentName } })
      }
      return async () => ({ agentId: run.agentId, agentName: run.agentName, success: false, error: 'Cancelled before start', text: '' })
    }

    const loop = new AgentLoop(loopConfig)
    activeLoops.set(loopKey, loop)
    activeLoopMeta.set(loopKey, { chatId, agentId: run.agentId, agentName: run.agentName, isGroup: true })

    return (async () => {
      try {
        // RAG
        const runRagContext = await (async () => {
          if (!run.knowledgeConfig) return null
          try {
            const kCfg = { ...run.knowledgeConfig }
            const fileCfg = ds.readJSON(ds.paths().KNOWLEDGE_FILE, {})
            if (!kCfg.knowledgeBases || Object.keys(kCfg.knowledgeBases).length === 0) kCfg.knowledgeBases = fileCfg.knowledgeBases || {}
            if (kCfg.ragEnabled === undefined) kCfg.ragEnabled = fileCfg.ragEnabled !== false
            if (!kCfg.ragEnabled) return null
            const lastUserMsg = [...baseMessages].reverse().find(m => m.role === 'user')
            const queryText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content
              : (Array.isArray(lastUserMsg?.content) ? lastUserMsg.content.filter(b => b.type === 'text').map(b => b.text).join(' ') : '')
            if (!queryText.trim()) return null
            const enabledKbIds = Object.entries(kCfg.knowledgeBases || {}).filter(([, c]) => c.enabled !== false).map(([kbId]) => kbId)
            if (enabledKbIds.length === 0) return null
            const allMatches = []
            for (const kbId of enabledKbIds) {
              try {
                const r = await queryRAG({ query: queryText, knowledgeBaseId: kbId, topK: 5 })
                if (r.success && r.matches.length > 0) allMatches.push(...r.matches)
              } catch {}
            }
            if (allMatches.length > 0) { allMatches.sort((a, b) => (b.score || 0) - (a.score || 0)); return allMatches.slice(0, 5) }
            return null
          } catch { return null }
        })()

        const runAgentPrompts = run.agentPrompts || {}
        const runMessages     = run.messages || baseMessages
        const result = await loop.run(
          runMessages, run.enabledAgents ?? [], run.enabledSkills ?? [],
          (chunk) => { if (!event.sender.isDestroyed()) event.sender.send('agent:chunk', { chatId, chunk: { ...chunk, agentId: run.agentId, agentName: run.agentName } }) },
          currentAttachments || [], runAgentPrompts,
          run.mcpServers ?? [], run.httpTools ?? [], runRagContext
        )
        return { agentId: run.agentId, agentName: run.agentName, success: true, result }
      } catch (err) {
        logger.error('agent:run-additional agent error', { chatId, agentId: run.agentId, error: err.message })
        return { agentId: run.agentId, agentName: run.agentName, success: false, error: err.message }
      } finally {
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk: { type: 'agent_end', agentId: run.agentId, agentName: run.agentName } })
        }
        if (activeLoops.has(loopKey)) lastContextSnapshots.set(loopKey, activeLoops.get(loopKey).getContextSnapshot())
        activeLoops.delete(loopKey)
        activeLoopMeta.delete(loopKey)
        const _pMetrics  = loop.contextManager.getMetrics()
        const _pProvider = (run.config || groupCfg).defaultProvider || 'anthropic'
        const _pModel    = loop.anthropicClient.resolveModel()
        accumulateUsage(chatId, {
          inputTokens:         _pMetrics.inputTokens || 0,
          outputTokens:        _pMetrics.outputTokens || 0,
          cacheCreationTokens: _pMetrics.cacheCreationInputTokens || 0,
          cacheReadTokens:     _pMetrics.cacheReadInputTokens || 0,
        }, _pProvider, _pModel).catch(() => {})
      }
    })()
  })

  const results = await Promise.all(promises)
  return { success: true, results }
})

ipcMain.handle('agent:stop', (event, chatId) => {
  if (chatId) {
    let stopped = false
    // Stop exact match and all group agent loops (chatId:agentId)
    for (const [key, loop] of activeLoops) {
      if (key === chatId || key.startsWith(chatId + ':')) {
        loop.stop()
        activeLoops.delete(key)
        activeLoopMeta.delete(key)
        stopped = true
      }
    }
    if (!stopped) {
      // No active loop found — remember this stop request so agent:send-message
      // can check before creating a loop (race condition: stop arrives before loop exists).
      pendingStops.add(chatId)
      logger.agent('agent:stop — no active loop, registered pendingStop', { chatId })
      // Auto-clear after 5s to avoid stale entries
      setTimeout(() => pendingStops.delete(chatId), 5000)
    }
    return stopped
  }
  // Fallback: stop ALL loops (backward compat / stop-all)
  if (!chatId && activeLoops.size > 0) {
    for (const [, loop] of activeLoops) {
      loop.stop()
    }
    activeLoops.clear()
    return true
  }
  return false
})

ipcMain.handle('agent:get-running', () => {
  return [...activeLoopMeta.values()]
})

ipcMain.handle('agent:permission-response', (event, chatId, { blockId, decision, pattern }) => {
  // Try exact chatId match first, then chatId:agentId prefix
  let loop = activeLoops.get(chatId)
  if (!loop) {
    // Check group agent loops
    for (const [key, l] of activeLoops) {
      if (key.startsWith(chatId + ':')) { loop = l; break }
    }
  }
  if (!loop) {
    logger.warn('agent:permission-response: no active loop for chatId', chatId)
    return { success: false, error: 'No active loop' }
  }
  loop.resolvePermission(blockId, decision, pattern)

  // Persist allow_chat -> chat's chatAllowList in its JSON file
  if (decision === 'allow_chat' && pattern) {
    try {
      const chatFile = path.join(ds.paths().CHATS_DIR, `${chatId}.json`)
      const chat = ds.readJSON(chatFile, null)
      if (chat) {
        if (!Array.isArray(chat.chatAllowList)) chat.chatAllowList = []
        const exists = chat.chatAllowList.some(e => e.pattern === pattern)
        if (!exists) {
          const newEntry = { id: require('crypto').randomUUID(), pattern, description: 'Auto-added from chat approval' }
          chat.chatAllowList.push(newEntry)
          ds.writeJSON(chatFile, chat)
          return { success: true, newChatAllowEntry: newEntry }
        }
      }
    } catch (err) {
      logger.error('agent:permission-response allow_chat persist error', err.message)
    }
  }

  // Persist allow_global -> global sandboxAllowList in config.json
  if (decision === 'allow_global' && pattern) {
    try {
      const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
      if (!cfg.sandboxConfig) cfg.sandboxConfig = { defaultMode: 'sandbox', sandboxAllowList: [] }
      if (!cfg.sandboxConfig.sandboxAllowList) cfg.sandboxConfig.sandboxAllowList = []
      const exists = cfg.sandboxConfig.sandboxAllowList.some(e => e.pattern === pattern)
      if (!exists) {
        cfg.sandboxConfig.sandboxAllowList.push({
          id: require('crypto').randomUUID(),
          pattern,
          description: 'Auto-added from chat approval'
        })
        ds.writeJSON(ds.paths().CONFIG_FILE, cfg)
      }
    } catch (err) {
      logger.error('agent:permission-response persist error', err.message)
    }
  }
  return { success: true }
})

ipcMain.handle('agent:update-permission-mode', (event, chatId, { chatMode, chatAllowList }) => {
  // Update all active loops for this chat (exact + group agent loops)
  let updated = false
  const allAutoResolved = []
  for (const [key, loop] of activeLoops) {
    if (key === chatId || key.startsWith(chatId + ':')) {
      if (typeof loop.updatePermissionMode === 'function') {
        const resolved = loop.updatePermissionMode(chatMode, chatAllowList)
        if (resolved?.length) allAutoResolved.push(...resolved)
        updated = true
      }
    }
  }
  // Notify renderer so it can mark auto-resolved permission segments as allowed
  if (allAutoResolved.length > 0) {
    event.sender.send('agent:chunk', {
      chatId,
      chunk: { type: 'permission_auto_resolved', blockIds: allAutoResolved },
    })
  }
  return { success: updated }
})

ipcMain.handle('agent:compact', (event, chatId) => {
  const loop = chatId ? activeLoops.get(chatId) : null
  if (loop && typeof loop.requestCompaction === 'function') {
    loop.requestCompaction()
    return true
  }
  return false
})

ipcMain.handle('agent:compact-standalone', async (event, { chatId, messages, config, enabledAgents, enabledSkills }) => {
  logger.agent('Standalone compaction requested', { chatId, msgCount: messages?.length })
  const loop = new AgentLoop({ ...config, soulsDir: ds.paths().SOULS_DIR, dataPath: ds.paths().DATA_DIR })
  try {
    const result = await loop.compactStandalone(
      messages,
      enabledAgents,
      enabledSkills,
      (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk })
        }
      }
    )
    lastContextSnapshots.set(chatId, loop.getContextSnapshot())
    return { success: true, ...result }
  } catch (err) {
    logger.error('agent:compact-standalone error', err.message)
    return { success: false, error: err.message }
  }
})

// -- Streaming text-edit LLM call (for inline AI Edit in DocsView) -----------
// Heavier than enhance-prompt (streaming, higher max_tokens) but lighter than
// agent:run (no tool loop, no RAG, no agent). Streams token-by-token via
// 'agent:edit-chunk' so the user sees real-time progress.
const _activeEditRequests = new Map() // requestId → AbortController

ipcMain.handle('agent:edit-text', async (event, { requestId, selectedText, fullFileContent, instruction, messages, fileContext, config }) => {
  let abort = null
  try {
    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: 'Utility model not configured. Set it in Config → AI → Models → Global Model Settings.' })
      return { success: false }
    }
    const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: `Utility model provider "${um.provider}" is missing apiKey or baseURL.` })
      return { success: false }
    }

    const systemPrompt = `You are an AI assistant embedded in a document editor. You receive selected text (or entire file content) and the user's message.

You have two modes:
1. **Question mode**: If the user asks a question about the text (e.g. "what does this do?", "explain this"), answer normally. Do NOT wrap your answer in <replacement> tags.
2. **Edit mode**: If the user asks you to modify/edit/rewrite the text (e.g. "make formal", "add error handling", "fix typos"), output the replacement text wrapped in <replacement>...</replacement> tags. You may include a brief explanation before the tags, but the replacement content must be inside the tags. Output ONLY the replacement text inside the tags — no markdown fences inside, no preamble inside the tags.

Examples:
- User: "what does this function do?" → Answer normally, no tags.
- User: "make this more concise" → Brief note + <replacement>concise version here</replacement>
- User: "add error handling" → <replacement>code with error handling</replacement>`

    // Build conversation messages — supports both legacy single-instruction and multi-turn
    let chatMessages
    if (messages && Array.isArray(messages) && messages.length > 0) {
      // Multi-turn: prepend file + selection context to the first user message
      chatMessages = messages.map((m, i) => {
        if (i === 0 && m.role === 'user') {
          let contextPrefix = ''
          const fName = fileContext?.fileName || 'unknown'
          const fLang = fileContext?.language ? ` (${fileContext.language})` : ''
          // Always include full file content when available
          if (fullFileContent) {
            contextPrefix += `Full file content of "${fName}"${fLang}:\n\`\`\`\n${fullFileContent}\n\`\`\`\n\n`
          }
          // If there's a specific selection different from the full file, show it
          if (selectedText && selectedText !== fullFileContent) {
            contextPrefix += `Currently focused section:\n\`\`\`\n${selectedText}\n\`\`\`\n\n`
          }
          // Fallback: if no fullFileContent, just use selectedText
          if (!fullFileContent && selectedText) {
            contextPrefix = `Text from "${fName}"${fLang}:\n\`\`\`\n${selectedText}\n\`\`\`\n\n`
          }
          return { role: 'user', content: contextPrefix + m.content }
        }
        return { role: m.role, content: m.content }
      })
    } else {
      // Legacy single-instruction path
      const userContent = `Selected text from "${fileContext?.fileName || 'unknown'}"${fileContext?.language ? ` (${fileContext.language})` : ''}:\n\`\`\`\n${selectedText}\n\`\`\`\n\nInstruction: ${instruction}`
      chatMessages = [{ role: 'user', content: userContent }]
    }

    abort = new AbortController()
    _activeEditRequests.set(requestId, abort)

    const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
    let inputTokens = 0, outputTokens = 0

    if (isOpenAI) {
      const { OpenAIClient } = require('../agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        _scenario: 'edit-text',
        ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
        provider: { type: um.provider },
      }
      const oaiClient = new OpenAIClient(cfg)
      const client = oaiClient.getClient()
      const stream = await client.chat.completions.create({
        model: um.model,
        ...oaiClient.tokenLimit(4096),
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...chatMessages,
        ],
      }, { signal: abort.signal })

      for await (const chunk of stream) {
        if (abort.signal.aborted) break
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta && !event.sender.isDestroyed()) {
          event.sender.send('agent:edit-chunk', { requestId, type: 'delta', text: delta })
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0
          outputTokens = chunk.usage.completion_tokens || 0
        }
      }
    } else {
      const { AnthropicClient } = require('../agent/core/AnthropicClient')
      const cfg = {
        apiKey: providerCfg.apiKey,
        baseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _scenario: 'edit-text',
      }
      const client = new AnthropicClient(cfg).getClient()
      const stream = client.messages.stream({
        model: um.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: chatMessages,
      }, { signal: abort.signal })

      stream.on('text', (text) => {
        if (!abort.signal.aborted && !event.sender.isDestroyed()) {
          event.sender.send('agent:edit-chunk', { requestId, type: 'delta', text })
        }
      })

      const finalMsg = await stream.finalMessage()
      inputTokens = finalMsg.usage?.input_tokens || 0
      outputTokens = finalMsg.usage?.output_tokens || 0
    }

    _activeEditRequests.delete(requestId)
    accumulateUtilityUsage(um.model, um.provider, inputTokens, outputTokens).catch(() => {})

    if (!event.sender.isDestroyed()) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'done' })
    }
    return { success: true }
  } catch (err) {
    _activeEditRequests.delete(requestId)
    if (err.name === 'AbortError' || abort?.signal?.aborted) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:edit-chunk', { requestId, type: 'done' })
      }
      return { success: false, cancelled: true }
    }
    logger.error('agent:edit-text error', err.message)
    if (!event.sender.isDestroyed()) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: err.message })
    }
    return { success: false }
  }
})

ipcMain.handle('agent:edit-stop', async (_event, requestId) => {
  const abort = _activeEditRequests.get(requestId)
  if (abort) {
    abort.abort()
    _activeEditRequests.delete(requestId)
  }
  return { success: true }
})

// -- AI Doc: full agent loop for document editing ----------------------------
const _activeDocLoops = new Map() // requestId → AgentLoop

ipcMain.handle('agent:doc-run', async (event, {
  requestId, messages, config, agentPrompt, fileContext,
  selectedText, fullFileContent,
  enabledSkills, mcpServers, httpTools, knowledgeConfig,
  permissionMode
}) => {
  try {
    // Resolve provider/model: use global default (not utility model)
    const provider = config.defaultProvider || 'anthropic'
    const providerCfg = config[provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: `Provider "${provider}" is missing apiKey or baseURL. Configure it in Config → AI → Models.` })
      return { success: false }
    }

    // Build loop config from global config (same pattern as agent:run in ChatsView)
    // CRITICAL: promote provider-specific apiKey/baseURL to top-level,
    // because AnthropicClient/OpenAIClient read config.apiKey / config.baseURL.
    const fullCfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
    const loopConfig = { ...config, soulsDir: ds.paths().SOULS_DIR }

    if (provider === 'anthropic') {
      loopConfig.apiKey  = providerCfg.apiKey
      loopConfig.baseURL = providerCfg.baseURL
    } else if (provider === 'openrouter') {
      loopConfig.apiKey  = providerCfg.apiKey
      loopConfig.baseURL = providerCfg.baseURL
    } else if (provider === 'openai' || provider === 'openai_official' || provider === 'deepseek') {
      loopConfig.defaultProvider   = 'openai'
      loopConfig._resolvedProvider = 'openai'
      loopConfig.openaiApiKey      = providerCfg.apiKey
      loopConfig.openaiBaseURL     = providerCfg.baseURL
      loopConfig.apiKey            = providerCfg.apiKey
      loopConfig.baseURL           = providerCfg.baseURL
      if (provider === 'openai_official' || provider === 'deepseek') loopConfig._directAuth = true
    }

    loopConfig.sandboxConfig = fullCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
    loopConfig.chatPermissionMode = permissionMode || 'allow_all'
    loopConfig.chatAllowList = []
    loopConfig.maxOutputTokens = fullCfg.maxOutputTokens || null
    loopConfig._maxOutputTokensExplicit = false
    loopConfig.dataPath     = ds.paths().DATA_DIR
    loopConfig.artifactPath = fullCfg.artifactPath || fullCfg.artyfactPath || ''
    loopConfig.skillsPath   = fullCfg.skillsPath   || ''
    loopConfig.DoCPath      = fullCfg.DoCPath      || ''
    loopConfig.memoryDir    = ds.paths().MEMORY_DIR

    const loop = new AgentLoop(loopConfig)
    _activeDocLoops.set(requestId, loop)

    // Build doc editing system prompt — include file path so agent/tools know what file to operate on
    const fPath = fileContext?.filePath || ''
    const fName = fileContext?.fileName || 'unknown'
    const fLang = fileContext?.language ? ` (${fileContext.language})` : ''

    const docSystemPrompt = `${agentPrompt || ''}

You are embedded in a document editor. The user is currently editing a file and may ask you to modify text or answer questions about it.

Current file:
- File name: ${fName}
- File path: ${fPath}
- Language: ${fileContext?.language || 'plain text'}

When asked to modify text (translate, rewrite, summarize, edit, etc.), output the replacement wrapped in <replacement>...</replacement> tags. The editor will apply it to the current file automatically — never ask the user where to save or which file to update.
When asked questions about the text, answer directly without tags.
Output ONLY the replacement text inside the tags — no markdown fences inside, no preamble inside the tags.
NEVER ask "where would you like to save" or "which file should I update" — always target the current file shown above.

If you use tools to read or write files, use the exact file path above: ${fPath}`

    // Build file context message prefix
    let contextPrefix = ''
    if (fullFileContent) {
      contextPrefix += `Full file content of "${fName}"${fLang}:\n\`\`\`\n${fullFileContent}\n\`\`\`\n\n`
    }
    if (selectedText && selectedText !== fullFileContent) {
      contextPrefix += `Currently focused section:\n\`\`\`\n${selectedText}\n\`\`\`\n\n`
    }
    if (!fullFileContent && selectedText) {
      contextPrefix = `Text from "${fName}"${fLang}:\n\`\`\`\n${selectedText}\n\`\`\`\n\n`
    }

    // Prepend file context to the first user message
    const chatMessages = messages.map((m, i) => {
      if (i === 0 && m.role === 'user') {
        return { role: 'user', content: contextPrefix + m.content }
      }
      return { role: m.role, content: m.content }
    })

    // RAG retrieval (if enabled)
    let ragContext = null
    if (knowledgeConfig) {
      const fileCfg = ds.readJSON(ds.paths().KNOWLEDGE_FILE, {})
      if (!knowledgeConfig.knowledgeBases || Object.keys(knowledgeConfig.knowledgeBases).length === 0) {
        knowledgeConfig.knowledgeBases = fileCfg.knowledgeBases || {}
      }
      if (knowledgeConfig.ragEnabled === undefined) knowledgeConfig.ragEnabled = fileCfg.ragEnabled !== false
    }
    if (knowledgeConfig?.ragEnabled) {
      try {
        const lastUserMsg = [...chatMessages].reverse().find(m => m.role === 'user')
        const queryText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : ''
        if (queryText.trim()) {
          const enabledKbIds = Object.entries(knowledgeConfig.knowledgeBases || {})
            .filter(([, cfg]) => cfg.enabled !== false)
            .map(([kbId]) => kbId)
          if (enabledKbIds.length > 0) {
            const allMatches = []
            for (const kbId of enabledKbIds) {
              try {
                const ragResult = await queryRAG({ query: queryText.slice(0, 500), knowledgeBaseId: kbId, topK: 3 })
                if (ragResult.success && ragResult.matches.length > 0) {
                  allMatches.push(...ragResult.matches)
                }
              } catch {}
            }
            if (allMatches.length > 0) {
              allMatches.sort((a, b) => (b.score || 0) - (a.score || 0))
              ragContext = allMatches.slice(0, 3)
            }
          }
        }
      } catch {}
    }

    const agentPrompts = {
      systemAgentPrompt: docSystemPrompt,
    }

    // Run the full agent loop
    await loop.run(
      chatMessages,
      [],  // enabledAgents (none for doc editing)
      enabledSkills || [],
      (chunk) => {
        if (event.sender.isDestroyed()) return
        // Map agent chunks to edit-chunk format
        if (chunk.type === 'text' || chunk.type === 'text_delta') {
          event.sender.send('agent:edit-chunk', { requestId, type: 'delta', text: chunk.text || chunk.content || '' })
        } else if (chunk.type === 'tool_call') {
          event.sender.send('agent:edit-chunk', { requestId, type: 'tool_call', name: chunk.name, input: chunk.input, id: chunk.id })
        } else if (chunk.type === 'tool_result') {
          event.sender.send('agent:edit-chunk', { requestId, type: 'tool_result', name: chunk.name, id: chunk.id, result: chunk.result })
        } else if (chunk.type === 'permission_request') {
          event.sender.send('agent:edit-chunk', { requestId, type: 'permission_request', blockId: chunk.blockId, toolName: chunk.toolName, command: chunk.command, toolInput: chunk.toolInput })
        }
      },
      [],  // currentAttachments
      agentPrompts,
      mcpServers || [],
      httpTools || [],
      ragContext
    )

    _activeDocLoops.delete(requestId)
    if (!event.sender.isDestroyed()) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'done' })
    }
    return { success: true }
  } catch (err) {
    _activeDocLoops.delete(requestId)
    logger.error('agent:doc-run error', err.message)
    if (!event.sender.isDestroyed()) {
      if (err.name === 'AbortError') {
        event.sender.send('agent:edit-chunk', { requestId, type: 'done' })
      } else {
        event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: err.message })
      }
    }
    return { success: false }
  }
})

ipcMain.handle('agent:doc-stop', async (_event, requestId) => {
  const loop = _activeDocLoops.get(requestId)
  if (loop) {
    loop.stop()
    _activeDocLoops.delete(requestId)
  }
  return { success: true }
})

ipcMain.handle('agent:doc-permission-response', (_event, requestId, { blockId, decision, pattern }) => {
  const loop = _activeDocLoops.get(requestId)
  if (!loop) {
    logger.warn('agent:doc-permission-response: no active doc loop for requestId', requestId)
    return { success: false, error: 'No active doc loop' }
  }
  loop.resolvePermission(blockId, decision, pattern)
  return { success: true }
})

// -- Lightweight one-shot LLM call (for AI Enhance features) -----------------
// Uses global config.utilityModel — falls back to first active configured provider.
ipcMain.handle('agent:enhance-prompt', async (event, { prompt, config }) => {
  try {
    let um = (config.utilityModel?.provider && config.utilityModel?.model) ? config.utilityModel : null

    // Fallback: pick the first active provider that has credentials
    if (!um) {
      const activeProviders = (config.providers || []).filter(p => p.isActive && p.apiKey)
      const fallback = activeProviders.find(p => p.type === 'google' || p.baseURL) || activeProviders[0]
      if (!fallback) {
        return { success: false, error: 'No configured provider found. Add and activate a provider in Config → AI → Providers.' }
      }
      // Use the provider's selected model if available, otherwise a sensible default per provider
      const fallbackModelMap = {
        anthropic: 'claude-haiku-4-5-20251001',
        openrouter: 'openai/gpt-4o-mini',
        openai_official: 'gpt-4o-mini',
        deepseek: 'deepseek-chat',
        google: 'gemini-2.0-flash',
      }
      um = {
        provider: fallback.type,
        model: fallback.selectedModel || fallbackModelMap[fallback.type] || fallback.type,
        _fallbackProviderCfg: fallback,
      }
    }

    const providerCfg = um._fallbackProviderCfg || (config.providers || []).find(p => p.type === um.provider && p.isActive)
    if (!providerCfg?.apiKey) {
      return { success: false, error: `Provider "${um.provider}" is missing apiKey. Check provider configuration.` }
    }
    if (um.provider !== 'google' && !providerCfg?.baseURL) {
      return { success: false, error: `Provider "${um.provider}" is missing baseURL. Check provider configuration.` }
    }
    // Use the global maxOutputTokens from config, capped at 4096 for utility calls.
    // The global setting reflects what models the user's providers actually support.
    const maxTokens = Math.min(config.maxOutputTokens || 4096, 4096)

    if (um.provider === 'google') {
      const { GoogleGenAI } = require('@google/genai')
      const gc = new GoogleGenAI({ apiKey: providerCfg.apiKey })
      const resp = await gc.models.generateContent({
        model: um.model,
        contents: prompt,
      })
      const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || ''
      accumulateUtilityUsage(um.model, um.provider, 0, 0).catch(() => {})
      return { success: true, text }
    }

    const isOpenAI = um.provider !== 'anthropic' && um.provider !== 'openrouter'
    if (isOpenAI) {
      const { OpenAIClient } = require('../agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        _scenario: 'enhance-prompt',
        ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
        provider: { type: um.provider },
      }
      const oaiClient = new OpenAIClient(cfg)
      const response = await oaiClient.getClient().chat.completions.create({
        model: um.model,
        ...oaiClient.tokenLimit(maxTokens),
        messages: [{ role: 'user', content: prompt }],
      })
      const text = response.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0).catch(() => {})
      return { success: true, text }
    } else {
      // anthropic or openrouter — both use AnthropicClient
      const { AnthropicClient } = require('../agent/core/AnthropicClient')
      const cfg = {
        apiKey:      providerCfg.apiKey,
        baseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _scenario:   'enhance-prompt',
      }
      const client = new AnthropicClient(cfg).getClient()
      const response = await client.messages.create({
        model: um.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
      accumulateUtilityUsage(um.model, um.provider, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0).catch(() => {})
      return { success: true, text }
    }
  } catch (err) {
    logger.error('agent:enhance-prompt error', err.message)
    return { success: false, error: err.message }
  }
})

/**
 * Resolve which @mentioned agents are directly addressed (should respond)
 * vs. passively referenced. Uses a fast single-turn LLM call.
 *
 * Input:  { message, agents: [{id, name}], config }
 * Output: { addresseeIds: string[] }  — subset of the provided agent IDs
 */
/**
 * Resolve which @mentioned agents are actually being addressed vs. referenced.
 * Called directly from agent:send-message collaboration loop and via IPC from renderer.
 */
async function _resolveAddresseesInternal(message, agents, config) {
  try {
    const names = agents.map(p => p.name)
    const systemPrompt = `You are a routing assistant for a group chat. Your job is to identify which participants are being directly spoken TO in a message — meaning they are expected to respond.

A participant is directly addressed if:
- The message asks them a question
- The message gives them an instruction or task
- The message is directly directed at them (e.g. starts with their @name)

A participant is NOT directly addressed if:
- They are merely mentioned as a subject or object ("say hello to X", "do you know X", "tell X about Y")
- They are referenced in passing
- They are explicitly told not to speak, to stay quiet, to hold, or to listen only
- They are mentioned only to exclude them while another participant is being asked to answer

Participants in this chat: ${names.map(n => `"${n}"`).join(', ')}

Reply with ONLY a JSON array of the names that should respond. Example: ["Alice"] or ["Alice", "Bob"]
If none should respond, reply with [].`

    const userContent = `Message: "${message}"`

    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      logger.warn('agent:resolve-addressees: no global utilityModel configured, treating all mentions as addressees')
      return { addresseeIds: agents.map(p => p.id) }
    }
    const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      logger.warn(`agent:resolve-addressees: utilityModel provider "${um.provider}" missing apiKey/baseURL, treating all mentions as addressees`)
      return { addresseeIds: agents.map(p => p.id) }
    }

    let raw
    const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('../agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        _scenario: 'resolve-addressees',
        ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
        provider: { type: um.provider },
      }
      const oaiClient = new OpenAIClient(cfg)
      const resp = await oaiClient.getClient().chat.completions.create({
        model: um.model,
        ...oaiClient.tokenLimit(128),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent },
        ],
      })
      raw = resp.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0).catch(() => {})
    } else {
      // anthropic or openrouter
      const { AnthropicClient } = require('../agent/core/AnthropicClient')
      const cfg = {
        apiKey:      providerCfg.apiKey,
        baseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _scenario:   'resolve-addressees',
      }
      const resp = await new AnthropicClient(cfg).getClient().messages.create({
        model: um.model,
        max_tokens: 128,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      })
      raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.input_tokens || 0, resp.usage?.output_tokens || 0).catch(() => {})
    }

    // Extract JSON array from response (may have surrounding prose)
    const match = raw.match(/\[.*?\]/s)
    const addresseeNames = match ? JSON.parse(match[0]) : []

    // Map names back to IDs (case-insensitive)
    const addresseeIds = agents
      .filter(p => addresseeNames.some(n => n.toLowerCase() === p.name.toLowerCase()))
      .map(p => p.id)

    logger.agent('resolve-addressees', { message: message.slice(0, 80), addresseeNames, addresseeIds })
    return { addresseeIds }
  } catch (err) {
    logger.error('agent:resolve-addressees error', err.message)
    // Fallback: treat all mentioned agents as addressees
    return { addresseeIds: agents.map(p => p.id) }
  }
}

ipcMain.handle('agent:resolve-addressees', async (event, params) => {
  return _resolveAddresseesInternal(params.message, params.agents, params.config)
})

/**
 * Route a group-chat message to the most relevant participants when the user
 * did not explicitly @mention anyone.
 *
 * Input:  { message, agents: [{id, name, description}], config, messages }
 * Output: { audienceIds: string[] }  — subset of the provided agent IDs
 */
async function _routeGroupAudienceInternal(message, agents, config, messages = []) {
  try {
    const participants = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description || '',
    }))

    const recentTranscript = (Array.isArray(messages) ? messages : [])
      .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.content)
      .slice(-8)
      .map(msg => {
        const speaker = msg.role === 'user'
          ? 'User'
          : (msg.agentName || participants.find(agent => agent.id === msg.agentId)?.name || 'Assistant')
        return `${speaker}: ${msg.content}`
      })
      .join('\n')

    const participantBlock = participants
      .map(agent => `- ${agent.name}${agent.description ? `: ${agent.description}` : ''}`)
      .join('\n')

    const heuristicSequential = _buildHeuristicSequentialDispatch(message, agents)
    if (heuristicSequential) {
      const audienceIds = heuristicSequential.dispatched.map(item => item.agentId)
      logger.agent('route-group-audience heuristic sequential', { message: String(message || '').slice(0, 80), audienceIds })
      return { audienceIds }
    }

    const systemPrompt = `You are a routing assistant for a multi-agent group chat.
Choose which participants should respond to the user's message.

Participants:
${participantBlock}

Rules:
- Prefer the smallest useful audience.
- Default to 1 participant when one person is clearly the best fit.
- Choose 2 or more participants only when the user clearly asks for comparison, debate, collaboration, or multiple perspectives.
- Choose ALL participants only when the user explicitly asks everyone to respond.
- Use the recent conversation context to infer who the user is currently talking to.
- If someone was explicitly told to stay quiet, not answer, listen only, or step aside, do NOT select them unless the latest user message clearly re-invites them.
- If one participant is being asked to answer while another is merely being silenced, excluded, or referenced, select only the answering participant.
- If the latest user message gives different instructions to multiple named participants, include all of those participants.
- If the latest user message asks multiple participants to start together, act in parallel, or respond simultaneously, include all of them.
- Return ONLY a JSON array of participant names.

Examples:
- ["Alice"]
- ["Alice", "Bob"]
- []`

    const userContent = `Recent conversation:\n${recentTranscript || '(none)'}\n\nLatest user message: "${message}"`

    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      logger.warn('agent:route-group-audience: no utilityModel configured, falling back to all participants')
      return { audienceIds: agents.map(agent => agent.id) }
    }
    const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      logger.warn(`agent:route-group-audience: utilityModel provider "${um.provider}" missing apiKey/baseURL, falling back to all participants`)
      return { audienceIds: agents.map(agent => agent.id) }
    }

    let raw
    const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('../agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        _scenario: 'route-group-audience',
        ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
        provider: { type: um.provider },
      }
      const oaiClient = new OpenAIClient(cfg)
      const resp = await oaiClient.getClient().chat.completions.create({
        model: um.model,
        ...oaiClient.tokenLimit(128),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      })
      raw = resp.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0).catch(() => {})
    } else {
      const { AnthropicClient } = require('../agent/core/AnthropicClient')
      const cfg = {
        apiKey: providerCfg.apiKey,
        baseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _scenario: 'route-group-audience',
      }
      const resp = await new AnthropicClient(cfg).getClient().messages.create({
        model: um.model,
        max_tokens: 128,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      })
      raw = resp.content.filter(block => block.type === 'text').map(block => block.text).join('').trim()
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.input_tokens || 0, resp.usage?.output_tokens || 0).catch(() => {})
    }

    const match = raw.match(/\[.*?\]/s)
    const audienceNames = match ? JSON.parse(match[0]) : []
    const audienceIds = agents
      .filter(agent => audienceNames.some(name => name.toLowerCase() === agent.name.toLowerCase()))
      .map(agent => agent.id)

    logger.agent('route-group-audience', { message: message.slice(0, 80), audienceNames, audienceIds })
    return { audienceIds }
  } catch (err) {
    logger.error('agent:route-group-audience error', err.message)
    return { audienceIds: agents.map(agent => agent.id) }
  }
}

ipcMain.handle('agent:route-group-audience', async (_event, params) => {
  return _routeGroupAudienceInternal(params.message, params.agents, params.config, params.messages)
})

/**
 * Dispatch group tasks: utility model parses the user message and extracts
 * per-agent task assignments + dependency ordering.
 * Returns: [{ agentId, agentName, assignedTask, dependsOn: [agentId] }]
 */
async function _dispatchGroupTasksInternal(message, agents, config) {
  try {
    const heuristicSequential = _buildHeuristicSequentialDispatch(message, agents)
    const names = agents.map(p => p.name)
    const systemPrompt = `You are a task dispatcher for a group chat with multiple AI participants.
Parse the user's message and determine execution mode + per-participant assignments.

Participants: ${names.map(n => `"${n}"`).join(', ')}

## Execution Mode
Determine whether participants should respond CONCURRENTLY or SEQUENTIALLY:
- SEQUENTIAL: the message implies an ordered exchange — one speaks first, then another responds to them.
  Signals: "说完了回复", "先…再…", "等X说完", "one at a time", "then respond", "respond after", "take turns"
- CONCURRENT: all participants respond independently to the same prompt with no dependency.
  Signals: "同时", "都", "一起", "at the same time", "each of you", or no ordering language.
- Default to CONCURRENT when unclear.

## Task Assignment
- Look for participant-specific instructions, including natural-language name references such as "Bo Jun do X, Yifei do Y" or "Alice handles A while Bob handles B".
- Do NOT require an explicit "@Name:" pattern. Natural-language assignments are valid.
- Detect developer-reviewer workflows such as "implement then review", "fix then review again", "repeat until bug is solved", or "review until approved".
- For SEQUENTIAL mode: the first speaker's task should explicitly tell them to address the next participant by @mention (e.g. "Start the conversation with @Bob — address them directly"). The waiting participant's task describes what to do when their turn comes.
- For developer-reviewer workflows, default to SEQUENTIAL unless the user explicitly asked them to work in parallel.
- In developer-reviewer workflows, the reviewer should @mention the developer again ONLY if there are specific unresolved issues, failing checks, or requested changes.
- In developer-reviewer workflows, if the reviewer finds no concrete remaining issues, they should explicitly say the work is approved / complete and end WITHOUT any @mention.
- In developer-reviewer workflows, the developer should implement the requested changes and stop WITHOUT any @mention unless they are blocked or explicitly need another review round.
- For CONCURRENT mode: each participant's task should tell them to complete only their own portion, independently and in parallel.
- For CONCURRENT mode: do NOT tell participants to quote, hand off to, wait for, or @mention each other unless the user explicitly asked for interaction between them.
- For CONCURRENT mode: participants must not narrate, simulate, or quote the other participants' output. No faux transcript format like "[OtherName]: ...".
- Do NOT instruct agents to @mention unconditionally. Agents should only @mention when they genuinely need input from the other participant. When the discussion reaches a natural conclusion, agents should end without @mention so the conversation can terminate gracefully.
- If no explicit tasks, set assignedTask to null.
- dependsOn: list names of participants this person must wait for before speaking.

Reply with ONLY a JSON object:
{
  "executionMode": "concurrent" | "sequential",
  "dispatched": [
    { "agentName": "Alice", "assignedTask": "Start the conversation with @Bob — address them directly", "dependsOn": [] },
    { "agentName": "Bob", "assignedTask": "Respond to what Alice said", "dependsOn": ["Alice"] }
  ]
}`

    const userContent = `Message: "${message}"`

    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      logger.warn('agent:dispatch-group-tasks: no utilityModel configured, skipping dispatch')
      return heuristicSequential || { dispatched: null }
    }
    const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      logger.warn('agent:dispatch-group-tasks: utilityModel missing credentials, skipping dispatch')
      return heuristicSequential || { dispatched: null }
    }

    let raw
    const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('../agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        _scenario: 'dispatch-group-tasks',
        ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
        provider: { type: um.provider },
      }
      const oaiClient = new OpenAIClient(cfg)
      const resp = await oaiClient.getClient().chat.completions.create({
        model: um.model, ...oaiClient.tokenLimit(512),
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
      })
      raw = resp.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0).catch(() => {})
    } else {
      const { AnthropicClient } = require('../agent/core/AnthropicClient')
      const cfg = { apiKey: providerCfg.apiKey, baseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model, _scenario: 'dispatch-group-tasks' }
      const resp = await new AnthropicClient(cfg).getClient().messages.create({
        model: um.model, max_tokens: 512, system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      })
      raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.input_tokens || 0, resp.usage?.output_tokens || 0).catch(() => {})
    }

    // Parse response — new format is a JSON object with executionMode + dispatched array
    // Fall back to legacy array format for backward compatibility
    let parsedObj = null
    const objMatch = raw.match(/\{[\s\S]*\}/m)
    if (objMatch) {
      try { parsedObj = JSON.parse(objMatch[0]) } catch { /* fall through */ }
    }
    const executionMode = parsedObj?.executionMode || 'concurrent'
    const rawDispatched = Array.isArray(parsedObj?.dispatched)
      ? parsedObj.dispatched
      : (() => { const m = raw.match(/\[[\s\S]*\]/m); return m ? JSON.parse(m[0]) : [] })()

    // Map names → IDs and resolve dependsOn to IDs
    const nameToId = Object.fromEntries(agents.map(p => [p.name.toLowerCase(), p.id]))
    const dispatched = rawDispatched
      .filter(d => d.agentName && d.assignedTask)
      .map(d => ({
        agentId:      nameToId[d.agentName.toLowerCase()] || null,
        agentName:    d.agentName,
        assignedTask: d.assignedTask,
        dependsOn:    (d.dependsOn || []).map(n => nameToId[n.toLowerCase()]).filter(Boolean),
      }))
      .filter(d => d.agentId)

    if (heuristicSequential && (executionMode !== 'sequential' || dispatched.length < heuristicSequential.dispatched.length)) {
      logger.agent('dispatch-group-tasks heuristic override', {
        modelExecutionMode: executionMode,
        modelAgents: dispatched.map(d => d.agentName),
        heuristicAgents: heuristicSequential.dispatched.map(d => d.agentName),
      })
      return heuristicSequential
    }

    logger.agent('dispatch-group-tasks', { executionMode, agents: dispatched.map(d => ({ name: d.agentName, deps: d.dependsOn.length, taskLen: d.assignedTask.length })) })
    return { dispatched, executionMode }
  } catch (err) {
    logger.error('agent:dispatch-group-tasks error', err.message)
    return _buildHeuristicSequentialDispatch(message, agents) || { dispatched: null }
  }
}

ipcMain.handle('agent:dispatch-group-tasks', async (event, { message, agents, config }) => {
  return _dispatchGroupTasksInternal(message, agents, config)
})

/**
 * Suggest chat title using utility model.
 *
 * Input:  { chatId, messages: [{role, content}], attempt }
 * Output: { success: boolean, clear: boolean, title?: string }
 */
ipcMain.handle('agent:suggest-chat-title', async (_event, { chatId, messages, attempt }) => {
  try {
    const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
    const um = cfg.utilityModel
    if (!um?.provider || !um?.model) {
      logger.warn('agent:suggest-chat-title: utility model not configured', { chatId })
      return { success: false, clear: false, error: 'utility model not configured' }
    }

    const providerCfg = cfg[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      logger.warn('agent:suggest-chat-title: utility provider missing credentials', { chatId, provider: um.provider })
      return { success: false, clear: false, error: 'utility model credentials missing' }
    }

    const strictness = Number(attempt || 1) <= 1
      ? 'VERY_STRICT'
      : Number(attempt || 1) === 2
        ? 'BALANCED'
        : 'LENIENT'

    const systemPrompt = `You generate concise chat titles.

Task:
1) Decide whether user intent is clear enough to assign a stable title.
2) If clear, generate one title.
3) If unclear, return clear=false and empty title.

Rules:
- Output ONLY valid JSON with shape: {"clear": boolean, "title": string}
- Title must be 4-30 characters
- No quotes, no punctuation suffix, no emoji
- Prefer concrete intent over generic wording
- Use the conversation language
- If confidence is low, return clear=false
- Strictness mode: ${strictness}`

    const convo = (messages || [])
      .map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${String(m.content || '').trim()}`)
      .filter(Boolean)
      .join('\n')

    const userContent = `Conversation:\n${convo}`

    let raw = ''
    const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('../agent/core/OpenAIClient')
      const clientCfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        _scenario: 'suggest-title',
        ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
        provider: { type: um.provider },
      }
      const oaiClient = new OpenAIClient(clientCfg)
      const resp = await oaiClient.getClient().chat.completions.create({
        model: um.model,
        ...oaiClient.tokenLimit(120),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      })
      raw = resp.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0).catch(() => {})
    } else {
      const { AnthropicClient } = require('../agent/core/AnthropicClient')
      const clientCfg = {
        apiKey: providerCfg.apiKey,
        baseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _scenario: 'suggest-title',
      }
      const resp = await new AnthropicClient(clientCfg).getClient().messages.create({
        model: um.model,
        max_tokens: 120,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      })
      raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.input_tokens || 0, resp.usage?.output_tokens || 0).catch(() => {})
    }

    const match = raw.match(/\{[\s\S]*\}/m)
    const parsed = match ? JSON.parse(match[0]) : null
    const clear = !!parsed?.clear
    const title = String(parsed?.title || '').trim().replace(/[\n\r\t]+/g, ' ')

    if (!clear || !title) {
      return { success: true, clear: false }
    }

    const sanitized = title
      .replace(/["'`]+/g, '')
      .replace(/[.!?。！？]+$/g, '')
      .trim()

    if (!sanitized || sanitized.length < 2) {
      return { success: true, clear: false }
    }

    logger.agent('suggest-chat-title', { chatId, attempt, title: sanitized })
    return { success: true, clear: true, title: sanitized }
  } catch (err) {
    logger.error('agent:suggest-chat-title error', err.message)
    return { success: false, clear: false, error: err.message }
  }
})

ipcMain.handle('agent:test-provider', async (_, { provider, apiKey, baseURL, utilityModel }) => {
  try {
    if (!apiKey || !utilityModel) {
      return { success: false, error: 'Missing required fields (apiKey, utilityModel)' }
    }

    if (provider === 'google') {
      const { GoogleGenAI } = require('@google/genai')
      const gc = new GoogleGenAI({ apiKey })
      const start = Date.now()
      const resp = await gc.models.generateContent({
        model: utilityModel,
        contents: 'hi',
      })
      const ms = Date.now() - start
      const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return { success: true, ms, preview: text.slice(0, 40) }
    }

    if (!baseURL) {
      return { success: false, error: 'Missing required field: baseURL' }
    }

    const isOpenAI = provider === 'openai' || provider === 'openai_official' || provider === 'deepseek' ||
      provider === 'minimax' || provider === 'custom' || provider === 'qwen' || provider === 'glm' ||
      provider === 'mistral' || provider === 'groq' || provider === 'xai' || provider === 'moonshot' ||
      provider === 'doubao' || provider === 'ollama'

    if (isOpenAI) {
      const { OpenAIClient } = require('../agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: apiKey,
        openaiBaseURL: baseURL.replace(/\/+$/, ''),
        customModel: utilityModel,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        _scenario: 'test-provider',
        _directAuth: provider !== 'openai' && provider !== 'ollama',
      }
      cfg.provider = { type: provider }
      const client = new OpenAIClient(cfg)
      const start = Date.now()
      const resp = await client.getClient().chat.completions.create({
        model: utilityModel,
        messages: [{ role: 'user', content: 'hi' }],
      })
      const ms = Date.now() - start
      const text = resp.choices?.[0]?.message?.content || ''
      return { success: true, ms, preview: text.substring(0, 40) }
    } else {
      // Anthropic or OpenRouter (both use AnthropicClient)
      const { AnthropicClient } = require('../agent/core/AnthropicClient')
      const cfg = {
        apiKey,
        baseURL: baseURL.replace(/\/+$/, ''),
        customModel: utilityModel,
        _scenario: 'test-provider',
      }
      const ac = new AnthropicClient(cfg)
      const client = ac.getClient()
      const start = Date.now()
      const resp = await client.messages.create({
        model: utilityModel,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'hi' }],
      })
      const ms = Date.now() - start
      const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || ''
      return { success: true, ms, preview: text.substring(0, 40) }
    }
  } catch (err) {
    logger.error('agent:test-provider error', err.message)
    const msg = err.message || 'Unknown error'
    const status = err.status || err.statusCode
    let friendly = msg
    if (status === 401 || status === 403 || /unauthorized|forbidden|invalid.*key/i.test(msg)) {
      friendly = `Authentication failed (${status || 'auth error'}) — check your API key`
    } else if (/header|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
      friendly = `${msg} — check your Base URL and network connection`
    }
    return { success: false, error: friendly }
  }
})

ipcMain.handle('agent:get-context', (event, chatId) => {
  if (chatId && activeLoops.has(chatId)) return activeLoops.get(chatId).getContextSnapshot()
  if (chatId) return lastContextSnapshots.get(chatId) || null
  return null
})

// ── agent:send-message ────────────────────────────────────────────────────────
// Orchestrates the full send flow on the Node.js side for both single and group chats.
//   - Reads agents/config/MCP/tools/knowledge from disk
//   - Resolves respondingIds via @mention parsing + explicit audience mode
//   - Validates provider credentials; emits send_message_error chunk if invalid
//   - Builds per-agent isolated agentRuns[] via _buildAgentRuns
//   - Runs agents (single = runGroupRound([run]), group = concurrent first round + collaboration loop)
//   - Emits { type: 'send_message_complete', stickyTargetIds } when done
//
// Input (minimal params from Vue):
//   chatId             - chat identifier
//   messages           - raw messages array: { role, content, agentId, userAgentId }
//   groupIds           - all agent IDs in the group ([] for single)
//   isGroup            - true if group chat
//   text               - user's message text (for @mention parsing)
//   pendingAttachments - file attachments for first round
//   enabledSkills      - Vue-owned serialized enabled skill objects
//   stickyTargetIds    - legacy selected audience IDs from Vue
//   targetChatMeta     - { permissionMode, chatAllowList, chatDangerOverrides,
//                         maxOutputTokens, maxAgentRounds, workingPath, codingMode,
//                         claudeContext, userAgentId, systemAgentId,
//                         groupAudienceMode, groupAudienceAgentIds }
ipcMain.handle('agent:send-message', async (event, {
  chatId, messages, groupIds, isGroup, text, pendingAttachments,
  enabledSkills, stickyTargetIds, targetChatMeta,
}) => {
  logger.agent('IPC agent:send-message received', { chatId, isGroup, groupIds })

  // ── parseMentions (same logic as src/utils/mentions.js) ──────────────────
  function parseMentions(text, agents) {
    if (!text || !agents || agents.length === 0) return { mentions: [], mentionAll: false }
    const mentionAll = /@all(?=\W|$)/i.test(text)
    const mentions = []
    const sorted = [...agents].sort((a, b) => b.name.length - a.name.length)
    for (const agent of sorted) {
      const escaped = agent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`@${escaped}(?=\\W|$)`, 'i')
      if (regex.test(text) && !mentions.includes(agent.id)) mentions.push(agent.id)
    }
    return { mentions, mentionAll }
  }

  // ── Helper: run a batch of agentRuns concurrently ─────────────────────────
  async function runGroupRound(runList, roundMessages, attachments, trackMessages, fullCfg, allLoadedSkills) {
    const baseMessages = [...roundMessages]

    for (const run of runList) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:chunk', { chatId, chunk: { type: 'agent_start', agentId: run.agentId, agentName: run.agentName } })
      }
    }

    const promises = runList.map(run => {
      const loopKey = `${chatId}:${run.agentId}`
      const loopConfig = _normalizeLoopConfig({ ...run.config, soulsDir: ds.paths().SOULS_DIR }, run.agentId)
      loopConfig.sandboxConfig = fullCfg.sandboxConfig || { defaultMode: 'sandbox', sandboxAllowList: [] }
      loopConfig.chatPermissionMode = targetChatMeta.permissionMode || 'inherit'
      loopConfig.chatAllowList = targetChatMeta.chatAllowList || []
      loopConfig.chatDangerOverrides = targetChatMeta.chatDangerOverrides || []
      loopConfig.maxOutputTokens = targetChatMeta.maxOutputTokens || fullCfg.maxOutputTokens || null
      loopConfig._maxOutputTokensExplicit = !!targetChatMeta.maxOutputTokens
      loopConfig.smtpConfig = fullCfg.smtp || null
      loopConfig.dataPath     = ds.paths().DATA_DIR
      loopConfig.artifactPath = fullCfg.artifactPath || fullCfg.artyfactPath || ''
      loopConfig.skillsPath   = fullCfg.skillsPath   || ''
      loopConfig.DoCPath      = fullCfg.DoCPath      || ''
      loopConfig.memoryDir    = ds.paths().MEMORY_DIR
      loopConfig.chatId       = chatId
      const loopConfigError = _validateLoopConfig(loopConfig)
      if (loopConfigError) {
        logger.error('agent:send-message invalid loop config', { chatId, agentId: run.agentId, error: loopConfigError })
        throw new Error(loopConfigError)
      }

      // Inject coding mode context into system prompt if provided
      if (targetChatMeta.codingMode && targetChatMeta.claudeContext) {
        const ctxBlock = `\n\n[CODING CONTEXT]\n${targetChatMeta.claudeContext}\n[/CODING CONTEXT]`
        const prompts = run.agentPrompts || {}
        prompts.systemAgentPrompt = (prompts.systemAgentPrompt || '') + ctxBlock
        run.agentPrompts = prompts
      }

      // Check if user already pressed stop before the loop was created (race condition fix)
      if (pendingStops.has(chatId)) {
        pendingStops.delete(chatId)
        logger.agent('agent:send-message — pendingStop found, skipping loop', { chatId, agentId: run.agentId })
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk: { type: 'agent_end', agentId: run.agentId, agentName: run.agentName } })
        }
        return async () => ({ agentId: run.agentId, agentName: run.agentName, success: false, error: 'Cancelled before start', text: '' })
      }

      const loop = new AgentLoop(loopConfig)
      activeLoops.set(loopKey, loop)
      activeLoopMeta.set(loopKey, { chatId, agentId: run.agentId, agentName: run.agentName, isGroup: true })

      const accumulator = createChunkAccumulator()

      return (async () => {
        try {
          const runRagContext = await (async () => {
            if (!run.knowledgeConfig) return null
            try {
              const kCfg = { ...run.knowledgeConfig }
              const fileCfg = ds.readJSON(ds.paths().KNOWLEDGE_FILE, {})
              if (!kCfg.knowledgeBases || Object.keys(kCfg.knowledgeBases).length === 0) kCfg.knowledgeBases = fileCfg.knowledgeBases || {}
              if (kCfg.ragEnabled === undefined) kCfg.ragEnabled = fileCfg.ragEnabled !== false
              if (!kCfg.ragEnabled) return null
              const lastUserMsg = [...baseMessages].reverse().find(m => m.role === 'user')
              const queryText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content
                : (Array.isArray(lastUserMsg?.content) ? lastUserMsg.content.filter(b => b.type === 'text').map(b => b.text).join(' ') : '')
              if (!queryText.trim()) return null
              const enabledKbIds = Object.entries(kCfg.knowledgeBases || {}).filter(([, c]) => c.enabled !== false).map(([kbId]) => kbId)
              if (enabledKbIds.length === 0) return null
              const allMatches = []
              for (const kbId of enabledKbIds) {
                try {
                  const r = await queryRAG({ query: queryText, knowledgeBaseId: kbId, topK: 5 })
                  if (r.success && r.matches.length > 0) allMatches.push(...r.matches)
                } catch {}
              }
              if (allMatches.length > 0) { allMatches.sort((a, b) => (b.score || 0) - (a.score || 0)); return allMatches.slice(0, 5) }
              return null
            } catch { return null }
          })()

          const runAgentPrompts = run.agentPrompts || {}
          const runMessages = run.messages || baseMessages

          // Inject pending memory facts
          const groupPending = pendingMemoryFacts.get(chatId)
          if (groupPending?.length > 0) {
            pendingMemoryFacts.delete(chatId)
            const block = ['\n\n[MEMORY PENDING CONFIRMATION]', 'The following facts were observed but need user confirmation.', 'At an appropriate moment, naturally ask the user if they want you to remember them.', 'If confirmed, call update_soul_memory. Do not be abrupt — integrate naturally.', ...groupPending.map(p => `- [${p.section}] ${p.entry} (for ${p.target})`), '[/MEMORY PENDING CONFIRMATION]'].join('\n')
            runAgentPrompts.systemAgentPrompt = (runAgentPrompts.systemAgentPrompt || '') + block
          }

          const result = await loop.run(
            runMessages,
            run.enabledAgents ?? [],
            run.enabledSkills ?? [],
            (chunk) => {
              if (!event.sender.isDestroyed()) {
                event.sender.send('agent:chunk', { chatId, chunk: { ...chunk, agentId: run.agentId, agentName: run.agentName } })
              }
              accumulator.onChunk(chunk)
            },
            attachments,
            runAgentPrompts,
            run.mcpServers ?? [],
            run.httpTools ?? [],
            runRagContext
          )
          return { agentId: run.agentId, agentName: run.agentName, success: true, result, text: accumulator.getText(), loadedSkills: loop.getLoadedSkills() }
        } catch (err) {
          // Include last user message and any accumulated LLM response in error log
          const lastUserMsg = [...(run.messages || baseMessages)].reverse().find(m => m.role === 'user')
          const lastUserText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content.slice(0, 200) : ''
          const llmText = accumulator.getText()
          logger.error('agent:send-message run error', {
            chatId, agentId: run.agentId, error: err.message,
            lastUserMsg: lastUserText || '(empty)',
            llmResponse: llmText ? llmText.slice(0, 200) : '(none)',
          })
          // Send error chunk so UI can display it with detail tooltip
          if (!event.sender.isDestroyed()) {
            event.sender.send('agent:chunk', { chatId, chunk: { type: 'agent_error', agentId: run.agentId, agentName: run.agentName, errorCode: _classifyError(err), error: err.message } })
          }
          return { agentId: run.agentId, agentName: run.agentName, success: false, error: err.message, text: accumulator.getText() }
        } finally {
          if (!event.sender.isDestroyed()) {
            event.sender.send('agent:chunk', { chatId, chunk: { type: 'agent_end', agentId: run.agentId, agentName: run.agentName } })
          }
          if (activeLoops.has(loopKey)) lastContextSnapshots.set(loopKey, activeLoops.get(loopKey).getContextSnapshot())
          activeLoops.delete(loopKey)
          activeLoopMeta.delete(loopKey)
          const _pMetrics  = loop.contextManager.getMetrics()
          const _pProvider = loopConfig.defaultProvider || loopConfig._resolvedProvider || _detectModelProviderType(loopConfig.customModel) || 'anthropic'
          const _pModel    = loop.anthropicClient.resolveModel()
          accumulateUsage(chatId, {
            inputTokens:         _pMetrics.inputTokens         || 0,
            outputTokens:        _pMetrics.outputTokens        || 0,
            cacheCreationTokens: _pMetrics.cacheCreationInputTokens || 0,
            cacheReadTokens:     _pMetrics.cacheReadInputTokens     || 0,
          }, _pProvider, _pModel).catch(() => {})
        }
      })()
    })

    const results = await Promise.all(promises)

    for (const r of results) {
      if (r.text) {
        trackMessages.push({ role: 'assistant', agentId: r.agentId, content: r.text })
        logger.agent(`[collab-debug] trackMessages.push agentId=${r.agentId} textLen=${r.text.length}`, { chatId })
      } else {
        logger.agent(`[collab-debug] runGroupRound result has NO text for agentId=${r.agentId}`, { chatId })
      }
      // Accumulate skills that were actually loaded by the LLM via load_skill tool
      if (r.loadedSkills && r.loadedSkills.size > 0) {
        if (allLoadedSkills) {
          for (const [id, content] of r.loadedSkills) allLoadedSkills.set(id, content)
        }
        // Persist to per-chat cache so subsequent user messages reuse loaded skills
        if (!chatLoadedSkills.has(chatId)) chatLoadedSkills.set(chatId, new Map())
        const chatCache = chatLoadedSkills.get(chatId)
        for (const [id, content] of r.loadedSkills) chatCache.set(id, content)
      }
    }

    return results
  }

  function buildGroupApiMessages(responderId, sourceMessages, groupAgentsList, allAgents, loadedSkills) {
    const currentUserAgentId = targetChatMeta.userAgentId || null
    const agentsById = Object.fromEntries((allAgents || []).map(a => [a.id, a]))

    const messages = sourceMessages
      .filter(m => (m.role === 'user' && !!m.content) || (m.role === 'assistant' && !!m.content))
      .map(m => {
        if (m.role === 'assistant' && m.agentId && m.agentId !== responderId) {
          const other = groupAgentsList.find(a => a.id === m.agentId)
          return { role: 'assistant', content: `[${other?.name || 'Agent'}]: ${m.content}` }
        }
        if (m.role === 'user' && m.userAgentId && m.userAgentId !== currentUserAgentId) {
          const previousUser = agentsById[m.userAgentId]
          return { role: 'user', content: `[${previousUser?.name || 'Previous User'}]: ${m.content}` }
        }
        return { role: m.role, content: m.content }
      })

    // Inject previously loaded skill content so subsequent rounds don't re-call load_skill
    const skillMessages = _buildSkillInjectionMessages(loadedSkills)
    if (skillMessages.length > 0) {
      messages.unshift(...skillMessages)
    }

    return messages
  }

  // ── Collaboration loop ─────────────────────────────────────────────────────
  async function triggerCollaboration(trackMessages, groupAgents, groupIdsArr, allData, fullCfg, iterationCount, prevMsgCount, allLoadedSkills) {
    const MAX_ITERATIONS = Math.min(100, Math.max(1, targetChatMeta.maxAgentRounds ?? 10))

    const newMessages = trackMessages.slice(prevMsgCount)
      .filter(m => m.role === 'assistant' && m.agentId && groupIdsArr.includes(m.agentId) && m.content)

    logger.agent(`[collab-debug] round=${iterationCount} prevMsgCount=${prevMsgCount} trackMessages.length=${trackMessages.length} newMessages.length=${newMessages.length}`, { chatId })
    for (const nm of newMessages) {
      logger.agent(`[collab-debug]   newMsg agentId=${nm.agentId} contentLen=${(nm.content || '').length}`, { chatId })
    }

    const nextRespondingSet = new Set()
    for (let msgIdx = 0; msgIdx < newMessages.length; msgIdx++) {
      const msg = newMessages[msgIdx]
      const { mentions } = parseMentions(msg.content, groupAgents)
      const others = mentions.filter(id => id !== msg.agentId)
      if (others.length === 0) continue

      let addressees = others
      if (others.length >= 2) {
        try {
          const mentionedAgents = others.map(id => { const a = groupAgents.find(g => g.id === id); return a ? { id, name: a.name } : null }).filter(Boolean)
          const result = await _resolveAddresseesInternal(msg.content, mentionedAgents, fullCfg).catch(() => null)
          if (result?.addresseeIds?.length > 0) addressees = result.addresseeIds
        } catch {}
      }

      for (const id of addressees) {
        if (iterationCount === 0) {
          nextRespondingSet.add(id)
        } else {
          const alreadyRepliedAfter = newMessages.slice(msgIdx + 1).some(m => m.agentId === id)
          if (!alreadyRepliedAfter) nextRespondingSet.add(id)
        }
      }
    }
    if (nextRespondingSet.size === 0) return

    logger.agent(`[send-message] collaboration round ${iterationCount + 1}`, { chatId, agents: [...nextRespondingSet] })

    if (iterationCount >= MAX_ITERATIONS) {
      const summaryContent = `**Collaboration reached the maximum of ${iterationCount} iterations.** The agents were unable to reach a final resolution within the limit. Please review the conversation and decide how to proceed.`
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:chunk', { chatId, chunk: { type: 'collaboration_summary', content: summaryContent } })
      }
      return
    }

    const seqRespondingIds = [...nextRespondingSet]
    const nextLength = trackMessages.length

    for (const pid of seqRespondingIds) {
      const agent = groupAgents.find(a => a.id === pid)
      if (!agent) continue

      const seqApiMessages = buildGroupApiMessages(pid, trackMessages, groupAgents, allData.agents, allLoadedSkills)

      if (iterationCount >= 2 && seqApiMessages.length > 0) {
        const originalPrompt = trackMessages.find(m => m.role === 'user')?.content?.slice(0, 500) || ''
        let guidance
        if (iterationCount >= MAX_ITERATIONS - 2) {
          guidance = [`[WRAP-UP — Round ${iterationCount + 1}/${MAX_ITERATIONS}]`, `Original request: "${originalPrompt}"`, `You are approaching the collaboration limit.`, `Provide your FINAL answer or summary now.`, `Only @mention another agent if there is a critical unresolved blocker — otherwise END without @mention.`, `If you are reviewing work and there are no concrete remaining issues, explicitly say it is approved / complete and STOP without any @mention.`, `Do NOT introduce new topics or expand scope.`].join('\n')
        } else {
          guidance = [`[CHECKPOINT — Round ${iterationCount + 1}/${MAX_ITERATIONS}]`, `Original request: "${originalPrompt}"`, `Evaluate: is the original task complete?`, `If YES — provide final summary, end WITHOUT @mention.`, `If you are reviewing work and there are no concrete remaining issues, explicitly say it is approved / complete and STOP without any @mention.`, `If something specific remains — state what, @mention the relevant agent for ONLY that item.`, `Do NOT expand scope beyond the original request.`, `Do NOT keep the loop alive with polite follow-ups, generic questions, or "anything else" style prompts.`].join('\n')
        }
        seqApiMessages[seqApiMessages.length - 1].content += `\n\n${guidance}`
      }

      const otherNames = groupAgents.filter(a => a.id !== pid).map(a => `@${a.name}`).join(' or ')
      if (seqApiMessages.length > 0 && seqApiMessages[seqApiMessages.length - 1].role === 'assistant') {
        const lastMsg = seqApiMessages[seqApiMessages.length - 1]
        seqApiMessages.push({
          role: 'user',
          content: `${lastMsg.content}\n\n[${agent.name}, you have been addressed above. Write ONLY your own single reply — do NOT write dialogue or lines for any other participant. If you genuinely need another participant's input, end your reply with ${otherNames} to pass the turn. If the topic is concluded, you are giving a final answer, or there is nothing more to discuss, simply end your reply without any @mention — the conversation will close naturally. If you are reviewing work and there are no concrete remaining issues, say it is approved / complete and end without any @mention. Do NOT keep the loop going with generic follow-ups.]`
        })
      }

      const roundRuns = _buildAgentRuns([pid], groupIdsArr, fullCfg, seqApiMessages, targetChatMeta, allData)
      await runGroupRound(roundRuns, seqApiMessages, [], trackMessages, fullCfg, allLoadedSkills)

      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:chunk', { chatId, chunk: { type: 'collaboration_round_done', agentId: pid } })
      }
    }

    await triggerCollaboration(trackMessages, groupAgents, groupIdsArr, allData, fullCfg, iterationCount + 1, nextLength, allLoadedSkills)
  }

  // ── Fire async — return immediately to Vue ─────────────────────────────────
  ;(async () => {
    // Early bail: user may have pressed stop before this IIFE even starts
    if (pendingStops.has(chatId)) {
      pendingStops.delete(chatId)
      logger.agent('agent:send-message IIFE — pendingStop at entry, aborting', { chatId })
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:chunk', { chatId, chunk: { type: 'send_message_complete', stickyTargetIds: stickyTargetIds || [] } })
      }
      return
    }

    // Read all data from disk
    const fullCfg      = ds.readJSON(ds.paths().CONFIG_FILE, {})
    const agentsData   = normalizeAgents(ds.readJSON(ds.paths().AGENTS_FILE, { agents: [] }))
    const mcpData      = normalizeMcpServers(ds.readJSON(ds.paths().MCP_SERVERS_FILE, []))
    const toolsData    = normalizeTools(ds.readJSON(ds.paths().TOOLS_FILE, {}))
    const knowledgeData = ds.readJSON(ds.paths().KNOWLEDGE_FILE, {})

    const agentsById = Object.fromEntries((agentsData || []).map(a => [a.id, a]))
    const safeSkills = Array.isArray(enabledSkills) ? enabledSkills : []

    const allData = { agents: agentsData, mcpServers: mcpData, tools: toolsData, knowledgeCfg: knowledgeData, enabledSkills: safeSkills }

    // Determine the group agents list for @mention parsing
    const effectiveGroupIds = groupIds || []
    const groupAgents = effectiveGroupIds.map(id => agentsById[id]).filter(Boolean).map(a => ({ id: a.id, name: a.name, description: a.description || '' }))

    // trackMessages mirrors the conversation for @mention scanning
    const trackMessages = (messages || []).map(m => ({ ...m }))

    try {
      // ── Determine respondingIds ───────────────────────────────────────────
      let respondingIds = []

      if (isGroup) {
        const { mentions, mentionAll } = parseMentions(text || '', groupAgents)
        let initialIds
        const audienceMode = targetChatMeta?.groupAudienceMode || 'auto'
        const selectedAudienceIds = Array.isArray(targetChatMeta?.groupAudienceAgentIds)
          ? targetChatMeta.groupAudienceAgentIds
          : (Array.isArray(stickyTargetIds) ? stickyTargetIds : [])

        if (mentionAll) {
          initialIds = effectiveGroupIds
        } else if (mentions.length > 0) {
          // Apply resolveAddressees if 2+ mentions to disambiguate addressed vs referenced
          if (mentions.length >= 2) {
            const mentionedAgents = mentions.map(id => agentsById[id]).filter(Boolean).map(a => ({ id: a.id, name: a.name }))
            const resolved = await _resolveAddresseesInternal(text || '', mentionedAgents, fullCfg).catch(() => null)
            initialIds = resolved?.addresseeIds?.length > 0 ? resolved.addresseeIds : mentions
          } else {
            initialIds = mentions
          }
        } else if (audienceMode === 'all') {
          initialIds = effectiveGroupIds
        } else if (audienceMode === 'manual' && selectedAudienceIds.length > 0) {
          initialIds = selectedAudienceIds.filter(id => effectiveGroupIds.includes(id))
        } else {
          const routed = await _routeGroupAudienceInternal(text || '', groupAgents, fullCfg, messages || []).catch(() => null)
          initialIds = routed?.audienceIds?.length > 0 ? routed.audienceIds : effectiveGroupIds
        }

        respondingIds = initialIds.filter(id => effectiveGroupIds.includes(id))
        if (respondingIds.length === 0) respondingIds = effectiveGroupIds
      } else {
        // Single agent
        const singleId = targetChatMeta.systemAgentId || effectiveGroupIds[0] || null
        if (singleId) respondingIds = [singleId]
      }

      if (respondingIds.length === 0) {
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk: { type: 'send_message_error', error: 'No agents found to respond.' } })
        }
        return
      }

      // ── Single-agent: validate provider ──────────────────────────────────
      if (!isGroup) {
        const singleId = respondingIds[0]
        const agent = agentsById[singleId]
        if (agent) {
          const resolvedProvider = agent.providerId || fullCfg.defaultProvider || 'anthropic'
          const isActive = _isProviderActive(fullCfg, resolvedProvider)
          if (!isActive) {
            if (!event.sender.isDestroyed()) {
              event.sender.send('agent:chunk', { chatId, chunk: { type: 'send_message_error', error: `⚠️ Provider "${resolvedProvider}" for agent "${agent.name}" is not active. Please configure it in Settings.` } })
            }
            return
          }
        }
      }

      // ── Build agentRuns ───────────────────────────────────────────────────
      const rawRuns = _buildAgentRuns(respondingIds, effectiveGroupIds, fullCfg, messages || [], targetChatMeta, allData)
      // Emit errors for agents that failed validation (e.g. no model configured)
      for (const r of rawRuns) {
        if (r?._skipError && !event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk: { type: 'send_message_error', error: r._skipError } })
        }
      }
      const agentRuns = rawRuns.filter(r => r && !r._skipError)

      if (agentRuns.length === 0) {
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk: { type: 'send_message_error', error: 'Failed to build agent runs. Check agent provider configuration.' } })
        }
        return
      }

      // Tracks skills actually loaded by LLM via load_skill tool — persists across collaboration rounds
      // Seed from per-chat cache so subsequent user messages reuse previously loaded skills
      const allLoadedSkills = new Map(chatLoadedSkills.get(chatId) || [])

      // ── Echo explicit audience selection for completion event ─────────────
      const newStickyTargetIds = isGroup
        ? ((targetChatMeta?.groupAudienceMode === 'manual' && Array.isArray(targetChatMeta?.groupAudienceAgentIds))
          ? targetChatMeta.groupAudienceAgentIds
          : [])
        : (stickyTargetIds || [])

      // Inject previously loaded skill content into each agentRun's messages
      // so the LLM sees skill history and doesn't re-call load_skill on subsequent turns.
      // Must inject into run.messages (not effectiveMessages) because _buildAgentRuns sets
      // run.messages which overrides baseMessages inside runGroupRound.
      _injectSkillsIntoRuns(agentRuns, allLoadedSkills)

      let effectiveMessages = messages || []

      if (!isGroup) {
        // Single-agent path: run via runGroupRound (same infra, single element list)
        await runGroupRound(agentRuns, effectiveMessages, pendingAttachments || [], trackMessages, fullCfg, allLoadedSkills)

        // Collect snapshot for the inspector (same pattern as group path)
        const run = agentRuns[0]
        if (run) {
          const snap = lastContextSnapshots.get(`${chatId}:${run.agentId}`)
          if (snap) lastContextSnapshots.set(chatId, snap)
        }

        // Memory extraction
        const prevCount = lastExtractedMsgCount.get(chatId) || 0
        if ((messages || []).length - prevCount >= 10) {
          lastExtractedMsgCount.set(chatId, (messages || []).length)
          const participants = agentRuns.map(r => ({ id: r.agentId, name: r.agentName, type: 'system' }))
          runMemoryExtraction(event, chatId, messages || [], fullCfg, agentRuns[0].agentPrompts || {}, participants)
        }

        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk: { type: 'send_message_complete', stickyTargetIds: newStickyTargetIds } })
        }
        return
      }

      // ── Group path ────────────────────────────────────────────────────────

      // Determine execution mode via dispatchGroupTasks
      let assignedTasks = {}
      let executionMode = 'concurrent'
      if (agentRuns.length > 1) {
        try {
          const dispatchResult = await _dispatchGroupTasksInternal(text || '', groupAgents, fullCfg)
          if (dispatchResult?.dispatched) {
            executionMode = dispatchResult.executionMode || 'concurrent'
            for (const t of dispatchResult.dispatched) assignedTasks[t.agentId] = t
          }
        } catch (err) {
          logger.warn('[send-message] dispatchGroupTasks failed (non-fatal)', err.message)
        }
      }

      // Apply assigned tasks to agentRuns
      for (const run of agentRuns) {
        const task = assignedTasks[run.agentId]
        if (task?.assignedTask) {
          run.agentPrompts = run.agentPrompts || {}
          run.agentPrompts.assignedTask = task.assignedTask
        }
      }

      // Determine firstRoundRuns
      let firstRoundRuns
      if (executionMode === 'sequential') {
        firstRoundRuns = agentRuns.filter(r => {
          const task = assignedTasks[r.agentId]
          return !task?.dependsOn || task.dependsOn.length === 0
        })
        if (firstRoundRuns.length === 0) firstRoundRuns = agentRuns
      } else {
        firstRoundRuns = agentRuns
      }

      const msgCountBeforeRun = trackMessages.length

      await runGroupRound(firstRoundRuns, effectiveMessages, pendingAttachments || [], trackMessages, fullCfg, allLoadedSkills)

      // Run sequential dependents if executionMode is sequential
      if (executionMode === 'sequential') {
        const firstRoundIds = new Set(firstRoundRuns.map(r => r.agentId))
        const remainingRuns = agentRuns.filter(r => !firstRoundIds.has(r.agentId))
        for (const run of remainingRuns) {
          const seqApiMessages = buildGroupApiMessages(run.agentId, trackMessages, groupAgents, allData.agents, allLoadedSkills)
          await runGroupRound([run], seqApiMessages, [], trackMessages, fullCfg, allLoadedSkills)
        }
      }

      // Collaboration loop
      if (groupAgents.length >= 2) {
        logger.agent(`[collab-debug] entering collaboration. groupAgents=${groupAgents.length} trackMessages=${trackMessages.length} newSince=${trackMessages.length - msgCountBeforeRun}`, { chatId })
        await triggerCollaboration(trackMessages, groupAgents, effectiveGroupIds, allData, fullCfg, 0, msgCountBeforeRun, allLoadedSkills)
      }

      // Combine per-agent snapshots into a single chatId snapshot for the inspector
      const groupSnaps = agentRuns.map(run => {
        const snap = lastContextSnapshots.get(`${chatId}:${run.agentId}`)
        return snap ? { agentId: run.agentId, agentName: run.agentName, ...snap } : null
      }).filter(Boolean)
      if (groupSnaps.length > 0) {
        const base = { ...groupSnaps[0] }
        base.model = groupSnaps.map(s => `${s.agentName}: ${s.model || 'default'}`).join(' | ')
        base.agentSnapshots = groupSnaps
        lastContextSnapshots.set(chatId, base)
      }

      // Memory extraction
      const prevCount = lastExtractedMsgCount.get(chatId) || 0
      if ((messages || []).length - prevCount >= 10 && agentRuns.length > 0) {
        lastExtractedMsgCount.set(chatId, (messages || []).length)
        const groupParticipants = agentRuns.map(r => ({ id: r.agentId, name: r.agentName, type: 'system' }))
        runMemoryExtraction(event, chatId, messages || [], fullCfg, agentRuns[0].agentPrompts || {}, groupParticipants)
      }

      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:chunk', { chatId, chunk: { type: 'send_message_complete', stickyTargetIds: newStickyTargetIds } })
      }
    } catch (err) {
      logger.error('agent:send-message orchestration error', { chatId, error: err.message })
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:chunk', { chatId, chunk: { type: 'send_message_error', error: err.message } })
      }
    }
  })()

  return { success: true }
})

}

module.exports = { register, activeLoops, activeLoopMeta, lastContextSnapshots, lastExtractedMsgCount, pendingMemoryFacts, runMemoryExtraction, _runStartupIndexRecovery, readSoulFileSync, chatLoadedSkills, _buildSkillInjectionMessages, _injectSkillsIntoRuns }
