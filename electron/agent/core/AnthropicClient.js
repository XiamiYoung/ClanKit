/**
 * AnthropicClient — singleton wrapper around the Anthropic SDK.
 * Handles client construction, model resolution, and token counting.
 */
const Anthropic = require('@anthropic-ai/sdk')
const { logger } = require('../../logger')

// Process-wide cache for thinking-mode capability per (baseURL, model).
// Keyed by `${baseURL}|${model}`. Values: 'adaptive' | 'budget' | 'none'.
// Populated only on downgrade — absent entries fall back to effort-driven
// resolution in resolveThinkingConfig(). Cleared on app restart so future
// model upgrades (e.g. Anthropic adding adaptive support to Haiku) get
// re-probed naturally.
const _thinkingModeCache = new Map()

// User-facing "effort" tier → Anthropic API thinking payload.
// Mirrors Claude Code's /effort slash command 5-tier slider.
// Exported for tests and for ConfigView to render tier metadata (name + tokens).
const EFFORT_TO_THINKING = {
  low:    { type: 'enabled', budget_tokens: 1024 },
  medium: { type: 'enabled', budget_tokens: 4096 },
  high:   { type: 'enabled', budget_tokens: 16384 },
  xhigh:  { type: 'enabled', budget_tokens: 32768 },
  max:    { type: 'adaptive' },
}
const EFFORT_TIERS = ['low', 'medium', 'high', 'xhigh', 'max']
const DEFAULT_EFFORT = 'medium'

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

  // Resolve thinking payload from a Claude-Code-style effort tier.
  // Returns { thinking, output_config? }. Most call sites only spread `thinking`
  // into the request, but newer Opus models reject `thinking.type.enabled` and
  // require `thinking.type.adaptive` + `output_config.effort: <tier>` instead.
  // We detect that 400 once and cache the model as 'adaptive_effort'.
  //
  // 5 tiers (legacy/budget path) mapped to Anthropic API `thinking` field:
  //   low    → budget 1024   (API minimum; fast, minimal planning)
  //   medium → budget 4096   (default; suits most coding/QA tasks)
  //   high   → budget 16384  (deep planning for complex code/docs)
  //   xhigh  → budget 32768  (algorithm/proof-level reasoning)
  //   max    → adaptive      (model auto-decides up to max_tokens-1024)
  //
  // Cache states (per baseURL+model):
  //   undefined        → use EFFORT_TO_THINKING[effort] (legacy budget path)
  //   'adaptive_effort'→ new API: thinking=adaptive + output_config.effort=<tier>
  //   'adaptive'       → thinking=adaptive only (no output_config)
  //   'budget'         → thinking=enabled, budget_tokens=8192 (downgraded)
  //   'none'           → null (thinking disabled entirely)
  resolveThinkingConfig(effort) {
    const tier = effort && EFFORT_TO_THINKING[effort] ? effort : DEFAULT_EFFORT
    const cached = _thinkingModeCache.get(this._thinkingCacheKey())
    if (cached === 'none') return { thinking: null }
    if (cached === 'adaptive_effort') {
      return {
        thinking: { type: 'adaptive' },
        output_config: { effort: tier },
      }
    }
    if (cached === 'budget') return { thinking: { type: 'enabled', budget_tokens: 8192 } }
    if (cached === 'adaptive') return { thinking: { type: 'adaptive' } }
    return { thinking: EFFORT_TO_THINKING[tier] }
  }

  // Move this (baseURL, model) one step down the thinking-support chain
  // and persist in the process cache: adaptive → budget → none.
  // Returns the new resolved config — same { thinking, output_config? } shape.
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

  // Sideways switch: model rejected `thinking.type.enabled` (budget mode) and
  // demanded the newer `thinking.type.adaptive` + `output_config.effort` shape.
  // Cache this so future calls to the same (baseURL, model) skip the failed
  // attempt and use the new shape directly. Returns the resolved config.
  markUseAdaptiveEffort() {
    _thinkingModeCache.set(this._thinkingCacheKey(), 'adaptive_effort')
    logger.warn('Anthropic thinking switched to adaptive+effort', {
      model: this.resolveModel(),
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

module.exports = { AnthropicClient, EFFORT_TO_THINKING, EFFORT_TIERS, DEFAULT_EFFORT }
