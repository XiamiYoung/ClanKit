import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuid } from 'uuid'
import { useConfigStore } from './config'
import { useChatsStore } from './chats'
import { usePersonasStore } from './personas'

// ── Store ────────────────────────────────────────────────────────────────────

export const useRecipesStore = defineStore('recipes', () => {
  const configStore = useConfigStore()
  const chatsStore = useChatsStore()
  const personasStore = usePersonasStore()

  // Persisted recipe list (from IPC)
  const recipes = ref([])

  // Run index summaries (from IPC)
  const runs = ref([])

  // Currently selected run detail (for Dashboard)
  const selectedRunDetail = ref(null)

  // Active run state (for live runner)
  // {
  //   recipeId, runId, chatId,
  //   status: 'running'|'completed'|'error',
  //   outputs: { [personaId]: string },
  //   personaStatuses: { [personaId]: 'waiting'|'running'|'done'|'skipped'|'failed' }
  //   error: null|string,
  //   personasDone: Set,
  // }
  const activeRun = ref(null)

  const isRunning = computed(() => activeRun.value?.status === 'running')

  // ── Lifecycle: listen for scheduled run completions ──────────────────────

  let _unsubRunCompleted = null

  function subscribeToScheduledRuns() {
    if (_unsubRunCompleted || !window.electronAPI?.recipes?.onRunCompleted) return
    _unsubRunCompleted = window.electronAPI.recipes.onRunCompleted(({ runId, recipeId, status }) => {
      // Refresh run index so Dashboard reflects the new run
      loadRuns()
    })
  }

  function unsubscribeFromScheduledRuns() {
    if (_unsubRunCompleted) {
      _unsubRunCompleted()
      _unsubRunCompleted = null
    }
  }

  // ── Template rendering ───────────────────────────────────────────────────

  function renderTemplate(template, inputs) {
    return (template || '').replace(/\{\{(\w+)\}\}/g, (_, key) =>
      inputs[key] !== undefined ? String(inputs[key]) : ''
    )
  }

  // Resolve {{output:PersonaName}} tokens using a name→output map.
  function resolveOutputTokens(template, nameToOutput) {
    return (template || '').replace(/\{\{output:([^}]+)\}\}/g, (match, name) => {
      const trimmed = name.trim()
      return nameToOutput[trimmed] !== undefined ? String(nameToOutput[trimmed]) : match
    })
  }

  // ── Provider config for a persona ────────────────────────────────────────
  // Mirrors ChatsView.buildPersonaRuns() provider resolution logic.

  function buildPersonaConfig(persona) {
    const raw = configStore.config
    const cfg = { ...raw }

    // Clean top-level legacy keys
    delete cfg.apiKey
    delete cfg.baseURL
    delete cfg.openaiApiKey
    delete cfg.openaiBaseURL
    delete cfg._directAuth
    delete cfg._resolvedProvider

    const provider = persona.providerId || raw.defaultProvider || 'anthropic'

    if (provider === 'anthropic') {
      cfg.apiKey  = raw.anthropic?.apiKey  || ''
      cfg.baseURL = raw.anthropic?.baseURL || ''
      cfg._resolvedProvider = undefined
      cfg.defaultProvider   = undefined
      delete cfg._directAuth
      delete cfg.openaiApiKey
      delete cfg.openaiBaseURL
    } else if (provider === 'openrouter') {
      cfg.apiKey  = raw.openrouter?.apiKey  || ''
      cfg.baseURL = raw.openrouter?.baseURL || ''
      cfg._resolvedProvider = undefined
      cfg.defaultProvider   = undefined
      delete cfg._directAuth
      delete cfg.openaiApiKey
      delete cfg.openaiBaseURL
    } else if (provider === 'openai') {
      cfg.openaiApiKey  = raw.openai?.apiKey  || ''
      cfg.openaiBaseURL = raw.openai?.baseURL || ''
      cfg._resolvedProvider = 'openai'
      cfg.defaultProvider   = 'openai'
      delete cfg._directAuth
    } else if (provider === 'deepseek') {
      cfg.openaiApiKey  = raw.deepseek?.apiKey  || ''
      cfg.openaiBaseURL = (raw.deepseek?.baseURL || '').replace(/\/+$/, '')
      cfg._resolvedProvider = 'openai'
      cfg._directAuth       = true
      cfg.defaultProvider   = 'openai'
    }

    // Apply persona's model override
    if (persona.modelId) {
      if (provider === 'anthropic')   cfg.anthropic   = { ...cfg.anthropic,   activeModel:    persona.modelId }
      else if (provider === 'openrouter') cfg.openrouter = { ...cfg.openrouter, defaultModel: persona.modelId }
      else if (provider === 'openai') cfg.openai     = { ...cfg.openai,     model:         persona.modelId }
      else if (provider === 'deepseek') cfg.deepseek = { ...cfg.deepseek,   model:         persona.modelId }
    }

    return JSON.parse(JSON.stringify(cfg))
  }

  // ── Chunk handler (used during per-persona single-persona runs) ──────────

  // _currentChunkPersonaId is set by runRecipe before each single-persona runAgent call
  let _currentChunkPersonaId = null

  function handleRecipeChunk(_chatId, chunk) {
    if (!activeRun.value || activeRun.value.status !== 'running') return

    const run = activeRun.value
    const pid = _currentChunkPersonaId

    if (chunk.type === 'text') {
      if (pid && pid in run.outputs) {
        run.outputs[pid] = (run.outputs[pid] || '') + (chunk.text || '')
      }
    } else if (chunk.type === 'persona_end' || chunk.type === 'done') {
      // Signal that current persona finished streaming — resolve handled by caller
    } else if (chunk.type === 'error') {
      // Handled by caller via runAgent return value
    }
  }

  async function _finalizeRun(status, error) {
    if (!activeRun.value) return
    const run = activeRun.value
    run.status = status
    run.error = error
    _currentChunkPersonaId = null
    chatsStore.clearRecipeChunkCallback()

    const recipe = recipes.value.find(r => r.id === run.recipeId)

    // Persist run to disk
    const runDetail = {
      id: run.runId,
      recipeId: run.recipeId,
      recipeName: recipe?.name || '',
      inputs: run.inputs || {},
      outputs: { ...run.outputs },
      personaStatuses: { ...run.personaStatuses },
      status,
      triggeredBy: 'manual',
      startedAt: run.startedAt,
      completedAt: new Date().toISOString(),
      error: error || null,
    }

    try {
      await window.electronAPI.recipes.saveRun(runDetail)
      await loadRuns()
    } catch (err) {
      console.warn('[RecipesStore] Failed to persist run:', err)
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function loadRecipes() {
    if (!window.electronAPI?.recipes) return
    try {
      recipes.value = await window.electronAPI.recipes.list() || []
    } catch (err) {
      console.error('[RecipesStore] loadRecipes error:', err)
    }
  }

  async function saveRecipe(recipe) {
    if (!window.electronAPI?.recipes) return null
    try {
      const result = await window.electronAPI.recipes.save(recipe)
      if (result.success) await loadRecipes()
      return result
    } catch (err) {
      console.error('[RecipesStore] saveRecipe error:', err)
      return { success: false, error: err.message }
    }
  }

  async function deleteRecipe(id) {
    if (!window.electronAPI?.recipes) return
    try {
      await window.electronAPI.recipes.delete(id)
      await loadRecipes()
    } catch (err) {
      console.error('[RecipesStore] deleteRecipe error:', err)
    }
  }

  async function loadRuns(recipeId = null) {
    if (!window.electronAPI?.recipes) return
    try {
      runs.value = await window.electronAPI.recipes.getRuns(recipeId ? { recipeId } : {}) || []
    } catch (err) {
      console.error('[RecipesStore] loadRuns error:', err)
    }
  }

  async function getRunDetail(runId) {
    if (!window.electronAPI?.recipes) return null
    try {
      return await window.electronAPI.recipes.getRun(runId)
    } catch (err) {
      console.error('[RecipesStore] getRunDetail error:', err)
      return null
    }
  }

  async function deleteRun(runId) {
    if (!window.electronAPI?.recipes) return
    try {
      await window.electronAPI.recipes.deleteRun(runId)
      await loadRuns()
      if (selectedRunDetail.value?.id === runId) selectedRunDetail.value = null
    } catch (err) {
      console.error('[RecipesStore] deleteRun error:', err)
    }
  }

  // ── Run a recipe ──────────────────────────────────────────────────────────

  // ── Topological sort helpers ──────────────────────────────────────────────

  // Returns personas in execution order (waves). Each wave is an array of rp
  // entries that can run in parallel (all their deps are in previous waves).
  function buildExecutionWaves(personas) {
    const order = []
    const resolved = new Set()
    const remaining = [...personas]

    while (remaining.length > 0) {
      const wave = remaining.filter(rp => {
        const deps = rp.dependsOn || []
        return deps.every(id => resolved.has(id))
      })
      if (wave.length === 0) {
        // Cycle or unresolvable — just append the rest
        order.push(...remaining)
        break
      }
      order.push(...wave)
      wave.forEach(rp => resolved.add(rp.personaId))
      wave.forEach(rp => {
        const i = remaining.indexOf(rp)
        if (i !== -1) remaining.splice(i, 1)
      })
    }
    return order
  }

  // Check whether a persona should run given its deps' outcomes
  function shouldRunPersona(rp, personaStatuses) {
    const deps = rp.dependsOn || []
    if (deps.length === 0) return true
    const cond = rp.runCondition || 'always'
    if (cond === 'always') return true
    if (cond === 'on_success') return deps.every(id => personaStatuses[id] === 'done')
    if (cond === 'on_failure') return deps.some(id => personaStatuses[id] === 'failed' || personaStatuses[id] === 'skipped')
    return true
  }

  // ── Run a single persona ──────────────────────────────────────────────────

  async function _runSinglePersona(rp, recipe, inputs, previousOutputs, chatId) {
    const persona = personasStore.getPersonaById(rp.personaId)
    if (!persona) return { success: false, error: 'Persona not found' }

    const personaCfg = buildPersonaConfig(persona)

    // Build a name→output map for {{output:Name}} token resolution
    const nameToOutput = {}
    for (const [pid, text] of Object.entries(previousOutputs)) {
      const p = personasStore.getPersonaById(pid)
      if (p) nameToOutput[p.name] = text
    }

    // Resolve both {{input_var}} and {{output:Name}} in prompts
    const globalPart  = resolveOutputTokens(renderTemplate(recipe.globalPrompt || '', inputs), nameToOutput)
    const personaPart = resolveOutputTokens(renderTemplate(rp.prompt || '', inputs), nameToOutput)
    const systemPersonaPrompt = [globalPart, personaPart].filter(Boolean).join('\n\n')

    // Build user message: only append upstream outputs that were NOT already inlined
    // via {{output:Name}} tokens (to avoid duplication).
    const inlinedNames = new Set(
      [...(recipe.globalPrompt || ''), ...(rp.prompt || '')].join('')
        .match(/\{\{output:([^}]+)\}\}/g)?.map(m => m.replace(/^\{\{output:|\}\}$/g, '').trim()) || []
    )

    const prevOutputLines = Object.entries(previousOutputs)
      .filter(([pid]) => (rp.dependsOn || []).includes(pid))
      .filter(([pid]) => {
        const name = personasStore.getPersonaById(pid)?.name || ''
        return !inlinedNames.has(name)
      })
      .map(([pid, text]) => {
        const prevPersona = personasStore.getPersonaById(pid)
        return `[Output from ${prevPersona?.name || pid}]:\n${text}`
      })

    const userContent = [
      'Run this task.',
      ...prevOutputLines,
    ].join('\n\n---\n\n')

    const singlePersonaRun = [{
      personaId: rp.personaId,
      personaName: persona.name,
      config: personaCfg,
      enabledAgents: [],
      enabledSkills: [],
      personaPrompts: {
        systemPersonaPrompt,
        systemPersonaId: rp.personaId,
        userPersonaId: '__recipe_user__',
      },
      mcpServers: [],
      httpTools: [],
    }]

    _currentChunkPersonaId = rp.personaId

    return await window.electronAPI.runAgent({
      chatId,
      messages: [{ role: 'user', content: userContent }],
      config: JSON.parse(JSON.stringify(singlePersonaRun[0].config)),
      enabledAgents: [],
      enabledSkills: [],
      personaRuns: JSON.parse(JSON.stringify(singlePersonaRun)),
      personaPrompts: {},
      mcpServers: [],
      httpTools: [],
      chatPermissionMode: recipe.permission || 'all_permissions',
      chatAllowList: [],
      chatDangerOverrides: [],
      maxOutputTokens: null,
      knowledgeConfig: { ragEnabled: false },
    })
  }

  // ── Run a recipe ──────────────────────────────────────────────────────────

  async function runRecipe(recipeId, inputs) {
    const recipe = recipes.value.find(r => r.id === recipeId)
    if (!recipe) return

    if (!window.electronAPI?.runAgent) {
      throw new Error('electronAPI.runAgent not available')
    }

    const runId = uuid()
    const chatId = `recipe:${runId}`
    const recipePersonas = recipe.personas || []

    if (recipePersonas.length === 0) {
      throw new Error('No valid personas configured for this recipe.')
    }

    // Initialize outputs and statuses
    const outputs = {}
    const personaStatuses = {}
    for (const rp of recipePersonas) {
      outputs[rp.personaId] = ''
      personaStatuses[rp.personaId] = 'waiting'
    }

    // Initialize active run
    activeRun.value = {
      recipeId,
      runId,
      chatId,
      status: 'running',
      outputs,
      personaStatuses,
      error: null,
      personasDone: new Set(),
      inputs: { ...inputs },
      startedAt: new Date().toISOString(),
    }

    // Register chunk callback
    chatsStore.setRecipeChunkCallback(handleRecipeChunk)

    // Build execution order using topological sort
    const execOrder = buildExecutionWaves(recipePersonas)

    try {
      for (const rp of execOrder) {
        // Check if run was stopped
        if (activeRun.value?.status !== 'running') break

        // Check whether this persona should run
        if (!shouldRunPersona(rp, activeRun.value.personaStatuses)) {
          activeRun.value.personaStatuses[rp.personaId] = 'skipped'
          continue
        }

        // Mark as running
        activeRun.value.personaStatuses[rp.personaId] = 'running'

        // Collect outputs from depended-on personas as context
        const prevOutputs = {}
        for (const depId of (rp.dependsOn || [])) {
          if (activeRun.value.outputs[depId]) {
            prevOutputs[depId] = activeRun.value.outputs[depId]
          }
        }

        const res = await _runSinglePersona(rp, recipe, inputs, prevOutputs, chatId)
        _currentChunkPersonaId = null

        if (!activeRun.value || activeRun.value.status !== 'running') break

        if (res?.success === false) {
          activeRun.value.personaStatuses[rp.personaId] = 'failed'
          // Continue with remaining personas — don't abort the whole run unless stopped
        } else {
          activeRun.value.personaStatuses[rp.personaId] = 'done'
          activeRun.value.personasDone.add(rp.personaId)
        }
      }

      if (activeRun.value?.status === 'running') {
        const anyFailed = Object.values(activeRun.value.personaStatuses).some(s => s === 'failed')
        _finalizeRun(anyFailed ? 'error' : 'completed', anyFailed ? 'One or more personas failed' : null)
      }
    } catch (err) {
      if (activeRun.value?.status === 'running') {
        _finalizeRun('error', err.message || 'Unexpected error')
      }
    }
  }

  async function stopRecipe() {
    if (!activeRun.value) return
    const { chatId } = activeRun.value
    _finalizeRun('error', 'Stopped by user')
    if (window.electronAPI?.stopAgent) {
      await window.electronAPI.stopAgent(chatId)
    }
  }

  function resetActiveRun() {
    activeRun.value = null
  }

  return {
    recipes,
    runs,
    activeRun,
    selectedRunDetail,
    isRunning,
    // CRUD
    loadRecipes,
    saveRecipe,
    deleteRecipe,
    loadRuns,
    getRunDetail,
    deleteRun,
    // Run
    runRecipe,
    stopRecipe,
    resetActiveRun,
    // Scheduled run subscription
    subscribeToScheduledRuns,
    unsubscribeFromScheduledRuns,
  }
})
