/**
 * task-scheduler.js — node-cron based scheduler for Plans (Task Engine).
 *
 * Concepts:
 *   Task  — a reusable prompt template with optional agent inputs (slots).
 *   Plan  — a scheduled execution with ordered steps; each step references a Task
 *           and assigns real agents to the task's agent input slots.
 *
 * Usage from main.js:
 *   const taskScheduler = require('./task-scheduler')
 *   taskScheduler.init(() => DATA_DIR, () => mainWindow)
 *
 * After plan save:   taskScheduler.schedulePlan(plan)
 * After plan delete: taskScheduler.unschedulePlan(planId)
 */
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const { logger } = require('./logger')

let cron = null
try {
  cron = require('node-cron')
} catch (err) {
  logger.warn('node-cron not installed — task scheduler disabled:', err.message)
}

const { AgentLoop } = require('./agent/agentLoop')

const ds = require('./lib/dataStore')

// Getters set by init()
let _getMainWindow = null

// Map of planId → cron task (for cron-type plans)
const _jobs = new Map()

// ── Once-plan polling (survives system sleep — setTimeout does not) ────────────
// planId → { plan, runAt (ms timestamp) }
const _onceMap = new Map()
let   _oncePoll = null

// Only run if within 2 minutes of scheduled time — covers poll interval jitter.
// Anything later means the system was asleep/off and the window was missed → skip.
const ONCE_MAX_LATE_MS = 2 * 60 * 1000

function _startOncePoll() {
  if (_oncePoll) return
  _oncePoll = setInterval(_checkOncePlans, 60 * 1000)  // check every minute
}

function _stopOncePoll() {
  if (_oncePoll) { clearInterval(_oncePoll); _oncePoll = null }
}

async function _recordSkippedRun(plan, scheduledAt) {
  const { taskRunsDir, taskRunsIndex } = getPaths()
  if (!fs.existsSync(taskRunsDir)) fs.mkdirSync(taskRunsDir, { recursive: true })
  const { v4: uuidv4 } = require('uuid')
  const runId = uuidv4()
  const ts = scheduledAt  // use the original scheduled time as startedAt

  const runDetail = {
    id:          runId,
    planId:      plan.id,
    planName:    plan.name,
    status:      'skipped',
    triggeredBy: 'schedule',
    startedAt:   ts,
    completedAt: ts,
    stepResults: [],
    error:       'Missed — system was asleep or app was not running',
  }
  await writeJSONAtomic(path.join(taskRunsDir, `${runId}.json`), runDetail)

  let idx = readJSON(taskRunsIndex, [])
  idx.unshift({ id: runId, planId: plan.id, planName: plan.name, triggeredBy: 'schedule', status: 'skipped', startedAt: ts, completedAt: ts, error: runDetail.error })
  if (idx.length > 200) idx = idx.slice(0, 200)
  await writeJSONAtomic(taskRunsIndex, idx)

  // Notify renderer so run list refreshes
  const win = _getMainWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send('tasks:run-completed', { runId, planId: plan.id, status: 'skipped' })
  }
}

async function _checkOncePlans() {
  if (_onceMap.size === 0) { _stopOncePoll(); return }
  const now = Date.now()
  for (const [planId, { plan, runAt }] of [..._onceMap]) {
    if (runAt > now) continue  // not yet due
    _onceMap.delete(planId)    // remove before async work to prevent re-entry

    const lateMs = now - runAt

    // Check if a scheduled run already exists for this plan near the scheduled time
    let alreadyRan = false
    try {
      const { taskRunsIndex } = getPaths()
      const idx = readJSON(taskRunsIndex, [])
      alreadyRan = idx.some(r =>
        r.planId === planId &&
        r.triggeredBy === 'schedule' &&
        Math.abs(new Date(r.startedAt).getTime() - runAt) < ONCE_MAX_LATE_MS
      )
    } catch {}

    if (alreadyRan) {
      logger.info(`[TaskScheduler] Once plan "${plan.name}" already executed, skipping`)
      continue
    }

    if (lateMs > ONCE_MAX_LATE_MS) {
      // Missed window (system was asleep/off) — record as skipped so history is accurate
      logger.warn(`[TaskScheduler] Once plan "${plan.name}" (${planId}) missed by ${Math.round(lateMs / 1000)}s — recording as skipped`)
      try {
        await _recordSkippedRun(plan, new Date(runAt).toISOString())
      } catch (err) {
        logger.error(`[TaskScheduler] Failed to record skipped run for ${planId}:`, err.message)
      }
      continue
    }

    try {
      await _executePlan(plan, 'schedule')
    } catch (err) {
      logger.error(`[TaskScheduler] Error executing once plan ${planId}:`, err.message)
    }
  }
  if (_onceMap.size === 0) _stopOncePoll()
}

