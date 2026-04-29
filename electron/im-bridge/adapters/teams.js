// electron/im-bridge/adapters/teams.js
'use strict'

const fs   = require('fs')
const path = require('path')

const GRAPH_BASE    = 'https://graph.microsoft.com/v1.0'
const LOGIN_BASE    = 'https://login.microsoftonline.com'
const SELF_CHAT_ID  = '48:notes'  // Teams fixed self-chat (notes-to-self)
const MIN_POLL_SEC  = 1
const DEFAULT_POLL  = 5

let _running          = false
let _tokens           = null   // { access_token, refresh_token, expires_at }
let _userId           = null
let _userDisplayName  = null
let _userEmail        = null
let _pollTimer        = null
let _lastCheckTime    = null   // ISO string
let _opts             = {}     // { tenantId, clientId, scopes, selfOnly, allowedUsers, pollInterval, dataDir }
let _onMessage        = null
let _authPollTimer    = null
let _sentMessageIds   = new Set()
// Fallback dedup: tracks the expected polled-back text of recently sent bot
// messages, indexed by normalized content. Closes the race where _graphPost is
// in flight (msg already created on Graph servers, but resp.id not yet recorded
// in _sentMessageIds) and the next poll fires during that window. Each entry
// is consume-once: when matched, it's removed so a user's identical follow-up
// message isn't silently dropped.
let _sentContentEntries = []  // [{ hash, ts }]
// In-flight lock: setInterval doesn't await async callbacks, so a slow _poll
// (Graph API jitter, multi-chat fetch) can be re-entered with the same stale
// _lastCheckTime. Two concurrent _polls then ingest the same incoming msg
// twice → two routeMessage calls → duplicate user bubble + duplicate agent
// turn. The lock makes overlapping ticks no-ops.
let _pollInFlight     = false
// Defensive per-msg-ID dedup ring buffer for ingested messages. Independent
// from `_sentMessageIds` (which dedupes our OWN outgoing posts). If anything
// ever bypasses the in-flight lock (bug, future refactor), this catches it.
let _ingestedMsgIds   = []   // [{ id, ts }]

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

function _tokenDir() {
  if (!_opts.dataDir) return null
  return path.join(_opts.dataDir, 'teams-session')
}

function _tokenFile() {
  const dir = _tokenDir()
  return dir ? path.join(dir, 'tokens.json') : null
}

function _loadTokens() {
  try {
    const f = _tokenFile()
    if (!f || !fs.existsSync(f)) return false
    _tokens = JSON.parse(fs.readFileSync(f, 'utf-8'))
    return !!(_tokens && _tokens.access_token)
  } catch { return false }
}

function _saveTokens() {
  try {
    const dir = _tokenDir()
    const f = _tokenFile()
    if (!dir || !f) return
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(f, JSON.stringify(_tokens, null, 2), 'utf-8')
  } catch (err) {
    console.error('[teams] _saveTokens error:', err.message)
  }
}

function _clearTokens() {
  _tokens = null
  _userId = null
  _userDisplayName = null
  _userEmail = null
  try {
    const f = _tokenFile()
    if (f && fs.existsSync(f)) fs.unlinkSync(f)
  } catch {}
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function _postForm(url, params) {
  const body = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  return resp.json()
}

async function _graphGet(endpoint, token) {
  const resp = await fetch(`${GRAPH_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Graph ${endpoint} ${resp.status}: ${text.slice(0, 300)}`)
  }
  return resp.json()
}

async function _graphPost(endpoint, token, body) {
  const resp = await fetch(`${GRAPH_BASE}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Graph POST ${endpoint} ${resp.status}: ${text.slice(0, 300)}`)
  }
  return resp.json()
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

