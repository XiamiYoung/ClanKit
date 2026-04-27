/**
 * AgentLoop — enterprise-grade agentic loop using the Anthropic SDK.
 *
 * Features:
 *  - Streaming responses with real-time text + thinking deltas
 *  - Adaptive thinking (Opus 4.6) or budget-based thinking (older models)
 *  - Tool use with automatic dispatch and result handling
 *  - Sub-agent delegation for parallel/focused subtasks
 *  - Background task management
 *  - Context window tracking with compaction (Anthropic beta API, local trim for OpenAI-compat)
 *  - Todo manager for complex multi-step task planning
 *  - Skill system for domain-specific system prompts
 */
const fs = require('fs')
const path = require('path')
const { logger } = require('../logger')
const { AnthropicClient }  = require('./core/AnthropicClient')
const { OpenAIClient }     = require('./core/OpenAIClient')
const { GeminiClient }       = require('./core/GeminiClient')
const { ContextManager }   = require('./core/ContextManager')
const ctxErrorDetector     = require('./core/contextErrorDetector')
const { ToolRegistry }     = require('./tools/ToolRegistry')
const { SubAgentManager }  = require('./managers/SubAgentManager')
const { TaskManager }      = require('./managers/TaskManager')
const { mcpManager }       = require('./mcp/McpManager')
const { PermissionGate }   = require('./tools/PermissionGate')

const MAX_CONTEXT_TURNS = 20  // max user/assistant turn pairs sent to LLM

// Extracted modules
const spb = require('./systemPromptBuilder')
const mc  = require('./messageConverter')
const te  = require('./toolExecutor')

// Module-level helpers (re-imported from extracted modules for use in run())
const { serializeToolResult, uiResult, sliceToLastNTurns } = mc
const { readSoulFile, readFileIfExists } = spb

// Strip lone Unicode surrogates that break JSON.stringify / Anthropic API.
// Replaces unpaired high/low surrogates with U+FFFD (replacement character).
function stripLoneSurrogates(str) {
  if (typeof str !== 'string') return str
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
}

// Recursively sanitize all strings in an object/array.
function sanitizeForJson(obj) {
  if (typeof obj === 'string') return stripLoneSurrogates(obj)
  if (Array.isArray(obj)) return obj.map(sanitizeForJson)
  if (obj !== null && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeForJson(v)
    }
    return out
  }
  return obj
}

// No hardcoded skill prompts — they arrive dynamically from the UI store

class AgentLoop {
  constructor(config) {
    this.config = config
    this.stopped = false
    this._abortController = new AbortController()
    this._cachedAbortPromise = null // Cache abort promise to avoid listener accumulation

    // Core components — choose client based on provider
    // Support new config.provider structure or fall back to legacy
    let isOpenAIProvider = config.defaultProvider === 'openai' || config._resolvedProvider === 'openai'
    
    // If using new provider config structure
    if (config.provider && config.provider.type) {
      const pType = config.provider.type
      isOpenAIProvider = pType !== 'anthropic' && pType !== 'google'

      // Normalize config for clients
      if (isOpenAIProvider) {
        config.openaiApiKey = config.provider.apiKey || ''
        config.openaiBaseURL = config.provider.baseURL
        if (!config.customModel) config.customModel = config.provider.model
        // _directAuth: standard Bearer auth for all direct providers (not proxy-based openai)
        config._directAuth = pType !== 'openai'
      } else {
        config.apiKey = config.provider.apiKey
        config.baseURL = config.provider.baseURL
        if (!config.customModel) config.customModel = config.provider.model
      }
    }

    if (config.provider?.type === 'google') {
      this.geminiClient = new GeminiClient(config)
      this.isGoogle = true
      this.isOpenAI = false
      // Provide a minimal resolveModel stub so downstream code that calls
      // this.anthropicClient.resolveModel() (e.g. contextManager) doesn't crash.
      this.anthropicClient = {
        resolveModel: () => this.geminiClient.resolveModel(),
        isOpus46: () => false,
        supportsThinking: () => false,
        getClient: () => null,
        countTokens: async () => 0,
      }
    } else if (isOpenAIProvider) {
      this.isGoogle = false
      this.anthropicClient = new OpenAIClient({ ...config, _scenario: config._scenario || 'agent-run' })
      this.isOpenAI = true
    } else {
      this.isGoogle = false
      this.anthropicClient = new AnthropicClient({ ...config, _scenario: config._scenario || 'agent-run' })
      this.isOpenAI = false
    }
    this.contextManager  = new ContextManager(this.anthropicClient, config.modelContextWindow || null)
    this.toolRegistry    = new ToolRegistry(config.soulsDir)
    this.subAgentManager = new SubAgentManager(this.anthropicClient, this.toolRegistry, this.isOpenAI)
    this.taskManager     = new TaskManager()
    this.contextSnapshot = null
    this._pendingPermissions = new Map() // blockId → resolve function

    // Build permission gate from config
    const sandboxCfg = config.sandboxConfig || {}
    const chatDangerOverrides = config.chatDangerOverrides || []
    // Remove patterns the user has un-blocked for this chat
    const effectiveDangerList = (sandboxCfg.dangerBlockList || []).filter(
      e => !chatDangerOverrides.includes(e.pattern)
    )
    this.permissionGate = new PermissionGate({
      globalMode: sandboxCfg.defaultMode || 'sandbox',
      sandboxAllowList: sandboxCfg.sandboxAllowList || [],
      dangerBlockList: effectiveDangerList,
      chatMode: config.chatPermissionMode || 'inherit',
      chatAllowList: config.chatAllowList || [],
    })

    // tool_choice: read from provider settings. Supported values:
    //   'auto'     — model decides (default)
    //   'required' — model MUST call at least one tool (maps to Anthropic 'any')
    //   'none'     — tools listed but model must not call them
    this.toolChoice = (config.provider?.settings?.toolChoice || 'auto').toLowerCase()

    logger.agent('AgentLoop init', {
      provider: config.provider?.type || (this.isOpenAI ? 'openai' : 'anthropic'),
      model: this.anthropicClient.resolveModel(),
      isOpenAI: this.isOpenAI,
      isGoogle: this.isGoogle,
      ctxWindow: config.modelContextWindow || null,
      permissionMode: config.chatPermissionMode || 'inherit',
      toolChoice: this.toolChoice,
    })
  }

  stop() {
    this.stopped = true
    this._abortController.abort()
    this._cachedAbortPromise = null // Clear cache after abort
    // Unblock any suspended permission prompts so their coroutines can exit cleanly
    for (const [, resolve] of this._pendingPermissions) {
      resolve('reject')
    }
    this._pendingPermissions.clear()
  }

  _abortPromise() {
    // Cache the abort promise to avoid creating new listeners on every call.
    // This prevents MaxListenersExceeded when _abortPromise() is called multiple times per iteration.
    if (this._cachedAbortPromise) return this._cachedAbortPromise

    if (this._abortController.signal.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }

    this._cachedAbortPromise = new Promise((_, reject) => {
      const handler = () => reject(new DOMException('Aborted', 'AbortError'))
      this._abortController.signal.addEventListener('abort', handler, { once: true })
    })

    return this._cachedAbortPromise
  }

  /**
   * Live-update the permission gate's chat mode while the loop is running.
   * Called when the user changes permission settings in the chat settings panel.
   * If mode becomes 'all_permissions', any currently pending permission prompts
   * are auto-resolved so the agent continues immediately.
   */
  updatePermissionMode(chatMode, chatAllowList) {
    this.permissionGate.chatMode = chatMode
    if (chatAllowList) this.permissionGate.chatAllowList = chatAllowList
    logger.agent('PermissionGate: mode updated live', { chatMode, chatAllowListLen: chatAllowList?.length })

    // Auto-resolve any pending permission requests when switching to all_permissions
    const autoResolvedBlockIds = []
    if (chatMode === 'all_permissions' && this._pendingPermissions.size > 0) {
      for (const [blockId, resolve] of this._pendingPermissions) {
        logger.agent('PermissionGate: auto-resolving pending block due to mode change', { blockId })
        autoResolvedBlockIds.push(blockId)
        resolve('allow_chat')
      }
      this._pendingPermissions.clear()
    }
    return autoResolvedBlockIds
  }

  requestCompaction() {
    this._compactionRequested = true
  }

  /**
   * Called by main process when user responds to a permission prompt.
   * decision: 'allow_chat' | 'allow_global' | 'reject'
   * pattern:  the command string to add to the allow list
   */
  resolvePermission(blockId, decision, pattern) {
    const resolve = this._pendingPermissions.get(blockId)
    if (!resolve) {
      logger.warn('resolvePermission: no pending promise for blockId', blockId)
      return
    }
    // Update in-memory allow list so subsequent calls skip the prompt
    if (decision === 'allow_chat' && pattern) {
      this.permissionGate.addToAllowList(pattern, 'chat')
    } else if (decision === 'allow_global' && pattern) {
      this.permissionGate.addToAllowList(pattern, 'global')
    }
    resolve(decision)
  }

  /**
   * Helper: check permission for a tool call, emitting a prompt if needed.
   * Returns the decision string: 'allow' | 'reject' | null (for 'block' — handled internally)
   * On 'block' it returns the error result directly.
   */
  async _checkPermission(toolName, toolInput, onChunk) {
    const RESTRICTED_FILE_OPS = ['write', 'append', 'delete', 'mkdir']
    const RESTRICTED_KNOWLEDGE_OPS = ['create_knowledge_base', 'upload_file', 'add_text', 'delete_document']
    const isMcp = toolName.startsWith('mcp_')

    // Only check: execute_shell, file_operation (write/append/delete/mkdir), knowledge_manage (write ops), mcp_*
    const needsCheck = toolName === 'execute_shell'
      || (toolName === 'file_operation' && RESTRICTED_FILE_OPS.includes(toolInput.operation))
      || (toolName === 'knowledge_manage' && RESTRICTED_KNOWLEDGE_OPS.includes(toolInput.operation))
      || isMcp

    if (!needsCheck) return { decision: 'allow' }

    const check = this.permissionGate.check(toolName, toolInput)

    if (check.decision === 'block') {
      logger.agent('PermissionGate: BLOCK', { toolName, reason: check.reason })
      return {
        decision: 'block',
        result: { error: `Operation blocked: matches danger list pattern. Remove it from Config → Security → Danger Block List to allow. (matched: "${check.commandStr}")` }
      }
    }

    if (check.decision === 'allow') {
      logger.agent('PermissionGate: ALLOW', { toolName, reason: check.reason })
      return { decision: 'allow' }
    }

    // decision === 'ask' — pause and prompt the user
    const blockId = require('crypto').randomUUID()
    logger.agent('PermissionGate: ASK', { toolName, blockId })

    const userDecision = await new Promise((resolve) => {
      this._pendingPermissions.set(blockId, resolve)
      onChunk({
        type: 'permission_request',
        blockId,
        toolName,
        command: check.commandStr,
        toolInput,
      })
    })
    this._pendingPermissions.delete(blockId)

    if (userDecision === 'reject') {
      return {
        decision: 'reject',
        result: { error: 'Operation rejected by user' }
      }
    }

    // allow_chat or allow_global — proceed with execution
    return { decision: 'allow' }
  }

  getContextSnapshot() {
    return this.contextSnapshot
  }

  getLoadedSkills() {
    return this.loadedSkills || new Map()
  }

