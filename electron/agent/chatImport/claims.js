'use strict'

/**
 * claims.js — schema + helpers for the Persona-style claim/evidence pipeline.
 *
 * A "claim" is a single observation about the target person, extracted from
 * chat history by one of the dimension extractors in extractors.js. Every
 * claim must carry evidence (a list of msg ids it was derived from) so the
 * critic.js Triple Verification stage can audit it.
 *
 * Pipeline:
 *   extractors.js → produces raw claims
 *   critic.js    → verifies each claim against 3 criteria, drops weak ones
 *   synthesizer.js → assembles verified claims into 8 persona sections
 */

const { logger } = require('../../logger')

/**
 * Tag messages with stable ids for evidence references.
 * Returns an array of { id, sender, content, timestamp } and a Map for lookup.
 *
 * Ids are simple sequential "m1", "m2", ... strings — short enough to be cheap
 * in prompts and unambiguous in JSON evidence arrays.
 */
function tagMessagesWithIds(messages) {
  const tagged = []
  const lookup = new Map()
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (!m || !m.content || !m.content.trim()) continue
    const id = `m${i + 1}`
    const tag = {
      id,
      sender: m.sender || 'unknown',
      content: m.content,
      timestamp: m.timestamp || null,
    }
    tagged.push(tag)
    lookup.set(id, tag)
  }
  return { tagged, lookup }
}

/**
 * Format tagged messages as a chat block with id prefixes for the prompt.
 *
 * Output looks like:
 *   [m1] 2024-07-12 22:15 Me: 今天好累
 *   [m2] 2024-07-12 22:16 Them: 怎么了
 */
function formatTaggedChatBlock(tagged, themLabel = 'Them') {
  const { scrubOneTimeIds } = require('./chatParser')
  const lines = []
  for (const t of tagged) {
    const sender = t.sender === 'them' ? themLabel : (t.sender === 'me' ? 'Me' : t.sender)
    const ts = t.timestamp ? `${t.timestamp} ` : ''
    const content = scrubOneTimeIds((t.content || '').replace(/\n+/g, ' ').slice(0, 500))
    lines.push(`[${t.id}] ${ts}${sender}: ${content}`)
  }
  return lines.join('\n')
}

/**
 * Tolerant JSON parser — strips markdown fences and salvages first {...} or [...].
 */
function parseJsonResponse(raw) {
  if (!raw) return null
  let s = String(raw).trim()
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  // Try as-is first
  try { return JSON.parse(s) } catch {}
  // Fall back: find the first { or [ and the last matching bracket
  const firstObj = s.indexOf('{')
  const firstArr = s.indexOf('[')
  let start = -1, endChar = ''
  if (firstObj >= 0 && (firstArr < 0 || firstObj < firstArr)) {
    start = firstObj; endChar = '}'
  } else if (firstArr >= 0) {
    start = firstArr; endChar = ']'
  }
  if (start < 0) return null
  const end = s.lastIndexOf(endChar)
  if (end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch (err) {
    logger.warn('[claims] JSON parse failed:', err.message)
    return null
  }
}

/**
 * Validate and normalize a raw claim object from an extractor.
 * Returns null if the claim is malformed.
 *
 * @param {object} raw          Raw claim from LLM
 * @param {string} dimension    Which dimension produced this claim
 * @param {Map}    lookup       Message id → message lookup, for evidence validation
 * @param {string} idPrefix     Unique prefix for claim ids (e.g. "considered")
 * @param {number} idx          Index within the dimension's output
 */
function normalizeClaim(raw, dimension, lookup, idPrefix, idx) {
  if (!raw || typeof raw !== 'object') return null
  const claimText = (raw.claim || raw.observation || raw.text || '').trim()
  if (!claimText || claimText.length < 5) return null

  // Evidence must be an array of strings; filter out ids that don't exist
  let evidence = []
  if (Array.isArray(raw.evidence)) {
    evidence = raw.evidence
      .map(e => typeof e === 'string' ? e.trim() : '')
      .filter(id => id && lookup.has(id))
  }
  // Drop claims with zero verifiable evidence — they're hallucinations
  if (evidence.length === 0) return null

  let confidence = typeof raw.confidence === 'number' ? raw.confidence : 0.6
  if (confidence < 0) confidence = 0
  if (confidence > 1) confidence = 1

  return {
    id: `${idPrefix}_c${idx + 1}`,
    dimension,
    claim: claimText,
    evidence,
    confidence,
  }
}

module.exports = {
  tagMessagesWithIds,
  formatTaggedChatBlock,
  parseJsonResponse,
  normalizeClaim,
}
