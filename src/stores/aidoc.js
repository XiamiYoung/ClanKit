import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

const ERROR_KEYS = {
  rootChanged: 'aidoc.rootChanged',
  rootUnavailable: 'aidoc.rootUnavailable',
  providerMissing: 'aidoc.providerMissing',
  busy: 'aidoc.ingestBusy',
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
    error.value = errorKey.value = ''
    readErrorOwner = ''
    try {
      disposed = false
      unsubscribe ??= api.onIndexProgress(event => {
        if (event.requestId === requestId.value) {
          progress.value = { done: event.done, total: event.total }
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
    try {
      if (!(await updateIndex()) || current !== generation) return
      const result = await api.getIngestPlan({ root, rels, force })
      if (current !== generation) return
      if (!result.success) {
        describeError(result, ingestError, ingestErrorKey)
        return
      }
      if (result.sources.length) ingestPlan.value = { ...result, force }
      else ingestNothing.value = true
      await Promise.all([refreshStatus(), refreshSourceStates()])
    } catch (err) {
      if (current === generation) describeError({ error: err.message }, ingestError, ingestErrorKey)
    } finally {
      if (current === generation) syncPreparing.value = false
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
      ingestProgress.value = event
    })
  }

  function releaseIfDisposed() {
    if (!disposed) return
    if (!updating.value) { unsubscribe?.(); unsubscribe = undefined }
    if (!ingesting.value) { unsubscribeIngest?.(); unsubscribeIngest = undefined }
  }

  async function confirmIngest() {
    const api = window.electronAPI?.aidoc
    const plan = ingestPlan.value
    if (!api?.runIngest || ingesting.value || !plan?.providerReady || !plan.sources.length) return
    const id = globalThis.crypto.randomUUID()
    ingestRequestId.value = id
    ingestProgress.value = ingestResult.value = null
    ingestError.value = ingestErrorKey.value = ''
    try {
      ensureIngestListener()
      const result = await api.runIngest({
        root, requestId: id, force: plan.force, rels: plan.sources.map(source => source.rel),
      })
      if (id !== ingestRequestId.value) return
      if (!result.success) {
        describeError(result, ingestError, ingestErrorKey)
        return
      }
      const overflow = Math.max(result.overflow || 0, plan.overflow || 0)
      const remaining = Math.max(0, plan.sources.length - result.done.length - result.failed.length) + overflow
      ingestResult.value = { ...result, overflow, remaining }
      await Promise.all([loadGraph(), loadWikiPages(), refreshStatus(), refreshSourceStates()])
    } catch (err) {
      if (id === ingestRequestId.value) describeError({ error: err.message }, ingestError, ingestErrorKey)
    } finally {
      if (id === ingestRequestId.value) {
        ingestRequestId.value = null
        ingestStopping.value = false
      }
      releaseIfDisposed()
    }
  }

  function cancelIngestPlan() {
    if (ingesting.value) return
    ingestPlan.value = ingestProgress.value = ingestResult.value = null
    ingestError.value = ingestErrorKey.value = ''
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
    ingestStopping, syncPreparing, ingestNothing,
    setRoot, refreshStatus, loadGraph, refreshSourceStates, loadWikiPages, openWikiPage,
    updateIndex, runSync, ingestSingle, confirmIngest, cancelIngestPlan, stopIngest, ensureIngestListener, dispose,
  }
})
