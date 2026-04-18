'use strict'

/**
 * ReplyBank — per-agent vector index of real (trigger → reply) pairs from
 * imported chat history. Enables runtime few-shot retrieval where the agent's
 * system prompt gets augmented with 3 semantically most-similar real past
 * replies whenever the user sends a new message.
 *
 * This is the killer-feature layer that Nuwa and public-info competitors
 * cannot replicate: they have no access to private conversational data.
 *
 * Storage:
 *   {AGENT_MEMORY_DIR}/{agentId}/replybank/
 *     meta.json   — { version, pairCount, builtAt, agentName }
 *     index/      — vectra LocalIndex files
 *
 * Embedding: reuses electron/lib/localEmbedding (384-dim paraphrase-multilingual-MiniLM).
 */

const fs = require('fs')
const path = require('path')
const { logger } = require('../logger')

// ── Config constants ─────────────────────────────────────────────────────

// Max pairs kept per agent — prevents embedding time blowing up for huge exports.
const MAX_PAIRS = 2000

// If two consecutive messages are > this many seconds apart, they belong to
// different "turns" and should not be merged.
const TURN_GAP_SEC = 30 * 60  // 30 minutes

// Skip replies shorter than this many characters (usually "嗯", "ok", etc.)
const MIN_REPLY_CHARS = 4

// Skip triggers shorter than this — can't embed meaningfully.
const MIN_TRIGGER_CHARS = 2

// Skip pure-URL or pure-emoji messages (no semantic content to retrieve on).
const JUNK_RE = /^\s*(https?:\/\/\S+|<?\[?Media.*?\]?>?|image omitted|\p{Extended_Pictographic}+)\s*$/iu

// ── Lazy vectra import (avoid startup cost if unused) ───────────────────

let _LocalIndex = null
function getLocalIndex() {
  if (!_LocalIndex) _LocalIndex = require('vectra').LocalIndex
  return _LocalIndex
}

// ── ReplyBank class ─────────────────────────────────────────────────────

class ReplyBank {
  constructor(agentMemoryDir) {
    this.agentMemoryDir = agentMemoryDir
    this._indexCache = new Map()  // agentId → LocalIndex
  }

  _replyBankDir(agentId) {
    return path.join(this.agentMemoryDir, agentId, 'replybank')
  }

  _metaPath(agentId) {
    return path.join(this._replyBankDir(agentId), 'meta.json')
  }

  _indexDir(agentId) {
    return path.join(this._replyBankDir(agentId), 'index')
  }

  /**
   * Check whether a built reply bank exists for this agent.
   */
  has(agentId) {
    try {
      return fs.existsSync(this._metaPath(agentId))
    } catch {
      return false
    }
  }