// ── Item ID computation (for grouping execution runs) ────────────────────────────

function _computeItemId(plan, triggeredBy) {
  const schedType = plan.schedule?.type || 'manual'
  if (triggeredBy === 'manual' || schedType === 'manual') return `${plan.id}-manual`
  if (schedType === 'once') return `${plan.id}-once`
  if (schedType === 'cron' && plan.schedule?.cron) {
    const hash = Buffer.from(plan.schedule.cron).toString('base64url')
    return `${plan.id}-cron-${hash}`
  }
  return `${plan.id}-manual`
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function getPaths() {
  const pp = ds.paths()
  return {
    configFile:         pp.CONFIG_FILE,
    agentsFile:         pp.AGENTS_FILE,
    tasksFile:          pp.TASKS_FILE,
    plansFile:          pp.PLANS_FILE,
    taskRunsDir:        pp.TASK_RUNS_DIR,
    taskRunsIndex:      pp.TASK_RUNS_INDEX,
    soulsDir:           pp.SOULS_DIR,
    taskCategoriesFile: pp.TASK_CATEGORIES_FILE,
    planCategoriesFile: pp.PLAN_CATEGORIES_FILE,
    aiTaskTreeFile:     pp.AI_TASK_TREE_FILE,
  }
}

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  return fallback
}

async function writeJSONAtomic(file, data) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = file + `.tmp.${process.pid}.${Date.now()}`
  try {
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.promises.rename(tmp, file)
  } catch (err) {
    try { await fs.promises.unlink(tmp) } catch {}
    throw err
  }
}

// ── Provider config for an agent (mirrors ChatsView buildAgentRuns logic) ──

function buildAgentConfig(agent, globalCfg) {
  const cfg = { ...globalCfg }
  delete cfg.apiKey
  delete cfg.baseURL
  delete cfg.openaiApiKey
  delete cfg.openaiBaseURL
  delete cfg._directAuth
  delete cfg._resolvedProvider
  delete cfg.provider

  const providerId = agent.providerId || globalCfg.defaultProvider || 'anthropic'

  // Check if providerId is a UUID referencing config.providers[]
  const customProvider = (globalCfg.providers || []).find(p => p.id === providerId)
  if (customProvider) {
    // New provider config structure — AgentLoop handles it via config.provider
    cfg.provider = {
      ...customProvider,
      model: agent.modelId || customProvider.model,
    }
    return cfg
  }

  // Legacy string-based provider
  const provider = providerId

  if (provider === 'anthropic') {
    cfg.apiKey  = globalCfg.anthropic?.apiKey  || ''
    cfg.baseURL = globalCfg.anthropic?.baseURL || ''
  } else if (provider === 'openrouter') {
    cfg.apiKey  = globalCfg.openrouter?.apiKey  || ''
    cfg.baseURL = globalCfg.openrouter?.baseURL || ''
  } else if (provider === 'openai') {
    cfg.openaiApiKey  = globalCfg.openai?.apiKey  || ''
    cfg.openaiBaseURL = globalCfg.openai?.baseURL || ''
    cfg._resolvedProvider = 'openai'
    cfg.defaultProvider   = 'openai'
  } else if (provider === 'deepseek') {
    cfg.openaiApiKey  = globalCfg.deepseek?.apiKey  || ''
    cfg.openaiBaseURL = (globalCfg.deepseek?.baseURL || '').replace(/\/+$/, '')
    cfg._resolvedProvider = 'openai'
    cfg._directAuth       = true
    cfg.defaultProvider   = 'openai'
  }

  if (agent.modelId) {
    if (provider === 'anthropic')       cfg.anthropic  = { ...cfg.anthropic,  activeModel:  agent.modelId }
    else if (provider === 'openrouter') cfg.openrouter = { ...cfg.openrouter, defaultModel: agent.modelId }
    else if (provider === 'openai')     cfg.openai     = { ...cfg.openai,     model:        agent.modelId }
    else if (provider === 'deepseek')   cfg.deepseek   = { ...cfg.deepseek,   model:        agent.modelId }
  }

  return cfg
}

// ── Execute a single step with a single agent ───────────────────────────────

