'use strict'

/**
 * extractors.js — Phase 1 of the Persona pipeline.
 *
 * 5 parallel dimension extractors that read tagged chat messages and emit
 * structured claims with evidence. Each extractor is a focused LLM call with
 * a strict JSON output contract. They run in parallel via Promise.all.
 *
 * Maps onto Persona's 6 research agents:
 *   1. Considered Thoughts    ← "Writings" dimension (long messages, thought-out)
 *   2. Improvised Reactions   ← "Conversations" dimension (rapid back-and-forth)
 *   3. (Speech DNA, handled by speechDnaExtractor.js as Phase A)
 *   4. Self & Others          ← "External Views" dimension (self-image + relational refs)
 *   5. Decision Moments       ← "Decisions" dimension (conflict + commitment)
 *   6. Relationship Timeline  ← "Timeline" dimension (chronological arc)
 */

const { logger } = require('../../logger')
const { normalizeClaim, parseJsonResponse } = require('./claims')

// ── Dimension prompt builders ──────────────────────────────────────────────

function buildConsideredPrompt(name, chatBlock, language) {
  const zh = language === 'zh'
  if (zh) {
    return `你是一个性格分析专家，正在分析 ${name} 的真实聊天记录中"深思熟虑的表达"。

任务：从下面的聊天记录中找出 ${name}（标记为"Them"）的**长消息 / 多段连发**所反映的稳定模式——TA 在认真表达时会暴露什么样的思考方式、价值观、情绪逻辑？

每条结论必须引用至少 2 条原文 message id（[m1] [m23] 形式），不能凭一句话推断。

输出严格 JSON（不要 markdown 代码块）：
{
  "claims": [
    { "claim": "<具体观察，一句话>", "evidence": ["m12", "m45", "m89"], "confidence": 0.0-1.0 }
  ]
}

要求：
- 5-10 条 claim
- 每条至少 2 个 evidence msg id
- 只输出稳定模式，丢弃孤例
- 输出 ONLY JSON

---
聊天记录：
${chatBlock}`
  }
  return `You are a character analyst studying the "considered expressions" of ${name} from real chat history.

Task: From the chat below, identify stable patterns in ${name}'s (marked "Them") **long messages and multi-message bursts** — what does ${name} reveal about their thinking, values, and emotional logic when they speak deliberately?

Every claim must cite AT LEAST 2 message ids ([m1], [m23] format). No single-message inferences.

Output STRICT JSON (no markdown fences):
{
  "claims": [
    { "claim": "<one-line specific observation>", "evidence": ["m12", "m45"], "confidence": 0.0-1.0 }
  ]
}

Requirements:
- 5-10 claims
- Each with ≥2 evidence ids
- Only stable patterns, drop one-offs
- Output ONLY JSON

---
Chat:
${chatBlock}`
}

function buildImprovisedPrompt(name, chatBlock, language) {
  const zh = language === 'zh'
  if (zh) {
    return `你是一个对话行为分析专家，正在分析 ${name} 的真实聊天记录中"临场反应"模式。

任务：从下面的聊天记录中找出 ${name}（标记为"Them"）在**短促对话、快速 back-and-forth** 中暴露的反射性反应——TA 没有时间深思熟虑时怎么回？哪些反应是肌肉记忆？

每条结论必须引用至少 2 条原文 message id。

输出严格 JSON：
{
  "claims": [
    { "claim": "<具体反应模式>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

要求：5-10 条；每条 ≥2 evidence；只看 ${name} 的快速回复；只输出 JSON

---
聊天记录：
${chatBlock}`
  }
  return `You are an interaction-pattern analyst studying ${name}'s improvised reactions in real chat.

Task: From the chat below, identify reflexive response patterns in ${name}'s (marked "Them") **rapid short exchanges** — what does ${name} do when they don't have time to think? Which responses are muscle memory?

Every claim must cite AT LEAST 2 message ids.

Output STRICT JSON:
{
  "claims": [
    { "claim": "<specific reaction pattern>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

Requirements: 5-10 claims; each with ≥2 evidence; focus on rapid replies; ONLY JSON

---
Chat:
${chatBlock}`
}

