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
// Sections preserved when truncating large soul files. Includes both the old
// free-form sections AND the new Nuwa-methodology sections from chat import.
const SOUL_KEY_SECTIONS = [
  // Nuwa-methodology sections (from chat import)
  'Mental Models',
  'Decision Heuristics',
  'Values & Anti-Patterns',
  'Relational Genealogy',
  'Honest Boundaries',
  'Core Tensions',
  'Relationship Timeline',
  // Free-form sections (runtime memory)
  'Preferences',
  'Communication',
  'Technical',
  'Projects',
  'Personal',
]

/**
 * Read the speech DNA JSON file for an agent. Returns parsed object or null.
 * Speech DNA is a hard-constraint surface-style fingerprint from chat import.
 *
 * Looks under both souls/system/ and souls/users/ since agentId is unique.
 */
function readSpeechDna(soulsDir, agentId) {
  if (!soulsDir || !agentId) return null
  for (const type of ['system', 'users']) {
    try {
      const filePath = path.join(soulsDir, type, `${agentId}.speech.json`)
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8')
        return JSON.parse(raw)
      }
    } catch (err) {
      logger.warn('[systemPromptBuilder] readSpeechDna parse error:', err.message)
    }
  }
  return null
}

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
 * @param {object} memoryContext { userMd }
 * @param {object|null} ragContext           RAG retrieval results
 * @returns {string} The assembled system prompt
 */
