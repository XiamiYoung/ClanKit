import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const {
  registryPathFor, readRegistry, writeRegistry, recordIngested, classifySources, removedSources
} = require('../aidocRegistry')
const { readIngestedSources } = require('../aidocGraph')
const { rootHash } = require('../aidocIndex')

const dirs = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})
async function tmp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-reg-'))
  dirs.push(dir)
  return dir
}
const empty = () => ({ version: 1, sources: {}, pages: {} })
const page = (rel, extra = {}) => ({ rel, hash: 'h-' + rel, type: 'concept', title: rel, sources: [], updated: 'd', ...extra })
const entry = (rel, pages, extra = {}) => ({
  rel, hash: 'sh', mtimeMs: 10, size: 5, ingestedAt: '2026-01-01T00:00:00Z', pages, ...extra
})

describe('registryPathFor', () => {
  it('builds the per-root registry path', () => {
    const root = path.resolve('some-root')
    expect(registryPathFor('/data', root)).toBe(path.join('/data', 'aidoc-ingest', rootHash(root) + '.json'))
  })
})

describe('readRegistry', () => {
  it('returns an empty record for missing, corrupt and wrong-version files', async () => {
    const dir = await tmp()
    expect(await readRegistry(path.join(dir, 'nope.json'))).toEqual(empty())
    await fs.writeFile(path.join(dir, 'bad.json'), '{trunc')
    expect(await readRegistry(path.join(dir, 'bad.json'))).toEqual(empty())
    await fs.writeFile(path.join(dir, 'v.json'), JSON.stringify({ version: 99, sources: { a: {} }, pages: {} }))
    expect(await readRegistry(path.join(dir, 'v.json'))).toEqual(empty())
  })

  it('drops malformed source and page records', async () => {
    const dir = await tmp()
    const f = path.join(dir, 'r.json')
    await fs.writeFile(f, JSON.stringify({
      version: 1,
      sources: {
        good: { hash: 'h', ingestedAt: 'x', pages: [], size: 1 },
        bad1: { hash: 1, ingestedAt: 'x', pages: [] },
        bad2: { hash: 'h', ingestedAt: 'x', pages: 'no' },
        bad3: null
      },
      pages: { p: { hash: 'h', extra: 1 }, q: { hash: 5 }, r: null }
    }))
    const reg = await readRegistry(f)
    expect(Object.keys(reg.sources)).toEqual(['good'])
    expect(reg.sources.good.size).toBe(1)
    expect(Object.keys(reg.pages)).toEqual(['p'])
  })
})

describe('writeRegistry', () => {
  it('round-trips, creates the directory and leaves no tmp file', async () => {
    const dir = await tmp()
    const f = path.join(dir, 'nested', 'r.json')
    const reg = recordIngested(empty(), entry('kb_source/a.md', [page('wiki/a.md')]))
    await writeRegistry(f, reg)
    expect(await readRegistry(f)).toEqual(reg)
    expect(await fs.readdir(path.dirname(f))).toEqual(['r.json'])
  })
})

describe('recordIngested', () => {
  it('does not mutate input and records source and pages', () => {
    const reg = empty()
    const snapshot = JSON.stringify(reg)
    const next = recordIngested(reg, entry('kb_source/a.md', [page('wiki/a.md')]))
    expect(JSON.stringify(reg)).toBe(snapshot)
    expect(next.sources['kb_source/a.md']).toMatchObject({
      hash: 'sh', mtimeMs: 10, size: 5, ingestedAt: '2026-01-01T00:00:00Z', pages: ['wiki/a.md']
    })
    expect(next.pages['wiki/a.md']).toMatchObject({ hash: 'h-wiki/a.md', type: 'concept' })
  })

  it('shrinks the source page list but keeps old page entries', () => {
    const first = recordIngested(empty(), entry('kb_source/a.md', [page('wiki/a.md'), page('wiki/b.md')]))
    const second = recordIngested(first, entry('kb_source/a.md', [page('wiki/a.md')]))
    expect(second.sources['kb_source/a.md'].pages).toEqual(['wiki/a.md'])
    expect(Object.keys(second.pages).sort()).toEqual(['wiki/a.md', 'wiki/b.md'])
  })
})

describe('classifySources', () => {
  const scan = (rel, mtimeMs = 10, size = 5) => ({
    rel, abs: path.resolve(rel), ext: rel.split('.').at(-1), mtimeMs, size
  })
  const registry = recordIngested(empty(), entry('kb_source/done.md', []))

  it('classifies new, updated and ingested sources', () => {
    const scanned = [
      scan('kb_source/done.md'), scan('kb_source/mt.md'), scan('kb_source/new.md'), scan('kb_source/sz.md')
    ]
    const reg = recordIngested(recordIngested(registry, entry('kb_source/mt.md', [])), entry('kb_source/sz.md', []))
    reg.sources['kb_source/mt.md'].mtimeMs = 99
    reg.sources['kb_source/sz.md'].size = 99
    const out = Object.fromEntries(classifySources({ scanned, registry: reg }).map(s => [s.rel, s.state]))
    expect(out).toEqual({
      'kb_source/done.md': 'ingested', 'kb_source/mt.md': 'updated',
      'kb_source/new.md': 'new', 'kb_source/sz.md': 'updated'
    })
  })

  it('excludes wiki files and non-ingestible extensions', () => {
    const out = classifySources({
      scanned: [scan('wiki/a.md'), scan('kb_source/d.drawio'), scan('kb_source/x.xlsx'), scan('kb_source/ok.pdf')],
      registry: empty()
    })
    expect(out.map(s => s.rel)).toEqual(['kb_source/ok.pdf'])
    expect(out[0]).toMatchObject({ abs: path.resolve('kb_source/ok.pdf'), size: 5, mtimeMs: 10, state: 'new' })
  })
})

describe('removedSources', () => {
  it('lists recorded sources missing from disk', () => {
    const registry = recordIngested(recordIngested(empty(), entry('kb_source/a.md', [])), entry('kb_source/b.md', []))
    expect(removedSources({ scanned: [{ rel: 'kb_source/a.md' }], registry })).toEqual(['kb_source/b.md'])
  })
})

describe('aidocGraph.readIngestedSources delegation', () => {
  it('returns the sources map from the registry file', async () => {
    const dataDir = await tmp()
    const root = path.join(dataDir, 'root')
    const reg = recordIngested(empty(), entry('kb_source/a.md', [page('wiki/a.md')]))
    await writeRegistry(registryPathFor(dataDir, root), reg)
    expect(await readIngestedSources(dataDir, root)).toEqual(reg.sources)
    expect(await readIngestedSources(dataDir, path.join(dataDir, 'other'))).toEqual({})
  })
})
