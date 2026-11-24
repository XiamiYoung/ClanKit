'use strict'

const fs = require('fs/promises')
const path = require('path')
const { rootHash } = require('./aidocIndex')
const { INGESTIBLE_EXTS } = require('./aidocSourceText')

const VERSION = 1
const KB_SOURCE_PREFIX = 'kb_source/'

const emptyRegistry = () => ({ version: VERSION, sources: {}, pages: {} })
const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

function registryPathFor(dataDir, root) {
  return path.join(dataDir, 'aidoc-ingest', rootHash(root) + '.json')
}

function validRecords(map, isValid) {
  if (!isPlainObject(map)) return {}
  return Object.fromEntries(Object.entries(map).filter(([, record]) => isPlainObject(record) && isValid(record)))
}

async function readRegistry(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'))
    // Plan-2 registry files carry no version field; treat a missing version as v1.
    if (!isPlainObject(parsed) || (parsed.version !== undefined && parsed.version !== VERSION)) return emptyRegistry()
    return {
      version: VERSION,
      sources: validRecords(parsed.sources, record =>
        typeof record.hash === 'string' && typeof record.ingestedAt === 'string' && Array.isArray(record.pages)),
      pages: validRecords(parsed.pages, record => typeof record.hash === 'string')
    }
  } catch {
    return emptyRegistry()
  }
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
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(registry, null, 2), 'utf8')
    await renameWithRetry(tmp, file)
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw error
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
  registryPathFor, readRegistry, writeRegistry, recordIngested, classifySources, removedSources
}
