const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')

// Point Chromium's fontconfig at our bundled fonts.conf BEFORE electron is
// required -- this is the only hook that runs before Chromium initialises its
// font subsystem. On Linux/WSL2 this makes Segoe UI Emoji available so the
// renderer can display emoji without any user system changes.
if (process.platform === 'linux') {
  process.env.FONTCONFIG_FILE = path.join(__dirname, 'fonts.conf')
}

const { app, BrowserWindow, ipcMain, dialog, shell, screen, protocol, net, session, Menu } = require('electron')
const os = require('os')
const { execFile } = require('child_process')
const { logger, LOG_DIR } = require('./logger')

// Load .env into the Electron main process using a direct parser.
// dotenv v17 has ESM-first issues in Electron; plain fs is 100% reliable.
// Supports multi-line JSON values (brace-balanced accumulation).
// Two-pass strategy: load the default .env first (to discover CLANKAI_DATA_PATH),
// then if DATA_DIR differs, also load DATA_DIR/.env. CLANKAI_DATA_PATH is the
// only runtime key still stored in .env; all other paths live in config.json.
;(function loadEnv() {
  function parseFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return
    const lines = fs.readFileSync(filePath, 'utf8').split('\n')
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

      if (val.startsWith('{') || val.startsWith('[')) {
        pendingKey = key
        pendingVal = val
        braceDepth = 0
        for (const ch of val) {
          if (ch === '{' || ch === '[') braceDepth++
          else if (ch === '}' || ch === ']') braceDepth--
        }
        if (braceDepth <= 0) commitPending()
      } else {
        process.env[key] = val
      }
    }
    commitPending()
  }

  // Pass 1: load the default user env (or project fallback in dev).
  // This is needed to discover CLANKAI_DATA_PATH.
  const defaultUserEnv = path.join(os.homedir(), '.clankai', '.env')
  const projectEnv     = path.join(__dirname, '..', '.env')
  if (fs.existsSync(defaultUserEnv)) parseFile(defaultUserEnv)
  else parseFile(projectEnv)

  // Pass 2: if CLANKAI_DATA_PATH points to a different directory, also load
  // that .env so any remaining keys there (e.g. CLANKAI_DATA_PATH itself) are not missed.
  if (process.env.CLANKAI_DATA_PATH) {
    const dataEnv = path.join(process.env.CLANKAI_DATA_PATH, '.env')
    if (dataEnv !== defaultUserEnv && dataEnv !== projectEnv) {
      parseFile(dataEnv)
    }
  }
})()

logger.info('=== ClankAI starting ===')

// Dev mode: run-electron.js sets ELECTRON_DEV=true
const isDev = process.env.ELECTRON_DEV === 'true'

// --- Storage ----------------------------------------------------------------
const DEFAULT_DATA_PATH = path.join(os.homedir(), '.clankai')
let DATA_DIR = process.env.CLANKAI_DATA_PATH || DEFAULT_DATA_PATH
// Derived paths — re-computed by initDataPaths() if DATA_DIR changes at startup
let CHATS_FILE, CHATS_DIR, CHATS_INDEX_FILE, CONFIG_FILE, PERSONAS_FILE,
    MCP_SERVERS_FILE, TOOLS_FILE, SOULS_DIR, KNOWLEDGE_FILE, ENV_FILE,
    UTILITY_USAGE_FILE, TASKS_FILE, PLANS_FILE, TASK_RUNS_DIR, TASK_RUNS_INDEX

function initDataPaths() {
  CHATS_FILE         = path.join(DATA_DIR, 'chats.json')
  CHATS_DIR          = path.join(DATA_DIR, 'chats')
  CHATS_INDEX_FILE   = path.join(CHATS_DIR, 'index.json')
  CONFIG_FILE        = path.join(DATA_DIR, 'config.json')
  PERSONAS_FILE      = path.join(DATA_DIR, 'personas.json')
  MCP_SERVERS_FILE   = path.join(DATA_DIR, 'mcp-servers.json')
  TOOLS_FILE         = path.join(DATA_DIR, 'tools.json')
  SOULS_DIR          = path.join(DATA_DIR, 'souls')
  KNOWLEDGE_FILE     = path.join(DATA_DIR, 'knowledge.json')
  ENV_FILE           = path.join(DATA_DIR, '.env')
  UTILITY_USAGE_FILE = path.join(DATA_DIR, 'utility-usage.json')
  TASKS_FILE         = path.join(DATA_DIR, 'tasks.json')
  PLANS_FILE         = path.join(DATA_DIR, 'plans.json')
  TASK_RUNS_DIR      = path.join(DATA_DIR, 'task-runs')
  TASK_RUNS_INDEX    = path.join(DATA_DIR, 'task-runs', 'index.json')
}
initDataPaths()

// --- Env-backed path accessors -----------------------------------------------
// These three paths are stored in config.json under CLANKAI_DATA_PATH.
function getEnvPaths() {
  const cfg = readJSON(CONFIG_FILE, {})
  return {
    skillsPath:   cfg.skillsPath   || '',
    DoCPath:      cfg.DoCPath      || '',
    artifactPath: cfg.artifactPath || cfg.artyfactPath || '',
  }
}

/** Write or replace a single key=value line in .env */
function saveEnvKey(key, value) {
  let lines = []
  if (fs.existsSync(ENV_FILE)) {
    lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n')
  }
  const prefix = `${key}=`
  let found = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(prefix)) {
      lines[i] = `${key}=${value}`
      found = true
      break
    }
  }
  if (!found) lines.push(`${key}=${value}`)
  fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8')
  process.env[key] = value
  logger.info(`Saved ${key} to .env:`, value)
}

const OLD_DATA_DIR = path.join(os.homedir(), '.maestro-agent')

function findExistingDataDir() {
  // os.homedir() can return the wrong profile on Windows (e.g. C:\Users\46540
  // instead of C:\Users\yxue). Check alternative home paths for an existing
  // .clankai / .clankai data directory before giving up.
  const candidates = new Set()
  for (const env of ['USERPROFILE', 'HOMEDRIVE', 'HOME']) {
    const val = env === 'HOMEDRIVE'
      ? (process.env.HOMEDRIVE || '') + (process.env.HOMEPATH || '')
      : process.env[env]
    if (val) candidates.add(val)
  }
  try { candidates.add(app.getPath('home')) } catch {}
  // APPDATA (C:\Users\yxue\AppData\Roaming) → go up 2 levels → C:\Users\yxue
  try {
    const appData = app.getPath('appData')
    if (appData) candidates.add(path.resolve(appData, '..', '..'))
  } catch {}
  candidates.delete(os.homedir()) // already checked as DATA_DIR

  for (const home of candidates) {
    const dir = path.join(home, '.clankai')
    if (fs.existsSync(dir)) {
      logger.info(`Found existing data directory at ${dir}`)
      return dir
    }
  }
  return null
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    // Before creating a new directory, look for existing data elsewhere
    const existing = findExistingDataDir()
    if (existing) {
      DATA_DIR = existing
      initDataPaths()
    } else {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true })
      } catch (err) {
        // EPERM on Windows: fall back to Electron's standard app data directory
        const fallback = app.getPath('userData')
        logger.warn(`Cannot create ${DATA_DIR} (${err.code}), falling back to ${fallback}`)
        DATA_DIR = fallback
        initDataPaths()
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
      }
    }
  }

  // Migrate data from old .maestro-agent directory if new directory is empty
  if (fs.existsSync(OLD_DATA_DIR)) {
    for (const file of ['chats.json', 'config.json']) {
      const oldFile = path.join(OLD_DATA_DIR, file)
      const newFile = path.join(DATA_DIR, file)
      if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
        try {
          fs.copyFileSync(oldFile, newFile)
          logger.info(`Migrated ${file} from .maestro-agent to .clankai`)
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

// --- Atomic async JSON write (write to unique .tmp then rename) ---------------
async function writeJSONAtomic(file, data, _retries = 2) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = file + `.tmp.${process.pid}.${Date.now()}`
  try {
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.promises.rename(tmp, file)
  } catch (err) {
    // Clean up orphaned tmp file
    try { await fs.promises.unlink(tmp) } catch {}
    // Retry on ENOENT (WSL2 filesystem race) or EPERM
    if (_retries > 0 && (err.code === 'ENOENT' || err.code === 'EPERM')) {
      await new Promise(r => setTimeout(r, 50))
      return writeJSONAtomic(file, data, _retries - 1)
    }
    throw err
  }
}

async function readJSONAsync(file, fallback) {
  try {
    const raw = await fs.promises.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

// --- Chat index helpers ------------------------------------------------------
function chatMetaFromChat(chat) {
  const { messages, ...meta } = chat
  return meta
}

// --- Migration: monolithic chats.json -> per-chat files -----------------------
async function migrateChatsIfNeeded() {
  const chatsDir = CHATS_DIR
  const indexFile = CHATS_INDEX_FILE
  const oldFile = CHATS_FILE

  if (fs.existsSync(chatsDir) && fs.existsSync(indexFile)) {
    // Already migrated -- clean up any leftover .tmp files
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
    // Fresh install -- create empty index
    await writeJSONAtomic(indexFile, [])
  }
}

// --- Migration: .env user data -> JSON files ----------------------------------
async function migrateEnvDataIfNeeded() {
  // a) Migrate config values from .env -> config.json (one-time seed)
  const cfg = readJSON(CONFIG_FILE, {})
  // Migrate flat keys -> nested structure if config still has old flat layout
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
    // Env -> nested config migration
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
    // Also migrate pineconeApiKey from knowledge.json (old location) -> config.json
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
    // Config already has anthropic.apiKey -- still check if pineconeApiKey needs moving from knowledge.json
    const knowledge = readJSON(KNOWLEDGE_FILE, {})
    if (knowledge.pineconeApiKey) {
      if (!cfg.pineconeApiKey) cfg.pineconeApiKey = knowledge.pineconeApiKey
      delete knowledge.pineconeApiKey
      writeJSON(KNOWLEDGE_FILE, knowledge)
      writeJSON(CONFIG_FILE, cfg)
      logger.info('Migrated pineconeApiKey from knowledge.json to config.json')
    }
  }

  // b) Migrate MCP_SERVERS env var -> mcp-servers.json
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

  // c) Migrate HTTP_TOOLS env var -> tools.json
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

  // d) Migrate dataPath from config.json -> .env (one-time)
  const cfgForDp = readJSON(CONFIG_FILE, {})
  if (cfgForDp.dataPath && cfgForDp.dataPath !== DEFAULT_DATA_PATH) {
    // Write to .env if not already there
    if (!process.env.CLANKAI_DATA_PATH) {
      let envLines = []
      if (fs.existsSync(ENV_FILE)) {
        envLines = fs.readFileSync(ENV_FILE, 'utf8').split('\n')
      }
      const hasLine = envLines.some(l => l.trim().startsWith('CLANKAI_DATA_PATH='))
      if (!hasLine) {
        envLines.push('# Data directory for ClankAI', `CLANKAI_DATA_PATH=${cfgForDp.dataPath}`)
        fs.writeFileSync(ENV_FILE, envLines.join('\n'), 'utf8')
        logger.info('Migrated dataPath from config.json to .env:', cfgForDp.dataPath)
      }
    }
    // Remove dataPath from config.json
    delete cfgForDp.dataPath
    writeJSON(CONFIG_FILE, cfgForDp)
    logger.info('Removed dataPath from config.json (now lives in .env)')
  } else if (cfgForDp.dataPath) {
    // It was the default -- just remove it from config.json, no need to write to .env
    delete cfgForDp.dataPath
    writeJSON(CONFIG_FILE, cfgForDp)
  }

}

// --- Default Data -----------------------------------------------------------
const DEFAULT_CONFIG = {
  anthropic: {
    apiKey:       '',
    baseURL:      '',
    sonnetModel:  'claude-sonnet-4-5',
    opusModel:    'claude-opus-4-6',
    haikuModel:   'claude-haiku-3-5',
    isActive:     false,
    testedAt:     null,
  },
  openrouter: {
    apiKey:  '',
    baseURL: '',
    isActive:     false,
    testedAt:     null,
  },
  openai: {
    apiKey:       '',
    baseURL:      '',
    isActive:     false,
    testedAt:     null,
  },
  deepseek: {
    apiKey:       '',
    baseURL:      '',
    isActive:     false,
    testedAt:     null,
    maxTokens:    8192,
  },
  utilityModel: {
    provider: '',
    model:    '',
  },
  defaultProvider:   'anthropic',
  systemPrompt:      '',
  skillsPath:        '',
  DoCPath:           '',
  artifactPath:      '',
  pineconeApiKey:    '',
  newsFeeds: [],
  sandboxConfig: {
    defaultMode: 'sandbox',
    sandboxAllowList: [],
    dangerBlockList: [
      { id: 'danger-1', pattern: 'rm -rf *', description: 'Recursive force delete' },
      { id: 'danger-2', pattern: 'sudo *', description: 'Superuser commands' },
      { id: 'danger-3', pattern: 'curl * | *sh', description: 'Remote script execution' },
      { id: 'danger-4', pattern: 'curl * | bash', description: 'Remote bash execution' },
      { id: 'danger-5', pattern: 'wget * | bash', description: 'Remote bash execution' },
      { id: 'danger-6', pattern: ':(){ :|:& };:', description: 'Fork bomb' },
      { id: 'danger-7', pattern: 'dd if=/dev/zero *', description: 'Disk wipe' },
      { id: 'danger-8', pattern: 'mkfs.*', description: 'Format filesystem' },
    ]
  }
}


// --- Main Window ------------------------------------------------------------
let mainWindow

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const winW = Math.round(screenW * 4 / 5)
  const winH = Math.round(screenH * 4 / 5)

  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, '../public/icon.png'),
    width: winW,
    height: winH,
    x: Math.round((screenW - winW) / 2),
    y: Math.round((screenH - winH) / 2),
    minWidth: 600,
    minHeight: 400,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: true
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.on('maximize',   () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false))
  _attachMinibarMovedGuard(mainWindow)

  // -- Grant microphone access for voice calls --
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') { callback(true); return }
    callback(true) // allow other permissions too (clipboard, etc.)
  })

  // -- Set spellcheck language --
  mainWindow.webContents.session.setSpellCheckerLanguages(['en-US'])

  // -- Right-click context menu with spell check + standard edit actions --
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menuItems = []

    // Spell check suggestions (if the right-clicked word is misspelled)
    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menuItems.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        })
      }
      menuItems.push({ type: 'separator' })
      menuItems.push({
        label: 'Add to Dictionary',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
      menuItems.push({ type: 'separator' })
    }

    // Standard edit actions
    if (params.isEditable) {
      menuItems.push(
        { label: 'Undo',      role: 'undo',      enabled: params.editFlags.canUndo },
        { label: 'Redo',      role: 'redo',      enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: 'Cut',       role: 'cut',       enabled: params.editFlags.canCut },
        { label: 'Copy',      role: 'copy',      enabled: params.editFlags.canCopy },
        { label: 'Paste',     role: 'paste',     enabled: params.editFlags.canPaste },
        { label: 'Delete',    role: 'delete',    enabled: params.editFlags.canDelete },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll }
      )
    } else if (params.selectionText) {
      // Non-editable area with selection: show Copy
      menuItems.push(
        { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy }
      )
    }

    if (menuItems.length > 0) {
      const menu = Menu.buildFromTemplate(menuItems)
      menu.popup()
    }
  })

  // -- Prevent Electron from navigating away from the app --
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
  // Handle vault-asset:// requests -> serve files from disk
  // URL format: vault-asset:///absolute/path/to/file
  protocol.handle('vault-asset', (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname)
    return net.fetch('file://' + filePath)
  })

  ensureDataDir()
  await migrateChatsIfNeeded()
  await migrateEnvDataIfNeeded()
  createWindow()

  // ── Clean up stale 'running' run entries from a previous session ────────────
  try {
    if (fs.existsSync(TASK_RUNS_INDEX)) {
      const runIndex = JSON.parse(fs.readFileSync(TASK_RUNS_INDEX, 'utf8'))
      const stoppedAt = new Date().toISOString()
      let dirty = false
      for (const entry of runIndex) {
        if (entry.status === 'running') {
          entry.status      = 'error'
          entry.completedAt = stoppedAt
          entry.error       = 'Interrupted by app restart'
          dirty = true
          // Also patch the run detail file if it exists
          const detailFile = path.join(TASK_RUNS_DIR, `${entry.id}.json`)
          if (fs.existsSync(detailFile)) {
            try {
              const detail = JSON.parse(fs.readFileSync(detailFile, 'utf8'))
              if (detail.status === 'running') {
                detail.status      = 'error'
                detail.completedAt = stoppedAt
                detail.error       = 'Interrupted by app restart'
                fs.writeFileSync(detailFile, JSON.stringify(detail, null, 2), 'utf8')
              }
            } catch {}
          }
        }
      }
      if (dirty) fs.writeFileSync(TASK_RUNS_INDEX, JSON.stringify(runIndex, null, 2), 'utf8')
    }
  } catch (err) {
    logger.warn('Failed to clean up stale run entries:', err.message)
  }

  // ── Task Scheduler ──────────────────────────────────────────────────────────
  const taskScheduler = require('./task-scheduler')
  taskScheduler.init(() => DATA_DIR, () => mainWindow)

  // ── IM Bridge ──────────────────────────────────────────────────────────────
  // setMainWindow is synchronous and fast — do it immediately so the bridge
  // has the window reference before any IPC arrives.
  // imBridge.start() can take 1-2s (Telegram/WhatsApp session restore), so
  // defer it past the current event loop tick to avoid blocking main startup.
  const _imCfg = readJSON(CONFIG_FILE, {})
  imBridge.setMainWindow(mainWindow)
  if (_imCfg.im?.telegram?.enabled || _imCfg.im?.whatsapp?.enabled || _imCfg.im?.feishu?.enabled) {
    setImmediate(() => imBridge.start(_imCfg))
  }

  // -- Content Security Policy --
  // Only apply restrictive CSP to the app's own pages, not to external sites
  // loaded inside <webview> (they need their own CSS/JS/fonts to render properly).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || ''
    // drawio-frame.html needs its own permissive CSP -- never override it
    const isDrawioFrame = url.includes('drawio-frame.html')
    const isAppPage = !isDrawioFrame && (url.startsWith('http://localhost:') || url.startsWith('file://'))
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

