/**
 * IPC handlers for chat/config/agent persistence.
 * Channels: store:*
 */
const path = require('path')
const fs = require('fs')
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const safeStorageHelper = require('../lib/safeStorageHelper')

// Detect plaintext credentials on disk so first-startup-after-upgrade can
// transparently re-write config.json in encrypted form. Idempotent — once all
// sensitive fields carry the enc:v1: prefix, this returns false and no
// migration write happens.
function _hasPlaintextSensitiveFields(rawCfg) {
  if (!rawCfg || typeof rawCfg !== 'object') return false
  for (const p of rawCfg.providers || []) {
    if (p?.apiKey && !safeStorageHelper.isEncrypted(p.apiKey)) return true
  }
  if (rawCfg.smtp?.pass && !safeStorageHelper.isEncrypted(rawCfg.smtp.pass)) return true
  return false
}

// -- Usage accumulation (exported for use by ipc/agent.js) --------------------
// Sync wrapper around ChatStore.accumulateUsage. Kept exported for IPC
// callers. The atomic increment + provider/model first-write semantics live
// inside ChatStore.
function accumulateUsage(chatId, metrics, provider, model) {
  if (!chatId || !metrics) return
  try {
    const { getInstance } = require('../chat/ChatStore')
    const store = getInstance(ds.paths().DATA_DIR)
    store.accumulateUsage(chatId, metrics, provider, model)
  } catch (err) {
    logger.warn('accumulateUsage write failed', err.message)
  }
}

