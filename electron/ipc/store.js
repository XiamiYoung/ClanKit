/**
 * IPC handlers for chat/config/agent persistence.
 * Channels: store:*
 */
const path = require('path')
const fs = require('fs')
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')

// -- Segment archiving --------------------------------------------------------
const SEGMENT_HOT_COUNT = 100
const SEGMENT_SIZE = 100

async function archiveOldSegments(chat) {
  if (!chat.messages || chat.messages.length <= SEGMENT_HOT_COUNT) return
  const { CHATS_DIR } = ds.paths()
  const toArchive = chat.messages.slice(0, chat.messages.length - SEGMENT_HOT_COUNT)
  chat.messages = chat.messages.slice(chat.messages.length - SEGMENT_HOT_COUNT)
  let maxSeg = chat.segmentCount || 0
  for (let i = 0; i < toArchive.length; i += SEGMENT_SIZE) {
    maxSeg++
    const batch = toArchive.slice(i, i + SEGMENT_SIZE)
    const segFile = path.join(CHATS_DIR, `${chat.id}.seg.${maxSeg}.json`)
    if (!fs.existsSync(segFile)) {
      await ds.writeJSONAtomic(segFile, { chatId: chat.id, segIndex: maxSeg, messages: batch })
    }
  }
  chat.segmentCount = maxSeg
}

// -- Usage accumulation (exported for use by ipc/agent.js) --------------------
async function accumulateUsage(chatId, metrics, provider, model) {
  if (!chatId || !metrics) return
  const file = path.join(ds.paths().CHATS_DIR, `${chatId}.json`)
  let chat
  try { chat = await ds.readJSONAsync(file, null) } catch { return }
  if (!chat) return

  const u = chat.usage || {}
  chat.usage = {
    inputTokens:         (u.inputTokens         || 0) + (metrics.inputTokens         || 0),
    outputTokens:        (u.outputTokens        || 0) + (metrics.outputTokens        || 0),
    cacheCreationTokens: (u.cacheCreationTokens || 0) + (metrics.cacheCreationTokens || 0),
    cacheReadTokens:     (u.cacheReadTokens     || 0) + (metrics.cacheReadTokens     || 0),
    voiceInputTokens:    (u.voiceInputTokens    || 0) + (metrics.voiceInputTokens    || 0),
    voiceOutputTokens:   (u.voiceOutputTokens   || 0) + (metrics.voiceOutputTokens   || 0),
    whisperCalls:        (u.whisperCalls        || 0) + (metrics.whisperCalls        || 0),
    whisperSecs:         (u.whisperSecs         || 0) + (metrics.whisperSecs         || 0),
    ttsChars:            (u.ttsChars            || 0) + (metrics.ttsChars            || 0),
  }
  if (provider && !chat.provider) chat.provider = provider
  if (model     && !chat.model)   chat.model     = model
  try { await ds.writeJSONAtomic(file, chat) } catch (err) {
    logger.warn('accumulateUsage write failed', err.message)
  }
}

async function accumulateUtilityUsage(model, provider, inputTokens, outputTokens) {
  if (!model || (!inputTokens && !outputTokens)) return
  try {
    const existing = await ds.readJSONAsync(ds.paths().UTILITY_USAGE_FILE, { model, provider, inputTokens: 0, outputTokens: 0 })
    const updated = {
      model, provider: provider || existing.provider || '',
      inputTokens:  (existing.inputTokens  || 0) + (inputTokens  || 0),
      outputTokens: (existing.outputTokens || 0) + (outputTokens || 0),
    }
    await ds.writeJSONAtomic(ds.paths().UTILITY_USAGE_FILE, updated)
  } catch (err) {
    logger.warn('accumulateUtilityUsage write failed', err.message)
  }
}

