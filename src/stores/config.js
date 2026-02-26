import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { storage } from '../services/storage'

export const useConfigStore = defineStore('config', () => {
  const config = ref({
    anthropic: {
      apiKey:      '',
      baseURL:     'https://api.anthropic.com',
      sonnetModel: 'anthropic/claude-sonnet-latest',
      opusModel:   'anthropic/claude-opus-latest',
      haikuModel:  'anthropic/claude-haiku-latest',
      activeModel: 'sonnet',
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
    skillsPath:  '',
    obsidianVaultPath: '',
    artyfactPath:      '',
    pineconeApiKey:    '',
    defaultToolIds:    null,       // null = all tools enabled by default; array = specific IDs
    defaultMcpServerIds: null,     // null = all MCP servers enabled by default; array = specific IDs
    newsFeeds:         [],         // populated from config.json at startup
    feedSelection:     [],         // array of 6 feed IDs for the news cards
  })

  const activeModelId = computed(() => {
    const c = config.value
    const a = c.anthropic || {}
    if (a.activeModel === 'opus')  return a.opusModel
    if (a.activeModel === 'haiku') return a.haikuModel
    return a.sonnetModel
  })

  async function loadConfig() {
    const defaults = config.value
    const saved = await storage.getConfig()
    // Deep-merge nested provider objects
    config.value = {
      ...defaults,
      ...saved,
      anthropic:  { ...defaults.anthropic,  ...saved.anthropic },
      openrouter: { ...defaults.openrouter, ...saved.openrouter },
      openai:     { ...defaults.openai,     ...saved.openai },
    }
  }

  async function saveConfig(newConfig) {
    const prev = config.value
    config.value = {
      ...prev,
      ...newConfig,
      anthropic:  { ...prev.anthropic,  ...newConfig.anthropic },
      openrouter: { ...prev.openrouter, ...newConfig.openrouter },
      openai:     { ...prev.openai,     ...newConfig.openai },
    }
    await storage.saveConfig(JSON.parse(JSON.stringify(toRaw(config.value))))
  }

  return { config, activeModelId, loadConfig, saveConfig }
})
