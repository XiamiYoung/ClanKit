/**
 * AgentStore — SQLite-backed store for agents, personas, categories, and
 * import-time artifacts (speech / evidence / harness).
 *
 * Single DB at {DATA_DIR}/agents.db. Schema version tracked via
 * PRAGMA user_version. WAL mode. Singleton per Electron main process.
 *
 * Lazy initialization: better-sqlite3 is only required when the first DB
 * method is called. Pure helpers (rowToAgent / agentToRow / serializeIds)
 * are pure JS and unit-testable without the native binding.
 *
 * Mirrors the MemoryStore / HistoryIndex pattern.
 */
const path = require('path')
const fs = require('fs')
const { logger } = require('../logger')

let _Database = null
function _getDb() {
  if (!_Database) _Database = require('better-sqlite3')
  return _Database
}

const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id                          TEXT PRIMARY KEY,
  kind                        TEXT NOT NULL CHECK(kind IN ('system','user')),
  name                        TEXT NOT NULL,
  avatar                      TEXT,
  description                 TEXT,
  prompt                      TEXT,
  provider_id                 TEXT,
  model_id                    TEXT,
  voice_id                    TEXT,
  is_default                  INTEGER NOT NULL DEFAULT 0,
  is_builtin                  INTEGER NOT NULL DEFAULT 0,
  created_at                  INTEGER NOT NULL DEFAULT 0,
  updated_at                  INTEGER NOT NULL DEFAULT 0,
  category_ids                TEXT NOT NULL DEFAULT '[]',
  required_tool_ids           TEXT NOT NULL DEFAULT '[]',
  required_skill_ids          TEXT NOT NULL DEFAULT '[]',
  required_mcp_server_ids     TEXT NOT NULL DEFAULT '[]',
  required_knowledge_base_ids TEXT NOT NULL DEFAULT '[]',
  marketplace_id              TEXT,
  marketplace_version         INTEGER,
  marketplace_signature       TEXT,
  -- LLM-generated short identity card (~250 chars) for user-type agents.
  -- Replaces verbatim user-persona injection in agent system prompts so
  -- speaking agents only see facts about the user (name, role, location,
  -- key relations, recent context) — never the user's internal language
  -- DNA / decision instincts. Generated at save / import / regen time.
  identity_card               TEXT
);
CREATE INDEX IF NOT EXISTS idx_agents_kind ON agents(kind);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK(kind IN ('system','user')),
  name        TEXT NOT NULL,
  emoji       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_categories_kind ON categories(kind);

