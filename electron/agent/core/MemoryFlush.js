/**
 * MemoryFlush — pre-compaction memory preservation.
 *
 * Triggers a silent LLM turn that writes key conversation points to
 * memory/agents/{agentId}/memory/YYYY-MM-DD.md before context is compacted.
 *
 * Requires utility model configuration. Silently skips if not configured.
 */
const fs   = require('fs')
const path = require('path')
const { logger } = require('../../logger')

const FLUSH_PROMPT = [
  'Pre-compaction memory flush.',
  'Briefly summarize the key points, decisions, and outcomes of our conversation so far.',
  'Write 3-8 bullet points maximum. Be concise and factual.',
  'Focus on: what was worked on, decisions made, conclusions reached, next steps if any.',
  'If nothing meaningful happened yet, write only: (no significant events)',
].join(' ')

const FLUSH_SYSTEM = [
  'You are capturing a brief session summary before context compaction.',
  'Output ONLY bullet points (- item). No headers, no preamble, no markdown formatting beyond bullets.',
  'Maximum 8 bullets. Each bullet: one clear sentence.',
].join(' ')

class MemoryFlush {
  constructor({ model, apiKey, baseURL, isOpenAI, directAuth = false }) {
    this.model      = model
    this.apiKey     = apiKey
    this.baseURL    = baseURL
    this.isOpenAI   = isOpenAI
    this.directAuth = directAuth
  }

  /**
   * Run the flush: call LLM with recent messages, append result to dated log.
   * @param {Array}  messages  Conversation messages to summarize
   * @param {string} agentId   The active system agent's ID
   * @param {string} logsDir   Path to the agent's memory/logs directory
   * @param {object} [meta]    Optional metadata: { chatId, chatTitle }
   * @returns {boolean} true if flush succeeded
   */
  async run(messages, agentId, logsDir, meta = {}, agentLabel = null) {
    const label = agentLabel || agentId
    if (!this.model || !this.apiKey || !this.baseURL) {
      logger.debug('[MemoryFlush] skip: utility model not configured', { agent: label })
      return false
    }
    if (!messages || messages.length < 2) {
      logger.debug('[MemoryFlush] skip: not enough messages', { agent: label })
      return false
    }

    try {
      // Take last 40 messages for the summary (enough context, not too large)
      const recentMsgs = messages.slice(-40).filter(m =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' && m.content.trim()
      )
      if (recentMsgs.length < 2) return false

      let summary = null

      if (this.isOpenAI) {
        summary = await this._callOpenAI(recentMsgs)
      } else {
        summary = await this._callAnthropic(recentMsgs)
      }

      if (!summary || summary.trim() === '(no significant events)') {
        logger.debug('[MemoryFlush] nothing to flush', { agent: label })
        return false
      }

      this._appendToLog(logsDir, summary, agentId, meta)
      logger.agent('[MemoryFlush] flushed', { agent: label, lines: summary.split('\n').length })
      return true

    } catch (err) {
      logger.error('[MemoryFlush] failed (non-fatal)', { agent: label, error: err.message })
      return false
    }
  }

  async _callAnthropic(messages) {
    const Anthropic = require('@anthropic-ai/sdk')
    const client = new Anthropic.default({
      apiKey:  this.apiKey,
      baseURL: this.baseURL.replace(/\/+$/, ''),
    })
    // Strip extra fields (e.g. timestamp) — Anthropic API rejects unknown properties
    const cleanMsgs = messages.map(m => ({ role: m.role, content: m.content }))
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: FLUSH_SYSTEM,
      messages: [
        ...cleanMsgs,
        { role: 'user', content: FLUSH_PROMPT }
      ],
    })
    return response.content?.filter(b => b.type === 'text').map(b => b.text).join('') || null
  }

  async _callOpenAI(messages) {
    const { OpenAIClient } = require('./OpenAIClient')
    const cfg = {
      openaiApiKey:      this.apiKey,
      openaiBaseURL:     this.baseURL.replace(/\/+$/, ''),
      customModel:       this.model,
      _resolvedProvider: 'openai',
      defaultProvider:   'openai',
      _directAuth:       this.directAuth,
    }
    const openAIClient = new OpenAIClient(cfg)
    const client = openAIClient.getClient()
    // Strip extra fields (e.g. timestamp) — some providers reject unknown properties
    const cleanMsgs = messages.map(m => ({ role: m.role, content: m.content }))
    const response = await client.chat.completions.create({
      model: this.model,
      ...openAIClient.tokenLimit(512),
      messages: [
        { role: 'system', content: FLUSH_SYSTEM },
        ...cleanMsgs,
        { role: 'user', content: FLUSH_PROMPT }
      ],
    })
    return response.choices?.[0]?.message?.content || null
  }

  _appendToLog(logsDir, summary, agentId, meta = {}) {
    const today     = new Date().toISOString().slice(0, 10)
    const timeStamp = new Date().toTimeString().slice(0, 5)
    const logPath   = path.join(logsDir, `${today}.md`)

    fs.mkdirSync(logsDir, { recursive: true })

    // Build header: time + optional chatId + readable title from first bullet
    const bullets = summary.trim().split('\n').filter(l => l.trim())
    const firstBullet = bullets[0]
      ? bullets[0].replace(/^[-*]\s*/, '').slice(0, 60).trim()
      : ''
    const chatTag  = meta.chatId    ? ` | chat:${meta.chatId.slice(0, 8)}` : ''
    const titleTag = firstBullet    ? ` | "${firstBullet}"` : ''
    const heading  = `\n## Session ${today} ${timeStamp}${chatTag}${titleTag}\n`

    const body = bullets
      .map(l => l.startsWith('-') ? l : `- ${l}`)
      .join('\n') + '\n'

    fs.appendFileSync(logPath, heading + body, 'utf8')
  }
}

module.exports = { MemoryFlush, FLUSH_PROMPT }
