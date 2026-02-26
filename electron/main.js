const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')

// Point Chromium's fontconfig at our bundled fonts.conf BEFORE electron is
// required — this is the only hook that runs before Chromium initialises its
// font subsystem. On Linux/WSL2 this makes Segoe UI Emoji available so the
// renderer can display emoji without any user system changes.
if (process.platform === 'linux') {
  process.env.FONTCONFIG_FILE = path.join(__dirname, 'fonts.conf')
}

const { app, BrowserWindow, ipcMain, dialog, shell, screen, protocol, net, session } = require('electron')
const os = require('os')
const { execFile } = require('child_process')
const { logger, LOG_DIR } = require('./logger')

// Load .env into the Electron main process using a direct parser.
// dotenv v17 has ESM-first issues in Electron; plain fs is 100% reliable.
// Supports multi-line JSON values (brace-balanced accumulation).
;(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envFile)) return
  const lines = fs.readFileSync(envFile, 'utf8').split('\n')
  let pendingKey = null
  let pendingVal = ''
  let braceDepth = 0

  function commitPending() {
    if (pendingKey) {
      process.env[pendingKey] = pendingVal.trim()
      pendingKey = null
      pendingVal = ''
      braceDepth = 0
    }
  }

  for (const line of lines) {
    // If accumulating a multi-line value, keep appending
    if (pendingKey && braceDepth > 0) {
      pendingVal += '\n' + line
      for (const ch of line) {
        if (ch === '{' || ch === '[') braceDepth++
        else if (ch === '}' || ch === ']') braceDepth--
      }
      if (braceDepth <= 0) commitPending()
      continue
    }

    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()

    // Check if value starts a multi-line JSON block
    if (val.startsWith('{') || val.startsWith('[')) {
      pendingKey = key
      pendingVal = val
      braceDepth = 0
      for (const ch of val) {
        if (ch === '{' || ch === '[') braceDepth++
        else if (ch === '}' || ch === ']') braceDepth--
      }
      if (braceDepth <= 0) {
        commitPending()
      }
      // else keep accumulating on next lines
    } else {
      process.env[key] = val
    }
  }
  // Flush anything left (malformed, but don't lose it)
  commitPending()
})()

logger.info('=== SparkAI starting ===')

// Dev mode: run-electron.js sets ELECTRON_DEV=true
const isDev = process.env.ELECTRON_DEV === 'true'

// ─── Storage ────────────────────────────────────────────────────────────────
const DEFAULT_DATA_PATH = path.join(os.homedir(), '.sparkai')
const DATA_DIR = process.env.SPARKAI_DATA_PATH || DEFAULT_DATA_PATH
const CHATS_FILE = path.join(DATA_DIR, 'chats.json')
const CHATS_DIR = path.join(DATA_DIR, 'chats')
const CHATS_INDEX_FILE = path.join(CHATS_DIR, 'index.json')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
const PERSONAS_FILE = path.join(DATA_DIR, 'personas.json')
const MCP_SERVERS_FILE = path.join(DATA_DIR, 'mcp-servers.json')
const TOOLS_FILE = path.join(DATA_DIR, 'tools.json')
const SOULS_DIR = path.join(DATA_DIR, 'souls')
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge.json')
const ENV_FILE = path.join(__dirname, '..', '.env')

const OLD_DATA_DIR = path.join(os.homedir(), '.maestro-agent')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

  // Migrate data from old .maestro-agent directory if new directory is empty
  if (fs.existsSync(OLD_DATA_DIR)) {
    for (const file of ['chats.json', 'config.json']) {
      const oldFile = path.join(OLD_DATA_DIR, file)
      const newFile = path.join(DATA_DIR, file)
      if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
        try {
          fs.copyFileSync(oldFile, newFile)
          logger.info(`Migrated ${file} from .maestro-agent to .sparkai`)
        } catch (err) {
          logger.error(`Failed to migrate ${file}:`, err.message)
        }
      }
    }
  }
}

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  return fallback
}

function writeJSON(file, data) {
  ensureDataDir()
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

// ─── Atomic async JSON write (write to unique .tmp then rename) ───────────────
async function writeJSONAtomic(file, data) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = file + `.tmp.${process.pid}.${Date.now()}`
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.promises.rename(tmp, file)
}

async function readJSONAsync(file, fallback) {
  try {
    const raw = await fs.promises.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

// ─── Chat index helpers ──────────────────────────────────────────────────────
function chatMetaFromChat(chat) {
  const { messages, ...meta } = chat
  return meta
}

// ─── Migration: monolithic chats.json → per-chat files ───────────────────────
async function migrateChatsIfNeeded() {
  const chatsDir = CHATS_DIR
  const indexFile = CHATS_INDEX_FILE
  const oldFile = CHATS_FILE

  if (fs.existsSync(chatsDir) && fs.existsSync(indexFile)) {
    // Already migrated — clean up any leftover .tmp files
    try {
      const files = await fs.promises.readdir(chatsDir)
      for (const f of files) {
        if (f.endsWith('.tmp')) {
          await fs.promises.unlink(path.join(chatsDir, f)).catch(() => {})
        }
      }
    } catch {}
    return
  }

  if (!fs.existsSync(chatsDir)) {
    fs.mkdirSync(chatsDir, { recursive: true })
  }

  if (fs.existsSync(oldFile)) {
    // Migrate from monolithic file
    try {
      const allChats = JSON.parse(fs.readFileSync(oldFile, 'utf8'))
      if (Array.isArray(allChats)) {
        const index = []
        for (const chat of allChats) {
          if (!chat.id) continue
          await writeJSONAtomic(path.join(chatsDir, `${chat.id}.json`), chat)
          index.push(chatMetaFromChat(chat))
        }
        await writeJSONAtomic(indexFile, index)
        // Backup old file
        await fs.promises.rename(oldFile, oldFile + '.backup')
        logger.info(`Migrated ${index.length} chats from chats.json to chats/ directory`)
      }
    } catch (err) {
      logger.error('Chat migration failed:', err.message)
      // If migration fails, create empty index so app still works
      if (!fs.existsSync(indexFile)) {
        await writeJSONAtomic(indexFile, [])
      }
    }
  } else {
    // Fresh install — create empty index
    await writeJSONAtomic(indexFile, [])
  }
}

// ─── Migration: .env user data → JSON files ──────────────────────────────────
async function migrateEnvDataIfNeeded() {
  // a) Migrate config values from .env → config.json (one-time seed)
  const cfg = readJSON(CONFIG_FILE, {})
  // Migrate flat keys → nested structure if config still has old flat layout
  if (cfg.apiKey || cfg.openrouterApiKey || cfg.openaiApiKey) {
    if (!cfg.anthropic) cfg.anthropic = {}
    if (!cfg.openrouter) cfg.openrouter = {}
    if (!cfg.openai) cfg.openai = {}
    const flatToNested = {
      apiKey:       ['anthropic', 'apiKey'],
      baseURL:      ['anthropic', 'baseURL'],
      sonnetModel:  ['anthropic', 'sonnetModel'],
      opusModel:    ['anthropic', 'opusModel'],
      haikuModel:   ['anthropic', 'haikuModel'],
      activeModel:  ['anthropic', 'activeModel'],
      openrouterApiKey:      ['openrouter', 'apiKey'],
      openrouterBaseURL:     ['openrouter', 'baseURL'],
      openrouterDefaultModel:['openrouter', 'defaultModel'],
      openaiApiKey:          ['openai', 'apiKey'],
      openaiBaseURL:         ['openai', 'baseURL'],
      openaiModel:           ['openai', 'model'],
      openaiDefaultModel:    ['openai', 'openaiDefaultModel'],
    }
    let migrated = false
    for (const [flatKey, [group, nestedKey]] of Object.entries(flatToNested)) {
      if (cfg[flatKey] !== undefined && cfg[flatKey] !== '') {
        if (!cfg[group][nestedKey]) {
          cfg[group][nestedKey] = cfg[flatKey]
          migrated = true
        }
        delete cfg[flatKey]
      }
    }
    if (migrated) {
      writeJSON(CONFIG_FILE, cfg)
      logger.info('Migrated flat config keys to nested provider structure')
    }
  }
  if (!cfg.anthropic?.apiKey) {
    let changed = false
    // Env → nested config migration
    const envMap = {
      'anthropic.apiKey':      'ANTHROPIC_API_KEY',
      'anthropic.baseURL':     'ANTHROPIC_BASE_URL',
      'anthropic.sonnetModel': 'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'anthropic.opusModel':   'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'anthropic.haikuModel':  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'openrouter.apiKey':     'OPENROUTER_API_KEY',
      'openrouter.baseURL':    'OPENROUTER_BASE_URL',
      'openai.apiKey':         'OPENAI_API_KEY',
      'openai.baseURL':        'OPENAI_BASE_URL',
      systemPrompt:            'SPARK_SYSTEM_PROMPT',
      obsidianVaultPath:       'OBSIDIAN_VAULT_PATH',
      pineconeApiKey:          'PINECONE_API_KEY'
    }
    if (!cfg.anthropic)  cfg.anthropic = {}
    if (!cfg.openrouter) cfg.openrouter = {}
    if (!cfg.openai)     cfg.openai = {}
    for (const [cfgPath, envKey] of Object.entries(envMap)) {
      const envVal = process.env[envKey]
      if (!envVal) continue
      if (cfgPath.includes('.')) {
        const [group, key] = cfgPath.split('.')
        if (!cfg[group][key]) { cfg[group][key] = envVal; changed = true }
      } else {
        if (!cfg[cfgPath]) { cfg[cfgPath] = envVal; changed = true }
      }
    }
    // Also migrate pineconeApiKey from knowledge.json (old location) → config.json
    const knowledge = readJSON(KNOWLEDGE_FILE, {})
    if (knowledge.pineconeApiKey && !cfg.pineconeApiKey) {
      cfg.pineconeApiKey = knowledge.pineconeApiKey
      delete knowledge.pineconeApiKey
      writeJSON(KNOWLEDGE_FILE, knowledge)
      changed = true
    }
    if (changed) {
      writeJSON(CONFIG_FILE, cfg)
      logger.info('Migrated env/user data into config.json')
    }
  } else {
    // Config already has anthropic.apiKey — still check if pineconeApiKey needs moving from knowledge.json
    const knowledge = readJSON(KNOWLEDGE_FILE, {})
    if (knowledge.pineconeApiKey) {
      if (!cfg.pineconeApiKey) cfg.pineconeApiKey = knowledge.pineconeApiKey
      delete knowledge.pineconeApiKey
      writeJSON(KNOWLEDGE_FILE, knowledge)
      writeJSON(CONFIG_FILE, cfg)
      logger.info('Migrated pineconeApiKey from knowledge.json to config.json')
    }
  }

  // b) Migrate MCP_SERVERS env var → mcp-servers.json
  const mcpData = readJSON(MCP_SERVERS_FILE, null)
  if ((mcpData === null || (typeof mcpData === 'object' && Object.keys(mcpData).length === 0)) && process.env.MCP_SERVERS) {
    try {
      const parsed = JSON.parse(process.env.MCP_SERVERS)
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        writeJSON(MCP_SERVERS_FILE, parsed)
        logger.info('Migrated MCP_SERVERS from .env to mcp-servers.json')
      }
    } catch (err) {
      logger.error('Failed to parse MCP_SERVERS env var:', err.message)
    }
  }

  // c) Migrate HTTP_TOOLS env var → tools.json
  const toolsData = readJSON(TOOLS_FILE, null)
  if (toolsData === null && process.env.HTTP_TOOLS) {
    try {
      const parsed = JSON.parse(process.env.HTTP_TOOLS)
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        writeJSON(TOOLS_FILE, parsed)
        logger.info('Migrated HTTP_TOOLS from .env to tools.json')
      }
    } catch (err) {
      logger.error('Failed to parse HTTP_TOOLS env var:', err.message)
    }
  }

  // d) Migrate dataPath from config.json → .env (one-time)
  const cfgForDp = readJSON(CONFIG_FILE, {})
  if (cfgForDp.dataPath && cfgForDp.dataPath !== DEFAULT_DATA_PATH) {
    // Write to .env if not already there
    if (!process.env.SPARKAI_DATA_PATH) {
      let envLines = []
      if (fs.existsSync(ENV_FILE)) {
        envLines = fs.readFileSync(ENV_FILE, 'utf8').split('\n')
      }
      const hasLine = envLines.some(l => l.trim().startsWith('SPARKAI_DATA_PATH='))
      if (!hasLine) {
        envLines.push('# Data directory for SparkAI', `SPARKAI_DATA_PATH=${cfgForDp.dataPath}`)
        fs.writeFileSync(ENV_FILE, envLines.join('\n'), 'utf8')
        logger.info('Migrated dataPath from config.json to .env:', cfgForDp.dataPath)
      }
    }
    // Remove dataPath from config.json
    delete cfgForDp.dataPath
    writeJSON(CONFIG_FILE, cfgForDp)
    logger.info('Removed dataPath from config.json (now lives in .env)')
  } else if (cfgForDp.dataPath) {
    // It was the default — just remove it from config.json, no need to write to .env
    delete cfgForDp.dataPath
    writeJSON(CONFIG_FILE, cfgForDp)
  }
}

