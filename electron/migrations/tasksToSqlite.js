/**
 * One-shot migration of tasks-related JSON files to tasks.db.
 *
 * Reads (any of these may not exist):
 *   - {DATA_DIR}/tasks.json                  (array of task objects)
 *   - {DATA_DIR}/plans.json                  (array of plan objects)
 *   - {DATA_DIR}/task-categories.json        (array)
 *   - {DATA_DIR}/plan-categories.json        (array)
 *   - {DATA_DIR}/ai-task-tree.json           (denormalized tree — read for soft-delete tombstones)
 *   - {DATA_DIR}/task-runs/index.json        (array of run summaries)
 *   - {DATA_DIR}/task-runs/{runId}.json      (full run details)
 *
 * Idempotent: skips when plans+tasks+runs tables already have rows.
 *
 * The ai-task-tree.json contains tombstones (deletedAt on plans/items) that
 * AREN'T present in plans.json / tasks.json — we merge them in by setting
 * `deleted_at` on the corresponding plan/task rows. If a tombstoned plan/task
 * has no entry in plans.json/tasks.json at all, we synthesize a minimal row
 * for audit preservation.
 */
const fs = require('fs')
const path = require('path')
const { logger } = require('../logger')
const { getInstance: getTaskStore } = require('../agent/TaskStore')

function _readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function _readDir(dir) {
  try { return fs.readdirSync(dir) } catch { return [] }
}

function _toMs(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : null
  }
  return null
}

function migrate(dataDir) {
  const store = getTaskStore(dataDir)

  // Idempotency gate
  if (store.countPlans() > 0 || store.countTasks() > 0 || store.countRuns() > 0) {
    logger.info(`[tasksToSqlite] already migrated (plans=${store.countPlans()}, tasks=${store.countTasks()}, runs=${store.countRuns()})`)
    return { migrated: { plans: 0, tasks: 0, runs: 0, taskCats: 0, planCats: 0 }, skipped: true }
  }

  let migrated = { plans: 0, tasks: 0, runs: 0, taskCats: 0, planCats: 0 }

  // ── Plans ─────────────────────────────────────────────────────────────
  const plansArr = _readJsonSafe(path.join(dataDir, 'plans.json'))
  if (Array.isArray(plansArr)) {
    for (const p of plansArr) {
      if (!p?.id || !p?.name) continue
      store.savePlan({
        id: p.id, name: p.name,
        description: p.description, prompt: p.prompt,
        agentId: p.agentId || p.agent_id,
        schedule: p.schedule || p.cron || null,
        enabled: p.enabled !== false,
        categoryId: p.categoryId || null,
        createdAt: _toMs(p.createdAt) || Date.now(),
        updatedAt: _toMs(p.updatedAt) || Date.now(),
        lastRunAt: _toMs(p.lastRunAt),
        deletedAt: null,
      })
      migrated.plans++
    }
  }

  // ── Tasks ─────────────────────────────────────────────────────────────
  const tasksArr = _readJsonSafe(path.join(dataDir, 'tasks.json'))
  if (Array.isArray(tasksArr)) {
    for (const t of tasksArr) {
      if (!t?.id) continue
      store.saveTask({
        id: t.id,
        planId: t.planId || null,
        stepIndex: (t.stepIndex !== undefined && t.stepIndex !== null) ? t.stepIndex : null,
        type: t.type || null,
        description: t.description || null,
        cronExpr: t.cronExpr || null,
        prompt: t.prompt || null,
        agentId: t.agentId || null,
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
        createdAt: _toMs(t.createdAt) || Date.now(),
        deletedAt: null,
      })
      migrated.tasks++
    }
  }

  // ── Categories ────────────────────────────────────────────────────────
  const taskCats = _readJsonSafe(path.join(dataDir, 'task-categories.json'))
  if (Array.isArray(taskCats)) {
    for (const c of taskCats) {
      if (!c?.id || !c?.name) continue
      store.saveTaskCategory({ id: c.id, name: c.name, emoji: c.emoji || null, sortOrder: c.sortOrder || 0 })
      migrated.taskCats++
    }
  }
  const planCats = _readJsonSafe(path.join(dataDir, 'plan-categories.json'))
  if (Array.isArray(planCats)) {
    for (const c of planCats) {
      if (!c?.id || !c?.name) continue
      store.savePlanCategory({ id: c.id, name: c.name, emoji: c.emoji || null, sortOrder: c.sortOrder || 0 })
      migrated.planCats++
    }
  }

  // ── Apply ai-task-tree.json soft-delete tombstones ─────────────────────
  const tree = _readJsonSafe(path.join(dataDir, 'ai-task-tree.json'))
  if (tree?.plans && Array.isArray(tree.plans)) {
    for (const planEntry of tree.plans) {
      const planDeletedAt = _toMs(planEntry.deletedAt)
      if (planDeletedAt) {
        const existing = store.getPlanById(planEntry.planId)
        if (!existing) {
          // Synthesize a minimal tombstone row
          store.savePlan({
            id: planEntry.planId,
            name: planEntry.planName || '(deleted plan)',
            categoryId: planEntry.categoryId || null,
            createdAt: 0, updatedAt: planDeletedAt,
            deletedAt: planDeletedAt,
            enabled: false,
          })
          migrated.plans++
        } else if (!existing.deletedAt) {
          existing.deletedAt = planDeletedAt
          store.savePlan(existing)
        }
      }

      for (const item of (planEntry.items || [])) {
        const itemDeletedAt = _toMs(item.deletedAt)
        if (!itemDeletedAt) continue
        const existing = store.getTaskById(item.itemId)
        if (!existing) {
          store.saveTask({
            id: item.itemId,
            planId: planEntry.planId,
            stepIndex: null,
            type: item.type,
            description: item.description,
            cronExpr: item.cronExpr || null,
            createdAt: _toMs(item.createdAt) || 0,
            deletedAt: itemDeletedAt,
            dependsOn: [],
          })
          migrated.tasks++
        } else if (!existing.deletedAt) {
          existing.deletedAt = itemDeletedAt
          store.saveTask(existing)
        }
      }
    }
  }

  // ── Runs ──────────────────────────────────────────────────────────────
  const runsDir = path.join(dataDir, 'task-runs')
  if (fs.existsSync(runsDir)) {
    const indexSummaries = _readJsonSafe(path.join(runsDir, 'index.json')) || []
    const summaryById = new Map()
    for (const s of indexSummaries) {
      if (s?.id) summaryById.set(s.id, s)
    }

    for (const file of _readDir(runsDir)) {
      if (file === 'index.json' || !file.endsWith('.json')) continue
      const detail = _readJsonSafe(path.join(runsDir, file))
      if (!detail?.id) continue
      const summary = summaryById.get(detail.id) || {}
      store.saveRun({
        id: detail.id,
        planId: detail.planId || summary.planId || null,
        itemId: detail.itemId || summary.itemId || null,
        planName: detail.planName || summary.planName || null,
        triggeredBy: detail.triggeredBy || summary.triggeredBy || null,
        startedAt: _toMs(detail.startedAt) || _toMs(summary.startedAt) || 0,
        completedAt: _toMs(detail.completedAt) || _toMs(summary.completedAt),
        status: detail.status || summary.status || 'unknown',
        durationMs: detail.durationMs || null,
        output: detail.output || null,
        stepResults: detail.stepResults || detail.steps || [],
        error: detail.error || summary.error || null,
      })
      migrated.runs++
    }
  }

  logger.info(`[tasksToSqlite] migrated ${JSON.stringify(migrated)}`)
  return { migrated, skipped: false }
}

module.exports = { migrate }
