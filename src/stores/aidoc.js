import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

export const useAiDocStore = defineStore('aidoc', () => {
  const status = shallowRef(null)
  const graph = shallowRef(null)
  const progress = ref(null)
  const error = ref('')
  const stats = shallowRef(null)
  const requestId = ref(null)
  const updating = computed(() => requestId.value !== null)
  let root = ''
  let generation = 0
  let graphSequence = 0
  let statusSequence = 0
  let unsubscribe

  function setRoot(value = '') {
    if (root === value) return
    root = value
    generation++
    status.value = graph.value = progress.value = stats.value = null
    requestId.value = null
    error.value = ''
  }

  async function read(method, latest, isLatest, output) {
    const api = window.electronAPI?.aidoc
    if (!api) return
    const current = generation
    try {
      const result = await api[method]({ root })
      if (current !== generation || !isLatest(latest)) return
      if (result.success === false) error.value = result.error || result.code || 'aidoc_request_failed'
      else output.value = result
    } catch (err) {
      if (current === generation && isLatest(latest)) error.value = err.message
    }
  }

  function refreshStatus() {
    return read('getSyncStatus', ++statusSequence, id => id === statusSequence, status)
  }

  function loadGraph() {
    return read('getGraph', ++graphSequence, id => id === graphSequence, graph)
  }

  async function updateIndex({ full = false } = {}) {
    const api = window.electronAPI?.aidoc
    if (!api) return
    unsubscribe ??= api.onIndexProgress(event => {
      if (event.requestId === requestId.value) {
        progress.value = { done: event.done, total: event.total }
      }
    })
    const id = globalThis.crypto.randomUUID()
    requestId.value = id
    progress.value = stats.value = null
    error.value = ''
    try {
      const result = await api.updateIndex({ root, requestId: id, full })
      if (id !== requestId.value) return
      if (!result.success) {
        error.value = result.error || result.code || 'aidoc_request_failed'
        return
      }
      stats.value = result.stats
      await Promise.all([loadGraph(), refreshStatus()])
    } catch (err) {
      if (id === requestId.value) error.value = err.message
    } finally {
      if (id === requestId.value) requestId.value = null
    }
  }

  function dispose() {
    unsubscribe?.()
    unsubscribe = undefined
  }

  return { status, graph, updating, progress, error, stats, setRoot, refreshStatus, loadGraph, updateIndex, dispose }
})
