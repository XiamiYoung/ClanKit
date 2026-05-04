// electron/im-bridge/index.js
'use strict'
const path             = require('path')
const sessionStore     = require('./session-store')
const commandHandler   = require('./command-handler')
const messageRouter    = require('./message-router')
const telegram         = require('./adapters/telegram')
const whatsapp         = require('./adapters/whatsapp')
const feishu           = require('./adapters/feishu')
const teams            = require('./adapters/teams')

const ds = require('../lib/dataStore')
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
    return { 
      apiKey: vc.whisperApiKey, 
      baseURL: vc.whisperBaseURL || '',
      directAuth: vc.whisperDirectAuth === true
    }
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
  const engine = new WhisperSTT({
    apiKey: stt.apiKey,
    baseURL: stt.baseURL,
    directAuth: stt.directAuth
  })
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

  const directAuth = vc.whisperDirectAuth === true
  const url = directAuth
    ? `${base}/v1/audio/speech`
    : `${base}/proxy/openai/v1/audio/speech`
  const authHeader = directAuth
    ? { 'Authorization': `Bearer ${apiKey}` }
    : { 'x-api-key': apiKey }
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
  if (platform === 'telegram')       await telegram.sendMessage(channelId, text)
  else if (platform === 'whatsapp')  await whatsapp.sendMessage(channelId, text)
  else if (platform === 'feishu')    await feishu.sendMessage(channelId, text)
  else if (platform === 'teams')     await teams.sendMessage(channelId, text)
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

