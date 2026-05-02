'use strict'

/**
 * personaPipeline.js — orchestrator for the 4-phase Persona-aligned extraction.
 *
 * Pipeline:
 *   Phase 1 (extractors.js)  — parallel dimension extractors emit raw claims
 *   Phase 2 (critic.js)      — Triple Verification filters claims
 *   Phase 3 (synthesizer.js) — assemble verified claims into 8 Persona sections
 *   Phase 4 — handled by validator UI in the wizard (Code Phase D)
 *
 * Adaptive strategy based on chat size:
 *   < 80 messages  → skip (data too sparse, rely on legacy single-prompt)
 *   80-499         → LITE mode: 2 merged extractors (behavioral + relationship)
 *   500+           → FULL mode: 5 focused extractors
 *
 * Speech DNA (Phase A / dimension #3 in Persona) is a separate pipeline in
 * speechDnaExtractor.js — runs in parallel from the IPC handler, not here.
 */

const { logger } = require('../../logger')
const { tagMessagesWithIds, formatTaggedChatBlock } = require('./claims')
const { runExtractors, EXTRACTORS_FULL, EXTRACTORS_LITE } = require('./extractors')
const { verifyClaims } = require('./critic')
const { synthesizePersonaSections } = require('./synthesizer')

// ── Thresholds ─────────────────────────────────────────────────────────────

// Below this: skip Persona pipeline entirely.
const MIN_MESSAGES_FOR_PERSONA = 80

// Below this: use LITE (2-dim merged) extractors. At or above: use FULL (5-dim).
const FULL_MODE_THRESHOLD = 500

// Cap chat block fed into extractors to prevent prompt overflow.
const MAX_MESSAGES_FOR_PROMPT = 400

// ── Accuracy tier ──────────────────────────────────────────────────────────
// Returned to the caller so the UI can show a warning.

/**
 * Determine the accuracy tier for a given message count.
 * @param {number} count
 * @returns {{ tier: 'skip'|'low'|'medium'|'high', mode: 'none'|'lite'|'full', message: object }}
 */
function getAccuracyTier(count, language) {
  const zh = language === 'zh'
  if (count < MIN_MESSAGES_FOR_PERSONA) {
    return {
      tier: 'skip',
      mode: 'none',
      message: {
        en: `Only ${count} messages — too few for multi-dimensional analysis. Basic persona generation only.`,
        zh: `仅 ${count} 条消息 — 数据量太少，无法做多维分析。仅使用基础人格生成。`,
      },
    }
  }
  if (count < FULL_MODE_THRESHOLD) {
    return {
      tier: 'low',
      mode: 'lite',
      message: {
        en: `${count} messages — accuracy will be limited. 500+ messages recommended for best results. Using lite analysis (2 dimensions).`,
        zh: `${count} 条消息 — 准确度有限。建议 500 条以上以获得最佳效果。使用精简分析（2 维）。`,
      },
    }
  }
  if (count < 2000) {
    return {
      tier: 'medium',
      mode: 'full',
      message: {
        en: `${count} messages — good data volume. Full 5-dimension analysis.`,
        zh: `${count} 条消息 — 数据量不错。使用完整 5 维分析。`,
      },
    }
  }
  return {
    tier: 'high',
    mode: 'full',
    message: {
      en: `${count} messages — excellent data. Full 5-dimension analysis with high confidence.`,
      zh: `${count} 条消息 — 数据非常充足。完整 5 维高置信度分析。`,
    },
  }
}

/**
 * Pick the messages to feed into Phase 1.
 */
function buildExtractionMessages(classified) {
  const all = classified?.all_messages || []
  if (all.length === 0) return []

  const recent = all.slice(-MAX_MESSAGES_FOR_PROMPT)
  const seen = new Set(recent)
  const extras = []

  const buckets = [
    classified.long_messages || [],
    classified.conflict_messages || [],
    classified.sweet_messages || [],
  ]
  for (const bucket of buckets) {
    for (const m of bucket) {
      if (!seen.has(m) && extras.length < 50) {
        seen.add(m)
        extras.push(m)
      }
    }
  }

  const merged = [...recent, ...extras]
  merged.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
    return ta - tb
  })
  return merged
}

