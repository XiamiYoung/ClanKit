import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { registerHandlers } = require('../aidoc')
const { cachePathFor } = require('../../lib/aidocIndex')

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

async function ingestFixture(runAgent, config = configuredProvider()) {
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
  }, { runAgent })
  const sender = { send: vi.fn(), isDestroyed: () => false }
  const invoke = (channel, options = {}, owner = sender) => handlers.get('aidoc:' + channel)({ sender: owner }, { root, ...options })
  return { root, source, sender, invoke }
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
