const { BaseTool } = require('./BaseTool')
const { execFile } = require('child_process')

class WebTool extends BaseTool {
  constructor() {
    super(
      'web_search',
      'Search the web or fetch a URL. Uses curl for fetching and returns text content.'
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

  async execute(input) {
    const { action, query } = input

    if (action === 'fetch') {
      return this._fetch(query)
    }

    // For search, we use a simple approach via curl to a search API
    // In production you'd use a real search API
    return { result: `Web search is not yet configured. Query: "${query}". Consider using the fetch action with a specific URL instead.` }
  }

  _fetch(url) {
    return new Promise((resolve) => {
      execFile('curl', ['-sL', '--max-time', '15', '-A', 'Mozilla/5.0', url], {
        timeout: 20000,
        maxBuffer: 512 * 1024
      }, (err, stdout, stderr) => {
        if (err) {
          resolve({ error: err.message })
        } else {
          // Strip HTML tags for a rough text extraction
          const text = (stdout || '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          resolve({ content: text.slice(0, 10000), truncated: text.length > 10000 })
        }
      })
    })
  }
}

module.exports = { WebTool }
