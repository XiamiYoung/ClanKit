/**
 * Mock Anthropic server for the chunk recorder.
 *
 * Serves a pre-baked SSE response for each POST /v1/messages call.
 * Responses are consumed sequentially from an array — each AgentLoop
 * iteration pops the next response, so multi-turn tool-use scenarios
 * can be expressed by giving N responses in order.
 *
 * count_tokens returns 404 on purpose — AnthropicClient falls back to
 * a deterministic char-based estimate, which is exactly what we want
 * for reproducible golden files.
 */
const http = require('http')

function createMockAnthropic({ responses }) {
  let responseIdx = 0
  const server = http.createServer((req, res) => {
    const url = req.url || ''

    // POST /v1/messages (or /v1/messages?... or beta path) → stream an SSE response
    // Handle both Anthropic (/v1/messages) and OpenAI (/v1/chat/completions) endpoints
    const isMessages = url.startsWith('/v1/messages') && !url.includes('count_tokens')
    const isCompletions = url.includes('/chat/completions')
    if (req.method === 'POST' && (isMessages || isCompletions)) {
      // Drain request body (we do not parse it)
      req.on('data', () => {})
      req.on('end', () => {
        const events = responses[responseIdx]
        if (!events) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({
            error: {
              type: 'mock_error',
              message: `No mock response for iteration ${responseIdx}`,
            },
          }))
          return
        }
        responseIdx++

        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
        })

        for (const ev of events) {
          // Support both Anthropic style (event: + data:) and OpenAI style (data: only)
          if (ev.event) {
            res.write(`event: ${ev.event}\n`)
          }
          const dataStr = typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data)
          res.write(`data: ${dataStr}\n\n`)
        }
        res.end()
      })
      return
    }

    // count_tokens → 404 so the client falls back to local estimate
    if (req.method === 'POST' && url.includes('count_tokens')) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { type: 'not_found', message: 'not_implemented' } }))
      return
    }

    res.writeHead(404)
    res.end()
  })

  return {
    server,
    listen(port) {
      return new Promise((resolve, reject) => {
        const onError = (err) => { server.off('error', onError); reject(err) }
        server.once('error', onError)
        server.listen(port, '127.0.0.1', () => {
          server.off('error', onError)
          resolve(server.address().port)
        })
      })
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()))
    },
    consumed() {
      return responseIdx
    },
  }
}

module.exports = { createMockAnthropic }
