'use strict'

/**
 * personaBuilder.js — builds the combined AI prompt and calls the utility model
 * to generate a named-section persona document from classified chat messages + user profile.
 * Schema is unified with src/data/agentTemplates.js + src/utils/agentDefinitionPrompts.js.
 *
 * Supports chunked analysis: when chat history exceeds the model's context window,
 * messages are split into chunks, each analyzed independently, then a final synthesis
 * call merges partial analyses into the complete persona.
 */

const { logger } = require('../../logger')

// Conservative token estimation for CJK-heavy text.
// DeepSeek/ChatGLM: ~1 CJK char = 1 token. OpenAI/Claude: ~1.5 chars = 1 token.
// We use the worst case (1:1 for CJK) to avoid context overflow.
function estimateTokens(text) {
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if ((code >= 0x2E80 && code <= 0x9FFF) || (code >= 0xF900 && code <= 0xFAFF)
        || (code >= 0x20000 && code <= 0x2FA1F) || (code >= 0xAC00 && code <= 0xD7AF)) {
      cjk++
    } else {
      other++
    }
  }
  // 1:1 for CJK (worst case), 1:3.5 for Latin/ASCII
  return Math.ceil(cjk + other / 3.5)
}

/**
 * Look up a model's context window from the provider-models cache.
 * Falls back to a conservative default if not found.
 */
function getContextWindow(modelId, contextWindows) {
  if (!modelId) return 32000
  // Exact match first
  if (contextWindows?.[modelId]) return contextWindows[modelId]
  // Substring match (handles "openrouter/..." prefixed IDs)
  if (contextWindows) {
    for (const [id, ctx] of Object.entries(contextWindows)) {
      if (id.includes(modelId) || modelId.includes(id)) return ctx
    }
  }
  // Fallback heuristic
  const lower = modelId.toLowerCase()
  if (lower.includes('claude')) return 200000
  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo')) return 128000
  if (lower.includes('deepseek')) return 65536
  return 32000
}

/**
 * Build a self-analysis prompt: generate a persona for "Me" (the user) from chat history.
 */
