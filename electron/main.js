const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')

// Helper to get provider config by type from the new providers array
function getProviderByType(config, type) {
  if (config.providers && Array.isArray(config.providers)) {
    return config.providers.find(p => p.type === type && p.isActive)
  }
  return null
}

// Get provider config by ID (uuid)
function getProviderById(config, id) {
  if (config.providers && Array.isArray(config.providers)) {
    return config.providers.find(p => p.id === id)
  }
  return null
}

// Build provider client config from provider object
function buildProviderClientConfig(provider, model = null) {
  if (!provider) return null
  
  const isOpenAI = provider.type === 'openai' || provider.type === 'openai_official' || provider.type === 'deepseek' || provider.type === 'minimax'
  
  const cfg = {
    provider: {
      id: provider.id,
      type: provider.type,
      name: provider.name,
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      model: model || provider.model,
      settings: provider.settings || {},
    },
  }
  
  if (isOpenAI) {
    cfg.defaultProvider = 'openai'
    cfg._resolvedProvider = 'openai'
    if (provider.type === 'openai_official' || provider.type === 'deepseek' || provider.type === 'minimax') {
      cfg._directAuth = true
    }
  } else {
    cfg.defaultProvider = provider.type
    cfg._resolvedProvider = provider.type
  }
  
  return cfg
}

// Suppress libsignal verbose warnings — they use console.warn internally
const originalWarn = console.warn
console.warn = function (...args) {
  if (args[0]?.includes?.('Closing open session')) return
  originalWarn.apply(console, args)
}

// Point Chromium's fontconfig at our bundled fonts.conf BEFORE electron is
// required -- this is the only hook that runs before Chromium initialises its
// font subsystem. On Linux this makes Segoe UI Emoji available so the
// renderer can display emoji without any user system changes.
if (process.platform === 'linux') {
  process.env.FONTCONFIG_FILE = path.join(__dirname, 'fonts.conf')
}

const { app, BrowserWindow, ipcMain, dialog, shell, screen, protocol, net, session, Menu } = require('electron')
const os = require('os')
const { execFile } = require('child_process')
const { logger, LOG_DIR } = require('./logger')
const imBridge = require('./im-bridge')
const { mcpManager } = require('./agent/mcp/McpManager')
const ipcWindow = require('./ipc/window')
let ipcAgent = null

logger.info('=== ClankAI starting ===')

// Dev mode: run-electron.js sets ELECTRON_DEV=true
const isDev = process.env.ELECTRON_DEV === 'true'

// --- Storage ----------------------------------------------------------------
// DEFAULT_DATA_PATH will be set after app is ready
let DEFAULT_DATA_PATH = null
let DATA_DIR = null
// Derived paths — re-computed by initDataPaths() if DATA_DIR changes at startup
let CHATS_FILE, CHATS_DIR, CHATS_INDEX_FILE, CONFIG_FILE, AGENTS_FILE,
    MCP_SERVERS_FILE, TOOLS_FILE, SOULS_DIR, KNOWLEDGE_FILE,
    UTILITY_USAGE_FILE, TASKS_FILE, PLANS_FILE, TASK_RUNS_DIR, TASK_RUNS_INDEX,
    TASK_CATEGORIES_FILE, PLAN_CATEGORIES_FILE, AI_TASK_TREE_FILE,
    PLAZA_TOPICS_FILE, PLAZA_SESSIONS_DIR
let MEMORY_DIR, AGENT_MEMORY_DIR, USER_MEMORY_DIR

