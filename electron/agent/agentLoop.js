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
const { GenerateImageTool }  = require('./tools/GenerateImageTool')
const { ContextManager }   = require('./core/ContextManager')
const { ToolRegistry }     = require('./tools/ToolRegistry')
const { SubAgentManager }  = require('./managers/SubAgentManager')
const { TaskManager }      = require('./managers/TaskManager')
const { mcpManager }       = require('./mcp/McpManager')
const { PermissionGate }   = require('./tools/PermissionGate')

const MAX_CONTEXT_TURNS = 20  // max user/assistant turn pairs sent to LLM
const FLUSH_INTERVAL    = 10  // flush every N completed assistant turns

const { MemoryFlush } = require('./core/MemoryFlush')
const { ChatIndex }   = require('../memory/ChatIndex')

// Extracted modules
const spb = require('./systemPromptBuilder')
const mc  = require('./messageConverter')
const te  = require('./toolExecutor')

// Module-level helpers (re-imported from extracted modules for use in run())
const { serializeToolResult, uiResult, sliceToLastNTurns } = mc
const { readSoulFile, readFileIfExists } = spb

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
      isOpenAIProvider = (pType === 'openai' || pType === 'deepseek' || pType === 'minimax')

      // Normalize config for clients
      if (isOpenAIProvider) {
        config.openaiApiKey = config.provider.apiKey
        config.openaiBaseURL = config.provider.baseURL
        config.customModel = config.provider.model
        config._directAuth = (pType === 'deepseek' || pType === 'minimax')
      } else {
        config.apiKey = config.provider.apiKey
        config.baseURL = config.provider.baseURL
        config.customModel = config.provider.model
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
      this.anthropicClient = new OpenAIClient(config)
      this.isOpenAI = true
    } else {
      this.isGoogle = false
      this.anthropicClient = new AnthropicClient(config)
      this.isOpenAI = false
    }
    this.contextManager  = new ContextManager(this.anthropicClient)
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

    logger.agent('AgentLoop init', {
      model: this.anthropicClient.resolveModel(),
      isOpenAI: this.isOpenAI,
      globalMode: sandboxCfg.defaultMode || 'sandbox',
      chatMode: config.chatPermissionMode || 'inherit',
      allowList: (sandboxCfg.sandboxAllowList || []).length,
      dangerList: effectiveDangerList.length,
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
    if (chatMode === 'all_permissions' && this._pendingPermissions.size > 0) {
      for (const [blockId, resolve] of this._pendingPermissions) {
        logger.agent('PermissionGate: auto-resolving pending block due to mode change', { blockId })
        resolve('allow_chat')
      }
      this._pendingPermissions.clear()
    }
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
    const isMcp = toolName.startsWith('mcp_')

    // Only check: execute_shell, file_operation (write/append/delete/mkdir), mcp_*
    const needsCheck = toolName === 'execute_shell'
      || (toolName === 'file_operation' && RESTRICTED_FILE_OPS.includes(toolInput.operation))
      || isMcp

    if (!needsCheck) return { decision: 'allow' }

    const check = this.permissionGate.check(toolName, toolInput)

    if (check.decision === 'block') {
      logger.agent('PermissionGate: BLOCK', { toolName, commandStr: check.commandStr, reason: check.reason })
      return {
        decision: 'block',
        result: { error: `Operation blocked: matches danger list pattern. Remove it from Config → Security → Danger Block List to allow. (matched: "${check.commandStr}")` }
      }
    }

    if (check.decision === 'allow') {
      logger.agent('PermissionGate: ALLOW', { toolName, commandStr: check.commandStr, reason: check.reason })
      return { decision: 'allow' }
    }

    // decision === 'ask' — pause and prompt the user
    const blockId = require('crypto').randomUUID()
    logger.agent('PermissionGate: ASK', { toolName, commandStr: check.commandStr, blockId })

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

  /**
   * Standalone compaction — makes one API call with compaction enabled
   * to compress the conversation history. Works when the agent loop is NOT running.
   * For Anthropic providers: uses the beta compaction API.
   * For OpenAI-compat providers: falls back to local message trimming.
   */
  async compactStandalone(messages, enabledAgents, enabledSkills, onChunk, agentPrompts) {
    this.toolRegistry.loadForAgents(enabledAgents || [])

    this.skillPrompts = new Map()
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

    // ── Memory flush state ──
    let turnsSinceFlush = 0

    const runFlushIfNeeded = async (reason) => {
      const agentId = agentPrompts?.systemAgentId
      if (!agentId || !this.config.memoryDir) return
      const logsDir = path.join(this.config.memoryDir, 'agents', agentId, 'memory')
      const um = this.config.utilityModel
      if (!um?.provider || !um?.model) return
      const providerCfg = this.config[um.provider]
      if (!providerCfg?.apiKey || !providerCfg?.baseURL) return

      const flusher = new MemoryFlush({
        model:      um.model,
        apiKey:     providerCfg.apiKey,
        baseURL:    providerCfg.baseURL,
        isOpenAI:   um.provider === 'openai' || um.provider === 'deepseek',
        directAuth: um.provider === 'deepseek',
      })
      logger.agent(`[AgentLoop] memory flush triggered (${reason})`, { agentId })
      const flushMeta = this.config.chatId ? { chatId: this.config.chatId } : {}
      await flusher.run(conversationMessages, agentId, logsDir, flushMeta).catch(err =>
        logger.error('[AgentLoop] flush error (non-fatal)', err.message)
      )
      turnsSinceFlush = 0
    }

    // Load tools for enabled agents
    this.toolRegistry.loadForAgents(enabledAgents || [])

    // Register memory log tool for this agent (agent-specific, needs agentId)
    if (this.config.memoryDir && agentPrompts?.systemAgentId) {
      this.toolRegistry.registerMemoryLogTool(this.config.memoryDir, agentPrompts.systemAgentId)
    }

    // Store full skill prompts for lazy loading via load_skill tool
    this.skillPrompts = new Map()
    for (const skill of enabledSkills || []) {
      if (typeof skill !== 'string' && skill.systemPrompt) {
        this.skillPrompts.set(skill.id, skill.systemPrompt)
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

    // ── Load per-agent memory files ──
    const memoryDir    = this.config.memoryDir
    let agentMemoryMd  = null
    let userMd         = null
    let todayLogMd     = null
    let yesterdayLogMd = null

    if (memoryDir && agentPrompts?.systemAgentId) {
      const agentId   = agentPrompts.systemAgentId
      const agentDir  = path.join(memoryDir, 'agents', agentId)
      const logsDir   = path.join(agentDir, 'memory')
      const now       = new Date()
      const today     = now.toISOString().slice(0, 10)
      const yesterday = new Date(now - 86400000).toISOString().slice(0, 10)

      agentMemoryMd   = readFileIfExists(path.join(agentDir, 'MEMORY.md'))
      todayLogMd      = readFileIfExists(path.join(logsDir, `${today}.md`))
      yesterdayLogMd  = readFileIfExists(path.join(logsDir, `${yesterday}.md`))
    }
    if (memoryDir && agentPrompts?.userAgentId) {
      const userId = agentPrompts.userAgentId
      userMd = readFileIfExists(path.join(memoryDir, 'users', userId, 'USER.md'))
    }

    // ── Search historical chats for relevant context ──
    let historicalContext = null
    if (memoryDir && agentPrompts?.systemAgentId) {
      try {
        const agentMemoryDir = path.join(memoryDir, 'agents')
        const chatIdx = new ChatIndex(agentMemoryDir)
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
        const query = typeof lastUserMsg?.content === 'string'
          ? lastUserMsg.content.slice(0, 500)
          : ''
        if (query.trim().length > 10) {
          const results = chatIdx.search(
            query, agentPrompts.systemAgentId, 4,
            { excludeChatId: this.config.chatId }
          )
          if (results.length > 0) {
            // Format text for system prompt injection
            historicalContext = results.map(r => r.text).join('\n\n---\n\n')
            // Emit sources to UI so user can jump to original chat
            const sources = results.map(r => ({ chatId: r.chatId, snippet: r.text.slice(0, 120) }))
            onChunk({ type: 'history_context', sources })
          }
        }
      } catch (err) {
        logger.error('[AgentLoop] history search error (non-fatal)', err.message)
      }
    }

    const systemPrompt = this.buildSystemPrompt(
      enabledAgents, enabledSkills, agentPrompts,
      userSoulContent, systemSoulContent, participantSouls,
      { userMd, agentMemoryMd, todayLogMd, yesterdayLogMd, historicalContext },
      this.ragContext
    )

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

    // Add generate_image tool if an image provider is configured
    const imageCfg = this.config.imageProvider  // { apiKey, baseURL, model }
    if (imageCfg?.apiKey && imageCfg?.baseURL && imageCfg?.model) {
      const genImgTool = new GenerateImageTool()
      allToolsAnthropic.push(genImgTool.definition)
    }

    // Add load_skill tool when skills are available
    if (this.skillPrompts.size > 0) {
      allToolsAnthropic.push({
        name: 'load_skill',
        description: 'Load the full instructions for an active skill. Call this when the user\'s request is related to a skill listed in ACTIVE SKILLS. Returns the complete skill guide.',
        input_schema: {
          type: 'object',
          properties: {
            skill_id: {
              type: 'string',
              description: 'The ID of the skill to load (from the ACTIVE SKILLS list)'
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
                  description: 'Files to attach. Each item is a path string or {path, filename}.',
                  items: {
                    oneOf: [
                      { type: 'string' },
                      { type: 'object', properties: { path: { type: 'string' }, filename: { type: 'string' } }, required: ['path'] }
                    ]
                  }
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

    // Resolve configured output token limit: per-chat → global config → hardcoded default
    const DEFAULT_MAX_TOKENS = 32768
    const configuredMaxTokens = this.config.maxOutputTokens
      ? Math.min(98304, Math.max(1024, Number(this.config.maxOutputTokens)))
      : DEFAULT_MAX_TOKENS

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
        }

        // ── Snapshot context for inspector ──
        this.contextSnapshot = {
          systemPrompt,
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
          await runFlushIfNeeded('exhausted')
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
          onChunk({ type: 'compaction', message: 'Context compacted to continue conversation' })
          this.contextManager.inputTokens = Math.floor(this.contextManager.inputTokens * 0.4)
        }

        // ── Manual compaction request from UI ──
        if (this._compactionRequested) {
          this._compactionRequested = false
          if (!this.isOpenAI) {
            await runFlushIfNeeded('manual-compact')
            logger.agent('Manual compaction requested', { inputTokens: this.contextManager.inputTokens })
            Object.assign(createParams, this.contextManager.applyCompaction(createParams))
            this.contextManager.compactionCount++
            onChunk({ type: 'compaction', message: 'Manual compaction applied' })
          }
        }

        // ── Memory flush before compaction ──
        if (this.contextManager.shouldCompact()) {
          await runFlushIfNeeded('pre-compaction')
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
          onChunk({ type: 'compaction', message: 'Context compacted to fit window' })
        }

        // ── Context trimming for OpenAI-compat providers ──
        if (this.isOpenAI && this.contextManager.shouldCompact()) {
          createParams.messages = this.contextManager.localTrim(
            createParams.messages,
            this.contextManager.inputTokens
          )
          conversationMessages.length = 0
          conversationMessages.push(...createParams.messages)
          onChunk({ type: 'compaction', message: 'Older messages trimmed to fit context' })
        }

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
          model,
          msgs: createParams.messages.length,
          tools: allTools.length,
          thinking: isOpus46 ? 'adaptive' : (supportsThinking ? 'enabled' : 'none'),
          provider: this.isGoogle ? 'google' : (this.config._directAuth ? 'deepseek' : (this.isOpenAI ? 'openai-compat' : 'anthropic'))
        })

        if (this.isGoogle) {
          // ── Google Gemini native API (non-streaming, supports inline image output) ──
          const gc = this.geminiClient.getClient()
          const contents = this._toGeminiContents(systemPrompt, conversationMessages)
          let geminiResponse
          try {
            geminiResponse = await gc.models.generateContent({ model, contents })
          } catch (geminiErr) {
            logger.error('Gemini generateContent FAILED', geminiErr.message)
            throw geminiErr
          }

          const parts = geminiResponse.candidates?.[0]?.content?.parts || []
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

          // Gemini image models don't support tool use — always end here
          stopReason = 'end_turn'
          assistantContent = [{ type: 'text', text: finalText }]
          conversationMessages.push({ role: 'assistant', content: finalText || '(image generated)' })

          // Rough token estimate for context tracking
          const estTokens = JSON.stringify(contents).length / 4
          this.contextManager.inputTokens = Math.ceil(estTokens)
          onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

          logger.agent('Gemini response end', { iteration, parts: parts.length, images: responseImages.length })

        } else if (this.isOpenAI) {
          // ── OpenAI-format streaming ──
          const openaiMessages = this._toOpenAIMessages(systemPrompt, conversationMessages)
          // DeepSeek has a per-model cap (default 8192); use configured limit or fall back to 8192
          const deepseekMax = this.config._directAuth
            ? Math.min(configuredMaxTokens, Number(this.config.deepseek?.maxTokens) || 8192)
            : configuredMaxTokens
          const effectiveMaxTokens = deepseekMax
          const openaiParams = {
            model,
            max_tokens: effectiveMaxTokens,
            messages: openaiMessages,
            stream: true,
          }
          if (allTools.length > 0) openaiParams.tools = allTools

          let stream
          try {
            stream = await client.chat.completions.create(openaiParams, {
              signal: this._abortController.signal
            })
          } catch (streamErr) {
            // Some models (e.g. OpenRouter image-generation models) don't support tool use.
            // If the error says so, retry once without tools so image generation can proceed.
            const noToolSupport = streamErr.message?.includes('tool use') ||
                                  streamErr.message?.includes('tool_use') ||
                                  streamErr.status === 404
            if (noToolSupport && openaiParams.tools?.length > 0) {
              logger.warn('Model does not support tool use — retrying without tools', streamErr.message)
              const paramsNoTools = { ...openaiParams }
              delete paramsNoTools.tools
              try {
                stream = await client.chat.completions.create(paramsNoTools, {
                  signal: this._abortController.signal
                })
              } catch (retryErr) {
                logger.error('Retry without tools also FAILED', retryErr.message)
                throw retryErr
              }
            } else {
              logger.error(`${this.config._directAuth ? 'DeepSeek' : 'OpenAI'} stream open FAILED`, streamErr.message)
              throw streamErr
            }
          }

          // Accumulate streamed tool calls: index → { id, name, arguments }
          const toolCallAccumulators = new Map()
          let streamedReasoningContent = ''
          const responseImages = []

          for await (const chunk of stream) {
            if (this.stopped) break
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
            try { parsedArgs = JSON.parse(acc.arguments || '{}') } catch {}
            assistantContent.push({
              type: 'tool_use',
              id: acc.id,
              name: acc.name,
              input: parsedArgs
            })
            openaiToolCalls.push({
              id: acc.id,
              type: 'function',
              function: { name: acc.name, arguments: acc.arguments || '{}' }
            })
          }

          // Emit any images collected from multimodal delta.content arrays
          if (responseImages.length > 0) {
            onChunk({
              type: 'tool_result',
              name: '_image',
              result: `[${responseImages.length} image(s) generated]`,
              images: responseImages
            })
          }

          // Rough usage estimate for context tracking
          const estTokens = JSON.stringify(openaiMessages).length / 4
          this.contextManager.inputTokens = Math.ceil(estTokens)
          onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

          // Push assistant message — store in OpenAI-native format so that
          // reasoning_content (DeepSeek thinking mode) round-trips correctly.
          // The Anthropic-style assistantContent is kept only for tool dispatch below.
          const nativeAssistant = { role: 'assistant' }
          const textParts = assistantContent.filter(b => b.type === 'text').map(b => b.text).join('')
          nativeAssistant.content = textParts || null
          if (openaiToolCalls.length > 0) nativeAssistant.tool_calls = openaiToolCalls
          // DeepSeek requires reasoning_content to be echoed back verbatim in history
          if (streamedReasoningContent) nativeAssistant.reasoning_content = streamedReasoningContent
          conversationMessages.push(nativeAssistant)

          logger.agent('OpenAI stream end', { iteration, stopReason })

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
                  onChunk({ type: 'tool_call', name: toolName, input: toolInput })

                  let result
                  if (toolName === 'load_skill') {
                    const skillId = toolInput.skill_id
                    const prompt = this.skillPrompts.get(skillId)
                    result = prompt
                      ? { success: true, skill_id: skillId, content: prompt }
                      : { success: false, error: `Skill '${skillId}' not found. Available: ${[...this.skillPrompts.keys()].join(', ')}` }
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
                        onChunk({ type: 'tool_call', name: 'todo_manager', input: todoInput })
                        onChunk({ type: 'tool_result', name: 'todo_manager', result: uiResult(todoResult) })
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
                  } else if (toolName === 'generate_image') {
                    const genImgTool = new GenerateImageTool()
                    result = await genImgTool.execute(toolInput, this.config.imageProvider || {})
                  } else if (toolName === 'submit_plan') {
                    onChunk({ type: 'plan_submitted', plan: toolInput })
                    result = { success: true, status: 'awaiting_approval' }
                    this._planPending = true
                    return { tool_call_id: block.id, content: JSON.stringify(result) }
                  } else {
                    const permCheck = await this._checkPermission(toolName, toolInput, onChunk)
                    if (permCheck.decision === 'block' || permCheck.decision === 'reject') {
                      result = permCheck.result
                    } else {
                      result = await this.toolRegistry.execute(toolName, toolInput, block.id, (update) => {
                        onChunk({ type: 'tool_output', name: toolName, text: update.text, stream: update.type })
                      })
                    }
                  }
                  const mcpImages = result?._mcpImages || result?.details?.images
                  if (result?._mcpImages) delete result._mcpImages
                  if (result?.details?.images) delete result.details.images  // prevent uiResult from double-spreading images
                  onChunk({ type: 'tool_result', name: toolName, result: uiResult(result), ...(mcpImages ? { images: mcpImages } : {}) })
                  return { tool_call_id: block.id, content: serializeToolResult(result, toolName) }
                })
              ),
              this._abortPromise()
            ])

            // Push tool results in OpenAI-native format — each as a separate `role: 'tool'` message
            for (const tr of toolResults) {
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
              } else if (event.delta.type === 'image_delta' && event.delta.image) {
                // OpenRouter may stream image data via Anthropic SDK (non-standard extension)
                const img = event.delta.image
                if (img.source?.data) {
                  onChunk({ type: 'tool_result', name: '_image', result: '[image generated]', images: [{ data: img.source.data, mimeType: img.source.media_type || 'image/png' }] })
                }
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

                // Debug: log finalMessage content block types to understand image response format
                if (Array.isArray(finalMessage.content)) {
                  logger.agent('finalMessage content blocks', finalMessage.content.map(b => ({
                    type: b.type,
                    hasData: b.type === 'image' ? !!b.source?.data : undefined,
                    dataLen: b.type === 'image' ? b.source?.data?.length : undefined,
                    textLen: b.type === 'text' ? b.text?.length : undefined,
                    textPreview: b.type === 'text' ? b.text?.slice(0, 80) : undefined,
                  })))
                }

                // Extract any image blocks from finalMessage (OpenRouter image models may
                // return images in the final message rather than as streaming deltas)
                if (Array.isArray(finalMessage.content)) {
                  for (const block of finalMessage.content) {
                    if (block.type === 'image' && block.source?.data) {
                      onChunk({
                        type: 'tool_result',
                        name: '_image',
                        result: '[image generated]',
                        images: [{ data: block.source.data, mimeType: block.source.media_type || 'image/png' }]
                      })
                    }
                  }
                }

                if (isOpus46 && finalMessage.content) {
                  this.contextManager.appendAssistantContent(conversationMessages, finalMessage.content)
                } else {
                  conversationMessages.push({ role: 'assistant', content: assistantContent })
                }
              } else {
                conversationMessages.push({ role: 'assistant', content: assistantContent })
              }

              logger.agent('stream end', { iteration, stopReason, tokens: this.contextManager.getMetrics() })
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

                  onChunk({ type: 'tool_call', name: toolName, input: toolInput })

                  let result

                  if (toolName === 'load_skill') {
                    const skillId = toolInput.skill_id
                    const prompt = this.skillPrompts.get(skillId)
                    if (prompt) {
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
                        onChunk({ type: 'tool_call', name: 'todo_manager', input: todoInput })
                        onChunk({ type: 'tool_result', name: 'todo_manager', result: uiResult(todoResult) })
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
                  } else if (toolName === 'generate_image') {
                    const genImgTool = new GenerateImageTool()
                    result = await genImgTool.execute(toolInput, this.config.imageProvider || {})
                  } else if (toolName === 'submit_plan') {
                    onChunk({ type: 'plan_submitted', plan: toolInput })
                    result = { success: true, status: 'awaiting_approval' }
                    this._planPending = true
                    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
                  } else {
                    const permCheck = await this._checkPermission(toolName, toolInput, onChunk)
                    if (permCheck.decision === 'block' || permCheck.decision === 'reject') {
                      result = permCheck.result
                    } else {
                      result = await this.toolRegistry.execute(toolName, toolInput, block.id, (update) => {
                        onChunk({ type: 'tool_output', name: toolName, text: update.text, stream: update.type })
                      })
                    }
                  }

                  const mcpImages = result?._mcpImages || result?.details?.images
                  if (result?._mcpImages) delete result._mcpImages
                  if (result?.details?.images) delete result.details.images  // prevent uiResult from double-spreading images
                  onChunk({ type: 'tool_result', name: toolName, result: uiResult(result), ...(mcpImages ? { images: mcpImages } : {}) })
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
              // Increment turn counter; trigger periodic flush
              turnsSinceFlush++
              if (turnsSinceFlush >= FLUSH_INTERVAL) {
                await runFlushIfNeeded('interval')
              }
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
   * Convert Anthropic-style messages to Gemini `contents` format.
   * System prompt is injected as a user/model turn pair (Gemini has no system role).
   */
  _toGeminiContents(systemPrompt, messages) {
    return mc.toGeminiContents(systemPrompt, messages)
  }
}

module.exports = { AgentLoop }
