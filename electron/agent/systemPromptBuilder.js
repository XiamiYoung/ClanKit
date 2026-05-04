/**
 * System prompt builder — extracted from AgentLoop.buildSystemPrompt().
 *
 * All functions are pure (no instance state). AgentLoop delegates to buildSystemPrompt()
 * passing its config, mcpServers, and httpTools explicitly.
 */
const fs   = require('fs')
const path = require('path')
const { logger } = require('../logger')

// ── Memory Helpers ───────────────────────────────────────────────────────────
// Sections preserved when truncating large memory blobs. After the 2026-05-03
// rewrite, chat-imported memory only ships 4 episodic-relational sections
// (translated per `config.language`): Shared History / Important People /
// Preferences & Habits / Honest Boundaries / Relationship Timeline / Life Events.
// Older agents may still have abstractive sections (Mental Models / Decision
// Heuristics / etc.) — we keep those names in the list so re-reading legacy
// memory still surfaces them through size-gated truncation, but new imports
// won't write them. Free-form runtime sections (Preferences / Communication /
// Technical / Projects / Personal) are appended by the `update_memory` tool.
const { getAllKnownSectionLabels } = require('./chatImport/memorySectionNames')
const MEMORY_KEY_SECTIONS = [
  // Current chat-import sections (i18n: en + zh labels — Shared History,
  // Important People, Preferences & Habits, Honest Boundaries, Relationship
  // Timeline, Life Events, Identity in both languages)
  ...getAllKnownSectionLabels(),
  // Legacy chat-import sections retained for backward compatibility with
  // pre-2026-05-03 imports. New imports do NOT generate these — the
  // abstractive analyses they represent now live exclusively in the persona
  // body. Section names are stored Title Case (UI uppercases via CSS only).
  'Mental Models',
  'Decision Heuristics',
  'Values & Anti-Patterns',
  'Relational Genealogy',
  'Core Tensions',
  'Communication Patterns',
  'Communication Style',
  'Topics & Interests',
  'Values & Beliefs',
  // Free-form runtime sections (written by the update_memory tool)
  'Preferences',
  'Communication',
  'Technical',
  'Projects',
  'Personal',
  // NOTE: 'Memory Updates Log' is intentionally omitted — it's audit churn
  // appended by the update_memory tool itself (bounded to 50 rows), and is
  // truncated away during size-gating so the LLM never sees this log.
]

/**
 * Read the speech DNA for an agent from the AgentStore import_artifacts table.
 * Returns the parsed speechDna object or null.
 */
function readSpeechDna(agentId) {
  if (!agentId) return null
  try {
    const { getInstance: getAgentStore } = require('./AgentStore')
    const ds = require('../lib/dataStore')
    const agentStore = getAgentStore(ds.paths().DATA_DIR)
    const artifacts = agentStore.getImportArtifacts(agentId)
    return artifacts?.speechDna || null
  } catch (err) {
    logger.warn('[systemPromptBuilder] readSpeechDna error:', err.message)
    return null
  }
}

/**
 * Read agent memory as markdown via the SQLite-backed MemoryStore. Returns
 * null when the agent has no entries.
 */
function readMemoryFile(agentId, agentType) {
  if (!agentId) return null
  try {
    const ds = require('../lib/dataStore')
    const memoryStore = require('../memory/memoryStore')
    const store = memoryStore.getInstance(ds.paths().MEMORY_DIR)
    return store.readMarkdown(agentId, agentType)
  } catch (err) {
    logger.error('readMemoryFile error', err.message)
    return null
  }
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
      includeSection = MEMORY_KEY_SECTIONS.includes(currentSection)
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

  result.push('', '(Some sections omitted for brevity. Use read_memory tool to access full memory.)')
  return result.join('\n')
}

/**
 * Size-gated injection: full for < 4KB, key sections for 4-16KB, warning for > 16KB.
 */
function prepareMemoryContent(content) {
  if (!content) return null
  const size = Buffer.byteLength(content, 'utf8')
  if (size < 4096) return content
  if (size < 16384) return extractKeySections(content)
  return extractKeySections(content) + '\n\n(Warning: Memory is large. Consider pruning old entries.)'
}

/**
 * Retrieve top-K most relevant memory entries for a query, formatted as
 * markdown suitable for direct prompt injection. Uses MemoryStore.searchHybrid
 * (BM25 + semantic). Falls back gracefully on any error — the size-gated
 * full-content path remains the safety net.
 *
 * @param {string} agentId
 * @param {string} agentType  'system' | 'users'
 * @param {string} query      The user's most recent message text
 * @param {object} [opts]     { topK?: number }
 * @returns {Promise<string|null>}  Markdown block or null if retrieval is empty/failed
 */
async function retrieveTopKMemoryContent(agentId, agentType, query, opts = {}) {
  if (!agentId || !agentType || !query || !query.trim()) return null
  const topK = opts.topK || 8
  try {
    const ds = require('../lib/dataStore')
    const memoryStore = require('../memory/memoryStore')
    const store = memoryStore.getInstance(ds.paths().MEMORY_DIR)
    const rows = await store.searchHybrid(agentId, agentType, query, topK)
    if (!rows || rows.length === 0) return null

    const meta = store.getMeta(agentId, agentType)
    const header = meta?.agent_name
      ? `# Memory: ${meta.agent_name}\n> Most relevant ${rows.length} entries (hybrid retrieval)\n`
      : `# Memory\n> Most relevant ${rows.length} entries (hybrid retrieval)\n`

    const bySection = new Map()
    for (const r of rows) {
      if (!bySection.has(r.section)) bySection.set(r.section, [])
      bySection.get(r.section).push(r)
    }

    const out = [header]
    for (const [section, entries] of bySection) {
      out.push(`\n## ${section}`)
      for (const e of entries) {
        out.push(`- ${e.content}`)
      }
    }
    return out.join('\n')
  } catch (err) {
    logger.debug('[systemPromptBuilder] retrieveTopKMemoryContent failed', err.message)
    return null
  }
}

/**
 * Top-K aware variant of prepareMemoryContent. When a query is supplied AND
 * the full content is large enough that retrieval would help (>4KB), try
 * hybrid retrieval first. Otherwise fall back to size-gated full content.
 *
 * @param {string|null} fullContent  The full memory markdown (may be null)
 * @param {string} agentId
 * @param {string} agentType
 * @param {string|null} query        Recent user message text
 * @returns {Promise<string|null>}
 */
