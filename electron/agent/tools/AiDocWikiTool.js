'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { BaseTool } = require('./BaseTool')
const { INGESTIBLE_EXTS, loadSourceText, readSourceChunk } = require('../../lib/aidocSourceText')
const { sha256Text } = require('../../lib/aidocFrontmatter')

const AREAS = ['kb_source', 'wiki']
const MAX_LIST = 300
const MAX_WIKI_READ_CHARS = 200000
// Byte cap checked before reading; generous (4 bytes per char) so only the char count decides near the limit.
const MAX_WIKI_READ_BYTES = MAX_WIKI_READ_CHARS * 4
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|conin\$|conout\$|com[1-9]|lpt[1-9])$/i
const USER_EDIT_NOTE = '[NOTE: this page contains edits made by the user; preserve their content]'

const SOURCE_FAILURES = {
  unsupported: 'Unsupported file type',
  empty: 'The file has no readable text',
  scanned_pdf: 'This PDF looks like a scanned document (no extractable text)',
  extract_failed: 'Text extraction failed'
}

function isInside(realBase, realTarget) {
  const norm = p => (process.platform === 'win32' ? p.toLowerCase() : p)
  const base = norm(realBase)
  const target = norm(realTarget)
  return target === base || target.startsWith(base.endsWith(path.sep) ? base : base + path.sep)
}

function lexists(p) {
  try {
    fs.lstatSync(p)
    return true
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return false
    throw e
  }
}

/**
 * Validate and resolve a model-supplied path such as "wiki/a.md" or "kb_source/x/y.pdf".
 * Pure validation runs before any disk access; the target itself may not exist yet.
 * Symlink escapes are caught by realpath on the nearest existing ancestor.
 * @returns {{ok:true, area:string, rel:string, abs:string, exists:boolean}|{ok:false, error:string}}
 */