// ─── Default Data ───────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  anthropic: {
    apiKey:       '',
    baseURL:      'https://api.anthropic.com',
    sonnetModel:  'claude-sonnet-4-5',
    opusModel:    'claude-opus-4-6',
    haikuModel:   'claude-haiku-3-5',
    activeModel:  'sonnet',
  },
  openrouter: {
    apiKey:  '',
    baseURL: 'https://openrouter.ai/api',
    defaultModel: '',
  },
  openai: {
    apiKey:       '',
    baseURL:      'https://mlaas.virtuosgames.com',
    model:        '',
    openaiDefaultModel: '',
  },
  skillsPath:   '',
  defaultProvider:   'anthropic',
  systemPrompt:      '',
  obsidianVaultPath: '',
  pineconeApiKey:    '',
  newsFeeds: []
}


// ─── Main Window ────────────────────────────────────────────────────────────
let mainWindow

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const winW = Math.round(screenW * 4 / 5)
  const winH = Math.round(screenH * 4 / 5)

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round((screenW - winW) / 2),
    y: Math.round((screenH - winH) / 2),
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })

  // ── Prevent Electron from navigating away from the app ──
  // Block ALL navigations that would leave the SPA. file:// drops are forwarded
  // as attachments; http(s) links are opened in the system browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow same-origin dev-server reloads
    const currentURL = mainWindow.webContents.getURL()
    if (currentURL && url.startsWith(new URL(currentURL).origin)) return

    event.preventDefault()

    if (url.startsWith('file://')) {
      logger.info('Intercepted file drop navigation:', url)
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-dropped', url)
      }
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      logger.info('Intercepted external link navigation, opening in browser:', url)
      shell.openExternal(url).catch(err => logger.error('openExternal failed:', err.message))
    } else {
      logger.warn('Blocked navigation to unsupported URL:', url)
    }
  })
}

// Register vault-asset:// protocol to serve local vault files (images, etc.)
// Must be registered before app is ready.
protocol.registerSchemesAsPrivileged([{
  scheme: 'vault-asset',
  privileges: { bypassCSP: true, supportFetchAPI: true, stream: true }
}])

app.whenReady().then(async () => {
  // Handle vault-asset:// requests → serve files from disk
  // URL format: vault-asset:///absolute/path/to/file
  protocol.handle('vault-asset', (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname)
    return net.fetch('file://' + filePath)
  })

  ensureDataDir()
  await migrateChatsIfNeeded()
  await migrateEnvDataIfNeeded()
  createWindow()

  // ── Content Security Policy ──
  // Only apply restrictive CSP to the app's own pages, not to external sites
  // loaded inside <webview> (they need their own CSS/JS/fonts to render properly).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || ''
    const isAppPage = url.startsWith('http://localhost:') || url.startsWith('file://')
    if (isAppPage) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self';" +
            " script-src 'self';" +
            " style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
            " font-src 'self' data: https://fonts.gstatic.com;" +
            " img-src 'self' data: blob: https: vault-asset:;" +
            " connect-src 'self' https: http://localhost:* ws://localhost:*;" +
            " media-src 'self' data: blob:;" +
            " worker-src 'self' blob:;"
          ]
        }
      })
    } else {
      callback({ responseHeaders: details.responseHeaders })
    }
  })

  logger.info('Window created. Log dir:', LOG_DIR)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  mcpManager.stopAll().catch(err => logger.error('MCP cleanup error:', err.message))
})

// ─── IPC: Storage ───────────────────────────────────────────────────────────

// ── Per-chat granular operations ─────────────────────────────────────────────
ipcMain.handle('store:get-chat-index', async () => {
  return readJSONAsync(CHATS_INDEX_FILE, [])
})

ipcMain.handle('store:save-chat-index', async (_, index) => {
  await writeJSONAtomic(CHATS_INDEX_FILE, index)
  return true
})

ipcMain.handle('store:get-chat', async (_, chatId) => {
  const file = path.join(CHATS_DIR, `${chatId}.json`)
  return readJSONAsync(file, null)
})

ipcMain.handle('store:save-chat', async (_, chat) => {
  if (!chat || !chat.id) return false
  // Write the per-chat file atomically
  await writeJSONAtomic(path.join(CHATS_DIR, `${chat.id}.json`), chat)
  // Update the index entry
  const index = await readJSONAsync(CHATS_INDEX_FILE, [])
  const meta = chatMetaFromChat(chat)
  const idx = index.findIndex(e => e.id === chat.id)
  if (idx >= 0) {
    index[idx] = meta
  } else {
    index.unshift(meta)
  }
  await writeJSONAtomic(CHATS_INDEX_FILE, index)
  return true
})

ipcMain.handle('store:delete-chat', async (_, chatId) => {
  // Remove per-chat file
  const file = path.join(CHATS_DIR, `${chatId}.json`)
  try { await fs.promises.unlink(file) } catch {}
  // Remove from index
  const index = await readJSONAsync(CHATS_INDEX_FILE, [])
  const filtered = index.filter(e => e.id !== chatId)
  await writeJSONAtomic(CHATS_INDEX_FILE, filtered)
  return true
})

// ── Backward-compatible bulk operations (reads per-chat files) ───────────────
ipcMain.handle('store:get-chats', async () => {
  const index = await readJSONAsync(CHATS_INDEX_FILE, null)
  if (index === null) {
    // Fallback: no migration yet, read old monolithic file
    return readJSON(CHATS_FILE, [])
  }
  const chats = []
  for (const entry of index) {
    const chat = await readJSONAsync(path.join(CHATS_DIR, `${entry.id}.json`), null)
    if (chat) chats.push(chat)
  }
  return chats
})

ipcMain.handle('store:save-chats', async (_, chats) => {
  if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR, { recursive: true })
  const index = []
  for (const chat of chats) {
    if (!chat.id) continue
    await writeJSONAtomic(path.join(CHATS_DIR, `${chat.id}.json`), chat)
    index.push(chatMetaFromChat(chat))
  }
  await writeJSONAtomic(CHATS_INDEX_FILE, index)
  return true
})

