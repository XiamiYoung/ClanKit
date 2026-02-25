import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { storage } from '../services/storage'

export const useConfigStore = defineStore('config', () => {
  const config = ref({
    apiKey:      '',
    baseURL:     'https://api.anthropic.com',
    sonnetModel: 'anthropic/claude-sonnet-latest',
    opusModel:   'anthropic/claude-opus-latest',
    haikuModel:  'anthropic/claude-haiku-latest',
    activeModel: 'sonnet',
    skillsPath:  '',
    dataPath:    '',
    openrouterApiKey:  '',
    openrouterBaseURL: 'https://openrouter.ai/api',
    openaiApiKey:      '',
    openaiBaseURL:     'https://mlaas.virtuosgames.com',
    openaiModel:       '',
    openrouterDefaultModel:  '',
    openaiDefaultModel:      '',
    obsidianVaultPath: '',
    pineconeApiKey:    ''
  })

  const activeModelId = computed(() => {
    const c = config.value
    if (c.activeModel === 'opus')  return c.opusModel
    if (c.activeModel === 'haiku') return c.haikuModel
    return c.sonnetModel
  })

  async function loadConfig() {
    const defaults = config.value
    const saved = await storage.getConfig()
    config.value = { ...defaults, ...saved }
  }

  async function saveConfig(newConfig) {
    config.value = { ...config.value, ...newConfig }
    await storage.saveConfig(JSON.parse(JSON.stringify(toRaw(config.value))))
  }

  return { config, activeModelId, loadConfig, saveConfig }
})
