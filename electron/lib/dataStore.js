/**
 * Centralized data path management and JSON I/O for ClanKit.
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
const safeStorageHelper = require('./safeStorageHelper')

// --- Path state (populated by init()) ----------------------------------------
let _paths = null

// Config fields that contain credentials and must be encrypted at rest using
// safeStorage (DPAPI / Keychain / libsecret). Encryption is transparent to
// callers of readJSON / writeJSON / readJSONAsync / writeJSONAtomic — values
// appear plaintext in memory and ciphertext on disk. This protects config.json
// from cloud-sync leaks (OneDrive, etc.) without forcing every consumer to
// know about it. encryptString is idempotent so round-trip read/modify/write
// of unrelated fields is safe.
function _isConfigFile(file) {
  return _paths && file === _paths.CONFIG_FILE
}

function _decryptConfigSensitive(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg
  const out = { ...cfg }
  if (Array.isArray(cfg.providers)) {
    out.providers = cfg.providers.map(p => p && typeof p === 'object'
      ? { ...p, apiKey: safeStorageHelper.decryptString(p.apiKey) }
      : p)
  }
  if (cfg.smtp && typeof cfg.smtp === 'object') {
    out.smtp = { ...cfg.smtp, pass: safeStorageHelper.decryptString(cfg.smtp.pass) }
  }
  return out
}

function _encryptConfigSensitive(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg
  const out = { ...cfg }
  if (Array.isArray(cfg.providers)) {
    out.providers = cfg.providers.map(p => p && typeof p === 'object'
      ? { ...p, apiKey: safeStorageHelper.encryptString(p.apiKey) }
      : p)
  }
  if (cfg.smtp && typeof cfg.smtp === 'object') {
    out.smtp = { ...cfg.smtp, pass: safeStorageHelper.encryptString(cfg.smtp.pass) }
  }
  return out
}

function paths() {
  if (!_paths) throw new Error('dataStore.init() has not been called')
  return _paths
}

// --- Initialization -----------------------------------------------------------
function init() {
  // SETTINGS_DIR is FIXED — the only file here is settings.json (dataPath pointer)
  const SETTINGS_DIR = path.join(app.getPath('appData'), 'clankit')
  const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json')
  const DEFAULT_DATA_PATH = path.join(SETTINGS_DIR, 'data')

  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true })
  }

  // Read custom dataPath from settings.json (tiny pointer file)
  let userDataPath = null
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
      if (settings.dataPath && typeof settings.dataPath === 'string' && settings.dataPath.trim()) {
        userDataPath = settings.dataPath.trim()
      }
    }
  } catch (err) {
    logger.warn('Failed to read settings.json, using default data path:', err.message)
  }

  const DATA_DIR = userDataPath || DEFAULT_DATA_PATH
  process.env.CLANKIT_DATA_PATH = DATA_DIR
  logger.setLogDir(path.join(DATA_DIR, 'logs'))

  // Always persist the resolved dataPath so settings.json is never empty
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ dataPath: DATA_DIR }, null, 2), 'utf8') } catch {}

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

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
    SETTINGS_DIR,
    SETTINGS_FILE,
    DATA_DIR,
    DEFAULT_DATA_PATH,
    CONFIG_FILE:          path.join(DATA_DIR, 'config.json'),
    MCP_SERVERS_FILE:     path.join(DATA_DIR, 'mcp-servers.json'),
    TOOLS_FILE:           path.join(DATA_DIR, 'tools.json'),
    AGENT_ARTIFACTS_DIR:  path.join(DATA_DIR, 'agent-artifacts'),
    KNOWLEDGE_FILE:       path.join(DATA_DIR, 'knowledge.json'),
    PROVIDER_MODELS_FILE: path.join(DATA_DIR, 'provider-models.json'),
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
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      return _isConfigFile(file) ? _decryptConfigSensitive(data) : data
    }
  } catch {}
  return fallback
}

function writeJSON(file, data) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const payload = _isConfigFile(file) ? _encryptConfigSensitive(data) : data
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8')
}

async function writeJSONAtomic(file, data, _retries = 3) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = file + `.tmp.${process.pid}.${Date.now()}`
  const payload = _isConfigFile(file) ? _encryptConfigSensitive(data) : data
  try {
    await fs.promises.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8')
    // Small delay on Windows: antivirus may briefly hold the tmp file after write,
    // causing the rename to fail with ENOENT even though we just wrote it.
    if (process.platform === 'win32') await new Promise(r => setTimeout(r, 15))
    await fs.promises.rename(tmp, file)
  } catch (err) {
    try { await fs.promises.unlink(tmp) } catch {}
    if (_retries > 0 && (err.code === 'ENOENT' || err.code === 'EPERM' || err.code === 'EACCES')) {
      await new Promise(r => setTimeout(r, 100 * (4 - _retries)))
      return writeJSONAtomic(file, data, _retries - 1)
    }
    throw err
  }
}

async function readJSONAsync(file, fallback) {
  try {
    const raw = await fs.promises.readFile(file, 'utf8')
    const data = JSON.parse(raw)
    return _isConfigFile(file) ? _decryptConfigSensitive(data) : data
  } catch {
    return fallback
  }
}

/**
 * Read agents in the legacy agents.json shape, sourcing from agents.db.
 * Returns `{ agents: { categories, items }, personas: { categories, items } }`.
 *
 * Bridge for main-process callers that historically did
 * `ds.readJSON(AGENTS_FILE, fallback)` and either flattened with normalizeAgents
 * or walked the structure directly. Lets us delete agents.json from disk
 * without rewriting every consumer.
 */
function readAgentsCompat() {
  const { getInstance: getAgentStore } = require('../agent/AgentStore')
  const store = getAgentStore(_paths.DATA_DIR)
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
}

// Single-slot rolling backup. Copies `file` to `file + '.bak'` before the
// caller overwrites it, so the previous version is always recoverable from one
// step back. Best-effort — never throws or blocks the caller.
//
// Limitation: only the most recent backup is kept. If two bad writes happen in
// a row (e.g. corrupt write, then app restart that re-persists the corruption),
// the original state is gone. That's acceptable for the cases this guards
// (one-off accidental wipes), and the cost of N-rotation isn't worth it for
// files this small.
function backupFile(file) {
  try {
    if (!fs.existsSync(file)) return
    fs.copyFileSync(file, file + '.bak')
  } catch (err) {
    // Swallow — backup must never block the actual write that follows
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
    return config.providers.find(p => p.type === type && p.apiKey)
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
  const isOpenAI = provider.type !== 'anthropic' && provider.type !== 'openrouter' && provider.type !== 'google'
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
    if (provider.type !== 'openai') cfg._directAuth = true
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
  backupFile,
  // Agents (AgentStore-backed bridge)
  readAgentsCompat,
  // Helpers
  chatMetaFromChat,
  getEnvPaths,
  // Provider config
  getProviderByType,
  getProviderById,
  buildProviderClientConfig,
}
