// electron/im-bridge/adapters/telegram.js
'use strict'

let _bot = null

/**
 * Start polling the Telegram bot.
 * @param {string} token - Bot token from BotFather
 * @param {(chatId: string, username: string, text: string) => void} onMessage
 */
function start(token, onMessage) {
  if (_bot) return  // already running
  const TelegramBot = require('node-telegram-bot-api')
  _bot = new TelegramBot(token, { polling: true })

  _bot.on('message', (msg) => {
    const chatId   = String(msg.chat.id)
    const username = msg.from?.username || msg.from?.first_name || String(msg.from?.id)
    const text     = msg.text || ''
    if (!text) return
    onMessage(chatId, username, text)
  })

  _bot.on('polling_error', (err) => {
    console.error('[telegram] polling error:', err.message)
  })
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

module.exports = { start, stop, sendMessage, isRunning }
