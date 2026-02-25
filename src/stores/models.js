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

  // ── Anthropic (derived from config) ─────────────────────────────────────
  const anthropicModels = computed(() => {
    const c = configStore.config
    return [
      { id: c.sonnetModel || 'claude-sonnet-4-5', name: 'Sonnet', label: 'Sonnet' },
      { id: c.opusModel || 'claude-opus-4-6', name: 'Opus', label: 'Opus' },
      { id: c.haikuModel || 'claude-haiku-4-5', name: 'Haiku', label: 'Haiku' },
    ]
  })

  // ── Fetch functions ─────────────────────────────────────────────────────

  async function fetchOpenRouterModels() {
    if (!window.electronAPI?.fetchOpenRouterModels) return
    const c = configStore.config
    if (!c.openrouterApiKey) return
    openrouterLoading.value = true
    try {
      const result = await window.electronAPI.fetchOpenRouterModels({
        apiKey: c.openrouterApiKey,
        baseURL: c.openrouterBaseURL,
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
    const c = configStore.config
    if (!c.openaiApiKey) return
    openaiLoading.value = true
    try {
      const result = await window.electronAPI.fetchOpenAIModels({
        apiKey: c.openaiApiKey,
        baseURL: c.openaiBaseURL,
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

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getModelsForProvider(provider) {
    if (provider === 'openrouter') return openrouterModels.value
    if (provider === 'openai') return openaiModels.value
    return anthropicModels.value
  }

  function getDefaultModelLabel(provider) {
    const c = configStore.config
    if (provider === 'openai') {
      if (c.openaiDefaultModel) return c.openaiDefaultModel
      if (c.openaiModel) return c.openaiModel
      if (openaiModels.value.length) return openaiModels.value[0].id
      return 'Not set'
    }
    if (provider === 'openrouter') {
      if (c.openrouterDefaultModel) return c.openrouterDefaultModel
      if (c.openrouterModel) return c.openrouterModel
      if (openrouterModels.value.length) return openrouterModels.value[0].id
      return 'Not set'
    }
    // Anthropic — use activeModel resolution
    if (c.activeModel === 'opus') return c.opusModel || 'claude-opus-4-6'
    if (c.activeModel === 'haiku') return c.haikuModel || 'claude-haiku-4-5'
    return c.sonnetModel || 'claude-sonnet-4-5'
  }

  return {
    openrouterModels,
    openrouterLoading,
    openrouterCached,
    openaiModels,
    openaiLoading,
    openaiCached,
    anthropicModels,
    fetchOpenRouterModels,
    fetchOpenAIModels,
    getModelsForProvider,
    getDefaultModelLabel,
  }
})