async function _runAgentStep(agent, promptText, globalCfg, soulsDir, artifactPath, skillsPath, DoCPath, sandboxConfig) {
  const agentCfg = buildAgentConfig(agent, globalCfg)
  agentCfg.soulsDir           = soulsDir
  agentCfg.artifactPath       = artifactPath || ''
  agentCfg.skillsPath         = skillsPath   || ''
  agentCfg.DoCPath            = DoCPath       || ''
  agentCfg.chatPermissionMode = 'all_permissions'
  agentCfg.chatAllowList      = []
  agentCfg.sandboxConfig      = sandboxConfig || { defaultMode: 'all_permissions', sandboxAllowList: [], dangerBlockList: [] }

  let output = ''
  const loop = new AgentLoop({ ...agentCfg })
  await loop.run(
    [{ role: 'user', content: promptText }],
    [],   // enabledAgents
    [],   // enabledSkills
    (chunk) => {
      if (chunk.type === 'text' && chunk.text) {
        output += chunk.text
      }
    },
    null,
    { systemAgentPrompt: agent.prompt || '', systemAgentId: agent.id, userAgentId: '__task_user__', groupChatContext: { agentName: agent.name, agentDescription: agent.description || '', otherParticipants: [] } },
    [],   // mcpServers
    [],   // httpTools
    null  // ragContext
  )
  return output
}

// ── Build the prompt for a step ───────────────────────────────────────────────
// Resolves @inputName tokens, {{output:StepName}} tokens, and promptOverride.

function buildStepPrompt(task, step, allAgents, stepOutputMap) {
  // Use step-level override if provided, else task prompt
  let prompt = (step.promptOverride || '').trim() || task.prompt || ''

  // Replace @inputName placeholders with the assigned agent's actual name
  for (const input of (task.agentInputs || [])) {
    const assignedId = step.agentAssignments?.[input.name]
    const assignedAgent = assignedId ? allAgents.find(p => p.id === assignedId) : null
    const replaceName = assignedAgent ? assignedAgent.name : input.name
    const regex = new RegExp(`@${input.name}(?=\\W|$)`, 'g')
    prompt = prompt.replace(regex, `@${replaceName}`)
  }

  // Replace {{output:StepName}} tokens with outputs from completed upstream steps
  if (stepOutputMap) {
    prompt = prompt.replace(/\{\{output:([^}]+)\}\}/g, (match, name) => {
      const trimmed = name.trim()
      return stepOutputMap[trimmed] !== undefined ? String(stepOutputMap[trimmed]) : match
    })
  }

  return prompt
}

// ── Topological execution waves ───────────────────────────────────────────────

function buildExecutionWaves(steps) {
  const idSet = new Set(steps.map(s => s.id))
  const resolved = new Set()
  const remaining = [...steps]
  const waves = []

  while (remaining.length > 0) {
    const wave = remaining.filter(s =>
      (s.dependsOn || []).filter(d => idSet.has(d)).every(d => resolved.has(d))
    )
    if (wave.length === 0) {
      waves.push([...remaining])
      break
    }
    waves.push([...wave])
    wave.forEach(s => {
      resolved.add(s.id)
      remaining.splice(remaining.indexOf(s), 1)
    })
  }
  return waves
}

function shouldRunStep(step, stepStatuses) {
  const deps = (step.dependsOn || []).filter(d => d in stepStatuses)
  if (deps.length === 0) return true
  const cond = step.runCondition || 'always'
  if (cond === 'always')     return true
  if (cond === 'on_success') return deps.every(id => stepStatuses[id] === 'done')
  if (cond === 'on_failure') return deps.some(id => stepStatuses[id] === 'failed' || stepStatuses[id] === 'skipped')
  return true
}

// ── Sync AI Task Tree with execution history ───────────────────────────────────

