import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { AiDocWikiTool, resolveWikiToolPath } = require('../AiDocWikiTool')
const { sha256Text } = require('../../../lib/aidocFrontmatter')

let root
let outside
let registry
let tool

const put = (rel, content) => {
  const abs = path.join(root, ...rel.split('/'))
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return abs
}
const run = params => tool.execute('t1', params)
const text = res => res.content[0].text

// Creating links can fail on Windows without privileges; those cases are skipped, not faked.
const tryLink = (target, linkPath) => {
  for (const type of ['junction', 'dir']) {
    try {
      fs.symlinkSync(target, linkPath, type)
      return true
    } catch {
      // try the next link type
    }
  }
  return false
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidoc-wikitool-'))
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aidoc-wikitool-out-'))
  fs.mkdirSync(path.join(root, 'kb_source'))
  fs.mkdirSync(path.join(root, 'wiki'))
  fs.mkdirSync(path.join(root, 'general'))
  fs.writeFileSync(path.join(root, 'general', 'x.md'), 'secret')
  registry = { version: 1, sources: {}, pages: {} }
  tool = new AiDocWikiTool({ root, registry })
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
})

describe('schema', () => {
  it('reserves all five operations', () => {
    expect(tool.name).toBe('aidoc_wiki')
    expect(tool.schema().properties.operation.enum).toEqual(['list', 'read_source', 'read_wiki', 'write_wiki', 'edit_wiki'])
  })

  it('write without valid frontmatter is an error', async () => {
    const res = await run({ operation: 'write_wiki', path: 'wiki/a.md', content: 'x' })
    expect(res.isError).toBe(true)
  })
})

describe('list', () => {
  it('lists both areas recursively and hides non-ingestible kb_source files', async () => {
    put('kb_source/a.md', 'hello')
    put('kb_source/sub/b.txt', 'hi')
    put('kb_source/pic.png', 'png')
    put('wiki/index.md', '# idx')
    put('wiki/entities/e.md', '# e')

    const src = text(await run({ operation: 'list', area: 'kb_source' }))
    expect(src).toContain('kb_source/a.md')
    expect(src).toContain('kb_source/sub/b.txt')
    expect(src).not.toContain('pic.png')

    const wiki = text(await run({ operation: 'list', area: 'wiki' }))
    expect(wiki).toContain('wiki/index.md')
    expect(wiki).toContain('wiki/entities/e.md')
  })

  it('limits to a sub-directory and filters by query case-insensitively', async () => {
    put('wiki/entities/Alpha.md', 'a')
    put('wiki/entities/beta.md', 'b')
    put('wiki/concepts/alpha-c.md', 'c')

    const sub = text(await run({ operation: 'list', area: 'wiki', dir: 'entities' }))
    expect(sub).toContain('wiki/entities/Alpha.md')
    expect(sub).not.toContain('concepts')

    const q = text(await run({ operation: 'list', area: 'wiki', query: 'ALPHA' }))
    expect(q).toContain('Alpha.md')
    expect(q).toContain('alpha-c.md')
    expect(q).not.toContain('beta')
  })

  it('truncates at 300 entries and tells the agent to narrow with dir or query', async () => {
    for (let i = 0; i < 305; i++) put(`wiki/p${String(i).padStart(3, '0')}.md`, 'x')
    const res = await run({ operation: 'list', area: 'wiki' })
    expect(res.details.files).toHaveLength(300)
    expect(text(res)).toContain('truncated')
    expect(text(res)).toContain('"dir"')
    expect(text(res)).toContain('"query"')
  })

  it('rejects traversal in dir and unknown areas', async () => {
    expect((await run({ operation: 'list', area: 'wiki', dir: '../general' })).isError).toBe(true)
    expect((await run({ operation: 'list', area: 'general' })).isError).toBe(true)
    expect((await run({ operation: 'list', area: 'wiki', dir: '../../' })).isError).toBe(true)
  })
})

