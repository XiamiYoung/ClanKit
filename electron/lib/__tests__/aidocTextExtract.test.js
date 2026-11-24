import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const { Document, Packer, Paragraph, TextRun } = require('docx')
const { extractDocument } = require('../aidocTextExtract')

let root
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-text-'))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function extract(name, contents) {
  const file = path.join(root, name)
  await fs.writeFile(file, contents)
  return extractDocument(file, path.extname(file).slice(1))
}

describe('extractDocument', () => {
  it('uses the first level-one heading or the file stem and keeps the original text', async () => {
    const text = '## Subtitle\n# First title\n[[a]]\n# Second title'
    expect(await extract('notes.md', text)).toEqual({ title: 'First title', text })
    expect(await extract('untitled.md', 'Body')).toEqual({ title: 'untitled', text: 'Body' })
    expect(await extract('notes.txt', 'Plain [[article]]')).toEqual({ title: 'notes', text: 'Plain [[article]]' })
  })

  it('extracts HTML text and its title without script or style contents', async () => {
    const link = '[[\u6587\u7ae0]]'
    const document = await extract('page.html', `<title>Title &amp; subtitle</title><script>[[script]]</script><style>[[style]]</style><p>See <b>${link}</b>.</p>`)
    expect(document.title).toBe('Title & subtitle')
    expect(document.text).toContain(`See ${link}.`)
    expect(document.text).not.toMatch(/\[\[(script|style)\]\]/)
    expect(document.text).not.toContain('<p>')
    expect(await extract('fallback.htm', '<p>Body</p>')).toMatchObject({ title: 'fallback' })
  })

  it('returns null for unsupported extensions and rejects unreadable paths', async () => {
    expect(await extractDocument(path.join(root, 'missing.png'), 'png')).toBeNull()
    await expect(extractDocument(path.join(root, 'missing.md'), 'md')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(extractDocument(path.join(root, 'missing.docx'), 'docx')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('extracts text from plain and compressed draw.io diagrams', async () => {
    const firstLink = '[[\u7b14\u8bb0A]]'
    const secondLink = '[[\u7b14\u8bb0B]]'
    const plain = `<mxGraphModel><root><mxCell value="See ${firstLink}"/></root></mxGraphModel>`
    const rich = `<mxGraphModel><root><mxCell value="&lt;b&gt;See ${secondLink}&lt;/b&gt; &amp;amp; more"/></root></mxGraphModel>`
    const compressed = deflateRawSync(encodeURIComponent(rich)).toString('base64')
    const document = await extract('map.drawio', `<mxfile><diagram>${plain}</diagram><diagram>${compressed}</diagram></mxfile>`)
    expect(document).toEqual({ title: 'map', text: `See ${firstLink}\nSee ${secondLink} & more` })
  })

  it('reads PowerPoint slides in numeric order and joins runs within paragraphs', async () => {
    const zip = new AdmZip()
    zip.addFile('ppt/slides/slide10.xml', Buffer.from('<a:t>[[page ten]]</a:t>'))
    zip.addFile('ppt/slides/slide2.xml', Buffer.from('<a:p><a:t>[[page </a:t><a:t>two]]</a:t></a:p>'))
    expect(await extract('deck.pptx', zip.toBuffer())).toEqual({ title: 'deck', text: '[[page two]]\n[[page ten]]' })
  })

  it('extracts raw text from a generated Word document', async () => {
    const firstRun = '[[\u6587\u6863'
    const secondRun = '\u94fe\u63a5]]'
    const file = new Document({
      sections: [{ children: [new Paragraph({ children: [new TextRun(firstRun), new TextRun(secondRun)] })] }],
    })
    expect(await extract('document.docx', await Packer.toBuffer(file))).toMatchObject({
      title: 'document',
      text: expect.stringContaining(firstRun + secondRun),
    })
  })

  it.each(['drawio', 'docx', 'pptx'])('reports malformed %s files with empty text', async (ext) => {
    expect(await extract(`broken.${ext}`, 'random bytes')).toEqual({
      title: 'broken',
      text: '',
      error: expect.any(String),
    })
  })

  it('rejects large compressed entries before parsing their text', async () => {
    const xml = '<mxGraphModel>' + ' '.repeat(8 * 1024 * 1024) + '</mxGraphModel>'
    const compressed = deflateRawSync(xml).toString('base64')
    expect(await extract('large.drawio', `<mxfile><diagram>${compressed}</diagram></mxfile>`))
      .toMatchObject({ title: 'large', text: '', error: expect.any(String) })

    const zip = new AdmZip()
    zip.addFile('ppt/slides/slide1.xml', Buffer.from(xml))
    expect(await extract('large.pptx', zip.toBuffer()))
      .toMatchObject({ title: 'large', text: '', error: 'Office document text is too large' })
  })
})
