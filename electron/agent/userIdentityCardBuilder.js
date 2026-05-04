'use strict'

/**
 * userIdentityCardBuilder.js — generate a short identity card for a user
 * persona, used by systemPromptBuilder when telling speaking agents who
 * they're talking to.
 *
 * Architectural goal (per design 2026-05-04): replace verbatim injection
 * of a user persona's full prompt (which contained the user's internal
 * decision instincts / language DNA / micro-style — content that bled
 * into the agent's voice) with a tight ~250-char fact card. The agent
 * needs to KNOW the user, not BECOME them.
 *
 * The card includes ONLY:
 *   - Name + one-line role
 *   - High-level identity (profession + location)
 *   - Key relations (names of family / friends / pets the user mentions)
 *   - Recent / current life context (one or two factual lines)
 *
 * The card EXCLUDES:
 *   - The user's language DNA / catchphrases / sentence rhythm
 *   - The user's decision instincts / mental models / core tensions
 *   - The user's internal psychological dynamics
 *   - Anything that primes the speaking agent to mimic the user's voice
 */

const { logger } = require('../logger')

const CARD_PROMPT_ZH = (name, description, prompt) => `你正在帮一个数字人系统生成"用户身份卡"——一段短小的事实档案，让数字人知道自己正在和谁聊天，但不会被用户的内部心理学污染。

下方是一个用户的完整 persona 文档。请从中提取**仅事实性内容**，写一个 ~200 字的中文身份卡，包含以下结构（每行一条，不能空缺时写"暂无"）：

姓名：${name}
一句话身份：${description || '（从 persona 第一段提炼一句）'}
高层职业 / 行业：（一句话，例如"在新加坡做软件开发"，不要写技术细节）
居住地 / 时区线索：（一句话）
关键关系：（最多 5 个名字 + 关系，例如"妻子、5 岁儿子李泡泡、母亲、同事吴雨桐"——只写出现在 persona 里的具体人名 + 关系，不写"家人"这种泛指）
当下生活 / 近期背景：（1-2 句，事实性，例如"最近在准备孩子的暑期寄宿"——不写"她相信..."这种内心戏）
关系 / 称谓建议：（一句话，例如"老朋友，可以用名字称呼"——便于数字人选合适的语气）

**严格禁止**写入：
- 用户的"思维内核"、"决策本能"、"核心张力"——那是用户自己的心理剧本
- 用户的"语言 DNA"、"口头禅"、"句式偏好"——那是用户自己的说话方式，不是数字人的
- 用户的"微观风格"、"情感行为"——同上
- 任何"她相信 X" / "他倾向于 Y" / "你害怕 Z" 这种第三方贴标签

**只输出身份卡内容本身**，不要任何前后缀解释、不要 markdown 标题、不要代码块包裹。

---

${prompt || '(persona 文档为空)'}`

const CARD_PROMPT_EN = (name, description, prompt) => `You are generating a user identity card — a short factual profile for a digital persona system, used so a speaking agent can know who they're talking to without being primed by the user's own internal psychology.

Below is a user's full persona document. Extract ONLY factual content into a ~200-word identity card with the following structure (one item per line; write "n/a" when something can't be determined):

Name: ${name}
One-line identity: ${description || '(distill one sentence from the first paragraph)'}
High-level profession / industry: (one sentence, e.g. "Software engineer in Singapore" — no tech-stack detail)
Location / timezone clues: (one sentence)
Key relations: (up to 5 names + relations, e.g. "Wife, 5-year-old son Pao Pao, mother, colleague Yuyang" — only specific names + relations actually in the persona; never generic "family")
Current life / recent context: (1-2 factual sentences — e.g. "Currently preparing son's summer host-family arrangements" — no "she believes..." inner monologue)
Relationship / address suggestion: (one sentence — e.g. "Old friend; name address fine" — to help the agent pick the right register)

**Strictly forbidden** in the card:
- The user's "mental models" / "decision instincts" / "core tensions" — that's the user's private psychological script
- The user's "language DNA" / "catchphrases" / "punctuation preferences" — that's how the user speaks, NOT the agent
- The user's "micro-style" / "emotional behavior" — same reason
- Any "she believes X" / "he tends to Y" / "you fear Z" third-party labelling

**Output ONLY the card content itself** — no preamble, no markdown headers, no code-fence wrappers.

---

${prompt || '(persona document is empty)'}`

/**
 * Build the prompt that asks the LLM to extract a user identity card.
 * Pure function — exported for unit testability.
 */
function buildCardPrompt(userAgent, language) {
  const name = (userAgent?.name || 'Unknown').trim()
  const description = (userAgent?.description || '').trim()
  const prompt = (userAgent?.prompt || '').trim()
  const lang = language === 'zh' ? 'zh' : 'en'
  return lang === 'zh'
    ? CARD_PROMPT_ZH(name, description, prompt)
    : CARD_PROMPT_EN(name, description, prompt)
}

/**
 * Deterministic minimum card — used when LLM extraction is unavailable
 * (no utility model configured) or fails. Just name + description, which
 * is the safest possible fallback: the agent knows who they're talking to
 * by name, and gets one-line context.
 */
function _minimalCard(userAgent, language) {
  const name = userAgent?.name || (language === 'zh' ? '未知用户' : 'Unknown user')
  const desc = (userAgent?.description || '').trim()
  if (language === 'zh') {
    return `姓名：${name}\n一句话身份：${desc || '暂无'}`
  }
  return `Name: ${name}\nOne-line identity: ${desc || 'n/a'}`
}

/**
 * Generate a user identity card via the configured utility model.
 *
 * Returns a string (the card body) or null if generation fails. Callers
 * should always handle null gracefully — at runtime, systemPromptBuilder
 * falls back to a minimal "${name}\n${description}" block when the card
 * is missing.
 *
 * Idempotent: calling repeatedly with the same input returns equivalent
 * output (LLM-stochastic, but caller is expected to cache).
 */
async function buildUserIdentityCard(userAgent, llmConfig, language = 'en') {
  if (!userAgent) return null
  if (!llmConfig?.utilityModel?.provider || !llmConfig?.utilityModel?.model) {
    logger.warn('[userIdentityCard] no utility model configured — falling back to minimal card')
    return _minimalCard(userAgent, language)
  }
  // If the persona body is essentially empty, skip the LLM call — the
  // model would just hallucinate context. Return the deterministic
  // minimum.
  if (!(userAgent.prompt || '').trim()) {
    return _minimalCard(userAgent, language)
  }

  try {
    const { _callLLM } = require('./chatImport/personaBuilder')
    const prompt = buildCardPrompt(userAgent, language)
    const raw = await _callLLM(prompt, llmConfig, 1024, { maxRetries: 1 })
    const cleaned = String(raw || '').trim()
    if (!cleaned) {
      logger.warn('[userIdentityCard] LLM returned empty — using minimal card')
      return _minimalCard(userAgent, language)
    }
    // Defensive cap — even if the LLM ignored the length guidance the card
    // should never bloat past ~600 chars and balloon the agent prompt.
    if (cleaned.length > 1200) {
      logger.warn(`[userIdentityCard] LLM produced ${cleaned.length} chars — truncating to 1200`)
      return cleaned.slice(0, 1200) + (language === 'zh' ? '…' : '…')
    }
    return cleaned
  } catch (err) {
    logger.warn('[userIdentityCard] generation failed:', err.message)
    return _minimalCard(userAgent, language)
  }
}

module.exports = {
  buildUserIdentityCard,
  buildCardPrompt,
  _minimalCard,
}
