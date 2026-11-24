'use strict'

const fs = require('fs/promises')
const { readFileSync, statSync } = require('fs')
const path = require('path')
const { randomUUID } = require('node:crypto')
const { rootHash } = require('./aidocIndex')
const { INGESTIBLE_EXTS } = require('./aidocSourceText')

const VERSION = 1
const KB_SOURCE_PREFIX = 'kb_source/'
const pendingUpdates = new Map()
const syncRegistryCache = new Map()

const emptyRegistry = () => ({ version: VERSION, sources: {}, pages: {} })
const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

function registryPathFor(dataDir, root) {
  return path.join(dataDir, 'aidoc-ingest', rootHash(root) + '.json')
}

function validRecords(map, isValid) {
  if (!isPlainObject(map)) return {}
  return Object.fromEntries(Object.entries(map).filter(([, record]) => isPlainObject(record) && isValid(record)))
}

function parseRegistry(text) {
  const parsed = JSON.parse(text)
  // Plan-2 registry files carry no version field; treat a missing version as v1.
  if (!isPlainObject(parsed) || (parsed.version !== undefined && parsed.version !== VERSION)) {
    throw new Error('Invalid ingest registry version')
  }
  return {
    version: VERSION,
    sources: validRecords(parsed.sources, record =>
      typeof record.hash === 'string' && typeof record.ingestedAt === 'string' && Array.isArray(record.pages)),
    pages: validRecords(parsed.pages, record => typeof record.hash === 'string')
  }
}

async function readRegistry(file) {
  try {
    return parseRegistry(await fs.readFile(file, 'utf8'))
  } catch {
    return emptyRegistry()
  }
}

function readRegistrySync(file) {
  let key
  try {
    key = registryFileKey(file)
    const { mtimeMs, ctimeMs, dev, ino, size } = statSync(file)
    // Atomic replacements can preserve the old modification time.
    const signature = `${mtimeMs}:${ctimeMs}:${dev}:${ino}:${size}`
    const cached = syncRegistryCache.get(key)
    if (cached?.signature === signature) return cached.registry

    const registry = parseRegistry(readFileSync(file, 'utf8'))
    syncRegistryCache.set(key, { signature, registry })
    return registry
  } catch {
    syncRegistryCache.delete(key)
    return emptyRegistry()
  }
}

async function readRegistryForUpdate(file) {
  try {
    return parseRegistry(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return emptyRegistry()
    throw error
  }
}

function registryFileKey(file) {
  const resolved = path.resolve(file)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

const RENAME_RETRY_DELAYS_MS = [20, 50, 100, 200, 400]
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

async function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(from, to)
    } catch (error) {
      if (attempt >= RENAME_RETRY_DELAYS_MS.length || !RETRYABLE_RENAME_CODES.has(error?.code)) throw error
      await new Promise(resolve => setTimeout(resolve, RENAME_RETRY_DELAYS_MS[attempt]))
    }
  }
}

async function writeRegistry(file, registry) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(registry, null, 2), 'utf8')
    await renameWithRetry(tmp, file)
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

async function updateRegistry(file, update) {
  const key = registryFileKey(file)
  const previous = pendingUpdates.get(key) || Promise.resolve()
  const pending = previous.catch(() => {}).then(async () => {
    const current = await readRegistryForUpdate(file)
    const next = await update(current)
    if (!next || next === current) return undefined
    await writeRegistry(file, next)
    return next
  })
  pendingUpdates.set(key, pending)
  try {
    return await pending
  } finally {
    if (pendingUpdates.get(key) === pending) pendingUpdates.delete(key)
  }
}

function recordIngested(registry, { rel, hash, mtimeMs, size, ingestedAt, pages }) {
  const next = {
    version: VERSION,
    sources: { ...registry.sources },
    pages: { ...registry.pages }
  }
  for (const { rel: pageRel, ...rest } of pages) next.pages[pageRel] = { ...rest }
  next.sources[rel] = { hash, mtimeMs, size, ingestedAt, pages: pages.map(p => p.rel) }
  return next
}

function classifySources({ scanned, registry }) {
  const result = []
  for (const file of scanned) {
    if (!file.rel.startsWith(KB_SOURCE_PREFIX) || !INGESTIBLE_EXTS.has(String(file.ext).toLowerCase())) continue
    const record = registry.sources[file.rel]
    const state = !record ? 'new'
      : record.mtimeMs === file.mtimeMs && record.size === file.size ? 'ingested' : 'updated'
    result.push({ rel: file.rel, abs: file.abs, size: file.size, mtimeMs: file.mtimeMs, state })
  }
  return result
}

function removedSources({ scanned, registry }) {
  const present = new Set(scanned.map(file => file.rel))
  return Object.keys(registry.sources).filter(rel => !present.has(rel))
}

module.exports = {
  registryPathFor, registryFileKey, readRegistry, readRegistrySync, writeRegistry, updateRegistry, recordIngested, classifySources, removedSources
}
