/**
 * ChatStore — SQLite-backed store for chats and messages.
 *
 * Single DB at {DATA_DIR}/chats.db. Schema version tracked via
 * PRAGMA user_version = 1. WAL mode. Singleton per Electron main process.
 *
 * Lazy initialization: better-sqlite3 only required on first DB call.
 * Pure helpers (rowTo* / *ToRow / serializeJsonField / extractSearchText) are
 * unit-testable without the native binding.
 *
 * Mirrors AgentStore + TaskStore + MemoryStore patterns.
 *
 * Schema highlights:
 *   - segments stored as JSON column on each message row (heterogeneous types,
 *     read/written wholesale, never queried by sub-field)
 *   - text_for_search column extracted JS-side from text segments at write time
 *   - messages_fts virtual FTS5 with trigram tokenizer for CJK; trigger keeps
 *     it in sync with messages table
 */
const path = require('path')
const fs = require('fs')
const { logger } = require('../logger')

let _Database = null
function _getDb() {
  if (!_Database) _Database = require('better-sqlite3')
  return _Database
}

const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chats (
  id                              TEXT PRIMARY KEY,
  title                           TEXT NOT NULL DEFAULT '',
  icon                            TEXT,
  type                            TEXT NOT NULL DEFAULT 'chat' CHECK(type IN ('chat','analysis')),
  system_agent_id                 TEXT,
  user_agent_id                   TEXT,
  provider                        TEXT,
  model                           TEXT,
  usage                           TEXT,
  context_metrics                 TEXT,
  per_agent_context_metrics       TEXT,
  last_context_snapshot           TEXT,
  is_group_chat                   INTEGER NOT NULL DEFAULT 0,
  group_agent_ids                 TEXT NOT NULL DEFAULT '[]',
  group_agent_overrides           TEXT NOT NULL DEFAULT '{}',
  group_audience_mode             TEXT NOT NULL DEFAULT 'auto',
  group_audience_agent_ids        TEXT NOT NULL DEFAULT '[]',
  working_path                    TEXT,
  coding_mode                     INTEGER NOT NULL DEFAULT 0,
  coding_provider                 TEXT NOT NULL DEFAULT 'claude-code',
  permission_mode                 TEXT NOT NULL DEFAULT 'inherit',
  chat_allow_list                 TEXT NOT NULL DEFAULT '[]',
  chat_danger_overrides           TEXT NOT NULL DEFAULT '[]',
  max_agent_rounds                INTEGER,
  auto_title_eligible             INTEGER NOT NULL DEFAULT 0,
  auto_title_locked               INTEGER NOT NULL DEFAULT 0,
  auto_title_attempt_count        INTEGER NOT NULL DEFAULT 0,
  analysis_target_agent_id        TEXT,
  is_pinned                       INTEGER NOT NULL DEFAULT 0,
  mode                            TEXT NOT NULL DEFAULT 'chat',
  mode_transitions                TEXT NOT NULL DEFAULT '[]',
  mode_transition_pending         TEXT,
  productivity_mode_notice_shown  INTEGER NOT NULL DEFAULT 0,
  created_at                      INTEGER NOT NULL,
  updated_at                      INTEGER NOT NULL,
  last_message_at                 INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chats_last_message_at ON chats(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_pinned          ON chats(is_pinned, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  chat_id         TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content         TEXT NOT NULL DEFAULT '',
  segments        TEXT NOT NULL DEFAULT '[]',
  ts              INTEGER NOT NULL,
  created_at      INTEGER,
  duration_ms     INTEGER,
  user_agent_id   TEXT,
  agent_id        TEXT,
  agent_name      TEXT,
  is_error        INTEGER NOT NULL DEFAULT 0,
  error_detail    TEXT,
  error_code      TEXT,
  plan_data       TEXT,
  plan_state      TEXT,
  token_usage     TEXT,
  text_for_search TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, ts);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  text_for_search,
  content='messages',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS msg_fts_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text_for_search) VALUES (new.rowid, new.text_for_search);
END;
CREATE TRIGGER IF NOT EXISTS msg_fts_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text_for_search) VALUES ('delete', old.rowid, old.text_for_search);
END;
CREATE TRIGGER IF NOT EXISTS msg_fts_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text_for_search) VALUES ('delete', old.rowid, old.text_for_search);
  INSERT INTO messages_fts(rowid, text_for_search) VALUES (new.rowid, new.text_for_search);
