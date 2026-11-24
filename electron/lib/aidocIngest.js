'use strict'

const fs = require('fs')
const path = require('path')
const { scanKnowledgeFiles } = require('./aidocIndex')
const {
  readRegistry, writeRegistry, recordIngested, classifySources, removedSources
} = require('./aidocRegistry')
const { loadSourceText } = require('./aidocSourceText')
const { sha256File } = require('./aidocFrontmatter')
const { ensureWikiScaffold, appendLog, ensureIndexCoverage } = require('./aidocWiki')
const { AiDocWikiTool } = require('../agent/tools/AiDocWikiTool')

const MAX_SOURCES_PER_RUN = 30

// In-memory guard: registryFile -> true while a runIngest call owns it.
const activeRuns = new Set()

function pad(n) {
  return String(n).padStart(2, '0')
}

function localDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function errorMessage(error) {
  return error?.message || String(error)
}

async function buildIngestPlan({ root, registry, hashFile = sha256File, only } = {}) {
  const scanned = await scanKnowledgeFiles(root)
  const wanted = Array.isArray(only) ? new Set(only) : null
  const refreshed = []
  const sources = []

  for (const file of classifySources({ scanned, registry })) {
    if (wanted && !wanted.has(file.rel)) continue
    let state = file.state
    if (state === 'updated' && (await hashFile(file.abs)) === registry.sources[file.rel]?.hash) {
      // Same content, only mtime/size drifted: the caller refreshes the record.
      refreshed.push(file.rel)
      state = 'ingested'
    }
    if (state === 'ingested' && !wanted) continue
    sources.push({ rel: file.rel, abs: file.abs, size: file.size, state })
  }

  sources.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  refreshed.sort()
  const overflow = Math.max(0, sources.length - MAX_SOURCES_PER_RUN)
  return {
    sources: sources.slice(0, MAX_SOURCES_PER_RUN),
    refreshed,
    removed: removedSources({ scanned, registry }),
    overflow
  }
}

async function handEditedOf(root, registry, previousPages) {
  const edited = []
  for (const rel of previousPages) {
    const expected = registry.pages[rel]?.hash
    if (!expected) continue
    try {
      if ((await sha256File(path.join(root, rel))) !== expected) edited.push(rel)
    } catch {
      // A page that no longer exists is simply omitted.
    }
  }
  return edited
}

async function collectWrittenPages(root, tool) {
  const pages = []
  for (const page of tool.getWrittenPages()) {
    try {
      const hash = await sha256File(path.join(root, page.rel))
      pages.push({ rel: page.rel, hash, type: page.type, title: page.title, sources: page.sources, updated: page.updated })
    } catch {
      // The page vanished after the agent wrote it; do not register it.
    }
  }
  return pages
}

function readSchemaText(root) {
  try {
    return fs.readFileSync(path.join(root, 'wiki', 'SCHEMA.md'), 'utf8')
  } catch {
    return ''
  }
}

async function runIngest({ root, registryFile, sources, runAgent, onProgress, shouldStop, now = () => new Date() }) {
  if (activeRuns.has(registryFile)) {
    throw Object.assign(new Error('An ingest run is already in progress'), { code: 'INGEST_BUSY' })
  }
  activeRuns.add(registryFile)
  try {
    return await ingestSequentially({ root, registryFile, sources, runAgent, onProgress, shouldStop, now })
  } finally {
    activeRuns.delete(registryFile)
  }
}

async function ingestSequentially({ root, registryFile, sources, runAgent, onProgress, shouldStop, now }) {
  ensureWikiScaffold(root)
  const result = { done: [], failed: [], stopped: false }
  const total = sources.length
  const stopRequested = () => (typeof shouldStop === 'function' ? !!shouldStop() : false)
  const emit = payload => {
    try { onProgress?.(payload) } catch { /* a broken progress listener must never break ingest */ }
  }

  for (let index = 0; index < total; index++) {
    const source = sources[index]
    const { rel } = source
    if (stopRequested()) { result.stopped = true; break }

    emit({ index, total, rel, status: 'start' })
    const fail = (reason, detail) => {
      result.failed.push(detail === undefined ? { rel, reason } : { rel, reason, detail })
      emit({ index, total, rel, status: 'failed' })
    }

    const loaded = await loadSourceText(source.abs)
    if (!loaded.ok) { fail(loaded.reason, loaded.detail); continue }

    // Snapshot the source before the agent runs so a mid-run edit shows as "updated" next time.
    let snapshot
    try {
      const stat = fs.statSync(source.abs)
      snapshot = { hash: await sha256File(source.abs), mtimeMs: stat.mtimeMs, size: stat.size }
    } catch (error) {
      fail('read_failed', errorMessage(error)); continue
    }

    const registry = await readRegistry(registryFile)
    const previousPages = [...(registry.sources[rel]?.pages || [])]
    const handEditedPages = await handEditedOf(root, registry, previousPages)
    const tool = new AiDocWikiTool({ root, registry })

    try {
      await runAgent({ source, tool, previousPages, handEditedPages, schemaText: readSchemaText(root) })
    } catch (error) {
      if (error?.name === 'AbortError' || stopRequested()) { result.stopped = true; break }
      fail('agent_error', errorMessage(error)); continue
    }
    if (stopRequested()) { result.stopped = true; break }

    try {
      const pages = await collectWrittenPages(root, tool)
      if (!pages.length) { fail('no_pages'); continue }
      // Re-read right before the write so concurrent registry changes are never lost.
      const latest = await readRegistry(registryFile)
      const stamp = now()
      await writeRegistry(registryFile, recordIngested(latest, {
        rel, ...snapshot, ingestedAt: stamp.toISOString(), pages
      }))
      await appendLog(root, { date: localDate(stamp), sourceRel: rel, pages: pages.map(p => path.basename(p.rel, '.md')) })
      await ensureIndexCoverage(root, pages)
      result.done.push(rel)
      emit({ index, total, rel, status: 'done', pages: pages.map(p => p.rel) })
    } catch (error) {
      fail('record_failed', errorMessage(error))
    }
  }
  return result
}

module.exports = { MAX_SOURCES_PER_RUN, buildIngestPlan, runIngest }
