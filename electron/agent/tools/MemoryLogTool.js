/**
 * MemoryLogTool — lets the agent read its own session log files.
 *
 * Log files live at:
 *   ~/.clankai/memory/agents/{agentId}/memory/YYYY-MM-DD.md
 *
 * Two actions:
 *   list  — return all dates that have a log, with session headers (very cheap)
 *   read  — return full content of a specific date's log
 *
 * "headers_only" (default true for list, false for read) returns only the
 * "## Session …" lines — one line per session, ~15-25 tokens each.
 */
const fs   = require('fs')
const path = require('path')
const { BaseTool } = require('./BaseTool')
const { logger }   = require('../../logger')

class MemoryLogTool extends BaseTool {
  constructor(memoryDir, agentId) {
    super(
      'read_memory_log',
      'Read your own session log files to recall past conversations. ' +
      'Use action="list" first to see which dates have records (returns session headers only — very cheap). ' +
      'Then use action="read" with a specific date to get full details. ' +
      'Supports date ranges with "from"/"to" for broad queries like "last month". ' +
      'Log files cover this agent\'s conversations across ALL chats on that date.',
      'read_memory_log'
    )
    this.memoryDir = memoryDir
    this.agentId   = agentId
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read'],
          description:
            '"list": show available log dates with session headers. ' +
            '"read": return full content of a specific date.',
        },
        date: {
          type: 'string',
          description: 'ISO date string YYYY-MM-DD. Required for action="read".',
        },
        from: {
          type: 'string',
          description: 'Start date YYYY-MM-DD for range filter in list action.',
        },
        to: {
          type: 'string',
          description: 'End date YYYY-MM-DD for range filter in list action.',
        },
        headers_only: {
          type: 'boolean',
          description:
            'For action="read": if true, return only "## Session" header lines ' +
            'instead of full content. Defaults to false.',
        },
      },
      required: ['action'],
    }
  }

  _logsDir() {
    return path.join(this.memoryDir, 'agents', this.agentId, 'memory')
  }

  /** Extract only "## Session …" lines from log content. */
  _extractHeaders(content) {
    return content
      .split('\n')
      .filter(l => l.startsWith('## Session'))
      .join('\n')
  }

  async execute(toolCallId, params) {
    const { action, date, from, to, headers_only = false } = params

    if (!this.agentId) {
      return this._err('No agentId available — cannot locate log files.')
    }

    const logsDir = this._logsDir()

    if (!fs.existsSync(logsDir)) {
      return this._ok('No session logs found yet.', { count: 0 })
    }

    // ── list ──────────────────────────────────────────────────────────────
    if (action === 'list') {
      const files = fs.readdirSync(logsDir)
        .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .sort()

      // Apply optional date range filter
      const filtered = files.filter(f => {
        const d = f.replace('.md', '')
        if (from && d < from) return false
        if (to   && d > to)   return false
        return true
      })

      if (filtered.length === 0) {
        const rangeHint = from || to
          ? ` in range ${from || '?'} → ${to || '?'}`
          : ''
        return this._ok(`No session logs found${rangeHint}.`, { count: 0 })
      }

      const parts = []
      for (const file of filtered) {
        const dateStr = file.replace('.md', '')
        try {
          const content = fs.readFileSync(path.join(logsDir, file), 'utf8')
          const headers = this._extractHeaders(content)
          if (headers) {
            parts.push(`### ${dateStr}\n${headers}`)
          } else {
            parts.push(`### ${dateStr}\n(no sessions recorded)`)
          }
        } catch {
          parts.push(`### ${dateStr}\n(unreadable)`)
        }
      }

      const result = parts.join('\n\n')
      logger.agent('[MemoryLogTool] list', { agentId: this.agentId, count: filtered.length })
      return this._ok(result, { count: filtered.length })
    }

    // ── read ──────────────────────────────────────────────────────────────
    if (action === 'read') {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return this._err('action="read" requires a valid "date" field in YYYY-MM-DD format.')
      }

      const filePath = path.join(logsDir, `${date}.md`)
      if (!fs.existsSync(filePath)) {
        return this._ok(`No session log for ${date}.`, { date, exists: false })
      }

      const content = fs.readFileSync(filePath, 'utf8')
      const result  = headers_only ? this._extractHeaders(content) : content

      logger.agent('[MemoryLogTool] read', { agentId: this.agentId, date, headers_only })
      return this._ok(result || '(empty log)', { date, exists: true })
    }

    return this._err(`Unknown action: "${action}". Use "list" or "read".`)
  }
}

module.exports = { MemoryLogTool }
