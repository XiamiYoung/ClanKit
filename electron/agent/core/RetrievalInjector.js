/**
 * RetrievalInjector — FTS5 keyword recall of older history relevant to the
 * current query. Reuses ChatStore.searchFulltext (bm25, trigram tokenizer).
 *
 * messages_fts uses the `trigram` tokenizer, so matching is substring-based on
 * 3-char grams. A whole-sentence query never matches (the full phrase rarely
 * appears verbatim), and CJK text has no whitespace to split on. So we build
 * the query from 3-char windows (CJK runs) and whole words (ASCII >=3), OR-ed.
 *
 * Messages at the assembler are stripped to { role, content } (no ids), so the
 * verbatim-window dedup is by normalized content, not id.
 */

const FTS_LIMIT = 12
const MAX_TERMS = 24
// CJK / kana / hangul — scripts written without spaces, needing window tokenizing.
const CJK_RE = /[㐀-鿿぀-ヿ가-힯]/

/** Strip a leading "[Name]: " speaker prefix and trim. */
function normalizeContent(s) {
  if (!s || typeof s !== 'string') return ''
  return s.replace(/^\[[^\]]+\]:\s*/, '').trim()
}

/**
 * Build a safe FTS5 MATCH expression for the trigram tokenizer.
 * Each term is quoted (so FTS operators / quotes / `*` cannot inject) and OR-ed.
 * Terms shorter than 3 chars are dropped (trigram cannot match them).
 */
function sanitizeFtsQuery(text) {
  if (!text || typeof text !== 'string') return ''
  // Keep only letters (incl. CJK) and digits; everything else becomes a separator.
  const tokens = text.replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(Boolean)
  const terms = []
  const seen = new Set()
  const push = (t) => { if (t.length >= 3 && !seen.has(t)) { seen.add(t); terms.push(t) } }
  for (const tok of tokens) {
    if (CJK_RE.test(tok)) {
      if (tok.length <= 3) push(tok)
      else for (let i = 0; i + 3 <= tok.length; i++) push(tok.slice(i, i + 3))
    } else {
      push(tok)
    }
  }
  if (terms.length === 0) return ''
  return terms.slice(0, MAX_TERMS).map(t => `"${t}"`).join(' OR ')
}

async function retrieve({ chatId, query, excludeContents, budget, chatStore }) {
  const ftsQuery = sanitizeFtsQuery(query)
  if (!ftsQuery) return { retrievalBlock: '' }

  let hits
  try {
    hits = chatStore.searchFulltext(ftsQuery, { chatId, limit: FTS_LIMIT })
  } catch {
    return { retrievalBlock: '' }
  }
  const exclude = excludeContents || new Set()
  const relevant = (hits || []).filter(m =>
    typeof m.content === 'string' && m.content && !exclude.has(normalizeContent(m.content)))

  // budget is in tokens; compare token estimates, not raw char length.
  const lines = []
  let usedTokens = 0
  for (const m of relevant) {
    const who = m.role === 'user' ? (m.agentName || 'User') : (m.agentName || 'Assistant')
    const line = `${who}: ${m.content}`
    const lineTokens = Math.ceil(line.length / 4)
    if (usedTokens + lineTokens > budget) break
    lines.push(line)
    usedTokens += lineTokens
  }
  if (lines.length === 0) return { retrievalBlock: '' }
  return { retrievalBlock: lines.join('\n') }
}

module.exports = { retrieve, sanitizeFtsQuery, normalizeContent }