function initDataPaths() {
  if (!DATA_DIR) {
    DEFAULT_DATA_PATH = path.join(app.getPath('appData'), 'clankai', 'data')
    DATA_DIR = DEFAULT_DATA_PATH
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
  }
  CHATS_FILE         = path.join(DATA_DIR, 'chats.json')
  CHATS_DIR          = path.join(DATA_DIR, 'chats')
  CHATS_INDEX_FILE   = path.join(CHATS_DIR, 'index.json')
  CONFIG_FILE        = path.join(DATA_DIR, 'config.json')
  AGENTS_FILE        = path.join(DATA_DIR, 'agents.json')
  MCP_SERVERS_FILE   = path.join(DATA_DIR, 'mcp-servers.json')
  TOOLS_FILE         = path.join(DATA_DIR, 'tools.json')
  SOULS_DIR          = path.join(DATA_DIR, 'souls')
  KNOWLEDGE_FILE     = path.join(DATA_DIR, 'knowledge.json')
  UTILITY_USAGE_FILE = path.join(DATA_DIR, 'utility-usage.json')
  TASKS_FILE         = path.join(DATA_DIR, 'tasks.json')
  PLANS_FILE         = path.join(DATA_DIR, 'plans.json')
  TASK_RUNS_DIR      = path.join(DATA_DIR, 'task-runs')
  TASK_RUNS_INDEX    = path.join(DATA_DIR, 'task-runs', 'index.json')
  TASK_CATEGORIES_FILE = path.join(DATA_DIR, 'task-categories.json')
  PLAN_CATEGORIES_FILE = path.join(DATA_DIR, 'plan-categories.json')
  AI_TASK_TREE_FILE    = path.join(DATA_DIR, 'ai-task-tree.json')
  PLAZA_TOPICS_FILE    = path.join(DATA_DIR, 'plaza-topics.json')
  PLAZA_SESSIONS_DIR   = path.join(DATA_DIR, 'plaza-sessions')
  MEMORY_DIR           = path.join(DATA_DIR, 'memory')
  AGENT_MEMORY_DIR     = path.join(MEMORY_DIR, 'agents')
  USER_MEMORY_DIR      = path.join(MEMORY_DIR, 'users')
}


// --- Memory directory helpers ------------------------------------------------

/** Ensure per-agent memory directories exist. Returns { memDir, logsDir }. */
function ensureAgentMemoryDirs(agentId) {
  const memDir  = path.join(AGENT_MEMORY_DIR, agentId)
  const logsDir = path.join(memDir, 'memory')
  fs.mkdirSync(logsDir, { recursive: true })
  return { memDir, logsDir }
}

/** Ensure user memory directory exists. Returns userDir path. */
function ensureUserMemoryDir(userId) {
  const userDir = path.join(USER_MEMORY_DIR, userId)
  fs.mkdirSync(userDir, { recursive: true })
  return userDir
}

/** Read a memory file. Returns null if missing. */
function readMemoryFile(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    logger.error('readMemoryFile error', err.message)
  }
  return null
}

/** Append text to a memory file (creates if missing). */
function appendMemoryFile(filePath, text) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.appendFileSync(filePath, text, 'utf8')
  } catch (err) {
    logger.error('appendMemoryFile error', err.message)
  }
}

/** Append a memory entry to USER.md (shared across agents) or MEMORY.md (per-agent). */
function appendMemoryEntry(agentId, userId, target, section, entry) {
  try {
    let filePath
    if (target === 'user') {
      const userDir = path.join(USER_MEMORY_DIR, userId)
      fs.mkdirSync(userDir, { recursive: true })
      filePath = path.join(userDir, 'USER.md')
    } else {
      const agentDir = path.join(AGENT_MEMORY_DIR, agentId)
      fs.mkdirSync(agentDir, { recursive: true })
      filePath = path.join(agentDir, 'MEMORY.md')
    }

    // Ensure file exists with header
    if (!fs.existsSync(filePath)) {
      const header = target === 'user'
        ? `# User Profile\n> Auto-generated by ClankAI\n\n`
        : `# Knowledge Base\n> Auto-generated by ClankAI\n\n`
      fs.writeFileSync(filePath, header, 'utf8')
    }

    // Append under section header (create section if missing)
    let content = fs.readFileSync(filePath, 'utf8')
    const sectionHeader = `## ${section}`
    if (!content.includes(sectionHeader)) {
      content += `\n${sectionHeader}\n\n`
    }
    content += `- ${entry}\n`
    fs.writeFileSync(filePath, content, 'utf8')
  } catch (err) {
    logger.error('appendMemoryEntry error', err.message)
  }
}

