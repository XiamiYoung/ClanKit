/**
 * One-shot migration of legacy chat JSON files to chats.db.
 *
 * Reads:
 *   - {DATA_DIR}/chats/index.json                  (chat metadata array)
 *   - {DATA_DIR}/chats/{chatId}.json               (hot 100 messages)
 *   - {DATA_DIR}/chats/{chatId}.seg.N.json         (older message shards)
 *
 * For each chat: combines hot messages with all shards in chronological
 * order, INSERTs a chats row + appendMessages for the merged list.
 *
 * Idempotency gate: skips if chats table has any rows.
 *
 * Note: legacy `segmentCount` field on chat is intentionally NOT preserved
 * — SQLite renders the hot/cold split obsolete.
 */
const fs = require('fs')
const path = require('path')
const { logger } = require('../logger')
const { getInstance: getChatStore } = require('../chat/ChatStore')

function _readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function _readDir(dir) {
  try { return fs.readdirSync(dir) } catch { return [] }
}

function _toMs(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : null
  }
  return null
}

/**
 * Returns the on-disk hot+shards merged messages array, in chronological order.
 * Shards hold older messages; hot file has newer 100. Within each shard, msgs
 * are already in chronological order.
 */
function _loadAllMessages(chatsDir, chatId) {
  const hotFile = path.join(chatsDir, `${chatId}.json`)
  const hot = _readJsonSafe(hotFile)
  if (!hot) return []

  const hotMsgs = Array.isArray(hot.messages) ? hot.messages : []

  const shardFiles = _readDir(chatsDir)
    .filter(f => f.startsWith(`${chatId}.seg.`) && f.endsWith('.json'))
    .map(f => {
      const m = f.match(/\.seg\.(\d+)\.json$/)
      return m ? { file: f, n: parseInt(m[1], 10) } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.n - b.n)

  const shardMsgs = []
  for (const { file } of shardFiles) {
    const shard = _readJsonSafe(path.join(chatsDir, file))
    if (shard?.messages && Array.isArray(shard.messages)) {
      shardMsgs.push(...shard.messages)
    }
  }

  return [...shardMsgs, ...hotMsgs]
}

function migrate(dataDir) {
  const store = getChatStore(dataDir)

  if (store.countChats() > 0) {
    logger.info(`[chatsToSqlite] already migrated (${store.countChats()} chats)`)
    return { migratedChats: 0, migratedMessages: 0, skipped: true }
  }

  const chatsDir = path.join(dataDir, 'chats')
  const indexFile = path.join(chatsDir, 'index.json')
  const index = _readJsonSafe(indexFile) || []
  if (!Array.isArray(index) || index.length === 0) {
    logger.info('[chatsToSqlite] no chats/index.json found — fresh install, nothing to migrate')
    return { migratedChats: 0, migratedMessages: 0, skipped: false }
  }

  let migratedChats = 0
  let migratedMessages = 0

  for (const meta of index) {
    if (!meta?.id) continue
    const hotFile = path.join(chatsDir, `${meta.id}.json`)
    const hot = _readJsonSafe(hotFile)
    if (!hot) {
      logger.warn(`[chatsToSqlite] skipping ${meta.id} — no chat file`)
      continue
    }

    const allMessages = _loadAllMessages(chatsDir, meta.id)
    const chatRow = {
      id: meta.id,
      title:                   hot.title                   ?? meta.title                   ?? '',
      icon:                    hot.icon                    ?? meta.icon                    ?? '',
      type:                    hot.type                    ?? meta.type                    ?? 'chat',
      systemAgentId:           hot.systemAgentId           ?? meta.systemAgentId           ?? null,
      userAgentId:             hot.userAgentId             ?? meta.userAgentId             ?? null,
      provider:                hot.provider                ?? meta.provider                ?? null,
      model:                   hot.model                   ?? meta.model                   ?? null,
      usage:                   hot.usage                   ?? meta.usage                   ?? null,
      contextMetrics:          hot.contextMetrics          ?? null,
      perAgentContextMetrics:  hot.perAgentContextMetrics  ?? {},
      lastContextSnapshot:     hot.lastContextSnapshot     ?? null,
      isGroupChat:             hot.isGroupChat             ?? meta.isGroupChat             ?? false,
      groupAgentIds:           hot.groupAgentIds           ?? meta.groupAgentIds           ?? [],
      groupAgentOverrides:     hot.groupAgentOverrides     ?? meta.groupAgentOverrides     ?? {},
      groupAudienceMode:       hot.groupAudienceMode       ?? meta.groupAudienceMode       ?? 'auto',
      groupAudienceAgentIds:   hot.groupAudienceAgentIds   ?? meta.groupAudienceAgentIds   ?? [],
      workingPath:             hot.workingPath             ?? meta.workingPath             ?? null,
      codingMode:              hot.codingMode              ?? meta.codingMode              ?? false,
      codingProvider:          hot.codingProvider          ?? meta.codingProvider          ?? 'claude-code',
      permissionMode:          hot.permissionMode          ?? meta.permissionMode          ?? 'inherit',
      chatAllowList:           hot.chatAllowList           ?? meta.chatAllowList           ?? [],
      chatDangerOverrides:     hot.chatDangerOverrides     ?? meta.chatDangerOverrides     ?? [],
      maxAgentRounds:          hot.maxAgentRounds          ?? meta.maxAgentRounds          ?? null,
      autoTitleEligible:       hot.autoTitleEligible       ?? meta.autoTitleEligible       ?? false,
      autoTitleLocked:         hot.autoTitleLocked         ?? meta.autoTitleLocked         ?? false,
      autoTitleAttemptCount:   hot.autoTitleAttemptCount   ?? meta.autoTitleAttemptCount   ?? 0,
      analysisTargetAgentId:   hot.analysisTargetAgentId   ?? meta.analysisTargetAgentId   ?? null,
      isPinned:                hot.isPinned                ?? meta.isPinned                ?? false,
      mode:                    hot.mode                    ?? meta.mode                    ?? 'chat',
      modeTransitions:         hot.modeTransitions         ?? meta.modeTransitions         ?? [],
      modeTransitionPending:   hot.modeTransitionPending   ?? meta.modeTransitionPending   ?? null,
      productivityModeNoticeShown: hot.productivityModeNoticeShown ?? meta.productivityModeNoticeShown ?? false,
      createdAt: _toMs(hot.createdAt) || _toMs(meta.createdAt) || Date.now(),
      updatedAt: _toMs(hot.updatedAt) || _toMs(meta.updatedAt) || Date.now(),
      lastMessageAt: allMessages.length > 0
        ? (_toMs(allMessages[allMessages.length - 1].timestamp) || _toMs(allMessages[allMessages.length - 1].createdAt) || null)
        : null,
    }

    store.saveChatMeta(chatRow)
    if (allMessages.length > 0) {
      const normalized = allMessages.map(m => ({
        ...m,
        timestamp: _toMs(m.timestamp) || _toMs(m.createdAt) || 0,
        createdAt: _toMs(m.createdAt) || _toMs(m.timestamp) || 0,
      }))
      store.appendMessages(chatRow.id, normalized)
      migratedMessages += normalized.length
    }
    migratedChats++
  }

  logger.info(`[chatsToSqlite] migrated ${migratedChats} chats / ${migratedMessages} messages`)
  return { migratedChats, migratedMessages, skipped: false }
}

module.exports = { migrate }
