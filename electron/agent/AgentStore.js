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
  marketplace_signature       TEXT
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
    this._db = db
    return db
  }

  close() {
    if (this._db) {
      try { this._db.close() } catch {}
      this._db = null
    }
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