async function _refreshToken() {
  if (!_tokens.refresh_token) {
    throw new Error('No refresh token available — please sign in again (ensure offline_access scope is granted)')
  }
  const data = await _postForm(
    `${LOGIN_BASE}/${_opts.tenantId}/oauth2/v2.0/token`,
    {
      grant_type:    'refresh_token',
      client_id:     _opts.clientId,
      refresh_token: _tokens.refresh_token,
      scope:         _opts.scopes,
    }
  )
  if (data.error) throw new Error(`Token refresh failed: ${data.error_description || data.error}`)
  _tokens = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || _tokens.refresh_token,
    expires_at:    Date.now() + (data.expires_in - 300) * 1000,
  }
  _saveTokens()
}

async function _getAccessToken() {
  if (!_tokens) return null
  try {
    if (Date.now() >= _tokens.expires_at) await _refreshToken()
    return _tokens.access_token
  } catch (err) {
    console.error('[teams] _getAccessToken error:', err.message)
    return null
  }
}

async function _fetchUserProfile(token) {
  const me = await _graphGet('/me', token)
  _userId = me.id
  _userDisplayName = me.displayName || me.userPrincipalName || me.mail || 'unknown'
  _userEmail = me.userPrincipalName || me.mail || ''
  console.log(`[teams] Authenticated: "${_userDisplayName}" (${_userEmail}), id=${_userId}`)
}

// ---------------------------------------------------------------------------
// HTML → plain text
// ---------------------------------------------------------------------------

function _normalizeContent(text) {
  // Strip ALL whitespace (not collapse to single space). Teams may add or remove
  // whitespace between block-level elements when storing/serving HTML — e.g.
  // `<ul><li>A</li><li>B</li></ul>` we POSTed strips to "AB", but Teams's stored
  // HTML often has whitespace between <li>s and strips to "A B". Removing all
  // whitespace gives a stable fingerprint either way.
  return (text || '').replace(/\s+/g, '')
}

function _markSentContent(text) {
  const hash = _normalizeContent(text)
  if (!hash) return
  const now = Date.now()
  _sentContentEntries.push({ hash, ts: now })
  const cutoff = now - 60000
  while (_sentContentEntries.length && _sentContentEntries[0].ts < cutoff) {
    _sentContentEntries.shift()
  }
}

function _consumeSentContent(text) {
  const hash = _normalizeContent(text)
  if (!hash) return false
  const idx = _sentContentEntries.findIndex(e => e.hash === hash)
  if (idx === -1) return false
  _sentContentEntries.splice(idx, 1)
  return true
}

function _markIngested(msgId) {
  if (!msgId) return
  const now = Date.now()
  _ingestedMsgIds.push({ id: msgId, ts: now })
  const cutoff = now - 60000
  while (_ingestedMsgIds.length && _ingestedMsgIds[0].ts < cutoff) {
    _ingestedMsgIds.shift()
  }
}

function _wasIngested(msgId) {
  return _ingestedMsgIds.some(e => e.id === msgId)
}

function _stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Polling loop
//
// selfOnly=true  → poll ONLY self-chat (48:notes). 1 API call per tick.
// selfOnly=false → poll /me/chats + self-chat. Filter by allowedUsers.
// ---------------------------------------------------------------------------

