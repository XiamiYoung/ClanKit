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

/**
 * Return the full chat-model catalog as an array suitable for UI pickers.
 * Filters to entries that plausibly represent a chat/completion model — anything
 * with `mode: 'chat'` OR (no mode but useful fields present). Image generation,
 * audio, and embedding entries are dropped. Shape per entry:
 *   { id, provider, context_length, max_output_tokens,
 *     input_cost_per_token, output_cost_per_token }
 */
function getAllChatModelEntries(dataDir) {
  const catalog = _loadRawCatalog(dataDir)
  if (!catalog || Object.keys(catalog).length === 0) return []
  const out = []
  for (const [key, meta] of Object.entries(catalog)) {
    if (key === 'sample_spec' || !meta || typeof meta !== 'object') continue
    if (meta.mode && meta.mode !== 'chat') continue
    const ctx = meta.max_input_tokens || meta.max_tokens || null
    const mo  = meta.max_output_tokens || null
    const inC = meta.input_cost_per_token  ?? null
    const outC = meta.output_cost_per_token ?? null
    // Skip entries with no useful fields — they're not worth showing to the user
    if (!ctx && !mo && inC == null && outC == null) continue
    out.push({
      id: key,
      provider: meta.litellm_provider || null,
      context_length: ctx,
      max_output_tokens: mo,
      input_cost_per_token: inC,
      output_cost_per_token: outC,
    })
  }
  return out
}

// Map ClanKit provider type → litellm_provider name
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

// Curated recommendations per provider — flagship-first ordering.
// First available match wins. Matching is case-insensitive and accepts either
// exact id or id.startsWith(entry) (covers dated suffixes like "qwen-max-2025-01-25").
// Always lead with the provider's top-tier general-purpose chat model so first-run
// users experience the provider at its best. Specialized reasoning models that emit
// thinking tokens (o1/o3, deepseek-reasoner) are intentionally NOT defaults — they
// surprise new users with slow responses and reasoning output. Update this list
// when a new flagship ships, not for every minor release.
const RECOMMENDED_BY_PROVIDER = {
  anthropic:       ['claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5'],
  openai_official: ['gpt-5.5', 'gpt-5', 'gpt-4.1', 'gpt-4o'],
  google:          ['gemini-3.1-pro', 'gemini-3-pro', 'gemini-2.5-pro', 'gemini-pro-latest'],
  deepseek:        ['deepseek-chat', 'deepseek-v3', 'deepseek-reasoner'],
  qwen:            ['qwen-max-latest', 'qwen-max', 'qwen-plus-latest', 'qwen-plus'],
  openrouter:      ['anthropic/claude-opus-4.7', 'anthropic/claude-opus-4.6', 'anthropic/claude-opus-4.5', 'anthropic/claude-sonnet-4.6', 'anthropic/claude-sonnet-4.5'],
  groq:            ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile'],
  glm:             ['glm-4-plus', 'glm-4-air'],
  moonshot:        ['kimi-k2-0905-preview', 'moonshot-v1-32k'],
  doubao:          ['doubao-pro-128k', 'doubao-pro-32k'],
  mistral:         ['mistral-large-latest', 'mistral-medium-latest'],
  xai:             ['grok-4', 'grok-3-latest', 'grok-3'],
}

