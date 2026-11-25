'use strict'

const fs = require('fs')
const path = require('path')
const { scanKnowledgeFiles } = require('./aidocIndex')
const {
  readRegistryStrict, updateRegistry, registryFileKey, recordIngested, pendingLanguages, classifySources, removedSources
} = require('./aidocRegistry')
const { validateWikiLanguages, wikiLanguageRoot } = require('./aidocLanguages')
const { loadSourceText } = require('./aidocSourceText')
const { sha256File } = require('./aidocFrontmatter')
const { ensureWikiScaffold, appendLog, ensureIndexCoverage } = require('./aidocWiki')
const { AiDocWikiTool, resolveWikiToolPath } = require('../agent/tools/AiDocWikiTool')

const MAX_SOURCES_PER_RUN = 30
// Likely an invalid key or provider outage: stop instead of failing every remaining source.
const MAX_CONSECUTIVE_AGENT_ERRORS = 3

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

function invalidLanguages() {
  return Object.assign(new Error('Invalid wiki languages'), { code: 'invalid_language' })
}

// languages: the selected wiki languages. Each source lists in `langs` the languages that still need work:
// all of them for a new or changed source, only the missing ones for an already-ingested source.
// includeIngested: with `only`, also list already-ingested files (state 'ingested') so callers can force a re-run;
// a forced source is listed for every selected language.
// The filter runs before the per-run cap so skipped files never consume cap slots.
async function buildIngestPlan({ root, registry, hashFile = sha256File, only, includeIngested = true, languages } = {}) {
  const selected = validateWikiLanguages(languages)
  if (!selected) throw invalidLanguages()
  const scanned = await scanKnowledgeFiles(root)
  const wanted = Array.isArray(only) ? new Set(only) : null
  const forced = Boolean(wanted && includeIngested)
  const refreshed = []
  const sources = []

  for (const file of classifySources({ scanned, registry })) {
    if (wanted && !wanted.has(file.rel)) continue
    const record = registry.sources[file.rel]
    let state = file.state
    if (state === 'updated') {
      try {
        if ((await hashFile(file.abs)) === record?.hash) {
          // Same content, only mtime/size drifted: the caller refreshes the record.
          refreshed.push(file.rel)
          state = 'ingested'
        }
      } catch {
        // Keep unreadable sources in the plan so ingest can report the failure per source.
      }
    }
    const langs = forced || state !== 'ingested' ? selected : pendingLanguages(record, selected)
    if (!langs.length) continue
    sources.push({ rel: file.rel, abs: file.abs, size: file.size, state, langs })
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
      // Only detected user edits are persisted; unregistered pages are protected during the run but not flagged.
      const handEdited = written.handEdited || hash !== written.hash
      pages.push({ ...page, hash, ...(handEdited ? { handEdited } : {}) })
    } catch {
      // The page vanished after the agent wrote it; do not register it.
    }
  }
  return pages
}

function readSchemaText(root, lang) {
  try {
    return fs.readFileSync(path.join(root, ...wikiLanguageRoot(lang).split('/'), 'SCHEMA.md'), 'utf8')
  } catch {
    return ''
  }
}

// A source runs once per language in source.langs (falling back to `languages`); each (source, language) pair is a unit.
async function runIngest({ root, registryFile, sources, languages, batchSize, runAgent, onProgress, shouldStop, now = () => new Date() }) {
  const key = registryFileKey(registryFile)
  if (activeRuns.has(key)) {
    throw Object.assign(new Error('An ingest run is already in progress'), { code: 'INGEST_BUSY' })
  }
  activeRuns.add(key)
  try {
    const shared = { root, registryFile, languages, runAgent, shouldStop, now }
    if (![5, 10].includes(batchSize) || sources.length <= batchSize) {
      return await ingestSequentially({ ...shared, sources, onProgress })
    }

    // A batch is a sequential lane. Other lanes overlap model I/O, while shared wiki writes are coordinated.
    const counts = sources.map(source => {
      const langs = validateWikiLanguages(source.langs ?? languages)
      if (!langs) throw invalidLanguages()
      return langs.length
    })
    const total = counts.reduce((sum, count) => sum + count, 0)
    const parallel = {
      owners: new Map(),
      committed: new Map(),
      bookkeeping: Promise.resolve(),
      agentErrorStreak: 0,
      aborted: false,
    }
    const finished = new Set()
    const progress = event => {
      if (event.status === 'done' || event.status === 'failed') finished.add(event.index)
      onProgress?.({ ...event, completed: finished.size })
    }
    const jobs = []
    let offset = 0
    for (let start = 0; start < sources.length; start += batchSize) {
      const end = start + batchSize
      jobs.push(ingestSequentially({
        ...shared, sources: sources.slice(start, end), onProgress: progress, parallel, offset, runTotal: total,
      }))
      offset += counts.slice(start, end).reduce((sum, count) => sum + count, 0)
    }
    const settled = await Promise.allSettled(jobs)
    const failure = settled.find(item => item.status === 'rejected')
    if (failure) throw failure.reason
    const results = settled.map(item => item.value)
    const warnings = results.flatMap(result => result.warnings || [])
    const aborted = results.find(result => result.aborted)?.aborted
    return {
      done: results.flatMap(result => result.done),
      failed: results.flatMap(result => result.failed),
      stopped: results.some(result => result.stopped),
      ...(warnings.length ? { warnings } : {}),
      ...(aborted ? { aborted } : {}),
    }
  } finally {
    activeRuns.delete(key)
  }
}

