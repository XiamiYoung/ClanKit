import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConfigStore } from './config'

/**
 * Unified model cache store.
 * Models are persisted to provider-models.json keyed by provider instance ID.
 * On startup, loadFromDisk() hydrates the cache. ConfigView fetch updates + persists.
 */
export const useModelsStore = defineStore('models', () => {
  const configStore = useConfigStore()

  // ── Core state ──────────────────────────────────────────────────────────
  // { [providerInstanceId]: { type, models: [{id, name, context_length}], updatedAt } }
  const providerModels = ref({})
  const loadingProviders = ref({})  // { [providerInstanceId]: true }
  const enrichingProviders = ref({}) // { [providerInstanceId]: true }

  // ── Load / persist ──────────────────────────────────────────────────────

  async function loadFromDisk() {
    if (!window.electronAPI?.loadModelCache) return
    const data = await window.electronAPI.loadModelCache()
    if (data && typeof data === 'object') {
      providerModels.value = data
    }
  }

  async function persistToDisk() {
    if (!window.electronAPI?.saveModelCache) return
    await window.electronAPI.saveModelCache(JSON.parse(JSON.stringify(providerModels.value)))
  }

  // ── Provider lookup helpers ─────────────────────────────────────────────

  function _getProviderConfig(providerIdOrType) {
    const providers = configStore.config.providers || []
    return providers.find(p => p.id === providerIdOrType || p.type === providerIdOrType) || null
  }

  /** Find all provider instance IDs that match a given type */
  function _getProviderIdsByType(type) {
    const providers = configStore.config.providers || []
    return providers.filter(p => p.type === type).map(p => p.id)
  }

  /** Resolve a providerIdOrType to actual provider instance ID */
  function _resolveProviderId(providerIdOrType) {
    const providers = configStore.config.providers || []
    // Direct ID match
    const byId = providers.find(p => p.id === providerIdOrType)
    if (byId) return byId.id
    // Type match — return first match
    const byType = providers.find(p => p.type === providerIdOrType)
    if (byType) return byType.id
    return providerIdOrType
  }

  // ── Fetch models for a provider ─────────────────────────────────────────

  async function fetchModelsForProvider(providerId) {
    const provider = _getProviderConfig(providerId)
    if (!provider?.apiKey) return false

    const resolvedId = provider.id
    const type = provider.type
    loadingProviders.value = { ...loadingProviders.value, [resolvedId]: true }

    try {
      let models = []

      if (type === 'openrouter') {
        if (!window.electronAPI?.fetchOpenRouterModels) return false
        const result = await window.electronAPI.fetchOpenRouterModels({
          apiKey: provider.apiKey, baseURL: provider.baseURL,
        })
        if (!result.success) return false
        models = result.models

      } else if (type === 'openai_official' || type === 'openai') {
        if (!window.electronAPI?.fetchOpenAIModels) return false
        const result = await window.electronAPI.fetchOpenAIModels({
          apiKey: provider.apiKey, baseURL: provider.baseURL, type,
        })
        if (!result.success) return false
        models = result.models

      } else if (type === 'deepseek') {
        if (!provider.baseURL) return false
        const baseURL = provider.baseURL.replace(/\/+$/, '')
        const resp = await fetch(`${baseURL}/v1/models`, {
          headers: { 'Authorization': `Bearer ${provider.apiKey}`, 'Accept': 'application/json' }
        })
        if (!resp.ok) return false
        const data = await resp.json()
        models = (data.data || []).map(m => ({
          id: m.id, name: m.id, context_length: m.context_length || null,
        }))

      } else if (type === 'google') {
        if (!window.electronAPI?.fetchGoogleModels) return false
        const result = await window.electronAPI.fetchGoogleModels({ apiKey: provider.apiKey })
        if (!result.success) return false
        models = result.models

      } else if (type === 'minimax') {
        // MiniMax uses proxy path + x-api-key header
        if (!window.electronAPI?.fetchOpenAIModels || !provider.baseURL) return false
        const result = await window.electronAPI.fetchOpenAIModels({
          apiKey: provider.apiKey, baseURL: provider.baseURL, type: 'minimax',
        })
        if (!result.success) return false
        models = result.models

      } else if (type === 'qwen' || type === 'glm') {
        // OpenAI-compatible providers — fall back to preset defaultBaseURL if user left it blank
        const preset = configStore.PROVIDER_PRESETS?.[type]
        const baseURL = provider.baseURL || preset?.defaultBaseURL
        if (!window.electronAPI?.fetchOpenAIModels || !baseURL) return false
        const result = await window.electronAPI.fetchOpenAIModels({
          apiKey: provider.apiKey, baseURL, type: 'openai',
        })
        if (!result.success) return false
        models = result.models

      } else if (type === 'custom') {
        // Custom providers use direct endpoint (base/models) + Bearer auth
        if (!window.electronAPI?.fetchOpenAIModels || !provider.baseURL) return false
        const result = await window.electronAPI.fetchOpenAIModels({
          apiKey: provider.apiKey, baseURL: provider.baseURL, type: 'custom',
        })
        if (!result.success) return false
        models = result.models
      }
      // Anthropic: no API fetch, handled by getModelsForProvider computed path

      // Merge context_length from existing cache (preserve AI-enriched values)
      const existing = providerModels.value[resolvedId]?.models || []
      const existingMap = {}
      for (const m of existing) {
        if (m.context_length) existingMap[m.id] = m.context_length
      }
      for (const m of models) {
        if (!m.context_length && existingMap[m.id]) {
          m.context_length = existingMap[m.id]
        }
      }

      providerModels.value = {
        ...providerModels.value,
        [resolvedId]: { type, models, updatedAt: new Date().toISOString() },
      }
      await persistToDisk()
      return true
    } catch (err) {
      console.error(`Failed to fetch models for ${providerId}:`, err)
      return false
    } finally {
      const next = { ...loadingProviders.value }
      delete next[provider.id]
      loadingProviders.value = next
    }
  }

  // ── AI context window enrichment ────────────────────────────────────────

  async function enrichContextWindows(providerId) {
    const resolvedId = _resolveProviderId(providerId)
    const entry = providerModels.value[resolvedId]
    if (!entry?.models?.length) return false

    const missingIds = entry.models.filter(m => !m.context_length).map(m => m.id)
    if (missingIds.length === 0) return true // all already have context_length

    enrichingProviders.value = { ...enrichingProviders.value, [resolvedId]: true }
    try {
      if (!window.electronAPI?.enrichModelContext) return false
      const result = await window.electronAPI.enrichModelContext({ modelIds: missingIds })
      if (!result.success) {
        console.error('AI enrich failed:', result.error)
        return false
      }

      // Merge enriched context_length values
      const enrichMap = {}
      for (const e of result.enriched) {
        if (e.id && e.context_length) enrichMap[e.id] = e.context_length
      }
      const updatedModels = entry.models.map(m => {
        if (!m.context_length && enrichMap[m.id]) {
          return { ...m, context_length: enrichMap[m.id] }
        }
        return m
      })
      providerModels.value = {
        ...providerModels.value,
        [resolvedId]: { ...entry, models: updatedModels, updatedAt: new Date().toISOString() },
      }
      await persistToDisk()
      return true
    } catch (err) {
      console.error('AI enrich error:', err)
      return false
    } finally {
      const next = { ...enrichingProviders.value }
      delete next[resolvedId]
      enrichingProviders.value = next
    }
  }

  // ── Accessors ───────────────────────────────────────────────────────────

  /**
   * Get models for a provider by instance ID or type.
   * For Anthropic, returns computed models from config (no API fetch).
   */
  function getModelsForProvider(providerIdOrType) {
    // Anthropic: derive from config
    const provider = _getProviderConfig(providerIdOrType)
    if (provider?.type === 'anthropic' || providerIdOrType === 'anthropic') {
      return _getAnthropicModels(provider)
    }
    // Lookup by instance ID first
    if (providerModels.value[providerIdOrType]) {
      return providerModels.value[providerIdOrType].models || []
    }
    // Lookup by type — return first matching instance's models
    const ids = _getProviderIdsByType(providerIdOrType)
    for (const id of ids) {
      if (providerModels.value[id]?.models?.length) {
        return providerModels.value[id].models
      }
    }
    return []
  }

  function _getAnthropicModels(provider) {
    if (!provider) {
      const providers = configStore.config.providers || []
      provider = providers.find(p => p.type === 'anthropic')
    }
    if (!provider) return []
    const models = []
    if (provider.model) models.push({ id: provider.model, name: 'Sonnet', context_length: 1000000 })
    if (provider.settings?.opusModel) models.push({ id: provider.settings.opusModel, name: 'Opus', context_length: 1000000 })
    if (provider.settings?.haikuModel) models.push({ id: provider.settings.haikuModel, name: 'Haiku', context_length: 200000 })
    return models
  }

  function isLoading(providerIdOrType) {
    if (loadingProviders.value[providerIdOrType]) return true
    const ids = _getProviderIdsByType(providerIdOrType)
    return ids.some(id => loadingProviders.value[id])
  }

  function isEnriching(providerIdOrType) {
    if (enrichingProviders.value[providerIdOrType]) return true
    const ids = _getProviderIdsByType(providerIdOrType)
    return ids.some(id => enrichingProviders.value[id])
  }

  function isCached(providerIdOrType) {
    // Anthropic is always "cached" (derived from config)
    const provider = _getProviderConfig(providerIdOrType)
    if (provider?.type === 'anthropic' || providerIdOrType === 'anthropic') return true
    if (providerModels.value[providerIdOrType]?.models?.length) return true
    const ids = _getProviderIdsByType(providerIdOrType)
    return ids.some(id => providerModels.value[id]?.models?.length)
  }

  function hasMissingContext(providerIdOrType) {
    const models = getModelsForProvider(providerIdOrType)
    return models.some(m => !m.context_length)
  }

  /** Returns { modelId: context_length } for all cached models */
  function getAllContextWindows() {
    const map = {}
    // All provider instances
    for (const entry of Object.values(providerModels.value)) {
      for (const m of entry.models || []) {
        if (m.id && m.context_length) map[m.id] = m.context_length
      }
    }
    // Anthropic (from config)
    for (const m of _getAnthropicModels()) {
      if (m.id && m.context_length) map[m.id] = m.context_length
    }
    return map
  }

  return {
    providerModels,
    loadingProviders,
    enrichingProviders,
    // Lifecycle
    loadFromDisk,
    persistToDisk,
    fetchModelsForProvider,
    enrichContextWindows,
    // Accessors
    getModelsForProvider,
    isLoading,
    isEnriching,
    isCached,
    hasMissingContext,
    getAllContextWindows,
  }
})
