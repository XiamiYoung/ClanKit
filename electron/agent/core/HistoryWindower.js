/**
 * HistoryWindower — token-aware selection of recent verbatim turns.
 * Replaces sliceToLastNTurns. A "turn" starts at a role:'user' message and
 * includes all following assistant/tool messages until the next user message.
 */

/** Group messages into turns: each turn begins at a 'user' message. */
function _toTurns(messages) {
  const turns = []
  let cur = null
  for (const m of messages) {
    if (m.role === 'user') {
      if (cur) turns.push(cur)
      cur = [m]
    } else {
      if (!cur) cur = [m]   // leading non-user messages form their own group
      else cur.push(m)
    }
  }
  if (cur) turns.push(cur)
  return turns
}

/**
 * @returns {{ kept: object[], evicted: object[] }}
 */
function windowHistory(messages, verbatimBudget, { estimateTokens }) {
  if (!messages || messages.length === 0) return { kept: [], evicted: [] }
  const turns = _toTurns(messages)
  const keptTurns = []
  let used = 0
  // Walk turns newest → oldest, accumulating until the next turn would overflow.
  for (let i = turns.length - 1; i >= 0; i--) {
    const turnTokens = turns[i].reduce((s, m) => s + estimateTokens(m), 0)
    if (keptTurns.length === 0) {
      keptTurns.unshift(turns[i])   // always keep the last turn
      used += turnTokens
      continue
    }
    if (used + turnTokens > verbatimBudget) break
    keptTurns.unshift(turns[i])
    used += turnTokens
  }
  const kept = keptTurns.flat()
  const keptCount = kept.length
  const evicted = messages.slice(0, messages.length - keptCount)
  return { kept, evicted }
}

module.exports = { windowHistory, _toTurns }
