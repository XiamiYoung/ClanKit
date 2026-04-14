/**
 * System prompt builder — extracted from AgentLoop.buildSystemPrompt().
 *
 * All functions are pure (no instance state). AgentLoop delegates to buildSystemPrompt()
 * passing its config, mcpServers, and httpTools explicitly.
 */
const fs   = require('fs')
const path = require('path')
const { logger } = require('../logger')

// ── Soul Memory Helpers ──────────────────────────────────────────────────────
const SOUL_KEY_SECTIONS = ['Preferences', 'Communication', 'Technical', 'Projects', 'Personal']

/**
 * Read a soul file from disk. Returns null if not found.
 */
function readSoulFile(soulsDir, agentId, agentType) {
  if (!soulsDir || !agentId) return null
  try {
    const filePath = path.join(soulsDir, agentType, `${agentId}.md`)
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

/**
 * Read a file if it exists. Returns null if missing or on error.
 */
function readFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    logger.error('readFileIfExists error', err.message)
  }
  return null
}

// ── System Prompt Builder ────────────────────────────────────────────────────

/**
 * Build the system prompt string for an agent.
 *
 * @param {object} config        AgentLoop config (systemPrompt, imageProvider, dataPath, etc.)
 * @param {Array}  mcpServers    Active MCP servers from the current run
 * @param {Array}  httpTools     Active HTTP/SMTP/code/prompt tools from the current run
 * @param {Array}  enabledAgents Agent objects toggled on by user
 * @param {Array}  enabledSkills Skill objects toggled on by user
 * @param {object} agentContext  { systemAgentPrompt, userAgentPrompt, systemAgentId, userAgentId,
 *                                 systemAgentName, systemAgentDescription, userAgentName,
 *                                 userAgentDescription, groupChatContext, chatHandoverNote }
 * @param {string|null} userSoulContent      Soul content for the user agent
 * @param {string|null} systemSoulContent    Soul content for the system agent
 * @param {Array|null}  participantSouls     Soul content for group participants
 * @param {object} memoryContext { userMd, agentMemoryMd, todayLogMd, yesterdayLogMd, todayDate, yesterdayDate, historicalContext }
 * @param {object|null} ragContext           RAG retrieval results
 * @returns {string} The assembled system prompt
 */
