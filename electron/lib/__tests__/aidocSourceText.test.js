import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { Document, Packer, Paragraph, TextRun } = require('docx')
const { INGESTIBLE_EXTS, loadSourceText, readSourceChunk } = require('../aidocSourceText')

let root
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-source-'))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function write(name, contents) {
  const file = path.join(root, name)
  await fs.writeFile(file, contents)
  return file
}

describe('loadSourceText', () => {
  it('exposes the ingestible extension set', () => {
    expect([...INGESTIBLE_EXTS].sort()).toEqual(['docx', 'htm', 'html', 'md', 'pdf', 'pptx', 'txt'])
  })

  it('reads md raw so heading levels are preserved', async () => {
    const text = '# Title\n\n## Part\nBody [[link]]'
    const result = await loadSourceText(await write('a.md', text))
    expect(result).toEqual({ ok: true, text, title: 'Title' })
  })

  it('reads txt in full', async () => {
    const result = await loadSourceText(await write('plain.txt', 'line one\nline two'))
    expect(result).toEqual({ ok: true, text: 'line one\nline two', title: 'plain' })
  })

  it('extracts html text', async () => {
    const result = await loadSourceText(await write('p.html', '<title>T</title><p>Hello <b>world</b></p>'))
    expect(result.ok).toBe(true)
    expect(result.title).toBe('T')
    expect(result.text).toContain('Hello world')
  })

  it('extracts docx text', async () => {
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('Docx body text')] })] }] })
    const result = await loadSourceText(await write('d.docx', await Packer.toBuffer(doc)))
    expect(result.ok).toBe(true)
    expect(result.text).toContain('Docx body text')
  })

  it('returns empty for empty and whitespace-only files', async () => {
    expect(await loadSourceText(await write('e.md', ''))).toEqual({ ok: false, reason: 'empty' })
    expect(await loadSourceText(await write('w.txt', ' \n\t \n'))).toEqual({ ok: false, reason: 'empty' })
  })

  it('returns unsupported for other extensions', async () => {
    expect(await loadSourceText(await write('x.png', 'data'))).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('returns extract_failed with detail for a corrupt docx', async () => {
    const result = await loadSourceText(await write('bad.docx', 'not a zip'))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('extract_failed')
    expect(result.detail).toBeTruthy()
  })

  it('returns extract_failed instead of throwing for a missing file', async () => {
    const result = await loadSourceText(path.join(root, 'missing.md'))
    expect(result).toMatchObject({ ok: false, reason: 'extract_failed' })
  })

  it('extracts text from a real pdf', async () => {
    // pdf-parse ships a sample pdf; hand-built tiny pdfs are rejected by its bundled pdf.js.
    const sample = require.resolve('pdf-parse/test/data/01-valid.pdf')
    const result = await loadSourceText(await write('r.pdf', await fs.readFile(sample)))
    expect(result.ok).toBe(true)
    expect(result.text.length).toBeGreaterThan(1000)
    expect(result.title).toBe('r')
  })

  // A real scanned pdf cannot be built here, so pdf-parse is stubbed (via the require cache, since
  // vi.mock does not intercept CommonJS require) to return almost no text.
  it('flags a pdf with almost no text as scanned_pdf', async () => {
    const key = require.resolve('pdf-parse')
    const real = require(key)
    require.cache[key].exports = async () => ({ text: ' Hi \n', numpages: 3 })
    try {
      const result = await loadSourceText(await write('s.pdf', 'stub'))
      expect(result).toEqual({ ok: false, reason: 'scanned_pdf' })
    } finally {
      require.cache[key].exports = real
    }
  })

  it('rejects an oversized pdf before reading it', async () => {
    const file = await write('big.pdf', '')
    await fs.truncate(file, 64 * 1024 * 1024 + 1)
    expect(await loadSourceText(file)).toEqual({ ok: false, reason: 'extract_failed', detail: 'Document is too large' })
  })

  it('returns extract_failed for a directory named like a pdf', async () => {
    const dir = path.join(root, 'dir.pdf')
    await fs.mkdir(dir)
    expect(await loadSourceText(dir)).toMatchObject({ ok: false, reason: 'extract_failed' })
  })

  it('returns extract_failed for a corrupt pdf', async () => {
    const result = await loadSourceText(await write('c.pdf', 'garbage'))
    expect(result).toMatchObject({ ok: false, reason: 'extract_failed' })
  })
})

describe('readSourceChunk', () => {
  it('reads short text in one call', () => {
    expect(readSourceChunk('hello', 0, 5000)).toEqual({ chunk: 'hello', totalChars: 5, nextOffset: null })
  })

  it('reassembles long text across calls', () => {
    const text = Array.from({ length: 400 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n')
    let offset = 0
    let out = ''
    let calls = 0
    while (offset !== null) {
      const r = readSourceChunk(text, offset, 1500)
      out += r.chunk
      offset = r.nextOffset
      calls++
    }
    expect(calls).toBeGreaterThan(1)
    expect(out).toBe(text)
  })

  it('returns an empty chunk when offset is past the end', () => {
    expect(readSourceChunk('abc', 10, 1000)).toEqual({ chunk: '', totalChars: 3, nextOffset: null })
  })

  it('treats a negative offset as 0', () => {
    expect(readSourceChunk('abc', -5, 1000).chunk).toBe('abc')
  })

  it('raises a limit below 1000 to 1000 and caps at 50000', () => {
    const text = 'a'.repeat(120000)
    expect(readSourceChunk(text, 0, 10).chunk.length).toBe(1000)
    expect(readSourceChunk(text, 0, 999999).chunk.length).toBe(50000)
  })

  it('breaks at a newline within the last 10 percent of the limit', () => {
    const text = 'a'.repeat(950) + '\n' + 'b'.repeat(500)
    const r = readSourceChunk(text, 0, 1000)
    expect(r.chunk).toBe('a'.repeat(950) + '\n')
    expect(r.nextOffset).toBe(951)
  })

  function readAll(text, limit) {
    const chunks = []
    let offset = 0
    while (offset !== null) {
      const r = readSourceChunk(text, offset, limit)
      chunks.push(r.chunk)
      offset = r.nextOffset
    }
    return chunks
  }

  it('never splits a surrogate pair at a hard cut', () => {
    // One leading unit shifts every pair so a 1000-unit cut lands between a high and low surrogate.
    const text = 'a' + '\u{1F600}'.repeat(2500)
    const chunks = readAll(text, 1000)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      const last = chunk.charCodeAt(chunk.length - 1)
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
    }
    expect(chunks.join('')).toBe(text)
  })

  it('reassembles exactly across hard cuts without newlines', () => {
    const text = 'abcdefghij'.repeat(1234)
    const chunks = readAll(text, 1000)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(text)
  })

  it('reassembles CRLF text when a boundary falls between CR and LF', () => {
    const text = 'a'.repeat(999) + '\r\n' + 'b'.repeat(1500) + '\r\n' + 'c'.repeat(300)
    const chunks = readAll(text, 1000)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(text)
  })

  it('hard-cuts when no newline is near the end', () => {
    const text = 'a'.repeat(500) + '\n' + 'b'.repeat(1500)
    const r = readSourceChunk(text, 0, 1000)
    expect(r.chunk.length).toBe(1000)
    expect(r.nextOffset).toBe(1000)
  })
})
