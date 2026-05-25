/**
 * RetrievalInjector — FTS5 keyword recall of older history relevant to the
 * current query. Reuses ChatStore.searchFulltext (bm25). Filters out messages
 * already in the verbatim window (excludeIds) and caps to a char budget.
 */

const FTS_LIMIT = 12

/**
 * Turn arbitrary user text into a safe FTS5 MATCH expression: quote each term
 * (so FTS operators like AND/OR/NEAR and `*`/`"` cannot inject), drop empties.
 */
function sanitizeFtsQuery(text) {
  if (!text || typeof text !== 'string') return ''
  const terms = text
    .replace(/["*]/g, ' ')       // strip quotes and prefix-star
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
  if (terms.length === 0) return ''
  return terms.map(t => `"${t}"`).join(' ')
}

async function retrieve({ chatId, query, excludeIds, budget, chatStore }) {
  const ftsQuery = sanitizeFtsQuery(query)
  if (!ftsQuery) return { retrievalBlock: '' }

  let hits
  try {
    hits = chatStore.searchFulltext(ftsQuery, { chatId, limit: FTS_LIMIT })
  } catch {
    return { retrievalBlock: '' }
  }
  const exclude = excludeIds || new Set()
  const relevant = (hits || []).filter(m => !exclude.has(m.id) && typeof m.content === 'string' && m.content)
  if (relevant.length === 0) return { retrievalBlock: '' }

  const lines = []
  let used = 0
  for (const m of relevant) {
    const who = m.role === 'user' ? (m.agentName || 'User') : (m.agentName || 'Assistant')
    const line = `${who}: ${m.content}`
    if (used + line.length > budget) break
    lines.push(line)
    used += line.length
  }
  if (lines.length === 0) return { retrievalBlock: '' }
  return { retrievalBlock: lines.join('\n') }
}

module.exports = { retrieve, sanitizeFtsQuery }
