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
    await expect(invoke('sync-status')).resolves.toMatchObject({ indexStale: true, staleCount: 2, ingestAvailable: false })

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
