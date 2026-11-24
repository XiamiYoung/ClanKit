'use strict'

const path = require('node:path')
const { resolveAiDocRoot, classifyAiDocPath, ensureAiDocLayout } = require('../lib/aidocLayout')
const { rootHash, cachePathFor, loadCache, saveCache, scanKnowledgeFiles, updateIndex } = require('../lib/aidocIndex')
const { readIngestedSources, buildGraph, assignGroupColors } = require('../lib/aidocGraph')
const { computeSyncStatus } = require('../lib/aidocSyncStatus')
const { resolveLink } = require('../lib/aidocLinkResolver')
const { createCoalescingRunner } = require('../lib/aidocQueue')

function registerHandlers(ipcMain, ds) {
  const running = new Map()
  let serial = Promise.resolve()

  function enqueue(task) {
    const queued = serial.then(task)
    serial = queued.catch(() => {})
    return queued
  }

  function handle(channel, handler) {
    ipcMain.handle(`aidoc:${channel}`, async (event, options = {}) => {
      try {
        const { DATA_DIR: dataDir, CONFIG_FILE } = ds.paths()
        const config = await ds.readJSONAsync(CONFIG_FILE, {})
        const configuredRoot = resolveAiDocRoot({ ...config, dataPath: dataDir })
        if (!configuredRoot) return { success: false, code: 'rootUnavailable' }
        const root = path.resolve(configuredRoot)
        if (typeof options.root === 'string' && options.root && rootHash(options.root) !== rootHash(root)) {
          return { success: false, code: 'rootChanged' }
        }
        const result = await handler({ root, dataDir, cacheFile: cachePathFor(dataDir, root), options, event })
        return { success: true, root: configuredRoot, ...result }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })
  }

  handle('index-update', async ({ root, cacheFile, options, event }) => {
    let entry = running.get(cacheFile)
    if (!entry) {
      entry = {
        requests: 0,
        run: createCoalescingRunner(({ full }) => enqueue(async () => {
          ensureAiDocLayout(root)
          const cache = await loadCache(cacheFile)
          const result = await updateIndex({
            root, cache, full,
            onProgress: ({ done, total }) => {
              for (const [sender, requests] of entry.senders) {
                if (sender.isDestroyed()) continue
                for (const requestId of requests) {
                  sender.send('aidoc:index-progress', { root, requestId, done, total })
                }
              }
            },
          })
          await saveCache(cacheFile, result.cache)
          return result.stats
        })),
        senders: new Map(),
      }
      running.set(cacheFile, entry)
    }

    const sender = event.sender
    const requests = entry.senders.get(sender) || new Set()
    requests.add(options.requestId)
    entry.senders.set(sender, requests)
    entry.requests++
    try {
      const stats = await entry.run({ full: options.full === true })
      return { stats }
    } finally {
      requests.delete(options.requestId)
      if (!requests.size) entry.senders.delete(sender)
      if (--entry.requests === 0) running.delete(cacheFile)
    }
  })

  handle('graph-data', async ({ root, dataDir, cacheFile }) => {
    const [cache, ingested] = await Promise.all([loadCache(cacheFile), readIngestedSources(dataDir, root)])
    const files = Object.entries(cache.files).map(([rel, record]) => ({
      ...record, rel, abs: path.join(root, rel),
    }))
    const graph = buildGraph({ files, ingested })
    return { ...graph, colors: assignGroupColors(graph.groups), hasIndex: files.length > 0 }
  })

  handle('sync-status', async ({ root, dataDir, cacheFile }) => {
    const [scanned, cache, ingested] = await Promise.all([
      scanKnowledgeFiles(root), loadCache(cacheFile), readIngestedSources(dataDir, root),
    ])
    return { ...computeSyncStatus({ scanned, cache, ingested }), ingestAvailable: false }
  })

  handle('resolve-link', async ({ root, options }) => {
    const { fromPath, target } = options
    if (typeof fromPath !== 'string' || typeof target !== 'string') return { kind: 'outside' }
    const area = classifyAiDocPath(root, fromPath)
    if (area !== 'wiki' && area !== 'kb_source') return { kind: 'outside' }

    const fromRel = path.relative(root, fromPath).split(path.sep).join('/')
    const scanned = await scanKnowledgeFiles(root)
    const result = resolveLink(fromRel, target, scanned.map(file => file.rel))
    if (result.kind === 'resolved') {
      return { ...result, path: path.join(root, result.rel), name: path.basename(result.rel) }
    }
    return result
  })
}

function register() {
  registerHandlers(require('electron').ipcMain, require('../lib/dataStore'))
}

module.exports = { register, registerHandlers }