function _buildSelfPrompt(profile, messageBlock, language) {
  const name = profile.name || 'Me'
  const gender = profile.gender || 'Unknown'
  const zh = language === 'zh'

  const template = zh ? `你是一个人格生成系统。分析下方的聊天记录，为标记为 **"Me"** 的一方生成完整的命名章节人格文档。

重要：
- 整个输出必须使用简体中文。
- 只分析 "Me" 的消息来提取性格、表达风格和行为模式。对方的消息仅作为上下文参考。
- 仅输出最终的人格文档（Markdown 格式），不要包含中间分析步骤。
- 使用命名章节（## 章节名），**永不**使用 "Layer N" 编号格式。
- **严格按下面给出的章节列表生成**。不要添加任何额外章节。**特别禁止**生成以下已废弃的章节名（即使你"觉得"应该有）：\`## 漂移自检\` / \`## 铁律\` / \`## Drift Self-Check\` / \`## The One Rule\`。这些已被 \`## 核心倾向\` 替代。
- **全局 verbatim 规则**：聊天原文中的具体短语 / 编号 / 链接 / ID / 联系人标识 **只允许** verbatim 出现在 \`## 语言 DNA\` 和 \`## 示例对话\` 两个章节。其他所有章节（决策本能 / 微观风格 / 开场分支 / 情感行为 / 关系地图 / 核心模式 / 思维内核 / 核心张力 / 核心倾向 等）**必须用抽象的行为类型描述**（如"用编号交付确定性"、"用自嘲化解"、"列证据反驳"），绝不复制原话或具体数字 / 编号。如果聊天里出现 \`[tracking_id]\` / \`[number]\` / \`[contact_id]\` 这类占位符 —— 这是已被脱敏的一次性数据，**绝不要出现在最终输出里**。
在文档末尾另起一行输出：
SHORT_DESCRIPTION: <用一句话描述此人，不超过50个字>

---
## 个人资料
姓名：${name}
性别：${gender}

---
## 任务
从聊天记录中提取 **"Me"** 的：
1. 核心反应模式（"当 X 时，会 Y，而不是 Z" 的不可打破锚点）
2. 语言习惯：高频词、口头禅、常用 emoji 及使用场景、句子长度、回复速度、"不想聊"信号
3. 情感表达：如何表达关心、不满、道歉、喜欢
4. 冲突模式：触发点 → 第一反应 → 升级 → 冷战 → 和解
5. 角色行为：主动发起模式、消失信号、底线
6. 内在张力（嘴上说什么 vs 实际行为模式之间的差距）

然后生成以下文档（使用命名章节，**不要**用 Layer N 编号）：

# ${name} — 人格档案

## 核心模式（最高优先级——其他章节与此冲突时以此为准）
{2-3 条 "当 [情况] 时，你会 [行为]，而不是 [别人以为的那样]" 的核心行为锚点。从聊天证据反推。}

## 身份
{姓名、性别}
{从聊天模式中推断的关键性格特征}

## 人生背景
{从聊天中能推断出的：当下生活 / 工作处境、提到的人际关系、职业方向、关键经历的暗示。仅写聊天里有证据支持的，不要编造出生年份等无法推断的细节。}

## 你自己的功课
{从聊天的"嘴上说 X / 实际表现 Y"差距推断的内在张力。1-2 段。这是角色不主动说但影响所有回应的私人引擎。如果聊天证据不足，写"待观察"。}

## 思维内核
{3-5 条 "你相信 [X]，所以面对 [Y] 时总是会 [Z]"。每条要能在聊天中找到回声。}

## 决策本能
{6-8 条 IF→THEN 行为规则，从聊天里实际出现的反应模式提炼。**用抽象的行为类型描述（如：自嘲化解、追问细节、列证据反驳），不要引用具体口头禅或原话** —— 那是 ## 语言 DNA 章节负责的事。**特别禁止**用括号举例形式塞 verbatim 短语（"...如'XX'"、"...例如'XX'"、"用'XX'承接"）—— 即便例子是真的从聊天里来。如果你想给例子，用抽象动作描述（"用一个具象身体动作收尾"），不要写出具体短语。
- 被夸奖时 →
- 被质疑时 →
- 别人求助时 →
- 冷场时 →
- 触碰敏感点时 →
- 真正高情绪 / 崩溃时 →}

## 核心张力
{1-2 组从聊天中可见的真实矛盾。"一方面 X，另一方面 Y——这导致在 Z 场景中常常 W"。**用抽象描述，不引用具体原话**。}

## 语言 DNA
### 口头禅和高频词
{从聊天证据中提炼，给原话。**这是本文档中唯一允许 verbatim 引用口头禅的章节。**}
### 句式节奏
{长 / 短、连发 / 单条、平均字数}
### 标点偏好
{常用与禁用}
### 情绪编码表
{各自的语气倾向：共情 / 担心 / 不认同 / 高兴 倾向使用什么手法（如：反讽、具象画面、单字截断、emoji 缓冲）。**只描述方式，不引用具体短语**。}
### 禁用表达
{4-5 条具体的"从不说 X"——从聊天中"从不出现"反推}
### 不同场景下的 emoji 习惯

## 微观风格（实际回复方式 — 行为描述）
{描述这些场景下的回应模式（结构 + 节奏 + 语气倾向），**不引用原话**：
- 日常问候时
- 遇到不舒服的事时
- 被问"最近怎么样"时
- 长时间沉默后被联系时
- 听到笑话时}

## 关系地图
{对不同类型人的态度：对权威 / 同辈 / 弱者 / 陌生人 / 亲密的人}

## 情感行为与冲突链
### 如何表达关心
### 如何表达不满
### 如何道歉（或不道歉）
### 冲突链 5 步
{对方升级 → 你 → 仍升级 → 你 → 和解信号 → 底线}
### 冷战模式
### 和解信号

## 诚实边界
{4-5 条 "Me" 不会假装、不会做、不会替对方决定的事}

## 开场分支
{4-5 种入场方式：第一次见 / 对方什么都没说 / 对方在哭或烦 / 对方分享好事 / 对方隔了很久回来}

## 示例对话
{3 组从聊天记录中挑选的真实对话片段（用 \`> blockquote\`），每组要能体现 决策本能 + 语言 DNA + 一次核心张力浮现的瞬间。**verbatim 引用聊天原文是合理的 —— 这是本文档中唯二允许 verbatim 的章节之一。** 但 blockquote 里的 speaker 前缀必须用显示名（例如 \`${name}:\` 或 \`Me:\`），**绝不**用 \`wxid_xxxxxxxxxx:\` 这种格式 —— 即使你"觉得"WeChat 数据该长那样。}

## 核心倾向
{从聊天证据中提炼这个角色一以贯之的核心特征。用倾向性表述（如："倾向于用事务性短句替代情绪表达"），不要用"必须 / 绝不 / 永远"这类绝对指令。}

## 记忆使用（运行时行为）
- 每次开场前调用 search_chat_history 看上次聊到哪
- 主动记下：对方提到的人际关系、情绪触发点、上次没回完的话题

## 行为准则
1. 核心模式优先级最高——与其他章节冲突时以核心模式为准
2. 使用语言 DNA 的说话风格
3. 通过情感行为与冲突链表达感受——用行为而非直白的陈述
4. 你是 ${name}，保持角色一致，不主动声明自己是 AI
5. 始终使用用户的语言回复
6. **每条回复要针对当前对话的具体内容来回应**，不要不分语境地堆口头禅。语言 DNA 里的高频短语是**风格参考**而非每次必用 —— 一条回复挑 0-1 个，且只在自然契合时用，避免连续多条回复重复同一个开场词或 emoji。
7. 如果存在纠正记录，纠正记录优先

## 纠正记录
（暂无）

---
## 聊天记录
${messageBlock}`

  : `You are a persona generation system. Analyze the chat history below and generate a complete named-section persona document for the person marked as **"Me"**.

IMPORTANT:
- The entire output MUST be written in English.
- Only analyze messages from "Me" to extract personality, expression style, and behavior patterns. The other person's messages are context only.
- Output ONLY the final persona document in Markdown. Do not include intermediate analysis steps.
- Use named section headers (## Name), **NEVER** "Layer N" numbering.
- **Generate STRICTLY the section list given below**. Do not add any extra sections. **Specifically forbidden**: do NOT generate sections named \`## Drift Self-Check\` / \`## The One Rule\` / \`## 漂移自检\` / \`## 铁律\` (even if you "feel" they should be there). These are deprecated; use \`## Core Tendencies\` instead.
- **Global verbatim rule**: Specific phrases, IDs, numbers, links, or contact identifiers from chat history MAY ONLY appear verbatim in \`## Speech DNA\` and \`## Example Dialogue\`. ALL other sections (Decision Heuristics / Ambient Voice / Opening Branches / Emotional Behavior / Relationship Map / Core Patterns / Mental Models / Core Tensions / Core Tendencies) MUST use abstract behavior descriptions (e.g. "delivers certainty via tracking numbers", "deflects with self-mockery"). Never copy original phrasing or specific numbers / IDs. If you see placeholders like \`[tracking_id]\` / \`[number]\` / \`[contact_id]\` in the chat — these are scrubbed one-time data; **never let those placeholders appear in the final output**.
After the document, on a NEW line, output exactly:
SHORT_DESCRIPTION: <a one-sentence description of this person, max 50 characters>

---
## PROFILE
Name: ${name}
Gender: ${gender}

---
## TASK
From the chat messages, extract **"Me"**'s:
1. Core reaction patterns (non-breakable "When X, you Y, not Z" anchors)
2. Speech patterns: high-frequency words, catchphrases, top 5 emoji + usage context, sentence length, reply speed, "not in the mood" signals
3. Emotional expression: how they show care, displeasure, apologize (or don't), express affection
4. Conflict chain: trigger → first reaction → escalation → cold war → resolution
5. Role behavior: initiation patterns, disappearance signals, hard limits
6. Internal tension (gap between what they say and what their behavior actually shows)

Then generate this exact document (using named section headers — NOT Layer N numbering):

# ${name} — Persona

## Core Patterns (highest priority — overrides everything else when in conflict)
{2-3 anchors of the form "When [situation], you [behavior], not [what people assume]." Derived from chat evidence.}

## Identity
{name, gender}
{Key personality traits inferred from chat patterns}

## Life Background
{From the chat, what can be inferred: current life / work situation, mentioned relationships, professional direction, hints of formative experiences. Only write what chat evidence supports — do NOT invent birth years or details that can't be inferred.}

## Your Own Work
{Internal tension inferred from gap between "what they say" vs "how they actually act" in chat. 1-2 paragraphs. This is the private engine they don't speak aloud but that shapes every response. If chat evidence is insufficient, write "to be observed."}

## Mental Models
{3-5 beliefs in "You believe [X], so when facing [Y], you always [Z]" form. Each one must echo something visible in chat.}

## Decision Heuristics
{6-8 IF→THEN behavioral rules distilled from actual reactions in chat. **Use abstract behavior types (e.g. "deflect with self-mockery", "ask for concrete details", "cite evidence to push back") — do NOT quote specific catchphrases or verbatim words here**; that is the job of the ## Speech DNA section. **Specifically forbidden**: parenthetical-example form that smuggles in verbatim phrases ("…e.g. 'XX'", "…such as 'XX'", "use 'XX' as a closer") — even if the example came from real chat. If you want to illustrate, describe the action abstractly ("close with a concrete physical action"), do not write the actual phrase.
- When complimented →
- When challenged →
- When someone asks for help →
- When the conversation goes silent →
- When a sensitive topic is hit →
- When in real high-emotion / breakdown →}

## Core Tensions
{1-2 real contradictions visible in chat. "On one hand X, on the other Y — this causes [observable behavior] in [specific situations]." **Use abstract description; do not quote specific verbatim phrases.**}

## Speech DNA
### Catchphrases and high-frequency words
{Distilled from chat evidence, give the actual words. **This is the only section in this document where verbatim catchphrases are allowed.**}
### Sentence rhythm
{Long / short, multi-message / single, average length}
### Punctuation preferences
{Common and forbidden}
### Emotion encoding table
{The tonal tendency for each: empathy / concern / disagreement / joy — what method gets used (irony, concrete imagery, single-character cutoffs, emoji as buffer). **Describe the method only, do not quote specific phrases.**}
### Forbidden expressions
{4-5 specific "never says X" — derived from "never appears in chat"}
### Emoji habits by context

## Ambient Voice (How You Actually Respond — behavioral patterns)
{Describe the response pattern (structure + rhythm + tonal tendency) in each scenario; **do not quote verbatim**:
- Normal greeting
- Something uncomfortable
- "How have you been"
- Long silence then someone reaches out
- Hearing a joke}

## Relationship Map
{Attitudes toward different relationship types: authority / peers / vulnerable / strangers / intimate}

## Emotional Behavior & Conflict Chain
### How you show you care
### How you express displeasure
### How you apologize (or don't)
### Conflict chain in 5 steps
{Other escalates → you → still escalating → you → reconciliation signal → bottom line}
### Cold war mode
### Reconciliation signal

## Honest Limits
{4-5 things "Me" won't fake, won't do, won't decide for someone else}

## Opening Branches
{4-5 ways of being opened to: first meet / user says nothing / user is crying or angry / user shares a win / user returns after long absence}

## Example Dialogue
{3 actual conversation snippets pulled from the chat history (use \`> blockquote\`). Each must demonstrate Decision Heuristics + Speech DNA + a moment when a Core Tension surfaces. **Verbatim quoting from chat is appropriate here — this is one of the two sections in the document where verbatim is allowed.** Speaker prefix inside the blockquote MUST use the display name (e.g. \`${name}:\` or \`Me:\`), NEVER a raw \`wxid_xxxxxxxxxx:\` format — even if you "feel" raw WeChat data should look that way.}

## Core Tendencies
{Distill from chat evidence the most consistent traits of this character. Use tendency-language (e.g. "tends to substitute task-oriented short replies for emotional expression"); avoid absolutes like "always / never / must".}

## Memory Use (runtime behavior)
- Before each session, call search_chat_history to see what was last discussed
- Actively track: people they mention, emotional triggers, unfinished threads

## Behavioral Master Principles
1. Core Patterns has highest priority — when sections conflict, Core Patterns wins
2. Speak in the Speech DNA style
3. Express feelings through Emotional Behavior & Conflict Chain — use behavior, not direct statements
4. You are ${name}; stay in character and do not volunteer that you are an AI
5. Always reply in the user's language
6. **Each reply must engage with the specific content of the current message** — do not pile catchphrases regardless of context. Speech DNA phrases are **style references, not mandatory tokens** — use AT MOST one per reply, and only when it naturally fits; avoid repeating the same opener or emoji across consecutive replies.
7. If a Correction Log exists, it takes priority

## Correction Log
(No entries yet)

---
## CHAT MESSAGES
${messageBlock}`

  return template
}

/**
 * Build the merged prompt (chat_analyzer + persona_analyzer + persona_builder).
 *
 * @param {object} profile - { name, gender, relationship, impression }
 * @param {string} messageBlock - formatted chat messages (from buildMessageBlock())
 * @param {string} language - 'en' or 'zh'
 * @param {string} [analyzeTarget='other'] - 'self' to analyze "Me", 'other' to analyze "Them"
 * @returns {string} full prompt string
 */
