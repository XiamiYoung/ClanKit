import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { buildIngestPlan, runIngest, MAX_SOURCES_PER_RUN } = require('../aidocIngest')
const { readRegistry, writeRegistry, recordIngested, classifySources } = require('../aidocRegistry')
const { scanKnowledgeFiles } = require('../aidocIndex')
const { sha256Text, sha256File } = require('../aidocFrontmatter')

let dir, root, registryFile
const NOW = () => new Date(2026, 10, 24, 12, 0, 0)

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidoc-ingest-'))
  root = path.join(dir, 'root')
  registryFile = path.join(dir, 'data', 'reg.json')
  fs.mkdirSync(path.join(root, 'kb_source'), { recursive: true })
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const src = (name, text = 'Some meaningful source text. '.repeat(5)) => {
  const abs = path.join(root, 'kb_source', name)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, text)
  return { rel: 'kb_source/' + name, abs }
}
const pageText = (title, sources, extra = '') =>
  `---\ntype: concept\ntitle: ${title}\nsources: [${sources.join(', ')}]\nupdated: 2026-11-24\n---\nBody of ${title}. ${extra}\n`
const write = (tool, title, source, extra) =>
  tool.execute('c', { operation: 'write_wiki', path: `wiki/en/${title}.md`, content: pageText(title, [source], extra) })
const wikiRead = (name, lang = 'en') => fs.readFileSync(path.join(root, 'wiki', lang, name), 'utf8')
const entry = (rel, extra = {}) => ({ rel, lang: 'en', hash: 'h', mtimeMs: 1, size: 1, ingestedAt: 'x', pages: [], ...extra })

// Fake agent: writes one summary page per source (plus an optional shared page) through the real tool.
const okAgent = (opts = {}) => vi.fn(async ({ source, tool }) => {
  const base = path.basename(source.rel, path.extname(source.rel))
  await write(tool, base + ' summary', source.rel)
  if (opts.extra) await write(tool, opts.extra, source.rel)
})
const run = (sources, runAgent, extra = {}) => runIngest({ root, registryFile, sources, languages: ['en'], runAgent, now: NOW, ...extra })

