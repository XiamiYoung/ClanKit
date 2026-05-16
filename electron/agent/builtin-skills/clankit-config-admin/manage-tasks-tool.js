/**
 * ManageTasksTool - LLM-callable wrapper for TaskStore.
 *
 * Action enum:
 *   - create_task / update_task / delete_task / list_tasks / get_task
 *   - create_plan / update_plan / delete_plan / list_plans / get_plan
 *   - create_task_category / delete_task_category / list_task_categories
 *   - create_plan_category / delete_plan_category / list_plan_categories
 *
 * Host injects TaskStore via context.taskStore at construction time. Same
 * "skill tools cannot require project modules" rule that ManageAgentsTool
 * follows - see LESSONS.md.
 *
 * Schema-gap notes (from 2026-05-02 audit):
 *   - Tasks have NO `agentInputs` field (renderer doesn't use it). Tool
 *     ignores any agentInputs key on input.
 *   - Steps have NO `label` field. UI renders task name from taskId lookup.
 *   - Schedule is an OBJECT {type, cron, runAt, timezone, enabled}, not a
 *     bare cron string. The tool accepts both shapes and normalizes.
 *   - Timestamps are epoch ms (not ISO strings).
 *
 * This file lives in the skill folder (not electron/agent/tools/) because skill
 * tools are deployed to {DATA_DIR}/skills/ at runtime, where they cannot
 * require() project modules. BaseTool is inlined below for the same reason.
 */
// crypto.randomUUID() is RFC 4122 v4, Node-core, available from {DATA_DIR}/skills/
// (the `uuid` npm package is unreachable from outside the app's node_modules tree).
const { randomUUID: uuidv4 } = require('crypto')

// Self-contained base — skill tools run from AppData and cannot import project
// modules (the user's skills directory is outside our source tree).
class BaseTool {
  constructor(name, description, label) {
    this.name = name
    this.description = description
    this.label = label || name
  }
  definition() {
    return { name: this.name, description: this.description, input_schema: this.schema() }
  }
  schema() { throw new Error('schema() must be implemented') }
  _ok(text, details = {}) {
    return { content: [{ type: 'text', text: String(text) }], details }
  }
  _err(message, details = {}) {
    return { content: [{ type: 'text', text: `Error: ${message}` }], details, isError: true }
  }
}

const MAX_TASK_NAME = 80
const MAX_PLAN_NAME = 80
const MAX_DESC      = 200
const MAX_CAT_NAME  = 40
const SCHEDULE_TYPES = new Set(['manual', 'once', 'cron'])
const RUN_CONDITIONS = new Set(['always', 'on_success', 'on_failure'])
const PERMISSION_MODES = new Set(['all_permissions', 'inherit', 'chat_only'])

// Pure helpers (unit-testable)

function validateTaskInput(input) {
  if (!input || typeof input !== 'object') return 'task: object required'
  const name = (input.name || '').trim()
  if (!name) return 'task.name required'
  if (name.length > MAX_TASK_NAME) return `task.name too long (max ${MAX_TASK_NAME})`
  if (!input.prompt || !input.prompt.trim()) return 'task.prompt required'
  return null
}

function normalizeTaskInput(input) {
  return {
    name:        (input.name || '').trim(),
    description: (input.description || '').trim(),
    icon:        input.icon || '✍️',
    prompt:      input.prompt || '',
    categoryId:  input.categoryId || null,
  }
}

function normalizeSchedule(schedule) {
  if (!schedule) return { type: 'manual', cron: '', runAt: '', timezone: 'UTC', enabled: false }
  if (typeof schedule === 'string') {
    // Bare cron string - wrap as object, type=cron
    return { type: 'cron', cron: schedule, runAt: '', timezone: 'UTC', enabled: true }
  }
  const type = SCHEDULE_TYPES.has(schedule.type) ? schedule.type : 'manual'
  return {
    type,
    cron:     schedule.cron     || '',
    runAt:    schedule.runAt    || '',
    timezone: schedule.timezone || 'UTC',
    enabled:  schedule.enabled === true,
  }
}

