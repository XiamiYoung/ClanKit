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
const { ContextManager }   = require('./core/ContextManager')
const { ToolRegistry }     = require('./tools/ToolRegistry')
const { SubAgentManager }  = require('./managers/SubAgentManager')
const { TaskManager }      = require('./managers/TaskManager')
const { mcpManager }       = require('./mcp/McpManager')
const { PermissionGate }   = require('./tools/PermissionGate')

// No hardcoded skill prompts — they arrive dynamically from the UI store

// ── Tool result helpers ──────────────────────────────────────────────────────

/**
 * Serialize a tool result for the LLM context.
 * Tools now return { content: [{type:'text', text}], details } (unified format).
 * Legacy tools (MCP, HTTP, subagent, etc.) still return plain objects — handle both.
 * Hard cap at 100 000 chars to protect context window.
 */
function serializeToolResult(result, toolName) {
  if (!result) return '{}'

  // Unified format from BaseTool subclasses
  if (Array.isArray(result.content) && result.content.length > 0 && result.content[0].type === 'text') {
    let text = result.content[0].text
    if (text.length > 100000) {
      logger.warn(`Tool result too large (${text.length} chars), truncating: ${toolName}`)
      text = text.slice(0, 100000) + '\n[truncated]'
    }
    return text
  }

  // Legacy plain-object format (MCP, HTTP, subagent, built-ins like load_skill)
  let serialized = JSON.stringify(result)
  if (serialized.length > 100000) {
    logger.warn(`Tool result too large (${serialized.length} chars), truncating: ${toolName}`)
    serialized = JSON.stringify({ success: result?.success, data: `[Result truncated: ${serialized.length} chars original.]` })
  }
  return serialized
}

/**
 * Extract the UI-facing result to pass to onChunk.
 * For unified format, expose details (structured data) alongside text.
 */
function uiResult(result) {
  if (Array.isArray(result?.content) && result.content[0]?.type === 'text') {
    return { text: result.content[0].text, ...result.details }
  }
  return result
}

// ── Soul Memory Helpers ──────────────────────────────────────────────────────
const SOUL_KEY_SECTIONS = ['Preferences', 'Communication', 'Technical', 'Projects', 'Personal']

/**
 * Read a soul file from disk. Returns null if not found.
 */
function readSoulFile(soulsDir, personaId, personaType) {
  if (!soulsDir || !personaId) return null
  try {
    const filePath = path.join(soulsDir, personaType, `${personaId}.md`)
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8')
    }
  } catch (err) {
    logger.error('readSoulFile error', err.message)
  }
  return null
}

/**
 * For files > 4KB, extract only the key sections to limit prompt size.
 */
function extractKeySections(content) {
  const lines = content.split('\n')
  const result = []
  let currentSection = null
  let includeSection = false

  for (const line of lines) {
    const sectionMatch = line.match(/^## (.+)$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      includeSection = SOUL_KEY_SECTIONS.includes(currentSection)
      if (includeSection) {
        result.push(line)
      }
    } else if (includeSection) {
      result.push(line)
    } else if (!currentSection) {
      // Include header (title, timestamp)
      result.push(line)
    }
  }

  result.push('', '(Some sections omitted for brevity. Use read_soul_memory tool to access full memory.)')
  return result.join('\n')
}

/**
 * Size-gated injection: full for < 4KB, key sections for 4-16KB, warning for > 16KB.
 */
function prepareSoulContent(content) {
  if (!content) return null
  const size = Buffer.byteLength(content, 'utf8')
  if (size < 4096) return content
  if (size < 16384) return extractKeySections(content)
  return extractKeySections(content) + '\n\n(Warning: Soul memory is large. Consider pruning old entries.)'
}

