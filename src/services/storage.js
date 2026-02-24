/**
 * Storage abstraction — uses Electron IPC when available, falls back to localStorage.
 */

const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

// ── Default config (fallback for non-Electron / localStorage mode) ──────────
function browserDefaultConfig() {
  return {
    apiKey:      '',
    baseURL:     'https://api.anthropic.com',
    sonnetModel: 'anthropic/claude-sonnet-latest',
    opusModel:   'anthropic/claude-opus-latest',
    haikuModel:  'anthropic/claude-3-5-haiku-20241022',
    activeModel: 'sonnet'
  }
}

export const storage = {
  // ── Chats ──────────────────────────────────────────────────────────────────
  async getChats() {
    if (isElectron()) return window.electronAPI.getChats()
    return lsGet('sparkai:chats', [])
  },
  async saveChats(chats) {
    if (isElectron()) return window.electronAPI.saveChats(chats)
    lsSet('sparkai:chats', chats)
  },

  // ── Config ─────────────────────────────────────────────────────────────────
  async getConfig() {
    if (isElectron()) return window.electronAPI.getConfig()
    const saved = lsGet('sparkai:config', {})
    const defaults = browserDefaultConfig()
    // Only let saved values override defaults when non-empty
    const nonEmpty = Object.fromEntries(
      Object.entries(saved).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    )
    return { ...defaults, ...nonEmpty }
  },
  async saveConfig(config) {
    if (isElectron()) return window.electronAPI.saveConfig(config)
    lsSet('sparkai:config', config)
  },

  // ── Personas ────────────────────────────────────────────────────────────────
  async getPersonas() {
    if (isElectron()) return window.electronAPI.getPersonas()
    return lsGet('maestro:personas', [])
  },
  async savePersonas(personas) {
    if (isElectron()) return window.electronAPI.savePersonas(personas)
    lsSet('maestro:personas', personas)
  },

}
