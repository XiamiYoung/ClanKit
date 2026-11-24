'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { BaseTool } = require('./BaseTool')
const { INGESTIBLE_EXTS, loadSourceText, readSourceChunk } = require('../../lib/aidocSourceText')
const { parseFrontmatter, validateWikiFrontmatter, sha256Text } = require('../../lib/aidocFrontmatter')
const { isWikiLanguage, wikiLanguageRoot } = require('../../lib/aidocLanguages')

const AREAS = ['kb_source', 'wiki']
const MAX_LIST = 300
const MAX_WIKI_READ_CHARS = 200000
// Byte cap checked before reading; generous (4 bytes per char) so only the char count decides near the limit.
const MAX_WIKI_READ_BYTES = MAX_WIKI_READ_CHARS * 4
const MAX_WIKI_WRITE_CHARS = 200000
const MAX_SEGMENT_CHARS = 120
// Temp files created by atomic writes: .<name>.<pid>.<random>.tmp
const TEMP_FILE = /^\..+\.\d+\.[a-z0-9]+\.tmp$/
// File names (relative to the language root) the model may read but never write.
const READONLY_FILES = {
  'schema.md': 'SCHEMA.md is owned by the user and is read-only. Use read_wiki to consult it.',
  'log.md': 'log.md is maintained by the application and is read-only.'
}
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
  // lang: the wiki language this tool instance maintains. Wiki access is rooted at wiki/<lang>/.
  constructor({ root, registry, sourceText, lang } = {}) {
    if (!isWikiLanguage(lang)) throw new Error(`Unsupported wiki language: ${lang}`)
    const wikiRoot = wikiLanguageRoot(lang)
    super(
      'aidoc_wiki',
      `Read source documents (kb_source/) and read or maintain wiki pages (${wikiRoot}/) of the AI Doc knowledge base. Access is confined to kb_source/ and ${wikiRoot}/.`,
      'aidoc_wiki'
    )
    this.lang = lang
    this.wikiRoot = wikiRoot
    this.root = root
    this.registry = registry || { version: 1, sources: {}, pages: {} }
    this.sourceText = sourceText
    this._touched = new Set()
    this._pages = new Map()
    // Hash of the last content this tool wrote per page, so its own writes never count as user edits.
    this._lastHash = new Map()
    // Canonical rel -> original char length, for pages detected as user-edited; protected for the whole run.
    this._userEdited = new Map()
    // Subset of _userEdited whose protection comes from a real edit (registered hash mismatch or persisted flag).
    // Pages protected only because they are unregistered must never be persisted as hand-edited.
    this._editedByUser = new Set()
  }

  /** Pages written or edited during this run (index.md, log.md and SCHEMA.md excluded). */
  getWrittenPages() {
    return [...this._pages.values()].map(p => ({ ...p, sources: [...p.sources] }))
  }

  getWrittenPageState(rel) {
    return {
      hash: this._lastHash.get(rel),
      // True only for detected user edits; persist this flag.
      handEdited: this._editedByUser.has(rel),
      // Protected during the run because no registry entry exists; do not persist as hand-edited.
      unregistered: this._userEdited.has(rel) && !this._editedByUser.has(rel)
    }
  }

  /** Every file written or edited during this run, including index.md. */
  getTouchedFiles() {
    return [...this._touched]
  }

  schema() {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['list', 'read_source', 'read_wiki', 'write_wiki', 'edit_wiki'],
          description: [
            '- "list": list files in an area. REQUIRED: area. OPTIONAL: dir (sub-directory), query (case-insensitive filename substring). Area "wiki" lists ' + this.wikiRoot + '/ and dir is relative to it.',
            '- "read_source": read a source document, paginated. REQUIRED: path (kb_source/...). OPTIONAL: offset, limit.',
            '- "read_wiki": read a whole wiki page. REQUIRED: path (' + this.wikiRoot + '/...).',
            '- "write_wiki" / "edit_wiki": modify wiki pages under ' + this.wikiRoot + '/.'
          ].join('\n')
        },
        area: { type: 'string', enum: AREAS, description: 'list only: which area to list.' },
        dir: { type: 'string', description: 'list only: sub-directory inside the area, relative.' },
        query: { type: 'string', description: 'list only: filename substring filter.' },
        path: { type: 'string', description: 'Relative path starting with kb_source/ or ' + this.wikiRoot + '/. Never absolute, never containing "..".' },
        offset: { type: 'number', description: 'read_source only: character offset to start from.' },
        limit: { type: 'number', description: 'read_source only: maximum characters to return.' },
        content: { type: 'string', description: 'write_wiki only: the full page content, including frontmatter (type, title, sources, updated).' },
        oldText: { type: 'string', description: 'edit_wiki only: exact text to replace.' },
        newText: { type: 'string', description: 'edit_wiki only: replacement text.' },
        occurrences: { type: 'number', description: 'edit_wiki only: how many matches oldText must have (default 1).' }
      },
      required: ['operation']
    }
  }

  async execute(toolCallId, params = {}) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return this._err('params must be an object')
    try {
      switch (params.operation) {
        case 'list': return this._list(params)
        case 'read_source': return await this._readSource(params)
        case 'read_wiki': return this._readWiki(params)
        case 'write_wiki': return this._writeWiki(params)
        case 'edit_wiki': return this._editWiki(params)
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

  /** Wiki paths must stay inside this tool's language folder. Returns an error message, or null when allowed. */
  _confineError(target) {
    if (target.area !== 'wiki' || target.rel === this.wikiRoot || target.rel.startsWith(this.wikiRoot + '/')) return null
    return `Wiki paths must be inside ${this.wikiRoot}/`
  }

  _list({ area, dir, query }) {
    if (!AREAS.includes(area)) return this._err('area must be "kb_source" or "wiki"')
    const base = area === 'wiki' ? this.wikiRoot : area
    const target = resolveWikiToolPath(this.root, dir ? `${base}/${dir}` : base)
    if (!target.ok) return this._err(target.error)
    if (target.area !== area) return this._err('dir does not belong to the requested area')
    const outside = this._confineError(target)
    if (outside) return this._err(outside)
    if (!target.exists || !fs.statSync(target.abs).isDirectory()) return this._err('Directory not found')

    const needle = typeof query === 'string' ? query.trim().toLowerCase() : ''
    const entries = []
    const walk = (absDir, relDir) => {
      for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
        const rel = `${relDir}/${ent.name}`
        if (ent.isDirectory()) {
          walk(path.join(absDir, ent.name), rel)
        } else if (ent.isFile()) {
          if (TEMP_FILE.test(ent.name)) continue

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
    const cached = this.sourceText?.rel === target.rel ? this.sourceText.loaded : null
    if (!cached && (!target.exists || !fs.statSync(target.abs).isFile())) return this._err(`File not found: ${target.rel}`)

    const nums = {}
    for (const [name, value] of [['offset', offset], ['limit', limit]]) {
      if (value === undefined || value === null) continue
      const n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN
      if (!Number.isFinite(n)) return this._err(`${name} must be a number`)
      nums[name] = n
    }

    const loaded = cached || await loadSourceText(target.abs)
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

  /** Resolve and vet a write target. Returns {ok:false,error} or {ok:true, target, isIndex}. */
  _writeTarget(relPath) {
    const target = resolveWikiToolPath(this.root, relPath)
    if (!target.ok) return target
    if (target.area !== 'wiki') return { ok: false, error: `Only paths starting with ${this.wikiRoot}/ can be written` }
    const outside = this._confineError(target)
    if (outside) return { ok: false, error: outside }
    const lower = target.rel.toLowerCase()
    const inLanguageRoot = target.rel.slice(this.wikiRoot.length + 1).toLowerCase()
    if (Object.hasOwn(READONLY_FILES, inLanguageRoot)) return { ok: false, error: READONLY_FILES[inLanguageRoot] }
    const segments = target.rel.split('/').slice(1)
    if (inLanguageRoot === '') return { ok: false, error: `path must point to a .md file inside ${this.wikiRoot}/` }
    for (const seg of segments) {
      if (seg.length > MAX_SEGMENT_CHARS) return { ok: false, error: `Invalid path: a name segment is longer than ${MAX_SEGMENT_CHARS} characters` }
      if (/[\x00-\x1f\x7f]/.test(seg)) return { ok: false, error: 'Invalid path: control characters are not allowed' }
    }
    if (path.extname(target.rel).toLowerCase() !== '.md') return { ok: false, error: 'Only .md files can be written; the path must end with .md' }
    if (target.exists && !fs.statSync(target.abs).isFile()) return { ok: false, error: `Not a file: ${target.rel}` }
    return { ok: true, target, isIndex: lower === `${this.wikiRoot.toLowerCase()}/index.md` }
  }

  /** True when an existing page differs from what the app (or this tool) last wrote, or is not registered at all. */
  _isHandEdited(rel, current) {
    // Once detected, a page stays protected for the whole run, whatever the tool writes later.
    if (this._userEdited.has(rel)) return true
    const pages = this.registry?.pages || {}
    const entry = pages[rel] || pages[rel.replace(/^wiki\//, '')]
    const expected = this._lastHash.get(rel) || (entry && entry.hash)
    if (!entry?.handEdited && expected && expected === sha256Text(current)) return false
    this._userEdited.set(rel, current.length)
    if (entry?.handEdited || (expected && expected !== sha256Text(current))) this._editedByUser.add(rel)
    return true
  }

  _readExisting(target) {
    if (fs.statSync(target.abs).size > MAX_WIKI_READ_BYTES) return null
    return fs.readFileSync(target.abs, 'utf8')
  }

  /** Validate, persist atomically and record the result. Returns an error result, or null on success. */
  _commit(target, isIndex, content, hint = '') {
    let meta = null
    if (!isIndex) {
      const parsed = parseFrontmatter(content)
      if (!parsed.hasFrontmatter) {
        return this._err(`The page must start with a frontmatter block ("---" ... "---") containing type, title, sources and updated. Nothing was written.${hint}`)
      }
      const valid = validateWikiFrontmatter(parsed.data)
      if (!valid.ok) return this._err(`${valid.error} Nothing was written.${hint}`)
      const d = parsed.data
      meta = { rel: target.rel, type: d.type, title: d.title, sources: d.sources, updated: d.updated }
    }
    fs.mkdirSync(path.dirname(target.abs), { recursive: true })
    const tmp = path.join(path.dirname(target.abs), `.${path.basename(target.abs)}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`)
    try {
      fs.writeFileSync(tmp, content, 'utf8')
      fs.renameSync(tmp, target.abs)
    } catch (error) {
      try { fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
      throw error
    }
    this._touched.add(target.rel)
    this._lastHash.set(target.rel, sha256Text(content))
    if (meta) this._pages.set(target.rel, meta)
    return null
  }

  _writeWiki({ path: relPath, content }) {
    const vet = this._writeTarget(relPath)
    if (!vet.ok) return this._err(vet.error)
    const { target, isIndex } = vet
    if (typeof content !== 'string') return this._err('content must be a string')
    if (content.length > MAX_WIKI_WRITE_CHARS) {
      return this._err(`content is too large (${content.length} chars, limit ${MAX_WIKI_WRITE_CHARS}). Split it into several pages.`)
    }
    if (target.exists && !isIndex) {
      const current = this._readExisting(target)
      if (current === null || this._isHandEdited(target.rel, current)) {
        return this._err(`${target.rel} contains edits made by the user (or was not created by the application) and cannot be overwritten. Call read_wiki first, then use edit_wiki to make minimal changes that preserve the user's content.`)
      }
    }
    const err = this._commit(target, isIndex, content.replace(/^﻿/, ''))
    if (err) return err
    return this._ok(`Wrote ${target.rel}`, { path: target.rel })
  }

  _editWiki({ path: relPath, oldText, newText, occurrences }) {
    const vet = this._writeTarget(relPath)
    if (!vet.ok) return this._err(vet.error)
    const { target, isIndex } = vet
    if (typeof oldText !== 'string' || oldText === '') return this._err('oldText is required and must be a non-empty string')
    if (typeof newText !== 'string') return this._err('newText is required and must be a string')
    if (oldText === newText) return this._err('oldText and newText are identical, so this edit would change nothing. Provide different newText.')
    let expected = 1
    if (occurrences !== undefined && occurrences !== null) {
      expected = Number(occurrences)
      if (!Number.isInteger(expected) || expected < 1) return this._err('occurrences must be a positive integer')
    }
    if (!target.exists) return this._err(`Page not found: ${target.rel}. Use write_wiki to create it.`)
    const current = this._readExisting(target)
    if (current === null) return this._err('Page is too large to edit')
    if (current.includes('�')) {
      return this._err('This page is not valid UTF-8 (it contains replacement characters), so editing it could corrupt its text. Ask the user to re-save the page as UTF-8.')
    }

    // Match the file's own line-ending style so multi-line edits do not mix EOLs.
    const crlf = current.includes('\r\n')
    const eol = text => (crlf ? text.replace(/\r?\n/g, '\r\n') : text)
    const needle = eol(oldText)
    const found = current.split(needle).length - 1
    if (found === 0) return this._err('oldText was not found in the page. Call read_wiki and copy the exact text to replace.')
    if (found !== expected) {
      return this._err(`oldText matches ${found} places but ${expected} expected. Include more surrounding text to make it unique, or pass occurrences=${found} to replace all of them.`)
    }
    const next = current.split(needle).join(eol(newText))
    if (next.length > MAX_WIKI_WRITE_CHARS) {
      return this._err(`The edited page would be too large (${next.length} chars, limit ${MAX_WIKI_WRITE_CHARS}). Nothing was written.`)
    }
    const handEdited = !isIndex && this._isHandEdited(target.rel, current)
    // Cumulative guard: measured against the length the page had when the user's edits were first detected.
    if (handEdited && next.length < this._userEdited.get(target.rel) * 0.5) {
      return this._err("This edit would remove more than half of the original content of a page that contains edits made by the user. Keep the user's content and make a smaller change.")
    }
    let hint = ''
    if (!isIndex) {
      const before = parseFrontmatter(current)
      if (!before.hasFrontmatter || !validateWikiFrontmatter(before.data).ok) {
        hint = ' This existing page has no valid frontmatter: the edit must add a complete frontmatter block (type, title, sources, updated) in the same edit, or the user must fix the page.'
      }
    }
    const err = this._commit(target, isIndex, next, hint)
    if (err) return err
    const note = handEdited ? `\n\n${USER_EDIT_NOTE}` : ''
    return this._ok(`Edited ${target.rel}${note}`, { path: target.rel, userEdited: handEdited })
  }

  _readWiki({ path: relPath }) {
    const target = resolveWikiToolPath(this.root, relPath)
    if (!target.ok) return this._err(target.error)
    if (target.area !== 'wiki') return this._err(`read_wiki requires a path starting with ${this.wikiRoot}/`)
    const outside = this._confineError(target)
    if (outside) return this._err(outside)
    if (!target.exists || !fs.statSync(target.abs).isFile()) return this._err(`Page not found: ${target.rel}`)

    if (fs.statSync(target.abs).size > MAX_WIKI_READ_BYTES) return this._err('Page is too large to read')
    const content = fs.readFileSync(target.abs, 'utf8')
    if (content.length > MAX_WIKI_READ_CHARS) {
      return this._err(`Page is too large to read (${content.length} chars, limit ${MAX_WIKI_READ_CHARS})`)
    }
    const pages = this.registry?.pages || {}
    // target.rel is the canonical on-disk spelling, so case/alias variants hit the same registry entry.
    const entry = pages[target.rel] || pages[target.rel.replace(/^wiki\//, '')]
    const expected = this._lastHash.get(target.rel) || entry?.hash
    const edited = this._userEdited.has(target.rel) || !!(entry?.handEdited || (expected && expected !== sha256Text(content)))
    return this._ok(edited ? `${USER_EDIT_NOTE}\n${content}` : content, { userEdited: edited })
  }
}

module.exports = { AiDocWikiTool, resolveWikiToolPath }
