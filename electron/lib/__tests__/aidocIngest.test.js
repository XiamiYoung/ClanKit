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
  tool.execute('c', { operation: 'write_wiki', path: `wiki/${title}.md`, content: pageText(title, [source], extra) })
const wikiRead = name => fs.readFileSync(path.join(root, 'wiki', name), 'utf8')
const entry = (rel, extra = {}) => ({ rel, hash: 'h', mtimeMs: 1, size: 1, ingestedAt: 'x', pages: [], ...extra })

// Fake agent: writes one summary page per source (plus an optional shared page) through the real tool.
const okAgent = (opts = {}) => vi.fn(async ({ source, tool }) => {
  const base = path.basename(source.rel, path.extname(source.rel))
  await write(tool, base + ' summary', source.rel)
  if (opts.extra) await write(tool, opts.extra, source.rel)
})
const run = (sources, runAgent, extra = {}) => runIngest({ root, registryFile, sources, runAgent, now: NOW, ...extra })

describe('runIngest', () => {
  it('ingests sources sequentially, records pages, log and index coverage', async () => {
    const a = src('a.md'), b = src('b.md')
    const result = await run([a, b], okAgent({ extra: 'Shared Concept' }))
    expect(result).toEqual({ done: [a.rel, b.rel], failed: [], stopped: false })
    const reg = await readRegistry(registryFile)
    expect(Object.keys(reg.sources).sort()).toEqual([a.rel, b.rel])
    expect([...reg.sources[a.rel].pages].sort()).toEqual(['wiki/Shared Concept.md', 'wiki/a summary.md'])
    for (const [rel, rec] of Object.entries(reg.pages)) {
      expect(rec.hash).toBe(sha256Text(fs.readFileSync(path.join(root, rel), 'utf8')))
      expect(rec.type).toBe('concept')
    }
    expect(reg.sources[a.rel].hash).toBe(await sha256File(a.abs))
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
        done: [b.rel], failed: [{ rel: pdf.rel, reason: 'scanned_pdf' }], stopped: false
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
    expect(result.failed).toEqual([{ rel: a.rel, reason: 'agent_error', detail: 'boom' }])
    expect(result.done).toEqual([b.rel])
    expect(fs.existsSync(path.join(root, 'wiki', 'Partial.md'))).toBe(true)
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([b.rel])
  })

  it('reports read_failed when a planned source disappears and continues', async () => {
    const a = src('a.md'), b = src('b.md')
    fs.rmSync(a.abs)
    const agent = okAgent()
    const result = await run([a, b], agent)
    expect(result).toEqual({
      done: [b.rel], failed: [{ rel: a.rel, reason: 'read_failed', detail: expect.stringContaining('ENOENT') }], stopped: false
    })
    expect(agent).toHaveBeenCalledTimes(1)
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([b.rel])
  })

  it('reports record_failed when index coverage fails and leaves the source retryable', async () => {
    const a = src('a.md'), b = src('b.md')
    const indexPath = path.join(root, 'wiki', 'index.md')
    let index
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
    })
    expect(result).toEqual({
      done: [b.rel], failed: [{ rel: a.rel, reason: 'record_failed', detail: expect.any(String) }], stopped: false
    })
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([b.rel])
    expect(wikiRead('a.md')).toContain('Body of a.')
    expect(wikiRead('log.md')).not.toContain(a.rel)
  })

  it('fails with no_pages when the agent writes nothing', async () => {
    const a = src('a.md')
    const result = await run([a], vi.fn(async () => {}))
    expect(result.failed).toEqual([{ rel: a.rel, reason: 'no_pages' }])
    expect(Object.keys((await readRegistry(registryFile)).sources)).toEqual([])
  })

  it('does not register index.md as a page', async () => {
    const a = src('a.md')
    await run([a], vi.fn(async ({ source, tool }) => {
      await write(tool, 'a summary', source.rel)
      await tool.execute('c', { operation: 'write_wiki', path: 'wiki/index.md', content: '# Index\n- [[a summary]] - x\n' })
    }))
    expect(Object.keys((await readRegistry(registryFile)).pages)).toEqual(['wiki/a summary.md'])
  })

  it('skips registering a written page that disappeared', async () => {
    const a = src('a.md')
    const result = await run([a], vi.fn(async ({ source, tool }) => {
      await write(tool, 'keep', source.rel)
      await write(tool, 'gone', source.rel)
      fs.rmSync(path.join(root, 'wiki', 'gone.md'))
    }))
    expect(result.done).toEqual([a.rel])
    expect((await readRegistry(registryFile)).sources[a.rel].pages).toEqual(['wiki/keep.md'])
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
    fs.writeFileSync(path.join(root, 'wiki', 'two.md'), pageText('two', [a.rel], 'USER EDIT'))
    fs.rmSync(path.join(root, 'wiki', 'three.md'))
    fs.writeFileSync(a.abs, 'second version of the source text. '.repeat(6))
    const agent = vi.fn(async ({ source, tool }) => { await write(tool, 'one', source.rel, 'v2') })
    await run([a], agent)
    const arg = agent.mock.calls[0][0]
    expect([...arg.previousPages].sort()).toEqual(['wiki/one.md', 'wiki/three.md', 'wiki/two.md'])
    expect(arg.handEditedPages).toEqual(['wiki/two.md'])
    expect(typeof arg.schemaText).toBe('string')
    expect(arg.source.rel).toBe(a.rel)
    expect((await readRegistry(registryFile)).sources[a.rel].hash).toBe(await sha256File(a.abs))
  })

  it('keeps a hand-edited page protected after an agent minimally edits it', async () => {
    const a = src('a.md')
    await run([a], okAgent())
    const title = 'a summary'
    const rel = `wiki/${title}.md`
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
    expect(events[1].pages).toEqual(['wiki/p.md'])
  })
})

