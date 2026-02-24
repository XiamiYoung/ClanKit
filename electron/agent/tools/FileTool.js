const { BaseTool } = require('./BaseTool')
const fs = require('fs')
const path = require('path')
const os = require('os')

class FileTool extends BaseTool {
  constructor() {
    super(
      'file_operation',
      'Read, write, list, append, search, or delete files on the local filesystem.'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['read', 'write', 'append', 'list', 'delete', 'exists', 'search', 'mkdir'], description: 'Operation to perform' },
        path:      { type: 'string', description: 'File or directory path' },
        content:   { type: 'string', description: 'Content to write/append (for write/append operations)' },
        pattern:   { type: 'string', description: 'Glob or text pattern (for search operation)' },
        recursive: { type: 'boolean', description: 'Recursive listing/search (default false)' }
      },
      required: ['operation', 'path']
    }
  }

  _resolve(filePath) {
    return path.resolve(filePath.startsWith('~') ? filePath.replace('~', os.homedir()) : filePath)
  }

  async execute(input) {
    const { operation, path: filePath, content, pattern, recursive } = input
    const safePath = this._resolve(filePath)

    try {
      switch (operation) {
        case 'read': {
          if (!fs.existsSync(safePath)) return { error: 'File not found' }
          const data = fs.readFileSync(safePath, 'utf8')
          // Truncate large files
          if (data.length > 20000) {
            return { content: data.slice(0, 20000), truncated: true, totalLength: data.length }
          }
          return { content: data }
        }
        case 'write':
          fs.mkdirSync(path.dirname(safePath), { recursive: true })
          fs.writeFileSync(safePath, content || '', 'utf8')
          return { success: true, path: safePath }

        case 'append':
          fs.mkdirSync(path.dirname(safePath), { recursive: true })
          fs.appendFileSync(safePath, content || '', 'utf8')
          return { success: true, path: safePath }

        case 'list': {
          if (!fs.existsSync(safePath)) return { error: 'Directory not found' }
          const entries = fs.readdirSync(safePath, { withFileTypes: true })
          const result = entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'dir' : 'file',
            size: e.isFile() ? fs.statSync(path.join(safePath, e.name)).size : undefined
          }))
          return { entries: result.slice(0, 200) }
        }
        case 'delete':
          if (!fs.existsSync(safePath)) return { error: 'Path not found' }
          fs.rmSync(safePath, { recursive: true, force: true })
          return { success: true }

        case 'exists':
          return { exists: fs.existsSync(safePath) }

        case 'mkdir':
          fs.mkdirSync(safePath, { recursive: true })
          return { success: true, path: safePath }

        case 'search': {
          if (!fs.existsSync(safePath)) return { error: 'Directory not found' }
          const results = []
          this._search(safePath, pattern || '', recursive !== false, results, 0)
          return { matches: results.slice(0, 100) }
        }
        default:
          return { error: `Unknown operation: ${operation}` }
      }
    } catch (err) {
      return { error: err.message }
    }
  }

  _search(dir, pattern, recursive, results, depth) {
    if (depth > 5 || results.length >= 100) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
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