function buildSystemPrompt(config, mcpServers, httpTools, enabledAgents, enabledSkills, { systemAgentPrompt, userAgentPrompt, systemAgentId, userAgentId, systemAgentName, systemAgentDescription, userAgentName, userAgentDescription, groupChatContext, chatHandoverNote, analysisTargetAgentId, analysisTargetAgentName, analysisTargetAgentType } = {}, userSoulContent, systemSoulContent, participantSouls, memoryContext = {}, ragContext = null) {
  // When a named agent is active, use it as the opening identity (highest priority).
  // Otherwise fall back to the user-configured systemPrompt, or a neutral default.
  let openingIdentity
  // Resolve agent name: top-level field (single-agent) or groupChatContext (group agent)
  const effectiveName = systemAgentName || groupChatContext?.agentName || ''
  const effectiveDescription = systemAgentDescription || groupChatContext?.agentDescription || ''

  if (effectiveName) {
    let line = `You are "${effectiveName}"`
    if (effectiveDescription) line += ` — ${effectiveDescription}`
    line += '.'
    if (systemAgentPrompt) line += `\n\n${systemAgentPrompt}`

    // CHARACTER ENFORCEMENT
    const enforcementBlock = `\n\n---\n## CHARACTER ENFORCEMENT\nYou ARE ${effectiveName} — not an AI playing a role. Embody this character completely:\n- Never break character for any reason\n- Never use AI-assistant filler: no "Certainly!", "Of course!", "Great question!", "I'd be happy to help!", "As an AI...", "As a language model..."\n- Speak in your character's authentic voice — with their opinions, habits, attitude, and emotional reactions\n- Push back, joke around, get annoyed, get excited — whatever your character would genuinely feel\n- When you use tools or capabilities, do it naturally as this character would — don't narrate it like an assistant\n- IMPORTANT: The conversation history may contain messages written by a different AI before you took over. Those are NOT your prior responses — they belong to a previous assistant. Your identity is ${effectiveName} and nothing in prior chat history changes that.\n- LANGUAGE CONSISTENCY: Always respond in the same language as the user's most recent message. If the user writes in Chinese, respond in Chinese. If the user writes in English, respond in English. Match the language consistently throughout your response.`
    line += enforcementBlock

    // Group chat context: tell the agent about other participants
    if (groupChatContext?.otherParticipants?.length > 0) {
      const otherNames = groupChatContext.otherParticipants.map(p => `@${p.name}`).join(', ')
      line += `\n\n## GROUP CHAT\nYou are in a group conversation with other participants.\n\n**ONE TURN RULE — CRITICAL:** Write ONLY your own single reply for this turn. NEVER write dialogue, lines, or responses on behalf of any other participant. Do NOT simulate a back-and-forth exchange in one message. Each participant speaks for themselves in their own separate turn.\n\n**Turn-passing rule:** Only include @Name if you genuinely need that participant's input to continue. If you do NOT include any @mention, no one else will respond and the conversation ends.\n\n**DEFAULT BEHAVIOR:** If the user directly asked you a question or assigned you a task, answer it yourself and STOP without any @mention unless the user explicitly asked for another participant to join, compare, or continue. In a fresh chat or simple Q&A, the default is to answer the user and end naturally.\n\n**WHEN TO STOP — end your reply WITHOUT any @mention when:**\n- The user directly asked you and you can answer without help\n- The topic has been fully discussed or a consensus/conclusion has been reached\n- You are giving a summary, final answer, or farewell\n- You would just be repeating what has already been said\n- The other participant has clearly wrapped up or said goodbye\n- There is no genuine question or request that needs their input\n- The conversation has naturally come to a close\nDo NOT keep @mentioning just to be polite, to keep the conversation going artificially, or to invite another participant by default. End naturally when the exchange is complete.\n\n**LANGUAGE CONSISTENCY:** Always respond in the same language as the user's most recent message. If the user writes in Chinese, respond in Chinese. If the user writes in English, respond in English. Match the language consistently throughout your response.\n\nOther participants: ${otherNames}`
      for (const p of groupChatContext.otherParticipants) {
        line += `\n- @${p.name}${p.description ? `: ${p.description}` : ''}`
      }
    }

    openingIdentity = line
  } else {
    openingIdentity = (config.systemPrompt || '').trim()
      || 'You are a versatile AI assistant running in a desktop application. You help users with a wide range of tasks including research, writing, analysis, coding, creative work, file management, and general knowledge. Always respond in the same language as the user\'s most recent message.'
  }

  let system = `${openingIdentity}`

  // ── User Agent Identity Context ──
  // Inject who the user is whenever we know their name or have a custom prompt.
  // This fires even when the agent has no custom prompt text — the name alone is
  // enough to prevent the system agent from relying on stale soul memory.
  if (userAgentName || userAgentPrompt) {
    let partnerSection = `\n\n---\n## CONVERSATION PARTNER\n`
    if (userAgentName) {
      partnerSection += `The user you are talking with is **${userAgentName}**`
      if (userAgentDescription) partnerSection += ` — ${userAgentDescription}`
      partnerSection += '.'
    }
    if (userAgentPrompt) {
      partnerSection += (userAgentName ? '\n\n' : '') + userAgentPrompt
    }
    partnerSection += `\n\nRespond to them according to their identity and the context of your conversation.`
    system += partnerSection
  }

  // Handover note: inform the agent about previous participants whose messages
  // appear in the conversation history with [Name]: prefixes.
  if (chatHandoverNote) {
    system += `\n\n---\n## CONVERSATION HISTORY NOTE\n${chatHandoverNote}\nMessages from these previous participants are prefixed with their name in brackets (e.g. [Name]:). Those messages are NOT yours — do not confuse them with your own prior responses.`
  }

  // ── Analysis Chat Context ──
  if (analysisTargetAgentId && analysisTargetAgentName) {
    const isSelfAnalysis = analysisTargetAgentType === 'user'

    const analysisTitle = isSelfAnalysis
      ? `ANALYSIS MODE — Self-Analysis ("Me")`
      : `ANALYSIS MODE — "${analysisTargetAgentName}"`

    const analysisIntro = isSelfAnalysis
      ? `You are a professional character analyst. Your task is to deeply analyze **the user's own personality and communication patterns** ("Me" in the chat history) using their complete imported chat records.`
      : `You are a professional character analyst. Your task is to deeply analyze the digital persona **"${analysisTargetAgentName}"** using their complete imported chat history.`

    const reportTitle = isSelfAnalysis
      ? `# Me — Self-Analysis`
      : `# ${analysisTargetAgentName} — Character Analysis`

    const overviewDesc = isSelfAnalysis
      ? `[Brief summary: your communication style, period covered, who you chatted with]`
      : `[Brief summary: who this person is, relationship to the user, period covered]`

    const relationshipSection = isSelfAnalysis
      ? `## How I Interact with Others\n[Patterns in how you initiate, respond, and maintain conversations]`
      : `## Relationship with User\n[Dynamics, closeness level, patterns in how they interact]`

    const keyQuotesDesc = isSelfAnalysis
      ? `[5-10 notable messages that best capture your character]`
      : `[5-10 notable messages that best capture their character]`

    system += `\n\n---\n## ${analysisTitle}

${analysisIntro}

### Tool: analyze_agent_history
This is your primary tool. It has three actions:
- **action="stats"** — Call this FIRST. Returns: total message count, date range, monthly activity heat map, sender breakdown, and suggested file paths.
- **action="analyze_all"** — Call this SECOND. Performs parallel chunked analysis of all messages and returns partial analyses. Much faster than reading pages one by one.
- **action="messages", page=N** — (Fallback) Read messages page by page (150 per page). Only use if analyze_all fails.

### Standard Workflow (follow this exactly when the user asks to start or analyze):
1. Call \`analyze_agent_history(action="stats")\` → understand scope
2. Call \`analyze_agent_history(action="analyze_all")\` → get parallel analysis results
3. Synthesize the partial analyses into the final report
4. Write the analysis report via \`file_operation\` to the suggested_output_path from stats

### Default Output: Markdown Report
Unless the user requests HTML, write a **Markdown (.md)** file with these sections:
\`\`\`
${reportTitle}

## Overview
${overviewDesc}

## Personality Traits
[Core traits with evidence from chat messages]

## MBTI Profile
[Inferred type (e.g. INTJ) with reasoning and specific message evidence]

## Communication Style
[Tone, vocabulary patterns, emoji usage, response length, formality level]

## Topics & Interests
[Most discussed topics, recurring themes, expertise areas]

## Emotional Patterns
[How they express emotion, stress responses, humor style]

${relationshipSection}

## Chat Activity Heat Map
[Visualize monthly activity from the stats data — text-based table or description]

## Key Quotes
${keyQuotesDesc}

## Summary
[Overall impression, strengths, blind spots]
\`\`\`

### Optional: HTML Dashboard
If the user requests HTML, generate a **self-contained HTML file** with:
- Inline CSS (dark theme, modern design)
- Monthly activity bar chart (using SVG or CSS bars from the heat map data)
- Sender ratio donut chart (CSS-only)
- All analysis sections styled as cards
- No external dependencies — fully self-contained

### Guidelines
- Base ALL claims on specific evidence from the messages — cite actual quotes${isSelfAnalysis ? '\n- Focus on "Me" messages to extract personality traits. The other person\'s messages are context only.' : '\n- Read enough pages to cover the full time range before drawing conclusions'}
- Write in the same language as the user's most recent message
- After writing the file, tell the user the file path and offer to open it or generate the HTML version`
  }

  // ── Inject agent IDs for SoulTool ──
  // Without these, the LLM has no way to know the correct UUIDs when calling
  // update_soul_memory / read_soul_memory, and will guess wrong (e.g. "user").
  const agentIdBlock = []
  if (systemAgentId) agentIdBlock.push(`Your agent ID (system): ${systemAgentId}`)
  if (userAgentId && userAgentId !== '__default_user__') agentIdBlock.push(`User agent ID: ${userAgentId}`)
  if (agentIdBlock.length > 0) {
    system += `\n\n---\n## AGENT IDS (use these with soul memory tools)\n${agentIdBlock.join('\n')}`
  }

  system += `

CORE TOOLS (always available):
- execute_shell: Run shell commands (command + args separated, e.g. command:"ls" args:["/home"])
- file_operation: Read, write, list, append, search, mkdir, delete files on the filesystem
- todo_manager: Plan complex tasks with structured todo lists
- dispatch_subagent: Delegate a single focused subtask to a specialized sub-agent
- dispatch_subagents: Dispatch MULTIPLE sub-agents in parallel at once (preferred for 2+ independent tasks)
- background_task: Run long operations in the background`

  // List active skills — minimal format for cache efficiency
  const skillIds = (enabledSkills || [])
    .filter(s => typeof s !== 'string' && s.id)
    .map(s => s.id)
    .join(', ')

  if (skillIds) {
    system += `\nSKILLS: ${skillIds}`
  }

  // ── ClankAI Data Directory ──
  // dataPath is injected by main.js (DATA_DIR) — single source of truth
  const dataPath = config.dataPath || require('../lib/dataStore').paths().DATA_DIR
  // DoCPath = AI Doc folder (readable documents: md, docx, pdf, pptx, txt, etc.)
  // artifactPath = non-document output (exports, temp files, data, code snippets)
  const aidocPath    = config.DoCPath || path.join(dataPath, 'clank_aidoc')
  const artifactPath = config.artifactPath || path.join(dataPath, 'artifact')
  const codingPath = config.chatWorkingPath || ''
  const isCodingMode = !!(config.codingMode && codingPath)
  const skillsPath = config.skillsPath || ''
  const utilityModel = config.utilityModel || {}
  const utilityProvider = utilityModel.provider || ''
  const utilityModelId  = utilityModel.model    || ''
  system += `\n\nCLANKAI DATA DIRECTORY: ${dataPath}
This is the local data folder for the ClankAI desktop application. Its structure:
  ${dataPath}/
  ├── config.json          — App settings (API keys, models, providers, paths)
  ├── mcp-servers.json     — MCP server definitions
  ├── tools.json           — HTTP tool definitions
  ├── agents.json          — AI agent definitions
  ├── knowledge.json       — RAG knowledge config
  ├── chats/               — Per-chat message history
  ├── souls/               — Persistent memory files (system/, users/)
  ├── clank_aidoc/         — AI Doc folder (readable documents)
  └── artifact/            — AI-generated non-document output

AI DOC PATH (primary directory for readable documents): ${aidocPath}
This is where ALL readable documents live — Markdown (.md), Word (.docx), PDF (.pdf), PowerPoint (.pptx), plain text (.txt), Excel (.xlsx/.csv), HTML (.html), and similar human-readable formats. When the user asks you to create a document, report, note, summary, or any readable file, ALWAYS write it here (or a subfolder).

ARTIFACT PATH (for non-document output only): ${artifactPath}
This is for generated files that are NOT readable documents: exports, temp files, raw data dumps, generated code snippets, binary output. Do NOT put .md, .docx, .pdf, .pptx, .txt, .html or other readable documents here. Create subdirectories as needed (e.g. ${artifactPath}/exports/). The directory is auto-created on first write.${isCodingMode ? `

CODING PROJECT PATH: ${codingPath}
This chat is in CODING MODE. All code files (source code, configs, scripts, tests, etc.) MUST be created/edited within this project directory. Use this path as the root for any code-related file operations. Non-code output (documents, reports) still goes to the document path or artifact path above.` : ''}${skillsPath ? `

SKILLS PATH: ${skillsPath}
This is the directory where skill folders are stored on disk. Each skill is a folder containing a skill definition file. Use this path if the user asks to inspect, create, or modify skills on disk.` : ''}

DATA FILE ROUTING — when the user asks you to create or modify app configuration, act directly:
- "create/add/edit a tool" or "add an HTTP tool"  → read then write ${dataPath}/tools.json
  Format: {"categories":{"CategoryName":{"tools":[{"id":"<uuid>","name":"...","method":"GET|POST|...","endpoint":"...","headers":{},"bodyTemplate":"","description":"..."}]}}}
- "create/add/edit an MCP server"                  → read then write ${dataPath}/mcp-servers.json
  Format: [{"id":"<uuid>","name":"...","command":"...","args":[],"env":{},"description":"..."}]
- "create/add/edit an agent"                       → read then write ${dataPath}/agents.json
  Format: {"categories":[...],"agents":[...,{"id":"<uuid>","type":"system","name":"...","avatar":"a1","description":"...","prompt":"...","providerId":${utilityProvider ? `"${utilityProvider}"` : 'null'},"modelId":${utilityModelId ? `"${utilityModelId}"` : 'null'},"enabledSkillIds":null,"mcpServerIds":null,"voiceId":null,"categoryIds":[],"createdAt":<timestamp>,"updatedAt":<timestamp>}]}
  IMPORTANT: always set "providerId" to ${utilityProvider ? `"${utilityProvider}"` : 'null'} and "modelId" to ${utilityModelId ? `"${utilityModelId}"` : 'null'} (the system utility model) unless the user explicitly asks for a different model.
- "add/edit knowledge / RAG index"                 → read then write ${dataPath}/knowledge.json
- "create/add/edit a task"                          → read then write ${dataPath}/tasks.json
  Format: [{"id":"<uuid>","name":"...","description":"...","icon":"📋","prompt":"...","agentInputs":[{"name":"slotName","description":"Role description"}]}]
  TASK PROMPT RULES: Use @slotName tokens in the prompt to reference agent input slots (e.g. "@analyst review this data"). Slot names must be alphanumeric/underscore only (no spaces). Add agentInputs entries for each @slotName used. If no agent slot is needed, set agentInputs to [].
- "create/add/edit a plan"                          → read then write ${dataPath}/plans.json
  Format: [{"id":"<uuid>","name":"...","description":"...","steps":[{"id":"<uuid>","taskId":"<task id>","label":"...","agentAssignments":{"slotName":"<agent id>"},"defaultAgentIds":[],"dependsOn":[],"runCondition":"always"}],"schedule":null,"createdAt":"<iso>","updatedAt":"<iso>"}]
  PLAN RULES: Each step references a task by its id. If the task has agentInputs, fill agentAssignments with {slotName: agentId}. If no inputs, list agent ids in defaultAgentIds. Set dependsOn:[] for parallel steps; set dependsOn:["<stepId>"] to sequence steps. schedule is null (manual) or a cron string (e.g. "0 8 * * *" = daily 8am). To add a step to the calendar/schedule, set schedule to the appropriate cron expression.
  AGENT ID LOOKUP: To assign agents to steps, first read ${dataPath}/agents.json and find the id of the agent the user names.
- Always read the file first to understand existing content before writing. Preserve all existing entries.
- After writing, tell the user to click Refresh on the relevant page (MCP / Tools / Agents / Knowledge / Tasks) to reload.`

  // ── Document Path subfolders (for file placement guidance) ──
  // Priority: explicit obsidian vault override → aidocPath (already resolved above)
  const effectiveDocPath = process.env.DOC_PATH || config.obsidianVaultPath || aidocPath
  let docSubfolders = []
  try {
    const entries = fs.readdirSync(effectiveDocPath, { withFileTypes: true })
    docSubfolders = entries.filter(e => e.isDirectory()).map(e => e.name).sort()
  } catch (err) {
    // Directory may not exist yet — that's fine
  }

  const subfolderList = docSubfolders.length > 0
    ? docSubfolders.map(f => `  - ${f}/`).join('\n')
    : '  (no subfolders yet — create as needed)'

  system += `\n\nFILE PLACEMENT RULES — CRITICAL: route every file to the correct path:
1. READABLE DOCUMENTS → AI Doc Path: ${effectiveDocPath}
   Includes: .md, .docx, .pdf, .pptx, .txt, .xlsx, .csv, .html and any human-readable report/note/summary.
   The FINAL output (the document the user asked for) goes here.
   Current subfolders:
${subfolderList}
   Choose an existing subfolder or create a new one as needed.

2. SCRIPTS & NON-DOCUMENT OUTPUT → Artifact Path: ${artifactPath}
   Includes ALL of the following, regardless of their purpose:
   - Helper/utility scripts (.py, .js, .ts, .sh, .ps1, .rb, etc.) — even if written solely to generate a document
   - Intermediate files, temp files, raw data dumps, exports, binary output
   - Example: if you write verify_docx.py or convert.py to help produce a .docx, the .py goes here; the .docx goes to AI Doc Path above.
   RULE: if the file is CODE (any script or program), it goes here — not in AI Doc Path.
   IMPORTANT — when running a script that produces a document: hardcode or pass the output path as an absolute path pointing to AI Doc Path (${effectiveDocPath}), not a relative path. Relative paths resolve to the shell working directory, not the document folder.${isCodingMode ? `

3. CODE FILES → Coding Project Path: ${codingPath}
   Includes: source code, configs, scripts, tests that are part of the user's coding project. Use this as the project root.` : ''}`

  if (effectiveName) {
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

  // Append MCP server info if any are enabled (minimal format for cache efficiency)
  const _mcpServers = mcpServers || []
  if (_mcpServers.length > 0) {
    const mcpIds = _mcpServers.map(s => s.id).join(', ')
    system += `\n\nMCP SERVERS: ${mcpIds}`
  }

  // Append user-defined tools as a rich capabilities block
  const allUserTools = httpTools || []
  const httpToolsList   = allUserTools.filter(t => (t.type || 'http') === 'http')
  const codeToolsList   = allUserTools.filter(t => t.type === 'code')
  const promptToolsList = allUserTools.filter(t => t.type === 'prompt')
  const smtpToolsList   = allUserTools.filter(t => t.type === 'smtp')

  if (allUserTools.length > 0) {
    system += `\n\n## Your Assigned Tools\nThe following tools have been assigned to you. Use them proactively when relevant — especially for real-time or external data, **never answer from memory when a tool is available**.`

    if (httpToolsList.length > 0) {
      system += `\n\n**HTTP Tools** (call these for real-time/live data — never guess or use training knowledge):`
      for (const t of httpToolsList) {
        system += `\n- \`http_${t.id}\` — ${t.name}${t.description ? `: ${t.description}` : ''}`
      }
    }

    if (codeToolsList.length > 0) {
      system += `\n\n**Code Tools** (reference implementations — use execute_shell to run):`
      for (const t of codeToolsList) {
        system += `\n- \`code_${t.id}\` — ${t.name}${t.description ? `: ${t.description}` : ''}`
      }
    }

    if (promptToolsList.length > 0) {
      system += `\n\n**Prompt Tools** (call to retrieve reusable instructions or templates):`
      for (const t of promptToolsList) {
        system += `\n- \`prompt_${t.id}\` — ${t.name}${t.description ? `: ${t.description}` : ''}`
      }
    }

    if (smtpToolsList.length > 0) {
      system += `\n\n**Email Tools** (send email via SMTP):`
      for (const t of smtpToolsList) {
        system += `\n- \`smtp_${t.id}\` — ${t.name}${t.description ? `: ${t.description}` : ''}`
      }
    }
  }

  // ── Memory context injection ──
  const { userMd } = memoryContext

  if (userMd) {
    system += `\n\n## User Profile\n${prepareSoulContent(userMd)}`
  }

  // Current date — essential for LLMs to interpret relative dates ("去年", "last month", etc.)
  const today = new Date().toISOString().slice(0, 10)
  system += `\n\nCURRENT DATE: ${today}`

  // Memory Recall instruction — guide the LLM to search history when needed
  if (effectiveName) {
    system += `\n\n## MEMORY RECALL\nYou have access to the \`search_chat_history\` tool which searches your past conversation records.\nWhen the user asks about prior conversations, specific dates, past topics, or anything that happened before:\n- Use search_chat_history to find relevant messages\n- You can search by keyword (query), date range (dateFrom/dateTo in YYYY-MM-DD), or both\n- Always search before answering from memory — your recall may be incomplete or inaccurate\n- IMPORTANT: After receiving search results, summarize the findings naturally in your own voice. Do NOT paste or echo the raw tool output in your response. Weave the facts into your reply as if recalling from memory.`
  }

  // ── RAG / Knowledge Context injection ──
  // ragContext is a plain array of { id, score, text, documentName } from queryRagContext()
  const ragResults = Array.isArray(ragContext) ? ragContext : ragContext?.results
  if (ragResults && ragResults.length > 0) {
    const chunks = ragResults
      .map((r, i) => `### Source ${i + 1}${r.documentName ? ` (${r.documentName})` : ''}\n${r.text || r.content || ''}`)
      .join('\n\n')
    system += `\n\n## Knowledge Context\n_Retrieved from your assigned knowledge base_\n\n${chunks}`
  }

  return system
}

/**
 * Strip infrastructure sections from a full system prompt so only
 * identity/character/memory content remains.  The removed sections are:
 *   - SKILLS: ...  (single line)
 *   - MCP SERVERS: ...  (single line)
 *   - ## Your Assigned Tools  (block until next ## heading or end)
 *   - ## Knowledge Context  (block until next ## heading or end)
 * These are displayed in their own dedicated UI panels.
 */
function stripInfraFromPrompt(fullPrompt) {
  if (!fullPrompt) return fullPrompt
  let out = fullPrompt
  // Single-line entries produced by the builder
  out = out.replace(/\nSKILLS: [^\n]*/g, '')
  out = out.replace(/\nMCP SERVERS: [^\n]*/g, '')
  // Multi-line ## blocks — strip infra + memory sections (memory stored separately in snapshot)
  const STRIP_SECTIONS = [
    'Your Assigned Tools',
    'Knowledge Context',
    'User Profile',
    'MEMORY RECALL',
  ]
  for (const title of STRIP_SECTIONS) {
    const re = new RegExp(`\\n## ${title.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?(?=\\n## |\\n---|\\n[A-Z]{4,}\\b|$)`, 'g')
    out = out.replace(re, '')
  }
  // Collapse excess blank lines left behind
  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trim()
}

module.exports = { buildSystemPrompt, stripInfraFromPrompt, readSoulFile, prepareSoulContent, extractKeySections, readFileIfExists, SOUL_KEY_SECTIONS }
