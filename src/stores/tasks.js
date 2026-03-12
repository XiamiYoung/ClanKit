import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuid } from 'uuid'
import { useConfigStore } from './config'
import { useChatsStore } from './chats'
import { usePersonasStore } from './personas'

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTasksStore = defineStore('tasks', () => {
  const configStore  = useConfigStore()
  const chatsStore   = useChatsStore()
  const personasStore = usePersonasStore()

  // Task templates
  const tasks = ref([])
  // Plan definitions
  const plans = ref([])
  // Run index summaries
  const runs = ref([])
  // Currently selected run detail (for Runs panel)
  const selectedRunDetail = ref(null)

  // Active manual run state
  // {
  //   planId, runId, chatId,
  //   status: 'running'|'completed'|'error',
  //   stepResults: [],   // live-updated as steps complete
  //   currentStepIndex: number,
  //   error: null|string,
  //   startedAt: string,
  // }
  const activeRun = ref(null)
  const isRunning = computed(() => activeRun.value?.status === 'running')

  // Plan activity — lightweight status for TitleBar minibar
  // { status:'running'|'done'|'error', planId, planName, stepCount, doneCount, currentTaskName, summary, startedAt, completedAt }
  const planActivity = ref(null)

  // Pending plan open request — set by minibar click, consumed by TaskEngineView
  const pendingOpenPlanId = ref(null)
  function requestOpenPlan(planId) { pendingOpenPlanId.value = planId }
  function clearPendingOpenPlan() { pendingOpenPlanId.value = null }

  // ── Scheduled run subscription ────────────────────────────────────────────

  let _unsubRunCompleted = null
  let _unsubRunStarted   = null

  function subscribeToScheduledRuns() {
    if (!window.electronAPI?.tasks) return

    if (!_unsubRunStarted && window.electronAPI.tasks.onRunStarted) {
      _unsubRunStarted = window.electronAPI.tasks.onRunStarted(({ runId, planId, planName, stepCount, startedAt }) => {
        loadRuns()
        planActivity.value = {
          status:          'running',
          planId,
          planName:        planName || plans.value.find(p => p.id === planId)?.name || '',
          stepCount:       stepCount || 0,
          doneCount:       0,
          currentTaskName: null,
          summary:         null,
          startedAt:       startedAt || new Date().toISOString(),
          completedAt:     null,
        }
      })
    }

    if (_unsubRunCompleted || !window.electronAPI.tasks.onRunCompleted) return
    _unsubRunCompleted = window.electronAPI.tasks.onRunCompleted(async ({ runId, planId, status }) => {
      loadRuns()
      // Populate planActivity from the completed scheduled run
      try {
        const runDetail = await window.electronAPI.tasks.getRun(runId)
        if (runDetail) {
          planActivity.value = {
            status: runDetail.status === 'completed' ? 'done' : 'error',
            planId: runDetail.planId,
            planName: runDetail.planName,
            stepCount: (runDetail.stepResults || []).length,
            doneCount: (runDetail.stepResults || []).filter(r => r.status === 'done').length,
            currentTaskName: null,
            summary: null,
            startedAt: runDetail.startedAt,
            completedAt: runDetail.completedAt,
          }
          _summarizePlanActivity(runDetail.stepResults).catch(() => {})
        }
      } catch {}
    })
  }

  function unsubscribeFromScheduledRuns() {
    if (_unsubRunStarted) {
      _unsubRunStarted()
      _unsubRunStarted = null
    }
    if (_unsubRunCompleted) {
      _unsubRunCompleted()
      _unsubRunCompleted = null
    }
  }

  // ── Provider config for a persona (mirrors ChatsView.buildPersonaRuns) ────

  function buildPersonaConfig(persona) {
    const raw = configStore.config
    const cfg = { ...raw }

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
    } else if (provider === 'openrouter') {
      cfg.apiKey  = raw.openrouter?.apiKey  || ''
      cfg.baseURL = raw.openrouter?.baseURL || ''
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

    if (persona.modelId) {
      if (provider === 'anthropic')       cfg.anthropic   = { ...cfg.anthropic,   activeModel:  persona.modelId }
      else if (provider === 'openrouter') cfg.openrouter  = { ...cfg.openrouter,  defaultModel: persona.modelId }
      else if (provider === 'openai')     cfg.openai      = { ...cfg.openai,      model:        persona.modelId }
      else if (provider === 'deepseek')   cfg.deepseek    = { ...cfg.deepseek,    model:        persona.modelId }
    }

    return JSON.parse(JSON.stringify(cfg))
  }

  // ── Chunk handler ─────────────────────────────────────────────────────────

  // Maps chatId → step result _key so parallel persona runs don't clobber each other
  const _chatIdToKey = new Map()

  function handleTaskChunk(chatId, chunk) {
    if (!activeRun.value || activeRun.value.status !== 'running') return
    const run = activeRun.value

    if (chunk.type === 'text' && chunk.text) {
      const key = _chatIdToKey.get(chatId)
      if (key) {
        const result = run.stepResults.find(r => r._key === key)
        if (result) result.output = (result.output || '') + chunk.text
      }
    }
  }

  // ── Plan activity summarization (background, non-blocking) ───────────────

  async function _summarizePlanActivity(stepResults) {
    if (!planActivity.value) return
    const pa = planActivity.value
    const outputText = (stepResults || [])
      .filter(r => r.output?.trim() && r.status !== 'skipped')
      .map(r => `[${r.taskName}]: ${r.output.slice(0, 400)}`)
      .join('\n')
      .slice(0, 1500)
    if (!outputText) {
      planActivity.value.summary = `${pa.planName} — ${pa.doneCount}/${pa.stepCount} steps`
      return
    }
    const prompt = `In 10-15 words, state the key outcome of this plan execution. No preamble, just the result:\nPlan: "${pa.planName}" (${pa.doneCount}/${pa.stepCount} steps, ${pa.status})\nOutputs:\n${outputText}`
    try {
      const config = JSON.parse(JSON.stringify(configStore.config))
      const result = await window.electronAPI.enhancePrompt({ prompt, config })
      if (result?.success && planActivity.value) {
        planActivity.value.summary = result.text.trim().replace(/^["']|["']$/g, '')
      }
    } catch {
      if (planActivity.value) planActivity.value.summary = `${pa.planName} — ${pa.doneCount}/${pa.stepCount} steps`
    }
  }

  // ── Build step prompt ─────────────────────────────────────────────────────
  // Resolves @inputName tokens, {{output:StepName}} tokens, and the step's
  // promptOverride (if set, used in place of task.prompt).

  function buildStepPrompt(task, step, stepOutputMap) {
    // Use override if present, else task prompt
    let prompt = step.promptOverride?.trim() || task.prompt || ''

    // Replace {{output:StepName}} tokens with outputs from completed steps
    prompt = prompt.replace(/\{\{output:([^}]+)\}\}/g, (match, name) => {
      const trimmed = name.trim()
      return stepOutputMap[trimmed] !== undefined ? String(stepOutputMap[trimmed]) : match
    })

    return prompt
  }

  // ── Build topological execution waves ─────────────────────────────────────

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
        // Fallback: push everything left as one wave to avoid infinite loop
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

  // ── Run a single persona for a step ──────────────────────────────────────

  async function _runPersonaForStep(persona, promptText, chatId, permissionMode = 'all_permissions', allowList = []) {
    const personaCfg = buildPersonaConfig(persona)

    const personaPrompts = {
      systemPersonaPrompt: persona.prompt || '',
      systemPersonaId: persona.id,
      userPersonaId: '__task_user__',
      groupChatContext: {
        personaName: persona.name,
        personaDescription: persona.description || '',
        otherParticipants: [],
      },
    }

    const singlePersonaRun = [{
      personaId: persona.id,
      personaName: persona.name,
      config: personaCfg,
      enabledAgents: [],
      enabledSkills: [],
      personaPrompts,
      mcpServers: [],
      httpTools: [],
    }]

    return await window.electronAPI.runAgent({
      chatId,
      messages: [{ role: 'user', content: promptText }],
      config: JSON.parse(JSON.stringify(personaCfg)),
      enabledAgents: [],
      enabledSkills: [],
      personaRuns: JSON.parse(JSON.stringify(singlePersonaRun)),
      personaPrompts: {},
      mcpServers: [],
      httpTools: [],
      chatPermissionMode: permissionMode,
      chatAllowList: JSON.parse(JSON.stringify(allowList)),
      chatDangerOverrides: [],
      maxOutputTokens: null,
      knowledgeConfig: { ragEnabled: false },
    })
  }

  // ── Finalize a run ────────────────────────────────────────────────────────

  async function _finalizeRun(status, error) {
    if (!activeRun.value) return
    const run = activeRun.value
    run.status = status
    run.error  = error
    _chatIdToKey.clear()
    chatsStore.clearTaskChunkCallback()

    const plan = plans.value.find(p => p.id === run.planId)

    const runDetail = {
      id:          run.runId,
      planId:      run.planId,
      planName:    plan?.name || '',
      stepResults: run.stepResults.map(r => {
        const { _key, ...rest } = r
        return rest
      }),
      status,
      triggeredBy: 'manual',
      startedAt:   run.startedAt,
      completedAt: new Date().toISOString(),
      error:       error || null,
    }

    try {
      await window.electronAPI.tasks.saveRun(runDetail)
      await loadRuns()
    } catch (err) {
      console.warn('[TasksStore] Failed to persist run:', err)
    } finally {
      activeRun.value = null
    }

    // Update planActivity to completed state and trigger background summarization
    if (planActivity.value && planActivity.value.planId === run.planId) {
      planActivity.value.status = status === 'completed' ? 'done' : 'error'
      planActivity.value.completedAt = runDetail.completedAt
      planActivity.value.currentTaskName = null
      _summarizePlanActivity(runDetail.stepResults).catch(() => {})
    }
  }

  // ── Run a plan manually ───────────────────────────────────────────────────

  async function runPlan(planId) {
    const plan = plans.value.find(p => p.id === planId)
    if (!plan) return

    if (!window.electronAPI?.runAgent) throw new Error('electronAPI.runAgent not available')

    const runId = uuid()
    const chatId = `task:${runId}`

    activeRun.value = {
      planId,
      runId,
      chatId,
      status: 'running',
      stepResults: [],
      currentStepIndex: 0,
      error: null,
      startedAt: new Date().toISOString(),
    }

    planActivity.value = {
      status: 'running',
      planId,
      planName: plan.name,
      stepCount: (plan.steps || []).length,
      doneCount: 0,
      currentTaskName: null,
      summary: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    }

    chatsStore.setTaskChunkCallback(handleTaskChunk)

    // stepOutputMap: stepName → combined output text (for {{output:StepName}} tokens)
    const stepOutputMap = {}
    // stepStatuses: stepId → 'done' | 'failed' | 'skipped'
    const stepStatuses = {}

    try {
      const waves = buildExecutionWaves(plan.steps || [])

      for (const wave of waves) {
        if (activeRun.value?.status !== 'running') break

        // Run all steps in this wave concurrently
        await Promise.all(wave.map(async (step) => {
          if (activeRun.value?.status !== 'running') return

          const stepIdx = plan.steps.indexOf(step)
          activeRun.value.currentStepIndex = stepIdx

          // Check run condition
          if (!shouldRunStep(step, stepStatuses)) {
            const ts = new Date().toISOString()
            activeRun.value.stepResults.push({ stepIndex: stepIdx, taskId: step.taskId, taskName: '(skipped)', status: 'skipped', error: 'Run condition not met', output: '', startedAt: ts, completedAt: ts })
            stepStatuses[step.id] = 'skipped'
            return
          }

          const task = tasks.value.find(t => t.id === step.taskId)
          if (!task) {
            const ts = new Date().toISOString()
            activeRun.value.stepResults.push({ stepIndex: stepIdx, taskId: step.taskId, taskName: '(not found)', status: 'skipped', error: 'Task not found', output: '', startedAt: ts, completedAt: ts })
            stepStatuses[step.id] = 'skipped'
            return
          }

          if (planActivity.value?.status === 'running') planActivity.value.currentTaskName = task.name

          const personaIds = [...new Set(step.defaultPersonaIds || [])]

          if (personaIds.length === 0) {
            const ts = new Date().toISOString()
            activeRun.value.stepResults.push({ stepIndex: stepIdx, taskId: task.id, taskName: task.name, status: 'skipped', error: 'No personas assigned', output: '', startedAt: ts, completedAt: ts })
            stepStatuses[step.id] = 'skipped'
            return
          }

          const promptText = buildStepPrompt(task, step, stepOutputMap)
          const stepOutputs = []
          let stepFailed = false

          // Run all personas for this step in parallel
          await Promise.all(personaIds.map(async (personaId) => {
            if (activeRun.value?.status !== 'running') return

            const persona = personasStore.getPersonaById(personaId)
            if (!persona) {
              const ts = new Date().toISOString()
              activeRun.value.stepResults.push({ stepIndex: stepIdx, taskId: task.id, taskName: task.name, personaId, personaName: '(not found)', status: 'skipped', error: 'Persona not found', output: '', startedAt: ts, completedAt: ts })
              return
            }

            const key = `${stepIdx}:${personaId}`
            const personaChatId = `task:${runId}:${stepIdx}:${personaId}`
            _chatIdToKey.set(personaChatId, key)

            activeRun.value.stepResults.push({
              _key: key,
              stepIndex: stepIdx,
              taskId: task.id,
              taskName: task.name,
              personaId: persona.id,
              personaName: persona.name,
              status: 'running',
              output: '',
              error: null,
              startedAt: new Date().toISOString(),
              completedAt: null,
            })

            const res = await _runPersonaForStep(persona, promptText, personaChatId, plan.permissionMode || 'all_permissions', plan.allowList || [])
            _chatIdToKey.delete(personaChatId)

            if (!activeRun.value || activeRun.value.status !== 'running') return

            const resultEntry = activeRun.value.stepResults.find(r => r._key === key)
            if (res?.success === false) {
              if (resultEntry) { resultEntry.status = 'failed'; resultEntry.completedAt = new Date().toISOString() }
              stepFailed = true
            } else {
              if (resultEntry) {
                resultEntry.status = 'done'
                resultEntry.completedAt = new Date().toISOString()
                stepOutputs.push(resultEntry.output)
              }
            }
          }))

          stepStatuses[step.id] = stepFailed ? 'failed' : 'done'
          if (planActivity.value?.status === 'running') {
            planActivity.value.doneCount = Math.min((planActivity.value.doneCount || 0) + 1, planActivity.value.stepCount)
          }

          // Store combined output keyed by task name for {{output:Name}} tokens
          if (stepOutputs.length > 0) {
            stepOutputMap[task.name] = stepOutputs.join('\n\n---\n\n')
          }
        }))
      }

      if (activeRun.value?.status === 'running') {
        const anyFailed = activeRun.value.stepResults.some(r => r.status === 'failed')
        await _finalizeRun(anyFailed ? 'error' : 'completed', anyFailed ? 'One or more steps failed' : null)
      }
    } catch (err) {
      if (activeRun.value?.status === 'running') {
        await _finalizeRun('error', err.message || 'Unexpected error')
      }
    }
  }

  async function stopRun() {
    if (!activeRun.value) return
    const { chatId } = activeRun.value
    await _finalizeRun('error', 'Stopped by user')
    if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(chatId)
  }

  function resetActiveRun() {
    activeRun.value = null
  }

  // ── CRUD: Tasks ───────────────────────────────────────────────────────────

  async function loadTasks() {
    if (!window.electronAPI?.tasks) return
    try { tasks.value = await window.electronAPI.tasks.list() || [] }
    catch (err) { console.error('[TasksStore] loadTasks error:', err) }
  }

  async function saveTask(task) {
    if (!window.electronAPI?.tasks) return null
    try {
      const result = await window.electronAPI.tasks.save(task)
      if (result.success) await loadTasks()
      return result
    } catch (err) {
      console.error('[TasksStore] saveTask error:', err)
      return { success: false, error: err.message }
    }
  }

  async function deleteTask(id) {
    if (!window.electronAPI?.tasks) return
    try {
      await window.electronAPI.tasks.delete(id)
      await loadTasks()
    } catch (err) { console.error('[TasksStore] deleteTask error:', err) }
  }

  // ── CRUD: Plans ───────────────────────────────────────────────────────────

  async function loadPlans() {
    if (!window.electronAPI?.plans) return
    try { plans.value = await window.electronAPI.plans.list() || [] }
    catch (err) { console.error('[TasksStore] loadPlans error:', err) }
  }

  async function savePlan(plan) {
    if (!window.electronAPI?.plans) return null
    try {
      const result = await window.electronAPI.plans.save(plan)
      if (result.success) await loadPlans()
      return result
    } catch (err) {
      console.error('[TasksStore] savePlan error:', err)
      return { success: false, error: err.message }
    }
  }

  async function deletePlan(id) {
    if (!window.electronAPI?.plans) return
    try {
      await window.electronAPI.plans.delete(id)
      await loadPlans()
    } catch (err) { console.error('[TasksStore] deletePlan error:', err) }
  }

  // ── Runs ──────────────────────────────────────────────────────────────────

  async function loadRuns(planId = null) {
    if (!window.electronAPI?.tasks) return
    try {
      runs.value = await window.electronAPI.tasks.getRuns(planId ? { planId } : {}) || []
    } catch (err) { console.error('[TasksStore] loadRuns error:', err) }
  }

  async function getRunDetail(runId) {
    if (!window.electronAPI?.tasks) return null
    try { return await window.electronAPI.tasks.getRun(runId) }
    catch (err) { console.error('[TasksStore] getRunDetail error:', err); return null }
  }

  async function deleteRun(runId) {
    if (!window.electronAPI?.tasks) return
    try {
      await window.electronAPI.tasks.deleteRun(runId)
      await loadRuns()
      if (selectedRunDetail.value?.id === runId) selectedRunDetail.value = null
    } catch (err) { console.error('[TasksStore] deleteRun error:', err) }
  }

  return {
    tasks, plans, runs, activeRun, selectedRunDetail, isRunning, planActivity,
    pendingOpenPlanId, requestOpenPlan, clearPendingOpenPlan,
    // Tasks CRUD
    loadTasks, saveTask, deleteTask,
    // Plans CRUD
    loadPlans, savePlan, deletePlan,
    // Runs
    loadRuns, getRunDetail, deleteRun,
    // Execution
    runPlan, stopRun, resetActiveRun,
    // Subscription
    subscribeToScheduledRuns, unsubscribeFromScheduledRuns,
  }
})
