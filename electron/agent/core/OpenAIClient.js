/**
 * OpenAIClient — wrapper around the OpenAI SDK that provides a similar
 * interface to AnthropicClient.  Used for OpenAI-compatible endpoints
 * (e.g. MLaaS / Virtuos, or any OpenAI-compatible API).
 *
 * Auth: x-api-key header — the SDK's own Authorization header is
 *       set to a dummy value so it doesn't complain.
 */
const OpenAI = require('openai')
const { logger } = require('../../logger')

class OpenAIClient {
  constructor(config) {
    this.config = config
    const resolvedBaseURL = config.openaiBaseURL || config.openai?.baseURL || config.baseURL
    if (!resolvedBaseURL) throw new Error('OpenAI baseURL not configured')
    const baseURL = resolvedBaseURL.replace(/\/+$/, '')
    const apiKey = config.openaiApiKey || config.openai?.apiKey || config.apiKey || ''
    this.client = new OpenAI({
      baseURL: baseURL + '/proxy/openai/v1',
      apiKey: 'dummy',               // SDK requires a non-empty string
      defaultHeaders: { 'x-api-key': apiKey }
    })
    logger.agent('OpenAIClient init', {
      model: this.resolveModel(),
      baseURL,
      hasKey: !!apiKey
    })
  }

  resolveModel() {
    const c = this.config
    if (c.customModel) return c.customModel
    return c.openaiModel || c.openai?.model || 'gpt-4o'
  }

  /** OpenAI endpoints don't support Opus 4.6 compaction */
  isOpus46() { return false }

  /** OpenAI endpoints don't support Anthropic thinking blocks */
  supportsThinking() { return false }

  /** Get the raw OpenAI SDK client */
  getClient() { return this.client }

  /** Rough token estimate (OpenAI SDK doesn't expose count_tokens) */
  async countTokens(messages, system, tools) {
    const text = JSON.stringify(messages) + (system || '')
    return Math.ceil(text.length / 4)
  }
}

module.exports = { OpenAIClient }