describe('runIngest', () => {
  it('ingests sources sequentially, records pages, log and index coverage', async () => {
    const a = src('a.md'), b = src('b.md')
    const result = await run([a, b], okAgent({ extra: 'Shared Concept' }))
    expect(result).toEqual({ done: [a.rel, b.rel], failed: [], stopped: false })
    const reg = await readRegistry(registryFile)
    expect(Object.keys(reg.sources).sort()).toEqual([a.rel, b.rel])
    expect([...reg.sources[a.rel].pages].sort()).toEqual(['wiki/en/Shared Concept.md', 'wiki/en/a summary.md'])
    for (const [rel, rec] of Object.entries(reg.pages)) {
      expect(rec.hash).toBe(sha256Text(fs.readFileSync(path.join(root, rel), 'utf8')))
      expect(rec.type).toBe('concept')
    }
    expect(reg.sources[a.rel].hash).toBe(await sha256File(a.abs))
    // The second source's write to the shared page succeeded and is reflected in the registry.
    expect([...reg.sources[b.rel].pages].sort()).toEqual(['wiki/en/Shared Concept.md', 'wiki/en/b summary.md'])
    expect(wikiRead('Shared Concept.md')).toContain(`sources: [${b.rel}]`)
    expect(reg.pages['wiki/en/Shared Concept.md'].hash).toBe(sha256Text(wikiRead('Shared Concept.md')))
    expect(reg.pages['wiki/en/Shared Concept.md'].handEdited).toBeUndefined()
    const log = wikiRead('log.md')
    expect(log).toContain('## [2026-11-24] ingest | kb_source/a.md')
    expect(log).toContain('## [2026-11-24] ingest | kb_source/b.md')
    const index = wikiRead('index.md')
    for (const n of ['a summary', 'b summary', 'Shared Concept']) expect(index).toContain(`[[${n}]]`)
  })

  it('fails a scanned PDF with scanned_pdf without recording and continues', async () => {
    const pdf = src('scan.pdf', 'stub')
    const b = src('b.md')
    const agent = okAgent()
    // Stub the CommonJS PDF parser to simulate a scanned document with minimal extracted text.
    const key = require.resolve('pdf-parse')
    const real = require(key)
    require.cache[key].exports = async () => ({ text: 'Hi', numpages: 3 })
    try {
      expect(await run([pdf, b], agent)).toEqual({
        done: [b.rel], failed: [{ rel: pdf.rel, lang: 'en', reason: 'scanned_pdf' }], stopped: false
      })
    } finally {
      require.cache[key].exports = real
    }
    expect(agent).toHaveBeenCalledTimes(1)
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([b.rel])
  })

  it('keeps written pages and records nothing when the agent throws', async () => {
    const a = src('a.md'), b = src('b.md')
    const agent = vi.fn(async ({ source, tool }) => {
      await write(tool, 'Partial', source.rel)
      if (source.rel === a.rel) throw new Error('boom')
      await write(tool, 'b summary', source.rel)
    })
    const result = await run([a, b], agent)
    expect(result.failed).toEqual([{ rel: a.rel, lang: 'en', reason: 'agent_error', detail: 'boom' }])
    expect(result.done).toEqual([b.rel])
    expect(fs.existsSync(path.join(root, 'wiki', 'en', 'Partial.md'))).toBe(true)
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([b.rel])
  })

  it('aborts after 3 consecutive agent errors and leaves the rest untouched', async () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map(n => src(n + '.md'))
    const agent = vi.fn(async () => { throw new Error('401 invalid key') })
    const result = await run(files, agent)
    expect(agent).toHaveBeenCalledTimes(3)
    expect(result.stopped).toBe(false)
    expect(result.aborted).toBe('consecutive_agent_errors')
    expect(result.done).toEqual([])
    expect(result.failed.map(f => f.rel)).toEqual(files.slice(0, 3).map(f => f.rel))
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([])
  })

  it('reports truncated output without marking partial pages or aborting other sources', async () => {
    const files = ['a', 'b', 'c', 'd'].map(name => src(name + '.md'))
    const agent = vi.fn(async ({ source, tool }) => {
      await write(tool, path.basename(source.rel, '.md'), source.rel)
      if (source !== files[3]) throw Object.assign(new Error('Output limit'), { code: 'output_truncated' })
    })
    const result = await run(files, agent)
    expect(result.done).toEqual([files[3].rel])
    expect(result.failed.map(item => item.reason)).toEqual(Array(3).fill('output_truncated'))
    expect(result.aborted).toBeUndefined()
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([files[3].rel])
    expect(wikiRead('a.md')).toContain('Body of a.')
  })

  it('does not abort when agent errors are not consecutive', async () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map(n => src(n + '.md'))
    const failing = new Set([files[0].rel, files[1].rel, files[3].rel, files[4].rel])
    const agent = vi.fn(async ({ source, tool }) => {
      if (failing.has(source.rel)) throw new Error('boom')
      await write(tool, 'ok summary', source.rel)
    })
    const result = await run(files, agent)
    expect(agent).toHaveBeenCalledTimes(5)
    expect(result.aborted).toBeUndefined()
    expect(result.done).toEqual([files[2].rel])
    expect(result.failed).toHaveLength(4)
  })

  it('reports read_failed when a planned source disappears and continues', async () => {
    const a = src('a.md'), b = src('b.md')
    fs.rmSync(a.abs)
    const agent = okAgent()
    const result = await run([a, b], agent)
    expect(result).toEqual({
      done: [b.rel], failed: [{ rel: a.rel, lang: 'en', reason: 'read_failed', detail: expect.stringContaining('ENOENT') }], stopped: false
    })
    expect(agent).toHaveBeenCalledTimes(1)
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([b.rel])
  })

  it('keeps the source done and reports a warning when index coverage fails after the registry write', async () => {
    const a = src('a.md'), b = src('b.md')
    const indexPath = path.join(root, 'wiki', 'en', 'index.md')
    let index
    const events = []
    const result = await run([a, b], async ({ source, tool }) => {
      if (source.rel === a.rel) {
        index = fs.readFileSync(indexPath)
        fs.rmSync(indexPath)
        fs.mkdirSync(indexPath)
      } else {
        fs.rmdirSync(indexPath)
        fs.writeFileSync(indexPath, index)
      }
      await write(tool, path.basename(source.rel, '.md'), source.rel)
    }, { onProgress: e => events.push(e) })
    expect(result).toEqual({
      done: [a.rel, b.rel], failed: [], stopped: false,
      warnings: [{ rel: a.rel, lang: 'en', step: 'index', detail: expect.any(String) }]
    })
    const reg = await readRegistry(registryFile)
    expect(Object.keys(reg.sources).sort()).toEqual([a.rel, b.rel])
    expect(reg.sources[a.rel].pages).toEqual(['wiki/en/a.md'])
    expect(wikiRead('log.md')).toContain(a.rel)
    expect(events.find(e => e.rel === a.rel && e.status === 'done').warnings).toEqual(result.warnings)
    expect(events.find(e => e.rel === b.rel && e.status === 'done').warnings).toBeUndefined()
  })

  it('keeps the source done and reports a warning when the log cannot be appended', async () => {
    const a = src('a.md')
    const result = await run([a], async ({ source, tool }) => {
      fs.rmSync(path.join(root, 'wiki', 'en', 'log.md'), { force: true })
      fs.mkdirSync(path.join(root, 'wiki', 'en', 'log.md'))
      await write(tool, 'a', source.rel)
    })
    expect(result.done).toEqual([a.rel])
    expect(result.failed).toEqual([])
    expect(result.warnings).toEqual([{ rel: a.rel, lang: 'en', step: 'log', detail: expect.any(String) }])
    const reg = await readRegistry(registryFile)
    expect(reg.sources[a.rel].pages).toEqual(['wiki/en/a.md'])
    expect(wikiRead('index.md')).toContain('[[a]]')
  })

  it('fails with record_failed and writes no log entry when the registry write fails', async () => {
    const a = src('a.md')
    const result = await run([a], async ({ source, tool }) => {
      await write(tool, 'a', source.rel)
      fs.mkdirSync(registryFile, { recursive: true })
    })
    expect(result).toEqual({ done: [], failed: [{ rel: a.rel, lang: 'en', reason: 'record_failed', detail: expect.any(String) }], stopped: false })
    expect(wikiRead('a.md')).toContain('Body of a.')
    const logFile = path.join(root, 'wiki', 'en', 'log.md')
    expect(fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '').not.toContain(a.rel)
  })

  it('unions previous source pages that still exist and rewrites registry pages only for pages written now', async () => {
    const a = src('a.md')
    await run([a], async ({ source, tool }) => { await write(tool, 'p1', source.rel); await write(tool, 'p2', source.rel) })
    const first = await readRegistry(registryFile)
    fs.writeFileSync(a.abs, 'a changed source text. '.repeat(8))
    await run([a], async ({ source, tool }) => { await write(tool, 'p1', source.rel, 'v2') })
    const reg = await readRegistry(registryFile)
    expect(reg.sources[a.rel].pages).toEqual(['wiki/en/p1.md', 'wiki/en/p2.md'])
    expect(reg.pages['wiki/en/p2.md']).toEqual(first.pages['wiki/en/p2.md'])
    expect(reg.pages['wiki/en/p1.md'].hash).toBe(sha256Text(wikiRead('p1.md')))
    expect(reg.pages['wiki/en/p1.md'].hash).not.toBe(first.pages['wiki/en/p1.md'].hash)

    fs.rmSync(path.join(root, 'wiki', 'en', 'p2.md'))
    fs.writeFileSync(a.abs, 'a third source text. '.repeat(9))
    await run([a], async ({ source, tool }) => { await write(tool, 'p1', source.rel, 'v3') })
    expect((await readRegistry(registryFile)).sources[a.rel].pages).toEqual(['wiki/en/p1.md'])
  })

  it('rejects with registry_unreadable and never runs the agent when the registry is corrupt', async () => {
    const a = src('a.md')
    fs.mkdirSync(path.dirname(registryFile), { recursive: true })
    fs.writeFileSync(registryFile, '{ not json')
    const agent = okAgent()
    await expect(run([a], agent)).rejects.toMatchObject({ code: 'registry_unreadable' })
    expect(agent).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(root, 'wiki', 'en', 'a summary.md'))).toBe(false)
    expect(fs.readFileSync(registryFile, 'utf8')).toBe('{ not json')
    // A future registry version is equally unreadable, and the lock is released afterwards.
    fs.writeFileSync(registryFile, JSON.stringify({ version: 99, sources: {}, pages: {} }))
    await expect(run([a], agent)).rejects.toMatchObject({ code: 'registry_unreadable' })
    expect(agent).not.toHaveBeenCalled()
  })

  it('does not persist handEdited for an unregistered page the agent created in an earlier failed run', async () => {
    const a = src('a.md')
    // Run 1: the agent writes a page, then fails before anything is registered.
    await run([a], async ({ source, tool }) => { await write(tool, 'orphan', source.rel); throw new Error('boom') })
    expect(Object.keys((await readRegistry(registryFile)).pages)).toEqual([])
    // Run 2: the unregistered page is protected from write_wiki but may be minimally edited.
    await run([a], async ({ source, tool }) => {
      expect((await write(tool, 'orphan', source.rel, 'rewrite')).isError).toBe(true)
      const edit = await tool.execute('c', { operation: 'edit_wiki', path: 'wiki/en/orphan.md', oldText: 'Body of orphan.', newText: 'Revised orphan.' })
      expect(edit.isError).toBeFalsy()
      await write(tool, 'extra', source.rel)
    })
    const reg = await readRegistry(registryFile)
    expect(reg.pages['wiki/en/orphan.md'].hash).toBe(sha256Text(wikiRead('orphan.md')))
    expect(reg.pages['wiki/en/orphan.md'].handEdited).toBeUndefined()
    // Run 3: now registered and unchanged, so the agent may overwrite it.
    await run([a], async ({ source, tool }) => {
      expect((await write(tool, 'orphan', source.rel, 'rewrite')).isError).toBeFalsy()
    })
  })

  it('fails with no_pages when the agent writes nothing', async () => {
    const a = src('a.md')
    const result = await run([a], vi.fn(async () => {}))
    expect(result.failed).toEqual([{ rel: a.rel, lang: 'en', reason: 'no_pages' }])
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([])
  })

  it('does not register index.md as a page', async () => {
    const a = src('a.md')
    await run([a], vi.fn(async ({ source, tool }) => {
      await write(tool, 'a summary', source.rel)
      await tool.execute('c', { operation: 'write_wiki', path: 'wiki/en/index.md', content: '# Index\n- [[a summary]] - x\n' })
    }))
    expect(Object.keys((await readRegistry(registryFile)).pages)).toEqual(['wiki/en/a summary.md'])
  })

  it('skips registering a written page that disappeared', async () => {
    const a = src('a.md')
    const result = await run([a], vi.fn(async ({ source, tool }) => {
      await write(tool, 'keep', source.rel)
      await write(tool, 'gone', source.rel)
      fs.rmSync(path.join(root, 'wiki', 'en', 'gone.md'))
    }))
    expect(result.done).toEqual([a.rel])
    expect((await readRegistry(registryFile)).sources[a.rel].pages).toEqual(['wiki/en/keep.md'])
  })

  it('records the first source and stops before the second when stop is requested between them', async () => {
    const a = src('a.md'), b = src('b.md')
    let stop = false
    const onProgress = ({ status }) => { if (status === 'done') stop = true }
    const agent = okAgent()
    const result = await run([a, b], agent, { shouldStop: () => stop, onProgress })
    expect(result).toEqual({ done: [a.rel], failed: [], stopped: true })
    expect(agent).toHaveBeenCalledTimes(1)
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([a.rel])
  })

  it('honors a stop requested while preparing a source before starting the agent', async () => {
    const a = src('a.md')
    const agent = okAgent()
    let stop = false
    const result = await run([a], agent, {
      shouldStop: () => stop,
      onProgress: ({ status }) => { if (status === 'start') stop = true }
    })
    expect(result).toEqual({ done: [], failed: [], stopped: true })
    expect(agent).not.toHaveBeenCalled()
  })

  it('emits a terminal stopped event for the in-flight source', async () => {
    const a = src('a.md')
    const events = []
    let stop = false
    await run([a], async ({ source, tool }) => { await write(tool, 'p', source.rel); stop = true }, {
      shouldStop: () => stop, onProgress: e => events.push(e)
    })
    expect(events).toEqual([
      { index: 0, total: 1, rel: a.rel, lang: 'en', status: 'start' },
      { index: 0, total: 1, rel: a.rel, lang: 'en', status: 'stopped' }
    ])
    const aborted = []
    await run([a], async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) }, { onProgress: e => aborted.push(e.status) })
    expect(aborted).toEqual(['start', 'stopped'])
  })

  it('treats an AbortError as stopped, not failed, and does not record', async () => {
    const a = src('a.md'), b = src('b.md')
    const agent = vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) })
    const result = await run([a, b], agent)
    expect(result).toEqual({ done: [], failed: [], stopped: true })
    expect(agent).toHaveBeenCalledTimes(1)
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([])
  })

  it('treats a rejection with shouldStop true as stopped', async () => {
    const a = src('a.md')
    let stop = false
    const result = await run([a], async () => { stop = true; throw new Error('x') }, { shouldStop: () => stop })
    expect(result).toEqual({ done: [], failed: [], stopped: true })
  })

  it('does not record the in-flight source when stopped after runAgent returns', async () => {
    const a = src('a.md')
    let stop = false
    const result = await run([a], async ({ source, tool }) => { await write(tool, 'p', source.rel); stop = true }, { shouldStop: () => stop })
    expect(result).toEqual({ done: [], failed: [], stopped: true })
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([])
  })

  it('passes previous and hand-edited pages on update and stores the new hash', async () => {
    const a = src('a.md', 'first version of the source text. '.repeat(4))
    await run([a], async ({ source, tool }) => {
      await write(tool, 'one', source.rel); await write(tool, 'two', source.rel); await write(tool, 'three', source.rel)
    })
    fs.writeFileSync(path.join(root, 'wiki', 'en', 'two.md'), pageText('two', [a.rel], 'USER EDIT'))
    fs.rmSync(path.join(root, 'wiki', 'en', 'three.md'))
    fs.writeFileSync(a.abs, 'second version of the source text. '.repeat(6))
    const agent = vi.fn(async ({ source, tool }) => { await write(tool, 'one', source.rel, 'v2') })
    await run([a], agent)
    const arg = agent.mock.calls[0][0]
    expect([...arg.previousPages].sort()).toEqual(['wiki/en/one.md', 'wiki/en/three.md', 'wiki/en/two.md'])
    expect(arg.handEditedPages).toEqual(['wiki/en/two.md'])
    expect(typeof arg.schemaText).toBe('string')
    expect(arg.source.rel).toBe(a.rel)
    expect((await readRegistry(registryFile)).sources[a.rel].hash).toBe(await sha256File(a.abs))
  })

  it('keeps a hand-edited page protected after an agent minimally edits it', async () => {
    const a = src('a.md')
    await run([a], okAgent())
    const title = 'a summary'
    const rel = `wiki/en/${title}.md`
    fs.writeFileSync(path.join(root, rel), pageText(title, [a.rel], 'USER EDIT'))
    await run([a], async ({ tool }) => {
      const edit = await tool.execute('c', { operation: 'edit_wiki', path: rel, oldText: 'Body of a summary.', newText: 'Revised summary.' })
      expect(edit.details.userEdited).toBe(true)
    })
    const registered = (await readRegistry(registryFile)).pages[rel]
    expect(registered.hash).toBe(await sha256File(path.join(root, rel)))
    expect(registered.handEdited).toBe(true)
    await run([a], async ({ tool, handEditedPages }) => {
      expect(handEditedPages).toEqual([rel])
      expect((await write(tool, title, a.rel)).isError).toBe(true)
    })
    expect(wikiRead(`${title}.md`)).toContain('Revised summary. USER EDIT')
  })

  it('records pre-run hash/mtime/size so a mid-run edit shows as updated', async () => {
    const original = 'original source text here. '.repeat(5)
    const a = src('a.md', original)
    const before = await sha256File(a.abs)
    await run([a], async ({ source, tool }) => {
      await write(tool, 'p', source.rel)
      fs.writeFileSync(a.abs, 'changed during the run, and longer. '.repeat(9))
      const result = await tool.execute('c', { operation: 'read_source', path: source.rel })
      expect(result.content[0].text).toContain(original)
    })
    const reg = await readRegistry(registryFile)
    expect(reg.sources[a.rel].hash).toBe(before)
    const scanned = await scanKnowledgeFiles(root)
    expect(classifySources({ scanned, registry: reg }).find(s => s.rel === a.rel).state).toBe('updated')
  })

  it('preserves registry changes made on disk during a source run', async () => {
    const a = src('a.md'), b = src('b.md')
    const agent = vi.fn(async ({ source, tool }) => {
      await write(tool, 'p-' + path.basename(source.rel), source.rel)
      if (source.rel === a.rel) {
        const reg = await readRegistry(registryFile)
        await writeRegistry(registryFile, recordIngested(reg, entry('kb_source/other.md')))
      }
    })
    await run([a, b], agent)
    expect(Object.keys((await readRegistry(registryFile)).sources).sort()).toEqual([a.rel, b.rel, 'kb_source/other.md'].sort())
  })

  it('rejects a concurrent run on the same registry with INGEST_BUSY and releases afterwards', async () => {
    const a = src('a.md')
    let release
    const gate = new Promise(r => { release = r })
    const first = run([a], async ({ source, tool }) => { await gate; await write(tool, 'p', source.rel) })
    try {
      const alias = path.dirname(registryFile) + path.sep + '.' + path.sep + path.basename(registryFile)
      await expect(run([a], okAgent(), { registryFile: alias })).rejects.toMatchObject({ code: 'INGEST_BUSY' })
    } finally {
      release()
    }
    await first
    await expect(run([a], okAgent())).resolves.toMatchObject({ stopped: false })
  })

  it('releases the lock when the run throws', async () => {
    const a = src('a.md')
    await expect(run([a], okAgent(), { shouldStop: () => { throw new Error('bad') } })).rejects.toThrow('bad')
    await expect(run([a], okAgent())).resolves.toMatchObject({ stopped: false })
  })

  it('emits start then done/failed progress and survives a throwing callback', async () => {
    const a = src('a.md'), b = src('b.md')
    const events = []
    const onProgress = e => { events.push(e); throw new Error('ui') }
    await run([a, b], async ({ source, tool }) => {
      if (source.rel === b.rel) throw new Error('x')
      await write(tool, 'p', source.rel)
    }, { onProgress })
    expect(events.map(e => [e.index, e.total, e.rel, e.status])).toEqual([
      [0, 2, a.rel, 'start'], [0, 2, a.rel, 'done'], [1, 2, b.rel, 'start'], [1, 2, b.rel, 'failed']
    ])
    expect(events[1].pages).toEqual(['wiki/en/p.md'])
  })
})

