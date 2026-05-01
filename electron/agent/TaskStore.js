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
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,
  prompt          TEXT,
  agent_id        TEXT,
  schedule        TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  category_id     TEXT,
  permission_mode TEXT,
  allow_list      TEXT NOT NULL DEFAULT '[]',
  steps           TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_run_at     INTEGER,
  deleted_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_plans_active        ON plans(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plans_enabled_sched ON plans(enabled, schedule) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  description  TEXT,
  icon         TEXT,
  prompt       TEXT,
  category_id  TEXT,
  plan_id      TEXT REFERENCES plans(id) ON DELETE SET NULL,
  step_index   INTEGER,
  type         TEXT,
  cron_expr    TEXT,
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

function _serializeSchedule(v) {
  if (v == null) return null
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

function _deserializeSchedule(v) {
  if (v == null) return null
  if (typeof v !== 'string') return v
  // If it looks like a JSON object/array, parse it; otherwise return as-is (legacy cron string)
  const trimmed = v.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed) } catch {}
  }
  return v
}

function rowToPlan(row) {
  if (!row) return null
  return {
    id:             row.id,
    name:           row.name,
    description:    row.description || '',
    icon:           row.icon || '',
    prompt:         row.prompt || '',
    agentId:        row.agent_id || null,
    schedule:       _deserializeSchedule(row.schedule),
    enabled:        Boolean(row.enabled),
    categoryId:     row.category_id || null,
    permissionMode: row.permission_mode || null,
    allowList:      deserializeJsonArray(row.allow_list),
    steps:          deserializeJsonArray(row.steps),
    createdAt:      row.created_at || 0,
    updatedAt:      row.updated_at || 0,
    lastRunAt:      row.last_run_at || null,
    deletedAt:      _coerceDeletedAt(row.deleted_at),
  }
}

function planToRow(p) {
  return {
    id:              p.id,
    name:            p.name,
    description:     p.description || null,
    icon:            p.icon || null,
    prompt:          p.prompt || null,
    agent_id:        p.agentId || null,
    schedule:        _serializeSchedule(p.schedule),
    enabled:         p.enabled === false ? 0 : 1,
    category_id:     p.categoryId || null,
    permission_mode: p.permissionMode || null,
    allow_list:      serializeJsonArray(p.allowList),
    steps:           serializeJsonArray(p.steps),
    created_at:      p.createdAt || Date.now(),
    updated_at:      p.updatedAt || Date.now(),
    last_run_at:     p.lastRunAt || null,
    deleted_at:      p.deletedAt || null,
  }
}

function rowToTask(row) {
  if (!row) return null
  return {
    id:          row.id,
    name:        row.name || '',
    description: row.description || '',
    icon:        row.icon || null,
    prompt:      row.prompt || '',
    categoryId:  row.category_id || null,
    // step-level fields (legacy schema slots, kept for back-compat with task-scheduler):
    planId:      row.plan_id || null,
    stepIndex:   (row.step_index === null || row.step_index === undefined) ? null : row.step_index,
    type:        row.type || null,
    cronExpr:    row.cron_expr || null,
    agentId:     row.agent_id || null,
    dependsOn:   deserializeJsonArray(row.depends_on),
    createdAt:   row.created_at || 0,
    deletedAt:   _coerceDeletedAt(row.deleted_at),
  }
}

