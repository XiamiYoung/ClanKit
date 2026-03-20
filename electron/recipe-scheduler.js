/**
 * recipe-scheduler.js — node-cron based scheduler for recipes.
 *
 * Usage from main.js:
 *   const recipeScheduler = require('./recipe-scheduler')
 *   recipeScheduler.init(() => DATA_DIR, () => mainWindow)
 *
 * After save: recipeScheduler.schedule(recipe)
 * After delete: recipeScheduler.unschedule(recipeId)
 */
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const { logger } = require('./logger')

let cron = null
try {
  cron = require('node-cron')
} catch (err) {
  logger.warn('node-cron not installed — recipe scheduler disabled:', err.message)
}

const { AgentLoop } = require('./agent/agentLoop')

// Getters set by init()
let _getDataDir = null
let _getMainWindow = null

// Map of recipeId → cron task
const _jobs = new Map()

/**
 * Resolve file paths from DATA_DIR.
 */
function getPaths() {
  const dir = _getDataDir()
  return {
    configFile:        path.join(dir, 'config.json'),
    agentsFile:        path.join(dir, 'agents.json'),
    recipesFile:       path.join(dir, 'recipes.json'),
    recipeRunsDir:     path.join(dir, 'recipe-runs'),
    recipeRunsIndex:   path.join(dir, 'recipe-runs', 'index.json'),
    soulsDir:          path.join(dir, 'souls'),
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

/**
 * Build provider config for an agent (mirrors ChatsView buildAgentRuns logic).
 */
function buildAgentConfig(agent, globalCfg) {
  const cfg = { ...globalCfg }
  // Clean provider-specific keys first
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

  // Apply agent model override if set
  if (agent.modelId) {
    if (provider === 'anthropic')       cfg.anthropic  = { ...cfg.anthropic,  activeModel:  agent.modelId }
    else if (provider === 'openrouter') cfg.openrouter = { ...cfg.openrouter, defaultModel: agent.modelId }
    else if (provider === 'openai')     cfg.openai     = { ...cfg.openai,     model:        agent.modelId }
    else if (provider === 'deepseek')   cfg.deepseek   = { ...cfg.deepseek,   model:        agent.modelId }
  }

  return cfg
}

function renderTemplate(template, inputs) {
  return (template || '').replace(/\{\{(\w+)\}\}/g, (_, key) =>
    inputs[key] !== undefined ? String(inputs[key]) : ''
  )
}

function resolveOutputTokens(template, nameToOutput) {
  return (template || '').replace(/\{\{output:([^}]+)\}\}/g, (match, name) => {
    const trimmed = name.trim()
    return nameToOutput[trimmed] !== undefined ? String(nameToOutput[trimmed]) : match
  })
}

// Build execution waves (topological sort). Each wave = agents whose deps are all resolved.
function buildExecutionWaves(agents) {
  const waves = []
  const resolved = new Set()
  const remaining = [...agents]
  while (remaining.length > 0) {
    const wave = remaining.filter(rp => (rp.dependsOn || []).every(id => resolved.has(id)))
    if (wave.length === 0) { waves.push(...remaining.map(rp => [rp])); break }
    waves.push(wave)
    wave.forEach(rp => { resolved.add(rp.agentId); remaining.splice(remaining.indexOf(rp), 1) })
  }
  return waves
}

function shouldRunAgent(rp, statuses) {
  const deps = rp.dependsOn || []
  if (deps.length === 0) return true
  const cond = rp.runCondition || 'always'
  if (cond === 'always') return true
  if (cond === 'on_success') return deps.every(id => statuses[id] === 'done')
  if (cond === 'on_failure') return deps.some(id => statuses[id] === 'failed' || statuses[id] === 'skipped')
  return true
}

/**
 * Execute a recipe immediately (called by cron job or on-demand test).
 * Runs all agents concurrently, collects text outputs, writes run record to disk.
 */
async function _executeRecipe(recipe, triggeredBy = 'schedule') {
  const { configFile, agentsFile, recipeRunsDir, recipeRunsIndex, soulsDir } = getPaths()
  const globalCfg = readJSON(configFile, {})
  const agentsData = readJSON(agentsFile, { agents: [] })
  const allAgents = agentsData.agents || agentsData || []

  const runId = uuidv4()
  const startedAt = new Date().toISOString()

  logger.info(`[RecipeScheduler] Executing recipe "${recipe.name}" (${recipe.id}), runId=${runId}, by=${triggeredBy}`)

  // Build inputs: use defaults from recipe.inputs
  const inputs = {}
  for (const inp of (recipe.inputs || [])) {
    inputs[inp.key] = inp.default !== undefined ? inp.default : ''
  }

  const recipeAgents = (recipe.agents || []).filter(rp => allAgents.find(p => p.id === rp.agentId))
  if (recipeAgents.length === 0) {
    logger.warn(`[RecipeScheduler] No valid agents for recipe ${recipe.id}, aborting run`)
    return
  }

  const outputMap = {}   // agentId → accumulated text
  const statuses  = {}   // agentId → 'waiting'|'done'|'failed'|'skipped'
  for (const rp of recipeAgents) {
    outputMap[rp.agentId] = ''
    statuses[rp.agentId]  = 'waiting'
  }

  // Write initial run record (status: running)
  if (!fs.existsSync(recipeRunsDir)) fs.mkdirSync(recipeRunsDir, { recursive: true })
  const runDetail = {
    id: runId,
    recipeId: recipe.id,
    recipeName: recipe.name,
    inputs,
    outputs: {},
    status: 'running',
    triggeredBy,
    startedAt,
    completedAt: null,
    error: null,
  }
  await writeJSONAtomic(path.join(recipeRunsDir, `${runId}.json`), runDetail)

  // Update index
  let runIndex = readJSON(recipeRunsIndex, [])
  runIndex.unshift({
    id: runId,
    recipeId: recipe.id,
    recipeName: recipe.name,
    triggeredBy,
    status: 'running',
    startedAt,
    completedAt: null,
    error: null,
  })
  if (runIndex.length > 200) runIndex = runIndex.slice(0, 200)
  await writeJSONAtomic(recipeRunsIndex, runIndex)

  // Execute in topological waves so downstream agents receive upstream outputs
  let runStatus = 'completed'
  let runError  = null
  const waves = buildExecutionWaves(recipeAgents)

  for (const wave of waves) {
    const wavePromises = wave.map(rp => (async () => {
      if (!shouldRunAgent(rp, statuses)) {
        statuses[rp.agentId] = 'skipped'
        return
      }

      const agent    = allAgents.find(p => p.id === rp.agentId)
      const agentCfg = buildAgentConfig(agent, globalCfg)
      agentCfg.soulsDir           = soulsDir
      agentCfg.artifactPath       = globalCfg.artifactPath || globalCfg.artyfactPath || ''
      agentCfg.skillsPath         = globalCfg.skillsPath   || ''
      agentCfg.DoCPath            = globalCfg.DoCPath       || ''
      agentCfg.chatPermissionMode = 'all_permissions'
      agentCfg.chatAllowList      = []
      agentCfg.sandboxConfig      = globalCfg.sandboxConfig || { defaultMode: 'all_permissions', sandboxAllowList: [], dangerBlockList: [] }

      // Build name→output map for {{output:Name}} token resolution
      const nameToOutput = {}
      for (const [pid, text] of Object.entries(outputMap)) {
        const p = allAgents.find(x => x.id === pid)
        if (p) nameToOutput[p.name] = text
      }

      // Resolve both {{input_var}} and {{output:Name}} in prompts
      const globalPart  = resolveOutputTokens(renderTemplate(recipe.globalPrompt || '', inputs), nameToOutput)
      const agentPart = resolveOutputTokens(renderTemplate(rp.prompt || '', inputs), nameToOutput)
      const systemAgentPrompt = [globalPart, agentPart].filter(Boolean).join('\n\n')

      // Determine which upstream outputs were NOT inlined via tokens
      const inlinedNames = new Set(
        ((recipe.globalPrompt || '') + (rp.prompt || ''))
          .match(/\{\{output:([^}]+)\}\}/g)?.map(m => m.replace(/^\{\{output:|\}\}$/g, '').trim()) || []
      )
      const prevOutputLines = (rp.dependsOn || [])
        .filter(depId => outputMap[depId])
        .filter(depId => {
          const name = allAgents.find(p => p.id === depId)?.name || ''
          return !inlinedNames.has(name)
        })
        .map(depId => {
          const depAgent = allAgents.find(p => p.id === depId)
          return `[Output from ${depAgent?.name || depId}]:\n${outputMap[depId]}`
        })

      const userMessage = ['Run this task.', ...prevOutputLines].join('\n\n---\n\n')

      const loop = new AgentLoop({ ...agentCfg })
      try {
        await loop.run(
          [{ role: 'user', content: userMessage }],
          [],   // enabledAgents
          [],   // enabledSkills
          (chunk) => {
            if (chunk.type === 'text' && chunk.text) {
              outputMap[rp.agentId] = (outputMap[rp.agentId] || '') + chunk.text
            }
          },
          null,
          { systemAgentPrompt, systemAgentId: rp.agentId, userAgentId: '__recipe_user__' },
          [],   // mcpServers
          [],   // httpTools
          null  // ragContext
        )
        statuses[rp.agentId] = 'done'
      } catch (err) {
        logger.error(`[RecipeScheduler] Agent ${rp.agentId} error:`, err.message)
        statuses[rp.agentId] = 'failed'
        runStatus = 'error'
        runError  = err.message
      }
    })())
    await Promise.all(wavePromises)
  }

  const anyFailed = Object.values(statuses).some(s => s === 'failed')
  if (anyFailed && runStatus === 'completed') {
    runStatus = 'error'
    runError  = 'One or more agents failed'
  }

  const completedAt = new Date().toISOString()

  // Write final run detail
  runDetail.outputs = { ...outputMap }
  runDetail.status = runStatus
  runDetail.completedAt = completedAt
  runDetail.error = runError
  await writeJSONAtomic(path.join(recipeRunsDir, `${runId}.json`), runDetail)

  // Update index entry
  runIndex = readJSON(recipeRunsIndex, [])
  const idxEntry = runIndex.find(e => e.id === runId)
  if (idxEntry) {
    idxEntry.status = runStatus
    idxEntry.completedAt = completedAt
    idxEntry.error = runError
    await writeJSONAtomic(recipeRunsIndex, runIndex)
  }

  // Update recipe's lastRunAt
  try {
    const { recipesFile } = getPaths()
    const recipes = readJSON(recipesFile, [])
    const rec = recipes.find(r => r.id === recipe.id)
    if (rec?.schedule) {
      rec.schedule.lastRunAt = completedAt
      await writeJSONAtomic(recipesFile, recipes)
    }
  } catch {}

  logger.info(`[RecipeScheduler] Run ${runId} ${runStatus}`)

  // Push to renderer
  const win = _getMainWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send('recipes:run-completed', { runId, recipeId: recipe.id, status: runStatus })
  }
}