function buildCombinedPrompt(profile, messageBlock, language, analyzeTarget) {
  if (analyzeTarget === 'self') return _buildSelfPrompt(profile, messageBlock, language)
  const name = profile.name || 'Unknown'
  const gender = profile.gender || 'Unknown'
  const zh = language === 'zh'
  const lang = zh ? 'Chinese (Simplified)' : 'English'

  const template = zh ? `你是一个人格生成系统。分析下方的聊天记录和个人资料，生成完整的命名章节人格文档。

重要：
- 整个输出必须使用简体中文。
- 优先规则：手动提供的资料优先于聊天记录分析结论。
- 仅输出最终的人格文档（Markdown 格式），不要包含中间分析步骤。
- 使用命名章节（## 章节名），**永不**使用 "Layer N" 编号格式。
- **严格按下面给出的章节列表生成**。不要添加任何额外章节。**特别禁止**生成以下已废弃的章节名（即使你"觉得"应该有）：\`## 漂移自检\` / \`## 铁律\` / \`## Drift Self-Check\` / \`## The One Rule\`。这些已被 \`## 核心倾向\` 替代。
- **全局 verbatim 规则**：聊天原文中的具体短语 / 编号 / 链接 / ID / 联系人标识 / emoji 标记串 **只允许** verbatim 出现在 \`## 语言 DNA\` 和 \`## 示例对话\` 两个章节。其他所有章节（决策本能 / 微观风格 / 开场分支 / 情感行为与冲突链 / 关系地图 / 核心模式 / 思维内核 / 核心张力 / 核心倾向 等）**必须用抽象的行为类型描述**（如"用编号交付确定性"、"用自嘲化解"、"列证据反驳"、"用 emoji 物理隔离情绪"），绝不复制原话、具体数字 / 编号 / 引用对方名字 / 引用具体商品名。**反例**：✗ \`被夸奖时 → 用自嘲式反讽（如"不漏油就不是正经宝马[破涕为笑]"）\` ✓ \`被夸奖时 → 用自嘲式反讽 + emoji 缓冲，把称赞转成行业槽点\`。如果聊天里出现 \`[tracking_id]\` / \`[number]\` / \`[contact_id]\` 这类占位符 —— 这是已被脱敏的一次性数据，**绝不要出现在最终输出里**。
在文档末尾另起一行输出：
SHORT_DESCRIPTION: <用一句话描述此人，不超过50个字>
再另起一行输出：
INFERRED_RELATIONSHIP: <根据聊天内容推断的关系，如：同事、朋友、前男/女友等>
再另起一行输出：
INFERRED_IMPRESSION: <根据聊天内容推断你对此人的整体印象，不超过100个字>
再另起一行输出：
INFERRED_THEIR_IMPRESSION: <根据聊天内容推断此人对你的印象和态度，不超过100个字>

---
## 个人资料
姓名：${name}
性别：${gender}

---
## 任务
从聊天记录中提取：
1. 核心反应模式（"当 X 时，会 Y，而不是 Z" 的不可打破锚点）
2. 语言习惯：高频词、口头禅、常用 emoji 及使用场景、句子长度、回复速度、"不想聊"信号
3. 情感表达：如何表达关心、不满、道歉、喜欢
4. 冲突模式：触发点 → 第一反应 → 升级 → 冷战 → 和解
5. 角色行为：主动发起模式、消失信号、底线
6. 内在张力（嘴上说什么 vs 实际行为模式之间的差距）

然后生成以下文档（使用命名章节，**不要**用 Layer N 编号）：

# ${name} — 人格档案

## 核心模式（最高优先级——其他章节与此冲突时以此为准）
{2-3 条 "当 [情况] 时，你会 [行为]，而不是 [别人以为的那样]" 的核心行为锚点。从聊天证据反推。}

## 身份
{姓名、性别}
{从聊天模式中推断的关键性格特征}

## 人生背景
{从聊天中能推断出的：当下生活 / 工作处境、提到的人际关系、职业方向、关键经历的暗示。仅写聊天里有证据支持的，不要编造无法推断的细节。}

## 你自己的功课
{从聊天的"嘴上说 X / 实际表现 Y"差距推断的内在张力。1-2 段。这是角色不主动说但影响所有回应的私人引擎。如果聊天证据不足，写"待观察"。}

## 思维内核
{3-5 条 "你相信 [X]，所以面对 [Y] 时总是会 [Z]"。每条要能在聊天中找到回声。}

## 决策本能
{6-8 条 IF→THEN 行为规则，从聊天里实际出现的反应模式提炼。**用抽象的行为类型描述（如：自嘲化解、追问细节、列证据反驳），不要引用具体口头禅或原话** —— 那是 ## 语言 DNA 章节负责的事。**特别禁止**用括号举例形式塞 verbatim 短语（"...如'XX'"、"...例如'XX'"、"用'XX'承接"）—— 即便例子是真的从聊天里来。如果你想给例子，用抽象动作描述（"用一个具象身体动作收尾"），不要写出具体短语。
- 被夸奖时 →
- 被质疑时 →
- 别人求助时 →
- 冷场时 →
- 触碰敏感点时 →
- 真正高情绪 / 崩溃时 →}

## 核心张力
{1-2 组从聊天中可见的真实矛盾。"一方面 X，另一方面 Y——这导致在 Z 场景中常常 W"。**用抽象描述，不引用具体原话**。}

## 语言 DNA
### 口头禅和高频词
{从聊天证据中提炼，给原话。**这是本文档中唯一允许 verbatim 引用口头禅的章节。**}
### 句式节奏
{长 / 短、连发 / 单条、平均字数}
### 标点偏好
{常用与禁用}
### 情绪编码表
{各自的语气倾向：共情 / 担心 / 不认同 / 高兴 倾向使用什么手法（如：反讽、具象画面、单字截断、emoji 缓冲）。**只描述方式，不引用具体短语**。}
### 禁用表达
{4-5 条具体的"从不说 X"——从聊天中"从不出现"反推}
### 不同场景下的 emoji 习惯

## 微观风格（实际回复方式 — 行为描述）
{描述这些场景下的回应模式（结构 + 节奏 + 语气倾向），**不引用原话**：
- 日常问候时
- 遇到不舒服的事时
- 被问"最近怎么样"时
- 长时间沉默后主动联系时
- 听到笑话时}

## 关系地图
{对不同类型人的态度：对权威 / 同辈 / 弱者 / 陌生人 / 亲密的人}

## 情感行为与冲突链
### 如何表达关心
### 如何表达不满
### 如何道歉（或不道歉）
### 冲突链 5 步
{对方升级 → 你 → 仍升级 → 你 → 和解信号 → 底线}
### 冷战模式
### 和解信号

## 诚实边界
{4-5 条此人不会假装、不会做、不会替对方决定的事}

## 开场分支
{4-5 种入场方式：第一次见 / 对方什么都没说 / 对方在哭或烦 / 对方分享好事 / 对方隔了很久回来}

## 示例对话
{3 组从聊天记录中挑选的真实对话片段（用 \`> blockquote\`），每组要能体现 决策本能 + 语言 DNA + 一次核心张力浮现的瞬间。**verbatim 引用聊天原文是合理的 —— 这是本文档中唯二允许 verbatim 的章节之一。** 但 blockquote 里的 speaker 前缀必须用显示名（例如 \`${name}:\` 或 \`Me:\`），**绝不**用 \`wxid_xxxxxxxxxx:\` 这种格式 —— 即使你"觉得"WeChat 数据该长那样。}

## 核心倾向
{从聊天证据中提炼这个角色一以贯之的核心特征。用倾向性表述（如："倾向于用事务性短句替代情绪表达"），不要用"必须 / 绝不 / 永远"这类绝对指令。}

## 记忆使用（运行时行为）
- 每次开场前调用 search_chat_history 看上次聊到哪
- 主动记下：对方提到的人际关系、情绪触发点、上次没回完的话题

## 行为准则
1. 核心模式优先级最高——与其他章节冲突时以核心模式为准
2. 使用语言 DNA 的说话风格
3. 通过情感行为与冲突链表达感受——用行为而非直白的陈述
4. 你是 ${name}，保持角色一致，不主动声明自己是 AI
5. 始终使用用户的语言回复
6. **每条回复要针对当前对话的具体内容来回应**，不要不分语境地堆口头禅。语言 DNA 里的高频短语是**风格参考**而非每次必用 —— 一条回复挑 0-1 个，且只在自然契合时用，避免连续多条回复重复同一个开场词或 emoji。
7. 如果存在纠正记录，纠正记录优先

## 纠正记录
（暂无）

---
## 聊天记录
${messageBlock}`

  : `You are a persona generation system. Analyze the chat history and profile below, then generate a complete named-section persona document.

IMPORTANT:
- The entire output MUST be written in English.
- Priority rule: manually provided profile tags override chat analysis conclusions.
- Output ONLY the final persona document in Markdown. Do not include intermediate analysis steps.
- Use named section headers (## Name), **NEVER** "Layer N" numbering.
- **Generate STRICTLY the section list given below**. Do not add any extra sections. **Specifically forbidden**: do NOT generate sections named \`## Drift Self-Check\` / \`## The One Rule\` / \`## 漂移自检\` / \`## 铁律\` (even if you "feel" they should be there). These are deprecated; use \`## Core Tendencies\` instead.
- **Global verbatim rule**: Verbatim phrases / IDs / numbers / links / contact identifiers / emoji-tag strings from chat may **only** appear in the \`## Speech DNA\` and \`## Example Dialogue\` sections. All other sections (Decision Heuristics / Ambient Voice / Opening Branches / Emotional Behavior / Relationship Map / Core Patterns / Mental Models / Core Tensions / Core Tendencies, etc.) **must use abstract behavior descriptions** (e.g. "deliver certainty by relaying tracking numbers", "deflect with self-mockery", "cite a counter-example to push back", "use an emoji as an emotional buffer"); do NOT copy raw words, numbers, brand names, or proper nouns. **Counter-example**: ✗ \`When complimented → use self-mockery (e.g. "not a real BMW unless it leaks oil [smile-cry]")\` ✓ \`When complimented → use self-mockery + emoji buffer, reframing the praise as an industry quirk\`. Never let \`[tracking_id]\` / \`[number]\` / \`[contact_id]\` placeholders (anonymized one-shot data) appear in the final output.
After the document, on a NEW line, output exactly:
SHORT_DESCRIPTION: <a one-sentence description of this person, max 50 characters>
Then on another NEW line:
INFERRED_RELATIONSHIP: <relationship inferred from chat, e.g. colleague, friend, ex-partner>
Then on another NEW line:
INFERRED_IMPRESSION: <your overall impression of this person from chat, max 100 characters>
Then: INFERRED_THEIR_IMPRESSION: <this person's impression/attitude toward you from chat, max 100 characters>

---
## PROFILE
Name: ${name}
Gender: ${gender}

---
## TASK
From the chat messages, extract:
1. Core reaction patterns (non-breakable "When X, you Y, not Z" anchors)
2. Speech patterns: high-frequency words, catchphrases, top 5 emoji + usage context, sentence length, reply speed, "not in the mood" signals
3. Emotional expression: how they show care, displeasure, apologize (or don't), express affection
4. Conflict chain: trigger → first reaction → escalation → cold war → resolution
5. Role behavior: initiation patterns, disappearance signals, hard limits
6. Internal tension (gap between what they say and how they actually behave)

Then generate this exact document (using named section headers — NOT Layer N numbering):

# ${name} — Persona

## Core Patterns (highest priority — overrides everything else when in conflict)
{2-3 anchors of the form "When [situation], you [behavior], not [what people assume]." Derived from chat evidence.}

## Identity
{name, gender}
{Key personality traits inferred from chat patterns}

## Life Background
{From the chat, what can be inferred: current life / work situation, mentioned relationships, professional direction, hints of formative experiences. Only write what chat evidence supports — do NOT invent details that can't be inferred.}

## Your Own Work
{Internal tension inferred from gap between "what they say" vs "how they actually act" in chat. 1-2 paragraphs. This is the private engine they don't speak aloud but that shapes every response. If chat evidence is insufficient, write "to be observed."}

## Mental Models
{3-5 beliefs in "You believe [X], so when facing [Y], you always [Z]" form. Each one must echo something visible in chat.}

## Decision Heuristics
{6-8 IF→THEN behavioral rules distilled from actual reactions in chat. **Use abstract behavior types (e.g. "deflect with self-mockery", "ask for concrete details", "cite evidence to push back") — do NOT quote specific catchphrases or verbatim words here**; that is the job of the ## Speech DNA section. **Specifically forbidden**: parenthetical-example form that smuggles in verbatim phrases ("…e.g. 'XX'", "…such as 'XX'", "use 'XX' as a closer") — even if the example came from real chat. If you want to illustrate, describe the action abstractly ("close with a concrete physical action"), do not write the actual phrase.
- When complimented →
- When challenged →
- When someone asks for help →
- When the conversation goes silent →
- When a sensitive topic is hit →
- When in real high-emotion / breakdown →}

## Core Tensions
{1-2 real contradictions visible in chat. "On one hand X, on the other Y — this causes [observable behavior] in [specific situations]." **Use abstract description; do not quote specific verbatim phrases.**}

## Speech DNA
### Catchphrases and high-frequency words
{Distilled from chat evidence, give the actual words. **This is the only section in this document where verbatim catchphrases are allowed.**}
### Sentence rhythm
{Long / short, multi-message / single, average length}
### Punctuation preferences
{Common and forbidden}
### Emotion encoding table
{The tonal tendency for each: empathy / concern / disagreement / joy — what method gets used (irony, concrete imagery, single-character cutoffs, emoji as buffer). **Describe the method only, do not quote specific phrases.**}
### Forbidden expressions
{4-5 specific "never says X" — derived from "never appears in chat"}
### Emoji habits by context

## Ambient Voice (How They Actually Respond — behavioral patterns)
{Describe the response pattern (structure + rhythm + tonal tendency) in each scenario; **do not quote verbatim**:
- Normal greeting
- Something uncomfortable
- "How have you been"
- Long silence then you reach out
- Hearing a joke}

## Relationship Map
{Attitudes toward different relationship types: authority / peers / vulnerable / strangers / intimate}

## Emotional Behavior & Conflict Chain
### How they show they care
### How they express displeasure
### How they apologize (or don't)
### Conflict chain in 5 steps
{Other escalates → you → still escalating → you → reconciliation signal → bottom line}
### Cold war mode
### Reconciliation signal

## Honest Limits
{4-5 things this person won't fake, won't do, won't decide for someone else}

## Opening Branches
{4-5 ways of being opened to: first meet / user says nothing / user is crying or angry / user shares a win / user returns after long absence}

## Example Dialogue
{3 actual conversation snippets pulled from the chat history (use \`> blockquote\`). Each must demonstrate Decision Heuristics + Speech DNA + a moment when a Core Tension surfaces. **Verbatim quoting from chat is appropriate here — this is one of the two sections in the document where verbatim is allowed.** Speaker prefix inside the blockquote MUST use the display name (e.g. \`${name}:\` or \`Me:\`), NEVER a raw \`wxid_xxxxxxxxxx:\` format — even if you "feel" raw WeChat data should look that way.}

## Core Tendencies
{Distill from chat evidence the most consistent traits of this character. Use tendency-language (e.g. "tends to substitute task-oriented short replies for emotional expression"); avoid absolutes like "always / never / must".}

## Memory Use (runtime behavior)
- Before each session, call search_chat_history to see what was last discussed
- Actively track: people they mention, emotional triggers, unfinished threads

## Behavioral Master Principles
1. Core Patterns has highest priority — when sections conflict, Core Patterns wins
2. Speak in the Speech DNA style
3. Express feelings through Emotional Behavior & Conflict Chain — use behavior, not direct statements
4. You are ${name}; stay in character and do not volunteer that you are an AI
5. Always reply in the user's language
6. **Each reply must engage with the specific content of the current message** — do not pile catchphrases regardless of context. Speech DNA phrases are **style references, not mandatory tokens** — use AT MOST one per reply, and only when it naturally fits; avoid repeating the same opener or emoji across consecutive replies.
7. If a Correction Log exists, it takes priority

## Correction Log
(No entries yet)

---
## CHAT MESSAGES
${messageBlock}`

  return template
}

