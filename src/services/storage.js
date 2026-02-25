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
    activeModel: 'sonnet',
    openrouterApiKey:  '',
    openrouterBaseURL: 'https://openrouter.ai/api',
    openrouterModel:   '',
    openaiModel:       '',
    openrouterDefaultModel: '',
    openaiDefaultModel:     '',
    systemPrompt:      ''
  }
}

export const storage = {
  // ── Chats (bulk — backward compat) ─────────────────────────────────────────
  async getChats() {
    if (isElectron()) return window.electronAPI.getChats()
    return lsGet('sparkai:chats', [])
  },
  async saveChats(chats) {
    if (isElectron()) return window.electronAPI.saveChats(chats)
    lsSet('sparkai:chats', chats)
  },

  // ── Chats (per-chat granular) ─────────────────────────────────────────────
  async getChatIndex() {
    if (isElectron()) return window.electronAPI.getChatIndex()
    // localStorage fallback: extract metadata from full chats
    const chats = lsGet('sparkai:chats', [])
    return chats.map(({ messages, ...meta }) => meta)
  },
  async saveChatIndex(index) {
    if (isElectron()) return window.electronAPI.saveChatIndex(index)
    // localStorage: no-op — index is derived from full chats array
  },
  async getChat(id) {
    if (isElectron()) return window.electronAPI.getChat(id)
    // localStorage fallback: find in full array
    const chats = lsGet('sparkai:chats', [])
    return chats.find(c => c.id === id) || null
  },
  async saveChat(chat) {
    if (isElectron()) return window.electronAPI.saveChat(chat)
    // localStorage fallback: update in full array
    const chats = lsGet('sparkai:chats', [])
    const idx = chats.findIndex(c => c.id === chat.id)
    if (idx >= 0) chats[idx] = chat
    else chats.unshift(chat)
    lsSet('sparkai:chats', chats)
  },
  async deleteChat(id) {
    if (isElectron()) return window.electronAPI.deleteChat(id)
    const chats = lsGet('sparkai:chats', [])
    lsSet('sparkai:chats', chats.filter(c => c.id !== id))
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

  // ── Soul Memory ────────────────────────────────────────────────────────────
  async getSoul(personaId, type) {
    if (isElectron()) return window.electronAPI.souls.read(personaId, type)
    return lsGet(`sparkai:soul:${type}:${personaId}`, null)
  },
  async saveSoul(personaId, type, content) {
    if (isElectron()) return window.electronAPI.souls.write(personaId, type, content)
    lsSet(`sparkai:soul:${type}:${personaId}`, content)
  },
  async soulExists(personaId, type) {
    if (isElectron()) return window.electronAPI.souls.exists(personaId, type)
    return lsGet(`sparkai:soul:${type}:${personaId}`, null) !== null
  },

}