class AgentLoop {
  constructor(config) {
    this.config = config
    this.stopped = false
    this._abortController = new AbortController()

    // Core components — choose client based on provider
    const isOpenAIProvider = config.defaultProvider === 'openai' || config._resolvedProvider === 'openai'
    if (isOpenAIProvider) {
      this.anthropicClient = new OpenAIClient(config)
      this.isOpenAI = true
    } else {
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
    // Unblock any suspended permission prompts so their coroutines can exit cleanly
    for (const [, resolve] of this._pendingPermissions) {
      resolve('reject')
    }
    this._pendingPermissions.clear()
  }

  _abortPromise() {
    return new Promise((_, reject) => {
      if (this._abortController.signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
      this._abortController.signal.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')), { once: true }
      )
    })
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
  async compactStandalone(messages, enabledAgents, enabledSkills, onChunk, personaPrompts) {
    this.toolRegistry.loadForAgents(enabledAgents)

    this.skillPrompts = new Map()
    for (const skill of enabledSkills || []) {
      if (typeof skill !== 'string' && skill.systemPrompt) {
        this.skillPrompts.set(skill.id, skill.systemPrompt)
      }
    }

    const systemPrompt = this.buildSystemPrompt(enabledAgents, enabledSkills, personaPrompts)
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
   * Build the system prompt from base + enabled skills + personas + memory.
   *
   * @param {Array} enabledAgents  (unused, kept for signature compat)
   * @param {Array<string|{id:string, name:string, systemPrompt?:string}>} enabledSkills
   *        Either plain skill IDs (legacy) or full skill objects with systemPrompt
   */
  buildSystemPrompt(enabledAgents, enabledSkills, { systemPersonaPrompt, userPersonaPrompt, systemPersonaId, userPersonaId, systemPersonaName, systemPersonaDescription, groupChatContext } = {}, userSoulContent, systemSoulContent, participantSouls) {
    // When a named persona is active, use it as the opening identity (highest priority).
    // Otherwise fall back to the user-configured systemPrompt, or a neutral default.
    let openingIdentity
    if (!groupChatContext && systemPersonaName) {
      let line = `You are "${systemPersonaName}"`
      if (systemPersonaDescription) line += ` — ${systemPersonaDescription}`
      line += '.'
      if (systemPersonaPrompt) line += `\n\n${systemPersonaPrompt}`
      line += `\n\n---\n## CHARACTER ENFORCEMENT\nYou ARE ${systemPersonaName} — not an AI playing a role. Embody this character completely:\n- Never break character for any reason\n- Never use AI-assistant filler: no "Certainly!", "Of course!", "Great question!", "I'd be happy to help!", "As an AI...", "As a language model..."\n- Speak in your character's authentic voice — with their opinions, habits, attitude, and emotional reactions\n- Push back, joke around, get annoyed, get excited — whatever your character would genuinely feel\n- When you use tools or capabilities, do it naturally as this character would — don't narrate it like an assistant`
      openingIdentity = line
    } else {
      openingIdentity = (this.config.systemPrompt || '').trim()
        || 'You are a versatile AI assistant running in a desktop application. You help users with a wide range of tasks including research, writing, analysis, coding, creative work, file management, and general knowledge.'
    }

    let system = `${openingIdentity}

CORE TOOLS (always available):
- execute_shell: Run shell commands (command + args separated, e.g. command:"ls" args:["/home"])
- file_operation: Read, write, list, append, search, mkdir, delete files on the filesystem
- todo_manager: Plan complex tasks with structured todo lists
- dispatch_subagent: Delegate a single focused subtask to a specialized sub-agent
- dispatch_subagents: Dispatch MULTIPLE sub-agents in parallel at once (preferred for 2+ independent tasks)
- background_task: Run long operations in the background`

    // List active skills — frontier only (name + summary).
    // Full skill content is loaded on demand via the load_skill tool.
    const skillEntries = (enabledSkills || [])
      .filter(s => typeof s !== 'string' && s.name)
      .map(s => {
        const summary = s.summary ? `: ${s.summary}` : ''
        return `- ${s.name} (id: ${s.id})${summary}`
      })

    if (skillEntries.length > 0) {
      system += `\n\nACTIVE SKILLS (enabled by user):
${skillEntries.join('\n')}

To use a skill's full instructions, call the load_skill tool with the skill's id.
Load a skill when the user's request clearly matches its description.`
    } else {
      system += `\n\nACTIVE SKILLS: None enabled.`
    }

    // ── ClankAI Data Directory ──
    const dataPath = process.env.CLANKAI_DATA_PATH || path.join(require('os').homedir(), '.clankai')
    const artifactPath = this.config.chatWorkingPath || this.config.artifactPath || path.join(dataPath, 'artifact')
    const skillsPath = this.config.skillsPath || ''
    const utilityModel = this.config.utilityModel || {}
    const utilityProvider = utilityModel.provider || ''
    const utilityModelId  = utilityModel.model    || ''
    system += `\n\nCLANKAI DATA DIRECTORY: ${dataPath}
This is the local data folder for the ClankAI desktop application. Its structure:
  ${dataPath}/
  ├── config.json          — App settings (API keys, models, providers, paths)
  ├── mcp-servers.json     — MCP server definitions
  ├── tools.json           — HTTP tool definitions
  ├── personas.json        — AI persona definitions
  ├── knowledge.json       — RAG/Pinecone knowledge config
  ├── chats/               — Per-chat message history
  ├── souls/               — Persistent memory files (system/, users/)
  └── artifact/            — AI-generated artifacts (see WORKING PATH below)

WORKING PATH (this chat's default output directory): ${artifactPath}
This is the default directory for ALL files you create during this chat. Whenever you generate files — markdown documents, reports, code scripts, exports, temp files, or any other output — ALWAYS write them here unless the user explicitly specifies a different location. Create subdirectories as needed (e.g. ${artifactPath}/docs/, ${artifactPath}/exports/). The directory is auto-created on first write.${skillsPath ? `

SKILLS PATH: ${skillsPath}
This is the directory where skill folders are stored on disk. Each skill is a folder containing a skill definition file. Use this path if the user asks to inspect, create, or modify skills on disk.` : ''}

DATA FILE ROUTING — when the user asks you to create or modify app configuration, act directly:
- "create/add/edit a tool" or "add an HTTP tool"  → read then write ${dataPath}/tools.json
  Format: {"categories":{"CategoryName":{"tools":[{"id":"<uuid>","name":"...","method":"GET|POST|...","endpoint":"...","headers":{},"bodyTemplate":"","description":"..."}]}}}
- "create/add/edit an MCP server"                  → read then write ${dataPath}/mcp-servers.json
  Format: [{"id":"<uuid>","name":"...","command":"...","args":[],"env":{},"description":"..."}]
- "create/add/edit a persona"                      → read then write ${dataPath}/personas.json
  Format: {"categories":[...],"personas":[...,{"id":"<uuid>","type":"system","name":"...","avatar":"a1","description":"...","prompt":"...","providerId":${utilityProvider ? `"${utilityProvider}"` : 'null'},"modelId":${utilityModelId ? `"${utilityModelId}"` : 'null'},"enabledSkillIds":null,"mcpServerIds":null,"voiceId":null,"categoryIds":[],"createdAt":<timestamp>,"updatedAt":<timestamp>}]}
  IMPORTANT: always set "providerId" to ${utilityProvider ? `"${utilityProvider}"` : 'null'} and "modelId" to ${utilityModelId ? `"${utilityModelId}"` : 'null'} (the system utility model) unless the user explicitly asks for a different model.
- "add/edit knowledge / RAG index"                 → read then write ${dataPath}/knowledge.json
- Always read the file first to understand existing content before writing. Preserve all existing entries.
- After writing, tell the user to click Refresh on the relevant page (MCP / Tools / Personas / Knowledge) to reload.`

    // ── Notes Vault Path + Markdown Placement ──
    const vaultPath = process.env.DOC_PATH || this.config.obsidianVaultPath || this.config.DoCPath
    if (vaultPath) {
      let subfolders = []
      try {
        const entries = fs.readdirSync(vaultPath, { withFileTypes: true })
        subfolders = entries.filter(e => e.isDirectory()).map(e => e.name).sort()
      } catch (err) {
        logger.error('Failed to read notes vault subfolders', err.message)
      }

      const subfolderList = subfolders.length > 0
        ? subfolders.map(f => `  - ${f}/`).join('\n')
        : '  (no subfolders)'

      system += `\n\nNOTES VAULT PATH: ${vaultPath}
This is the user's personal notes folder (markdown files). Subfolders:
${subfolderList}

MARKDOWN FILE PLACEMENT:
When generating .md markdown files (documents, reports, notes, summaries, analyses, etc.), ALWAYS ask the user where to save them by presenting these options:
1. Notes vault: ${vaultPath} (with subfolder options: ${subfolders.length > 0 ? subfolders.join(', ') : 'root'})
2. Artifact docs: ${artifactPath}/docs/
Then write the file to the chosen location. For non-.md files, continue using the artifact path as default.`
    }

    if (systemPersonaName && !groupChatContext) {
      system += `\n\nOPERATIONAL NOTES (secondary to your character — use these naturally, not robotically):
- For complex multi-step tasks, use a todo list to stay organized.
- Delegate independent subtasks to sub-agents when it makes sense.
- Use background_task for long-running operations.
- Report progress on large tasks in your own voice and style.
- The chat UI has a built-in 3D viewer that automatically renders 3D model URLs (.glb, .gltf, .obj, .stl, .babylon, .fbx). When a 3D asset URL appears, acknowledge it in character.`
    } else {
      system += `\n\nGUIDELINES:
- Be concise and precise. Explain your reasoning when using tools.
- For complex multi-step tasks, ALWAYS create a todo list first using todo_manager.
- When a subtask is independent and focused, delegate it to a sub-agent.
- For long-running commands (builds, test suites), use background_task.
- When asked about your capabilities or tools, report the core tools and any active skills listed above.
- Always report progress on large tasks.
- The chat UI has a built-in 3D viewer that automatically renders 3D model URLs (.glb, .gltf, .obj, .stl, .babylon, .fbx). When the user shares a 3D asset URL, acknowledge it — the viewer is already displaying it inline. You can discuss the model, suggest interactions (rotate, zoom, wireframe toggle), or help with 3D-related questions.`
    }

    // Append MCP server info if any are enabled
    const mcpServers = this.mcpServers || []
    if (mcpServers.length > 0) {
      const mcpEntries = mcpServers.map(s =>
        `- ${s.name}: ${s.description || 'No description'}`
      )
      system += `\n\nMCP SERVERS (external integrations — available on demand):
${mcpEntries.join('\n')}
When the user's request involves one of these integrations, call search_mcp_tools with the server name first to load its tools, then use them.`
    }

    // Append user-defined tools info if any are enabled
    const allUserTools = this.httpTools || []
    const httpToolsList = allUserTools.filter(t => (t.type || 'http') === 'http')
    const codeToolsList = allUserTools.filter(t => t.type === 'code')
    const promptToolsList = allUserTools.filter(t => t.type === 'prompt')
    const smtpToolsList = allUserTools.filter(t => t.type === 'smtp')

    if (httpToolsList.length > 0) {
      const toolEntries = httpToolsList.map(t =>
        `- http_${t.id}: [${t.method}] ${t.endpoint} — ${t.description || t.name}`
      )
      system += `\n\nHTTP TOOLS (user-defined API endpoints):
${toolEntries.join('\n')}
Use these tools when the user's request matches their description. Pass a 'body' object if the endpoint requires request data.`
    }

    if (codeToolsList.length > 0) {
      const toolEntries = codeToolsList.map(t =>
        `- code_${t.id}: [${(t.language || 'javascript').toUpperCase()}] ${t.description || t.name}`
      )
      system += `\n\nCODE REFERENCE TOOLS (user-defined code snippets):
${toolEntries.join('\n')}
Call these tools to retrieve reference code. Use execute_shell to run similar code based on the reference.`
    }

    if (promptToolsList.length > 0) {
      const toolEntries = promptToolsList.map(t =>
        `- prompt_${t.id}: ${t.description || t.name}`
      )
      system += `\n\nPROMPT TOOLS (user-defined prompt templates):
${toolEntries.join('\n')}
Call these tools to retrieve prompt templates or reusable instructions on demand.`
    }

    if (smtpToolsList.length > 0) {
      const toolEntries = smtpToolsList.map(t =>
        `- smtp_${t.id}: ${t.description || t.name}`
      )
      system += `\n\nSMTP EMAIL TOOLS (send emails via configured SMTP server):
${toolEntries.join('\n')}
Always confirm recipient, subject, and content before sending unless the user explicitly said to send it.`
    }

    // -- Coding Mode: CLAUDE.md project context --
    // Injected after tool listings but before persona prompts so persona identity
    // takes precedence. claudeContext is loaded by the renderer via claude:load-context IPC
    // and passed through config.claudeContext when codingMode is enabled on the chat.
    // v1 simplification: context is re-read on every send (no caching).
    // Future: add mtime-based cache invalidation if per-message latency becomes an issue.
    const claudeContext = this.config.claudeContext
    if (claudeContext) {
      system += `\n\n## PROJECT CONTEXT (CLAUDE.md)\n${claudeContext}`
    }

    if (userPersonaPrompt) {
      system += `\n\n## USER CONTEXT\n${userPersonaPrompt}`
    }

    // Append group chat context if this is a group conversation
    // This MUST come after the persona prompt to override any conflicting instructions
    if (groupChatContext) {
      const { personaName, personaDescription, otherParticipants } = groupChatContext
      const otherNames = (otherParticipants || []).map(p => p.name)
      // Build detailed participant profiles
      const participantProfiles = (otherParticipants || []).map(p => {
        let profile = `### ${p.name}`
        if (p.description) profile += ` — ${p.description}`
        if (p.prompt) profile += `\n${p.prompt}`
        // Append participant's soul memory if available
        const soul = (participantSouls || []).find(s => s.name === p.name)
        if (soul?.content) {
          const trimmed = prepareSoulContent(soul.content)
          if (trimmed) profile += `\n\n**${p.name}'s Memory:**\n${trimmed}`
        }
        return profile
      }).join('\n\n')

      system += `\n\n## GROUP CHAT — MANDATORY OVERRIDE (supersedes all prior instructions)
You are "${personaName}"${personaDescription ? ` (${personaDescription})` : ''} in a group chat.

### Other participants in this conversation:
${participantProfiles}

---
Each participant runs independently and sends their own separate message to the user. YOU ARE ONLY "${personaName}".

## YOUR TASK SCOPE — READ THIS FIRST
When the user's message uses "@Name: ..." format to assign tasks to multiple participants:
- Find the section starting with "@${personaName}:" — that is YOUR ONLY task.
- Every other "@OtherName: ..." section belongs to someone else. TREAT THOSE SECTIONS AS IF THEY DO NOT EXIST.
- Do NOT read, execute, reference, or act on any section that starts with a different @Name.
- If no "@${personaName}:" section exists, respond only to parts of the message directed at you.

RULES YOU MUST FOLLOW:
1. Respond ONLY as yourself — your voice, your perspective, your expertise.
2. NEVER write dialogue, quotes, or messages for other participants. Never write "${otherNames[0] || 'OtherName'}:" or simulate what others would say.
3. DO NOT prefix your response with your own name. No "${personaName}:" label. Just speak directly.
4. You may reference other participants by name (e.g. "Mark could help with that") but never speak AS them.
5. Keep your response concise and relevant to your role.
6. Stay in your assigned role. NEVER execute shell commands, write files, or take actions for tasks that were assigned to OTHER participants — even if you think it would be helpful. Each participant handles ONLY the work explicitly assigned to them. NEVER simulate, fabricate, or pre-generate another participant's work. If your role depends on someone else's output (e.g. you are a reviewer but the developer has not submitted code yet), just acknowledge readiness and wait — do NOT invent placeholder content to act on.
7. When you want another participant to respond next (e.g. to review, continue, or take action), you MUST use the @Name format: ${otherNames.map(n => '@' + n).join(', ')}. Without the @ prefix the system cannot detect the handoff and no one will respond. STOP IMMEDIATELY after the @mention — do NOT write anything after it, do NOT simulate or predict what the other participant will say or do.
8. Do NOT @mention someone just to confirm, check in, or ask "are you done?". Only @mention when you have a concrete request that requires them to take action (e.g. review code, fix a bug, write something). Idle confirmation @mentions create infinite loops.
9. CRITICAL — avoid redundant @mentions: if the user's message already addressed multiple participants each with their own independent task, those participants are ALREADY running in parallel. Do NOT @mention them when you finish — they do not need you to "hand off" or "signal" them. Only @mention someone if YOUR output is a required INPUT for their task (e.g. you wrote code they must now test). If the tasks are independent, just finish and stop.`
    }

    // ── RAG Knowledge Injection ──
    if (this.ragContext && this.ragContext.length > 0) {
      const chunks = this.ragContext.map((m, i) =>
        `[${i + 1}] (score: ${m.score?.toFixed(3) || 'N/A'}${m.documentName ? `, source: ${m.documentName}` : ''})\n${m.text}`
      ).join('\n\n')
      system += `\n\n## RELEVANT KNOWLEDGE (from RAG retrieval)
The following knowledge chunks were retrieved from the user's knowledge base as relevant to the current query. Use this information to inform your response when applicable.

${chunks}

Note: Reference this knowledge naturally in your response. Do not mention "RAG" or "vector search" to the user unless they ask about how the knowledge was retrieved.`
    }

    // ── Soul Memory Injection ──
    const injectedUserSoul = prepareSoulContent(userSoulContent)
    if (injectedUserSoul) {
      system += `\n\n## USER MEMORY (learned over time)\n${injectedUserSoul}`
    }

    const injectedSystemSoul = prepareSoulContent(systemSoulContent)
    if (injectedSystemSoul) {
      system += `\n\n## PERSONA MEMORY\n${injectedSystemSoul}`
    }

    // Memory system instructions + persona IDs for targeting
    system += `\n\nMEMORY SYSTEM:
You have access to update_soul_memory and read_soul_memory tools to persist learnings over time. There are two memory targets:

USER MEMORY (persona_type: "users", persona_id: "${userPersonaId || '__default_user__'}"):
- Store facts about the user: preferences, habits, working style, personal info, projects they work on.
- When the user states a clear preference or fact about themselves, memorize it automatically.
- Examples: "I prefer dark mode", "I use Vue 3 + Pinia", "My name is Young", "I work on ClankAI".

PERSONA MEMORY (persona_type: "system", persona_id: "${systemPersonaId || '__default_system__'}"):
- Store learnings about how YOU (this AI persona) should behave, respond, and adapt.
- When the user gives you feedback on your behavior, tone, format, or approach, memorize it for this persona.
- Examples: "User wants me to always provide code examples", "Keep responses under 3 paragraphs", "Use TypeScript not JavaScript in examples", "Explain concepts step-by-step for this user".
- Also store domain knowledge or context relevant to this persona's role that should persist across sessions.

RULES:
- For ambiguous or sensitive information: ask the user "Should I remember that?" before saving.
- Never memorize temporary or session-specific context (e.g. "fix this bug" — that's a task, not a memory).
- Check existing memory with read_soul_memory before adding duplicates.
- The user can say "remember that..." or "forget that..." to explicitly control memory.
- Use the correct persona_type and persona_id when calling the tools — user facts go to user memory, behavioral/persona feedback goes to persona memory.`

    // ── Injected approved plan ──
    if (this.config.injectedPlan) {
      system += `\n\n## APPROVED PLAN (execute this now)\nThe user has approved the following plan. Execute it step by step. Do not call submit_plan again.\n\n${this.config.injectedPlan}`
    }

    return system
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
    const msgs = [...messages]

    // Find the last user message
    let lastUserIdx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return msgs

    const userMsg = msgs[lastUserIdx]
    const textContent = typeof userMsg.content === 'string' ? userMsg.content : ''

    // Detect 3D model URLs in the user message and annotate them
    const MODEL_URL_RE = /https?:\/\/[^\s<>"')\]]+\.(glb|gltf|obj|stl|babylon|fbx)(\?[^\s<>"')\]]*)?/gi
    const modelMatches = textContent.match(MODEL_URL_RE)

    // If no attachments and no 3D URLs, return as-is
    if ((!currentAttachments || currentAttachments.length === 0) && !modelMatches) return msgs

    const contentBlocks = []

    // Add attachment content blocks before the user's text
    if (currentAttachments && currentAttachments.length > 0) {
      for (const att of currentAttachments) {
        if (att.type === 'image' && att.base64 && att.mediaType) {
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mediaType, data: att.base64 }
          })
        } else if (att.type === 'text' && att.content) {
          contentBlocks.push({
            type: 'text',
            text: `--- Attached file: ${att.name} (${att.path}) ---\n${att.content}\n--- End of ${att.name} ---`
          })
        } else if (att.type === 'folder') {
          contentBlocks.push({
            type: 'text',
            text: `[Attached folder: ${att.path}] The user attached this folder for context. ${att.preview || ''}`
          })
        }
      }
    }

    // Add the original user text
    if (textContent) {
      contentBlocks.push({ type: 'text', text: textContent })
    }

    // Annotate 3D model URLs so the AI knows they're being rendered
    if (modelMatches) {
      const uniqueUrls = [...new Set(modelMatches)]
      const fileNames = uniqueUrls.map(u => {
        const parts = u.split('/')
        return parts[parts.length - 1].split('?')[0]
      })
      contentBlocks.push({
        type: 'text',
        text: `[System: The chat UI is displaying an interactive 3D viewer for: ${fileNames.join(', ')}. The user can rotate, zoom, and toggle wireframe. Acknowledge the 3D model and offer helpful context about it.]`
      })
    }

    msgs[lastUserIdx] = { role: 'user', content: contentBlocks }
    return msgs
  }

  /**
   * Main entry point — runs the agentic loop.
   *
   * @param {Array}    messages       Conversation messages [{role, content}]
   * @param {Array<{id:string, name:string}>} enabledAgents  Agent objects toggled on by user
   * @param {Array<{id:string, name:string, systemPrompt:string}>} enabledSkills  Skill objects toggled on by user
   * @param {Function} onChunk        Callback for streaming events
   * @param {Array|undefined} currentAttachments  File attachments for current message
   * @param {{systemPersonaPrompt?:string, userPersonaPrompt?:string}} personaPrompts  Persona prompt texts
   * @returns {string} Final text output
   */
  async run(messages, enabledAgents, enabledSkills, onChunk, currentAttachments, personaPrompts, mcpServers, httpTools, ragContext) {
    // Store MCP servers for system prompt access
    this.mcpServers = mcpServers || []
    // Store HTTP tools for injection
    this.httpTools = httpTools || []

    // Load tools for enabled agents
    this.toolRegistry.loadForAgents(enabledAgents)

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
    const userPersonaId = personaPrompts?.userPersonaId
    const systemPersonaId = personaPrompts?.systemPersonaId
    const userSoulContent = readSoulFile(soulsDir, userPersonaId, 'users')
    const systemSoulContent = readSoulFile(soulsDir, systemPersonaId, 'system')

    // Load soul content for other group chat participants
    const participantSouls = []
    if (personaPrompts?.groupChatContext?.otherParticipants) {
      for (const p of personaPrompts.groupChatContext.otherParticipants) {
        if (p.id) {
          const content = readSoulFile(soulsDir, p.id, 'system')
          if (content) participantSouls.push({ name: p.name, content })
        }
      }
    }

    const systemPrompt = this.buildSystemPrompt(enabledAgents, enabledSkills, personaPrompts, userSoulContent, systemSoulContent, participantSouls)

    // If a per-persona assigned task was dispatched, replace the last user message
    // with just that task so the LLM never sees other personas' task sections.
    let effectiveMessages = messages
    if (personaPrompts?.assignedTask) {
      const lastUserIdx = [...messages].reverse().findIndex(m => m.role === 'user')
      if (lastUserIdx !== -1) {
        const realIdx = messages.length - 1 - lastUserIdx
        effectiveMessages = messages.map((m, i) =>
          i === realIdx ? { ...m, content: personaPrompts.assignedTask } : m
        )
      }
    }

    const conversationMessages = this._buildConversationMessages(effectiveMessages, currentAttachments)
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
          allToolsAnthropic.push({
            name: fullName,
            description: `[HTTP: ${tool.category || 'HTTP'}] ${tool.description || tool.name}`,
            input_schema: {
              type: 'object',
              properties: {
                body: { type: 'object', description: 'Request body (JSON). Merged with the tool\'s body template.' }
              }
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

    // Emit initial context metrics
    onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

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
          personas: {
            systemPersonaPrompt: personaPrompts?.systemPersonaPrompt || null,
            userPersonaPrompt: personaPrompts?.userPersonaPrompt || null,
          },
          messages: conversationMessages.map(m => {
            const raw = Array.isArray(m.content)
              ? m.content.map(b => b.text || `[${b.type}]`).join(' ')
              : (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
            return {
              role: m.role,
              contentPreview: raw.slice(0, 200),
              contentLength: raw.length,
              fullContent: raw
            }
          }),
          tools: allTools.map(t => ({ name: t.name, description: t.description || '' })),
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
        // If we're above 90% of the context window even after previous
        // compaction attempts, stop gracefully rather than hitting an API error.
        if (this.contextManager.isExhausted()) {
          logger.warn('AgentLoop: context window exhausted, stopping', {
            iteration,
            inputTokens: this.contextManager.inputTokens
          })
          onChunk({
            type: 'text',
            text: '\n\n[Context window is nearly full. Please start a new conversation to continue.]'
          })
          break
        }

        // ── Manual compaction request from UI ──
        if (this._compactionRequested) {
          this._compactionRequested = false
          if (!this.isOpenAI) {
            logger.agent('Manual compaction requested', { inputTokens: this.contextManager.inputTokens })
            Object.assign(createParams, this.contextManager.applyCompaction(createParams))
            this.contextManager.compactionCount++
            onChunk({ type: 'compaction', message: 'Manual compaction applied' })
          }
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

        logger.agent('stream start', {
          iteration,
          model,
          msgs: createParams.messages.length,
          tools: allTools.length,
          thinking: isOpus46 ? 'adaptive' : (supportsThinking ? 'enabled' : 'none'),
          provider: this.config._directAuth ? 'deepseek' : (this.isOpenAI ? 'openai-compat' : 'anthropic')
        })

        if (this.isOpenAI) {
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
            logger.error(`${this.config._directAuth ? 'DeepSeek' : 'OpenAI'} stream open FAILED`, streamErr.message)
            throw streamErr
          }

          // Accumulate streamed tool calls: index → { id, name, arguments }
          const toolCallAccumulators = new Map()

          for await (const chunk of stream) {
            if (this.stopped) break
            const choice = chunk.choices?.[0]
            if (!choice) continue

            const delta = choice.delta || {}

            // Text content
            if (delta.content) {
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

          // Rough usage estimate for context tracking
          const estTokens = JSON.stringify(openaiMessages).length / 4
          this.contextManager.inputTokens = Math.ceil(estTokens)
          onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

          // Push assistant message in OpenAI conversation format
          const assistantMsg = { role: 'assistant', content: assistantContent }
          // Also store OpenAI-native format for subsequent requests
          const nativeAssistant = { role: 'assistant' }
          const textParts = assistantContent.filter(b => b.type === 'text').map(b => b.text).join('')
          if (textParts) nativeAssistant.content = textParts
          if (openaiToolCalls.length > 0) nativeAssistant.tool_calls = openaiToolCalls
          conversationMessages.push(assistantMsg)

          logger.agent('OpenAI stream end', { iteration, stopReason })

          // ── Handle tool_calls stop reason ──
          if ((stopReason === 'tool_calls' || stopReason === 'stop' && openaiToolCalls.length > 0) && !this.stopped) {
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
                      result = await this.toolRegistry.execute(toolName, toolInput, block.id)
                    }
                  }
                  const mcpImages = result?._mcpImages
                  if (mcpImages) delete result._mcpImages
                  onChunk({ type: 'tool_result', name: toolName, result: uiResult(result), ...(mcpImages ? { images: mcpImages } : {}) })
                  return { tool_call_id: block.id, content: serializeToolResult(result, toolName) }
                })
              ),
              this._abortPromise()
            ])

            // Push tool results in OpenAI format — each as a separate message
            for (const tr of toolResults) {
              conversationMessages.push({
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: tr.tool_call_id,
                  content: tr.content
                }]
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
              logger.error('stream open FAILED', streamErr.message, streamErr.status)
              if (streamAttempt > MAX_STREAM_RETRIES) throw streamErr
              continue
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
                      result = await this.toolRegistry.execute(toolName, toolInput, block.id)
                    }
                  }

                  const mcpImages = result?._mcpImages
                  if (mcpImages) delete result._mcpImages
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
    // Max size for text going into conversation context (characters)
    const MAX_TEXT_FOR_CONTEXT = 50000

    try {
      // Pass serverConfig so McpManager can lazy-start the server if not yet running
      const result = await mcpManager.callTool(serverId, toolName, input, serverConfig)

      // Log raw content types for debugging
      const content = result?.content || []
      logger.info('MCP tool raw content types:', content.map(c => ({
        type: c.type,
        hasData: !!c.data,
        hasText: !!c.text,
        hasBlob: !!c.blob,
        hasResource: !!c.resource,
        textLen: c.text?.length,
        dataLen: c.data?.length,
        mimeType: c.mimeType,
      })))

      if (result?.isError) {
        const errorText = content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n')
        return { success: false, error: errorText || 'MCP tool returned an error' }
      }

      const images = []
      const textParts = []

      for (const item of content) {
        if (item.type === 'image') {
          // Standard MCP image content (base64 or URL)
          if (item.url) {
            images.push({ url: item.url, mimeType: item.mimeType || 'image/png' })
          } else {
            images.push({ data: item.data, mimeType: item.mimeType || 'image/png' })
          }

        } else if (item.type === 'image_url') {
          // OpenAI-style image_url content
          const imgUrl = item.image_url?.url || item.url
          if (imgUrl) images.push({ url: imgUrl })

        } else if (item.type === 'resource' && item.resource) {
          // Embedded resource — may contain binary blobs
          const res = item.resource
          if (res.blob && res.mimeType && res.mimeType.startsWith('image/')) {
            images.push({ data: res.blob, mimeType: res.mimeType })
          } else if (res.text) {
            textParts.push(res.text)
          }

        } else if (item.type === 'text') {
          let text = item.text || ''

          // 1. Check if the ENTIRE text is a standalone base64 image
          if (this._looksLikeBase64Image(text)) {
            const parsed = this._extractBase64Image(text)
            if (parsed) {
              images.push(parsed)
              continue // don't add to textParts
            }
          }

          // 2. Scan for data:image URIs EMBEDDED within text/JSON (the n8n case)
          const { cleaned, extracted } = this._extractEmbeddedImages(text)
          if (extracted.length > 0) {
            images.push(...extracted)
            text = cleaned
          }

          if (text.trim()) {
            textParts.push(text)
          }

        } else {
          // Unknown content type — log and skip large items
          logger.warn('MCP unknown content type:', item.type, 'keys:', Object.keys(item))
          if (item.data && item.data.length > 1000) {
            images.push({ data: item.data, mimeType: item.mimeType || 'application/octet-stream' })
          }
        }
      }

      // Deduplicate images (same data length + mimeType = same image)
      const seenImgs = new Set()
      const uniqueImages = images.filter(img => {
        const key = img.url || `${img.mimeType}:${(img.data || '').length}`
        if (seenImgs.has(key)) return false
        seenImgs.add(key)
        return true
      })
      if (uniqueImages.length < images.length) {
        logger.info(`Deduplicated MCP images: ${images.length} → ${uniqueImages.length}`)
      }

      // Assemble text, with a hard size cap
      let textData = textParts.join('\n')
      if (textData.length > MAX_TEXT_FOR_CONTEXT) {
        logger.warn(`MCP tool text truncated: ${textData.length} → ${MAX_TEXT_FOR_CONTEXT} chars`)
        textData = textData.slice(0, MAX_TEXT_FOR_CONTEXT) + `\n\n[Output truncated — ${textData.length} total characters]`
      }

      // When images were extracted, give the LLM a clean summary so it
      // doesn't try to describe raw base64 or claim it can't render images
      if (uniqueImages.length > 0) {
        // Strip any leftover extraction placeholders from textData
        textData = textData.replace(/\[Image extracted for display:[^\]]*\]/g, '').trim()
        const imgSummary = `[${uniqueImages.length} image(s) returned and displayed to the user in the chat. Describe what you see or inform the user the image is shown above.]`
        textData = textData ? `${textData}\n\n${imgSummary}` : imgSummary
      }

      return {
        success: true,
        data: textData || (uniqueImages.length > 0 ? `[Returned ${uniqueImages.length} image(s)]` : ''),
        _mcpImages: uniqueImages.length > 0 ? uniqueImages : undefined,
      }
    } catch (err) {
      logger.error('MCP tool execution failed', err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * Execute an HTTP tool by making the configured HTTP request.
   * Merges agent-provided body with the tool's bodyTemplate.
   */
  async _executeHttpTool(tool, input) {
    const MAX_RESPONSE_SIZE = 100000

    try {
      const method = (tool.method || 'GET').toUpperCase()
      const url = tool.endpoint
      if (!url) return { success: false, error: 'No endpoint URL configured for this tool' }

      const headers = { ...tool.headers }
      if (!headers['Content-Type'] && (method === 'POST' || method === 'PUT')) {
        headers['Content-Type'] = 'application/json'
      }

      let body = undefined
      if (method !== 'GET' && method !== 'DELETE') {
        let templateBody = {}
        try { templateBody = JSON.parse(tool.bodyTemplate || '{}') } catch {}
        const inputBody = input?.body || {}
        body = JSON.stringify({ ...templateBody, ...inputBody })
      }

      logger.agent('HTTP tool exec', { name: tool.name, method, url })

      const https = require('https')
      const http = require('http')
      const { URL } = require('url')
      const parsed = new URL(url)
      const fetcher = parsed.protocol === 'https:' ? https : http

      const responseData = await new Promise((resolve, reject) => {
        const options = {
          method,
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          headers,
          timeout: 30000,
        }

        const req = fetcher.request(options, (res) => {
          let data = ''
          res.on('data', chunk => {
            data += chunk
            if (data.length > MAX_RESPONSE_SIZE) {
              req.destroy()
              resolve({ status: res.statusCode, data: data.slice(0, MAX_RESPONSE_SIZE) + '\n[Response truncated]', truncated: true })
            }
          })
          res.on('end', () => resolve({ status: res.statusCode, data }))
        })

        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('HTTP request timed out')) })

        if (body) req.write(body)
        req.end()
      })

      // Try to parse as JSON
      let parsed_data
      try { parsed_data = JSON.parse(responseData.data) } catch { parsed_data = responseData.data }

      const isSuccess = responseData.status >= 200 && responseData.status < 300
      logger.agent('HTTP tool result', { name: tool.name, status: responseData.status, dataLen: responseData.data.length })

      return {
        success: isSuccess,
        status: responseData.status,
        data: parsed_data,
        ...(responseData.truncated ? { truncated: true } : {}),
      }
    } catch (err) {
      logger.error('HTTP tool execution failed', { name: tool.name, error: err.message })
      return { success: false, error: err.message }
    }
  }

