import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const {
  registryPathFor, readRegistry, writeRegistry, updateRegistry, recordIngested, classifySources, removedSources
} = require('../aidocRegistry')
const { readIngestedSources } = require('../aidocGraph')
const { rootHash } = require('../aidocIndex')
const fsPromises = require('fs/promises')

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

  it('removes its tmp file and rethrows when the write fails', async () => {
    const dir = await tmp()
    const f = path.join(dir, 'r.json')
    const spy = vi.spyOn(fsPromises, 'rename').mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOSPC' }))
    try {
      await expect(writeRegistry(f, empty())).rejects.toThrow('nope')
    } finally { spy.mockRestore() }
    expect(await fs.readdir(dir)).toEqual([])
  })

  it('retries the rename on EPERM and then succeeds', async () => {
    const dir = await tmp()
    const f = path.join(dir, 'r.json')
    const real = fsPromises.rename.bind(fsPromises)
    let calls = 0
    const spy = vi.spyOn(fsPromises, 'rename').mockImplementation(async (a, b) => {
      if (++calls <= 2) throw Object.assign(new Error('locked'), { code: 'EPERM' })
      return real(a, b)
    })
    try {
      await writeRegistry(f, empty())
    } finally { spy.mockRestore() }
    expect(calls).toBe(3)
    expect(await readRegistry(f)).toEqual(empty())
    expect(await fs.readdir(dir)).toEqual(['r.json'])
  })

  it('gives up after the retry budget and cleans up', async () => {
    const dir = await tmp()
    const f = path.join(dir, 'r.json')
    let calls = 0
    const spy = vi.spyOn(fsPromises, 'rename').mockImplementation(async () => {
      calls++
      throw Object.assign(new Error('busy'), { code: 'EBUSY' })
    })
    try {
      await expect(writeRegistry(f, empty())).rejects.toThrow('busy')
    } finally { spy.mockRestore() }
    expect(calls).toBe(6)
    expect(await fs.readdir(dir)).toEqual([])
  })
})

describe('updateRegistry', () => {
  it('serializes overlapping read-modify-write updates across path aliases', async () => {
    const dir = await tmp()
    const file = path.join(dir, 'r.json')
    const alias = dir + path.sep + '.' + path.sep + 'r.json'
    let start, release
    const started = new Promise(resolve => { start = resolve })
    const gate = new Promise(resolve => { release = resolve })
    const first = updateRegistry(file, async registry => {
      start()
      await gate
      return recordIngested(registry, entry('kb_source/a.md', []))
    })
    await started
    const second = updateRegistry(alias, registry => recordIngested(registry, entry('kb_source/b.md', [])))
    release()
    await Promise.all([first, second])
    expect(Object.keys((await readRegistry(file)).sources)).toEqual(['kb_source/a.md', 'kb_source/b.md'])
    expect(await fs.readdir(dir)).toEqual(['r.json'])
  })

  it('preserves an unreadable registry and allows an update after it is repaired', async () => {
    const dir = await tmp()
    const file = path.join(dir, 'r.json')
    const bad = '{truncated'
    await fs.writeFile(file, bad)
    const update = vi.fn(registry => recordIngested(registry, entry('kb_source/a.md', [])))
    await expect(updateRegistry(file, update)).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
    expect(await fs.readFile(file, 'utf8')).toBe(bad)
    await writeRegistry(file, empty())
    await expect(updateRegistry(file, update)).resolves.toMatchObject({ sources: { 'kb_source/a.md': { hash: 'sh' } } })
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
