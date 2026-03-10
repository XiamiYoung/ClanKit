// electron/im-bridge/index.js
'use strict'
const path             = require('path')
const os               = require('os')
const sessionStore     = require('./session-store')
const commandHandler   = require('./command-handler')
const messageRouter    = require('./message-router')
const telegram         = require('./adapters/telegram')
const whatsapp         = require('./adapters/whatsapp')
const feishu           = require('./adapters/feishu')

const DATA_DIR = process.env.CLANKAI_DATA_PATH || path.join(os.homedir(), '.clankai')

let _mainWindow = null
let _config     = {}  // full config from config.json

/**
 * Resolve STT credentials from the Voice Call config section.
 * Uses the same whisperApiKey / whisperBaseURL that ChatView voice calls use.
 * Returns { apiKey, baseURL } or null if not configured.
 */
function resolveSTT() {
  const vc = _config.voiceCall || {}
  if (vc.whisperApiKey) {
    return { apiKey: vc.whisperApiKey, baseURL: vc.whisperBaseURL || '' }
  }
  return null
}

/**
 * Transcribe audio buffer to text. Returns transcribed text or null.
 * Throws on hard errors (caller should catch and notify user).
 */
async function transcribeAudio(audioBuffer) {
  const stt = resolveSTT()
  if (!stt) return { text: null, error: 'no-key' }
  const WhisperSTT = require('../agent/voice/WhisperSTT')
  const engine = new WhisperSTT(stt)
  const result = await engine.transcribe(audioBuffer, 'audio/ogg')
  return { text: result.text || null, error: null }
}

/**
 * Convert text to speech using OpenAI TTS API.
 * Returns an OGG/OPUS Buffer, or null if TTS is not configured / fails.
 */
async function textToSpeech(text) {
  const vc = _config.voiceCall || {}
  if (!vc.whisperApiKey || !vc.ttsMode || vc.ttsMode === 'browser') return null

  const apiKey = vc.whisperApiKey
  const base = (vc.whisperBaseURL || '').replace(/\/+$/, '')
  if (!base) return null

  const isProxy = base.includes('mlaas.virtuosgames.com')
  const url = isProxy
    ? `${base}/proxy/openai/v1/audio/speech`
    : `${base}/v1/audio/speech`
  const authHeader = isProxy
    ? { 'x-api-key': apiKey }
    : { 'Authorization': `Bearer ${apiKey}` }
  const ttsModel = vc.ttsMode === 'openai-hd' ? 'tts-1-hd' : 'tts-1'

  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ttsModel, input: text, voice: 'alloy', response_format: 'opus' }),
  })
  if (!resp.ok) return null
  return Buffer.from(await resp.arrayBuffer())
}

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


async function handleIncomingImage(platform, channelId, displayName, imageBuffer, caption) {
  const text = caption || ''

  let chatId = sessionStore.getActiveChatId(platform, channelId)
  if (chatId && !commandHandler.chatExists(chatId)) chatId = null
  if (!chatId) {
    const firstId = commandHandler.getFirstChatId()
    if (firstId) {
      chatId = firstId
      sessionStore.setActiveChatId(platform, channelId, chatId, '@' + channelId)
    } else {
      const result = commandHandler.handle('/new IM Chat', sessionStore, platform, channelId, notifyChatsReloaded)
      chatId = result.newChatId
      notifyChatsReloaded()
    }
  }

  const base64    = imageBuffer.toString('base64')
  const mediaType = 'image/jpeg'
  const attachment = { type: 'image', base64, mediaType, name: 'image.jpg' }

  await messageRouter.routeMessage({
    chatId,
    userText: text,
    displayName,
    imageAttachment: attachment,
    sendToIM: (msg) => sendToIM(platform, channelId, msg),
    notifyRenderer,
  })
}

async function handleIncoming(platform, channelId, displayName, text, replyWithVoice = false) {
  // Commands
  if (text.startsWith('/')) {
    const result = commandHandler.handle(text, sessionStore, platform, channelId, notifyChatsReloaded)
    if (result) {
      await sendToIM(platform, channelId, result.reply)
      if (result.newChatId) notifyChatsReloaded()
      if (result.updatedChatId) notifyRenderer('im:chat-updated', { chatId: result.updatedChatId })
      return
    }
  }

  // Regular message — find or auto-create active chat
  let chatId = sessionStore.getActiveChatId(platform, channelId)
  // Verify the saved chat still exists (may have been deleted from Electron)
  if (chatId && !commandHandler.chatExists(chatId)) {
    chatId = null
  }
  if (!chatId) {
    const firstId = commandHandler.getFirstChatId()
    if (firstId) {
      // Use the most recent existing chat
      chatId = firstId
      sessionStore.setActiveChatId(platform, channelId, chatId, '@' + channelId)
    } else {
      // No chats exist — create one
      const result = commandHandler.handle('/new IM Chat', sessionStore, platform, channelId, notifyChatsReloaded)
      chatId = result.newChatId
      notifyChatsReloaded()
    }
  }

  // Route message through AgentLoop
  await messageRouter.routeMessage({
    chatId,
    userText: text,
    displayName,
    sendToIM: async (msg) => {
      if (replyWithVoice && msg.length <= 300) {
        try {
          const audio = await textToSpeech(msg)
          if (audio) { await sendVoiceToIM(platform, channelId, audio); return }
        } catch (err) { console.error('[im-bridge] TTS error:', err.message) }
      }
      await sendToIM(platform, channelId, msg)
    },
    notifyRenderer,
  })
}

