const { BaseTool } = require('./BaseTool')
const { truncateOutput } = require('./truncate')
const fs = require('fs')
const path = require('path')
const os = require('os')

class FileTool extends BaseTool {
  constructor() {
    super(
      'file_operation',
      'Read, write, edit, list, append, search, or delete files on the local filesystem. Use "edit" for precise text replacement instead of overwriting the whole file.',
      'file_operation'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['read', 'write', 'edit', 'append', 'list', 'delete', 'exists', 'search', 'mkdir'],
          description: 'Operation to perform. Use "edit" (oldText+newText) for targeted changes instead of full "write".'
        },
        path:     { type: 'string', description: 'File or directory path' },
        content:  { type: 'string', description: 'Content to write/append (for write/append operations)' },
        oldText:  { type: 'string', description: 'Exact text to find and replace (for edit operation)' },
        newText:  { type: 'string', description: 'Replacement text (for edit operation)' },
        pattern:  { type: 'string', description: 'Glob or text pattern (for search operation)' },
        recursive: { type: 'boolean', description: 'Recursive listing/search (default false)' },
        offset:   { type: 'number', description: 'Line number to start reading from, 1-indexed (for read operation)' },
        limit:    { type: 'number', description: 'Maximum number of lines to read (for read operation)' }
      },
      required: ['operation', 'path']
    }
  }

  _resolve(filePath) {
    return path.resolve(filePath.startsWith('~') ? filePath.replace('~', os.homedir()) : filePath)
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { operation, path: filePath, content, oldText, newText, pattern, recursive, offset, limit } = params
    const safePath = this._resolve(filePath)

    try {
      switch (operation) {
        case 'read': {
          if (!fs.existsSync(safePath)) return this._err('File not found')
          const raw = fs.readFileSync(safePath, 'utf8')
          let data = raw

          // Apply offset/limit if requested
          if (offset != null || limit != null) {
            const lines = raw.split('\n')
            const start = offset != null ? Math.max(0, offset - 1) : 0
            const end   = limit  != null ? start + limit : lines.length
            data = lines.slice(start, end).join('\n')
          }

          const { text, truncated, totalLines, totalBytes } = truncateOutput(data)
          return this._ok(text, { truncated, totalLines, totalBytes, path: safePath })
        }

        case 'write':
          fs.mkdirSync(path.dirname(safePath), { recursive: true })
          fs.writeFileSync(safePath, content || '', 'utf8')
          return this._ok(`Written: ${safePath}`, { path: safePath })

        case 'edit': {
          if (oldText == null || newText == null) {
            return this._err('edit operation requires oldText and newText')
          }
          if (!fs.existsSync(safePath)) return this._err('File not found')

          const original = fs.readFileSync(safePath, 'utf8')
          if (!original.includes(oldText)) {
            // Try normalising line endings before failing
            const normalised = original.replace(/\r\n/g, '\n')
            const normOld    = oldText.replace(/\r\n/g, '\n')
            if (!normalised.includes(normOld)) {
              return this._err('oldText not found in file. Check for exact whitespace/indentation match.')
            }
            const updated = normalised.replace(normOld, newText.replace(/\r\n/g, '\n'))
            fs.writeFileSync(safePath, updated, 'utf8')
            return this._ok(`Edited: ${safePath}`, { path: safePath, replaced: true })
          }

          const updated = original.replace(oldText, newText)
          fs.writeFileSync(safePath, updated, 'utf8')
          return this._ok(`Edited: ${safePath}`, { path: safePath, replaced: true })
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
}

module.exports = { FileTool }