async function _poll() {
  if (_pollInFlight) return  // skip overlapping ticks — keeps _lastCheckTime sane
  _pollInFlight = true
  try {
  const token = await _getAccessToken()
  if (!token) return

  try {
    const checkTime = _lastCheckTime ? new Date(_lastCheckTime).getTime() : 0
    const chatIds = []

    // Self-chat is always included
    chatIds.push(SELF_CHAT_ID)

    // In non-selfOnly mode, also poll regular chats
    if (!_opts.selfOnly) {
      const chatsResp = await _graphGet('/me/chats?$expand=lastMessagePreview&$top=50', token)
      for (const c of (chatsResp.value || [])) {
        const t = c.lastMessagePreview?.createdDateTime || c.lastUpdatedDateTime
        if (t && new Date(t).getTime() > checkTime) chatIds.push(c.id)
      }
    }

    for (const chatId of chatIds) {
      let msgsResp
      try {
        msgsResp = await _graphGet(`/chats/${chatId}/messages?$top=5&$orderby=createdDateTime desc`, token)
      } catch { continue }

      const msgs = (msgsResp.value || []).reverse()
      for (const msg of msgs) {
        if (msg.messageType !== 'message') continue
        const msgTime = new Date(msg.createdDateTime).getTime()
        if (msgTime <= checkTime) continue

        const senderId = msg.from?.user?.id || ''
        const senderName = msg.from?.user?.displayName || senderId || 'unknown'

        // Defensive: if we already ingested this msg in a recent poll (e.g.
        // overlap slipped through, or Graph returned the same id twice), skip.
        if (_wasIngested(msg.id)) continue

        // Skip bot-sent messages (our own Graph API replies)
        if (_sentMessageIds.has(msg.id)) { _sentMessageIds.delete(msg.id); continue }

        // Extract text early so we can dedupe by content as a race-window fallback.
        const _body = msg.body || {}
        const _text = _body.contentType === 'html'
          ? _stripHtml(_body.content || '')
          : (_body.content || '').trim()
        if (_text && _consumeSentContent(_text)) continue

        // Access control (only in non-selfOnly mode)
        if (!_opts.selfOnly) {
          const allowed = _opts.allowedUsers
          if (allowed && allowed.length > 0) {
            if (!allowed.includes(senderId) && !allowed.includes(senderName)) continue
          }
        }

        const text = _text
        if (!text) continue

        _markIngested(msg.id)
        const chatLabel = chatId === SELF_CHAT_ID ? 'self-chat' : 'chat ' + chatId.slice(0, 20) + '...'
        console.log(`[teams] new msg from "${senderName}" in ${chatLabel}: "${text.slice(0, 100)}"`)
        if (_onMessage) _onMessage(chatId, senderName, text)
      }
    }

  } catch (err) {
    console.error('[teams] _poll error:', err.message)
  }

  _lastCheckTime = new Date().toISOString()
  } finally {
    _pollInFlight = false
  }
}

// ---------------------------------------------------------------------------
// Device code auth flow
// ---------------------------------------------------------------------------

async function startAuth(opts, onDeviceCode, onReady, onError) {
  _opts = { ..._opts, ...opts }

  let dcResp
  try {
    dcResp = await _postForm(
      `${LOGIN_BASE}/${_opts.tenantId}/oauth2/v2.0/devicecode`,
      { client_id: _opts.clientId, scope: _opts.scopes }
    )
  } catch (err) {
    onError?.('Failed to request device code: ' + err.message)
    return
  }
  if (dcResp.error) { onError?.(dcResp.error_description || dcResp.error); return }

  const { device_code, user_code, verification_uri, interval, expires_in } = dcResp
  onDeviceCode?.(user_code, verification_uri)

  const pollMs = (interval || 5) * 1000
  const deadline = Date.now() + (expires_in || 900) * 1000
  if (_authPollTimer) { clearInterval(_authPollTimer); _authPollTimer = null }

  _authPollTimer = setInterval(async () => {
    if (Date.now() > deadline) {
      clearInterval(_authPollTimer); _authPollTimer = null
      onError?.('Device code expired. Please try again.')
      return
    }
    try {
      const r = await _postForm(`${LOGIN_BASE}/${_opts.tenantId}/oauth2/v2.0/token`, {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id:  _opts.clientId,
        device_code,
      })
      if (r.error === 'authorization_pending') return
      if (r.error) { clearInterval(_authPollTimer); _authPollTimer = null; onError?.(r.error_description || r.error); return }

      clearInterval(_authPollTimer); _authPollTimer = null
      _tokens = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in - 300) * 1000 }
      _saveTokens()
      await _fetchUserProfile(_tokens.access_token)
      onReady?.(_userDisplayName, _userId)
    } catch (err) {
      console.error('[teams] auth poll error:', err.message)
    }
  }, pollMs)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function start(opts, onMessage) {
  stop()
  _opts = opts
  _onMessage = onMessage

  if (_loadTokens()) {
    try {
      const token = await _getAccessToken()
      if (token) {
        await _fetchUserProfile(token)
        _startPolling()
        return
      }
    } catch (err) {
      console.error('[teams] session restore failed:', err.message)
    }
  }
  console.log('[teams] no saved session — waiting for sign-in')
}