ipcMain.handle('store:get-config', () => {
  const saved = readJSON(CONFIG_FILE, {})
  // Only let saved non-empty values override defaults (top-level scalars).
  const nonEmpty = Object.fromEntries(
    Object.entries(saved).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
  const result = {
    ...DEFAULT_CONFIG,
    ...nonEmpty,
    anthropic:  { ...DEFAULT_CONFIG.anthropic,  ...saved.anthropic },
    openrouter: { ...DEFAULT_CONFIG.openrouter, ...saved.openrouter },
    openai:     { ...DEFAULT_CONFIG.openai,     ...saved.openai },
  }
  logger.info('store:get-config', {
    baseURL: result.anthropic?.baseURL,
    hasApiKey: !!(result.anthropic?.apiKey),
    apiKeyPrefix: result.anthropic?.apiKey ? result.anthropic.apiKey.slice(0, 8) + '…' : '(empty)',
    sonnetModel: result.anthropic?.sonnetModel,
    activeModel: result.anthropic?.activeModel,
    defaultProvider: result.defaultProvider,
    hasOpenRouterKey: !!(result.openrouter?.apiKey),
    openrouterBaseURL: result.openrouter?.baseURL
  })
  return result
})
ipcMain.handle('store:save-config', (_, config) => {
  delete config.dataPath  // dataPath lives in .env, not config.json
  // Read-merge-write: merge incoming config into existing file to avoid
  // clobbering keys that the renderer didn't modify (e.g. newsFeeds).
  const existing = readJSON(CONFIG_FILE, {})
  const merged = {
    ...existing,
    ...config,
    // Deep-merge nested provider objects
    anthropic:  { ...(existing.anthropic || {}),  ...(config.anthropic || {}) },
    openrouter: { ...(existing.openrouter || {}), ...(config.openrouter || {}) },
    openai:     { ...(existing.openai || {}),     ...(config.openai || {}) },
  }
  writeJSON(CONFIG_FILE, merged)
  return true
})

ipcMain.handle('store:get-data-path', () => ({
  dataPath: DATA_DIR,
  defaultDataPath: DEFAULT_DATA_PATH,
  platform: process.platform,
}))

// Save SPARKAI_DATA_PATH to .env file
ipcMain.handle('store:save-data-path', (_, newDataPath) => {
  try {
    const envPath = ENV_FILE
    let lines = []
    if (fs.existsSync(envPath)) {
      lines = fs.readFileSync(envPath, 'utf8').split('\n')
    }
    // Replace or append SPARKAI_DATA_PATH
    let found = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('SPARKAI_DATA_PATH=')) {
        lines[i] = `SPARKAI_DATA_PATH=${newDataPath}`
        found = true
        break
      }
    }
    if (!found) {
      lines.push('# Data directory for SparkAI', `SPARKAI_DATA_PATH=${newDataPath}`)
    }
    fs.writeFileSync(envPath, lines.join('\n'), 'utf8')
    logger.info('Saved SPARKAI_DATA_PATH to .env:', newDataPath)
    return { success: true }
  } catch (err) {
    logger.error('Failed to save SPARKAI_DATA_PATH to .env:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('store:get-personas', () => readJSON(PERSONAS_FILE, []))
ipcMain.handle('store:save-personas', (_, personas) => { writeJSON(PERSONAS_FILE, personas); return true })

// ─── IPC: Soul Memory Files ─────────────────────────────────────────────────
function ensureSoulsDir(type) {
  const dir = path.join(SOULS_DIR, type)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

ipcMain.handle('souls:read', (_, personaId, type) => {
  try {
    const filePath = path.join(ensureSoulsDir(type), `${personaId}.md`)
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    logger.error('souls:read error', err.message)
    return null
  }
})

ipcMain.handle('souls:write', (_, personaId, type, content) => {
  try {
    const filePath = path.join(ensureSoulsDir(type), `${personaId}.md`)
    fs.writeFileSync(filePath, content, 'utf8')
    return { success: true }
  } catch (err) {
    logger.error('souls:write error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('souls:exists', (_, personaId, type) => {
  try {
    const filePath = path.join(ensureSoulsDir(type), `${personaId}.md`)
    return fs.existsSync(filePath)
  } catch { return false }
})

ipcMain.handle('souls:list', (_, type) => {
  try {
    const dir = ensureSoulsDir(type)
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''))
  } catch (err) {
    logger.error('souls:list error', err.message)
    return []
  }
})

ipcMain.handle('souls:delete', (_, personaId, type) => {
  try {
    const filePath = path.join(ensureSoulsDir(type), `${personaId}.md`)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return { success: true }
  } catch (err) {
    logger.error('souls:delete error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── IPC: Memory Accept (post-turn extraction) ─────────────────────────────
const { SoulUpdateTool: SoulUpdateToolForMemory } = require('./agent/tools/SoulTool')
ipcMain.handle('memory:accept', async (_, { personaId, personaType, section, entry }) => {
  try {
    const tool = new SoulUpdateToolForMemory(SOULS_DIR)
    return await tool.execute({ persona_id: personaId, persona_type: personaType, section, action: 'add', entry })
  } catch (err) {
    logger.error('memory:accept error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── IPC: MCP Server Configuration (~/.sparkai/mcp-servers.json) ─────────────

ipcMain.handle('mcp:get-config', () => readJSON(MCP_SERVERS_FILE, {}))

ipcMain.handle('mcp:save-config', async (_, mcpServers) => {
  try {
    await writeJSONAtomic(MCP_SERVERS_FILE, mcpServers)
    return { success: true }
  } catch (err) {
    logger.error('mcp:save-config error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── IPC: HTTP Tools Configuration (~/.sparkai/tools.json) ───────────────────

ipcMain.handle('tools:get-config', () => readJSON(TOOLS_FILE, {}))

ipcMain.handle('tools:save-config', async (_, toolsConfig) => {
  try {
    await writeJSONAtomic(TOOLS_FILE, toolsConfig)
    return { success: true }
  } catch (err) {
    logger.error('tools:save-config error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── IPC: Knowledge / Pinecone RAG ──────────────────────────────────────────

ipcMain.handle('knowledge:get-config', () => {
  const cfg = readJSON(CONFIG_FILE, {})
  const saved = readJSON(KNOWLEDGE_FILE, {})
  return {
    pineconeApiKey:    cfg.pineconeApiKey || '',
    pineconeIndexName: saved.pineconeIndexName || '',
    ragEnabled:        saved.ragEnabled !== undefined ? saved.ragEnabled : true,
    embeddingProvider: saved.embeddingProvider || 'openai',
    embeddingModel:    saved.embeddingModel || 'text-embedding-3-small',
    indexConfigs:      saved.indexConfigs || {}
  }
})

ipcMain.handle('knowledge:save-config', async (_, config) => {
  try {
    // pineconeApiKey goes to config.json (with all other API keys)
    if (config.pineconeApiKey !== undefined) {
      const cfg = readJSON(CONFIG_FILE, {})
      cfg.pineconeApiKey = config.pineconeApiKey
      await writeJSONAtomic(CONFIG_FILE, cfg)
    }
    // index name, rag toggle, and embedding config stay in knowledge.json
    const saved = readJSON(KNOWLEDGE_FILE, {})
    if (config.pineconeIndexName !== undefined) saved.pineconeIndexName = config.pineconeIndexName
    if (config.ragEnabled !== undefined)        saved.ragEnabled = config.ragEnabled
    if (config.embeddingProvider !== undefined)  saved.embeddingProvider = config.embeddingProvider
    if (config.embeddingModel !== undefined)     saved.embeddingModel = config.embeddingModel
    if (config.indexConfigs !== undefined)       saved.indexConfigs = config.indexConfigs
    writeJSON(KNOWLEDGE_FILE, saved)
    return { success: true }
  } catch (err) {
    logger.error('knowledge:save-config error', err.message)
    return { success: false, error: err.message }
  }
})

// Verify API key by listing indexes (lightweight check)
ipcMain.handle('knowledge:verify-connection', async (_, { apiKey }) => {
  if (!apiKey) {
    return { success: false, error: 'API key is required' }
  }
  try {
    const https = require('https')
    const data = await new Promise((resolve, reject) => {
      const req = https.request('https://api.pinecone.io/indexes', {
        method: 'GET',
        headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
        timeout: 15000
      }, (res) => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`))
          } else {
            try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) }
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
      req.end()
    })
    const count = (data.indexes || []).length
    logger.info('knowledge:verify-connection success', { indexCount: count })
    return { success: true, message: `Connected — ${count} index${count !== 1 ? 'es' : ''} found` }
  } catch (err) {
    logger.error('knowledge:verify-connection error', err.message)
    return { success: false, error: err.message }
  }
})

// List all indexes for the given API key
ipcMain.handle('knowledge:list-indexes', async (_, { apiKey }) => {
  if (!apiKey) {
    return { success: false, error: 'API key is required', indexes: [] }
  }
  try {
    const https = require('https')
    const data = await new Promise((resolve, reject) => {
      const req = https.request('https://api.pinecone.io/indexes', {
        method: 'GET',
        headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
        timeout: 15000
      }, (res) => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`))
          } else {
            try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) }
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
      req.end()
    })
    const indexes = (data.indexes || []).map(idx => ({
      name: idx.name,
      dimension: idx.dimension,
      metric: idx.metric,
      host: idx.host,
      status: idx.status?.ready ? 'ready' : (idx.status?.state || 'unknown'),
      vectorCount: idx.status?.ready ? (idx.total_vector_count || 0) : 0
    }))
    logger.info('knowledge:list-indexes', { count: indexes.length })
    return { success: true, indexes }
  } catch (err) {
    logger.error('knowledge:list-indexes error', err.message)
    return { success: false, error: err.message, indexes: [] }
  }
})

// Describe a specific index (stats)
ipcMain.handle('knowledge:describe-index', async (_, { apiKey, indexName }) => {
  if (!apiKey || !indexName) {
    return { success: false, error: 'API key and index name are required' }
  }
  try {
    const https = require('https')
    const data = await new Promise((resolve, reject) => {
      const req = https.request(`https://api.pinecone.io/indexes/${indexName}`, {
        method: 'GET',
        headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
        timeout: 15000
      }, (res) => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`))
          } else {
            try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) }
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
      req.end()
    })
    // Extract region/cloud/type from spec
    const spec = data.spec || {}
    const serverless = spec.serverless || {}
    const cloud = serverless.cloud || ''
    const region = serverless.region || ''
    const vectorType = data.metric ? 'Dense' : 'Unknown'
    // Determine type from spec keys
    const indexType = spec.serverless ? 'Serverless' : spec.pod ? 'Pod' : 'Unknown'

    return {
      success: true,
      stats: {
        name: data.name,
        dimension: data.dimension,
        metric: data.metric,
        host: data.host,
        vectorCount: data.status?.ready ? (data.total_vector_count || 0) : 0,
        ready: !!data.status?.ready,
        cloud,
        region,
        indexType,
        vectorType
      }
    }
  } catch (err) {
    logger.error('knowledge:describe-index error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('knowledge:list-documents', async (_, { apiKey, indexName }) => {
  // Read local document metadata
  try {
    const docsFile = path.join(DATA_DIR, 'knowledge-docs.json')
    const docs = readJSON(docsFile, [])
    return { success: true, documents: docs }
  } catch (err) {
    logger.error('knowledge:list-documents error', err.message)
    return { success: false, error: err.message, documents: [] }
  }
})

// List unique source files from Pinecone vector metadata
ipcMain.handle('knowledge:list-sources', async (_, { apiKey, indexName }) => {
  if (!apiKey || !indexName) {
    return { success: false, error: 'API key and index name are required', sources: [] }
  }
  try {
    const info = await getPineconeIndexInfo(apiKey, indexName)
    const https = require('https')

    // Helper for HTTPS requests
    function httpsRequest(url, options, body) {
      return new Promise((resolve, reject) => {
        const req = https.request(url, { ...options, timeout: 15000 }, (res) => {
          let data = ''
          res.on('data', chunk => { data += chunk })
          res.on('end', () => {
            if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`))
            else {
              try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid JSON response')) }
            }
          })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
        if (body) req.write(body)
        req.end()
      })
    }

    let metadataEntries = []

    // Strategy 1: list vector IDs then fetch metadata
    try {
      const listData = await httpsRequest(`https://${info.host}/vectors/list?limit=100`, {
        method: 'GET',
        headers: { 'Api-Key': apiKey }
      })

      const vectorIds = (listData.vectors || []).map(v => v.id)
      if (vectorIds.length > 0) {
        // Fetch in batches of 30 to keep URL length reasonable
        const BATCH = 30
        for (let i = 0; i < Math.min(vectorIds.length, 90); i += BATCH) {
          const batch = vectorIds.slice(i, i + BATCH)
          const idsQuery = batch.map(id => `ids=${encodeURIComponent(id)}`).join('&')
          const fetchData = await httpsRequest(`https://${info.host}/vectors/fetch?${idsQuery}`, {
            method: 'GET',
            headers: { 'Api-Key': apiKey }
          })
          const vectors = fetchData.vectors || {}
          for (const [, vec] of Object.entries(vectors)) {
            if (vec.metadata) metadataEntries.push(vec.metadata)
          }
        }
      }
    } catch (listErr) {
      // Strategy 2 fallback: query with zero vector to get samples with metadata
      logger.warn('knowledge:list-sources list fallback, using query:', listErr.message)
      try {
        const dim = info.dimension || 512
        const zeroVec = new Array(dim).fill(0)
        const queryBody = JSON.stringify({ vector: zeroVec, topK: 100, includeMetadata: true })
        const queryData = await httpsRequest(`https://${info.host}/query`, {
          method: 'POST',
          headers: {
            'Api-Key': apiKey,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(queryBody)
          }
        }, queryBody)
        const matches = queryData.matches || []
        for (const m of matches) {
          if (m.metadata) metadataEntries.push(m.metadata)
        }
      } catch (queryErr) {
        logger.error('knowledge:list-sources query fallback failed:', queryErr.message)
      }
    }

    // Extract unique file/source names from metadata
    const sourceMap = new Map()
    for (const meta of metadataEntries) {
      const fileName = meta.documentName || meta.file || meta.source || 'Unknown'
      if (!sourceMap.has(fileName)) {
        sourceMap.set(fileName, { name: fileName, chunks: 0, documentId: meta.documentId || null })
      }
      sourceMap.get(fileName).chunks++
    }

    const sources = Array.from(sourceMap.values())
    logger.info('knowledge:list-sources', { indexName, sources: sources.length })
    return { success: true, sources }
  } catch (err) {
    logger.error('knowledge:list-sources error', err.message)
    return { success: false, error: err.message, sources: [] }
  }
})

ipcMain.handle('knowledge:pick-files', async () => {
  if (filePickerOpen) return []
  filePickerOpen = true
  try {
    if (IS_WSL) {
      try {
        const winPaths = await showWindowsFilePicker()
        if (winPaths.length === 0) return []
        return winPaths.map(wp => IS_WSL ? toWslPath(wp) : wp)
      } catch (err) {
        logger.error('Knowledge file picker (WSL) failed:', err.message)
      }
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select files to upload to Knowledge Base',
      filters: [
        { name: 'Documents', extensions: ['txt', 'md', 'pdf', 'json', 'csv', 'html', 'xml', 'yaml', 'yml'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths
  } finally {
    filePickerOpen = false
  }
})

ipcMain.handle('knowledge:upload-files', async (_, { apiKey, indexName, filePaths }) => {
  try {
    const docsFile = path.join(DATA_DIR, 'knowledge-docs.json')
    const docs = readJSON(docsFile, [])
    const knowledgeCfg = readJSON(KNOWLEDGE_FILE, {})
    const cfg = readJSON(CONFIG_FILE, {})
    const results = []

    // Resolve embedding config — prefer per-index config to stay consistent with RAG query
    const idxCfg = (knowledgeCfg.indexConfigs || {})[indexName] || {}
    const embProvider = idxCfg.embeddingProvider || knowledgeCfg.embeddingProvider || 'openai'
    const embModel = idxCfg.embeddingModel || knowledgeCfg.embeddingModel || 'text-embedding-3-small'
    const embApiKey = embProvider === 'openrouter' ? cfg.openrouter?.apiKey : cfg.openai?.apiKey
    const embBaseURL = embProvider === 'openrouter' ? cfg.openrouter?.baseURL : cfg.openai?.baseURL

    // Get Pinecone index host and dimension for upsert
    let indexHost = null
    let indexDimension = null
    try {
      const info = await getPineconeIndexInfo(apiKey, indexName)
      indexHost = info.host
      indexDimension = info.dimension
    } catch (err) {
      logger.error('Failed to get Pinecone index info:', err.message)
      return { success: false, error: `Failed to get index info: ${err.message}` }
    }

    for (const filePath of filePaths) {
      const resolvedPath = IS_WSL ? toWslPath(filePath) : filePath
      const name = path.basename(resolvedPath)
      const ext = path.extname(name).toLowerCase().replace('.', '')
      let content = ''
      let size = 0

      try {
        const stat = fs.statSync(resolvedPath)
        size = stat.size
        if (size > 10 * 1024 * 1024) {
          results.push({ name, error: 'File too large (max 10MB)' })
          continue
        }
        content = fs.readFileSync(resolvedPath, 'utf8')
      } catch (err) {
        results.push({ name, error: err.message })
        continue
      }

      // Split into chunks (simple chunking by paragraphs/lines)
      const chunks = []
      const paragraphs = content.split(/\n\n+/)
      let currentChunk = ''
      for (const para of paragraphs) {
        if ((currentChunk + para).length > 1000) {
          if (currentChunk.trim()) chunks.push(currentChunk.trim())
          currentChunk = para
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + para
        }
      }
      if (currentChunk.trim()) chunks.push(currentChunk.trim())

      const docId = `doc_${Date.now()}_${name.replace(/[^a-z0-9]/gi, '_')}`

      // Generate embeddings and upsert to Pinecone
      let upsertedCount = 0
      try {
        // Process chunks in batches of 10 to avoid rate limits
        const BATCH_SIZE = 10
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batch = chunks.slice(i, i + BATCH_SIZE)
          const vectors = []

          for (let j = 0; j < batch.length; j++) {
            const chunkIdx = i + j
            const embedding = await generateEmbedding({
              text: batch[j],
              provider: embProvider,
              model: embModel,
              apiKey: embApiKey,
              baseURL: embBaseURL,
              dimensions: indexDimension || undefined
            })
            vectors.push({
              id: `${docId}_chunk_${chunkIdx}`,
              values: embedding,
              metadata: {
                text: batch[j],
                documentId: docId,
                documentName: name,
                chunkIndex: chunkIdx
              }
            })
          }

          await pineconeUpsert(apiKey, indexHost, vectors)
          upsertedCount += vectors.length
          logger.info('knowledge:upload-files upserted batch', { name, batch: Math.floor(i / BATCH_SIZE) + 1, vectors: vectors.length })
        }
      } catch (err) {
        logger.error('knowledge:upload-files embedding/upsert error', { name, error: err.message })
        results.push({ name, error: `Embedding/upsert failed: ${err.message}` })
        continue
      }

      const doc = {
        id: docId,
        name,
        type: ext.toUpperCase() || 'TXT',
        size,
        chunkCount: chunks.length,
        uploadedAt: Date.now(),
        filePath: resolvedPath
      }

      docs.push(doc)
      results.push({ name, success: true, chunkCount: chunks.length, upsertedCount })
      logger.info('knowledge:upload-files processed', { name, chunks: chunks.length, upserted: upsertedCount })
    }

    writeJSON(docsFile, docs)
    return { success: true, results }
  } catch (err) {
    logger.error('knowledge:upload-files error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('knowledge:delete-document', async (_, { documentId }) => {
  try {
    const docsFile = path.join(DATA_DIR, 'knowledge-docs.json')
    let docs = readJSON(docsFile, [])
    docs = docs.filter(d => d.id !== documentId)
    writeJSON(docsFile, docs)
    logger.info('knowledge:delete-document', { documentId })
    return { success: true }
  } catch (err) {
    logger.error('knowledge:delete-document error', err.message)
    return { success: false, error: err.message }
  }
})

// Delete all vectors belonging to a source file from Pinecone
ipcMain.handle('knowledge:delete-source', async (_, { apiKey, indexName, sourceName }) => {
  if (!apiKey || !indexName || !sourceName) {
    return { success: false, error: 'API key, index name, and source name are required' }
  }
  try {
    const info = await getPineconeIndexInfo(apiKey, indexName)
    const https = require('https')

    function httpsReq(url, options, body) {
      return new Promise((resolve, reject) => {
        const req = https.request(url, { ...options, timeout: 30000 }, (res) => {
          let data = ''
          res.on('data', chunk => { data += chunk })
          res.on('end', () => {
            if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`))
            else {
              try { resolve(JSON.parse(data)) } catch { resolve({}) }
            }
          })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
        if (body) req.write(body)
        req.end()
      })
    }

    // Try multiple metadata field names that might hold the source file name
    const filterFields = ['documentName', 'file', 'source']
    let deleted = false

    for (const field of filterFields) {
      try {
        const delBody = JSON.stringify({
          filter: { [field]: { '$eq': sourceName } }
        })
        await httpsReq(`https://${info.host}/vectors/delete`, {
          method: 'POST',
          headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(delBody) }
        }, delBody)
        deleted = true
        logger.info('knowledge:delete-source', { indexName, sourceName, field })
      } catch (err) {
        // Filter-based delete may fail on pod indexes — continue trying other fields
        logger.warn(`knowledge:delete-source filter on ${field} failed:`, err.message)
      }
    }

    if (!deleted) {
      return { success: false, error: 'Failed to delete vectors — metadata filter not supported on this index type' }
    }

    // Also remove from local docs list if matching
    const docsFile = path.join(DATA_DIR, 'knowledge-docs.json')
    let docs = readJSON(docsFile, [])
    docs = docs.filter(d => d.name !== sourceName)
    writeJSON(docsFile, docs)

    return { success: true }
  } catch (err) {
    logger.error('knowledge:delete-source error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('knowledge:get-document-summary', async (_, { documentId }) => {
  try {
    const docsFile = path.join(DATA_DIR, 'knowledge-docs.json')
    const docs = readJSON(docsFile, [])
    const doc = docs.find(d => d.id === documentId)
    if (!doc) return { success: false, error: 'Document not found' }

    let summary = ''
    let sampleChunks = []

    if (doc.filePath && fs.existsSync(doc.filePath)) {
      const content = fs.readFileSync(doc.filePath, 'utf8')
      // Generate summary: first 500 chars
      summary = content.substring(0, 500) + (content.length > 500 ? '...' : '')
      // Sample chunks
      const paragraphs = content.split(/\n\n+/).filter(p => p.trim())
      sampleChunks = paragraphs.slice(0, 3).map(p => p.substring(0, 200) + (p.length > 200 ? '...' : ''))
    } else {
      summary = 'Original file not accessible. Document metadata is stored locally.'
    }

    return { success: true, summary, sampleChunks }
  } catch (err) {
    logger.error('knowledge:get-document-summary error', err.message)
    return { success: false, error: err.message }
  }
})

// ── Embedding generation helper ──────────────────────────────────────────────
async function generateEmbedding({ text, provider, model, apiKey, baseURL, dimensions }) {
  const https = require('https')
  const http = require('http')

  let url, headers, body

  if (provider === 'openrouter') {
    const base = (baseURL || 'https://openrouter.ai/api').replace(/\/+$/, '')
    url = base + '/v1/embeddings'
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
    const payload = { model, input: text }
    if (dimensions) payload.dimensions = dimensions
    body = JSON.stringify(payload)
  } else {
    // OpenAI or OpenAI-compatible
    const cfg = readJSON(CONFIG_FILE, {})
    const base = (baseURL || cfg.openai?.baseURL || 'https://api.openai.com').replace(/\/+$/, '')
    // Use standard OpenAI endpoint path
    const isStandardOpenAI = base.includes('api.openai.com')
    url = isStandardOpenAI ? base + '/v1/embeddings' : base + '/proxy/openai/v1/embeddings'
    const key = apiKey || cfg.openai?.apiKey || ''
    headers = {
      'Content-Type': 'application/json'
    }
    if (isStandardOpenAI) {
      headers['Authorization'] = `Bearer ${key}`
    } else {
      headers['x-api-key'] = key
    }
    const payload = { model: model || 'text-embedding-3-small', input: text }
    if (dimensions) payload.dimensions = dimensions
    body = JSON.stringify(payload)
  }

  const { URL } = require('url')
  const parsed = new URL(url)
  const fetcher = parsed.protocol === 'https:' ? https : http

  const data = await new Promise((resolve, reject) => {
    const req = fetcher.request({
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers,
      timeout: 30000
    }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Embedding API ${res.statusCode}: ${body.slice(0, 300)}`))
        } else {
          try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON from embedding API')) }
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Embedding request timed out')) })
    req.write(body)
    req.end()
  })

  const embedding = data?.data?.[0]?.embedding
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('No embedding returned from API')
  }
  return embedding
}

// ── Pinecone index info resolver (cached) ────────────────────────────────────
const indexInfoCache = new Map()

async function getPineconeIndexInfo(apiKey, indexName) {
  const cacheKey = `${apiKey.slice(0, 8)}:${indexName}`
  if (indexInfoCache.has(cacheKey)) return indexInfoCache.get(cacheKey)

  const https = require('https')
  const data = await new Promise((resolve, reject) => {
    const req = https.request(`https://api.pinecone.io/indexes/${indexName}`, {
      method: 'GET',
      headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000
    }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Pinecone describe ${res.statusCode}: ${body.slice(0, 300)}`))
        else {
          try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON from Pinecone')) }
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Pinecone describe timed out')) })
    req.end()
  })

  const host = data.host
  if (!host) throw new Error('No host returned for Pinecone index')
  const info = { host, dimension: data.dimension || null }
  indexInfoCache.set(cacheKey, info)
  return info
}

// ── Pinecone upsert helper ───────────────────────────────────────────────────
async function pineconeUpsert(apiKey, indexHost, vectors) {
  const https = require('https')
  const body = JSON.stringify({ vectors })

  return new Promise((resolve, reject) => {
    const req = https.request(`https://${indexHost}/vectors/upsert`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Pinecone upsert ${res.statusCode}: ${data.slice(0, 300)}`))
        else {
          try { resolve(JSON.parse(data)) } catch { resolve({ success: true }) }
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Pinecone upsert timed out')) })
    req.write(body)
    req.end()
  })
}

// ── Pinecone query helper ────────────────────────────────────────────────────
async function pineconeQuery(apiKey, indexHost, vector, topK = 5) {
  const https = require('https')
  const body = JSON.stringify({ vector, topK, includeMetadata: true })

  return new Promise((resolve, reject) => {
    const req = https.request(`https://${indexHost}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Pinecone query ${res.statusCode}: ${data.slice(0, 300)}`))
        else {
          try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid JSON from Pinecone query')) }
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Pinecone query timed out')) })
    req.write(body)
    req.end()
  })
}

// ── RAG query logic (shared between IPC and agent:run) ───────────────────────
async function queryRAG({ query, pineconeApiKey, pineconeIndexName, topK, embeddingProvider, embeddingModel }) {
  if (!pineconeApiKey || !pineconeIndexName || !query) {
    return { success: false, error: 'Missing required parameters', matches: [] }
  }

  const cfg = readJSON(CONFIG_FILE, {})
  const embeddingApiKey = embeddingProvider === 'openrouter'
    ? cfg.openrouter?.apiKey
    : cfg.openai?.apiKey
  const embeddingBaseURL = embeddingProvider === 'openrouter'
    ? cfg.openrouter?.baseURL
    : cfg.openai?.baseURL

  // Get index host and dimension
  const { host: indexHost, dimension: indexDimension } = await getPineconeIndexInfo(pineconeApiKey, pineconeIndexName)

  // Generate embedding for the query (match index dimension)
  const queryVector = await generateEmbedding({
    text: query,
    provider: embeddingProvider || 'openai',
    model: embeddingModel || 'text-embedding-3-small',
    apiKey: embeddingApiKey,
    baseURL: embeddingBaseURL,
    dimensions: indexDimension || undefined
  })

  // Query Pinecone
  const result = await pineconeQuery(pineconeApiKey, indexHost, queryVector, topK || 5)
  const matches = (result.matches || []).map(m => ({
    id: m.id,
    score: m.score,
    text: m.metadata?.text || '',
    documentName: m.metadata?.documentName || ''
  }))

  return { success: true, matches }
}

// IPC: Generate embeddings
ipcMain.handle('knowledge:generate-embeddings', async (_, { text, provider, model, apiKey, baseURL }) => {
  try {
    const embedding = await generateEmbedding({ text, provider, model, apiKey, baseURL })
    return { success: true, embedding }
  } catch (err) {
    logger.error('knowledge:generate-embeddings error', err.message)
    return { success: false, error: err.message }
  }
})

// IPC: Query knowledge base
ipcMain.handle('knowledge:query', async (_, params) => {
  try {
    return await queryRAG(params)
  } catch (err) {
    logger.error('knowledge:query error', err.message)
    return { success: false, error: err.message, matches: [] }
  }
})

ipcMain.handle('mcp:get-status', () => {
  return mcpManager.getRunningStatus()
})

ipcMain.handle('mcp:test-connection', async (_, config) => {
  try {
    return await mcpManager.testConnection(config)
  } catch (err) {
    logger.error('mcp:test-connection error', err.message)
    return { success: false, error: err.message, tools: [] }
  }
})

// ─── IPC: OpenRouter Model Fetching ──────────────────────────────────────────
ipcMain.handle('openrouter:fetch-models', async (_, { apiKey, baseURL }) => {
  const url = (baseURL || 'https://openrouter.ai/api').replace(/\/+$/, '') + '/v1/models'
  try {
    const https = require('https')
    const http = require('http')
    const fetcher = url.startsWith('https') ? https : http
    const data = await new Promise((resolve, reject) => {
      const req = fetcher.get(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }, (res) => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
          } else {
            try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) }
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
    })
    const models = (data.data || []).map(m => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length,
      pricing: m.pricing
    }))
    logger.info('openrouter:fetch-models', { count: models.length })
    return { success: true, models }
  } catch (err) {
    logger.error('openrouter:fetch-models error', err.message)
    return { success: false, error: err.message, models: [] }
  }
})

// ─── IPC: OpenAI Model Fetching ──────────────────────────────────────────────
ipcMain.handle('openai:fetch-models', async (_, { apiKey, baseURL }) => {
  const base = (baseURL || 'https://mlaas.virtuosgames.com').replace(/\/+$/, '')
  const url = base + '/proxy/openai/v1/models'
  try {
    const https = require('https')
    const http = require('http')
    const fetcher = url.startsWith('https') ? https : http
    const data = await new Promise((resolve, reject) => {
      const req = fetcher.get(url, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }, (res) => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
          } else {
            try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) }
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
    })
    const models = (data.data || []).map(m => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length
    }))
    logger.info('openai:fetch-models', { count: models.length })
    return { success: true, models }
  } catch (err) {
    logger.error('openai:fetch-models error', err.message)
    return { success: false, error: err.message, models: [] }
  }
})

// ─── IPC: News RSS Feed Fetching ─────────────────────────────────────────────
ipcMain.handle('news:fetch-feeds', async (_, feedConfigs) => {
  if (!Array.isArray(feedConfigs) || feedConfigs.length === 0) {
    return { success: false, error: 'No feed configs provided', feeds: [] }
  }
  const https = require('https')
  const http = require('http')

  function fetchFeed(feed) {
    return new Promise((resolve) => {
      try {
      const url = feed.url
      if (!url || typeof url !== 'string') {
        return resolve({ feed, body: '', error: 'Invalid or missing URL' })
      }
      const fetcher = url.startsWith('https') ? https : http
      const req = fetcher.get(url, {
        headers: { 'User-Agent': 'SparkAI/1.0 RSS Reader', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
        timeout: 15000
      }, (res) => {
        // Follow redirects (301, 302, 307, 308)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            // Resolve relative redirects against the original URL
            const redirectUrl = new URL(res.headers.location, url).href
            const rFetcher = redirectUrl.startsWith('https') ? https : http
            const rReq = rFetcher.get(redirectUrl, {
              headers: { 'User-Agent': 'SparkAI/1.0 RSS Reader', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
              timeout: 15000
            }, (rRes) => {
              let body = ''
              rRes.on('data', chunk => { body += chunk })
              rRes.on('end', () => resolve({ feed, body, status: rRes.statusCode }))
            })
            rReq.on('error', (err) => resolve({ feed, body: '', error: err.message }))
            rReq.on('timeout', () => { rReq.destroy(); resolve({ feed, body: '', error: 'Request timed out' }) })
          } catch (redirectErr) {
            resolve({ feed, body: '', error: 'Redirect error: ' + (redirectErr.message || 'Invalid redirect URL') })
          }
          return
        }
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => resolve({ feed, body, status: res.statusCode }))
      })
      req.on('error', (err) => resolve({ feed, body: '', error: err.message }))
      req.on('timeout', () => { req.destroy(); resolve({ feed, body: '', error: 'Request timed out' }) })
      } catch (err) {
        resolve({ feed, body: '', error: err.message || 'Fetch error' })
      }
    })
  }

  function parseArticles(xml) {
    const articles = []
    // Try RSS <item> blocks first
    const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
    if (rssItems.length > 0) {
      for (const item of rssItems) {
        const title = (item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || ''
        const link = (item.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) || [])[1] || ''
        const date = (item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] ||
                     (item.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i) || [])[1] || ''
        const summary = (item.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) || [])[1] || ''
        articles.push({
          title: title.replace(/<[^>]+>/g, '').trim(),
          link: link.replace(/<[^>]+>/g, '').trim(),
          date: date.trim(),
          summary: summary.replace(/<[^>]+>/g, '').trim().slice(0, 300)
        })
      }
      return articles
    }
    // Try Atom <entry> blocks
    const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
    for (const entry of atomEntries) {
      const title = (entry.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || ''
      const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i) || entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || []
      const link = linkMatch[1] || ''
      const date = (entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1] ||
                   (entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1] || ''
      const summary = (entry.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i) || [])[1] ||
                      (entry.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i) || [])[1] || ''
      articles.push({
        title: title.replace(/<[^>]+>/g, '').trim(),
        link: link.trim(),
        date: date.trim(),
        summary: summary.replace(/<[^>]+>/g, '').trim().slice(0, 300)
      })
    }
    return articles
  }

  try {
    const results = await Promise.allSettled(feedConfigs.map(f => fetchFeed(f)))
    const feeds = results.map((r) => {
      if (r.status === 'rejected') {
        return { id: 'unknown', name: 'Unknown', articles: [], error: r.reason?.message || 'Fetch failed' }
      }
      const { feed, body, error, status } = r.value
      if (error) {
        return { id: feed.id, name: feed.name, articles: [], error }
      }
      if (status >= 400) {
        return { id: feed.id, name: feed.name, articles: [], error: `HTTP ${status}` }
      }
      const articles = parseArticles(body)
      return { id: feed.id, name: feed.name, articles }
    })
    return { success: true, feeds }
  } catch (err) {
    logger.error('news:fetch-feeds error', err.message)
    return { success: false, error: err.message, feeds: [] }
  }
})

// ─── IPC: Skills (filesystem-based) ─────────────────────────────────────────

/**
 * Resolve skills directory path.
 * If configPath is empty, use platform-specific default.
 */
function resolveSkillsPath(configPath) {
  if (configPath && configPath.trim()) {
    let p = configPath.trim()
    // Expand leading ~ to home directory (shell expansion doesn't apply in Node)
    if (p.startsWith('~/') || p === '~') {
      p = path.join(os.homedir(), p.slice(1))
    }
    return toLinuxPath(p)
  }
  // Default: ~/.claude/skills on Linux/WSL, %APPDATA%\Claude\skills on Windows
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'Claude', 'skills')
  }
  return path.join(os.homedir(), '.claude', 'skills')
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { meta: { name, description, ... }, body: "remaining markdown" }
 */
function parseFrontmatter(mdContent) {
  if (!mdContent) return { meta: {}, body: '' }
  const match = mdContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: mdContent }
  const raw = match[1]
  const body = match[2]
  const meta = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '').trim()
      meta[m[1]] = val
    }
  }
  return { meta, body }
}

/**
 * Extract first paragraph from markdown content as a summary.
 * Skips YAML frontmatter and headings.
 */
function extractSummary(mdContent) {
  if (!mdContent) return ''
  const { body } = parseFrontmatter(mdContent)
  const lines = body.split('\n')
  const paragraphLines = []
  let started = false
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip leading headings and blank lines
    if (!started && (trimmed === '' || trimmed.startsWith('#'))) continue
    if (trimmed === '' && started) break
    started = true
    paragraphLines.push(trimmed)
  }
  return paragraphLines.join(' ').slice(0, 200)
}

ipcMain.handle('skills:scan-dir', (_, dirPath) => {
  const dir = resolveSkillsPath(dirPath)
  try {
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const skills = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const skillDir = path.join(dir, entry.name)
      // Look for SKILL.md first, then any .md file as fallback
      let mdFile = null
      const skillMd = path.join(skillDir, 'SKILL.md')
      if (fs.existsSync(skillMd)) {
        mdFile = skillMd
      } else {
        try {
          const files = fs.readdirSync(skillDir).filter(f => f.endsWith('.md'))
          if (files.length > 0) mdFile = path.join(skillDir, files[0])
        } catch {}
      }
      let summary = ''
      let displayName = ''
      let description = ''
      if (mdFile) {
        try {
          const content = fs.readFileSync(mdFile, 'utf8')
          const { meta } = parseFrontmatter(content)
          displayName = meta.name || ''
          description = meta.description || ''
          summary = extractSummary(content)
        } catch {}
      }
      skills.push({
        id: entry.name,
        name: entry.name,
        displayName,
        description,
        summary,
        path: skillDir
      })
    }
    return skills
  } catch (err) {
    logger.error('skills:scan-dir error', err.message)
    return []
  }
})

ipcMain.handle('skills:read-tree', (_, rawSkillPath) => {
  const skillPath = toLinuxPath(rawSkillPath)
  const SKIP_DIRS = new Set(['$RECYCLE.BIN', 'System Volume Information', '$WinREAgent', 'Recovery', 'node_modules', '.git'])

  function readDir(dirPath) {
    let entries
    try {
      if (!fs.existsSync(dirPath)) return []
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return []
    }
    const items = []
    const sorted = entries
      .filter(e => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    for (const entry of sorted) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const children = readDir(fullPath)
        items.push({ name: entry.name, path: fullPath, type: 'dir', children })
      } else {
        items.push({ name: entry.name, path: fullPath, type: 'file' })
      }
    }
    return items
  }

  try {
    return readDir(skillPath)
  } catch (err) {
    logger.error('skills:read-tree error', err.message)
    return []
  }
})

ipcMain.handle('skills:read-file', (_, rawPath) => {
  try {
    return { content: fs.readFileSync(toLinuxPath(rawPath), 'utf8') }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('skills:write-file', (_, rawPath, content) => {
  try {
    fs.writeFileSync(toLinuxPath(rawPath), content, 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('skills:load-all-prompts', (_, dirPath) => {
  const dir = resolveSkillsPath(dirPath)
  try {
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const skills = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const skillDir = path.join(dir, entry.name)
      const skillMd = path.join(skillDir, 'SKILL.md')
      if (fs.existsSync(skillMd)) {
        try {
          const content = fs.readFileSync(skillMd, 'utf8')
          skills.push({
            id: entry.name,
            name: entry.name,
            systemPrompt: content
          })
        } catch {}
      }
    }
    return skills
  } catch (err) {
    logger.error('skills:load-all-prompts error', err.message)
    return []
  }
})

// ─── IPC: Shell Execution ────────────────────────────────────────────────────
// Uses execFile (not exec) to prevent shell injection - command and args separated
ipcMain.handle('shell:exec', async (_, { cmd, args }) => {
  return new Promise((resolve) => {
    const safeArgs = Array.isArray(args) ? args : []
    execFile(cmd, safeArgs, { timeout: 30000, cwd: os.homedir() }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', error: err ? err.message : null })
    })
  })
})

// ─── IPC: Agent Loop ─────────────────────────────────────────────────────────
const { AgentLoop } = require('./agent/agentLoop')
const { mcpManager } = require('./agent/mcp/McpManager')
const { MemoryExtractor } = require('./agent/core/MemoryExtractor')
const activeLoops = new Map()          // chatId → AgentLoop
const lastContextSnapshots = new Map() // chatId → snapshot

/** Read a soul file from disk. Returns null if not found. */
function readSoulFileSync(personaId, personaType) {
  if (!personaId) return null
  try {
    const filePath = path.join(SOULS_DIR, personaType, `${personaId}.md`)
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    logger.error('readSoulFileSync error', err.message)
  }
  return null
}

/**
 * Run post-turn memory extraction via Haiku.
 * Non-fatal — failures are logged and silently ignored.
 */
async function runMemoryExtraction(event, chatId, messages, config, personaPrompts, participants) {
  try {
    // Only run for Anthropic provider (needs Anthropic API key for Haiku)
    const apiKey = config.apiKey || config.anthropic?.apiKey
    if (!apiKey) return

    // Extract last user message + last assistant response
    const reversed = [...messages].reverse()
    const lastUser = reversed.find(m => m.role === 'user')
    const lastAssistant = reversed.find(m => m.role === 'assistant')
    if (!lastUser || !lastAssistant) return

    const lastUserText = typeof lastUser.content === 'string'
      ? lastUser.content
      : (Array.isArray(lastUser.content) ? lastUser.content.filter(b => b.type === 'text').map(b => b.text).join(' ') : '')
    const lastAssistantText = typeof lastAssistant.content === 'string'
      ? lastAssistant.content
      : (Array.isArray(lastAssistant.content) ? lastAssistant.content.filter(b => b.type === 'text').map(b => b.text).join(' ') : '')

    if (!lastUserText.trim() || !lastAssistantText.trim()) return

    const userPersonaId = personaPrompts?.userPersonaId || '__default_user__'
    const systemPersonaId = personaPrompts?.systemPersonaId || '__default_system__'

    const userSoulContent = readSoulFileSync(userPersonaId, 'users')
    const systemSoulContent = readSoulFileSync(systemPersonaId, 'system')

    const extractor = new MemoryExtractor({ apiKey })
    const suggestions = await extractor.extract({
      lastUserMessage: lastUserText,
      lastAssistantMessage: lastAssistantText,
      userSoulContent,
      systemSoulContent,
      userPersonaId,
      systemPersonaId,
      participants: participants || null,
    })

    if (suggestions.length > 0 && !event.sender.isDestroyed()) {
      event.sender.send('agent:chunk', {
        chatId,
        chunk: { type: 'memory_suggestions', items: suggestions }
      })
      logger.agent('Memory extraction', { chatId, count: suggestions.length })
    }
  } catch (err) {
    logger.error('Memory extraction failed (non-fatal)', { chatId, error: err.message })
  }
}

logger.info('IPC handlers registered: agent:run, agent:stop')

ipcMain.handle('agent:run', async (event, { chatId, messages, config, enabledAgents, enabledSkills, currentAttachments, personaPrompts, mcpServers, httpTools, personaRuns, knowledgeConfig }) => {
  logger.agent('IPC agent:run received', { chatId, model: config?.anthropic?.activeModel || config?.activeModel, msgCount: messages?.length, personaRuns: personaRuns?.length || 0 })
  logger.agent('config snapshot', {
    baseURL: config?.baseURL,
    hasApiKey: !!(config?.apiKey),
    apiKeyPrefix: config?.apiKey ? config.apiKey.slice(0, 8) + '…' : '(empty)',
    sonnetModel: config?.anthropic?.sonnetModel,
    activeModel: config?.anthropic?.activeModel,
    customModel: config?.customModel || null,
    provider: config?.defaultProvider || 'anthropic'
  })

  // If this chat already has a running loop, stop it first
  for (const [key, loop] of activeLoops) {
    if (key === chatId || key.startsWith(chatId + ':')) {
      loop.stop()
      activeLoops.delete(key)
    }
  }

  // ── RAG retrieval (if enabled) ──
  // Merge with file-based config so we always have the latest indexConfigs
  if (knowledgeConfig) {
    const fileCfg = readJSON(KNOWLEDGE_FILE, {})
    const filePineconeKey = readJSON(CONFIG_FILE, {}).pineconeApiKey || ''
    if (!knowledgeConfig.pineconeApiKey && filePineconeKey) knowledgeConfig.pineconeApiKey = filePineconeKey
    if (!knowledgeConfig.indexConfigs || Object.keys(knowledgeConfig.indexConfigs).length === 0) {
      knowledgeConfig.indexConfigs = fileCfg.indexConfigs || {}
    }
    if (knowledgeConfig.ragEnabled === undefined) knowledgeConfig.ragEnabled = fileCfg.ragEnabled !== false
  }
  let ragContext = null
  if (knowledgeConfig?.ragEnabled && knowledgeConfig.pineconeApiKey) {
    try {
      // Extract the last user message text
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      const queryText = typeof lastUserMsg?.content === 'string'
        ? lastUserMsg.content
        : (Array.isArray(lastUserMsg?.content)
          ? lastUserMsg.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
          : '')

      if (queryText.trim()) {
        // Determine which indexes to query: all enabled indexes from indexConfigs
        const idxConfigs = knowledgeConfig.indexConfigs || {}
        const enabledIndexes = Object.entries(idxConfigs)
          .filter(([, cfg]) => cfg.enabled)
          .map(([name, cfg]) => ({ name, embeddingProvider: cfg.embeddingProvider, embeddingModel: cfg.embeddingModel }))

        // Fallback: if no indexConfigs yet, use the selected index with global embedding config
        if (enabledIndexes.length === 0 && knowledgeConfig.pineconeIndexName) {
          enabledIndexes.push({
            name: knowledgeConfig.pineconeIndexName,
            embeddingProvider: knowledgeConfig.embeddingProvider || 'openai',
            embeddingModel: knowledgeConfig.embeddingModel || 'text-embedding-3-small'
          })
        }

        if (enabledIndexes.length > 0) {
          logger.agent('RAG query', { chatId, queryLen: queryText.length, indexes: enabledIndexes.map(i => i.name) })
          const allMatches = []
          for (const idx of enabledIndexes) {
            try {
              const ragResult = await queryRAG({
                query: queryText,
                pineconeApiKey: knowledgeConfig.pineconeApiKey,
                pineconeIndexName: idx.name,
                topK: 5,
                embeddingProvider: idx.embeddingProvider,
                embeddingModel: idx.embeddingModel
              })
              if (ragResult.success && ragResult.matches.length > 0) {
                allMatches.push(...ragResult.matches)
              }
            } catch (idxErr) {
              logger.error('RAG index query error (non-fatal)', { chatId, index: idx.name, error: idxErr.message })
            }
          }
          if (allMatches.length > 0) {
            // Sort by score descending and take top 5
            allMatches.sort((a, b) => (b.score || 0) - (a.score || 0))
            ragContext = allMatches.slice(0, 5)
            logger.agent('RAG matches found', { chatId, count: ragContext.length, topScore: ragContext[0]?.score })
          }
        }
      }
    } catch (err) {
      logger.error('RAG retrieval error (non-fatal)', { chatId, error: err.message })
      // Non-fatal — continue without RAG context
    }
  }
  // ── Group chat: one or more persona runs (concurrent) ──
  if (personaRuns && personaRuns.length >= 1) {
    logger.agent('Group chat mode (concurrent)', { chatId, personaCount: personaRuns.length })
    const baseMessages = [...messages]

    // Emit all persona_start events upfront so UI creates all message bubbles immediately
    for (const run of personaRuns) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:chunk', {
          chatId,
          chunk: { type: 'persona_start', personaId: run.personaId, personaName: run.personaName }
        })
      }
    }

    // Launch all persona loops concurrently
    const promises = personaRuns.map(run => {
      const loopKey = `${chatId}:${run.personaId}`
      const loopConfig = { ...(run.config || config), soulsDir: SOULS_DIR }
      const loop = new AgentLoop(loopConfig)
      activeLoops.set(loopKey, loop)

      return (async () => {
        try {
          const result = await loop.run(
            baseMessages,
            run.enabledAgents || enabledAgents,
            run.enabledSkills || enabledSkills,
            (chunk) => {
              if (!event.sender.isDestroyed()) {
                event.sender.send('agent:chunk', {
                  chatId,
                  chunk: { ...chunk, personaId: run.personaId, personaName: run.personaName }
                })
              }
            },
            currentAttachments,
            run.personaPrompts || personaPrompts,
            run.mcpServers || mcpServers,
            run.httpTools || httpTools,
            ragContext
          )
          return { personaId: run.personaId, personaName: run.personaName, success: true, result }
        } catch (err) {
          logger.error('agent:run persona error', { chatId, personaId: run.personaId, error: err.message })
          return { personaId: run.personaId, personaName: run.personaName, success: false, error: err.message }
        } finally {
          // Emit persona_end
          if (!event.sender.isDestroyed()) {
            event.sender.send('agent:chunk', {
              chatId,
              chunk: { type: 'persona_end', personaId: run.personaId, personaName: run.personaName }
            })
          }
          if (activeLoops.has(loopKey)) {
            lastContextSnapshots.set(loopKey, activeLoops.get(loopKey).getContextSnapshot())
          }
          activeLoops.delete(loopKey)
        }
      })()
    })

    const results = await Promise.all(promises)

    // Build a combined context snapshot for the inspector (uses first persona's snapshot as base)
    const personaSnapshots = personaRuns.map(run => {
      const key = `${chatId}:${run.personaId}`
      const snap = lastContextSnapshots.get(key)
      return snap ? { personaName: run.personaName, ...snap } : null
    }).filter(Boolean)
    if (personaSnapshots.length > 0) {
      const base = { ...personaSnapshots[0] }
      base.model = personaSnapshots.map(s => `${s.personaName}: ${s.model || 'default'}`).join(' | ')
      lastContextSnapshots.set(chatId, base)
    }

    // Fire-and-forget memory extraction for group chat — pass all participants for routing
    if (personaRuns.length > 0) {
      const groupParticipants = personaRuns.map(r => ({ id: r.personaId, name: r.personaName, type: 'system' }))
      runMemoryExtraction(event, chatId, messages, config, personaRuns[0].personaPrompts || personaPrompts, groupParticipants)
    }

    return { success: true, results }
  }

  // ── Single persona (backward compat) ──
  const loop = new AgentLoop({ ...config, soulsDir: SOULS_DIR })
  activeLoops.set(chatId, loop)

  logger.agent('run start', { chatId, model: config.anthropic?.activeModel || config.activeModel, msgCount: messages.length, agents: enabledAgents, skills: enabledSkills })

  try {
    const result = await loop.run(
      messages,
      enabledAgents,
      enabledSkills,
      (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk })
        }
      },
      currentAttachments,
      personaPrompts,
      mcpServers,
      httpTools,
      ragContext
    )
    logger.agent('run done', { chatId, success: result !== undefined, resultLen: typeof result === 'string' ? result.length : 0 })
    // Fire-and-forget memory extraction — single persona as participant for routing
    const singleParticipants = personaPrompts?.systemPersonaId
      ? [{ id: personaPrompts.systemPersonaId, name: personaPrompts.groupChatContext?.personaName || 'Assistant', type: 'system' }]
      : null
    runMemoryExtraction(event, chatId, messages, config, personaPrompts, singleParticipants)
    return { success: true, result }
  } catch (err) {
    logger.error('agent:run error', { chatId, error: err.message })
    return { success: false, error: err.message }
  } finally {
    // Save snapshot before cleanup
    if (activeLoops.has(chatId)) {
      lastContextSnapshots.set(chatId, activeLoops.get(chatId).getContextSnapshot())
    }
    activeLoops.delete(chatId)
  }
})

