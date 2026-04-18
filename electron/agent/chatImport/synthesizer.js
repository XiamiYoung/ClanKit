'use strict'

/**
 * synthesizer.js — Phase 3 of the Nuwa pipeline.
 *
 * Takes verified claims from the critic and assembles them into the 8 Nuwa
 * output sections, written as a structured object with markdown bullet lists
 * per section. The IPC layer then writes these into the agent's soul file.
 *
 * 8 Nuwa categories (Phase 3):
 *   1. Mental Models       — verified=mental_model, dimensions: any
 *   2. Decision Heuristics — verified=heuristic, dimension: decisions/improvised
 *   3. Expression DNA      — handled separately by speechDnaExtractor (Phase A)
 *   4. Values & Anti-Patterns — heuristic claims from considered/decisions
 *   5. Relational Genealogy — claims from self_others
 *   6. Honest Boundaries   — derived from chat coverage (what was NEVER discussed)
 *   7. Core Tensions       — contradictions between claims
 *   8. Relationship Timeline — claims from timeline dimension
 *
 * Plus: Identity Card (50-word self-intro in target's voice).
 */

const { logger } = require('../../logger')
const { parseJsonResponse } = require('./claims')

/**
 * Group verified claims into the 8 Nuwa sections.
 * Returns plain text bullet lists (one per section) plus the underlying claim ids
 * for the evidence index.
 */
function groupClaimsBySection(verified) {
  const sections = {
    mentalModels:        [],
    decisionHeuristics:  [],
    valuesAntiPatterns:  [],
    relationalGenealogy: [],
    relationshipTimeline: [],
    coreTensions:        [],
    honestBoundaries:    [],
  }

  for (const c of verified) {
    const isMentalModel = c.verdict === 'mental_model'
    const dim = c.dimension

    // Timeline dimension is its own section regardless of verdict
    if (dim === 'timeline') {
      sections.relationshipTimeline.push(c)
      continue
    }
    // Self/others dimension → Relational Genealogy
    if (dim === 'self_others') {
      sections.relationalGenealogy.push(c)
      continue
    }
    // Mental models from any other dimension
    if (isMentalModel) {
      sections.mentalModels.push(c)
      continue
    }
    // Decision/improvised heuristics → Decision Heuristics
    if (dim === 'decisions' || dim === 'improvised') {
      sections.decisionHeuristics.push(c)
      continue
    }
    // Considered (deliberate expressions) → Values & Anti-Patterns
    if (dim === 'considered') {
      sections.valuesAntiPatterns.push(c)
      continue
    }
    // Default bucket
    sections.decisionHeuristics.push(c)
  }

  return sections
}

/**
 * Detect contradictions within verified claims via LLM.
 * Used to populate "Core Tensions" (Nuwa requires ≥2 internal tensions).
 */
async function findCoreTensions(verified, name, config, language) {
  if (verified.length < 4) return []

  const list = verified.slice(0, 30).map(c => `[${c.id}] ${c.claim}`).join('\n')
  const zh = language === 'zh'
  const prompt = zh
    ? `下面是关于 ${name} 的若干已验证的性格观察。请找出其中**互相矛盾或存在张力**的对子（人有内在矛盾是正常的，这恰恰是真实性的标志）。

输出严格 JSON（对象形式）：
{ "tensions": [
  { "tension": "<一句话描述这对矛盾>", "claimA": "<id>", "claimB": "<id>" }
] }

找出 2-4 条真实张力，没有就返回 { "tensions": [] }。只输出 JSON。

---
${list}`
    : `Below are verified character observations about ${name}. Find **pairs that contradict or create internal tension** (people have internal contradictions — that's authentic).

Output STRICT JSON (object form):
{ "tensions": [
  { "tension": "<one-line description of the tension>", "claimA": "<id>", "claimB": "<id>" }
] }

Find 2-4 real tensions. If none, return { "tensions": [] }. Output ONLY JSON.

---
${list}`

  try {
    const { _callLLM } = require('./personaBuilder')
    const raw = await _callLLM(prompt, config, 1024, { jsonMode: true })
    const parsed = parseJsonResponse(raw)
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.tensions) ? parsed.tensions : [])
    return arr.slice(0, 5)
  } catch (err) {
    logger.warn('[synthesizer] findCoreTensions failed:', err.message)
  }
  return []
}

/**
 * Derive Honest Boundaries via LLM — what topics did the chat NOT cover.
 * The agent should say "I don't know" about these instead of making things up.
 */