describe('buildIngestPlan', () => {
  const emptyReg = () => ({ version: 1, sources: {}, pages: {} })

  it('marks unrecorded files as new and sorts by path', async () => {
    src('b.md'); src('a.md')
    const plan = await buildIngestPlan({ root, languages: ['en'], registry: emptyReg() })
    expect(plan.sources.map(s => [s.rel, s.state])).toEqual([['kb_source/a.md', 'new'], ['kb_source/b.md', 'new']])
    expect(plan).toMatchObject({ refreshed: [], removed: [], overflow: 0 })
  })

  it('moves updated-but-same-content files to refreshed', async () => {
    const a = src('a.md'), b = src('b.md', 'b text. '.repeat(10))
    let registry = recordIngested(emptyReg(), entry(a.rel, { hash: await sha256File(a.abs) }))
    registry = recordIngested(registry, entry(b.rel, { hash: 'different' }))
    const plan = await buildIngestPlan({ root, languages: ['en'], registry })
    expect(plan.refreshed).toEqual([a.rel])
    expect(plan.sources.map(s => [s.rel, s.state])).toEqual([[b.rel, 'updated']])
  })

  it('keeps an unreadable updated source in the plan', async () => {
    const a = src('a.md')
    const registry = recordIngested(emptyReg(), entry(a.rel))
    const hashFile = vi.fn().mockRejectedValue(new Error('unreadable'))
    const plan = await buildIngestPlan({ root, languages: ['en'], registry, hashFile })
    expect(plan.refreshed).toEqual([])
    expect(plan.sources.map(s => [s.rel, s.state])).toEqual([[a.rel, 'updated']])
  })

  it('caps at MAX_SOURCES_PER_RUN and reports overflow', async () => {
    expect(MAX_SOURCES_PER_RUN).toBe(30)
    for (let i = 0; i < 33; i++) src(`f${String(i).padStart(2, '0')}.md`)
    const plan = await buildIngestPlan({ root, languages: ['en'], registry: emptyReg() })
    expect(plan.sources).toHaveLength(30)
    expect(plan.overflow).toBe(3)
  })

  it('applies the ingested filter before the cap so ingested files take no slots', async () => {
    const rels = []
    let registry = emptyReg()
    for (let i = 0; i < 31; i++) {
      const f = src(`f${String(i).padStart(2, '0')}.md`)
      const st = fs.statSync(f.abs)
      registry = recordIngested(registry, entry(f.rel, { mtimeMs: st.mtimeMs, size: st.size }))
      rels.push(f.rel)
    }
    const fresh = src('zz-new.md')
    rels.push(fresh.rel)
    const plan = await buildIngestPlan({ root, languages: ['en'], registry, only: rels, includeIngested: false })
    expect(plan.sources.map(s => [s.rel, s.state])).toEqual([[fresh.rel, 'new']])
    expect(plan.overflow).toBe(0)
    const forced = await buildIngestPlan({ root, languages: ['en'], registry, only: rels })
    expect(forced.sources).toHaveLength(30)
    expect(forced.overflow).toBe(2)
  })

  it('reports registry sources missing on disk as removed', async () => {
    src('a.md')
    const registry = recordIngested(emptyReg(), entry('kb_source/gone.md'))
    expect((await buildIngestPlan({ root, languages: ['en'], registry })).removed).toEqual(['kb_source/gone.md'])
  })

  it('excludes ingested files without only, includes them (state ingested) with only', async () => {
    const a = src('a.md'), b = src('b.md')
    const st = fs.statSync(a.abs)
    const registry = recordIngested(emptyReg(), entry(a.rel, { mtimeMs: st.mtimeMs, size: st.size }))
    expect((await buildIngestPlan({ root, languages: ['en'], registry })).sources.map(s => s.rel)).toEqual([b.rel])
    const forced = await buildIngestPlan({ root, languages: ['en'], registry, only: [a.rel] })
    expect(forced.sources.map(s => [s.rel, s.state])).toEqual([[a.rel, 'ingested']])
  })
})