ipcMain.handle('agent:stop', (event, chatId) => {
  if (chatId) {
    let stopped = false
    // Stop exact match and all group persona loops (chatId:personaId)
    for (const [key, loop] of activeLoops) {
      if (key === chatId || key.startsWith(chatId + ':')) {
        loop.stop()
        activeLoops.delete(key)
        stopped = true
      }
    }
    return stopped
  }
  // Fallback: stop ALL loops (backward compat / stop-all)
  if (!chatId && activeLoops.size > 0) {
    for (const [, loop] of activeLoops) {
      loop.stop()
    }
    activeLoops.clear()
    return true
  }
  return false
})

ipcMain.handle('agent:compact', (event, chatId) => {
  const loop = chatId ? activeLoops.get(chatId) : null
  if (loop && typeof loop.requestCompaction === 'function') {
    loop.requestCompaction()
    return true
  }
  return false
})

ipcMain.handle('agent:compact-standalone', async (event, { chatId, messages, config, enabledAgents, enabledSkills }) => {
  logger.agent('Standalone compaction requested', { chatId, msgCount: messages?.length })
  const loop = new AgentLoop({ ...config, soulsDir: SOULS_DIR })
  try {
    const result = await loop.compactStandalone(
      messages,
      enabledAgents,
      enabledSkills,
      (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk })
        }
      }
    )
    lastContextSnapshots.set(chatId, loop.getContextSnapshot())
    return { success: true, ...result }
  } catch (err) {
    logger.error('agent:compact-standalone error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('agent:get-context', (event, chatId) => {
  if (chatId && activeLoops.has(chatId)) return activeLoops.get(chatId).getContextSnapshot()
  if (chatId) return lastContextSnapshots.get(chatId) || null
  return null
})