// Try the curated whitelist first. Returns a matched available model id, or null.
function _pickFromWhitelist(providerType, availableModelIds) {
  const list = RECOMMENDED_BY_PROVIDER[providerType]
  if (!list || list.length === 0) return null
  const lowered = availableModelIds.map(id => [id, id.toLowerCase()])
  for (const entry of list) {
    const e = entry.toLowerCase()
    // Exact match
    const exact = lowered.find(([, lo]) => lo === e)
    if (exact) return exact[0]
    // Prefix match (e.g. "qwen-plus" matches "qwen-plus-2025-01-25")
    const prefix = lowered.find(([, lo]) => lo.startsWith(e + '-') || lo.startsWith(e + ':'))
    if (prefix) return prefix[0]
  }
  return null
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
 * - Sort by total cost (input + output per token), pick the most expensive
 *   (price is the best available proxy for capability when there's no curated entry)
 *
 * @param {string} providerType - ClanKit provider type (e.g. 'qwen', 'deepseek')
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

  // 1. Curated whitelist — fastest path, most explainable, stable across model list churn.
  const whitelisted = _pickFromWhitelist(providerType, availableModelIds)
  if (whitelisted) {
    return { modelId: whitelisted, reason: 'curated flagship' }
  }

  const litellmProvider = PROVIDER_TO_LITELLM[providerType]
  if (!litellmProvider) {
    // Unknown provider — without catalog data, just pick the first model.
    // Picking "middle" was an arbitrary cost-balanced heuristic; flagship-first
    // policy has no signal here, so don't pretend to.
    return { modelId: availableModelIds[0], reason: 'unknown provider, no catalog signal' }
  }

  const catalog = _loadRawCatalog(dataDir)
  if (!catalog || Object.keys(catalog).length === 0) {
    return { modelId: availableModelIds[0], reason: 'no catalog data' }
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
    return { modelId: availableModelIds[0], reason: 'no catalog matches' }
  }

  // Deduplicate by model ID (keep highest cost entry per ID — usually a tie, but
  // be defensive in case the same id appears with different metadata)
  const byId = new Map()
  for (const s of scored) {
    const key = s.id.toLowerCase()
    if (!byId.has(key) || s.cost > byId.get(key).cost) byId.set(key, s)
  }
  // Pick the most expensive — price is our best proxy for capability when we
  // don't have a curated flagship entry for this provider.
  const sorted = [...byId.values()].sort((a, b) => b.cost - a.cost)
  const pick = sorted[0]
  return { modelId: pick.id, reason: `top-priced of ${sorted.length}` }
}

/**
 * Look up a model's metadata (context_length + max_output_tokens + pricing) from the litellm catalog.
 * Tries: exact id → bare id (drop provider prefix) → provider-prefixed id → longest-prefix match.
 * Returns { context_length, max_output_tokens, input_cost_per_token, output_cost_per_token,
 *           cache_read_input_token_cost, cache_creation_input_token_cost } — any may be null.
 */
function lookupModelCatalog(modelId, providerType, dataDir) {
  const empty = {
    context_length: null, max_output_tokens: null,
    input_cost_per_token: null, output_cost_per_token: null,
    cache_read_input_token_cost: null, cache_creation_input_token_cost: null,
  }
  if (!modelId) return empty
  const catalog = _loadRawCatalog(dataDir)
  if (!catalog || Object.keys(catalog).length === 0) return empty

  const id = String(modelId).toLowerCase()
  const litellmProvider = providerType ? PROVIDER_TO_LITELLM[providerType] : null
  const prefixed = litellmProvider ? `${litellmProvider}/${id}` : null

  const pick = (meta) => ({
    context_length:    meta?.max_input_tokens  || meta?.max_tokens || null,
    max_output_tokens: meta?.max_output_tokens || null,
    input_cost_per_token:             meta?.input_cost_per_token             ?? null,
    output_cost_per_token:            meta?.output_cost_per_token            ?? null,
    cache_read_input_token_cost:      meta?.cache_read_input_token_cost      ?? null,
    cache_creation_input_token_cost:  meta?.cache_creation_input_token_cost  ?? null,
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
 *   m.contextSource    = 'api' | 'catalog' | null
 *   m.maxOutputSource  = 'api' | 'catalog' | null
 *   m.priceSource      = 'api' | 'catalog' | null
 *
 * Pricing fields are normalized to USD cost-per-token (matching litellm format):
 *   m.input_cost_per_token, m.output_cost_per_token,
 *   m.cache_read_input_token_cost, m.cache_creation_input_token_cost
 *
 * OpenRouter-style `m.pricing = { prompt, completion }` strings (USD per token, already)
 * are promoted to the normalized fields with priceSource='api'.
 */
function enrichModelsFromCatalog(providerType, models, dataDir) {
  if (!Array.isArray(models) || models.length === 0) return models
  for (const m of models) {
    if (!m || !m.id) continue
    // Seed source flags from whatever the fetch handler already populated
    if (!m.contextSource)   m.contextSource   = m.context_length    ? 'api' : null
    if (!m.maxOutputSource) m.maxOutputSource = m.max_output_tokens ? 'api' : null

    // Promote OpenRouter-style { pricing: { prompt, completion } } strings
    if (m.pricing && typeof m.pricing === 'object') {
      const prompt     = parseFloat(m.pricing.prompt)
      const completion = parseFloat(m.pricing.completion)
      if (Number.isFinite(prompt)     && prompt     >= 0 && m.input_cost_per_token  == null) m.input_cost_per_token  = prompt
      if (Number.isFinite(completion) && completion >= 0 && m.output_cost_per_token == null) m.output_cost_per_token = completion
    }
    if (!m.priceSource) m.priceSource = (m.input_cost_per_token != null || m.output_cost_per_token != null) ? 'api' : null

    const needsEnrich =
      !m.context_length || !m.max_output_tokens ||
      m.input_cost_per_token == null || m.output_cost_per_token == null
    if (!needsEnrich) continue

    const hit = lookupModelCatalog(m.id, providerType, dataDir)
    if (!m.context_length && hit.context_length) {
      m.context_length = hit.context_length
      m.contextSource  = 'catalog'
    }
    if (!m.max_output_tokens && hit.max_output_tokens) {
      m.max_output_tokens = hit.max_output_tokens
      m.maxOutputSource   = 'catalog'
    }
    if (m.input_cost_per_token == null && hit.input_cost_per_token != null) {
      m.input_cost_per_token = hit.input_cost_per_token
      m.priceSource = m.priceSource || 'catalog'
    }
    if (m.output_cost_per_token == null && hit.output_cost_per_token != null) {
      m.output_cost_per_token = hit.output_cost_per_token
      m.priceSource = m.priceSource || 'catalog'
    }
    if (m.cache_read_input_token_cost == null     && hit.cache_read_input_token_cost     != null) m.cache_read_input_token_cost     = hit.cache_read_input_token_cost
    if (m.cache_creation_input_token_cost == null && hit.cache_creation_input_token_cost != null) m.cache_creation_input_token_cost = hit.cache_creation_input_token_cost
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
  getAllChatModelEntries,
  refreshFromRemote,
  recommendModel,
}