async function deriveHonestBoundaries(name, chatBlock, config, language) {
  const zh = language === 'zh'
  // Sample a small portion of the chat block to keep cost down
  const sample = chatBlock.length > 4000 ? chatBlock.slice(-4000) : chatBlock
  const prompt = zh
    ? `下面是 ${name} 的真实聊天记录样本。请列出 3-6 条**这段聊天里完全没涉及**的话题——这些是 agent 不应该假装懂的领域。

输出严格 JSON：
{ "boundaries": ["<一句话描述某个 agent 不知道的领域>"] }

例子：
- "聊天里从未讨论过 TA 的工作细节，agent 应该说不知道"
- "完全没出现政治话题，agent 不应该编造立场"

只输出 JSON。

---
${sample}`
    : `Below is a sample of ${name}'s real chat history. List 3-6 topics this chat **completely fails to cover** — areas the agent should NOT pretend to know.

Output STRICT JSON:
{ "boundaries": ["<one-line description of an unknown area>"] }

Examples:
- "Chat never discusses their work details — agent should say it doesn't know"
- "No political topics appear — agent should not fabricate positions"

Output ONLY JSON.

---
${sample}`

  try {
    const { _callLLM } = require('./personaBuilder')
    const raw = await _callLLM(prompt, config, 1024, { jsonMode: true })
    const parsed = parseJsonResponse(raw)
    const arr = Array.isArray(parsed?.boundaries) ? parsed.boundaries : (Array.isArray(parsed) ? parsed : [])
    return arr.filter(b => typeof b === 'string').slice(0, 6)
  } catch (err) {
    logger.warn('[synthesizer] deriveHonestBoundaries failed:', err.message)
    return []
  }
}

/**
 * Generate the 50-word identity card in the target's own voice.
 */
async function generateIdentityCard(name, sampleClaims, config, language) {
  const zh = language === 'zh'
  const top = sampleClaims.slice(0, 8).map(c => `- ${c.claim}`).join('\n')
  const prompt = zh
    ? `根据下面对 ${name} 的若干已验证观察，用 ${name} 自己的口吻写一段 50 字以内的自我介绍（一人称）。要符合 TA 的真实风格，不要写成 AI 文案。

观察：
${top}

输出：直接给出那段自我介绍，不要任何前缀或解释。`
    : `Based on these verified observations about ${name}, write a self-introduction in ${name}'s own voice, under 50 words, first person. Match their authentic style — not AI marketing copy.

Observations:
${top}

Output: just the self-intro text, no prefix or explanation.`

  try {
    const { _callLLM } = require('./personaBuilder')
    const raw = await _callLLM(prompt, config, 256)
    return (raw || '').trim().replace(/^["']|["']$/g, '').slice(0, 300)
  } catch (err) {
    logger.warn('[synthesizer] generateIdentityCard failed:', err.message)
    return ''
  }
}

/**
 * Format a list of claims as markdown bullets, one per line.
 */
function formatClaimList(claims) {
  if (!claims || claims.length === 0) return ''
  return claims
    .map(c => `- ${c.claim} (evidence: ${c.evidence.slice(0, 3).join(', ')})`)
    .join('\n')
}

/**
 * Main entry — synthesize all 8 Nuwa sections from verified claims.
 *
 * Returns an object that the caller writes into the agent's soul file.
 */
async function synthesizeNuwaSections(verified, profile, chatBlock, config, language) {
  const name = profile?.name || 'Them'
  const grouped = groupClaimsBySection(verified)

  // Run the 3 enrichment LLM calls in parallel (tensions, boundaries, identity)
  const [tensions, boundaries, identityCard] = await Promise.all([
    findCoreTensions(verified, name, config, language),
    deriveHonestBoundaries(name, chatBlock, config, language),
    generateIdentityCard(name, verified, config, language),
  ])

  // Build the soul section markdown blobs
  const sections = {
    'Identity':              identityCard ? `\n${identityCard}\n` : '',
    'Mental Models':         '\n' + (formatClaimList(grouped.mentalModels) || '_(none extracted yet)_') + '\n',
    'Decision Heuristics':   '\n' + (formatClaimList(grouped.decisionHeuristics) || '_(none extracted yet)_') + '\n',
    'Values & Anti-Patterns':'\n' + (formatClaimList(grouped.valuesAntiPatterns) || '_(none extracted yet)_') + '\n',
    'Relational Genealogy':  '\n' + (formatClaimList(grouped.relationalGenealogy) || '_(none extracted yet)_') + '\n',
    'Honest Boundaries':     '\n' + (boundaries.length > 0 ? boundaries.map(b => `- ${b}`).join('\n') : '_(none derived yet)_') + '\n',
    'Core Tensions':         '\n' + (tensions.length > 0 ? tensions.map(t => `- ${t.tension}`).join('\n') : '_(none detected)_') + '\n',
    'Relationship Timeline': '\n' + (formatClaimList(grouped.relationshipTimeline) || '_(none extracted yet)_') + '\n',
  }

  // Evidence index — every claim with its full evidence list
  const evidenceIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    name,
    claims: verified.map(c => ({
      id: c.id,
      dimension: c.dimension,
      verdict: c.verdict,
      claim: c.claim,
      evidence: c.evidence,
      cross_domain: !!c.cross_domain,
      generative: !!c.generative,
      exclusive: !!c.exclusive,
    })),
    rejectedCount: 0,  // populated by caller
    coreTensions: tensions,
    honestBoundaries: boundaries,
  }

  return {
    sections,
    evidenceIndex,
    counts: {
      mentalModels: grouped.mentalModels.length,
      decisionHeuristics: grouped.decisionHeuristics.length,
      valuesAntiPatterns: grouped.valuesAntiPatterns.length,
      relationalGenealogy: grouped.relationalGenealogy.length,
      honestBoundaries: boundaries.length,
      coreTensions: tensions.length,
      relationshipTimeline: grouped.relationshipTimeline.length,
    },
  }
}

module.exports = {
  synthesizeNuwaSections,
  groupClaimsBySection,
}