function normalizeStep(step) {
  if (!step?.taskId) throw new Error('step.taskId required')
  return {
    id:               step.id || uuidv4(),
    taskId:           step.taskId,
    defaultAgentIds:  Array.isArray(step.defaultAgentIds) ? [...step.defaultAgentIds] : [],
    promptOverride:   step.promptOverride || '',
    dependsOn:        Array.isArray(step.dependsOn) ? [...step.dependsOn] : [],
    runCondition:     RUN_CONDITIONS.has(step.runCondition) ? step.runCondition : 'always',
  }
}

function validatePlanInput(input) {
  if (!input || typeof input !== 'object') return 'plan: object required'
  const name = (input.name || '').trim()
  if (!name) return 'plan.name required'
  if (name.length > MAX_PLAN_NAME) return `plan.name too long (max ${MAX_PLAN_NAME})`
  if (!Array.isArray(input.steps) || input.steps.length === 0) return 'plan.steps required (at least 1 step)'
  for (let i = 0; i < input.steps.length; i++) {
    const s = input.steps[i]
    if (!s?.taskId) return `plan.steps[${i}].taskId required`
    if (!Array.isArray(s.defaultAgentIds) || s.defaultAgentIds.length === 0) {
      return `plan.steps[${i}].defaultAgentIds required (at least 1 agent)`
    }
  }
  return null
}

function normalizePlanInput(input) {
  const steps = Array.isArray(input.steps) ? input.steps.map(normalizeStep) : []
  return {
    name:           (input.name || '').trim(),
    description:    (input.description || '').trim(),
    icon:           input.icon || '',
    categoryId:     input.categoryId || null,
    steps,
    permissionMode: PERMISSION_MODES.has(input.permissionMode) ? input.permissionMode : 'all_permissions',
    allowList:      Array.isArray(input.allowList) ? input.allowList.map(e => ({
      id: e.id || uuidv4(),
      pattern: e.pattern || '',
      description: e.description || '',
    })) : [],
    schedule:       normalizeSchedule(input.schedule),
    enabled:        input.enabled === true,
  }
}

function validateCategoryInput(input) {
  if (!input || typeof input !== 'object') return 'category: object required'
  const name = (input.name || '').trim()
  if (!name) return 'category.name required'
  if (name.length > MAX_CAT_NAME) return `category.name too long (max ${MAX_CAT_NAME})`
  return null
}

function normalizeCategoryInput(input) {
  return {
    name: (input.name || '').trim(),
    emoji: input.emoji || '📁',
    sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : 0,
  }
}

function _summarizeTask(t) {
  if (!t) return '(none)'
  // description is capped at 200 chars at the schema level — show in full so
  // the LLM doesn't mistake a slice cutoff for a tool-side truncation.
  return `id=${t.id} | name=${t.name || '(unnamed)'} | desc=${t.description || ''}`
}
function _summarizePlan(p) {
  if (!p) return '(none)'
  return `id=${p.id} | name=${p.name || '(unnamed)'} | steps=${(p.steps || []).length} | schedule=${p.schedule?.type || 'manual'}`
}

// Tool class