END;
`

// ── Pure helpers (unit-testable, no DB dependency) ───────────────────────────

function serializeJsonField(value) {
  if (value === null || value === undefined) return null
  return JSON.stringify(value)
}

function deserializeJsonField(json, fallback = null) {
  if (json === null || json === undefined || json === '') return fallback
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

function extractSearchText(segments) {
  if (!Array.isArray(segments)) return ''
  const parts = []
  for (const seg of segments) {
    if (seg?.type === 'text' && typeof seg.content === 'string' && seg.content) {
      parts.push(seg.content)
    }
  }
  return parts.join(' ')
}

function _bool01(v) { return v ? 1 : 0 }
function _01bool(v) { return Boolean(v) }

function rowToChat(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title || '',
    icon: row.icon || '',
    type: row.type || 'chat',
    systemAgentId: row.system_agent_id || null,
    userAgentId: row.user_agent_id || null,
    provider: row.provider || null,
    model: row.model || null,
    usage: deserializeJsonField(row.usage, null),
    contextMetrics: deserializeJsonField(row.context_metrics, null),
    perAgentContextMetrics: deserializeJsonField(row.per_agent_context_metrics, {}),
    lastContextSnapshot: deserializeJsonField(row.last_context_snapshot, null),
    isGroupChat: _01bool(row.is_group_chat),
    groupAgentIds: deserializeJsonField(row.group_agent_ids, []),
    groupAgentOverrides: deserializeJsonField(row.group_agent_overrides, {}),
    groupAudienceMode: row.group_audience_mode || 'auto',
    groupAudienceAgentIds: deserializeJsonField(row.group_audience_agent_ids, []),
    workingPath: row.working_path || null,
    codingMode: _01bool(row.coding_mode),
    codingProvider: row.coding_provider || 'claude-code',
    permissionMode: row.permission_mode || 'inherit',
    chatAllowList: deserializeJsonField(row.chat_allow_list, []),
    chatDangerOverrides: deserializeJsonField(row.chat_danger_overrides, []),
    maxAgentRounds: row.max_agent_rounds === null || row.max_agent_rounds === undefined ? null : row.max_agent_rounds,
    autoTitleEligible: _01bool(row.auto_title_eligible),
    autoTitleLocked: _01bool(row.auto_title_locked),
    autoTitleAttemptCount: row.auto_title_attempt_count || 0,
    analysisTargetAgentId: row.analysis_target_agent_id || null,
    isPinned: _01bool(row.is_pinned),
    mode: row.mode || 'chat',
    modeTransitions: deserializeJsonField(row.mode_transitions, []),
    modeTransitionPending: deserializeJsonField(row.mode_transition_pending, null),
    productivityModeNoticeShown: _01bool(row.productivity_mode_notice_shown),
    createdAt: row.created_at || 0,
    updatedAt: row.updated_at || 0,
    lastMessageAt: row.last_message_at || null,
  }
}

function chatToRow(chat) {
  return {
    id: chat.id,
    title: chat.title || '',
    icon: chat.icon || null,
    type: chat.type === 'analysis' ? 'analysis' : 'chat',
    system_agent_id: chat.systemAgentId || null,
    user_agent_id: chat.userAgentId || null,
    provider: chat.provider || null,
    model: chat.model || null,
    usage: serializeJsonField(chat.usage),
    context_metrics: serializeJsonField(chat.contextMetrics),
    per_agent_context_metrics: serializeJsonField(chat.perAgentContextMetrics),
    last_context_snapshot: serializeJsonField(chat.lastContextSnapshot),
    is_group_chat: _bool01(chat.isGroupChat),
    group_agent_ids: serializeJsonField(chat.groupAgentIds) || '[]',
    group_agent_overrides: serializeJsonField(chat.groupAgentOverrides) || '{}',
    group_audience_mode: chat.groupAudienceMode || 'auto',
    group_audience_agent_ids: serializeJsonField(chat.groupAudienceAgentIds) || '[]',
    working_path: chat.workingPath || null,
    coding_mode: _bool01(chat.codingMode),
    coding_provider: chat.codingProvider || 'claude-code',
    permission_mode: chat.permissionMode || 'inherit',
    chat_allow_list: serializeJsonField(chat.chatAllowList) || '[]',
    chat_danger_overrides: serializeJsonField(chat.chatDangerOverrides) || '[]',
    max_agent_rounds: chat.maxAgentRounds === null || chat.maxAgentRounds === undefined ? null : chat.maxAgentRounds,
    auto_title_eligible: _bool01(chat.autoTitleEligible),
    auto_title_locked: _bool01(chat.autoTitleLocked),
    auto_title_attempt_count: chat.autoTitleAttemptCount || 0,
    analysis_target_agent_id: chat.analysisTargetAgentId || null,
    is_pinned: _bool01(chat.isPinned),
    mode: chat.mode || 'chat',
    mode_transitions: serializeJsonField(chat.modeTransitions) || '[]',
    mode_transition_pending: serializeJsonField(chat.modeTransitionPending),
    productivity_mode_notice_shown: _bool01(chat.productivityModeNoticeShown),
    created_at: chat.createdAt || Date.now(),
    updated_at: chat.updatedAt || Date.now(),
    last_message_at: chat.lastMessageAt || null,
  }
}

function rowToMessage(row) {
  if (!row) return null
  return {
    id: row.id,
    role: row.role,
    content: row.content || '',
    segments: deserializeJsonField(row.segments, []),
    timestamp: row.ts || 0,
    createdAt: row.created_at || 0,
    durationMs: row.duration_ms || null,
    userAgentId: row.user_agent_id || null,
    agentId: row.agent_id || null,
    agentName: row.agent_name || null,
    isError: _01bool(row.is_error),
    errorDetail: row.error_detail || null,
    errorCode: row.error_code || null,
    planData: deserializeJsonField(row.plan_data, null),
    planState: row.plan_state || null,
    tokenUsage: deserializeJsonField(row.token_usage, null),
  }
}

function messageToRow(msg, chatId) {
  if (!chatId) throw new Error('messageToRow: chatId required')
  if (!msg?.id) throw new Error('messageToRow: msg.id required')
  return {
    id: msg.id,
    chat_id: chatId,
    role: msg.role,
    content: msg.content || '',
    segments: serializeJsonField(msg.segments) || '[]',
    ts: msg.timestamp || msg.createdAt || Date.now(),
    created_at: msg.createdAt || msg.timestamp || Date.now(),
    duration_ms: msg.durationMs || null,
    user_agent_id: msg.userAgentId || null,
    agent_id: msg.agentId || null,
    agent_name: msg.agentName || null,
    is_error: _bool01(msg.isError),
    error_detail: msg.errorDetail || null,
    error_code: msg.errorCode || null,
    plan_data: serializeJsonField(msg.planData),
    plan_state: msg.planState || null,
    token_usage: serializeJsonField(msg.tokenUsage),
    text_for_search: extractSearchText(msg.segments),
  }
}

// ── DB layer (skeleton — methods added in Tasks 1.2 + 1.3) ───────────────────

class ChatStore {
  constructor(dbPath) {
    this.dbPath = dbPath
    this._db = null
  }

  _open() {
    if (this._db) return this._db
    const Database = _getDb()
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    const db = new Database(this.dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(SCHEMA)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
    this._db = db
    return db
  }

  close() {
    if (this._db) {
      try { this._db.close() } catch {}
      this._db = null
    }
  }

  // ── Chats ───────────────────────────────────────────────────────────────

  /**
   * Returns chat metadata for the chat list UI. Includes all columns —
   * the renderer's lazy-load path will fetch messages separately via
   * getMessages() / getChatMeta() as needed.
   */
  listChatIndex() {
    const db = this._open()
    const rows = db.prepare(`
      SELECT * FROM chats
      ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
    `).all()
    return rows.map(rowToChat)
  }

  getChatMeta(chatId) {
    if (!chatId) return null
    const db = this._open()
    const row = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId)
    return rowToChat(row)
  }

  /**
   * Replace the chat row entirely. The chat's `messages` array on the input
   * is IGNORED — messages have their own write path (appendMessage /
   * appendMessages).
   */
  saveChatMeta(chat) {
    if (!chat?.id) throw new Error('saveChatMeta: id required')
    const db = this._open()
    const r = chatToRow(chat)
    db.prepare(`
      INSERT INTO chats (
        id, title, icon, type, system_agent_id, user_agent_id, provider, model,
        usage, context_metrics, per_agent_context_metrics, last_context_snapshot,
        is_group_chat, group_agent_ids, group_agent_overrides,
        group_audience_mode, group_audience_agent_ids,
        working_path, coding_mode, coding_provider,
        permission_mode, chat_allow_list, chat_danger_overrides, max_agent_rounds,
        auto_title_eligible, auto_title_locked, auto_title_attempt_count,
        analysis_target_agent_id, is_pinned,
        mode, mode_transitions, mode_transition_pending, productivity_mode_notice_shown,
        created_at, updated_at, last_message_at
      ) VALUES (
        @id, @title, @icon, @type, @system_agent_id, @user_agent_id, @provider, @model,
        @usage, @context_metrics, @per_agent_context_metrics, @last_context_snapshot,
        @is_group_chat, @group_agent_ids, @group_agent_overrides,
        @group_audience_mode, @group_audience_agent_ids,
        @working_path, @coding_mode, @coding_provider,
        @permission_mode, @chat_allow_list, @chat_danger_overrides, @max_agent_rounds,
        @auto_title_eligible, @auto_title_locked, @auto_title_attempt_count,
        @analysis_target_agent_id, @is_pinned,
        @mode, @mode_transitions, @mode_transition_pending, @productivity_mode_notice_shown,
        @created_at, @updated_at, @last_message_at
      )
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, icon=excluded.icon, type=excluded.type,
        system_agent_id=excluded.system_agent_id, user_agent_id=excluded.user_agent_id,
        provider=excluded.provider, model=excluded.model,
        usage=excluded.usage,
        context_metrics=excluded.context_metrics,
        per_agent_context_metrics=excluded.per_agent_context_metrics,
        last_context_snapshot=excluded.last_context_snapshot,
        is_group_chat=excluded.is_group_chat,
        group_agent_ids=excluded.group_agent_ids,
        group_agent_overrides=excluded.group_agent_overrides,
        group_audience_mode=excluded.group_audience_mode,
        group_audience_agent_ids=excluded.group_audience_agent_ids,
        working_path=excluded.working_path,
        coding_mode=excluded.coding_mode,
        coding_provider=excluded.coding_provider,
        permission_mode=excluded.permission_mode,
        chat_allow_list=excluded.chat_allow_list,
        chat_danger_overrides=excluded.chat_danger_overrides,
        max_agent_rounds=excluded.max_agent_rounds,
        auto_title_eligible=excluded.auto_title_eligible,
        auto_title_locked=excluded.auto_title_locked,
        auto_title_attempt_count=excluded.auto_title_attempt_count,
        analysis_target_agent_id=excluded.analysis_target_agent_id,
        is_pinned=excluded.is_pinned,
        mode=excluded.mode,
        mode_transitions=excluded.mode_transitions,
        mode_transition_pending=excluded.mode_transition_pending,
        productivity_mode_notice_shown=excluded.productivity_mode_notice_shown,
        updated_at=excluded.updated_at,
        last_message_at=excluded.last_message_at
    `).run(r)
  }

  /**
   * Patch-style update — merge partial fields into the existing chat row.
   * Use for accumulateUsage and other narrow updates.
   */
  patchChatMeta(chatId, patch) {
    if (!chatId || !patch) return
    const existing = this.getChatMeta(chatId)
    if (!existing) return
    this.saveChatMeta({ ...existing, ...patch, id: chatId, updatedAt: Date.now() })
  }

  /**
   * Atomically accumulate token-usage counters. Mirrors the legacy
   * accumulateUsage in store.js.
   */
  accumulateUsage(chatId, metrics, provider, model) {
    if (!chatId || !metrics) return
    const db = this._open()
    const tx = db.transaction(() => {
      const existing = this.getChatMeta(chatId)
      if (!existing) return
      const u = existing.usage || {}
      const newUsage = {
        inputTokens:         (u.inputTokens         || 0) + (metrics.inputTokens         || 0),
        outputTokens:        (u.outputTokens        || 0) + (metrics.outputTokens        || 0),
        cacheCreationTokens: (u.cacheCreationTokens || 0) + (metrics.cacheCreationTokens || 0),
        cacheReadTokens:     (u.cacheReadTokens     || 0) + (metrics.cacheReadTokens     || 0),
        voiceInputTokens:    (u.voiceInputTokens    || 0) + (metrics.voiceInputTokens    || 0),
        voiceOutputTokens:   (u.voiceOutputTokens   || 0) + (metrics.voiceOutputTokens   || 0),
        whisperCalls:        (u.whisperCalls        || 0) + (metrics.whisperCalls        || 0),
        whisperSecs:         (u.whisperSecs         || 0) + (metrics.whisperSecs         || 0),
        ttsChars:            (u.ttsChars            || 0) + (metrics.ttsChars            || 0),
      }
      const patch = { usage: newUsage }
      if (provider && !existing.provider) patch.provider = provider
      if (model    && !existing.model)    patch.model    = model
      this.patchChatMeta(chatId, patch)
    })
    tx()
  }

  deleteChat(chatId) {
    if (!chatId) return
    const db = this._open()
    db.prepare('DELETE FROM chats WHERE id = ?').run(chatId)
  }

  countChats() {
    return this._open().prepare('SELECT COUNT(*) AS n FROM chats').get().n
  }

  countMessages(chatId) {
    if (!chatId) return 0
    return this._open().prepare('SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?').get(chatId).n
  }

  // ── Messages ────────────────────────────────────────────────────────────

  /**
   * Get all messages for a chat in chronological order.
   * Returns plain message objects with segments deserialized.
   */
  getMessages(chatId) {
    if (!chatId) return []
    const db = this._open()
    const rows = db.prepare(`
      SELECT * FROM messages WHERE chat_id = ? ORDER BY ts ASC, rowid ASC
    `).all(chatId)
    return rows.map(rowToMessage)
  }

  /**
   * Paginated message load. `before` is a ms timestamp; returns the `limit`
   * most-recent messages with ts < before. Useful for "load older" UX.
   */
  getMessagesPage(chatId, { before = null, limit = 100 } = {}) {
    if (!chatId) return []
    const db = this._open()
    const sql = before
      ? 'SELECT * FROM messages WHERE chat_id = ? AND ts < ? ORDER BY ts DESC LIMIT ?'
      : 'SELECT * FROM messages WHERE chat_id = ? ORDER BY ts DESC LIMIT ?'
    const args = before ? [chatId, before, limit] : [chatId, limit]
    const rows = db.prepare(sql).all(...args)
    return rows.reverse().map(rowToMessage)
  }

  /**
   * Append a single message. ON CONFLICT updates — same message id rewrites,
   * which is fine for stream-incremental persistence.
   */
  appendMessage(chatId, msg) {
    if (!chatId) throw new Error('appendMessage: chatId required')
    if (!msg?.id) throw new Error('appendMessage: msg.id required')
    const db = this._open()
    const r = messageToRow(msg, chatId)
    db.prepare(`
      INSERT INTO messages (
        id, chat_id, role, content, segments, ts, created_at, duration_ms,
        user_agent_id, agent_id, agent_name, is_error, error_detail, error_code,
        plan_data, plan_state, token_usage, text_for_search
      ) VALUES (
        @id, @chat_id, @role, @content, @segments, @ts, @created_at, @duration_ms,
        @user_agent_id, @agent_id, @agent_name, @is_error, @error_detail, @error_code,
        @plan_data, @plan_state, @token_usage, @text_for_search
      )
      ON CONFLICT(id) DO UPDATE SET
        role=excluded.role, content=excluded.content, segments=excluded.segments,
        ts=excluded.ts, duration_ms=excluded.duration_ms,
        user_agent_id=excluded.user_agent_id, agent_id=excluded.agent_id,
        agent_name=excluded.agent_name, is_error=excluded.is_error,
        error_detail=excluded.error_detail, error_code=excluded.error_code,
        plan_data=excluded.plan_data, plan_state=excluded.plan_state,
        token_usage=excluded.token_usage,
        text_for_search=excluded.text_for_search
    `).run(r)
    db.prepare('UPDATE chats SET last_message_at = ?, updated_at = ? WHERE id = ?')
      .run(r.ts, Date.now(), chatId)
  }

  /**
   * Bulk-append messages atomically. Used by migration script and bulk imports.
   */
  appendMessages(chatId, msgs) {
    if (!chatId) throw new Error('appendMessages: chatId required')
    if (!Array.isArray(msgs) || msgs.length === 0) return
    const db = this._open()
    const insert = db.prepare(`
      INSERT INTO messages (
        id, chat_id, role, content, segments, ts, created_at, duration_ms,
        user_agent_id, agent_id, agent_name, is_error, error_detail, error_code,
        plan_data, plan_state, token_usage, text_for_search
      ) VALUES (
        @id, @chat_id, @role, @content, @segments, @ts, @created_at, @duration_ms,
        @user_agent_id, @agent_id, @agent_name, @is_error, @error_detail, @error_code,
        @plan_data, @plan_state, @token_usage, @text_for_search
      )
      ON CONFLICT(id) DO UPDATE SET
        role=excluded.role, content=excluded.content, segments=excluded.segments,
        ts=excluded.ts, duration_ms=excluded.duration_ms,
        user_agent_id=excluded.user_agent_id, agent_id=excluded.agent_id,
        agent_name=excluded.agent_name, is_error=excluded.is_error,
        error_detail=excluded.error_detail, error_code=excluded.error_code,
        plan_data=excluded.plan_data, plan_state=excluded.plan_state,
        token_usage=excluded.token_usage,
        text_for_search=excluded.text_for_search
    `)
    let maxTs = 0
    const tx = db.transaction(() => {
      for (const m of msgs) {
        if (!m?.id) continue
        const r = messageToRow(m, chatId)
        insert.run(r)
        if (r.ts > maxTs) maxTs = r.ts
      }
      if (maxTs > 0) {
        db.prepare('UPDATE chats SET last_message_at = ?, updated_at = ? WHERE id = ?')
          .run(maxTs, Date.now(), chatId)
      }
    })
    tx()
  }

  removeMessage(chatId, msgId) {
    if (!chatId || !msgId) return
    const db = this._open()
    db.prepare('DELETE FROM messages WHERE chat_id = ? AND id = ?').run(chatId, msgId)
  }

  /**
   * FTS5 full-text search across messages. Returns matching messages
   * ranked by BM25.
   */
  searchFulltext(query, { chatId = null, limit = 50 } = {}) {
    if (!query || typeof query !== 'string') return []
    const db = this._open()
    const sql = chatId
      ? `SELECT m.* FROM messages_fts f
         JOIN messages m ON f.rowid = m.rowid
         WHERE f.text_for_search MATCH ? AND m.chat_id = ?
         ORDER BY bm25(messages_fts) LIMIT ?`
      : `SELECT m.* FROM messages_fts f
         JOIN messages m ON f.rowid = m.rowid
         WHERE f.text_for_search MATCH ?
         ORDER BY bm25(messages_fts) LIMIT ?`
    const args = chatId ? [query, chatId, limit] : [query, limit]
    try {
      return db.prepare(sql).all(...args).map(rowToMessage)
    } catch (err) {
      logger.warn('[ChatStore] searchFulltext error:', err.message)
      return []
    }
  }
}

let _instance = null
function getInstance(dataDir) {
  if (_instance) return _instance
  _instance = new ChatStore(path.join(dataDir, 'chats.db'))
  return _instance
}

function _reset() {
  if (_instance) { try { _instance.close() } catch {}; _instance = null }
}

module.exports = {
  ChatStore,
  getInstance,
  _reset,
  rowToChat, chatToRow,
  rowToMessage, messageToRow,
  serializeJsonField, deserializeJsonField,
  extractSearchText,
  SCHEMA_VERSION,
}
