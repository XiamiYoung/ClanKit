import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  it('write operations report not implemented', async () => {
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
