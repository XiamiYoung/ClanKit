const { BaseTool } = require('./BaseTool')
const fs = require('fs')
const path = require('path')
const os = require('os')

class DataTool extends BaseTool {
  constructor() {
    super(
      'data_analysis',
      'Analyze CSV, JSON, or text data: read, parse, compute stats, filter rows, and extract insights.',
      'data_analysis'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['read_csv', 'read_json', 'stats', 'filter', 'head'], description: 'Analysis operation' },
        path:      { type: 'string', description: 'File path to the data' },
        column:    { type: 'string', description: 'Column name (for stats/filter)' },
        condition: { type: 'string', description: 'Filter condition (for filter operation)' },
        limit:     { type: 'number', description: 'Number of rows to return (default 10)' }
      },
      required: ['operation', 'path']
    }
  }

  _resolve(filePath) {
    return path.resolve(filePath.startsWith('~') ? filePath.replace('~', os.homedir()) : filePath)
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { operation, path: filePath, column, limit = 10 } = params
    const safePath = this._resolve(filePath)

    if (!fs.existsSync(safePath)) return this._err('File not found')

    try {
      const raw = fs.readFileSync(safePath, 'utf8')

      switch (operation) {
        case 'read_csv': {
          const lines   = raw.trim().split('\n')
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
          const rows    = lines.slice(1, 1 + limit).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
            const obj  = {}
            headers.forEach((h, i) => { obj[h] = vals[i] })
            return obj
          })
          const text = `Headers: ${headers.join(', ')}\nRows (${rows.length}/${lines.length - 1}):\n${JSON.stringify(rows, null, 2)}`
          return this._ok(text, { headers, totalRows: lines.length - 1 })
        }

        case 'read_json': {
          const data = JSON.parse(raw)
          const arr  = Array.isArray(data) ? data : [data]
          const text = JSON.stringify(arr.slice(0, limit), null, 2) + (arr.length > limit ? `\n[${arr.length - limit} more items omitted]` : '')
          return this._ok(text, { totalItems: arr.length })
        }

        case 'stats': {
          const lines   = raw.trim().split('\n')
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
          const colIdx  = column ? headers.indexOf(column) : -1
          if (colIdx === -1 && column) {
            return this._err(`Column "${column}" not found. Available: ${headers.join(', ')}`)
          }

          const values = lines.slice(1).map(l => {
            const v = l.split(',')[colIdx >= 0 ? colIdx : 0]?.trim().replace(/^"|"$/g, '')
            return parseFloat(v)
          }).filter(v => !isNaN(v))

          if (values.length === 0) return this._err('No numeric values found')

          values.sort((a, b) => a - b)
          const sum = values.reduce((a, b) => a + b, 0)
          const stats = {
            column:  column || headers[0],
            count:   values.length,
            min:     values[0],
            max:     values[values.length - 1],
            mean:    sum / values.length,
            median:  values[Math.floor(values.length / 2)],
            sum
          }
          return this._ok(JSON.stringify(stats, null, 2), stats)
        }

        case 'head': {
          const lines = raw.trim().split('\n')
          return this._ok(lines.slice(0, limit).join('\n'), { totalLines: lines.length })
        }

        default:
          return this._err(`Unknown operation: ${operation}`)
      }
    } catch (err) {
      return this._err(err.message)
    }
  }
}

module.exports = { DataTool }
