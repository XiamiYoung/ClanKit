const { BaseTool } = require('./BaseTool')
const { truncateOutput } = require('./truncate')
const { execFile } = require('child_process')

class WebTool extends BaseTool {
  constructor() {
    super(
      'web_search',
      'Search the web or fetch a URL. Uses curl for fetching and returns text content.',
      'web_search'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'fetch'], description: 'search = web search, fetch = get URL content' },
        query:  { type: 'string', description: 'Search query or URL to fetch' }
      },
      required: ['action', 'query']
    }
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { action, query } = params

    if (action === 'fetch') {
      return this._fetch(query)
    }

    return this._ok(
      `Web search is not yet configured. Query: "${query}". Consider using the fetch action with a specific URL instead.`
    )
  }

  _fetch(url) {
    return new Promise((resolve) => {
      execFile('curl', ['-sL', '--max-time', '15', '-A', 'Mozilla/5.0', url], {
        timeout: 20000,
        maxBuffer: 2 * 1024 * 1024
      }, (err, stdout, stderr) => {
        if (err) {
          resolve(this._err(err.message))
          return
        }

        const text = (stdout || '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        const { text: truncated, truncated: wasTruncated, totalBytes } = truncateOutput(text)
        resolve(this._ok(truncated, { url, truncated: wasTruncated, totalBytes }))
      })
    })
  }
}

module.exports = { WebTool }
