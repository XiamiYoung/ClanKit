/**
 * IPC handlers for tasks, plans, task runs, categories, and AI task tree.
 * Channels: tasks:*, plans:*, task-categories:*, plan-categories:*, ai-task:*
 *
 * All persistence delegates to TaskStore (electron/agent/TaskStore.js) which
 * is backed by tasks.db (SQLite). The wire shape of every channel is
 * preserved so the renderer is unaware that storage changed.
 */
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')
const notifier = require('../lib/notifier')

function _fireTaskCompletionNotification(runDetail) {
  try {
    if (!runDetail?.completedAt) return
    const started = runDetail.startedAt ? new Date(runDetail.startedAt).getTime() : 0
    const ended   = runDetail.completedAt ? new Date(runDetail.completedAt).getTime() : 0
    const durationMs = (started && ended) ? Math.max(0, ended - started) : 0
    const fullCfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
    notifier.notifyTaskComplete({
      planName:   runDetail.planName || 'Task',
      status:     runDetail.status   || 'done',
      durationMs,
      config:     fullCfg,
    }).catch(err => logger.warn('[notifier] notifyTaskComplete rejected:', err.message))
  } catch (err) {
    logger.warn('[notifier] _fireTaskCompletionNotification error:', err.message)
  }
}

function _store() {
  const { getInstance } = require('../agent/TaskStore')
  return getInstance(ds.paths().DATA_DIR)
}

function register() {

  // --- Tasks ---
  ipcMain.handle('tasks:list', async () => _store().listActiveTasks())

  ipcMain.handle('tasks:save', async (_, task) => {
    try {
      _store().saveTask(task)
      return { success: true, task }
    } catch (err) {
      logger.error('tasks:save error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tasks:delete', async (_, id) => {
    try {
      _store().softDeleteTask(id)
      return { success: true }
    } catch (err) {
      logger.error('tasks:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- Plans ---
  ipcMain.handle('plans:list', async () => _store().listActivePlans())

  ipcMain.handle('plans:save', async (_, plan) => {
    try {
      _store().savePlan(plan)
      const taskScheduler = require('../task-scheduler')
      taskScheduler.schedulePlan(plan)
      return { success: true, plan }
    } catch (err) {
      logger.error('plans:save error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('plans:delete', async (_, id) => {
    try {
      _store().softDeletePlan(id)
      const taskScheduler = require('../task-scheduler')
      taskScheduler.unschedulePlan(id)
      return { success: true }
    } catch (err) {
      logger.error('plans:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- Task Runs ---
  ipcMain.handle('tasks:get-runs', async (_, { planId, itemId, limit } = {}) => {
    try {
      return _store().listRunSummaries({ planId, itemId, limit })
    } catch (err) {
      logger.warn('tasks:get-runs error', err.message)
      return []
    }
  })

  ipcMain.handle('tasks:get-run', async (_, runId) => {
    try {
      return _store().getRunById(runId)
    } catch (err) {
      logger.warn('tasks:get-run error', err.message)
      return null
    }
  })

  ipcMain.handle('tasks:delete-run', async (_, runId) => {
    try {
      _store().deleteRun(runId)
      return { success: true }
    } catch (err) {
      logger.error('tasks:delete-run error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tasks:save-run', async (_, runDetail) => {
    try {
      const store = _store()
      store.saveRun(runDetail)
      store.pruneRuns(200)   // keep most-recent 200, mirrors old index-cap behavior

      if (runDetail.completedAt) {
        const win = winRef.get()
        if (win) {
          win.webContents.send('tasks:run-completed', {
            runId: runDetail.id,
            planId: runDetail.planId,
            status: runDetail.status,
          })
        }
        _fireTaskCompletionNotification(runDetail)
      }

      return { success: true }
    } catch (err) {
      logger.error('tasks:save-run error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- Task Categories ---
  ipcMain.handle('task-categories:list', async () => _store().listTaskCategories())

  ipcMain.handle('task-categories:save', async (_, cat) => {
    try {
      _store().saveTaskCategory(cat)
      return { success: true }
    } catch (err) {
      logger.error('task-categories:save error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('task-categories:delete', async (_, id) => {
    try {
      _store().deleteTaskCategory(id)
      return { success: true }
    } catch (err) {
      logger.error('task-categories:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- Plan Categories ---
  ipcMain.handle('plan-categories:list', async () => _store().listPlanCategories())

  ipcMain.handle('plan-categories:save', async (_, cat) => {
    try {
      _store().savePlanCategory(cat)
      return { success: true }
    } catch (err) {
      logger.error('plan-categories:save error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('plan-categories:delete', async (_, id) => {
    try {
      _store().deletePlanCategory(id)
      return { success: true }
    } catch (err) {
      logger.error('plan-categories:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- AI Task Tree (replaces ai-task-tree.json + ai-task:sync-tree) ---
  ipcMain.handle('ai-task:get-tree', async () => {
    try {
      const { plans: planRows, tasks: taskRows } = _store().getTreeRows()
      // Index tasks by id for step lookup
      const taskMap = new Map()
      for (const t of taskRows) {
        taskMap.set(t.id, t)
      }
      const result = []
      for (const p of planRows) {
        let steps = []
        try { steps = JSON.parse(p.stepsJson || '[]') } catch {}
        const items = []
        for (const step of steps) {
          if (!step?.taskId) continue
          const task = taskMap.get(step.taskId)
          if (!task) continue   // step references a missing/hard-deleted task — skip
          items.push({
            itemId: task.id,
            type: task.type || 'manual',
            description: task.description || task.name || '',
            cronExpr: task.cron_expr || undefined,
            createdAt: task.created_at ? new Date(task.created_at).toISOString() : null,
            deletedAt: task.deleted_at ? new Date(task.deleted_at).toISOString() : null,
          })
        }
        result.push({
          planId: p.planId,
          planName: p.planName,
          categoryId: p.categoryId || null,
          categoryName: p.categoryName || null,
          categoryEmoji: p.categoryEmoji || null,
          deletedAt: p.planDeletedAt ? new Date(p.planDeletedAt).toISOString() : null,
          items,
        })
      }
      return { plans: result }
    } catch (err) {
      logger.warn('ai-task:get-tree error', err.message, err.stack)
      return { plans: [] }
    }
  })

  // ai-task:sync-tree intentionally removed — plans/tasks tables are now the
  // source of truth. Renderer code that called this can drop the call.
}

module.exports = { register }