  /**
   * Standalone compaction — makes one API call with compaction enabled
   * to compress the conversation history. Works when the agent loop is NOT running.
   * For Anthropic providers: uses the beta compaction API.
   * For OpenAI-compat providers: falls back to local message trimming.
   */
  async compactStandalone(messages, enabledAgents, enabledSkills, onChunk, agentPrompts) {
    this.toolRegistry.loadForAgents(enabledAgents || [])

    this.skillPrompts = new Map()
    this.loadedSkills = new Map()  // tracks skills actually loaded by LLM via load_skill tool
    for (const skill of enabledSkills || []) {
      if (typeof skill !== 'string' && skill.systemPrompt) {
        this.skillPrompts.set(skill.id, skill.systemPrompt)
      }
    }

    const systemPrompt = this.buildSystemPrompt(enabledAgents, enabledSkills, agentPrompts)
    const conversationMessages = [
      ...messages,
      { role: 'user', content: '[System: Context compaction requested. Summarize our conversation so far in 2-3 sentences, then continue as normal.]' }
    ]

    const client = this.anthropicClient.getClient()
    const model  = this.anthropicClient.resolveModel()

    // OpenAI-compat provider: local trim only (beta compaction is Anthropic-only)
    if (this.isOpenAI) {
      const estimatedTokens = JSON.stringify(conversationMessages).length / 4
      const trimmed = this.contextManager.localTrim(conversationMessages, estimatedTokens)
      this.contextManager.compactionCount++
      const metrics = this.contextManager.getMetrics()
      onChunk({ type: 'context_update', metrics })
      return { assistantContent: '[Older messages trimmed to fit context window]', metrics }
    }

    // Anthropic: API compaction (all models)
    let createParams = {
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: conversationMessages,
    }

    createParams = this.contextManager.applyCompaction(createParams)
    this.contextManager.compactionCount++

    logger.agent('Standalone compaction', { model, msgCount: messages.length })

    // Sanitize before sending to API
    if (createParams.messages) createParams.messages = sanitizeForJson(createParams.messages)
    if (createParams.system)   createParams.system   = sanitizeForJson(createParams.system)

    let response
    if (createParams.betas && createParams.betas.length > 0) {
      const { betas, ...restParams } = createParams
      response = await client.beta.messages.create({ ...restParams, betas })
    } else {
      response = await client.messages.create(createParams)
    }

    this.contextManager.updateUsage(response)
    const metrics = this.contextManager.getMetrics()
    onChunk({ type: 'context_update', metrics })

    const textContent = response.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('') || ''

    logger.agent('Standalone compaction done', { inputTokens: metrics.inputTokens, responseLen: textContent.length })

    return { assistantContent: textContent, metrics }
  }

  /**
   * Build the system prompt from base + enabled skills + agents + memory.
   *
   * @param {Array} enabledAgents  (unused, kept for signature compat)
   * @param {Array<string|{id:string, name:string, systemPrompt?:string}>} enabledSkills
   *        Either plain skill IDs (legacy) or full skill objects with systemPrompt
   */
  buildSystemPrompt(enabledAgents, enabledSkills, agentContext = {}, userSoulContent, systemSoulContent, participantSouls, memoryContext = {}, ragContext = null) {
    return spb.buildSystemPrompt(this.config, this.mcpServers, this.httpTools, enabledAgents, enabledSkills, agentContext, userSoulContent, systemSoulContent, participantSouls, memoryContext, ragContext)
  }
  /**
   * Build conversation messages, transforming the last user message's
   * attachments into Anthropic multimodal content blocks.
   *
   * @param {Array} messages           Plain [{role, content}] messages
   * @param {Array|undefined} currentAttachments  Attachment objects from the UI
   * @returns {Array} Messages with the last user message potentially multimodal
   */
  _buildConversationMessages(messages, currentAttachments) {
    return mc.buildConversationMessages(messages, currentAttachments)
  }