function buildSelfOthersPrompt(name, chatBlock, language) {
  const zh = language === 'zh'
  if (zh) {
    return `你是一个关系拓扑分析专家，正在分析 ${name} 的聊天记录中的"自我形象 + 他人提及"。

任务：找出 ${name}（标记为"Them"）：
1. 怎么描述 TA 自己（自我形象）
2. 怎么提到第三方人物（家人、朋友、同事、前任）
3. 怎么描述"我"（用户）以及对"我"的态度
4. 哪些人在 TA 生命中重要、谁让 TA 烦、谁让 TA 放心

每条结论必须引用至少 2 条原文 message id。

输出严格 JSON：
{
  "claims": [
    { "claim": "<具体观察>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

要求：5-12 条；每条 ≥2 evidence；只输出 JSON

---
聊天记录：
${chatBlock}`
  }
  return `You are a relational-topology analyst studying ${name}'s self-image and references to others in real chat.

Task: From the chat below, identify how ${name} (marked "Them"):
1. Describes themselves (self-image)
2. Mentions third parties (family, friends, colleagues, exes)
3. Describes "Me" (the user) and their attitude toward me
4. Who matters in their life, who annoys them, who they trust

Every claim must cite AT LEAST 2 message ids.

Output STRICT JSON:
{
  "claims": [
    { "claim": "<specific observation>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

Requirements: 5-12 claims; each with ≥2 evidence; ONLY JSON

---
Chat:
${chatBlock}`
}

function buildDecisionsPrompt(name, chatBlock, language) {
  const zh = language === 'zh'
  if (zh) {
    return `你是一个决策行为分析专家，正在分析 ${name} 的聊天记录中"关键决定时刻"——冲突、和解、承诺、撤回。

任务：从下面的聊天记录中找出 ${name}（标记为"Them"）在以下时刻暴露的决策模式：
1. 被冒犯/不爽时第一反应是什么？怎么升级？怎么降级？
2. 表达关心时具体怎么做？
3. 承诺什么 / 撤回什么？
4. 道歉（或不道歉）的方式
5. 沉默的时长和含义

每条结论必须引用至少 2 条原文 message id。

输出严格 JSON：
{
  "claims": [
    { "claim": "<具体决策模式>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

要求：5-10 条；每条 ≥2 evidence；只输出 JSON

---
聊天记录：
${chatBlock}`
  }
  return `You are a decision-pattern analyst studying ${name}'s key moments in real chat — conflict, reconciliation, commitment, withdrawal.

Task: From the chat below, identify decision patterns ${name} (marked "Them") shows when:
1. Offended/upset — first reaction, how it escalates, how it de-escalates
2. Expressing care — what does it look like specifically?
3. Committing to something / withdrawing
4. Apologizing (or not)
5. Silence — duration and meaning

Every claim must cite AT LEAST 2 message ids.

Output STRICT JSON:
{
  "claims": [
    { "claim": "<specific decision pattern>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

Requirements: 5-10 claims; each with ≥2 evidence; ONLY JSON

---
Chat:
${chatBlock}`
}

function buildTimelinePrompt(name, chatBlock, language) {
  const zh = language === 'zh'
  if (zh) {
    return `你是一个关系时间线分析专家，正在分析 ${name} 和"我"之间的关系演变。

任务：从下面的聊天记录中提取**关系里程碑 + 最近 3 个月的动态**：
1. 重要事件、共同经历的时刻
2. 关系亲密度的变化（更近 / 更远 / 稳定）
3. 反复出现的话题主线
4. 最近 3 个月的明显变化（防过时）

每条结论必须引用至少 2 条原文 message id，时间能推断的话写出日期。

输出严格 JSON：
{
  "claims": [
    { "claim": "<具体时间线节点>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

要求：4-10 条；每条 ≥2 evidence；按时间顺序；只输出 JSON

---
聊天记录：
${chatBlock}`
  }
  return `You are a relationship-timeline analyst studying the arc between ${name} and "Me".

Task: From the chat below, extract **relationship milestones + last-3-months activity**:
1. Important events, shared moments
2. Changes in intimacy (closer / more distant / stable)
3. Recurring topic threads
4. Visible changes in the last 3 months (anti-staleness)

Every claim must cite AT LEAST 2 message ids; include dates when inferable.

Output STRICT JSON:
{
  "claims": [
    { "claim": "<specific timeline point>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

Requirements: 4-10 claims; each with ≥2 evidence; chronological; ONLY JSON

---
Chat:
${chatBlock}`
}