// ─── IPC: File Attachments ──────────────────────────────────────────────────

const MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

const IMAGE_EXTS = new Set(Object.keys(MEDIA_TYPES))
const MAX_IMAGE_SIZE = 20 * 1024 * 1024   // 20 MB
const MAX_TEXT_SIZE = 1 * 1024 * 1024      // 1 MB

// Detect WSL environment
const IS_WSL = (() => {
  try {
    if (process.platform !== 'linux') return false
    const release = os.release().toLowerCase()
    if (release.includes('microsoft') || release.includes('wsl')) return true
    if (fs.existsSync('/proc/version')) {
      const ver = fs.readFileSync('/proc/version', 'utf8').toLowerCase()
      return ver.includes('microsoft') || ver.includes('wsl')
    }
  } catch {}
  return false
})()

logger.info('WSL detection:', IS_WSL ? 'YES — will use PowerShell file dialogs' : 'NO')

/**
 * Convert a Windows path to its WSL2 mount equivalent.
 * Handles: C:\foo\bar, C:/foo/bar, file:///C:/foo/bar, \\wsl$\...
 * Falls through for paths that are already Linux-native.
 */
function toWslPath(inputPath) {
  if (!inputPath) return inputPath
  let p = inputPath.trim()

  // Strip file:// URI prefix
  if (p.startsWith('file:///')) {
    p = decodeURIComponent(p.slice(7))  // file:///C:/foo → C:/foo
  } else if (p.startsWith('file://')) {
    p = decodeURIComponent(p.slice(5))
  }

  // Strip surrounding quotes
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1)
  }

  // Windows drive letter path: C:\foo or C:/foo
  const driveMatch = p.match(/^([A-Za-z]):[/\\](.*)$/)
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase()
    const rest = driveMatch[2].replace(/\\/g, '/')
    return `/mnt/${drive}/${rest}`.replace(/\/+$/, '') || `/mnt/${drive}`
  }

  // UNC \\wsl$\distro\path → /path  (already inside WSL)
  const wslUncMatch = p.match(/^\\\\wsl\$\\[^\\]+\\(.*)$/)
  if (wslUncMatch) {
    return '/' + wslUncMatch[1].replace(/\\/g, '/')
  }

  // Already a Linux path
  return p
}