async function _syncAiTaskTree(plan, itemId, triggeredBy) {
  const { aiTaskTreeFile, planCategoriesFile } = getPaths()
  const tree = readJSON(aiTaskTreeFile, { plans: [] })
  const allPlanCats = readJSON(planCategoriesFile, [])
  const cat = plan.categoryId ? allPlanCats.find(c => c.id === plan.categoryId) : null

  let planEntry = tree.plans.find(p => p.planId === plan.id)
  if (!planEntry) {
    planEntry = {
      planId: plan.id,
      planName: plan.name,
      categoryId: plan.categoryId || null,
      categoryName: cat?.name || null,
      categoryEmoji: cat?.emoji || null,
      deletedAt: null,
      items: [],
    }
    tree.plans.push(planEntry)
  } else {
    planEntry.planName = plan.name
    planEntry.categoryId = plan.categoryId || null
    planEntry.categoryName = cat?.name || null
    planEntry.categoryEmoji = cat?.emoji || null
  }

  const schedType = plan.schedule?.type || 'manual'
  let itemType = 'manual', itemDescription = 'Manual', itemCronExpr = null
  if (triggeredBy !== 'manual' && schedType === 'once') {
    itemType = 'once'
    itemDescription = 'One-time scheduled'
  } else if (triggeredBy !== 'manual' && schedType === 'cron' && plan.schedule?.cron) {
    itemType = 'cron'
    itemCronExpr = plan.schedule.cron
    itemDescription = `Recurring: ${plan.schedule.cron}`
  }

  if (!planEntry.items.find(i => i.itemId === itemId)) {
    const itemObj = {
      itemId,
      type: itemType,
      description: itemDescription,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    }
    if (itemCronExpr) itemObj.cronExpr = itemCronExpr
    planEntry.items.push(itemObj)
  }

  await writeJSONAtomic(aiTaskTreeFile, tree)
}

// ── Execute a full plan (all steps sequentially) ──────────────────────────────