describe('runIngest with several languages', () => {
  const BOTH = ['en', 'zh']
  const runBoth = (sources, runAgent, extra = {}) => run(sources, runAgent, { languages: BOTH, ...extra })
  const writeIn = (tool, lang, title, source) =>
    tool.execute('c', { operation: 'write_wiki', path: `wiki/${lang}/${title}.md`, content: pageText(title, [source]) })
  // Writes one summary page into the unit's own language folder.
  const langAgent = () => vi.fn(async ({ source, tool, lang }) => {
    await writeIn(tool, lang, `${path.basename(source.rel, '.md')} ${lang}`, source.rel)
  })

  it('runs one unit per source and language with its own root, scaffold, log and registry record', async () => {
    const a = src('a.md'), b = src('b.md')
    const agent = langAgent()
    const events = []
    const result = await runBoth([a, b], agent, { onProgress: e => events.push(e) })

    expect(result).toEqual({ done: [a.rel, b.rel], failed: [], stopped: false })
    expect(agent.mock.calls.map(([arg]) => [arg.source.rel, arg.lang, arg.wikiRoot])).toEqual([
      [a.rel, 'en', 'wiki/en'], [a.rel, 'zh', 'wiki/zh'], [b.rel, 'en', 'wiki/en'], [b.rel, 'zh', 'wiki/zh']
    ])
    for (const lang of BOTH) {
      expect(fs.readdirSync(path.join(root, 'wiki', lang)).sort()).toEqual([
        'SCHEMA.md', 'a ' + lang + '.md', 'b ' + lang + '.md', 'index.md', 'log.md'
      ].sort())
      expect(wikiRead('SCHEMA.md', lang)).toContain(`wiki/${lang}/log.md`)
      expect(wikiRead('log.md', lang)).toContain('ingest | kb_source/a.md')
      expect(wikiRead('index.md', lang)).toContain(`[[a ${lang}]]`)
      expect(wikiRead('index.md', lang)).not.toContain(lang === 'en' ? 'zh]]' : 'en]]')
    }
    expect(fs.readdirSync(path.join(root, 'wiki')).sort()).toEqual(['en', 'zh'])

    const reg = await readRegistry(registryFile)
    expect(Object.keys(reg.sources[a.rel].langs)).toEqual(['en', 'zh'])
    expect(reg.sources[a.rel].langs.en.pages).toEqual(['wiki/en/a en.md'])
    expect(reg.sources[a.rel].langs.zh.pages).toEqual(['wiki/zh/a zh.md'])
    expect(Object.keys(reg.pages).sort()).toEqual(['wiki/en/a en.md', 'wiki/en/b en.md', 'wiki/zh/a zh.md', 'wiki/zh/b zh.md'])

    expect(events.filter(e => e.status === 'start').map(e => [e.index, e.total, e.rel, e.lang])).toEqual([
      [0, 4, a.rel, 'en'], [1, 4, a.rel, 'zh'], [2, 4, b.rel, 'en'], [3, 4, b.rel, 'zh']
    ])
    expect(events.filter(e => e.status === 'done').map(e => [e.index, e.lang, e.pages])).toEqual([
      [0, 'en', ['wiki/en/a en.md']], [1, 'zh', ['wiki/zh/a zh.md']], [2, 'en', ['wiki/en/b en.md']], [3, 'zh', ['wiki/zh/b zh.md']]
    ])
  })

  it('confines each unit to its own language folder', async () => {
    const a = src('a.md')
    const outcomes = []
    await runBoth([a], async ({ source, tool, lang }) => {
      const other = lang === 'en' ? 'zh' : 'en'
      outcomes.push((await writeIn(tool, other, 'leak', source.rel)).isError === true)
      outcomes.push((await tool.execute('c', { operation: 'write_wiki', path: 'wiki/flat.md', content: pageText('flat', [source.rel]) })).isError === true)
      await writeIn(tool, lang, 'ok', source.rel)
    })
    expect(outcomes).toEqual([true, true, true, true])
    expect(fs.existsSync(path.join(root, 'wiki', 'flat.md'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'wiki', 'en', 'leak.md'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'wiki', 'zh', 'leak.md'))).toBe(false)
  })

  it('records only the language that succeeded when the other one fails', async () => {
    const a = src('a.md')
    const agent = vi.fn(async ({ source, tool, lang }) => {
      if (lang === 'zh') throw new Error('zh boom')
      await writeIn(tool, lang, 'a en', source.rel)
    })
    const result = await runBoth([a], agent)
    expect(result.done).toEqual([])
    expect(result.failed).toEqual([{ rel: a.rel, lang: 'zh', reason: 'agent_error', detail: 'zh boom' }])
    const reg = await readRegistry(registryFile)
    expect(Object.keys(reg.sources[a.rel].langs)).toEqual(['en'])
    expect(reg.sources[a.rel].pages).toEqual(['wiki/en/a en.md'])
  })

  it('reports a failed source for every language and counts each as a unit', async () => {
    const a = src('a.md')
    fs.rmSync(a.abs)
    const events = []
    const result = await runBoth([a], langAgent(), { onProgress: e => events.push(e) })
    expect(result.failed).toEqual([
      { rel: a.rel, lang: 'en', reason: 'read_failed', detail: expect.stringContaining('ENOENT') },
      { rel: a.rel, lang: 'zh', reason: 'read_failed', detail: expect.stringContaining('ENOENT') }
    ])
    expect(events.map(e => [e.index, e.total, e.lang, e.status])).toEqual([
      [0, 2, 'en', 'start'], [0, 2, 'en', 'failed'], [1, 2, 'zh', 'start'], [1, 2, 'zh', 'failed']
    ])
  })

  it('re-offers an ingested source only for a language added later', async () => {
    const a = src('a.md'), b = src('b.md')
    await run([a, b], langAgent(), { languages: ['en'] })
    const afterEnglish = await readRegistry(registryFile)

    expect((await buildIngestPlan({ root, registry: afterEnglish, languages: ['en'] })).sources).toEqual([])
    const plan = await buildIngestPlan({ root, registry: afterEnglish, languages: BOTH })
    expect(plan.sources.map(s => [s.rel, s.state, s.langs])).toEqual([[a.rel, 'ingested', ['zh']], [b.rel, 'ingested', ['zh']]])

    const agent = langAgent()
    const result = await run(plan.sources, agent, { languages: BOTH })
    expect(result.done).toEqual([a.rel, b.rel])
    expect(agent.mock.calls.map(([arg]) => [arg.source.rel, arg.lang, arg.previousPages])).toEqual([
      [a.rel, 'zh', []], [b.rel, 'zh', []]
    ])
    const reg = await readRegistry(registryFile)
    expect(Object.keys(reg.sources[a.rel].langs)).toEqual(['en', 'zh'])
    expect(reg.sources[a.rel].langs.en).toEqual(afterEnglish.sources[a.rel].langs.en)
    expect((await buildIngestPlan({ root, registry: reg, languages: BOTH })).sources).toEqual([])
  })

  it('makes every language stale when the source changed and passes language-specific previous pages', async () => {
    const a = src('a.md', 'first version of the source text. '.repeat(4))
    await runBoth([a], langAgent())
    fs.writeFileSync(a.abs, 'second version of the source text. '.repeat(6))
    const registry = await readRegistry(registryFile)
    const plan = await buildIngestPlan({ root, registry, languages: BOTH })
    expect(plan.sources.map(s => [s.state, s.langs])).toEqual([['updated', ['en', 'zh']]])

    const agent = langAgent()
    await runBoth(plan.sources, agent)
    expect(agent.mock.calls.map(([arg]) => [arg.lang, arg.previousPages])).toEqual([
      ['en', ['wiki/en/a en.md']], ['zh', ['wiki/zh/a zh.md']]
    ])
    const hash = await sha256File(a.abs)
    const reg = await readRegistry(registryFile)
    expect([reg.sources[a.rel].langs.en.hash, reg.sources[a.rel].langs.zh.hash]).toEqual([hash, hash])
  })

  it('marks the language that missed a newer version as pending after a partial run', async () => {
    const a = src('a.md', 'first version of the source text. '.repeat(4))
    await runBoth([a], langAgent())
    fs.writeFileSync(a.abs, 'second version of the source text. '.repeat(6))
    const plan = await buildIngestPlan({ root, registry: await readRegistry(registryFile), languages: BOTH })
    await runBoth(plan.sources, vi.fn(async ({ source, tool, lang }) => {
      if (lang === 'zh') throw new Error('zh down')
      await writeIn(tool, lang, 'a en', source.rel)
    }))
    const next = await buildIngestPlan({ root, registry: await readRegistry(registryFile), languages: BOTH })
    expect(next.sources.map(s => [s.state, s.langs])).toEqual([['ingested', ['zh']]])
  })

  it('counts consecutive agent errors per unit', async () => {
    const files = ['a', 'b', 'c'].map(n => src(n + '.md'))
    const agent = vi.fn(async () => { throw new Error('401 invalid key') })
    const result = await runBoth(files, agent)
    expect(agent).toHaveBeenCalledTimes(3)
    expect(result.aborted).toBe('consecutive_agent_errors')
    expect(result.failed.map(f => [f.rel, f.lang])).toEqual([[files[0].rel, 'en'], [files[0].rel, 'zh'], [files[1].rel, 'en']])
  })

  it('resets the error streak after a successful unit of the other language', async () => {
    const a = src('a.md'), b = src('b.md')
    const agent = vi.fn(async ({ source, tool, lang }) => {
      if (lang === 'en') throw new Error('en boom')
      await writeIn(tool, lang, 'ok', source.rel)
    })
    const result = await runBoth([a, b], agent)
    expect(agent).toHaveBeenCalledTimes(4)
    expect(result.aborted).toBeUndefined()
    expect(result.failed).toHaveLength(2)
  })

  it('stops between the languages of one source and keeps the finished language', async () => {
    const a = src('a.md')
    let stop = false
    const agent = vi.fn(async ({ source, tool, lang }) => {
      await writeIn(tool, lang, 'a ' + lang, source.rel)
    })
    const result = await runBoth([a], agent, {
      shouldStop: () => stop,
      onProgress: ({ status, lang }) => { if (status === 'done' && lang === 'en') stop = true }
    })
    expect(result).toEqual({ done: [], failed: [], stopped: true })
    expect(agent).toHaveBeenCalledTimes(1)
    expect(Object.keys((await readRegistry(registryFile)).sources[a.rel].langs)).toEqual(['en'])
  })

  it('uses the per-source language list before the run-wide languages', async () => {
    const a = src('a.md'), b = src('b.md')
    const agent = langAgent()
    const events = []
    await runBoth([{ ...a, langs: ['zh'] }, b], agent, { onProgress: e => events.push(e) })
    expect(agent.mock.calls.map(([arg]) => [arg.source.rel, arg.lang])).toEqual([[a.rel, 'zh'], [b.rel, 'en'], [b.rel, 'zh']])
    expect(events[0]).toMatchObject({ index: 0, total: 3, lang: 'zh' })
  })

  it('rejects invalid languages before writing anything', async () => {
    const a = src('a.md')
    const agent = langAgent()
    for (const languages of [[], ['fr'], ['en', 'fr'], undefined, 'en']) {
      await expect(run([a], agent, { languages })).rejects.toMatchObject({ code: 'invalid_language' })
    }
    expect(agent).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(root, 'wiki'))).toBe(false)
    expect(fs.existsSync(registryFile)).toBe(false)
  })

  it('deduplicates languages and keeps the stable order', async () => {
    const a = src('a.md')
    const agent = langAgent()
    await run([a], agent, { languages: ['zh', 'en', 'zh'] })
    expect(agent.mock.calls.map(([arg]) => arg.lang)).toEqual(['en', 'zh'])
  })
})

