/**
 * Hybrid Search — combines vector similarity with full-text BM25 search.
 * Includes CJK bigram tokenizer for Chinese/Japanese/Korean text support.
 *
 * Each knowledge base maintains a serialized MiniSearch index alongside the
 * vectra vector index for hybrid retrieval.
 */
const path = require('path')
const fs = require('fs')
const MiniSearch = require('minisearch')
const { logger } = require('../logger')

// ── CJK Bigram Tokenizer ────────────────────────────────────────────────────

/**
 * Check if a character code is in a CJK range.
 */
function isCJK(code) {
  return (code >= 0x4E00 && code <= 0x9FFF)   // CJK Unified Ideographs
      || (code >= 0x3400 && code <= 0x4DBF)    // CJK Extension A
      || (code >= 0x3000 && code <= 0x303F)    // CJK Symbols
      || (code >= 0xFF00 && code <= 0xFFEF)    // Fullwidth Forms
}

/**
 * Tokenize text with CJK bigram support.
 * CJK characters → unigrams + bigrams; non-CJK → whitespace/punctuation split.
 */
function tokenize(text) {
  if (!text) return []
  const tokens = []
  let nonCjkBuf = ''

  const flushNonCjk = () => {
    if (nonCjkBuf.trim()) {
      const words = nonCjkBuf.trim().toLowerCase().split(/[\s\p{P}]+/u).filter(Boolean)
      tokens.push(...words)
    }
    nonCjkBuf = ''
  }

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (isCJK(code)) {
      flushNonCjk()
      // Unigram
      tokens.push(text[i])
      // Bigram with next CJK char
      if (i + 1 < text.length && isCJK(text.charCodeAt(i + 1))) {
        tokens.push(text[i] + text[i + 1])
      }
    } else {
      nonCjkBuf += text[i]
    }
  }
  flushNonCjk()
  return tokens
}

// ── MiniSearch Index Management ──────────────────────────────────────────────

const MINISEARCH_OPTIONS = {
  fields: ['text'],
  storeFields: ['text', 'documentName', 'documentId', 'chunkIndex'],
  tokenize,
  searchOptions: {
    tokenize,
    boost: { text: 1 },
    fuzzy: false,
    prefix: false,
  },
}

/**
 * Create a new MiniSearch index.
 * @returns {MiniSearch}
 */
function createSearchIndex() {
  return new MiniSearch(MINISEARCH_OPTIONS)
}

/**
 * Add chunks to a MiniSearch index.
 * @param {MiniSearch} index
 * @param {Array<{ id: string, text: string, documentName: string, documentId: string, chunkIndex: number }>} chunks
 */
function addToIndex(index, chunks) {
  // MiniSearch requires unique numeric or string IDs
  const docs = chunks.map(c => ({
    id: c.id,
    text: c.text,
    documentName: c.documentName || '',
    documentId: c.documentId || '',
    chunkIndex: c.chunkIndex ?? 0,
  }))
  index.addAll(docs)
}

/**
 * Remove chunks for a document from the index.
 * @param {MiniSearch} index
 * @param {string} documentId
 */
function removeFromIndex(index, documentId) {
  // MiniSearch doesn't support metadata-based removal, so we need to find matching docs
  const allDocs = []
  // We need to search with a broad query or iterate. Use discard instead.
  // MiniSearch supports remove() by document object or discard() by id.
  const results = index.search('', { filter: (result) => result.documentId === documentId })
  for (const r of results) {
    try { index.discard(r.id) } catch { /* already removed */ }
  }
  // Vacuum to clean up discarded entries
  try { index.vacuum() } catch {}
}

/**
 * Search the full-text index.
 * @param {MiniSearch} index
 * @param {string} query
 * @param {number} topK
 * @returns {Array<{ id: string, score: number }>}
 */
function searchIndex(index, query, topK = 20) {
  if (!index || !query) return []
  try {
    const results = index.search(query, { ...MINISEARCH_OPTIONS.searchOptions })
    return results.slice(0, topK).map(r => ({
      id: r.id,
      score: r.score,
      text: r.text,
      documentName: r.documentName,
    }))
  } catch {
    return []
  }
}

// ── Hybrid Ranking ───────────────────────────────────────────────────────────

/**
 * Merge vector and text search results with weighted scoring.
 * @param {Array<{ id: string, score: number, metadata?: object }>} vectorResults
 * @param {Array<{ id: string, score: number }>} textResults
 * @param {number} vectorWeight - default 0.7
 * @param {number} textWeight - default 0.3
 * @returns {Array<{ id: string, score: number, text: string, documentName: string }>}
 */
function hybridRank(vectorResults, textResults, vectorWeight = 0.7, textWeight = 0.3) {
  // Normalize vector scores to 0-1 (they may already be cosine similarity 0-1)
  const vecMax = vectorResults.reduce((m, r) => Math.max(m, r.score), 0) || 1
  const txtMax = textResults.reduce((m, r) => Math.max(m, r.score), 0) || 1

  const merged = new Map()

  for (const r of vectorResults) {
    const normScore = r.score / vecMax
    merged.set(r.id, {
      id: r.id,
      vecScore: normScore,
      txtScore: 0,
      text: r.metadata?.text || r.text || '',
      documentName: r.metadata?.documentName || r.documentName || '',
    })
  }

  for (const r of textResults) {
    const normScore = r.score / txtMax
    if (merged.has(r.id)) {
      merged.get(r.id).txtScore = normScore
    } else {
      merged.set(r.id, {
        id: r.id,
        vecScore: 0,
        txtScore: normScore,
        text: r.text || '',
        documentName: r.documentName || '',
      })
    }
  }

  // Compute final score and sort
  const results = Array.from(merged.values()).map(item => ({
    id: item.id,
    score: item.vecScore * vectorWeight + item.txtScore * textWeight,
    text: item.text,
    documentName: item.documentName,
  }))

  results.sort((a, b) => b.score - a.score)
  return results
}

// ── Index Persistence ────────────────────────────────────────────────────────

/**
 * Serialize a MiniSearch index to JSON string for disk storage.
 */
function serializeIndex(index) {
  return JSON.stringify(index)
}

/**
 * Load a MiniSearch index from serialized JSON string.
 */
function loadIndex(json) {
  try {
    return MiniSearch.loadJSON(json, MINISEARCH_OPTIONS)
  } catch (err) {
    logger.error(`[hybridSearch] Failed to load index: ${err.message}`)
    return createSearchIndex()
  }
}

/**
 * Save a MiniSearch index to disk.
 * @param {string} kbDir - knowledge base directory
 * @param {MiniSearch} index
 */
function saveIndexToDisk(kbDir, index) {
  const filePath = path.join(kbDir, 'fulltext.json')
  fs.writeFileSync(filePath, serializeIndex(index), 'utf8')
}

/**
 * Load a MiniSearch index from disk.
 * @param {string} kbDir
 * @returns {MiniSearch}
 */
function loadIndexFromDisk(kbDir) {
  const filePath = path.join(kbDir, 'fulltext.json')
  if (fs.existsSync(filePath)) {
    const json = fs.readFileSync(filePath, 'utf8')
    return loadIndex(json)
  }
  return createSearchIndex()
}

module.exports = {
  tokenize,
  createSearchIndex,
  addToIndex,
  removeFromIndex,
  searchIndex,
  hybridRank,
  serializeIndex,
  loadIndex,
  saveIndexToDisk,
  loadIndexFromDisk,
}