/**
 * Schedule (or reschedule) a recipe based on its schedule config.
 * Cancels any existing job for this recipe first.
 */
function schedule(recipe) {
  // Always cancel existing job first
  unschedule(recipe.id)

  if (!cron) return
  if (!recipe?.schedule?.enabled || !recipe?.schedule?.cron) return
  if (!cron.validate(recipe.schedule.cron)) {
    logger.warn(`[RecipeScheduler] Invalid cron expression for recipe ${recipe.id}: ${recipe.schedule.cron}`)
    return
  }

  const timezone = recipe.schedule.timezone || 'UTC'
  try {
    const task = cron.schedule(recipe.schedule.cron, async () => {
      try {
        await _executeRecipe(recipe, 'schedule')
      } catch (err) {
        logger.error(`[RecipeScheduler] Error executing recipe ${recipe.id}:`, err.message)
      }
    }, { timezone, scheduled: true })

    _jobs.set(recipe.id, task)
    logger.info(`[RecipeScheduler] Scheduled recipe "${recipe.name}" (${recipe.id}): ${recipe.schedule.cron} [${timezone}]`)
  } catch (err) {
    logger.error(`[RecipeScheduler] Failed to schedule recipe ${recipe.id}:`, err.message)
  }
}

/**
 * Cancel a scheduled recipe job.
 */
