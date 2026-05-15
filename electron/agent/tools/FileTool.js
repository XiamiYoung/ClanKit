const { BaseTool } = require('./BaseTool')
const { MAX_FILE_READ_BYTES } = require('./truncate')
const fs = require('fs')
const path = require('path')
const os = require('os')
const picomatch = require('picomatch')

function _mb(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

class FileTool extends BaseTool {
  constructor() {
    super(
      'file_operation',
      'Read, write, edit, list, append, search, glob, grep, or delete files and directories on the local filesystem. Call this tool — do NOT describe what you would do, do NOT recite filenames from memory or earlier conversation. When the user asks about ANY file or directory (including paths outside your working folder), invoke this tool with an absolute path. The tool returns the real, current state of disk; trust it and report it.',
      'file_operation'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['read', 'write', 'edit', 'append', 'list', 'delete', 'exists', 'search', 'mkdir', 'glob', 'grep'],
          description: [
            'Which operation to run. Pick the most specific match for the user request:',
            '- "list": enumerate immediate children of a directory (files + subdirs). Use when user asks "what files are in X" or "what\'s in this folder". REQUIRED params: path (directory).',
            '- "read": read full text of a file. Use when user asks "what does X say" or "show me X" or before editing a file. REQUIRED: path (file). OPTIONAL: offset (1-indexed start line), limit (max lines). The entire file is returned by default — no middle-of-file truncation. Files larger than 1 MB are refused with an error that includes totalLines; in that case re-call with offset+limit (e.g. offset:1, limit:2000) to paginate. The response carries totalLines, startLine, numLines so you can tell whether you have the whole file or a slice; trust those numbers and do NOT re-read the same range suspecting truncation.',
            '- "write": create or overwrite a file. REQUIRED: path, content. Prefer "edit" over "write" when changing existing files — write loses any content you did not include in `content`.',
            '- "edit": replace EXACT text within a file. Use this for any modification of an existing file you can describe by a substring. REQUIRED: path, oldText (the literal text to find), newText (the replacement). OPTIONAL: occurrences ("unique" default, "first", "all"). The tool errors if oldText is not found OR matches multiple times under "unique" — in that case, fetch more context with read and try again with a longer oldText.',
            '- "append": add to the end of a file (creates if missing). REQUIRED: path, content.',
            '- "delete": remove a file or directory recursively. REQUIRED: path.',
            '- "exists": probe whether a path exists (returns "true"/"false"). REQUIRED: path.',
            '- "mkdir": create a directory (recursive, no error if exists). REQUIRED: path.',
            '- "search": substring search over filenames under a directory. REQUIRED: path (dir), pattern (substring matched against names). OPTIONAL: recursive (default true).',
            '- "glob": glob-pattern match over file paths under a directory (e.g. "**/*.md"). REQUIRED: path (dir), pattern (picomatch glob).',
            '- "grep": regex search over file CONTENTS. REQUIRED: path (file or dir), pattern (regex). OPTIONAL: multiline (default false; enables . to match \\n and patterns to span lines). On a directory, walks files recursively (skips binaries by extension and node_modules/.git/dist/build/__pycache__).'
          ].join('\n')
        },
        path: {
          type: 'string',
          description: 'Absolute path. Forward slashes or backslashes both fine on Windows. ~ is expanded to the user home directory. Even if the path is outside the chat\'s working folder, pass it through — the tool serves arbitrary paths.'
        },
        content:  { type: 'string', description: 'Full file content (for write) or text to append (for append).' },
        oldText:  { type: 'string', description: 'Exact text to locate inside the file for edit. Match is verbatim including whitespace and newlines. If unsure of formatting, read the file first.' },
        newText:  { type: 'string', description: 'Replacement text for edit. Whatever you put here replaces the matched oldText 1:1.' },
        occurrences: {
          type: 'string',
          enum: ['unique', 'first', 'all'],
          description: 'edit only. "unique" (default): require exactly one match — fail if 0 or 2+, forcing you to pick a more specific oldText. "first": replace only the first occurrence. "all": replace every occurrence (use for renames).'
        },
        pattern:  { type: 'string', description: 'For search: substring matched against entry names. For glob: a picomatch pattern like "**/*.md" or "src/**/index.js". For grep: a regex (anchors like ^/$ work; multiline mode requires the multiline flag).' },
        multiline: { type: 'boolean', description: 'grep only. true = compile regex with g+m+s so . matches newlines and patterns can span lines. Default false (per-line matching).' },
        recursive: { type: 'boolean', description: 'search only. Default true. Pass false to limit search to the immediate directory.' },
        offset:   { type: 'number', description: 'read only. 1-indexed line number to start reading from. Useful when a file is large and you only want a section.' },
        limit:    { type: 'number', description: 'read only. Maximum number of lines to return starting at offset. Combine with offset for paging.' }
      },
      required: ['operation', 'path']
    }
  }

  _resolve(filePath) {
    return path.resolve(filePath.startsWith('~') ? filePath.replace('~', os.homedir()) : filePath)
  }

  /** Override to expose convenience fields used by tests and callers */
  _ok(text, details = {}) {
    const result = super._ok(text, details)
    result.success = true
    result.text = String(text)
    return result
  }

  /** Override to expose convenience fields used by tests and callers */
  _err(message, details = {}) {
    const result = super._err(message, details)
    result.success = false
    result.error = message
    return result
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { operation, path: filePath, content, oldText, newText, pattern, recursive, offset, limit } = params
    const safePath = this._resolve(filePath)

    try {
      switch (operation) {
        case 'read': {
          if (!fs.existsSync(safePath)) return this._err('File not found')

          // Stat first so we can reject oversized whole-file reads without
          // loading the entire file into memory.
          const stat = fs.statSync(safePath)
          if (!stat.isFile()) return this._err('Not a regular file')
          const fileBytes = stat.size
          const isPaged = offset != null || limit != null

          // Whole-file read: refuse if the file exceeds the cap. Force the
          // model to paginate explicitly instead of silently slicing it.
          if (!isPaged && fileBytes > MAX_FILE_READ_BYTES) {
            // Cheap line count without holding the full text in a JS string
            // longer than necessary — but for the error message we need it
            // anyway. The file is by definition > 1 MB so this read is
            // intentional and bounded by the OS cache, not unbounded.
            const totalLines = fs.readFileSync(safePath, 'utf8').split('\n').length
            return this._err(
              `File too large to read in one shot (${_mb(fileBytes)}, ${totalLines} lines; max ${_mb(MAX_FILE_READ_BYTES)}). ` +
              `Use offset + limit to paginate, e.g. { operation: 'read', path: '${safePath.replace(/\\/g, '\\\\')}', offset: 1, limit: 2000 } reads lines 1-2000. ` +
              `Only read the ranges you actually need — do not blindly page through the whole file.`,
              { path: safePath, bytes: fileBytes, totalLines, maxBytes: MAX_FILE_READ_BYTES }
            )
          }

          const raw = fs.readFileSync(safePath, 'utf8')
          const lines = raw.split('\n')
          const totalLines = lines.length

          let data, startLine, numLines
          if (isPaged) {
            const start = offset != null ? Math.max(0, offset - 1) : 0
            const end   = limit  != null ? Math.min(start + limit, lines.length) : lines.length
            data = lines.slice(start, end).join('\n')
            startLine = start + 1
            numLines = Math.max(0, end - start)
          } else {
            data = raw
            startLine = 1
            numLines = totalLines
          }

          // A page that itself exceeds the byte cap (e.g. limit:999999 on a
          // huge file) is also refused, with a hint to reduce the limit.
          const returnedBytes = Buffer.byteLength(data, 'utf8')
          if (returnedBytes > MAX_FILE_READ_BYTES) {
            return this._err(
              `Requested slice is too large (${_mb(returnedBytes)}, ${numLines} lines; max ${_mb(MAX_FILE_READ_BYTES)}). ` +
              `Reduce limit. File has ${totalLines} lines total.`,
              { path: safePath, bytes: returnedBytes, totalLines, numLines, startLine, maxBytes: MAX_FILE_READ_BYTES }
            )
          }

          return this._ok(data, {
            path: safePath,
            bytes: returnedBytes,
            totalLines,
            startLine,
            numLines
          })
        }

        case 'write':
          fs.mkdirSync(path.dirname(safePath), { recursive: true })
          fs.writeFileSync(safePath, content || '', 'utf8')
          return this._ok(`Written: ${safePath}`, { path: safePath })

        case 'edit': {
          if (oldText == null || newText == null) {
            return this._err('edit operation requires oldText and newText')
          }
          // Empty oldText would make "".split('') = body.length-1 separators,
          // and split('').join(newText) inserts newText between every character —
          // a 1KB original × 600-byte replacement balloons to 600KB of garbage.
          // Reject explicitly: there is no legitimate "find empty string" intent;
          // callers that want to overwrite the file should use operation=write.
          if (oldText === '') {
            return this._err('edit operation requires a non-empty oldText. To overwrite the entire file, use operation=write instead.')
          }
          if (!fs.existsSync(safePath)) return this._err('File not found')
          const original = fs.readFileSync(safePath, 'utf8')

          // Try literal match first; fall back to LF-normalized comparison
          let body = original
          let needle = oldText
          let replacement = newText
          let matchCount = body.split(needle).length - 1
          if (matchCount === 0) {
            body = original.replace(/\r\n/g, '\n')
            needle = oldText.replace(/\r\n/g, '\n')
            replacement = newText.replace(/\r\n/g, '\n')
            matchCount = body.split(needle).length - 1
          }

          const occurrences = params.occurrences || 'unique'
          if (matchCount === 0) {
            return this._err('oldText not found in file. Check for exact whitespace/indentation.')
          }
          if (occurrences === 'unique' && matchCount > 1) {
            return this._err(`oldText matches ${matchCount} times; provide a longer unique substring or pass occurrences: "all".`)
          }

          let updated
          if (occurrences === 'all') {
            updated = body.split(needle).join(replacement)
          } else {
            updated = body.replace(needle, replacement)
          }
          // If we normalized to LF but the original had CRLF, restore CRLF
          if (body !== original && original.includes('\r\n')) {
            updated = updated.replace(/\r?\n/g, '\r\n')
          }
          fs.writeFileSync(safePath, updated, 'utf8')
          return this._ok(`Edited: ${safePath}`, {
            path: safePath,
            replaced: occurrences === 'all' ? matchCount : 1
          })
        }

        case 'append':
          fs.mkdirSync(path.dirname(safePath), { recursive: true })
          fs.appendFileSync(safePath, content || '', 'utf8')
          return this._ok(`Appended: ${safePath}`, { path: safePath })

        case 'list': {
          if (!fs.existsSync(safePath)) return this._err('Directory not found')
          const entries = fs.readdirSync(safePath, { withFileTypes: true })
          const result = entries.map(e => {
            const isDir = e.isDirectory()
            return `${isDir ? 'd' : 'f'} ${e.name}${isDir ? '/' : ''}`
          })
          const limited = result.slice(0, 500)
          const text = limited.join('\n') + (result.length > 500 ? `\n[${result.length - 500} more entries omitted]` : '')
          return this._ok(text, { count: entries.length, path: safePath })
        }

        case 'delete':
          if (!fs.existsSync(safePath)) return this._err('Path not found')
          fs.rmSync(safePath, { recursive: true, force: true })
          return this._ok(`Deleted: ${safePath}`, { path: safePath })

        case 'exists':
          return this._ok(fs.existsSync(safePath) ? 'true' : 'false', { exists: fs.existsSync(safePath) })

        case 'mkdir':
          fs.mkdirSync(safePath, { recursive: true })
          return this._ok(`Created: ${safePath}`, { path: safePath })

        case 'search': {
          if (!fs.existsSync(safePath)) return this._err('Directory not found')
          const matches = []
          this._search(safePath, pattern || '', recursive !== false, matches, 0)
          const lines = matches.slice(0, 200).map(m => `${m.type === 'dir' ? 'd' : 'f'} ${m.path}`)
          const text = lines.join('\n') + (matches.length > 200 ? `\n[${matches.length - 200} more matches omitted]` : '')
          return this._ok(text, { count: matches.length })
        }

        case 'glob': {
          if (!fs.existsSync(safePath)) return this._err('Directory not found')
          if (!pattern) return this._err('glob operation requires pattern')
          const matcher = picomatch(pattern, { dot: false })
          const matches = []
          this._globWalk(safePath, safePath, matcher, matches, 0)
          const limited = matches.slice(0, 200)
          const text = limited.join('\n') + (matches.length > 200 ? `\n[${matches.length - 200} more matches omitted]` : '')
          return this._ok(text, { count: matches.length })
        }

        case 'grep': {
          if (!pattern) return this._err('grep operation requires pattern')
          if (!fs.existsSync(safePath)) return this._err('Path not found')
          let regex
          try {
            const flags = params.multiline ? 'gms' : 'g'
            regex = new RegExp(pattern, flags)
          } catch (e) {
            return this._err(`Invalid regex: ${e.message}`)
          }
          const stat = fs.statSync(safePath)
          const hits = []
          if (stat.isFile()) {
            this._grepFile(safePath, safePath, regex, !!params.multiline, hits)
          } else {
            this._grepDir(safePath, safePath, regex, !!params.multiline, hits, 0)
          }
          if (hits.length === 0) return this._ok('(no matches)', { count: 0 })
          const limited = hits.slice(0, 200)
          const text = limited.join('\n') + (hits.length > 200 ? `\n[${hits.length - 200} more matches omitted]` : '')
          return this._ok(text, { count: hits.length })
        }

        default:
          return this._err(`Unknown operation: ${operation}`)
      }
    } catch (err) {
      return this._err(err.message)
    }
  }

  _search(dir, pattern, recursive, results, depth) {
    if (depth > 5 || results.length >= 200) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.name.includes(pattern)) {
        results.push({ path: full, type: entry.isDirectory() ? 'dir' : 'file' })
      }
      if (entry.isDirectory() && recursive) {
        this._search(full, pattern, recursive, results, depth + 1)
      }
    }
  }

  _globWalk(rootDir, currentDir, matcher, results, depth) {
    if (depth > 8 || results.length >= 250) return
    let entries
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (['node_modules', '__pycache__', 'dist', 'build'].includes(e.name)) continue
      const full = path.join(currentDir, e.name)
      const rel = path.relative(rootDir, full).split(path.sep).join('/')
      if (e.isDirectory()) {
        this._globWalk(rootDir, full, matcher, results, depth + 1)
      } else if (matcher(rel)) {
        results.push(full)
      }
    }
  }

  _grepFile(rootPath, fullPath, regex, multiline, hits) {
    let raw
    try { raw = fs.readFileSync(fullPath, 'utf8') } catch { return }
    const rel = rootPath === fullPath ? path.basename(fullPath) : path.relative(rootPath, fullPath).split(path.sep).join('/')
    if (multiline) {
      let m
      while ((m = regex.exec(raw)) !== null) {
        const upTo = raw.slice(0, m.index)
        const lineNo = upTo.split('\n').length
        const snippet = m[0].split('\n').slice(0, 3).join(' / ').slice(0, 120)
        hits.push(`${rel}:${lineNo}: ${snippet}`)
        if (hits.length >= 250) return
        if (m[0].length === 0) regex.lastIndex += 1
      }
    } else {
      const lines = raw.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const lineRe = new RegExp(regex.source, regex.flags.replace('g', ''))
        if (lineRe.test(lines[i])) {
          hits.push(`${rel}:${i + 1}: ${lines[i].slice(0, 200)}`)
          if (hits.length >= 250) return
        }
      }
    }
  }

  _grepDir(rootPath, currentDir, regex, multiline, hits, depth) {
    if (depth > 8 || hits.length >= 250) return
    let entries
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (['node_modules', '__pycache__', 'dist', 'build'].includes(e.name)) continue
      const full = path.join(currentDir, e.name)
      if (e.isDirectory()) {
        this._grepDir(rootPath, full, regex, multiline, hits, depth + 1)
      } else {
        if (/\.(png|jpg|jpeg|gif|webp|pdf|zip|exe|bin|so|dll|class)$/i.test(e.name)) continue
        this._grepFile(rootPath, full, regex, multiline, hits)
      }
    }
  }
}

module.exports = { FileTool }
