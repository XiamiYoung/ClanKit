import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { computeSyncStatus } = require('../aidocSyncStatus')

const a = { rel: 'kb_source/a.md', ext: 'md', mtimeMs: 1, size: 10 }
const b = { rel: 'kb_source/b.pdf', ext: 'pdf', mtimeMs: 1, size: 10 }
const c = { rel: 'kb_source/c.docx', ext: 'docx', mtimeMs: 1, size: 10 }

function status(scanned = [], files = {}, ingested = {}, languages) {
  return computeSyncStatus({ scanned, cache: { version: 1, files }, ingested, languages })
}

describe('AI Doc sync status', () => {
  it('counts an ingested source as new when it lacks a selected language', () => {
    const record = { ...a, hash: 'h', langs: { en: { hash: 'h', ingestedAt: 'x', pages: [] } } }
    expect(status([a], {}, { [a.rel]: record }, ['en']).pending).toEqual({ new: 0, updated: 0, removed: 0 })
    expect(status([a], {}, { [a.rel]: record }, ['en', 'zh']).pending).toEqual({ new: 1, updated: 0, removed: 0 })
    expect(status([a], {}, { [a.rel]: { ...record, mtimeMs: 2 } }, ['en', 'zh']).pending).toEqual({ new: 0, updated: 1, removed: 0 })
  })

  it('reports a fresh empty index for an empty scan', () => {
    expect(status()).toEqual({
      indexStale: false, staleCount: 0, failedCount: 0, pending: { new: 0, updated: 0, removed: 0 }, total: 0,
    })
  })

  it('counts cache misses, changed metadata, and removals individually', () => {
    expect(status([a, b]).staleCount).toBe(2)
    expect(status([a, b], { [a.rel]: a, [b.rel]: b }).indexStale).toBe(false)
    expect(status([a, b], { [a.rel]: { ...a, mtimeMs: 2 }, [b.rel]: b }).staleCount).toBe(1)
    expect(status([a], { [a.rel]: a, [b.rel]: b }).staleCount).toBe(1)
    expect(status([a], { [a.rel]: { ...a, size: a.size + 1 } }).staleCount).toBe(1)
  })

  it('reports extraction errors separately from changed file metadata', () => {
    const failed = { ...a, error: 'Encrypted Word document' }
    expect(status([a], { [a.rel]: failed })).toMatchObject({
      indexStale: false, staleCount: 0, failedCount: 1,
    })
    expect(status([a], { [a.rel]: { ...failed, size: 99 } })).toMatchObject({
      indexStale: true, staleCount: 1, failedCount: 1,
    })
    expect(status([], { [a.rel]: failed }).failedCount).toBe(0)
  })

  it('counts only eligible sources and handles older records without mtime', () => {
    const scanned = [
      a, b, c,
      { rel: 'wiki/page.md', ext: 'md' },
      { rel: 'kb_source/chart.drawio', ext: 'drawio' },
      { rel: 'kb_source/data.xlsx', ext: 'xlsx' },
    ]
    expect(status(scanned).pending).toEqual({ new: 3, updated: 0, removed: 0 })
    expect(status(scanned, {}, { [a.rel]: a }).pending).toEqual({ new: 2, updated: 0, removed: 0 })
    expect(status(scanned, {}, {
      [a.rel]: { ...a, mtimeMs: 2 },
      [b.rel]: {},
      'kb_source/removed.md': {},
    }).pending).toEqual({ new: 1, updated: 1, removed: 1 })
  })
})
