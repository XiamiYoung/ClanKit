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
    anthropic: {
      apiKey:      '',
      baseURL:     '',
      sonnetModel: '',
      opusModel:   '',
      haikuModel:  '',
      utilityModel: '',
      isActive: false,
      testedAt: null,
    },
    openrouter: {
      apiKey:  '',
      baseURL: '',
      utilityModel: '',
      isActive: false,
      testedAt: null,
    },
    openai: {
      apiKey:       '',
      baseURL:      '',
      utilityModel: '',
      isActive: false,
      testedAt: null,
    },
    deepseek: {
      apiKey:   '',
      baseURL:  '',
      maxTokens: 8192,
      utilityModel: '',
      isActive: false,
      testedAt: null,
    },
    systemPrompt: ''
  }
}

export const storage = {
  // ── Chats (bulk — backward compat) ─────────────────────────────────────────
  async getChats() {
    if (isElectron()) return window.electronAPI.getChats()
    return lsGet('clankai:chats', [])
  },
  async saveChats(chats) {
    if (isElectron()) return window.electronAPI.saveChats(chats)
    lsSet('clankai:chats', chats)
  },

  // ── Chats (per-chat granular) ─────────────────────────────────────────────
  async getChatIndex() {
    if (isElectron()) return window.electronAPI.getChatIndex()
    // localStorage fallback: extract metadata from full chats
    const chats = lsGet('clankai:chats', [])
    return chats.map(({ messages, ...meta }) => meta)
  },
  async saveChatIndex(index) {
    if (isElectron()) return window.electronAPI.saveChatIndex(index)
    // localStorage: no-op — index is derived from full chats array
  },
  async getChat(id) {
    if (isElectron()) return window.electronAPI.getChat(id)
    // localStorage fallback: find in full array
    const chats = lsGet('clankai:chats', [])
    return chats.find(c => c.id === id) || null
  },
  async getChatSegments(params) {
    if (isElectron()) return window.electronAPI.getChatSegments(params)
    return []
  },
  async saveChat(chat) {
    if (isElectron()) return window.electronAPI.saveChat(chat)
    // localStorage fallback: update in full array
    const chats = lsGet('clankai:chats', [])
    const idx = chats.findIndex(c => c.id === chat.id)
    if (idx >= 0) chats[idx] = chat
    else chats.unshift(chat)
    lsSet('clankai:chats', chats)
  },
  async deleteChat(id) {
    if (isElectron()) return window.electronAPI.deleteChat(id)
    const chats = lsGet('clankai:chats', [])
    lsSet('clankai:chats', chats.filter(c => c.id !== id))
  },

  // ── Config ─────────────────────────────────────────────────────────────────
  async getConfig() {
    if (isElectron()) return window.electronAPI.getConfig()
    const saved = lsGet('clankai:config', {})
    const defaults = browserDefaultConfig()
    // Only let saved values override defaults when non-empty
    const nonEmpty = Object.fromEntries(
      Object.entries(saved).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    )
    return {
      ...defaults,
      ...nonEmpty,
      anthropic:  { ...defaults.anthropic,  ...saved.anthropic },
      openrouter: { ...defaults.openrouter, ...saved.openrouter },
      openai:     { ...defaults.openai,     ...saved.openai },
    }
  },
  async saveConfig(config) {
    if (isElectron()) return window.electronAPI.saveConfig(config)
    lsSet('clankai:config', config)
  },

  // ── Agents ──────────────────────────────────────────────────────────────────
  async getAgents() {
    if (isElectron()) return window.electronAPI.getAgents()
    return lsGet('maestro:agents', { categories: [], agents: [] })
  },
  async saveAgents(agents) {
    if (isElectron()) return window.electronAPI.saveAgents(agents)
    lsSet('maestro:agents', agents)
  },

  // ── Soul Memory ────────────────────────────────────────────────────────────
  async getSoul(agentId, type) {
    if (isElectron()) return window.electronAPI.souls.read(agentId, type)
    return lsGet(`clankai:soul:${type}:${agentId}`, null)
  },
  async saveSoul(agentId, type, content) {
    if (isElectron()) return window.electronAPI.souls.write(agentId, type, content)
    lsSet(`clankai:soul:${type}:${agentId}`, content)
  },
  async soulExists(agentId, type) {
    if (isElectron()) return window.electronAPI.souls.exists(agentId, type)
    return lsGet(`clankai:soul:${type}:${agentId}`, null) !== null
  },

}