async function sendToIM(platform, channelId, text) {
  if (platform === 'telegram')  await telegram.sendMessage(channelId, text)
  else if (platform === 'whatsapp') await whatsapp.sendMessage(channelId, text)
  else if (platform === 'feishu')   await feishu.sendMessage(channelId, text)
}

async function sendVoiceToIM(platform, channelId, audioBuffer) {
  if (platform === 'telegram')       await telegram.sendVoice(channelId, audioBuffer)
  else if (platform === 'whatsapp')  await whatsapp.sendVoice(channelId, audioBuffer)
  else                               await sendToIM(platform, channelId, '[voice not supported]')
}

async function sendInlineKeyboard(platform, channelId, text, rows) {
  if (platform === 'telegram') {
    await telegram.sendInlineKeyboard(channelId, text, rows)
  } else {
    // Non-Telegram fallback: just send the text
    await sendToIM(platform, channelId, text)
  }
}

function handleCallbackQuery(platform, channelId, cbQueryId, data) {
  // No active inline keyboard flows — answer to clear the loading spinner
  if (platform === 'telegram') telegram.answerCallbackQuery(cbQueryId)
}

function start(fullConfig) {
  _config = fullConfig || {}


  if (_config.im?.telegram?.enabled && _config.im?.telegram?.botToken) {
    telegram.start(
      _config.im?.telegram.botToken,
      (chatId, username, text) => {
        const allowed = _config.im?.telegram?.allowedUsers
        if (allowed && allowed.length > 0 && !allowed.includes(username) && !allowed.includes(chatId)) {
          telegram.sendMessage(chatId, 'Access denied.')
          return
        }
        handleIncoming('telegram', chatId, '@' + username, text).catch(err => {
          console.error('[im-bridge] handleIncoming error:', err.message)
          telegram.sendMessage(chatId, 'Internal error: ' + err.message)
        })
      },
      async (chatId, username, fileId) => {
        const allowed = _config.im?.telegram?.allowedUsers
        if (allowed && allowed.length > 0 && !allowed.includes(username) && !allowed.includes(chatId)) {
          telegram.sendMessage(chatId, 'Access denied.')
          return
        }

        let audioBuffer
        try {
          audioBuffer = await telegram.downloadFile(fileId)
        } catch (err) {
          console.error('[im-bridge] telegram voice download error:', err.message)
          await sendToIM('telegram', chatId, '⚠️ Could not download voice message.')
          return
        }

        let result
        try {
          result = await transcribeAudio(audioBuffer)
        } catch (err) {
          console.error('[im-bridge] telegram voice transcription error:', err.message)
          await sendToIM('telegram', chatId, '⚠️ Could not transcribe voice message: ' + err.message)
          return
        }

        if (result.error === 'no-key') {
          await sendToIM('telegram', chatId, '⚠️ Voice transcription requires an OpenAI or Groq API key in settings.')
          return
        }
        if (!result.text) {
          await sendToIM('telegram', chatId, '⚠️ Could not detect speech in voice message.')
          return
        }

        handleIncoming('telegram', chatId, '@' + username, result.text, true).catch(err => {
          console.error('[im-bridge] handleIncoming error (voice):', err.message)
          telegram.sendMessage(chatId, 'Internal error: ' + err.message)
        })
      },
      (chatId, username, cbQueryId, data) => {
        const allowed = _config.im?.telegram?.allowedUsers
        if (allowed && allowed.length > 0 && !allowed.includes(username) && !allowed.includes(chatId)) {
          return  // silently ignore unauthorized callback taps
        }
        handleCallbackQuery('telegram', chatId, cbQueryId, data)
      },
      async (chatId, username, buffer, caption) => {
        const allowed = _config.im?.telegram?.allowedUsers
        if (allowed && allowed.length > 0 && !allowed.includes(username) && !allowed.includes(chatId)) {
          telegram.sendMessage(chatId, 'Access denied.')
          return
        }
        handleIncomingImage('telegram', chatId, '@' + username, buffer, caption).catch(err => {
          console.error('[im-bridge] handleIncomingImage error:', err.message)
          telegram.sendMessage(chatId, 'Internal error: ' + err.message)
        })
      }
    )
    console.log('[im-bridge] Telegram bot started')
  }

  if (_config.im?.whatsapp?.enabled) {
    _startWhatsApp()
  }

  if (_config.im?.feishu?.enabled && _config.im?.feishu?.appId && _config.im?.feishu?.appSecret) {
    feishu.start(
      { appId: _config.im?.feishu.appId, appSecret: _config.im?.feishu.appSecret, allowedUsers: _config.im?.feishu.allowedUsers || [] },
      (chatId, username, text) => handleIncoming('feishu', chatId, username, text)
        .catch(err => {
          console.error('[im-bridge] feishu error:', err.message)
          feishu.sendMessage(chatId, 'Error: ' + err.message)
        })
    )
    console.log('[im-bridge] Feishu adapter started')
  }
}