app.on('before-quit', async (e) => {
  // Stop all active agent loops (in-flight LLM calls)
  for (const [key, loop] of activeLoops) {
    try { loop.stop() } catch {}
    activeLoops.delete(key)
  }

  // Stop MCP subprocesses and IM bridge
  try { await mcpManager.stopAll() } catch (err) { logger.error('MCP cleanup error:', err.message) }
  imBridge.stop()
})

// --- IPC: IM Bridge -----------------------------------------------------------
ipcMain.handle('im:get-status', () => imBridge.getStatus())

ipcMain.handle('im:start', () => {
  const cfg = readJSON(CONFIG_FILE, {})
  imBridge.start(cfg)
  return imBridge.getStatus()
})

ipcMain.handle('im:stop', () => {
  imBridge.stop()
  return imBridge.getStatus()
})

ipcMain.handle('im:get-sessions', () => imBridge.getStatus().sessions)
ipcMain.handle('im:start-platform', (_, platform) => {
  const cfg = readJSON(CONFIG_FILE, {})
  imBridge.start(cfg)          // refresh stored config
  return imBridge.startPlatform(platform)
})
ipcMain.handle('im:stop-platform',  (_, platform) => imBridge.stopPlatform(platform))

ipcMain.handle('im:whatsapp-request-qr', () => {
  imBridge.requestWhatsAppQR()
})

// --- IPC: Storage -----------------------------------------------------------

/** Accumulate usage metrics into chat.usage and save atomically.
 *  Also stamps chat.provider / chat.model if they are missing. */
async function accumulateUsage(chatId, metrics, provider, model) {
  if (!chatId || !metrics) return
  const file = path.join(CHATS_DIR, `${chatId}.json`)
  let chat
  try {
    chat = await readJSONAsync(file, null)
  } catch { return }
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
  // Stamp provider/model for cost attribution if not already set
  if (provider && !chat.provider) chat.provider = provider
  if (model     && !chat.model)   chat.model     = model
  try {
    await writeJSONAtomic(file, chat)
  } catch (err) {
    logger.warn('accumulateUsage write failed', err.message)
  }
}

/** Accumulate utility model token usage into utility-usage.json. */
async function accumulateUtilityUsage(model, provider, inputTokens, outputTokens) {
  if (!model || (!inputTokens && !outputTokens)) return
  try {
    const existing = await readJSONAsync(UTILITY_USAGE_FILE, { model, provider, inputTokens: 0, outputTokens: 0 })
    const updated = {
      model:        model,
      provider:     provider || existing.provider || '',
      inputTokens:  (existing.inputTokens  || 0) + (inputTokens  || 0),
      outputTokens: (existing.outputTokens || 0) + (outputTokens || 0),
    }
    await writeJSONAtomic(UTILITY_USAGE_FILE, updated)
  } catch (err) {
    logger.warn('accumulateUtilityUsage write failed', err.message)
  }
}

// -- Segment archiving --------------------------------------------------------
const SEGMENT_HOT_COUNT = 100
const SEGMENT_SIZE = 100

/**
 * Archive old messages from chat into segment files.
 * Mutates chat.messages in place — keeps only the newest SEGMENT_HOT_COUNT messages.
 * Writes archived batches as {chatId}.seg.{n}.json (write-once).
 */
async function archiveOldSegments(chat) {
  if (!chat.messages || chat.messages.length <= SEGMENT_HOT_COUNT) return

  const toArchive = chat.messages.slice(0, chat.messages.length - SEGMENT_HOT_COUNT)
  chat.messages = chat.messages.slice(chat.messages.length - SEGMENT_HOT_COUNT)

  // Find highest existing segment index
  let maxSeg = chat.segmentCount || 0

  // Write new segment files (oldest first, batched by SEGMENT_SIZE)
  for (let i = 0; i < toArchive.length; i += SEGMENT_SIZE) {
    maxSeg++
    const batch = toArchive.slice(i, i + SEGMENT_SIZE)
    const segFile = path.join(CHATS_DIR, `${chat.id}.seg.${maxSeg}.json`)
    // Only write if file doesn't already exist (write-once guarantee)
    if (!fs.existsSync(segFile)) {
      await writeJSONAtomic(segFile, { chatId: chat.id, segIndex: maxSeg, messages: batch })
    }
  }

  chat.segmentCount = maxSeg
}

// -- Per-chat granular operations ---------------------------------------------
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

ipcMain.handle('store:get-chat-segments', async (_, { chatId, fromSeg, toSeg }) => {
  // Returns messages from segment files fromSeg..toSeg (inclusive), oldest first.
  const messages = []
  for (let i = fromSeg; i <= toSeg; i++) {
    const segFile = path.join(CHATS_DIR, `${chatId}.seg.${i}.json`)
    const seg = await readJSONAsync(segFile, null)
    if (seg && seg.messages) {
      messages.push(...seg.messages)
    }
  }
  return messages
})

ipcMain.handle('store:save-chat', async (_, chat) => {
  if (!chat || !chat.id) return false
  // Preserve fields written by accumulateUsage — renderer memory never receives these back.
  // Read from disk on every save to merge: usage/model/provider when absent, and whisper/voice
  // usage fields which are exclusively written by accumulateUsage and never tracked in renderer.
  const existing = await readJSONAsync(path.join(CHATS_DIR, `${chat.id}.json`), null)
  if (existing) {
    if (chat.usage == null && existing.usage) chat.usage = existing.usage
    if (!chat.model    && existing.model)    chat.model    = existing.model
    if (!chat.provider && existing.provider) chat.provider = existing.provider
    // whisper/voice fields are written only by accumulateUsage; always prefer the higher disk value
    if (existing.usage && chat.usage) {
      const VOICE_KEYS = ['whisperCalls', 'whisperSecs', 'voiceInputTokens', 'voiceOutputTokens']
      for (const k of VOICE_KEYS) {
        if ((existing.usage[k] || 0) > (chat.usage[k] || 0)) {
          chat.usage[k] = existing.usage[k]
        }
      }
    }
    // Preserve segmentCount from disk (renderer doesn't track this)
    if (existing.segmentCount && !chat.segmentCount) {
      chat.segmentCount = existing.segmentCount
    }
  }
  // Archive old messages into segment files before writing
  await archiveOldSegments(chat)
  // Write the per-chat file atomically
  await writeJSONAtomic(path.join(CHATS_DIR, `${chat.id}.json`), chat)
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

// -- Backward-compatible bulk operations (reads per-chat files) ---------------
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
  const savedSandbox = saved.sandboxConfig || {}
  const result = {
    ...DEFAULT_CONFIG,
    ...nonEmpty,
    anthropic:    { ...DEFAULT_CONFIG.anthropic,    ...saved.anthropic },
    openrouter:   { ...DEFAULT_CONFIG.openrouter,   ...saved.openrouter },
    openai:       { ...DEFAULT_CONFIG.openai,       ...saved.openai },
    deepseek:     { ...DEFAULT_CONFIG.deepseek,     ...saved.deepseek },
    utilityModel: { ...DEFAULT_CONFIG.utilityModel, ...saved.utilityModel },
    sandboxConfig: {
      ...DEFAULT_CONFIG.sandboxConfig,
      ...savedSandbox,
      sandboxAllowList: savedSandbox.sandboxAllowList || [],
      // Keep default dangerBlockList if saved is empty (user hasn't customised it)
      dangerBlockList: (savedSandbox.dangerBlockList && savedSandbox.dangerBlockList.length > 0)
        ? savedSandbox.dangerBlockList
        : DEFAULT_CONFIG.sandboxConfig.dangerBlockList,
    },
  }
  logger.info('store:get-config', {
    baseURL: result.anthropic?.baseURL,
    hasApiKey: !!(result.anthropic?.apiKey),
    apiKeyPrefix: result.anthropic?.apiKey ? result.anthropic.apiKey.slice(0, 8) + '...' : '(empty)',
    sonnetModel: result.anthropic?.sonnetModel,
    activeModel: result.anthropic?.activeModel,
    defaultProvider: result.defaultProvider,
    hasOpenRouterKey: !!(result.openrouter?.apiKey),
    openrouterBaseURL: result.openrouter?.baseURL
  })
  return result
})
ipcMain.handle('store:save-config', (_, config) => {
  // dataPath lives in .env (as CLANKAI_DATA_PATH), not config.json
  delete config.dataPath
  delete config.obsidianVaultPath
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
    smtp:       { ...(existing.smtp || {}),       ...(config.smtp || {}) },
  }
  writeJSON(CONFIG_FILE, merged)
  return true
})