describe('buildIngestPlan', () => {
  const emptyReg = () => ({ version: 1, sources: {}, pages: {} })

  it('marks unrecorded files as new and sorts by path', async () => {
    src('b.md'); src('a.md')
    const plan = await buildIngestPlan({ root, registry: emptyReg() })
    expect(plan.sources.map(s => [s.rel, s.state])).toEqual([['kb_source/a.md', 'new'], ['kb_source/b.md', 'new']])
    expect(plan).toMatchObject({ refreshed: [], removed: [], overflow: 0 })
  })

  it('moves updated-but-same-content files to refreshed', async () => {
    const a = src('a.md'), b = src('b.md', 'b text. '.repeat(10))
    let registry = recordIngested(emptyReg(), entry(a.rel, { hash: await sha256File(a.abs) }))
    registry = recordIngested(registry, entry(b.rel, { hash: 'different' }))
    const plan = await buildIngestPlan({ root, registry })
    expect(plan.refreshed).toEqual([a.rel])
    expect(plan.sources.map(s => [s.rel, s.state])).toEqual([[b.rel, 'updated']])
  })

  it('keeps an unreadable updated source in the plan', async () => {
    const a = src('a.md')
    const registry = recordIngested(emptyReg(), entry(a.rel))
    const hashFile = vi.fn().mockRejectedValue(new Error('unreadable'))
    const plan = await buildIngestPlan({ root, registry, hashFile })
    expect(plan.refreshed).toEqual([])
    expect(plan.sources.map(s => [s.rel, s.state])).toEqual([[a.rel, 'updated']])
  })

  it('caps at MAX_SOURCES_PER_RUN and reports overflow', async () => {
    expect(MAX_SOURCES_PER_RUN).toBe(30)
    for (let i = 0; i < 33; i++) src(`f${String(i).padStart(2, '0')}.md`)
    const plan = await buildIngestPlan({ root, registry: emptyReg() })
    expect(plan.sources).toHaveLength(30)
    expect(plan.overflow).toBe(3)
  })

  it('reports registry sources missing on disk as removed', async () => {
    src('a.md')
    const registry = recordIngested(emptyReg(), entry('kb_source/gone.md'))
    expect((await buildIngestPlan({ root, registry })).removed).toEqual(['kb_source/gone.md'])
  })

  it('excludes ingested files without only, includes them (state ingested) with only', async () => {
    const a = src('a.md'), b = src('b.md')
    const st = fs.statSync(a.abs)
    const registry = recordIngested(emptyReg(), entry(a.rel, { mtimeMs: st.mtimeMs, size: st.size }))
    expect((await buildIngestPlan({ root, registry })).sources.map(s => s.rel)).toEqual([b.rel])
    const forced = await buildIngestPlan({ root, registry, only: [a.rel] })
    expect(forced.sources.map(s => [s.rel, s.state])).toEqual([[a.rel, 'ingested']])
  })
})
