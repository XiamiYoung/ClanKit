import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import reader from '../aidocWikiReader.js'

const { listWikiPages, buildBacklinks, readWikiPage } = reader

describe('AI Doc Wiki reader', () => {
  let root

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-wiki-reader-'))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  async function write(rel, text) {
    const file = path.join(root, rel)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, text)
    return file
  }

  it('lists wiki Markdown with metadata and a separate home entry', async () => {
    await write('wiki/index.md', '# Home')
    await write('wiki/SCHEMA.md', '# Schema')
    await write('wiki/log.md', '# Log')
    await write('wiki/diagram.svg', '')
    await write('wiki/long.md', '---\ntitle: ' + 'a'.repeat(4096) + '\n---\n')
    await write('wiki/notes/plain.MD', '# Plain')
    await write('kb_source/outside.md', '# Source')
    const pagePath = await write('wiki/notes/example.md', [
      '---',
      'title: Reader',
      'type: entity',
      'updated: 2026-11-24',
      'sources:',
      '  - kb_source/outside.md',
      '---',
      'Body',
    ].join('\n'))

    expect(await listWikiPages(root)).toEqual([
      expect.objectContaining({ rel: 'wiki/index.md', title: 'index', type: 'other', isIndex: true }),
      expect.objectContaining({ rel: 'wiki/long.md', title: 'long', type: 'other' }),
      expect.objectContaining({
        rel: 'wiki/notes/example.md',
        path: pagePath,
        title: 'Reader',
        type: 'entity',
        updated: '2026-11-24',
        sources: ['kb_source/outside.md'],
        mtimeMs: expect.any(Number),
      }),
      expect.objectContaining({ rel: 'wiki/notes/plain.MD', title: 'plain', type: 'other', updated: '', sources: [] }),
    ])
  })

  it('returns an empty list with no wiki folder', async () => {
    await write('kb_source', 'not a directory')
    expect(await listWikiPages(root)).toEqual([])
  })

  it('lists at most 1000 pages and keeps the home entry', async () => {
    await fs.mkdir(path.join(root, 'wiki'))
    await Promise.all(Array.from({ length: 1000 }, (_, index) => write(`wiki/${index}.md`, 'page')))
    await write('wiki/index.md', 'home')
    const pages = await listWikiPages(root)
    expect(pages).toHaveLength(1000)
    expect(pages.find(page => page.isIndex)?.rel).toBe('wiki/index.md')
  })

  it('deduplicates and sorts unambiguous backlinks from navigable wiki pages', () => {
    const cache = { files: {
      'wiki/sub/C.md': { title: 'Third', links: ['B'] },
      'wiki/sub/B.md': { title: 'B two', links: [] },
      'wiki/B.md': { title: 'B', links: ['B'] },
      'wiki/A.md': { title: 'First', links: ['B', 'wiki/B.md'] },
      'wiki/elsewhere/Note.md': { title: 'Ambiguous', links: ['B'] },
      'wiki/log.md': { title: 'Log', links: ['B'] },
      'kb_source/example.md': { title: 'Source', links: ['wiki/B.md'] },
      'wiki/sub/Direct.md': { title: 'Second', links: ['wiki/B'] },
    } }

    expect(buildBacklinks(cache, 'wiki/B.md')).toEqual([
      { rel: 'wiki/A.md', title: 'First' },
      { rel: 'wiki/sub/Direct.md', title: 'Second' },
    ])
    expect(buildBacklinks(cache, 'wiki/sub/B.md')).toEqual([{ rel: 'wiki/sub/C.md', title: 'Third' }])
  })

  it('reads the live body and source availability with cached wiki link resolution', async () => {
    const sourcePath = await write('kb_source/source.md', 'Source')
    const pagePath = await write('wiki/notes/reader.md', [
      '---',
      'type: summary',
      'title: Main page',
      'updated: 2026-11-24',
      'sources: [kb_source/source.md, kb_source/removed.md, kb_source/../outside.md]',
      '---',
      '[[a#Section|Alias]] [[missing]] [[source]] [[reader]] [[__proto__]] `[[example]]`',
    ].join('\n'))
    const cache = { files: {
      'wiki/left/a.md': { title: 'A', links: ['notes/reader'] },
      'wiki/right/a.md': { title: 'Another A', links: [] },
      'kb_source/source.md': { title: 'Original', links: [] },
    } }

    expect(await readWikiPage({ root, cache, rel: 'wiki/notes/reader.md' })).toEqual({
      rel: 'wiki/notes/reader.md',
      path: pagePath,
      title: 'Main page',
      type: 'summary',
      updated: '2026-11-24',
      sources: [
        { rel: 'kb_source/source.md', path: sourcePath, exists: true },
        { rel: 'kb_source/removed.md', exists: false },
        { rel: 'kb_source/../outside.md', exists: false },
      ],
      body: '[[a#Section|Alias]] [[missing]] [[source]] [[reader]] [[__proto__]] `[[example]]`',
      links: Object.fromEntries([
        ['a', 'wiki/left/a.md'],
        ['missing', null],
        ['source', null],
        ['reader', 'wiki/notes/reader.md'],
        ['__proto__', null],
      ]),
      backlinks: [{ rel: 'wiki/left/a.md', title: 'A' }],
    })
  })

  it('rejects a page above the 2 MB cap with page_too_large and still reads one at the cap', async () => {
    await write('wiki/big.md', 'x'.repeat(2 * 1024 * 1024 + 1))
    await write('wiki/edge.md', 'x'.repeat(2 * 1024 * 1024))
    await expect(readWikiPage({ root, cache: { files: {} }, rel: 'wiki/big.md' })).rejects.toMatchObject({ code: 'page_too_large' })
    await expect(readWikiPage({ root, cache: { files: {} }, rel: 'wiki/edge.md' })).resolves.toMatchObject({ rel: 'wiki/edge.md' })
  })

  it('rejects paths outside readable wiki pages', async () => {
    await write('general/a.md', 'outside')
    await write('wiki/SCHEMA.md', 'schema')
    await write('kb_source/a.md', 'source')
    await write('wiki/not-markdown.txt', 'not a wiki page')
    for (const rel of ['general/a.md', 'wiki/../general/a.md', 'kb_source/a.md', 'wiki/SCHEMA.md', 'wiki/not-markdown.txt']) {
      await expect(readWikiPage({ root, rel })).rejects.toThrow()
    }
  })

  it('rejects wiki links and source links that leave their real areas', async () => {
    const wiki = path.join(root, 'wiki')
    const source = path.join(root, 'kb_source')
    await write('general/outside.md', 'private')
    await write('wiki/safe.md', '---\nsources: [kb_source/escape/outside.md]\n---\nSafe')
    await fs.mkdir(source)
    await fs.symlink(path.join(root, 'general'), path.join(wiki, 'escape'), 'junction')
    await fs.symlink(path.join(root, 'general'), path.join(source, 'escape'), 'junction')
    await expect(readWikiPage({ root, rel: 'wiki/escape/outside.md' })).rejects.toThrow()
    const safe = await readWikiPage({ root, rel: 'wiki/safe.md' })
    expect(safe.sources).toEqual([{ rel: 'kb_source/escape/outside.md', exists: false }])
    expect(await listWikiPages(root)).toEqual([expect.objectContaining({ rel: 'wiki/safe.md' })])
  })

  it('rejects a wiki area redirected to another area in the vault', async () => {
    await write('general/outside.md', 'private')
    await fs.symlink(path.join(root, 'general'), path.join(root, 'wiki'), 'junction')
    await expect(readWikiPage({ root, rel: 'wiki/outside.md' })).rejects.toThrow()
    expect(await listWikiPages(root)).toEqual([])
  })
})