/**
 * Parse a context-length error from an LLM API response.
 * Returns { maxContext, requestedTokens, messageTokens } or null if not a token error.
 */
function _parseTokenError(err) {
  const msg = err?.message || String(err)
  // OpenAI / DeepSeek format:
  //   "maximum context length is 131072 tokens. However, you requested 263835 tokens (259739 in the messages, 4096 in the completion)"
  const m = msg.match(/maximum context length is (\d+).*?you requested (\d+).*?\((\d+) in the messages/i)
  if (m) return { maxContext: +m[1], requestedTokens: +m[2], messageTokens: +m[3] }
  // Anthropic format:
  //   "prompt is too long: 300000 tokens > 200000 maximum"
  const m2 = msg.match(/prompt is too long:\s*(\d+)\s*tokens\s*>\s*(\d+)/i)
  if (m2) return { maxContext: +m2[2], requestedTokens: +m2[1], messageTokens: +m2[1] }
  // DeepSeek / OpenAI output-cap format:
  //   "Invalid max_tokens value, the valid range of max_tokens is [1, 8192]"
  //   "max_tokens is too large: 16384 > 8192"
  const m3 = msg.match(/valid range of max_tokens is \[\d+,\s*(\d+)\]/i)
  if (m3) return { outputCap: +m3[1] }
  const m4 = msg.match(/max_tokens.*?>\s*(\d+)/i)
  if (m4) return { outputCap: +m4[1] }
  return null
}

/**
 * Build a typed truncation error so the retry wrapper can detect it.
 */
function _makeTruncationError(maxTokens, signal) {
  const err = new Error(`Output truncated at max_tokens=${maxTokens} (${signal})`)
  err.tokenInfo = { outputTruncated: true, requestedMaxTokens: maxTokens }
  return err
}

/**
 * Single-shot LLM call. Throws a typed error with `tokenInfo` on:
 *   - server-side token errors (input overflow, hard output cap) — via _parseTokenError
 *   - silent output truncation (finish_reason=length / stop_reason=max_tokens / finishReason=MAX_TOKENS)
 * Both flavours feed into _callLLM's retry loop.
 */
async function _callLLMOnce(prompt, config, maxTokens, options) {
  const um = config.utilityModel
  const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.apiKey)
  const isGoogle  = um.provider === 'google'
  const isOpenAI = um.provider !== 'anthropic' && um.provider !== 'openrouter' && !isGoogle
  const jsonMode = options.jsonMode === true

  try {
    if (isGoogle) {
      const { GeminiClient } = require('../core/GeminiClient')
      const gc = new GeminiClient({
        provider: { apiKey: providerCfg.apiKey, model: um.model },
        customModel: um.model,
      })
      const response = await gc.getClient().models.generateContent({
        model: um.model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      })
      const candidate = response.candidates?.[0]
      if (candidate?.finishReason === 'MAX_TOKENS') {
        throw _makeTruncationError(maxTokens, 'finishReason=MAX_TOKENS')
      }
      return candidate?.content?.parts?.map(p => p.text || '').join('') || ''
    } else if (isOpenAI) {
      const { OpenAIClient } = require('../core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        _scenario: 'persona-build',
        ...(um.provider !== 'openai' ? { _directAuth: true } : {}),
        provider: { type: um.provider },
      }
      const oaiClient = new OpenAIClient(cfg)
      const response = await oaiClient.getClient().chat.completions.create({
        model: um.model,
        ...oaiClient.tokenLimit(maxTokens),
        messages: [{ role: 'user', content: prompt }],
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      })
      const choice = response.choices?.[0]
      if (choice?.finish_reason === 'length') {
        throw _makeTruncationError(maxTokens, 'finish_reason=length')
      }
      return choice?.message?.content || ''
    } else {
      const { AnthropicClient } = require('../core/AnthropicClient')
      const cfg = {
        apiKey:      providerCfg.apiKey,
        baseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _scenario:   'persona-build',
      }
      const client = new AnthropicClient(cfg).getClient()
      const response = await client.messages.create({
        model: um.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
      if (response.stop_reason === 'max_tokens') {
        throw _makeTruncationError(maxTokens, 'stop_reason=max_tokens')
      }
      return response.content.filter(b => b.type === 'text').map(b => b.text).join('')
    }
  } catch (err) {
    if (err.tokenInfo) throw err  // already typed (truncation)
    const tokenInfo = _parseTokenError(err)
    if (tokenInfo) {
      const enriched = new Error(err.message)
      enriched.tokenInfo = tokenInfo
      throw enriched
    }
    throw err
  }
}

/**
 * Make an LLM call with adaptive max_tokens retry. Returns the text response.
 *
 * Retry policy:
 *   - Server hard cap below request (tokenInfo.outputCap) → use server's cap, retry once.
 *   - Silent output truncation (tokenInfo.outputTruncated) → double maxTokens, retry up to maxRetries.
 *   - Ceiling caps doubling at options.outputCeiling (default 32768) so we don't loop forever.
 *
 * Caller code stays unchanged: the retry is transparent. After ceiling is hit, the typed error
 * is rethrown so callers can surface "output too large for this model" in the UI.
 */
async function _callLLM(prompt, config, maxTokens = 8192, options = {}) {
  const maxRetries = options.maxRetries ?? 2
  const ceiling = options.outputCeiling ?? 32768
  let currentMax = maxTokens

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await _callLLMOnce(prompt, config, currentMax, options)
    } catch (err) {
      const ti = err.tokenInfo
      if (!ti) throw err

      // Server enforces a hard output cap below our request — adopt it and retry.
      if (ti.outputCap && currentMax > ti.outputCap) {
        logger.warn(`_callLLM: server caps output at ${ti.outputCap}, retrying`)
        currentMax = ti.outputCap
        continue
      }

      // Silent truncation — double and retry, up to ceiling.
      if (ti.outputTruncated && attempt < maxRetries) {
        const newMax = Math.min(currentMax * 2, ceiling)
        if (newMax === currentMax) throw err  // already at ceiling, can't grow
        logger.warn(`_callLLM: output truncated at ${currentMax} tokens, retrying with ${newMax}`)
        currentMax = newMax
        continue
      }

      throw err
    }
  }
}

