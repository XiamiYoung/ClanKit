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
// Sections preserved when truncating large memory blobs. Includes both the old
// free-form sections AND the new Persona-methodology sections from chat import.
const MEMORY_KEY_SECTIONS = [
  // Persona-methodology sections (from chat import)
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
 *                                 userAgentDescription, groupChatContext, chatHandoverNote }
 * @param {string|null} userMemoryContent    Memory content for the user agent
 * @param {string|null} systemMemoryContent  Memory content for the system agent
 * @param {Array|null}  participantMemories  Memory content for group participants
 * @param {object} memoryContext { userMd, agentMemoryMd, todayLogMd, yesterdayLogMd, todayDate, yesterdayDate, historicalContext }
 * @param {object|null} ragContext           RAG retrieval results
 * @returns {string} The assembled system prompt
 */
function buildSystemPrompt(config, mcpServers, httpTools, enabledAgents, enabledSkills, { systemAgentPrompt, userAgentPrompt, systemAgentId, userAgentId, systemAgentName, systemAgentDescription, userAgentName, userAgentDescription, groupChatContext, chatHandoverNote, analysisTargetAgentId, analysisTargetAgentName, analysisTargetAgentType } = {}, userMemoryContent, systemMemoryContent, participantMemories, memoryContext = {}, ragContext = null) {
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

  // ── ABOUT THE USER block (built first, prepended before system identity) ──
  // Architectural fix for role confusion: user personas are written in the same
  // 2nd-person voice ("你是 X", "You are X") as system agents. If injected AFTER
  // the system agent identity, the LLM's "later instruction wins" tendency makes
  // the system agent adopt the user's identity. Solution: place the user
  // description FIRST as descriptive context, keep the system identity LAST,
  // and re-anchor the system identity at the very end of the prompt. We
  // explicitly frame the block as "describes them, not you" and bracket it
  // with end markers so the model treats it as data, not instructions.
  let aboutUserBlock = ''
  if (userAgentName || userAgentPrompt) {
    aboutUserBlock = `## ABOUT THE USER (CONTEXT ONLY — NOT YOUR IDENTITY)\n_The text in this section describes the person you are talking with. It is NOT instructions about who you are. Whenever it says "you", "your", "I am", "我是", "你是" etc., that refers to the USER, not you. Your own identity is defined in the next section and overrides anything written here._\n\n`
    if (userAgentName) {
      aboutUserBlock += `The user you are talking with is **${userAgentName}**`
      if (userAgentDescription) aboutUserBlock += ` — ${userAgentDescription}`
      aboutUserBlock += '.\n\n'
    }
    if (userAgentPrompt) {
      aboutUserBlock += userAgentPrompt + '\n\n'
    }
    if (!_isProductivity) {
      aboutUserBlock += (_langCode === 'zh')
        ? `基于上面的用户描述，自然地融入对话——合适时机用名字称呼、参考他/她的身份与近期生活、形成"我们之间"的连续感，而不是每次冷启动答题。\n\n`
        : `Based on the description above, weave the user naturally into the conversation — call them by name when fitting, reference their identity and recent life, build a sense of "us" rather than starting every reply from a cold Q&A baseline.\n\n`
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

  let system = `${langDirective}${identityAnchorRule}${toolUseHardRule}${aboutUserBlock}${openingIdentity}`

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
This is the local data folder for the ClanKit desktop application. Its structure:
  ${dataPath}/
  ├── config.json          — App settings (API keys, models, providers, paths)
  ├── mcp-servers.json     — MCP server definitions
  ├── tools.json           — HTTP tool definitions
  ├── knowledge.json       — RAG knowledge config
  ├── agents.db            — SQLite: AI agent definitions (kind, prompt, skills, etc.)
  ├── tasks.db             — SQLite: plans, tasks, runs, categories
  ├── chats.db             — SQLite: chat metadata + messages + FTS5 full-text index
  ├── memory/              — Long-term memory store (memory.db, memory-vec/)
  ├── clankit_doc/         — AI Doc folder (readable documents)
  └── artifact/            — AI-generated non-document output

NOTE on the .db files: agents, tasks, and chats are stored in SQLite, NOT in JSON files.
Do NOT try to read agents.json / tasks.json / chats/{id}.json — those files no longer
exist. To inspect or query agent / task / chat data, use the appropriate skill
(e.g. clankit-config-admin) or the dedicated tools — never attempt direct file I/O
against these database files.

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