function _startTelegram() {
  const cfg = _config.im?.telegram
  if (!cfg?.enabled || !cfg?.botToken) return
  telegram.start(
    cfg.botToken,
    (chatId, username, text) => {
      const allowed = cfg.allowedUsers
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
      const allowed = cfg.allowedUsers
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
      const allowed = cfg.allowedUsers
      if (allowed && allowed.length > 0 && !allowed.includes(username) && !allowed.includes(chatId)) {
        return  // silently ignore unauthorized callback taps
      }
      handleCallbackQuery('telegram', chatId, cbQueryId, data)
    },
    async (chatId, username, buffer, caption) => {
      const allowed = cfg.allowedUsers
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

function start(fullConfig) {
  _config = fullConfig || {}

  if (_config.im?.telegram?.enabled && _config.im?.telegram?.botToken) {
    _startTelegram()
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

  if (_config.im?.teams?.enabled && _config.im?.teams?.clientId && _config.im?.teams?.tenantId) {
    const dataDir = ds.paths().DATA_DIR
    if (dataDir) {
      teams.start(
        {
          tenantId:     _config.im.teams.tenantId,
          clientId:     _config.im.teams.clientId,
          scopes:       'offline_access User.Read Chat.ReadWrite ChannelMessage.ReadWrite Team.ReadBasic.All Channel.ReadBasic.All Sites.Read.All Files.Read.All Mail.ReadWrite Mail.Send',
          selfOnly:     _config.im.teams.selfOnly !== false,  // default true
          allowedUsers: _config.im.teams.allowedUsers || [],
          pollInterval: _config.im.teams.pollInterval || 5,
          dataDir,
        },
        (chatId, username, text) => handleIncoming('teams', chatId, username, text)
          .catch(err => {
            console.error('[im-bridge] teams error:', err.message)
            teams.sendMessage(chatId, 'Error: ' + err.message)
          })
      )
      console.log('[im-bridge] Teams adapter started')
    }
  }
}

function _startWhatsApp() {
  const dataDir = ds.paths().DATA_DIR
  if (!dataDir) {
    console.error('[im-bridge] Cannot start WhatsApp: DATA_DIR is invalid')
    return
  }
  const authDir = path.join(dataDir, 'whatsapp-session')
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

function updateConfig(fullConfig) {
  _config = fullConfig || {}
}

function startPlatform(platform) {
  if (platform === 'telegram') {
    const cfg = _config.im?.telegram || {}
    if (cfg.enabled && cfg.botToken) {
      telegram.stop()
      // Re-start only telegram, not all platforms
      _startTelegram()
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
  } else if (platform === 'teams') {
    const cfg = _config.im?.teams || {}
    if (cfg.enabled && cfg.clientId && cfg.tenantId) {
      const dataDir = ds.paths().DATA_DIR
      if (dataDir) {
        teams.start(
          {
            tenantId:     cfg.tenantId,
            clientId:     cfg.clientId,
            scopes:       'offline_access User.Read Chat.ReadWrite ChannelMessage.ReadWrite Team.ReadBasic.All Channel.ReadBasic.All Sites.Read.All Files.Read.All Mail.ReadWrite Mail.Send',
            selfOnly:     cfg.selfOnly !== false,
            allowedUsers: cfg.allowedUsers || [],
            pollInterval: cfg.pollInterval || 5,
            dataDir,
          },
          (chatId, username, text) => handleIncoming('teams', chatId, username, text)
            .catch(err => {
              console.error('[im-bridge] teams error:', err.message)
              teams.sendMessage(chatId, 'Error: ' + err.message)
            })
        )
      }
    }
  }
  return getStatus()
}

function stopPlatform(platform) {
  if (platform === 'telegram')       telegram.stop()
  else if (platform === 'whatsapp')  whatsapp.stop()
  else if (platform === 'feishu')    feishu.stop()
  else if (platform === 'teams')     teams.stop()
  return getStatus()
}

function stop() {
  telegram.stop()
  whatsapp.stop()
  feishu.stop()
  teams.stop()
  console.log('[im-bridge] stopped')
}

function getStatus() {
  return {
    running: telegram.isRunning() || whatsapp.isRunning() || feishu.isRunning() || teams.isRunning(),
    platforms: {
      telegram: telegram.isRunning(),
      whatsapp: whatsapp.isRunning(),
      feishu:   feishu.isRunning(),
      teams:    teams.isRunning(),
    },
    teamsAuth: teams.getAuthStatus(),
    sessions:  sessionStore.getAllSessions(),
  }
}

/**
 * Disconnect any existing WhatsApp socket and restart just for QR generation.
 * Called from the "Link Device" button in ConfigView.
 */
function requestWhatsAppQR() {
  const dataDir = ds.paths().DATA_DIR
  if (!dataDir) {
    console.error('[im-bridge] Cannot request WhatsApp QR: DATA_DIR is invalid')
    return
  }
  const authDir = path.join(dataDir, 'whatsapp-session')
  whatsapp.requestQR(
    authDir,
    (qrDataUri) => notifyRenderer('im:whatsapp-qr', { qr: qrDataUri }),
    ()          => notifyRenderer('im:whatsapp-ready', {})
  ).catch(err => console.error('[im-bridge] requestWhatsAppQR error:', err.message))
}

/**
 * Start device code auth flow for Teams.
 * Notifies renderer with device code info and auth result.
 */
/**
 * @param {{ tenantId?: string, clientId?: string }} [opts]
 *   Values passed directly from the UI form fields.
 *   Falls back to _config if not provided.
 */
function requestTeamsAuth(opts) {
  const tenantId = opts?.tenantId || _config.im?.teams?.tenantId
  const clientId = opts?.clientId || _config.im?.teams?.clientId
  if (!clientId || !tenantId) {
    notifyRenderer('im:teams-auth-error', { error: 'Teams Client ID and Tenant ID are required.' })
    return
  }
  const dataDir = ds.paths().DATA_DIR
  if (!dataDir) {
    notifyRenderer('im:teams-auth-error', { error: 'Invalid data directory.' })
    return
  }
  teams.startAuth(
    {
      tenantId,
      clientId,
      scopes:   'offline_access User.Read Chat.ReadWrite ChannelMessage.ReadWrite Team.ReadBasic.All Channel.ReadBasic.All Sites.Read.All Files.Read.All Mail.ReadWrite Mail.Send',
      dataDir,
    },
    (userCode, verificationUri) => notifyRenderer('im:teams-device-code', { userCode, verificationUri }),
    (displayName, userId) => {
      notifyRenderer('im:teams-ready', { displayName, userId })
      // Auto-start polling if bridge is enabled
      if (_config.im?.teams?.enabled) {
        teams._startPolling()
      }
    },
    (error) => notifyRenderer('im:teams-auth-error', { error })
  )
}

function teamsSignOut() {
  teams.signOut()
}

function getTeamsAuthStatus() {
  return teams.getAuthStatus()
}

module.exports = { start, stop, updateConfig, getStatus, setMainWindow, requestWhatsAppQR, startPlatform, stopPlatform, requestTeamsAuth, teamsSignOut, getTeamsAuthStatus }