  /**
   * Main entry point — runs the agentic loop.
   *
   * @param {Array}    messages       Conversation messages [{role, content}]
   * @param {Array<{id:string, name:string}>} enabledAgents  Agent objects toggled on by user
   * @param {Array<{id:string, name:string, systemPrompt:string}>} enabledSkills  Skill objects toggled on by user
   * @param {Function} onChunk        Callback for streaming events
   * @param {Array|undefined} currentAttachments  File attachments for current message
   * @param {{systemAgentPrompt?:string, userAgentPrompt?:string}} agentPrompts  Agent prompt texts
   * @returns {string} Final text output
   */
  async run(messages, enabledAgents, enabledSkills, onChunk, currentAttachments, agentPrompts, mcpServers, httpTools, ragContext) {
    // Store MCP servers for system prompt access
    this.mcpServers = mcpServers || []
    // Store HTTP tools for injection
    this.httpTools = httpTools || []

    // Load tools for enabled agents
    this.toolRegistry.loadForAgents(enabledAgents || [])

    // Register agent-specific tools
    if (this.config.memoryDir && agentPrompts?.systemAgentId) {
      // For analysis chats, search the target agent's history instead of the analyzer's
      const searchTargetId = agentPrompts.analysisTargetAgentId || agentPrompts.systemAgentId
      this.toolRegistry.registerSearchHistoryTool(this.config.memoryDir, searchTargetId)
    }

    // (Cross-agent recommendation lives in the built-in `agent-recommendation`
    // skill rather than as a core tool. The skill ships a tool.js that loads
    // automatically when Clank's skill set includes the skill id — see
    // electron/agent/builtin-skills/agent-recommendation/.)

    // Register dedicated analysis tool for analysis chats
    if (this.config.memoryDir && agentPrompts?.analysisTargetAgentId) {
      const { AnalyzeAgentTool } = require('./tools/AnalyzeAgentTool')
      const analysisTool = new AnalyzeAgentTool(
        this.config.memoryDir,
        agentPrompts.analysisTargetAgentId,
        agentPrompts.analysisTargetAgentName || 'Unknown',
        agentPrompts.analysisTargetAgentPrompt || '',
        this.config.dataPath || '',
        this.config.DoCPath || '',
        agentPrompts.analysisTargetAgentType || 'system'
      )
      this.toolRegistry.registerTool('analyze_agent_history', analysisTool)
      // Inject LLM config for parallel analysis (analyze_all action).
      // IMPORTANT: prefer the agent's OWN model over the global utility model.
      // The Analyst agent's chosen provider/model is what the user explicitly
      // picked — don't silently downgrade to utility model for heavy analysis.
      const agentProvider = this.config.provider?.type
      const agentModel    = this.config.customModel
      const analysisConfig = { ...this.config }
      // Preserve the ORIGINAL global utilityModel from config.json so that
      // skill modelHints with strategy:"chat" can resolve to the real helper
      // model, not the agent-override set below.
      analysisConfig._configUtilityModel = this.config.utilityModel
      if (agentProvider && agentModel) {
        analysisConfig.utilityModel = { provider: agentProvider, model: agentModel }
      }
      this.toolRegistry.setAnalysisConfig(analysisConfig)
      // Stash analysisTool reference for modelHints injection after skill load.
      this._pendingAnalysisTool = analysisTool
    }

    // Auto-register tools declared by enabled built-in skills. Each skill can
    // ship a tool.js in its source directory alongside SKILL.md — the loader
    // requires it, instantiates the class with runtime context, and registers
    // it. agentLoop no longer needs to know about specific skill tools.
    if (Array.isArray(enabledSkills) && enabledSkills.length > 0) {
      try {
        const { loadSkillTools } = require('../lib/skillToolLoader')
        const skillCtx = {
          dataPath: this.config.dataPath || '',
          docPath:  this.config.DoCPath  || '',
          // For analysis chats the "target" (person being analyzed) is the
          // subject; for non-analysis chats these fall back to the agent itself.
          agentId:   agentPrompts?.analysisTargetAgentId   || agentPrompts?.systemAgentId || 'unknown',
          agentName: agentPrompts?.analysisTargetAgentName || agentPrompts?.userAgentName || 'unknown',
          agentType: agentPrompts?.analysisTargetAgentType || 'system',
          language:  this.config.language || 'en',
        }
        const skillResult = loadSkillTools(enabledSkills, skillCtx, this.toolRegistry)
        // Forward any modelHints declared in skill manifests to the analysis tool
        // so it can pick a faster/cheaper model for structured-extraction work.
        if (this._pendingAnalysisTool && skillResult?.modelHints
            && Object.keys(skillResult.modelHints).length > 0) {
          this._pendingAnalysisTool.setModelHints(skillResult.modelHints)
        }
        this._pendingAnalysisTool = null
      } catch (err) {
        logger.error('[agentLoop] skill tool load failed:', err.message)
      }
    }

    // Set compaction config for soul file auto-compression
    const um = this.config.utilityModel
    if (um?.provider && um?.model) {
      const providerCfg = (this.config.providers || []).find(p => p.type === um.provider && p.apiKey)
      if (providerCfg?.apiKey) {
        this.toolRegistry.setSoulCompactionConfig({
          model:        um.model,
          apiKey:       providerCfg.apiKey,
          baseURL:      providerCfg.baseURL,
          isOpenAI:     um.provider !== 'anthropic' && um.provider !== 'openrouter' && um.provider !== 'google',
          directAuth:   um.provider !== 'anthropic' && um.provider !== 'openrouter' && um.provider !== 'google' && um.provider !== 'openai',
          providerType: um.provider,
        })
      }
    }

    // Inject runtime config into tools that need it (e.g. NewsfeedTool reads newsFeeds)
    this.toolRegistry.setRuntimeConfig(this.config)

    // Store full skill prompts for lazy loading via load_skill tool
    this.skillPrompts = new Map()
    this.loadedSkills = new Map()  // tracks skills actually loaded by LLM via load_skill tool
    for (const skill of enabledSkills || []) {
      if (typeof skill !== 'string' && skill.systemPrompt) {
        this.skillPrompts.set(skill.id, skill.systemPrompt)
      }
    }

    // ── Auto-preload skills in analysis mode ──────────────────────────────
    // For analysis chats, skill content is CRITICAL (report templates, visual
    // style, section requirements). If we wait for the LLM to call load_skill
    // it may forget — and the generated report will be missing entire sections.
    // Preload ALL skills upfront into loadedSkills so the system prompt includes
    // their full content from iteration 1.
    if (agentPrompts?.analysisTargetAgentId) {
      for (const [id, prompt] of this.skillPrompts) {
        this.loadedSkills.set(id, prompt)
      }
      if (this.skillPrompts.size > 0) {
        logger.agent('[agentLoop] analysis mode: auto-preloaded skills', {
          count: this.skillPrompts.size,
          ids: [...this.skillPrompts.keys()],
        })
      }
    }

    // Store RAG context for system prompt injection
    this.ragContext = ragContext || null

    // ── Load soul memory before building system prompt ──
    const soulsDir = this.config.soulsDir
    const userAgentId = agentPrompts?.userAgentId
    const systemAgentId = agentPrompts?.systemAgentId
    const userSoulContent = readSoulFile(soulsDir, userAgentId, 'users')
    const systemSoulContent = readSoulFile(soulsDir, systemAgentId, 'system')

    // Load soul content for other group chat participants
    const participantSouls = []
    if (agentPrompts?.groupChatContext?.otherParticipants) {
      for (const p of agentPrompts.groupChatContext.otherParticipants) {
        if (p.id) {
          const content = readSoulFile(soulsDir, p.id, 'system')
          if (content) participantSouls.push({ name: p.name, content })
        }
      }
    }

    // ── Load user profile ──
    const memoryDir = this.config.memoryDir
    let userMd = null

    if (memoryDir && agentPrompts?.userAgentId) {
      const userId = agentPrompts.userAgentId
      userMd = readFileIfExists(path.join(memoryDir, 'users', userId, 'USER.md'))
    }

    let systemPrompt = this.buildSystemPrompt(
      enabledAgents, enabledSkills, agentPrompts,
      userSoulContent, systemSoulContent, participantSouls,
      { userMd },
      this.ragContext
    )

    // ── Reply Bank few-shot injection (Phase C) ──────────────────────────
    // If this system agent has a built Reply Bank (from chat import), retrieve
    // the top 3 semantically-similar past replies for the current user message
    // and inject them as a few-shot block at the end of the system prompt.
    // Purely additive — silent no-op for agents without a reply bank.
    try {
      const activeAgentId = agentPrompts?.systemAgentId
      if (activeAgentId) {
        const ds = require('../lib/dataStore')
        const replyBankMod = require('../memory/ReplyBank')
        const replyBank = replyBankMod.getInstance(ds.paths().AGENT_MEMORY_DIR)
        if (replyBank.has(activeAgentId)) {
          // Find the most recent user message content
          const lastUser = [...messages].reverse().find(m => m.role === 'user')
          const queryText = typeof lastUser?.content === 'string'
            ? lastUser.content
            : Array.isArray(lastUser?.content)
              ? lastUser.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
              : ''
          if (queryText && queryText.trim().length >= 2) {
            const examples = await replyBank.retrieve(activeAgentId, queryText, 3)
            if (examples && examples.length > 0) {
              const block = replyBankMod.formatFewShotBlock(examples)
              if (block) systemPrompt += '\n\n---\n' + block
            }
          }
        }
      }
    } catch (rbErr) {
      // Reply bank injection must never block LLM call — log and continue
      try { require('../logger').logger.warn('[agentLoop] reply bank injection failed:', rbErr.message) } catch {}
    }

    // If a per-agent assigned task was dispatched, replace the last user message
    // with just that task so the LLM never sees other agents' task sections.
    let effectiveMessages = messages
    if (agentPrompts?.assignedTask) {
      const lastUserIdx = [...messages].reverse().findIndex(m => m.role === 'user')
      if (lastUserIdx !== -1) {
        const realIdx = messages.length - 1 - lastUserIdx
        effectiveMessages = messages.map((m, i) =>
          i === realIdx ? { ...m, content: agentPrompts.assignedTask } : m
        )
      }
    }

    const slicedMessages = sliceToLastNTurns(effectiveMessages, MAX_CONTEXT_TURNS)
    const conversationMessages = this._buildConversationMessages(slicedMessages, currentAttachments)
    let finalText = ''

    // Gather all tool definitions: registry + subagent + background tasks
    const allToolsAnthropic = [
      ...this.toolRegistry.getToolDefinitions(),
      this.subAgentManager.getToolDefinition(),
      this.subAgentManager.getBatchToolDefinition(),
      this.taskManager.getToolDefinition()
    ]

    // Add load_skill tool when skills are available
    if (this.skillPrompts.size > 0) {
      allToolsAnthropic.push({
        name: 'load_skill',
        description: 'Load the full step-by-step instructions for one of your ACTIVE SKILLS. You MUST call this BEFORE attempting any task whose description matches a skill in the ACTIVE SKILLS list — the skill body contains authoritative procedures, exact file paths, JSON schemas, and rules that you cannot recall from memory and MUST NOT guess. Pass the skill id exactly as shown in the ACTIVE SKILLS list. Returns the complete skill guide as a string, which you then follow verbatim.',
        input_schema: {
          type: 'object',
          properties: {
            skill_id: {
              type: 'string',
              description: 'The ID of the skill to load, copied verbatim from the ACTIVE SKILLS list in the system prompt.'
            }
          },
          required: ['skill_id']
        }
      })
    }

    // Always available — model self-selects when to plan
    allToolsAnthropic.push({
      name: 'submit_plan',
      description: 'Before executing any tools on a complex or multi-step task, call this to present a structured plan to the user for approval. Use when the task requires 3 or more distinct steps, modifies multiple files, or has irreversible effects. Do NOT call for simple single-step tasks.',
      input_schema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short plan title (e.g. "Refactor authentication module")'
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'One-line description of this step' }
              },
              required: ['label']
            },
            description: 'Ordered list of steps to execute'
          }
        },
        required: ['title', 'steps']
      }
    })

    // MCP tool map — populated lazily when the LLM calls search_mcp_tools
    const mcpToolMap = new Map() // toolName → { serverId, serverName, tool, serverConfig }
    const mcpServerConfigById = new Map((this.mcpServers || []).map(s => [s.id, s]))

    // Helper: load schemas for the given server configs and register them into mcpToolMap
    const _loadMcpTools = async (serverConfigs) => {
      const discovered = await mcpManager.getToolSchemas(serverConfigs)
      const newTools = []
      for (const { serverId, serverName, tool } of discovered) {
        const fullName = `mcp_${serverId.slice(0, 8)}_${tool.name}`
        if (!mcpToolMap.has(fullName)) {
          mcpToolMap.set(fullName, { serverId, serverName, tool, serverConfig: mcpServerConfigById.get(serverId) })
          allToolsAnthropic.push({
            name: fullName,
            description: `[MCP: ${serverName}] ${tool.description || tool.name}`,
            input_schema: tool.inputSchema || { type: 'object', properties: {} }
          })
          newTools.push({ name: fullName, description: tool.description || tool.name })
        }
      }
      return newTools
    }

    // Expose a single search_mcp_tools meta-tool instead of injecting all schemas upfront.
    // The LLM calls this when it decides it needs an MCP integration, then uses the
    // returned tools in the next iteration — zero processes started until actually needed.
    if (this.mcpServers && this.mcpServers.length > 0) {
      const serverList = this.mcpServers.map(s => `"${s.name}"`).join(', ')
      allToolsAnthropic.push({
        name: 'search_mcp_tools',
        description: `Load tools from one or more MCP servers. Call this when the user's request requires an external integration. Available servers: ${serverList}. After calling, the server's tools will be ready to use immediately.`,
        input_schema: {
          type: 'object',
          properties: {
            server_names: {
              type: 'array',
              items: { type: 'string' },
              description: 'Exact names of MCP servers to load tools from (e.g. ["n8n-mcp-manager"])'
            }
          },
          required: ['server_names']
        }
      })
    }

    // Inject user-defined tools from catalog (HTTP, Code, Prompt, SMTP)
    const httpToolMap = new Map()   // toolName → tool config
    const codeToolMap = new Map()   // toolName → tool config
    const promptToolMap = new Map() // toolName → tool config
    const smtpToolMap = new Map()   // toolName → tool config

    if (this.httpTools.length > 0) {
      for (const tool of this.httpTools) {
        const toolType = tool.type || 'http'

        if (toolType === 'code') {
          const fullName = `code_${tool.id}`
          codeToolMap.set(fullName, tool)
          allToolsAnthropic.push({
            name: fullName,
            description: `[Code: ${tool.language || 'javascript'}] ${tool.description || tool.name}\n\nReference code:\n\`\`\`${tool.language || 'javascript'}\n${tool.code || ''}\n\`\`\``,
            input_schema: {
              type: 'object',
              properties: {
                input: { type: 'string', description: 'Input or context for the code reference' }
              }
            }
          })
        } else if (toolType === 'prompt') {
          const fullName = `prompt_${tool.id}`
          promptToolMap.set(fullName, tool)
          allToolsAnthropic.push({
            name: fullName,
            description: `[Prompt] ${tool.description || tool.name}. Call this tool to retrieve the prompt/template.`,
            input_schema: {
              type: 'object',
              properties: {}
            }
          })
        } else if (toolType === 'smtp') {
          const fullName = `smtp_${tool.id}`
          smtpToolMap.set(fullName, tool)
          allToolsAnthropic.push({
            name: fullName,
            description: `[Email] ${tool.description || tool.name}`,
            input_schema: {
              type: 'object',
              properties: {
                to:          { type: 'string', description: 'Recipient email(s), comma-separated' },
                subject:     { type: 'string', description: 'Email subject line' },
                body:        { type: 'string', description: 'Plain-text body (required even when html is set)' },
                html:        { type: 'string', description: 'Optional HTML body' },
                cc:          { type: 'string', description: 'CC recipient(s), comma-separated' },
                bcc:         { type: 'string', description: 'BCC recipient(s), comma-separated' },
                from_name:   { type: 'string', description: 'Sender display name (defaults to SMTP username)' },
                attachments: {
                  type: 'array',
                  description: 'Files to attach. Each item is a path string or an object with "path" (required) and optional "filename".',
                  items: { type: 'string', description: 'File path to attach' }
                }
              },
              required: ['to', 'subject', 'body']
            }
          })
        } else {
          // HTTP (default)
          const fullName = `http_${tool.id}`
          httpToolMap.set(fullName, tool)
          // Extract {param} placeholders from endpoint URL
          const urlParamNames = [...(tool.endpoint || '').matchAll(/\{(\w+)\}/g)].map(m => m[1])
          const httpProps = {}
          urlParamNames.forEach(p => {
            httpProps[p] = { type: 'string', description: `URL parameter: ${p}` }
          })
          httpProps.body = { type: 'object', description: 'Request body (JSON). Merged with the tool\'s body template.' }
          allToolsAnthropic.push({
            name: fullName,
            description: `[HTTP: ${tool.category || 'HTTP'}] ${tool.description || tool.name}`,
            input_schema: {
              type: 'object',
              properties: httpProps,
              ...(urlParamNames.length > 0 ? { required: urlParamNames } : {})
            }
          })
        }
      }
      const counts = { http: httpToolMap.size, code: codeToolMap.size, prompt: promptToolMap.size, smtp: smtpToolMap.size }
      logger.agent('User tools injected', counts)
    }

    // NOTE: allTools is computed fresh each iteration inside the while loop below
    // so that MCP tools added dynamically by search_mcp_tools are immediately available.

    const client = this.anthropicClient.getClient()
    const model  = this.anthropicClient.resolveModel()
    const isOpus46 = this.anthropicClient.isOpus46()
    const supportsThinking = this.anthropicClient.supportsThinking()
    const provider = this.isGoogle
      ? 'google'
      : (this.config._directAuth
          ? (this.config.provider?.type || 'deepseek')
          : (this.isOpenAI ? 'openai' : 'anthropic'))

    // Emit initial context metrics
    onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

    // Emit agent start signal
    onChunk({ 
      type: 'agent_step', 
      id: 'step-init', 
      title: '🤖 Initializing Agent...', 
      status: 'in_progress',
      details: {
        iteration: 0,
        model,
        provider,
        tools: 0,
        thinking: false,
        msgs: 0,
        inputTokens: this.contextManager.inputTokens || 0,
        outputTokens: this.contextManager.outputTokens || 0,
      }
    })

    // Resolve configured output token limit (5-layer fallback):
    //   1. Per-chat override (ChatSettingsModal → loopConfig.maxOutputTokens)
    //   2. Per-model user override (config.json → provider.modelSettings[modelId])
    //   3. API-returned default (provider-models.json cache, e.g. Google outputTokenLimit)
    //   4. Built-in lookup table (LiteLLM catalog)
    //   5. Fallback: 32768
    const { lookupModelMaxOutputTokens } = require('./modelDefaults')
    const modelSettings = this.config._modelSettings || {}
    const perModelOverride = modelSettings[model]?.maxOutputTokens
    const cachedDefault = this.config._cachedModelMaxOutputTokens?.[model] || null
    const builtInDefault = lookupModelMaxOutputTokens(model, this.config.dataPath)
    const DEFAULT_MAX_TOKENS = perModelOverride || cachedDefault || builtInDefault
    let configuredMaxTokens = this.config.maxOutputTokens
      ? Math.min(98304, Math.max(1024, Number(this.config.maxOutputTokens)))
      : DEFAULT_MAX_TOKENS
    // Cap by per-provider hard limit (e.g. DeepSeek 8192)
    const providerMaxTokens = this.config.providerMaxOutputTokens
    if (providerMaxTokens && providerMaxTokens > 0 && providerMaxTokens < configuredMaxTokens) {
      const originalValue = configuredMaxTokens
      configuredMaxTokens = providerMaxTokens
      // Only warn if user explicitly set a per-chat maxOutputTokens that exceeds provider limit.
      // Silent cap for global defaults — that's expected behavior, not a surprise.
      if (this.config._maxOutputTokensExplicit) {
        logger.agent('maxOutputTokens capped by provider limit (explicit per-chat override)', { configured: originalValue, providerMax: providerMaxTokens })
        onChunk({ type: 'warning', code: 'max_tokens_capped', from: originalValue, to: configuredMaxTokens })
      }
    }

    try {
      let iteration = 0
      // Safety limit — high enough that the context window (tracked by
      // ContextManager) is the *real* boundary, not this counter.
      // Claude Code uses no hard cap in interactive mode; the loop runs
      // until the model emits end_turn.  We keep a generous upper bound
      // only as a last-resort safeguard against infinite loops.
      const MAX_ITERATIONS = 200

      while (!this.stopped && iteration < MAX_ITERATIONS) {
        iteration++

        // ── Build request params ──
        // allTools is rebuilt each iteration so dynamically-added MCP tools are included
        const allTools = this.isOpenAI
          ? allToolsAnthropic.map(t => ({
              type: 'function',
              function: {
                name: t.name,
                description: t.description || '',
                parameters: t.input_schema || { type: 'object', properties: {} }
              }
            }))
          : allToolsAnthropic

        const createParams = {
          model,
          max_tokens: configuredMaxTokens,
          system: systemPrompt,
          messages: conversationMessages,
          stream: true,
        }

        if (allTools.length > 0) {
          createParams.tools = allTools
          // Apply tool_choice from provider settings (Anthropic format)
          if (this.toolChoice === 'required' || this.toolChoice === 'any') {
            createParams.tool_choice = { type: 'any' }
          } else if (this.toolChoice === 'none') {
            createParams.tool_choice = { type: 'none' }
          }
          // 'auto' is the API default — omit to keep it implicit
        }

        // ── Snapshot context for inspector ──
        // Build memory sections explicitly so the frontend never has to parse
        // them out of the assembled string (soul files may contain their own ## headings).
        const _memorySections = []
        if (userMd)          _memorySections.push({ title: 'User Profile',        content: userMd })

        this.contextSnapshot = {
          systemPrompt,
          systemPromptCore: spb.stripInfraFromPrompt(systemPrompt),
          memorySections: _memorySections,
          agents: {
            systemAgentPrompt: agentPrompts?.systemAgentPrompt || null,
            userAgentPrompt: agentPrompts?.userAgentPrompt || null,
          },
          messages: conversationMessages.map(m => {
            let raw
            if (Array.isArray(m.content)) {
              raw = m.content.map(b => b.text || (b.type ? `[${b.type}]` : '[block]')).join(' ')
            } else if (typeof m.content === 'string') {
              raw = m.content
            } else if (m.content == null) {
              raw = ''
            } else {
              raw = JSON.stringify(m.content) || ''
            }
            return {
              role: m.role,
              contentPreview: raw.slice(0, 200),
              contentLength: raw.length,
              fullContent: raw
            }
          }),
          tools: allTools.map(t => ({
            name: t.function?.name ?? t.name ?? '',
            description: t.function?.description ?? t.description ?? ''
          })),
          model,
          metrics: this.contextManager.getMetrics()
        }

        // ── Thinking configuration ──
        if (isOpus46) {
          createParams.thinking = { type: 'adaptive' }
        } else if (supportsThinking) {
          createParams.thinking = { type: 'enabled', budget_tokens: 8192 }
          // budget_tokens must be < max_tokens
          createParams.max_tokens = Math.max(createParams.max_tokens, 8192 + 1024)
        }

        // ── Context-exhaustion check ──
        // Emergency flush + compact instead of stopping — conversations never interrupted.
        if (this.contextManager.isExhausted()) {
          logger.warn('AgentLoop: context window exhausted, triggering emergency flush+compact', {
            iteration,
            inputTokens: this.contextManager.inputTokens
          })
          if (!this.isOpenAI) {
            Object.assign(createParams, this.contextManager.applyCompaction(createParams))
            this.contextManager.compactionCount++
          } else {
            createParams.messages = this.contextManager.localTrim(
              createParams.messages, this.contextManager.inputTokens
            )
            conversationMessages.length = 0
            conversationMessages.push(...createParams.messages)
          }
          onChunk({ type: 'compaction_applied', kind: 'auto', message: 'Context compacted to continue conversation' })
          this.contextManager.inputTokens = Math.floor(this.contextManager.inputTokens * 0.4)
        }

        // ── Manual compaction request from UI ──
        if (this._compactionRequested) {
          this._compactionRequested = false
          if (!this.isOpenAI) {
            logger.agent('Manual compaction requested', { inputTokens: this.contextManager.inputTokens })
            Object.assign(createParams, this.contextManager.applyCompaction(createParams))
            this.contextManager.compactionCount++
            onChunk({ type: 'compaction_applied', kind: 'manual', message: 'Manual compaction applied' })
          }
        }

        // ── Prune tool results to reduce context ──
        const prunedMessages = this.contextManager.pruneToolResults(conversationMessages)
        if (prunedMessages !== conversationMessages) {
          conversationMessages.length = 0
          conversationMessages.push(...prunedMessages)
          createParams.messages = conversationMessages
        }

        // ── Compaction (Anthropic providers, when context is large) ──
        if (!this.isOpenAI && this.contextManager.shouldCompact()) {
          logger.agent('Applying compaction', { inputTokens: this.contextManager.inputTokens })
          Object.assign(createParams, this.contextManager.applyCompaction(createParams))
          this.contextManager.compactionCount++
          onChunk({ type: 'compaction_applied', kind: 'auto', message: 'Context compacted to fit window' })
        }

        // ── Context trimming for OpenAI-compat providers ──
        if (this.isOpenAI && this.contextManager.shouldCompact()) {
          createParams.messages = this.contextManager.localTrim(
            createParams.messages,
            this.contextManager.inputTokens
          )
          conversationMessages.length = 0
          conversationMessages.push(...createParams.messages)
          this.contextManager.compactionCount++
          onChunk({ type: 'compaction_applied', kind: 'auto', message: 'Older messages trimmed to fit context' })
        }

        // ── Sanitize request: strip lone surrogates that break JSON encoding ──
        if (createParams.messages) createParams.messages = sanitizeForJson(createParams.messages)
        if (createParams.system)   createParams.system   = sanitizeForJson(createParams.system)
        if (createParams.tools)    createParams.tools     = sanitizeForJson(createParams.tools)

        // ── Stream the response ──
        let assistantContent = []
        let currentTextBlock = ''
        let currentToolUse = null
        let stopReason = null

        // Emit step event for LLM call
        onChunk({ 
          type: 'agent_step', 
          id: `step-llm-${iteration}`, 
          title: `📡 Calling ${model}...`, 
          status: 'in_progress',
          details: {
            iteration,
            model,
            provider,
            tools: allTools.length,
            thinking: isOpus46 ? true : supportsThinking,
            msgs: createParams.messages.length,
            inputTokens: this.contextManager.inputTokens || 0,
            outputTokens: this.contextManager.outputTokens || 0,
          },
          timestamp: new Date().toISOString()
        })

        logger.agent('stream start', {
          iteration,
          provider: this.isGoogle ? 'google' : (this.config.provider?.type || (this.isOpenAI ? 'openai-compat' : 'anthropic')),
          model: model || this.config.customModel || this.config.provider?.model || 'unknown',
          maxTokens: configuredMaxTokens,
          msgs: createParams.messages.length,
          tools: allTools.length,
          inputTokens: this.contextManager.inputTokens || 0,
        })

        if (this.isGoogle) {
          // ── Google Gemini native API with tool calling support ──
          const gc = this.geminiClient.getClient()
          const contents = this._toGeminiContents(systemPrompt, conversationMessages)
          const geminiModelLower = (model || '').toLowerCase()
          const geminiImageCapable = geminiModelLower.includes('image')

          // Convert tool definitions to Gemini functionDeclarations format
          const geminiFunctionDeclarations = allToolsAnthropic.map(t => ({
            name: t.name,
            description: t.description || '',
            parametersJsonSchema: t.input_schema || { type: 'object', properties: {} }
          }))

          const generateConfig = { model, contents, config: {} }
          if (geminiImageCapable) {
            generateConfig.config.responseModalities = ['TEXT', 'IMAGE']
            logger.agent('Gemini image-capable model detected', { model })
          }
          if (geminiFunctionDeclarations.length > 0) {
            generateConfig.config.tools = [{ functionDeclarations: geminiFunctionDeclarations }]
            // Apply tool_choice from provider settings (Google/Gemini format)
            if (this.toolChoice === 'required' || this.toolChoice === 'any') {
              generateConfig.config.toolConfig = { functionCallingConfig: { mode: 'ANY' } }
            } else if (this.toolChoice === 'none') {
              generateConfig.config.toolConfig = { functionCallingConfig: { mode: 'NONE' } }
            }
            // 'auto' → mode: 'AUTO' which is the default — omit
          }

          // Tool calling loop — Gemini may request multiple rounds of function calls
          const MAX_GEMINI_TOOL_ROUNDS = 10
          let geminiToolRound = 0

          while (!this.stopped && geminiToolRound < MAX_GEMINI_TOOL_ROUNDS) {
            geminiToolRound++
            let geminiResponse
            try {
              geminiResponse = await gc.models.generateContent(generateConfig)
            } catch (geminiErr) {
              logger.error('Gemini generateContent FAILED', geminiErr.message)
              throw geminiErr
            }

            const parts = geminiResponse.candidates?.[0]?.content?.parts || []
            const functionCalls = geminiResponse.functionCalls || []
            const responseImages = []

            for (const part of parts) {
              if (part.text) {
                finalText += part.text
                onChunk({ type: 'text', text: part.text })
              } else if (part.inlineData) {
                responseImages.push({
                  data: part.inlineData.data,
                  mimeType: part.inlineData.mimeType || 'image/png'
                })
              }
            }

            if (responseImages.length > 0) {
              onChunk({
                type: 'tool_result',
                name: '_image',
                result: `[${responseImages.length} image(s) generated]`,
                images: responseImages
              })
            }

            logger.agent('Gemini response end', { iteration, round: geminiToolRound, parts: parts.length, functionCalls: functionCalls.length, images: responseImages.length })

            // No function calls → done
            if (functionCalls.length === 0) break

            // Execute function calls
            const functionResponseParts = []
            for (const fc of functionCalls) {
              const toolName = fc.name
              const toolInput = fc.args || {}
              onChunk({ type: 'tool_call', name: toolName, input: toolInput, toolCallId: fc.id || toolName })

              let result
              try {
                // Route through the same tool execution paths as Anthropic/OpenAI
                if (toolName === 'load_skill') {
                  const skillId = toolInput.skill_id
                  const prompt = this.skillPrompts.get(skillId)
                  if (prompt) {
                    this.loadedSkills.set(skillId, prompt)
                    result = { success: true, skill_id: skillId, content: prompt }
                  } else {
                    result = { success: false, error: `Skill '${skillId}' not found. Available: ${[...this.skillPrompts.keys()].join(', ')}` }
                  }
                } else if (toolName === 'dispatch_subagent') {
                  result = await this.subAgentManager.dispatch(toolInput, onChunk)
                } else if (toolName === 'dispatch_subagents') {
                  result = await this.subAgentManager.dispatchBatch(toolInput, onChunk, this.toolRegistry)
                } else if (toolName === 'background_task') {
                  result = await this.taskManager.execute(toolInput)
                } else if (toolName === 'search_mcp_tools') {
                  const requestedNames = toolInput.server_names || []
                  const matched = (this.mcpServers || []).filter(s => requestedNames.includes(s.name))
                  if (matched.length === 0) {
                    const available = (this.mcpServers || []).map(s => s.name).join(', ')
                    result = { success: false, error: `No servers matched: ${requestedNames.join(', ')}. Available: ${available}` }
                  } else {
                    const newTools = await _loadMcpTools(matched)
                    result = newTools.length > 0
                      ? { success: true, loaded: newTools.length, tools: newTools }
                      : { success: false, error: `Servers found but no tools discovered: ${requestedNames.join(', ')}` }
                  }
                } else if (mcpToolMap.has(toolName)) {
                  const { serverId, tool, serverConfig } = mcpToolMap.get(toolName)
                  result = await this._executeMcpToolViaManager(serverId, tool.name, toolInput, serverConfig)
                } else if (httpToolMap.has(toolName)) {
                  result = await this._executeHttpTool(httpToolMap.get(toolName), toolInput)
                } else if (smtpToolMap.has(toolName)) {
                  result = await this._executeSmtpTool(toolInput)
                } else if (codeToolMap.has(toolName)) {
                  const codeTool = codeToolMap.get(toolName)
                  result = { success: true, data: 'This is a reference code snippet. Use execute_shell to run similar code.', code: codeTool.code, language: codeTool.language || 'javascript' }
                } else if (promptToolMap.has(toolName)) {
                  const promptTool = promptToolMap.get(toolName)
                  result = { success: true, data: promptTool.promptText || '' }
                } else if (toolName === 'submit_plan') {
                  onChunk({ type: 'plan_submitted', plan: toolInput })
                  result = { success: true, status: 'awaiting_approval' }
                  this._planPending = true
                } else {
                  result = await this.toolRegistry.execute(toolName, toolInput, fc.id || toolName, (update) => {
                    onChunk({ type: 'tool_output', name: toolName, text: update.text, stream: update.type })
                  }, this._abortController.signal)
                }
              } catch (toolErr) {
                result = { content: [{ type: 'text', text: `Error: ${toolErr.message}` }] }
              }

              onChunk({ type: 'tool_result', name: toolName, result: uiResult(result), toolCallId: fc.id || toolName })
              functionResponseParts.push({
                functionResponse: {
                  id: fc.id,
                  name: toolName,
                  response: { result: serializeToolResult(result, toolName) }
                }
              })
            }

            // Push model response + function results into contents for next round
            contents.push({ role: 'model', parts })
            contents.push({ role: 'user', parts: functionResponseParts })
            generateConfig.contents = contents

            // If a plan was submitted, break the tool loop — wait for user approval
            if (this._planPending) {
              this._planPending = false
              break
            }
          }

          assistantContent = [{ type: 'text', text: finalText }]
          conversationMessages.push({ role: 'assistant', content: finalText || '(image generated)' })

          // Rough token estimate for context tracking
          const estTokens = JSON.stringify(contents).length / 4
          this.contextManager.inputTokens = Math.ceil(estTokens)
          this.contextManager.outputTokens = Math.ceil((finalText || '').length / 4)
          onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

          break  // exit main iteration loop

        } else if (this.isOpenAI) {
          // ── OpenAI-format streaming ──
          const openaiMessages = this._toOpenAIMessages(systemPrompt, conversationMessages)
          // Cap max_tokens by known model context window (passed from Vue metadata).
          // When the window is unknown, fall back to a conservative cap so we don't
          // request 32K output from a model whose real output limit is 4K.
          let effectiveMaxTokens = configuredMaxTokens
          const ctxWindow = this.config.modelContextWindow
          if (ctxWindow && ctxWindow > 0) {
            effectiveMaxTokens = Math.min(effectiveMaxTokens, Math.floor(ctxWindow * 0.75))
          } else {
            const UNKNOWN_WINDOW_MAX_TOKENS = 4096
            effectiveMaxTokens = Math.min(effectiveMaxTokens, UNKNOWN_WINDOW_MAX_TOKENS)
          }
          const openaiParams = {
            model,
            ...this.anthropicClient.tokenLimit(effectiveMaxTokens),
            messages: openaiMessages,
            stream: true,
          }
          if (allTools.length > 0) {
            openaiParams.tools = allTools
            // Apply tool_choice from provider settings (OpenAI format)
            if (this.toolChoice === 'required' || this.toolChoice === 'any') {
              openaiParams.tool_choice = 'required'
            } else if (this.toolChoice === 'none') {
              openaiParams.tool_choice = 'none'
            }
            // 'auto' is the API default — omit to keep it implicit
          }

          // Image-capable models (e.g. OpenRouter Gemini image-preview) need
          // modalities: ["text", "image"] and non-streaming mode for image output.
          const modelLower = (model || '').toLowerCase()
          const isImageCapable = modelLower.includes('image')
          if (isImageCapable) {
            openaiParams.modalities = ['text', 'image']
            openaiParams.stream = false  // Image generation doesn't work in streaming mode
            delete openaiParams.tools    // Image models don't support tools
            logger.agent('Image-capable model detected', { model, modalities: openaiParams.modalities })
          }

          let stream
          try {
            stream = await client.chat.completions.create(openaiParams, {
              signal: this._abortController.signal
            })
          } catch (streamErr) {
            // ── Smart retry logic for recoverable errors ──
            let retried = false

            // 1. Tool-use not supported → retry without tools
            const noToolSupport = streamErr.message?.includes('tool use') ||
                                  streamErr.message?.includes('tool_use') ||
                                  streamErr.status === 404
            if (!retried && noToolSupport && openaiParams.tools?.length > 0) {
              logger.warn('Model does not support tool use — retrying without tools', streamErr.message)
              const retryParams = { ...openaiParams }
              delete retryParams.tools
              try {
                stream = await client.chat.completions.create(retryParams, { signal: this._abortController.signal })
                retried = true
              } catch (retryErr) {
                logger.error('Retry without tools also FAILED', retryErr.message)
                throw retryErr
              }
            }

            // 2. Context overflow → parse limit, adjust max_tokens or drop tools
            if (!retried && streamErr.status === 400 && (
              streamErr.message?.includes('maximum context length') ||
              streamErr.message?.includes('context_length_exceeded')
            )) {
              const limitMatch = streamErr.message.match(/maximum context length is (\d+)/)
              const totalMatch = streamErr.message.match(/resulted in (\d+) tokens/)
              const msgMatch   = streamErr.message.match(/(\d+) in the messages/)
              const fnMatch    = streamErr.message.match(/(\d+) in the (?:functions|tools)/)
              const compMatch  = streamErr.message.match(/(\d+) in the completion/)

              if (limitMatch) {
                const ctxLimit  = Number(limitMatch[1])
                // When no breakdown is given, use total as msgTokens (conservative estimate)
                const totalTokens = totalMatch ? Number(totalMatch[1]) : 0
                const msgTokens = msgMatch  ? Number(msgMatch[1])  : totalTokens
                const fnTokens  = fnMatch   ? Number(fnMatch[1])   : 0
                const compTokens = compMatch ? Number(compMatch[1]) : 0

                if (compTokens > 0) {
                  // Case A: completion requested too many → cap max_tokens to what fits
                  const available = ctxLimit - msgTokens - fnTokens
                  if (available > 256) {
                    logger.warn(`Context overflow (completion) — retrying with max_tokens=${available}`, { model, ctxLimit, msgTokens, fnTokens })
                    const retryParams = { ...openaiParams, ...this.anthropicClient.tokenLimit(available) }
                    try {
                      stream = await client.chat.completions.create(retryParams, { signal: this._abortController.signal })
                      retried = true
                    } catch (retryErr) {
                      logger.error('Context overflow retry also FAILED', retryErr.message)
                      throw retryErr
                    }
                  }
                } else if (fnTokens > 0 && openaiParams.tools?.length > 0) {
                  // Case B: messages fit without tools — drop tools to free space
                  const withoutTools = msgTokens
                  if (withoutTools < ctxLimit) {
                    const available = ctxLimit - withoutTools
                    logger.warn(`Context overflow (input) — retrying without tools, max_tokens=${Math.min(available, effectiveMaxTokens)}`, { model, ctxLimit, msgTokens, fnTokens })
                    const retryParams = { ...openaiParams, ...this.anthropicClient.tokenLimit(Math.min(available, effectiveMaxTokens)) }
                    delete retryParams.tools
                    try {
                      stream = await client.chat.completions.create(retryParams, { signal: this._abortController.signal })
                      retried = true
                    } catch (retryErr) {
                      logger.error('Context overflow retry (no tools) also FAILED', retryErr.message)
                      throw retryErr
                    }
                  } else {
                    // Case C: messages alone exceed limit even without tools — trim messages + drop tools
                    // Cooldown-guarded: refuse to silently compact a second time within the window.
                    if (!ctxErrorDetector.canReactiveCompact(this.config.chatId)) {
                      logger.warn('Reactive compaction cooldown active — surfacing error instead', { chatId: this.config.chatId })
                      throw streamErr
                    }
                    const trimmed = this._trimMessagesToFit(openaiParams.messages, msgTokens, ctxLimit)
                    if (trimmed.length > 0) {
                      const available = Math.max(256, Math.floor(ctxLimit * 0.25))
                      logger.warn(`Context overflow (messages+tools) — trimming messages & dropping tools`, { model, ctxLimit, msgTokens, trimmedMsgs: trimmed.length, original: openaiParams.messages.length })
                      const retryParams = { ...openaiParams, messages: trimmed, ...this.anthropicClient.tokenLimit(Math.min(available, effectiveMaxTokens)) }
                      delete retryParams.tools
                      try {
                        stream = await client.chat.completions.create(retryParams, { signal: this._abortController.signal })
                        retried = true
                        this._emitOverflowRecoveryBanner(onChunk, msgTokens, ctxLimit)
                      } catch (retryErr) {
                        logger.error('Context overflow retry (trimmed+no tools) also FAILED', retryErr.message)
                        throw retryErr
                      }
                    }
                  }
                } else if (msgTokens > ctxLimit && openaiParams.tools?.length > 0) {
                  // Case D1: total exceeds limit and tools present (no breakdown) — drop tools + trim
                  if (!ctxErrorDetector.canReactiveCompact(this.config.chatId)) {
                    logger.warn('Reactive compaction cooldown active — surfacing error instead', { chatId: this.config.chatId })
                    throw streamErr
                  }
                  const trimmed = this._trimMessagesToFit(openaiParams.messages, msgTokens, ctxLimit)
                  if (trimmed.length > 0) {
                    const available = Math.max(256, Math.floor(ctxLimit * 0.25))
                    logger.warn(`Context overflow (total, with tools) — trimming & dropping tools`, { model, ctxLimit, msgTokens, trimmedMsgs: trimmed.length, original: openaiParams.messages.length })
                    const retryParams = { ...openaiParams, messages: trimmed, ...this.anthropicClient.tokenLimit(Math.min(available, effectiveMaxTokens)) }
                    delete retryParams.tools
                    try {
                      stream = await client.chat.completions.create(retryParams, { signal: this._abortController.signal })
                      retried = true
                      this._emitOverflowRecoveryBanner(onChunk, msgTokens, ctxLimit)
                    } catch (retryErr) {
                      logger.error('Context overflow retry (total, trimmed+no tools) also FAILED', retryErr.message)
                      throw retryErr
                    }
                  }
                } else if (msgTokens > ctxLimit) {
                  // Case D2: no tools but messages still exceed — trim messages only
                  if (!ctxErrorDetector.canReactiveCompact(this.config.chatId)) {
                    logger.warn('Reactive compaction cooldown active — surfacing error instead', { chatId: this.config.chatId })
                    throw streamErr
                  }
                  const trimmed = this._trimMessagesToFit(openaiParams.messages, msgTokens, ctxLimit)
                  if (trimmed.length > 0) {
                    const available = Math.max(256, Math.floor(ctxLimit * 0.25))
                    logger.warn(`Context overflow (messages only) — trimming`, { model, ctxLimit, msgTokens, trimmedMsgs: trimmed.length, original: openaiParams.messages.length })
                    const retryParams = { ...openaiParams, messages: trimmed, ...this.anthropicClient.tokenLimit(Math.min(available, effectiveMaxTokens)) }
                    try {
                      stream = await client.chat.completions.create(retryParams, { signal: this._abortController.signal })
                      retried = true
                      this._emitOverflowRecoveryBanner(onChunk, msgTokens, ctxLimit)
                    } catch (retryErr) {
                      logger.error('Context overflow retry (trimmed) also FAILED', retryErr.message)
                      throw retryErr
                    }
                  }
                }
              }
            }

            // 3. max_tokens out of valid range → parse upper bound and retry
            // Also handles OpenRouter "maximum context length is N tokens" errors
            if (!retried && streamErr.status === 400 && /max_tokens|max_completion_tokens|context length/i.test(streamErr.message || '')) {
              const rangeMatch = (streamErr.message || '').match(/valid range.*?\[(\d+),\s*(\d+)\]/)
              // OpenRouter: "maximum context length is N tokens. However, you requested about M tokens (X input, Y output)"
              const contextMatch = (streamErr.message || '').match(/maximum context length is (\d+) tokens.*?(\d+) of text input/i)
              let upperBound = rangeMatch ? Number(rangeMatch[2]) : null
              if (!upperBound && contextMatch) {
                const totalCtx  = Number(contextMatch[1])
                const inputToks = Number(contextMatch[2])
                upperBound = Math.max(1024, totalCtx - inputToks - 256)
              }
              if (upperBound && upperBound > 0) {
                logger.warn(`max_tokens ${effectiveMaxTokens} exceeds model limit ${upperBound} — retrying`, { model })
                const retryParams = { ...openaiParams, ...this.anthropicClient.tokenLimit(upperBound) }
                try {
                  stream = await client.chat.completions.create(retryParams, { signal: this._abortController.signal })
                  retried = true
                  // Update for future iterations so we don't retry every turn
                  effectiveMaxTokens = upperBound
                } catch (retryErr) {
                  logger.error('max_tokens retry also FAILED', retryErr.message)
                  throw retryErr
                }
              }
            }

            if (!retried) {
              logger.error('OpenAI stream open FAILED', streamErr.message)
              throw streamErr
            }
          }

          // Non-streaming image model: extract text + images from complete response
          if (isImageCapable && !openaiParams.stream) {
            const response = stream  // not a stream, it's a complete response object
            const msg = response.choices?.[0]?.message || {}
            const textContent = typeof msg.content === 'string' ? msg.content : ''
            if (textContent) {
              finalText += textContent
              onChunk({ type: 'text', text: textContent })
              assistantContent.push({ type: 'text', text: textContent })
            }
            // Extract images from message.images[]
            const responseImages = []
            if (Array.isArray(msg.images)) {
              for (const img of msg.images) {
                const url = img?.image_url?.url || img?.url || ''
                if (url.startsWith('data:')) {
                  const commaIdx = url.indexOf(',')
                  const mimeType = url.slice(5, commaIdx).replace(';base64', '')
                  responseImages.push({ data: url.slice(commaIdx + 1), mimeType: mimeType || 'image/png' })
                } else if (url) {
                  responseImages.push({ url })
                }
              }
            }
            if (responseImages.length > 0) {
              onChunk({
                type: 'tool_result',
                name: '_image',
                result: `[${responseImages.length} image(s) generated]`,
                images: responseImages
              })
            }
            logger.agent('Image model response', { textLen: textContent.length, images: responseImages.length, msgKeys: Object.keys(msg) })
            // Build conversation message and skip streaming loop
            conversationMessages.push({ role: 'assistant', content: textContent || '' })
            stopReason = response.choices?.[0]?.finish_reason || 'stop'
            // Usage tracking
            if (response.usage) {
              this.contextManager.inputTokens = response.usage.prompt_tokens || 0
              this.contextManager.outputTokens = response.usage.completion_tokens || 0
            } else {
              const estTokens = JSON.stringify(openaiMessages).length / 4
              this.contextManager.inputTokens = Math.ceil(estTokens)
              this.contextManager.outputTokens = Math.ceil((textContent || '').length / 4)
            }
            onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })
            logger.agent('OpenAI image end', { iteration, stopReason, textLen: textContent.length, images: responseImages.length })
            break  // skip tool loop — image models don't use tools
          }

          // Accumulate streamed tool calls: index → { id, name, arguments }
          const toolCallAccumulators = new Map()
          let streamedReasoningContent = ''
          const responseImages = []

          let lastChunk = null
          for await (const chunk of stream) {
            if (this.stopped) break
            lastChunk = chunk
            const choice = chunk.choices?.[0]
            if (!choice) continue

            const delta = choice.delta || {}

            // Capture DeepSeek reasoning_content (thinking mode)
            if (delta.reasoning_content) {
              streamedReasoningContent += delta.reasoning_content
            }

            // Text content — handle both plain string and multimodal array (e.g. OpenRouter Gemini)
            if (Array.isArray(delta.content)) {
              for (const part of delta.content) {
                if (part.type === 'text' && part.text) {
                  currentTextBlock += part.text
                  finalText += part.text
                  onChunk({ type: 'text', text: part.text })
                } else if (part.type === 'image_url') {
                  const url = part.image_url?.url || ''
                  if (url.startsWith('data:')) {
                    const commaIdx = url.indexOf(',')
                    const meta = url.slice(0, commaIdx)           // "data:image/png;base64"
                    const b64  = url.slice(commaIdx + 1)
                    const mimeType = meta.replace('data:', '').replace(';base64', '')
                    responseImages.push({ data: b64, mimeType })
                  } else if (url) {
                    responseImages.push({ url })
                  }
                }
              }
            } else if (delta.content) {
              currentTextBlock += delta.content
              finalText += delta.content
              onChunk({ type: 'text', text: delta.content })
            }

            // Tool calls (streamed incrementally)
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index
                if (!toolCallAccumulators.has(idx)) {
                  // Flush any pending text
                  if (currentTextBlock) {
                    assistantContent.push({ type: 'text', text: currentTextBlock })
                    currentTextBlock = ''
                  }
                  toolCallAccumulators.set(idx, {
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    arguments: ''
                  })
                }
                const acc = toolCallAccumulators.get(idx)
                if (tc.id) acc.id = tc.id
                if (tc.function?.name) acc.name = tc.function.name
                if (tc.function?.arguments) acc.arguments += tc.function.arguments
              }
            }

            if (choice.finish_reason) {
              stopReason = choice.finish_reason
            }
          }

          // Flush remaining text
          if (currentTextBlock) {
            assistantContent.push({ type: 'text', text: currentTextBlock })
            currentTextBlock = ''
          }

          // Finalize accumulated tool calls
          const openaiToolCalls = []
          for (const [, acc] of toolCallAccumulators) {
            let parsedArgs = {}
            try {
              parsedArgs = JSON.parse(acc.arguments || '{}')
            } catch (e) {
              logger.warn('[AgentLoop] tool_call arguments not valid JSON, defaulting to {}', { name: acc.name, raw: acc.arguments?.slice(0, 200) })
            }
            assistantContent.push({
              type: 'tool_use',
              id: acc.id,
              name: acc.name,
              input: parsedArgs
            })
            openaiToolCalls.push({
              id: acc.id,
              type: 'function',
              function: { name: acc.name, arguments: JSON.stringify(parsedArgs) }
            })
          }

          // ── Inline JSON tool-call fallback for weak OpenAI-compat models ──
          // Some cheap / local models output tool calls as inline JSON text
          // instead of proper delta.tool_calls. Detect and extract them so
          // tool execution still fires. Only runs when NO native tool calls
          // were found and the text contains something that looks like a call.
          if (openaiToolCalls.length === 0 && finalText.length > 0 && allToolsAnthropic.length > 0) {
            const validToolNames = new Set(allToolsAnthropic.map(t => t.name))
            const extracted = this._extractInlineToolCalls(finalText, validToolNames)
            if (extracted.length > 0) {
              logger.agent('Inline tool-call fallback triggered', { count: extracted.length, names: extracted.map(e => e.name) })
              for (const ex of extracted) {
                const syntheticId = `inline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                assistantContent.push({ type: 'tool_use', id: syntheticId, name: ex.name, input: ex.arguments })
                openaiToolCalls.push({
                  id: syntheticId,
                  type: 'function',
                  function: { name: ex.name, arguments: JSON.stringify(ex.arguments) }
                })
              }
              // Override stop reason so the tool dispatch block below fires
              stopReason = 'tool_calls'
            }
          }

          // Extract images from the last streaming chunk's message field
          // OpenRouter image models (Gemini) return images in message.images[]
          // which only appears in the final chunk, not in streaming deltas
          if (lastChunk) {
            const lastMsg = lastChunk.choices?.[0]?.message
            if (lastMsg && Array.isArray(lastMsg.images)) {
              for (const img of lastMsg.images) {
                const url = img?.image_url?.url || img?.url || ''
                if (url.startsWith('data:')) {
                  const commaIdx = url.indexOf(',')
                  const mimeType = url.slice(5, commaIdx).replace(';base64', '')
                  responseImages.push({ data: url.slice(commaIdx + 1), mimeType: mimeType || 'image/png' })
                } else if (url) {
                  responseImages.push({ url })
                }
              }
            }
          }

          // Emit any images collected (from streaming deltas or final message)
          if (responseImages.length > 0) {
            onChunk({
              type: 'tool_result',
              name: '_image',
              result: `[${responseImages.length} image(s) generated]`,
              images: responseImages
            })
          }

          // Usage tracking: prefer real usage from last chunk, fallback to estimation
          if (lastChunk?.usage) {
            this.contextManager.inputTokens = lastChunk.usage.prompt_tokens || 0
            this.contextManager.outputTokens = lastChunk.usage.completion_tokens || 0
          } else {
            const estTokens = JSON.stringify(openaiMessages).length / 4
            this.contextManager.inputTokens = Math.ceil(estTokens)
            this.contextManager.outputTokens = Math.ceil((finalText || '').length / 4)
          }
          onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

          // Push assistant message — store in OpenAI-native format so that
          // reasoning_content (DeepSeek thinking mode) round-trips correctly.
          // The Anthropic-style assistantContent is kept only for tool dispatch below.
          const nativeAssistant = { role: 'assistant' }
          const textParts = assistantContent.filter(b => b.type === 'text').map(b => b.text).join('')
          nativeAssistant.content = textParts || ''
          if (openaiToolCalls.length > 0) nativeAssistant.tool_calls = openaiToolCalls
          // DeepSeek requires reasoning_content to be echoed back verbatim in history
          if (streamedReasoningContent) nativeAssistant.reasoning_content = streamedReasoningContent
          conversationMessages.push(nativeAssistant)

          logger.agent('OpenAI stream end', { iteration, model: model || this.config.customModel || 'unknown', stopReason, tokens: this.contextManager.getMetrics() })
          logger.debug('[AgentLoop] LLM text output', { iteration })

          // ── Handle tool_calls stop reason ──
          if ((stopReason === 'tool_calls' || stopReason === 'stop' && openaiToolCalls.length > 0) && !this.stopped) {
            onChunk({ 
              type: 'agent_step', 
              id: `step-tools-${iteration}`, 
              title: `🔧 Executing tools (${openaiToolCalls.length})...`, 
              status: 'in_progress',
              details: { 
                iteration,
                model,
                provider,
                tools: openaiToolCalls.length,
                currentTools: openaiToolCalls.map(tc => tc.name).join(', '),
                thinking: false,
                msgs: createParams.messages.length,
                inputTokens: this.contextManager.inputTokens,
                outputTokens: this.contextManager.outputTokens
              },
              timestamp: new Date().toISOString()
            })

            const toolResults = await Promise.race([
              Promise.all(
              assistantContent
                .filter(b => b.type === 'tool_use')
                .map(async (block) => {
                  const toolName  = block.name
                  const toolInput = block.input
                  onChunk({ type: 'tool_call', name: toolName, input: toolInput, toolCallId: block.id })

                  let result
                  if (toolName === 'load_skill') {
                    const skillId = toolInput.skill_id
                    const prompt = this.skillPrompts.get(skillId)
                    if (prompt) {
                      this.loadedSkills.set(skillId, prompt)
                      result = { success: true, skill_id: skillId, content: prompt }
                    } else {
                      result = { success: false, error: `Skill '${skillId}' not found. Available: ${[...this.skillPrompts.keys()].join(', ')}` }
                    }
                  } else if (toolName === 'dispatch_subagent') {
                    result = await this.subAgentManager.dispatch(toolInput, (progress) => {
                      onChunk({ type: 'subagent_progress', ...progress })
                    })
                    if (toolInput.todo_id != null) {
                      try {
                        const todoStatus = result.success ? 'completed' : 'blocked'
                        const todoTool = this.toolRegistry.getTodoTool()
                        const todoChatId = todoTool.findChatIdForTodo(toolInput.todo_id) || 'default'
                        logger.agent('todo auto-update', { todoId: toolInput.todo_id, chatId: todoChatId, status: todoStatus })
                        const todoInput = { action: 'update', chatId: todoChatId, id: toolInput.todo_id, status: todoStatus }
                        const todoResult = await this.toolRegistry.execute('todo_manager', todoInput)
                        logger.agent('todo auto-update result', { todoId: toolInput.todo_id, result: JSON.stringify(uiResult(todoResult)).slice(0, 120) })
                        onChunk({ type: 'tool_call', name: 'todo_manager', input: todoInput, toolCallId: `auto_todo_${Date.now()}` })
                        onChunk({ type: 'tool_result', name: 'todo_manager', result: uiResult(todoResult), toolCallId: `auto_todo_${Date.now()}` })
                      } catch (e) { logger.error('todo auto-update failed', e.message) }
                    }
                  } else if (toolName === 'dispatch_subagents') {
                    result = await this.subAgentManager.dispatchBatch(toolInput, onChunk, this.toolRegistry)
                  } else if (toolName === 'background_task') {
                    result = await this.taskManager.execute(toolInput)
                  } else if (toolName === 'search_mcp_tools') {
                    const requestedNames = toolInput.server_names || []
                    const matched = (this.mcpServers || []).filter(s => requestedNames.includes(s.name))
                    if (matched.length === 0) {
                      const available = (this.mcpServers || []).map(s => s.name).join(', ')
                      result = { success: false, error: `No servers matched: ${requestedNames.join(', ')}. Available: ${available}` }
                    } else {
                      const newTools = await _loadMcpTools(matched)
                      logger.agent('search_mcp_tools (openai)', { requested: requestedNames, loaded: newTools.length })
                      result = newTools.length > 0
                        ? { success: true, loaded: newTools.length, tools: newTools }
                        : { success: false, error: `Servers found but no tools discovered: ${requestedNames.join(', ')}` }
                    }
                  } else if (mcpToolMap.has(toolName)) {
                    const permCheckMcp = await this._checkPermission(toolName, toolInput, onChunk)
                    if (permCheckMcp.decision === 'block' || permCheckMcp.decision === 'reject') {
                      result = permCheckMcp.result
                    } else {
                      const { serverId, tool, serverConfig } = mcpToolMap.get(toolName)
                      result = await this._executeMcpToolViaManager(serverId, tool.name, toolInput, serverConfig)
                    }
                  } else if (httpToolMap.has(toolName)) {
                    result = await this._executeHttpTool(httpToolMap.get(toolName), toolInput)
                  } else if (smtpToolMap.has(toolName)) {
                    result = await this._executeSmtpTool(toolInput)
                  } else if (codeToolMap.has(toolName)) {
                    const codeTool = codeToolMap.get(toolName)
                    result = { success: true, data: 'This is a reference code snippet. Use execute_shell to run similar code.', code: codeTool.code, language: codeTool.language || 'javascript' }
                  } else if (promptToolMap.has(toolName)) {
                    const promptTool = promptToolMap.get(toolName)
                    result = { success: true, data: promptTool.promptText || '' }
                  } else if (toolName === 'submit_plan') {
                    onChunk({ type: 'plan_submitted', plan: toolInput })
                    result = { success: true, status: 'awaiting_approval' }
                    this._planPending = true
                    onChunk({ type: 'tool_result', name: toolName, result: JSON.stringify(result), toolCallId: block.id })
                    return { tool_call_id: block.id, content: JSON.stringify(result) }
                  } else {
                    const permCheck = await this._checkPermission(toolName, toolInput, onChunk)
                    if (permCheck.decision === 'block' || permCheck.decision === 'reject') {
                      result = permCheck.result
                    } else {
                      result = await this.toolRegistry.execute(toolName, toolInput, block.id, (update) => {
                        onChunk({ type: 'tool_output', name: toolName, text: update.text, stream: update.type })
                      }, this._abortController.signal)
                    }
                  }
                  const mcpImages = result?._mcpImages || result?.details?.images
                  if (result?._mcpImages) delete result._mcpImages
                  if (result?.details?.images) delete result.details.images  // prevent uiResult from double-spreading images
                  onChunk({ type: 'tool_result', name: toolName, result: uiResult(result), toolCallId: block.id, ...(mcpImages ? { images: mcpImages } : {}) })
                  return { tool_call_id: block.id, content: serializeToolResult(result, toolName) }
                })
              ),
              this._abortPromise()
            ])

            // Push tool results in OpenAI-native format — each as a separate `role: 'tool'` message
            for (const tr of toolResults) {
              logger.debug('[AgentLoop] tool result → LLM', { tool_call_id: tr.tool_call_id, contentLen: tr.content?.length, contentPreview: (tr.content || '').slice(0, 200) })
              conversationMessages.push({
                role: 'tool',
                tool_call_id: tr.tool_call_id,
                content: tr.content
              })
            }

            // If a plan was submitted, break — wait for user approval
            if (this._planPending) {
              this._planPending = false
              break
            }
          } else {
            // 'length' is OpenAI's finish_reason when max_tokens is hit
            if (stopReason === 'length') {
              onChunk({ type: 'max_tokens_reached', limit: configuredMaxTokens })
            }
            break
          }

        } else {
          // ── Anthropic-format streaming (with retry on empty-stream errors) ──
          const MAX_STREAM_RETRIES = 2
          let stream
          let streamAttempt = 0
          let streamOk = false

          while (!streamOk && streamAttempt <= MAX_STREAM_RETRIES) {
            streamAttempt++
            if (streamAttempt > 1) {
              const delay = streamAttempt * 1000 // 2s, 3s
              logger.agent(`Stream retry ${streamAttempt}/${MAX_STREAM_RETRIES + 1}, waiting ${delay}ms...`)
              await new Promise(r => setTimeout(r, delay))
            }

            stream = null
            try {
              if (createParams.betas && createParams.betas.length > 0) {
                const { betas, ...restParams } = createParams
                stream = await client.beta.messages.stream({ ...restParams, betas }, {
                  signal: this._abortController.signal
                })
              } else {
                stream = await client.messages.stream(createParams, {
                  signal: this._abortController.signal
                })
              }
            } catch (streamErr) {
              // Some models (e.g. OpenRouter image-generation models) reject tool use with 404.
              // Retry once without tools so image generation can proceed.
              const noToolSupport = streamErr.status === 404 &&
                (streamErr.message?.includes('tool use') || streamErr.message?.includes('tool_use'))

              // max_tokens exceeds model limit → parse the limit and retry with lower value
              const maxTokensErr = streamErr.status === 400 &&
                /max_tokens|max_completion_tokens|context length/i.test(streamErr.message || '')

              if (noToolSupport && createParams.tools?.length > 0) {
                logger.warn('Model does not support tool use — retrying without tools', streamErr.message)
                const paramsNoTools = { ...createParams }
                delete paramsNoTools.tools
                try {
                  stream = await client.messages.stream(paramsNoTools, {
                    signal: this._abortController.signal
                  })
                } catch (retryErr) {
                  logger.error('Retry without tools also FAILED', retryErr.message)
                  throw retryErr
                }
              } else if (maxTokensErr) {
                const rangeMatch = (streamErr.message || '').match(/valid range.*?\[(\d+),\s*(\d+)\]/)
                const contextMatch = (streamErr.message || '').match(/maximum context length is (\d+) tokens.*?(\d+) of text input/i)
                let upperBound = rangeMatch ? Number(rangeMatch[2]) : null
                if (!upperBound && contextMatch) {
                  upperBound = Math.max(1024, Number(contextMatch[1]) - Number(contextMatch[2]) - 256)
                }
                if (upperBound && upperBound > 0) {
                  logger.warn(`max_tokens exceeds model limit ${upperBound} — retrying (Anthropic path)`, { model })
                  const retryParams = { ...createParams, max_tokens: upperBound }
                  try {
                    stream = await client.messages.stream(retryParams, { signal: this._abortController.signal })
                  } catch (retryErr) {
                    logger.error('max_tokens retry also FAILED (Anthropic path)', retryErr.message)
                    throw retryErr
                  }
                } else {
                  logger.error('stream open FAILED', streamErr.message, streamErr.status)
                  throw streamErr
                }
              } else {
                logger.error('stream open FAILED', streamErr.message, streamErr.status)
                if (streamAttempt > MAX_STREAM_RETRIES) throw streamErr
                continue
              }
            }

            // Try reading the stream — "no chunks" error surfaces here
            try {
              assistantContent = []
              currentTextBlock = ''
              currentToolUse = null
              stopReason = null

              for await (const event of stream) {
            if (this.stopped) break

            if (event.type === 'content_block_start') {
              // Log unexpected block types to discover image response format
              if (!['text','thinking','tool_use'].includes(event.content_block.type)) {
                logger.agent('UNKNOWN content_block_start type', { type: event.content_block.type, block: JSON.stringify(event.content_block).slice(0, 200) })
              }
              if (event.content_block.type === 'text') {
                currentTextBlock = ''
              } else if (event.content_block.type === 'thinking') {
                onChunk({ type: 'thinking_start' })
              } else if (event.content_block.type === 'tool_use') {
                if (currentTextBlock) {
                  assistantContent.push({ type: 'text', text: currentTextBlock })
                  currentTextBlock = ''
                }
                currentToolUse = {
                  type: 'tool_use',
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: ''
                }
              }

            } else if (event.type === 'content_block_delta') {
              if (!['text_delta','thinking_delta','input_json_delta','image_delta'].includes(event.delta.type)) {
                logger.agent('UNKNOWN content_block_delta type', { type: event.delta.type, delta: JSON.stringify(event.delta).slice(0, 200) })
              }
              if (event.delta.type === 'text_delta') {
                currentTextBlock += event.delta.text
                finalText += event.delta.text
                onChunk({ type: 'text', text: event.delta.text })
              } else if (event.delta.type === 'thinking_delta') {
                onChunk({ type: 'thinking', text: event.delta.thinking })
              } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
                currentToolUse.input += event.delta.partial_json
              }

            } else if (event.type === 'content_block_stop') {
              if (currentTextBlock) {
                assistantContent.push({ type: 'text', text: currentTextBlock })
                currentTextBlock = ''
              }
              if (currentToolUse) {
                try {
                  currentToolUse.input = JSON.parse(currentToolUse.input || '{}')
                } catch {
                  currentToolUse.input = {}
                }
                assistantContent.push(currentToolUse)
                currentToolUse = null
              }

            } else if (event.type === 'message_delta') {
              stopReason = event.delta.stop_reason
            }
          }

              // Flush any remaining text
              if (currentTextBlock) {
                assistantContent.push({ type: 'text', text: currentTextBlock })
              }

              // ── Get final message for usage stats ──
              let finalMessage
              try {
                finalMessage = await stream.finalMessage()
              } catch {
                // stream may already be consumed
              }

              // Update context metrics from usage
              if (finalMessage) {
                this.contextManager.updateUsage(finalMessage)
                onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

                // Debug: log finalMessage content block types (no text content)
                if (Array.isArray(finalMessage.content)) {
                  logger.agent('finalMessage content blocks', finalMessage.content.map(b => ({
                    type: b.type,
                    hasData: b.type === 'image' ? !!b.source?.data : undefined,
                    dataLen: b.type === 'image' ? b.source?.data?.length : undefined,
                    textLen: b.type === 'text' ? b.text?.length : undefined,
                  })))
                }

                if (isOpus46 && finalMessage.content) {
                  this.contextManager.appendAssistantContent(conversationMessages, finalMessage.content)
                } else {
                  conversationMessages.push({ role: 'assistant', content: assistantContent })
                }
              } else {
                conversationMessages.push({ role: 'assistant', content: assistantContent })
              }

              logger.agent('stream end', { iteration, model: model || this.config.customModel || 'unknown', stopReason, tokens: this.contextManager.getMetrics() })
              streamOk = true // success — exit retry loop

            } catch (streamIterErr) {
              // "request ended without sending any chunks" surfaces here
              if (streamIterErr.message && streamIterErr.message.includes('without sending any chunks') && streamAttempt <= MAX_STREAM_RETRIES) {
                logger.warn(`Stream empty-response error on attempt ${streamAttempt}, will retry`, streamIterErr.message)
                continue
              }
              throw streamIterErr
            }
          } // end retry while loop

          // ── Handle tool_use stop reason ──
          if (stopReason === 'tool_use' && !this.stopped) {
            const toolUseBlocks = assistantContent.filter(b => b.type === 'tool_use')
            onChunk({
              type: 'agent_step',
              id: `step-tools-${iteration}`,
              title: `🔧 Executing tools (${toolUseBlocks.length})...`,
              status: 'in_progress',
              details: {
                iteration,
                model,
                provider,
                tools: toolUseBlocks.length,
                currentTools: toolUseBlocks.map(b => b.name).join(', '),
                thinking: isOpus46 ? true : supportsThinking,
                msgs: conversationMessages.length,
                inputTokens: this.contextManager.inputTokens,
                outputTokens: this.contextManager.outputTokens
              },
              timestamp: new Date().toISOString()
            })
            const toolResults = await Promise.race([
              Promise.all(
              assistantContent
                .filter(b => b.type === 'tool_use')
                .map(async (block) => {
                  const toolName  = block.name
                  const toolInput = block.input

                  onChunk({ type: 'tool_call', name: toolName, input: toolInput, toolCallId: block.id })

                  let result

                  if (toolName === 'load_skill') {
                    const skillId = toolInput.skill_id
                    const prompt = this.skillPrompts.get(skillId)
                    if (prompt) {
                      this.loadedSkills.set(skillId, prompt)
                      logger.agent('load_skill', { skillId, promptLen: prompt.length })
                      result = { success: true, skill_id: skillId, content: prompt }
                    } else {
                      result = { success: false, error: `Skill '${skillId}' not found. Available: ${[...this.skillPrompts.keys()].join(', ')}` }
                    }
                  } else if (toolName === 'dispatch_subagent') {
                    result = await this.subAgentManager.dispatch(toolInput, (progress) => {
                      onChunk({ type: 'subagent_progress', ...progress })
                    })
                    if (toolInput.todo_id != null) {
                      try {
                        const todoStatus = result.success ? 'completed' : 'blocked'
                        const todoTool = this.toolRegistry.getTodoTool()
                        const todoChatId = todoTool.findChatIdForTodo(toolInput.todo_id) || 'default'
                        logger.agent('todo auto-update', { todoId: toolInput.todo_id, chatId: todoChatId, status: todoStatus })
                        const todoInput = { action: 'update', chatId: todoChatId, id: toolInput.todo_id, status: todoStatus }
                        const todoResult = await this.toolRegistry.execute('todo_manager', todoInput)
                        logger.agent('todo auto-update result', { todoId: toolInput.todo_id, result: JSON.stringify(uiResult(todoResult)).slice(0, 120) })
                        onChunk({ type: 'tool_call', name: 'todo_manager', input: todoInput, toolCallId: `auto_todo_${Date.now()}` })
                        onChunk({ type: 'tool_result', name: 'todo_manager', result: uiResult(todoResult), toolCallId: `auto_todo_${Date.now()}` })
                      } catch (e) { logger.error('todo auto-update failed', e.message) }
                    }
                  } else if (toolName === 'dispatch_subagents') {
                    result = await this.subAgentManager.dispatchBatch(toolInput, onChunk, this.toolRegistry)
                  } else if (toolName === 'background_task') {
                    result = await this.taskManager.execute(toolInput)
                  } else if (toolName === 'search_mcp_tools') {
                    const requestedNames = toolInput.server_names || []
                    const matched = (this.mcpServers || []).filter(s => requestedNames.includes(s.name))
                    if (matched.length === 0) {
                      const available = (this.mcpServers || []).map(s => s.name).join(', ')
                      result = { success: false, error: `No servers matched: ${requestedNames.join(', ')}. Available: ${available}` }
                    } else {
                      const newTools = await _loadMcpTools(matched)
                      logger.agent('search_mcp_tools (anthropic)', { requested: requestedNames, loaded: newTools.length })
                      result = newTools.length > 0
                        ? { success: true, loaded: newTools.length, tools: newTools }
                        : { success: false, error: `Servers found but no tools discovered: ${requestedNames.join(', ')}` }
                    }
                  } else if (mcpToolMap.has(toolName)) {
                    const permCheck = await this._checkPermission(toolName, toolInput, onChunk)
                    if (permCheck.decision === 'block' || permCheck.decision === 'reject') {
                      result = permCheck.result
                    } else {
                      const { serverId, tool, serverConfig } = mcpToolMap.get(toolName)
                      result = await this._executeMcpToolViaManager(serverId, tool.name, toolInput, serverConfig)
                    }
                  } else if (httpToolMap.has(toolName)) {
                    result = await this._executeHttpTool(httpToolMap.get(toolName), toolInput)
                  } else if (smtpToolMap.has(toolName)) {
                    result = await this._executeSmtpTool(toolInput)
                  } else if (codeToolMap.has(toolName)) {
                    const codeTool = codeToolMap.get(toolName)
                    result = { success: true, data: 'This is a reference code snippet. Use execute_shell to run similar code.', code: codeTool.code, language: codeTool.language || 'javascript' }
                  } else if (promptToolMap.has(toolName)) {
                    const promptTool = promptToolMap.get(toolName)
                    result = { success: true, data: promptTool.promptText || '' }
                  } else if (toolName === 'submit_plan') {
                    onChunk({ type: 'plan_submitted', plan: toolInput })
                    result = { success: true, status: 'awaiting_approval' }
                    this._planPending = true
                    onChunk({ type: 'tool_result', name: toolName, result: JSON.stringify(result), toolCallId: block.id })
                    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
                  } else {
                    const permCheck = await this._checkPermission(toolName, toolInput, onChunk)
                    if (permCheck.decision === 'block' || permCheck.decision === 'reject') {
                      result = permCheck.result
                    } else {
                      result = await this.toolRegistry.execute(toolName, toolInput, block.id, (update) => {
                        onChunk({ type: 'tool_output', name: toolName, text: update.text, stream: update.type })
                      }, this._abortController.signal)
                    }
                  }

                  const mcpImages = result?._mcpImages || result?.details?.images
                  if (result?._mcpImages) delete result._mcpImages
                  if (result?.details?.images) delete result.details.images  // prevent uiResult from double-spreading images
                  onChunk({ type: 'tool_result', name: toolName, result: uiResult(result), toolCallId: block.id, ...(mcpImages ? { images: mcpImages } : {}) })
                  return { type: 'tool_result', tool_use_id: block.id, content: serializeToolResult(result, toolName) }
                })
              ),
              this._abortPromise()
            ])

            conversationMessages.push({ role: 'user', content: toolResults })

            // If a plan was submitted, break — wait for user approval
            if (this._planPending) {
              this._planPending = false
              break
            }

          } else {
            if (stopReason === 'max_tokens') {
              onChunk({ type: 'max_tokens_reached', limit: configuredMaxTokens })
            } else if (stopReason === 'end_turn') {
              // Normal end of turn — no action needed
            }
            break
          }
        }
      }

      if (iteration >= MAX_ITERATIONS) {
        logger.warn('AgentLoop hit max iterations', { MAX_ITERATIONS })
        onChunk({ type: 'text', text: '\n\n[Reached maximum iteration limit]' })
      }

      // Final context metrics
      onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

      // Emit completion step
      onChunk({ 
        type: 'agent_step', 
        id: 'step-complete', 
        title: '✅ Agent Complete', 
        status: 'completed',
        details: {
          iteration,
          model,
          provider,
          msgs: conversationMessages.length,
          totalTokens: this.contextManager.inputTokens + this.contextManager.outputTokens,
          inputTokens: this.contextManager.inputTokens,
          outputTokens: this.contextManager.outputTokens
        },
        timestamp: new Date().toISOString()
      })

      return finalText
    } catch (err) {
      if (err.name === 'AbortError' || this.stopped) {
        logger.agent('AgentLoop stopped by user')
        return finalText
      }
      logger.error('AgentLoop.run error', err.message, err.stack?.split('\n').slice(0, 3).join(' | '))
      throw err
    }
  }

  /**
   * Execute an MCP tool via the McpManager subprocess protocol.
   * Transforms MCP content array to agent-friendly result.
   * Extracts images/binary data so they never enter conversation context.
   */
  async _executeMcpToolViaManager(serverId, toolName, input, serverConfig = null) {
    return te.executeMcpToolViaManager(serverId, toolName, input, serverConfig)
  }

  /**
   * Execute an HTTP tool by making the configured HTTP request.
   * Merges agent-provided body with the tool's bodyTemplate.
   */
  async _executeHttpTool(tool, input) {
    return te.executeHttpTool(tool, input)
  }

  /** Send email via SMTP using the app's configured SMTP credentials */
  async _executeSmtpTool(args) {
    return te.executeSmtpTool(this.config, args)
  }

  /** Check if a text string looks like a base64-encoded image */
  _looksLikeBase64Image(text) { return te.looksLikeBase64Image(text) }

  /** Try to extract base64 image data from a standalone text string */
  _extractBase64Image(text) { return te.extractBase64Image(text) }

  /**
   * Scan text for embedded data:image URIs (e.g. inside JSON), extract them,
   * and replace with a short placeholder. Handles the n8n case where the MCP
   * response is a JSON string containing "data:image/png;base64,<6MB>".
   */
  _extractEmbeddedImages(text) { return te.extractEmbeddedImages(text) }

  /**
   * Convert Anthropic-format conversation messages to OpenAI chat format.
   * - System prompt → { role: 'system', content }
   * - User text → { role: 'user', content }
   * - User multimodal → { role: 'user', content: [...parts] }
   * - Assistant with tool_use blocks → { role: 'assistant', content, tool_calls }
   * - tool_result blocks → { role: 'tool', tool_call_id, content }
   */
  _toOpenAIMessages(systemPrompt, messages) {
    return mc.toOpenAIMessages(systemPrompt, messages)
  }

  /**
   * Emit a system banner indicating that the agent loop recovered from a
   * provider context_length_exceeded error by trimming messages inline.
   * Bumps compactionCount, records the cooldown, and sends a `compaction_applied`
   * chunk that the renderer turns into a visible system banner.
   */
  _emitOverflowRecoveryBanner(onChunk, msgTokens, ctxLimit) {
    this.contextManager.compactionCount++
    ctxErrorDetector.markReactiveCompact(this.config.chatId)
    onChunk({
      type: 'compaction_applied',
      kind: 'overflow-recovery',
      tokensBefore: msgTokens || 0,
      tokensAfter: Math.floor((ctxLimit || 0) * 0.70),
    })
  }

  /**
   * Trim OpenAI-format messages to fit within a token limit.
   * Keeps the system message (first) + most recent messages.
   * Uses rough char/4 estimation for token count.
   */
  _trimMessagesToFit(messages, currentTokens, contextLimit) {
    if (messages.length <= 2) return messages
    const target = Math.floor(contextLimit * 0.70)
    // Keep first message (system prompt) and progressively drop oldest non-system messages
    const first = messages[0]?.role === 'system' ? [messages[0]] : []
    const rest = first.length > 0 ? messages.slice(1) : [...messages]
    let est = first.length > 0 ? Math.ceil(JSON.stringify(first[0]).length / 4) : 0
    // Walk backwards to keep most recent messages
    const kept = []
    for (let i = rest.length - 1; i >= 0; i--) {
      const msgTokens = Math.ceil(JSON.stringify(rest[i]).length / 4)
      if (est + msgTokens > target && kept.length >= 2) break
      est += msgTokens
      kept.unshift(rest[i])
    }
    // Prepend trim marker after system message
    const marker = { role: 'user', content: '[Earlier conversation was trimmed to fit context window]' }
    const markerReply = { role: 'assistant', content: 'Understood. Continuing with recent context.' }
    return [...first, marker, markerReply, ...kept]
  }

  /**
   * Convert Anthropic-style messages to Gemini `contents` format.
   * System prompt is injected as a user/model turn pair (Gemini has no system role).
   */
  _toGeminiContents(systemPrompt, messages) {
    return mc.toGeminiContents(systemPrompt, messages)
  }

  /**
   * Inline tool-call fallback for weak OpenAI-compat models.
   *
   * Some cheap / local models output tool calls as plain JSON text instead of
   * using the proper tool_calls response field. This method scans the model's
   * text output for JSON objects that look like tool calls and extracts them.
   *
   * Recognised patterns (all case-insensitive on key names):
   *   { "name": "<tool>", "arguments": { ... } }
   *   { "name": "<tool>", "parameters": { ... } }
   *   { "function": { "name": "<tool>", "arguments": { ... } } }
   *
   * Only tool names present in `validToolNames` are accepted — this prevents
   * false positives on arbitrary JSON in the model's response.
   *
   * @param {string}     text           The model's full text output.
   * @param {Set<string>} validToolNames Set of registered tool names.
   * @returns {Array<{name: string, arguments: object}>}
   */
  _extractInlineToolCalls(text, validToolNames) {
    if (!text || validToolNames.size === 0) return []

    const results = []
    // Find all top-level JSON objects in the text (braces matching)
    const jsonCandidates = []
    let depth = 0, start = -1
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i
        depth++
      } else if (text[i] === '}') {
        depth--
        if (depth === 0 && start >= 0) {
          jsonCandidates.push(text.slice(start, i + 1))
          start = -1
        }
      }
    }

    for (const candidate of jsonCandidates) {
      let obj
      try { obj = JSON.parse(candidate) } catch { continue }
      if (!obj || typeof obj !== 'object') continue

      // Pattern 1: { "name": "<tool>", "arguments"|"parameters": { ... } }
      if (obj.name && validToolNames.has(obj.name)) {
        const args = obj.arguments || obj.parameters || obj.input || {}
        results.push({ name: obj.name, arguments: typeof args === 'object' ? args : {} })
        continue
      }

      // Pattern 2: { "function": { "name": "<tool>", "arguments": { ... } } }
      const fn = obj.function || obj.tool_call
      if (fn && fn.name && validToolNames.has(fn.name)) {
        const args = fn.arguments || fn.parameters || fn.input || {}
        let parsedArgs = args
        if (typeof args === 'string') {
          try { parsedArgs = JSON.parse(args) } catch { parsedArgs = {} }
        }
        results.push({ name: fn.name, arguments: typeof parsedArgs === 'object' ? parsedArgs : {} })
        continue
      }

      // Pattern 3: { "tool_calls": [{ "function": { "name": "...", ... } }] }
      if (Array.isArray(obj.tool_calls)) {
        for (const tc of obj.tool_calls) {
          const tcFn = tc.function || tc
          if (tcFn.name && validToolNames.has(tcFn.name)) {
            const args = tcFn.arguments || tcFn.parameters || tcFn.input || {}
            let parsedArgs = args
            if (typeof args === 'string') {
              try { parsedArgs = JSON.parse(args) } catch { parsedArgs = {} }
            }
            results.push({ name: tcFn.name, arguments: typeof parsedArgs === 'object' ? parsedArgs : {} })
          }
        }
      }
    }

    return results
  }
}

module.exports = { AgentLoop }
