// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiDocStore } from '../aidoc'

describe('AI Doc store', () => {
  let api
  let progress
  let unsubscribe

  beforeEach(() => {
    setActivePinia(createPinia())
    unsubscribe = vi.fn()
    api = {
      getGraph: vi.fn(async () => ({ nodes: [] })),
      getSyncStatus: vi.fn(async () => ({ indexStale: false })),
      updateIndex: vi.fn(),
      onIndexProgress: vi.fn(listener => {
        progress = listener
        return unsubscribe
      }),
    }
    window.electronAPI = { aidoc: api }
  })

  it('reports progress and refreshes state after a successful index update', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex.mockResolvedValue({ success: true, stats: { parsed: 1 } })
    const update = store.updateIndex({ full: true })
    expect(store.updating).toBe(true)
    const { requestId } = api.updateIndex.mock.calls[0][0]
    progress({ requestId, done: 1, total: 1 })
    expect(store.progress).toEqual({ done: 1, total: 1 })
    await update
    expect(store.stats).toEqual({ parsed: 1 })
    expect(store.status.indexStale).toBe(false)
    expect(store.graph.nodes).toEqual([])
    expect(store.updating).toBe(false)
    store.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('ignores pending reads, updates, and progress from the previous root', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    let finishRead
    let finishUpdate
    api.getGraph.mockReturnValueOnce(new Promise(resolve => { finishRead = resolve }))
    api.updateIndex.mockReturnValueOnce(new Promise(resolve => { finishUpdate = resolve }))
    const read = store.loadGraph()
    const update = store.updateIndex()
    const { requestId } = api.updateIndex.mock.calls[0][0]
    store.setRoot('/b')
    await store.loadGraph()
    progress({ requestId, done: 1, total: 1 })
    finishRead({ nodes: [{ id: 'old' }] })
    finishUpdate({ success: false, error: 'old failure' })
    await Promise.all([read, update])
    expect(store.graph.nodes).toEqual([])
    expect(store.progress).toBeNull()
    expect(store.error).toBe('')
    expect(store.updating).toBe(false)
  })
})
