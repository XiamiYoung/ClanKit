import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

const ERROR_KEYS = {
  rootChanged: 'aidoc.rootChanged',
  rootUnavailable: 'aidoc.rootUnavailable',
  providerMissing: 'aidoc.providerMissing',
  busy: 'aidoc.ingestBusy',
  invalid_model: 'aidoc.ingestInvalidModel',
  invalid_language: 'aidoc.ingestInvalidLanguage',
}

function describeError(result, message, key) {
  message.value = result.error || ''
  key.value = message.value ? '' : (ERROR_KEYS[result.code] || 'aidoc.requestFailed')
}

export const useAiDocStore = defineStore('aidoc', () => {
  const status = shallowRef(null)
  const graph = shallowRef(null)
  const sourceStates = shallowRef({})
  const wikiPages = shallowRef(null)
  const currentWikiPage = shallowRef(null)
  const wikiLoading = ref(false)

  const progress = ref(null)
  const error = ref('')
  const errorKey = ref('')
  const stats = shallowRef(null)
  const requestId = ref(null)
  const updating = computed(() => requestId.value !== null)

  const ingestPlan = shallowRef(null)
  const ingestProgress = shallowRef(null)
  const ingestResult = shallowRef(null)
  const ingestError = ref('')
  const ingestErrorKey = ref('')
  const ingestRequestId = ref(null)
  const ingesting = computed(() => ingestRequestId.value !== null)
  const ingestStopping = ref(false)
  const syncPreparing = ref(false)
  const ingestNothing = ref(false)
  // The confirmation or result dialog. The run itself never needs a dialog.
  const ingestDialogVisible = ref(false)
  // Provider and model chosen for organizing. Global, so setRoot does not reset it.
  const ingestModel = ref({ providerId: '', model: '' })
  // Wiki languages to generate. Starts from the remembered or default selection of each plan.
  const ingestLanguages = ref([])
  // True while the plan is recomputed for a changed language selection.
  const ingestPlanLoading = ref(false)
  // Approximate percent bookkeeping; each value only moves forward within a run.
  const indexPercent = ref(0)
  const ingestPercent = ref(0)
  let ingestCompleted = 0
  let ingestActions = 0
  // Id of the run whose result arrives through this renderer's own invoke promise.
  let localIngestId = null
  let finishingIngestId = null
  let planRequest = 0

  // Phase 1 shows index progress; phase 2 estimates progress from finished sources plus a
  // smoothed fraction of the in-flight one. 100 is only shown once the run result exists.
  const syncPercent = computed(() => {
    const result = ingestResult.value
    // A stopped, aborted or partially processed run never reports a full bar.
    if (result && !result.stopped && !result.aborted && !result.remaining) return 100
    if (result || ingesting.value) return ingestPercent.value
    if (updating.value) return indexPercent.value
    return 0
  })

  function bumpIngestPercent(total) {
    if (!total) return
    const fraction = Math.min(ingestActions / (ingestActions + 4), 0.9)
    const raw = Math.floor(((ingestCompleted + fraction) / total) * 100)
    ingestPercent.value = Math.max(ingestPercent.value, Math.min(raw, 99))
  }

  function trackIngestEvent(event) {
    if (event.type === 'action') ingestActions++
    else if (event.status === 'start') { ingestCompleted = event.index; ingestActions = 0 }
    else if (event.status === 'done' || event.status === 'failed') { ingestCompleted = event.index + 1; ingestActions = 0 }
    bumpIngestPercent(event.total)
  }

  function resetPercent() {
    indexPercent.value = ingestPercent.value = 0
    ingestCompleted = ingestActions = 0
  }

  let root = ''
  let generation = 0
  const sequences = new Map()
  let unsubscribe
  let unsubscribeIngest
  let disposed = false
  // Method whose failure currently owns the shared error; only that method's success clears it.
  let readErrorOwner = ''

  function setRoot(value = '') {
    if (root === value) return
    root = value
    generation++
    status.value = graph.value = progress.value = stats.value = null
    wikiPages.value = currentWikiPage.value = null
    wikiLoading.value = false
    sourceStates.value = {}
    requestId.value = ingestRequestId.value = null
    error.value = errorKey.value = ''
    readErrorOwner = ''
    ingestPlan.value = ingestResult.value = ingestProgress.value = null
    ingestError.value = ingestErrorKey.value = ''
    syncPreparing.value = ingestStopping.value = ingestNothing.value = false
    ingestPlanLoading.value = false
    planRequest++
    ingestDialogVisible.value = false
    localIngestId = null
    resetPercent()
    void restoreIngestStatus()
  }

  async function read(method, output, { field, options, loading, silent } = {}) {
    const api = window.electronAPI?.aidoc
    if (typeof api?.[method] !== 'function') return
    const current = generation
    const latest = (sequences.get(method) || 0) + 1
    sequences.set(method, latest)
    const isCurrent = () => current === generation && sequences.get(method) === latest
    const reportReadError = result => {
      if (silent) return
      describeError(result, error, errorKey)
      readErrorOwner = method
    }
    const clearReadError = () => {
      if (readErrorOwner !== method) return
      error.value = errorKey.value = ''
      readErrorOwner = ''
    }
    if (loading) loading.value = true
    try {
      const result = await api[method]({ ...options, root })
      if (!isCurrent()) return
      if (result.success === false) reportReadError(result)
      else {
        output.value = field ? result[field] : result
        clearReadError()
      }
    } catch (err) {
      if (isCurrent()) reportReadError({ error: err.message })
    } finally {
      if (loading && isCurrent()) loading.value = false
    }
  }

  const refreshStatus = async () => {
    await read('getSyncStatus', status)
    const { ingestAvailable, pending } = status.value || {}
    if (ingestAvailable && pending && pending.new + pending.updated > 0) ingestNothing.value = false
  }
  const loadGraph = () => read('getGraph', graph)
  const refreshSourceStates = () => read('getSourceStates', sourceStates, { field: 'states', silent: true })
  const loadWikiPages = () => read('getWikiPages', wikiPages, { field: 'pages' })
  const openWikiPage = rel => read('getWikiPage', currentWikiPage, {
    field: 'page', options: { rel }, loading: wikiLoading,
  })

  async function updateIndex({ full = false } = {}) {
    const api = window.electronAPI?.aidoc
    if (!api) return false
    const id = globalThis.crypto.randomUUID()
    requestId.value = id
    progress.value = stats.value = null
    indexPercent.value = 0
    error.value = errorKey.value = ''
    readErrorOwner = ''
    try {
      disposed = false
      unsubscribe ??= api.onIndexProgress(event => {
        if (event.requestId === requestId.value) {
          progress.value = { done: event.done, total: event.total }
          const raw = event.total > 0 ? Math.floor((event.done / event.total) * 100) : 0
          indexPercent.value = Math.max(indexPercent.value, Math.min(raw, 100))
        }
      })
      const result = await api.updateIndex({ root, requestId: id, full })
      if (id !== requestId.value) return false
      if (!result.success) {
        describeError(result, error, errorKey)
        return false
      }
      stats.value = result.stats
      ingestNothing.value = false
      await Promise.all([loadGraph(), refreshStatus(), refreshSourceStates()])
      return id === requestId.value
    } catch (err) {
      if (id === requestId.value) describeError({ error: err.message }, error, errorKey)
      return false
    } finally {
      if (id === requestId.value) requestId.value = null
      releaseIfDisposed()
    }
  }

  async function runSync({ rels, force = false } = {}) {
    const api = window.electronAPI?.aidoc
    if (!api?.getIngestPlan || syncPreparing.value || updating.value || ingesting.value) return
    const current = generation
    syncPreparing.value = true
    ingestNothing.value = false
    ingestError.value = ingestErrorKey.value = ''
    ingestPlan.value = ingestResult.value = null
    ingestDialogVisible.value = false
    try {
      if (!(await updateIndex()) || current !== generation) return
      const result = await api.getIngestPlan({ root, rels, force })
      if (current !== generation) return
      if (!result.success) {
        describeError(result, ingestError, ingestErrorKey)
        return
      }
      // With nothing pending for the selection the dialog still opens when another language has work to add.
      if (result.sources.length || result.languages?.otherWork) {
        ingestPlan.value = { ...result, force, rels }
        ingestLanguages.value = [...(result.languages?.selected || [])]
        ingestDialogVisible.value = true
        // Keep an in-session choice while its provider is still offered; otherwise use the remembered one.
        const kept = result.providers?.some(provider => provider.id === ingestModel.value.providerId)
        if (!kept && result.selected) ingestModel.value = { ...result.selected }
      } else ingestNothing.value = true
      await Promise.all([refreshStatus(), refreshSourceStates()])
    } catch (err) {
      if (current === generation) describeError({ error: err.message }, ingestError, ingestErrorKey)
    } finally {
      if (current === generation) syncPreparing.value = false
    }
  }

  // Recomputes which sources have work for the new language selection; at least one language stays selected.
  async function setIngestLanguages(languages) {
    const plan = ingestPlan.value
    const api = window.electronAPI?.aidoc
    const next = (plan?.languages?.available || []).filter(lang => languages.includes(lang))
    if (!plan || !api?.getIngestPlan || ingesting.value || !next.length) return
    ingestLanguages.value = next
    const current = generation
    const latest = ++planRequest
    ingestPlanLoading.value = true
    ingestError.value = ingestErrorKey.value = ''
    try {
      const result = await api.getIngestPlan({ root, rels: plan.rels, force: plan.force, languages: next })
      if (current !== generation || latest !== planRequest) return
      if (!result.success) describeError(result, ingestError, ingestErrorKey)
      else {
        ingestPlan.value = {
          ...ingestPlan.value, sources: result.sources, removed: result.removed, overflow: result.overflow, languages: result.languages,
        }
      }
    } catch (err) {
      if (current === generation && latest === planRequest) describeError({ error: err.message }, ingestError, ingestErrorKey)
    } finally {
      if (current === generation && latest === planRequest) ingestPlanLoading.value = false
    }
  }

  function ingestSingle(rel) {
    return runSync({ rels: [rel], force: true })
  }

  // Idempotent: keeps exactly one ingest progress listener and cancels a pending dispose.
  function ensureIngestListener() {
    const api = window.electronAPI?.aidoc
    if (typeof api?.onIngestProgress !== 'function') return
    disposed = false
    unsubscribeIngest ??= api.onIngestProgress(event => {
      if (event.requestId !== ingestRequestId.value) return
      if (event.type === 'index-error') return
      if (event.type === 'complete') {
        // A run that this renderer started reports through its invoke promise instead.
        if (localIngestId !== event.requestId) void finishRestoredIngest(event)
        return
      }
      ingestProgress.value = event
      trackIngestEvent(event)
    })
  }

  function releaseIfDisposed() {
    if (!disposed) return
    if (!updating.value) { unsubscribe?.(); unsubscribe = undefined }
    if (!ingesting.value) { unsubscribeIngest?.(); unsubscribeIngest = undefined }
  }

  async function refreshAfterIngest() {
    await Promise.all([loadGraph(), loadWikiPages(), refreshStatus(), refreshSourceStates()])
  }

  function endIngest(id) {
    if (id !== ingestRequestId.value) return
    ingestRequestId.value = null
    ingestStopping.value = false
    if (localIngestId === id) localIngestId = null
  }

  // Completion of a run started before a renderer reload; there is no invoke promise to await.
  async function finishRestoredIngest(event) {
    const id = event.requestId
    if (finishingIngestId === id) return
    finishingIngestId = id
    if (event.error) describeError({}, ingestError, ingestErrorKey)
    else {
      const summary = event.summary || {}
      ingestResult.value = {
        done: [], failed: [], warnings: [], overflow: 0, ...summary, remaining: summary.remaining || 0,
      }
    }
    try {
      await refreshAfterIngest()
    } finally {
      finishingIngestId = null
      endIngest(id)
      releaseIfDisposed()
    }
  }

  // Picks up a run that is still active in the main process, e.g. after the renderer reloaded.
  async function restoreIngestStatus() {
    const api = window.electronAPI?.aidoc
    if (typeof api?.getIngestStatus !== 'function' || !root || ingesting.value) return
    const current = generation
    try {
      const snapshot = await api.getIngestStatus({ root })
      if (current !== generation || ingesting.value || !snapshot?.success || !snapshot.running || !snapshot.requestId) return
      ingestRequestId.value = snapshot.requestId
      localIngestId = null
      ingestDialogVisible.value = false
      ingestPlan.value = ingestResult.value = null
      ingestError.value = ingestErrorKey.value = ''
      resetPercent()
      if (snapshot.total) {
        ingestProgress.value = {
          requestId: snapshot.requestId, status: snapshot.status, index: snapshot.index, total: snapshot.total, rel: snapshot.rel, lang: snapshot.lang,
        }
        trackIngestEvent(ingestProgress.value)
      }
      ensureIngestListener()
    } catch { /* Without a snapshot the button simply stays idle. */ }
  }

  async function confirmIngest() {
    const api = window.electronAPI?.aidoc
    const plan = ingestPlan.value
    if (!api?.runIngest || ingesting.value || ingestPlanLoading.value || !plan?.providerReady || !plan.sources.length) return
    if (plan.languages && !ingestLanguages.value.length) return
    const id = globalThis.crypto.randomUUID()
    ingestRequestId.value = id
    localIngestId = id
    // The run continues in the background; only a failure brings the dialog back.
    ingestDialogVisible.value = false
    ingestProgress.value = ingestResult.value = null
    resetPercent()
    ingestError.value = ingestErrorKey.value = ''
    let busy = false
    try {
      ensureIngestListener()
      const result = await api.runIngest({
        root, requestId: id, force: plan.force, rels: plan.sources.map(source => source.rel),
        ...(plan.languages ? { languages: [...ingestLanguages.value] } : {}),
        ...(plan.providers?.length ? { providerId: ingestModel.value.providerId, model: ingestModel.value.model } : {}),
      })
      if (id !== ingestRequestId.value) return
      if (!result.success) {
        busy = result.code === 'busy'
        if (busy) ingestPlan.value = null
        else {
          describeError(result, ingestError, ingestErrorKey)
          ingestDialogVisible.value = true
        }
        return
      }
      const overflow = Math.max(result.overflow || 0, plan.overflow || 0)
      // A source can fail in several languages, so failures are counted per source.
      const failedSources = new Set(result.failed.map(failure => failure.rel)).size
      const remaining = Math.max(0, plan.sources.length - result.done.length - failedSources) + overflow
      ingestResult.value = { ...result, overflow, remaining }
      await refreshAfterIngest()
    } catch (err) {
      if (id === ingestRequestId.value) {
        describeError({ error: err.message }, ingestError, ingestErrorKey)
        ingestDialogVisible.value = true
      }
    } finally {
      endIngest(id)
      releaseIfDisposed()
    }
    // Another run owns the backend lock; follow it instead of reporting an error.
    if (busy) await restoreIngestStatus()
  }

  function openIngestResult() {
    if (ingestResult.value && !ingesting.value) ingestDialogVisible.value = true
  }

  function cancelIngestPlan() {
    if (ingesting.value) return
    ingestDialogVisible.value = false
    ingestPlan.value = ingestProgress.value = ingestResult.value = null
    ingestError.value = ingestErrorKey.value = ''
    resetPercent()
  }

  async function stopIngest() {
    if (!ingesting.value || ingestStopping.value) return
    const id = ingestRequestId.value
    ingestStopping.value = true
    try {
      const result = await window.electronAPI.aidoc.stopIngest({ root })
      if (id !== ingestRequestId.value || result.success) return
      describeError(result, ingestError, ingestErrorKey)
      ingestStopping.value = false
    } catch (err) {
      if (id === ingestRequestId.value) {
        describeError({ error: err.message }, ingestError, ingestErrorKey)
        ingestStopping.value = false
      }
    }
  }

  function dispose() {
    disposed = true
    releaseIfDisposed()
  }

  return {
    status, graph, progress, updating, error, errorKey, stats,
    sourceStates, wikiPages, currentWikiPage, wikiLoading,
    ingestPlan, ingesting, ingestProgress, ingestResult, ingestError, ingestErrorKey,
    ingestStopping, syncPreparing, ingestNothing, syncPercent, ingestModel, ingestDialogVisible, ingestLanguages, ingestPlanLoading,
    setRoot, setIngestLanguages, refreshStatus, loadGraph, refreshSourceStates, loadWikiPages, openWikiPage,
    updateIndex, runSync, ingestSingle, confirmIngest, cancelIngestPlan, stopIngest, ensureIngestListener, restoreIngestStatus, openIngestResult, dispose,
  }
})
