'use strict'

const fs = require('fs')
const path = require('path')
const { scanKnowledgeFiles } = require('./aidocIndex')
const {
  readRegistry, updateRegistry, registryFileKey, recordIngested, classifySources, removedSources
} = require('./aidocRegistry')
const { loadSourceText } = require('./aidocSourceText')
const { sha256File } = require('./aidocFrontmatter')
const { ensureWikiScaffold, appendLog, ensureIndexCoverage } = require('./aidocWiki')
const { AiDocWikiTool, resolveWikiToolPath } = require('../agent/tools/AiDocWikiTool')

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
    if (state === 'updated') {
      try {
        if ((await hashFile(file.abs)) === registry.sources[file.rel]?.hash) {
          // Same content, only mtime/size drifted: the caller refreshes the record.
          refreshed.push(file.rel)
          state = 'ingested'
        }
      } catch {
        // Keep unreadable sources in the plan so ingest can report the failure per source.
      }
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
    const target = resolveWikiToolPath(root, rel)
    if (!target.ok || target.area !== 'wiki' || !target.exists) continue
    const entry = registry.pages[target.rel] || registry.pages[target.rel.replace(/^wiki\//, '')]
    try {
      const hash = await sha256File(target.abs)
      if (!entry || entry.handEdited || hash !== entry.hash) edited.push(rel)
    } catch {
      // The page is no longer readable.
    }
  }
  return edited
}

async function collectWrittenPages(root, tool) {
  const pages = []
  for (const page of tool.getWrittenPages()) {
    const target = resolveWikiToolPath(root, page.rel)
    if (!target.ok || !target.exists) continue
    try {
      const hash = await sha256File(target.abs)
      const written = tool.getWrittenPageState(page.rel)
      const handEdited = written.handEdited || hash !== written.hash
      pages.push({ ...page, hash, ...(handEdited ? { handEdited } : {}) })
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
  const key = registryFileKey(registryFile)
  if (activeRuns.has(key)) {
    throw Object.assign(new Error('An ingest run is already in progress'), { code: 'INGEST_BUSY' })
  }
  activeRuns.add(key)
  try {
    return await ingestSequentially({ root, registryFile, sources, runAgent, onProgress, shouldStop, now })
  } finally {
    activeRuns.delete(key)
  }
}

async function ingestSequentially({ root, registryFile, sources, runAgent, onProgress, shouldStop, now }) {
  ensureWikiScaffold(root)
  const result = { done: [], failed: [], stopped: false }
  const total = sources.length
  const stopRequested = () => {
    if (typeof shouldStop === 'function' && shouldStop()) result.stopped = true
    return result.stopped
  }
  const emit = payload => {
    try { onProgress?.(payload) } catch { /* a broken progress listener must never break ingest */ }
  }

  for (let index = 0; index < total; index++) {
    const source = sources[index]
    const { rel } = source
    if (stopRequested()) break

    emit({ index, total, rel, status: 'start' })
    const fail = (reason, detail) => {
      result.failed.push(detail === undefined ? { rel, reason } : { rel, reason, detail })
      emit({ index, total, rel, status: 'failed' })
    }

    // Bind extraction and registry metadata to a single source version.
    let loaded
    let snapshot
    try {
      const stat = fs.statSync(source.abs)
      if (!stat.isFile()) throw new Error('Source is not a regular file')
      loaded = await loadSourceText(source.abs)
      if (stopRequested()) break
      if (!loaded.ok) { fail(loaded.reason, loaded.detail); continue }
      const hash = await sha256File(source.abs)
      const after = fs.statSync(source.abs)
      if (['mtimeMs', 'ctimeMs', 'size', 'dev', 'ino'].some(key => stat[key] !== after[key])) {
        throw new Error('Source changed while being read')
      }
      snapshot = { hash, mtimeMs: stat.mtimeMs, size: stat.size }
    } catch (error) {
      if (stopRequested()) break
      fail('read_failed', errorMessage(error)); continue
    }

    const registry = await readRegistry(registryFile)
    const previousPages = [...(registry.sources[rel]?.pages || [])]
    const handEditedPages = await handEditedOf(root, registry, previousPages)
    const tool = new AiDocWikiTool({ root, registry, sourceText: { rel, loaded } })

    if (stopRequested()) break
    try {
      await runAgent({ source, tool, previousPages, handEditedPages, schemaText: readSchemaText(root) })
    } catch (error) {
      if (error?.name === 'AbortError' || stopRequested()) { result.stopped = true; break }
      fail('agent_error', errorMessage(error)); continue
    }
    if (stopRequested()) break

    try {
      const pages = await collectWrittenPages(root, tool)
      if (stopRequested()) break
      if (!pages.length) { fail('no_pages'); continue }
      const stamp = now()
      const committed = await updateRegistry(registryFile, async latest => {
        if (stopRequested()) return
        await ensureIndexCoverage(root, pages)
        if (stopRequested()) return
        const next = recordIngested(latest, { rel, ...snapshot, ingestedAt: stamp.toISOString(), pages })
        await appendLog(root, { date: localDate(stamp), sourceRel: rel, pages: pages.map(p => path.basename(p.rel, '.md')) })
        return next
      })
      if (!committed) break
      result.done.push(rel)
      emit({ index, total, rel, status: 'done', pages: pages.map(p => p.rel) })
    } catch (error) {
      fail('record_failed', errorMessage(error))
    }
  }
  return result
}

module.exports = { MAX_SOURCES_PER_RUN, buildIngestPlan, runIngest }
