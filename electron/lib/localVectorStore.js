/**
 * Local Vector Store — per-knowledge-base vectra indexes on disk.
 * Each knowledge base gets its own directory with vectra index + document metadata.
 *
 * Storage layout:
 *   {DATA_DIR}/knowledge/{kb-id}/
 *     metadata.json   — { id, name, description, createdAt, documentCount }
 *     docs.json       — [{ id, name, type, size, chunkCount, uploadedAt, filePath }]
 *     index/          — vectra LocalIndex files
 */
const path = require('path')
const fs = require('fs')
const { LocalIndex } = require('vectra')
const { logger } = require('../logger')

let _knowledgeDir = null
// Cache of LocalIndex instances keyed by kbId
const _indexCache = new Map()

/**
 * Initialize with base data directory.
 * @param {string} dataDir - app data dir (knowledge/ will be appended)
 */
function init(dataDir) {
  _knowledgeDir = path.join(dataDir, 'knowledge')
  fs.mkdirSync(_knowledgeDir, { recursive: true })
}

function _kbDir(kbId) {
  if (!_knowledgeDir) throw new Error('localVectorStore.init() not called')
  return path.join(_knowledgeDir, kbId)
}

function _readJSON(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    logger.error(`[localVectorStore] Failed to read ${filePath}: ${err.message}`)
  }
  return fallback
}

function _writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

/**
 * Get or create a LocalIndex for a knowledge base.
 */
async function _getIndex(kbId) {
  if (_indexCache.has(kbId)) return _indexCache.get(kbId)
  const indexDir = path.join(_kbDir(kbId), 'index')
  const index = new LocalIndex(indexDir)
  if (await index.isIndexCreated()) {
    _indexCache.set(kbId, index)
    return index
  }
  return null
}

// ── Knowledge Base CRUD ──────────────────────────────────────────────────────

/**
 * Create a new knowledge base.
 * @param {{ id: string, name: string, description?: string }} params
 */
async function createKnowledgeBase({ id, name, description }) {
  const dir = _kbDir(id)
  fs.mkdirSync(dir, { recursive: true })

  // Write metadata
  const metadata = { id, name, description: description || '', createdAt: Date.now(), documentCount: 0 }
  _writeJSON(path.join(dir, 'metadata.json'), metadata)
  _writeJSON(path.join(dir, 'docs.json'), [])

  // Create vectra index
  const indexDir = path.join(dir, 'index')
  const index = new LocalIndex(indexDir)
  await index.createIndex()
  _indexCache.set(id, index)

  logger.info(`[localVectorStore] Created knowledge base: ${name} (${id})`)
  return metadata
}

/**
 * Delete a knowledge base and all its data.
 */
async function deleteKnowledgeBase(kbId) {
  _indexCache.delete(kbId)
  const dir = _kbDir(kbId)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
    logger.info(`[localVectorStore] Deleted knowledge base: ${kbId}`)
  }
  return { success: true }
}

/**
 * List all knowledge bases by scanning directories.
 * @returns {Array<object>} metadata objects
 */
function listKnowledgeBases() {
  if (!fs.existsSync(_knowledgeDir)) return []
  const entries = fs.readdirSync(_knowledgeDir, { withFileTypes: true })
  const results = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const metaPath = path.join(_knowledgeDir, entry.name, 'metadata.json')
    const meta = _readJSON(metaPath, null)
    if (meta) results.push(meta)
  }
  return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

/**
 * Get a single knowledge base metadata.
 */
function getKnowledgeBase(kbId) {
  return _readJSON(path.join(_kbDir(kbId), 'metadata.json'), null)
}

/**
 * Update knowledge base metadata fields.
 */
function updateKnowledgeBase(kbId, updates) {
  const metaPath = path.join(_kbDir(kbId), 'metadata.json')
  const meta = _readJSON(metaPath, {})
  Object.assign(meta, updates)
  _writeJSON(metaPath, meta)
  return meta
}

// ── Vector Operations ────────────────────────────────────────────────────────

/**
 * Add vectors to a knowledge base.
 * @param {string} kbId
 * @param {Array<{ id: string, vector: number[]|Float32Array, metadata: object }>} vectors
 */
async function addVectors(kbId, vectors) {
  let index = await _getIndex(kbId)
  if (!index) {
    // Index might not exist yet — create it
    const indexDir = path.join(_kbDir(kbId), 'index')
    index = new LocalIndex(indexDir)
    if (!(await index.isIndexCreated())) await index.createIndex()
    _indexCache.set(kbId, index)
  }

  await index.beginUpdate()
  for (const v of vectors) {
    await index.upsertItem({
      id: v.id,
      vector: Array.from(v.vector),
      metadata: v.metadata,
    })
  }
  await index.endUpdate()
  logger.info(`[localVectorStore] Added ${vectors.length} vectors to ${kbId}`)
}

/**
 * Query vectors by cosine similarity.
 * @param {string} kbId
 * @param {number[]|Float32Array} queryVector
 * @param {number} topK
 * @returns {Array<{ id: string, score: number, metadata: object }>}
 */
async function queryVectors(kbId, queryVector, topK = 5) {
  const index = await _getIndex(kbId)
  if (!index) return []

  const results = await index.queryItems(Array.from(queryVector), topK)
  return results.map(r => ({
    id: r.item?.id || '',
    score: r.score,
    metadata: r.item?.metadata || {},
  }))
}

/**
 * Delete all vectors belonging to a document.
 */
async function deleteVectorsByDocumentId(kbId, documentId) {
  const index = await _getIndex(kbId)
  if (!index) return

  const items = await index.listItemsByMetadata({ documentId })
  if (items.length === 0) return

  await index.beginUpdate()
  for (const item of items) {
    await index.deleteItem(item.id)
  }
  await index.endUpdate()
  logger.info(`[localVectorStore] Deleted ${items.length} vectors for doc ${documentId} from ${kbId}`)
}

// ── Document Metadata ────────────────────────────────────────────────────────

/**
 * List documents in a knowledge base.
 */
function listDocuments(kbId) {
  return _readJSON(path.join(_kbDir(kbId), 'docs.json'), [])
}

/**
 * Add a document record.
 */
function addDocument(kbId, doc) {
  const docsPath = path.join(_kbDir(kbId), 'docs.json')
  const docs = _readJSON(docsPath, [])
  docs.push(doc)
  _writeJSON(docsPath, docs)
  // Update document count in metadata
  updateKnowledgeBase(kbId, { documentCount: docs.length })
}

/**
 * Remove a document record by ID.
 */
function removeDocument(kbId, documentId) {
  const docsPath = path.join(_kbDir(kbId), 'docs.json')
  const docs = _readJSON(docsPath, [])
  const filtered = docs.filter(d => d.id !== documentId)
  _writeJSON(docsPath, filtered)
  updateKnowledgeBase(kbId, { documentCount: filtered.length })
}

module.exports = {
  init,
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
  getKnowledgeBase,
  updateKnowledgeBase,
  addVectors,
  queryVectors,
  deleteVectorsByDocumentId,
  listDocuments,
  addDocument,
  removeDocument,
}
