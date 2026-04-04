/**
 * SearchHistoryTool — lets the agent search past conversation history.
 *
 * Uses HistoryIndex (SQLite FTS5) for full-text search with optional
 * date range filtering. The LLM decides when to search and converts
 * natural language dates to structured YYYY-MM-DD parameters.
 *
 * Storage: {DATA_DIR}/memory/agents/{agentId}/history.db
 */
const path = require('path')
const { BaseTool } = require('./BaseTool')
const { logger }   = require('../../logger')

class SearchHistoryTool extends BaseTool {
  constructor(memoryDir, agentId) {
    super(
      'search_chat_history',
      'Search past conversation history by keyword and/or date range. ' +
      'Use this when the user asks about prior conversations, specific dates, or past topics. ' +
      'You can search by keyword only, date range only, or both combined. ' +
      'Dates must be in YYYY-MM-DD format. ' +
      'Returns original messages with timestamps and sender names.',
      'search_chat_history'
    )
    this.memoryDir = memoryDir
    this.agentId   = agentId
  }

  schema() {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keywords (optional if using date range). Use specific terms from the conversation.',
        },
        dateFrom: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format (inclusive). Optional.',
        },
        dateTo: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (inclusive). Optional.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of result groups to return. Default 5.',
        },
      },
    }
  }

  async execute(toolCallId, params) {
    const { query, dateFrom, dateTo, limit = 5 } = params

    if (!this.agentId) {
      return this._err('No agentId available — cannot search history.')
    }

    if (!query && !dateFrom && !dateTo) {
      return this._err('Provide at least a query or a date range (dateFrom/dateTo).')
    }

    try {
      const { HistoryIndex } = require('../../memory/HistoryIndex')
      const agentMemoryDir = path.join(this.memoryDir, 'agents')
      const idx = new HistoryIndex(agentMemoryDir)

      // Normalize date range: append time boundaries for SQL BETWEEN
      const opts = {}
      if (dateFrom) opts.dateFrom = `${dateFrom} 00:00:00`
      if (dateTo)   opts.dateTo   = `${dateTo} 23:59:59`

      const results = idx.search(
        query || '',
        this.agentId,
        limit,
        opts
      )

      if (results.length === 0) {
        const hint = dateFrom || dateTo
          ? ` in range ${dateFrom || '?'} to ${dateTo || '?'}`
          : ''
        return this._ok(`No conversation history found${hint}${query ? ` matching "${query}"` : ''}.`, { count: 0 })
      }

      // Return as structured JSON — LLMs are less likely to echo JSON verbatim
      const messages = []
      for (const r of results) {
        for (const line of r.text.split('\n')) {
          const m = line.match(/^\[(.+?)\]\s+(.+?):\s+(.+)$/)
          if (m) messages.push({ time: m[1], sender: m[2], content: m[3] })
          else if (line.trim()) messages.push({ content: line.trim() })
        }
      }
      const summary = `Found ${messages.length} messages${dateFrom ? ` from ${dateFrom} to ${dateTo}` : ''}${query ? ` matching "${query}"` : ''}.`
      const returnText = JSON.stringify({ summary, messages: messages.slice(0, 30) }, null, 0)
      logger.agent('[SearchHistoryTool] return', { agentId: this.agentId, query, dateFrom, dateTo, messageCount: messages.length, returnTextLen: returnText.length })
      logger.debug('[SearchHistoryTool] full return preview', returnText.slice(0, 500))
      return this._ok(returnText, { count: messages.length })
    } catch (err) {
      logger.error('[SearchHistoryTool] execute error', { agentId: this.agentId, error: err.message })
      return this._err(`Search failed: ${err.message}`)
    }
  }
}

module.exports = { SearchHistoryTool }
