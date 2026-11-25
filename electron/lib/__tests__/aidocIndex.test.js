import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const fs = require('node:fs/promises')
const { cachePathFor, loadCache, rootHash, saveCache, scanKnowledgeFiles, updateIndex } = require('../aidocIndex')

let root
const empty = { version: 1, files: {} }
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-index-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(root, { recursive: true, force: true })
})

async function write(rel, text = '') {
  const file = path.join(root, rel)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, text)
  return file
}

describe('scanKnowledgeFiles', () => {
  it('scans supported documents in the knowledge folders only', async () => {
    for (const rel of [
      'kb_source/a.md', 'kb_source/sub/b.docx', 'wiki/c.MD', 'wiki/.hidden.md',
      'wiki/node_modules/ignored.md', 'general/d.md', 'wiki/e.png', 'f.md',
    ]) await write(rel)
    const found = await scanKnowledgeFiles(root)
    expect(found.map(file => file.rel).sort()).toEqual(['kb_source/a.md', 'kb_source/sub/b.docx', 'wiki/c.MD'])
    expect(found.find(file => file.rel === 'wiki/c.MD')).toEqual({
      rel: 'wiki/c.MD', abs: path.join(root, 'wiki', 'c.MD'), ext: 'md', mtimeMs: expect.any(Number), size: 0,
    })
  })

  it('returns an empty list when both knowledge folders are missing', async () => {
    expect(await scanKnowledgeFiles(root)).toEqual([])
  })

  it('skips links from the root knowledge folders and their subfolders', async () => {
    const outsideFile = await write('general/outside.md', '[[outside]]')
    const outside = path.dirname(outsideFile)
    await write('wiki/real.md', '[[real]]')
    const dirLink = process.platform === 'win32' ? 'junction' : 'dir'
    await fs.symlink(outside, path.join(root, 'kb_source'), dirLink)
    await fs.symlink(outside, path.join(root, 'wiki', 'linked'), dirLink)
    if (process.platform !== 'win32') {
      await fs.symlink(outsideFile, path.join(root, 'wiki', 'linked.md'), 'file')
    }
    expect((await scanKnowledgeFiles(root)).map(file => file.rel)).toEqual(['wiki/real.md'])
  })

  it('does not treat a directory read error as a deletion', async () => {
    const file = await write('wiki/nested/file.md', '[[target]]')
    const { cache } = await updateIndex({ root, cache: empty })
    const readdir = fs.readdir
    const failure = Object.assign(new Error('Read denied'), { code: 'EACCES' })
    vi.spyOn(fs, 'readdir').mockImplementation((dir, options) => (
      dir === path.dirname(file) ? Promise.reject(failure) : readdir(dir, options)
    ))
    await expect(updateIndex({ root, cache })).rejects.toBe(failure)
    expect(cache.files['wiki/nested/file.md'].links).toEqual(['target'])
  })
})

describe('index cache', () => {
  it('normalizes the root and uses distinct cache paths for different roots', () => {
    const alias = root + path.sep + 'folder' + path.sep + '..' + path.sep
    expect(rootHash(root)).toMatch(/^[0-9a-f]{16}$/)
    expect(rootHash(alias)).toBe(rootHash(root))
    expect(cachePathFor(root, alias)).toBe(path.join(root, 'aidoc-index', `${rootHash(root)}.json`))
    expect(cachePathFor(root, path.join(root, 'other'))).not.toBe(cachePathFor(root, root))
  })

  it('treats missing, truncated, version-mismatched, and malformed caches as empty', async () => {
    const file = path.join(root, 'cache.json')
    expect(await loadCache(file)).toEqual(empty)
    for (const text of ['{trunc', '{"version":99,"files":{}}', '{"version":1,"files":[]}', '{"version":1,"files":{"wiki/a.md":null}}']) {
      await fs.writeFile(file, text)
      expect(await loadCache(file)).toEqual(empty)
    }
  })

  it('discards caches with unsafe paths, mismatched extensions, or invalid data', async () => {
    const file = path.join(root, 'cache.json')
    const entry = { mtimeMs: 1, size: 2, ext: 'md', title: 'A', links: ['b'] }
    for (const rel of ['general/a.md', 'wiki/../a.md', 'wiki/a\\b.md', 'wiki/.hidden/a.md', 'wiki//a.md', 'wiki/a.docx']) {
      await fs.writeFile(file, JSON.stringify({ version: 1, files: { [rel]: entry } }))
      expect(await loadCache(file)).toEqual(empty)
    }
    await fs.writeFile(file, JSON.stringify({ version: 1, files: { 'wiki/a.md': { ...entry, links: [null] } } }))
    expect(await loadCache(file)).toEqual(empty)
  })

  it('round-trips the cache with no temporary sibling left behind', async () => {
    await write('wiki/a.md', '[[b]]')
    const { cache } = await updateIndex({ root, cache: empty })
    const file = cachePathFor(root, root)
    await saveCache(file, cache)
    expect(await loadCache(file)).toEqual(cache)
    expect(await fs.readdir(path.dirname(file))).toEqual([path.basename(file)])
  })
})

