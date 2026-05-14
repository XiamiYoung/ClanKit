// Pure helpers for the per-agent context window bars rendered above each
// chat. Kept free of Vue/Pinia/Electron so they unit-test cleanly.
//
// Inputs:
//   chat              — the active chat (or null). Reads isGroupChat,
//                       groupAgentIds, systemAgentId, perAgentContextMetrics.
//   sharedMetrics     — fallback for the solo case (effectiveInputTokens,
//                       maxTokens, percentage). For solo chats this is the
//                       only data source.
//   resolveName(id)   — agent display-name lookup (caller wires to agentsStore).
//   resolveAvatar(id) — agent avatar data-URI lookup (or null when missing).
//   defaultAgentId    — solo fallback when chat has no systemAgentId.
//   paletteRgb(idx)   — palette rgb for the group rotation.
//   soloRgb           — chat-tree rgb string for solo bar.
//   threshold         — { warn = 65, danger = 85 } (percent).
//   thresholdColor(p) — overrides fill color above the threshold; defaults
//                       to the same red/orange used by the existing bar.

const DEFAULT_DANGER = '#FF3B30'
const DEFAULT_WARN   = '#FF9500'

function _effInput(m) {
  if (!m) return 0
  return m.effectiveInputTokens
    ?? ((m.inputTokens || 0) + (m.cacheCreationInputTokens || 0) + (m.cacheReadInputTokens || 0))
}

function _defaultFill(pct, baseRgb) {
  if (pct > 85) return DEFAULT_DANGER
  if (pct > 65) return DEFAULT_WARN
  return 'rgb(' + baseRgb + ')'
}

export function computeContextBars({
  chat,
  sharedMetrics = {},
  resolveName = () => 'Unknown',
  resolveAvatar = () => null,
  defaultAgentId = null,
  paletteRgb,
  soloRgb = '37, 99, 235',
  fillResolver = _defaultFill,
} = {}) {
  if (!chat) return { bars: [], inputSum: 0, isGroup: false }
  const isGroup = !!chat.isGroupChat
    && Array.isArray(chat.groupAgentIds)
    && chat.groupAgentIds.length > 0
  const perAgent = chat.perAgentContextMetrics || {}

  if (isGroup) {
    const bars = chat.groupAgentIds.map((agentId, idx) => {
      const m = perAgent[agentId] || null
      const effInput = _effInput(m)
      const maxTokens = m?.maxTokens || 0
      const pct = maxTokens ? Math.round((effInput / maxTokens) * 100) : 0
      const baseRgb = paletteRgb(idx)
      return {
        agentId,
        agentName: resolveName(agentId) || 'Unknown',
        agentAvatar: resolveAvatar(agentId) || null,
        agentIdx: idx,
        inputTokens: effInput,
        maxTokens,
        pct,
        baseRgb,
        fillColor: fillResolver(pct, baseRgb),
      }
    })
    // First turn before any agent has emitted a context_update: per-agent
    // metrics are all unreported, so inputSum sums to 0. Fall back to the
    // shared bucket (which the backend updates eagerly on the first request)
    // so the header doesn't flash "0 in" while the chat is clearly spending.
    const perAgentSum = bars.reduce((s, b) => s + (b.inputTokens || 0), 0)
    const noneReported = bars.every(b => !b.inputTokens && !b.maxTokens)
    const inputSum = (noneReported && _effInput(sharedMetrics) > 0)
      ? _effInput(sharedMetrics)
      : perAgentSum
    return { bars, inputSum, isGroup: true }
  }

  // Solo
  const cm = sharedMetrics || {}
  const effInput = _effInput(cm)
  const maxTokens = cm.maxTokens || 0
  const pct = cm.percentage ?? (maxTokens ? Math.round((effInput / maxTokens) * 100) : 0)
  const agentId = chat.systemAgentId || defaultAgentId || null
  const baseRgb = soloRgb
  return {
    bars: [{
      agentId,
      agentName: agentId ? (resolveName(agentId) || 'Assistant') : 'Assistant',
      agentAvatar: agentId ? (resolveAvatar(agentId) || null) : null,
      agentIdx: 0,
      inputTokens: effInput,
      maxTokens,
      pct,
      baseRgb,
      fillColor: fillResolver(pct, baseRgb),
    }],
    inputSum: effInput,
    isGroup: false,
  }
}
