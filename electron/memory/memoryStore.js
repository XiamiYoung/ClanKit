/**
 * MemoryStore — SQLite-backed structured store for agent memory.
 *
 * One central database holding rows for every agent. Provides:
 *
 *   - Per-entry CRUD with stable UUIDs
 *   - FTS5 trigram BM25 keyword search (CJK-friendly, same tokenizer as HistoryIndex)
 *   - Hybrid retrieval (BM25 + vectra cosine similarity) for top-K injection
 *     into system prompts
 *   - Markdown round-trip via memoryMarkdown adapter so consumers that want a
 *     blob view (LLM tool calls, chat-import pipeline) can still get one.
 *
 * Storage layout:
 *   {DATA_DIR}/memory/memory.db          — SQLite (rows + FTS5)
 *   {DATA_DIR}/memory/memory-vec/        — vectra LocalIndex (semantic embeddings)
 *
 * Singleton: a single instance per Electron main process. Use `getInstance()`.
 *
 * Lazy initialization: better-sqlite3 / vectra / localEmbedding are only required
 * when the first method is called, mirroring the HistoryIndex pattern. Keeps
 * test environments that mock or skip native deps from crashing at import time.
 */
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { logger } = require('../logger')
const { parseMarkdownToRows, rowsToMarkdown, diffRows } = require('./memoryMarkdown')

let _Database = null
function _getDb() {
  if (!_Database) _Database = require('better-sqlite3')
  return _Database
}

let _LocalIndex = null
function _getLocalIndex() {
  if (!_LocalIndex) _LocalIndex = require('vectra').LocalIndex
  return _LocalIndex
}

