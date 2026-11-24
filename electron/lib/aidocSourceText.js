'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { extractDocument } = require('./aidocTextExtract')

const INGESTIBLE_EXTS = new Set(['md', 'txt', 'html', 'htm', 'pdf', 'docx', 'pptx'])
// extractDocument does not export its 32MB cap, so PDFs get their own (larger, since PDFs embed images) limit.
const MAX_PDF_BYTES = 64 * 1024 * 1024
const MIN_LIMIT = 1000
const MAX_LIMIT = 50000

function fail(reason, detail) {
  return detail === undefined ? { ok: false, reason } : { ok: false, reason, detail }
}

async function readPdf(absPath) {
  // Required lazily: the package's index.js has a debug-mode branch that reads a test file.
  const pdfParse = require('pdf-parse')
  const stat = await fs.stat(absPath)
  if (!stat.isFile()) return fail('extract_failed', 'Not a regular file')
  if (stat.size > MAX_PDF_BYTES) return fail('extract_failed', 'Document is too large')
  const data = await pdfParse(await fs.readFile(absPath))
  const text = data.text || ''
  const visible = text.replace(/\s/g, '').length
  if (visible < Math.max(50, (data.numpages || 0) * 20)) return fail('scanned_pdf')
  return { ok: true, text, title: path.basename(absPath, path.extname(absPath)) }
}

async function loadSourceText(absPath) {
  try {
    const ext = path.extname(absPath).slice(1).toLowerCase()
    if (!INGESTIBLE_EXTS.has(ext)) return fail('unsupported')

    let result
    if (ext === 'pdf') {
      result = await readPdf(absPath)
      if (!result.ok) return result
    } else {
      result = await extractDocument(absPath, ext)
      if (!result) return fail('unsupported')
      if (result.error) return fail('extract_failed', result.error)
      result = { ok: true, text: result.text, title: result.title }
    }
    if (!result.text.trim()) return fail('empty')
    return result
  } catch (error) {
    return fail('extract_failed', error?.message || String(error))
  }
}

function readSourceChunk(text, offset, limit) {
  const totalChars = text.length
  const start = Number.isFinite(offset) ? Math.min(Math.max(Math.trunc(offset), 0), totalChars) : 0
  const size = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : MIN_LIMIT, MIN_LIMIT), MAX_LIMIT)
  if (start >= totalChars) return { chunk: '', totalChars, nextOffset: null }

  let end = Math.min(start + size, totalChars)
  if (end < totalChars) {
    const floor = end - Math.floor(size / 10)
    const newline = text.lastIndexOf('\n', end - 1)
    if (newline >= floor && newline >= start) end = newline + 1
  }
  // Never split a surrogate pair.
  const last = text.charCodeAt(end - 1)
  if (end < totalChars && end - 1 > start && last >= 0xd800 && last <= 0xdbff) end--
  return { chunk: text.slice(start, end), totalChars, nextOffset: end >= totalChars ? null : end }
}

module.exports = { INGESTIBLE_EXTS, loadSourceText, readSourceChunk }
