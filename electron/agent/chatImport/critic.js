'use strict'

/**
 * critic.js — Phase 2 of the Nuwa pipeline: Triple Verification.
 *
 * Each claim from the extractors must pass three checks (照搬 nuwa 方法论):
 *   1. Cross-Domain Reproduction  — appears in ≥2 different topics/contexts
 *   2. Generative Power           — predicts the person's reaction to new situations
 *   3. Exclusivity                — distinctive to this person, not generic human
 *
 * Filtering logic:
 *   - 3/3 pass → "mental_model" (highest tier)
 *   - 1-2 pass → "heuristic"    (decision heuristic)
 *   - 0/3 pass → rejected
 *
 * The critic LLM batches all claims in a single call to keep cost down.
 */

const { logger } = require('../../logger')
const { parseJsonResponse } = require('./claims')

function buildCriticPrompt(claims, name, language) {
  const zh = language === 'zh'
  const list = claims.map(c => `[${c.id}] (${c.dimension}) "${c.claim}" | evidence: ${c.evidence.join(', ')}`).join('\n')

  if (zh) {
    return `你是一个性格分析的批判性审查者。下面是从 ${name} 真实聊天记录中提取的若干 claim，每条都附了 evidence msg id。请对每条 claim 做三项检查：

1. **cross_domain（跨域复现）**：这个模式是否在 ≥2 个不同话题/语境中出现？看 evidence 的覆盖面是否多样。
2. **generative（生成力）**：用这个 claim 能否预测 TA 对**新场景**的反应？太具体的事实（如"喜欢吃西瓜"）不算 generative。
3. **exclusive（排他性）**：这是 TA 的特征还是所有正常人都会做的事？通用行为不算。

verdict 规则：
- 3 项全过 → "mental_model"
- 1-2 项通过 → "heuristic"
- 0 项通过 → "reject"

输出严格 JSON（对象形式）：
{ "verdicts": [
  { "claimId": "considered_c1", "cross_domain": true, "generative": true, "exclusive": false, "verdict": "heuristic", "reason": "<一句话理由>" }
] }

只输出 JSON，每条 claim 一项 verdict。

---
Claims:
${list}`
  }

  return `You are a critical reviewer for character analysis. Below are claims extracted from ${name}'s real chat history, each with evidence msg ids. For each claim, check three criteria:

1. **cross_domain (Cross-Domain Reproduction)**: Does this pattern appear in ≥2 different topics/contexts? Look at evidence diversity.
2. **generative (Generative Power)**: Can this claim predict ${name}'s reaction to NEW situations? Too-specific facts (e.g. "likes watermelon") aren't generative.
3. **exclusive (Exclusivity)**: Is this distinctive to ${name} or just generic human behavior?

Verdict rules:
- All 3 pass → "mental_model"
- 1-2 pass → "heuristic"
- 0 pass → "reject"

Output STRICT JSON (object form):
{ "verdicts": [
  { "claimId": "considered_c1", "cross_domain": true, "generative": true, "exclusive": false, "verdict": "heuristic", "reason": "<one-line>" }
] }

ONE verdict entry per claim. Output ONLY JSON.

---
Claims:
${list}`
}

/**
 * Run Triple Verification over all claims.
 *
 * @param {Array}  claims    — normalized claims from extractors
 * @param {string} name      — target person's name
 * @param {object} config    — app config
 * @param {string} language  — 'en' or 'zh'
 * @returns {Promise<{ verified: Array, rejected: Array }>}
 *          verified claims have a `verdict` field of 'mental_model' or 'heuristic'
 */
async function verifyClaims(claims, name, config, language) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return { verified: [], rejected: [] }
  }

  // Batch in chunks to keep prompt size bounded (~30 claims per call)
  const BATCH = 30
  const verdictMap = new Map()  // claimId → verdict object

  try {
    const { _callLLM } = require('./personaBuilder')

    for (let i = 0; i < claims.length; i += BATCH) {
      const batch = claims.slice(i, i + BATCH)
      const prompt = buildCriticPrompt(batch, name, language)
      const raw = await _callLLM(prompt, config, 2048, { jsonMode: true })
      const parsed = parseJsonResponse(raw)
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.verdicts) ? parsed.verdicts : [])

      for (const v of arr) {
        if (v && typeof v.claimId === 'string') {
          verdictMap.set(v.claimId, {
            cross_domain: !!v.cross_domain,
            generative: !!v.generative,
            exclusive: !!v.exclusive,
            verdict: v.verdict || 'reject',
            reason: v.reason || '',
          })
        }
      }
    }
  } catch (err) {
    logger.warn(`[critic] LLM call failed (${err.message}), keeping all claims as heuristics`)
    // Fallback: if critic fails entirely, treat everything as a heuristic so we
    // still produce useful output instead of dropping the whole pipeline.
    return {
      verified: claims.map(c => ({ ...c, verdict: 'heuristic', cross_domain: false, generative: false, exclusive: false, reason: 'critic-fallback' })),
      rejected: [],
    }
  }

  const verified = []
  const rejected = []
  for (const c of claims) {
    const v = verdictMap.get(c.id)
    if (!v) {
      // No verdict returned — keep as heuristic (defensive default)
      verified.push({ ...c, verdict: 'heuristic', cross_domain: false, generative: false, exclusive: false, reason: 'no-verdict' })
      continue
    }
    if (v.verdict === 'reject') {
      rejected.push({ ...c, ...v })
    } else {
      verified.push({ ...c, ...v })
    }
  }

  logger.info(`[critic] Triple Verification: ${verified.length} kept (${verified.filter(c => c.verdict === 'mental_model').length} mental models, ${verified.filter(c => c.verdict === 'heuristic').length} heuristics), ${rejected.length} rejected`)
  return { verified, rejected }
}

module.exports = { verifyClaims }
