import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConfigStore } from './config'

export const useModelsStore = defineStore('models', () => {
  const configStore = useConfigStore()

  // ── OpenRouter ──────────────────────────────────────────────────────────
  const openrouterModels = ref([])
  const openrouterLoading = ref(false)
  const openrouterCached = ref(false)

  // ── OpenAI ──────────────────────────────────────────────────────────────
  const openaiModels = ref([])
  const openaiLoading = ref(false)
  const openaiCached = ref(false)

  // ── DeepSeek ────────────────────────────────────────────────────────────
  const deepseekModels = ref([])
  const deepseekLoading = ref(false)
  const deepseekCached = ref(false)

  // ── Google ───────────────────────────────────────────────────────────────
  const googleModels = ref([])
  const googleLoading = ref(false)
  const googleCached = ref(false)

  // ── Anthropic (derived from config) ─────────────────────────────────────
  const anthropicModels = computed(() => {
    const providers = configStore.config.providers || []
    const anthropic = providers.find(p => p.type === 'anthropic')
    if (!anthropic) return []
    const models = []
    if (anthropic.model) {
      models.push({ id: anthropic.model, name: 'Sonnet' })
    }
    if (anthropic.settings?.opusModel) {
      models.push({ id: anthropic.settings.opusModel, name: 'Opus' })
    }
    if (anthropic.settings?.haikuModel) {
      models.push({ id: anthropic.settings.haikuModel, name: 'Haiku' })
    }
    return models
  })

  // Helper to find provider config by type
  function getProviderConfigByType(type) {
    const providers = configStore.config.providers || []
    return providers.find(p => p.type === type)
  }

  // ── Fetch functions ─────────────────────────────────────────────────────

  async function fetchOpenRouterModels() {
    if (!window.electronAPI?.fetchOpenRouterModels) return
    const provider = getProviderConfigByType('openrouter')
    if (!provider?.apiKey) return
    openrouterLoading.value = true
    try {
      const result = await window.electronAPI.fetchOpenRouterModels({
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
      })
      if (result.success) {
        openrouterModels.value = result.models
        openrouterCached.value = true
      }
    } catch (err) {
      console.error('Failed to fetch OpenRouter models:', err)
    } finally {
      openrouterLoading.value = false
    }
  }

  async function fetchOpenAIModels() {
    if (!window.electronAPI?.fetchOpenAIModels) return
    const provider = getProviderConfigByType('openai')
    if (!provider?.apiKey) return
    openaiLoading.value = true
    try {
      const result = await window.electronAPI.fetchOpenAIModels({
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
      })
      if (result.success) {
        openaiModels.value = result.models
        openaiCached.value = true
      }
    } catch (err) {
      console.error('Failed to fetch OpenAI models:', err)
    } finally {
      openaiLoading.value = false
    }
  }

  async function fetchDeepSeekModels() {
    const provider = getProviderConfigByType('deepseek')
    if (!provider?.apiKey || !provider?.baseURL) return
    const baseURL = provider.baseURL.replace(/\/+$/, '')
    deepseekLoading.value = true
    try {
      const resp = await fetch(`${baseURL}/v1/models`, {
        headers: { 'Authorization': `Bearer ${provider.apiKey}`, 'Accept': 'application/json' }
      })
      if (!resp.ok) return
      const data = await resp.json()
      deepseekModels.value = (data.data || []).map(m => ({ id: m.id, name: m.id }))
      deepseekCached.value = true
    } catch (err) {
      console.error('Failed to fetch DeepSeek models:', err)
    } finally {
      deepseekLoading.value = false
    }
  }

  async function fetchGoogleModels() {
    if (!window.electronAPI?.fetchGoogleModels) return
    const provider = getProviderConfigByType('google')
    if (!provider?.apiKey) return
    googleLoading.value = true
    try {
      const result = await window.electronAPI.fetchGoogleModels({ apiKey: provider.apiKey })
      if (result.success) {
        googleModels.value = result.models
        googleCached.value = true
      }
    } catch (err) {
      console.error('Failed to fetch Google models:', err)
    } finally {
      googleLoading.value = false
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getModelsForProvider(provider) {
    if (provider === 'openrouter') return openrouterModels.value
    if (provider === 'openai') return openaiModels.value
    if (provider === 'deepseek') return deepseekModels.value
    if (provider === 'google') return googleModels.value
    return anthropicModels.value
  }

  return {
    openrouterModels,
    openrouterLoading,
    openrouterCached,
    openaiModels,
    openaiLoading,
    openaiCached,
    deepseekModels,
    deepseekLoading,
    deepseekCached,
    googleModels,
    googleLoading,
    googleCached,
    anthropicModels,
    fetchOpenRouterModels,
    fetchOpenAIModels,
    fetchDeepSeekModels,
    fetchGoogleModels,
    getModelsForProvider,
  }
})