function register({ DEFAULT_CONFIG }) {
  const p = () => ds.paths()

  ipcMain.handle('store:get-chat-index', async () => ds.readJSONAsync(p().CHATS_INDEX_FILE, []))

  ipcMain.handle('store:save-chat-index', async (_, index) => {
    await ds.writeJSONAtomic(p().CHATS_INDEX_FILE, index)
    return true
  })

  ipcMain.handle('store:get-chat', async (_, chatId) => {
    const file = path.join(p().CHATS_DIR, `${chatId}.json`)
    return ds.readJSONAsync(file, null)
  })

  ipcMain.handle('store:get-chat-segments', async (_, { chatId, fromSeg, toSeg }) => {
    const messages = []
    for (let i = fromSeg; i <= toSeg; i++) {
      const segFile = path.join(p().CHATS_DIR, `${chatId}.seg.${i}.json`)
      const seg = await ds.readJSONAsync(segFile, null)
      if (seg && seg.messages) messages.push(...seg.messages)
    }
    return messages
  })

  ipcMain.handle('store:save-chat', async (_, chat) => {
    if (!chat || !chat.id) return false
    const existing = await ds.readJSONAsync(path.join(p().CHATS_DIR, `${chat.id}.json`), null)
    if (existing) {
      if (chat.usage == null && existing.usage) chat.usage = existing.usage
      if (!chat.model    && existing.model)    chat.model    = existing.model
      if (!chat.provider && existing.provider) chat.provider = existing.provider
      if (existing.usage && chat.usage) {
        const VOICE_KEYS = ['whisperCalls', 'whisperSecs', 'voiceInputTokens', 'voiceOutputTokens']
        for (const k of VOICE_KEYS) {
          if ((existing.usage[k] || 0) > (chat.usage[k] || 0)) chat.usage[k] = existing.usage[k]
        }
      }
      if (existing.segmentCount && !chat.segmentCount) chat.segmentCount = existing.segmentCount
    }
    await archiveOldSegments(chat)
    await ds.writeJSONAtomic(path.join(p().CHATS_DIR, `${chat.id}.json`), chat)
    return true
  })

  ipcMain.handle('store:delete-chat', async (_, chatId) => {
    const file = path.join(p().CHATS_DIR, `${chatId}.json`)
    try { await fs.promises.unlink(file) } catch {}
    const index = await ds.readJSONAsync(p().CHATS_INDEX_FILE, [])
    const filtered = index.filter(e => e.id !== chatId)
    await ds.writeJSONAtomic(p().CHATS_INDEX_FILE, filtered)
    return true
  })

  ipcMain.handle('store:get-chats', async () => {
    const index = await ds.readJSONAsync(p().CHATS_INDEX_FILE, null)
    if (index === null) return ds.readJSON(p().CHATS_FILE, [])
    const chats = []
    for (const entry of index) {
      const chat = await ds.readJSONAsync(path.join(p().CHATS_DIR, `${entry.id}.json`), null)
      if (chat) chats.push(chat)
    }
    return chats
  })

  ipcMain.handle('store:save-chats', async (_, chats) => {
    if (!fs.existsSync(p().CHATS_DIR)) fs.mkdirSync(p().CHATS_DIR, { recursive: true })
    const index = []
    for (const chat of chats) {
      if (!chat.id) continue
      await ds.writeJSONAtomic(path.join(p().CHATS_DIR, `${chat.id}.json`), chat)
      index.push(ds.chatMetaFromChat(chat))
    }
    await ds.writeJSONAtomic(p().CHATS_INDEX_FILE, index)
    return true
  })

  ipcMain.handle('store:get-config', () => {
    const saved = ds.readJSON(p().CONFIG_FILE, {})
    const sanitizeProvider = (provider) => {
      const settings = { ...(provider?.settings || {}) }
      delete settings.temperature
      delete settings.topP
      if (settings.maxOutputTokens == null) settings.maxOutputTokens = 32768
      return { ...provider, settings }
    }
    let providers = saved.providers || []
    if (providers.length > 0) providers = providers.map(sanitizeProvider)
    if (providers.length === 0 && process.env.ANTHROPIC_API_KEY) {
      // Seed from environment variables on fresh install
      const { v4: uuidv4 } = require('uuid')
      providers.push({ id: uuidv4(), name: 'Anthropic', type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com', model: 'claude-sonnet-4-5', settings: { maxOutputTokens: 32768, opusModel: 'claude-opus-4-6', haikuModel: 'claude-haiku-4-5' }, isActive: true, testedAt: null })
    }
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
      smtp:       { ...(existing.smtp || {}),       ...(config.smtp || {}) },
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

  ipcMain.handle('store:get-utility-usage', async () => ds.readJSONAsync(p().UTILITY_USAGE_FILE, null))

  ipcMain.handle('store:save-data-path', (_, newDataPath) => {
    try {
      const envPath = path.join(p().DATA_DIR, '.env')
      let lines = []
      if (fs.existsSync(envPath)) lines = fs.readFileSync(envPath, 'utf8').split('\n')
      let found = false
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('CLANKAI_DATA_PATH=')) { lines[i] = `CLANKAI_DATA_PATH=${newDataPath}`; found = true; break }
      }
      if (!found) lines.push('# Data directory for ClankAI', `CLANKAI_DATA_PATH=${newDataPath}`)
      fs.writeFileSync(envPath, lines.join('\n'), 'utf8')
      logger.info('Saved CLANKAI_DATA_PATH to .env:', newDataPath)
      return { success: true }
    } catch (err) {
      logger.error('Failed to save CLANKAI_DATA_PATH to .env:', err.message)
      return { success: false, error: err.message }
    }
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

  ipcMain.handle('store:get-agents', async () => ds.readJSONAsync(p().AGENTS_FILE, { categories: [], agents: [] }))
  ipcMain.handle('store:save-agents', (_, data) => { ds.writeJSON(p().AGENTS_FILE, data); return true })
}

module.exports = { register, accumulateUsage, accumulateUtilityUsage }
