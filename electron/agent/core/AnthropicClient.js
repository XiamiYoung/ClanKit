/**
 * AnthropicClient — singleton wrapper around the Anthropic SDK.
 * Handles client construction, model resolution, and token counting.
 */
const Anthropic = require('@anthropic-ai/sdk')
const { logger } = require('../../logger')

// Process-wide cache for thinking-mode capability per (baseURL, model).
// Keyed by `${baseURL}|${model}`. Values: 'adaptive' | 'budget' | 'none'.
// Populated only on downgrade — absent entries fall back to family defaults
// in resolveThinkingConfig(). Cleared on app restart so future model upgrades
// (e.g. Anthropic adding adaptive support to Haiku) get re-probed naturally.
const _thinkingModeCache = new Map()

class AnthropicClient {
  constructor(config) {
    this.config = config
    const isOpenRouter = config.baseURL && config.baseURL.includes('openrouter.ai')
    const key = config.apiKey || ''
    const clientOpts = {
      baseURL: config.baseURL || undefined
    }
    if (isOpenRouter) {
      // OpenRouter expects Authorization: Bearer header, not x-api-key.
      // Must explicitly set apiKey to null to prevent the SDK from reading
      // ANTHROPIC_API_KEY from env and sending x-api-key instead of Authorization.
      clientOpts.apiKey = null
      clientOpts.authToken = key
    } else {
      clientOpts.apiKey = key
    }
    this.client = new Anthropic(clientOpts)
    logger.agent('AnthropicClient init', {
      scenario: config._scenario || 'unknown',
      model: this.resolveModel(),
      baseURL: config.baseURL,
      hasKey: !!key,
      isOpenRouter
    })
  }

  resolveModel() {
    const c = this.config
    if (c.customModel) return c.customModel   // Per-chat override
    const a = c.anthropic || {}
    if (a.activeModel === 'opus')  return a.opusModel  || 'claude-opus-4-6'
    if (a.activeModel === 'haiku') return a.haikuModel || 'claude-haiku-4-5'
    return a.sonnetModel || 'claude-sonnet-4-5'
  }

  _thinkingCacheKey() {
    return `${this.config.baseURL || ''}|${this.resolveModel()}`
  }

  // Resolve the thinking-mode payload to send for this model, or null to
  // disable thinking. Family-based defaults: opus/sonnet → adaptive,
  // haiku → budget. Cache overrides take precedence (set by downgrade).
  // Unknown families default to disabled to avoid 400s on novel aliases.
  resolveThinkingConfig() {
    const cached = _thinkingModeCache.get(this._thinkingCacheKey())
    if (cached === 'none') return null
    if (cached === 'budget') return { type: 'enabled', budget_tokens: 8192 }
    if (cached === 'adaptive') return { type: 'adaptive' }
    const model = this.resolveModel()
    if (model.includes('haiku')) return { type: 'enabled', budget_tokens: 8192 }
    if (model.includes('opus') || model.includes('sonnet')) return { type: 'adaptive' }
    return null
  }

  // Move this (baseURL, model) one step down the thinking-support chain
  // and persist in the process cache: adaptive → budget → none.
  // Returns the new resolved config (same shape as resolveThinkingConfig).
  markThinkingDowngrade(currentType) {
    const next = currentType === 'adaptive' ? 'budget' : 'none'
    _thinkingModeCache.set(this._thinkingCacheKey(), next)
    logger.warn('Anthropic thinking downgraded', {
      model: this.resolveModel(),
      from: currentType || 'none',
      to: next,
    })
    return this.resolveThinkingConfig()
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