function readAttachment(rawPath) {
  const filePath = IS_WSL ? toWslPath(rawPath) : rawPath
  const name = path.basename(filePath)
  const id = uuidv4()

  try {
    const stat = fs.statSync(filePath)

    // ── Folder ──
    if (stat.isDirectory()) {
      let listing = ''
      try {
        const entries = fs.readdirSync(filePath, { withFileTypes: true })
          .filter(e => !e.name.startsWith('.'))
          .sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1
            if (!a.isDirectory() && b.isDirectory()) return 1
            return a.name.localeCompare(b.name)
          })
        listing = entries.map(e => (e.isDirectory() ? '[dir]  ' : '       ') + e.name).join('\n')
      } catch {}
      return {
        id, name, path: filePath, type: 'folder', size: 0,
        preview: `Folder: ${filePath}` + (listing ? `\n${listing}` : '')
      }
    }

    const ext = path.extname(name).toLowerCase()

    // ── Image ──
    if (IMAGE_EXTS.has(ext)) {
      if (stat.size > MAX_IMAGE_SIZE) {
        return { id, name, path: filePath, type: 'error', error: `Image too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 20 MB)`, preview: name }
      }
      const base64 = fs.readFileSync(filePath).toString('base64')
      return {
        id, name, path: filePath, type: 'image',
        mediaType: MEDIA_TYPES[ext],
        base64, size: stat.size,
        preview: `Image: ${name} (${(stat.size / 1024).toFixed(1)} KB)`
      }
    }

    // ── Text / code file ──
    if (stat.size > MAX_TEXT_SIZE) {
      return { id, name, path: filePath, type: 'error', error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 1 MB)`, preview: name }
    }
    const buf = fs.readFileSync(filePath)
    // Binary detection: check for null bytes in the first 8KB
    const sample = buf.subarray(0, 8192)
    if (sample.includes(0)) {
      return { id, name, path: filePath, type: 'error', error: 'Binary file — not supported', preview: name }
    }
    const content = buf.toString('utf8')
    return {
      id, name, path: filePath, type: 'text',
      content, size: stat.size,
      preview: `${name} (${(stat.size / 1024).toFixed(1)} KB)`
    }
  } catch (err) {
    return { id, name, path: filePath, type: 'error', error: err.message, preview: name }
  }
}

// Guard: prevent concurrent file/folder picker dialogs
let filePickerOpen = false

/**
 * Show a native Windows file picker via PowerShell.
 * Returns an array of Windows path strings, or [] on cancel.
 */
function showWindowsFilePicker() {
  return new Promise((resolve) => {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.StartPosition = 'Manual'
$owner.Location = New-Object System.Drawing.Point(-9999, -9999)
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.ShowInTaskbar = $false
$owner.Show()
$owner.Hide()

$results = @()

$fd = New-Object System.Windows.Forms.OpenFileDialog
$fd.Multiselect = $true
$fd.Title = 'Select files to attach'
$fd.Filter = 'All files (*.*)|*.*|Images (*.png;*.jpg;*.jpeg;*.gif;*.webp)|*.png;*.jpg;*.jpeg;*.gif;*.webp|Text files (*.txt;*.md;*.js;*.ts;*.py;*.json;*.yaml;*.yml;*.html;*.css;*.xml;*.csv)|*.txt;*.md;*.js;*.ts;*.py;*.json;*.yaml;*.yml;*.html;*.css;*.xml;*.csv'
if ($fd.ShowDialog($owner) -eq 'OK') {
  $results += $fd.FileNames
}

$owner.Close()
$results -join '|'
`.trim()

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 120000 },
      (err, stdout) => {
        if (err) {
          logger.error('PowerShell file picker error:', err.message)
          return resolve([])
        }
        const paths = stdout.trim().split('|').filter(Boolean)
        resolve(paths)
      }
    )
  })
}