async function _executePlan(plan, triggeredBy = 'schedule') {
  const { configFile, agentsFile, tasksFile, taskRunsDir, taskRunsIndex, soulsDir } = getPaths()
  const globalCfg   = readJSON(configFile,   {})
  const agentsData = readJSON(agentsFile, { agents: [] })
  const allAgents  = agentsData.agents || agentsData || []
  const allTasks     = readJSON(tasksFile, [])

  const runId      = uuidv4()
  const startedAt  = new Date().toISOString()

  logger.info(`[TaskScheduler] Executing plan "${plan.name}" (${plan.id}), runId=${runId}, by=${triggeredBy}`)

  const artifactPath  = globalCfg.artifactPath || globalCfg.artyfactPath || ''
  const skillsPath    = globalCfg.skillsPath   || ''
  const DoCPath       = globalCfg.DoCPath       || ''
  const sandboxConfig = globalCfg.sandboxConfig || { defaultMode: 'allow_all', sandboxAllowList: [], dangerBlockList: [] }

  // Initialize run record
  if (!fs.existsSync(taskRunsDir)) fs.mkdirSync(taskRunsDir, { recursive: true })

  const stepResults = [] // { stepIndex, taskId, taskName, agentId, agentName, output, status, error }
  let runStatus = 'completed'
  let runError  = null

  // Write initial run record
  const runDetail = {
    id:         runId,
    planId:     plan.id,
    planName:   plan.name,
    status:     'running',
    triggeredBy,
    startedAt,
    completedAt: null,
    stepResults: [],
    error:       null,
  }
  await writeJSONAtomic(path.join(taskRunsDir, `${runId}.json`), runDetail)

  // Update index
  const itemId = _computeItemId(plan, triggeredBy)
  let runIndex = readJSON(taskRunsIndex, [])
  runIndex.unshift({ id: runId, planId: plan.id, planName: plan.name, triggeredBy, status: 'running', startedAt, completedAt: null, error: null, itemId, stepCount: (plan.steps || []).length })
  if (runIndex.length > 200) runIndex = runIndex.slice(0, 200)
  await writeJSONAtomic(taskRunsIndex, runIndex)

  // Push run-started to renderer
  {
    const win = _getMainWindow?.()
    if (win && !win.isDestroyed()) {
      win.webContents.send('tasks:run-started', {
        runId,
        planId:    plan.id,
        planName:  plan.name,
        stepCount: (plan.steps || []).length,
        startedAt,
      })
    }
  }

  // Execute steps in topological waves (parallel within each wave)
  // stepOutputMap: taskName → combined output (for {{output:Name}} tokens)
  const stepOutputMap = {}
  // stepStatuses: stepId → 'done' | 'failed' | 'skipped'
  const stepStatuses = {}
  const allSteps = plan.steps || []

  const waves = buildExecutionWaves(allSteps)

  for (const wave of waves) {
    // Run steps in this wave in parallel
    await Promise.all(wave.map(async (step) => {
      const stepIdx = allSteps.indexOf(step)

      if (!shouldRunStep(step, stepStatuses)) {
        logger.info(`[TaskScheduler] Step ${stepIdx}: condition not met, skipping`)
        const ts = new Date().toISOString()
        stepResults.push({ stepIndex: stepIdx, taskId: step.taskId, taskName: '(skipped)', status: 'skipped', error: 'Run condition not met', startedAt: ts, completedAt: ts })
        stepStatuses[step.id] = 'skipped'
        return
      }

      const task = allTasks.find(t => t.id === step.taskId)
      if (!task) {
        logger.warn(`[TaskScheduler] Step ${stepIdx}: task ${step.taskId} not found, skipping`)
        const ts = new Date().toISOString()
        stepResults.push({ stepIndex: stepIdx, taskId: step.taskId, taskName: '(not found)', status: 'skipped', error: 'Task not found', startedAt: ts, completedAt: ts })
        stepStatuses[step.id] = 'skipped'
        return
      }

      const agentInputs = task.agentInputs || []
      let agentIds = []
      if (agentInputs.length > 0) {
        for (const input of agentInputs) {
          const pid = step.agentAssignments?.[input.name]
          if (pid) agentIds.push(pid)
        }
      } else {
        agentIds = step.defaultAgentIds || []
      }
      agentIds = [...new Set(agentIds)]

      if (agentIds.length === 0) {
        logger.warn(`[TaskScheduler] Step ${stepIdx} (${task.name}): no agents assigned, skipping`)
        const ts = new Date().toISOString()
        stepResults.push({ stepIndex: stepIdx, taskId: task.id, taskName: task.name, status: 'skipped', error: 'No agents assigned', startedAt: ts, completedAt: ts })
        stepStatuses[step.id] = 'skipped'
        return
      }

      const promptText = buildStepPrompt(task, step, allAgents, stepOutputMap)
      const stepOutputs = []
      let stepFailed = false

      // Run all agents for this step in parallel
      await Promise.all(agentIds.map(async (agentId) => {
        const agent = allAgents.find(p => p.id === agentId)
        if (!agent) {
          logger.warn(`[TaskScheduler] Step ${stepIdx}: agent ${agentId} not found, skipping`)
          const ts = new Date().toISOString()
          stepResults.push({ stepIndex: stepIdx, taskId: task.id, taskName: task.name, agentId, agentName: '(not found)', status: 'skipped', error: 'Agent not found', startedAt: ts, completedAt: ts })
          return
        }

        const stepStartedAt = new Date().toISOString()
        try {
          const output = await _runAgentStep(agent, promptText, globalCfg, soulsDir, artifactPath, skillsPath, DoCPath, sandboxConfig)
          stepOutputs.push(output)
          stepResults.push({ stepIndex: stepIdx, taskId: task.id, taskName: task.name, agentId: agent.id, agentName: agent.name, output, status: 'done', startedAt: stepStartedAt, completedAt: new Date().toISOString() })
          logger.info(`[TaskScheduler] Step ${stepIdx} agent ${agent.name}: done`)
        } catch (err) {
          logger.error(`[TaskScheduler] Step ${stepIdx} agent ${agent.name} error:`, err.message)
          stepResults.push({ stepIndex: stepIdx, taskId: task.id, taskName: task.name, agentId: agent.id, agentName: agent.name, output: '', status: 'failed', error: err.message, startedAt: stepStartedAt, completedAt: new Date().toISOString() })
          stepFailed = true
          runStatus = 'error'
          runError  = err.message
        }
      }))

      stepStatuses[step.id] = stepFailed ? 'failed' : 'done'

      // Store combined output keyed by task name for {{output:Name}} token resolution
      if (stepOutputs.length > 0) {
        stepOutputMap[task.name] = stepOutputs.join('\n\n---\n\n')
      }
    }))

    // Write partial results to disk after each wave so the UI can show live progress
    runDetail.stepResults = [...stepResults]
    await writeJSONAtomic(path.join(taskRunsDir, `${runId}.json`), runDetail)
    const winMid = _getMainWindow?.()
    if (winMid && !winMid.isDestroyed()) {
      winMid.webContents.send('tasks:run-updated', { runId, planId: plan.id })
    }
  }

  const completedAt = new Date().toISOString()

  // Write final run detail
  runDetail.stepResults  = stepResults
  runDetail.status       = runStatus
  runDetail.completedAt  = completedAt
  runDetail.error        = runError
  runDetail.itemId       = itemId
  runDetail.stepCount    = stepResults.length
  await writeJSONAtomic(path.join(taskRunsDir, `${runId}.json`), runDetail)

  // Update index entry
  runIndex = readJSON(taskRunsIndex, [])
  const idxEntry = runIndex.find(e => e.id === runId)
  if (idxEntry) {
    idxEntry.status      = runStatus
    idxEntry.completedAt = completedAt
    idxEntry.error       = runError
    idxEntry.itemId      = itemId
    idxEntry.stepCount   = stepResults.length
    await writeJSONAtomic(taskRunsIndex, runIndex)
  }

  // Update plan's lastRunAt
  try {
    const { plansFile } = getPaths()
    const plans = readJSON(plansFile, [])
    const pl = plans.find(p => p.id === plan.id)
    if (pl) {
      pl.lastRunAt = completedAt
      await writeJSONAtomic(plansFile, plans)
    }
  } catch {}

  // Sync AI Task Tree
  try {
    await _syncAiTaskTree(plan, itemId, triggeredBy)
  } catch (err) {
    logger.warn('[TaskScheduler] ai-task sync error:', err.message)
  }

  logger.info(`[TaskScheduler] Plan run ${runId} ${runStatus}`)

  // Push to renderer
  const win = _getMainWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send('tasks:run-completed', { runId, planId: plan.id, status: runStatus })
  }

  return runId
}