function _startWhatsApp() {
  const authDir = path.join(DATA_DIR, 'whatsapp-session')
  whatsapp.start(
    { authDir, allowedUsers: _config.im?.whatsapp?.allowedUsers || [] },
    // onMessage
    (chatId, username, text) => handleIncoming('whatsapp', chatId, username, text)
      .catch(err => {
        console.error('[im-bridge] whatsapp error:', err.message)
        whatsapp.sendMessage(chatId, 'Error: ' + err.message)
      }),
    // onVoice
    async (chatId, username, audioBuffer) => {
      let result
      try {
        result = await transcribeAudio(audioBuffer)
      } catch (err) {
        console.error('[im-bridge] whatsapp voice transcription error:', err.message)
        await sendToIM('whatsapp', chatId, '⚠️ Could not transcribe voice message: ' + err.message)
        return
      }

      if (result.error === 'no-key') {
        await sendToIM('whatsapp', chatId, '⚠️ Voice transcription requires an OpenAI or Groq API key in settings.')
        return
      }
      if (!result.text) {
        await sendToIM('whatsapp', chatId, '⚠️ Could not detect speech in voice message.')
        return
      }

      handleIncoming('whatsapp', chatId, '@' + username, result.text, true).catch(err => {
        console.error('[im-bridge] handleIncoming error (whatsapp voice):', err.message)
        whatsapp.sendMessage(chatId, 'Internal error: ' + err.message)
      })
    },
    // onImage
    async (chatId, username, buffer, caption) => {
      handleIncomingImage('whatsapp', chatId, '@' + username, buffer, caption).catch(err => {
        console.error('[im-bridge] handleIncomingImage error (whatsapp):', err.message)
        whatsapp.sendMessage(chatId, 'Internal error: ' + err.message)
      })
    },
    // onQrCode
    (qrDataUri) => notifyRenderer('im:whatsapp-qr', { qr: qrDataUri }),
    // onReady
    ()          => notifyRenderer('im:whatsapp-ready', {}),
    // onStopped
    ()          => {
      // WhatsApp logged out / unlinked — notify UI so bridge status updates
      console.log('[im-bridge] WhatsApp unlinked — stopping platform')
      notifyRenderer('im:platform-stopped', { platform: 'whatsapp' })
    }
  ).catch(err => console.error('[im-bridge] whatsapp start error:', err.message))
  console.log('[im-bridge] WhatsApp adapter started (will reconnect from saved session or show QR if not linked)')
}

function startPlatform(platform) {
  if (platform === 'telegram') {
    // Re-read config and start telegram
    const cfg = _config.im?.telegram || {}
    if (cfg.enabled && cfg.botToken) {
      start(_config)  // telegram needs full start flow; simplest to restart all
    }
  } else if (platform === 'whatsapp') {
    _startWhatsApp()
  } else if (platform === 'feishu') {
    const cfg = _config.im?.feishu || {}
    if (cfg.enabled && cfg.appId && cfg.appSecret) {
      feishu.start(
        { appId: cfg.appId, appSecret: cfg.appSecret, allowedUsers: cfg.allowedUsers || [] },
        (chatId, username, text) => handleIncoming('feishu', chatId, username, text)
          .catch(err => {
            console.error('[im-bridge] feishu error:', err.message)
            feishu.sendMessage(chatId, 'Error: ' + err.message)
          })
      )
    }
  }
  return getStatus()
}

function stopPlatform(platform) {
  if (platform === 'telegram') telegram.stop()
  else if (platform === 'whatsapp') whatsapp.stop()
  else if (platform === 'feishu') feishu.stop()
  return getStatus()
}

function stop() {
  telegram.stop()
  whatsapp.stop()
  feishu.stop()
  console.log('[im-bridge] stopped')
}

function getStatus() {
  return {
    running: telegram.isRunning() || whatsapp.isRunning() || feishu.isRunning(),
    platforms: {
      telegram: telegram.isRunning(),
      whatsapp: whatsapp.isRunning(),
      feishu:   feishu.isRunning(),
    },
    sessions: sessionStore.getAllSessions(),
  }
}

/**
 * Disconnect any existing WhatsApp socket and restart just for QR generation.
 * Called from the "Link Device" button in ConfigView.
 */
function requestWhatsAppQR() {
  const authDir = path.join(DATA_DIR, 'whatsapp-session')
  whatsapp.requestQR(
    authDir,
    (qrDataUri) => notifyRenderer('im:whatsapp-qr', { qr: qrDataUri }),
    ()          => notifyRenderer('im:whatsapp-ready', {})
  ).catch(err => console.error('[im-bridge] requestWhatsAppQR error:', err.message))
}

module.exports = { start, stop, getStatus, setMainWindow, requestWhatsAppQR, startPlatform, stopPlatform }
