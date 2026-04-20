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

const FALLBACK_MAX_OUTPUT_TOKENS = 32000
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

// Map ClankAI provider type → litellm_provider name
const PROVIDER_TO_LITELLM = {
  openai_official: 'openai',
  anthropic: 'anthropic',
  deepseek: 'deepseek',
  qwen: 'dashscope',
  google: 'gemini',
  mistral: 'mistral',
  groq: 'groq',
  xai: 'xai',
}

/**
 * Load full litellm catalog (not just max_output_tokens).
 * Returns raw { modelId: { ...fields } } object.
 */
function _loadRawCatalog(dataDir) {
  if (dataDir) {
    const cachedPath = path.join(dataDir, 'litellm-models.json')
    try {
      if (fs.existsSync(cachedPath)) return JSON.parse(fs.readFileSync(cachedPath, 'utf8'))
    } catch {}
  }
  try {
    if (fs.existsSync(BUNDLED_PATH)) return JSON.parse(fs.readFileSync(BUNDLED_PATH, 'utf8'))
  } catch {}
  return {}
}

/**
 * Recommend a balanced chat model for a given provider from the user's available models.
 *
 * Strategy:
 * - Filter litellm catalog for matching provider + mode=chat models
 * - Intersect with the user's actual available model IDs (from API fetch)
 * - Sort by total cost (input + output per token)
 * - Pick the median model (balanced cost/performance)
 * - If 1-2 models: pick the more expensive one (better quality)
 *
 * @param {string} providerType - ClankAI provider type (e.g. 'qwen', 'deepseek')
 * @param {string[]} availableModelIds - Model IDs from the user's API fetch
 * @param {string} [dataDir] - User data directory for cached litellm data
 * @returns {{ modelId: string|null, reason: string }}
 */
function recommendModel(providerType, availableModelIds, dataDir) {
  if (!availableModelIds || availableModelIds.length === 0) {
    return { modelId: null, reason: 'no models available' }
  }
  if (availableModelIds.length === 1) {
    return { modelId: availableModelIds[0], reason: 'only model' }
  }

  const litellmProvider = PROVIDER_TO_LITELLM[providerType]
  if (!litellmProvider) {
    // Unknown provider — pick middle of list
    const mid = Math.floor(availableModelIds.length / 2)
    return { modelId: availableModelIds[mid], reason: 'unknown provider, picked middle' }
  }

  const catalog = _loadRawCatalog(dataDir)
  if (!catalog || Object.keys(catalog).length === 0) {
    const mid = Math.floor(availableModelIds.length / 2)
    return { modelId: availableModelIds[mid], reason: 'no catalog data' }
  }

  // Build a set of available IDs (lowercase) for matching
  const availSet = new Set(availableModelIds.map(id => id.toLowerCase()))

  // Find chat models from catalog that match provider AND are in the user's available list
  const scored = []
  for (const [catalogId, meta] of Object.entries(catalog)) {
    if (catalogId === 'sample_spec') continue
    if (meta.litellm_provider !== litellmProvider) continue
    if (meta.mode !== 'chat') continue
    if (meta.deprecation_date) continue

    const cost = (meta.input_cost_per_token || 0) + (meta.output_cost_per_token || 0)
    // litellm IDs may have provider prefix (e.g. "deepseek/deepseek-chat")
    const bare = catalogId.includes('/') ? catalogId.split('/').pop() : catalogId

    // Match against available model IDs
    let matchedId = null
    if (availSet.has(catalogId.toLowerCase())) matchedId = availableModelIds.find(id => id.toLowerCase() === catalogId.toLowerCase())
    else if (availSet.has(bare.toLowerCase())) matchedId = availableModelIds.find(id => id.toLowerCase() === bare.toLowerCase())

    if (matchedId) {
      scored.push({ id: matchedId, cost, ctx: meta.max_input_tokens || 0 })
    }
  }

  if (scored.length === 0) {
    // No catalog matches — pick middle of available list
    const mid = Math.floor(availableModelIds.length / 2)
    return { modelId: availableModelIds[mid], reason: 'no catalog matches' }
  }

  // Deduplicate by model ID (keep lowest cost entry per ID)
  const byId = new Map()
  for (const s of scored) {
    const key = s.id.toLowerCase()
    if (!byId.has(key) || s.cost < byId.get(key).cost) byId.set(key, s)
  }
  const unique = [...byId.values()].sort((a, b) => a.cost - b.cost)

  if (unique.length <= 2) {
    // 1-2 models: pick the more expensive (better quality)
    const pick = unique[unique.length - 1]
    return { modelId: pick.id, reason: `best of ${unique.length}` }
  }

  // 3+ models: pick the median (balanced)
  const medianIdx = Math.floor(unique.length / 2)
  const pick = unique[medianIdx]
  return { modelId: pick.id, reason: `median of ${unique.length} (cost rank ${medianIdx + 1})` }
}

