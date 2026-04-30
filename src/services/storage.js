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
      testedAt: null,
    },
    openrouter: {
      apiKey:  '',
      baseURL: '',
      utilityModel: '',
      testedAt: null,
    },
    openai: {
      apiKey:       '',
      baseURL:      '',
      utilityModel: '',
      testedAt: null,
    },
    deepseek: {
      apiKey:   '',
      baseURL:  '',
      maxTokens: 8192,
      utilityModel: '',
      testedAt: null,
    },
    systemPrompt: ''
  }
}

export const storage = {
  // ── Chats (bulk — backward compat) ─────────────────────────────────────────
  async getChats() {
    if (isElectron()) return window.electronAPI.getChats()
    return lsGet('clankit:chats', [])
  },
  async saveChats(chats) {
    if (isElectron()) return window.electronAPI.saveChats(chats)
    lsSet('clankit:chats', chats)
  },

  // ── Chats (per-chat granular) ─────────────────────────────────────────────
  async getChatIndex() {
    if (isElectron()) return window.electronAPI.getChatIndex()
    // localStorage fallback: extract metadata from full chats
    const chats = lsGet('clankit:chats', [])
    return chats.map(({ messages, ...meta }) => meta)
  },
  async saveChatIndex(index) {
    if (isElectron()) return window.electronAPI.saveChatIndex(index)
    // localStorage: no-op — index is derived from full chats array
  },
  async getChat(id) {
    if (isElectron()) return window.electronAPI.getChat(id)
    // localStorage fallback: find in full array
    const chats = lsGet('clankit:chats', [])
    return chats.find(c => c.id === id) || null
  },
  async getChatSegments(params) {
    if (isElectron()) return window.electronAPI.getChatSegments(params)
    return []
  },
  async saveChat(chat) {
    if (isElectron()) return window.electronAPI.saveChat(chat)
    // localStorage fallback: update in full array
    const chats = lsGet('clankit:chats', [])
    const idx = chats.findIndex(c => c.id === chat.id)
    if (idx >= 0) chats[idx] = chat
    else chats.unshift(chat)
    lsSet('clankit:chats', chats)
  },
  async deleteChat(id) {
    if (isElectron()) return window.electronAPI.deleteChat(id)
    const chats = lsGet('clankit:chats', [])
    lsSet('clankit:chats', chats.filter(c => c.id !== id))
  },

  // ── Config ─────────────────────────────────────────────────────────────────
  async getConfig() {
    if (isElectron()) return window.electronAPI.getConfig()
    const saved = lsGet('clankit:config', {})
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
    lsSet('clankit:config', config)
  },

  // ── Agents ──────────────────────────────────────────────────────────────────
  async getAgents() {
    if (isElectron()) return window.electronAPI.getAgents()
    return lsGet('clankit:agents', { categories: [], agents: [] })
  },
  async saveAgents(agents) {
    if (isElectron()) return window.electronAPI.saveAgents(agents)
    lsSet('clankit:agents', agents)
  },

  // ── Memory ────────────────────────────────────────────────────────────────
  async getMemory(agentId, type) {
    if (isElectron()) return window.electronAPI.memory.read(agentId, type)
    return lsGet(`clankit:memory:${type}:${agentId}`, null)
  },
  async saveMemory(agentId, type, content) {
    if (isElectron()) return window.electronAPI.memory.write(agentId, type, content)
    lsSet(`clankit:memory:${type}:${agentId}`, content)
  },
  async memoryExists(agentId, type) {
    if (isElectron()) return window.electronAPI.memory.exists(agentId, type)
    return lsGet(`clankit:memory:${type}:${agentId}`, null) !== null
  },

}
