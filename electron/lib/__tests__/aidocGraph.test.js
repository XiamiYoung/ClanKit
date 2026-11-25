import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { applyCategories, assignGroupColors, buildGraph, readIngestedSources } = require('../aidocGraph')
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
  it('links a source to the pages generated from it even without a wikilink', () => {
    const { links, nodes } = buildGraph({
      files: [file('wiki/zh/summary.md', ['kb_source/doc.md']), file('wiki/zh/topic.md'), file('wiki/en/other.md'), file('kb_source/doc.md')],
      ingested: { 'kb_source/doc.md': {
        pages: ['wiki/zh/topic.md'],
        langs: { zh: { pages: ['wiki/zh/summary.md', 'wiki/zh/topic.md', 'wiki/zh/deleted.md'] }, en: { pages: ['wiki/en/other.md'] } },
      } },
      lang: 'zh',
    })
    expect(links).toEqual([
      { source: 'wiki/zh/summary.md', target: 'kb_source/doc.md' },
      { source: 'wiki/zh/topic.md', target: 'kb_source/doc.md' },
    ])
    expect(nodes.find(node => node.id === 'kb_source/doc.md').degree).toBe(2)
  })

  it('groups nodes by top-level topic and lets sources follow their pages', () => {
    const graph = buildGraph({
      files: [
        file('wiki/a.md', ['kb_source/s.md']), file('wiki/b.md', ['kb_source/s.md']), file('wiki/c.md', ['kb_source/s.md', 'missing']),
        file('wiki/d.md'), file('kb_source/s.md'),
      ],
      ingested: { 'kb_source/s.md': {} },
    })
    const result = applyCategories(graph, new Map([
      ['wiki/a.md', 'Cloud › Storage'], ['wiki/b.md', 'cloud'], ['wiki/c.md', 'AI › Agents'],
    ]))

    const groupOf = id => result.nodes.find(node => node.id === id).group
    expect(['wiki/a.md', 'wiki/b.md', 'wiki/c.md', 'kb_source/s.md', 'wiki/d.md'].map(groupOf))
      .toEqual(['Cloud', 'Cloud', 'AI', 'Cloud', ''])
    expect(result.groups).toEqual(['Cloud', 'AI', ''])
    expect(new Set(result.groups.map(group => result.colors[group])).size).toBe(3)
    expect(result.nodes.find(node => node.id === '?missing').group).toBeUndefined()
  })

  it('keeps folder groups while nothing has been classified', () => {
    const graph = buildGraph({ files: [file('wiki/a.md')], ingested: {} })
    expect(applyCategories(graph, new Map())).toBeNull()
  })

  it('leaves out the wiki system files and every link to or from them', () => {
    const { WIKI_SCAFFOLD_FILES } = require('../aidocWiki')
    const system = Object.values(WIKI_SCAFFOLD_FILES).flatMap(name => [`wiki/${name}`, `wiki/en/${name}`])
    const { nodes, links } = buildGraph({
      files: [
        ...system.map(rel => file(rel, ['Topic'])),
        file('wiki/en/Topic.md', ['index', 'log', 'SCHEMA']),
        file('wiki/en/notes/index.md', ['Topic']),
      ],
      ingested: {},
    })

    expect(nodes.map(node => node.id)).toEqual(['wiki/en/Topic.md', 'wiki/en/notes/index.md'])
    expect(links).toEqual([{ source: 'wiki/en/notes/index.md', target: 'wiki/en/Topic.md' }])
  })

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

  it('omits image placeholders from previously saved index entries', () => {
    const files = [file('wiki/a.md', ['assets/photo.PNG', 'missing'])]
    const graph = buildGraph({ files, ingested: {} })
    expect(graph.nodes.map(node => node.id)).toEqual(['wiki/a.md', '?missing'])
    expect(graph.links).toEqual([{ source: 'wiki/a.md', target: '?missing' }])
  })

  it('connects the source to an ambiguous placeholder and the placeholder to each visible candidate', () => {
    const files = [
      file('wiki/Home.md', ['a']),
      file('wiki/first/a.md'),
      file('wiki/second/a.md'),
    ]
    const { nodes, links } = buildGraph({ files, ingested: {} })
    const ambiguous = nodes.find(node => node.kind === 'ambiguous')
    expect(ambiguous.degree).toBe(3)
    expect(ambiguous).not.toHaveProperty('path')
    expect(links).toEqual([
      { source: 'wiki/Home.md', target: ambiguous.id },
      { source: ambiguous.id, target: 'wiki/first/a.md' },
      { source: ambiguous.id, target: 'wiki/second/a.md' },
    ])
  })

  it('retains the ambiguity when only one candidate is visible', () => {
    const files = [file('wiki/Home.md', ['a']), file('kb_source/first/a.md'), file('kb_source/second/a.md')]
    const { nodes, links } = buildGraph({ files, ingested: { 'kb_source/second/a.md': {} } })
    const ambiguous = nodes.find(node => node.kind === 'ambiguous')
    expect(links).toEqual([
      { source: 'wiki/Home.md', target: ambiguous.id },
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
      'kb_source/a.md': {
        hash: 'hash', ingestedAt: '2026-11-24', pages: ['wiki/en/a.md'], mtimeMs: 1, size: 42,
        langs: { en: { hash: 'hash', ingestedAt: '2026-11-24', pages: ['wiki/en/a.md'] } },
      },
    }
    await fs.writeFile(metadata, JSON.stringify({ sources }))
    expect(await readIngestedSources(dataDir, root)).toEqual(sources)
  })

  it('does not report a legacy source record without languages as ingested', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-graph-'))
    dirs.push(dataDir)
    const root = path.join(dataDir, 'root')
    await fs.mkdir(path.join(dataDir, 'aidoc-ingest'))
    await fs.writeFile(path.join(dataDir, 'aidoc-ingest', rootHash(root) + '.json'), JSON.stringify({
      sources: { 'kb_source/a.md': { hash: 'hash', ingestedAt: 'x', pages: ['wiki/a.md'] } },
    }))
    expect(await readIngestedSources(dataDir, root)).toEqual({})
  })

  describe('language wikis', () => {
    const files = () => [
      file('wiki/en/Home.md', ['Topic']),
      file('wiki/en/Topic.md', ['Topic zh', 'Missing']),
      file('wiki/en/notes/Deep.md', ['Topic']),
      file('wiki/zh/Home.md', ['Topic']),
      file('wiki/zh/Topic.md', ['Topic']),
      file('wiki/Legacy.md', ['Topic']),
      file('kb_source/source.md'),
    ]
    const ids = graph => graph.nodes.filter(node => node.kind === 'doc').map(node => node.id)

    it('shows only the pages of the preferred language when its folder exists', () => {
      const en = buildGraph({ files: files(), ingested: { 'kb_source/source.md': {} }, lang: 'en' })
      expect(ids(en)).toEqual(['wiki/en/Home.md', 'wiki/en/Topic.md', 'wiki/en/notes/Deep.md', 'kb_source/source.md'])
      const zh = buildGraph({ files: files(), ingested: {}, lang: 'zh' })
      expect(ids(zh)).toEqual(['wiki/zh/Home.md', 'wiki/zh/Topic.md'])
    })

    it('resolves a link to the page in its own language even when both languages have that name', () => {
      const en = buildGraph({ files: files(), ingested: {}, lang: 'en' })
      expect(en.links).toContainEqual({ source: 'wiki/en/Home.md', target: 'wiki/en/Topic.md' })
      expect(en.links.some(link => link.target === 'wiki/zh/Topic.md')).toBe(false)
      expect(en.nodes.some(node => node.kind === 'ambiguous')).toBe(false)
      const zh = buildGraph({ files: files(), ingested: {}, lang: 'zh' })
      expect(zh.links).toContainEqual({ source: 'wiki/zh/Home.md', target: 'wiki/zh/Topic.md' })
    })

    it('groups language pages by the first folder below the language root', () => {
      const { groups, nodes } = buildGraph({ files: files(), ingested: { 'kb_source/source.md': {} }, lang: 'en' })
      expect(groups).toEqual(['kb_source', 'wiki', 'wiki/notes'])
      expect(nodes.find(node => node.id === 'wiki/en/notes/Deep.md').group).toBe('wiki/notes')
      expect(nodes.find(node => node.id === 'wiki/en/Topic.md').group).toBe('wiki')
    })

    it('shows every wiki page when the preferred language folder does not exist', () => {
      const onlyZh = files().filter(item => !item.rel.startsWith('wiki/en/'))
      expect(ids(buildGraph({ files: onlyZh, ingested: {}, lang: 'en' }))).toEqual(['wiki/zh/Home.md', 'wiki/zh/Topic.md', 'wiki/Legacy.md'])
      expect(ids(buildGraph({ files: onlyZh, ingested: {} }))).toEqual(['wiki/zh/Home.md', 'wiki/zh/Topic.md', 'wiki/Legacy.md'])
    })
  })
})