/**
 * Look up a model's metadata (context_length + max_output_tokens) from the litellm catalog.
 * Tries: exact id → bare id (drop provider prefix) → provider-prefixed id → longest-prefix match.
 * Returns { context_length: number|null, max_output_tokens: number|null }.
 */
function lookupModelCatalog(modelId, providerType, dataDir) {
  const empty = { context_length: null, max_output_tokens: null }
  if (!modelId) return empty
  const catalog = _loadRawCatalog(dataDir)
  if (!catalog || Object.keys(catalog).length === 0) return empty

  const id = String(modelId).toLowerCase()
  const litellmProvider = providerType ? PROVIDER_TO_LITELLM[providerType] : null
  const prefixed = litellmProvider ? `${litellmProvider}/${id}` : null

  const pick = (meta) => ({
    context_length:    meta?.max_input_tokens  || meta?.max_tokens || null,
    max_output_tokens: meta?.max_output_tokens || null,
  })

  // 1. Exact match on either id or provider-prefixed id
  for (const [key, meta] of Object.entries(catalog)) {
    if (key === 'sample_spec') continue
    const lk = key.toLowerCase()
    if (lk === id || (prefixed && lk === prefixed)) return pick(meta)
  }

  // 2. Bare-id match (catalog keys like "deepseek/deepseek-chat" vs id "deepseek-chat")
  for (const [key, meta] of Object.entries(catalog)) {
    if (key === 'sample_spec') continue
    const lk = key.toLowerCase()
    const bare = lk.includes('/') ? lk.split('/').pop() : lk
    if (bare === id) return pick(meta)
  }

  // 3. Longest-prefix match against bare keys (e.g. "qwen-max-2025-01-25" matches "qwen-max")
  let bestLen = 0
  let bestMeta = null
  for (const [key, meta] of Object.entries(catalog)) {
    if (key === 'sample_spec') continue
    const lk = key.toLowerCase()
    const bare = lk.includes('/') ? lk.split('/').pop() : lk
    if (id.startsWith(bare) && bare.length > bestLen) {
      bestLen = bare.length
      bestMeta = meta
    }
  }
  return bestMeta ? pick(bestMeta) : empty
}

/**
 * Enrich an array of {id, name, context_length?, max_output_tokens?} entries
 * with missing fields pulled from the litellm catalog. Mutates and returns the array.
 *
 * Also tags the source of each field so the UI can distinguish catalog-inferred
 * values from values that actually came back from the provider's API:
 *   m.contextSource   = 'api' | 'catalog' | null
 *   m.maxOutputSource = 'api' | 'catalog' | null
 */
function enrichModelsFromCatalog(providerType, models, dataDir) {
  if (!Array.isArray(models) || models.length === 0) return models
  for (const m of models) {
    if (!m || !m.id) continue
    // Seed source flags from whatever the fetch handler already populated
    if (!m.contextSource)   m.contextSource   = m.context_length    ? 'api' : null
    if (!m.maxOutputSource) m.maxOutputSource = m.max_output_tokens ? 'api' : null

    if (m.context_length && m.max_output_tokens) continue
    const hit = lookupModelCatalog(m.id, providerType, dataDir)
    if (!m.context_length && hit.context_length) {
      m.context_length = hit.context_length
      m.contextSource  = 'catalog'
    }
    if (!m.max_output_tokens && hit.max_output_tokens) {
      m.max_output_tokens = hit.max_output_tokens
      m.maxOutputSource   = 'catalog'
    }
  }
  return models
}

module.exports = {
  FALLBACK_MAX_OUTPUT_TOKENS,
  lookupModelMaxOutputTokens,
  lookupModelMaxOutputTokensDetailed,
  lookupModelCatalog,
  enrichModelsFromCatalog,
  getAllDefaults,
  refreshFromRemote,
  recommendModel,
}
