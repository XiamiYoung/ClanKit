/**
 * HistoryIndex — SQLite FTS5 based chat history index.
 *
 * Replaces the old ChatIndex (JSON keyword matching) with full-text search
 * powered by SQLite FTS5 trigram tokenizer. Supports:
 *   - BM25 ranking (much better than raw keyword counting)
 *   - CJK text via trigram tokenizer (no word segmentation needed)
 *   - Date range filtering (critical for "what did we talk about in October 2024")
 *   - Short CJK query fallback via LIKE when trigram can't match (< 3 chars)
 *
 * Storage: one SQLite DB per agent at {AGENT_MEMORY_DIR}/{agentId}/history.db
 */
const fs   = require('fs')
const path = require('path')
const { logger } = require('../logger')

let Database = null
function getDatabase() {
  if (!Database) Database = require('better-sqlite3')
  return Database
}

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT,
  sender TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS msg_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS msg_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;
`

// ── HistoryIndex Class ──────────────────────────────────────────────────────

class HistoryIndex {
  /**
   * @param {string} agentMemoryDir  Base directory: {DATA_DIR}/memory/agents/
   */
  constructor(agentMemoryDir) {
    this.agentMemoryDir = agentMemoryDir
    this._dbCache = new Map()  // agentId -> Database instance
  }

  /**
   * Get or create a SQLite database for an agent.
   */
  _getDb(agentId) {
    if (this._dbCache.has(agentId)) return this._dbCache.get(agentId)
    try {
      const dir = path.join(this.agentMemoryDir, agentId)
      fs.mkdirSync(dir, { recursive: true })

      const dbPath = path.join(dir, 'history.db')
      const BetterSqlite3 = getDatabase()
      const db = new BetterSqlite3(dbPath)

      // Enable WAL mode for better concurrent read/write
      db.pragma('journal_mode = WAL')
      db.exec(SCHEMA)

      this._dbCache.set(agentId, db)
      return db
    } catch (err) {
      logger.error('[HistoryIndex] _getDb error', { agentId, error: err.message })
      return null
    }
  }

  /**
   * Index a chat's messages for an agent.
   * Compatible with ChatIndex.indexChat() — drop-in replacement.
   *
   * @param {string} chatId
   * @param {Array<{role:string, content:string}>} messages
   * @param {string} agentId
   */
  indexChat(chatId, messages, agentId) {
    try {
      const db = this._getDb(agentId)
      if (!db) return

      const validMessages = messages.filter(
        m => (m.role === 'user' || m.role === 'assistant') &&
             typeof m.content === 'string' && m.content.trim()
      )
      if (validMessages.length === 0) return

      // Delete old entries for this chat (re-index)
      db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId)

      const insert = db.prepare(
        'INSERT INTO messages (chat_id, role, content, timestamp, sender) VALUES (?, ?, ?, ?, ?)'
      )
      const insertMany = db.transaction((msgs) => {
        for (const m of msgs) {
          // Convert Unix ms timestamp to "YYYY-MM-DD HH:mm:ss" for consistent date filtering
          let ts = null
          if (m.timestamp) {
            const d = new Date(typeof m.timestamp === 'number' ? m.timestamp : parseInt(m.timestamp))
            if (!isNaN(d.getTime())) {
              ts = d.toISOString().replace('T', ' ').slice(0, 19)
            }
          }
          insert.run(chatId, m.role, m.content.trim(), ts, m.role === 'user' ? 'user' : 'assistant')
        }
      })
      insertMany(validMessages)

      logger.debug('[HistoryIndex] indexed chat', { chatId, agentId, messages: validMessages.length })
    } catch (err) {
      logger.error('[HistoryIndex] indexChat error', { agentId, chatId, error: err.message })
    }
  }

  /**
   * Index imported history with preserved timestamps.
   * Each message stored as individual row with its original timestamp.
   *
   * @param {Array<{sender:string, content:string, timestamp?:string}>} messages
   * @param {string} agentId
   * @param {string} contactName
   */
  indexImportedHistory(messages, agentId, contactName) {
    try {
      const db = this._getDb(agentId)
      if (!db) return

      const chatId = 'imported-history'
      // Delete old imported data for re-index
      db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId)

      const name = contactName || 'Them'
      const insert = db.prepare(
        'INSERT INTO messages (chat_id, role, content, timestamp, sender) VALUES (?, ?, ?, ?, ?)'
      )
      const insertMany = db.transaction((msgs) => {
        for (const m of msgs) {
          if (!m.content || !m.content.trim()) continue
          const role = m.sender === 'me' ? 'user' : 'assistant'
          const sender = m.sender === 'me' ? 'Me' : name
          insert.run(chatId, role, m.content.trim(), m.timestamp || null, sender)
        }
      })
      insertMany(messages)

      logger.info('[HistoryIndex] indexed imported history', { agentId, messages: messages.length })
    } catch (err) {
      logger.error('[HistoryIndex] indexImportedHistory error', { agentId, error: err.message })
    }
  }

  /**
   * Check whether an agent has imported chat history indexed.
   * @param {string} agentId
   * @returns {boolean}
   */
  hasImportedHistory(agentId) {
    try {
      const db = this._getDb(agentId)
      if (!db) return false
      const row = db.prepare("SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = 'imported-history'").get()
      return (row?.cnt || 0) > 0
    } catch {
      return false
    }
  }

  /**
   * Get aggregate statistics for the imported history of an agent.
   * Used by AnalyzeAgentTool for comprehensive analysis.
   * @param {string} agentId
   * @returns {object|null}
   */
  getStats(agentId) {
    try {
      const db = this._getDb(agentId)
      if (!db) return null

      const totalRow = db.prepare("SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = 'imported-history'").get()
      const total = totalRow?.cnt || 0
      if (total === 0) return null

      const dateRow = db.prepare("SELECT MIN(timestamp) AS first, MAX(timestamp) AS last FROM messages WHERE chat_id = 'imported-history'").get()
      const senders = db.prepare("SELECT sender, COUNT(*) AS cnt FROM messages WHERE chat_id = 'imported-history' GROUP BY sender ORDER BY cnt DESC").all()
      const monthly = db.prepare(`
        SELECT substr(timestamp, 1, 7) AS month, sender, COUNT(*) AS cnt
        FROM messages
        WHERE chat_id = 'imported-history' AND timestamp IS NOT NULL
        GROUP BY month, sender
        ORDER BY month ASC
      `).all()
      const lengthRow = db.prepare("SELECT AVG(length(content)) AS avg_len, MAX(length(content)) AS max_len FROM messages WHERE chat_id = 'imported-history'").get()

      return {
        total_messages: total,
        date_range: { first: dateRow?.first || null, last: dateRow?.last || null },
        senders: senders.map(r => ({ sender: r.sender || 'Unknown', count: r.cnt })),
        monthly_activity: monthly.map(r => ({ month: r.month, sender: r.sender || 'Unknown', count: r.cnt })),
        avg_message_length: Math.round(lengthRow?.avg_len || 0),
        max_message_length: lengthRow?.max_len || 0,
        page_size: 150,
        total_pages: Math.ceil(total / 150),
      }
    } catch (err) {
      logger.error('[HistoryIndex] getStats error', { agentId, error: err.message })
      return null
    }
  }

  /**
   * Get paginated messages from imported history (chronological order).
   * Used by AnalyzeAgentTool to load all messages without token limit concern.
   * @param {string} agentId
   * @param {number} page     1-based page number
   * @param {number} pageSize messages per page (default 150)
   * @returns {object|null}
   */
  getPagedMessages(agentId, page = 1, pageSize = 150) {
    try {
      const db = this._getDb(agentId)
      if (!db) return null

      const totalRow = db.prepare("SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = 'imported-history'").get()
      const total = totalRow?.cnt || 0
      if (total === 0) return null

      const offset = (Math.max(1, page) - 1) * pageSize
      const rows = db.prepare(`
        SELECT content, timestamp, sender, created_at
        FROM messages
        WHERE chat_id = 'imported-history'
        ORDER BY timestamp ASC, created_at ASC
        LIMIT ? OFFSET ?
      `).all(pageSize, offset)

      return {
        page,
        total_pages: Math.ceil(total / pageSize),
        total_messages: total,
        messages: rows.map(r => ({
          time: r.timestamp || '',
          sender: r.sender || 'Unknown',
          content: r.content,
        })),
      }
    } catch (err) {
      logger.error('[HistoryIndex] getPagedMessages error', { agentId, error: err.message })
      return null
    }
  }

  /**
   * Load ALL imported messages as a flat array. Used when the dataset is small
   * enough to fit in a single LLM context window (< ~5000 messages).
   *
   * @param {string} agentId
   * @returns {Array<{content, timestamp, sender}>|null}
   */
  getAllMessages(agentId) {
    try {
      const db = this._getDb(agentId)
      if (!db) return null
      const rows = db.prepare(`
        SELECT content, timestamp, sender
        FROM messages
        WHERE chat_id = 'imported-history'
        ORDER BY timestamp ASC, created_at ASC
      `).all()
      if (rows.length === 0) return null
      return rows.map(r => ({
        content: r.content,
        timestamp: r.timestamp || '',
        sender: r.sender || 'Unknown',
      }))
    } catch (err) {
      logger.error('[HistoryIndex] getAllMessages error', { agentId, error: err.message })
      return null
    }
  }

  /**
   * Split imported history into conversation segments by silence gaps.
   * A gap > gapMinutes between consecutive messages = new segment.
   * Returns segments as arrays of messages, each segment a complete conversation.
   *
   * @param {string} agentId
   * @param {number} [gapMinutes=30]  Silence threshold for segment boundary
   * @returns {Array<Array<{content, timestamp, sender}>>|null}
   */
  getConversationSegments(agentId, gapMinutes = 30) {
    try {
      const db = this._getDb(agentId)
      if (!db) return null

      const rows = db.prepare(`
        SELECT content, timestamp, sender
        FROM messages
        WHERE chat_id = 'imported-history'
        ORDER BY timestamp ASC, created_at ASC
      `).all()
      if (rows.length === 0) return null

      const gapMs = gapMinutes * 60 * 1000
      const segments = []
      let current = []

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const msg = { content: r.content, timestamp: r.timestamp || '', sender: r.sender || 'Unknown' }

        if (current.length > 0 && r.timestamp) {
          const prevTs = current[current.length - 1].timestamp
          if (prevTs) {
            const prev = new Date(prevTs).getTime()
            const curr = new Date(r.timestamp).getTime()
            if (!isNaN(prev) && !isNaN(curr) && (curr - prev) > gapMs) {
              segments.push(current)
              current = []
            }
          }
        }
        current.push(msg)
      }
      if (current.length > 0) segments.push(current)

      return segments
    } catch (err) {
      logger.error('[HistoryIndex] getConversationSegments error', { agentId, error: err.message })
      return null
    }
  }

  /**
   * Get a stratified sample of messages for analysis — much faster than loading
   * all messages. Returns classified-style buckets via SQL, capped at ~350 total.
   *
   * @param {string} agentId
   * @returns {{ long: Array, conflict: Array, sweet: Array, recent: Array, strided: Array, totalMessages: number } | null}
   */
  getSampledMessages(agentId) {
    try {
      const db = this._getDb(agentId)
      if (!db) return null

      const totalRow = db.prepare("SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = 'imported-history'").get()
      const total = totalRow?.cnt || 0
      if (total === 0) return null

      // Long messages from "them" (>= 50 chars)
      const long = db.prepare(`
        SELECT content, timestamp, sender FROM messages
        WHERE chat_id = 'imported-history' AND sender != 'Me' AND length(content) >= 50
        ORDER BY length(content) DESC LIMIT 30
      `).all()

      // Conflict keyword matches (both sides for context)
      const conflict = db.prepare(`
        SELECT content, timestamp, sender FROM messages
        WHERE chat_id = 'imported-history'
          AND (content LIKE '%生气%' OR content LIKE '%吵%' OR content LIKE '%算了%' OR content LIKE '%随便%'
               OR content LIKE '%分手%' OR content LIKE '%烦%' OR content LIKE '%hate%' OR content LIKE '%angry%'
               OR content LIKE '%fight%' OR content LIKE '%upset%' OR content LIKE '%whatever%')
        ORDER BY timestamp DESC LIMIT 20
      `).all()

      // Sweet / affectionate matches
      const sweet = db.prepare(`
        SELECT content, timestamp, sender FROM messages
        WHERE chat_id = 'imported-history'
          AND (content LIKE '%喜欢%' OR content LIKE '%爱你%' OR content LIKE '%想你%' OR content LIKE '%宝%'
               OR content LIKE '%亲爱%' OR content LIKE '%love%' OR content LIKE '%miss you%'
               OR content LIKE '%baby%' OR content LIKE '%❤%')
        ORDER BY timestamp DESC LIMIT 20
      `).all()

      // Most recent 50 short messages from "them"
      const recent = db.prepare(`
        SELECT content, timestamp, sender FROM messages
        WHERE chat_id = 'imported-history' AND sender != 'Me' AND length(content) < 50
        ORDER BY timestamp DESC, created_at DESC LIMIT 50
      `).all()

      // Uniformly strided across the full timeline — skip first and last 5% for diversity
      const stride = Math.max(1, Math.floor(total / 200))
      const strided = db.prepare(`
        SELECT content, timestamp, sender FROM messages
        WHERE chat_id = 'imported-history' AND rowid % ? = 0
        ORDER BY timestamp ASC
        LIMIT 200
      `).all(stride)

      return {
        long: long.map(r => ({ content: r.content, timestamp: r.timestamp, sender: r.sender === 'Me' ? 'me' : 'them' })),
        conflict: conflict.map(r => ({ content: r.content, timestamp: r.timestamp, sender: r.sender === 'Me' ? 'me' : 'them' })),
        sweet: sweet.map(r => ({ content: r.content, timestamp: r.timestamp, sender: r.sender === 'Me' ? 'me' : 'them' })),
        recent: recent.map(r => ({ content: r.content, timestamp: r.timestamp, sender: r.sender === 'Me' ? 'me' : 'them' })),
        strided: strided.map(r => ({ content: r.content, timestamp: r.timestamp, sender: r.sender === 'Me' ? 'me' : 'them' })),
        totalMessages: total,
      }
    } catch (err) {
      logger.error('[HistoryIndex] getSampledMessages error', { agentId, error: err.message })
      return null
    }
  }

  /**
   * Search indexed history for relevant context.
   *
   * @param {string} query        Search keywords (can be empty if using date range)
   * @param {string} agentId      Agent to search
   * @param {number} topK         Max results (default 5)
   * @param {object} opts         { excludeChatId, dateFrom, dateTo }
   * @returns {Array<{text:string, chatId:string, updatedAt:number}>}
   */
  search(query, agentId, topK = 5, { excludeChatId, dateFrom, dateTo } = {}) {
    try {
      const db = this._getDb(agentId)
      if (!db) return []

      if (dateFrom && dateTo) {
        // Try date + text first, fall back to date-only if no results
        const results = this._searchByDate(db, dateFrom, dateTo, query, excludeChatId, topK)
        if (results.length > 0) return results
        // Fall back to date-only (query may not match any content)
        if (query) return this._searchByDate(db, dateFrom, dateTo, '', excludeChatId, topK)
        return results
      }
      if (!query || query.trim().length < 2) return []
      return this._searchFts(db, query, excludeChatId, topK)
    } catch (err) {
      logger.error('[HistoryIndex] search error', { agentId, error: err.message })
      return []
    }
  }

  /**
   * Date-filtered search: find messages within a date range.
   * If cleanedQuery is non-empty, also filter by FTS or LIKE.
   */
  _searchByDate(db, dateFrom, dateTo, cleanedQuery, excludeChatId, topK) {
    let sql, params

    const excludeClause = excludeChatId ? 'AND m.chat_id != ?' : ''

    if (cleanedQuery && cleanedQuery.length >= 3) {
      sql = `SELECT m.id, m.content, m.chat_id, m.timestamp, m.sender, m.created_at
             FROM messages_fts f
             JOIN messages m ON f.rowid = m.id
             WHERE f.content MATCH ?
               AND m.timestamp BETWEEN ? AND ?
               ${excludeClause}
             ORDER BY m.timestamp ASC
             LIMIT ?`
      params = [cleanedQuery, dateFrom, dateTo]
      if (excludeChatId) params.push(excludeChatId)
      params.push(topK * 3)
    } else if (cleanedQuery && cleanedQuery.length > 0) {
      sql = `SELECT m.id, m.content, m.chat_id, m.timestamp, m.sender, m.created_at
             FROM messages m
             WHERE m.timestamp BETWEEN ? AND ?
               AND m.content LIKE ?
               ${excludeClause}
             ORDER BY m.timestamp ASC
             LIMIT ?`
      params = [dateFrom, dateTo, `%${cleanedQuery}%`]
      if (excludeChatId) params.push(excludeChatId)
      params.push(topK * 3)
    } else {
      sql = `SELECT m.id, m.content, m.chat_id, m.timestamp, m.sender, m.created_at
             FROM messages m
             WHERE m.timestamp BETWEEN ? AND ?
               ${excludeClause}
             ORDER BY m.timestamp ASC
             LIMIT ?`
      params = [dateFrom, dateTo]
      if (excludeChatId) params.push(excludeChatId)
      params.push(topK * 3)
    }

    const rows = db.prepare(sql).all(...params)
    return this._formatResults(rows, topK)
  }

  /**
   * Full-text search without date filter.
   * Uses FTS5 trigram for queries >= 3 chars, LIKE fallback for shorter.
   */
  _searchFts(db, query, excludeChatId, topK) {
    const trimmed = query.trim()
    if (trimmed.length < 2) return []

    const excludeClause = excludeChatId ? 'AND m.chat_id != ?' : ''
    let rows = []

    if (trimmed.length >= 3) {
      // Extract CJK keywords (2-4 char segments) for better matching
      const keywords = this._extractKeywords(trimmed)

      for (const kw of keywords) {
        try {
          const sql = `SELECT m.id, m.content, m.chat_id, m.timestamp, m.sender, m.created_at
                       FROM messages_fts f
                       JOIN messages m ON f.rowid = m.id
                       WHERE f.content MATCH ?
                         ${excludeClause}
                       ORDER BY rank
                       LIMIT ?`
          const params = [kw]
          if (excludeChatId) params.push(excludeChatId)
          params.push(topK * 3)
          const kwRows = db.prepare(sql).all(...params)
          if (kwRows.length > 0) {
            // Merge without duplicates
            const seenIds = new Set(rows.map(r => r.id))
            for (const r of kwRows) { if (!seenIds.has(r.id)) rows.push(r) }
          }
        } catch (ftsErr) {
          logger.debug('[HistoryIndex] FTS match failed for keyword', { kw, error: ftsErr.message })
        }
      }

      // LIKE fallback with individual keywords if FTS found nothing
      if (rows.length === 0) {
        for (const kw of keywords) {
          if (kw.length < 2) continue
          const kwRows = this._likeFallback(db, kw, excludeChatId, topK)
          const seenIds = new Set(rows.map(r => r.id))
          for (const r of kwRows) { if (!seenIds.has(r.id)) rows.push(r) }
          if (rows.length >= topK * 3) break
        }
      }
    } else {
      rows = this._likeFallback(db, trimmed, excludeChatId, topK)
    }

    return this._formatResults(rows, topK)
  }

  /**
   * Extract meaningful keywords from a query for FTS search.
   * Splits CJK text into 2-4 char segments, filters stop patterns.
   * Returns the full query + extracted keywords for multi-term search.
   */
  _extractKeywords(query) {
    const stopPatterns = /^(我们|你们|他们|什么|怎么|如何|是否|是不是|有没有|聊过|聊了|说过|说了|谈过|谈了|关于|吗|呢|吧|的|了|过|不|没|有)$/
    const keywords = [query]  // try full query first

    // Extract CJK word segments (2-4 chars)
    const cjkChars = query.replace(/[\s\p{P}a-zA-Z0-9]+/gu, '')
    if (cjkChars.length >= 2) {
      for (let len = Math.min(4, cjkChars.length); len >= 2; len--) {
        for (let i = 0; i <= cjkChars.length - len; i++) {
          const seg = cjkChars.slice(i, i + len)
          if (!stopPatterns.test(seg) && !keywords.includes(seg)) {
            keywords.push(seg)
          }
        }
      }
    }

    // Also add space-separated non-CJK tokens
    const latinTokens = query.match(/[a-zA-Z]{3,}/g)
    if (latinTokens) {
      for (const t of latinTokens) { if (!keywords.includes(t)) keywords.push(t) }
    }

    return keywords
  }

  /**
   * LIKE fallback for short queries that can't use FTS5 trigram.
   */
  _likeFallback(db, query, excludeChatId, topK) {
    const excludeClause = excludeChatId ? 'AND m.chat_id != ?' : ''
    const sql = `SELECT m.id, m.content, m.chat_id, m.timestamp, m.sender, m.created_at
                 FROM messages m
                 WHERE m.content LIKE ?
                   ${excludeClause}
                 ORDER BY m.created_at DESC
                 LIMIT ?`
    const params = [`%${query}%`]
    if (excludeChatId) params.push(excludeChatId)
    params.push(topK * 3)
    return db.prepare(sql).all(...params)
  }

  /**
   * Format raw DB rows into the return shape expected by agentLoop.
   * Groups messages by chat_id into conversation snippets.
   */
  _formatResults(rows, topK) {
    if (rows.length === 0) return []

    const groups = new Map()
    for (const row of rows) {
      const key = row.chat_id
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(row)
    }

    const results = []
    for (const [chatId, msgs] of groups) {
      const text = msgs
        .slice(0, 15)
        .map(m => {
          const ts = m.timestamp ? `[${m.timestamp}]` : ''
          const sender = m.sender || (m.role === 'user' ? 'User' : 'Assistant')
          return `${ts} ${sender}: ${m.content}`
        })
        .join('\n')

      results.push({
        text,
        chatId,
        updatedAt: msgs[0].created_at ? msgs[0].created_at * 1000 : Date.now(),
      })
    }

    results.sort((a, b) => b.updatedAt - a.updatedAt)
    return results.slice(0, topK)
  }

  /**
   * Return set of already-indexed chatIds for an agent.
   * Compatible with ChatIndex.getIndexedChatIds().
   */
  getIndexedChatIds(agentId) {
    try {
      const db = this._getDb(agentId)
      if (!db) return new Set()

      const rows = db.prepare('SELECT DISTINCT chat_id FROM messages').all()
      return new Set(rows.map(r => r.chat_id))
    } catch (err) {
      logger.error('[HistoryIndex] getIndexedChatIds error', { agentId, error: err.message })
      return new Set()
    }
  }
}

module.exports = { HistoryIndex }
