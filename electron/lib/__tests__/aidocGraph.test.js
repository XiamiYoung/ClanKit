import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { assignGroupColors, buildGraph, readIngestedSources } = require('../aidocGraph')
const { rootHash } = require('../aidocIndex')

const dirs = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

function file(rel, links = []) {
  const name = rel.split('/').at(-1)
  return { rel, abs: path.resolve(rel), ext: name.split('.').at(-1), title: name, links }
}

describe('AI Doc graph', () => {
  it('returns an empty graph for an empty index', () => {
    expect(buildGraph({ files: [], ingested: {} })).toEqual({ nodes: [], links: [], groups: [] })
  })

  it('includes wiki pages and current ingested sources, and deduplicates links and unresolved targets', () => {
    const files = [
      file('wiki/a.md', ['b', 'B.md', 'a', 'Source', 'missing', ' Missing ', 'ready']),
      file('wiki/concept/b.md', ['missing']),
      file('kb_source/source.md'),
      file('kb_source/ready.md'),
    ]
    const { nodes, links, groups } = buildGraph({
      files,
      ingested: { 'kb_source/ready.md': {}, 'kb_source/removed.md': {} },
    })
    expect(groups).toEqual(['kb_source', 'wiki', 'wiki/concept'])
    expect(links).toEqual([
      { source: 'wiki/a.md', target: 'wiki/concept/b.md' },
      { source: 'wiki/a.md', target: '?source' },
      { source: 'wiki/a.md', target: '?missing' },
      { source: 'wiki/a.md', target: 'kb_source/ready.md' },
      { source: 'wiki/concept/b.md', target: '?missing' },
    ])
    expect(nodes).toEqual([
      expect.objectContaining({ id: 'wiki/a.md', path: files[0].abs, group: 'wiki', kind: 'doc', degree: 4 }),
      expect.objectContaining({ id: 'wiki/concept/b.md', group: 'wiki/concept', degree: 2 }),
      expect.objectContaining({ id: 'kb_source/ready.md', group: 'kb_source', degree: 1 }),
      expect.objectContaining({ id: '?source', kind: 'unresolved', degree: 1 }),
      expect.objectContaining({ id: '?missing', kind: 'unresolved', degree: 2 }),
    ])
    expect(nodes[3]).not.toHaveProperty('path')
  })

  it('connects the source to an ambiguous placeholder and the placeholder to each visible candidate', () => {
    const files = [
      file('wiki/index.md', ['a']),
      file('wiki/first/a.md'),
      file('wiki/second/a.md'),
    ]
    const { nodes, links } = buildGraph({ files, ingested: {} })
    const ambiguous = nodes.find(node => node.kind === 'ambiguous')
    expect(ambiguous.degree).toBe(3)
    expect(ambiguous).not.toHaveProperty('path')
    expect(links).toEqual([
      { source: 'wiki/index.md', target: ambiguous.id },
      { source: ambiguous.id, target: 'wiki/first/a.md' },
      { source: ambiguous.id, target: 'wiki/second/a.md' },
    ])
  })

  it('retains the ambiguity when only one candidate is visible', () => {
    const files = [file('wiki/index.md', ['a']), file('kb_source/first/a.md'), file('kb_source/second/a.md')]
    const { nodes, links } = buildGraph({ files, ingested: { 'kb_source/second/a.md': {} } })
    const ambiguous = nodes.find(node => node.kind === 'ambiguous')
    expect(links).toEqual([
      { source: 'wiki/index.md', target: ambiguous.id },
      { source: ambiguous.id, target: 'kb_source/second/a.md' },
    ])
  })

  it('assigns deterministic hex colors from separate area palettes', () => {
    const groups = ['wiki', 'kb_source', 'wiki/concept', 'kb_source/archive']
    const colors = assignGroupColors(groups)
    expect(colors).toEqual(assignGroupColors([...groups].reverse()))
    expect(new Set(Object.values(colors)).size).toBe(groups.length)
    for (const group of groups) expect(colors[group]).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('returns empty ingest data for missing and malformed records and preserves source metadata', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-graph-'))
    dirs.push(dataDir)
    const root = path.join(dataDir, 'root')
    const dir = path.join(dataDir, 'aidoc-ingest')
    const metadata = path.join(dir, rootHash(root) + '.json')
    expect(await readIngestedSources(dataDir, root)).toEqual({})
    await fs.mkdir(dir)
    for (const invalid of ['{', '{}', '{"sources":[]}', '{"sources":{"kb_source/a.md":null}}']) {
      await fs.writeFile(metadata, invalid)
      expect(await readIngestedSources(dataDir, root)).toEqual({})
    }
    const sources = {
      'kb_source/a.md': { hash: 'hash', ingestedAt: '2026-11-24', pages: ['wiki/a.md'], mtimeMs: 1, size: 42 },
    }
    await fs.writeFile(metadata, JSON.stringify({ sources }))
    expect(await readIngestedSources(dataDir, root)).toEqual(sources)
  })
})