function _startPolling() {
  if (_pollTimer) return
  _lastCheckTime = new Date().toISOString()
  _running = true
  const sec = Math.max(MIN_POLL_SEC, _opts.pollInterval || DEFAULT_POLL)
  console.log(`[teams] started — selfOnly=${!!_opts.selfOnly}, poll=${sec}s`)
  _pollTimer = setInterval(() => _poll().catch(err =>
    console.error('[teams] poll error:', err.message)
  ), sec * 1000)
}

function stop() {
  if (_authPollTimer) { clearInterval(_authPollTimer); _authPollTimer = null }
  if (_pollTimer)     { clearInterval(_pollTimer); _pollTimer = null }
  _running = false
}

// ---------------------------------------------------------------------------
// Markdown → Teams HTML
// ---------------------------------------------------------------------------

function _inlineFmt(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
}

function _buildTable(rows) {
  if (!rows.length) return ''
  const parse = r => r.split('|').slice(1, -1)  // drop empty first/last from |...|
  const hdr = parse(rows[0]).map(c => `<th>${_inlineFmt(c.trim())}</th>`).join('')
  const body = rows.slice(1).map(r => {
    const cells = parse(r).map(c => `<td>${_inlineFmt(c.trim())}</td>`).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  return `<table><tr>${hdr}</tr>${body}</table>`
}

function _markdownToHtml(md) {
  if (!md) return md
  const lines = md.split('\n')
  const out = []
  let tableRows = []
  let listItems = []
  let inTable = false
  let inList = false

  const flushList = () => {
    if (!inList) return
    out.push('<ul>' + listItems.map(li => `<li>${_inlineFmt(li)}</li>`).join('') + '</ul>')
    listItems = []; inList = false
  }
  const flushTable = () => {
    if (!inTable) return
    out.push(_buildTable(tableRows))
    tableRows = []; inTable = false
  }

  for (const line of lines) {
    // Table row
    if (/^\|.+\|$/.test(line)) {
      flushList()
      inTable = true
      if (/^\|[\s\-:|]+\|$/.test(line)) continue  // separator
      tableRows.push(line)
      continue
    }
    flushTable()

    // List item
    if (/^[-*] /.test(line)) {
      inList = true
      listItems.push(line.replace(/^[-*] /, ''))
      continue
    }
    flushList()

    // Heading
    const hm = line.match(/^(#{1,3}) (.+)$/)
    if (hm) { const n = hm[1].length; out.push(`<h${n}>${_inlineFmt(hm[2])}</h${n}>`); continue }

    // HR
    if (/^---+$/.test(line)) { out.push('<hr>'); continue }

    // Empty line
    if (!line.trim()) { out.push('<br>'); continue }

    // Regular text
    out.push(_inlineFmt(line) + '<br>')
  }
  flushTable(); flushList()
  return out.join('')
}

// ---------------------------------------------------------------------------

async function sendMessage(chatId, text) {
  const token = await _getAccessToken()
  if (!token) return
  try {
    const html = _markdownToHtml(text)
    // Pre-record the polled-back form so a poll firing during _graphPost
    // (before resp.id can be added to _sentMessageIds) still dedupes correctly.
    _markSentContent(_stripHtml(html))
    const resp = await _graphPost(`/chats/${chatId}/messages`, token, {
      body: { contentType: 'html', content: html },
    })
    if (resp?.id) {
      _sentMessageIds.add(resp.id)
      if (_sentMessageIds.size > 500) _sentMessageIds.delete(_sentMessageIds.values().next().value)
    }
  } catch (err) {
    console.error('[teams] sendMessage error:', err.message)
  }
}

function isRunning() { return _running }

function getAuthStatus() {
  return {
    connected: !!(_tokens && _userId),
    userDisplayName: _userDisplayName || '',
    userId: _userId || '',
  }
}

function signOut() {
  stop()
  _clearTokens()
}

module.exports = { start, stop, sendMessage, isRunning, startAuth, getAuthStatus, signOut, _startPolling }