class ManageTasksTool extends BaseTool {
  constructor(context) {
    super(
      'manage_tasks',
      'Create, update, or delete tasks, plans, and their categories. Tasks are reusable units of work; plans bundle them into ordered steps with scheduling. Use this when the user asks you to set up a new task ("write a daily news summary"), a new plan ("schedule the news task to run every morning at 8 AM"), or organize them into categories. Action enum: create_task / update_task / delete_task / list_tasks / get_task / create_plan / update_plan / delete_plan / list_plans / get_plan / create_task_category / delete_task_category / list_task_categories / create_plan_category / delete_plan_category / list_plan_categories. Tasks and plans are persisted to tasks.db (SQLite) - do NOT use file_operation on tasks.json or plans.json (those files no longer exist).',
      'Manage Tasks'
    )
    this._context = context || {}
    this._taskStore = context?.taskStore || null
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create_task', 'update_task', 'delete_task', 'list_tasks', 'get_task',
            'create_plan', 'update_plan', 'delete_plan', 'list_plans', 'get_plan',
            'create_task_category', 'delete_task_category', 'list_task_categories',
            'create_plan_category', 'delete_plan_category', 'list_plan_categories',
          ],
        },
        task: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', maxLength: 80 },
            description: { type: 'string', maxLength: 200 },
            icon: { type: 'string' },
            prompt: { type: 'string' },
            categoryId: { type: 'string' },
          },
        },
        plan: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', maxLength: 80 },
            description: { type: 'string', maxLength: 200 },
            icon: { type: 'string' },
            categoryId: { type: 'string' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  taskId: { type: 'string' },
                  defaultAgentIds: { type: 'array', items: { type: 'string' } },
                  promptOverride: { type: 'string' },
                  dependsOn: { type: 'array', items: { type: 'string' } },
                  runCondition: { type: 'string', enum: ['always', 'on_success', 'on_failure'] },
                },
              },
            },
            permissionMode: { type: 'string', enum: ['all_permissions', 'inherit', 'chat_only'] },
            allowList: { type: 'array' },
            schedule: {
              oneOf: [
                { type: 'string', description: 'Bare cron string, e.g. "0 8 * * *" - auto-wrapped as {type:cron,cron,enabled:true}' },
                {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['manual', 'once', 'cron'] },
                    cron: { type: 'string' },
                    runAt: { type: 'string', description: 'ISO 8601 datetime, used when type=once' },
                    timezone: { type: 'string', description: 'IANA timezone, default UTC' },
                    enabled: { type: 'boolean' },
                  },
                },
              ],
            },
            enabled: { type: 'boolean' },
          },
        },
        category: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', maxLength: 40 },
            emoji: { type: 'string' },
            sortOrder: { type: 'number' },
          },
        },
        id: { type: 'string' },
      },
      required: ['action'],
    }
  }

  async execute(toolCallId, input) {
    if (!this._taskStore) {
      return this._err('TaskStore not available - host did not inject context.taskStore')
    }
    const action = input?.action
    try {
      switch (action) {
        case 'create_task':            return this._createTask(input.task)
        case 'update_task':            return this._updateTask(input.task)
        case 'delete_task':            return this._deleteTask(input.id)
        case 'list_tasks':             return this._listTasks()
        case 'get_task':               return this._getTask(input.id)
        case 'create_plan':            return this._createPlan(input.plan)
        case 'update_plan':            return this._updatePlan(input.plan)
        case 'delete_plan':            return this._deletePlan(input.id)
        case 'list_plans':             return this._listPlans()
        case 'get_plan':               return this._getPlan(input.id)
        case 'create_task_category':   return this._createTaskCategory(input.category)
        case 'delete_task_category':   return this._deleteTaskCategory(input.id)
        case 'list_task_categories':   return this._listTaskCategories()
        case 'create_plan_category':   return this._createPlanCategory(input.category)
        case 'delete_plan_category':   return this._deletePlanCategory(input.id)
        case 'list_plan_categories':   return this._listPlanCategories()
        default: return this._err(`Unknown action: ${action}`)
      }
    } catch (err) {
      return this._err(`Action ${action} failed: ${err.message}`)
    }
  }

  // Task actions

  _createTask(taskInput) {
    const err = validateTaskInput(taskInput)
    if (err) return this._err(err)
    const task = { ...normalizeTaskInput(taskInput), id: uuidv4(), createdAt: Date.now() }
    this._taskStore.saveTask(task)
    return this._ok(`Created task: ${_summarizeTask(task)}`, { id: task.id, task })
  }

  _updateTask(taskInput) {
    if (!taskInput?.id) return this._err('task.id required for update_task')
    const existing = this._taskStore.getTaskById(taskInput.id)
    if (!existing) return this._err(`Task not found: ${taskInput.id}`)
    const merged = { ...existing, ...normalizeTaskInput({ ...existing, ...taskInput }), id: existing.id, createdAt: existing.createdAt }
    const err = validateTaskInput(merged)
    if (err) return this._err(err)
    this._taskStore.saveTask(merged)
    return this._ok(`Updated task: ${_summarizeTask(merged)}`, { id: merged.id, task: merged })
  }

  _deleteTask(id) {
    if (!id) return this._err('id required for delete_task')
    const existing = this._taskStore.getTaskById(id)
    if (!existing) return this._err(`Task not found: ${id}`)
    this._taskStore.softDeleteTask(id)
    return this._ok(`Deleted task: ${_summarizeTask(existing)}`, { id, deleted: true })
  }

  _listTasks() {
    const tasks = this._taskStore.listActiveTasks()
    const lines = tasks.map(_summarizeTask)
    return this._ok(`Found ${tasks.length} task(s):\n${lines.join('\n')}`, { count: tasks.length, tasks })
  }

  _getTask(id) {
    if (!id) return this._err('id required for get_task')
    const t = this._taskStore.getTaskById(id)
    if (!t) return this._err(`Task not found: ${id}`)
    return this._ok(_summarizeTask(t), { task: t })
  }

  // Plan actions

  _createPlan(planInput) {
    const err = validatePlanInput(planInput)
    if (err) return this._err(err)
    const plan = { ...normalizePlanInput(planInput), id: uuidv4(), createdAt: Date.now(), updatedAt: Date.now() }
    this._taskStore.savePlan(plan)
    return this._ok(`Created plan: ${_summarizePlan(plan)}`, { id: plan.id, plan })
  }

  _updatePlan(planInput) {
    if (!planInput?.id) return this._err('plan.id required for update_plan')
    const existing = this._taskStore.getPlanById(planInput.id)
    if (!existing) return this._err(`Plan not found: ${planInput.id}`)
    const merged = {
      ...existing,
      ...normalizePlanInput({ ...existing, ...planInput }),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    }
    const err = validatePlanInput(merged)
    if (err) return this._err(err)
    this._taskStore.savePlan(merged)
    return this._ok(`Updated plan: ${_summarizePlan(merged)}`, { id: merged.id, plan: merged })
  }

  _deletePlan(id) {
    if (!id) return this._err('id required for delete_plan')
    const existing = this._taskStore.getPlanById(id)
    if (!existing) return this._err(`Plan not found: ${id}`)
    this._taskStore.softDeletePlan(id)
    return this._ok(`Deleted plan: ${_summarizePlan(existing)}`, { id, deleted: true })
  }

  _listPlans() {
    const plans = this._taskStore.listActivePlans()
    const lines = plans.map(_summarizePlan)
    return this._ok(`Found ${plans.length} plan(s):\n${lines.join('\n')}`, { count: plans.length, plans })
  }

  _getPlan(id) {
    if (!id) return this._err('id required for get_plan')
    const p = this._taskStore.getPlanById(id)
    if (!p) return this._err(`Plan not found: ${id}`)
    return this._ok(_summarizePlan(p), { plan: p })
  }

  // Task category actions

  _createTaskCategory(catInput) {
    const err = validateCategoryInput(catInput)
    if (err) return this._err(err)
    const cat = { ...normalizeCategoryInput(catInput), id: uuidv4() }
    this._taskStore.saveTaskCategory(cat)
    return this._ok(`Created task category: ${cat.emoji} ${cat.name}`, { id: cat.id, category: cat })
  }

  _deleteTaskCategory(id) {
    if (!id) return this._err('id required for delete_task_category')
    this._taskStore.deleteTaskCategory(id)
    return this._ok(`Deleted task category ${id}`, { id, deleted: true })
  }

  _listTaskCategories() {
    const cats = this._taskStore.listTaskCategories()
    return this._ok(`${cats.length} task categories`, { categories: cats })
  }

  // Plan category actions

  _createPlanCategory(catInput) {
    const err = validateCategoryInput(catInput)
    if (err) return this._err(err)
    const cat = { ...normalizeCategoryInput(catInput), id: uuidv4() }
    this._taskStore.savePlanCategory(cat)
    return this._ok(`Created plan category: ${cat.emoji} ${cat.name}`, { id: cat.id, category: cat })
  }

  _deletePlanCategory(id) {
    if (!id) return this._err('id required for delete_plan_category')
    this._taskStore.deletePlanCategory(id)
    return this._ok(`Deleted plan category ${id}`, { id, deleted: true })
  }

  _listPlanCategories() {
    const cats = this._taskStore.listPlanCategories()
    return this._ok(`${cats.length} plan categories`, { categories: cats })
  }
}

module.exports = {
  ManageTasksTool,
  // Helpers exported for unit testing
  validateTaskInput,
  normalizeTaskInput,
  validatePlanInput,
  normalizePlanInput,
  normalizeStep,
  normalizeSchedule,
  validateCategoryInput,
  normalizeCategoryInput,
  _summarizeTask,
}