describe('buildIngestPlan languages', () => {
  const emptyReg = () => ({ version: 1, sources: {}, pages: {} })

  it('requires a valid language selection', async () => {
    src('a.md')
    for (const languages of [undefined, [], ['fr'], 'en']) {
      await expect(buildIngestPlan({ root, registry: emptyReg(), languages })).rejects.toMatchObject({ code: 'invalid_language' })
    }
  })

  it('lists a new source for every selected language, deduplicated and in stable order', async () => {
    src('a.md')
    const plan = await buildIngestPlan({ root, registry: emptyReg(), languages: ['zh', 'en', 'zh'] })
    expect(plan.sources.map(s => s.langs)).toEqual([['en', 'zh']])
    expect((await buildIngestPlan({ root, registry: emptyReg(), languages: ['zh'] })).sources.map(s => s.langs)).toEqual([['zh']])
  })

  it('treats a legacy record without langs as not ingested', async () => {
    const a = src('a.md')
    const st = fs.statSync(a.abs)
    fs.mkdirSync(path.dirname(registryFile), { recursive: true })
    fs.writeFileSync(registryFile, JSON.stringify({
      version: 1,
      sources: { [a.rel]: { hash: 'h', mtimeMs: st.mtimeMs, size: st.size, ingestedAt: 'x', pages: ['wiki/old.md'] } },
      pages: {}
    }))
    const plan = await buildIngestPlan({ root, registry: await readRegistry(registryFile), languages: ['en'] })
    expect(plan.sources.map(s => [s.rel, s.state, s.langs])).toEqual([[a.rel, 'new', ['en']]])
  })

  it('forces every selected language for an explicitly requested ingested source', async () => {
    const a = src('a.md')
    const st = fs.statSync(a.abs)
    const registry = recordIngested(emptyReg(), entry(a.rel, { mtimeMs: st.mtimeMs, size: st.size }))
    const forced = await buildIngestPlan({ root, registry, only: [a.rel], languages: ['en', 'zh'] })
    expect(forced.sources.map(s => [s.state, s.langs])).toEqual([['ingested', ['en', 'zh']]])
    const notForced = await buildIngestPlan({ root, registry, only: [a.rel], includeIngested: false, languages: ['en', 'zh'] })
    expect(notForced.sources.map(s => s.langs)).toEqual([['zh']])
  })
})