// ── Merged (lite) prompt builders for small chats (80-500 messages) ────────
// Two prompts instead of five — keeps cost down when data is sparse.

function buildBehavioralMergedPrompt(name, chatBlock, language) {
  const zh = language === 'zh'
  if (zh) {
    return `你是一个性格分析专家，正在分析 ${name} 的真实聊天记录。从以下维度全面提取 TA 的稳定行为模式：

1. **深思熟虑的表达**：长消息/多段连发中暴露的思维方式、价值观、情绪逻辑
2. **临场反应**：短促 back-and-forth 对话中的反射性反应、肌肉记忆式回复
3. **决策时刻**：被冒犯时的第一反应、升级/降级链、道歉（或不道歉）的方式、沉默的含义
4. **核心价值观**：TA 反复维护的立场、拒绝妥协的事、说话方式背后的信念

每条结论必须引用至少 2 条原文 message id。

输出严格 JSON：
{
  "claims": [
    { "claim": "<具体观察>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

要求：10-18 条 claim；每条 ≥2 evidence；只输出稳定模式；只输出 JSON

---
聊天记录：
${chatBlock}`
  }
  return `You are a character analyst studying ${name}'s real chat history. Extract stable behavioral patterns across these dimensions:

1. **Considered expressions**: thinking patterns, values, emotional logic from long messages / multi-message bursts
2. **Improvised reactions**: reflexive responses in rapid back-and-forth, muscle-memory replies
3. **Decision moments**: first reaction when offended, escalation/de-escalation chains, apology style, silence signals
4. **Core values**: positions they repeatedly defend, things they refuse to compromise on, beliefs behind their speech

Every claim must cite AT LEAST 2 message ids.

Output STRICT JSON:
{
  "claims": [
    { "claim": "<specific observation>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

Requirements: 10-18 claims; each with ≥2 evidence; only stable patterns; ONLY JSON

---
Chat:
${chatBlock}`
}

function buildRelationshipMergedPrompt(name, chatBlock, language) {
  const zh = language === 'zh'
  if (zh) {
    return `你是一个关系分析专家，正在分析 ${name} 与"我"之间的关系动态。从以下维度提取：

1. **自我形象**：TA 怎么描述自己、自称方式、自我评价
2. **对我的态度**：TA 怎么称呼"我"、对"我"的情感倾向、权力动态
3. **第三方提及**：TA 经常提到谁、家人朋友同事的角色、谁让 TA 安心/烦
4. **关系里程碑**：重要事件、共同经历、亲密度变化趋势
5. **最近 3 个月动态**：最近的变化（防过时）

每条结论必须引用至少 2 条原文 message id。

输出严格 JSON：
{
  "claims": [
    { "claim": "<具体观察>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

要求：8-14 条 claim；每条 ≥2 evidence；时间线类尽量注明日期；只输出 JSON

---
聊天记录：
${chatBlock}`
  }
  return `You are a relationship analyst studying the dynamics between ${name} and "Me". Extract patterns across:

1. **Self-image**: how they describe themselves, self-reference style, self-evaluation
2. **Attitude toward me**: what they call me, emotional stance, power dynamics
3. **Third-party mentions**: who they frequently mention, family/friend/colleague roles, who comforts/annoys them
4. **Relationship milestones**: key events, shared moments, intimacy trend
5. **Last 3 months**: recent changes (anti-staleness)

Every claim must cite AT LEAST 2 message ids.

Output STRICT JSON:
{
  "claims": [
    { "claim": "<specific observation>", "evidence": ["m..."], "confidence": 0.0-1.0 }
  ]
}

Requirements: 8-14 claims; each with ≥2 evidence; include dates where inferable; ONLY JSON

---
Chat:
${chatBlock}`
}