ipcMain.handle('store:test-smtp', async (_, smtpConfig) => {
  try {
    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port || 587,
      secure: false,
      requireTLS: true,
      auth: { user: smtpConfig.user, pass: smtpConfig.pass },
      tls: { rejectUnauthorized: false },
    })
    await transporter.verify()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('store:get-data-path', () => ({
  dataPath: DATA_DIR,
  defaultDataPath: DEFAULT_DATA_PATH,
  platform: process.platform,
}))

ipcMain.handle('store:get-utility-usage', async () => {
  return readJSONAsync(UTILITY_USAGE_FILE, null)
})

// Save CLANKAI_DATA_PATH to .env file
ipcMain.handle('store:save-data-path', (_, newDataPath) => {
  try {
    const envPath = ENV_FILE
    let lines = []
    if (fs.existsSync(envPath)) {
      lines = fs.readFileSync(envPath, 'utf8').split('\n')
    }
    // Replace or append CLANKAI_DATA_PATH
    let found = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('CLANKAI_DATA_PATH=')) {
        lines[i] = `CLANKAI_DATA_PATH=${newDataPath}`
        found = true
        break
      }
    }
    if (!found) {
      lines.push('# Data directory for ClankAI', `CLANKAI_DATA_PATH=${newDataPath}`)
    }
    fs.writeFileSync(envPath, lines.join('\n'), 'utf8')
    logger.info('Saved CLANKAI_DATA_PATH to .env:', newDataPath)
    return { success: true }
  } catch (err) {
    logger.error('Failed to save CLANKAI_DATA_PATH to .env:', err.message)
    return { success: false, error: err.message }
  }
})

