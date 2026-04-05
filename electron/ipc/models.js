/**
 * IPC handlers for LLM model fetching and persistent model cache.
 * Channels: openrouter:fetch-models, openai:fetch-models, google:fetch-models,
 *           models:load-cache, models:save-cache, models:enrich-context
 */
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')

function register() {
  const p = () => ds.paths()

  // ── Persistent model cache ─────────────────────────────────────────────
  ipcMain.handle('models:load-cache', async () => {
    return ds.readJSON(p().PROVIDER_MODELS_FILE, {})
  })

  ipcMain.handle('models:save-cache', async (_, data) => {
    ds.writeJSON(p().PROVIDER_MODELS_FILE, data)
    return true
  })

  // ── AI context window enrichment ───────────────────────────────────────
  ipcMain.handle('models:enrich-context', async (_, { modelIds }) => {
    // Read config to get utility model
    const config = ds.readJSON(p().CONFIG_FILE, {})
    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      return { success: false, error: 'Utility model not configured' }
    }
    const provider = (config.providers || []).find(p => p.type === um.provider || p.id === um.provider)
    if (!provider?.apiKey) {
      return { success: false, error: 'Utility model provider missing API key' }
    }

    const prompt = `For each model ID below, return its maximum context window size in tokens.
Return ONLY a JSON array, no explanation. Format: [{"id": "model-id", "context_length": 128000}]
If you don't know the exact value, give your best estimate. If the model is not a chat/completion model (e.g. dall-e, whisper, tts, embedding), set context_length to null.

Model IDs:
${modelIds.join('\n')}`

    try {
      const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek' || um.provider === 'minimax'
      let resultText = ''

      if (isOpenAI) {
        const { OpenAIClient } = require('../agent/core/OpenAIClient')
        const oaiClient = new OpenAIClient({
          openaiApiKey: provider.apiKey,
          openaiBaseURL: provider.baseURL.replace(/\/+$/, ''),
          customModel: um.model,
          _resolvedProvider: 'openai',
          defaultProvider: 'openai',
          ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
          provider: { type: um.provider },
        })
        const response = await oaiClient.getClient().chat.completions.create({
          model: um.model,
          ...oaiClient.tokenLimit(4096),
          messages: [{ role: 'user', content: prompt }],
        })
        resultText = response.choices?.[0]?.message?.content || ''
      } else {
        // Anthropic / OpenRouter
        const { AnthropicClient } = require('../agent/core/AnthropicClient')
        const client = new AnthropicClient({
          apiKey: provider.apiKey,
          baseURL: provider.baseURL.replace(/\/+$/, ''),
          customModel: um.model,
        }).getClient()
        const response = await client.messages.create({
          model: um.model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        })
        resultText = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
      }

      // Extract JSON from response
      const jsonMatch = resultText.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return { success: false, error: 'Could not parse AI response' }

      const enriched = JSON.parse(jsonMatch[0])
      logger.info('models:enrich-context', { count: enriched.length })
      return { success: true, enriched }
    } catch (err) {
      logger.error('models:enrich-context error', err.message)
      return { success: false, error: err.message }
    }
  })

  // ── OpenRouter fetch ───────────────────────────────────────────────────
  ipcMain.handle('openrouter:fetch-models', async (_, { apiKey, baseURL }) => {
    if (!baseURL) return { success: false, error: 'OpenRouter baseURL not configured', models: [] }
    const url = baseURL.replace(/\/+$/, '') + '/v1/models'
    try {
      const https = require('https')
      const http = require('http')
      const fetcher = url.startsWith('https') ? https : http
      const data = await new Promise((resolve, reject) => {
        const req = fetcher.get(url, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 15000
        }, (res) => {
          let body = ''
          res.on('data', chunk => { body += chunk })
          res.on('end', () => {
            if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
            else { try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) } }
          })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
      })
      const models = (data.data || []).map(m => ({ id: m.id, name: m.name || m.id, context_length: m.context_length, pricing: m.pricing }))

      return { success: true, models }
    } catch (err) {
      logger.error('openrouter:fetch-models error', err.message)
      return { success: false, error: err.message, models: [] }
    }
  })

  // ── OpenAI fetch (official + compatible) ────────────────────────────────
  ipcMain.handle('openai:fetch-models', async (_, { apiKey, baseURL, type }) => {
    if (!baseURL) return { success: false, error: 'OpenAI baseURL not configured', models: [] }
    const base = baseURL.replace(/\/+$/, '')
    const isMinimax = type === 'minimax'
    const url = isMinimax ? base + '/proxy/openai/v1/models' : base + '/models'
    const headers = isMinimax
      ? { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
      : { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    try {
      const https = require('https')
      const http = require('http')
      const fetcher = url.startsWith('https') ? https : http
      const data = await new Promise((resolve, reject) => {
        const req = fetcher.get(url, {
          headers,
          timeout: 15000
        }, (res) => {
          let body = ''
          res.on('data', chunk => { body += chunk })
          res.on('end', () => {
            if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
            else { try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) } }
          })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
      })
      const models = (data.data || []).map(m => ({ id: m.id, name: m.name || m.id, context_length: m.context_length || null }))

      return { success: true, models }
    } catch (err) {
      logger.error('openai:fetch-models error', err.message)
      return { success: false, error: err.message, models: [] }
    }
  })

  // ── Google fetch ────────────────────────────────────────────────────────
  ipcMain.handle('google:fetch-models', async (_, { apiKey }) => {
    if (!apiKey) return { success: false, error: 'Google API key not configured', models: [] }
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
      if (!resp.ok) {
        const errText = await resp.text()
        return { success: false, error: `HTTP ${resp.status}: ${errText}`, models: [] }
      }
      const data = await resp.json()
      const models = (data.models || []).map(m => ({ id: m.name.replace('models/', ''), name: m.displayName || m.name.replace('models/', ''), context_length: m.inputTokenLimit || null }))

      return { success: true, models }
    } catch (err) {
      logger.error('google:fetch-models error', err.message)
      return { success: false, error: err.message, models: [] }
    }
  })
}

module.exports = { register }
