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

// A single blank-page PDF: parses fine but has no extractable text (acts like a scan).
const BLANK_PDF = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj',
  'trailer<</Root 1 0 R/Size 4>>',
  '%%EOF'
].join('\n')

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

  it('truncates at 300 entries and says so', async () => {
    for (let i = 0; i < 305; i++) put(`wiki/p${String(i).padStart(3, '0')}.md`, 'x')
    const res = await run({ operation: 'list', area: 'wiki' })
    expect(res.details.files).toHaveLength(300)
    expect(text(res)).toContain('truncated')
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

  it('returns an error with the reason for a scanned pdf', async () => {
    put('kb_source/scan.pdf', BLANK_PDF)
    const res = await run({ operation: 'read_source', path: 'kb_source/scan.pdf' })
    expect(res.isError).toBe(true)
    expect(['scanned_pdf', 'extract_failed', 'empty']).toContain(res.details.reason)
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

  it('rejects kb_source paths', async () => {
    put('kb_source/a.md', 'x')
    expect((await run({ operation: 'read_wiki', path: 'kb_source/a.md' })).isError).toBe(true)
  })
})

describe('path confinement', () => {
  const attacks = [
    '../general/x.md',
    'wiki/../../x',
    'wiki/../general/x.md',
    'wiki/..\\..\\general\\x.md',
    'kb_source/../wiki/a.md',
    '/etc/passwd',
    '\\etc\\passwd',
    'C:\\x',
    'C:/x',
    'c:x',
    '\\\\server\\share\\x',
    '//server/share/x',
    'wiki/a.md\0.png',
    'general/x.md',
    'general/a.md',
    'Wiki/a.md',
    'wiki',
    'wiki/a.md:stream',
    'wiki/a.md:$DATA',
    'wiki/a.md.',
    'wiki/a.md ',
    'wiki/dir./a.md',
    'wiki/%2e%2e/general/x.md',
    '',
    '   ',
    null,
    undefined,
    42
  ]

  it.each(attacks.map(a => [JSON.stringify(a), a]))('resolveWikiToolPath rejects %s', (_label, attack) => {
    // 'wiki' alone is a valid area root for list, but a bare area is not a readable file.
    if (attack === 'wiki') {
      expect(resolveWikiToolPath(root, attack).ok).toBe(true)
      return
    }
    // Percent-encoded dots are not decoded, so the segment is a harmless literal name.
    if (attack === 'wiki/%2e%2e/general/x.md') {
      const r = resolveWikiToolPath(root, attack)
      expect(r.ok).toBe(true)
      expect(r.exists).toBe(false)
      return
    }
    expect(resolveWikiToolPath(root, attack).ok).toBe(false)
  })

  it.each(attacks.filter(a => typeof a === 'string' && a !== 'wiki' && !a.includes('%2e')))(
    'read_wiki and read_source refuse %j',
    async attack => {
      const w = await run({ operation: 'read_wiki', path: attack })
      const s = await run({ operation: 'read_source', path: attack })
      expect(w.isError).toBe(true)
      expect(s.isError).toBe(true)
      expect(text(w)).not.toContain('secret')
      expect(text(s)).not.toContain('secret')
    }
  )

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
    expect(r.abs.startsWith(fs.realpathSync(path.join(root, 'wiki')))).toBe(true)
  })

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

  it('refuses a wiki link that points into kb_source (stays inside root but outside the area)', async ctx => {
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
})
