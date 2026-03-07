// electron/im-bridge/adapters/telegram.js
'use strict'

let _bot = null

/**
 * Start polling the Telegram bot.
 * @param {string} token - Bot token from BotFather
 * @param {(chatId: string, username: string, text: string) => void} onMessage
 * @param {(chatId: string, username: string, fileId: string) => Promise<void>} [onVoice]
 * @param {(chatId: string, username: string, cbQueryId: string, data: string) => void} [onCallbackQuery]
 * @param {(chatId: string, username: string, buffer: Buffer, caption: string) => Promise<void>} [onImage]
 */
function start(token, onMessage, onVoice, onCallbackQuery, onImage) {
  if (_bot) return  // already running
  const TelegramBot = require('node-telegram-bot-api')
  _bot = new TelegramBot(token, { polling: true })

  _bot.on('message', (msg) => {
    const chatId   = String(msg.chat.id)
    const username = msg.from?.username || msg.from?.first_name || String(msg.from?.id)

    if ((msg.voice || msg.audio) && onVoice) {
      const fileId = msg.voice?.file_id || msg.audio?.file_id
      onVoice(chatId, username, fileId).catch(err => {
        console.error('[telegram] voice handler error:', err.message)
      })
      return
    }

    if (msg.photo && onImage) {
      // Telegram sends multiple sizes — pick the largest (last element)
      const fileId  = msg.photo[msg.photo.length - 1].file_id
      const caption = msg.caption || ''
      downloadFile(fileId).then(buffer => {
        onImage(chatId, username, buffer, caption).catch(err => {
          console.error('[telegram] image handler error:', err.message)
        })
      }).catch(err => {
        console.error('[telegram] image download error:', err.message)
      })
      return
    }

    const text = msg.text || ''
    if (!text) return
    onMessage(chatId, username, text)
  })

  if (onCallbackQuery) {
    _bot.on('callback_query', (query) => {
      const chatId   = String(query.message?.chat?.id || query.from?.id)
      const username = query.from?.username || query.from?.first_name || String(query.from?.id)
      onCallbackQuery(chatId, username, query.id, query.data || '')
    })
  }

  _bot.on('polling_error', (err) => {
    console.error('[telegram] polling error:', err.message)
  })
}

/**
 * Send a message with an inline keyboard.
 * @param {string} chatId
 * @param {string} text - Markdown text
 * @param {Array[]|null} rows - Inline keyboard rows, or null for plain message
 */
async function sendInlineKeyboard(chatId, text, rows) {
  if (!_bot) return
  try {
    const opts = { parse_mode: 'Markdown' }
    if (rows) opts.reply_markup = { inline_keyboard: rows }
    await _bot.sendMessage(chatId, text, opts)
  } catch (err) {
    console.error('[telegram] sendInlineKeyboard error:', err.message)
  }
}

/** Acknowledge a callback_query tap to remove the loading spinner. Non-fatal if expired. */
async function answerCallbackQuery(callbackQueryId) {
  if (!_bot) return
  try {
    await _bot.answerCallbackQuery(callbackQueryId)
  } catch { /* query may have expired (30s Telegram timeout) */ }
}

/**
 * Download a file from Telegram by fileId. Returns a Buffer.
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
async function downloadFile(fileId) {
  if (!_bot) throw new Error('Telegram bot not running')
  const fileLink = await _bot.getFileLink(fileId)
  const resp = await fetch(fileLink)
  if (!resp.ok) throw new Error(`Failed to download Telegram file: ${resp.status}`)
  const arrayBuf = await resp.arrayBuffer()
  return Buffer.from(arrayBuf)
}

function stop() {
  if (_bot) {
    _bot.stopPolling()
    _bot = null
  }
}

/** Send a plain-text message. Silently catches errors (e.g. user blocked bot). */
async function sendMessage(chatId, text) {
  if (!_bot) return
  try {
    // Split long messages (Telegram limit: 4096 chars)
    const chunks = []
    for (let i = 0; i < text.length; i += 4000) {
      chunks.push(text.slice(i, i + 4000))
    }
    for (const chunk of chunks) {
      await _bot.sendMessage(chatId, chunk)
    }
  } catch (err) {
    console.error('[telegram] sendMessage error:', err.message)
  }
}

function isRunning() {
  return _bot !== null
}

/**
 * Send a voice message (OGG/OPUS buffer).
 * @param {string} chatId
 * @param {Buffer} audioBuffer
 */
async function sendVoice(chatId, audioBuffer) {
  if (!_bot) return
  try {
    await _bot.sendVoice(chatId, audioBuffer)
  } catch (err) {
    console.error('[telegram] sendVoice error:', err.message)
  }
}

module.exports = { start, stop, sendMessage, sendVoice, sendInlineKeyboard, answerCallbackQuery, isRunning, downloadFile }
