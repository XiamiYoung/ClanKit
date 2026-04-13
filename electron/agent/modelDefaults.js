/**
 * Model max output token defaults — powered by LiteLLM model catalog.
 *
 * Data sources (in priority order):
 *   1. Online-cached version  — DATA_DIR/litellm-models.json (fetched at startup)
 *   2. Bundled version        — electron/data/litellm-models.json (shipped with app)
 *   3. Fallback               — 32768
 *
 * Update the bundled file: `npm run update-models`
 */
const fs = require('fs')
const path = require('path')
const { logger } = require('../logger')

const FALLBACK_MAX_OUTPUT_TOKENS = 32768
const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

// Bundled file path (relative to this file — works in both dev and packaged app)
const BUNDLED_PATH = path.join(__dirname, '..', 'data', 'litellm-models.json')

// In-memory cache: { modelId -> max_output_tokens }
let _cache = null

/**
 * Load the model data from disk (cached or bundled).
 * Called lazily on first lookup or eagerly via init().
 */
function _loadData(dataDir) {
  if (_cache) return _cache
  _cache = {}

  let raw = null
  // 1. Try online-cached version in user data dir
  if (dataDir) {
    const cachedPath = path.join(dataDir, 'litellm-models.json')
    try {
      if (fs.existsSync(cachedPath)) {
        raw = JSON.parse(fs.readFileSync(cachedPath, 'utf8'))
        logger.info('[modelDefaults] loaded cached litellm data', { path: cachedPath, models: Object.keys(raw).length })
      }
    } catch (e) {
      logger.warn('[modelDefaults] failed to read cached litellm data', e.message)
    }
  }

  // 2. Fall back to bundled version
  if (!raw) {
    try {
      if (fs.existsSync(BUNDLED_PATH)) {
        raw = JSON.parse(fs.readFileSync(BUNDLED_PATH, 'utf8'))
        logger.info('[modelDefaults] loaded bundled litellm data', { models: Object.keys(raw).length })
      }
    } catch (e) {
      logger.warn('[modelDefaults] failed to read bundled litellm data', e.message)
    }
  }

  if (!raw) return _cache

  // Build lookup: modelId -> max_output_tokens
  for (const [key, val] of Object.entries(raw)) {
    if (key === 'sample_spec' || !val || typeof val !== 'object') continue
    if (val.max_output_tokens && val.max_output_tokens > 0) {
      _cache[key] = val.max_output_tokens
    }
  }
  return _cache
}

/**
 * Fetch latest litellm data from GitHub and cache to DATA_DIR.
 * Non-blocking, best-effort. Called once at app startup.
 */
async function refreshFromRemote(dataDir) {
  if (!dataDir) return
  try {
    const resp = await fetch(LITELLM_URL, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const text = await resp.text()
    // Validate it's valid JSON before writing
    JSON.parse(text)
    const cachedPath = path.join(dataDir, 'litellm-models.json')
    fs.writeFileSync(cachedPath, text, 'utf8')
    // Invalidate in-memory cache so next lookup picks up new data
    _cache = null
    logger.info('[modelDefaults] refreshed litellm data from remote')
  } catch (e) {
    logger.warn('[modelDefaults] remote refresh failed (will use local)', e.message)
  }
}

/**
 * Look up the default max output tokens for a model.
 * @param {string} modelId
 * @param {string} [dataDir] - user data directory path
 * @returns {number}
 */
function lookupModelMaxOutputTokens(modelId, dataDir) {
  if (!modelId) return FALLBACK_MAX_OUTPUT_TOKENS
  const cache = _loadData(dataDir)
  const id = String(modelId).toLowerCase()

  // 1. Exact match (case-insensitive)
  for (const [key, val] of Object.entries(cache)) {
    if (key.toLowerCase() === id) return val
  }

  // 2. Try without provider prefix (e.g. "deepseek/deepseek-chat" -> "deepseek-chat")
  const stripped = id.includes('/') ? id.split('/').pop() : null
  if (stripped) {
    for (const [key, val] of Object.entries(cache)) {
      if (key.toLowerCase() === stripped) return val
    }
  }

  // 3. Prefix match (longest wins, ignoring provider prefix in keys)
  let bestLen = 0
  let bestVal = null
  for (const [key, val] of Object.entries(cache)) {
    const lk = key.toLowerCase()
    // Match against both full key and key without provider prefix
    const bare = lk.includes('/') ? lk.split('/').pop() : lk
    if (id.startsWith(bare) && bare.length > bestLen) {
      bestLen = bare.length
      bestVal = val
    }
  }
  if (bestVal !== null) return bestVal

  return FALLBACK_MAX_OUTPUT_TOKENS
}

/**
 * Detailed lookup returning { value, isFallback }.
 * Used by the frontend to show a visual indicator for unknown models.
 */
function lookupModelMaxOutputTokensDetailed(modelId, dataDir) {
  if (!modelId) return { value: FALLBACK_MAX_OUTPUT_TOKENS, isFallback: true }
  const cache = _loadData(dataDir)
  const id = String(modelId).toLowerCase()

  // Exact match
  for (const [key, val] of Object.entries(cache)) {
    if (key.toLowerCase() === id) return { value: val, isFallback: false }
  }

  // Without provider prefix
  const stripped = id.includes('/') ? id.split('/').pop() : null
  if (stripped) {
    for (const [key, val] of Object.entries(cache)) {
      if (key.toLowerCase() === stripped) return { value: val, isFallback: false }
    }
  }

  // Prefix match
  let bestLen = 0
  let bestVal = null
  for (const [key, val] of Object.entries(cache)) {
    const lk = key.toLowerCase()
    const bare = lk.includes('/') ? lk.split('/').pop() : lk
    if (id.startsWith(bare) && bare.length > bestLen) {
      bestLen = bare.length
      bestVal = val
    }
  }
  if (bestVal !== null) return { value: bestVal, isFallback: false }

  return { value: FALLBACK_MAX_OUTPUT_TOKENS, isFallback: true }
}

/**
 * Get the full table for frontend display: { modelId: maxOutputTokens }.
 * Only includes models without provider prefix to avoid duplicates.
 */
function getAllDefaults(dataDir) {
  const cache = _loadData(dataDir)
  const result = {}
  for (const [key, val] of Object.entries(cache)) {
    // Skip provider-prefixed duplicates (keep "gpt-4o", skip "openai/gpt-4o")
    if (!key.includes('/')) {
      result[key] = val
    }
  }
  return result
}

module.exports = {
  FALLBACK_MAX_OUTPUT_TOKENS,
  lookupModelMaxOutputTokens,
  lookupModelMaxOutputTokensDetailed,
  getAllDefaults,
  refreshFromRemote,
}