function register({ DEFAULT_CONFIG }) {
  const p = () => ds.paths()

  function _chatStore() {
    const { getInstance } = require('../chat/ChatStore')
    return getInstance(p().DATA_DIR)
  }

  ipcMain.handle('store:get-chat-index', async () => {
    return _chatStore().listChatIndex()
  })

  ipcMain.handle('store:save-chat-index', async (_, _index) => {
    // No-op: with SQLite, the chat index is auto-derived from the chats table.
    // Renderer pushes the full index when chats are reordered/pinned, but the
    // source of truth is now SQLite — payload is ignored. Keep the IPC channel
    // accepting calls so renderer code doesn't need to change.
    return true
  })

  ipcMain.handle('store:get-chat', async (_, chatId) => {
    if (!chatId) return null
    const store = _chatStore()
    const meta = store.getChatMeta(chatId)
    if (!meta) return null
    const messages = store.getMessages(chatId)
    return { ...meta, messages, segmentCount: 0 }
  })

  ipcMain.handle('store:get-chat-segments', async (_, _payload) => {
    // Legacy renderer call: "give me messages from shard fromSeg to toSeg".
    // Post-migration there are no shards — store:get-chat returns ALL messages.
    // Return [] so the renderer's lazy-load logic gracefully no-ops.
    return []
  })

  ipcMain.handle('store:save-chat', async (_, chat) => {
    if (!chat || !chat.id) return false
    const store = _chatStore()
    // Preserve legacy merge semantics: usage/model/provider on existing row are
    // preferred when the incoming chat omits them (renderer doesn't always
    // re-send these fields).
    const existing = store.getChatMeta(chat.id)
    if (existing) {
      if (chat.usage == null && existing.usage)       chat.usage    = existing.usage
      if (!chat.model    && existing.model)           chat.model    = existing.model
      if (!chat.provider && existing.provider)        chat.provider = existing.provider
    }
    store.saveChatMeta(chat)
    if (Array.isArray(chat.messages) && chat.messages.length > 0) {
      store.appendMessages(chat.id, chat.messages)
    }
    return true
  })

  ipcMain.handle('store:delete-chat', async (_, chatId) => {
    if (!chatId) return false
    _chatStore().deleteChat(chatId)
    return true
  })

  ipcMain.handle('store:get-chats', async () => {
    const store = _chatStore()
    const index = store.listChatIndex()
    return index.map(c => ({ ...c, messages: null }))
  })

  ipcMain.handle('store:save-chats', async (_, chats) => {
    if (!Array.isArray(chats)) return false
    const store = _chatStore()
    for (const c of chats) {
      if (!c?.id) continue
      store.saveChatMeta(c)
      if (Array.isArray(c.messages) && c.messages.length > 0) {
        store.appendMessages(c.id, c.messages)
      }
    }
    return true
  })

  ipcMain.handle('store:get-config', () => {
    const saved = ds.readJSON(p().CONFIG_FILE, {})

    // One-time encryption migration: if any sensitive field is still plaintext
    // (legacy install pre-safeStorage), re-write the file so it lands on disk
    // encrypted. Peek at the raw file directly because ds.readJSON has already
    // decrypted the in-memory copy. Idempotent — once everything carries the
    // enc:v1: prefix this branch never runs again.
    try {
      if (safeStorageHelper.isAvailable() && fs.existsSync(p().CONFIG_FILE)) {
        const rawCfg = JSON.parse(fs.readFileSync(p().CONFIG_FILE, 'utf8'))
        if (_hasPlaintextSensitiveFields(rawCfg)) {
          ds.writeJSON(p().CONFIG_FILE, saved)
          logger.info('[safeStorage] migrated plaintext credentials in config.json to encrypted form')
        }
      }
    } catch (err) {
      logger.warn('[safeStorage] migration check failed (non-fatal):', err.message)
    }

    const sanitizeProvider = (provider) => {
      const settings = { ...(provider?.settings || {}) }
      delete settings.temperature
      delete settings.topP
      if (settings.maxOutputTokens == null) settings.maxOutputTokens = 32768
      return { ...provider, settings }
    }
    let providers = saved.providers || []
    if (providers.length > 0) providers = providers.map(sanitizeProvider)
    const nonEmpty = Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== '' && v !== null && v !== undefined))
    const savedSandbox = saved.sandboxConfig || {}
    const result = {
      ...DEFAULT_CONFIG, ...nonEmpty, providers,
      utilityModel: { ...DEFAULT_CONFIG.utilityModel, ...saved.utilityModel },
      sandboxConfig: {
        ...DEFAULT_CONFIG.sandboxConfig, ...savedSandbox,
        sandboxAllowList: savedSandbox.sandboxAllowList || [],
        dangerBlockList: (savedSandbox.dangerBlockList && savedSandbox.dangerBlockList.length > 0) ? savedSandbox.dangerBlockList : DEFAULT_CONFIG.sandboxConfig.dangerBlockList,
      },
    }
    logger.info('store:get-config', { providersCount: result.providers?.length || 0, hasOpenRouterKey: providers.some(pp => pp.type === 'openrouter' && pp.apiKey), defaultProvider: result.defaultProvider })
    return result
  })

  ipcMain.handle('store:save-config', (_, config) => {
    delete config.dataPath
    delete config.obsidianVaultPath
    const existing = ds.readJSON(p().CONFIG_FILE, {})
    const merged = {
      ...existing, ...config,
      providers: config.providers || existing.providers || [],
      smtp: { ...(existing.smtp || {}), ...(config.smtp || {}) },
    }
    ds.writeJSON(p().CONFIG_FILE, merged)
    return true
  })

  ipcMain.handle('store:test-smtp', async (_, smtpConfig) => {
    try {
      const nodemailer = require('nodemailer')
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host, port: smtpConfig.port || 587, secure: false, requireTLS: true,
        auth: { user: smtpConfig.user, pass: smtpConfig.pass }, tls: { rejectUnauthorized: false },
      })
      await transporter.verify()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('store:get-data-path', () => ({
    dataPath: p().DATA_DIR, defaultDataPath: p().DEFAULT_DATA_PATH, platform: process.platform,
  }))

  ipcMain.handle('store:save-data-path', (_, newDataPath) => {
    try {
      // Write dataPath to the fixed settings.json (pointer file, outside DATA_DIR)
      const trimmed = (newDataPath || '').trim()
      const settings = (trimmed && trimmed !== p().DEFAULT_DATA_PATH)
        ? { dataPath: trimmed }
        : {}
      ds.writeJSON(p().SETTINGS_FILE, settings)
      logger.info('Saved dataPath to settings.json:', trimmed || '(default)')
      return { success: true }
    } catch (err) {
      logger.error('Failed to save dataPath to settings.json:', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:relaunch', () => {
    const { app } = require('electron')
    app.relaunch()
    app.quit()
  })

  ipcMain.handle('store:get-env-paths', () => ds.getEnvPaths())

  ipcMain.handle('store:save-env-path', (_, key, value) => {
    const allowed = ['skillsPath', 'DoCPath', 'artifactPath']
    if (!allowed.includes(key)) return { success: false, error: 'Unknown path key' }
    try {
      const existing = ds.readJSON(p().CONFIG_FILE, {})
      existing[key] = value
      ds.writeJSON(p().CONFIG_FILE, existing)
      return { success: true }
    } catch (err) {
      logger.error(`Failed to save ${key} to config.json:`, err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('store:get-agents', async () => {
    const { getInstance: getAgentStore } = require('../agent/AgentStore')
    const store = getAgentStore(p().DATA_DIR)
    return {
      agents: {
        items:      store.getByKind('system'),
        categories: store.getCategoriesByKind('system'),
      },
      personas: {
        items:      store.getByKind('user'),
        categories: store.getCategoriesByKind('user'),
      },
    }
  })
  ipcMain.handle('store:save-agents', async (_, data) => {
    const { getInstance: getAgentStore } = require('../agent/AgentStore')
    const store = getAgentStore(p().DATA_DIR)
    // The renderer pushes the full bag; we replace each kind atomically.
    // import_artifacts is NOT touched here — it has its own write path via
    // the agent:import-write-* handlers in agentImport.js.
    store.replaceKind('system', data?.agents?.items   || [], data?.agents?.categories   || [])
    store.replaceKind('user',   data?.personas?.items || [], data?.personas?.categories || [])
    return true
  })
}

module.exports = { register, accumulateUsage }