/**
 * Main entry — run the adaptive 4-phase pipeline.
 *
 * @param {object} classified    - from classifyMessages()
 * @param {object} profile       - { name, gender, ... }
 * @param {object} config        - app config (utility model)
 * @param {string} language      - 'en' or 'zh'
 * @param {string} analyzeTarget - 'self' or 'other'
 * @param {function} [onProgress] - ({ phase, message, progress }) => void
 * @returns {Promise<object|null>} { sections, evidenceIndex, counts, accuracyTier } or null
 */
async function extractPersonaSections(classified, profile, config, language, analyzeTarget, onProgress) {
  const emit = (phase, progress, message) => {
    onProgress && onProgress({ phase, progress, message })
  }

  try {
    const all = classified?.all_messages || []
    const accuracy = getAccuracyTier(all.length, language)

    if (accuracy.tier === 'skip') {
      logger.info(`[personaPipeline] skipping — ${all.length} messages, tier=${accuracy.tier}`)
      return { accuracyTier: accuracy }
    }

    const name = profile?.name || (analyzeTarget === 'self' ? 'Me' : 'Them')
    const extractorList = accuracy.mode === 'full' ? EXTRACTORS_FULL : EXTRACTORS_LITE
    const dimLabel = accuracy.mode === 'full' ? '5' : '2'

    // ── Build tagged chat block ────────────────────────────────────────────
    const messagesForExtraction = buildExtractionMessages(classified)
    const { tagged, lookup } = tagMessagesWithIds(messagesForExtraction)
    if (tagged.length === 0) return { accuracyTier: accuracy }
    const chatBlock = formatTaggedChatBlock(tagged, name)

    logger.info(`[personaPipeline] starting ${accuracy.mode} mode (${dimLabel}-dim) with ${tagged.length} tagged messages`)

    // ── Phase 1: parallel extractors ──────────────────────────────────────
    const zh = language === 'zh'
    emit('extract', 10, zh ? `阶段 1/4：${dimLabel} 维并行抽取...` : `Phase 1/4: ${dimLabel}-dim parallel extraction...`)
    const { allClaims, perDimension } = await runExtractors(chatBlock, lookup, name, config, language, (dim, count) => {
      logger.debug(`[personaPipeline] dimension ${dim} produced ${count} claims`)
    }, extractorList)

    if (allClaims.length === 0) {
      logger.warn('[personaPipeline] all extractors returned 0 claims, aborting')
      return { accuracyTier: accuracy }
    }
    logger.info(`[personaPipeline] Phase 1 complete: ${allClaims.length} raw claims across ${Object.keys(perDimension).length} dimensions`)

    // ── Phase 2: Triple Verification ──────────────────────────────────────
    emit('verify', 50, zh ? '阶段 2/4：三重验证...' : 'Phase 2/4: triple verification...')
    const { verified, rejected } = await verifyClaims(allClaims, name, config, language)
    if (verified.length === 0) {
      logger.warn('[personaPipeline] critic rejected all claims, aborting')
      return { accuracyTier: accuracy }
    }
    logger.info(`[personaPipeline] Phase 2 complete: ${verified.length} verified, ${rejected.length} rejected`)

    // ── Phase 3: Synthesis ───────────────────────────────────────────────
    emit('synthesize', 80, zh ? '阶段 3/4：合成 8 个 persona section...' : 'Phase 3/4: synthesizing 8 sections...')
    const synth = await synthesizePersonaSections(verified, profile, chatBlock, config, language)
    if (synth?.evidenceIndex) {
      synth.evidenceIndex.rejectedCount = rejected.length
      synth.evidenceIndex.mode = accuracy.mode
      synth.evidenceIndex.messageCount = all.length
    }

    emit('done', 100, zh ? '抽取完成' : 'Extraction complete')
    logger.info(`[personaPipeline] complete (${accuracy.mode}). Counts: ${JSON.stringify(synth.counts)}`)

    return {
      ...synth,
      accuracyTier: accuracy,
    }
  } catch (err) {
    logger.error('[personaPipeline] extractPersonaSections error:', err.message)
    return null
  }
}

module.exports = {
  extractPersonaSections,
  getAccuracyTier,
  MIN_MESSAGES_FOR_PERSONA,
  FULL_MODE_THRESHOLD,
}