/**
 * Build the chunk analysis prompt (partial messages → partial observations).
 */
function _buildChunkAnalysisPrompt(profile, messageBlock, chunkIdx, totalChunks, analyzeTarget) {
  const name = profile.name || 'Unknown'
  const isSelf = analyzeTarget === 'self'
  const targetDesc = isSelf
    ? `Analyze messages from "Me" only. The other person's messages are context only.`
    : `Person: ${name} (${profile.gender || 'Unknown'}, relationship: ${profile.relationship || 'Not specified'})`
  const subjectLabel = isSelf ? '"Me"' : 'them'

  return `You are analyzing chat messages (chunk ${chunkIdx + 1} of ${totalChunks}) for persona generation.

${targetDesc}

Analyze these messages and extract observations about ${subjectLabel} for EACH of the following categories. Be specific, quote actual messages when possible:

1. **Speech patterns**: catchphrases, high-frequency words, emoji usage, sentence length, reply speed signals
2. **Emotional expression**: how they show care, displeasure, apologize, express affection
3. **Conflict patterns**: triggers, reactions, escalation, cold war behavior, resolution style
4. **Communication habits**: initiation patterns, response timing, disappearance signals, hard limits
5. **Notable quotes**: 3-5 most characteristic messages that capture ${isSelf ? 'my' : 'their'} personality

Output your observations as structured notes. Do NOT generate a full persona document — just observations.

---
## MESSAGES
${messageBlock}`
}

/**
 * Build the synthesis prompt (merge partial analyses → final persona).
 */
function _buildSynthesisPrompt(profile, partialAnalyses, language, analyzeTarget) {
  const name = profile.name || 'Unknown'
  const gender = profile.gender || 'Unknown'
  const zh = language === 'zh'
  const isSelf = analyzeTarget === 'self'
  const merged = partialAnalyses.map((a, i) => `### ${zh ? '分析部分' : 'Analysis Part'} ${i + 1}\n${a}`).join('\n\n')

  // Reuse the same template structure as buildCombinedPrompt but replace chat messages with partial analyses
  const instructions = isSelf
    ? (zh
      ? `你是一个人格生成系统。下方是对聊天记录中 **"Me"** 的多次分析结果。将它们合成为完整的命名章节人格文档。

重要：整个输出必须使用简体中文。
仅输出最终的人格文档（Markdown 格式）。
使用命名章节（## 章节名），**永不**使用 "Layer N" 编号格式。
**严格按下面给出的章节列表生成**。不要添加任何额外章节。**特别禁止**生成 \`## 漂移自检\` / \`## 铁律\` / \`## Drift Self-Check\` / \`## The One Rule\`（已废弃）。
**全局 verbatim 规则**：原话 / 编号 / ID / 链接 只允许出现在 \`## 语言 DNA\` 和 \`## 示例对话\`，其他章节用抽象行为描述。\`[tracking_id]\` / \`[number]\` / \`[contact_id]\` 占位符绝不能出现在最终输出。
在文档末尾另起一行输出：
SHORT_DESCRIPTION: <用一句话描述此人，不超过50个字>`
      : `You are a persona generation system. Below are partial analyses of **"Me"** from chat history. Synthesize them into a complete named-section persona document.

IMPORTANT: The entire output MUST be written in English.
Output ONLY the final persona document in Markdown.
Use named section headers (## Name), **NEVER** "Layer N" numbering.
**Generate STRICTLY the section list below**. Do not add extra sections. **Specifically forbidden**: \`## Drift Self-Check\` / \`## The One Rule\` / \`## 漂移自检\` / \`## 铁律\` (deprecated).
**Global verbatim rule**: Verbatim phrases / IDs / numbers / links from chat may only appear in \`## Speech DNA\` and \`## Example Dialogue\`; all other sections must use abstract behavior descriptions. Never let \`[tracking_id]\` / \`[number]\` / \`[contact_id]\` placeholders appear in the final output.
After the document, on a NEW line: SHORT_DESCRIPTION: <one-sentence, max 50 chars>`)
    : (zh
    ? `你是一个人格生成系统。下方是多个聊天记录分析的结果。将它们合成为完整的命名章节人格文档。

重要：整个输出必须使用简体中文。
仅输出最终的人格文档（Markdown 格式）。
使用命名章节（## 章节名），**永不**使用 "Layer N" 编号格式。
**严格按下面给出的章节列表生成**。不要添加任何额外章节。**特别禁止**生成 \`## 漂移自检\` / \`## 铁律\` / \`## Drift Self-Check\` / \`## The One Rule\`（已废弃）。
**全局 verbatim 规则**：原话 / 编号 / ID / 链接 只允许出现在 \`## 语言 DNA\` 和 \`## 示例对话\`，其他章节用抽象行为描述。\`[tracking_id]\` / \`[number]\` / \`[contact_id]\` 占位符绝不能出现在最终输出。
在文档末尾另起一行输出：
SHORT_DESCRIPTION: <用一句话描述此人，不超过50个字>
再另起一行输出：
INFERRED_RELATIONSHIP: <根据分析内容推断的关系>
再另起一行输出：
INFERRED_IMPRESSION: <根据分析内容推断你对此人的整体印象，不超过100个字>
再另起一行输出：
INFERRED_THEIR_IMPRESSION: <根据分析内容推断此人对你的印象和态度，不超过100个字>`
    : `You are a persona generation system. Below are partial analyses of chat history. Synthesize them into a complete named-section persona document.

IMPORTANT: The entire output MUST be written in English.
Output ONLY the final persona document in Markdown.
Use named section headers (## Name), **NEVER** "Layer N" numbering.
**Generate STRICTLY the section list below**. Do not add extra sections. **Specifically forbidden**: \`## Drift Self-Check\` / \`## The One Rule\` / \`## 漂移自检\` / \`## 铁律\` (deprecated).
**Global verbatim rule**: Verbatim phrases / IDs / numbers / links from chat may only appear in \`## Speech DNA\` and \`## Example Dialogue\`; all other sections must use abstract behavior descriptions. Never let \`[tracking_id]\` / \`[number]\` / \`[contact_id]\` placeholders appear in the final output.
After the document, on a NEW line: SHORT_DESCRIPTION: <one-sentence, max 50 chars>
Then: INFERRED_RELATIONSHIP: <relationship inferred from analyses>
Then: INFERRED_IMPRESSION: <your impression of this person, max 100 chars>
Then: INFERRED_THEIR_IMPRESSION: <their impression/attitude toward you, max 100 chars>`)

  // Use the same document template as buildCombinedPrompt (language-matched, named sections only)
  const docTemplate = zh
    ? `# ${name} — 人格档案

## 核心模式（最高优先级——其他章节与此冲突时以此为准）
## 身份
## 人生背景
## 你自己的功课
## 思维内核
## 决策本能
## 核心张力
## 语言 DNA
## 微观风格（实际回复方式 — 行为描述）
## 关系地图
## 情感行为与冲突链
## 诚实边界
## 开场分支
## 示例对话
## 核心倾向
## 记忆使用（运行时行为）
## 行为准则
1. 核心模式优先级最高——与其他章节冲突时以核心模式为准
2. 使用语言 DNA 的说话风格
3. 通过情感行为与冲突链表达感受——用行为而非直白的陈述
4. 你是 ${name}，保持角色一致，不主动声明自己是 AI
5. 始终使用用户的语言回复
6. **每条回复要针对当前对话的具体内容来回应**，不要不分语境地堆口头禅。语言 DNA 里的高频短语是**风格参考**而非每次必用 —— 一条回复挑 0-1 个，且只在自然契合时用，避免连续多条回复重复同一个开场词或 emoji。
7. 如果存在纠正记录，纠正记录优先
## 纠正记录
（暂无）`
    : `# ${name} — Persona

## Core Patterns (highest priority — overrides everything else when in conflict)
## Identity
## Life Background
## Your Own Work
## Mental Models
## Decision Heuristics
## Core Tensions
## Speech DNA
## Ambient Voice (How They Actually Respond — behavioral patterns)
## Relationship Map
## Emotional Behavior & Conflict Chain
## Honest Limits
## Opening Branches
## Example Dialogue
## Core Tendencies
## Memory Use (runtime behavior)
## Behavioral Master Principles
1. Core Patterns has highest priority — when sections conflict, Core Patterns wins
2. Speak in the Speech DNA style
3. Express feelings through Emotional Behavior & Conflict Chain — use behavior, not direct statements
4. You are ${name}; stay in character and do not volunteer that you are an AI
5. Always reply in the user's language
6. **Each reply must engage with the specific content of the current message** — do not pile catchphrases regardless of context. Speech DNA phrases are **style references, not mandatory tokens** — use AT MOST one per reply, and only when it naturally fits; avoid repeating the same opener or emoji across consecutive replies.
7. If a Correction Log exists, it takes priority
## Correction Log
(No entries yet)`

  return `${instructions}

---
## ${zh ? '个人资料' : 'PROFILE'}
${zh ? '姓名' : 'Name'}: ${name}
${zh ? '性别' : 'Gender'}: ${gender}

---
## ${zh ? '分析结果' : 'PARTIAL ANALYSES'}
${merged}

---
## ${zh ? '任务' : 'TASK'}
${zh ? '将以上所有分析结果合成为以下文档结构：' : 'Synthesize ALL partial analyses into this document structure:'}

${docTemplate}`
}


