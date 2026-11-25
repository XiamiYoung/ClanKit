import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { parseFrontmatter, validateWikiFrontmatter, sha256Text, sha256File } = require('../aidocFrontmatter')

describe('parseFrontmatter', () => {
  it('tolerates a leading UTF-8 BOM', () => {
    const r = parseFrontmatter('﻿---\ntype: summary\ntitle: Hello\n---\nBody\n')
    expect(r.hasFrontmatter).toBe(true)
    expect(r.data.type).toBe('summary')
    expect(r.body).toBe('Body\n')
  })

  it('parses scalar fields and body', () => {
    const r = parseFrontmatter('---\ntype: summary\ntitle: Hello\n---\nBody text\n')
    expect(r.hasFrontmatter).toBe(true)
    expect(r.data).toEqual({ type: 'summary', title: 'Hello' })
    expect(r.body).toBe('Body text\n')
  })

  it('parses inline and dash lists identically', () => {
    const inline = parseFrontmatter('---\nsources: [kb_source/a.md, kb_source/b.pdf]\n---\nx')
    const dash = parseFrontmatter('---\nsources:\n  - kb_source/a.md\n  - kb_source/b.pdf\n---\nx')
    expect(inline.data.sources).toEqual(['kb_source/a.md', 'kb_source/b.pdf'])
    expect(dash.data.sources).toEqual(inline.data.sources)
  })

  it('strips surrounding quotes', () => {
    const r = parseFrontmatter('---\ntitle: "Quoted: Title"\nalias: \'x\'\n---\n')
    expect(r.data.title).toBe('Quoted: Title')
    expect(r.data.alias).toBe('x')
  })

  it('reports no frontmatter when missing or unclosed', () => {
    const none = parseFrontmatter('just text')
    expect(none).toEqual({ data: {}, body: 'just text', hasFrontmatter: false })
    const open = parseFrontmatter('---\ntype: summary\nno close')
    expect(open).toEqual({ data: {}, body: '---\ntype: summary\nno close', hasFrontmatter: false })
  })
})

describe('validateWikiFrontmatter', () => {
  const good = { type: 'summary', title: 'T', sources: ['kb_source/a.md'], updated: '2026-11-24' }

  it('accepts valid data', () => {
    expect(validateWikiFrontmatter(good)).toEqual({ ok: true })
  })

  it('rejects missing type', () => {
    const r = validateWikiFrontmatter({ ...good, type: undefined })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('type')
  })

  it('rejects unknown type', () => {
    const r = validateWikiFrontmatter({ ...good, type: 'bogus' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('type')
    expect(r.error).toContain('comparison')
  })

  it('rejects empty title', () => {
    const r = validateWikiFrontmatter({ ...good, title: ' ' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('title')
  })

  it('rejects empty sources and bad source prefix', () => {
    const empty = validateWikiFrontmatter({ ...good, sources: [] })
    const bad = validateWikiFrontmatter({ ...good, sources: ['wiki/a.md'] })
    expect(empty.ok).toBe(false)
    expect(empty.error).toContain('sources')
    expect(bad.ok).toBe(false)
    expect(bad.error).toContain('kb_source/')
    expect(bad.error).not.toBe(empty.error)
  })

  it('rejects bad updated format', () => {
    const r = validateWikiFrontmatter({ ...good, updated: '24/11/2026' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('updated')
  })
})

describe('sha256', () => {
  it('hashes text to the known value', () => {
    expect(sha256Text('a')).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb')
  })

  it('hashes a file the same as text', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aidoc-fm-')), 'f.txt')
    fs.writeFileSync(file, 'hello world')
    expect(await sha256File(file)).toBe(sha256Text('hello world'))
  })
})
