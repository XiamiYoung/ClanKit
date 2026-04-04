/**
 * Centralized data path management and JSON I/O for ClankAI.
 * All IPC handler modules require() this to access file paths and read/write data.
 *
 * Usage:
 *   const ds = require('../lib/dataStore')
 *   ds.init()  // called once from main.js after app is ready
 *   const config = ds.readJSON(ds.paths.CONFIG_FILE, {})
 */
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const { logger } = require('../logger')

// --- Path state (populated by init()) ----------------------------------------
let _paths = null

function paths() {
  if (!_paths) throw new Error('dataStore.init() has not been called')
  return _paths
}

// --- Initialization -----------------------------------------------------------
function init() {
  const DEFAULT_DATA_PATH = path.join(app.getPath('appData'), 'clankai', 'data')
  let DATA_DIR = DEFAULT_DATA_PATH
  process.env.CLANKAI_DATA_PATH = DATA_DIR
  logger.setLogDir(path.join(DATA_DIR, 'logs'))

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  const CHATS_DIR        = path.join(DATA_DIR, 'chats')
  const MEMORY_DIR       = path.join(DATA_DIR, 'memory')
  const AGENT_MEMORY_DIR = path.join(MEMORY_DIR, 'agents')
  const USER_MEMORY_DIR  = path.join(MEMORY_DIR, 'users')
  const KNOWLEDGE_DIR    = path.join(DATA_DIR, 'knowledge')
  const MODELS_DIR       = path.join(DATA_DIR, 'models')

  // Ensure essential directories
  fs.mkdirSync(MEMORY_DIR,       { recursive: true })
  fs.mkdirSync(AGENT_MEMORY_DIR, { recursive: true })
  fs.mkdirSync(USER_MEMORY_DIR,  { recursive: true })
  fs.mkdirSync(KNOWLEDGE_DIR,    { recursive: true })
  fs.mkdirSync(MODELS_DIR,       { recursive: true })

  _paths = {
    DATA_DIR,
    DEFAULT_DATA_PATH,
    CHATS_FILE:           path.join(DATA_DIR, 'chats.json'),
    CHATS_DIR,
    CHATS_INDEX_FILE:     path.join(CHATS_DIR, 'index.json'),
    CONFIG_FILE:          path.join(DATA_DIR, 'config.json'),
    AGENTS_FILE:          path.join(DATA_DIR, 'agents.json'),
    MCP_SERVERS_FILE:     path.join(DATA_DIR, 'mcp-servers.json'),
    TOOLS_FILE:           path.join(DATA_DIR, 'tools.json'),
    SOULS_DIR:            path.join(DATA_DIR, 'souls'),
    KNOWLEDGE_FILE:       path.join(DATA_DIR, 'knowledge.json'),
    UTILITY_USAGE_FILE:   path.join(DATA_DIR, 'utility-usage.json'),
    TASKS_FILE:           path.join(DATA_DIR, 'tasks.json'),
    PLANS_FILE:           path.join(DATA_DIR, 'plans.json'),
    TASK_RUNS_DIR:        path.join(DATA_DIR, 'task-runs'),
    TASK_RUNS_INDEX:      path.join(DATA_DIR, 'task-runs', 'index.json'),
    TASK_CATEGORIES_FILE: path.join(DATA_DIR, 'task-categories.json'),
    PLAN_CATEGORIES_FILE: path.join(DATA_DIR, 'plan-categories.json'),
    AI_TASK_TREE_FILE:    path.join(DATA_DIR, 'ai-task-tree.json'),
    PROVIDER_MODELS_FILE: path.join(DATA_DIR, 'provider-models.json'),
    PLAZA_TOPICS_FILE:    path.join(DATA_DIR, 'plaza-topics.json'),
    PLAZA_SESSIONS_DIR:   path.join(DATA_DIR, 'plaza-sessions'),
    MEMORY_DIR,
    AGENT_MEMORY_DIR,
    USER_MEMORY_DIR,
    KNOWLEDGE_DIR,
    MODELS_DIR,
  }

  return _paths
}

// --- JSON I/O ----------------------------------------------------------------
function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  return fallback
}

function writeJSON(file, data) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

async function writeJSONAtomic(file, data, _retries = 2) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = file + `.tmp.${process.pid}.${Date.now()}`
  try {
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.promises.rename(tmp, file)
  } catch (err) {
    try { await fs.promises.unlink(tmp) } catch {}
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

// --- Chat index helper -------------------------------------------------------
function chatMetaFromChat(chat) {
  const { messages, ...meta } = chat
  return meta
}

// --- Provider config helpers -------------------------------------------------
function getProviderByType(config, type) {
  if (config.providers && Array.isArray(config.providers)) {
    return config.providers.find(p => p.type === type && p.isActive)
  }
  return null
}

function getProviderById(config, id) {
  if (config.providers && Array.isArray(config.providers)) {
    return config.providers.find(p => p.id === id)
  }
  return null
}

function buildProviderClientConfig(provider, model = null) {
  if (!provider) return null
  const isOpenAI = provider.type === 'openai' || provider.type === 'openai_official' || provider.type === 'deepseek' || provider.type === 'minimax'
  const cfg = {
    provider: {
      id: provider.id, type: provider.type, name: provider.name,
      baseURL: provider.baseURL, apiKey: provider.apiKey,
      model: model || provider.model, settings: provider.settings || {},
    },
  }
  if (isOpenAI) {
    cfg.defaultProvider = 'openai'
    cfg._resolvedProvider = 'openai'
    if (provider.type === 'openai_official' || provider.type === 'deepseek' || provider.type === 'minimax') cfg._directAuth = true
  } else {
    cfg.defaultProvider = provider.type
    cfg._resolvedProvider = provider.type
  }
  return cfg
}

// --- Env-backed path accessors ------------------------------------------------
function getEnvPaths() {
  const cfg = readJSON(_paths.CONFIG_FILE, {})
  return {
    skillsPath:   cfg.skillsPath   || '',
    DoCPath:      cfg.DoCPath      || '',
    artifactPath: cfg.artifactPath || cfg.artyfactPath || '',
  }
}

module.exports = {
  init,
  paths,
  // JSON I/O
  readJSON,
  writeJSON,
  writeJSONAtomic,
  readJSONAsync,
  // Helpers
  chatMetaFromChat,
  getEnvPaths,
  // Provider config
  getProviderByType,
  getProviderById,
  buildProviderClientConfig,
}
