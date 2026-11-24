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
      getIngestStatus: vi.fn(async () => ({ success: true, running: false })),
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

  it('preselects the planned model, keeps an in-session choice and passes it to the run', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    const plan = {
      success: true, sources: [{ rel: 'kb_source/a.md' }], providerReady: true,
      providers: [{ id: 'p1', name: 'P1', models: ['m1', 'm2'] }, { id: 'p2', name: 'P2', models: ['n1'] }],
      selected: { providerId: 'p1', model: 'm1' },
    }
    api.updateIndex.mockResolvedValue({ success: true })
    api.getIngestPlan.mockResolvedValue(plan)
    await store.runSync()
    expect(store.ingestModel).toEqual({ providerId: 'p1', model: 'm1' })
    store.ingestModel = { providerId: 'p2', model: 'custom-id' }
    await store.runSync()
    expect(store.ingestModel).toEqual({ providerId: 'p2', model: 'custom-id' })
    api.runIngest.mockResolvedValue({ success: true, done: [], failed: [], overflow: 0 })
    await store.confirmIngest()
    expect(api.runIngest.mock.calls[0][0]).toMatchObject({ providerId: 'p2', model: 'custom-id' })
    store.setRoot('/b')
    expect(store.ingestModel).toEqual({ providerId: 'p2', model: 'custom-id' })
  })

  it('maps an invalid_model response to a translation key', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex.mockResolvedValue({ success: true })
    api.getIngestPlan.mockResolvedValue({ success: true, sources: [{ rel: 'kb_source/a.md' }], providerReady: true })
    api.runIngest.mockResolvedValue({ success: false, code: 'invalid_model' })
    await store.runSync()
    await store.confirmIngest()
    expect(store.ingestErrorKey).toBe('aidoc.ingestInvalidModel')
  })

  it('treats a backend busy response as a no-error state and follows the active run', async () => {
    const store = useAiDocStore()
    store.setRoot('/a')
    api.updateIndex.mockResolvedValue({ success: true })
    api.getIngestPlan.mockResolvedValue({ success: true, sources: [{ rel: 'kb_source/a.md' }], providerReady: true })
    api.runIngest.mockResolvedValue({ success: false, code: 'busy' })
    api.getIngestStatus.mockResolvedValue({ success: true, running: false })
    await store.runSync()
    await store.confirmIngest()
    expect(store.ingestErrorKey).toBe('')
    expect(store.ingestError).toBe('')
    expect(store.ingesting).toBe(false)
    expect(store.ingestDialogVisible).toBe(false)
    expect(api.getIngestStatus).toHaveBeenCalled()
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

  describe('background sync', () => {
    const rel = 'kb_source/a.md'
    async function planned(store, root = '/a') {
      store.setRoot(root)
      api.updateIndex.mockResolvedValue({ success: true })
      api.getIngestPlan.mockResolvedValue({ success: true, sources: [{ rel }], providerReady: true })
      await store.runSync()
    }
    const never = () => new Promise(() => {})

    it('closes the dialog at once, keeps running, and ignores a second start', async () => {
      const store = useAiDocStore()
      await planned(store)
      expect(store.ingestDialogVisible).toBe(true)
      let finish
      api.runIngest.mockImplementation(() => new Promise(resolve => { finish = resolve }))
      const run = store.confirmIngest()
      expect(store.ingestDialogVisible).toBe(false)
      expect(store.ingesting).toBe(true)
      await store.confirmIngest()
      await store.runSync()
      expect(api.runIngest).toHaveBeenCalledOnce()
      expect(api.getIngestPlan).toHaveBeenCalledOnce()
      finish({ success: true, done: [rel], failed: [], overflow: 0 })
      await run
      expect(store.ingesting).toBe(false)
      expect(store.ingestResult).toMatchObject({ remaining: 0 })
      expect(store.ingestDialogVisible).toBe(false)
      store.openIngestResult()
      expect(store.ingestDialogVisible).toBe(true)
      store.cancelIngestPlan()
      expect(store.ingestDialogVisible).toBe(false)
      expect(store.ingestResult).toBeNull()
    })

    it('does not open the result view while a run is active', async () => {
      const store = useAiDocStore()
      await planned(store)
      api.runIngest.mockImplementation(never)
      void store.confirmIngest()
      store.openIngestResult()
      expect(store.ingestDialogVisible).toBe(false)
    })

    it('brings the dialog back when starting fails with a real error', async () => {
      const store = useAiDocStore()
      await planned(store)
      api.runIngest.mockResolvedValue({ success: false, code: 'providerMissing' })
      await store.confirmIngest()
      expect(store.ingestDialogVisible).toBe(true)
      expect(store.ingestPlan).not.toBeNull()
      expect(store.ingestErrorKey).toBe('aidoc.providerMissing')
    })

    it('restores a running state from the main-process snapshot and stops it', async () => {
      const store = useAiDocStore()
      api.getIngestStatus.mockResolvedValue({ success: true, running: true, requestId: 'r1', index: 1, total: 4, rel, status: 'start' })
      store.setRoot('/a')
      await store.restoreIngestStatus()
      expect(api.getIngestStatus).toHaveBeenCalledWith({ root: '/a' })
      expect(store.ingesting).toBe(true)
      expect(store.ingestProgress).toMatchObject({ index: 1, total: 4, rel })
      expect(store.syncPercent).toBeGreaterThanOrEqual(25)
      expect(store.ingestDialogVisible).toBe(false)
      await store.runSync()
      expect(api.getIngestPlan).not.toHaveBeenCalled()
      await store.stopIngest()
      expect(api.stopIngest).toHaveBeenCalledWith({ root: '/a' })
      expect(store.ingestStopping).toBe(true)
    })

    it('stays idle when the snapshot reports no active run', async () => {
      const store = useAiDocStore()
      store.setRoot('/a')
      await store.restoreIngestStatus()
      expect(store.ingesting).toBe(false)
    })

    it('completes a restored run from the complete event exactly once', async () => {
      const store = useAiDocStore()
      api.getIngestStatus.mockResolvedValue({ success: true, running: true, requestId: 'r1', index: 0, total: 1, rel, status: 'start' })
      store.setRoot('/a')
      await store.restoreIngestStatus()
      const event = {
        requestId: 'r1', type: 'complete',
        summary: { done: [{ rel }], failed: [], stopped: false, remaining: 0, warnings: [] },
      }
      ingestProgress(event)
      ingestProgress(event)
      await vi.waitFor(() => expect(store.ingesting).toBe(false))
      expect(store.ingestResult).toMatchObject({ remaining: 0 })
      expect(store.ingestResult.done).toHaveLength(1)
      expect(store.syncPercent).toBe(100)
      expect(api.getGraph).toHaveBeenCalledTimes(1)
      expect(store.ingestStopping).toBe(false)
    })

    it('ignores the complete event for a run that has its own invoke promise', async () => {
      const store = useAiDocStore()
      await planned(store)
      let finish
      api.runIngest.mockImplementation(() => new Promise(resolve => { finish = resolve }))
      const run = store.confirmIngest()
      const { requestId } = api.runIngest.mock.calls[0][0]
      ingestProgress({ requestId, type: 'complete', summary: { done: [], failed: [], remaining: 0 } })
      expect(store.ingestResult).toBeNull()
      expect(store.ingesting).toBe(true)
      finish({ success: true, done: [rel], failed: [], overflow: 0 })
      await run
      expect(store.ingestResult.done).toEqual([rel])
      expect(api.getGraph).toHaveBeenCalledTimes(2)
    })

    it('reports a failed restored run as an error instead of a result', async () => {
      const store = useAiDocStore()
      api.getIngestStatus.mockResolvedValue({ success: true, running: true, requestId: 'r1' })
      store.setRoot('/a')
      await store.restoreIngestStatus()
      ingestProgress({ requestId: 'r1', type: 'complete', error: true })
      await vi.waitFor(() => expect(store.ingesting).toBe(false))
      expect(store.ingestResult).toBeNull()
      expect(store.ingestErrorKey).toBe('aidoc.requestFailed')
    })

    it('isolates a running state per root', async () => {
      const store = useAiDocStore()
      api.getIngestStatus.mockResolvedValue({ success: true, running: true, requestId: 'r1', index: 0, total: 1, rel, status: 'start' })
      store.setRoot('/a')
      await store.restoreIngestStatus()
      expect(store.ingesting).toBe(true)
      api.getIngestStatus.mockResolvedValue({ success: false, code: 'rootChanged' })
      store.setRoot('/b')
      expect(store.ingesting).toBe(false)
      await vi.waitFor(() => expect(api.getIngestStatus).toHaveBeenLastCalledWith({ root: '/b' }))
      ingestProgress({ requestId: 'r1', type: 'complete', summary: { done: [], failed: [] } })
      expect(store.ingestResult).toBeNull()
    })
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
      aborted.finish({ success: true, done: [], failed: [{ rel: 'a' }, { rel: 'b' }, { rel: 'c' }], stopped: false, aborted: 'consecutive_agent_errors', overflow: 0 })
      await aborted.run
      expect(store.syncPercent).toBe(60)

      store.setRoot('/c')
      const failedOnly = await startIngest(store, 2)
      failedOnly.finish({ success: true, done: [], failed: [{ rel: 'a' }, { rel: 'b' }], stopped: false, overflow: 0 })
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
  describe('wiki languages', () => {
    const languages = selected => ({ available: ['en', 'zh'], selected })
    const planOf = (sources, selected = ['en'], extra = {}) => ({
      success: true, sources, providerReady: true, overflow: 0, removed: [], languages: languages(selected), ...extra,
    })
    const note = rel => ({ rel, size: 1, state: 'new', langs: ['en'] })

    async function openPlan(store, plan, options) {
      store.setRoot('/a')
      api.updateIndex.mockResolvedValue({ success: true })
      api.getIngestPlan.mockResolvedValue(plan)
      await store.runSync(options)
    }

    it('adopts the selection of the plan and remembers the requested sources for later plans', async () => {
      const store = useAiDocStore()
      await openPlan(store, planOf([note('kb_source/a.md')], ['zh']), { rels: ['kb_source/a.md'], force: true })
      expect(store.ingestLanguages).toEqual(['zh'])
      expect(store.ingestPlan).toMatchObject({ rels: ['kb_source/a.md'], force: true })
    })

    it('re-requests the plan for a changed selection and replaces the sources', async () => {
      const store = useAiDocStore()
      await openPlan(store, planOf([note('kb_source/a.md')]), { rels: ['kb_source/a.md'], force: true })
      api.getIngestPlan.mockResolvedValue(planOf([note('kb_source/a.md'), note('kb_source/b.md')], ['en', 'zh'], { overflow: 3 }))
      const change = store.setIngestLanguages(['zh', 'en'])
      expect(store.ingestLanguages).toEqual(['en', 'zh'])
      expect(store.ingestPlanLoading).toBe(true)
      await change
      expect(api.getIngestPlan).toHaveBeenLastCalledWith({ root: '/a', rels: ['kb_source/a.md'], force: true, languages: ['en', 'zh'] })
      expect(store.ingestPlanLoading).toBe(false)
      expect(store.ingestPlan.sources.map(source => source.rel)).toEqual(['kb_source/a.md', 'kb_source/b.md'])
      expect(store.ingestPlan).toMatchObject({ overflow: 3, languages: languages(['en', 'zh']), providerReady: true })
    })

    it('keeps at least one language and ignores unknown ones', async () => {
      const store = useAiDocStore()
      await openPlan(store, planOf([note('kb_source/a.md')]))
      api.getIngestPlan.mockClear()
      await store.setIngestLanguages([])
      await store.setIngestLanguages(['fr'])
      expect(store.ingestLanguages).toEqual(['en'])
      expect(api.getIngestPlan).not.toHaveBeenCalled()
    })

    it('ignores a stale plan response when the selection changed again', async () => {
      const store = useAiDocStore()
      await openPlan(store, planOf([note('kb_source/a.md')]))
      let releaseFirst
      api.getIngestPlan
        .mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve }))
        .mockResolvedValueOnce(planOf([note('kb_source/zh.md')], ['zh']))
      const first = store.setIngestLanguages(['en', 'zh'])
      await store.setIngestLanguages(['zh'])
      releaseFirst(planOf([note('kb_source/both.md')], ['en', 'zh']))
      await first
      expect(store.ingestLanguages).toEqual(['zh'])
      expect(store.ingestPlan.sources.map(source => source.rel)).toEqual(['kb_source/zh.md'])
      expect(store.ingestPlanLoading).toBe(false)
    })

    it('opens the dialog for an empty plan only when another language still has work', async () => {
      const store = useAiDocStore()
      await openPlan(store, planOf([], ['en'], { languages: { available: ['en', 'zh'], selected: ['en'], otherWork: false } }))
      expect(store.ingestDialogVisible).toBe(false)
      expect(store.ingestNothing).toBe(true)
      store.setRoot('/b')
      await openPlan(store, planOf([], ['en'], { languages: { available: ['en', 'zh'], selected: ['en'], otherWork: true } }))
      expect(store.ingestDialogVisible).toBe(true)
      expect(store.ingestNothing).toBe(false)
      expect(store.ingestLanguages).toEqual(['en'])
    })

    it('shows a failed plan request as an error and keeps the previous plan', async () => {
      const store = useAiDocStore()
      await openPlan(store, planOf([note('kb_source/a.md')]))
      api.getIngestPlan.mockResolvedValue({ success: false, code: 'invalid_language' })
      await store.setIngestLanguages(['en', 'zh'])
      expect(store.ingestErrorKey).toBe('aidoc.ingestInvalidLanguage')
      expect(store.ingestPlan.sources.map(source => source.rel)).toEqual(['kb_source/a.md'])
      expect(store.ingestPlanLoading).toBe(false)
    })

    it('sends the selected languages with the run and refuses to start with none or while loading', async () => {
      const store = useAiDocStore()
      await openPlan(store, planOf([note('kb_source/a.md')]))
      await store.setIngestLanguages(['en', 'zh'])
      api.runIngest.mockResolvedValue({ success: true, done: ['kb_source/a.md'], failed: [], overflow: 0 })

      store.ingestLanguages = []
      await store.confirmIngest()
      expect(api.runIngest).not.toHaveBeenCalled()

      store.ingestLanguages = ['en', 'zh']
      store.ingestPlanLoading = true
      await store.confirmIngest()
      expect(api.runIngest).not.toHaveBeenCalled()

      store.ingestPlanLoading = false
      await store.confirmIngest()
      expect(api.runIngest).toHaveBeenCalledWith(expect.objectContaining({
        root: '/a', rels: ['kb_source/a.md'], force: false, languages: ['en', 'zh'],
      }))
    })

    it('counts a source that failed in several languages once and keeps partial sources as remaining', async () => {
      const store = useAiDocStore()
      await openPlan(store, planOf([note('kb_source/a.md'), note('kb_source/b.md'), note('kb_source/c.md')], ['en', 'zh']))
      api.runIngest.mockResolvedValue({
        success: true, done: ['kb_source/a.md'],
        failed: [
          { rel: 'kb_source/b.md', lang: 'en', reason: 'read_failed' },
          { rel: 'kb_source/b.md', lang: 'zh', reason: 'read_failed' },
          { rel: 'kb_source/c.md', lang: 'zh', reason: 'agent_error' },
        ],
        stopped: false, overflow: 0,
      })
      await store.confirmIngest()
      expect(store.ingestResult.remaining).toBe(0)
      expect(store.ingestResult.failed).toHaveLength(3)
    })

    it('measures progress in units of source and language', async () => {
      const store = useAiDocStore()
      await openPlan(store, planOf([note('kb_source/a.md'), note('kb_source/b.md')], ['en', 'zh']))
      let finish
      api.runIngest.mockImplementation(() => new Promise(resolve => { finish = resolve }))
      const run = store.confirmIngest()
      const { requestId } = api.runIngest.mock.calls.at(-1)[0]
      const send = event => ingestProgress({ requestId, total: 4, ...event })
      send({ index: 0, rel: 'a', lang: 'en', status: 'start' })
      send({ index: 0, rel: 'a', lang: 'en', status: 'done' })
      expect(store.syncPercent).toBe(25)
      send({ index: 1, rel: 'a', lang: 'zh', status: 'start' })
      send({ index: 1, rel: 'a', lang: 'zh', status: 'done' })
      expect(store.syncPercent).toBe(50)
      send({ index: 2, rel: 'b', lang: 'en', status: 'failed' })
      expect(store.syncPercent).toBe(75)
      finish({ success: true, done: ['a'], failed: [{ rel: 'b', lang: 'en', reason: 'agent_error' }], overflow: 0 })
      await run
    })

    it('restores the unit progress of a run that is already active', async () => {
      const store = useAiDocStore()
      api.getIngestStatus.mockResolvedValue({ success: true, running: true, requestId: 'bg', index: 1, total: 4, rel: 'kb_source/a.md', lang: 'zh', status: 'start' })
      store.setRoot('/a')
      await vi.waitFor(() => expect(store.ingesting).toBe(true))
      expect(store.ingestProgress).toMatchObject({ index: 1, total: 4, lang: 'zh' })
      expect(store.syncPercent).toBe(25)
    })
  })

})
