/**
 * AgentLoop — enterprise-grade agentic loop using the Anthropic SDK.
 *
 * Features:
 *  - Streaming responses with real-time text + thinking deltas
 *  - Adaptive thinking (Opus 4.6) or budget-based thinking (older models)
 *  - Tool use with automatic dispatch and result handling
 *  - Sub-agent delegation for parallel/focused subtasks
 *  - Background task management
 *  - Context window tracking with compaction (Opus 4.6 beta)
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
      permissionGate: {
        globalMode: sandboxCfg.defaultMode || 'sandbox',
        chatMode: config.chatPermissionMode || 'inherit',
        sandboxAllowList: (sandboxCfg.sandboxAllowList || []).map(e => e.pattern),
        chatAllowList: (config.chatAllowList || []).map(e => e.pattern),
        dangerBlockList: effectiveDangerList.map(e => e.pattern),
      }
    })
  }

  stop() {
    this.stopped = true
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
   * For Opus 4.6: uses the beta compaction API.
   * For other models: falls back to local message trimming.
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
    const isOpus46 = this.anthropicClient.isOpus46()

    // Non-Opus: local trim
    if (!isOpus46) {
      const estimatedTokens = JSON.stringify(conversationMessages).length / 4
      const trimmed = this.contextManager.localTrim(conversationMessages, estimatedTokens)
      this.contextManager.compactionCount++
      const metrics = this.contextManager.getMetrics()
      onChunk({ type: 'context_update', metrics })
      return { assistantContent: '[Older messages trimmed to fit context window]', metrics }
    }

    // Opus 4.6: API compaction
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
  buildSystemPrompt(enabledAgents, enabledSkills, { systemPersonaPrompt, userPersonaPrompt, systemPersonaId, userPersonaId, groupChatContext } = {}, userSoulContent, systemSoulContent, participantSouls) {
    const basePrompt = (this.config.systemPrompt || '').trim()
      || 'You are SparkAI, a versatile AI assistant running in a desktop application. You help users with a wide range of tasks including research, writing, analysis, coding, creative work, file management, and general knowledge.'

    let system = `${basePrompt}

CORE TOOLS (always available):
- execute_shell: Run shell commands (command + args separated, e.g. command:"ls" args:["/home"])
- file_operation: Read, write, list, append, search, mkdir, delete files on the filesystem
- todo_manager: Plan complex tasks with structured todo lists
- dispatch_subagent: Delegate focused subtasks to specialized sub-agents
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

    // ── SparkAI Data Directory ──
    const dataPath = process.env.SPARKAI_DATA_PATH || path.join(require('os').homedir(), '.sparkai')
    const artyfactPath = this.config.chatWorkingPath || process.env.ARTYFACT_PATH || this.config.artyfactPath || path.join(dataPath, 'artyfact')
    system += `\n\nSPARKAI DATA DIRECTORY: ${dataPath}
This is the local data folder for the SparkAI desktop application. Its structure:
  ${dataPath}/
  ├── config.json          — App settings (API keys, models, providers, dataPath)
  ├── mcp-servers.json     — MCP server definitions (array of {id, name, command, args, env, description})
  ├── tools.json           — HTTP tool definitions ({categories: {catName: {tools: [{id, name, method, endpoint, headers, bodyTemplate, description}]}}})
  ├── personas.json        — AI persona definitions
  ├── knowledge.json       — RAG/Pinecone knowledge config
  ├── chats/               — Per-chat message history
  ├── souls/               — Persistent memory files (system/, users/)
  └── artyfact/            — AI-generated artifacts (see below)

ARTIFACT PATH: ${artyfactPath}
This is the default directory for ALL artifacts you create during chats. Whenever you generate files such as markdown documents, reports, temp files, exported docs, code snippets, or any other output files — ALWAYS write them to this directory (create subdirectories as needed). The directory will be auto-created on first write. Use descriptive filenames and organize by type when appropriate (e.g. ${artyfactPath}/docs/, ${artyfactPath}/exports/).

When the user asks you to create or configure MCP servers, HTTP tools, personas, or other settings:
- You understand the file formats above and can guide the user to create proper entries.
- For MCP servers: each entry needs {id (uuid), name, command, args (array), env (object), description}. After creation, the user can click Refresh on the MCP page to see updates.
- For HTTP tools: each tool lives under a category in tools.json. After creation, the user can click Refresh on the Tools page to see updates.
- Always confirm with the user before modifying these files directly.`

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
2. Artifact docs: ${artyfactPath}/docs/
Then write the file to the chosen location. For non-.md files, continue using the artifact path as default.`
    }

    system += `\n\nGUIDELINES:
- Be concise and precise. Explain your reasoning when using tools.
- For complex multi-step tasks, ALWAYS create a todo list first using todo_manager.
- When a subtask is independent and focused, delegate it to a sub-agent.
- For long-running commands (builds, test suites), use background_task.
- When asked about your capabilities or tools, report the core tools and any active skills listed above.
- Always report progress on large tasks.
- The chat UI has a built-in 3D viewer that automatically renders 3D model URLs (.glb, .gltf, .obj, .stl, .babylon, .fbx). When the user shares a 3D asset URL, acknowledge it — the viewer is already displaying it inline. You can discuss the model, suggest interactions (rotate, zoom, wireframe toggle), or help with 3D-related questions.`

    // Append MCP server info if any are enabled
    const mcpServers = this.mcpServers || []
    if (mcpServers.length > 0) {
      const mcpEntries = mcpServers.map(s =>
        `- ${s.name}: ${s.description || 'No description'} (${s.command} ${(s.args || []).join(' ')})`
      )
      system += `\n\nMCP SERVERS (external integrations — tools discovered dynamically):
${mcpEntries.join('\n')}
Use MCP tools when the user's request involves external services or integrations.`
    }

    // Append user-defined tools info if any are enabled
    const allUserTools = this.httpTools || []
    const httpToolsList = allUserTools.filter(t => (t.type || 'http') === 'http')
    const codeToolsList = allUserTools.filter(t => t.type === 'code')
    const promptToolsList = allUserTools.filter(t => t.type === 'prompt')

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

    // Append persona context if provided
    if (systemPersonaPrompt) {
      system += `\n\n## SYSTEM PERSONA\n${systemPersonaPrompt}`
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

RULES YOU MUST FOLLOW:
1. Respond ONLY as yourself — your voice, your perspective, your expertise.
2. NEVER write dialogue, quotes, or messages for other participants. Never write "${otherNames[0] || 'OtherName'}:" or simulate what others would say.
3. DO NOT prefix your response with your own name. No "${personaName}:" label. Just speak directly.
4. You may reference other participants by name (e.g. "Mark could help with that") but never speak AS them.
5. Keep your response concise and relevant to your role.
6. Stay in your assigned role. If the user designated you as a developer, only write and fix code — do not review or critique other participants' code. If you are a reviewer, only review — do not write fixes. Respect the division of labor the user set up. NEVER simulate, fabricate, or pre-generate another participant's work. If your role depends on someone else's output (e.g. you are a reviewer but the developer has not submitted code yet), just acknowledge readiness and wait — do NOT invent placeholder content to act on.
7. When you want another participant to respond next (e.g. to review, continue, or take action), you MUST use the @Name format: ${otherNames.map(n => '@' + n).join(', ')}. Without the @ prefix the system cannot detect the handoff and no one will respond.
8. Do NOT @mention someone just to confirm, check in, or ask "are you done?". Only @mention when you have a concrete request that requires them to take action (e.g. review code, fix a bug, write something). Idle confirmation @mentions create infinite loops.`
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
- Examples: "I prefer dark mode", "I use Vue 3 + Pinia", "My name is Young", "I work on SparkAI".

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
    const conversationMessages = this._buildConversationMessages(messages, currentAttachments)
    let finalText = ''

    // Gather all tool definitions: registry + subagent + background tasks
    const allToolsAnthropic = [
      ...this.toolRegistry.getToolDefinitions(),
      this.subAgentManager.getToolDefinition(),
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

    // Inject MCP tools from configured servers (dynamic discovery via subprocess)
    const mcpToolMap = new Map() // toolName → { serverId, serverName, tool }
    if (this.mcpServers.length > 0) {
      try {
        const discoveredTools = await mcpManager.getToolsForServers(this.mcpServers)
        for (const { serverId, serverName, tool } of discoveredTools) {
          const fullName = `mcp_${serverId.slice(0, 8)}_${tool.name}`
          mcpToolMap.set(fullName, { serverId, serverName, tool })
          allToolsAnthropic.push({
            name: fullName,
            description: `[MCP: ${serverName}] ${tool.description || tool.name}`,
            input_schema: tool.inputSchema || { type: 'object', properties: {} }
          })
        }
        logger.agent('MCP tools discovered', { count: discoveredTools.length })
      } catch (err) {
        logger.error('MCP tool discovery failed', err.message)
      }
    }

    // Inject user-defined tools from catalog (HTTP, Code, Prompt)
    const httpToolMap = new Map()   // toolName → tool config
    const codeToolMap = new Map()   // toolName → tool config
    const promptToolMap = new Map() // toolName → tool config

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
      const counts = { http: httpToolMap.size, code: codeToolMap.size, prompt: promptToolMap.size }
      logger.agent('User tools injected', counts)
    }

    // Convert tools to the correct format for the provider
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

    const client = this.anthropicClient.getClient()
    const model  = this.anthropicClient.resolveModel()
    const isOpus46 = this.anthropicClient.isOpus46()
    const supportsThinking = this.anthropicClient.supportsThinking()

    // Emit initial context metrics
    onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

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
        const createParams = {
          model,
          max_tokens: 16384,
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
          if (isOpus46) {
            logger.agent('Manual compaction requested', { inputTokens: this.contextManager.inputTokens })
            Object.assign(createParams, this.contextManager.applyCompaction(createParams))
            this.contextManager.compactionCount++
            onChunk({ type: 'compaction', message: 'Manual compaction applied' })
          }
        }

        // ── Compaction (Opus 4.6 only, when context is large) ──
        if (isOpus46 && this.contextManager.shouldCompact()) {
          logger.agent('Applying compaction', { inputTokens: this.contextManager.inputTokens })
          Object.assign(createParams, this.contextManager.applyCompaction(createParams))
          this.contextManager.compactionCount++
          onChunk({ type: 'compaction', message: 'Context compacted to fit window' })
        }

        // ── Context trimming for non-Opus models ──
        if (!isOpus46 && this.contextManager.shouldCompact()) {
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
          isOpenAI: this.isOpenAI
        })

        if (this.isOpenAI) {
          // ── OpenAI-format streaming ──
          const openaiMessages = this._toOpenAIMessages(systemPrompt, conversationMessages)
          const openaiParams = {
            model,
            max_tokens: 16384,
            messages: openaiMessages,
            stream: true,
          }
          if (allTools.length > 0) openaiParams.tools = allTools

          let stream
          try {
            stream = await client.chat.completions.create(openaiParams)
          } catch (streamErr) {
            logger.error('OpenAI stream open FAILED', streamErr.message)
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
            const toolResults = []

            for (const block of assistantContent) {
              if (block.type !== 'tool_use') continue
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
              } else if (toolName === 'background_task') {
                result = await this.taskManager.execute(toolInput)
              } else if (mcpToolMap.has(toolName)) {
                // Permission check for MCP tools
                const permCheckMcp = await this._checkPermission(toolName, toolInput, onChunk)
                if (permCheckMcp.decision === 'block' || permCheckMcp.decision === 'reject') {
                  result = permCheckMcp.result
                } else {
                  const { serverId, tool } = mcpToolMap.get(toolName)
                  result = await this._executeMcpToolViaManager(serverId, tool.name, toolInput)
                }
              } else if (httpToolMap.has(toolName)) {
                result = await this._executeHttpTool(httpToolMap.get(toolName), toolInput)
              } else if (codeToolMap.has(toolName)) {
                const codeTool = codeToolMap.get(toolName)
                result = { success: true, data: 'This is a reference code snippet. Use execute_shell to run similar code.', code: codeTool.code, language: codeTool.language || 'javascript' }
              } else if (promptToolMap.has(toolName)) {
                const promptTool = promptToolMap.get(toolName)
                result = { success: true, data: promptTool.promptText || '' }
              } else if (toolName === 'submit_plan') {
                onChunk({ type: 'plan_submitted', plan: toolInput })
                result = { success: true, status: 'awaiting_approval' }
                toolResults.push({ tool_call_id: block.id, content: JSON.stringify(result) })
                this._planPending = true
                continue
              } else {
                // Permission check for execute_shell and file_operation (write/append/delete/mkdir)
                const permCheck = await this._checkPermission(toolName, toolInput, onChunk)
                if (permCheck.decision === 'block' || permCheck.decision === 'reject') {
                  result = permCheck.result
                } else {
                  result = await this.toolRegistry.execute(toolName, toolInput)
                }
              }
              // Extract MCP images before they hit conversation context
              const mcpImages = result?._mcpImages
              if (mcpImages) delete result._mcpImages
              onChunk({ type: 'tool_result', name: toolName, result, ...(mcpImages ? { images: mcpImages } : {}) })
              let serialized = JSON.stringify(result)
              // Safety cap: truncate tool results > 100KB to prevent context blowup
              if (serialized.length > 100000) {
                logger.warn(`Tool result too large (${serialized.length} chars), truncating: ${toolName}`)
                serialized = JSON.stringify({ success: result?.success, data: `[Result truncated: ${serialized.length} chars original. Check UI for full output.]` })
              }
              toolResults.push({ tool_call_id: block.id, content: serialized })
            }

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
                stream = await client.beta.messages.stream({ ...restParams, betas })
              } else {
                stream = await client.messages.stream(createParams)
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
            const toolResults = []

            for (const block of assistantContent) {
              if (block.type !== 'tool_use') continue

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
              } else if (toolName === 'background_task') {
                result = await this.taskManager.execute(toolInput)
              } else if (mcpToolMap.has(toolName)) {
                // Permission check for MCP tools
                const permCheck = await this._checkPermission(toolName, toolInput, onChunk)
                if (permCheck.decision === 'block' || permCheck.decision === 'reject') {
                  result = permCheck.result
                } else {
                  const { serverId, tool } = mcpToolMap.get(toolName)
                  result = await this._executeMcpToolViaManager(serverId, tool.name, toolInput)
                }
              } else if (httpToolMap.has(toolName)) {
                result = await this._executeHttpTool(httpToolMap.get(toolName), toolInput)
              } else if (codeToolMap.has(toolName)) {
                const codeTool = codeToolMap.get(toolName)
                result = { success: true, data: 'This is a reference code snippet. Use execute_shell to run similar code.', code: codeTool.code, language: codeTool.language || 'javascript' }
              } else if (promptToolMap.has(toolName)) {
                const promptTool = promptToolMap.get(toolName)
                result = { success: true, data: promptTool.promptText || '' }
              } else if (toolName === 'submit_plan') {
                onChunk({ type: 'plan_submitted', plan: toolInput })
                result = { success: true, status: 'awaiting_approval' }
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify(result)
                })
                this._planPending = true
                continue
              } else {
                // Permission check for execute_shell and file_operation (write/append/delete/mkdir)
                const permCheck = await this._checkPermission(toolName, toolInput, onChunk)
                if (permCheck.decision === 'block' || permCheck.decision === 'reject') {
                  result = permCheck.result
                } else {
                  result = await this.toolRegistry.execute(toolName, toolInput)
                }
              }

              // Extract MCP images before they hit conversation context
              const mcpImages = result?._mcpImages
              if (mcpImages) delete result._mcpImages
              onChunk({ type: 'tool_result', name: toolName, result, ...(mcpImages ? { images: mcpImages } : {}) })

              let serialized = JSON.stringify(result)
              // Safety cap: truncate tool results > 100KB to prevent context blowup
              if (serialized.length > 100000) {
                logger.warn(`Tool result too large (${serialized.length} chars), truncating: ${toolName}`)
                serialized = JSON.stringify({ success: result?.success, data: `[Result truncated: ${serialized.length} chars original. Check UI for full output.]` })
              }
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: serialized
              })
            }

            conversationMessages.push({ role: 'user', content: toolResults })

            // If a plan was submitted, break — wait for user approval
            if (this._planPending) {
              this._planPending = false
              break
            }

          } else {
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
      logger.error('AgentLoop.run error', err.message, err.stack?.split('\n').slice(0, 3).join(' | '))
      throw err
    }
  }

  /**
   * Execute an MCP tool via the McpManager subprocess protocol.
   * Transforms MCP content array to agent-friendly result.
   * Extracts images/binary data so they never enter conversation context.
   */
  async _executeMcpToolViaManager(serverId, toolName, input) {
    // Max size for text going into conversation context (characters)
    const MAX_TEXT_FOR_CONTEXT = 50000

    try {
      const result = await mcpManager.callTool(serverId, toolName, input)

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