/**
 * Show a native Windows folder picker via PowerShell.
 * Returns a Windows path string, or null on cancel.
 */
function showWindowsFolderPicker() {
  return new Promise((resolve) => {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.StartPosition = 'Manual'
$owner.Location = New-Object System.Drawing.Point(-9999, -9999)
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.ShowInTaskbar = $false
$owner.Show()
$owner.Hide()

$dd = New-Object System.Windows.Forms.FolderBrowserDialog
$dd.Description = 'Select a folder'
$dd.ShowNewFolderButton = $true
if ($dd.ShowDialog($owner) -eq 'OK') {
  $dd.SelectedPath
} else {
  ''
}
$owner.Close()
`.trim()

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 120000 },
      (err, stdout) => {
        if (err) {
          logger.error('PowerShell folder picker error:', err.message)
          return resolve(null)
        }
        const result = stdout.trim()
        resolve(result || null)
      }
    )
  })
}

// files:pick — on WSL use native Windows dialog, otherwise GTK
ipcMain.handle('files:pick', async () => {
  if (filePickerOpen) return []
  filePickerOpen = true
  try {
    if (IS_WSL) {
      try {
        const winPaths = await showWindowsFilePicker()
        if (winPaths.length === 0) return []
        return winPaths.map(wp => readAttachment(wp))
      } catch (err) {
        logger.error('Windows file picker failed, falling back to GTK:', err.message)
        // fall through to GTK dialog
      }
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      title: 'Attach Files or Folders'
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths.map(fp => readAttachment(fp))
  } finally {
    filePickerOpen = false
  }
})

// files:read-for-attachment — single path (from drag-drop), auto-converts Windows paths
ipcMain.handle('files:read-for-attachment', (_, filePath) => {
  return readAttachment(filePath)
})

// files:resolve-drop-paths — resolve multiple raw strings from a drag-drop event
// Accepts array of raw path strings (Windows or Linux), returns attachment objects
ipcMain.handle('files:resolve-drop-paths', (_, rawPaths) => {
  if (!Array.isArray(rawPaths)) return []
  return rawPaths
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => readAttachment(p))
})

// ─── IPC: Obsidian Vault ──────────────────────────────────────────────────────

// Normalize paths for the current platform.
// On WSL: convert Windows drive paths (D:\notes) to WSL mount paths (/mnt/d/notes).
// On native Windows/Linux: leave paths as-is (just normalize backslashes on Windows).
function toLinuxPath(p) {
  if (!p) return p
  const m = p.match(/^([A-Za-z]):[/\\](.*)$/)
  if (m) {
    if (IS_WSL) {
      // WSL: convert to /mnt/drive/... mount path
      const drive = m[1].toLowerCase()
      const rest = m[2].replace(/\\/g, '/')
      return `/mnt/${drive}/${rest}`.replace(/\/+$/, '') || `/mnt/${drive}`
    }
    // Native Windows: normalize backslashes to forward slashes for consistency
    return p.replace(/\\/g, '/')
  }
  return p
}

// Config persistence — stored in ~/.sparkai/config.json
ipcMain.handle('obsidian:get-config', () => {
  const saved = readJSON(CONFIG_FILE, {})
  return { vaultPath: saved.obsidianVaultPath || '' }
})
ipcMain.handle('obsidian:save-config', async (_, config) => {
  const saved = readJSON(CONFIG_FILE, {})
  saved.obsidianVaultPath = config.vaultPath || ''
  await writeJSONAtomic(CONFIG_FILE, saved)
  return true
})

// Folder picker — on WSL use native Windows Explorer dialog via PowerShell
ipcMain.handle('obsidian:pick-folder', async () => {
  if (filePickerOpen) return null
  filePickerOpen = true
  try {
    if (IS_WSL) {
      try {
        const folder = await showWindowsFolderPicker()
        if (!folder) return null
        return folder
      } catch (err) {
        logger.error('Windows folder picker failed, falling back to GTK:', err.message)
        // fall through to GTK dialog
      }
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Obsidian Vault Folder'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  } finally {
    filePickerOpen = false
  }
})

// Read directory tree (recursive, .md files + folders only)
ipcMain.handle('obsidian:read-tree', (_, rawDir) => {
  const dir = toLinuxPath(rawDir)
  // Skip Windows system/hidden directories that are unreadable via WSL
  const SKIP_DIRS = new Set(['$RECYCLE.BIN', 'System Volume Information', '$WinREAgent', 'Recovery', 'node_modules'])
  const MAX_DEPTH = 10

  function readDir(dirPath, depth) {
    if (depth > MAX_DEPTH) return []
    let entries
    try {
      if (!fs.existsSync(dirPath)) return []
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      // Permission denied or other read error — skip this directory
      return []
    }
    const items = []

    // Sort: folders first, then files, both alphabetical
    const sorted = entries
      .filter(e => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    for (const entry of sorted) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const children = readDir(fullPath, depth + 1)
        items.push({ name: entry.name, path: fullPath, type: 'dir', children })
      } else if (entry.name.endsWith('.md')) {
        items.push({ name: entry.name, path: fullPath, type: 'file' })
      }
    }
    return items
  }

  try {
    return readDir(dir, 0)
  } catch (err) {
    logger.error('obsidian:read-tree error', err.message)
    return []
  }
})

// Read a single markdown file
ipcMain.handle('obsidian:read-file', (_, rawPath) => {
  try {
    return { content: fs.readFileSync(toLinuxPath(rawPath), 'utf8') }
  } catch (err) {
    return { error: err.message }
  }
})

// Write/save a file
ipcMain.handle('obsidian:write-file', (_, rawPath, content) => {
  try {
    fs.writeFileSync(toLinuxPath(rawPath), content, 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// Get image from Windows clipboard via PowerShell.
// On WSL2: uses powershell.exe (WSLg clipboard only bridges text, not images).
// On native Windows: uses powershell.exe directly.
// On native Linux/macOS: not supported (browser clipboard handles images natively).
ipcMain.handle('clipboard:get-image', async () => {
  const isWindows = process.platform === 'win32'
  if (!IS_WSL && !isWindows) return { hasImage: false }

  // PowerShell command is the same for both WSL and native Windows
  const psCmd = isWindows ? 'powershell' : 'powershell.exe'
  return new Promise((resolve) => {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img -eq $null) {
  Write-Output 'NO_IMAGE'
} else {
  $ms = New-Object System.IO.MemoryStream
  $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Close()
  $img.Dispose()
  [Convert]::ToBase64String($bytes)
}
`.trim()

    execFile(psCmd, ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 15000, maxBuffer: 50 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          logger.error('clipboard:get-image PowerShell error:', err.message)
          return resolve({ hasImage: false, error: err.message })
        }
        const output = stdout.trim()
        if (output === 'NO_IMAGE' || !output) {
          return resolve({ hasImage: false })
        }
        logger.info('clipboard:get-image got image, base64 length:', output.length)
        resolve({ hasImage: true, base64: output, type: 'image/png' })
      }
    )
  })
})