// ── Schedule / unschedule a plan ──────────────────────────────────────────────

function schedulePlan(plan) {
  unschedulePlan(plan.id)
  if (!plan?.schedule?.enabled) return
  if (plan.schedule.type === 'cron') {
    if (!cron) {
      logger.warn(`[TaskScheduler] node-cron not available — cannot schedule cron plan ${plan.id}`)
      return
    }
    if (!plan.schedule.cron || !cron.validate(plan.schedule.cron)) {
      logger.warn(`[TaskScheduler] Invalid cron for plan ${plan.id}: ${plan.schedule.cron}`)
      return
    }
    let timezone = plan.schedule.timezone || 'UTC'
    // Validate timezone — fallback to UTC if invalid
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    } catch {
      logger.warn(`[TaskScheduler] Invalid timezone "${timezone}" for plan ${plan.id}, using UTC`)
      timezone = 'UTC'
    }
    try {
      const task = cron.schedule(plan.schedule.cron, async () => {
        try { await _executePlan(plan, 'schedule') }
        catch (err) { logger.error(`[TaskScheduler] Error executing plan ${plan.id}:`, err.message) }
      }, { timezone, scheduled: true })
      _jobs.set(plan.id, task)
      logger.debug(`[TaskScheduler] Scheduled plan "${plan.name}" (${plan.id}): ${plan.schedule.cron} [${timezone}]`)
    } catch (err) {
      logger.error(`[TaskScheduler] Failed to schedule plan ${plan.id}:`, err.message)
    }
  } else if (plan.schedule.type === 'once' && plan.schedule.runAt) {
    const runAt = new Date(plan.schedule.runAt).getTime()
    // Use polling instead of setTimeout — setTimeout pauses during system sleep/lock
    // which causes the plan to fire late when the system wakes. The poll checks
    // wall-clock time every minute and catches up after any sleep period.
    _onceMap.set(plan.id, { plan, runAt })
    _startOncePoll()
    // Check immediately — handles startup after sleep and past-due plans
    _checkOncePlans()
    logger.info(`[TaskScheduler] Once plan "${plan.name}" (${plan.id}) queued for poll, runAt=${new Date(runAt).toISOString()}`)
  }
}

function unschedulePlan(planId) {
  const existing = _jobs.get(planId)
  if (existing) {
    try { existing.stop() } catch {}
    _jobs.delete(planId)
    logger.info(`[TaskScheduler] Unscheduled cron plan ${planId}`)
  }
  if (_onceMap.has(planId)) {
    _onceMap.delete(planId)
    logger.info(`[TaskScheduler] Removed once plan ${planId} from poll queue`)
    if (_onceMap.size === 0) _stopOncePoll()
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(getDataDir, getMainWindow, getSettingsDir) {
  // getDataDir and getSettingsDir are no longer used — paths come from ds.paths()
  _getMainWindow  = getMainWindow

  if (!cron) {
    logger.warn('[TaskScheduler] node-cron not available — scheduler disabled')
  }

  try {
    const { plansFile } = getPaths()
    const plans = readJSON(plansFile, [])
    let scheduled = 0
    for (const plan of plans) {
      if (plan?.schedule?.enabled) {
        schedulePlan(plan)
        scheduled++
      }
    }
    if (scheduled > 0) logger.debug(`[TaskScheduler] Scheduled ${scheduled} plan(s) on startup`)
  } catch (err) {
    logger.error('[TaskScheduler] init error:', err.message)
  }
}

module.exports = { init, schedulePlan, unschedulePlan, executePlan: _executePlan }
