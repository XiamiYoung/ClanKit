/**
 * Crude CJS token estimator. Matches the existing length/4 heuristic used
 * throughout agentLoop.js. Deliberately conservative — budgeting only needs a
 * rough upper-ish bound. Injected into windowing/budget modules so it can be
 * swapped for a real tokenizer later without touching them.
 */
function estimateTokens(text) {
  if (!text) return 0
  const s = typeof text === 'string' ? text : JSON.stringify(text)
  return Math.ceil(s.length / 4)
}

/** Estimate tokens for a whole message object (role + content + segments). */
function estimateMessageTokens(msg) {
  if (!msg) return 0
  return estimateTokens(JSON.stringify(msg))
}

module.exports = { estimateTokens, estimateMessageTokens }