/** Get today's and yesterday's dated log paths for an agent. */
function getAgentLogPaths(agentId) {
  const { logsDir } = ensureAgentMemoryDirs(agentId)
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const yest  = new Date(now - 86400000).toISOString().slice(0, 10)
  return {
    todayPath:     path.join(logsDir, `${today}.md`),
    yesterdayPath: path.join(logsDir, `${yest}.md`),
  }
}

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


function ensureDataDir() {
  // Always use default path - no user customization
  DEFAULT_DATA_PATH = path.join(app.getPath('appData'), 'clankai', 'data')
  DATA_DIR = DEFAULT_DATA_PATH
  initDataPaths()
  // Publish DATA_DIR to env so sub-modules (im-bridge, agentLoop fallback) can find it
  process.env.CLANKAI_DATA_PATH = DATA_DIR
  // Redirect logs to DATA_DIR/logs now that the data path is known
  logger.setLogDir(path.join(DATA_DIR, 'logs'))

  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    } catch (err) {
      const fallback = app.getPath('userData')
      logger.warn(`Cannot create ${DATA_DIR} (${err.code}), falling back to ${fallback}`)
      DATA_DIR = fallback
      initDataPaths()
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    }
  }


  // Ensure memory directories exist
  fs.mkdirSync(MEMORY_DIR,       { recursive: true })
  fs.mkdirSync(AGENT_MEMORY_DIR, { recursive: true })
  fs.mkdirSync(USER_MEMORY_DIR,  { recursive: true })
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
    // Retry on ENOENT or EPERM (filesystem race)
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
  providers: [],  // New dynamic providers array
  anthropic: {    // Legacy structure for backward compat
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
  maxOutputTokens: 32768,
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

// Manual maximize state — managed by ipc/window.js (setMaximizeState/getMaximizeState)
// ipcWindow is required at module top-level (safe — ds.paths() only used when handlers fire)

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const winW = Math.round(screenW * 4 / 5)
  const winH = Math.round(screenH * 4 / 5)

  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, '../public/icon.png'),
    width: Math.round(screenW * 0.7),
    height: Math.round(screenH * 0.7),
    x: Math.round((screenW - screenW * 0.7) / 2),
    y: Math.round((screenH - screenH * 0.7) / 2),
    minWidth: 600,
    minHeight: 400,
    frame: false,
    fullscreen: false,
    maximizable: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: true
    }
  })

  // Publish to shared windowRef so extracted IPC modules can access it
  require('./lib/windowRef').set(mainWindow)

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.on('closed', () => {
    mainWindow = null
    require('./lib/windowRef').set(null)
  })

  // Window maximize state — tracked manually because Electron's isMaximized()
  // returns false on secondary monitors when moved there via custom setBounds drag.
  mainWindow.on('maximize', () => {
    ipcWindow.setMaximizeState(true, ipcWindow.getMaximizeState()._preMaximizeBounds)
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    ipcWindow.setMaximizeState(false, null)
    mainWindow?.webContents.send('window:maximized', false)
  })
  mainWindow.on('enter-full-screen', () => { mainWindow?.webContents.send('window:maximized', true) })
  mainWindow.on('leave-full-screen', () => { mainWindow?.webContents.send('window:maximized', false) })
  
  // Custom titlebar double-click handler - resize to 70%
  const titleBarHeight = 40
  mainWindow.on('blur', () => { _isFocused = false })
  mainWindow.on('focus', () => { _isFocused = true })
  let _lastClickTime = 0
  mainWindow.on('touch-start', (e) => {
    const now = Date.now()
    if (now - _lastClickTime < 300) {
      const bounds = mainWindow.getBounds()
      if (bounds.y <= titleBarHeight || e.getPosition()[1] <= titleBarHeight) {
        const screen = require('electron').screen.getDisplayMatching(mainWindow.getBounds())
        const screenBounds = screen.workArea
        const newWidth = Math.round(screenBounds.width * 0.7)
        const newHeight = Math.round(screenBounds.height * 0.7)
        mainWindow.setBounds({
          x: Math.round(screenBounds.x + (screenBounds.width - newWidth) / 2),
          y: Math.round(screenBounds.y + (screenBounds.height - newHeight) / 2),
          width: newWidth,
          height: newHeight
        })
      }
    }
    _lastClickTime = now
  })
  
  // Also handle double-click on titlebar area via webContents
  mainWindow.webContents.on('input-event', (event, input) => {
    if (input.type === 'mouseDoubleClick' && input.mouseY <= 40) {
      const screen = require('electron').screen.getDisplayMatching(mainWindow.getBounds())
      const screenBounds = screen.workArea
      const newWidth = Math.round(screenBounds.width * 0.7)
      const newHeight = Math.round(screenBounds.height * 0.7)
      mainWindow.setBounds({
        x: Math.round(screenBounds.x + (screenBounds.width - newWidth) / 2),
        y: Math.round(screenBounds.y + (screenBounds.height - newHeight) / 2),
        width: newWidth,
        height: newHeight
      })
    }
  })
  ipcWindow._attachMinibarMovedGuard(mainWindow)

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
  const t0 = Date.now()
  logger.info('startup: app.whenReady fired')

  // Handle vault-asset:// requests -> serve files from disk
  // URL format: vault-asset:///absolute/path/to/file
  protocol.handle('vault-asset', (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname)
    return net.fetch('file://' + filePath)
  })

  ensureDataDir()
  // Initialize the shared dataStore module so extracted IPC modules can use ds.paths()
  require('./lib/dataStore').init()
  logger.info(`startup: ensureDataDir done +${Date.now()-t0}ms`)

  await migrateChatsIfNeeded()
  logger.info(`startup: migrateChatsIfNeeded done +${Date.now()-t0}ms`)

  await migrateEnvDataIfNeeded()
  logger.info(`startup: migrateEnvDataIfNeeded done +${Date.now()-t0}ms`)

  createWindow()
  logger.info(`startup: createWindow done +${Date.now()-t0}ms`)

  // Register all IPC handlers (must be after dataStore.init() and createWindow())
  ipcAgent = require('./ipc').registerAll({ DEFAULT_CONFIG, imBridge, mcpManager }).ipcAgent
  logger.info(`startup: registerAll done +${Date.now()-t0}ms`)

  // Anonymous install telemetry (async, non-blocking, silent on failure)
  require('./lib/telemetry').sendInstallPing().catch(() => {})

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
  logger.info(`startup: taskScheduler.init done +${Date.now()-t0}ms`)

  // ── IM Bridge ──────────────────────────────────────────────────────────────
  // setMainWindow is synchronous and fast — do it immediately so the bridge
  // has the window reference before any IPC arrives.
  // imBridge.start() can take 1-2s (Telegram/WhatsApp session restore), so
  // defer it past the current event loop tick to avoid blocking main startup.
  const _imCfg = readJSON(CONFIG_FILE, {})
  imBridge.setMainWindow(mainWindow)
  if (_imCfg.im?.telegram?.enabled || _imCfg.im?.whatsapp?.enabled || _imCfg.im?.feishu?.enabled || _imCfg.im?.teams?.enabled) {
    setImmediate(() => imBridge.start(_imCfg))
  }

  // Background: index any chats not yet in the search index
  setImmediate(() => {
    ipcAgent._runStartupIndexRecovery().catch(err =>
      logger.error('[Startup] index recovery error', err.message)
    )
  })

  // ── Renderer load timing ──────────────────────────────────────────────────
  mainWindow.webContents.once('did-finish-load', () => {
    logger.info(`startup: renderer did-finish-load +${Date.now()-t0}ms`)
  })
  mainWindow.webContents.once('dom-ready', () => {
    logger.info(`startup: renderer dom-ready +${Date.now()-t0}ms`)
  })

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

  logger.info(`startup: all init done +${Date.now()-t0}ms. Log dir: ${LOG_DIR}`)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (e) => {
  // Stop all active agent loops (in-flight LLM calls)
  if (ipcAgent) {
    for (const [key, loop] of ipcAgent.activeLoops) {
      try { loop.stop() } catch {}
      ipcAgent.activeLoops.delete(key)
      ipcAgent.activeLoopMeta.delete(key)
    }
  }

  // Stop MCP subprocesses and IM bridge
  try { await mcpManager.stopAll() } catch (err) { logger.error('MCP cleanup error:', err.message) }
  imBridge.stop()
})