// Read an image file as base64 data URL (for embedding in rendered HTML)
ipcMain.handle('obsidian:read-image-base64', (_, rawPath) => {
  try {
    const filePath = toLinuxPath(rawPath)
    if (!fs.existsSync(filePath)) return { error: 'File not found' }
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp' }
    const mime = mimeTypes[ext] || 'application/octet-stream'
    const base64 = fs.readFileSync(filePath).toString('base64')
    return { base64, mime }
  } catch (err) {
    return { error: err.message }
  }
})

// Save a binary image (base64 data) into the vault's assets folder
ipcMain.handle('obsidian:save-image', (_, rawDir, fileName, base64Data) => {
  try {
    const dir = toLinuxPath(rawDir)
    const assetsDir = path.join(dir, 'assets')
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })
    const filePath = path.join(assetsDir, fileName)
    const buf = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(filePath, buf)
    logger.info('Saved image:', filePath, `(${buf.length} bytes)`)
    return { success: true, relativePath: `assets/${fileName}`, absolutePath: filePath }
  } catch (err) {
    logger.error('obsidian:save-image error:', err.message)
    return { error: err.message }
  }
})

// Create a new markdown file
ipcMain.handle('obsidian:create-file', (_, rawDir, name) => {
  try {
    const safeName = name.endsWith('.md') ? name : name + '.md'
    const filePath = path.join(toLinuxPath(rawDir), safeName)
    if (fs.existsSync(filePath)) return { error: 'File already exists' }
    fs.writeFileSync(filePath, '', 'utf8')
    return { success: true, path: filePath }
  } catch (err) {
    return { error: err.message }
  }
})

// Create a new folder
ipcMain.handle('obsidian:create-folder', (_, rawDir, name) => {
  try {
    const folderPath = path.join(toLinuxPath(rawDir), name)
    if (fs.existsSync(folderPath)) return { error: 'Folder already exists' }
    fs.mkdirSync(folderPath, { recursive: true })
    return { success: true, path: folderPath }
  } catch (err) {
    return { error: err.message }
  }
})

// Delete a file or empty folder
ipcMain.handle('obsidian:delete-file', (_, rawPath) => {
  try {
    const p = toLinuxPath(rawPath)
    const stat = fs.statSync(p)
    if (stat.isDirectory()) {
      fs.rmdirSync(p)
    } else {
      fs.unlinkSync(p)
    }
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// Rename a file or folder
ipcMain.handle('obsidian:rename', (_, rawOld, rawNew) => {
  try {
    const op = toLinuxPath(rawOld)
    const np = toLinuxPath(rawNew)
    if (fs.existsSync(np)) return { error: 'Target already exists' }
    fs.renameSync(op, np)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// ── File Reveal / Open ───────────────────────────────────────────────────────

// Helper: detect WSL
function isWSL() {
  try {
    const release = require('fs').readFileSync('/proc/version', 'utf8').toLowerCase()
    return release.includes('microsoft') || release.includes('wsl')
  } catch { return false }
}

// Helper: Linux path to Windows path
function toWindowsPath(linuxPath) {
  const { execSync } = require('child_process')
  return execSync('wslpath -w "' + linuxPath + '"').toString().trim().replace(/\\$/, '')
}

// Helper: resolve ~ in path
function resolvePath(filePath) {
  const os = require('os')
  const path = require('path')
  return filePath.startsWith('~') ? path.join(os.homedir(), filePath.slice(1)) : filePath
}

ipcMain.handle('shell:open-file', async (_, filePath) => {
  try {
    const resolved = resolvePath(filePath)
    if (isWSL()) {
      const { execSync } = require('child_process')
      execSync('explorer.exe "' + toWindowsPath(resolved) + '"')
      return { success: true }
    }
    const result = await shell.openPath(resolved)
    if (result) return { error: result }
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('shell:open-external', async (_, url) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('shell:show-in-folder', (_, filePath) => {
  try {
    const resolved = resolvePath(filePath)
    if (isWSL()) {
      const { execSync } = require('child_process')
      execSync('explorer.exe /select,"' + toWindowsPath(resolved) + '"');
      return { success: true }
    }
    shell.showItemInFolder(resolved)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})
