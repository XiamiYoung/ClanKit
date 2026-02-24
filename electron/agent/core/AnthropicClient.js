/**
 * AnthropicClient — singleton wrapper around the Anthropic SDK.
 * Handles client construction, model resolution, and token counting.
 */
const Anthropic = require('@anthropic-ai/sdk')
const { logger } = require('../../logger')

class AnthropicClient {
  constructor(config) {
    this.config = config
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
      baseURL: (config.baseURL && config.baseURL !== 'https://api.anthropic.com')
        ? config.baseURL
        : (process.env.ANTHROPIC_BASE_URL || undefined)
    })
    logger.agent('AnthropicClient init', {
      model: this.resolveModel(),
      baseURL: config.baseURL,
      hasKey: !!config.apiKey
    })
  }

  resolveModel() {
    const c = this.config
    if (c.activeModel === 'opus')  return c.opusModel  || 'claude-opus-4-6'
    if (c.activeModel === 'haiku') return c.haikuModel || 'claude-haiku-4-5'
    return c.sonnetModel || 'claude-sonnet-4-5'
  }

  /** Check if the resolved model is Opus 4.6 (supports adaptive thinking + compaction) */
  isOpus46() {
    const model = this.resolveModel()
    return model.includes('opus-4-6') || model.includes('opus-4.6')
  }

  /** Check if thinking is supported (Opus 4.5+, Sonnet 4.5+) */
  supportsThinking() {
    const model = this.resolveModel()
    return model.includes('opus') || model.includes('sonnet-4')
  }

  /** Get the raw SDK client */
  getClient() {
    return this.client
  }

  /** Count tokens for a message set (estimate based on chars if counting not available) */
  async countTokens(messages, system, tools) {
    try {
      const params = {
        model: this.resolveModel(),
        messages,
      }
      if (system) params.system = system
      if (tools && tools.length > 0) params.tools = tools
      const result = await this.client.messages.countTokens(params)
      return result.input_tokens
    } catch (err) {
      // Fallback: rough estimate ~4 chars per token
      logger.warn('Token count API failed, using estimate', err.message)
      const text = JSON.stringify(messages) + (system || '')
      return Math.ceil(text.length / 4)
    }
  }
}

module.exports = { AnthropicClient }