function buildSystemPrompt(config, mcpServers, httpTools, enabledAgents, enabledSkills, { systemAgentPrompt, userAgentPrompt, systemAgentId, userAgentId, systemAgentName, systemAgentDescription, userAgentName, userAgentDescription, groupChatContext, chatHandoverNote, analysisTargetAgentId, analysisTargetAgentName, analysisTargetAgentType } = {}, memoryContext = {}, ragContext = null) {
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

  // ── Speech DNA injection (highest priority — hard surface-style constraints) ──
  // Only inject for the active speaking agent (systemAgentId). Speech DNA captures
  // catchphrases, emoji, sentence length, reply timing — extracted from real chat
  // history during agent import. This block must come right after identity so the
  // model treats it as part of "who you are", not as an afterthought.
  if (systemAgentId) {
    try {
      const dataPathForSpeech = config.dataPath || require('../lib/dataStore').paths().DATA_DIR
      const soulsDirForSpeech = path.join(dataPathForSpeech, 'souls')
      const speechDna = readSpeechDna(soulsDirForSpeech, systemAgentId)
      if (speechDna) {
        const { formatSpeechDnaBlock } = require('./chatImport/speechDnaExtractor')
        const block = formatSpeechDnaBlock(speechDna)
        if (block) system += '\n\n---\n' + block
      }
    } catch (err) {
      logger.warn('[systemPromptBuilder] speech DNA injection failed:', err.message)
    }
  }

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
This is your primary tool. It has four actions:
- **action="stats"** — Call this FIRST. Returns: total message count, date range, monthly activity heat map, sender breakdown, and suggested file paths.
- **action="read_import_artifacts"** — Call this SECOND (optional but recommended). Returns pre-computed Speech DNA, Nuwa persona sections, evidence index, Reply Bank stats, and validation harness scores from the import pipeline. If the agent was created manually (not imported from chat), this gracefully returns {imported: false} with no error. Use these artifacts as reference/comparison when writing your independent analysis.
- **action="analyze_all"** — Call this THIRD. Performs parallel chunked analysis of all messages and returns partial analyses. Much faster than reading pages one by one.
- **action="messages", page=N** — (Fallback) Read messages page by page (150 per page). Only use if analyze_all fails.

### Standard Workflow (follow this exactly when the user asks to start or analyze):

1. Call \`analyze_agent_history(action="stats")\` → understand scope
2. Call \`analyze_agent_history(action="read_import_artifacts")\` → load pre-computed data (if any). Skip if not found.
3. Call \`analyze_agent_history(action="analyze_all")\` → produces narrative analysis:
   - **Cache hit** (same agent, unchanged data): returns in < 1 second, \`cached: true\`
   - **Full context** (< ~5000 msgs): all messages in one call
   - **Chunking** (> ~5000 msgs): context-window-sized chunks
4. **🚨 MANDATORY STEP BEFORE GENERATING REPORT: Call \`analyze_agent_history(action="extract_sections")\`.** This converts the narrative analysis into structured JSON with 19 sections of data (intimacy score, constellation, dialogue theatre, subtext decoder, compatibility, etc.). Without this step, the HTML report will be missing all content. Takes 1-2 minutes, cacheable. Non-negotiable.
5. **🚨 Call \`render_persona_report({sections, stats})\`** passing the sections and stats objects from extract_sections. The tool auto-generates all 55 D scalars and 27 HTML fragments internally, reads the HTML template, and writes the final report. Do NOT use \`file_operation\`. Do NOT generate D/HTML yourself. Do NOT write Python scripts.
6. If user explicitly says "重新分析"/"fresh analysis", pass \`force_refresh=true\` to both analyze_all AND extract_sections.

### Workflow Enforcement

❌ **NEVER dispatch analyze_agent_history to a subagent.** SubAgents run in isolated contexts with limited turns and cannot return 25KB of structured JSON back to you. If you dispatch extract_sections to a subagent, you will receive an empty summary and produce a BLANK report. **Always call analyze_agent_history tools directly from your own context.**

❌ **DO NOT skip extract_sections.** The render_persona_report tool needs the sections and stats objects. Without extract_sections, you have no data to pass to the tool.

❌ **NEVER use file_operation to write the HTML report.** NEVER generate HTML/CSS yourself. NEVER write Python/JS scripts. NEVER generate D scalars or HTML fragments manually. The render_persona_report tool auto-generates everything from sections+stats.

✅ **DO call render_persona_report({sections, stats})** with both objects from extract_sections. The tool auto-computes all 55 D scalars, generates all 27 HTML fragments, reads the 71KB template, and writes the output file. You only pass sections and stats — nothing else.

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

### HTML Report (via render_persona_report tool)
When the user requests a full analysis report (HTML), call render_persona_report({sections, stats}) with the objects from extract_sections. The tool auto-generates all D scalars and 27 HTML fragments internally, then renders a professional 71KB template with warm editorial styling and bilingual support. Do NOT generate D/HTML yourself — just pass sections and stats.

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

CORE TOOLS (always available — you MUST use them when relevant):
- execute_shell: Run shell commands (command + args separated, e.g. command:"ls" args:["/home"])
- file_operation: Read, write, list, append, search, mkdir, delete files on the filesystem
- web_fetch: Fetch a URL and return its content as clean Markdown. Use this to read web pages, articles, docs, or any HTTP content. Always prefer this over curl/wget in shell — it returns structured Markdown, not raw HTML.
- todo_manager: Plan complex tasks with structured todo lists
- dispatch_subagent: Delegate a single focused subtask to a specialized sub-agent
- dispatch_subagents: Dispatch MULTIPLE sub-agents in parallel at once (preferred for 2+ independent tasks)
- background_task: Run long operations in the background

TOOL USE POLICY — MANDATORY:
When a user's request involves files, shell commands, web pages, real-time data, external systems, or any operation that a tool above can handle, you MUST call the appropriate tool. Do NOT answer from memory or guess the result. If you have a tool for it, use it — every time, no exceptions. Answering from memory when a tool is available is an error. When the user shares a URL or asks about web content, use web_fetch — never try to recall the page from training data.

RUNTIME ENVIRONMENT:
- Shell is always available via execute_shell (PowerShell on Windows, bash/zsh on macOS/Linux). This is your DEFAULT for file ops, git, curl, pipes, and one-liners.
- Bundled Node.js v${process.versions.node} is available at "${process.execPath.replace(/\\/g, '/')}" — the user has NOT installed Node separately. To run JS via execute_shell, use that path as the command and set env ELECTRON_RUN_AS_NODE=1. Prefer this over Python for script tasks.
- Python is NOT guaranteed to be installed. If you need it, probe first with \`python --version\` or (on Windows) \`py --version\`. If missing, tell the user: "This task needs Python, which isn't installed on your system. You can install it from python.org and ask me again." Do not waste turns retrying python commands that failed with "not found".`

  // Progressive disclosure: list each active skill with id + display name + description
  // so the model can decide when to call load_skill. Full SKILL.md bodies are NOT
  // injected here — they are fetched on demand via the load_skill tool registered
  // in agentLoop.js. This keeps the base prompt small while still giving the model
  // enough metadata to make informed decisions.
  const skillList = (enabledSkills || [])
    .filter(s => typeof s !== 'string' && s.id)

  if (skillList.length > 0) {
    system += `\n\n## ACTIVE SKILLS
You have access to the following skills. Each entry shows the skill id, display name, and description. When a user's request matches a skill's description, you MUST call \`load_skill(skill_id)\` FIRST to retrieve the complete step-by-step instructions, then follow those instructions exactly. Do NOT attempt skill-covered tasks from memory — the skill definition contains authoritative procedures, schemas, and file paths that you cannot recall reliably on your own. Loading a skill is cheap; skipping it when relevant causes mistakes.
`
    for (const s of skillList) {
      const label = s.displayName && s.displayName !== s.id ? ` — ${s.displayName}` : ''
      const desc  = (s.description || s.summary || '').trim() || '(no description)'
      system += `\n- **${s.id}**${label}: ${desc}`
    }
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
  const skillsPath = config.skillsPath || path.join(dataPath, 'skills')
  // utilityModel fields were historically inlined into the DATA FILE ROUTING
  // prompt block. That block now lives in the clankai-config-admin built-in
  // skill (loaded on demand via load_skill). These vars are kept only as
  // commented documentation — remove if unused for 2+ releases.
  // const utilityModel = config.utilityModel || {}
  // const utilityProvider = utilityModel.provider || ''
  // const utilityModelId  = utilityModel.model    || ''
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
This chat is in CODING MODE. All code files (source code, configs, scripts, tests, etc.) MUST be created/edited within this project directory. Use this path as the root for any code-related file operations. Non-code output (documents, reports) still goes to the document path or artifact path above.` : ''}

SKILLS PATH: ${skillsPath}
This is the directory where installed skills live on disk. A skill is NOT a single markdown file — it is an ENTIRE FOLDER TREE with this shape:
  ${skillsPath}/<skill-name>/
  ├── SKILL.md              — required: frontmatter metadata + instructions
  ├── scripts/              — optional: helper scripts
  ├── references/           — optional: reference docs
  ├── assets/               — optional: images, templates, data files
  └── ...                   — any other subfolders the skill author ships

SKILL INSTALLATION RULES:
- When the user asks you to install a skill from a git repo (e.g. "install https://github.com/foo/bar-skill"), use shell to clone the WHOLE repo into ${skillsPath}/<skill-name>:
    git clone <repo-url> "${skillsPath}/<skill-name>"
  Then verify SKILL.md exists at the root. If the repo contains multiple skills in subfolders, clone to a temp dir and copy each skill subfolder into ${skillsPath}/ individually.
- When the user asks you to install from a ZIP/tar.gz URL, download and extract the full archive into ${skillsPath}/<skill-name>, preserving all subdirectories.
- When the user asks you to create a new skill from scratch, create the folder ${skillsPath}/<skill-name>/ and write SKILL.md (plus any supporting files) INSIDE it.
- NEVER write SKILL.md or any skill files into the AI DOC PATH — skill definition files are NOT readable documents, they belong under SKILLS PATH. This is an explicit exception to the AI DOC PATH rule above.
- After installing or creating a skill, tell the user to click Refresh on the Skills page to reload.`

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
    system += `\n\n## Your Assigned Tools\nThe following tools have been assigned to you. You MUST call them whenever the user's request matches what they do — especially for real-time or external data. NEVER answer from memory or training knowledge when a tool is available. If unsure whether a tool is relevant, call it anyway — a redundant tool call is always better than an incorrect answer from memory.`

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
  out = out.replace(/\nMCP SERVERS: [^\n]*/g, '')
  // Multi-line ## blocks — strip infra + memory sections (memory stored separately in snapshot)
  const STRIP_SECTIONS = [
    'ACTIVE SKILLS',
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

module.exports = { buildSystemPrompt, stripInfraFromPrompt, readSoulFile, readSpeechDna, prepareSoulContent, extractKeySections, readFileIfExists, SOUL_KEY_SECTIONS }