let _localEmbedding = null
function _getEmbedding() {
  if (!_localEmbedding) _localEmbedding = require('../lib/localEmbedding')
  return _localEmbedding
}

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory_entries (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  agent_type  TEXT NOT NULL,
  section     TEXT NOT NULL,
  content     TEXT NOT NULL,
  source      TEXT,
  confidence  REAL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  vec_indexed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memory_agent
  ON memory_entries(agent_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_memory_section
  ON memory_entries(agent_id, agent_type, section);

CREATE TABLE IF NOT EXISTS memory_meta (
  agent_id   TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  agent_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, agent_type)
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_entries_fts USING fts5(
  content,
  content='memory_entries',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN
  INSERT INTO memory_entries_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN
  INSERT INTO memory_entries_fts(memory_entries_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_entries BEGIN
  INSERT INTO memory_entries_fts(memory_entries_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO memory_entries_fts(rowid, content) VALUES (new.rowid, new.content);
END;
`

// ── Module state ────────────────────────────────────────────────────────────

let _instance = null

/**
 * @typedef {Object} MemoryRow
 * @property {string} id
 * @property {string} agentId
 * @property {string} agentType
 * @property {string} section
 * @property {string} content
 * @property {string} source
 * @property {number|null} confidence
 * @property {number} createdAt
 * @property {number} updatedAt
 */

class MemoryStore {
  /**
   * @param {object} opts
   * @param {string} opts.dbPath  — full path to the SQLite db file
   * @param {string} opts.vecDir  — full path to the vectra index dir
   */
  constructor({ dbPath, vecDir }) {
    this.dbPath = dbPath
    this.vecDir = vecDir
    this._db = null
    this._vecIndex = null
    this._vecAvailable = null  // tri-state: null=unprobed, true=ok, false=disabled
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  _ensureDb() {
    if (this._db) return this._db
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    const Database = _getDb()
    this._db = new Database(this.dbPath)
    this._db.pragma('journal_mode = WAL')
    this._db.exec(SCHEMA)
    return this._db
  }

  /**
   * Lazy-create or open the vectra LocalIndex. Returns null if vectra/embedding
   * is unavailable so callers can gracefully degrade to BM25-only retrieval.
   */
  async _ensureVecIndex() {
    if (this._vecAvailable === false) return null
    if (this._vecIndex) return this._vecIndex

    try {
      const emb = _getEmbedding()
      const ready = emb.isModelReady()
      if (!ready.ready) {
        logger.info('[MemoryStore] vec index disabled — embedding model not available')
        this._vecAvailable = false
        return null
      }
      const LocalIndex = _getLocalIndex()
      fs.mkdirSync(this.vecDir, { recursive: true })
      const idx = new LocalIndex(this.vecDir)
      if (!(await idx.isIndexCreated())) {
        await idx.createIndex()
      }
      this._vecIndex = idx
      this._vecAvailable = true
      return idx
    } catch (err) {
      logger.warn('[MemoryStore] vec index init failed — falling back to BM25-only', err.message)
      this._vecAvailable = false
      return null
    }
  }

  close() {
    if (this._db) {
      try { this._db.close() } catch {}
      this._db = null
    }
    this._vecIndex = null
    this._vecAvailable = null
  }

  // ── Meta (agent-level) ─────────────────────────────────────────────────

  /**
   * Upsert agent metadata (name, timestamps). Returns the row.
   */
  upsertMeta(agentId, agentType, agentName) {
    const db = this._ensureDb()
    const now = Date.now()
    const existing = db.prepare(
      'SELECT * FROM memory_meta WHERE agent_id = ? AND agent_type = ?'
    ).get(agentId, agentType)
    if (existing) {
      db.prepare(
        'UPDATE memory_meta SET agent_name = COALESCE(?, agent_name), updated_at = ? WHERE agent_id = ? AND agent_type = ?'
      ).run(agentName || null, now, agentId, agentType)
    } else {
      db.prepare(
        'INSERT INTO memory_meta (agent_id, agent_type, agent_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(agentId, agentType, agentName || null, now, now)
    }
    return db.prepare(
      'SELECT * FROM memory_meta WHERE agent_id = ? AND agent_type = ?'
    ).get(agentId, agentType)
  }

  getMeta(agentId, agentType) {
    const db = this._ensureDb()
    return db.prepare(
      'SELECT * FROM memory_meta WHERE agent_id = ? AND agent_type = ?'
    ).get(agentId, agentType) || null
  }

  // ── Row CRUD ───────────────────────────────────────────────────────────

  /**
   * @returns {MemoryRow[]} All entries for an agent, sorted by section then createdAt
   */
  listRows(agentId, agentType) {
    const db = this._ensureDb()
    const rows = db.prepare(`
      SELECT id, agent_id AS agentId, agent_type AS agentType, section, content,
             source, confidence, created_at AS createdAt, updated_at AS updatedAt
      FROM memory_entries
      WHERE agent_id = ? AND agent_type = ?
      ORDER BY section ASC, created_at ASC
    `).all(agentId, agentType)
    return rows
  }

  /**
   * @returns {MemoryRow|null}
   */
  getRow(id) {
    const db = this._ensureDb()
    return db.prepare(`
      SELECT id, agent_id AS agentId, agent_type AS agentType, section, content,
             source, confidence, created_at AS createdAt, updated_at AS updatedAt
      FROM memory_entries WHERE id = ?
    `).get(id) || null
  }

  /**
   * Insert a row. Returns the inserted row (with assigned id).
   * @param {Partial<MemoryRow>} row — agentId, agentType, section, content required
   */
  addRow(row) {
    const db = this._ensureDb()
    const id = row.id || crypto.randomUUID()
    const now = Date.now()
    db.prepare(`
      INSERT INTO memory_entries
        (id, agent_id, agent_type, section, content, source, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      row.agentId,
      row.agentType,
      row.section,
      row.content,
      row.source || 'unknown',
      row.confidence == null ? null : row.confidence,
      row.createdAt || now,
      row.updatedAt || now,
    )
    this.upsertMeta(row.agentId, row.agentType, null)
    this._scheduleEmbedding(id, row.content)
    return this.getRow(id)
  }

  /**
   * Update a row's content and/or section. id required.
   * @param {string} id
   * @param {{content?: string, section?: string, confidence?: number}} patch
   */
  updateRow(id, patch) {
    const db = this._ensureDb()
    const now = Date.now()
    const existing = this.getRow(id)
    if (!existing) return null
    const newContent = patch.content !== undefined ? patch.content : existing.content
    const newSection = patch.section !== undefined ? patch.section : existing.section
    const newConfidence = patch.confidence !== undefined ? patch.confidence : existing.confidence
    db.prepare(`
      UPDATE memory_entries
      SET content = ?, section = ?, confidence = ?, updated_at = ?, vec_indexed = 0
      WHERE id = ?
    `).run(newContent, newSection, newConfidence, now, id)
    this.upsertMeta(existing.agentId, existing.agentType, null)
    if (patch.content !== undefined) this._scheduleEmbedding(id, newContent)
    return this.getRow(id)
  }

  /**
   * Delete a row by id. Returns true if a row was deleted.
   */
  deleteRow(id) {
    const db = this._ensureDb()
    const existing = this.getRow(id)
    if (!existing) return false
    db.prepare('DELETE FROM memory_entries WHERE id = ?').run(id)
    this._dropEmbedding(id).catch(() => {})
    return true
  }

  /**
   * Delete every entry + meta for an agent. Used when an agent is deleted.
   */
  deleteAgent(agentId, agentType) {
    const db = this._ensureDb()
    const ids = db.prepare(
      'SELECT id FROM memory_entries WHERE agent_id = ? AND agent_type = ?'
    ).all(agentId, agentType).map(r => r.id)
    db.prepare('DELETE FROM memory_entries WHERE agent_id = ? AND agent_type = ?').run(agentId, agentType)
    db.prepare('DELETE FROM memory_meta WHERE agent_id = ? AND agent_type = ?').run(agentId, agentType)
    for (const id of ids) {
      this._dropEmbedding(id).catch(() => {})
    }
    return ids.length
  }

  /**
   * Bulk-insert rows in a single transaction.
   * Skips rows whose id already exists.
   * @param {MemoryRow[]} rows
   * @returns {{inserted: number, skipped: number}}
   */
  bulkInsert(rows) {
    const db = this._ensureDb()
    const insert = db.prepare(`
      INSERT OR IGNORE INTO memory_entries
        (id, agent_id, agent_type, section, content, source, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    let inserted = 0
    const tx = db.transaction((rs) => {
      for (const r of rs) {
        const result = insert.run(
          r.id,
          r.agentId,
          r.agentType,
          r.section,
          r.content,
          r.source || 'unknown',
          r.confidence == null ? null : r.confidence,
          r.createdAt || Date.now(),
          r.updatedAt || Date.now(),
        )
        if (result.changes > 0) inserted++
      }
    })
    tx(rows)
    return { inserted, skipped: rows.length - inserted }
  }

  // ── Markdown adapter (memory:read/write blob contract) ─────────────────

  /**
   * Render an agent's rows as a memory markdown document. Returns null if the
   * agent has no rows AND no meta record.
   */
  readMarkdown(agentId, agentType) {
    const meta = this.getMeta(agentId, agentType)
    const rows = this.listRows(agentId, agentType)
    if (!meta && rows.length === 0) return null
    const lastUpdated = meta
      ? new Date(meta.updated_at).toISOString().replace(/\.\d{3}Z$/, 'Z')
      : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    return rowsToMarkdown(rows, {
      agentName: meta?.agent_name || agentId,
      agentType,
      lastUpdated,
    })
  }

  /**
   * Write an agent's full memory state from a markdown blob. Reconciles via
   * diff so rows whose text didn't change keep their IDs (preserving
   * embeddings and history).
   */
  writeMarkdown(agentId, agentType, content) {
    const db = this._ensureDb()
    const { rows: parsedRows, agentName } = parseMarkdownToRows(content, agentId, agentType, {
      source: 'user-edit',
      timestamp: Date.now(),
    })
    const existingRows = this.listRows(agentId, agentType)
    const { inserts, deletes, unchanged } = diffRows(existingRows, parsedRows)

    const now = Date.now()
    const tx = db.transaction(() => {
      const del = db.prepare('DELETE FROM memory_entries WHERE id = ?')
      for (const id of deletes) del.run(id)

      const ins = db.prepare(`
        INSERT INTO memory_entries
          (id, agent_id, agent_type, section, content, source, confidence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const r of inserts) {
        ins.run(
          r.id,
          r.agentId,
          r.agentType,
          r.section,
          r.content,
          r.source || 'user-edit',
          r.confidence == null ? null : r.confidence,
          r.createdAt || now,
          r.updatedAt || now,
        )
      }
    })
    tx()

    this.upsertMeta(agentId, agentType, agentName)

    for (const r of inserts) this._scheduleEmbedding(r.id, r.content)
    for (const id of deletes) this._dropEmbedding(id).catch(() => {})

    return { inserts: inserts.length, deletes: deletes.length, unchanged: unchanged.length }
  }

  /**
   * @returns {boolean} true when the agent has at least one entry or a meta record
   */
  exists(agentId, agentType) {
    const db = this._ensureDb()
    const r = db.prepare(
      'SELECT 1 FROM memory_entries WHERE agent_id = ? AND agent_type = ? LIMIT 1'
    ).get(agentId, agentType)
    if (r) return true
    return !!this.getMeta(agentId, agentType)
  }

  /**
   * @returns {string[]} every agent_id with at least one entry or meta of the given type
   */
  listAgents(agentType) {
    const db = this._ensureDb()
    const fromEntries = db.prepare(
      'SELECT DISTINCT agent_id FROM memory_entries WHERE agent_type = ?'
    ).all(agentType).map(r => r.agent_id)
    const fromMeta = db.prepare(
      'SELECT DISTINCT agent_id FROM memory_meta WHERE agent_type = ?'
    ).all(agentType).map(r => r.agent_id)
    return [...new Set([...fromEntries, ...fromMeta])]
  }

  // ── Retrieval (BM25, vec, hybrid) ──────────────────────────────────────

  /**
   * BM25 trigram-FTS search restricted to one agent.
   * Falls back to LIKE for queries < 3 chars.
   */
  searchBm25(agentId, agentType, query, topK = 10) {
    if (!query || !query.trim()) return []
    const db = this._ensureDb()
    const trimmed = query.trim()

    if (trimmed.length < 3) {
      const rows = db.prepare(`
        SELECT id, agent_id AS agentId, agent_type AS agentType, section, content,
               source, confidence, created_at AS createdAt, updated_at AS updatedAt
        FROM memory_entries
        WHERE agent_id = ? AND agent_type = ? AND content LIKE ?
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(agentId, agentType, `%${trimmed}%`, topK)
      return rows.map((r, i) => ({ ...r, _bm25Rank: 1 / (i + 1) }))
    }

    try {
      const rows = db.prepare(`
        SELECT e.id, e.agent_id AS agentId, e.agent_type AS agentType, e.section, e.content,
               e.source, e.confidence, e.created_at AS createdAt, e.updated_at AS updatedAt,
               bm25(memory_entries_fts) AS bm25
        FROM memory_entries_fts f
        JOIN memory_entries e ON f.rowid = e.rowid
        WHERE memory_entries_fts MATCH ?
          AND e.agent_id = ? AND e.agent_type = ?
        ORDER BY bm25 ASC
        LIMIT ?
      `).all(trimmed, agentId, agentType, topK)
      return rows.map((r, i) => ({ ...r, _bm25Rank: 1 / (i + 1) }))
    } catch (err) {
      logger.debug('[MemoryStore] FTS query failed, falling back to LIKE', err.message)
      const rows = db.prepare(`
        SELECT id, agent_id AS agentId, agent_type AS agentType, section, content,
               source, confidence, created_at AS createdAt, updated_at AS updatedAt
        FROM memory_entries
        WHERE agent_id = ? AND agent_type = ? AND content LIKE ?
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(agentId, agentType, `%${trimmed}%`, topK)
      return rows.map((r, i) => ({ ...r, _bm25Rank: 1 / (i + 1) }))
    }
  }

  /**
   * Semantic (cosine) search via vectra. Returns empty when vectra/embedding
   * isn't available.
   */
  async searchSemantic(agentId, agentType, query, topK = 10) {
    if (!query || !query.trim()) return []
    const idx = await this._ensureVecIndex()
    if (!idx) return []

    let queryVec
    try {
      const emb = _getEmbedding()
      queryVec = await emb.embed(query)
    } catch (err) {
      logger.warn('[MemoryStore] embed query failed', err.message)
      return []
    }

    let hits
    try {
      hits = await idx.queryItems(Array.from(queryVec), topK * 3)
    } catch (err) {
      logger.warn('[MemoryStore] vec query failed', err.message)
      return []
    }

    const filtered = hits.filter(h =>
      h.item?.metadata?.agentId === agentId &&
      h.item?.metadata?.agentType === agentType
    ).slice(0, topK)

    const out = []
    for (const h of filtered) {
      const id = h.item.id
      const row = this.getRow(id)
      if (row) out.push({ ...row, _vecScore: h.score })
    }
    return out
  }

  /**
   * Hybrid retrieval — combine BM25 ranks and vec scores using reciprocal
   * rank fusion (RRF, k=60).
   */
  async searchHybrid(agentId, agentType, query, topK = 5) {
    if (!query || !query.trim()) return []
    const k = 60
    const [bm25, semantic] = await Promise.all([
      Promise.resolve(this.searchBm25(agentId, agentType, query, topK * 3)),
      this.searchSemantic(agentId, agentType, query, topK * 3),
    ])

    const scores = new Map()
    bm25.forEach((row, i) => {
      const cur = scores.get(row.id) || { row, score: 0 }
      cur.score += 1 / (k + i + 1)
      scores.set(row.id, cur)
    })
    semantic.forEach((row, i) => {
      const cur = scores.get(row.id) || { row, score: 0 }
      cur.score += 1 / (k + i + 1)
      scores.set(row.id, cur)
    })

    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => s.row)
  }

  // ── Embedding (vectra) ─────────────────────────────────────────────────

  _scheduleEmbedding(id, content) {
    if (!content || typeof content !== 'string') return
    queueMicrotask(() => {
      this._embedRow(id, content).catch(err =>
        logger.debug('[MemoryStore] embed row failed (non-fatal)', err.message)
      )
    })
  }

  async _embedRow(id, content) {
    const idx = await this._ensureVecIndex()
    if (!idx) return
    const row = this.getRow(id)
    if (!row) return
    let vec
    try {
      vec = await _getEmbedding().embed(content)
    } catch (err) {
      logger.debug('[MemoryStore] embed text failed', err.message)
      return
    }
    try {
      await idx.beginUpdate()
      try {
        await idx.upsertItem({
          id,
          vector: Array.from(vec),
          metadata: {
            agentId: row.agentId,
            agentType: row.agentType,
            section: row.section,
          },
        })
      } finally {
        await idx.endUpdate()
      }
      const db = this._ensureDb()
      db.prepare('UPDATE memory_entries SET vec_indexed = 1 WHERE id = ?').run(id)
    } catch (err) {
      logger.debug('[MemoryStore] vec upsert failed', err.message)
    }
  }

  async _dropEmbedding(id) {
    const idx = await this._ensureVecIndex()
    if (!idx) return
    try {
      await idx.beginUpdate()
      try {
        await idx.deleteItem(id)
      } finally {
        await idx.endUpdate()
      }
    } catch {}
  }

  /**
   * Re-embed all rows that don't yet have a vec entry. Useful after the
   * embedding model is first loaded. Returns the count successfully embedded.
   */
  async reindexMissingEmbeddings(maxRows = 1000) {
    const idx = await this._ensureVecIndex()
    if (!idx) return 0
    const db = this._ensureDb()
    const rows = db.prepare(`
      SELECT id, content FROM memory_entries WHERE vec_indexed = 0 LIMIT ?
    `).all(maxRows)
    let n = 0
    for (const r of rows) {
      try {
        await this._embedRow(r.id, r.content)
        n++
      } catch {}
    }
    return n
  }
}

// ── Module-level singleton accessor ────────────────────────────────────────

/**
 * @param {string} memoryDir   Base path: {DATA_DIR}/memory/
 * @returns {MemoryStore}
 */
function getInstance(memoryDir) {
  if (_instance) return _instance
  _instance = new MemoryStore({
    dbPath: path.join(memoryDir, 'memory.db'),
    vecDir: path.join(memoryDir, 'memory-vec'),
  })
  return _instance
}

/** Reset the singleton — used by tests. */
function _reset() {
  if (_instance) {
    try { _instance.close() } catch {}
  }
  _instance = null
}

module.exports = {
  MemoryStore,
  getInstance,
  _reset,
}