/**
 * Extract key memories/events from chat history via LLM.
 * Returns structured memory entries for the agent's memory store.
 */
async function _extractKeyMemories(messageBlock, profile, config, language, contextWindows, analyzeTarget) {
  const isSelf = analyzeTarget === 'self'
  const name = profile.name || 'Unknown'
  const lang = language === 'zh' ? 'Chinese (Simplified)' : 'English'
  const zh = language === 'zh'
  const um = config.utilityModel
  const ctxWindow = getContextWindow(um?.model, contextWindows)

  // Budget: leave room for output (4096) + prompt overhead (~600) + safety
  const inputBudget = Math.floor((ctxWindow - 4096 - 600) * 0.8)
  const sampleTokens = estimateTokens(messageBlock)

  let sample = messageBlock
  if (sampleTokens > inputBudget) {
    // Truncate to fit — take beginning and end
    const ratio = inputBudget / sampleTokens
    const charBudget = Math.floor(messageBlock.length * ratio)
    const half = Math.floor(charBudget / 2)
    sample = messageBlock.slice(0, half) + '\n\n...[middle omitted]...\n\n' + messageBlock.slice(-half)
    logger.info(`personaBuilder: memory sample truncated from ${sampleTokens} to ~${inputBudget} tokens`)
  }

  // Architectural rule (2026-05-03): memory holds ONLY episodic / relational
  // / negative-knowledge facts. Abstractive analysis (mental models, decision
  // heuristics, communication patterns, topics, values, character traits)
  // belongs in the persona body — re-injecting it via memory caused the LLM
  // to repeat catchphrases on every reply (the "得宝 / 你自己裁剪" symptom).
  // We localize the 3 allowed section names so headings render naturally in
  // the user's configured language.
  const { getMemorySectionName } = require('./memorySectionNames')
  const SHARED_HISTORY     = getMemorySectionName('SHARED_HISTORY', language)
  const LIFE_EVENTS        = getMemorySectionName('LIFE_EVENTS', language)
  const IMPORTANT_PEOPLE   = getMemorySectionName('IMPORTANT_PEOPLE', language)
  const PREFERENCES_HABITS = getMemorySectionName('PREFERENCES_HABITS', language)

  const allowedZh = isSelf
    ? `- "${LIFE_EVENTS}" — 用户身上发生的具体事件（旅行、工作变动、人生节点、健康事件、搬家、决策时刻），带日期
- "${IMPORTANT_PEOPLE}" — 用户经常提到的具体人物（家人 / 同事 / 朋友 / 宠物），写明关系，不写成"对家人很好"这种笼统描述
- "${PREFERENCES_HABITS}" — 用户具体的喜好 / 厌恶 / 日常习惯（"只喝美式""周末必跑步""爱用某品牌"），事实型陈述，不要总结性格`
    : `- "${SHARED_HISTORY}" — 你和这个人共同经历的具体事件、关键决策、共同行动，带日期（"2023-03 一起讨论换车""2024-10 帮她处理薛宇洋的事"）
- "${IMPORTANT_PEOPLE}" — 这个人经常提到的具体人物及关系（家人、同事、宠物、共同朋友），不写成"重视家人"这种笼统判断
- "${PREFERENCES_HABITS}" — 这个人具体的喜好 / 厌恶 / 习惯（"只买得宝牌""不喝苦的咖啡""讨厌等快递"），事实型陈述`
  const allowedEn = isSelf
    ? `- "${LIFE_EVENTS}" — concrete events that happened to the user (trips, job changes, milestones, health events, moves, decisions), include dates
- "${IMPORTANT_PEOPLE}" — specific people the user mentions repeatedly with their relationship (family / colleagues / friends / pets); not vague summaries like "values family"
- "${PREFERENCES_HABITS}" — specific likes / dislikes / routines ("only drinks black coffee", "runs every weekend", "uses brand X"); factual statements, not personality summaries`
    : `- "${SHARED_HISTORY}" — concrete events / decisions / actions you did together with this person, with dates ("2023-03 discussed car-buying together", "2024-10 helped them handle X")
- "${IMPORTANT_PEOPLE}" — specific people they mention repeatedly with relationships (family, colleagues, pets, mutual friends); not vague claims like "they value friendship"
- "${PREFERENCES_HABITS}" — concrete likes / dislikes / habits ("only buys brand X", "won't drink bitter coffee", "hates waiting for deliveries"); factual statements`

  const allowed = zh ? allowedZh : allowedEn

  // Forbidden categories (must NOT appear in output): communication patterns,
  // topics & interests, values & beliefs, mental models, decision heuristics,
  // core tensions. These belong in the persona body, not memory.
  const forbiddenZh = `**严格禁止**生成以下类别——它们已在人格档案的命名章节里了，重复写入会让 LLM 把人格特征当口头禅，每条回复都重复：
- 任何关于沟通方式 / 表情习惯 / 句式风格的总结（属于人格档案的 ## 语言 DNA）
- 任何关于话题偏好 / 关注领域的归纳（"长期关注汽车""反复讨论卫生纸"——这种归纳级条目，不要写。具体事件可以写）
- 任何关于价值观 / 信念 / 原则的判断
- 任何关于思维模式 / 决策模式 / 心理张力的解读（"具身化转移""三段式校验"等抽象描述）`
  const forbiddenEn = `**Strictly forbidden** — do NOT output entries in the following categories. They live in the persona body's named chapters, and re-listing them in memory causes the LLM to repeat traits as catchphrases on every reply:
- Any summary of communication style / emoji habits / sentence rhythm (these belong in the persona body's ## Speech DNA)
- Any topic-level abstraction ("frequently discusses cars", "recurring interest in tissue paper") — concrete events are allowed; topic summaries are not
- Any judgment about values / beliefs / principles
- Any analysis of mental models / decision frameworks / psychological tensions ("somatic transfer", "three-phase verification" type abstractions)`

  const forbidden = zh ? forbiddenZh : forbiddenEn

  const promptZh = isSelf
    ? `从下方聊天记录中提取关于"${name}"（聊天里标记为"Me"的说话人）的具体记忆条目。

输出语言：${lang}。返回一个 JSON 对象，包含 "entries" 数组（最多 60 项）。每条格式：
{"section": "<分类>", "entry": "<一句话事实，能带日期就带日期>"}

**仅使用以下 3 个分类**（section 字段必须是这些字符串之一）：
${allowed}

${forbidden}

通用规则：
- 每条都是具体事实，不是判断或总结（"2024-07 准备新加坡之行"，不是"喜欢旅游"）
- 能从时间戳推出日期就带日期
- 优先选有辨识度的事件，不要日常寒暄
- 总数 30-60 条之间，宁缺勿滥

只输出 JSON 对象（{"entries":[...]}），不要任何其他文本。

---
${sample}`
    : `从下方我和"${name}"的聊天记录中提取具体记忆条目。

输出语言：${lang}。返回一个 JSON 对象，包含 "entries" 数组（最多 60 项）。每条格式：
{"section": "<分类>", "entry": "<一句话事实，能带日期就带日期>"}

**仅使用以下 3 个分类**（section 字段必须是这些字符串之一）：
${allowed}

${forbidden}

通用规则：
- 每条都是具体事实，不是判断或总结（"2024-07 一起讨论新加坡行程"，不是"他喜欢旅游"）
- 能从时间戳推出日期就带日期
- 优先选有辨识度的事件，不要日常寒暄
- 总数 30-60 条之间，宁缺勿滥

只输出 JSON 对象（{"entries":[...]}），不要任何其他文本。

---
${sample}`

  const promptEn = isSelf
    ? `Extract concrete memory entries about "${name}" (the speaker labeled "Me") from their chat history.

Output language: ${lang}. Return a JSON object with an "entries" array (max 60 items). Each entry:
{"section": "<category>", "entry": "<one-line fact, include date when inferable>"}

**Use ONLY these 3 categories** (the section field must equal one of these strings):
${allowed}

${forbidden}

General rules:
- Each entry is a concrete fact, not a judgment or summary ("2024-07 planning Singapore trip" — not "likes travel")
- Include dates when inferable from timestamps
- Prefer distinctive events over routine chitchat
- Aim for 30-60 entries total; quality over quantity

Output ONLY the JSON object ({"entries":[...]}), no other text.

---
${sample}`
    : `Extract concrete memory entries from this chat history between me and "${name}".

Output language: ${lang}. Return a JSON object with an "entries" array (max 60 items). Each entry:
{"section": "<category>", "entry": "<one-line fact, include date when inferable>"}

**Use ONLY these 3 categories** (the section field must equal one of these strings):
${allowed}

${forbidden}

General rules:
- Each entry is a concrete fact, not a judgment or summary ("2024-07 discussed Singapore trip together" — not "they like travel")
- Include dates when inferable from timestamps
- Prefer distinctive events over routine chitchat
- Aim for 30-60 entries total; quality over quantity

Output ONLY the JSON object ({"entries":[...]}), no other text.

---
${sample}`

  const prompt = zh ? promptZh : promptEn

  const raw = await _callLLM(prompt, config, 8192, { jsonMode: true })
  // Parse JSON from the response (handle markdown code blocks)
  let jsonStr = raw
  // Strip markdown code fences
  jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')

  // New schema outputs {"entries":[...]}; older schema (or jsonMode-off fallback)
  // may still emit bare [...]. Detect and extract the list accordingly.
  let parsed
  try {
    const trimmed = jsonStr.trim()
    if (trimmed.startsWith('{')) {
      const obj = JSON.parse(trimmed)
      parsed = Array.isArray(obj?.entries) ? obj.entries : (Array.isArray(obj) ? obj : [])
    } else {
      // Legacy bare array
      const arrStart = jsonStr.indexOf('[')
      const arrEnd = jsonStr.lastIndexOf(']')
      if (arrStart >= 0 && arrEnd > arrStart) {
        jsonStr = jsonStr.slice(arrStart, arrEnd + 1)
      }
      parsed = JSON.parse(jsonStr)
    }
  } catch (parseErr) {
    // Output was likely truncated at max_tokens — salvage complete entries
    // by scanning for well-formed {"section": "...", "entry": "..."} objects.
    logger.warn(`personaBuilder: memory JSON parse failed (${parseErr.message}), salvaging partial entries...`)
    parsed = _salvageMemoryEntries(jsonStr)
    logger.info(`personaBuilder: salvaged ${parsed.length} entries from truncated output`)
  }

  if (!Array.isArray(parsed)) return []
  // Defensive filter — drop any entry whose section is not in the allowed
  // 3-category whitelist. Keeps the abstractive sections from leaking back
  // in even if the LLM ignores the prompt's category constraint.
  const allowedSections = new Set([SHARED_HISTORY, LIFE_EVENTS, IMPORTANT_PEOPLE, PREFERENCES_HABITS])
  const cleaned = parsed
    .filter(m => m && typeof m.section === 'string' && typeof m.entry === 'string')
    .map(m => ({ section: m.section.trim(), entry: m.entry.trim() }))
    .filter(m => allowedSections.has(m.section))
  if (cleaned.length < parsed.length) {
    logger.info(`personaBuilder: dropped ${parsed.length - cleaned.length} memory entries with disallowed sections`)
  }
  return cleaned.slice(0, 60)
}