describe('read_source', () => {
  it('reads a markdown file', async () => {
    put('kb_source/a.md', 'Hello source')
    const res = await run({ operation: 'read_source', path: 'kb_source/a.md' })
    expect(res.isError).toBeUndefined()
    expect(text(res)).toContain('Hello source')
    expect(res.details.nextOffset).toBeNull()
  })

  it('paginates long text until nextOffset is null', async () => {
    const body = Array.from({ length: 400 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n')
    put('kb_source/long.md', body)
    let offset = 0
    let collected = ''
    let pages = 0
    for (;;) {
      const res = await run({ operation: 'read_source', path: 'kb_source/long.md', offset, limit: 1000 })
      expect(res.isError).toBeUndefined()
      expect(res.details.totalChars).toBe(body.length)
      collected += text(res).split('\n\n[')[0]
      pages++
      if (res.details.nextOffset === null) break
      expect(text(res)).toContain(`offset=${res.details.nextOffset}`)
      expect(res.details.nextOffset).toBeGreaterThan(offset)
      offset = res.details.nextOffset
    }
    expect(pages).toBeGreaterThan(1)
    expect(collected).toBe(body)
  })

  // A real scanned pdf cannot be built here (pdf-parse's bundled pdf.js rejects hand-built files), so
  // pdf-parse is stubbed through the require cache (vi.mock does not intercept CommonJS require).
  it('returns the scanned_pdf reason for a pdf with almost no text', async () => {
    put('kb_source/scan.pdf', 'stub')
    const key = require.resolve('pdf-parse')
    const real = require(key)
    require.cache[key].exports = async () => ({ text: ' Hi \n', numpages: 3 })
    try {
      const res = await run({ operation: 'read_source', path: 'kb_source/scan.pdf' })
      expect(res.isError).toBe(true)
      expect(res.details.reason).toBe('scanned_pdf')
      expect(text(res)).toContain('scanned')
    } finally {
      require.cache[key].exports = real
    }
  })

  it('coerces numeric strings and rejects non-numeric offset/limit', async () => {
    put('kb_source/n.md', 'x'.repeat(5000))
    const ok = await run({ operation: 'read_source', path: 'kb_source/n.md', offset: '100', limit: '1000' })
    expect(ok.isError).toBeUndefined()
    expect(ok.details.nextOffset).toBe(1100)
    for (const bad of [{ offset: 'abc' }, { limit: {} }, { offset: NaN }, { limit: '' }, { offset: true }]) {
      const res = await run({ operation: 'read_source', path: 'kb_source/n.md', ...bad })
      expect(res.isError).toBe(true)
      expect(text(res)).toContain('must be a number')
    }
  })

  it('errors for a missing file, an unsupported type and a wiki path', async () => {
    put('kb_source/pic.png', 'x')
    put('wiki/a.md', 'x')
    expect((await run({ operation: 'read_source', path: 'kb_source/nope.md' })).isError).toBe(true)
    const png = await run({ operation: 'read_source', path: 'kb_source/pic.png' })
    expect(png.isError).toBe(true)
    expect(png.details.reason).toBe('unsupported')
    expect((await run({ operation: 'read_source', path: 'wiki/a.md' })).isError).toBe(true)
  })
})

describe('read_wiki', () => {
  it('reads an existing page and errors on a missing one', async () => {
    put('wiki/a.md', '# Page A')
    expect(text(await run({ operation: 'read_wiki', path: 'wiki/a.md' }))).toBe('# Page A')
    expect((await run({ operation: 'read_wiki', path: 'wiki/missing.md' })).isError).toBe(true)
  })

  it('accepts backslash separators', async () => {
    put('wiki/sub/a.md', 'bs')
    expect(text(await run({ operation: 'read_wiki', path: 'wiki\\sub\\a.md' }))).toBe('bs')
  })

  it('prefixes a NOTE when the page differs from the registered hash', async () => {
    put('wiki/a.md', 'edited by user')
    registry.pages['wiki/a.md'] = { hash: sha256Text('original'), type: 'entity', title: 'A', sources: [], updated: '2026-01-01' }
    const out = text(await run({ operation: 'read_wiki', path: 'wiki/a.md' }))
    expect(out.startsWith('[NOTE: this page contains edits made by the user; preserve their content]\n')).toBe(true)
    expect(out).toContain('edited by user')
  })

  it('adds no NOTE when the hash matches or the page is unregistered', async () => {
    put('wiki/a.md', 'same')
    put('wiki/b.md', 'unregistered')
    registry.pages['wiki/a.md'] = { hash: sha256Text('same') }
    expect(text(await run({ operation: 'read_wiki', path: 'wiki/a.md' }))).toBe('same')
    expect(text(await run({ operation: 'read_wiki', path: 'wiki/b.md' }))).toBe('unregistered')
  })

  it('rejects pages over 200000 characters', async () => {
    put('wiki/big.md', 'a'.repeat(200001))
    expect((await run({ operation: 'read_wiki', path: 'wiki/big.md' })).isError).toBe(true)
  })

  it('rejects an oversized page by byte size before reading it', async () => {
    const abs = put('wiki/huge.md', '')
    fs.truncateSync(abs, 800001)
    const res = await run({ operation: 'read_wiki', path: 'wiki/huge.md' })
    expect(res.isError).toBe(true)
    expect(text(res)).toContain('too large')
  })

  it('rejects kb_source paths', async () => {
    put('kb_source/a.md', 'x')
    expect((await run({ operation: 'read_wiki', path: 'kb_source/a.md' })).isError).toBe(true)
  })
})

describe('path confinement', () => {
  // [input, expected error substring]; each category asserts its own specific reason.
  const attacks = [
    ['../general/x.md', '".."'],
    ['wiki/../../x', '".."'],
    ['wiki/../general/x.md', '".."'],
    ['wiki/..\\..\\general\\x.md', '".."'],
    ['kb_source/../wiki/a.md', '".."'],
    ['/etc/passwd', 'absolute'],
    ['\\etc\\passwd', 'absolute'],
    ['\\\\server\\share\\x', 'absolute'],
    ['//server/share/x', 'absolute'],
    ['C:\\x', 'drive'],
    ['C:/x', 'drive'],
    ['c:x', 'drive'],
    ['wiki/a.md\0.png', 'NUL'],
    ['general/x.md', 'must start with'],
    ['general/a.md', 'must start with'],
    ['Wiki/a.md', 'must start with'],
    ['wiki/a.md:stream', '":"'],
    ['wiki/a.md:$DATA', '":"'],
    ['wiki/a.md.', 'dot or space'],
    ['wiki/a.md ', 'dot or space'],
    ['wiki/dir./a.md', 'dot or space'],
    ['wiki/NUL.md', 'reserved device name'],
    ['wiki/con', 'reserved device name'],
    ['wiki/a/COM1.txt', 'reserved device name'],
    ['wiki/Lpt9.x.y', 'reserved device name'],
    ['wiki/conin$.md', 'reserved device name'],
    ['wiki/ConOut$.txt', 'reserved device name'],
    ['wiki/CONIN$', 'reserved device name'],
    ['wiki/a/conout$', 'reserved device name'],
    ['wiki/a?.md', 'forbidden characters'],
    ['', 'required'],
    ['   ', 'required'],
    [null, 'required'],
    [undefined, 'required'],
    [42, 'required']
  ]

  it.each(attacks.map(([a, e]) => [JSON.stringify(a), a, e]))('resolveWikiToolPath rejects %s', (_label, attack, expected) => {
    const r = resolveWikiToolPath(root, attack)
    expect(r.ok).toBe(false)
    expect(r.error).toContain(expected)
  })

  it.each(attacks.filter(([a]) => typeof a === 'string').map(([a, e]) => [JSON.stringify(a), a, e]))(
    'read_wiki and read_source refuse %s',
    async (_label, attack, expected) => {
      const w = await run({ operation: 'read_wiki', path: attack })
      const s = await run({ operation: 'read_source', path: attack })
      expect(w.isError).toBe(true)
      expect(s.isError).toBe(true)
      expect(text(w)).toContain(expected)
      expect(text(s)).toContain(expected)
      expect(text(w)).not.toContain('secret')
    }
  )

  it('treats a bare area as valid (for list) and percent-encoded dots as literal names', () => {
    expect(resolveWikiToolPath(root, 'wiki').ok).toBe(true)
    const r = resolveWikiToolPath(root, 'wiki/%2e%2e/general/x.md')
    expect(r.ok).toBe(true)
    expect(r.exists).toBe(false)
  })

  it('rejects a path that does not match the operation area', async () => {
    put('kb_source/a.md', 'x')
    put('wiki/a.md', 'x')
    expect((await run({ operation: 'read_source', path: 'wiki/a.md' })).isError).toBe(true)
    expect((await run({ operation: 'read_wiki', path: 'kb_source/a.md' })).isError).toBe(true)
  })

  it('does not touch the disk for invalid syntax (area missing is irrelevant)', () => {
    fs.rmSync(path.join(root, 'wiki'), { recursive: true })
    expect(resolveWikiToolPath(root, '../x').error).toContain('..')
  })

  it('normalises redundant separators and dot segments, and allows a not-yet-existing target', () => {
    const r = resolveWikiToolPath(root, 'wiki//./new/dir\\page.md')
    expect(r.ok).toBe(true)
    expect(r.exists).toBe(false)
    expect(r.rel).toBe('wiki/new/dir/page.md')
    expect(r.area).toBe('wiki')
    expect(r.abs.startsWith(fs.realpathSync.native(path.join(root, 'wiki')))).toBe(true)
  })

  it('refuses reads through a directory link that points outside wiki', async ctx => {
    fs.writeFileSync(path.join(outside, 'leak.md'), 'LEAKED')
    if (!tryLink(outside, path.join(root, 'wiki', 'link'))) return ctx.skip()
    const res = await run({ operation: 'read_wiki', path: 'wiki/link/leak.md' })
    expect(res.isError).toBe(true)
    expect(text(res)).not.toContain('LEAKED')
    // A not-yet-existing file below the link must be refused too (write-side reuse).
    expect(resolveWikiToolPath(root, 'wiki/link/new.md').ok).toBe(false)
    expect(resolveWikiToolPath(root, 'wiki/link').ok).toBe(false)
  })

  it('refuses a wiki link that points into kb_source (inside root but outside the area)', async ctx => {
    put('kb_source/a.md', 'SRC')
    if (!tryLink(path.join(root, 'kb_source'), path.join(root, 'wiki', 'srclink'))) return ctx.skip()
    expect((await run({ operation: 'read_wiki', path: 'wiki/srclink/a.md' })).isError).toBe(true)
  })

  it('does not follow links when listing', async ctx => {
    fs.writeFileSync(path.join(outside, 'leak.md'), 'LEAKED')
    if (!tryLink(outside, path.join(root, 'wiki', 'link'))) return ctx.skip()
    put('wiki/ok.md', 'x')
    const out = text(await run({ operation: 'list', area: 'wiki' }))
    expect(out).toContain('wiki/ok.md')
    expect(out).not.toContain('leak.md')
  })

  it('refuses a file link pointing outside', async ctx => {
    const target = path.join(outside, 'leak.md')
    fs.writeFileSync(target, 'LEAKED')
    try {
      fs.symlinkSync(target, path.join(root, 'wiki', 'f.md'), 'file')
    } catch {
      return ctx.skip()
    }
    const res = await run({ operation: 'read_wiki', path: 'wiki/f.md' })
    expect(res.isError).toBe(true)
    expect(text(res)).not.toContain('LEAKED')
  })

  it('refuses a dangling link pointing outside', async ctx => {
    try {
      fs.symlinkSync(path.join(outside, 'not-yet.md'), path.join(root, 'wiki', 'dangling.md'), 'file')
    } catch {
      return ctx.skip()
    }
    expect(resolveWikiToolPath(root, 'wiki/dangling.md').ok).toBe(false)
  })

  it('refuses an area that is a junction pointing outside the root', async ctx => {
    fs.rmSync(path.join(root, 'wiki'), { recursive: true })
    fs.writeFileSync(path.join(outside, 'leak.md'), 'LEAKED')
    if (!tryLink(outside, path.join(root, 'wiki'))) return ctx.skip()
    const res = await run({ operation: 'read_wiki', path: 'wiki/leak.md' })
    expect(res.isError).toBe(true)
    expect(text(res)).not.toContain('LEAKED')
    expect(resolveWikiToolPath(root, 'wiki/new.md').ok).toBe(false)
    expect((await run({ operation: 'list', area: 'wiki' })).isError).toBe(true)
  })
})

describe('kb_source area link', () => {
  it('refuses a kb_source junction pointing outside the root', async ctx => {
    fs.rmSync(path.join(root, 'kb_source'), { recursive: true })
    fs.writeFileSync(path.join(outside, 'leak.md'), 'LEAKED')
    if (!tryLink(outside, path.join(root, 'kb_source'))) return ctx.skip()
    const res = await run({ operation: 'read_source', path: 'kb_source/leak.md' })
    expect(res.isError).toBe(true)
    expect(text(res)).not.toContain('LEAKED')
    expect(resolveWikiToolPath(root, 'kb_source/new.md').ok).toBe(false)
    expect((await run({ operation: 'list', area: 'kb_source' })).isError).toBe(true)
  })
})

describe('canonical rel', () => {
  // Case variants only alias the same file on case-insensitive filesystems.
  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin'

  it('returns the on-disk spelling for case variants and keeps the hand-edit NOTE', async ctx => {
    if (!caseInsensitive) return ctx.skip()
    put('wiki/entities/Alice.md', 'edited by user')
    registry.pages['wiki/entities/Alice.md'] = { hash: sha256Text('original') }
    const r = resolveWikiToolPath(root, 'wiki/Entities/alice.md')
    expect(r.ok).toBe(true)
    expect(r.rel).toBe('wiki/entities/Alice.md')
    const out = text(await run({ operation: 'read_wiki', path: 'wiki/ENTITIES/ALICE.MD' }))
    expect(out.startsWith('[NOTE:')).toBe(true)
  })

  it('keeps the canonical existing prefix and appends the new tail as given', ctx => {
    if (!caseInsensitive) return ctx.skip()
    fs.mkdirSync(path.join(root, 'wiki', 'Entities'))
    const r = resolveWikiToolPath(root, 'wiki/entities/New.md')
    expect(r.ok).toBe(true)
    expect(r.exists).toBe(false)
    expect(r.rel).toBe('wiki/Entities/New.md')
  })
})

describe('error sanitising', () => {
  // Only meaningful where a differently spelled root aliases the same directory (case-insensitive win32).
  it('also strips the canonical root when the configured root is spelled differently', ctx => {
    if (process.platform !== 'win32') return ctx.skip()
    const canonical = fs.realpathSync.native(root)
    const odd = new AiDocWikiTool({ root: canonical.toUpperCase(), registry })
    expect(odd.root).not.toBe(canonical)
    const cleaned = odd._clean(`ENOENT: no such file '${canonical}\\wiki\\a.md' / '${canonical.split('\\').join('/')}/x'`)
    expect(cleaned).not.toContain(canonical)
    expect(cleaned.toLowerCase()).not.toContain(canonical.toLowerCase())
    expect(cleaned).toContain('<root>')
  })

  it('strips the absolute root (both separator styles) from messages', async () => {
    const cleaned = tool._clean(`ENOENT: '${root}\\wiki\\a.md' and '${root.split('\\').join('/')}/wiki/b.md'`)
    expect(cleaned).not.toContain(root)
    expect(cleaned).toContain('<root>')
    put('kb_source/bad.docx', 'not a zip')
    const res = await run({ operation: 'read_source', path: 'kb_source/bad.docx' })
    expect(res.isError).toBe(true)
    expect(text(res)).not.toContain(root)
  })
})

describe('write side', () => {
  const page = (extra = {}) => {
    const d = { type: 'summary', title: 'Alpha', sources: '[kb_source/a.md]', updated: '2026-01-02', ...extra }
    return `---\n${Object.entries(d).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\nBody line one.\nBody line two.\n`
  }
  const read = rel => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
  const write = (p, content) => run({ operation: 'write_wiki', path: p, content })

  it('creates a valid page, creating parent dirs, and reports it', async () => {
    const res = await write('wiki/concepts/Alpha.md', page())
    expect(res.isError).toBeFalsy()
    expect(read('wiki/concepts/Alpha.md')).toBe(page())
    expect(tool.getWrittenPages()).toEqual([{ rel: 'wiki/concepts/Alpha.md', type: 'summary', title: 'Alpha', sources: ['kb_source/a.md'], updated: '2026-01-02' }])
    expect(tool.getTouchedFiles()).toEqual(['wiki/concepts/Alpha.md'])
    expect(fs.readdirSync(path.join(root, 'wiki', 'concepts'))).toEqual(['Alpha.md'])
  })

  it('rejects invalid frontmatter without writing and names the field', async () => {
    let res = await write('wiki/a.md', page({ type: null }))
    expect(res.isError).toBe(true)
    expect(text(res)).toContain('type')
    res = await write('wiki/a.md', page({ sources: '[]' }))
    expect(text(res)).toContain('sources')
    expect(fs.existsSync(path.join(root, 'wiki', 'a.md'))).toBe(false)
    expect(tool.getWrittenPages()).toEqual([])
  })

  it('validates through a BOM', async () => {
    const res = await write('wiki/b.md', '﻿' + page())
    expect(res.isError).toBeFalsy()
  })

  it('rejects paths outside wiki, wrong extension and traversal', async () => {
    for (const p of ['kb_source/a.md', 'general/a.md', 'wiki/a.txt', 'wiki/../general/a.md', 'wiki/noext', 'a.md']) {
      const res = await write(p, page())
      expect(res.isError, p).toBe(true)
    }
    expect(fs.existsSync(path.join(root, 'general', 'a.md'))).toBe(false)
  })

  it('rejects illegal file names', async () => {
    for (const p of ['wiki/a:b.md', 'wiki/CON.md', `wiki/${'x'.repeat(121)}.md`, 'wiki/a..md.', 'wiki/a?.md', 'wiki/a\x01b.md']) {
      const res = await write(p, page())
      expect(res.isError, p).toBe(true)
    }
  })

  it('refuses SCHEMA.md and log.md', async () => {
    put('wiki/SCHEMA.md', 'rules')
    put('wiki/log.md', 'log')
    let res = await write('wiki/SCHEMA.md', 'x')
    expect(res.isError).toBe(true)
    res = await run({ operation: 'edit_wiki', path: 'wiki/log.md', oldText: 'log', newText: 'z' })
    expect(res.isError).toBe(true)
    expect(text(res)).toMatch(/application|app/i)
    expect(read('wiki/SCHEMA.md')).toBe('rules')
    expect(read('wiki/log.md')).toBe('log')
  })

  it('index.md is writable without frontmatter and only counted as touched', async () => {
    const res = await write('wiki/index.md', '# Index\n')
    expect(res.isError).toBeFalsy()
    expect(read('wiki/index.md')).toBe('# Index\n')
    expect(tool.getWrittenPages()).toEqual([])
    expect(tool.getTouchedFiles()).toEqual(['wiki/index.md'])
  })

  it('rejects oversized content', async () => {
    const res = await write('wiki/a.md', page() + 'x'.repeat(200001))
    expect(res.isError).toBe(true)
    expect(fs.existsSync(path.join(root, 'wiki', 'a.md'))).toBe(false)
  })

  it('does not leak the absolute root in errors', async () => {
    const res = await write('wiki/a.md', page({ type: 'bogus' }))
    expect(text(res)).not.toContain(root)
  })

  describe('edit_wiki', () => {
    const edit = (p, oldText, newText, extra = {}) => run({ operation: 'edit_wiki', path: p, oldText, newText, ...extra })

    it('replaces a unique match and registers the page', async () => {
      await write('wiki/a.md', page())
      const res = await edit('wiki/a.md', 'line one', 'line 1')
      expect(res.isError).toBeFalsy()
      expect(read('wiki/a.md')).toContain('Body line 1.')
      expect(tool.getWrittenPages()).toHaveLength(1)
    })

    it('errors on missing or ambiguous matches', async () => {
      await write('wiki/a.md', page())
      let res = await edit('wiki/a.md', 'nothing here', 'x')
      expect(res.isError).toBe(true)
      res = await edit('wiki/a.md', 'Body line', 'x')
      expect(res.isError).toBe(true)
      expect(text(res)).toMatch(/2/)
      res = await edit('wiki/a.md', 'Body line', 'Line', { occurrences: 2 })
      expect(res.isError).toBeFalsy()
      expect(read('wiki/a.md')).toContain('Line one.')
    })

    it('rejects an edit that breaks frontmatter and leaves the file untouched', async () => {
      await write('wiki/a.md', page())
      const before = read('wiki/a.md')
      const res = await edit('wiki/a.md', 'type: summary', 'type: nope')
      expect(res.isError).toBe(true)
      expect(text(res)).toContain('type')
      expect(read('wiki/a.md')).toBe(before)
    })

    it('rejects an edit that grows the file past the limit', async () => {
      await write('wiki/a.md', page())
      const res = await edit('wiki/a.md', 'line one', 'y'.repeat(200001))
      expect(res.isError).toBe(true)
    })

    it('preserves CRLF line endings', async () => {
      put('wiki/c.md', page().replace(/\n/g, '\r\n'))
      registry.pages['wiki/c.md'] = { hash: sha256Text(read('wiki/c.md')) }
      const res = await edit('wiki/c.md', 'Body line one.', 'First\nSecond')
      expect(res.isError).toBeFalsy()
      expect(read('wiki/c.md')).toContain('First\r\nSecond')
      expect(read('wiki/c.md').replace(/\r\n/g, '')).not.toContain('\n')
    })

    it('errors for a missing page', async () => {
      const res = await edit('wiki/nope.md', 'a', 'b')
      expect(res.isError).toBe(true)
    })
  })

  describe('hand-edit protection', () => {
    it('refuses write_wiki on a page whose hash differs, allows edit with reminder', async () => {
      put('wiki/h.md', page())
      registry.pages['wiki/h.md'] = { hash: 'stale' }
      let res = await write('wiki/h.md', page({ title: 'New' }))
      expect(res.isError).toBe(true)
      expect(text(res)).toContain('edit_wiki')
      res = await run({ operation: 'edit_wiki', path: 'wiki/h.md', oldText: 'line one', newText: 'line 1' })
      expect(res.isError).toBeFalsy()
      expect(text(res)).toContain('edits made by the user')
    })

    it('allows write_wiki when the hash matches', async () => {
      const abs = put('wiki/h.md', page())
      registry.pages['wiki/h.md'] = { hash: sha256Text(fs.readFileSync(abs, 'utf8')) }
      const res = await write('wiki/h.md', page({ title: 'New' }))
      expect(res.isError).toBeFalsy()
    })

    it('refuses an edit shrinking a hand-edited page by more than half', async () => {
      const long = page() + 'z'.repeat(400)
      put('wiki/h.md', long)
      registry.pages['wiki/h.md'] = { hash: 'stale' }
      const res = await run({ operation: 'edit_wiki', path: 'wiki/h.md', oldText: 'z'.repeat(400), newText: '' })
      expect(res.isError).toBe(true)
      expect(read('wiki/h.md')).toBe(long)
    })

    it('treats an unregistered page on disk as hand-edited', async () => {
      put('wiki/u.md', page())
      let res = await write('wiki/u.md', page({ title: 'New' }))
      expect(res.isError).toBe(true)
      res = await run({ operation: 'edit_wiki', path: 'wiki/u.md', oldText: 'line one', newText: 'line 1' })
      expect(res.isError).toBeFalsy()
      expect(text(res)).toContain('edits made by the user')
    })

    it('reports a hash mismatch as handEdited and an unregistered page only as unregistered', async () => {
      put('wiki/h.md', page())
      registry.pages['wiki/h.md'] = { hash: 'stale' }
      put('wiki/u.md', page())
      expect((await write('wiki/h.md', page({ title: 'New' }))).isError).toBe(true)
      expect((await write('wiki/u.md', page({ title: 'New' }))).isError).toBe(true)
      expect(tool.getWrittenPageState('wiki/h.md')).toMatchObject({ handEdited: true, unregistered: false })
      expect(tool.getWrittenPageState('wiki/u.md')).toMatchObject({ handEdited: false, unregistered: true })
      // A minimal edit keeps both classifications.
      await run({ operation: 'edit_wiki', path: 'wiki/u.md', oldText: 'line one', newText: 'line 1' })
      expect(tool.getWrittenPageState('wiki/u.md')).toMatchObject({ handEdited: false, unregistered: true })
      expect(tool.getWrittenPageState('wiki/untouched.md')).toEqual({ hash: undefined, handEdited: false, unregistered: false })
    })

    it('matches registry entries by canonical spelling', async () => {
      const abs = put('wiki/Case.md', page())
      registry.pages['wiki/Case.md'] = { hash: sha256Text(fs.readFileSync(abs, 'utf8')) }
      if (process.platform !== 'win32') return
      const res = await write('wiki/case.md', page({ title: 'New' }))
      expect(res.isError).toBeFalsy()
    })
  })
})

describe('write side hardening', () => {
  const page = (body = 'Body line one.\nBody line two.\n') =>
    `---\ntype: summary\ntitle: Alpha\nsources: [kb_source/a.md]\nupdated: 2026-01-02\n---\n${body}`
  const read = rel => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
  const write = (p, content) => run({ operation: 'write_wiki', path: p, content })
  const edit = (p, oldText, newText, extra = {}) => run({ operation: 'edit_wiki', path: p, oldText, newText, ...extra })

  it('keeps a user page protected after the tool edits it (stale registry hash)', async () => {
    put('wiki/u.md', page('user text\n'))
    registry.pages['wiki/u.md'] = { hash: 'stale' }
    expect((await write('wiki/u.md', page('x'))).isError).toBe(true)
    const res = await edit('wiki/u.md', 'user text', 'user text!')
    expect(res.isError).toBeFalsy()
    expect(text(res)).toContain('edits made by the user')
    const after = read('wiki/u.md')
    expect((await write('wiki/u.md', page('overwrite'))).isError).toBe(true)
    expect(read('wiki/u.md')).toBe(after)
    expect(after).toContain('user text!')
  })

  it('keeps a registry-less user page protected after an edit', async () => {
    put('wiki/u.md', page('user text\n'))
    expect(text(await edit('wiki/u.md', 'user', 'USER'))).toContain('edits made by the user')
    expect((await write('wiki/u.md', page('overwrite'))).isError).toBe(true)
    expect(read('wiki/u.md')).toContain('USER text')
    expect(text(await edit('wiki/u.md', 'USER', 'User'))).toContain('edits made by the user')
  })

  it('refuses write_wiki after a refused no-op edit and keeps content', async () => {
    const original = page('user text\n')
    put('wiki/u.md', original)
    registry.pages['wiki/u.md'] = { hash: 'stale' }
    expect((await edit('wiki/u.md', 'user text', 'user text')).isError).toBe(true)
    expect((await write('wiki/u.md', page('overwrite'))).isError).toBe(true)
    expect(read('wiki/u.md')).toBe(original)
  })

  it('applies the shrink guard cumulatively to the original length', async () => {
    const original = page('a'.repeat(300) + 'b'.repeat(300) + 'c'.repeat(300) + '\n')
    put('wiki/u.md', original)
    registry.pages['wiki/u.md'] = { hash: 'stale' }
    const results = []
    for (const ch of ['a', 'b', 'c']) {
      results.push(await edit('wiki/u.md', ch.repeat(300), ''))
      expect(read('wiki/u.md').length).toBeGreaterThanOrEqual(original.length * 0.5)
    }
    expect(results[0].isError).toBeFalsy()
    expect(results.slice(1).some(r => r.isError)).toBe(true)
    for (const r of results.filter(r => !r.isError)) expect(text(r)).toContain('edits made by the user')
  })

  it('lets the agent re-write and re-edit its own pages freely', async () => {
    expect((await write('wiki/own.md', page('one\n'))).isError).toBeFalsy()
    expect((await write('wiki/own.md', page('two\n'))).isError).toBeFalsy()
    const res = await edit('wiki/own.md', 'two', 'three')
    expect(res.isError).toBeFalsy()
    expect(text(res)).not.toContain('edits made by the user')
    expect((await write('wiki/own.md', page('four\n'))).isError).toBeFalsy()
    expect(read('wiki/own.md')).toContain('four')
  })

  it('rejects a no-op edit', async () => {
    await write('wiki/a.md', page())
    const res = await edit('wiki/a.md', 'Body', 'Body')
    expect(res.isError).toBe(true)
    expect(text(res)).toMatch(/identical|nothing/)
  })

  it('hides atomic-write temp files from list', async () => {
    put('wiki/a.md', page())
    put('wiki/.a.md.123.abc123.tmp', 'partial')
    const res = await run({ operation: 'list', area: 'wiki' })
    expect(text(res)).toContain('wiki/a.md')
    expect(text(res)).not.toContain('.tmp')
  })

  it('refuses to edit a page that is not valid UTF-8', async () => {
    put('wiki/bad.md', Buffer.concat([Buffer.from(page('x ')), Buffer.from([0xff, 0xfe, 0x41, 0x0a])]))
    const res = await edit('wiki/bad.md', 'x ', 'y ')
    expect(res.isError).toBe(true)
    expect(text(res)).toContain('UTF-8')
  })

  it('explains when an existing page lacks valid frontmatter', async () => {
    put('wiki/plain.md', 'just text\n')
    const before = read('wiki/plain.md')
    const res = await edit('wiki/plain.md', 'just', 'JUST')
    expect(res.isError).toBe(true)
    expect(text(res)).toMatch(/no valid frontmatter/)
    expect(read('wiki/plain.md')).toBe(before)
  })

  it('returns a clean error for non-object params', async () => {
    for (const bad of [null, 'x', 5, []]) {
      const res = await tool.execute('t1', bad)
      expect(res.isError).toBe(true)
      expect(text(res)).toContain('params must be an object')
    }
  })

  it('handles case-variant special file names', async () => {
    expect((await write('wiki/INDEX.md', '# i\n')).isError).toBeFalsy()
    expect(tool.getWrittenPages()).toEqual([])
    expect(tool.getTouchedFiles()).toEqual(['wiki/INDEX.md'])
    put('wiki/schema.md', 'rules')
    put('wiki/Log.MD', 'log')
    expect((await write('wiki/schema.md', 'x')).isError).toBe(true)
    expect((await write('wiki/Log.MD', 'x')).isError).toBe(true)
    expect((await edit('wiki/Log.MD', 'log', 'z')).isError).toBe(true)
    expect((await edit('wiki/schema.md', 'rules', 'z')).isError).toBe(true)
    expect(read('wiki/schema.md')).toBe('rules')
    expect(read('wiki/Log.MD')).toBe('log')
  })

  it('treats a nested index.md as a normal page', async () => {
    const res = await write('wiki/sub/index.md', '# no frontmatter\n')
    expect(res.isError).toBe(true)
    expect(fs.existsSync(path.join(root, 'wiki', 'sub', 'index.md'))).toBe(false)
    expect((await write('wiki/sub/index.md', page())).isError).toBeFalsy()
    expect(tool.getWrittenPages().map(p => p.rel)).toEqual(['wiki/sub/index.md'])
  })

  it('cleans up the temp file and registers nothing when rename fails', async () => {
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('boom') })
    try {
      const res = await write('wiki/a.md', page())
      expect(res.isError).toBe(true)
    } finally {
      spy.mockRestore()
    }
    expect(fs.readdirSync(path.join(root, 'wiki'))).toEqual([])
    expect(tool.getWrittenPages()).toEqual([])
    expect(tool.getTouchedFiles()).toEqual([])
  })
})