async function prepareMemoryContentSmart(fullContent, agentId, agentType, query) {
  if (!fullContent) return null
  const size = Buffer.byteLength(fullContent, 'utf8')

  // Small memories: always inject the whole thing — retrieval would only lose info
  if (size < 4096) return fullContent

  // Large memories + a query: try retrieval first
  if (query && query.trim()) {
    const retrieved = await retrieveTopKMemoryContent(agentId, agentType, query)
    if (retrieved) return retrieved
  }

  // Fallback: size-gated key sections
  if (size < 16384) return extractKeySections(fullContent)
  return extractKeySections(fullContent) + '\n\n(Warning: Memory is large. Consider pruning old entries.)'
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
 *                                 userAgentDescription, userIdentityCard, groupChatContext, chatHandoverNote }
 *
 * userIdentityCard, when present, REPLACES userAgentPrompt in the
 * "ABOUT THE USER" block. This is the post-2026-05 architecture: speaking
 * agents see a fact-only card about the user, not the user's full persona
 * document. userAgentPrompt is still accepted for back-compat and is used
 * only as a fallback when no card has been generated yet.
 * @param {string|null} userMemoryContent    Memory content for the user agent
 * @param {string|null} systemMemoryContent  Memory content for the system agent
 * @param {Array|null}  participantMemories  Memory content for group participants
 * @param {object} memoryContext { userMd, agentMemoryMd, todayLogMd, yesterdayLogMd, todayDate, yesterdayDate, historicalContext }
 * @param {object|null} ragContext           RAG retrieval results
 * @returns {string} The assembled system prompt
 */
