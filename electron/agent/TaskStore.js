/**
 * TaskStore — SQLite-backed store for plans, tasks, runs, and categories.
 *
 * Single DB at {DATA_DIR}/tasks.db. Schema version tracked via
 * PRAGMA user_version = 1. WAL mode. Singleton per Electron main process.
 *
 * Lazy initialization: better-sqlite3 only required on first DB call.
 * Pure helpers (rowTo* / *ToRow / serializeJsonArray) are unit-testable
 * without the native binding.
 *
 * Mirrors AgentStore + MemoryStore pattern.
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
CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  prompt      TEXT,
  agent_id    TEXT,
  schedule    TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  category_id TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  last_run_at INTEGER,
  deleted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_plans_active        ON plans(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plans_enabled_sched ON plans(enabled, schedule) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  plan_id      TEXT REFERENCES plans(id) ON DELETE SET NULL,
  step_index   INTEGER,
  type         TEXT,
  description  TEXT,
  cron_expr    TEXT,
  prompt       TEXT,
  agent_id     TEXT,
  depends_on   TEXT NOT NULL DEFAULT '[]',
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_plan_step  ON tasks(plan_id, step_index) WHERE plan_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_standalone ON tasks(deleted_at)          WHERE plan_id IS NULL     AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS runs (
  id           TEXT PRIMARY KEY,
  plan_id      TEXT REFERENCES plans(id) ON DELETE SET NULL,
  item_id      TEXT,
  plan_name    TEXT,
  triggered_by TEXT,
  started_at   INTEGER NOT NULL,
  completed_at INTEGER,
  status       TEXT NOT NULL,
  duration_ms  INTEGER,
  output       TEXT,
  step_results TEXT,
  error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_plan_started ON runs(plan_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_started      ON runs(started_at DESC);

CREATE TABLE IF NOT EXISTS task_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  emoji      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plan_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  emoji      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
`

// ── Pure helpers ─────────────────────────────────────────────────────────────

function serializeJsonArray(arr) {
  if (!Array.isArray(arr)) return '[]'
  return JSON.stringify(arr)
}

function deserializeJsonArray(json) {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function _coerceDeletedAt(v) {
  if (!v) return null
  return v
}

function rowToPlan(row) {
  if (!row) return null
  return {
    id:          row.id,
    name:        row.name,
    description: row.description || '',
    prompt:      row.prompt || '',
    agentId:     row.agent_id || null,
    schedule:    row.schedule || null,
    enabled:     Boolean(row.enabled),
    categoryId:  row.category_id || null,
    createdAt:   row.created_at || 0,
    updatedAt:   row.updated_at || 0,
    lastRunAt:   row.last_run_at || null,
    deletedAt:   _coerceDeletedAt(row.deleted_at),
  }
}

function planToRow(p) {
  return {
    id:           p.id,
    name:         p.name,
    description:  p.description || null,
    prompt:       p.prompt || null,
    agent_id:     p.agentId || null,
    schedule:     p.schedule || null,
    enabled:      p.enabled === false ? 0 : 1,
    category_id:  p.categoryId || null,
    created_at:   p.createdAt || Date.now(),
    updated_at:   p.updatedAt || Date.now(),
    last_run_at:  p.lastRunAt || null,
    deleted_at:   p.deletedAt || null,
  }
}

function rowToTask(row) {
  if (!row) return null
  return {
    id:          row.id,
    planId:      row.plan_id || null,
    stepIndex:   (row.step_index === null || row.step_index === undefined) ? null : row.step_index,
    type:        row.type || null,
    description: row.description || '',
    cronExpr:    row.cron_expr || null,
    prompt:      row.prompt || '',
    agentId:     row.agent_id || null,
    dependsOn:   deserializeJsonArray(row.depends_on),
    createdAt:   row.created_at || 0,
    deletedAt:   _coerceDeletedAt(row.deleted_at),
  }
}

function taskToRow(t) {
  return {
    id:          t.id,
    plan_id:     t.planId || null,
    step_index:  (t.stepIndex === null || t.stepIndex === undefined) ? null : t.stepIndex,
    type:        t.type || null,
    description: t.description || null,
    cron_expr:   t.cronExpr || null,
    prompt:      t.prompt || null,
    agent_id:    t.agentId || null,
    depends_on:  serializeJsonArray(t.dependsOn),
    created_at:  t.createdAt || Date.now(),
    deleted_at:  t.deletedAt || null,
  }
}

function rowToRun(row) {
  if (!row) return null
  return {
    id:           row.id,
    planId:       row.plan_id || null,
    itemId:       row.item_id || null,
    planName:     row.plan_name || null,
    triggeredBy:  row.triggered_by || null,
    startedAt:    row.started_at || 0,
    completedAt:  row.completed_at || null,
    status:       row.status,
    durationMs:   row.duration_ms || null,
    output:       row.output || null,
    stepResults:  row.step_results ? JSON.parse(row.step_results) : [],
    error:        row.error || null,
  }
}

function runToRow(r) {
  return {
    id:           r.id,
    plan_id:      r.planId || null,
    item_id:      r.itemId || null,
    plan_name:    r.planName || null,
    triggered_by: r.triggeredBy || null,
    started_at:   r.startedAt || Date.now(),
    completed_at: r.completedAt || null,
    status:       r.status,
    duration_ms:  r.durationMs || null,
    output:       r.output || null,
    step_results: r.stepResults ? JSON.stringify(r.stepResults) : '[]',
    error:        r.error || null,
  }
}

// ── DB layer ─────────────────────────────────────────────────────────────────

class TaskStore {
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
  _instance = new TaskStore(path.join(dataDir, 'tasks.db'))
  return _instance
}

function _reset() {
  if (_instance) { try { _instance.close() } catch {}; _instance = null }
}

module.exports = {
  TaskStore,
  getInstance,
  _reset,
  rowToPlan, planToRow,
  rowToTask, taskToRow,
  rowToRun, runToRow,
  serializeJsonArray, deserializeJsonArray,
  SCHEMA_VERSION,
}
