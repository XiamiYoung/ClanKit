'use strict'

const fs = require('node:fs/promises')
const { constants } = require('node:fs')
const path = require('node:path')
const { inflateRaw } = require('node:zlib')
const { promisify } = require('node:util')
const AdmZip = require('adm-zip')
const mammoth = require('mammoth')

const TEXT_EXTRACTABLE_EXTS = new Set(['md', 'txt', 'html', 'htm', 'drawio', 'pptx', 'docx'])
const DOCUMENT_EXTS = new Set([...TEXT_EXTRACTABLE_EXTS, 'pdf', 'xlsx'])
const STRUCTURED_EXTS = new Set(['drawio', 'pptx', 'docx'])
const MAX_ENTRY_BYTES = 8 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024
const inflate = promisify(inflateRaw)
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
    if (body[0] !== '#') return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : entity
    const hex = body[1].toLowerCase() === 'x'
    const value = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity
  })
}

function stripHtmlEffects(text) {
  return text
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
}

function stripHtml(text) {
  return decodeEntities(stripHtmlEffects(text)
    .replace(/<\/?(?:br|p|div|li|h[1-6]|tr|pre)\b[^>]*>/gi, '\n')
    .replace(/<\/?[a-z](?:[^<>"']|"[^"]*"|'[^']*')*>|<!doctype[^>]*>/gi, ''))
}

async function extractDrawio(text) {
  const pages = [...text.matchAll(/<diagram\b[^>]*>([\s\S]*?)<\/diagram\s*>/gi)].map(match => match[1].trim())
  if (!pages.length) {
    if (!/^\s*<(?:\?xml[^>]*>\s*<)?mxGraphModel\b/i.test(text)) throw new Error('Missing draw.io diagram')
    pages.push(text)
  }

  let expanded = 0
  const values = []
  for (let xml of pages) {
    if (!xml) continue
    if (!xml.startsWith('<')) {
      const limit = Math.min(MAX_ENTRY_BYTES, MAX_DOCUMENT_BYTES - expanded)
      if (limit <= 0) throw new Error('Draw.io document is too large')
      const decoded = await inflate(Buffer.from(xml, 'base64'), { maxOutputLength: limit })
      expanded += decoded.length
      xml = decodeURIComponent(decoded.toString('utf8'))
    }
    if (!/<mxGraphModel\b/i.test(xml)) throw new Error('Invalid draw.io diagram')
    for (const cell of xml.matchAll(/<mxCell\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi)) {
      const value = /\svalue\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(cell[0])
      if (value) values.push(stripHtml(decodeEntities(value[1] ?? value[2])).trim())
    }
  }
  return values.join('\n')
}

function openOfficeArchive(data) {
  const zip = new AdmZip(data)
  let expanded = 0
  function readEntry(entry) {
    const size = entry.header.size
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ENTRY_BYTES || expanded + size > MAX_DOCUMENT_BYTES) {
      throw new Error('Office document text is too large')
    }
    if (size === 0) return Buffer.alloc(0)
    expanded += size
    // The synchronous ZIP reader checks CRC and caps inflation at the declared size.
    const data = entry.getData()
    if (data.length !== size) throw new Error('Invalid Office document entry')
    return data
  }
  return { zip, readEntry }
}

function extractPowerPoint({ zip, readEntry }) {
  const slides = zip.getEntries().flatMap(entry => {
    const match = /^ppt\/slides\/slide(\d+)\.xml$/.exec(entry.entryName)
    return match ? [{ entry, number: Number(match[1]) }] : []
  }).sort((a, b) => a.number - b.number)
  if (!slides.length) throw new Error('Missing PowerPoint slides')

  function readRuns(xml) {
    return Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t\s*>/g), match => decodeEntities(match[1])).join('')
  }
  return slides.map(({ entry }) => {
    const xml = readEntry(entry).toString('utf8')
    const paragraphs = Array.from(xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p\s*>/g), match => readRuns(match[1]))
    return paragraphs.length ? paragraphs.join('\n') : readRuns(xml)
  }).join('\n')
}

async function extractWord({ zip, readEntry }) {
  // Supply the ZIP reader so Mammoth only receives entries within the inflation limits.
  const file = {
    exists: name => Boolean(zip.getEntry(name)),
    async read(name, encoding) {
      const data = readEntry(zip.getEntry(name))
      return encoding ? data.toString(encoding) : data
    },
  }
  const result = await mammoth.extractRawText({ file })
  return result.value
}

async function extractDocument(absPath, ext) {
  if (!TEXT_EXTRACTABLE_EXTS.has(ext)) return null
  const title = path.basename(absPath, path.extname(absPath))
  const file = await fs.open(absPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    if (!STRUCTURED_EXTS.has(ext)) {
      const text = await file.readFile('utf8')
      if (ext === 'md' || ext === 'txt') {
        const heading = /^[ \t]{0,3}#[ \t]+(.+?)\s*$/m.exec(text)
        return { title: heading?.[1].trim() || title, text }
      }
      const heading = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(stripHtmlEffects(text))
      return { title: (heading && stripHtml(heading[1]).trim()) || title, text: stripHtml(text) }
    }

    const { size } = await file.stat()
    if (size > MAX_DOCUMENT_BYTES) return { title, text: '', error: 'Document is too large' }
    const data = await file.readFile()
    try {
      if (data.length > MAX_DOCUMENT_BYTES) throw new Error('Document is too large')
      if (ext === 'drawio') return { title, text: await extractDrawio(data.toString('utf8')) }
      const archive = openOfficeArchive(data)
      const text = ext === 'pptx' ? extractPowerPoint(archive) : await extractWord(archive)
      return { title, text }
    } catch (error) {
      return { title, text: '', error: error.message || String(error) }
    }
  } finally {
    await file.close()
  }
}

module.exports = { DOCUMENT_EXTS, TEXT_EXTRACTABLE_EXTS, extractDocument }
