// src/utils/pricing.js
// Default model prices (USD per 1M tokens). User overrides stored in config.pricing.

export const DEFAULT_PRICES = {
  // Anthropic
  'claude-opus-4-6':   { input: 15.0,  output: 75.0,  cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-sonnet-4-6': { input: 3.0,   output: 15.0,  cacheWrite: 3.75,  cacheRead: 0.30 },
  'claude-sonnet-4-5': { input: 3.0,   output: 15.0,  cacheWrite: 3.75,  cacheRead: 0.30 },
  'claude-haiku-4-5':  { input: 0.80,  output: 4.0,   cacheWrite: 1.0,   cacheRead: 0.08 },
  // OpenAI
  'gpt-4o':            { input: 2.50,  output: 10.0,  cacheWrite: 0.0,   cacheRead: 0.0 },
  'gpt-4o-mini':       { input: 0.15,  output: 0.60,  cacheWrite: 0.0,   cacheRead: 0.0 },
  'gpt-4-turbo':       { input: 10.0,  output: 30.0,  cacheWrite: 0.0,   cacheRead: 0.0 },
  // Voice
  'whisper-1':         { input: 0.0,   output: 0.0,   cacheWrite: 0.0,   cacheRead: 0.0, perSec: 0.0001 },
  'tts-1':             { input: 0.0,   output: 0.0,   cacheWrite: 0.0,   cacheRead: 0.0, perChar: 0.000015 },
  'tts-1-hd':          { input: 0.0,   output: 0.0,   cacheWrite: 0.0,   cacheRead: 0.0, perChar: 0.000030 },
  // DeepSeek
  'deepseek-chat':     { input: 0.27,  output: 1.10,  cacheWrite: 0.0,   cacheRead: 0.0 },
}

export const DEFAULT_CURRENCY_RATES = { USD: 1, CNY: 7.28, SGD: 1.35 }

/**
 * Resolve the effective price entry for a model name.
 * Tries: exact match → modelPriceMap lookup → substring fuzzy match → null.
 * @param {string} modelId
 * @param {object} pricingConfig  config.pricing (may be undefined/null)
 * @returns {{ input, output, cacheWrite, cacheRead, perSec?, perChar? } | null}
 */
export function resolveModelPrice(modelId, pricingConfig) {
  if (!modelId) return null
  const userModels = pricingConfig?.models || {}
  const modelMap   = pricingConfig?.modelPriceMap || {}
  const allPrices  = { ...DEFAULT_PRICES, ...userModels }

  // 1. Exact match
  if (allPrices[modelId]) return allPrices[modelId]

  // 2. modelPriceMap alias
  const alias = modelMap[modelId]
  if (alias && allPrices[alias]) return allPrices[alias]

  // 3. Fuzzy: find first key that the modelId includes
  for (const [key, price] of Object.entries(allPrices)) {
    if (modelId.includes(key) || key.includes(modelId)) return price
  }

  return null
}

/**
 * Calculate estimated USD cost for a usage object.
 * All token fields are totals (not per-1M).
 */
export function calcCostUSD(usage, price) {
  if (!usage || !price) return 0
  const M = 1_000_000
  let cost = 0
  cost += ((usage.inputTokens        || 0) / M) * (price.input      || 0)
  cost += ((usage.outputTokens       || 0) / M) * (price.output     || 0)
  cost += ((usage.cacheCreationTokens|| 0) / M) * (price.cacheWrite || 0)
  cost += ((usage.cacheReadTokens    || 0) / M) * (price.cacheRead  || 0)
  cost += ((usage.voiceInputTokens   || 0) / M) * (price.input      || 0)
  cost += ((usage.voiceOutputTokens  || 0) / M) * (price.output     || 0)
  cost += ((usage.whisperSecs        || 0))      * (price.perSec    || 0)
  return cost
}

/**
 * Convert USD cost to all configured currencies.
 * Returns { USD: n, CNY: n, SGD: n }.
 */
export function convertCurrencies(usd, rates) {
  const r = { ...DEFAULT_CURRENCY_RATES, ...(rates || {}) }
  return Object.fromEntries(
    Object.entries(r).map(([cur, rate]) => [cur, usd * rate])
  )
}

/**
 * Format a cost value for display.
 * < $0.01 → shows more decimals; ≥ $1000 → no decimals.
 */
export function formatCost(value, currency = 'USD') {
  const symbols = { USD: '$', CNY: '¥', SGD: 'S$' }
  const sym = symbols[currency] || currency + ' '
  if (value === 0) return sym + '0.00'
  if (value < 0.001) return sym + value.toFixed(6)
  if (value < 0.01)  return sym + value.toFixed(4)
  if (value < 1000)  return sym + value.toFixed(2)
  return sym + Math.round(value).toLocaleString()
}