describe('parallel source batches', () => {
  it.each([[5, 6], [10, 3]])('starts %s-source batches concurrently with %s lanes', async (batchSize, lanes) => {
    const sources = Array.from({ length: 30 }, (_, index) => src('source-' + index + '.md'))
    let signalStarted
    let release
    const started = new Promise(resolve => { signalStarted = resolve })
    const gate = new Promise(resolve => { release = resolve })
    const firstCalls = []
    const progress = []
    const agent = vi.fn(async ({ source, tool }) => {
      firstCalls.push(source.rel)
      if (firstCalls.length === lanes) signalStarted()
      await gate
      await write(tool, path.basename(source.rel, '.md'), source.rel)
    })
    const pending = run(sources, agent, { batchSize, onProgress: event => progress.push(event) })
    await started
    try {
      expect(firstCalls.slice().sort()).toEqual(
        sources.filter((_, index) => index % batchSize === 0).map(source => source.rel).sort(),
      )
    } finally {
      release()
    }
    const completion = await pending
    expect(completion).toEqual({ done: sources.map(source => source.rel), failed: [], stopped: false })
    expect(progress.filter(event => event.status === 'done').map(event => event.completed))
      .toEqual(Array.from({ length: 30 }, (_, index) => index + 1))
    expect(wikiRead('log.md').match(/## .* ingest \|/g)).toHaveLength(30)
    for (const source of sources) expect(wikiRead('index.md')).toContain('[[' + path.basename(source.rel, '.md') + ']]')
  })

  it('preserves shared page ownership, citations and the committed registry hash', async () => {
    const sources = Array.from({ length: 6 }, (_, index) => src('doc-' + index + '.md'))
    const first = sources[0].rel
    const second = sources[5].rel
    let notifyWritten, notifyConflict, notifyCommitted
    const written = new Promise(resolve => { notifyWritten = resolve })
    const conflict = new Promise(resolve => { notifyConflict = resolve })
    const committed = new Promise(resolve => { notifyCommitted = resolve })
    const agent = vi.fn(async ({ source, tool }) => {
      if (source.rel === first) {
        expect((await write(tool, 'Shared', first)).isError).toBeUndefined()
        notifyWritten()
        await conflict
      }
      if (source.rel === second) {
        await written
        try {
          const busy = await write(tool, 'Shared', second)
          expect(busy.isError).toBe(true)
          expect(busy.content[0].text).toContain('Another batch')
        } finally {
          notifyConflict()
        }
        await committed
        expect((await write(tool, 'Shared', second)).isError).toBe(true)
        const target = 'wiki/en/Shared.md'
        const edit = (oldText, newText) => tool.execute('edit', { operation: 'edit_wiki', path: target, oldText, newText })
        expect((await edit('sources: [' + first + ']', 'sources: [' + second + ']')).isError).toBe(true)
        expect((await edit('sources: [' + first + ']', 'sources: [' + first + ', ' + second + ']')).isError).toBeUndefined()
        expect((await tool.execute('index', { operation: 'write_wiki', path: 'wiki/en/index.md', content: '# Overwrite' })).isError).toBe(true)
      }
      await write(tool, path.basename(source.rel, '.md'), source.rel)
    })
    const result = await run(sources, agent, {
      batchSize: 5,
      onProgress: event => { if (event.rel === first && event.status === 'done') notifyCommitted() },
    })
    expect(result.failed).toEqual([])
    expect(result.done).toHaveLength(6)
    const registry = await readRegistry(registryFile)
    expect(registry.pages['wiki/en/Shared.md']).toMatchObject({
      hash: sha256Text(wikiRead('Shared.md')), sources: [first, second],
    })
    expect(registry.pages['wiki/en/Shared.md'].handEdited).toBeUndefined()
  })
})
