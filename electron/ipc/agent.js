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
const { MemoryFlush } = require('../agent/core/MemoryFlush')
const { ChatIndex } = require('../memory/ChatIndex')
const { accumulateUsage, accumulateUtilityUsage } = require('./store')
const { queryRAG } = require('./knowledge')


// --- IPC: Agent Loop ---------------------------------------------------------
// is resolved. im-bridge modules use lazy getDataDir() so they pick it up.
const activeLoops = new Map()          // chatId -> AgentLoop
const activeLoopMeta = new Map()       // same key as activeLoops → { chatId, agentId, agentName, isGroup }
const lastContextSnapshots = new Map() // chatId -> snapshot
const lastExtractedMsgCount = new Map() // chatId -> message count at last extraction
const pendingMemoryFacts = new Map()    // chatId -> Array of pending fact objects (medium-confidence)

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
    const providerCfg = config[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      logger.debug('[Memory] skip: provider missing apiKey/baseURL', { chatId, provider: um.provider })
      return
    }

    logger.debug('[Memory] start', { chatId, provider: um.provider, model: um.model, msgCount: messages?.length })

    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    const extractor = new MemoryExtractor({
      model: um.model,
      apiKey: providerCfg.apiKey,
      baseURL: providerCfg.baseURL,
      isOpenAI,
      directAuth: um.provider === 'deepseek',
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

    const userAgentId = agentPrompts?.userAgentId || '__default_user__'
    const systemAgentId = agentPrompts?.systemAgentId || '__default_system__'

    logger.debug('[Memory] agentIds + soulsDir', { chatId, userAgentId, systemAgentId, soulsDir: ds.paths().SOULS_DIR })
    logger.debug('[Memory] userText preview', { chatId, text: lastUserText.slice(0, 100) })

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

    logger.debug('[Memory] suggestions', { chatId, count: suggestions.length, items: suggestions.map(s => ({ target: s.target, agentType: s.agentType, section: s.section, confidence: s.confidence, entry: s.entry?.slice(0, 80) })) })

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
      const userAgentIdForMemory = agentPrompts?.userAgentId || '__default_user__'
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
    if (!fs.existsSync(CHATS_INDEX_FILE)) return
    const chatsIndex = JSON.parse(fs.readFileSync(CHATS_INDEX_FILE, 'utf8'))
    if (!Array.isArray(chatsIndex)) return

    logger.debug('[Startup] checking for unindexed chats', { total: chatsIndex.length })

    for (const meta of chatsIndex) {
      const agentId = meta.systemAgentId
      if (!agentId) continue

      const chatIndexer = new ChatIndex(ds.paths().AGENT_MEMORY_DIR)
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

// Register memory:* IPC handlers now that runMemoryExtraction is defined
function register() {

ipcMain.handle('agent:run', async (event, { chatId, messages, config, enabledAgents, enabledSkills, currentAttachments, agentPrompts, mcpServers, httpTools, agentRuns, knowledgeConfig, injectedPlan, chatPermissionMode, chatAllowList, chatDangerOverrides, maxOutputTokens }) => {
  logger.agent('IPC agent:run received', { chatId, model: config?.anthropic?.activeModel || config?.activeModel, msgCount: messages?.length, agentRuns: agentRuns?.length || 0 })
  logger.agent('config', { provider: config?.defaultProvider || 'anthropic', model: config?.anthropic?.activeModel, hasKey: !!(config?.apiKey) })

  // If this chat already has a running loop, stop it first
  for (const [key, loop] of activeLoops) {
    if (key === chatId || key.startsWith(chatId + ':')) {
      loop.stop()
      activeLoops.delete(key)
    }
  }

  // -- RAG retrieval helper: query RAG for a given knowledgeConfig + messages --
  async function queryRagContext(kCfg, msgs) {
    if (!kCfg) return null
    // Merge with file-based config so we always have the latest indexConfigs
    const fileCfg = ds.readJSON(ds.paths().KNOWLEDGE_FILE, {})
    const filePineconeKey = ds.readJSON(ds.paths().CONFIG_FILE, {}).pineconeApiKey || ''
    if (!kCfg.pineconeApiKey && filePineconeKey) kCfg.pineconeApiKey = filePineconeKey
    if (!kCfg.indexConfigs || Object.keys(kCfg.indexConfigs).length === 0) {
      kCfg.indexConfigs = fileCfg.indexConfigs || {}
    }
    if (kCfg.ragEnabled === undefined) kCfg.ragEnabled = fileCfg.ragEnabled !== false

    if (!kCfg.ragEnabled || !kCfg.pineconeApiKey) return null

    try {
      const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
      const queryText = typeof lastUserMsg?.content === 'string'
        ? lastUserMsg.content
        : (Array.isArray(lastUserMsg?.content)
          ? lastUserMsg.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
          : '')

      if (!queryText.trim()) return null

      const idxConfigs = kCfg.indexConfigs || {}
      const enabledIndexes = Object.entries(idxConfigs)
        .filter(([, cfg]) => cfg.enabled)
        .map(([name, cfg]) => ({ name, embeddingProvider: cfg.embeddingProvider, embeddingModel: cfg.embeddingModel }))

      if (enabledIndexes.length === 0 && kCfg.pineconeIndexName) {
        enabledIndexes.push({
          name: kCfg.pineconeIndexName,
          embeddingProvider: 'openai',
          embeddingModel: 'text-embedding-3-small'
        })
      }

      if (enabledIndexes.length === 0) return null

      logger.agent('RAG query', { chatId, queryLen: queryText.length, indexes: enabledIndexes.map(i => i.name) })
      const allMatches = []
      for (const idx of enabledIndexes) {
        try {
          const ragResult = await queryRAG({
            query: queryText,
            pineconeApiKey: kCfg.pineconeApiKey,
            pineconeIndexName: idx.name,
            topK: 5,
            embeddingProvider: idx.embeddingProvider,
            embeddingModel: idx.embeddingModel
          })
          if (ragResult.success && ragResult.matches.length > 0) {
            allMatches.push(...ragResult.matches)
          }
        } catch (idxErr) {
          logger.error('RAG index query error (non-fatal)', { chatId, index: idx.name, error: idxErr.message })
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
      const loopConfig = { ...(run.config || config), soulsDir: ds.paths().SOULS_DIR }
      if (injectedPlan) loopConfig.injectedPlan = injectedPlan
      loopConfig.sandboxConfig = groupCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
      loopConfig.chatPermissionMode = chatPermissionMode || 'inherit'
      loopConfig.chatAllowList = chatAllowList || []
      // Per-chat value takes precedence; fall back to global config default
      loopConfig.maxOutputTokens = maxOutputTokens || groupCfg.maxOutputTokens || null
      loopConfig.smtpConfig = groupCfg.smtp || null
      // Inject config-backed paths — all agents share the same global paths
      loopConfig.dataPath     = ds.paths().DATA_DIR
      loopConfig.artifactPath = groupCfg.artifactPath || groupCfg.artyfactPath || ''
      loopConfig.skillsPath   = groupCfg.skillsPath   || ''
      loopConfig.DoCPath      = groupCfg.DoCPath      || ''
      loopConfig.memoryDir    = ds.paths().MEMORY_DIR
      loopConfig.chatId       = chatId
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
  const loopConfig = { ...config, soulsDir: ds.paths().SOULS_DIR }
  if (injectedPlan) loopConfig.injectedPlan = injectedPlan
  loopConfig.sandboxConfig = fullCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
  loopConfig.chatPermissionMode = chatPermissionMode || 'inherit'
  loopConfig.chatAllowList = chatAllowList || []
  loopConfig.chatDangerOverrides = chatDangerOverrides || []
  // Per-chat value takes precedence; fall back to global config default
  loopConfig.maxOutputTokens = maxOutputTokens || fullCfg.maxOutputTokens || null
  loopConfig.smtpConfig = fullCfg.smtp || null
  // Inject config-backed paths so the agent always has them regardless of what the renderer sent
  loopConfig.dataPath     = ds.paths().DATA_DIR
  loopConfig.artifactPath = fullCfg.artifactPath || fullCfg.artyfactPath || ''
  loopConfig.skillsPath   = fullCfg.skillsPath   || ''
  loopConfig.DoCPath      = fullCfg.DoCPath      || ''
  loopConfig.memoryDir    = ds.paths().MEMORY_DIR
  loopConfig.chatId       = chatId
  // Inject image provider config so generate_image tool can call image generation APIs
  loopConfig.imageProvider = _resolveImageProvider(fullCfg)
  const loop = new AgentLoop(loopConfig)
  activeLoops.set(chatId, loop)
  activeLoopMeta.set(chatId, { chatId, agentId: agentPrompts?.systemAgentId || null, agentName: null, isGroup: false })

  logger.agent('run start', { chatId, model: config.anthropic?.activeModel || config.activeModel, msgCount: messages.length, agents: enabledAgents?.length || 0, skills: (enabledSkills || []).map(s => s.id) })

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
    const _provider = config.defaultProvider || (config._resolvedProvider) || 'anthropic'
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
// Used by the renderer to fire idle agents in a group chat while other agents
// are already running (per-agent parallel queue feature). Only the group-chat
// path is supported; agentRuns must be provided.
ipcMain.handle('agent:run-additional', async (event, { chatId, messages, config, enabledAgents, enabledSkills, currentAttachments, agentPrompts, mcpServers, httpTools, agentRuns, knowledgeConfig, chatPermissionMode, chatAllowList, chatDangerOverrides, maxOutputTokens }) => {
  if (!agentRuns || agentRuns.length === 0) return { success: false, error: 'agentRuns required' }
  logger.agent('IPC agent:run-additional received', { chatId, agentCount: agentRuns.length, agents: agentRuns.map(r => r.agentName) })

  // Skip agents that already have a running loop (safety guard)
  const filteredRuns = agentRuns.filter(run => {
    const loopKey = `${chatId}:${run.agentId}`
    if (activeLoops.has(loopKey)) {
      logger.agent('Skipping already-running agent', { chatId, agentId: run.agentId, agentName: run.agentName })
      return false
    }
    return true
  })
  if (filteredRuns.length === 0) return { success: true, results: [] }

  // -- RAG retrieval helper (same as in agent:run) --
  async function queryRagContext(kCfg, msgs) {
    if (!kCfg) return null
    const fileCfg = ds.readJSON(ds.paths().KNOWLEDGE_FILE, {})
    const filePineconeKey = ds.readJSON(ds.paths().CONFIG_FILE, {}).pineconeApiKey || ''
    if (!kCfg.pineconeApiKey && filePineconeKey) kCfg.pineconeApiKey = filePineconeKey
    if (!kCfg.indexConfigs || Object.keys(kCfg.indexConfigs).length === 0) {
      kCfg.indexConfigs = fileCfg.indexConfigs || {}
    }
    if (kCfg.ragEnabled === undefined) kCfg.ragEnabled = fileCfg.ragEnabled !== false
    if (!kCfg.ragEnabled || !kCfg.pineconeApiKey) return null
    try {
      const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
      const queryText = typeof lastUserMsg?.content === 'string'
        ? lastUserMsg.content
        : (Array.isArray(lastUserMsg?.content)
          ? lastUserMsg.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
          : '')
      if (!queryText.trim()) return null
      const idxConfigs = kCfg.indexConfigs || {}
      const enabledIndexes = Object.entries(idxConfigs)
        .filter(([, cfg]) => cfg.enabled)
        .map(([name, cfg]) => ({ name, embeddingProvider: cfg.embeddingProvider, embeddingModel: cfg.embeddingModel }))
      if (enabledIndexes.length === 0 && kCfg.pineconeIndexName) {
        enabledIndexes.push({ name: kCfg.pineconeIndexName, embeddingProvider: 'openai', embeddingModel: 'text-embedding-3-small' })
      }
      if (enabledIndexes.length === 0) return null
      const allMatches = []
      for (const idx of enabledIndexes) {
        try {
          const ragResult = await queryRAG({ query: queryText, pineconeApiKey: kCfg.pineconeApiKey, pineconeIndexName: idx.name, topK: 5, embeddingProvider: idx.embeddingProvider, embeddingModel: idx.embeddingModel })
          if (ragResult.success && ragResult.matches.length > 0) allMatches.push(...ragResult.matches)
        } catch (idxErr) { logger.error('RAG index query error (non-fatal)', { index: idx.name, error: idxErr.message }) }
      }
      if (allMatches.length > 0) { allMatches.sort((a, b) => (b.score || 0) - (a.score || 0)); return allMatches.slice(0, 5) }
      return null
    } catch (err) { logger.error('RAG retrieval error (non-fatal)', { chatId, error: err.message }); return null }
  }

  const baseMessages = [...messages]
  const groupCfg = ds.readJSON(ds.paths().CONFIG_FILE, {})

  // Emit agent_start events
  for (const run of filteredRuns) {
    if (!event.sender.isDestroyed()) {
      event.sender.send('agent:chunk', { chatId, chunk: { type: 'agent_start', agentId: run.agentId, agentName: run.agentName } })
    }
  }

  // Launch agent loops concurrently
  const promises = filteredRuns.map(run => {
    const loopKey = `${chatId}:${run.agentId}`
    const loopConfig = { ...(run.config || config), soulsDir: ds.paths().SOULS_DIR }
    loopConfig.sandboxConfig = groupCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
    loopConfig.chatPermissionMode = chatPermissionMode || 'inherit'
    loopConfig.chatAllowList = chatAllowList || []
    loopConfig.maxOutputTokens = maxOutputTokens || groupCfg.maxOutputTokens || null
    loopConfig.smtpConfig = groupCfg.smtp || null
    loopConfig.dataPath     = ds.paths().DATA_DIR
    loopConfig.artifactPath = groupCfg.artifactPath || groupCfg.artyfactPath || ''
    loopConfig.skillsPath   = groupCfg.skillsPath   || ''
    loopConfig.DoCPath      = groupCfg.DoCPath      || ''
    loopConfig.memoryDir    = ds.paths().MEMORY_DIR
    loopConfig.chatId       = chatId
    const loop = new AgentLoop(loopConfig)
    activeLoops.set(loopKey, loop)
    activeLoopMeta.set(loopKey, { chatId, agentId: run.agentId, agentName: run.agentName, isGroup: true })

    return (async () => {
      try {
        const runRagContext = await queryRagContext(run.knowledgeConfig ? { ...run.knowledgeConfig } : null, baseMessages)
        const runAgentPrompts = run.agentPrompts || agentPrompts
        const runMessages = run.messages || baseMessages
        const result = await loop.run(
          runMessages,
          run.enabledAgents ?? enabledAgents,
          run.enabledSkills ?? enabledSkills,
          (chunk) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('agent:chunk', { chatId, chunk: { ...chunk, agentId: run.agentId, agentName: run.agentName } })
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
  for (const [key, loop] of activeLoops) {
    if (key === chatId || key.startsWith(chatId + ':')) {
      if (typeof loop.updatePermissionMode === 'function') {
        loop.updatePermissionMode(chatMode, chatAllowList)
        updated = true
      }
    }
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
    const providerCfg = config[um.provider]
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

    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    let inputTokens = 0, outputTokens = 0

    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const client = new OpenAIClient(cfg).getClient()
      const stream = await client.chat.completions.create({
        model: um.model,
        max_tokens: 4096,
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
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = {
        apiKey: providerCfg.apiKey,
        baseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
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
    } else if (provider === 'openai' || provider === 'deepseek') {
      loopConfig.defaultProvider   = 'openai'
      loopConfig._resolvedProvider = 'openai'
      loopConfig.openaiApiKey      = providerCfg.apiKey
      loopConfig.openaiBaseURL     = providerCfg.baseURL
      loopConfig.apiKey            = providerCfg.apiKey
      loopConfig.baseURL           = providerCfg.baseURL
      if (provider === 'deepseek') loopConfig._directAuth = true
    }

    loopConfig.sandboxConfig = fullCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
    loopConfig.chatPermissionMode = permissionMode || 'allow_all'
    loopConfig.chatAllowList = []
    loopConfig.maxOutputTokens = fullCfg.maxOutputTokens || null
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
      const filePineconeKey = ds.readJSON(ds.paths().CONFIG_FILE, {}).pineconeApiKey || ''
      if (!knowledgeConfig.pineconeApiKey && filePineconeKey) knowledgeConfig.pineconeApiKey = filePineconeKey
      const fileCfg = ds.readJSON(ds.paths().KNOWLEDGE_FILE, {})
      if (!knowledgeConfig.indexConfigs || Object.keys(knowledgeConfig.indexConfigs).length === 0) {
        knowledgeConfig.indexConfigs = fileCfg.indexConfigs || {}
      }
      if (knowledgeConfig.ragEnabled === undefined) knowledgeConfig.ragEnabled = fileCfg.ragEnabled !== false
    }
    if (knowledgeConfig?.ragEnabled && knowledgeConfig.pineconeApiKey) {
      try {
        const lastUserMsg = [...chatMessages].reverse().find(m => m.role === 'user')
        const queryText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : ''
        if (queryText.trim()) {
          const idxConfigs = knowledgeConfig.indexConfigs || {}
          const enabledIndexes = Object.entries(idxConfigs)
            .filter(([, cfg]) => cfg.enabled)
            .map(([name, cfg]) => ({ name, embeddingProvider: cfg.embeddingProvider, embeddingModel: cfg.embeddingModel }))
          if (enabledIndexes.length > 0) {
            const allMatches = []
            for (const idx of enabledIndexes) {
              try {
                const ragResult = await queryRAG({
                  query: queryText.slice(0, 500),
                  pineconeApiKey: knowledgeConfig.pineconeApiKey,
                  pineconeIndexName: idx.name,
                  topK: 3,
                  embeddingProvider: idx.embeddingProvider,
                  embeddingModel: idx.embeddingModel
                })
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
// Uses global config.utilityModel — supports all providers.
ipcMain.handle('agent:enhance-prompt', async (event, { prompt, config }) => {
  try {
    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      return { success: false, error: 'Utility model not configured. Set it in Config → AI → Models → Global Model Settings.' }
    }
    const providerCfg = config[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      return { success: false, error: `Utility model provider "${um.provider}" is missing apiKey or baseURL.` }
    }
    // Use the global maxOutputTokens from config, capped at 4096 for utility calls.
    // The global setting reflects what models the user's providers actually support.
    const maxTokens = Math.min(config.maxOutputTokens || 4096, 4096)
    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const client = new OpenAIClient(cfg).getClient()
      const response = await client.chat.completions.create({
        model: um.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = response.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0).catch(() => {})
      return { success: true, text }
    } else {
      // anthropic or openrouter — both use AnthropicClient
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = {
        apiKey:      providerCfg.apiKey,
        baseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
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
ipcMain.handle('agent:resolve-addressees', async (event, { message, agents, config }) => {
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

Participants in this chat: ${names.map(n => `"${n}"`).join(', ')}

Reply with ONLY a JSON array of the names that should respond. Example: ["Alice"] or ["Alice", "Bob"]
If none should respond, reply with [].`

    const userContent = `Message: "${message}"`

    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      logger.warn('agent:resolve-addressees: no global utilityModel configured, treating all mentions as addressees')
      return { addresseeIds: agents.map(p => p.id) }
    }
    const providerCfg = config[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      logger.warn(`agent:resolve-addressees: utilityModel provider "${um.provider}" missing apiKey/baseURL, treating all mentions as addressees`)
      return { addresseeIds: agents.map(p => p.id) }
    }

    let raw
    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const resp = await new OpenAIClient(cfg).getClient().chat.completions.create({
        model: um.model,
        max_tokens: 128,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent },
        ],
      })
      raw = resp.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0).catch(() => {})
    } else {
      // anthropic or openrouter
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = {
        apiKey:      providerCfg.apiKey,
        baseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
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
})

/**
 * Dispatch group tasks: utility model parses the user message and extracts
 * per-agent task assignments + dependency ordering.
 * Returns: [{ agentId, agentName, assignedTask, dependsOn: [agentId] }]
 */
ipcMain.handle('agent:dispatch-group-tasks', async (event, { message, agents, config }) => {
  try {
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
- Look for "@Name: task description" patterns to extract individual tasks.
- For SEQUENTIAL mode: the first speaker's task should explicitly tell them to address the next participant by @mention (e.g. "Start the conversation with @Bob — address them directly"). The waiting participant's task describes what to do when their turn comes.
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
      return { dispatched: null }
    }
    const providerCfg = config[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      logger.warn('agent:dispatch-group-tasks: utilityModel missing credentials, skipping dispatch')
      return { dispatched: null }
    }

    let raw
    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const resp = await new OpenAIClient(cfg).getClient().chat.completions.create({
        model: um.model, max_tokens: 512,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
      })
      raw = resp.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0).catch(() => {})
    } else {
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = { apiKey: providerCfg.apiKey, baseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model }
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

    logger.agent('dispatch-group-tasks', { executionMode, agents: dispatched.map(d => ({ name: d.agentName, deps: d.dependsOn.length, taskLen: d.assignedTask.length })) })
    return { dispatched, executionMode }
  } catch (err) {
    logger.error('agent:dispatch-group-tasks error', err.message)
    return { dispatched: null }
  }
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
    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const clientCfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const resp = await new OpenAIClient(clientCfg).getClient().chat.completions.create({
        model: um.model,
        max_tokens: 120,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      })
      raw = resp.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0).catch(() => {})
    } else {
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const clientCfg = {
        apiKey: providerCfg.apiKey,
        baseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
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

    const isOpenAI = provider === 'openai' || provider === 'deepseek'

    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: apiKey,
        openaiBaseURL: baseURL.replace(/\/+$/, ''),
        customModel: utilityModel,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const client = new OpenAIClient(cfg)
      const start = Date.now()
      const resp = await client.getClient().chat.completions.create({
        model: utilityModel,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'hi' }],
      })
      const ms = Date.now() - start
      const text = resp.choices?.[0]?.message?.content || ''
      return { success: true, ms, preview: text.substring(0, 40) }
    } else {
      // Anthropic or OpenRouter (both use AnthropicClient)
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = {
        apiKey,
        baseURL: baseURL.replace(/\/+$/, ''),
        customModel: utilityModel,
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
    return { success: false, error: err.message }
  }
})

ipcMain.handle('agent:get-context', (event, chatId) => {
  if (chatId && activeLoops.has(chatId)) return activeLoops.get(chatId).getContextSnapshot()
  if (chatId) return lastContextSnapshots.get(chatId) || null
  return null
})

}

module.exports = { register, activeLoops, activeLoopMeta, lastContextSnapshots, lastExtractedMsgCount, pendingMemoryFacts, runMemoryExtraction, _runStartupIndexRecovery, readSoulFileSync }
