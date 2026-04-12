// electron/im-bridge/adapters/whatsapp.js
'use strict'

const fs     = require('fs')
const QRCode = require('qrcode')

// Mutable module-level callbacks — updated by start() without recreating the socket
let _onMessage = () => {}
let _onVoice   = null   // (chatId, username, audioBuffer) => Promise<void>
let _onImage   = null   // (chatId, username, imageBuffer, caption) => Promise<void>
let _onQrCode  = null
let _onReady   = null
let _onStopped = null  // called when WhatsApp logs us out

let _sock    = null
let _running = false
let _opts    = { authDir: '', allowedUsers: [] }

function clearSessionDir(authDir) {
  try {
    if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true })
    fs.mkdirSync(authDir, { recursive: true })
  } catch (err) {
    console.error('[whatsapp] clearSessionDir error:', err.message)
  }
}

async function _createSocket() {
  const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
  } = await import('@whiskeysockets/baileys')
  const pino = require('pino')

  const { state, saveCreds } = await useMultiFileAuthState(_opts.authDir)
  const { version }          = await fetchLatestBaileysVersion()

  _sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.windows('ClankAI'),
    printQRInTerminal: false,
    syncFullHistory:    false,
    markOnlineOnConnect: false,
    logger: pino({ level: 'silent' }),
  })

  // Increase max listeners to prevent EventEmitter warnings
  if (_sock.ev?.setMaxListeners) {
    _sock.ev.setMaxListeners(20)
  }

  _sock.ev.on('creds.update', saveCreds)

  _sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update
    if (qr) {
      try {
        const dataUri = await QRCode.toDataURL(qr)
        _onQrCode?.(dataUri)
      } catch (err) {
        console.error('[whatsapp] QR render error:', err.message)
      }
    }
    if (connection === 'open') {
      _running = true
      _onReady?.()
    }
    if (connection === 'close') {
      _running = false
      const code = lastDisconnect?.error?.output?.statusCode
      if (code !== DisconnectReason.loggedOut) {
        // Auto-reconnect on network drops — clean up old socket first
        const oldSock = _sock
        _sock = null
        try { oldSock?.ev?.removeAllListeners() } catch {}
        try { oldSock?.ws?.close() } catch {}
        _createSocket().catch(err => console.error('[whatsapp] reconnect error:', err.message))
      } else {
        console.log('[whatsapp] Logged out — clearing session files')
        clearSessionDir(_opts.authDir)
        _onStopped?.()
      }
    }
  })

  _sock.ev.on('messages.upsert', async (upsert) => {
    if (upsert.type !== 'notify') return
    for (const msg of upsert.messages ?? []) {
      try {
        const remoteJid = msg.key?.remoteJid
        if (!remoteJid) continue
        // Only accept personal 1:1 chats — skip groups, channels, status, broadcasts
        if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid')) continue

        const fromMe = msg.key?.fromMe || false
        const username = msg.pushName || remoteJid.split('@')[0]
        const chatId   = remoteJid
        const body = extractText(msg.message)

        // Only process self-messages (fromMe) - skip messages from other people
        if (!fromMe) continue

        const allowed = _opts.allowedUsers || []
        if (allowed.length > 0 && !allowed.includes(username) && !allowed.includes(chatId.split('@')[0])) continue

        // Voice / audio message
        const audioMsg = msg.message?.audioMessage
        if (audioMsg && _onVoice) {
          try {
            const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
              reuploadRequest: _sock.updateMediaMessage,
              logger: _sock.logger,
            })
            await _onVoice(chatId, username, Buffer.from(buffer))
          } catch (err) {
            console.error('[whatsapp] voice download error:', err.message)
          }
          continue
        }

        // Image message
        const imageMsg = msg.message?.imageMessage
        if (imageMsg && _onImage) {
          try {
            const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
              reuploadRequest: _sock.updateMediaMessage,
              logger: _sock.logger,
            })
            const caption = imageMsg.caption || ''
            await _onImage(chatId, username, Buffer.from(buffer), caption)
          } catch (err) {
            console.error('[whatsapp] image download error:', err.message)
          }
          continue
        }

        if (!body) continue

        _onMessage(chatId, username, body)
      } catch (err) {
        // Catch Bad MAC errors and other decryption failures
        if (err.message?.includes('Bad MAC') || err.message?.includes('decrypt')) {
          console.error('[whatsapp] Session error:', err.message, '- skipping message')
          // Don't crash, just skip this message. Session might recover on next message.
        } else {
          console.error('[whatsapp] Message processing error:', err)
        }
      }
    }
  })
}

function extractText(message) {
  if (!message) return ''
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  )
}

/**
 * Start the full bridge. If the socket is already connected (e.g. after QR scan),
 * just updates the message handler without recreating the socket.
 */
async function start(opts, onMessage, onVoice, onImage, onQrCode, onReady, onStopped) {
  _opts      = opts
  _onMessage = onMessage
  _onVoice   = onVoice || null
  _onImage   = onImage || null
  _onQrCode  = onQrCode
  _onReady   = onReady
  _onStopped = onStopped || null

  if (_sock && _running) {
    // Socket already live — callbacks updated, nothing else needed
    console.log('[whatsapp] bridge attached to existing connected socket')
    return
  }

  // Close any lingering disconnected socket before creating a fresh one
  if (_sock) {
    try { _sock.ev?.removeAllListeners() } catch {}
    try { _sock.ws?.close() } catch {}
    _sock = null
  }

  await _createSocket()
}

/**
 * Generate a fresh QR code. Clears the session dir so Baileys must re-pair.
 * Reuses the socket if one is already connected (unlikely path but safe).
 */
async function requestQR(authDir, onQrCode, onReady) {
  _onQrCode  = onQrCode
  _onReady   = onReady

  // Close existing socket and wipe session to force fresh QR
  if (_sock) {
    try { _sock.ev?.removeAllListeners() } catch {}
    try { _sock.ws?.close() } catch {}
    _sock    = null
    _running = false
  }
  clearSessionDir(authDir)

  _opts = { ..._opts, authDir }
  await _createSocket()
}

/**
 * Send a plain-text message. Splits at 4000 chars to stay within WhatsApp limits.
 */
async function sendMessage(chatId, text) {
  if (!_sock) return
  try {
    for (let i = 0; i < text.length; i += 4000) {
      await _sock.sendMessage(chatId, { text: text.slice(i, i + 4000) })
    }
  } catch (err) {
    console.error('[whatsapp] sendMessage error:', err.message)
  }
}

function stop() {
  try { _sock?.ev?.removeAllListeners() } catch {}
  try { _sock?.ws?.close() } catch {}
  _sock      = null
  _running   = false
  _onMessage = () => {}
}

function isRunning() { return _running }

/**
 * Send a voice message (OGG/OPUS buffer) displayed as a voice note.
 * @param {string} chatId
 * @param {Buffer} audioBuffer
 */
async function sendVoice(chatId, audioBuffer) {
  if (!_sock) return
  try {
    await _sock.sendMessage(chatId, {
      audio: audioBuffer,
      ptt: true,
      mimetype: 'audio/ogg; codecs=opus',
    })
  } catch (err) {
    console.error('[whatsapp] sendVoice error:', err.message)
  }
}

module.exports = { start, stop, sendMessage, sendVoice, isRunning, requestQR }