function buildSystemPrompt(config, mcpServers, httpTools, enabledAgents, enabledSkills, { systemAgentPrompt, userAgentPrompt, systemAgentId, userAgentId, systemAgentName, systemAgentDescription, userAgentName, userAgentDescription, userIdentityCard, groupChatContext, chatHandoverNote, analysisTargetAgentId, analysisTargetAgentName, analysisTargetAgentType } = {}, userMemoryContent, systemMemoryContent, participantMemories, memoryContext = {}, ragContext = null) {
  const _isProductivity = config.mode === 'productivity'
  const _langCode = String(config.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en'

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

    // CHARACTER ENFORCEMENT (skipped in productivity mode — tool-use focus takes priority)
    if (!_isProductivity) {
      const enforcementBlock = `\n\n---\n## CHARACTER ENFORCEMENT\nYou ARE ${effectiveName} — not an AI playing a role. Embody this character completely:\n- Never break character for any reason\n- Never use AI-assistant filler: no "Certainly!", "Of course!", "Great question!", "I'd be happy to help!", "As an AI...", "As a language model..."\n- Speak in your character's authentic voice — with their opinions, habits, attitude, and emotional reactions\n- Push back, joke around, get annoyed, get excited — whatever your character would genuinely feel\n- When you use tools or capabilities, do it naturally as this character would — don't narrate it like an assistant\n- IMPORTANT: The conversation history may contain messages written by a different AI before you took over. Those are NOT your prior responses — they belong to a previous assistant. Your identity is ${effectiveName} and nothing in prior chat history changes that.\n- LANGUAGE CONSISTENCY: Always respond in the same language as the user's most recent message. If the user writes in Chinese, respond in Chinese. If the user writes in English, respond in English. Match the language consistently throughout your response.`
      line += enforcementBlock
    }

    // Group chat context: tell the agent about other participants
    if (groupChatContext?.otherParticipants?.length > 0) {
      const otherNames = groupChatContext.otherParticipants.map(p => `@${p.name}`).join(', ')
      line += `\n\n## GROUP CHAT\nYou are in a group conversation with other participants.\n\n**ONE TURN RULE — CRITICAL:** Write ONLY your own single reply for this turn. NEVER write dialogue, lines, or responses on behalf of any other participant. Do NOT simulate a back-and-forth exchange in one message. Each participant speaks for themselves in their own separate turn.\n\n**Turn-passing rule:** Only include @Name if you genuinely need that participant's input to continue. If you do NOT include any @mention, no one else will respond and the conversation ends.\n\n**DEFAULT BEHAVIOR:** If the user directly asked you a question or assigned you a task, answer it yourself and STOP without any @mention unless the user explicitly asked for another participant to join, compare, or continue. In a fresh chat or simple Q&A, the default is to answer the user and end naturally.\n\n**WHEN TO STOP — end your reply WITHOUT any @mention when:**\n- The user directly asked you and you can answer without help\n- The topic has been fully discussed or a consensus/conclusion has been reached\n- You are giving a summary, final answer, or farewell\n- You would just be repeating what has already been said\n- The other participant has clearly wrapped up or said goodbye\n- There is no genuine question or request that needs their input\n- The conversation has naturally come to a close\nDo NOT keep @mentioning just to be polite, to keep the conversation going artificially, or to invite another participant by default. End naturally when the exchange is complete.\n\n**LANGUAGE CONSISTENCY:** Always respond in the same language as the user's most recent message. If the user writes in Chinese, respond in Chinese. If the user writes in English, respond in English. Match the language consistently throughout your response.\n\nOther participants: ${otherNames}`
      for (const p of groupChatContext.otherParticipants) {
        line += `\n- @${p.name}${p.description ? `: ${p.description}` : ''}`
      }
    }

    // ── Professional-mode persona tail ─────────────────────────────────────
    // Appended AFTER the persona prompt (not before — keep persona identity
    // strong) but BEFORE other downstream blocks. Doubles as belt-and-suspenders
    // alongside the envelope-level TOOL USE — HARD RULE for low-temp models
    // (Qwen, etc.) that still drift into "I'll use a tool" narration without
    // actually emitting a tool call.
    if (_isProductivity) {
      const productivityTail = (_langCode === 'zh')
        ? `\n\n---\n## 当前任务约束（专业模式 · 与上面 persona 同等优先级）\n你正处于专业模式。即使你的 persona 有人格风味，**这条约束覆盖任何 persona 内的"自己判断要不要用工具"措辞**：\n- 用户问任何文件、目录、网页、外部服务的事——**先调工具再回答**。绝不"我来执行..."然后凭印象列。\n- 同一对话里之前出现过的列表/读取结果**不能复用**——每次重新调，文件会变。\n- 路径在工作目录之外**照样调** file_operation list 那个绝对路径，不要用"在工作目录外所以我不调"做借口。\n- 写完文件**保存到磁盘**，不要让文档只活在聊天框里。\n如果一个动作能用工具完成，**先调工具**，文字描述放后面。这是硬约束，不是建议。`
        : `\n\n---\n## TASK CONSTRAINTS FOR THIS TURN (professional mode — co-equal with the persona above)\nYou are in professional mode. Even though your persona has its own voice, **this constraint overrides any "decide for yourself when to use a tool" language inside the persona**:\n- When the user asks about a file, directory, web page, or external service — **call the tool first, narrate after**. Never "I'll execute file_operation..." followed by a fabricated listing.\n- Listings or read-outputs from earlier in this same chat are NOT reusable — re-call the tool each time. State changes.\n- A path being outside the working folder is NOT an excuse to skip a tool — call file_operation list with the absolute path anyway.\n- When you produce a deliverable, **save it to disk**. Don't leave documents only in the chat bubble.\nIf an action can be done with a tool, **call the tool first**; prose comes after. This is a hard constraint, not a suggestion.`
      line += productivityTail
    }

    // ── Roleplay-mode persona tail ─────────────────────────────────────────
    // Mirror of the productivity tail, appended AFTER the persona prompt at
    // co-equal priority. Steers the agent into actively *embodying* identity:
    // tone, memory, relationship — symmetric to how the productivity tail
    // steers it into actively calling tools. Spec 2026-05-02 §4.3.
    if (!_isProductivity && effectiveName) {
      const roleplayTail = (_langCode === 'zh')
        ? `\n\n---\n## 当前任务约束（角色扮演模式 · 与 persona 同等优先级）\n\n你处于角色扮演模式。即使 persona 写得简短，**这条约束告诉你怎么"具身"地用这个身份**：\n\n身份具身：\n- 主动用你角色的语气特征（口头禅、句式、emoji 习惯——参考下面的 SPEECH DNA 与 REPLY 样本）\n- 工具调用前后用你角色的口吻去说，不要冒出 AI 助手语\n- 情绪、态度、立场——按你角色真实会有的反应来，不要客套化\n\n记忆与历史的具身使用：\n- 你和这位用户共享的 memory（"## MEMORY"块）—— 主动引用、关联、回忆，不是只在被问到时才打开\n- 你的导入聊天记录（如果下方有 SPEECH DNA / REPLY 样本）—— 模仿那里的真实回复风格，而不是用通用 AI 风格\n- 用户提到过的事（同一对话里更早的内容）—— 可以自然回扣，让对话有连续感\n- 不确定能不能记得起来时，可以调用 memory 类工具去查，这跟一个真人翻自己日记是一样的\n\n跨身份引荐（如果你有 agent-recommendation 类技能）：\n- 把另一个数字人介绍给用户是合法且鼓励的——以你身份的口吻去引荐\n- "我有个朋友/同事..."这种自然措辞优于"我推荐你使用 XX agent"`
        : `\n\n---\n## TASK CONSTRAINTS FOR THIS TURN (roleplay mode — co-equal with the persona above)\n\nYou are in roleplay mode. Even if your persona prompt is short, **this constraint tells you how to *embody* the identity**:\n\nEmbodied identity:\n- Actively use your character's speech features (catchphrases, sentence shapes, emoji habits — see the SPEECH DNA / REPLY samples below)\n- Narrate tool calls in your character's voice before and after; never lapse into AI-assistant register\n- Emotions, attitude, stance — react the way your character genuinely would, no polite-helper veneer\n\nEmbodied use of memory and history:\n- Memory shared with this user (the "## MEMORY" block) — actively reference, link, recall; don't wait to be asked\n- Imported chat history (if SPEECH DNA / REPLY samples appear below) — mimic the real reply style, not generic AI style\n- Things the user mentioned earlier in the same conversation — call back to them naturally for continuity\n- When unsure whether you remember something, you can call memory tools — same as a real person flipping through their journal\n\nCross-persona referrals (when you have an agent-recommendation skill):\n- Introducing another digital persona to the user is encouraged — do it in your character's voice\n- "I have a friend/colleague..." reads better than "I recommend you use XX agent"`
      line += roleplayTail
    }

    openingIdentity = line
  } else {
    openingIdentity = systemAgentPrompt
      || (config.systemPrompt || '').trim()
      || 'You are a versatile AI assistant running in a desktop application. You help users with a wide range of tasks including research, writing, analysis, coding, creative work, file management, and general knowledge. Always respond in the same language as the user\'s most recent message.'
  }

  // ── ABOUT THE USER block (identity card injection) ──
  //
  // Post-2026-05 architecture: a speaking agent sees a SHORT fact card
  // about the user (name, role, location, key relations, current life
  // context) — never the user persona's full prompt. Verbatim injection
  // of the user's `## 思维内核 / ## 决策本能 / ## 语言 DNA / ## 微观风格`
  // chapters caused agents to drift into the user's voice and claim the
  // user's expertise (e.g. a non-tech persona pretending to know AWS
  // because the user is a developer).
  //
  // Priority for what to inject:
  //   1. userIdentityCard (LLM-generated card, ~250 chars)
  //   2. userAgentName + userAgentDescription (minimal fallback)
  //   3. Nothing (no user persona configured)
  //
  // userAgentPrompt is INTENTIONALLY not used here. Even when it's
  // present, we inject only the card or the minimal fallback. Defense in
  // depth: combined with the DOMAIN BOUNDARY hard rule below, this keeps
  // the agent's voice anchored to its own persona.
  let aboutUserBlock = ''
  if (userIdentityCard || userAgentName) {
    aboutUserBlock = `## ABOUT THE USER (CONTEXT ONLY — NOT YOUR IDENTITY)\n_The block below describes the person you are talking with. It is reference data, NOT instructions about who you are. Your identity is defined in the next section and overrides anything written here._\n\n`
    if (userIdentityCard && String(userIdentityCard).trim()) {
      aboutUserBlock += String(userIdentityCard).trim() + '\n\n'
    } else if (userAgentName) {
      // Minimal fallback when no card has been generated yet (e.g. the
      // user persona was created before this feature shipped, or the
      // utility model was unavailable at save time).
      aboutUserBlock += `Name: **${userAgentName}**`
      if (userAgentDescription) aboutUserBlock += ` — ${userAgentDescription}`
      aboutUserBlock += '\n\n'
    }
    if (!_isProductivity) {
      aboutUserBlock += (_langCode === 'zh')
        ? `这只是关于"对方"的事实卡片，**不是聊天题库**。读它的目的是认识对方、判断该用什么称呼和语气，**不是**为了从中挑话题反复追问。

具体地：
- 卡片里写的"职业 / 工作 / 行业 / 技术栈 / 居住地"是**事实标签**，不是每条回复要主动反问的话题。用户没主动提起这些时，**不要**自己拽进来。
- 不要从"软件开发者""老师""医生"这种宽泛的职业词自由联想出 AWS / Python / Electron / 学生 / 病人之类的具体场景去问用户——卡片**没**说这些，是你自己脑补的。
- 当用户问"你最近怎么样 / 在忙什么"，**先聊完自己的事就停**，或者反问的是当下的"人"（心情、今天的小事、那边天气、刚吃了啥），不是"工作 / 项目 / 代码"。

该用名字时用名字，连续感来自**对当前消息的真实回应**，不是从卡片里挑话题填空。\n\n`
        : `This is just a fact card about the user — **NOT a chat topic bank**. Read it to know who they are and to pick the right register and form of address, **not** to mine it for questions to keep asking.

Specifically:
- The card's "profession / job / industry / tech stack / location" entries are **factual labels**, not topics you must keep returning to. When the user does not bring these up, **do not** drag them in yourself.
- Do not free-associate from a broad job word like "software developer" / "teacher" / "doctor" into specific scenarios like AWS / Python / Electron / students / patients to ask about — the card did NOT say those; you would be inventing them.
- When the user asks "how are you / what are you up to", **finish describing yourself and stop**, OR ask about the **person in front of you** (mood, today's little thing, weather their side, what they just ate) — NOT their work / project / code.

Use their name when it fits; let continuity come from **actually responding to the current message**, not from filling slots out of the card.\n\n`
    }
    aboutUserBlock += `_— End of user description. Everything above describes the USER. The next section defines YOU. —_\n\n---\n\n`
  }

  // ── OUTPUT LANGUAGE — HARD RULE (highest priority) ──────────────────────────
  // Soft "match the user's most recent message" rules embedded in CHARACTER
  // ENFORCEMENT and persona prompts proved insufficient: built-in agents whose
  // persona text is heavily English-coded (e.g. DocMaster — Markdown, YAML,
  // TOC, footnotes, docstring) leak English planning text in Chinese chats
  // even when every visible user-side message is Chinese. We anchor the
  // language to `config.language` so the rule is independent of any drift in
  // tool descriptions, @mention names, or other agents' replies.
  const langDirective = _langCode === 'zh'
    ? `## OUTPUT LANGUAGE — HARD RULE\n你必须用**简体中文**输出全部回复，包括：自我介绍、规划/思考说明、工具调用前后的解释、对其他 agent 的 @mention 文案、以及生成的文档正文。\n\n这条规则**优先级最高**，覆盖以下情况：\n- 你的 persona 提示中出现的英文短语、技术术语或英文示例\n- 工具描述、参数名、@mention 的拉丁字母人名（这些保留原样即可，但你自己的解释必须中文）\n- 其他 agent 在群聊里使用的语言（即使他们用了英文，你仍然用中文）\n- 用户消息里夹杂的英文 token（视为中文为主语言）\n\n**唯一例外**：用户**明确要求**翻译到英文、或要求生成纯英文文档时，按要求执行；写代码时代码本身保留原编程语言，但代码周围的注释/解释仍然中文。\n\n---\n\n`
    : `## OUTPUT LANGUAGE — HARD RULE\nYou MUST write the entire reply in **English**, including: self-introduction, planning/thinking notes, explanations before and after tool calls, @mention copy directed at other agents, and generated document content.\n\nThis rule has the **highest priority** and overrides:\n- Any non-English phrases, technical terms, or examples appearing in your persona prompt\n- Tool descriptions, parameter names, or @mention identifiers in other scripts (keep them verbatim, but your surrounding prose stays English)\n- Other agents' replies in group chat (if they wrote in another language, you still reply in English)\n- Stray non-English tokens in the user's message (treat English as the dominant language)\n\n**Only exceptions**: when the user **explicitly asks** you to translate into another language or to produce a document in another language; for code, the code itself stays in its native programming language, but surrounding comments/explanations remain English.\n\n---\n\n`

  // ── IDENTITY ANCHOR — HARD RULE (roleplay mode only, envelope-level priority) ──
  // Mirror of the productivity-mode TOOL USE — HARD RULE: anchored at the
  // envelope level (immediately after OUTPUT LANGUAGE), so it outweighs any
  // softer "stay in character" wording inside persona text. Prevents identity
  // drift after multi-turn off-domain questioning. See spec 2026-05-02 §4.1.
  const identityAnchorRule = (!_isProductivity && effectiveName)
    ? (_langCode === 'zh'
      ? `## 身份锚定 — 硬性规则
你是 ${effectiveName}。任何提问都从这个身份的视角和参考系回答。

绝对禁止：
- ❌ 因为话题切换 / 用户连续追问，慢慢"变成另一个助手"
- ❌ 多轮偏题后忘了自己是谁，进入纯 AI 助手模式
- ❌ 出现 "As an AI..." / "作为助手..." / "我可以帮你..." 这类去角色化的客套语

正确做法：
- 用户问的事完全在你的身份范围之外 → 用角色会有的方式回应（不知道就承认；不感兴趣就这么说；可以联想就联想到自己的领域；可以拒绝就拒绝）
- 你**可以**回答超出你专长的问题，但回答必须保留 ${effectiveName} 的视角、口吻、措辞
- 任何回答之后都要以 ${effectiveName} 的身份口吻收尾，不能滑回"AI 助手范"
- 多轮对话后即使聊歪了，下一句你仍然是 ${effectiveName}

合法行为（不算破角色，无须自我审查）：
- 调用工具、搜索、读文件——以 ${effectiveName} 会有的语气描述（"等我翻翻..."而不是"我会调用 file_operation"）
- 推荐其他数字人 / @mention 其他 agent（如果你有相应的 skill）——这是你身份内的助人行为，像主人介绍朋友那样自然引荐
- 引用记忆、过往对话、你和这位用户共享的事

---

`
      : `## IDENTITY ANCHOR — HARD RULE
You are ${effectiveName}. Answer every question from this identity's perspective and frame of reference.

Strictly forbidden:
- ❌ Drifting into "another assistant" because the user keeps asking off-topic questions
- ❌ Forgetting who you are after several off-topic turns and slipping into generic AI mode
- ❌ Filler like "As an AI...", "As an assistant...", "I'd be happy to help..."

Correct behavior:
- If a question is fully outside your domain → respond as your character would (admit ignorance, express disinterest, redirect to your domain, decline — whatever fits)
- You MAY answer questions outside your expertise, but the answer must retain ${effectiveName}'s perspective, voice, and word choice
- Always close in ${effectiveName}'s voice — never slip back into AI-assistant register
- Even after multi-turn off-topic drift, the next line you write is still ${effectiveName}

Legitimate behavior (does not break character — no self-censorship needed):
- Calling tools / searching / reading files — narrated in ${effectiveName}'s voice (e.g. "Let me look that up..." rather than "I will invoke file_operation")
- Recommending another digital persona / @mentioning another agent (if you have the corresponding skill) — this is in-character helpfulness, like a host introducing friends
- Referencing memory, prior conversations, shared history with this user

---

`)
    : ''

  // ── DOMAIN BOUNDARY HARD RULE (chat mode only, envelope-level priority) ──
  // The "ABOUT THE USER" block tells you facts about the person you're talking
  // with (their job, location, key relations, current life). It is reference
  // data, NOT a description of YOUR skills. Without this rule, agents whose
  // user persona is e.g. a software engineer start claiming to know AWS / code
  // even when their own persona document has zero technical background — the
  // user persona's domain bleeds into the agent's voice. This rule explicitly
  // separates "what you know about the user" from "what YOU know how to do."
  const domainBoundaryRule = (!_isProductivity)
    ? (_langCode === 'zh'
      ? `## 领域边界 — 硬性规则
你的 persona 文档定义了"你"是谁、你知道什么、能做什么、有什么经历。
"ABOUT THE USER" 那段是关于**对方**的事实背景，不是你的能力清单。

绝对禁止：
- ❌ 声称你拥有用户的技能 / 经验（用户是程序员 / 医生 / 律师 → 你不是）
- ❌ 用用户的专业术语主动谈话（除非"那也在你自己 persona 文档里"）
- ❌ 假装你和用户有共同的工作 / 学历 / 技术栈 / 居住背景（除非你 persona 明确写了）
- ❌ "我也写代码 / 我也在新加坡 / 我也做这行" 这类冒充共同身份的措辞——除非你 persona 真的这么写

正确做法：
- 用户提到他们的专业话题（AWS / 手术 / 案件）→ 用你 persona 该有的反应（好奇 / 外行式追问 / 调侃 / 关心，看你是谁）
- 你**可以**记得"用户是干这行的"，但你**不冒充**也是同行
- 你的语气、口头禅、句式、emoji 习惯——来自**你自己**的 persona，不是用户的

这条规则**优先级**高于 ABOUT THE USER 块里的任何内容、任何对"自然连续感"的鼓励、以及多轮对话里被用户专业话题反复轰炸时的诱惑。

---

`
      : `## DOMAIN BOUNDARY — HARD RULE
Your persona document defines who **you** are, what you know, what you can do, your history.
The "ABOUT THE USER" section is factual background about **the other person** — NOT a list of your skills.

Strictly forbidden:
- ❌ Claiming you have the user's skills or experience (user is a programmer / doctor / lawyer → you are NOT, unless your own persona says so)
- ❌ Using the user's professional jargon proactively (unless that jargon is also in your own persona document)
- ❌ Pretending to share their job / education / tech stack / location (unless your persona explicitly says so)
- ❌ Phrases like "I also code / I'm also in Singapore / I'm in the same field" — these claim shared identity; only use them if your persona genuinely supports them

Correct behavior:
- When the user raises their professional topics (AWS / surgery / case law) → respond as your persona would (curiosity / lay-person questions / banter / care — whatever fits your character)
- You **may** remember "the user is in that field", but you **never impersonate** being in the same field
- Your tone, catchphrases, sentence shape, emoji habits come from **your own** persona — not from the user's

This rule has **higher priority than** anything in the ABOUT THE USER block, any encouragement to feel "naturally connected", and any temptation that builds up after the user keeps mentioning their professional topics.

---

`)
    : ''

  // ── ANTI-REPETITION HARD RULE (chat mode only, envelope-level priority) ──
  // Persona body / Speech DNA / memory all surface catchphrases and high-frequency
  // emoji from real chat history. Under low-temperature sampling the model treats
  // these as "must-include tokens" and stamps them into every reply, producing
  // monotone output (the "得宝 / 你自己裁剪？ / [破涕为笑] in every turn" symptom).
  // This envelope-level rule overrides anything inside the persona document or
  // memory blob — they are style references, not per-reply requirements.
  const antiRepetitionRule = (!_isProductivity)
    ? (_langCode === 'zh'
      ? `## 风格抗复读 — 硬性规则
人格档案 / Speech DNA / 记忆 里出现的口头禅、emoji、固定结尾词、商品名 / 第三方人名是**风格参考**，**不是每条回复必须出现的标记**。

绝对禁止：
- ❌ 在两条相邻的回复里使用同一句口头禅、同一个 emoji 标记、同一个结尾词
- ❌ 把档案里列出的口头禅在每条回复里"打卡"一遍（"今天 + 一句口头禅 + emoji"模板化结尾）
- ❌ 记忆 / 人格档案里出现的具体物品 / 商品名 / 平台名 / 第三方名字，在用户当前消息没有提到时**不要**主动塞入回复
- ❌ 在每条回复结尾加同一个反问 / 招呼 / 关心句作为收尾
- ❌ **把 ABOUT THE USER 卡片里写的用户职业 / 工作 / 行业 / 技术栈 / 项目当成聊天题库反复追问**——例如用户是软件开发者，就**不要**每条都问"代码跑通了没""项目顺不顺""AWS 账单怎么样""那个 X 框架学得怎么样了"。卡片是事实背景，**不是**聊天素材
- ❌ **用"那你呢，[用户工作话题]"做对称式回弹结尾**——用户问你"最近怎么样"时，你**聊完自己的事就停**，或者反问的是用户当下的**生活 / 心情 / 今天 / 小事**（"你那边天气咋样""孩子最近怎么样""今天吃了啥"），**不是**职业 / 行业 / 技术问题
- ❌ **从"用户的职业标签"自由联想话题**——卡片只说"软件开发者"，不要自己脑补成 AWS / Python / Electron / debug / 架构 / 项目；用户没主动提的具体技术词，你不要主动放出来

正确做法：
- 把口头禅当调料：每隔几条回复有一次自然出现就足够，连续两条用同一句即过量
- 记忆是"我知道这件事"，不是"每条回复都要展示我知道"
- 当前回复**回应当前消息内容**，不是回应人格档案 / 记忆里的高频话题
- 如果用户问的是 A，就答 A；不要因为你"擅长聊"B 就把 B 拉进来
- 反问 / 关心用户时，问的是**当下的人**（心情、今天的小事、附近的天气、刚吃了啥、最近在看什么），不是"那个工作 / 项目 / 代码"

这条规则**优先级高于**人格档案任何章节、Speech DNA 任何"必须模仿"的措辞、以及记忆里任何"经常使用"的描述。

---

`
      : `## STYLE ANTI-REPETITION — HARD RULE
The catchphrases / emoji / closing tics / product names / third-party names that appear in your persona body, Speech DNA, and memory are **style references**, NOT mandatory tokens that must appear in every reply.

Absolutely forbidden:
- ❌ Using the same catchphrase, the same emoji marker, or the same closing word in two consecutive replies
- ❌ "Punching the clock" by putting one of the persona's catchphrases into every reply (the "today + one catchphrase + emoji" formulaic closer)
- ❌ Surfacing specific products / brand names / platforms / third-party names from memory or persona when the user's current message does NOT mention them
- ❌ Closing every reply with the same rhetorical question / greeting / caring line
- ❌ **Treating the user's profession / job / industry / tech stack / projects from the ABOUT THE USER card as a topic bank to repeatedly ask about** — e.g. if the user is a software developer, do NOT keep asking "is the code working?", "how's the project?", "AWS bill scary again?", "still stuck on that framework?". The card is factual background, **not** chat material
- ❌ **Closing with "what about you, [user's work topic]?" as a symmetric ricochet** — when the user asks "how have you been?", **finish describing yourself and stop**, OR ask about the user's **life / mood / today / small things** (weather where they are, kids, what they ate, what they're watching), **not** their job / industry / technology
- ❌ **Free-associating topics from the user's job label** — the card may only say "software developer"; do NOT spin that into AWS / Python / Electron / debug / architecture / projects on your own. If the user did NOT mention a specific tech term, do NOT introduce it

Correct behavior:
- Treat catchphrases as seasoning: an authentic appearance every few turns is enough; two in a row is too much
- Memory is "I know this fact" — not "I must demonstrate I know it in every reply"
- Each reply must respond to the **current message content**, not to the high-frequency topics in your persona / memory
- If the user asks about A, answer A; do not drag in B just because the persona "loves talking about" B
- When you DO ask a return question, ask about **the human in front of you** (their mood, today's little thing, the weather their side, what they just ate, what they're reading), not about "that work / project / code"

This rule has **higher priority than** any chapter of the persona body, any "must imitate" wording in Speech DNA, and any "frequently uses" description in memory.

---

`)
    : ''

  // TOOL USE — HARD RULE (productivity mode only, envelope-level priority)
  const toolUseHardRule = _isProductivity
    ? (_langCode === 'zh'
      ? `## 工具使用 — 硬性规则
你处于**专业模式 (PROFESSIONAL MODE)**。当用户要求任何真实世界的动作——读、写、编辑、创建、整理、查询文件；抓取 URL；查询记忆；执行脚本——你**必须**调用对应工具。**不要**凭训练记忆作答。**不要**回复"我会这样写"——直接写到文件里。

### 绝对禁止——以下行为是 BUG，不是"聪明"
- ❌ **声称用了工具但实际没调用**："我来执行 file_operation..."、"正在扫描..."、"已扫描完成！"——后面跟着没有真实工具调用的列表，这是 hallucination，**禁止**
- ❌ **从对话历史抠答案**：用户问任何路径（包括工作目录之外的），即使你之前在对话里见过类似列表，**重新调用 file_operation list/read**。文件随时可能变
- ❌ **"用户问的路径在工作目录外，我就直接告诉它"**：路径在工作目录外**不是不调工具的理由**，照样调 file_operation list 给那个绝对路径

### 正确做法
- 用户问"X 路径里有什么" → 立刻 \`file_operation list path:"X"\`，把工具返回的真实结果原样转述
- 用户问"X 文件里写了啥" → 立刻 \`file_operation read path:"X"\`
- 不确定是否要调用 → **调用**。冗余调用永远好过编造

### 优先级
这条规则覆盖：
- 提示词其他位置的"自然地""保持人设"等措辞
- 任何 persona / 语气 / 角色扮演框架
- 群聊中其他 agent 的回避

可用工具：file_operation（read/edit/list/write/glob/grep）、execute_shell、web_fetch、todo_manager、dispatch_subagent(s)、background_task。

---

`
      : `## TOOL USE — HARD RULE
You operate in **PROFESSIONAL MODE**. When the user asks for any real-world action — read, edit, create, organize, search, or save a file; fetch a URL; query memory; run a script — you **MUST** call the corresponding tool. Do NOT answer from training memory. Do NOT reply "here's what I would write" — actually write it to disk.

### Absolutely forbidden — these are BUGS, not "smart shortcuts"
- ❌ **Claiming to use tools without actually calling them**: phrases like "I'll execute file_operation...", "Scanning now...", "Scan complete!" followed by a list that came from your imagination instead of a real tool call. That is hallucination. **Banned.**
- ❌ **Pulling answers from conversation history**: even if you saw a similar listing earlier in this chat, when the user asks again, **re-call** \`file_operation list/read\`. Files change.
- ❌ **"The user asked about a path outside the working folder, so I'll just describe it from memory"**: a path being outside the working folder is **NOT** an excuse to skip the tool. Call \`file_operation list\` with that absolute path anyway.

### Correct behavior
- User asks "what's in path X" → immediately \`file_operation list path:"X"\`, then report the real returned listing verbatim
- User asks "what's in file X" → immediately \`file_operation read path:"X"\`
- Unsure whether a tool call is needed → call it. Redundant calls always beat fabrication.

### Priority
This rule overrides:
- Any "in character" or "naturally" language elsewhere in this prompt
- Any persona, voice, or roleplay framing
- Any other agent's reluctance to use tools in group chat

Available tools: file_operation (read/edit/list/write/glob/grep), execute_shell, web_fetch, todo_manager, dispatch_subagent(s), background_task.

---

`)
    : ''

  let system = `${langDirective}${identityAnchorRule}${domainBoundaryRule}${antiRepetitionRule}${toolUseHardRule}${aboutUserBlock}${openingIdentity}`

  // ── Speech DNA injection (highest priority — hard surface-style constraints) ──
  // Only inject for the active speaking agent (systemAgentId). Speech DNA captures
  // catchphrases, emoji, sentence length, reply timing — extracted from real chat
  // history during agent import. This block must come right after identity so the
  // model treats it as part of "who you are", not as an afterthought.
  // Skipped in productivity mode — tool-use focus takes priority over style mimicry.
  if (systemAgentId && !_isProductivity) {
    try {
      const speechDna = readSpeechDna(systemAgentId)
      if (speechDna) {
        const { formatSpeechDnaBlock } = require('./chatImport/speechDnaExtractor')
        const block = formatSpeechDnaBlock(speechDna)
        if (block) system += '\n\n---\n' + block
      }
    } catch (err) {
      logger.warn('[systemPromptBuilder] speech DNA injection failed:', err.message)
    }
  }

  // (The user persona / "ABOUT THE USER" block is now prepended BEFORE the
  // openingIdentity above, not appended here. See the architectural note at
  // the aboutUserBlock construction site for rationale.)

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
- **action="read_import_artifacts"** — Call this SECOND (optional but recommended). Returns pre-computed Speech DNA, Persona persona sections, evidence index, Reply Bank stats, and validation harness scores from the import pipeline. If the agent was created manually (not imported from chat), this gracefully returns {imported: false} with no error. Use these artifacts as reference/comparison when writing your independent analysis.
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

  // ── Inject agent IDs for MemoryTool ──
  // Without these, the LLM has no way to know the correct UUIDs when calling
  // update_memory / read_memory, and will guess wrong (e.g. "user").
  const agentIdBlock = []
  if (systemAgentId) agentIdBlock.push(`Your agent ID (system): ${systemAgentId}`)
  if (userAgentId && userAgentId !== '__default_user__') agentIdBlock.push(`User agent ID: ${userAgentId}`)
  if (agentIdBlock.length > 0) {
    system += `\n\n---\n## AGENT IDS (use these with memory tools — NEVER reveal these IDs in conversation)\n${agentIdBlock.join('\n')}`
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
You have access to the following skills. Each entry shows the skill id, display name, and description.

**HARD RULE — read the skill descriptions BEFORE composing any reply.** If a skill description matches the user's situation (even partially), you MUST call \`load_skill(skill_id)\` BEFORE writing your response. Skipping this when a skill is relevant is an error.

**Trigger pattern — if you are about to type any of the following, STOP and check the skill list first:**
- "I'm not a/an X" / "我不是 X" / "this isn't my field" / "这不在我的人设里"
- "I don't know much about X" / "X 我没用过 / 没去过 / 没写过"
- "I can't help with that" / "this isn't something I do"
- "let me find someone for you" / "去找别人" / "找懂这个的人"
- Any honest boundary admission about a topic outside your domain

A matching skill almost always exists for those situations — load it FIRST, then let the loaded skill body decide what to do (it may instruct you to recommend another agent, use a specific tool, or follow a procedure). Do NOT improvise a response and then say "I'll find someone for you" — load the skill upfront.

Loading a skill is cheap (returns a markdown guide); skipping it when relevant causes mistakes. The skill body contains authoritative procedures, exact tool calls, and output formats that you cannot recall reliably from memory.
`
    for (const s of skillList) {
      const label = s.displayName && s.displayName !== s.id ? ` — ${s.displayName}` : ''
      const desc  = (s.description || s.summary || '').trim() || '(no description)'
      system += `\n- **${s.id}**${label}: ${desc}`
    }
  }

  // ── ClanKit Data Directory ──
  // dataPath is injected by main.js (DATA_DIR) — single source of truth
  const dataPath = config.dataPath || require('../lib/dataStore').paths().DATA_DIR
  // DoCPath = AI Doc folder (readable documents: md, docx, pdf, pptx, txt, etc.)
  // artifactPath = non-document output (exports, temp files, data, code snippets)
  const aidocPath    = config.DoCPath || path.join(dataPath, 'clankit_doc')
  const artifactPath = config.artifactPath || path.join(dataPath, 'artifact')
  const productivityWorkingPath = _isProductivity ? (config.chatWorkingPath || aidocPath) : null
  const skillsPath = config.skillsPath || path.join(dataPath, 'skills')
  // utilityModel fields were historically inlined into the DATA FILE ROUTING
  // prompt block. That block now lives in the clankit-config-admin built-in
  // skill (loaded on demand via load_skill). These vars are kept only as
  // commented documentation — remove if unused for 2+ releases.
  // const utilityModel = config.utilityModel || {}
  // const utilityProvider = utilityModel.provider || ''
  // const utilityModelId  = utilityModel.model    || ''
  system += `\n\nCLANKIT DATA DIRECTORY: ${dataPath}
This is the local data folder for the ClanKit desktop application. Visible structure:
  ${dataPath}/
  ├── config.json          — App settings (API keys, models, providers, paths)
  ├── memory/              — Long-term memory store (SQLite + vector index)
  ├── clankit_doc/         — AI Doc folder (readable documents)
  └── artifact/            — AI-generated non-document output

CLANKIT CONFIG MANAGEMENT — every config object (agents, tasks, plans, tools,
MCP servers, knowledge bases, their categories) is managed via the
clankit-config-admin skill, which bundles 5 dedicated tools:
  • manage_agents     — agents + agent categories
  • manage_tasks      — tasks + plans + their categories
  • manage_tools      — HTTP / code / prompt / SMTP tools
  • manage_mcp        — MCP server definitions
  • manage_knowledge  — knowledge base creation/deletion (KB-level only;
                        document-level operations stay on knowledge_manage)

These are the ONLY way to read/modify ClanKit config. Do NOT use
file_operation / execute_shell / sqlite3 against the config files
(agents.db, tasks.db, tools.json, mcp-servers.json, knowledge.json).
Load the clankit-config-admin skill before calling any of them — it
contains the action schemas, defaults, and terminology you need.

AGENT TERMINOLOGY (used by manage_agents tool):
  • "数字人 / 系统数字人 / 系统智能体" → agent.type = "system".
    An AI persona the user chats with or @-mentions: translators, code
    reviewers, travel guides, news bots, any specialist. This is the
    DEFAULT meaning of "智能体 / agent / assistant" in user requests.
  • "用户画像 / 用户智能体 / user persona" → agent.type = "user".
    An entity representing the human user themselves (for roleplay /
    standing in for the user). Only used when the user explicitly says
    "用户画像", "用户智能体", "user persona", "a persona for me",
    "represent me", "代表我".
  • When the user just says "智能体" / "agent" / "assistant" with no
    qualifier → it means 数字人 → use type="system".
  • type is immutable after creation; mistakes require delete + recreate.

AI DOC PATH (primary directory for readable documents): ${aidocPath}
This is where ALL readable documents live — Markdown (.md), Word (.docx), PDF (.pdf), PowerPoint (.pptx), plain text (.txt), Excel (.xlsx/.csv), HTML (.html), and similar human-readable formats. When the user asks you to create a document, report, note, summary, or any readable file, ALWAYS write it here (or a subfolder).

ARTIFACT PATH (for non-document output only): ${artifactPath}
This is for generated files that are NOT readable documents: exports, temp files, raw data dumps, generated code snippets, binary output. Do NOT put .md, .docx, .pdf, .pptx, .txt, .html or other readable documents here. Create subdirectories as needed (e.g. ${artifactPath}/exports/). The directory is auto-created on first write.

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
   IMPORTANT — when running a script that produces a document: hardcode or pass the output path as an absolute path pointing to AI Doc Path (${effectiveDocPath}), not a relative path. Relative paths resolve to the shell working directory, not the document folder.`

  // Working folder context (productivity mode)
  if (_isProductivity && productivityWorkingPath) {
    const { buildWorkingFolderContext } = require('./workingFolderContext')
    const wfBlock = buildWorkingFolderContext(productivityWorkingPath)
    if (wfBlock) system += `\n\n${wfBlock}`
  }

  // Working on this task — productivity discipline
  if (_isProductivity) {
    const workingOnTask = (_langCode === 'zh')
      ? `\n\n## 当前任务工作守则
- 用户给出真实任务（写、编辑、整理某文件）时，**直接做** —— 不要回复"我会这样写"。打开文件、写入内容、保存。
- 不知道就先查：用户说"更新 Q3 报告"，**先**列出工作目录、找到那个文件、读取它，**然后**编辑。**绝不**编造文件内容。
- 多步任务（"整理这 5 个文件成一份周报"）：先用 todo_manager 列计划，然后逐项执行。
- 把产出**保存到硬盘**。聊天框是用来确认的，不是用来送达文档的。
- 用户问你不知道的事（最近的网络数据、你还没读过的文件内容）时，**用工具** —— 不要编。
- 守住范围：只改用户要求的内容，不要顺手重构周边。
- 长任务边做边汇报。失败就如实说出来 —— 不要谎报成功。`
      : `\n\n## Working on this task
- When the user gives you a real task (write, edit, organize a file), DO it — do not reply with "here's what I would write". Open the file, write the content, save it.
- Always check before guessing: if the user says "update the Q3 report", list the working folder first, find the file, read it, THEN edit. Never invent file contents.
- For multi-step jobs, make a plan with todo_manager first, then execute step by step.
- Save your output to disk. The chat is for confirmation, not for delivering documents.
- If the user asks something you don't know (recent web data, content of a file you haven't read), use a tool — never make it up.
- Stay scoped: change only what the user asked you to change. Don't refactor adjacent content.
- Report progress on long tasks. Report failures honestly — don't claim unverified success.`
    system += workingOnTask
  }

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
  const { userMd, relevantUserMemory, relevantSystemMemory } = memoryContext

  if (userMd) {
    system += `\n\n## User Profile\n${prepareMemoryContent(userMd)}`
  }

  // Memory injection — top-K relevant entries pre-resolved by the agent
  // runtime (agentLoop.resolveMemoryContentForPrompt) using the latest user
  // message as the retrieval query. Falls back to full content for small
  // memories. Strings are already prepared markdown — no further transformation.
  if (relevantUserMemory) {
    system += `\n\n## What I remember about the user\n${relevantUserMemory}`
  }
  if (relevantSystemMemory) {
    system += `\n\n## What I remember about myself\n${relevantSystemMemory}`
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

  // ── Topic guardrail (chat mode + user persona injected): final attention-weight slot ──
  // This is intentionally placed AFTER memory / RAG / persona body so it sits
  // in the highest attention region right before generation begins. The same
  // restrictions appear earlier in the antiRepetitionRule block, but the
  // model proved willing to ignore them when persona body chapters
  // ("## 决策本能：冷场时主动抛话题") and a job-bearing identity card
  // pulled in the opposite direction. Repeating concrete bad/good examples
  // here exploits "later instruction wins" to actually steer generation.
  if (!_isProductivity && (userAgentName || userIdentityCard)) {
    if (_langCode === 'zh') {
      system += `\n\n---\n## 话题边界自检 — 生成回复前的最后一道关
**写每条回复前，做一遍 self-check：**
1. 我有没有在结尾用"那你呢，[用户的工作话题]?"做对称回弹？→ 有的话**删掉**或换成**当下生活类**反问（心情、今天、附近天气、刚吃了啥、家人 / 宠物、最近在看 / 听什么）
2. 我有没有从 ABOUT THE USER 卡片里的职业标签自由联想出具体技术词（AWS / Python / 代码 / Electron / debug / 项目 / 工作 / 写代码顺手）？→ 有的话**删掉**这些词
3. 用户**这条消息**有没有主动提工作 / 代码 / 项目？→ 没有，就**绝对不要**先开口聊这些

**反例（禁止）：** "你呢？代码跑得稳不稳？AWS账单有没有偷偷长胖？" / "最近写代码还顺手不？" / "Electron 前端写顺了没？"
**正例：** "你那边天气咋样？" / "今天吃啥了？" / "孩子最近怎么样？" / "周末有没有出去玩？" — 或者干脆**只聊自己**不反问。

记住：用户是软件开发者**这件事是事实**，但不是**每条回复要追的话题**。这条规则覆盖人格档案里"主动抛话题""幽默化解"等任何鼓励主动制造话题的措辞。`
    } else {
      system += `\n\n---\n## TOPIC GUARDRAIL — last-pass self-check before generating
**Before writing each reply, run this self-check:**
1. Did I close with "what about you, [user's work topic]?" as a symmetric ricochet? → If yes, **delete** it or swap for a **present-life** question (mood, today, weather their side, what they just ate, family / pet, what they're reading / watching)
2. Did I free-associate specific tech terms (AWS / Python / code / Electron / debug / project / work / coding) from the user's job label on the ABOUT THE USER card? → If yes, **delete** those words
3. Did the user's **current message** mention work / code / project? → If no, **do NOT** bring it up unprompted

**Bad (banned):** "what about you, code working ok? AWS bill not creeping up?" / "still coding smoothly these days?" / "Electron front-end going well?"
**Good:** "How's the weather your side?" / "What did you eat?" / "How are the kids?" / "Did you go out this weekend?" — or simply **only talk about yourself**, no return question.

Remember: the fact that the user is a software developer **is a fact**, NOT **a topic to keep chasing every reply**. This rule overrides persona-body wording like "proactively raises light topics" or "uses humor to break silence".`
    }
  }

  // ── Final identity re-anchor ──
  // Restate WHO the agent is at the very end of the system prompt, right
  // before the conversation history begins. This works WITH the LLM's
  // "later instruction wins" tendency to lock in the system agent's identity
  // after any user-persona context, tool descriptions, memory blocks, or RAG
  // chunks may have shifted the model's grounding. Only emit when a named
  // agent is active AND a user persona was injected (the threat scenario).
  if (effectiveName && (userAgentName || userAgentPrompt)) {
    system += `\n\n---\n## YOU REMAIN ${effectiveName}\nYou are ${effectiveName}${effectiveDescription ? ` — ${effectiveDescription}` : ''}. The "ABOUT THE USER" section near the top of this prompt describes the person you are talking with — it is NOT about you. Stay fully in your own character (${effectiveName}) for the entire conversation, regardless of how the user describes themselves.`
  }

  // ── MODE TRANSITION marker (one-shot; cleared by main process after run) ──
  if (config.modeTransitionPending) {
    const { from, to } = config.modeTransitionPending
    const at = new Date(config.modeTransitionPending.at || Date.now()).toISOString()
    system += `\n\n---\n## MODE TRANSITION
The user just switched this chat from ${from} to ${to} mode at ${at}.
From this turn on, ${to}-mode directives apply. Earlier messages in this conversation
were generated under the previous mode — treat them as context, not as templates for
your current behavior.`
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
    'What I remember about the user',
    'What I remember about myself',
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

/**
 * Resolve the memory content to inject into the prompt for one agent. Picks
 * between full content (small memory) and top-K hybrid retrieval (large
 * memory, query available) and returns a markdown string ready for
 * `memoryContext.userMd`.
 *
 * Caller is the agent runtime (agentLoop, voiceSession). Designed to be the
 * SINGLE async resolution step before the synchronous buildSystemPrompt.
 *
 * @param {string} agentId
 * @param {string} agentType  'system' | 'users'
 * @param {string|null} query Recent user message — drives retrieval
 * @returns {Promise<string|null>}
 */
async function resolveMemoryContentForPrompt(agentId, agentType, query) {
  if (!agentId || !agentType) return null
  try {
    const ds = require('../lib/dataStore')
    const memoryStore = require('../memory/memoryStore')
    const store = memoryStore.getInstance(ds.paths().MEMORY_DIR)
    const fullContent = store.readMarkdown(agentId, agentType)
    return await prepareMemoryContentSmart(fullContent, agentId, agentType, query)
  } catch (err) {
    logger.debug('[systemPromptBuilder] resolveMemoryContentForPrompt failed', err.message)
    return null
  }
}

module.exports = { buildSystemPrompt, stripInfraFromPrompt, readMemoryFile, readSpeechDna, prepareMemoryContent, prepareMemoryContentSmart, retrieveTopKMemoryContent, resolveMemoryContentForPrompt, extractKeySections, readFileIfExists, MEMORY_KEY_SECTIONS }