describe('updateIndex', () => {
  it('parses new and changed documents, reuses others, and drops deleted files', async () => {
    const file = await write('wiki/a.md', '# A\n[[b]]')
    const deleted = await write('wiki/b.md', '# B\n[[a]]')
    await write('kb_source/node.pdf', '[[ignored]]')
    const first = await updateIndex({ root, cache: empty })
    expect(first.stats).toEqual({ total: 3, parsed: 3, reused: 0, removed: 0, errors: 0 })
    expect(first.cache.files['wiki/a.md']).toMatchObject({ title: 'A', links: ['b'] })
    expect(first.cache.files['kb_source/node.pdf']).toMatchObject({ title: 'node', links: [] })
    expect(empty.files).toEqual({})

    const second = await updateIndex({ root, cache: first.cache })
    expect(second.stats).toMatchObject({ parsed: 0, reused: 3 })
    await fs.writeFile(file, '# A\n[[new target]]')
    await fs.utimes(file, new Date('2024-01-01'), new Date('2024-01-01'))
    await fs.unlink(deleted)
    const third = await updateIndex({ root, cache: second.cache })
    expect(third.stats).toEqual({ total: 2, parsed: 1, reused: 1, removed: 1, errors: 0 })
    expect(third.cache.files['wiki/a.md'].links).toEqual(['new target'])
    expect(third.cache.files['wiki/b.md']).toBeUndefined()
    expect(second.cache.files['wiki/b.md']).toBeDefined()
    const full = await updateIndex({ root, cache: third.cache, full: true })
    expect(full.stats).toMatchObject({ parsed: 2, reused: 0, removed: 0 })
  })

  it('records extraction failures without blocking other files and retries failed entries', async () => {
    await write('wiki/broken.docx', 'bad archive')
    await write('wiki/healthy.md', '[[valid]]')
    const first = await updateIndex({ root, cache: empty })
    expect(first.stats).toMatchObject({ parsed: 2, errors: 1 })
    expect(first.cache.files['wiki/broken.docx']).toMatchObject({ title: 'broken', links: [], error: expect.any(String) })
    expect(first.cache.files['wiki/healthy.md'].links).toEqual(['valid'])
    const next = await updateIndex({ root, cache: first.cache })
    expect(next.stats).toMatchObject({ parsed: 1, reused: 1, errors: 1 })
  })

  it('records a file that disappears after scanning and removes it on the next update', async () => {
    const file = await write('wiki/removed.md', '[[old]]')
    await write('wiki/remaining.md', '[[still here]]')
    const open = fs.open
    vi.spyOn(fs, 'open').mockImplementation(async (abs, ...args) => {
      if (abs === file) await fs.unlink(file)
      return open(abs, ...args)
    })
    const first = await updateIndex({ root, cache: empty })
    expect(first.stats).toMatchObject({ parsed: 2, errors: 1 })
    expect(first.cache.files['wiki/removed.md']).toMatchObject({ links: [], error: 'ENOENT' })
    expect(first.cache.files['wiki/remaining.md'].links).toEqual(['still here'])

    const second = await updateIndex({ root, cache: first.cache })
    expect(second.stats).toMatchObject({ parsed: 0, reused: 1, removed: 1, errors: 0 })
  })

  it('reports progress after each batch and on completion, including an empty scan', async () => {
    const progress = vi.fn()
    await updateIndex({ root, cache: empty, onProgress: progress })
    expect(progress).toHaveBeenLastCalledWith({ done: 0, total: 0 })
    progress.mockClear()
    for (const name of ['a', 'b', 'c']) await write(`wiki/${name}.md`)
    await updateIndex({ root, cache: empty, chunk: 2, onProgress: progress })
    expect(progress.mock.calls).toEqual([[{ done: 2, total: 3 }], [{ done: 3, total: 3 }]])
  })
})