async function ingestSequentially({ root, registryFile, sources, languages, runAgent, onProgress, shouldStop, now, parallel, offset = 0, runTotal }) {
  // Validate before anything is written.
  const queue = sources.map(source => {
    const langs = validateWikiLanguages(source.langs ?? languages)
    if (!langs) throw invalidLanguages()
    return { source, langs }
  })
  // Fail fast: a corrupt, unreadable or future-version registry must never be treated as empty.
  try {
    await readRegistryStrict(registryFile)
  } catch (error) {
    throw Object.assign(new Error(`Ingest registry is unreadable: ${errorMessage(error)}`), { code: 'registry_unreadable' })
  }
  for (const lang of new Set(queue.flatMap(item => item.langs))) ensureWikiScaffold(root, lang)
  const result = { done: [], failed: [], stopped: false }
  const total = runTotal ?? queue.reduce((sum, item) => sum + item.langs.length, 0)
  let agentErrorStreak = 0
  let firstUnit = offset
  const stopRequested = () => {
    if (typeof shouldStop === 'function' && shouldStop()) result.stopped = true
    return result.stopped
  }
  const emit = payload => {
    try { onProgress?.(payload) } catch { /* a broken progress listener must never break ingest */ }
  }

  sourceLoop:
  for (const { source, langs } of queue) {
    const { rel } = source
    const base = firstUnit
    firstUnit += langs.length
    if (stopRequested() || parallel?.aborted) break

    // Progress is reported per unit: index counts (source, language) pairs across the whole run.
    const started = new Set()
    const unit = i => ({ index: base + i, total, rel, lang: langs[i] })
    const begin = i => {
      if (started.has(i)) return
      started.add(i)
      emit({ ...unit(i), status: 'start' })
    }
    const failUnit = (i, reason, detail) => {
      begin(i)
      result.failed.push(detail === undefined ? { rel, lang: langs[i], reason } : { rel, lang: langs[i], reason, detail })
      emit({ ...unit(i), status: 'failed' })
    }
    const failFrom = (from, reason, detail) => {
      for (let i = from; i < langs.length; i++) failUnit(i, reason, detail)
    }
    // Terminal event for a unit whose start was announced but which was neither recorded nor failed.
    const halt = i => {
      begin(i)
      emit({ ...unit(i), status: 'stopped' })
    }

    // Bind extraction and registry metadata to a single source version shared by every language.
    begin(0)
    let loaded
    let snapshot
    try {
      const stat = fs.statSync(source.abs)
      if (!stat.isFile()) throw new Error('Source is not a regular file')
      loaded = await loadSourceText(source.abs)
      if (stopRequested()) { halt(0); break }
      if (!loaded.ok) { failFrom(0, loaded.reason, loaded.detail); continue }
      const hash = await sha256File(source.abs)
      const after = fs.statSync(source.abs)
      if (['mtimeMs', 'ctimeMs', 'size', 'dev', 'ino'].some(key => stat[key] !== after[key])) {
        throw new Error('Source changed while being read')
      }
      snapshot = { hash, mtimeMs: stat.mtimeMs, size: stat.size }
    } catch (error) {
      if (stopRequested()) { halt(0); break }
      failFrom(0, 'read_failed', errorMessage(error)); continue
    }

    let sourceDone = true
    for (let i = 0; i < langs.length; i++) {
      const lang = langs[i]
      begin(i)
      let registry
      try {
        registry = await readRegistryStrict(registryFile)
      } catch (error) {
        failFrom(i, 'registry_unreadable', errorMessage(error)); break sourceLoop
      }
      const previousPages = [...(registry.sources[rel]?.langs?.[lang]?.pages || [])]
      const handEditedPages = await handEditedOf(root, registry, previousPages)
      const tool = new AiDocWikiTool({ root, registry, sourceText: { rel, loaded }, parallel, lang })

      try {
        if (stopRequested() || parallel?.aborted) { halt(i); break sourceLoop }
        try {
          await runAgent({
            source, lang, wikiRoot: wikiLanguageRoot(lang), tool, previousPages, handEditedPages,
            schemaText: readSchemaText(root, lang), progress: unit(i), parallel: Boolean(parallel)
          })
        } catch (error) {
          if (error?.name === 'AbortError' || stopRequested()) { result.stopped = true; halt(i); break sourceLoop }
          if (error?.code === 'output_truncated') {
            failUnit(i, 'output_truncated', errorMessage(error))
            sourceDone = false
            continue
          }
          failUnit(i, 'agent_error', errorMessage(error))
          sourceDone = false
          const streak = parallel ? ++parallel.agentErrorStreak : ++agentErrorStreak
          if (streak >= MAX_CONSECUTIVE_AGENT_ERRORS) {
            result.aborted = 'consecutive_agent_errors'
            if (parallel) parallel.aborted = true
            break sourceLoop
          }
          continue
        }
        if (parallel) parallel.agentErrorStreak = 0
        else agentErrorStreak = 0
        if (stopRequested()) { halt(i); break sourceLoop }

        let pages
        let stamp
        try {
          pages = await collectWrittenPages(root, tool)
          if (stopRequested()) { halt(i); break sourceLoop }
          if (!pages.length) { failUnit(i, 'no_pages'); sourceDone = false; continue }
          stamp = now()
          // The registry write is the commit point; nothing else may run inside it.
          const committed = await updateRegistry(registryFile, async latest => {
            if (stopRequested()) return
            // Union with earlier pages of this source that still exist, so a partial re-ingest does not forget them.
            const keepPages = (latest.sources[rel]?.langs?.[lang]?.pages || []).filter(pageRel => {
              const target = resolveWikiToolPath(root, pageRel)
              return target.ok && target.area === 'wiki' && target.exists
            })
            return recordIngested(latest, { rel, lang, ...snapshot, ingestedAt: stamp.toISOString(), pages, keepPages })
          })
          if (!committed) { halt(i); break sourceLoop }
          if (parallel) for (const page of pages) parallel.committed.set(page.rel, page)
        } catch (error) {
          failUnit(i, 'record_failed', errorMessage(error)); sourceDone = false; continue
        }

        // Serialize index and log updates across lanes; page records are already committed.
        const bookkeeping = async () => {
          const warnings = []
          try {
            await ensureIndexCoverage(root, lang, pages)
          } catch (error) {
            warnings.push({ rel, lang, step: 'index', detail: errorMessage(error) })
          }
          try {
            await appendLog(root, lang, { date: localDate(stamp), sourceRel: rel, pages: pages.map(p => path.basename(p.rel, '.md')) })
          } catch (error) {
            warnings.push({ rel, lang, step: 'log', detail: errorMessage(error) })
          }
          return warnings
        }
        const pending = parallel ? parallel.bookkeeping.then(bookkeeping) : bookkeeping()
        if (parallel) parallel.bookkeeping = pending.catch(() => {})
        const warnings = await pending
        if (warnings.length) (result.warnings ||= []).push(...warnings)
        emit({ ...unit(i), status: 'done', pages: pages.map(p => p.rel), ...(warnings.length ? { warnings } : {}) })
      } finally {
        if (parallel) {
          for (const page of tool.getTouchedFiles()) {
            if (parallel.owners.get(page) === tool) parallel.owners.delete(page)
          }
        }
      }
    }
    // A source counts as done only when every language unit succeeded; partial results stay recorded per language.
    if (sourceDone) result.done.push(rel)
  }
  return result
}

module.exports = { MAX_SOURCES_PER_RUN, buildIngestPlan, runIngest }
