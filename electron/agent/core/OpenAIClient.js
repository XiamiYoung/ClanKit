/**
 * OpenAIClient — wrapper around the OpenAI SDK that provides a similar
 * interface to AnthropicClient.  Used for OpenAI-compatible endpoints
 *
 * Auth: x-api-key header — the SDK's own Authorization header is
 *       set to a dummy value so it doesn't complain.
 */
const OpenAI = require('openai')
const { logger } = require('../../logger')

class OpenAIClient {
  constructor(config) {
    this.config = config
    this.isOfficialOpenAI = config.provider?.type === 'openai_official'
    const resolvedBaseURL = config.openaiBaseURL || config.openai?.baseURL || config.baseURL
    if (!resolvedBaseURL) throw new Error('OpenAI baseURL not configured')
    const baseURL = resolvedBaseURL.replace(/\/+$/, '')
    const apiKey = config.openaiApiKey || config.openai?.apiKey || config.apiKey || ''
    // _directAuth: use standard Bearer auth (DeepSeek, direct OpenAI endpoints).
    if (config._directAuth) {
      const directURL = baseURL.endsWith('/v1') ? baseURL : baseURL + '/v1'
      // OpenAI SDK requires a non-empty apiKey string at construction even when
      // the upstream server (Ollama, local LLM gateways) ignores Bearer auth.
      // Send a placeholder so the SDK doesn't throw before the request even
      // leaves the process — Ollama discards the header server-side.
      this.client = new OpenAI({ baseURL: directURL, apiKey: apiKey || 'ollama-no-auth' })
    } else {
      this.client = new OpenAI({
        baseURL: baseURL + '/proxy/openai/v1',
        apiKey: 'dummy',               // SDK requires a non-empty string
        defaultHeaders: { 'x-api-key': apiKey }
      })
    }
    logger.agent('OpenAIClient init', {
      scenario: config._scenario || 'unknown',
      model: this.resolveModel(),
      baseURL,
      hasKey: !!apiKey
    })
  }

  resolveModel() {
    const c = this.config
    if (c.customModel) return c.customModel
    if (c._directAuth) return c.deepseek?.model || c.openaiModel || 'deepseek-chat'
    return c.openaiModel || c.openai?.model || 'gpt-4o'
  }

  /** OpenAI endpoints don't support Opus 4.6 compaction */
  isOpus46() { return false }

  /** OpenAI endpoints don't support Anthropic thinking blocks */
  supportsThinking() { return false }

  /** Get the raw OpenAI SDK client */
  getClient() { return this.client }

  /**
   * Returns the correct token limit parameter.
   * Newer OpenAI models (o-series, gpt-5.x) require max_completion_tokens;
   * older models and non-OpenAI endpoints use max_tokens.
   * Checks both provider type and model name to handle proxied scenarios.
   */
  tokenLimit(n) {
    if (this.isOfficialOpenAI) return { max_completion_tokens: n }
    // Only auto-detect for direct auth (talking to real OpenAI API, not through a proxy)
    if (this.config._directAuth) {
      const model = (this.resolveModel() || '').toLowerCase()
      if (/^(gpt-5|o[1-9]|o\d+-|chatgpt-4o-latest)/.test(model)) return { max_completion_tokens: n }
    }
    return { max_tokens: n }
  }

  /** Rough token estimate (OpenAI SDK doesn't expose count_tokens) */
  async countTokens(messages, system, tools) {
    const text = JSON.stringify(messages) + (system || '')
    return Math.ceil(text.length / 4)
  }
}

module.exports = { OpenAIClient }
