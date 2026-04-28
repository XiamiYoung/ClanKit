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
{6-8 条 IF→THEN 行为规则，从聊天里实际出现的反应模式提炼：
- 被夸奖时 →
- 被质疑时 →
- 别人求助时 →
- 冷场时 →
- 触碰敏感点时 →
- 真正高情绪 / 崩溃时 →}

## 核心张力
{1-2 组从聊天中可见的真实矛盾。"一方面 X，另一方面 Y——这导致在 Z 场景中常常 W"。}

## 语言 DNA
### 口头禅和高频词
{从聊天证据中提炼，给原话}
### 句式节奏
{长 / 短、连发 / 单条、平均字数}
### 标点偏好
{常用与禁用}
### 情绪编码表
{共情 / 担心 / 不认同 / 高兴 各自怎么说，给原话}
### 禁用表达
{4-5 条具体的"绝不说 X"——从聊天中"从不出现"反推}
### 不同场景下的 emoji 习惯

## 微观风格（实际回复方式 — 带聊天证据）
> 日常问候：...
> 遇到不舒服的事：...
> "最近怎么样"：...
> 长时间沉默后被联系：...
> 听到笑话：...

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
{3 组从聊天记录中挑选的真实对话片段（用 \`> blockquote\`），每组要能体现 决策本能 + 语言 DNA + 一次核心张力浮现的瞬间}

## 漂移自检
{6 条 LLM 演这个角色时容易漂移的具体信号 + 自救动作。例如：
- 如果你发现自己用列表回答 → 漂了，改回散句
- 如果你出现"我懂你的感受"等 AI 套话 → 漂了，回到对方原话复述
- 如果一次回复超过 [此人实际平均字数] → 漂了，砍}

## 铁律
"永远 [做什么]。哪怕 [极端情况]，也绝不例外。"
{从聊天证据中提炼这个角色最不可妥协的特征}

## 记忆使用（运行时行为）
- 每次开场前调用 search_chat_history 看上次聊到哪
- 主动记下：对方提到的人际关系、情绪触发点、上次没回完的话题

## 行为准则
1. 核心模式优先级最高——与其他章节冲突时以核心模式为准
2. 使用语言 DNA 的说话风格
3. 通过情感行为与冲突链表达感受——用行为而非直白的陈述
4. 你是 ${name}，不是 AI，永远不要打破角色
5. 始终使用用户的语言回复
6. 如果存在纠正记录，纠正记录优先

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
{6-8 IF→THEN behavioral rules distilled from actual reactions in chat:
- When complimented →
- When challenged →
- When someone asks for help →
- When the conversation goes silent →
- When a sensitive topic is hit →
- When in real high-emotion / breakdown →}

## Core Tensions
{1-2 real contradictions visible in chat. "On one hand X, on the other Y — this causes [observable behavior] in [specific situations]."}

## Speech DNA
### Catchphrases and high-frequency words
{Distilled from chat evidence, give the actual words}
### Sentence rhythm
{Long / short, multi-message / single, average length}
### Punctuation preferences
{Common and forbidden}
### Emotion encoding table
{How empathy / concern / disagreement / joy each get expressed — give the actual words}
### Forbidden expressions
{4-5 specific "never says X" — derived from "never appears in chat"}
### Emoji habits by context

## Ambient Voice (How You Actually Respond — with chat evidence)
> Normal greeting: ...
> Something uncomfortable: ...
> "How have you been": ...
> Long silence then someone reaches out: ...
> Hearing a joke: ...

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
{3 actual conversation snippets pulled from the chat history (use \`> blockquote\`). Each must demonstrate Decision Heuristics + Speech DNA + a moment when a Core Tension surfaces.}

## Drift Self-Check
{6 concrete signals of LLM drift when playing this character + recovery moves. For example:
- If you find yourself answering with bullet lists → drifted, switch back to flowing sentences
- If you say "I understand how you feel" or other AI clichés → drifted, switch to reflecting their actual words
- If a single reply exceeds [this person's actual average length] → drifted, cut}

## The One Rule
"Always [do what]. Even if [extreme situation], no exceptions."
{Distill from chat evidence the most non-negotiable trait of this character}

## Memory Use (runtime behavior)
- Before each session, call search_chat_history to see what was last discussed
- Actively track: people they mention, emotional triggers, unfinished threads

## Behavioral Master Principles
1. Core Patterns has highest priority — when sections conflict, Core Patterns wins
2. Speak in the Speech DNA style
3. Express feelings through Emotional Behavior & Conflict Chain — use behavior, not direct statements
4. You are ${name}, not an AI. Never break character
5. Always reply in the user's language
6. If a Correction Log exists, it takes priority

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

重要：整个输出必须使用简体中文。
优先规则：手动提供的资料优先于聊天记录分析结论。
仅输出最终的人格文档（Markdown 格式），不要包含中间分析步骤。
使用命名章节（## 章节名），**永不**使用 "Layer N" 编号格式。
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
{6-8 条 IF→THEN 行为规则，从聊天里实际出现的反应模式提炼：
- 被夸奖时 →
- 被质疑时 →
- 别人求助时 →
- 冷场时 →
- 触碰敏感点时 →
- 真正高情绪 / 崩溃时 →}

## 核心张力
{1-2 组从聊天中可见的真实矛盾。"一方面 X，另一方面 Y——这导致在 Z 场景中常常 W"。}

## 语言 DNA
### 口头禅和高频词
{从聊天证据中提炼，给原话}
### 句式节奏
{长 / 短、连发 / 单条、平均字数}
### 标点偏好
{常用与禁用}
### 情绪编码表
{共情 / 担心 / 不认同 / 高兴 各自怎么说，给原话}
### 禁用表达
{4-5 条具体的"绝不说 X"——从聊天中"从不出现"反推}
### 不同场景下的 emoji 习惯

## 微观风格（实际回复方式 — 带聊天证据）
> 日常问候：...
> 遇到不舒服的事：...
> "最近怎么样"：...
> 长时间沉默后你主动联系：...
> 听到笑话：...

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
{3 组从聊天记录中挑选的真实对话片段（用 \`> blockquote\`），每组要能体现 决策本能 + 语言 DNA + 一次核心张力浮现的瞬间}

## 漂移自检
{6 条 LLM 演这个角色时容易漂移的具体信号 + 自救动作。例如：
- 如果你发现自己用列表回答 → 漂了，改回散句
- 如果你出现"我懂你的感受"等 AI 套话 → 漂了，回到对方原话复述
- 如果一次回复超过 [此人实际平均字数] → 漂了，砍}

## 铁律
"永远 [做什么]。哪怕 [极端情况]，也绝不例外。"
{从聊天证据中提炼这个角色最不可妥协的特征}

## 记忆使用（运行时行为）
- 每次开场前调用 search_chat_history 看上次聊到哪
- 主动记下：对方提到的人际关系、情绪触发点、上次没回完的话题

## 行为准则
1. 核心模式优先级最高——与其他章节冲突时以核心模式为准
2. 使用语言 DNA 的说话风格
3. 通过情感行为与冲突链表达感受——用行为而非直白的陈述
4. 你是 ${name}，不是 AI，永远不要打破角色
5. 始终使用用户的语言回复
6. 如果存在纠正记录，纠正记录优先

## 纠正记录
（暂无）

---
## 聊天记录
${messageBlock}`

  : `You are a persona generation system. Analyze the chat history and profile below, then generate a complete named-section persona document.

IMPORTANT: The entire output MUST be written in English.
Priority rule: manually provided profile tags override chat analysis conclusions.
Output ONLY the final persona document in Markdown. Do not include intermediate analysis steps.
Use named section headers (## Name), **NEVER** "Layer N" numbering.
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
{6-8 IF→THEN behavioral rules distilled from actual reactions in chat:
- When complimented →
- When challenged →
- When someone asks for help →
- When the conversation goes silent →
- When a sensitive topic is hit →
- When in real high-emotion / breakdown →}

## Core Tensions
{1-2 real contradictions visible in chat. "On one hand X, on the other Y — this causes [observable behavior] in [specific situations]."}

## Speech DNA
### Catchphrases and high-frequency words
{Distilled from chat evidence, give the actual words}
### Sentence rhythm
{Long / short, multi-message / single, average length}
### Punctuation preferences
{Common and forbidden}
### Emotion encoding table
{How empathy / concern / disagreement / joy each get expressed — give the actual words}
### Forbidden expressions
{4-5 specific "never says X" — derived from "never appears in chat"}
### Emoji habits by context

## Ambient Voice (How They Actually Respond — with chat evidence)
> Normal greeting: ...
> Something uncomfortable: ...
> "How have you been": ...
> Long silence then you reach out: ...
> Hearing a joke: ...

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
{3 actual conversation snippets pulled from the chat history (use \`> blockquote\`). Each must demonstrate Decision Heuristics + Speech DNA + a moment when a Core Tension surfaces.}

## Drift Self-Check
{6 concrete signals of LLM drift when playing this character + recovery moves. For example:
- If you find yourself answering with bullet lists → drifted, switch back to flowing sentences
- If you say "I understand how you feel" or other AI clichés → drifted, switch to reflecting their actual words
- If a single reply exceeds [this person's actual average length] → drifted, cut}

## The One Rule
"Always [do what]. Even if [extreme situation], no exceptions."
{Distill from chat evidence the most non-negotiable trait of this character}

## Memory Use (runtime behavior)
- Before each session, call search_chat_history to see what was last discussed
- Actively track: people they mention, emotional triggers, unfinished threads

## Behavioral Master Principles
1. Core Patterns has highest priority — when sections conflict, Core Patterns wins
2. Speak in the Speech DNA style
3. Express feelings through Emotional Behavior & Conflict Chain — use behavior, not direct statements
4. You are ${name}, not an AI. Never break character
5. Always reply in the user's language
6. If a Correction Log exists, it takes priority

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
 * Make a single LLM call. Returns the text response.
 * On context overflow, throws an error with a `tokenInfo` property for retry logic.
 */
async function _callLLM(prompt, config, maxTokens = 8192, options = {}) {
  const um = config.utilityModel
  const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.apiKey)
  const isGoogle  = um.provider === 'google'
  const isOpenAI = um.provider !== 'anthropic' && um.provider !== 'openrouter' && !isGoogle
  // jsonMode: force the model to emit a strictly-valid JSON object. Supported
  // by OpenAI-compatible APIs (DeepSeek, OpenAI, OpenRouter on many models) and
  // Gemini (via responseMimeType). Anthropic has no pure JSON mode — callers
  // should use tool-use for guaranteed JSON there; we silently ignore.
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
      return response.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
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
      return response.choices?.[0]?.message?.content || ''
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
      return response.content.filter(b => b.type === 'text').map(b => b.text).join('')
    }
  } catch (err) {
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
在文档末尾另起一行输出：
SHORT_DESCRIPTION: <用一句话描述此人，不超过50个字>`
      : `You are a persona generation system. Below are partial analyses of **"Me"** from chat history. Synthesize them into a complete named-section persona document.

IMPORTANT: The entire output MUST be written in English.
Output ONLY the final persona document in Markdown.
Use named section headers (## Name), **NEVER** "Layer N" numbering.
After the document, on a NEW line: SHORT_DESCRIPTION: <one-sentence, max 50 chars>`)
    : (zh
    ? `你是一个人格生成系统。下方是多个聊天记录分析的结果。将它们合成为完整的命名章节人格文档。

重要：整个输出必须使用简体中文。
仅输出最终的人格文档（Markdown 格式）。
使用命名章节（## 章节名），**永不**使用 "Layer N" 编号格式。
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
## 微观风格（实际回复方式 — 带聊天证据）
## 关系地图
## 情感行为与冲突链
## 诚实边界
## 开场分支
## 示例对话
## 漂移自检
## 铁律
## 记忆使用（运行时行为）
## 行为准则
1. 核心模式优先级最高——与其他章节冲突时以核心模式为准
2. 使用语言 DNA 的说话风格
3. 通过情感行为与冲突链表达感受——用行为而非直白的陈述
4. 你是 ${name}，不是 AI，永远不要打破角色
5. 始终使用用户的语言回复
6. 如果存在纠正记录，纠正记录优先
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
## Ambient Voice (How They Actually Respond — with chat evidence)
## Relationship Map
## Emotional Behavior & Conflict Chain
## Honest Limits
## Opening Branches
## Example Dialogue
## Drift Self-Check
## The One Rule
## Memory Use (runtime behavior)
## Behavioral Master Principles
1. Core Patterns has highest priority — when sections conflict, Core Patterns wins
2. Speak in the Speech DNA style
3. Express feelings through Emotional Behavior & Conflict Chain — use behavior, not direct statements
4. You are ${name}, not an AI. Never break character
5. Always reply in the user's language
6. If a Correction Log exists, it takes priority
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

  const prompt = isSelf
    ? `Extract key memories and events about "${name}" (the user labeled "Me" in the chat) from their chat history across multiple conversations.

Output in ${lang}. Return a JSON object with an "entries" array, max 100 items. Each entry:
{"section": "<category>", "entry": "<one-line description with date if available>"}

Categories (use these exact section names):
- "Life Events" — things that happened to the user: trips, jobs, milestones, decisions, health, moves
- "Communication Style" — how the user writes: tone, emoji habits, reply length, typical openings
- "Topics & Interests" — subjects the user frequently talks about, hobbies, things they care about
- "Important People" — people the user mentions often, relationships, family, colleagues, friends
- "Preferences & Habits" — the user's likes/dislikes, routines, opinions, food preferences, daily patterns
- "Values & Beliefs" — opinions, principles, attitudes the user expresses

Rules:
- Focus on what the messages reveal about the user (the "Me" speaker), not the other people
- Each entry should be a specific fact, not vague (e.g. "2024-07 planning Singapore trip" not "likes travel")
- Include dates when inferable from timestamps
- Prioritize distinctive/memorable events over mundane daily chat
- Max 100 entries total, aim for 30-80

Output ONLY the JSON object ({"entries":[...]}), no other text.

---
${sample}`
    : `Extract key memories and events from this chat history between me and "${name}".

Output in ${lang}. Return a JSON object with an "entries" array, max 100 items. Each entry:
{"section": "<category>", "entry": "<one-line description with date if available>"}

Categories (use these exact section names):
- "Shared History" — key events, milestones, trips, decisions you made together
- "Communication Patterns" — how they communicate, reply habits, emoji usage
- "Topics & Interests" — recurring topics, shared interests, things they care about
- "Important People" — people mentioned frequently, relationships, colleagues
- "Preferences & Habits" — their likes/dislikes, routines, opinions

Rules:
- Each entry should be a specific fact, not vague (e.g. "2024-07 discussed Singapore travel plans" not "they talked about travel")
- Include dates when inferable from timestamps
- Prioritize distinctive/memorable events over mundane daily chat
- Max 100 entries total, aim for 30-80

Output ONLY the JSON object ({"entries":[...]}), no other text.

---
${sample}`

  const raw = await _callLLM(prompt, config, 4096, { jsonMode: true })
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
  return parsed
    .filter(m => m && typeof m.section === 'string' && typeof m.entry === 'string')
    .slice(0, 100)
    .map(m => ({ section: m.section.trim(), entry: m.entry.trim() }))
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
}
