/**
 * ChatIndex — lightweight keyword index of past chat conversations.
 *
 * Stores per-agent JSON snippet files in:
 *   {DATA_DIR}/memory/agents/{agentId}/index/{chatId}.json
 *
 * Each file: { chatId, agentId, updatedAt, snippets: [{text, idx, lower}] }
 *
 * Search: keyword matching across all snippets, returns top-K by relevance.
 * No external dependencies — pure Node.js.
 */
const fs   = require('fs')
const path = require('path')
const { logger } = require('../logger')

const SNIPPET_MAX_CHARS = 500   // max chars per snippet
const SNIPPET_OVERLAP   = 50    // overlap between snippets
const CHUNK_SIZE        = 400   // chars per chunk

/**
 * Split text into overlapping chunks.
 */
function chunkText(text, size = CHUNK_SIZE, overlap = SNIPPET_OVERLAP) {
  const chunks = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + size))
    i += size - overlap
    if (i >= text.length) break
  }
  return chunks
}

/**
 * Extract keywords from a query (remove stop words, lowercase).
 */
function extractKeywords(query) {
  const stopWords = new Set([
    'the','a','an','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could','should',
    'may','might','shall','can','need','dare','ought','used',
    'i','me','my','we','our','you','your','he','she','it','they','them',
    'this','that','these','those','what','which','who','whom','how','when',
    'where','why','and','or','but','if','in','on','at','to','for','of',
    'with','by','from','about','as','into','through','during','before',
    'after','above','below','up','down','out','off','over','under',
    'not','no','just','also','very','really','much','well','too','only',
    'all','some','any','every','each','both','few','more','most','other',
    'like','want','know','think','say','said','tell','told','make','get',
    'got','let','help','please','thanks','thank','sure','okay','yes',
    // Chinese stop words
    '的','了','是','在','我','你','他','她','它','我们','你们','他们',
    '这','那','这个','那个','什么','怎么','如何','为什么','哪个','哪里',
    '和','或','但','如果','因为','所以','虽然','不','没','没有','有',
    '很','非常','就','也','都','还','又','再','能','可以','会','要',
    '想','说','看','做','用','让','给','把','被','到','从','对',
    '请','帮','帮我','一下','一个','一些','可以吗','好的','好吧',
  ])
  return query
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(w => w.length > 2 && !stopWords.has(w))
}

class ChatIndex {
  constructor(agentMemoryDir) {
    this.agentMemoryDir = agentMemoryDir  // {DATA_DIR}/memory/agents/
  }

  _indexDir(agentId) {
    return path.join(this.agentMemoryDir, agentId, 'index')
  }

  _indexFile(agentId, chatId) {
    return path.join(this._indexDir(agentId), `${chatId}.json`)
  }

  /**
   * Index a chat's messages for an agent.
   * Extracts user + assistant text, stores as keyword-searchable snippets.
   */
  indexChat(chatId, messages, agentId) {
    try {
      const indexDir = this._indexDir(agentId)
      fs.mkdirSync(indexDir, { recursive: true })

      const text = messages
        .filter(m => (m.role === 'user' || m.role === 'assistant') &&
                      typeof m.content === 'string' && m.content.trim())
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`)
        .join('\n')

      if (!text.trim()) return

      const chunks = chunkText(text)
      const snippets = chunks.map((chunk, idx) => ({
        text:  chunk.slice(0, SNIPPET_MAX_CHARS),
        idx,
        lower: chunk.toLowerCase(),   // pre-lowercased for fast search
      }))

      const entry = {
        chatId,
        agentId,
        updatedAt: Date.now(),
        snippets,
      }

      fs.writeFileSync(this._indexFile(agentId, chatId), JSON.stringify(entry), 'utf8')
      logger.debug('[ChatIndex] indexed', { chatId, agentId, snippets: snippets.length })
    } catch (err) {
      logger.error('[ChatIndex] indexChat error', err.message)
    }
  }

  /**
   * Search indexed chats for an agent by keyword query.
   * Returns top-K relevant snippets as { text, chatId, updatedAt } objects.
   * Options:
   *   excludeChatId — skip results from this chat (e.g. the current active chat)
   */
  search(query, agentId, topK = 5, { excludeChatId } = {}) {
    try {
      const indexDir = this._indexDir(agentId)
      if (!fs.existsSync(indexDir)) return []

      const keywords = extractKeywords(query)
      if (keywords.length < 2) return []  // need at least 2 meaningful keywords

      const files = fs.readdirSync(indexDir).filter(f => f.endsWith('.json'))
      const scored = []

      // Minimum match ratio — at least 40% of keywords must hit for relevance
      const minMatchRatio = 0.4
      const minMatchCount = Math.max(2, Math.ceil(keywords.length * minMatchRatio))

      for (const file of files) {
        try {
          const entry = JSON.parse(fs.readFileSync(path.join(indexDir, file), 'utf8'))
          if (excludeChatId && entry.chatId === excludeChatId) continue
          for (const snippet of entry.snippets) {
            let score = 0
            for (const kw of keywords) {
              if (snippet.lower.includes(kw)) score++
            }
            if (score >= minMatchCount) {
              scored.push({
                text:      snippet.text,
                score,
                ratio:     score / keywords.length,
                chatId:    entry.chatId,
                updatedAt: entry.updatedAt,
              })
            }
          }
        } catch { /* skip corrupt files */ }
      }

      // Sort by match ratio desc, then score desc, then recency desc
      scored.sort((a, b) => b.ratio - a.ratio || b.score - a.score || b.updatedAt - a.updatedAt)

      // Deduplicate by chatId — keep the highest-scoring snippet per chat
      const seen = new Set()
      const deduped = []
      for (const s of scored) {
        if (!seen.has(s.chatId)) {
          seen.add(s.chatId)
          deduped.push(s)
        }
      }

      return deduped.slice(0, topK).map(s => ({
        text:      s.text,
        chatId:    s.chatId,
        updatedAt: s.updatedAt,
      }))
    } catch (err) {
      logger.error('[ChatIndex] search error', err.message)
      return []
    }
  }

  /**
   * Return set of already-indexed chatIds for an agent.
   */
  getIndexedChatIds(agentId) {
    try {
      const indexDir = this._indexDir(agentId)
      if (!fs.existsSync(indexDir)) return new Set()
      return new Set(
        fs.readdirSync(indexDir)
          .filter(f => f.endsWith('.json'))
          .map(f => f.replace('.json', ''))
      )
    } catch { return new Set() }
  }
}

module.exports = { ChatIndex }
