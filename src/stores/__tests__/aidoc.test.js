// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiDocStore } from '../aidoc'

describe('AI Doc store', () => {
  let api
  let progress
  let ingestProgress
  let unsubscribe

  beforeEach(() => {
    setActivePinia(createPinia())
    unsubscribe = vi.fn()
    api = {
      getGraph: vi.fn(async () => ({ nodes: [] })),
      getSyncStatus: vi.fn(async () => ({ indexStale: false })),
      updateIndex: vi.fn(),
      getIngestPlan: vi.fn(),
      runIngest: vi.fn(),
      stopIngest: vi.fn(async () => ({ success: true })),
      getSourceStates: vi.fn(async () => ({ success: true, states: { '/a/kb_source/a.md': 'new' } })),
      getWikiPages: vi.fn(async () => ({ success: true, pages: [{ rel: 'wiki/index.md' }] })),
      getWikiPage: vi.fn(async ({ rel }) => ({ success: true, page: { rel, body: '# Wiki' } })),
      onIngestProgress: vi.fn(listener => {
        ingestProgress = listener
        return vi.fn()
      }),
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

  it('records failed update responses and clears the updating flag', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex.mockResolvedValue({ success: false, error: 'Permission denied' })
    const update = store.updateIndex()
    expect(store.updating).toBe(true)
    await update
    expect(store.error).toBe('Permission denied')
    expect(store.updating).toBe(false)
    expect(api.getGraph).not.toHaveBeenCalled()
  })

  it('exposes a translation key for a root mismatch and clears it on the next update', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex
      .mockResolvedValueOnce({ success: false, code: 'rootChanged' })
      .mockResolvedValueOnce({ success: true })
    await store.updateIndex()
    expect(store.error).toBe('')
    expect(store.errorKey).toBe('aidoc.rootChanged')
    expect(store.updating).toBe(false)
    await store.updateIndex()
    expect(store.errorKey).toBe('')
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

  it('updates the index before requesting a plan and shows no confirmation for an empty plan', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex.mockResolvedValue({ success: true, stats: {} })
    api.getIngestPlan.mockResolvedValue({ success: true, sources: [], providerReady: true })
    await store.runSync()
    expect(api.updateIndex.mock.invocationCallOrder[0]).toBeLessThan(api.getIngestPlan.mock.invocationCallOrder[0])
    expect(api.getIngestPlan).toHaveBeenCalledWith({ root: '/a', rels: undefined, force: false })
    expect(store.ingestPlan).toBeNull()
    expect(store.ingestNothing).toBe(true)
  })

  it('confirms only the selected source, tracks progress, stops and refreshes stores', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    const rel = 'kb_source/a.md'
    api.updateIndex.mockResolvedValue({ success: true, stats: {} })
    api.getIngestPlan.mockResolvedValue({ success: true, sources: [{ rel, size: 1, state: 'ingested' }], overflow: 1, providerReady: true })
    await store.ingestSingle(rel)
    expect(api.getIngestPlan).toHaveBeenCalledWith({ root: '/a', rels: [rel], force: true })
    expect(store.ingestPlan.sources.map(item => item.rel)).toEqual([rel])
    let finish
    api.runIngest.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const run = store.confirmIngest()
    const opts = api.runIngest.mock.calls[0][0]
    expect(opts).toMatchObject({ root: '/a', rels: [rel], force: true })
    ingestProgress({ requestId: 'wrong', index: 5 })
    expect(store.ingestProgress).toBeNull()
    ingestProgress({ requestId: opts.requestId, index: 0, total: 1, rel, action: 'read_source' })
    expect(store.ingestProgress.rel).toBe(rel)
    await store.stopIngest()
    expect(api.stopIngest).toHaveBeenCalledWith({ root: '/a' })
    expect(store.ingestStopping).toBe(true)
    finish({ success: true, done: [], failed: [], stopped: true, overflow: 0 })
    await run
    expect(store.ingesting).toBe(false)
    expect(store.ingestStopping).toBe(false)
    expect(store.ingestResult).toMatchObject({ stopped: true, remaining: 2 })
    expect(api.getGraph).toHaveBeenCalledTimes(2)
    expect(store.sourceStates['/a/kb_source/a.md']).toBe('new')
    expect(store.wikiPages).toEqual([{ rel: 'wiki/index.md' }])
    await store.openWikiPage('wiki/index.md')
    expect(store.currentWikiPage).toMatchObject({ rel: 'wiki/index.md', body: '# Wiki' })
  })

  it('displays a localized busy error and keeps the confirmation available', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex.mockResolvedValue({ success: true })
    api.getIngestPlan.mockResolvedValue({ success: true, sources: [{ rel: 'kb_source/a.md' }], providerReady: true })
    api.runIngest.mockResolvedValue({ success: false, code: 'busy' })
    await store.runSync()
    await store.confirmIngest()
    expect(store.ingestErrorKey).toBe('aidoc.ingestBusy')
    expect(store.ingesting).toBe(false)
    expect(store.ingestPlan).not.toBeNull()
    store.cancelIngestPlan()
    expect(store.ingestPlan).toBeNull()
  })

  it('keeps receiving ingest progress after dispose while running and unsubscribes when idle', async () => {
    const unsubscribeIngest = vi.fn()
    api.onIngestProgress.mockImplementation(listener => { ingestProgress = listener; return unsubscribeIngest })
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex.mockResolvedValue({ success: true })
    api.getIngestPlan.mockResolvedValue({ success: true, sources: [{ rel: 'kb_source/a.md' }], providerReady: true })
    let finish
    api.runIngest.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await store.runSync()
    const run = store.confirmIngest()
    store.dispose()
    expect(unsubscribeIngest).not.toHaveBeenCalled()
    store.ensureIngestListener()
    store.ensureIngestListener()
    expect(api.onIngestProgress).toHaveBeenCalledOnce()
    const { requestId } = api.runIngest.mock.calls[0][0]
    ingestProgress({ requestId, index: 0, total: 1, rel: 'kb_source/a.md' })
    expect(store.ingestProgress.total).toBe(1)
    finish({ success: true, done: ['kb_source/a.md'], failed: [], overflow: 0 })
    await run
    store.dispose()
    expect(unsubscribeIngest).toHaveBeenCalledOnce()
    store.ensureIngestListener()
    expect(api.onIngestProgress).toHaveBeenCalledTimes(2)
  })

  it('does not surface background source-state failures and clears its own read error on success', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.getSourceStates.mockResolvedValueOnce({ success: false, error: 'boom' })
    await store.refreshSourceStates()
    expect(store.error).toBe('')
    expect(store.errorKey).toBe('')

    api.getSyncStatus.mockResolvedValueOnce({ success: false, error: 'status down' })
    await store.refreshStatus()
    expect(store.error).toBe('status down')
    await store.refreshStatus()
    expect(store.error).toBe('')

    api.updateIndex.mockResolvedValueOnce({ success: false, error: 'index broke' })
    await store.updateIndex()
    await store.refreshStatus()
    expect(store.error).toBe('index broke')
  })

  it('ignores a second sync while one is preparing', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    let finish
    api.updateIndex.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const first = store.runSync()
    await store.runSync()
    expect(api.updateIndex).toHaveBeenCalledOnce()
    finish({ success: false, error: 'x' })
    await first
    expect(store.syncPreparing).toBe(false)
  })

  it('clears the nothing-to-organize notice when pending sources appear', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex.mockResolvedValue({ success: true, stats: {} })
    api.getIngestPlan.mockResolvedValue({ success: true, sources: [], providerReady: true })
    await store.runSync()
    expect(store.ingestNothing).toBe(true)
    api.getSyncStatus.mockResolvedValueOnce({ ingestAvailable: true, pending: { new: 1, updated: 0 } })
    await store.refreshStatus()
    expect(store.ingestNothing).toBe(false)
  })

  it('drops ingest results that arrive after the root changed', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex.mockResolvedValue({ success: true })
    api.getIngestPlan.mockResolvedValue({ success: true, sources: [{ rel: 'kb_source/a.md' }], providerReady: true })
    let finish
    api.runIngest.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await store.runSync()
    const run = store.confirmIngest()
    store.setRoot('/b')
    finish({ success: true, done: ['kb_source/a.md'], failed: [], overflow: 0 })
    await run
    expect(store.ingestResult).toBeNull()
    expect(store.ingesting).toBe(false)
    expect(api.getWikiPages).not.toHaveBeenCalled()
  })

  describe('syncPercent', () => {
    async function startIngest(store, count = 3) {
      store.setRoot('/a')
      api.updateIndex.mockResolvedValue({ success: true })
      const sources = Array.from({ length: count }, (_, i) => ({ rel: `kb_source/${i}.md` }))
      api.getIngestPlan.mockResolvedValue({ success: true, sources, providerReady: true })
      let finish
      api.runIngest.mockImplementation(() => new Promise(resolve => { finish = resolve }))
      await store.runSync()
      const run = store.confirmIngest()
      const { requestId } = api.runIngest.mock.calls.at(-1)[0]
      const send = event => ingestProgress({ requestId, total: count, ...event })
      return { run, send, finish: result => finish(result) }
    }

    it('follows index progress in the index phase', async () => {
      const store = useAiDocStore()
      store.setRoot('/a')
      expect(store.syncPercent).toBe(0)
      api.updateIndex.mockResolvedValue({ success: true })
      const update = store.updateIndex()
      const { requestId } = api.updateIndex.mock.calls[0][0]
      progress({ requestId, done: 0, total: 0 })
      expect(store.syncPercent).toBe(0)
      progress({ requestId, done: 1, total: 3 })
      expect(store.syncPercent).toBe(33)
      progress({ requestId, done: 1, total: 4 })
      expect(store.syncPercent).toBe(33)
      progress({ requestId, done: 3, total: 4 })
      expect(store.syncPercent).toBe(75)
      await update
      expect(store.syncPercent).toBe(0)
    })

    it('estimates ingest progress from finished sources and in-flight actions', async () => {
      const store = useAiDocStore()
      const { run, send, finish } = await startIngest(store)
      expect(store.syncPercent).toBe(0)
      send({ index: 0, rel: 'a', status: 'start' })
      send({ index: 0, rel: 'a', status: 'done' })
      expect(store.syncPercent).toBe(33)
      send({ index: 1, rel: 'b', status: 'start' })
      for (let i = 0; i < 4; i++) send({ index: 1, rel: 'b', status: 'start', type: 'action', action: 'read_wiki' })
      // (1 + 4 / (4 + 4)) / 3 = 50%
      expect(store.syncPercent).toBe(50)
      for (let i = 0; i < 200; i++) send({ index: 1, rel: 'b', status: 'start', type: 'action', action: 'edit_wiki' })
      // The in-flight fraction is capped at 0.9: (1 + 0.9) / 3 = 63%
      expect(store.syncPercent).toBe(63)
      send({ index: 1, rel: 'b', status: 'failed' })
      send({ index: 2, rel: 'c', status: 'start' })
      // A fresh source never moves the value backwards.
      expect(store.syncPercent).toBe(66)
      send({ index: 2, rel: 'c', status: 'done' })
      expect(store.syncPercent).toBe(99)
      finish({ success: true, done: ['a', 'c'], failed: [{ rel: 'b', reason: 'agent_error' }], overflow: 0 })
      await run
      expect(store.syncPercent).toBe(100)
    })

    it('keeps the last percent for stopped, aborted or partial runs and shows 100 for complete ones', async () => {
      const store = useAiDocStore()
      const { send, finish, run } = await startIngest(store, 3)
      send({ index: 0, rel: 'a', status: 'done' })
      finish({ success: true, done: ['a'], failed: [], stopped: true, overflow: 0 })
      await run
      expect(store.ingestResult.remaining).toBe(2)
      expect(store.syncPercent).toBe(33)

      store.setRoot('/b')
      const aborted = await startIngest(store, 5)
      for (let i = 0; i < 3; i++) {
        aborted.send({ index: i, rel: 'x', status: 'start' })
        aborted.send({ index: i, rel: 'x', status: 'failed' })
      }
      aborted.finish({ success: true, done: [], failed: [{}, {}, {}], stopped: false, aborted: 'consecutive_agent_errors', overflow: 0 })
      await aborted.run
      expect(store.syncPercent).toBe(60)

      store.setRoot('/c')
      const failedOnly = await startIngest(store, 2)
      failedOnly.finish({ success: true, done: [], failed: [{}, {}], stopped: false, overflow: 0 })
      await failedOnly.run
      expect(store.ingestResult.remaining).toBe(0)
      expect(store.syncPercent).toBe(100)

      store.setRoot('/d')
      const clean = await startIngest(store, 1)
      clean.finish({ success: true, done: ['a'], failed: [], stopped: false, overflow: 0 })
      await clean.run
      expect(store.syncPercent).toBe(100)
    })

    it('never decreases when a new source starts with fewer actions', async () => {
      const store = useAiDocStore()
      const { send } = await startIngest(store, 2)
      send({ index: 0, rel: 'a', status: 'start' })
      for (let i = 0; i < 36; i++) send({ index: 0, rel: 'a', status: 'start', type: 'action', action: 'x' })
      const before = store.syncPercent
      expect(before).toBe(45)
      send({ index: 0, rel: 'a', status: 'stopped' })
      send({ index: 0, rel: 'a', status: 'start' })
      expect(store.syncPercent).toBe(before)
    })

    it('resets when the root changes', async () => {
      const store = useAiDocStore()
      const { send } = await startIngest(store)
      send({ index: 0, rel: 'a', status: 'done' })
      expect(store.syncPercent).toBe(33)
      store.setRoot('/b')
      expect(store.syncPercent).toBe(0)
    })
  })
})
