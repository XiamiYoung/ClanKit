/**
 * IPC handlers for LLM model fetching (OpenRouter, OpenAI, Google).
 * Channels: openrouter:fetch-models, openai:fetch-models, google:fetch-models
 */
const { ipcMain } = require('electron')
const { logger } = require('../logger')

function register() {
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
      logger.info('openrouter:fetch-models', { count: models.length })
      return { success: true, models }
    } catch (err) {
      logger.error('openrouter:fetch-models error', err.message)
      return { success: false, error: err.message, models: [] }
    }
  })

  ipcMain.handle('openai:fetch-models', async (_, { apiKey, baseURL }) => {
    if (!baseURL) return { success: false, error: 'OpenAI baseURL not configured', models: [] }
    const base = baseURL.replace(/\/+$/, '')
    const url = base + '/proxy/openai/v1/models'
    try {
      const https = require('https')
      const http = require('http')
      const fetcher = url.startsWith('https') ? https : http
      const data = await new Promise((resolve, reject) => {
        const req = fetcher.get(url, {
          headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
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
      const models = (data.data || []).map(m => ({ id: m.id, name: m.name || m.id, context_length: m.context_length }))
      logger.info('openai:fetch-models', { count: models.length })
      return { success: true, models }
    } catch (err) {
      logger.error('openai:fetch-models error', err.message)
      return { success: false, error: err.message, models: [] }
    }
  })

  ipcMain.handle('google:fetch-models', async (_, { apiKey }) => {
    if (!apiKey) return { success: false, error: 'Google API key not configured', models: [] }
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
      if (!resp.ok) {
        const errText = await resp.text()
        return { success: false, error: `HTTP ${resp.status}: ${errText}`, models: [] }
      }
      const data = await resp.json()
      const models = (data.models || []).map(m => ({ id: m.name.replace('models/', ''), name: m.displayName || m.name.replace('models/', '') }))
      logger.info('google:fetch-models', { count: models.length })
      return { success: true, models }
    } catch (err) {
      logger.error('google:fetch-models error', err.message)
      return { success: false, error: err.message, models: [] }
    }
  })
}

module.exports = { register }
