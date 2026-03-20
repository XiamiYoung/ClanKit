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
  constructor({ model, apiKey, baseURL, isOpenAI }) {
    this.model    = model
    this.apiKey   = apiKey
    this.baseURL  = baseURL
    this.isOpenAI = isOpenAI
  }

  /**
   * Run the flush: call LLM with recent messages, append result to dated log.
   * @param {Array}  messages  Conversation messages to summarize
   * @param {string} agentId   The active system agent's ID
   * @param {string} logsDir   Path to the agent's memory/logs directory
   * @returns {boolean} true if flush succeeded
   */
  async run(messages, agentId, logsDir) {
    if (!this.model || !this.apiKey || !this.baseURL) {
      logger.debug('[MemoryFlush] skip: utility model not configured', { agentId })
      return false
    }
    if (!messages || messages.length < 2) {
      logger.debug('[MemoryFlush] skip: not enough messages', { agentId })
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
        logger.debug('[MemoryFlush] nothing to flush', { agentId })
        return false
      }

      this._appendToLog(logsDir, summary, agentId)
      logger.agent('[MemoryFlush] flushed', { agentId, lines: summary.split('\n').length })
      return true

    } catch (err) {
      logger.error('[MemoryFlush] failed (non-fatal)', { agentId, error: err.message })
      return false
    }
  }

  async _callAnthropic(messages) {
    const Anthropic = require('@anthropic-ai/sdk')
    const client = new Anthropic.default({ apiKey: this.apiKey, baseURL: this.baseURL })
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: FLUSH_SYSTEM,
      messages: [
        ...messages,
        { role: 'user', content: FLUSH_PROMPT }
      ],
    })
    return response.content?.filter(b => b.type === 'text').map(b => b.text).join('') || null
  }

  async _callOpenAI(messages) {
    const OpenAI = require('openai')
    const client = new OpenAI.default({ apiKey: this.apiKey, baseURL: this.baseURL })
    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: 512,
      messages: [
        { role: 'system', content: FLUSH_SYSTEM },
        ...messages,
        { role: 'user', content: FLUSH_PROMPT }
      ],
    })
    return response.choices?.[0]?.message?.content || null
  }

  _appendToLog(logsDir, summary, agentId) {
    const today     = new Date().toISOString().slice(0, 10)
    const timeStamp = new Date().toTimeString().slice(0, 5)
    const logPath   = path.join(logsDir, `${today}.md`)

    fs.mkdirSync(logsDir, { recursive: true })

    const heading = `\n## Session ${timeStamp}\n`
    const content = heading + summary.trim().split('\n')
      .map(l => l.startsWith('-') ? l : `- ${l}`)
      .join('\n') + '\n'

    fs.appendFileSync(logPath, content, 'utf8')
  }
}

module.exports = { MemoryFlush, FLUSH_PROMPT }