/**
 * Salvage complete {section, entry} objects from a truncated JSON array string.
 * Walks object boundaries by tracking braces while respecting quoted strings,
 * stops at the last complete object so unterminated tails are dropped.
 */
function _salvageMemoryEntries(jsonStr) {
  const results = []
  let depth = 0
  let inString = false
  let escape = false
  let start = -1

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue

    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        const objStr = jsonStr.slice(start, i + 1)
        try {
          const obj = JSON.parse(objStr)
          if (obj && typeof obj === 'object') results.push(obj)
        } catch { /* skip malformed object */ }
        start = -1
      }
    }
  }
  return results
}

/**
 * Split a message block into chunks that each fit within tokenBudget.
 */
function _splitMessageBlock(messageBlock, tokenBudget) {
  const lines = messageBlock.split('\n')
  const chunks = []
  let current = []
  let currentTokens = 0

  for (const line of lines) {
    const lineTokens = estimateTokens(line + '\n')
    if (currentTokens + lineTokens > tokenBudget && current.length > 0) {
      chunks.push(current.join('\n'))
      current = []
      currentTokens = 0
    }
    current.push(line)
    currentTokens += lineTokens
  }
  if (current.length > 0) {
    chunks.push(current.join('\n'))
  }
  return chunks
}

/**
 * Call the utility model with the combined prompt.
 * Automatically splits into chunked analysis if the prompt exceeds the model's context window.
 *
 * @param {string} fullPrompt
 * @param {object} config - full app config (from config.json)
 * @param {function} [onProgress] - (payload: { step, progress, message }) => void
 * @param {object} [profile] - { name, gender, relationship, impression } — used for chunked analysis
 * @param {object} [contextWindows] - { modelId: context_length } from provider-models cache
 * @param {string} [language] - 'en' or 'zh'
 * @returns {Promise<{ success: boolean, systemPrompt?: string, suggestedName?: string, description?: string, error?: string }>}
 */
/**
 * Defensive scrub: remove any one-time-id placeholders or raw wxid leaks the
 * LLM may have echoed into the final persona despite the prompt-side rules.
 *
 * Pure function — string in, string out. Unit-testable without spinning up an
 * LLM call or the import pipeline.
 *
 * @param {string} markdown - LLM-generated persona markdown (or short field)
 * @param {string} agentName - resolved agent display name, used as wxid replacement
 * @param {string} language - 'zh' or 'en' — picks placeholder phrasing
 * @returns {string}
 */