// ── Extractor registries ───────────────────────────────────────────────────

// Full 5-dim: for chats with 500+ messages — maximum extraction depth.
const EXTRACTORS_FULL = [
  { dimension: 'considered',   label: '01-considered-thoughts',   buildPrompt: buildConsideredPrompt },
  { dimension: 'improvised',   label: '02-improvised-reactions',  buildPrompt: buildImprovisedPrompt },
  { dimension: 'self_others',  label: '04-self-and-others',       buildPrompt: buildSelfOthersPrompt },
  { dimension: 'decisions',    label: '05-decision-moments',      buildPrompt: buildDecisionsPrompt },
  { dimension: 'timeline',     label: '06-relationship-timeline', buildPrompt: buildTimelinePrompt },
]

// Lite 2-dim (merged): for chats with 80-499 messages — fewer LLM calls,
// broader prompts. "behavioral" merges considered+improvised+decisions,
// "relationship" merges self_others+timeline.
const EXTRACTORS_LITE = [
  { dimension: 'behavioral',   label: 'merged-behavioral',        buildPrompt: buildBehavioralMergedPrompt },
  { dimension: 'relationship', label: 'merged-relationship',      buildPrompt: buildRelationshipMergedPrompt },
]

// Legacy alias for backward compat
const EXTRACTORS = EXTRACTORS_FULL

/**
 * Run extractors in parallel against the same tagged chat block.
 *
 * @param {string} chatBlock    - formatted message block with [m1] ... ids
 * @param {Map}    lookup       - msg id → message lookup for evidence validation
 * @param {string} name         - target person's name
 * @param {object} config       - app config (utility model)
 * @param {string} language     - 'en' or 'zh'
 * @param {function} [onProgress] - per-dimension progress callback
 * @param {Array}  [extractorList] - which extractors to run (default: EXTRACTORS_FULL)
 * @returns {Promise<{ allClaims: Array, perDimension: Object }>}
 */
async function runExtractors(chatBlock, lookup, name, config, language, onProgress, extractorList) {
  const { _callLLM } = require('./personaBuilder')
  const list = extractorList || EXTRACTORS_FULL

  const results = await Promise.all(
    list.map(async (ex) => {
      try {
        const prompt = ex.buildPrompt(name, chatBlock, language)
        const raw = await _callLLM(prompt, config, 6144, { jsonMode: true })
        const parsed = parseJsonResponse(raw)
        const rawClaims = Array.isArray(parsed?.claims) ? parsed.claims : []

        const normalized = []
        for (let i = 0; i < rawClaims.length; i++) {
          const c = normalizeClaim(rawClaims[i], ex.dimension, lookup, ex.dimension, i)
          if (c) normalized.push(c)
        }
        if (onProgress) onProgress(ex.dimension, normalized.length)
        logger.info(`[extractors] ${ex.label}: extracted ${normalized.length} valid claims (from ${rawClaims.length} raw)`)
        return { dimension: ex.dimension, label: ex.label, claims: normalized }
      } catch (err) {
        logger.warn(`[extractors] ${ex.label} failed: ${err.message}`)
        return { dimension: ex.dimension, label: ex.label, claims: [], error: err.message }
      }
    })
  )

  const allClaims = []
  const perDimension = {}
  for (const r of results) {
    perDimension[r.dimension] = r.claims
    allClaims.push(...r.claims)
  }

  return { allClaims, perDimension, results }
}

module.exports = {
  runExtractors,
  EXTRACTORS,
  EXTRACTORS_FULL,
  EXTRACTORS_LITE,
}