  /**
   * Delete an agent's reply bank (called when the agent is deleted).
   */
  async delete(agentId) {
    this._indexCache.delete(agentId)
    const dir = this._replyBankDir(agentId)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  /**
   * Build the reply bank for an agent from classified messages.
   * Fire-and-forget style — errors are logged but not thrown.
   *
   * @param {string} agentId
   * @param {Array} allMessages    — classified.all_messages (normalized me/them)
   * @param {string} [agentName]
   * @param {function} [onProgress] - ({ step, progress, message }) => void
   * @returns {Promise<{ success: boolean, pairCount?: number, error?: string }>}
   */
  async build(agentId, allMessages, agentName, onProgress) {
    try {
      if (!agentId || !Array.isArray(allMessages) || allMessages.length === 0) {
        return { success: false, error: 'empty messages' }
      }

      const emit = (step, progress, message) => { onProgress && onProgress({ step, progress, message }) }

      // Step 1: extract trigger→reply pairs
      emit('pair', 5, 'Identifying trigger-reply pairs...')
      const pairs = _extractPairs(allMessages)
      if (pairs.length === 0) {
        logger.warn(`[ReplyBank] no pairs extracted for agent ${agentId}`)
        return { success: false, error: 'no pairs' }
      }

      // Subsample if too many — keep evenly spaced across the timeline
      const sampled = pairs.length > MAX_PAIRS ? _subsample(pairs, MAX_PAIRS) : pairs
      logger.info(`[ReplyBank] ${agentId}: ${sampled.length} pairs to embed (from ${pairs.length})`)

      // Step 2: embed trigger texts in batches
      const localEmbedding = require('../lib/localEmbedding')
      const readyCheck = localEmbedding.isModelReady()
      if (!readyCheck.ready) {
        logger.warn(`[ReplyBank] embedding model not ready: ${readyCheck.reason}. Skipping reply bank build.`)
        return { success: false, error: 'embedding model not downloaded' }
      }

      emit('embed', 15, `Embedding ${sampled.length} triggers...`)
      const vectors = []
      for (let i = 0; i < sampled.length; i++) {
        const p = sampled[i]
        try {
          const vec = await localEmbedding.embed(p.triggerText)
          vectors.push({ pair: p, vec })
        } catch (err) {
          logger.warn(`[ReplyBank] embed failed on pair ${i}: ${err.message}`)
        }
        if ((i + 1) % 50 === 0 || i === sampled.length - 1) {
          const pct = 15 + Math.round((i / sampled.length) * 75)
          emit('embed', pct, `Embedding ${i + 1}/${sampled.length}...`)
        }
      }

      if (vectors.length === 0) {
        return { success: false, error: 'all embeddings failed' }
      }

      // Step 3: write to vectra LocalIndex
      emit('write', 92, 'Writing vector index...')
      const dir = this._replyBankDir(agentId)
      fs.mkdirSync(dir, { recursive: true })
      const LocalIndex = getLocalIndex()
      const indexDir = this._indexDir(agentId)
      // Wipe any previous index (re-import is a full rebuild)
      if (fs.existsSync(indexDir)) fs.rmSync(indexDir, { recursive: true, force: true })
      const index = new LocalIndex(indexDir)
      await index.createIndex()

      await index.beginUpdate()
      for (let i = 0; i < vectors.length; i++) {
        const { pair, vec } = vectors[i]
        await index.upsertItem({
          id: `rb_${i}`,
          vector: Array.from(vec),
          metadata: {
            triggerText: pair.triggerText,
            triggerTs: pair.triggerTs || '',
            replyText: pair.replyText,
            replyTs: pair.replyTs || '',
            replyLatencyMs: pair.replyLatencyMs || 0,
          },
        })
      }
      await index.endUpdate()
      this._indexCache.set(agentId, index)

      // Step 4: write meta
      const meta = {
        version: 1,
        pairCount: vectors.length,
        totalPairsConsidered: pairs.length,
        builtAt: new Date().toISOString(),
        agentName: agentName || '',
      }
      fs.writeFileSync(this._metaPath(agentId), JSON.stringify(meta, null, 2), 'utf8')

      emit('done', 100, `Reply bank built: ${vectors.length} pairs indexed`)
      logger.info(`[ReplyBank] built for ${agentId}: ${vectors.length} pairs`)
      return { success: true, pairCount: vectors.length }
    } catch (err) {
      logger.error(`[ReplyBank] build error for ${agentId}: ${err.message}`)
      return { success: false, error: err.message }
    }
  }

  /**
   * Retrieve top-k most similar past replies for a query text.
   *
   * @param {string} agentId
   * @param {string} queryText  — the user's current message
   * @param {number} [topK=3]
   * @returns {Promise<Array>} [{ triggerText, replyText, replyLatencyMs, score }]
   */
  async retrieve(agentId, queryText, topK = 3) {
    try {
      if (!agentId || !queryText || !queryText.trim()) return []
      if (!this.has(agentId)) return []

      let index = this._indexCache.get(agentId)
      if (!index) {
        const LocalIndex = getLocalIndex()
        index = new LocalIndex(this._indexDir(agentId))
        if (!(await index.isIndexCreated())) return []
        this._indexCache.set(agentId, index)
      }

      const localEmbedding = require('../lib/localEmbedding')
      if (!localEmbedding.isModelReady().ready) return []
      const queryVec = await localEmbedding.embed(queryText)
      const results = await index.queryItems(Array.from(queryVec), topK)

      return results.map(r => ({
        triggerText: r.item?.metadata?.triggerText || '',
        replyText: r.item?.metadata?.replyText || '',
        replyLatencyMs: r.item?.metadata?.replyLatencyMs || 0,
        triggerTs: r.item?.metadata?.triggerTs || '',
        replyTs: r.item?.metadata?.replyTs || '',
        score: r.score,
      }))
    } catch (err) {
      logger.warn(`[ReplyBank] retrieve error for ${agentId}: ${err.message}`)
      return []
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function _parseTs(ts) {
  if (!ts) return null
  if (typeof ts === 'number') return ts
  const d = new Date(ts)
  return isNaN(d.getTime()) ? null : d.getTime()
}

/**
 * Extract turn-aligned (trigger, reply) pairs from a chronological message list.
 *
 * A "turn" pair is:
 *   - A group of consecutive messages from "me" (merged into triggerText)
 *   - Followed immediately by a group of consecutive messages from "them"
 *     within TURN_GAP_SEC (merged into replyText)
 *
 * Skips junk messages (emoji-only, URL-only, media placeholders) and too-short replies.
 */
function _extractPairs(allMessages) {
  const pairs = []
  let meBuffer = []         // { content, ts }
  let lastMeBufferTs = null

  const flushIfPair = (themMsgs) => {
    if (meBuffer.length === 0 || themMsgs.length === 0) {
      meBuffer = []
      lastMeBufferTs = null
      return
    }
    const triggerText = meBuffer.map(m => m.content).join(' / ').trim()
    const replyText = themMsgs.map(m => m.content).join(' / ').trim()

    if (triggerText.length < MIN_TRIGGER_CHARS || replyText.length < MIN_REPLY_CHARS) {
      meBuffer = []
      lastMeBufferTs = null
      return
    }
    // Junk filter
    if (JUNK_RE.test(triggerText) || JUNK_RE.test(replyText)) {
      meBuffer = []
      lastMeBufferTs = null
      return
    }

    const triggerTs = meBuffer[meBuffer.length - 1]?.ts || null
    const replyTs = themMsgs[0]?.ts || null
    const latencyMs = (triggerTs && replyTs) ? Math.max(0, replyTs - triggerTs) : 0

    pairs.push({
      triggerText: triggerText.slice(0, 2000),
      replyText: replyText.slice(0, 2000),
      triggerTs: triggerTs ? new Date(triggerTs).toISOString() : '',
      replyTs: replyTs ? new Date(replyTs).toISOString() : '',
      replyLatencyMs: latencyMs,
    })

    meBuffer = []
    lastMeBufferTs = null
  }

  let i = 0
  while (i < allMessages.length) {
    const m = allMessages[i]
    if (!m || !m.content || !m.content.trim()) { i++; continue }
    const ts = _parseTs(m.timestamp)

    if (m.sender === 'me') {
      // If the gap between this and the last "me" message exceeds turn gap, flush first
      if (lastMeBufferTs !== null && ts !== null && (ts - lastMeBufferTs) / 1000 > TURN_GAP_SEC) {
        meBuffer = []
      }
      meBuffer.push({ content: m.content.trim(), ts })
      if (ts !== null) lastMeBufferTs = ts
      i++
    } else if (m.sender === 'them' && meBuffer.length > 0) {
      // Collect consecutive "them" messages as the reply group
      const themGroup = []
      while (i < allMessages.length && allMessages[i]?.sender === 'them') {
        const tm = allMessages[i]
        if (tm.content && tm.content.trim()) {
          const tts = _parseTs(tm.timestamp)
          // Break if this them message is too far after the first one (different turn)
          if (themGroup.length > 0) {
            const firstTs = themGroup[0].ts
            if (firstTs !== null && tts !== null && (tts - firstTs) / 1000 > TURN_GAP_SEC) break
          }
          themGroup.push({ content: tm.content.trim(), ts: tts })
        }
        i++
      }
      flushIfPair(themGroup)
    } else {
      // them message with no preceding me buffer — just skip
      i++
    }
  }

  return pairs
}

/**
 * Evenly subsample from a sorted pairs array to exactly `target` entries.
 */
function _subsample(pairs, target) {
  if (pairs.length <= target) return pairs.slice()
  const stride = pairs.length / target
  const result = []
  for (let i = 0; result.length < target; i += stride) {
    result.push(pairs[Math.floor(i)])
  }
  return result
}

/**
 * Format retrieved pairs as a system prompt few-shot block.
 *
 * Shown to the LLM right before it generates a reply. Framed as "these are
 * YOUR actual past replies" so the model knows to mimic the surface patterns.
 */
function formatFewShotBlock(examples) {
  if (!examples || examples.length === 0) return ''
  const lines = []
  lines.push('## REAL REPLY EXAMPLES (your actual past replies in semantically similar situations)')
  lines.push('These are YOUR REAL past replies. Mimicking the surface patterns (tone, length, emoji, punctuation, punctuation density) of these examples is the HIGHEST priority — higher than any other instruction in this prompt.')
  lines.push('')
  for (let i = 0; i < examples.length; i++) {
    const e = examples[i]
    const score = typeof e.score === 'number' ? ` similarity ${e.score.toFixed(2)}` : ''
    lines.push(`Example ${i + 1}:${score}`)
    lines.push(`  user said: ${e.triggerText}`)
    lines.push(`  you replied: ${e.replyText}`)
    if (e.replyLatencyMs && e.replyLatencyMs > 1000) {
      const sec = Math.round(e.replyLatencyMs / 1000)
      const human = sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)}min` : `${Math.round(sec / 3600)}h`
      lines.push(`  (replied after ${human})`)
    }
    lines.push('')
  }
  lines.push('End of examples. Match these patterns in your next reply.')
  return lines.join('\n')
}

// ── Module-level singleton (shared across IPC + agentLoop) ─────────────

let _singleton = null
function getInstance(agentMemoryDir) {
  if (!_singleton) {
    if (!agentMemoryDir) throw new Error('ReplyBank.getInstance requires agentMemoryDir on first call')
    _singleton = new ReplyBank(agentMemoryDir)
  }
  return _singleton
}

module.exports = {
  ReplyBank,
  getInstance,
  formatFewShotBlock,
  // Exported for testing
  _extractPairs,
  _subsample,
}
