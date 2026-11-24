import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { registerHandlers } = require('../aidoc')
const { cachePathFor } = require('../../lib/aidocIndex')
const { registryPathFor } = require('../../lib/aidocRegistry')

const dirs = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

describe('AI Doc IPC', () => {
  it('indexes a vault, reports sync and progress, resolves fresh links, and rejects requests for the previous vault', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-ipc-'))
    dirs.push(dataDir)
    const root = path.join(dataDir, 'vault')
    const configFile = path.join(dataDir, 'config.json')
    const fromPath = path.join(root, 'wiki', 'index.md')
    await fs.mkdir(path.dirname(fromPath), { recursive: true })
    await fs.writeFile(fromPath, '# Index\n\n[[Page]]\n')
    const pagePath = path.join(root, 'wiki', 'Page.md')
    await fs.writeFile(pagePath, '# Page\n')

    const handlers = new Map()
    registerHandlers({ handle: (key, handler) => handlers.set(key, handler) }, {
      paths: () => ({ DATA_DIR: dataDir, CONFIG_FILE: configFile }),
      readJSONAsync: async file => JSON.parse(await fs.readFile(file, 'utf8')),
    })
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const invoke = (channel, options = {}) => handlers.get('aidoc:' + channel)({ sender }, { root, ...options })

    await fs.writeFile(configFile, JSON.stringify({ DoCPath: root }))
    await expect(invoke('graph-data')).resolves.toMatchObject({ success: true, hasIndex: false, nodes: [] })
    await expect(invoke('sync-status')).resolves.toMatchObject({ indexStale: true, staleCount: 2, ingestAvailable: true })

    await expect(invoke('index-update', { requestId: 'test-update' })).resolves.toMatchObject({
      success: true, stats: { total: 2, parsed: 2, errors: 0 },
    })
    expect(sender.send).toHaveBeenCalledWith('aidoc:index-progress', {
      root, requestId: 'test-update', done: 2, total: 2,
    })
    const cache = JSON.parse(await fs.readFile(cachePathFor(dataDir, root), 'utf8'))
    expect(cache.files['wiki/index.md'].links).toEqual(['Page'])
    await expect(invoke('graph-data')).resolves.toMatchObject({
      success: true, hasIndex: true,
      links: [{ source: 'wiki/index.md', target: 'wiki/Page.md' }],
      nodes: expect.arrayContaining([expect.objectContaining({ id: 'wiki/Page.md', path: pagePath })]),
    })
    await expect(invoke('sync-status')).resolves.toMatchObject({ indexStale: false, staleCount: 0 })

    const freshPath = path.join(root, 'wiki', 'Fresh.md')
    await fs.writeFile(freshPath, '# Fresh\n')
    await expect(invoke('sync-status')).resolves.toMatchObject({ indexStale: true, staleCount: 1 })
    await expect(invoke('resolve-link', { fromPath, target: 'wiki/fresh' })).resolves.toMatchObject({
      success: true, kind: 'resolved', path: freshPath, name: 'Fresh.md',
    })
    const graph = await invoke('graph-data')
    expect(graph.nodes.map(node => node.id)).not.toContain('wiki/Fresh.md')

    const nextRoot = path.join(dataDir, 'next-vault')
    await fs.writeFile(configFile, JSON.stringify({ DoCPath: nextRoot }))
    await expect(invoke('index-update')).resolves.toEqual({ success: false, code: 'rootChanged' })
    await expect(fs.access(nextRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(invoke('graph-data', { root: nextRoot })).resolves.toMatchObject({ success: true, nodes: [] })
  })
})


function configuredProvider() {
  return { defaultProvider: 'my-provider', providers: [
    { id: 'other', type: 'custom', apiKey: 'other-key', baseURL: 'https://other.example.test', model: 'wrong-model' },
    { id: 'my-provider', type: 'custom', apiKey: 'test-key', baseURL: 'https://provider.example.test', model: 'main-model', toolModel: 'utility-model' },
  ] }
}

async function ingestFixture(runAgent, config = configuredProvider(), extraDs = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-ingest-ipc-'))
  dirs.push(dataDir)
  const root = path.join(dataDir, 'vault')
  const source = path.join(root, 'kb_source', 'note.md')
  await fs.mkdir(path.dirname(source), { recursive: true })
  await fs.writeFile(source, 'A source for the wiki.')
  const handlers = new Map()
  registerHandlers({ handle: (key, handler) => handlers.set(key, handler) }, {
    paths: () => ({ DATA_DIR: dataDir, CONFIG_FILE: 'config.json' }),
    readJSONAsync: async () => ({ DoCPath: root, ...config }),
    ...extraDs,
  }, { runAgent })
  const sender = { send: vi.fn(), isDestroyed: () => false }
  const invoke = (channel, options = {}, owner = sender) => handlers.get('aidoc:' + channel)({ sender: owner }, { root, ...options })
  return { root, dataDir, source, sender, invoke }
}

it('requires a configured main provider before ingest can write anything', async () => {
  const runAgent = vi.fn()
  const { root, invoke } = await ingestFixture(runAgent, {})
  await expect(invoke('ingest-plan')).resolves.toMatchObject({
    providerReady: false, providerError: 'providerMissing', sources: [{ rel: 'kb_source/note.md', state: 'new' }],
  })
  await expect(invoke('ingest-run')).resolves.toMatchObject({ success: false, code: 'providerMissing' })
  await expect(fs.access(path.join(root, 'wiki'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(runAgent).not.toHaveBeenCalled()
})

it('runs only selected sources with a restricted main model and publishes the new graph', async () => {
  const runAgent = vi.fn(async ({ tool, onAction, loopConfig }) => {
    expect(loopConfig).toMatchObject({ customModel: 'main-model', exclusiveTools: true, aiDocEnabled: false })
    expect(loopConfig.providers.map(provider => provider.id)).toEqual(['my-provider'])
    onAction('write_wiki')
    await tool.execute('write', {
      operation: 'write_wiki', path: 'wiki/note.md',
      content: '---\ntype: summary\ntitle: note\nsources:\n  - kb_source/note.md\nupdated: 2026-11-24\n---\n\nA wiki note.',
    })
  })
  const { root, source, sender, invoke } = await ingestFixture(runAgent)
  await fs.writeFile(path.join(root, 'kb_source', 'untouched.md'), '# Untouched')
  await expect(invoke('ingest-run', { rels: ['wiki/not-a-source.md', 'kb_source/note.md'], requestId: 'first' })).resolves.toMatchObject({
    success: true, done: ['kb_source/note.md'], stopped: false, failed: [],
  })
  expect(sender.send).toHaveBeenCalledWith('aidoc:ingest-progress', expect.objectContaining({
    requestId: 'first', index: 0, rel: 'kb_source/note.md', type: 'action', action: 'write_wiki',
  }))
  await expect(invoke('graph-data')).resolves.toMatchObject({
    hasIndex: true, nodes: expect.arrayContaining([
      expect.objectContaining({ id: 'wiki/note.md' }),
      expect.objectContaining({ id: 'kb_source/note.md' }),
    ]),
  })
  await expect(invoke('source-states')).resolves.toMatchObject({ states: { [source]: 'ingested' } })
  await expect(invoke('wiki-pages')).resolves.toMatchObject({
    pages: expect.arrayContaining([expect.objectContaining({ rel: 'wiki/note.md', type: 'summary' })]),
  })
  await expect(invoke('wiki-page', { rel: 'wiki/note.md' })).resolves.toMatchObject({
    page: { rel: 'wiki/note.md', sources: [{ rel: 'kb_source/note.md', exists: true, path: source }] },
  })
  await expect(invoke('wiki-page', { rel: 'kb_source/note.md' })).resolves.toMatchObject({ success: false })

  await expect(invoke('ingest-plan', { rels: ['kb_source/note.md'] })).resolves.toMatchObject({ sources: [] })
  await expect(invoke('ingest-plan', { rels: ['kb_source/note.md'], force: true })).resolves.toMatchObject({
    sources: [{ rel: 'kb_source/note.md', state: 'ingested' }],
  })
})

it('allows only one run and a stop from the original renderer and root', async () => {
  let release
  let taskEntered
  const entered = new Promise(resolve => { taskEntered = resolve })
  const stop = vi.fn(() => release())
  const runAgent = vi.fn(({ active }) => {
    active.loop = { stop }
    taskEntered()
    return new Promise(resolve => { release = resolve })
  })
  const { invoke } = await ingestFixture(runAgent)
  const work = invoke('ingest-run')
  await entered
  await expect(invoke('ingest-run')).resolves.toMatchObject({ success: false, code: 'busy' })
  await expect(invoke('ingest-stop', {}, { send: vi.fn() })).resolves.toMatchObject({ success: true })
  expect(stop).not.toHaveBeenCalled()
  await expect(invoke('ingest-stop')).resolves.toMatchObject({ success: true })
  await expect(work).resolves.toMatchObject({ success: true, stopped: true, done: [] })
  expect(stop).toHaveBeenCalledOnce()
})

const noteContent = ['---', 'type: summary', 'title: note', 'sources:', '  - kb_source/note.md', 'updated: 2026-11-24', '---', '', 'A wiki note.'].join('\n')
const writeNote = async ({ tool }) => {
  await tool.execute('write', { operation: 'write_wiki', path: 'wiki/note.md', content: noteContent })
}

it('returns registry_unreadable without running the agent when the registry is corrupt', async () => {
  const runAgent = vi.fn()
  const { root, dataDir, invoke } = await ingestFixture(runAgent)
  const registryFile = registryPathFor(dataDir, root)
  await fs.mkdir(path.dirname(registryFile), { recursive: true })
  await fs.writeFile(registryFile, '{ broken')
  await expect(invoke('ingest-plan')).resolves.toMatchObject({ success: false, code: 'registry_unreadable' })
  await expect(invoke('ingest-run')).resolves.toMatchObject({ success: false, code: 'registry_unreadable' })
  expect(runAgent).not.toHaveBeenCalled()
  await expect(fs.access(path.join(root, 'wiki'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await fs.readFile(registryFile, 'utf8')).toBe('{ broken')
  // The busy flag is not left behind: a repaired registry runs normally.
  await fs.rm(registryFile)
  await expect(invoke('ingest-run')).resolves.toMatchObject({ success: true })
})

it('refreshes mtime and size for same-hash files on ingest-plan without listing them', async () => {
  const { root, dataDir, source, invoke } = await ingestFixture(writeNote)
  await expect(invoke('ingest-run')).resolves.toMatchObject({ success: true, done: ['kb_source/note.md'] })
  const registryFile = registryPathFor(dataDir, root)
  const before = JSON.parse(await fs.readFile(registryFile, 'utf8')).sources['kb_source/note.md']
  const later = new Date(Date.now() + 60_000)
  await fs.utimes(source, later, later)
  await expect(invoke('source-states')).resolves.toMatchObject({ states: { [source]: 'updated' } })
  await expect(invoke('ingest-plan')).resolves.toMatchObject({ success: true, sources: [] })
  const after = JSON.parse(await fs.readFile(registryFile, 'utf8')).sources['kb_source/note.md']
  const stat = await fs.stat(source)
  expect(after.mtimeMs).toBe(stat.mtimeMs)
  expect(after.mtimeMs).not.toBe(before.mtimeMs)
  expect(after.size).toBe(stat.size)
  expect(after.hash).toBe(before.hash)
  await expect(invoke('source-states')).resolves.toMatchObject({ states: { [source]: 'ingested' } })
})

it('re-runs an already ingested source only with force, and never a path outside the plan', async () => {
  const runAgent = vi.fn(writeNote)
  const { root, invoke } = await ingestFixture(runAgent)
  await fs.mkdir(path.join(root, 'general'), { recursive: true })
  await fs.writeFile(path.join(root, 'general', 'x.md'), 'private')
  await invoke('ingest-run')
  expect(runAgent).toHaveBeenCalledTimes(1)
  await expect(invoke('ingest-run', { rels: ['kb_source/note.md'] })).resolves.toMatchObject({ success: true, done: [], failed: [] })
  expect(runAgent).toHaveBeenCalledTimes(1)
  await expect(invoke('ingest-run', { rels: ['kb_source/note.md'], force: true })).resolves.toMatchObject({
    success: true, done: ['kb_source/note.md'],
  })
  expect(runAgent).toHaveBeenCalledTimes(2)
  for (const rel of ['kb_source/../general/x.md', 'general/x.md', '../outside.md']) {
    await expect(invoke('ingest-run', { rels: [rel], force: true })).resolves.toMatchObject({ success: true, done: [], failed: [] })
    await expect(invoke('ingest-plan', { rels: [rel], force: true })).resolves.toMatchObject({ success: true, sources: [] })
  }
  expect(runAgent).toHaveBeenCalledTimes(2)
})

it('keeps the ingest result and reports indexError when the reindex fails afterwards', async () => {
  const { root, dataDir, sender, invoke } = await ingestFixture(writeNote)
  const cacheFile = cachePathFor(dataDir, root)
  await fs.mkdir(cacheFile, { recursive: true })
  const result = await invoke('ingest-run', { requestId: 'idx' })
  expect(result).toMatchObject({ success: true, done: ['kb_source/note.md'], failed: [], stopped: false })
  expect(typeof result.indexError).toBe('string')
  expect(sender.send).toHaveBeenCalledWith('aidoc:ingest-progress', expect.objectContaining({ requestId: 'idx', type: 'index-error' }))
})

it('injects cached model max output tokens into the ingest loop config', async () => {
  let seen
  const runAgent = vi.fn(async ({ loopConfig }) => { seen = loopConfig; throw new Error('stop here') })
  const { invoke } = await ingestFixture(runAgent, configuredProvider(), {
    readJSON: () => ({ p: { models: [{ id: 'main-model', max_output_tokens: 4321 }, { id: 'no-limit' }] } }),
  })
  await invoke('ingest-run')
  expect(seen._cachedModelMaxOutputTokens).toEqual({ 'main-model': 4321 })
})

it('stops a running ingest and frees the busy flag when the owning window is destroyed', async () => {
  let release
  let taskEntered
  const entered = new Promise(resolve => { taskEntered = resolve })
  const stop = vi.fn(() => release())
  const runAgent = vi.fn(({ active }) => {
    active.loop = { stop }
    taskEntered()
    return new Promise(resolve => { release = resolve })
  })
  const { invoke } = await ingestFixture(runAgent)
  const listeners = {}
  const owner = {
    isDestroyed: () => false,
    send: vi.fn(),
    once: vi.fn((event, fn) => { listeners[event] = fn }),
    removeListener: vi.fn(),
  }
  const work = invoke('ingest-run', {}, owner)
  await entered
  expect(owner.once).toHaveBeenCalledWith('destroyed', expect.any(Function))
  listeners.destroyed()
  await expect(work).resolves.toMatchObject({ success: true, stopped: true, done: [] })
  expect(stop).toHaveBeenCalledOnce()
  expect(owner.removeListener).toHaveBeenCalledWith('destroyed', listeners.destroyed)
  runAgent.mockImplementation(writeNote)
  await expect(invoke('ingest-run')).resolves.toMatchObject({ success: true, done: ['kb_source/note.md'] })
})

describe('ingest model selection', () => {
  function modelConfig(extra = {}) {
    return {
      defaultProvider: 'qwen',
      utilityModel: { provider: 'qwen', model: 'utility-flash' },
      providers: [
        { id: 'qwen', type: 'qwen', name: 'Qwen', apiKey: 'secret-qwen', baseURL: 'https://qwen.example.test', model: 'stale-max', modelSettings: { 'flash-a': {}, 'stale-max': {} } },
        { id: 'local', type: 'ollama', name: 'Local', baseURL: 'http://local.example.test', model: 'llama' },
        { id: 'nokey', type: 'custom', baseURL: 'https://nokey.example.test', model: 'x' },
      ],
      ...extra,
    }
  }

  // Cache shape on disk: { [providerId]: { type, models: [{ id, ... }], updatedAt } }.
  const modelCache = { qwen: { type: 'qwen', updatedAt: 'now', models: [{ id: 'flash-a' }, { id: 'cached-b' }, {}] } }

  async function modelFixture(runAgent, config = modelConfig(), cache = modelCache) {
    let dataDir
    const writes = []
    let stored = null
    const fixture = await ingestFixture(runAgent, config, {
      paths: () => ({ DATA_DIR: dataDir, CONFIG_FILE: 'config.json', PROVIDER_MODELS_FILE: 'provider-models.json' }),
      readJSONAsync: async file => {
        if (file === 'provider-models.json') return cache
        return { DoCPath: fixture.root, ...config, ...(stored ? { aidocIngestModel: stored } : {}) }
      },
      writeJSONAtomic: async (file, data) => { writes.push({ file, data }); stored = data.aidocIngestModel },
    })
    dataDir = fixture.dataDir
    return { ...fixture, writes }
  }

  it('lists usable providers without secrets and unions their models in stable order', async () => {
    const { invoke } = await modelFixture(vi.fn())
    const plan = await invoke('ingest-plan')
    expect(plan.providers.map(provider => provider.id)).toEqual(['qwen', 'local'])
    expect(plan.providers[0].models).toEqual(['stale-max', 'flash-a', 'cached-b', 'utility-flash'])
    expect(plan.providers[1].models).toEqual(['llama'])
    expect(JSON.stringify(plan)).not.toContain('secret-qwen')
    expect(plan.providers[0]).not.toHaveProperty('apiKey')
    expect(plan.selected).toEqual({ providerId: 'qwen', model: 'stale-max' })
    expect(plan.providerReady).toBe(true)
  })

  it('tolerates a missing or malformed model cache', async () => {
    for (const cache of [{}, null, ['junk'], { qwen: { models: 'nope' } }]) {
      const { invoke } = await modelFixture(vi.fn(), modelConfig(), cache)
      const plan = await invoke('ingest-plan')
      expect(plan.providers[0].models).toEqual(['stale-max', 'flash-a', 'utility-flash'])
    }
  })

  it('prefers the remembered choice and falls back when its provider disappeared', async () => {
    const remembered = await modelFixture(vi.fn(), modelConfig({ aidocIngestModel: { providerId: 'local', model: 'llama3' } }))
    await expect(remembered.invoke('ingest-plan')).resolves.toMatchObject({ selected: { providerId: 'local', model: 'llama3' } })
    const gone = await modelFixture(vi.fn(), modelConfig({ aidocIngestModel: { providerId: 'removed', model: 'm' } }))
    await expect(gone.invoke('ingest-plan')).resolves.toMatchObject({ selected: { providerId: 'qwen', model: 'stale-max' } })
    const unusable = await modelFixture(vi.fn(), modelConfig({ aidocIngestModel: { providerId: 'nokey', model: 'x' } }))
    await expect(unusable.invoke('ingest-plan')).resolves.toMatchObject({ selected: { providerId: 'qwen' } })
  })

  it('runs with the chosen provider and model and remembers the choice', async () => {
    const runAgent = vi.fn(async () => {})
    const { invoke, writes } = await modelFixture(runAgent)
    await expect(invoke('ingest-run', { providerId: 'local', model: '  llama3  ' })).resolves.toMatchObject({ success: true })
    const { loopConfig } = runAgent.mock.calls[0][0]
    expect(loopConfig.customModel).toBe('llama3')
    expect(loopConfig.providers.map(provider => provider.id)).toEqual(['local'])
    expect(loopConfig.provider).toMatchObject({ id: 'local', model: 'llama3' })
    expect(writes).toHaveLength(1)
    expect(writes[0].data.aidocIngestModel).toEqual({ providerId: 'local', model: 'llama3' })
    expect(writes[0].data.providers).toHaveLength(3)
    await expect(invoke('ingest-plan')).resolves.toMatchObject({ selected: { providerId: 'local', model: 'llama3' } })
  })

  it('rejects an invalid provider or model before writing anything', async () => {
    const runAgent = vi.fn()
    const { root, invoke, writes } = await modelFixture(runAgent)
    for (const choice of [
      { providerId: 'missing', model: 'm' }, { providerId: 'nokey', model: 'x' },
      { providerId: 'qwen', model: '   ' }, { providerId: 'qwen', model: 'm'.repeat(201) },
      { providerId: 'qwen', model: 42 }, { providerId: 'qwen' },
    ]) {
      await expect(invoke('ingest-run', choice)).resolves.toMatchObject({ success: false, code: 'invalid_model' })
    }
    expect(writes).toEqual([])
    expect(runAgent).not.toHaveBeenCalled()
    await expect(fs.access(path.join(root, 'wiki'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