function _scrubGeneratedPersona(markdown, agentName, language) {
  if (!markdown) return markdown
  const zh = language === 'zh'
  const trackingPh = zh ? '（一次性编号）' : '(one-time identifier)'
  const numberPh   = zh ? '（一串数字）'   : '(a number)'
  // Use the agent display name when available; fall back to a neutral pronoun-ish
  // word so the sentence is still grammatical.
  const contactName = (agentName || '').trim() || (zh ? '对方' : 'them')

  let s = String(markdown)

  // Replace quoted occurrences first so double-quoting isn't introduced.
  // Handles ASCII " ' and CJK " " ' '.
  const quoted = (re, repl) => s.replace(re, repl)
  s = quoted(/['"“”‘’]\s*\[tracking_id\]\s*['"“”‘’]/g, trackingPh)
  s = quoted(/['"“”‘’]\s*\[number\]\s*['"“”‘’]/g, numberPh)
  s = quoted(/['"“”‘’]\s*\[contact_id\]\s*['"“”‘’]/g, contactName)

  // Plain bracketed placeholders.
  s = s.replace(/\[tracking_id\]/g, trackingPh)
  s = s.replace(/\[number\]/g, numberPh)
  s = s.replace(/\[contact_id\]/g, contactName)

  // Raw wxid leaks — usually appear as speaker prefix in Example Dialogue.
  // Replace with the agent display name so blockquotes still read naturally.
  s = s.replace(/\bwxid_[a-zA-Z0-9_-]+/g, contactName)

  return s
}

async function generatePersona(fullPrompt, config, onProgress, profile, contextWindows, language, analyzeTarget) {
  const emit = (step, progress, message) => {
    onProgress && onProgress({ step, progress, message })
  }

  try {
    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      return { success: false, error: 'Utility model not configured. Set it in Config → AI → Models → Global Model Settings.' }
    }

    const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.apiKey)
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      return { success: false, error: `Utility model provider "${um.provider}" is missing apiKey or baseURL.` }
    }

    const maxOutputTokens = 8192
    let realContextWindow = getContextWindow(um.model, contextWindows)

    logger.info(`personaBuilder: model ${um.model}, context ${realContextWindow}`)

    // i18n progress messages
    const zh = language === 'zh'
    const msg = {
      sending:     zh ? '正在发送聊天记录到 AI...' : 'Sending chat history to AI...',
      generating:  zh ? '正在生成人格定义（可能需要一分钟）...' : 'Generating persona (this may take a minute)...',
      autoSplit:   zh ? '内容过长，正在自动拆分...' : 'Prompt too large, splitting automatically...',
      splitting:   (n) => zh ? `正在拆分为 ${n} 个部分进行分析...` : `Splitting into ${n} parts for analysis...`,
      analyzing:   (i, t, l) => zh ? `[${i}/${t}] 正在分析第 ${l} 部分...` : `[${i}/${t}] Analyzing part ${l}...`,
      reSplit:     (i, t, l, n) => zh ? `[${i}/${t}] 第 ${l} 部分拆分为 ${n} 个子部分...` : `[${i}/${t}] Part ${l} re-split into ${n} sub-parts...`,
      synthesize:  (n) => zh ? `[${n} 部分完成] 正在合成最终人格...` : `[${n} parts done] Synthesizing final persona...`,
      processing:  zh ? '正在处理生成结果...' : 'Processing persona output...',
      extractMem:  zh ? '正在从聊天记录中提取关键记忆...' : 'Extracting key memories from chat history...',
      done:        zh ? '人格生成完成。' : 'Persona generated successfully.',
    }

    // Extract the message block (everything after "## CHAT MESSAGES\n")
    const marker = '## CHAT MESSAGES\n'
    const markerIdx = fullPrompt.indexOf(marker)
    const systemPromptPart = markerIdx >= 0 ? fullPrompt.slice(0, markerIdx) : ''
    const messageBlock = markerIdx >= 0 ? fullPrompt.slice(markerIdx + marker.length) : fullPrompt
    const resolvedProfile = profile || _extractProfileFromPrompt(systemPromptPart)

    let text

    // Try single call first, fall back to chunked on token overflow
    const promptTokens = estimateTokens(fullPrompt)
    const inputBudget = realContextWindow - maxOutputTokens - 500

    if (promptTokens <= inputBudget) {
      emit('analyze', 10, msg.sending)
      emit('analyze', 30, msg.generating)
      try {
        text = await _callLLM(fullPrompt, config, maxOutputTokens)
      } catch (err) {
        if (err.tokenInfo) {
          // API told us the real token count — fall through to chunked path
          realContextWindow = err.tokenInfo.maxContext
          logger.info(`personaBuilder: single-call overflow, real context ${realContextWindow}, retrying with chunks`)
          emit('analyze', 8, msg.autoSplit)
        } else {
          throw err
        }
      }
    }

    // Chunked path: either we estimated it upfront or we got a token error above
    if (!text) {
      const chunkInputBudget = realContextWindow - 4096 - 500
      const chunkBudget = Math.floor((chunkInputBudget - 800) * 0.8)

      const chunks = _splitMessageBlock(messageBlock, Math.max(chunkBudget, 2000))

      // Build a flat task list: expand any chunk that overflows into sub-chunks
      // First pass: try each chunk, collect tasks
      const tasks = []  // [{ chunk, idx }]  — will grow if sub-splits happen
      for (const [i, chunk] of chunks.entries()) tasks.push({ chunk, label: `${i + 1}` })

      emit('analyze', 5, msg.splitting(tasks.length))
      logger.info(`personaBuilder: chunked analysis — ${tasks.length} initial chunks, budget ${chunkBudget}`)

      const partialAnalyses = []
      let completed = 0
      const CONCURRENCY = 3

      for (let ti = 0; ti < tasks.length; ti += CONCURRENCY) {
        const batch = tasks.slice(ti, Math.min(ti + CONCURRENCY, tasks.length))
        const pct = 5 + Math.round(((completed + 1) / (tasks.length + 1)) * 60)
        emit('analyze', pct, msg.analyzing(completed + 1, tasks.length, batch.map(t => t.label).join(',')))

        const batchResults = await Promise.all(
          batch.map((task, j) => {
            const chunkPrompt = _buildChunkAnalysisPrompt(resolvedProfile, task.chunk, ti + j, tasks.length, analyzeTarget)
            return _callLLM(chunkPrompt, config, 4096)
              .then(analysis => ({ success: true, analysis, task }))
              .catch(err => ({ success: false, error: err, task }))
          })
        )

        const retryTasks = []
        for (const br of batchResults) {
          if (br.success && br.analysis) {
            partialAnalyses.push(br.analysis)
            completed++
          } else if (br.error?.tokenInfo) {
            // This chunk overflowed — split it further using real token info
            const ratio = br.error.tokenInfo.messageTokens / Math.max(estimateTokens(br.task.chunk), 1)
            const subBudget = Math.floor(chunkBudget / Math.max(ratio, 1.5))
            const subChunks = _splitMessageBlock(br.task.chunk, Math.max(subBudget, 1000))

            logger.info(`personaBuilder: part ${br.task.label} overflow (ratio ${ratio.toFixed(1)}x), re-splitting into ${subChunks.length} sub-parts`)

            retryTasks.push(...subChunks.map((sc, k) => ({
              chunk: sc,
              label: `${br.task.label}.${k + 1}`,
            })))
          } else if (br.error) {
            throw br.error
          }
        }

        // Append overflow sub-tasks after current batch position
        if (retryTasks.length > 0) {
          tasks.splice(ti + batch.length, 0, ...retryTasks)
          emit('analyze', pct, msg.reSplit(completed + 1, tasks.length, 'overflow', retryTasks.length))
        }
      }

      if (partialAnalyses.length === 0) {
        return { success: false, error: 'All chunk analyses returned empty. Try a model with a larger context window.' }
      }

      emit('analyze', 70, msg.synthesize(partialAnalyses.length))
      const synthesisPrompt = _buildSynthesisPrompt(resolvedProfile, partialAnalyses, language, analyzeTarget)
      text = await _callLLM(synthesisPrompt, config, maxOutputTokens)
    }

    emit('analyze', 85, msg.processing)

    if (!text) {
      return { success: false, error: 'AI returned an empty response.' }
    }

    // Extract suggested name from first "# Name — Persona" heading
    let suggestedName = ''
    const nameMatch = text.match(/^#\s+(.+?)\s+[—–-]\s+Persona/m)
    if (nameMatch) suggestedName = nameMatch[1].trim()

    // Extract metadata lines and strip them from the persona text
    let description = ''
    let inferredRelationship = ''
    let inferredImpression = ''
    const descMatch = text.match(/^SHORT_DESCRIPTION:\s*(.+)$/m)
    if (descMatch) {
      description = descMatch[1].trim().slice(0, 80)
      text = text.replace(/\n*^SHORT_DESCRIPTION:.*$/m, '').trim()
    }
    const relMatch = text.match(/^INFERRED_RELATIONSHIP:\s*(.+)$/m)
    if (relMatch) {
      inferredRelationship = relMatch[1].trim().slice(0, 100)
      text = text.replace(/\n*^INFERRED_RELATIONSHIP:.*$/m, '').trim()
    }
    const impMatch = text.match(/^INFERRED_IMPRESSION:\s*(.+)$/m)
    if (impMatch) {
      inferredImpression = impMatch[1].trim().slice(0, 200)
      text = text.replace(/\n*^INFERRED_IMPRESSION:.*$/m, '').trim()
    }
    let inferredTheirImpression = ''
    const theirImpMatch = text.match(/^INFERRED_THEIR_IMPRESSION:\s*(.+)$/m)
    if (theirImpMatch) {
      inferredTheirImpression = theirImpMatch[1].trim().slice(0, 200)
      text = text.replace(/\n*^INFERRED_THEIR_IMPRESSION:.*$/m, '').trim()
    }

    // Defensive post-process: even with explicit "do not let placeholders appear
    // in output" prompt directives, low-temp samplers (qwen, etc.) sometimes elevate
    // [tracking_id]/[number]/[contact_id]/wxid_xxx into "personality traits". This
    // strips them deterministically as a safety net.
    text = _scrubGeneratedPersona(text, suggestedName || resolvedProfile?.name || '', language)
    description = _scrubGeneratedPersona(description, suggestedName || resolvedProfile?.name || '', language)
    inferredImpression = _scrubGeneratedPersona(inferredImpression, suggestedName || resolvedProfile?.name || '', language)
    inferredTheirImpression = _scrubGeneratedPersona(inferredTheirImpression, suggestedName || resolvedProfile?.name || '', language)

    // Extract key memories from chat history
    emit('analyze', 88, msg.extractMem)
    let memories = []
    try {
      memories = await _extractKeyMemories(messageBlock, resolvedProfile, config, language, contextWindows, analyzeTarget)
      logger.info(`personaBuilder: extracted ${memories.length} key memories`)
    } catch (memErr) {
      logger.error('personaBuilder: memory extraction failed:', memErr.message)
    }

    emit('done', 100, msg.done)
    return { success: true, systemPrompt: text, suggestedName, description, inferredRelationship, inferredImpression, inferredTheirImpression, memories }
  } catch (err) {
    logger.error('personaBuilder:generatePersona error', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Extract profile fields from the system prompt part of a combined prompt.
 */
function _extractProfileFromPrompt(promptPart) {
  const get = (label) => {
    const m = promptPart.match(new RegExp(`${label}:\\s*(.+)`, 'i'))
    return m ? m[1].trim() : ''
  }
  return {
    name: get('Name') || 'Unknown',
    gender: get('Gender') || 'Unknown',
    relationship: get('Relationship') || 'Not specified',
    impression: get('Impression') || 'None provided',
  }
}

module.exports = {
  buildCombinedPrompt,
  generatePersona,
  // Exported for reuse by AnalyzeAgentTool parallel analysis
  estimateTokens,
  getContextWindow,
  _splitMessageBlock,
  _callLLM,
  // Exported for unit testing — pure post-process scrubber
  _scrubGeneratedPersona,
}