function unschedule(recipeId) {
  const existing = _jobs.get(recipeId)
  if (existing) {
    try { existing.stop() } catch {}
    _jobs.delete(recipeId)
    logger.info(`[RecipeScheduler] Unscheduled recipe ${recipeId}`)
  }
}

/**
 * Initialize the scheduler. Call once after app.whenReady().
 * @param {() => string} getDataDir - Getter for DATA_DIR (may not be set until after ensureDataDir)
 * @param {() => BrowserWindow} getMainWindow - Getter for mainWindow
 */
function init(getDataDir, getMainWindow) {
  _getDataDir = getDataDir
  _getMainWindow = getMainWindow

  if (!cron) {
    logger.warn('[RecipeScheduler] node-cron not available — scheduler disabled')
    return
  }

  // Load all enabled recipes and schedule them
  try {
    const { recipesFile } = getPaths()
    const recipes = readJSON(recipesFile, [])
    let scheduled = 0
    for (const recipe of recipes) {
      if (recipe?.schedule?.enabled && recipe?.schedule?.cron) {
        schedule(recipe)
        scheduled++
      }
    }
    if (scheduled > 0) logger.info(`[RecipeScheduler] Scheduled ${scheduled} recipe(s) on startup`)
  } catch (err) {
    logger.error('[RecipeScheduler] init error:', err.message)
  }
}

module.exports = { init, schedule, unschedule, executeRecipe: _executeRecipe }