function resolveWikiToolPath(root, areaRel) {
  const bad = error => ({ ok: false, error })
  if (typeof areaRel !== 'string' || !areaRel.trim()) return bad('path is required')
  if (areaRel.includes('\0')) return bad('Invalid path: contains NUL')

  const unified = areaRel.replace(/\\/g, '/')
  if (unified.startsWith('/')) return bad('Invalid path: absolute and UNC paths are not allowed')
  if (/^[a-zA-Z]:/.test(unified)) return bad('Invalid path: drive letters are not allowed')

  const segments = []
  for (const seg of unified.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') return bad('Invalid path: ".." is not allowed')
    if (seg.includes(':')) return bad('Invalid path: ":" is not allowed')
    if (RESERVED_DEVICE_NAME.test(seg.split('.')[0].trim())) return bad('Invalid path: reserved device name')
    if (/[. ]$/.test(seg)) return bad('Invalid path: segments must not end with a dot or space')
    if (/[<>"|?*]/.test(seg)) return bad('Invalid path: contains forbidden characters')
    segments.push(seg)
  }
  const area = segments[0]
  if (!AREAS.includes(area)) return bad('Path must start with kb_source/ or wiki/')

  // The native variant also returns the on-disk spelling (case, long names) of each component.
  let realRoot
  let realArea
  try {
    realRoot = fs.realpathSync.native(root)
    realArea = fs.realpathSync.native(path.join(root, area))
  } catch {
    return bad(`Area "${area}" does not exist`)
  }
  if (realArea === realRoot || !isInside(realRoot, realArea)) return bad('Area resolves outside the knowledge base root')

  const abs = path.join(root, ...segments)
  // Find the nearest ancestor that exists on disk (a dangling symlink counts as existing and is rejected).
  let probe = abs
  const tail = []
  try {
    while (!lexists(probe)) {
      tail.unshift(path.basename(probe))
      const parent = path.dirname(probe)
      if (parent === probe) return bad('Path could not be resolved')
      probe = parent
    }
    const realProbe = fs.realpathSync.native(probe)
    if (!isInside(realArea, realProbe)) return bad('Path escapes the allowed area')
    // Canonical rel: on-disk spelling of the existing part, plus the not-yet-existing tail as given.
    const existing = path.relative(realArea, realProbe).split(path.sep).filter(Boolean)
    return {
      ok: true,
      area,
      rel: [area, ...existing, ...tail].join('/'),
      abs: path.join(realProbe, ...tail),
      exists: tail.length === 0
    }
  } catch {
    return bad('Path could not be resolved')
  }
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

class AiDocWikiTool extends BaseTool {
  constructor({ root, registry } = {}) {
    super(
      'aidoc_wiki',
      'Read source documents (kb_source/) and read or maintain wiki pages (wiki/) of the AI Doc knowledge base. Access is confined to those two folders.',
      'aidoc_wiki'
    )
    this.root = root
    this.registry = registry || { version: 1, sources: {}, pages: {} }
  }

  schema() {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['list', 'read_source', 'read_wiki', 'write_wiki', 'edit_wiki'],
          description: [
            '- "list": list files in an area. REQUIRED: area. OPTIONAL: dir (sub-directory), query (case-insensitive filename substring).',
            '- "read_source": read a source document, paginated. REQUIRED: path (kb_source/...). OPTIONAL: offset, limit.',
            '- "read_wiki": read a whole wiki page. REQUIRED: path (wiki/...).',
            '- "write_wiki" / "edit_wiki": modify wiki pages.'
          ].join('\n')
        },
        area: { type: 'string', enum: AREAS, description: 'list only: which area to list.' },
        dir: { type: 'string', description: 'list only: sub-directory inside the area, relative.' },
        query: { type: 'string', description: 'list only: filename substring filter.' },
        path: { type: 'string', description: 'Relative path starting with kb_source/ or wiki/. Never absolute, never containing "..".' },
        offset: { type: 'number', description: 'read_source only: character offset to start from.' },
        limit: { type: 'number', description: 'read_source only: maximum characters to return.' }
      },
      required: ['operation']
    }
  }

  async execute(toolCallId, params = {}) {
    try {
      switch (params.operation) {
        case 'list': return this._list(params)
        case 'read_source': return await this._readSource(params)
        case 'read_wiki': return this._readWiki(params)
        case 'write_wiki':
        case 'edit_wiki':
          return this._err(`Operation "${params.operation}" is not implemented yet`)
        default:
          return this._err(`Unknown operation: ${params.operation}`)
      }
    } catch (error) {
      return this._err(this._clean(error?.message || String(error)))
    }
  }

  /** Strip the absolute root path (either separator style) from messages shown to the model. */
  _clean(message) {
    if (!this._rootSpellings) {
      const spellings = new Set()
      for (const base of [this.root, this._canonicalRoot()]) {
        if (typeof base !== 'string' || !base) continue
        spellings.add(base)
        spellings.add(base.split('\\').join('/'))
        spellings.add(base.split('/').join('\\'))
      }
      this._rootSpellings = [...spellings].sort((x, y) => y.length - x.length)
    }
    let out = String(message)
    // Windows paths are case-insensitive, so match every spelling regardless of case there.
    const flags = process.platform === 'win32' ? 'gi' : 'g'
    for (const spelling of this._rootSpellings) {
      out = out.replace(new RegExp(spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags), '<root>')
    }
    return out
  }

  _canonicalRoot() {
    try {
      return fs.realpathSync.native(this.root)
    } catch {
      return null
    }
  }

  _list({ area, dir, query }) {
    if (!AREAS.includes(area)) return this._err('area must be "kb_source" or "wiki"')
    const target = resolveWikiToolPath(this.root, dir ? `${area}/${dir}` : area)
    if (!target.ok) return this._err(target.error)
    if (target.area !== area) return this._err('dir does not belong to the requested area')
    if (!target.exists || !fs.statSync(target.abs).isDirectory()) return this._err('Directory not found')

    const needle = typeof query === 'string' ? query.trim().toLowerCase() : ''
    const entries = []
    const walk = (absDir, relDir) => {
      for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
        const rel = `${relDir}/${ent.name}`
        if (ent.isDirectory()) {
          walk(path.join(absDir, ent.name), rel)
        } else if (ent.isFile()) {
          // Symlinks are neither files nor directories for Dirent, so they are skipped.
          if (area === 'kb_source' && !INGESTIBLE_EXTS.has(path.extname(ent.name).slice(1).toLowerCase())) continue
          if (needle && !ent.name.toLowerCase().includes(needle)) continue
          entries.push({ rel, size: fs.statSync(path.join(absDir, ent.name)).size })
        }
      }
    }
    walk(target.abs, target.rel)
    entries.sort((a, b) => a.rel.localeCompare(b.rel))

    const shown = entries.slice(0, MAX_LIST)
    const lines = shown.map(e => `${e.rel} (${humanSize(e.size)})`)
    let text = lines.length ? lines.join('\n') : '(no files)'
    if (entries.length > MAX_LIST) text += `\n... truncated: showing ${MAX_LIST} of ${entries.length} files. Narrow the listing with "dir" or "query".`
    return this._ok(text, { total: entries.length, files: shown.map(e => e.rel) })
  }

  async _readSource({ path: relPath, offset, limit }) {
    const target = resolveWikiToolPath(this.root, relPath)
    if (!target.ok) return this._err(target.error)
    if (target.area !== 'kb_source') return this._err('read_source requires a path starting with kb_source/')
    if (!target.exists || !fs.statSync(target.abs).isFile()) return this._err(`File not found: ${target.rel}`)

    const nums = {}
    for (const [name, value] of [['offset', offset], ['limit', limit]]) {
      if (value === undefined || value === null) continue
      const n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN
      if (!Number.isFinite(n)) return this._err(`${name} must be a number`)
      nums[name] = n
    }

    const loaded = await loadSourceText(target.abs)
    if (!loaded.ok) {
      const base = SOURCE_FAILURES[loaded.reason] || loaded.reason
      return this._err(this._clean(loaded.detail ? `${base}: ${loaded.detail}` : base), { reason: loaded.reason })
    }
    const { chunk, totalChars, nextOffset } = readSourceChunk(loaded.text, nums.offset, nums.limit)
    let text = chunk
    text += nextOffset === null
      ? `\n\n[End of document. totalChars=${totalChars}]`
      : `\n\n[totalChars=${totalChars}. More content follows; continue with offset=${nextOffset}]`
    return this._ok(text, { totalChars, nextOffset })
  }

  _readWiki({ path: relPath }) {
    const target = resolveWikiToolPath(this.root, relPath)
    if (!target.ok) return this._err(target.error)
    if (target.area !== 'wiki') return this._err('read_wiki requires a path starting with wiki/')
    if (!target.exists || !fs.statSync(target.abs).isFile()) return this._err(`Page not found: ${target.rel}`)

    if (fs.statSync(target.abs).size > MAX_WIKI_READ_BYTES) return this._err('Page is too large to read')
    const content = fs.readFileSync(target.abs, 'utf8')
    if (content.length > MAX_WIKI_READ_CHARS) {
      return this._err(`Page is too large to read (${content.length} chars, limit ${MAX_WIKI_READ_CHARS})`)
    }
    const pages = this.registry?.pages || {}
    // target.rel is the canonical on-disk spelling, so case/alias variants hit the same registry entry.
    const entry = pages[target.rel] || pages[target.rel.replace(/^wiki\//, '')]
    const edited = !!(entry && entry.hash && entry.hash !== sha256Text(content))
    return this._ok(edited ? `${USER_EDIT_NOTE}\n${content}` : content, { userEdited: edited })
  }
}

module.exports = { AiDocWikiTool, resolveWikiToolPath }
