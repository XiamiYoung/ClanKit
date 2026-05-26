/**
 * BudgetResolver — resolves the token budget for a (provider, model).
 *
 * Priority chain: known window → learned ceiling (from a prior
 * context_length_exceeded) → provider-aware fallback. The learned cache is
 * module-level so self-correction is shared across AgentLoop instances within
 * a session; durable persistence is handled by the injected callback.
 */
const SPLIT = { verbatim: 0.50, summary: 0.25, retrieval: 0.15, headroom: 0.10 }
const FALLBACK_DEFAULT = 128000

// modelId -> learned ceiling (tokens). Module-level: shared across the session.
const _learned = new Map()

function _resetLearned() { _learned.clear() }

/** Provider-aware fallback. Extends electron/ipc/agent.js::_fallbackContextWindow. */
function fallbackWindow(modelId, providerType) {
  const m = (modelId || '').toLowerCase()
  if (m.includes('claude') || providerType === 'anthropic') {
    if (m.includes('haiku')) return 200000
    return 1000000
  }
  return FALLBACK_DEFAULT
}

function resolveBudget({ modelId, providerType, modelContextWindow }) {
  let window, source
  if (modelContextWindow) {
    window = modelContextWindow; source = 'known'
  } else if (_learned.has(modelId)) {
    window = _learned.get(modelId); source = 'learned'
  } else {
    window = fallbackWindow(modelId, providerType); source = 'fallback'
  }
  return {
    window, source,
    verbatimBudget:   Math.round(window * SPLIT.verbatim),
    summaryReserve:   Math.round(window * SPLIT.summary),
    retrievalReserve: Math.round(window * SPLIT.retrieval),
    headroom:         Math.round(window * SPLIT.headroom),
  }
}

/**
 * Record a learned ceiling from a context_length_exceeded overflow. Keeps the
 * smallest observed ceiling. Invokes persist(modelId, ceiling) for durable
 * write-back (config.json) when provided.
 */
function learnFromOverflow(modelId, ceiling, persist) {
  if (!modelId || !ceiling) return
  const prev = _learned.get(modelId)
  const next = prev ? Math.min(prev, ceiling) : ceiling
  _learned.set(modelId, next)
  if (typeof persist === 'function') {
    try { persist(modelId, next) } catch { /* persistence is best-effort */ }
  }
}

module.exports = { resolveBudget, learnFromOverflow, fallbackWindow, _resetLearned }