CREATE TABLE IF NOT EXISTS import_artifacts (
  agent_id     TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  source       TEXT,
  contact_name TEXT,
  speech_dna   TEXT,
  evidence     TEXT,
  harness      TEXT,
  imported_at  INTEGER
);
`

// ── Pure helpers (unit-testable, no DB dependency) ───────────────────────────

function serializeIds(arr) {
  if (!Array.isArray(arr)) return '[]'
  return JSON.stringify(arr)
}

function deserializeIds(json) {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function rowToAgent(row) {
  if (!row) return null
  return {
    id: row.id,
    type: row.kind,
    name: row.name,
    avatar: row.avatar || null,
    description: row.description || '',
    prompt: row.prompt || '',
    providerId: row.provider_id || null,
    modelId: row.model_id || null,
    voiceId: row.voice_id || null,
    isDefault: Boolean(row.is_default),
    isBuiltin: Boolean(row.is_builtin),
    createdAt: row.created_at || 0,
    updatedAt: row.updated_at || 0,
    categoryIds: deserializeIds(row.category_ids),
    requiredToolIds: deserializeIds(row.required_tool_ids),
    requiredSkillIds: deserializeIds(row.required_skill_ids),
    requiredMcpServerIds: deserializeIds(row.required_mcp_server_ids),
    requiredKnowledgeBaseIds: deserializeIds(row.required_knowledge_base_ids),
    marketplaceId: row.marketplace_id || null,
    marketplaceVersion: row.marketplace_version || null,
    marketplaceSignature: row.marketplace_signature || null,
    identityCard: row.identity_card || null,
  }
}

function agentToRow(a) {
  return {
    id: a.id,
    kind: a.type,
    name: a.name,
    avatar: a.avatar || null,
    description: a.description || '',
    prompt: a.prompt || '',
    provider_id: a.providerId || null,
    model_id: a.modelId || null,
    voice_id: a.voiceId || null,
    is_default: a.isDefault ? 1 : 0,
    is_builtin: a.isBuiltin ? 1 : 0,
    created_at: a.createdAt || 0,
    updated_at: a.updatedAt || Date.now(),
    category_ids: serializeIds(a.categoryIds),
    required_tool_ids: serializeIds(a.requiredToolIds),
    required_skill_ids: serializeIds(a.requiredSkillIds),
    required_mcp_server_ids: serializeIds(a.requiredMcpServerIds),
    required_knowledge_base_ids: serializeIds(a.requiredKnowledgeBaseIds),
    marketplace_id: a.marketplaceId || null,
    marketplace_version: a.marketplaceVersion ?? null,
    marketplace_signature: a.marketplaceSignature || null,
    identity_card: a.identityCard || null,
  }
}

// ── DB layer (skeleton — full CRUD added in Task 1.2) ────────────────────────

class AgentStore {
  constructor(dbPath) {
    this.dbPath = dbPath
    this._db = null
  }

  _open() {
    if (this._db) return this._db
    const Database = _getDb()
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    const db = new Database(this.dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(SCHEMA)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
    // Self-healing schema migration — CREATE TABLE IF NOT EXISTS does NOT
    // add columns to existing tables, so when a column is appended after
    // some users have already opened the DB on a prior version we must
    // ALTER TABLE explicitly. Pattern from LESSONS.md.
    try {
      const cols = db.prepare('PRAGMA table_info(agents)').all().map(c => c.name)
      if (!cols.includes('identity_card')) {
        db.exec('ALTER TABLE agents ADD COLUMN identity_card TEXT')
        logger.info('[AgentStore] migrated: added identity_card column to agents')
      }
    } catch (err) {
      logger.warn('[AgentStore] schema migration check failed:', err.message)
    }
    this._db = db
    return db
  }

  close() {
    if (this._db) {
      try { this._db.close() } catch {}
      this._db = null
    }
  }

  // ── Agents ─────────────────────────────────────────────────────────────

  getAll() {
    const db = this._open()
    return db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all().map(rowToAgent)
  }

  getByKind(kind) {
    const db = this._open()
    return db.prepare('SELECT * FROM agents WHERE kind = ? ORDER BY created_at DESC').all(kind).map(rowToAgent)
  }

  getById(id) {
    if (!id) return null
    const db = this._open()
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
    return rowToAgent(row)
  }

  countByKind(kind) {
    const db = this._open()
    return db.prepare('SELECT COUNT(*) AS n FROM agents WHERE kind = ?').get(kind).n
  }

  saveAgent(agent) {
    if (!agent || !agent.id || !agent.type) throw new Error('saveAgent: id and type required')
    const db = this._open()
    const r = agentToRow(agent)
    db.prepare(`
      INSERT INTO agents (
        id, kind, name, avatar, description, prompt,
        provider_id, model_id, voice_id, is_default, is_builtin,
        created_at, updated_at,
        category_ids, required_tool_ids, required_skill_ids,
        required_mcp_server_ids, required_knowledge_base_ids,
        marketplace_id, marketplace_version, marketplace_signature,
        identity_card
      ) VALUES (
        @id, @kind, @name, @avatar, @description, @prompt,
        @provider_id, @model_id, @voice_id, @is_default, @is_builtin,
        @created_at, @updated_at,
        @category_ids, @required_tool_ids, @required_skill_ids,
        @required_mcp_server_ids, @required_knowledge_base_ids,
        @marketplace_id, @marketplace_version, @marketplace_signature,
        @identity_card
      )
      ON CONFLICT(id) DO UPDATE SET
        kind=excluded.kind, name=excluded.name, avatar=excluded.avatar,
        description=excluded.description, prompt=excluded.prompt,
        provider_id=excluded.provider_id, model_id=excluded.model_id,
        voice_id=excluded.voice_id, is_default=excluded.is_default, is_builtin=excluded.is_builtin,
        updated_at=excluded.updated_at,
        category_ids=excluded.category_ids,
        required_tool_ids=excluded.required_tool_ids,
        required_skill_ids=excluded.required_skill_ids,
        required_mcp_server_ids=excluded.required_mcp_server_ids,
        required_knowledge_base_ids=excluded.required_knowledge_base_ids,
        marketplace_id=excluded.marketplace_id,
        marketplace_version=excluded.marketplace_version,
        marketplace_signature=excluded.marketplace_signature,
        identity_card=excluded.identity_card
    `).run(r)
  }

  /**
   * Atomically update only the identity_card field. Used by the user-persona
   * card regen path so we don't have to round-trip the entire agent row when
   * only the card needs updating.
   */
  setIdentityCard(agentId, card) {
    if (!agentId) return
    const db = this._open()
    db.prepare('UPDATE agents SET identity_card = ?, updated_at = ? WHERE id = ?')
      .run(card || null, Date.now(), agentId)
  }

  deleteAgent(id) {
    if (!id) return
    const db = this._open()
    db.prepare('DELETE FROM agents WHERE id = ?').run(id)
  }

  // ── Categories ─────────────────────────────────────────────────────────

  getCategoriesByKind(kind) {
    const db = this._open()
    return db.prepare('SELECT id, kind, name, emoji, sort_order AS sortOrder FROM categories WHERE kind = ? ORDER BY sort_order').all(kind)
      .map(c => ({ id: c.id, type: c.kind, name: c.name, emoji: c.emoji || null, sortOrder: c.sortOrder || 0 }))
  }

  saveCategory(cat) {
    if (!cat || !cat.id || !cat.type) throw new Error('saveCategory: id and type required')
    const db = this._open()
    db.prepare(`
      INSERT INTO categories (id, kind, name, emoji, sort_order)
      VALUES (@id, @kind, @name, @emoji, @sort_order)
      ON CONFLICT(id) DO UPDATE SET
        kind=excluded.kind, name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order
    `).run({
      id: cat.id, kind: cat.type, name: cat.name,
      emoji: cat.emoji || null, sort_order: cat.sortOrder || 0,
    })
  }

  deleteCategory(id) {
    if (!id) return
    const db = this._open()
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  }

  // ── Bulk replace (used by store:save-agents IPC) ───────────────────────

  /**
   * Replace all agents and categories of a given kind atomically.
   * Used to keep the existing IPC surface that takes the full
   * { categories, items } object on each save. import_artifacts is NOT
   * touched — it has its own write path via upsertImportArtifacts.
   */
  replaceKind(kind, items, categories) {
    const db = this._open()
    // Snapshot existing identity_card values keyed by agent id BEFORE the
    // DELETE — the renderer's save IPC only round-trips `prompt` / `name` /
    // etc, NOT identity_card, so blindly reinserting would null out every
    // card on every save. After insert we re-apply each preserved card to
    // its matching new row, unless the incoming item explicitly carries one.
    const preservedCards = new Map(
      db.prepare('SELECT id, identity_card FROM agents WHERE kind = ?').all(kind)
        .filter(r => r.identity_card)
        .map(r => [r.id, r.identity_card])
    )
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM agents WHERE kind = ?').run(kind)
      db.prepare('DELETE FROM categories WHERE kind = ?').run(kind)
      const insertCat = db.prepare(`
        INSERT INTO categories (id, kind, name, emoji, sort_order)
        VALUES (@id, @kind, @name, @emoji, @sort_order)
      `)
      for (const cat of (categories || [])) {
        if (!cat?.id) continue
        insertCat.run({
          id: cat.id, kind, name: cat.name || '',
          emoji: cat.emoji || null, sort_order: cat.sortOrder || 0,
        })
      }
      const insertAgent = db.prepare(`
        INSERT INTO agents (
          id, kind, name, avatar, description, prompt,
          provider_id, model_id, voice_id, is_default, is_builtin,
          created_at, updated_at,
          category_ids, required_tool_ids, required_skill_ids,
          required_mcp_server_ids, required_knowledge_base_ids,
          marketplace_id, marketplace_version, marketplace_signature,
          identity_card
        ) VALUES (
          @id, @kind, @name, @avatar, @description, @prompt,
          @provider_id, @model_id, @voice_id, @is_default, @is_builtin,
          @created_at, @updated_at,
          @category_ids, @required_tool_ids, @required_skill_ids,
          @required_mcp_server_ids, @required_knowledge_base_ids,
          @marketplace_id, @marketplace_version, @marketplace_signature,
          @identity_card
        )
      `)
      for (const a of (items || [])) {
        if (!a?.id) continue
        // Force kind to match the section being written (defensive — the
        // renderer's save shape splits by section, but a stray mismatched
        // type field on an item would corrupt the kind column).
        // Re-apply preserved identity_card if the incoming item didn't carry
        // one — this prevents bulk save flows from clobbering server-side
        // generated cards.
        const merged = {
          ...a,
          type: kind,
          identityCard: a.identityCard ?? preservedCards.get(a.id) ?? null,
        }
        insertAgent.run(agentToRow(merged))
      }
    })
    tx()
  }

  // ── Import artifacts ───────────────────────────────────────────────────

  getImportArtifacts(agentId) {
    if (!agentId) return null
    const db = this._open()
    const row = db.prepare('SELECT * FROM import_artifacts WHERE agent_id = ?').get(agentId)
    if (!row) return null
    return {
      agentId: row.agent_id,
      source: row.source || null,
      contactName: row.contact_name || null,
      speechDna: row.speech_dna ? JSON.parse(row.speech_dna) : null,
      evidence: row.evidence ? JSON.parse(row.evidence) : null,
      harness: row.harness ? JSON.parse(row.harness) : null,
      importedAt: row.imported_at || 0,
    }
  }

  upsertImportArtifacts(agentId, patch) {
    if (!agentId || !patch) throw new Error('upsertImportArtifacts: agentId and patch required')
    const db = this._open()
    const existing = db.prepare('SELECT * FROM import_artifacts WHERE agent_id = ?').get(agentId) || {}
    const merged = {
      agent_id:     agentId,
      source:       patch.source       ?? existing.source       ?? null,
      contact_name: patch.contactName  ?? existing.contact_name ?? null,
      speech_dna:   patch.speechDna !== undefined
                    ? (patch.speechDna == null ? null : JSON.stringify(patch.speechDna))
                    : (existing.speech_dna ?? null),
      evidence:     patch.evidence !== undefined
                    ? (patch.evidence == null ? null : JSON.stringify(patch.evidence))
                    : (existing.evidence ?? null),
      harness:      patch.harness !== undefined
                    ? (patch.harness == null ? null : JSON.stringify(patch.harness))
                    : (existing.harness ?? null),
      imported_at:  patch.importedAt ?? existing.imported_at ?? Date.now(),
    }
    db.prepare(`
      INSERT INTO import_artifacts (agent_id, source, contact_name, speech_dna, evidence, harness, imported_at)
      VALUES (@agent_id, @source, @contact_name, @speech_dna, @evidence, @harness, @imported_at)
      ON CONFLICT(agent_id) DO UPDATE SET
        source=excluded.source,
        contact_name=excluded.contact_name,
        speech_dna=excluded.speech_dna,
        evidence=excluded.evidence,
        harness=excluded.harness,
        imported_at=excluded.imported_at
    `).run(merged)
  }

  deleteImportArtifacts(agentId) {
    if (!agentId) return
    const db = this._open()
    db.prepare('DELETE FROM import_artifacts WHERE agent_id = ?').run(agentId)
  }
}

let _instance = null
function getInstance(dataDir) {
  if (_instance) return _instance
  _instance = new AgentStore(path.join(dataDir, 'agents.db'))
  return _instance
}

function _reset() {
  if (_instance) {
    try { _instance.close() } catch {}
  }
  _instance = null
}

module.exports = {
  AgentStore,
  getInstance,
  _reset,
  // exported for unit tests
  rowToAgent,
  agentToRow,
  serializeIds,
  deserializeIds,
  SCHEMA_VERSION,
}