// --- IPC: Config-backed paths (skillsPath, DoCPath, artifactPath) ------------
// These three paths are stored in config.json under CLANKAI_DATA_PATH.
ipcMain.handle('store:get-env-paths', () => getEnvPaths())
ipcMain.handle('store:save-env-path', (_, key, value) => {
  const allowed = ['skillsPath', 'DoCPath', 'artifactPath']
  if (!allowed.includes(key)) return { success: false, error: 'Unknown path key' }
  try {
    const existing = readJSON(CONFIG_FILE, {})
    existing[key] = value
    writeJSON(CONFIG_FILE, existing)
    return { success: true }
  } catch (err) {
    logger.error(`Failed to save ${key} to config.json:`, err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('store:get-personas', async () => readJSONAsync(PERSONAS_FILE, { categories: [], personas: [] }))
ipcMain.handle('store:save-personas', (_, data) => { writeJSON(PERSONAS_FILE, data); return true })

// --- IPC: Tasks -------------------------------------------------------------

ipcMain.handle('tasks:list', async () => readJSONAsync(TASKS_FILE, []))

ipcMain.handle('tasks:save', async (_, task) => {
  try {
    let tasks = await readJSONAsync(TASKS_FILE, [])
    const idx = tasks.findIndex(t => t.id === task.id)
    if (idx >= 0) tasks[idx] = task
    else tasks.unshift(task)
    await writeJSONAtomic(TASKS_FILE, tasks)
    return { success: true, task }
  } catch (err) {
    logger.error('tasks:save error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('tasks:delete', async (_, id) => {
  try {
    let tasks = await readJSONAsync(TASKS_FILE, [])
    tasks = tasks.filter(t => t.id !== id)
    await writeJSONAtomic(TASKS_FILE, tasks)
    return { success: true }
  } catch (err) {
    logger.error('tasks:delete error', err.message)
    return { success: false, error: err.message }
  }
})

// --- IPC: Plans -------------------------------------------------------------

ipcMain.handle('plans:list', async () => readJSONAsync(PLANS_FILE, []))

ipcMain.handle('plans:save', async (_, plan) => {
  try {
    let plans = await readJSONAsync(PLANS_FILE, [])
    const idx = plans.findIndex(p => p.id === plan.id)
    if (idx >= 0) plans[idx] = plan
    else plans.unshift(plan)
    await writeJSONAtomic(PLANS_FILE, plans)
    // Update cron/one-time schedule
    const taskScheduler = require('./task-scheduler')
    taskScheduler.schedulePlan(plan)
    return { success: true, plan }
  } catch (err) {
    logger.error('plans:save error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('plans:delete', async (_, id) => {
  try {
    let plans = await readJSONAsync(PLANS_FILE, [])
    plans = plans.filter(p => p.id !== id)
    await writeJSONAtomic(PLANS_FILE, plans)
    const taskScheduler = require('./task-scheduler')
    taskScheduler.unschedulePlan(id)
    return { success: true }
  } catch (err) {
    logger.error('plans:delete error', err.message)
    return { success: false, error: err.message }
  }
})

// --- IPC: Task Runs ---------------------------------------------------------

ipcMain.handle('tasks:get-runs', async (_, { planId, limit } = {}) => {
  try {
    let index = await readJSONAsync(TASK_RUNS_INDEX, [])
    if (planId) index = index.filter(r => r.planId === planId)
    if (limit) index = index.slice(0, limit)
    return index
  } catch {
    return []
  }
})

ipcMain.handle('tasks:get-run', async (_, runId) => {
  try {
    const file = path.join(TASK_RUNS_DIR, `${runId}.json`)
    return await readJSONAsync(file, null)
  } catch {
    return null
  }
})

ipcMain.handle('tasks:delete-run', async (_, runId) => {
  try {
    const file = path.join(TASK_RUNS_DIR, `${runId}.json`)
    if (fs.existsSync(file)) fs.unlinkSync(file)
    let index = await readJSONAsync(TASK_RUNS_INDEX, [])
    index = index.filter(r => r.id !== runId)
    await writeJSONAtomic(TASK_RUNS_INDEX, index)
    return { success: true }
  } catch (err) {
    logger.error('tasks:delete-run error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('tasks:save-run', async (_, runDetail) => {
  try {
    if (!fs.existsSync(TASK_RUNS_DIR)) fs.mkdirSync(TASK_RUNS_DIR, { recursive: true })
    const file = path.join(TASK_RUNS_DIR, `${runDetail.id}.json`)
    await writeJSONAtomic(file, runDetail)
    let index = await readJSONAsync(TASK_RUNS_INDEX, [])
    const existing = index.findIndex(r => r.id === runDetail.id)
    const summary = {
      id:          runDetail.id,
      planId:      runDetail.planId,
      planName:    runDetail.planName,
      triggeredBy: runDetail.triggeredBy,
      status:      runDetail.status,
      startedAt:   runDetail.startedAt,
      completedAt: runDetail.completedAt,
      error:       runDetail.error || null,
    }
    if (existing >= 0) index[existing] = summary
    else index.unshift(summary)
    if (index.length > 200) index = index.slice(0, 200)
    await writeJSONAtomic(TASK_RUNS_INDEX, index)
    return { success: true }
  } catch (err) {
    logger.error('tasks:save-run error', err.message)
    return { success: false, error: err.message }
  }
})

// --- IPC: Soul Memory Files -------------------------------------------------
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

// --- IPC: Memory Accept (post-turn extraction) -----------------------------
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

// --- IPC: Memory extraction on chat switch / window close ------------------
// Force extraction for any remaining unprocessed messages, bypassing the N=10 threshold.
ipcMain.handle('memory:extract-on-chat-switch', async (event, { chatId, messages, config, participants, personaPrompts }) => {
  try {
    lastExtractedMsgCount.set(chatId, messages.length)
    await runMemoryExtraction(event, chatId, messages, config, personaPrompts, participants)
    return { success: true }
  } catch (err) {
    logger.error('memory:extract-on-chat-switch error', err.message)
    return { success: false, error: err.message }
  }
})

// --- IPC: MCP Server Configuration (~/.clankai/mcp-servers.json) -------------

ipcMain.handle('mcp:get-config', async () => readJSONAsync(MCP_SERVERS_FILE, {}))

ipcMain.handle('mcp:save-config', async (_, mcpServers) => {
  try {
    await writeJSONAtomic(MCP_SERVERS_FILE, mcpServers)
    return { success: true }
  } catch (err) {
    logger.error('mcp:save-config error', err.message)
    return { success: false, error: err.message }
  }
})

// --- IPC: HTTP Tools Configuration (~/.clankai/tools.json) -------------------

ipcMain.handle('tools:get-config', async () => readJSONAsync(TOOLS_FILE, {}))

ipcMain.handle('tools:save-config', async (_, toolsConfig) => {
  try {
    await writeJSONAtomic(TOOLS_FILE, toolsConfig)
    return { success: true }
  } catch (err) {
    logger.error('tools:save-config error', err.message)
    return { success: false, error: err.message }
  }
})

// --- IPC: Knowledge / Pinecone RAG ------------------------------------------

ipcMain.handle('knowledge:get-config', async () => {
  const [cfg, saved] = await Promise.all([
    readJSONAsync(CONFIG_FILE, {}),
    readJSONAsync(KNOWLEDGE_FILE, {}),
  ])
  return {
    pineconeApiKey:    cfg.pineconeApiKey || '',
    pineconeIndexName: saved.pineconeIndexName || '',
    ragEnabled:        saved.ragEnabled !== undefined ? saved.ragEnabled : true,
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
    return { success: true, message: `Connected -- ${count} index${count !== 1 ? 'es' : ''} found` }
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

    // Resolve embedding config -- prefer per-index config to stay consistent with RAG query
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
        // Filter-based delete may fail on pod indexes -- continue trying other fields
        logger.warn(`knowledge:delete-source filter on ${field} failed:`, err.message)
      }
    }

    if (!deleted) {
      return { success: false, error: 'Failed to delete vectors -- metadata filter not supported on this index type' }
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

// -- Embedding generation helper ----------------------------------------------
async function generateEmbedding({ text, provider, model, apiKey, baseURL, dimensions }) {
  const https = require('https')
  const http = require('http')

  let url, headers, body

  if (provider === 'openrouter') {
    if (!baseURL) throw new Error('OpenRouter baseURL not configured')
    const base = baseURL.replace(/\/+$/, '')
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
    const resolvedBase = baseURL || cfg.openai?.baseURL
    if (!resolvedBase) throw new Error('OpenAI baseURL not configured')
    const base = resolvedBase.replace(/\/+$/, '')
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

// -- Pinecone index info resolver (cached) ------------------------------------
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

// -- Pinecone upsert helper ---------------------------------------------------
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

// -- Pinecone query helper ----------------------------------------------------
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

// -- RAG query logic (shared between IPC and agent:run) -----------------------
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

ipcMain.handle('mcp:test-connection', async (event, config) => {
  const transport = config.url ? `http [${config.url}]` : `stdio [${config.command} ${(config.args || []).join(' ')}]`.trim()
  logger.info(`[MCP test] ${config.name || '(unnamed)'} — ${transport}`)
  try {
    const result = await mcpManager.testConnection(config)
    if (result.success) {
      const toolNames = (result.tools || []).map(t => t.name).join(', ')
      logger.info(`[MCP test] ${config.name} OK — ${result.tools.length} tool(s): ${toolNames || '(none)'}`)
    } else {
      logger.warn(`[MCP test] ${config.name} FAILED — ${result.error}`)
    }
    return result
  } catch (err) {
    logger.error(`[MCP test] ${config.name} ERROR — ${err.message}`)
    return { success: false, error: err.message, tools: [] }
  }
})

// --- IPC: OpenRouter Model Fetching ------------------------------------------
ipcMain.handle('openrouter:fetch-models', async (_, { apiKey, baseURL }) => {
  if (!baseURL) return { success: false, error: 'OpenRouter baseURL not configured', models: [] }
  const url = baseURL.replace(/\/+$/, '') + '/v1/models'
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

// --- IPC: OpenAI Model Fetching ----------------------------------------------
ipcMain.handle('openai:fetch-models', async (_, { apiKey, baseURL }) => {
  if (!baseURL) return { success: false, error: 'OpenAI baseURL not configured', models: [] }
  const base = baseURL.replace(/\/+$/, '')
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

// --- IPC: News RSS Feed Fetching ---------------------------------------------
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
        headers: { 'User-Agent': 'ClankAI/1.0 RSS Reader', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
        timeout: 15000
      }, (res) => {
        // Follow redirects (301, 302, 307, 308)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            // Resolve relative redirects against the original URL
            const redirectUrl = new URL(res.headers.location, url).href
            const rFetcher = redirectUrl.startsWith('https') ? https : http
            const rReq = rFetcher.get(redirectUrl, {
              headers: { 'User-Agent': 'ClankAI/1.0 RSS Reader', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
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

// --- IPC: Skills (filesystem-based) -----------------------------------------

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

ipcMain.handle('skills:scan-dir', async (_, dirPath) => {
  const dir = resolveSkillsPath(dirPath)
  try {
    let entries
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch { return [] }

    const skills = await Promise.all(
      entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(async entry => {
          const skillDir = path.join(dir, entry.name)
          // Look for SKILL.md first, then any .md file as fallback
          let mdFile = null
          const skillMd = path.join(skillDir, 'SKILL.md')
          const skillMdExists = await fs.promises.access(skillMd).then(() => true).catch(() => false)
          if (skillMdExists) {
            mdFile = skillMd
          } else {
            try {
              const files = (await fs.promises.readdir(skillDir)).filter(f => f.endsWith('.md'))
              if (files.length > 0) mdFile = path.join(skillDir, files[0])
            } catch {}
          }
          let summary = '', displayName = '', description = ''
          if (mdFile) {
            try {
              const content = await fs.promises.readFile(mdFile, 'utf8')
              const { meta } = parseFrontmatter(content)
              displayName = meta.name || ''
              description = meta.description || ''
              summary = extractSummary(content)
            } catch {}
          }
          return { id: entry.name, name: entry.name, displayName, description, summary, path: skillDir }
        })
    )
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

ipcMain.handle('skills:load-all-prompts', async (_, dirPath) => {
  const dir = resolveSkillsPath(dirPath)
  try {
    let entries
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch { return [] }

    const skills = await Promise.all(
      entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(async entry => {
          const skillMd = path.join(dir, entry.name, 'SKILL.md')
          try {
            const content = await fs.promises.readFile(skillMd, 'utf8')
            return { id: entry.name, name: entry.name, systemPrompt: content }
          } catch { return null }
        })
    )
    return skills.filter(Boolean)
  } catch (err) {
    logger.error('skills:load-all-prompts error', err.message)
    return []
  }
})

// --- IPC: Claude Context Loader + File Watcher (Coding Mode) --------------------
// Replicates Claude Code CLAUDE.md hierarchy:
//   1. ~/.claude/CLAUDE.md          (global user instructions)
//   2. Parent dirs outermost->innermost (walk up from projectPath, stop at home)
//   3. <projectPath>/CLAUDE.md      (project root)
//   4. <projectPath>/.claude/CLAUDE.md
// All files concatenated in that order (same merge semantics as Claude Code).
//
// File watching: mirrors Claude Code behaviour.
//   - claude:watch-context(chatId, projectPath) - start watching all CLAUDE.md
//     paths in the hierarchy; sends claude:context-updated(chatId, merged) to
//     renderer whenever any watched file changes (debounced 300ms).
//   - claude:unwatch-context(chatId) - tear down watchers for a chat session.
//   - claude:load-context(projectPath) - one-shot read (used on first send and
//     when workingPath changes before a watcher is established).

// Registry: chatId -> { watchers: FSWatcher[], debounceTimer: Timeout|null, projectPath }
const _claudeWatchers = new Map()

function _claudeResolvePaths(projectPath) {
  const homeDir = os.homedir()
  const paths = []
  // 1. Global
  paths.push(path.join(homeDir, '.claude', 'CLAUDE.md'))
  if (projectPath) {
    // 2. Parent dirs (outermost first, stops before home)
    const parentDirs = []
    let current = path.dirname(projectPath)
    while (current && current !== path.dirname(current) && current !== homeDir) {
      parentDirs.push(current)
      current = path.dirname(current)
    }
    parentDirs.reverse()
    for (const dir of parentDirs) paths.push(path.join(dir, 'CLAUDE.md'))
    // 3. Project root
    paths.push(path.join(projectPath, 'CLAUDE.md'))
    // 4. Project .claude dir
    paths.push(path.join(projectPath, '.claude', 'CLAUDE.md'))
  }
  return paths
}

function _claudeReadAndMerge(projectPath) {
  const sections = []
  const candidates = _claudeResolvePaths(projectPath)
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8').trim()
        if (content) sections.push({ label: filePath, content })
      }
    } catch (err) {
      logger.warn(`claude: could not read ${filePath}:`, err.message)
    }
  }
  if (sections.length === 0) return null
  return sections.map(s => `<!-- Source: ${s.label} -->\n${s.content}`).join('\n\n---\n\n')
}

// One-shot load (used by renderer on first send / path change)
ipcMain.handle('claude:load-context', async (_, projectPath) => {
  const merged = _claudeReadAndMerge(projectPath)
  logger.agent('claude:load-context', { projectPath, found: !!merged })
  return merged
})

// Start watching - called by renderer when a coding-mode chat becomes active
ipcMain.handle('claude:watch-context', async (event, { chatId, projectPath }) => {
  _claudeTeardown(chatId)

  const watchPaths = _claudeResolvePaths(projectPath)
  const watchers = []
  let debounceTimer = null

  function onFileChange(filePath) {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const merged = _claudeReadAndMerge(projectPath)
      logger.agent('claude:context-updated (watch)', { chatId, filePath })
      const wins = BrowserWindow.getAllWindows()
      for (const win of wins) {
        if (!win.isDestroyed()) {
          win.webContents.send('claude:context-updated', { chatId, context: merged })
        }
      }
    }, 300)
  }

  for (const watchPath of watchPaths) {
    try {
      // Watch the directory (more reliable cross-OS than watching the file directly,
      // and works even when the CLAUDE.md doesn't exist yet)
      const dir = path.dirname(watchPath)
      const filename = path.basename(watchPath)
      if (!fs.existsSync(dir)) continue
      const watcher = fs.watch(dir, { persistent: false }, (eventType, changedFile) => {
        if (changedFile === filename) onFileChange(watchPath)
      })
      watcher.on('error', (err) => logger.warn(`claude:watcher error ${watchPath}:`, err.message))
      watchers.push(watcher)
    } catch (err) {
      logger.warn(`claude: could not watch ${watchPath}:`, err.message)
    }
  }

  _claudeWatchers.set(chatId, { watchers, debounceTimer, projectPath })
  logger.agent('claude:watch-context', { chatId, projectPath, watching: watchers.length })
  return { watching: watchers.length }
})

// Stop watching - called when coding mode is disabled or chat is closed
ipcMain.handle('claude:unwatch-context', async (_, chatId) => {
  _claudeTeardown(chatId)
  logger.agent('claude:unwatch-context', { chatId })
})

function _claudeTeardown(chatId) {
  const entry = _claudeWatchers.get(chatId)
  if (!entry) return
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
  for (const w of entry.watchers) { try { w.close() } catch (_) {} }
  _claudeWatchers.delete(chatId)
}
// --- IPC: Shell Execution ----------------------------------------------------
// Uses execFile (not exec) to prevent shell injection - command and args separated
ipcMain.handle('shell:exec', async (_, { cmd, args }) => {
  return new Promise((resolve) => {
    const safeArgs = Array.isArray(args) ? args : []
    execFile(cmd, safeArgs, { timeout: 30000, cwd: os.homedir() }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', error: err ? err.message : null })
    })
  })
})

// --- IPC: Agent Loop ---------------------------------------------------------
const { AgentLoop } = require('./agent/agentLoop')
// Ensure im-bridge modules resolve DATA_DIR to the same path as main.js
process.env.CLANKAI_DATA_PATH = DATA_DIR
const imBridge = require('./im-bridge')
const { mcpManager } = require('./agent/mcp/McpManager')
const { MemoryExtractor } = require('./agent/core/MemoryExtractor')
const activeLoops = new Map()          // chatId -> AgentLoop
const lastContextSnapshots = new Map() // chatId -> snapshot
const lastExtractedMsgCount = new Map() // chatId -> message count at last extraction
const pendingMemoryFacts = new Map()    // chatId -> Array of pending fact objects (medium-confidence)

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
 * Run post-turn memory extraction using the configured utility model.
 * Non-fatal -- failures are logged and silently ignored.
 *
 * High-confidence (≥0.8): auto-saved directly to soul files.
 * Medium-confidence (0.5–0.8): stored as pending facts for conversational confirmation.
 * Low-confidence (<0.5): discarded (filtered out in MemoryExtractor).
 */
async function runMemoryExtraction(event, chatId, messages, config, personaPrompts, participants) {
  try {
    // Use the globally configured utility model — supports all providers.
    const um = config.utilityModel
    if (!um?.provider || !um?.model) return  // utility model not configured, skip silently
    const providerCfg = config[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) return

    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    const extractor = new MemoryExtractor({
      model: um.model,
      apiKey: providerCfg.apiKey,
      baseURL: providerCfg.baseURL,
      isOpenAI,
    })

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

    const suggestions = await extractor.extract({
      lastUserMessage: lastUserText,
      lastAssistantMessage: lastAssistantText,
      userSoulContent,
      systemSoulContent,
      userPersonaId,
      systemPersonaId,
      participants: participants || null,
    })

    if (suggestions.length === 0) return

    logger.agent('Memory extraction', { chatId, count: suggestions.length, model: um.model, provider: um.provider })

    const autoSave = suggestions.filter(s => s.confidence >= 0.8)
    const pending  = suggestions.filter(s => s.confidence >= 0.5 && s.confidence < 0.8)

    // Auto-save high-confidence facts directly to soul files
    if (autoSave.length > 0) {
      const { SoulUpdateTool: SoulUpdateToolForMemory } = require('./agent/tools/SoulTool')
      const soulTool = new SoulUpdateToolForMemory(SOULS_DIR)
      for (const item of autoSave) {
        await soulTool.execute({
          persona_id: item.personaId,
          persona_type: item.personaType,
          section: item.section,
          action: 'add',
          entry: item.entry,
        }).catch(err => logger.warn('Memory auto-save failed', { entry: item.entry, error: err.message }))
      }
      logger.agent('Memory auto-saved', { chatId, count: autoSave.length })
    }

    // Store medium-confidence facts for conversational AI confirmation
    if (pending.length > 0) {
      const existing = pendingMemoryFacts.get(chatId) || []
      pendingMemoryFacts.set(chatId, [...existing, ...pending])
      logger.agent('Memory pending confirmation', { chatId, count: pending.length })
    }
  } catch (err) {
    logger.error('Memory extraction failed (non-fatal)', { chatId, error: err.message })
  }
}

logger.info('IPC handlers registered: agent:run, agent:stop')

ipcMain.handle('agent:run', async (event, { chatId, messages, config, enabledAgents, enabledSkills, currentAttachments, personaPrompts, mcpServers, httpTools, personaRuns, knowledgeConfig, injectedPlan, chatPermissionMode, chatAllowList, chatDangerOverrides, maxOutputTokens }) => {
  logger.agent('IPC agent:run received', { chatId, model: config?.anthropic?.activeModel || config?.activeModel, msgCount: messages?.length, personaRuns: personaRuns?.length || 0 })
  logger.agent('config', { provider: config?.defaultProvider || 'anthropic', model: config?.anthropic?.activeModel, hasKey: !!(config?.apiKey) })

  // If this chat already has a running loop, stop it first
  for (const [key, loop] of activeLoops) {
    if (key === chatId || key.startsWith(chatId + ':')) {
      loop.stop()
      activeLoops.delete(key)
    }
  }

  // -- RAG retrieval (if enabled) --
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

        // Fallback: if no indexConfigs yet, use the selected index with default embedding config
        if (enabledIndexes.length === 0 && knowledgeConfig.pineconeIndexName) {
          enabledIndexes.push({
            name: knowledgeConfig.pineconeIndexName,
            embeddingProvider: 'openai',
            embeddingModel: 'text-embedding-3-small'
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
      // Non-fatal -- continue without RAG context
    }
  }
  // -- Group chat: one or more persona runs (concurrent) --
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
    const groupCfg = readJSON(CONFIG_FILE, {})
    const promises = personaRuns.map(run => {
      const loopKey = `${chatId}:${run.personaId}`
      const loopConfig = { ...(run.config || config), soulsDir: SOULS_DIR }
      if (injectedPlan) loopConfig.injectedPlan = injectedPlan
      loopConfig.sandboxConfig = groupCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
      loopConfig.chatPermissionMode = chatPermissionMode || 'inherit'
      loopConfig.chatAllowList = chatAllowList || []
      // Per-chat value takes precedence; fall back to global config default
      loopConfig.maxOutputTokens = maxOutputTokens || groupCfg.maxOutputTokens || null
      loopConfig.smtpConfig = groupCfg.smtp || null
      // Inject config-backed paths — all personas share the same global paths
      loopConfig.artifactPath = groupCfg.artifactPath || groupCfg.artyfactPath || ''
      loopConfig.skillsPath   = groupCfg.skillsPath   || ''
      loopConfig.DoCPath      = groupCfg.DoCPath      || ''
      const loop = new AgentLoop(loopConfig)
      activeLoops.set(loopKey, loop)

      return (async () => {
        try {
          // Inject pending memory facts for conversational confirmation (one-shot per run)
          const runPersonaPrompts = run.personaPrompts || personaPrompts
          const groupPending = pendingMemoryFacts.get(chatId)
          if (groupPending?.length > 0) {
            pendingMemoryFacts.delete(chatId)
            const block = [
              '\n\n[MEMORY PENDING CONFIRMATION]',
              'The following facts were observed but need user confirmation.',
              'At an appropriate moment, naturally ask the user if they want you to remember them.',
              'If confirmed, call update_soul_memory. Do not be abrupt — integrate naturally.',
              ...groupPending.map(p => `- [${p.section}] ${p.entry} (for ${p.target})`),
              '[/MEMORY PENDING CONFIRMATION]',
            ].join('\n')
            if (runPersonaPrompts) {
              runPersonaPrompts.systemPersonaPrompt = (runPersonaPrompts.systemPersonaPrompt || '') + block
            }
          }
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
            runPersonaPrompts,
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
          // Persist cumulative usage
          const _pMetrics  = loop.contextManager.getMetrics()
          const _pProvider = (run.config || config).defaultProvider || 'anthropic'
          const _pModel    = loop.anthropicClient.resolveModel()
          accumulateUsage(chatId, {
            inputTokens:         _pMetrics.inputTokens         || 0,
            outputTokens:        _pMetrics.outputTokens        || 0,
            cacheCreationTokens: _pMetrics.cacheCreationInputTokens || 0,
            cacheReadTokens:     _pMetrics.cacheReadInputTokens     || 0,
          }, _pProvider, _pModel).catch(() => {})
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

    // Fire-and-forget memory extraction for group chat -- pass all participants for routing
    // N=10 trigger: only extract when at least 10 new messages since last extraction
    if (personaRuns.length > 0) {
      const prevCount = lastExtractedMsgCount.get(chatId) || 0
      if (messages.length - prevCount >= 10) {
        lastExtractedMsgCount.set(chatId, messages.length)
        const groupParticipants = personaRuns.map(r => ({ id: r.personaId, name: r.personaName, type: 'system' }))
        runMemoryExtraction(event, chatId, messages, config, personaRuns[0].personaPrompts || personaPrompts, groupParticipants)
      }
    }

    return { success: true, results }
  }

  // -- Single persona (backward compat) --
  const fullCfg = readJSON(CONFIG_FILE, {})
  const loopConfig = { ...config, soulsDir: SOULS_DIR }
  if (injectedPlan) loopConfig.injectedPlan = injectedPlan
  loopConfig.sandboxConfig = fullCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
  loopConfig.chatPermissionMode = chatPermissionMode || 'inherit'
  loopConfig.chatAllowList = chatAllowList || []
  loopConfig.chatDangerOverrides = chatDangerOverrides || []
  // Per-chat value takes precedence; fall back to global config default
  loopConfig.maxOutputTokens = maxOutputTokens || fullCfg.maxOutputTokens || null
  loopConfig.smtpConfig = fullCfg.smtp || null
  // Inject config-backed paths so the agent always has them regardless of what the renderer sent
  loopConfig.artifactPath = fullCfg.artifactPath || fullCfg.artyfactPath || ''
  loopConfig.skillsPath   = fullCfg.skillsPath   || ''
  loopConfig.DoCPath      = fullCfg.DoCPath      || ''
  const loop = new AgentLoop(loopConfig)
  activeLoops.set(chatId, loop)

  logger.agent('run start', { chatId, model: config.anthropic?.activeModel || config.activeModel, msgCount: messages.length, agents: enabledAgents?.length || 0, skills: (enabledSkills || []).map(s => s.id) })

  // Inject pending memory facts for conversational confirmation (one-shot per run)
  const singlePending = pendingMemoryFacts.get(chatId)
  if (singlePending?.length > 0) {
    pendingMemoryFacts.delete(chatId)
    const block = [
      '\n\n[MEMORY PENDING CONFIRMATION]',
      'The following facts were observed but need user confirmation.',
      'At an appropriate moment, naturally ask the user if they want you to remember them.',
      'If confirmed, call update_soul_memory. Do not be abrupt — integrate naturally.',
      ...singlePending.map(p => `- [${p.section}] ${p.entry} (for ${p.target})`),
      '[/MEMORY PENDING CONFIRMATION]',
    ].join('\n')
    if (!personaPrompts) personaPrompts = {}
    personaPrompts.systemPersonaPrompt = (personaPrompts.systemPersonaPrompt || '') + block
  }

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
    // Persist cumulative usage to chat JSON
    const _usageMetrics = loop.contextManager.getMetrics()
    const _provider = config.defaultProvider || (config._resolvedProvider) || 'anthropic'
    const _model    = loop.anthropicClient.resolveModel()
    accumulateUsage(chatId, {
      inputTokens:         _usageMetrics.inputTokens         || 0,
      outputTokens:        _usageMetrics.outputTokens        || 0,
      cacheCreationTokens: _usageMetrics.cacheCreationInputTokens || 0,
      cacheReadTokens:     _usageMetrics.cacheReadInputTokens     || 0,
    }, _provider, _model).catch(() => {})
    // Fire-and-forget memory extraction -- N=10 trigger: only when 10+ new messages since last extraction
    const prevCount = lastExtractedMsgCount.get(chatId) || 0
    if (messages.length - prevCount >= 10) {
      lastExtractedMsgCount.set(chatId, messages.length)
      const singleParticipants = personaPrompts?.systemPersonaId
        ? [{ id: personaPrompts.systemPersonaId, name: personaPrompts.groupChatContext?.personaName || 'Assistant', type: 'system' }]
        : null
      runMemoryExtraction(event, chatId, messages, config, personaPrompts, singleParticipants)
    }
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

ipcMain.handle('agent:accumulate-voice-usage', async (_, { chatId, usage }) => {
  await accumulateUsage(chatId, usage)
  return true
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

ipcMain.handle('agent:permission-response', (event, chatId, { blockId, decision, pattern }) => {
  // Try exact chatId match first, then chatId:personaId prefix
  let loop = activeLoops.get(chatId)
  if (!loop) {
    // Check group persona loops
    for (const [key, l] of activeLoops) {
      if (key.startsWith(chatId + ':')) { loop = l; break }
    }
  }
  if (!loop) {
    logger.warn('agent:permission-response: no active loop for chatId', chatId)
    return { success: false, error: 'No active loop' }
  }
  loop.resolvePermission(blockId, decision, pattern)

  // Persist allow_chat -> chat's chatAllowList in its JSON file
  if (decision === 'allow_chat' && pattern) {
    try {
      const chatFile = path.join(CHATS_DIR, `${chatId}.json`)
      const chat = readJSON(chatFile, null)
      if (chat) {
        if (!Array.isArray(chat.chatAllowList)) chat.chatAllowList = []
        const exists = chat.chatAllowList.some(e => e.pattern === pattern)
        if (!exists) {
          const newEntry = { id: require('crypto').randomUUID(), pattern, description: 'Auto-added from chat approval' }
          chat.chatAllowList.push(newEntry)
          writeJSON(chatFile, chat)
          return { success: true, newChatAllowEntry: newEntry }
        }
      }
    } catch (err) {
      logger.error('agent:permission-response allow_chat persist error', err.message)
    }
  }

  // Persist allow_global -> global sandboxAllowList in config.json
  if (decision === 'allow_global' && pattern) {
    try {
      const cfg = readJSON(CONFIG_FILE, {})
      if (!cfg.sandboxConfig) cfg.sandboxConfig = { defaultMode: 'sandbox', sandboxAllowList: [] }
      if (!cfg.sandboxConfig.sandboxAllowList) cfg.sandboxConfig.sandboxAllowList = []
      const exists = cfg.sandboxConfig.sandboxAllowList.some(e => e.pattern === pattern)
      if (!exists) {
        cfg.sandboxConfig.sandboxAllowList.push({
          id: require('crypto').randomUUID(),
          pattern,
          description: 'Auto-added from chat approval'
        })
        writeJSON(CONFIG_FILE, cfg)
      }
    } catch (err) {
      logger.error('agent:permission-response persist error', err.message)
    }
  }
  return { success: true }
})

ipcMain.handle('agent:update-permission-mode', (event, chatId, { chatMode, chatAllowList }) => {
  // Update all active loops for this chat (exact + group persona loops)
  let updated = false
  for (const [key, loop] of activeLoops) {
    if (key === chatId || key.startsWith(chatId + ':')) {
      if (typeof loop.updatePermissionMode === 'function') {
        loop.updatePermissionMode(chatMode, chatAllowList)
        updated = true
      }
    }
  }
  return { success: updated }
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

// -- Streaming text-edit LLM call (for inline AI Edit in DocsView) -----------
// Heavier than enhance-prompt (streaming, higher max_tokens) but lighter than
// agent:run (no tool loop, no RAG, no persona). Streams token-by-token via
// 'agent:edit-chunk' so the user sees real-time progress.
const _activeEditRequests = new Map() // requestId → AbortController

ipcMain.handle('agent:edit-text', async (event, { requestId, selectedText, fullFileContent, instruction, messages, fileContext, config }) => {
  let abort = null
  try {
    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: 'Utility model not configured. Set it in Config → AI → Models → Global Model Settings.' })
      return { success: false }
    }
    const providerCfg = config[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: `Utility model provider "${um.provider}" is missing apiKey or baseURL.` })
      return { success: false }
    }

    const systemPrompt = `You are an AI assistant embedded in a document editor. You receive selected text (or entire file content) and the user's message.

You have two modes:
1. **Question mode**: If the user asks a question about the text (e.g. "what does this do?", "explain this"), answer normally. Do NOT wrap your answer in <replacement> tags.
2. **Edit mode**: If the user asks you to modify/edit/rewrite the text (e.g. "make formal", "add error handling", "fix typos"), output the replacement text wrapped in <replacement>...</replacement> tags. You may include a brief explanation before the tags, but the replacement content must be inside the tags. Output ONLY the replacement text inside the tags — no markdown fences inside, no preamble inside the tags.

Examples:
- User: "what does this function do?" → Answer normally, no tags.
- User: "make this more concise" → Brief note + <replacement>concise version here</replacement>
- User: "add error handling" → <replacement>code with error handling</replacement>`

    // Build conversation messages — supports both legacy single-instruction and multi-turn
    let chatMessages
    if (messages && Array.isArray(messages) && messages.length > 0) {
      // Multi-turn: prepend file + selection context to the first user message
      chatMessages = messages.map((m, i) => {
        if (i === 0 && m.role === 'user') {
          let contextPrefix = ''
          const fName = fileContext?.fileName || 'unknown'
          const fLang = fileContext?.language ? ` (${fileContext.language})` : ''
          // Always include full file content when available
          if (fullFileContent) {
            contextPrefix += `Full file content of "${fName}"${fLang}:\n\`\`\`\n${fullFileContent}\n\`\`\`\n\n`
          }
          // If there's a specific selection different from the full file, show it
          if (selectedText && selectedText !== fullFileContent) {
            contextPrefix += `Currently focused section:\n\`\`\`\n${selectedText}\n\`\`\`\n\n`
          }
          // Fallback: if no fullFileContent, just use selectedText
          if (!fullFileContent && selectedText) {
            contextPrefix = `Text from "${fName}"${fLang}:\n\`\`\`\n${selectedText}\n\`\`\`\n\n`
          }
          return { role: 'user', content: contextPrefix + m.content }
        }
        return { role: m.role, content: m.content }
      })
    } else {
      // Legacy single-instruction path
      const userContent = `Selected text from "${fileContext?.fileName || 'unknown'}"${fileContext?.language ? ` (${fileContext.language})` : ''}:\n\`\`\`\n${selectedText}\n\`\`\`\n\nInstruction: ${instruction}`
      chatMessages = [{ role: 'user', content: userContent }]
    }

    abort = new AbortController()
    _activeEditRequests.set(requestId, abort)

    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    let inputTokens = 0, outputTokens = 0

    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const client = new OpenAIClient(cfg).getClient()
      const stream = await client.chat.completions.create({
        model: um.model,
        max_tokens: 4096,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...chatMessages,
        ],
      }, { signal: abort.signal })

      for await (const chunk of stream) {
        if (abort.signal.aborted) break
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta && !event.sender.isDestroyed()) {
          event.sender.send('agent:edit-chunk', { requestId, type: 'delta', text: delta })
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0
          outputTokens = chunk.usage.completion_tokens || 0
        }
      }
    } else {
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = {
        apiKey: providerCfg.apiKey,
        baseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
      }
      const client = new AnthropicClient(cfg).getClient()
      const stream = client.messages.stream({
        model: um.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: chatMessages,
      }, { signal: abort.signal })

      stream.on('text', (text) => {
        if (!abort.signal.aborted && !event.sender.isDestroyed()) {
          event.sender.send('agent:edit-chunk', { requestId, type: 'delta', text })
        }
      })

      const finalMsg = await stream.finalMessage()
      inputTokens = finalMsg.usage?.input_tokens || 0
      outputTokens = finalMsg.usage?.output_tokens || 0
    }

    _activeEditRequests.delete(requestId)
    accumulateUtilityUsage(um.model, um.provider, inputTokens, outputTokens).catch(() => {})

    if (!event.sender.isDestroyed()) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'done' })
    }
    return { success: true }
  } catch (err) {
    _activeEditRequests.delete(requestId)
    if (err.name === 'AbortError' || abort?.signal?.aborted) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:edit-chunk', { requestId, type: 'done' })
      }
      return { success: false, cancelled: true }
    }
    logger.error('agent:edit-text error', err.message)
    if (!event.sender.isDestroyed()) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: err.message })
    }
    return { success: false }
  }
})

ipcMain.handle('agent:edit-stop', async (_event, requestId) => {
  const abort = _activeEditRequests.get(requestId)
  if (abort) {
    abort.abort()
    _activeEditRequests.delete(requestId)
  }
  return { success: true }
})

// -- AI Doc: full agent loop for document editing ----------------------------
const _activeDocLoops = new Map() // requestId → AgentLoop

ipcMain.handle('agent:doc-run', async (event, {
  requestId, messages, config, personaPrompt, fileContext,
  selectedText, fullFileContent,
  enabledSkills, mcpServers, httpTools, knowledgeConfig,
  permissionMode
}) => {
  try {
    // Resolve provider/model: use global default (not utility model)
    const provider = config.defaultProvider || 'anthropic'
    const providerCfg = config[provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: `Provider "${provider}" is missing apiKey or baseURL. Configure it in Config → AI → Models.` })
      return { success: false }
    }

    // Build loop config from global config (same pattern as agent:run in ChatsView)
    // CRITICAL: promote provider-specific apiKey/baseURL to top-level,
    // because AnthropicClient/OpenAIClient read config.apiKey / config.baseURL.
    const fullCfg = readJSON(CONFIG_FILE, {})
    const loopConfig = { ...config, soulsDir: SOULS_DIR }

    if (provider === 'anthropic') {
      loopConfig.apiKey  = providerCfg.apiKey
      loopConfig.baseURL = providerCfg.baseURL
    } else if (provider === 'openrouter') {
      loopConfig.apiKey  = providerCfg.apiKey
      loopConfig.baseURL = providerCfg.baseURL
    } else if (provider === 'openai' || provider === 'deepseek') {
      loopConfig.defaultProvider   = 'openai'
      loopConfig._resolvedProvider = 'openai'
      loopConfig.openaiApiKey      = providerCfg.apiKey
      loopConfig.openaiBaseURL     = providerCfg.baseURL
      loopConfig.apiKey            = providerCfg.apiKey
      loopConfig.baseURL           = providerCfg.baseURL
      if (provider === 'deepseek') loopConfig._directAuth = true
    }

    loopConfig.sandboxConfig = fullCfg.sandboxConfig || DEFAULT_CONFIG.sandboxConfig
    loopConfig.chatPermissionMode = permissionMode || 'allow_all'
    loopConfig.chatAllowList = []
    loopConfig.maxOutputTokens = fullCfg.maxOutputTokens || null
    loopConfig.artifactPath = fullCfg.artifactPath || fullCfg.artyfactPath || ''
    loopConfig.skillsPath   = fullCfg.skillsPath   || ''
    loopConfig.DoCPath      = fullCfg.DoCPath      || ''

    const loop = new AgentLoop(loopConfig)
    _activeDocLoops.set(requestId, loop)

    // Build doc editing system prompt — include file path so agent/tools know what file to operate on
    const fPath = fileContext?.filePath || ''
    const fName = fileContext?.fileName || 'unknown'
    const fLang = fileContext?.language ? ` (${fileContext.language})` : ''

    const docSystemPrompt = `${personaPrompt || ''}

You are embedded in a document editor. The user is currently editing a file and may ask you to modify text or answer questions about it.

Current file:
- File name: ${fName}
- File path: ${fPath}
- Language: ${fileContext?.language || 'plain text'}

When asked to modify text (translate, rewrite, summarize, edit, etc.), output the replacement wrapped in <replacement>...</replacement> tags. The editor will apply it to the current file automatically — never ask the user where to save or which file to update.
When asked questions about the text, answer directly without tags.
Output ONLY the replacement text inside the tags — no markdown fences inside, no preamble inside the tags.
NEVER ask "where would you like to save" or "which file should I update" — always target the current file shown above.

If you use tools to read or write files, use the exact file path above: ${fPath}`

    // Build file context message prefix
    let contextPrefix = ''
    if (fullFileContent) {
      contextPrefix += `Full file content of "${fName}"${fLang}:\n\`\`\`\n${fullFileContent}\n\`\`\`\n\n`
    }
    if (selectedText && selectedText !== fullFileContent) {
      contextPrefix += `Currently focused section:\n\`\`\`\n${selectedText}\n\`\`\`\n\n`
    }
    if (!fullFileContent && selectedText) {
      contextPrefix = `Text from "${fName}"${fLang}:\n\`\`\`\n${selectedText}\n\`\`\`\n\n`
    }

    // Prepend file context to the first user message
    const chatMessages = messages.map((m, i) => {
      if (i === 0 && m.role === 'user') {
        return { role: 'user', content: contextPrefix + m.content }
      }
      return { role: m.role, content: m.content }
    })

    // RAG retrieval (if enabled)
    let ragContext = null
    if (knowledgeConfig) {
      const filePineconeKey = readJSON(CONFIG_FILE, {}).pineconeApiKey || ''
      if (!knowledgeConfig.pineconeApiKey && filePineconeKey) knowledgeConfig.pineconeApiKey = filePineconeKey
      const fileCfg = readJSON(KNOWLEDGE_FILE, {})
      if (!knowledgeConfig.indexConfigs || Object.keys(knowledgeConfig.indexConfigs).length === 0) {
        knowledgeConfig.indexConfigs = fileCfg.indexConfigs || {}
      }
      if (knowledgeConfig.ragEnabled === undefined) knowledgeConfig.ragEnabled = fileCfg.ragEnabled !== false
    }
    if (knowledgeConfig?.ragEnabled && knowledgeConfig.pineconeApiKey) {
      try {
        const lastUserMsg = [...chatMessages].reverse().find(m => m.role === 'user')
        const queryText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : ''
        if (queryText.trim()) {
          const idxConfigs = knowledgeConfig.indexConfigs || {}
          const enabledIndexes = Object.entries(idxConfigs)
            .filter(([, cfg]) => cfg.enabled)
            .map(([name, cfg]) => ({ name, embeddingProvider: cfg.embeddingProvider, embeddingModel: cfg.embeddingModel }))
          if (enabledIndexes.length > 0) {
            const allMatches = []
            for (const idx of enabledIndexes) {
              try {
                const ragResult = await queryRAG({
                  query: queryText.slice(0, 500),
                  pineconeApiKey: knowledgeConfig.pineconeApiKey,
                  pineconeIndexName: idx.name,
                  topK: 3,
                  embeddingProvider: idx.embeddingProvider,
                  embeddingModel: idx.embeddingModel
                })
                if (ragResult.success && ragResult.matches.length > 0) {
                  allMatches.push(...ragResult.matches)
                }
              } catch {}
            }
            if (allMatches.length > 0) {
              allMatches.sort((a, b) => (b.score || 0) - (a.score || 0))
              ragContext = allMatches.slice(0, 3)
            }
          }
        }
      } catch {}
    }

    const personaPrompts = {
      systemPersonaPrompt: docSystemPrompt,
    }

    // Run the full agent loop
    await loop.run(
      chatMessages,
      [],  // enabledAgents (none for doc editing)
      enabledSkills || [],
      (chunk) => {
        if (event.sender.isDestroyed()) return
        // Map agent chunks to edit-chunk format
        if (chunk.type === 'text' || chunk.type === 'text_delta') {
          event.sender.send('agent:edit-chunk', { requestId, type: 'delta', text: chunk.text || chunk.content || '' })
        } else if (chunk.type === 'tool_call') {
          event.sender.send('agent:edit-chunk', { requestId, type: 'tool_call', name: chunk.name, input: chunk.input, id: chunk.id })
        } else if (chunk.type === 'tool_result') {
          event.sender.send('agent:edit-chunk', { requestId, type: 'tool_result', id: chunk.id, result: chunk.result })
        } else if (chunk.type === 'permission_request') {
          event.sender.send('agent:edit-chunk', { requestId, type: 'permission_request', blockId: chunk.blockId, toolName: chunk.toolName, command: chunk.command, toolInput: chunk.toolInput })
        }
      },
      [],  // currentAttachments
      personaPrompts,
      mcpServers || [],
      httpTools || [],
      ragContext
    )

    _activeDocLoops.delete(requestId)
    if (!event.sender.isDestroyed()) {
      event.sender.send('agent:edit-chunk', { requestId, type: 'done' })
    }
    return { success: true }
  } catch (err) {
    _activeDocLoops.delete(requestId)
    logger.error('agent:doc-run error', err.message)
    if (!event.sender.isDestroyed()) {
      if (err.name === 'AbortError') {
        event.sender.send('agent:edit-chunk', { requestId, type: 'done' })
      } else {
        event.sender.send('agent:edit-chunk', { requestId, type: 'error', text: err.message })
      }
    }
    return { success: false }
  }
})

ipcMain.handle('agent:doc-stop', async (_event, requestId) => {
  const loop = _activeDocLoops.get(requestId)
  if (loop) {
    loop.stop()
    _activeDocLoops.delete(requestId)
  }
  return { success: true }
})

ipcMain.handle('agent:doc-permission-response', (_event, requestId, { blockId, decision, pattern }) => {
  const loop = _activeDocLoops.get(requestId)
  if (!loop) {
    logger.warn('agent:doc-permission-response: no active doc loop for requestId', requestId)
    return { success: false, error: 'No active doc loop' }
  }
  loop.resolvePermission(blockId, decision, pattern)
  return { success: true }
})

// -- Lightweight one-shot LLM call (for AI Enhance features) -----------------
// Uses global config.utilityModel — supports all providers.
ipcMain.handle('agent:enhance-prompt', async (event, { prompt, config }) => {
  try {
    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      return { success: false, error: 'Utility model not configured. Set it in Config → AI → Models → Global Model Settings.' }
    }
    const providerCfg = config[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      return { success: false, error: `Utility model provider "${um.provider}" is missing apiKey or baseURL.` }
    }
    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const client = new OpenAIClient(cfg).getClient()
      const response = await client.chat.completions.create({
        model: um.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = response.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0).catch(() => {})
      return { success: true, text }
    } else {
      // anthropic or openrouter — both use AnthropicClient
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = {
        apiKey:      providerCfg.apiKey,
        baseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
      }
      const client = new AnthropicClient(cfg).getClient()
      const response = await client.messages.create({
        model: um.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
      accumulateUtilityUsage(um.model, um.provider, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0).catch(() => {})
      return { success: true, text }
    }
  } catch (err) {
    logger.error('agent:enhance-prompt error', err.message)
    return { success: false, error: err.message }
  }
})

/**
 * Resolve which @mentioned personas are directly addressed (should respond)
 * vs. passively referenced. Uses a fast single-turn LLM call.
 *
 * Input:  { message, personas: [{id, name}], config }
 * Output: { addresseeIds: string[] }  — subset of the provided persona IDs
 */
ipcMain.handle('agent:resolve-addressees', async (event, { message, personas, config }) => {
  try {
    const names = personas.map(p => p.name)
    const systemPrompt = `You are a routing assistant for a group chat. Your job is to identify which participants are being directly spoken TO in a message — meaning they are expected to respond.

A participant is directly addressed if:
- The message asks them a question
- The message gives them an instruction or task
- The message is directly directed at them (e.g. starts with their @name)

A participant is NOT directly addressed if:
- They are merely mentioned as a subject or object ("say hello to X", "do you know X", "tell X about Y")
- They are referenced in passing

Participants in this chat: ${names.map(n => `"${n}"`).join(', ')}

Reply with ONLY a JSON array of the names that should respond. Example: ["Alice"] or ["Alice", "Bob"]
If none should respond, reply with [].`

    const userContent = `Message: "${message}"`

    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      logger.warn('agent:resolve-addressees: no global utilityModel configured, treating all mentions as addressees')
      return { addresseeIds: personas.map(p => p.id) }
    }
    const providerCfg = config[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      logger.warn(`agent:resolve-addressees: utilityModel provider "${um.provider}" missing apiKey/baseURL, treating all mentions as addressees`)
      return { addresseeIds: personas.map(p => p.id) }
    }

    let raw
    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const resp = await new OpenAIClient(cfg).getClient().chat.completions.create({
        model: um.model,
        max_tokens: 128,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent },
        ],
      })
      raw = resp.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0).catch(() => {})
    } else {
      // anthropic or openrouter
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = {
        apiKey:      providerCfg.apiKey,
        baseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
      }
      const resp = await new AnthropicClient(cfg).getClient().messages.create({
        model: um.model,
        max_tokens: 128,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      })
      raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.input_tokens || 0, resp.usage?.output_tokens || 0).catch(() => {})
    }

    // Extract JSON array from response (may have surrounding prose)
    const match = raw.match(/\[.*?\]/s)
    const addresseeNames = match ? JSON.parse(match[0]) : []

    // Map names back to IDs (case-insensitive)
    const addresseeIds = personas
      .filter(p => addresseeNames.some(n => n.toLowerCase() === p.name.toLowerCase()))
      .map(p => p.id)

    logger.agent('resolve-addressees', { message: message.slice(0, 80), addresseeNames, addresseeIds })
    return { addresseeIds }
  } catch (err) {
    logger.error('agent:resolve-addressees error', err.message)
    // Fallback: treat all mentioned personas as addressees
    return { addresseeIds: personas.map(p => p.id) }
  }
})

/**
 * Dispatch group tasks: utility model parses the user message and extracts
 * per-persona task assignments + dependency ordering.
 * Returns: [{ personaId, personaName, assignedTask, dependsOn: [personaId] }]
 */
ipcMain.handle('agent:dispatch-group-tasks', async (event, { message, personas, config }) => {
  try {
    const names = personas.map(p => p.name)
    const systemPrompt = `You are a task dispatcher for a group chat with multiple AI participants.
Parse the user's message and extract the specific task assigned to each participant.

Participants: ${names.map(n => `"${n}"`).join(', ')}

Rules:
- Look for "@Name: task description" patterns in the message.
- Extract ONLY the task text for each participant — do not include other participants' sections.
- Detect dependencies: if a participant's task says "wait for @X" or "after @X finishes" or "verify @X's work", mark dependsOn: ["X"].
- If a participant has no explicit task in the message, set assignedTask to null.

Reply with ONLY a JSON array. Example:
[
  { "personaName": "Alice", "assignedTask": "write a function add(a,b)", "dependsOn": [] },
  { "personaName": "Bob", "assignedTask": "test the add function Alice wrote", "dependsOn": ["Alice"] }
]`

    const userContent = `Message: "${message}"`

    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      logger.warn('agent:dispatch-group-tasks: no utilityModel configured, skipping dispatch')
      return { dispatched: null }
    }
    const providerCfg = config[um.provider]
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      logger.warn('agent:dispatch-group-tasks: utilityModel missing credentials, skipping dispatch')
      return { dispatched: null }
    }

    let raw
    const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const resp = await new OpenAIClient(cfg).getClient().chat.completions.create({
        model: um.model, max_tokens: 512,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
      })
      raw = resp.choices?.[0]?.message?.content || ''
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0).catch(() => {})
    } else {
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = { apiKey: providerCfg.apiKey, baseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model }
      const resp = await new AnthropicClient(cfg).getClient().messages.create({
        model: um.model, max_tokens: 512, system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      })
      raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
      accumulateUtilityUsage(um.model, um.provider, resp.usage?.input_tokens || 0, resp.usage?.output_tokens || 0).catch(() => {})
    }

    const match = raw.match(/\[[\s\S]*\]/m)
    const parsed = match ? JSON.parse(match[0]) : []

    // Map names → IDs and resolve dependsOn to IDs
    const nameToId = Object.fromEntries(personas.map(p => [p.name.toLowerCase(), p.id]))
    const dispatched = parsed
      .filter(d => d.personaName && d.assignedTask)
      .map(d => ({
        personaId:    nameToId[d.personaName.toLowerCase()] || null,
        personaName:  d.personaName,
        assignedTask: d.assignedTask,
        dependsOn:    (d.dependsOn || []).map(n => nameToId[n.toLowerCase()]).filter(Boolean),
      }))
      .filter(d => d.personaId)

    logger.agent('dispatch-group-tasks', { personas: dispatched.map(d => ({ name: d.personaName, deps: d.dependsOn.length, taskLen: d.assignedTask.length })) })
    return { dispatched }
  } catch (err) {
    logger.error('agent:dispatch-group-tasks error', err.message)
    return { dispatched: null }
  }
})

ipcMain.handle('agent:test-provider', async (_, { provider, apiKey, baseURL, utilityModel }) => {
  try {
    if (!apiKey || !baseURL || !utilityModel) {
      return { success: false, error: 'Missing required fields (apiKey, baseURL, utilityModel)' }
    }

    const isOpenAI = provider === 'openai' || provider === 'deepseek'

    if (isOpenAI) {
      const { OpenAIClient } = require('./agent/core/OpenAIClient')
      const cfg = {
        openaiApiKey: apiKey,
        openaiBaseURL: baseURL.replace(/\/+$/, ''),
        customModel: utilityModel,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(provider === 'deepseek' ? { _directAuth: true } : {}),
      }
      const client = new OpenAIClient(cfg)
      const start = Date.now()
      const resp = await client.getClient().chat.completions.create({
        model: utilityModel,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'hi' }],
      })
      const ms = Date.now() - start
      const text = resp.choices?.[0]?.message?.content || ''
      return { success: true, ms, preview: text.substring(0, 40) }
    } else {
      // Anthropic or OpenRouter (both use AnthropicClient)
      const { AnthropicClient } = require('./agent/core/AnthropicClient')
      const cfg = {
        apiKey,
        baseURL: baseURL.replace(/\/+$/, ''),
        customModel: utilityModel,
      }
      const ac = new AnthropicClient(cfg)
      const client = ac.getClient()
      const start = Date.now()
      const resp = await client.messages.create({
        model: utilityModel,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'hi' }],
      })
      const ms = Date.now() - start
      const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || ''
      return { success: true, ms, preview: text.substring(0, 40) }
    }
  } catch (err) {
    logger.error('agent:test-provider error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('agent:get-context', (event, chatId) => {
  if (chatId && activeLoops.has(chatId)) return activeLoops.get(chatId).getContextSnapshot()
  if (chatId) return lastContextSnapshots.get(chatId) || null
  return null
})

// --- IPC: File Attachments --------------------------------------------------

const MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

const IMAGE_EXTS = new Set(Object.keys(MEDIA_TYPES))
const MAX_IMAGE_SIZE = 20 * 1024 * 1024   // 20 MB

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

logger.info('WSL detection:', IS_WSL ? 'YES -- will use PowerShell file dialogs' : 'NO')

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
    p = decodeURIComponent(p.slice(7))  // file:///C:/foo -> C:/foo
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

  // UNC \\wsl$\distro\path -> /path  (already inside WSL)
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
    const ext = path.extname(name).toLowerCase()

    // -- Image: read base64 for visual preview --
    if (!stat.isDirectory() && IMAGE_EXTS.has(ext)) {
      if (stat.size > MAX_IMAGE_SIZE) {
        return { id, name, path: filePath, type: 'image_error', error: `Image too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 20 MB)` }
      }
      const base64 = fs.readFileSync(filePath).toString('base64')
      const mediaType = MEDIA_TYPES[ext]
      return {
        id, name, path: filePath, type: 'image',
        mediaType, base64, size: stat.size,
        preview: `data:${mediaType};base64,${base64}`
      }
    }

    // -- Everything else (folder, text, binary): path only --
    return { id, name, path: filePath, type: 'path' }
  } catch (err) {
    return { id, name, path: filePath, type: 'path' }
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

// files:pick -- native OS dialog (supports multi-select, files and folders)
ipcMain.handle('files:pick', async () => {
  if (filePickerOpen) return []
  filePickerOpen = true
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Attach Files'
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths.map(fp => readAttachment(fp))
  } finally {
    filePickerOpen = false
  }
})

