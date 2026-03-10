// electron/im-bridge/session-store.js
'use strict'
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const DATA_DIR = process.env.CLANKAI_DATA_PATH || path.join(os.homedir(), '.clankai')
const SESSIONS_FILE = path.join(DATA_DIR, 'im-sessions.json')

/** In-memory state: Map<`${platform}:${channelId}`, { clankChatId, displayName }> */
let _sessions = new Map()
/** Active chat per IM user: Map<`${platform}:${channelId}`, clankChatId> */
let _activeChats = new Map()

function _load() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'))
    _sessions   = new Map(Object.entries(raw.sessions   || {}))
    _activeChats = new Map(Object.entries(raw.activeChats || {}))
  } catch {
    // first run — start empty
  }
}

function _save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const data = {
      sessions:    Object.fromEntries(_sessions),
      activeChats: Object.fromEntries(_activeChats),
    }
    const tmp = SESSIONS_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, SESSIONS_FILE)
  } catch (err) {
    console.error('[im-bridge] session-store save error:', err.message)
  }
}

function key(platform, channelId) {
  return `${platform}:${channelId}`
}

/** Returns the ClankAI chatId for the active chat of this IM channel, or null. */
function getActiveChatId(platform, channelId) {
  return _activeChats.get(key(platform, channelId)) || null
}

/** Set which ClankAI chat this IM channel is currently routing into. */
function setActiveChatId(platform, channelId, clankChatId, displayName) {
  const k = key(platform, channelId)
  _activeChats.set(k, clankChatId)
  _sessions.set(k, { clankChatId, displayName })
  _save()
}

function getAllSessions() {
  const result = []
  for (const [k, val] of _sessions) {
    const [platform, channelId] = k.split(':')
    result.push({ platform, channelId, ...val, active: _activeChats.get(k) === val.clankChatId })
  }
  return result
}

_load()

module.exports = { getActiveChatId, setActiveChatId, getAllSessions }
