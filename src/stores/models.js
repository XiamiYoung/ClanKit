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
    const a = configStore.config.anthropic || {}
    return [
      { id: a.sonnetModel || 'claude-sonnet-4-5', name: 'Sonnet', label: 'Sonnet' },
      { id: a.opusModel || 'claude-opus-4-6', name: 'Opus', label: 'Opus' },
      { id: a.haikuModel || 'claude-haiku-4-5', name: 'Haiku', label: 'Haiku' },
    ]
  })

  // ── Fetch functions ─────────────────────────────────────────────────────

  async function fetchOpenRouterModels() {
    if (!window.electronAPI?.fetchOpenRouterModels) return
    const or = configStore.config.openrouter || {}
    if (!or.apiKey) return
    openrouterLoading.value = true
    try {
      const result = await window.electronAPI.fetchOpenRouterModels({
        apiKey: or.apiKey,
        baseURL: or.baseURL,
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
    const oa = configStore.config.openai || {}
    if (!oa.apiKey) return
    openaiLoading.value = true
    try {
      const result = await window.electronAPI.fetchOpenAIModels({
        apiKey: oa.apiKey,
        baseURL: oa.baseURL,
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
      const oa = c.openai || {}
      if (oa.openaiDefaultModel) return oa.openaiDefaultModel
      if (oa.model) return oa.model
      if (openaiModels.value.length) return openaiModels.value[0].id
      return 'Not set'
    }
    if (provider === 'openrouter') {
      const or = c.openrouter || {}
      if (or.defaultModel) return or.defaultModel
      if (openrouterModels.value.length) return openrouterModels.value[0].id
      return 'Not set'
    }
    // Anthropic — use activeModel resolution
    const a = c.anthropic || {}
    if (a.activeModel === 'opus') return a.opusModel || 'claude-opus-4-6'
    if (a.activeModel === 'haiku') return a.haikuModel || 'claude-haiku-4-5'
    return a.sonnetModel || 'claude-sonnet-4-5'
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