function taskToRow(t) {
  return {
    id:          t.id,
    name:        t.name || '',
    description: t.description || null,
    icon:        t.icon || null,
    prompt:      t.prompt || null,
    category_id: t.categoryId || null,
    plan_id:     t.planId || null,
    step_index:  (t.stepIndex === null || t.stepIndex === undefined) ? null : t.stepIndex,
    type:        t.type || null,
    cron_expr:   t.cronExpr || null,
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
    // Idempotent column-drift fix: ensure plans table has all expected columns.
    // CREATE TABLE IF NOT EXISTS doesn't add columns to existing tables.
    try {
      const planCols = db.prepare('PRAGMA table_info(plans)').all().map(c => c.name)
      if (!planCols.includes('steps'))           db.exec("ALTER TABLE plans ADD COLUMN steps TEXT NOT NULL DEFAULT '[]'")
      if (!planCols.includes('icon'))            db.exec('ALTER TABLE plans ADD COLUMN icon TEXT')
      if (!planCols.includes('permission_mode')) db.exec('ALTER TABLE plans ADD COLUMN permission_mode TEXT')
      if (!planCols.includes('allow_list'))      db.exec("ALTER TABLE plans ADD COLUMN allow_list TEXT NOT NULL DEFAULT '[]'")
    } catch (err) {
      logger.warn('[TaskStore] plans column-drift check failed:', err.message)
    }
    try {
      const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name)
      if (!taskCols.includes('name'))        db.exec("ALTER TABLE tasks ADD COLUMN name TEXT NOT NULL DEFAULT ''")
      if (!taskCols.includes('icon'))        db.exec("ALTER TABLE tasks ADD COLUMN icon TEXT")
      if (!taskCols.includes('category_id')) db.exec("ALTER TABLE tasks ADD COLUMN category_id TEXT")
    } catch (err) {
      logger.warn('[TaskStore] tasks column-drift check failed:', err.message)
    }
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

  // ── Plans ───────────────────────────────────────────────────────────────

  listActivePlans() {
    const db = this._open()
    return db.prepare('SELECT * FROM plans WHERE deleted_at IS NULL ORDER BY created_at DESC').all().map(rowToPlan)
  }

  listAllPlans() {
    const db = this._open()
    return db.prepare('SELECT * FROM plans ORDER BY created_at DESC').all().map(rowToPlan)
  }

  getPlanById(id) {
    if (!id) return null
    const db = this._open()
    return rowToPlan(db.prepare('SELECT * FROM plans WHERE id = ?').get(id))
  }

  savePlan(plan) {
    if (!plan?.id || !plan?.name) throw new Error('savePlan: id and name required')
    const db = this._open()
    const r = planToRow(plan)
    db.prepare(`
      INSERT INTO plans (
        id, name, description, icon, prompt, agent_id, schedule, enabled,
        category_id, permission_mode, allow_list, steps,
        created_at, updated_at, last_run_at, deleted_at
      ) VALUES (
        @id, @name, @description, @icon, @prompt, @agent_id, @schedule, @enabled,
        @category_id, @permission_mode, @allow_list, @steps,
        @created_at, @updated_at, @last_run_at, @deleted_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, description=excluded.description,
        icon=excluded.icon, prompt=excluded.prompt,
        agent_id=excluded.agent_id, schedule=excluded.schedule, enabled=excluded.enabled,
        category_id=excluded.category_id,
        permission_mode=excluded.permission_mode, allow_list=excluded.allow_list,
        steps=excluded.steps,
        updated_at=excluded.updated_at,
        last_run_at=excluded.last_run_at, deleted_at=excluded.deleted_at
    `).run(r)
  }

  /** Soft-delete: marks deleted_at = now. Tasks with this plan_id remain. */
  softDeletePlan(id) {
    if (!id) return
    const db = this._open()
    db.prepare('UPDATE plans SET deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id)
  }

  /** Hard-delete: removes the row. Tasks' plan_id becomes NULL via ON DELETE SET NULL. */
  hardDeletePlan(id) {
    if (!id) return
    const db = this._open()
    db.prepare('DELETE FROM plans WHERE id = ?').run(id)
  }

  setPlanLastRunAt(id, ts) {
    if (!id) return
    const db = this._open()
    db.prepare('UPDATE plans SET last_run_at = ? WHERE id = ?').run(ts || Date.now(), id)
  }

  // ── Tasks ───────────────────────────────────────────────────────────────

  listActiveTasks() {
    const db = this._open()
    return db.prepare('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY created_at DESC').all().map(rowToTask)
  }

  listTasksByPlan(planId) {
    const db = this._open()
    return db.prepare('SELECT * FROM tasks WHERE plan_id = ? AND deleted_at IS NULL ORDER BY step_index, created_at').all(planId).map(rowToTask)
  }

  listStandaloneTasks() {
    const db = this._open()
    return db.prepare('SELECT * FROM tasks WHERE plan_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC').all().map(rowToTask)
  }

  getTaskById(id) {
    if (!id) return null
    const db = this._open()
    return rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id))
  }

  saveTask(task) {
    if (!task?.id) throw new Error('saveTask: id required')
    const db = this._open()
    const r = taskToRow(task)
    db.prepare(`
      INSERT INTO tasks (
        id, name, description, icon, prompt, category_id,
        plan_id, step_index, type, cron_expr,
        agent_id, depends_on, created_at, deleted_at
      ) VALUES (
        @id, @name, @description, @icon, @prompt, @category_id,
        @plan_id, @step_index, @type, @cron_expr,
        @agent_id, @depends_on, @created_at, @deleted_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, description=excluded.description,
        icon=excluded.icon, prompt=excluded.prompt, category_id=excluded.category_id,
        plan_id=excluded.plan_id, step_index=excluded.step_index,
        type=excluded.type, cron_expr=excluded.cron_expr,
        agent_id=excluded.agent_id, depends_on=excluded.depends_on,
        deleted_at=excluded.deleted_at
    `).run(r)
  }

  softDeleteTask(id) {
    if (!id) return
    const db = this._open()
    db.prepare('UPDATE tasks SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
  }

  hardDeleteTask(id) {
    if (!id) return
    const db = this._open()
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }

  // ── Runs ────────────────────────────────────────────────────────────────

  listRuns({ planId, itemId, limit } = {}) {
    const db = this._open()
    const where = []
    const args = []
    if (planId) { where.push('plan_id = ?'); args.push(planId) }
    if (itemId) { where.push('item_id = ?'); args.push(itemId) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const limitSql = limit ? `LIMIT ${Number(limit)}` : ''
    return db.prepare(`SELECT * FROM runs ${whereSql} ORDER BY started_at DESC ${limitSql}`).all(...args).map(rowToRun)
  }

  /** Light listing — same shape that index.json used to return (no output / step_results). */
  listRunSummaries({ planId, itemId, limit } = {}) {
    const db = this._open()
    const where = []
    const args = []
    if (planId) { where.push('plan_id = ?'); args.push(planId) }
    if (itemId) { where.push('item_id = ?'); args.push(itemId) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const limitSql = limit ? `LIMIT ${Number(limit)}` : ''
    return db.prepare(`
      SELECT id, plan_id, item_id, plan_name, triggered_by, status, started_at, completed_at, error
      FROM runs ${whereSql} ORDER BY started_at DESC ${limitSql}
    `).all(...args).map(row => ({
      id: row.id, planId: row.plan_id, itemId: row.item_id,
      planName: row.plan_name, triggeredBy: row.triggered_by,
      status: row.status, startedAt: row.started_at, completedAt: row.completed_at,
      error: row.error || null,
    }))
  }

  getRunById(id) {
    if (!id) return null
    const db = this._open()
    return rowToRun(db.prepare('SELECT * FROM runs WHERE id = ?').get(id))
  }

  saveRun(run) {
    if (!run?.id) throw new Error('saveRun: id required')
    const db = this._open()
    const r = runToRow(run)
    db.prepare(`
      INSERT INTO runs (
        id, plan_id, item_id, plan_name, triggered_by,
        started_at, completed_at, status, duration_ms,
        output, step_results, error
      ) VALUES (
        @id, @plan_id, @item_id, @plan_name, @triggered_by,
        @started_at, @completed_at, @status, @duration_ms,
        @output, @step_results, @error
      )
      ON CONFLICT(id) DO UPDATE SET
        plan_id=excluded.plan_id, item_id=excluded.item_id,
        plan_name=excluded.plan_name, triggered_by=excluded.triggered_by,
        completed_at=excluded.completed_at, status=excluded.status,
        duration_ms=excluded.duration_ms, output=excluded.output,
        step_results=excluded.step_results, error=excluded.error
    `).run(r)
  }

  deleteRun(id) {
    if (!id) return
    const db = this._open()
    db.prepare('DELETE FROM runs WHERE id = ?').run(id)
  }

  /** Trim runs table to keep only most-recent N rows. Mirrors the old
   *  index.json 200-row cap. */
  pruneRuns(keepRecent = 200) {
    const db = this._open()
    db.prepare(`
      DELETE FROM runs WHERE id IN (
        SELECT id FROM runs ORDER BY started_at DESC LIMIT -1 OFFSET ?
      )
    `).run(keepRecent)
  }

  // ── Categories ──────────────────────────────────────────────────────────

  listTaskCategories() {
    const db = this._open()
    return db.prepare('SELECT id, name, emoji, sort_order AS sortOrder FROM task_categories ORDER BY sort_order').all()
  }

  saveTaskCategory(cat) {
    if (!cat?.id || !cat?.name) throw new Error('saveTaskCategory: id and name required')
    const db = this._open()
    db.prepare(`
      INSERT INTO task_categories (id, name, emoji, sort_order)
      VALUES (@id, @name, @emoji, @sort_order)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order
    `).run({ id: cat.id, name: cat.name, emoji: cat.emoji || null, sort_order: cat.sortOrder || 0 })
  }

  deleteTaskCategory(id) {
    if (!id) return
    const db = this._open()
    db.prepare('DELETE FROM task_categories WHERE id = ?').run(id)
  }

  listPlanCategories() {
    const db = this._open()
    return db.prepare('SELECT id, name, emoji, sort_order AS sortOrder FROM plan_categories ORDER BY sort_order').all()
  }

  savePlanCategory(cat) {
    if (!cat?.id || !cat?.name) throw new Error('savePlanCategory: id and name required')
    const db = this._open()
    db.prepare(`
      INSERT INTO plan_categories (id, name, emoji, sort_order)
      VALUES (@id, @name, @emoji, @sort_order)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order
    `).run({ id: cat.id, name: cat.name, emoji: cat.emoji || null, sort_order: cat.sortOrder || 0 })
  }

  deletePlanCategory(id) {
    if (!id) return
    const db = this._open()
    db.prepare('DELETE FROM plan_categories WHERE id = ?').run(id)
  }

  // ── Tree (replaces ai-task-tree.json + ai-task:sync-tree) ───────────────

  /** Return all rows needed to reconstruct the plan→tasks tree, including
   *  soft-deleted plans/tasks (UI shows them as tombstones). */
  getTreeRows() {
    const db = this._open()
    return db.prepare(`
      SELECT
        p.id            AS planId,
        p.name          AS planName,
        p.category_id   AS categoryId,
        pc.name         AS categoryName,
        pc.emoji        AS categoryEmoji,
        p.deleted_at    AS planDeletedAt,
        t.id            AS itemId,
        t.type          AS itemType,
        t.description   AS itemDescription,
        t.cron_expr     AS itemCronExpr,
        t.created_at    AS itemCreatedAt,
        t.deleted_at    AS itemDeletedAt
      FROM plans p
      LEFT JOIN plan_categories pc ON p.category_id = pc.id
      LEFT JOIN tasks t            ON t.plan_id     = p.id
      ORDER BY p.created_at DESC, t.step_index
    `).all()
  }

  // ── Counts (migration idempotency) ──────────────────────────────────────

  countPlans() {
    return this._open().prepare('SELECT COUNT(*) AS n FROM plans').get().n
  }

  countTasks() {
    return this._open().prepare('SELECT COUNT(*) AS n FROM tasks').get().n
  }

  countRuns() {
    return this._open().prepare('SELECT COUNT(*) AS n FROM runs').get().n
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