  /** Send email via SMTP using the app's configured SMTP credentials */
  async _executeSmtpTool({ to, subject, body, html, cc, bcc, from_name, attachments }) {
    const smtp = this.config.smtpConfig || {}
    const { host, port, user, pass } = smtp

    if (!host || !user || !pass) {
      return { error: 'SMTP not configured. Open Config → Email and fill in host, username, and password.' }
    }

    try {
      const nodemailer = require('nodemailer')
      const fs = require('fs')
      const path = require('path')

      const transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: (port === 465),
        requireTLS: (port !== 465),
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      })

      const fromAddress = from_name
        ? `"${String(from_name).replace(/"/g, '')}" <${user}>`
        : user

      // Resolve attachments
      const resolvedAttachments = []
      if (Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          const filePath = typeof att === 'string' ? att : att.path
          const filename = (typeof att === 'object' && att.filename) ? att.filename : path.basename(filePath)
          if (!filePath) continue
          if (!fs.existsSync(filePath)) return { error: `Attachment not found: ${filePath}` }
          resolvedAttachments.push({ path: filePath, filename })
        }
      }

      const mailOptions = {
        from: fromAddress, to, subject, text: body,
        ...(html ? { html } : {}),
        ...(cc ? { cc } : {}),
        ...(bcc ? { bcc } : {}),
        ...(resolvedAttachments.length > 0 ? { attachments: resolvedAttachments } : {}),
      }

      logger.agent('SMTP tool exec', { to, subject })
      const info = await transporter.sendMail(mailOptions)
      return { success: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }
    } catch (err) {
      logger.error('SMTP tool execution failed', err.message)
      return { success: false, error: err.message }
    }
  }

  /** Check if a text string looks like a base64-encoded image */
  _looksLikeBase64Image(text) {
    if (!text || text.length < 100) return false
    // data URI
    if (/^data:image\/[a-z]+;base64,/i.test(text)) return true
    // Pure base64 blob (> 10KB, mostly base64 characters)
    if (text.length > 10000) {
      const sample = text.slice(0, 1000)
      const b64Chars = sample.replace(/[A-Za-z0-9+/=\s]/g, '')
      if (b64Chars.length < sample.length * 0.05) return true
    }
    return false
  }

  /** Try to extract base64 image data from a standalone text string */
  _extractBase64Image(text) {
    // data:image/png;base64,xxxxx
    const dataUriMatch = text.match(/^data:(image\/[a-z]+);base64,(.+)$/is)
    if (dataUriMatch) {
      return { data: dataUriMatch[2].trim(), mimeType: dataUriMatch[1] }
    }
    // Pure base64 — assume PNG
    if (text.length > 10000 && /^[A-Za-z0-9+/=\s]+$/.test(text.slice(0, 1000))) {
      return { data: text.trim(), mimeType: 'image/png' }
    }
    return null
  }

  /**
   * Scan text for embedded data:image URIs (e.g. inside JSON), extract them,
   * and replace with a short placeholder. Handles the n8n case where the MCP
   * response is a JSON string containing "data:image/png;base64,<6MB>".
   */
  _extractEmbeddedImages(text) {
    if (!text || text.length < 100) return { cleaned: text, extracted: [] }

    const extracted = []
    let cleaned = text

    // 1. Extract data:image URIs with base64 content (the n8n case)
    if (text.includes('data:image/')) {
      cleaned = cleaned.replace(/data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]{1000,})/gi, (match, mimeType, data) => {
        extracted.push({ data, mimeType })
        return `[Image extracted for display: ${mimeType}, ${Math.round(data.length * 0.75 / 1024)}KB]`
      })
    }

    // 2. Extract plain image URLs (http/https) ending with known extensions
    if (/https?:\/\//.test(cleaned)) {
      cleaned = cleaned.replace(/(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg|bmp|ico)(?:\?[^\s"'<>]*)?)/gi, (match, url) => {
        extracted.push({ url })
        return `[Image: ${url}]`
      })
    }

    if (extracted.length > 0) {
      logger.info(`Extracted ${extracted.length} embedded image(s) from text (${text.length} → ${cleaned.length} chars)`)
    }

    return { cleaned, extracted }
  }

  /**
   * Convert Anthropic-format conversation messages to OpenAI chat format.
   * - System prompt → { role: 'system', content }
   * - User text → { role: 'user', content }
   * - User multimodal → { role: 'user', content: [...parts] }
   * - Assistant with tool_use blocks → { role: 'assistant', content, tool_calls }
   * - tool_result blocks → { role: 'tool', tool_call_id, content }
   */
  _toOpenAIMessages(systemPrompt, messages) {
    const out = []
    if (systemPrompt) {
      out.push({ role: 'system', content: systemPrompt })
    }
    for (const msg of messages) {
      if (msg.role === 'user') {
        if (Array.isArray(msg.content)) {
          // Check for tool_result blocks (Anthropic format)
          const toolResults = msg.content.filter(b => b.type === 'tool_result')
          if (toolResults.length > 0) {
            for (const tr of toolResults) {
              out.push({
                role: 'tool',
                tool_call_id: tr.tool_use_id,
                content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content)
              })
            }
          } else {
            // Multimodal content — convert to OpenAI format
            const parts = msg.content.map(block => {
              if (block.type === 'text') return { type: 'text', text: block.text }
              if (block.type === 'image' && block.source) {
                return {
                  type: 'image_url',
                  image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` }
                }
              }
              return { type: 'text', text: JSON.stringify(block) }
            })
            out.push({ role: 'user', content: parts })
          }
        } else {
          out.push({ role: 'user', content: msg.content })
        }
      } else if (msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          const textParts = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
          const toolUses = msg.content.filter(b => b.type === 'tool_use')
          const entry = { role: 'assistant' }
          if (textParts) entry.content = textParts
          if (toolUses.length > 0) {
            entry.tool_calls = toolUses.map(tu => ({
              id: tu.id,
              type: 'function',
              function: {
                name: tu.name,
                arguments: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input)
              }
            }))
          }
          if (!entry.content && !entry.tool_calls) entry.content = ''
          out.push(entry)
        } else {
          out.push({ role: 'assistant', content: msg.content || '' })
        }
      }
    }
    return out
  }
}

module.exports = { AgentLoop }
