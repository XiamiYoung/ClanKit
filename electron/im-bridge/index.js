// electron/im-bridge/index.js
'use strict'
const sessionStore   = require('./session-store')
const commandHandler = require('./command-handler')
const messageRouter  = require('./message-router')
const telegram       = require('./adapters/telegram')

let _mainWindow = null
let _config     = {}  // im config section from config.json

function setMainWindow(win) {
  _mainWindow = win
}

function notifyRenderer(channel, data) {
  try {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(channel, data)
    }
  } catch { /* window may have been closed */ }
}

function notifyChatsReloaded() {
  notifyRenderer('im:chats-updated', {})
}

async function handleIncoming(platform, channelId, displayName, text) {
  // Commands
  if (text.startsWith('/')) {
    const result = commandHandler.handle(text, sessionStore, platform, channelId, notifyChatsReloaded)
    if (result) {
      await sendToIM(platform, channelId, result.reply)
      if (result.newChatId) notifyChatsReloaded()
      return
    }
  }

  // Regular message — find or auto-create active chat
  let chatId = sessionStore.getActiveChatId(platform, channelId)
  if (!chatId) {
    // Auto-create a new chat for first-time users
    const result = commandHandler.handle('/new IM Chat', sessionStore, platform, channelId, notifyChatsReloaded)
    chatId = result.newChatId
    notifyChatsReloaded()
  }

  // Route message through AgentLoop
  await messageRouter.routeMessage({
    chatId,
    userText: text,
    displayName,
    sendToIM: (msg) => sendToIM(platform, channelId, msg),
    notifyRenderer,
  })
}

async function sendToIM(platform, channelId, text) {
  if (platform === 'telegram') {
    await telegram.sendMessage(channelId, text)
  }
}

function start(imConfig) {
  _config = imConfig || {}

  if (_config.telegram?.enabled && _config.telegram?.botToken) {
    telegram.start(_config.telegram.botToken, (chatId, username, text) => {
      // Check allowed users
      const allowed = _config.telegram?.allowedUsers
      if (allowed && allowed.length > 0 && !allowed.includes(username) && !allowed.includes(chatId)) {
        telegram.sendMessage(chatId, 'Access denied.')
        return
      }
      handleIncoming('telegram', chatId, '@' + username, text).catch(err => {
        console.error('[im-bridge] handleIncoming error:', err.message)
        telegram.sendMessage(chatId, 'Internal error: ' + err.message)
      })
    })
    console.log('[im-bridge] Telegram bot started')
  }
}

function stop() {
  telegram.stop()
  console.log('[im-bridge] stopped')
}

function getStatus() {
  return {
    running: telegram.isRunning(),
    platforms: {
      telegram: telegram.isRunning(),
    },
    sessions: sessionStore.getAllSessions(),
  }
}

module.exports = { start, stop, getStatus, setMainWindow }