// files:read-for-attachment -- single path (from drag-drop), auto-converts Windows paths
ipcMain.handle('files:read-for-attachment', (_, filePath) => {
  return readAttachment(filePath)
})

// files:resolve-drop-paths -- resolve multiple raw strings from a drag-drop event
// Accepts array of raw path strings (Windows or Linux), returns attachment objects
ipcMain.handle('files:resolve-drop-paths', (_, rawPaths) => {
  if (!Array.isArray(rawPaths)) return []
  return rawPaths
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => readAttachment(p))
})

// --- IPC: Obsidian Vault ------------------------------------------------------

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

// Config persistence -- DoCPath stored in config.json
ipcMain.handle('obsidian:get-config', async () => {
  const cfg = await readJSONAsync(CONFIG_FILE, {})
  return { vaultPath: cfg.DoCPath || '' }
})
ipcMain.handle('obsidian:save-config', async (_, config) => {
  const existing = readJSON(CONFIG_FILE, {})
  existing.DoCPath = config.vaultPath || ''
  writeJSON(CONFIG_FILE, existing)
  return true
})

// Folder picker -- on WSL use native Windows Explorer dialog via PowerShell
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
      // Permission denied or other read error -- skip this directory
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
      } else {
        // Skip known binary extensions that can't be displayed as text
        const binaryExts = new Set([
          'exe','dll','so','dylib','bin','o','a','lib',
          'zip','gz','tar','bz2','7z','rar','xz','zst',
          'woff','woff2','ttf','otf','eot',
          'class','pyc','pyo','wasm',
          'db','sqlite','sqlite3',
          'DS_Store',
        ])
        const ext = (entry.name.split('.').pop() || '').toLowerCase()
        if (!binaryExts.has(ext)) {
          items.push({ name: entry.name, path: fullPath, type: 'file' })
        }
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

// Read a binary file (returns base64)
ipcMain.handle('obsidian:read-file-binary', (_, rawPath) => {
  try {
    const buf = fs.readFileSync(toLinuxPath(rawPath))
    return { base64: buf.toString('base64') }
  } catch (err) {
    return { error: err.message }
  }
})

// Write a binary file from base64
ipcMain.handle('obsidian:write-file-binary', (_, rawPath, base64) => {
  try {
    fs.writeFileSync(toLinuxPath(rawPath), Buffer.from(base64, 'base64'))
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

// Create a new blank draw.io diagram file
ipcMain.handle('obsidian:create-drawio', (_, rawDir, name) => {
  try {
    const safeName = name.endsWith('.drawio') ? name : name + '.drawio'
    const filePath = path.join(toLinuxPath(rawDir), safeName)
    if (fs.existsSync(filePath)) return { error: 'File already exists' }
    const blankXml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
    fs.writeFileSync(filePath, blankXml, 'utf8')
    return { success: true, path: filePath }
  } catch (err) {
    return { error: err.message }
  }
})

// Create a new blank Word document (.docx)
ipcMain.handle('obsidian:create-docx', async (_, rawDir, name) => {
  try {
    const safeName = name.endsWith('.docx') ? name : name + '.docx'
    const filePath = path.join(toLinuxPath(rawDir), safeName)
    if (fs.existsSync(filePath)) return { error: 'File already exists' }
    const { Document, Packer, Paragraph } = require('docx')
    const doc = new Document({
      sections: [{ children: [new Paragraph('')] }],
    })
    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(filePath, buffer)
    return { success: true, path: filePath }
  } catch (err) {
    return { error: err.message }
  }
})

// Create a new blank Excel spreadsheet (.xlsx)
ipcMain.handle('obsidian:create-xlsx', async (_, rawDir, name) => {
  try {
    const safeName = name.endsWith('.xlsx') ? name : name + '.xlsx'
    const filePath = path.join(toLinuxPath(rawDir), safeName)
    if (fs.existsSync(filePath)) return { error: 'File already exists' }
    const ExcelJS = require('exceljs')
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Sheet1')
    const buffer = await workbook.xlsx.writeBuffer()
    fs.writeFileSync(filePath, Buffer.from(buffer))
    return { success: true, path: filePath }
  } catch (err) {
    return { error: err.message }
  }
})

// Return the path to the local bridge page that wraps draw.io in an iframe
ipcMain.handle('drawio:get-frame-path', () => {
  return path.join(__dirname, 'drawio-frame.html')
})

// Return the path to the drawio-preload script
ipcMain.handle('drawio:get-preload-path', () => {
  return path.join(__dirname, 'drawio-preload.js')
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

// Check whether a directory is empty on disk (ignores hidden/system files starting with .)
ipcMain.handle('obsidian:is-dir-empty', (_, rawPath) => {
  try {
    const p = toLinuxPath(rawPath)
    const stat = fs.statSync(p)
    if (!stat.isDirectory()) return { isDir: false }
    const entries = fs.readdirSync(p).filter(e => !e.startsWith('.'))
    return { isDir: true, empty: entries.length === 0 }
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

// Copy external files into a vault directory (system drag-drop / paste)
// sourcePaths: array of absolute paths (Windows or Linux)
// rawDestDir: destination directory inside the vault
ipcMain.handle('obsidian:copy-files-to-dir', (_, sourcePaths, rawDestDir) => {
  const results = []
  const destDir = toLinuxPath(rawDestDir)
  if (!fs.existsSync(destDir)) {
    try { fs.mkdirSync(destDir, { recursive: true }) } catch (err) {
      return [{ error: err.message }]
    }
  }
  for (const rawSrc of sourcePaths) {
    try {
      const src = toLinuxPath(rawSrc)
      if (!fs.existsSync(src)) { results.push({ error: `Not found: ${src}` }); continue }
      const stat = fs.statSync(src)
      if (stat.isDirectory()) { results.push({ error: `Directories not supported: ${src}` }); continue }
      const baseName = path.basename(src)
      // Resolve name collision: append (1), (2), … before the extension
      const ext = path.extname(baseName)
      const stem = path.basename(baseName, ext)
      let destPath = path.join(destDir, baseName)
      let counter = 1
      while (fs.existsSync(destPath)) {
        destPath = path.join(destDir, `${stem} (${counter})${ext}`)
        counter++
      }
      fs.copyFileSync(src, destPath)
      results.push({ success: true, path: destPath, name: path.basename(destPath) })
    } catch (err) {
      results.push({ error: err.message })
    }
  }
  return results
})

// -- File Reveal / Open -------------------------------------------------------

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

ipcMain.handle('window:set-fullscreen', (_, flag) => {
  mainWindow?.setFullScreen(!!flag)
})

ipcMain.handle('window:get-position', () => mainWindow ? mainWindow.getPosition() : [0, 0])
// Title-bar drag: size is captured once at drag-start and reused for every
// move so Windows DPI scaling cannot silently grow the window dimensions.
let _dragPinnedSize = null
ipcMain.on('window:drag-start', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { width, height } = mainWindow.getBounds()
  _dragPinnedSize = { width, height }
})
ipcMain.on('window:drag-end', () => { _dragPinnedSize = null })
ipcMain.on('window:move-to', (_, x, y) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (_dragPinnedSize) {
    mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: _dragPinnedSize.width, height: _dragPinnedSize.height })
  } else {
    mainWindow.setPosition(Math.round(x), Math.round(y))
  }
})
ipcMain.handle('window:minimize', () => { mainWindow?.minimize() })
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
  return mainWindow.isMaximized()
})
ipcMain.handle('window:close', () => {
  // Force exit after a short grace period in case cleanup hangs
  setTimeout(() => { process.exit(0) }, 3000)
  app.quit()
})
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

const MINIBAR_DEFAULT_W = 230
let _minibarIntendedW = MINIBAR_DEFAULT_W
let _minibarIntendedH = 80
const MINIBAR_MAX_W = 1400 // sanity cap — anything wider is a stale/corrupt save
let _preMinibarBounds = null
// Load persisted minibar bounds from config.json (survives restarts)
let _lastMinibarBounds = (() => {
  const cfg = readJSON(CONFIG_FILE, {})
  const b = cfg._minibarBounds
  if (b && typeof b.width === 'number' && b.width >= 200 && b.width <= MINIBAR_MAX_W) {
    return b
  }
  if (b) {
    try { cfg._minibarBounds = null; writeJSON(CONFIG_FILE, cfg) } catch {}
  }
  return null
})()
ipcMain.handle('window:set-minibar', (_, arg) => {
  if (!mainWindow) return
  // arg can be a plain boolean (initial enter/exit) or { enable, height?, width? }
  const enable = typeof arg === 'object' ? arg.enable : !!arg
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  if (enable) {
    const explicitW = typeof arg === 'object' && arg.width
    const explicitH = typeof arg === 'object' && arg.height
    const barW = explicitW ? arg.width  : MINIBAR_DEFAULT_W
    const barH = explicitH ? arg.height : 80
    if (!_preMinibarBounds) {
      // Entering minibar mode: save normal bounds, disable OS resize, apply constraints
      _preMinibarBounds = mainWindow.getBounds()
      mainWindow.setMinimumSize(200, 80)
      mainWindow.setResizable(false)
      mainWindow.setAlwaysOnTop(true, 'floating')
      if (_lastMinibarBounds) {
        _minibarIntendedW = _lastMinibarBounds.width
        _minibarIntendedH = _lastMinibarBounds.height
        mainWindow.setBounds(_lastMinibarBounds)
      } else {
        _minibarIntendedW = barW
        _minibarIntendedH = barH
        mainWindow.setBounds({ x: Math.round((sw - barW) / 2), y: 0, width: barW, height: barH })
      }
    } else {
      // Already in minibar mode: only update what was explicitly passed
      const cur = mainWindow.getBounds()
      const newW = explicitW ? arg.width : _minibarIntendedW
      const newH = explicitH ? arg.height : _minibarIntendedH
      _minibarIntendedW = newW
      _minibarIntendedH = newH
      mainWindow.setBounds({ x: cur.x, y: cur.y, width: newW, height: newH })
    }
  } else {
    // Exiting: snapshot and persist current minibar bounds
    _saveMinibarBounds()
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setResizable(true)
    mainWindow.setMinimumSize(600, 400)
    if (_preMinibarBounds) mainWindow.setBounds(_preMinibarBounds)
    _preMinibarBounds = null
  }
})

function _saveMinibarBounds() {
  if (!mainWindow) return
  // Use intended dimensions — getBounds() can report DPI-drifted sizes that corrupt the restore.
  const cur = mainWindow.getBounds()
  _lastMinibarBounds = { x: cur.x, y: cur.y, width: _minibarIntendedW, height: _minibarIntendedH }
  try {
    const cfg = readJSON(CONFIG_FILE, {})
    cfg._minibarBounds = _lastMinibarBounds
    writeJSON(CONFIG_FILE, cfg)
  } catch (e) {
    logger.warn('Failed to save minibar bounds:', e.message)
  }
}
ipcMain.handle('window:save-minibar-bounds', () => _saveMinibarBounds())
ipcMain.handle('window:set-position', (_, x, y) => {
  if (!mainWindow) return
  // Use setBounds with pinned intended dimensions to prevent Windows DPI scaling
  // from silently growing the window width on each setPosition call.
  mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: _minibarIntendedW, height: _minibarIntendedH })
})

// Clamp minibar to nearest screen work area after every native drag ends
function _attachMinibarMovedGuard(win) {
  win.on('moved', () => {
    // Only enforce while in minibar mode
    if (!_preMinibarBounds) return
    const b = win.getBounds()
    const display = screen.getDisplayMatching(b)
    const wa = display.workArea
    const clampedX = Math.max(wa.x, Math.min(wa.x + wa.width  - _minibarIntendedW,  b.x))
    const clampedY = Math.max(wa.y, Math.min(wa.y + wa.height - _minibarIntendedH, b.y))
    if (clampedX !== b.x || clampedY !== b.y) {
      win.setBounds({ x: clampedX, y: clampedY, width: _minibarIntendedW, height: _minibarIntendedH })
    }
  })
}

// files:open-image-data-uri -- write a base64 data URI to a temp file and open with the OS viewer
ipcMain.handle('files:open-image-data-uri', async (_, { dataUri, name }) => {
  try {
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    // Extract base64 payload from data URI (data:<mediaType>;base64,<data>)
    const match = dataUri.match(/^data:(image\/[^;]+);base64,(.+)$/s)
    if (!match) return { error: 'Invalid data URI' }
    const ext = match[1].split('/')[1] || 'png'
    const safeName = (name || `image.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_')
    const tmpPath = path.join(os.tmpdir(), safeName)
    fs.writeFileSync(tmpPath, Buffer.from(match[2], 'base64'))
    if (isWSL()) {
      const { execSync } = require('child_process')
      execSync('explorer.exe "' + toWindowsPath(tmpPath) + '"')
      return { success: true }
    }
    const result = await shell.openPath(tmpPath)
    if (result) return { error: result }
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

// ══════════════════════════════════════════════════════════════════════════════
// Voice Call IPC Handlers
// ══════════════════════════════════════════════════════════════════════════════
const VoiceSession = require('./agent/voice/VoiceSession')
let activeVoiceSession = null

ipcMain.handle('voice:start', async (event, { chatId, personaId, history, voiceConfig, persona, userPersona, whisperConfig }) => {
  try {
    if (activeVoiceSession) {
      activeVoiceSession.stop()
      activeVoiceSession = null
    }

    // Load soul memory for both personas so the voice LLM has full context
    const systemSoulContent = readSoulFileSync(persona?.id || personaId, 'system')
    const userSoulContent = readSoulFileSync(userPersona?.id, 'users')

    // Build llmCall function that routes to the correct provider.
    // Returns { text, inputTokens, outputTokens } for usage tracking.
    // opts.onChunk(delta) — called with each streamed token when streaming is requested.
    // Voice responses are brief (1–3 sentences) so 400 tokens is a safe cap that also
    // keeps generation fast. Task JSON rarely exceeds 200 tokens.
    const llmCall = async (messages, vc, opts = {}) => {
      const { onChunk, signal } = opts
      const cfg = readJSON(CONFIG_FILE, {})
      const provider = vc.provider || voiceConfig.provider
      const model = vc.model || voiceConfig.model

      if (provider === 'openai') {
        const { OpenAIClient } = require('./agent/core/OpenAIClient')
        const clientCfg = {
          ...cfg,
          openaiApiKey: cfg.openai?.apiKey || cfg.openaiApiKey,
          openaiBaseURL: cfg.openai?.baseURL || cfg.openaiBaseURL,
          _resolvedProvider: 'openai',
        }
        if (model) clientCfg.customModel = model
        const client = new OpenAIClient(clientCfg)
        const resolvedModel = client.resolveModel()
        const raw = client.getClient()

        if (onChunk) {
          const stream = await raw.chat.completions.create({ model: resolvedModel, messages, max_tokens: 400, stream: true })
          let fullText = ''
          for await (const chunk of stream) {
            if (signal?.aborted) { stream.controller?.abort(); break }
            const delta = chunk.choices?.[0]?.delta?.content || ''
            if (delta) { fullText += delta; onChunk(delta) }
          }
          return { text: fullText, inputTokens: 0, outputTokens: 0 }
        }

        const resp = await raw.chat.completions.create({ model: resolvedModel, messages, max_tokens: 400 })
        return {
          text: resp.choices?.[0]?.message?.content || '',
          inputTokens: resp.usage?.prompt_tokens || 0,
          outputTokens: resp.usage?.completion_tokens || 0,
        }
      } else {
        // Anthropic or OpenRouter — both use AnthropicClient
        const { AnthropicClient } = require('./agent/core/AnthropicClient')
        const provCfg = provider === 'openrouter' ? cfg.openrouter : cfg.anthropic
        const clientCfg = {
          ...cfg,
          apiKey: provCfg?.apiKey || cfg.apiKey,
          baseURL: provCfg?.baseURL || cfg.baseURL,
        }
        if (model) clientCfg.customModel = model
        const ac = new AnthropicClient(clientCfg)
        const resolvedModel = ac.resolveModel()
        const client = ac.getClient()
        const system = messages.find(m => m.role === 'system')?.content || ''
        const nonSystem = messages.filter(m => m.role !== 'system')

        if (onChunk) {
          const stream = await client.messages.create({ model: resolvedModel, max_tokens: 400, stream: true, system, messages: nonSystem })
          let fullText = ''
          let inputTokens = 0, outputTokens = 0
          for await (const event of stream) {
            if (signal?.aborted) { stream.controller?.abort(); break }
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const t = event.delta.text || ''
              if (t) { fullText += t; onChunk(t) }
            } else if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = event.message.usage.input_tokens || 0
            } else if (event.type === 'message_delta' && event.usage) {
              outputTokens = event.usage.output_tokens || 0
            }
          }
          return { text: fullText, inputTokens, outputTokens }
        }

        const resp = await client.messages.create({ model: resolvedModel, max_tokens: 400, system, messages: nonSystem })
        return {
          text: resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '',
          inputTokens: resp.usage?.input_tokens || 0,
          outputTokens: resp.usage?.output_tokens || 0,
        }
      }
    }

    const sendToRenderer = (channel, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data)
      }
    }

    activeVoiceSession = new VoiceSession({
      voiceConfig,
      whisperConfig,
      persona,
      userPersona: userPersona || {},
      systemSoulContent: systemSoulContent || '',
      userSoulContent: userSoulContent || '',
      history: history || [],
      llmCall,
      onStatus:        (s)    => sendToRenderer('voice:status', s),
      onTranscript:    (text) => sendToRenderer('voice:transcription', { text }),
      onAiText:        (text, meta) => sendToRenderer('voice:ai-text', { text, ...meta }),
      onTaskTriggered: (inst) => sendToRenderer('voice:task-triggered', { instruction: inst }),
      onError:         (msg)  => sendToRenderer('voice:error', { message: msg }),
      onUsage:         (u)    => { sendToRenderer('voice:usage', u); accumulateUsage(chatId, u).catch(() => {}) },
    })

    activeVoiceSession.start()
    return { success: true }
  } catch (err) {
    logger.error('voice:start error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('voice:stop', () => {
  if (activeVoiceSession) {
    activeVoiceSession.stop()
    activeVoiceSession = null
  }
  return { success: true }
})

ipcMain.handle('voice:audio-chunk', async (event, audioBuffer) => {
  if (!activeVoiceSession) return { success: false, error: 'No active voice session' }
  try {
    activeVoiceSession.processAudio(Buffer.from(audioBuffer)) // fire and forget — results come via events
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('voice:mute', (event, { muted }) => {
  if (activeVoiceSession) activeVoiceSession.setMuted(muted)
  return { success: true }
})

ipcMain.handle('voice:update-history', (event, history) => {
  if (activeVoiceSession) activeVoiceSession.history = history || []
  return { success: true }
})

ipcMain.handle('voice:task-complete', async (event, summary) => {
  if (activeVoiceSession) {
    activeVoiceSession.notifyTaskComplete(summary)
  }
  return { success: true }
})

// OpenAI TTS HD — returns audio buffer as base64 for renderer playback
ipcMain.handle('voice:tts', async (event, { text, apiKey, baseURL, model, voice }) => {
  try {
    if (!text || !apiKey) return { success: false, error: 'Missing text or API key' }
    const ttsModel = model || 'tts-1' // 'tts-1' = $15/1M chars, 'tts-1-hd' = $30/1M chars
    const base = (baseURL || 'https://api.openai.com').replace(/\/+$/, '')
    const isStandard = base.includes('api.openai.com')
    const url = isStandard
      ? `${base}/v1/audio/speech`
      : `${base}/proxy/openai/v1/audio/speech`
    const authHeader = isStandard
      ? { 'Authorization': `Bearer ${apiKey}` }
      : { 'x-api-key': apiKey }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ttsModel, input: text, voice: voice || 'alloy', response_format: 'mp3' }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { success: false, error: `TTS API error ${resp.status}: ${body.slice(0, 200)}` }
    }
    const arrayBuf = await resp.arrayBuffer()
    return { success: true, audio: Buffer.from(arrayBuf).toString('base64'), format: 'mp3' }
  } catch (err) {
    return { success: false, error: err.message }
  }
})


