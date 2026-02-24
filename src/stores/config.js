import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
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
    openrouterApiKey:  '',
    openrouterBaseURL: 'https://openrouter.ai/api',
    openaiApiKey:      '',
    openaiBaseURL:     'https://mlaas.virtuosgames.com',
    openaiModel:       '',
    defaultProvider:   'anthropic'
  })

  const activeModelId = computed(() => {
    const c = config.value
    if (c.activeModel === 'opus')  return c.opusModel
    if (c.activeModel === 'haiku') return c.haikuModel
    return c.sonnetModel
  })

  async function loadConfig() {
    config.value = await storage.getConfig()
  }

  async function saveConfig(newConfig) {
    config.value = { ...config.value, ...newConfig }
    await storage.saveConfig(config.value)
  }

  return { config, activeModelId, loadConfig, saveConfig }
})
