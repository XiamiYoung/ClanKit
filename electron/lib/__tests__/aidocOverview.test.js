import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const { buildWikiOverview } = require('../aidocOverview')
const { registryPathFor, writeRegistry } = require('../aidocRegistry')

let dataDir
let root
let file

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-overview-'))
  root = path.join(dataDir, 'clankit_doc')
  file = registryPathFor(dataDir, root)
})

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true })
})

const overview = language => buildWikiOverview({ dataDir, root, language })

describe('buildWikiOverview', () => {
  it('returns null for missing, empty, and damaged records', async () => {
    expect(overview()).toBeNull()
    await writeRegistry(file, { version: 1, sources: {}, pages: {} })
    expect(overview()).toBeNull()
    await fs.writeFile(file, '{truncated')
    expect(overview()).toBeNull()
  })

  it('summarizes page counts and dates without including page or index contents', async () => {
    await writeRegistry(file, { version: 1, sources: {}, pages: {
      'wiki/one.md': { hash: 'x', type: 'summary', title: 'PRIVATE PAGE TITLE', updated: '2026-01-01' },
      'wiki/two.md': { hash: 'y', type: 'summary', updated: '2026-11-04' },
      'wiki/three.md': { hash: 'z', type: 'concept', updated: '2026-06-01' }
    } })
    await fs.mkdir(path.join(root, 'wiki'), { recursive: true })
    await fs.writeFile(path.join(root, 'wiki', 'index.md'), 'PRIVATE INDEX TEXT')

    const result = overview()
    expect(result).toMatchObject({ pageCount: 3, byType: { summary: 2, concept: 1 }, lastUpdated: '2026-11-04' })
    expect(result.text).toContain(`${root.replace(/\\/g, '/')}/wiki/index.md`)
    expect(result.text).toContain('file_operation')
    expect(result.text).not.toMatch(/PRIVATE|one\.md/)
    expect(result.text.length).toBeLessThan(1500)
  })

  describe('language wikis', () => {
    const pages = {
      'wiki/en/a.md': { hash: 'x', type: 'summary', updated: '2026-01-01' },
      'wiki/en/b.md': { hash: 'x', type: 'summary', updated: '2026-02-01' },
      'wiki/zh/a.md': { hash: 'x', type: 'concept', updated: '2026-03-01' },
    }
    const posix = value => value.replace(/\\/g, '/')

    it('describes the language folder matching the configured language', async () => {
      await writeRegistry(file, { version: 1, sources: {}, pages })
      const zh = overview('zh')
      expect(zh).toMatchObject({ pageCount: 1, byType: { concept: 1 }, lastUpdated: '2026-03-01' })
      expect(zh.text).toContain(`Location: ${posix(root)}/wiki/zh\n`)
      expect(zh.text).toContain(`read \`${posix(root)}/wiki/zh/index.md\``)
      const en = overview('en')
      expect(en).toMatchObject({ pageCount: 2, byType: { summary: 2 }, lastUpdated: '2026-02-01' })
      expect(en.text).toContain(`read \`${posix(root)}/wiki/en/index.md\``)
      expect(overview('zh-CN').pageCount).toBe(1)
    })

    it('falls back to the first available language when the configured one has no pages', async () => {
      await writeRegistry(file, { version: 1, sources: {}, pages: { 'wiki/zh/a.md': pages['wiki/zh/a.md'] } })
      const fallback = overview('en')
      expect(fallback.pageCount).toBe(1)
      expect(fallback.text).toContain(`${posix(root)}/wiki/zh/index.md`)
      expect(overview(undefined).pageCount).toBe(1)
    })

    it('ignores legacy flat pages while a language wiki exists and uses them otherwise', async () => {
      await writeRegistry(file, { version: 1, sources: {}, pages: { ...pages, 'wiki/old.md': { hash: 'y', type: 'entity' } } })
      expect(overview('en').pageCount).toBe(2)
      await writeRegistry(file, { version: 1, sources: {}, pages: { 'wiki/old.md': { hash: 'y', type: 'entity' } } })
      const legacy = overview('zh')
      expect(legacy.pageCount).toBe(1)
      expect(legacy.text).toContain(`read \`${posix(root)}/wiki/index.md\``)
    })
  })

  it('refreshes the cache when a same-mtime registry is atomically replaced', async () => {
    const timestamp = new Date('2026-11-01T00:00:00Z')
    const registry = (type) => ({ version: 1, sources: {}, pages: { 'wiki/one.md': { hash: 'x', type } } })
    await writeRegistry(file, registry('summary'))
    await fs.utimes(file, timestamp, timestamp)
    const oldMtime = (await fs.stat(file)).mtimeMs
    expect(overview().byType).toEqual({ summary: 1 })

    await writeRegistry(file, registry('concept'))
    await fs.utimes(file, timestamp, timestamp)
    expect((await fs.stat(file)).mtimeMs).toBe(oldMtime)
    expect(overview()).toMatchObject({ byType: { concept: 1 }, lastUpdated: null })
    await fs.unlink(file)
    expect(overview()).toBeNull()
  })

  it('keeps unrecognized types and invalid dates out of the prompt', async () => {
    await writeRegistry(file, { version: 1, sources: {}, pages: {
      'wiki/one.md': { hash: 'x', type: 'PRIVATE TYPE', updated: 'PRIVATE DATE' },
      'wiki/two.md': { hash: 'y', type: 'constructor' }
    } })

    const result = overview()
    expect(result).toMatchObject({ pageCount: 2, byType: { other: 2 }, lastUpdated: null })
    expect(result.text).not.toMatch(/PRIVATE|constructor/)
  })
})
