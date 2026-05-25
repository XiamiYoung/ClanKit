/**
 * Summarizer — strategy for evicted history.
 *   Anthropic API path → { strategy: 'native' } (in-loop applyCompaction handles it).
 *   Everything else (openai-compat, google) → incremental self-built text summary.
 *
 * Incremental: only turns newer than the persisted uptoTs are sent to the
 * utility model; the result is merged into the stored running summary.
 */

function _isNativeProvider(providerType) {
  // openrouter is routed through AnthropicClient and supports native compaction.
  return providerType === 'anthropic' || providerType === 'openrouter'
}

function _maxTs(msgs) {
  return msgs.reduce((mx, m) => Math.max(mx, m.timestamp || m.createdAt || 0), 0)
}

function _renderForSummary(msgs) {
  return msgs.map(m => {
    const who = m.role === 'user' ? (m.agentName ? m.agentName : 'User') : (m.agentName || 'Assistant')
    return `${who}: ${typeof m.content === 'string' ? m.content : ''}`
  }).join('\n')
}

const SUMMARY_SYSTEM =
  'You compress older conversation turns into a dense factual summary. ' +
  'Preserve decisions, facts, names, numbers, open questions, and commitments. ' +
  'Omit pleasantries. Output the summary only, no preamble.'

async function ensureSummary({ chatId, agentKey, providerType, evicted, chatStore, utilityModelCaller }) {
  if (_isNativeProvider(providerType)) return { strategy: 'native' }

  const prior = chatStore.getRunningSummary(chatId, agentKey) // { text, uptoTs } | null
  const priorText = prior?.text || ''
  const priorTs = prior?.uptoTs || 0

  const fresh = (evicted || []).filter(m => (m.timestamp || m.createdAt || 0) > priorTs)
  if (fresh.length === 0) {
    return { strategy: 'text', summaryBlock: priorText }
  }

  const prompt =
    (priorText ? `Existing summary so far:\n${priorText}\n\n` : '') +
    `New older turns to fold into the summary:\n${_renderForSummary(fresh)}`

  let merged
  try {
    merged = await utilityModelCaller({ system: SUMMARY_SYSTEM, prompt })
  } catch {
    // Keep the prior summary; do not advance uptoTs — retried next round.
    return { strategy: 'text', summaryBlock: priorText }
  }

  const newUptoTs = Math.max(priorTs, _maxTs(fresh))
  chatStore.saveRunningSummary(chatId, agentKey, { text: merged, uptoTs: newUptoTs })
  return { strategy: 'text', summaryBlock: merged }
}

module.exports = { ensureSummary, _isNativeProvider }
