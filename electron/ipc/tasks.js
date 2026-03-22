/**
 * IPC handlers for tasks, plans, task runs, categories, and AI task tree.
 * Channels: tasks:*, plans:*, task-categories:*, plan-categories:*, ai-task:*
 */
const path = require('path')
const fs = require('fs')
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')

function register() {
  const p = () => ds.paths()

  // --- Tasks ---
  ipcMain.handle('tasks:list', async () => ds.readJSONAsync(p().TASKS_FILE, []))

  ipcMain.handle('tasks:save', async (_, task) => {
    try {
      let tasks = await ds.readJSONAsync(p().TASKS_FILE, [])
      const idx = tasks.findIndex(t => t.id === task.id)
      if (idx >= 0) tasks[idx] = task
      else tasks.unshift(task)
      await ds.writeJSONAtomic(p().TASKS_FILE, tasks)
      return { success: true, task }
    } catch (err) {
      logger.error('tasks:save error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tasks:delete', async (_, id) => {
    try {
      let tasks = await ds.readJSONAsync(p().TASKS_FILE, [])
      tasks = tasks.filter(t => t.id !== id)
      await ds.writeJSONAtomic(p().TASKS_FILE, tasks)
      return { success: true }
    } catch (err) {
      logger.error('tasks:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- Plans ---
  ipcMain.handle('plans:list', async () => ds.readJSONAsync(p().PLANS_FILE, []))

  ipcMain.handle('plans:save', async (_, plan) => {
    try {
      let plans = await ds.readJSONAsync(p().PLANS_FILE, [])
      const idx = plans.findIndex(pp => pp.id === plan.id)
      if (idx >= 0) plans[idx] = plan
      else plans.unshift(plan)
      await ds.writeJSONAtomic(p().PLANS_FILE, plans)
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
      let plans = await ds.readJSONAsync(p().PLANS_FILE, [])
      plans = plans.filter(pp => pp.id !== id)
      await ds.writeJSONAtomic(p().PLANS_FILE, plans)
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
      let index = await ds.readJSONAsync(p().TASK_RUNS_INDEX, [])
      if (planId) index = index.filter(r => r.planId === planId)
      if (itemId) index = index.filter(r => r.itemId === itemId)
      if (limit) index = index.slice(0, limit)
      return index
    } catch { return [] }
  })

  ipcMain.handle('tasks:get-run', async (_, runId) => {
    try {
      const file = path.join(p().TASK_RUNS_DIR, `${runId}.json`)
      return await ds.readJSONAsync(file, null)
    } catch { return null }
  })

  ipcMain.handle('tasks:delete-run', async (_, runId) => {
    try {
      const file = path.join(p().TASK_RUNS_DIR, `${runId}.json`)
      if (fs.existsSync(file)) fs.unlinkSync(file)
      let index = await ds.readJSONAsync(p().TASK_RUNS_INDEX, [])
      index = index.filter(r => r.id !== runId)
      await ds.writeJSONAtomic(p().TASK_RUNS_INDEX, index)
      return { success: true }
    } catch (err) {
      logger.error('tasks:delete-run error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tasks:save-run', async (_, runDetail) => {
    try {
      const runsDir = p().TASK_RUNS_DIR
      if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true })
      const file = path.join(runsDir, `${runDetail.id}.json`)
      await ds.writeJSONAtomic(file, runDetail)
      let index = await ds.readJSONAsync(p().TASK_RUNS_INDEX, [])
      const existing = index.findIndex(r => r.id === runDetail.id)
      const summary = {
        id:          runDetail.id,
        planId:      runDetail.planId,
        planName:    runDetail.planName,
        itemId:      runDetail.itemId || null,
        triggeredBy: runDetail.triggeredBy,
        status:      runDetail.status,
        startedAt:   runDetail.startedAt,
        completedAt: runDetail.completedAt,
        error:       runDetail.error || null,
      }
      if (existing >= 0) index[existing] = summary
      else index.unshift(summary)
      if (index.length > 200) index = index.slice(0, 200)
      await ds.writeJSONAtomic(p().TASK_RUNS_INDEX, index)

      if (runDetail.completedAt) {
        const win = winRef.get()
        if (win) {
          win.webContents.send('tasks:run-completed', {
            runId: runDetail.id,
            planId: runDetail.planId,
            status: runDetail.status,
          })
        }
      }

      return { success: true }
    } catch (err) {
      logger.error('tasks:save-run error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- Task Categories ---
  ipcMain.handle('task-categories:list', async () => ds.readJSONAsync(p().TASK_CATEGORIES_FILE, []))

  ipcMain.handle('task-categories:save', async (_, cat) => {
    try {
      let categories = await ds.readJSONAsync(p().TASK_CATEGORIES_FILE, [])
      const idx = categories.findIndex(c => c.id === cat.id)
      if (idx >= 0) categories[idx] = cat
      else categories.push(cat)
      await ds.writeJSONAtomic(p().TASK_CATEGORIES_FILE, categories)
      return { success: true }
    } catch (err) {
      logger.error('task-categories:save error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('task-categories:delete', async (_, id) => {
    try {
      let categories = await ds.readJSONAsync(p().TASK_CATEGORIES_FILE, [])
      categories = categories.filter(c => c.id !== id)
      await ds.writeJSONAtomic(p().TASK_CATEGORIES_FILE, categories)
      return { success: true }
    } catch (err) {
      logger.error('task-categories:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- Plan Categories ---
  ipcMain.handle('plan-categories:list', async () => ds.readJSONAsync(p().PLAN_CATEGORIES_FILE, []))

  ipcMain.handle('plan-categories:save', async (_, cat) => {
    try {
      let categories = await ds.readJSONAsync(p().PLAN_CATEGORIES_FILE, [])
      const idx = categories.findIndex(c => c.id === cat.id)
      if (idx >= 0) categories[idx] = cat
      else categories.push(cat)
      await ds.writeJSONAtomic(p().PLAN_CATEGORIES_FILE, categories)
      return { success: true }
    } catch (err) {
      logger.error('plan-categories:save error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('plan-categories:delete', async (_, id) => {
    try {
      let categories = await ds.readJSONAsync(p().PLAN_CATEGORIES_FILE, [])
      categories = categories.filter(c => c.id !== id)
      await ds.writeJSONAtomic(p().PLAN_CATEGORIES_FILE, categories)
      return { success: true }
    } catch (err) {
      logger.error('plan-categories:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- AI Task Tree ---
  ipcMain.handle('ai-task:get-tree', async () => {
    try {
      let index = await ds.readJSONAsync(p().TASK_RUNS_INDEX, [])
      let changed = false
      for (const entry of index) {
        if (!entry.itemId) {
          try {
            const runFile = path.join(p().TASK_RUNS_DIR, `${entry.id}.json`)
            const detail = await ds.readJSONAsync(runFile, null)
            if (detail?.itemId) {
              entry.itemId = detail.itemId
              changed = true
            }
          } catch {}
        }
      }
      if (changed) await ds.writeJSONAtomic(p().TASK_RUNS_INDEX, index)
    } catch {}
    return await ds.readJSONAsync(p().AI_TASK_TREE_FILE, { plans: [] })
  })

  ipcMain.handle('ai-task:sync-tree', async (_, payload) => {
    try {
      const { planId, planName, categoryId, categoryName, categoryEmoji, itemId, itemType, itemDescription, itemCronExpr, itemCreatedAt } = payload
      let tree = await ds.readJSONAsync(p().AI_TASK_TREE_FILE, { plans: [] })

      let planEntry = tree.plans.find(pp => pp.planId === planId)
      if (!planEntry) {
        planEntry = {
          planId, planName,
          categoryId: categoryId || null,
          categoryName: categoryName || null,
          categoryEmoji: categoryEmoji || null,
          deletedAt: null, items: [],
        }
        tree.plans.push(planEntry)
      } else {
        planEntry.planName = planName
        planEntry.categoryId = categoryId || null
        planEntry.categoryName = categoryName || null
        planEntry.categoryEmoji = categoryEmoji || null
      }

      if (!planEntry.items.find(i => i.itemId === itemId)) {
        const itemObj = {
          itemId, type: itemType, description: itemDescription,
          createdAt: itemCreatedAt || new Date().toISOString(), deletedAt: null,
        }
        if (itemCronExpr) itemObj.cronExpr = itemCronExpr
        planEntry.items.push(itemObj)
      }

      await ds.writeJSONAtomic(p().AI_TASK_TREE_FILE, tree)
      return { success: true }
    } catch (err) {
      logger.error('ai-task:sync-tree error', err.message)
      return { success: false, error: err.message }
    }
  })
}

module.exports = { register }
