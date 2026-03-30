import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useKnowledgeStore = defineStore('knowledge', () => {
  // Pinecone connection config (API key from .env, index from knowledge.json)
  const pineconeApiKey = ref('')
  const pineconeIndexName = ref('')
  const connectionStatus = ref('disconnected') // 'disconnected' | 'connecting' | 'connected' | 'error'
  const connectionError = ref('')

  // Available indexes from Pinecone
  const indexes = ref([])
  const isLoadingIndexes = ref(false)

  // Documents state
  const documents = ref([])
  const isLoadingDocs = ref(false)
  const isUploading = ref(false)
  const uploadProgress = ref('')

  // RAG toggle (enabled by default for all chats)
  const ragEnabled = ref(true)

  // Embedding config
  const embeddingProvider = ref('openai') // 'openai' | 'openrouter'
  const embeddingModel = ref('text-embedding-3-small')

  // Per-index configs: { [indexName]: { embeddingProvider, embeddingModel, enabled } }
  const indexConfigs = ref({})

  // Selected index stats
  const indexStats = ref(null)

  // Source files found in the selected index
  const indexSources = ref([])
  const isLoadingSources = ref(false)

  // Computed: list of enabled indexes with their configs
  const enabledIndexes = computed(() => {
    return Object.entries(indexConfigs.value)
      .filter(([, cfg]) => cfg.enabled)
      .map(([name, cfg]) => ({ name, ...cfg }))
  })

  async function loadConfig() {
    if (!window.electronAPI?.knowledge?.getConfig) return
    try {
      const config = await window.electronAPI.knowledge.getConfig()
      pineconeApiKey.value = config.pineconeApiKey || ''
      pineconeIndexName.value = config.pineconeIndexName || ''
      ragEnabled.value = config.ragEnabled !== false
      indexConfigs.value = config.indexConfigs || {}
    } catch (err) {
      console.error('Failed to load knowledge config:', err)
    }
  }

  async function saveConfig() {
    if (!window.electronAPI?.knowledge?.saveConfig) return
    try {
      await window.electronAPI.knowledge.saveConfig({
        pineconeIndexName: pineconeIndexName.value,
        ragEnabled: ragEnabled.value,
        indexConfigs: JSON.parse(JSON.stringify(indexConfigs.value))
      })
    } catch (err) {
      console.error('Failed to save knowledge config:', err)
    }
  }

  async function verifyConnection() {
    if (!window.electronAPI?.knowledge?.verifyConnection) {
      connectionStatus.value = 'error'
      connectionError.value = 'Not running inside Electron'
      return false
    }
    connectionStatus.value = 'connecting'
    connectionError.value = ''
    try {
      const result = await window.electronAPI.knowledge.verifyConnection({
        apiKey: pineconeApiKey.value
      })
      if (result.success) {
        connectionStatus.value = 'connected'
        return true
      } else {
        connectionStatus.value = 'error'
        connectionError.value = result.error || 'Connection failed'
        return false
      }
    } catch (err) {
      connectionStatus.value = 'error'
      connectionError.value = err.message
      return false
    }
  }

  async function fetchIndexes() {
    if (!window.electronAPI?.knowledge?.listIndexes) return
    isLoadingIndexes.value = true
    try {
      const result = await window.electronAPI.knowledge.listIndexes({
        apiKey: pineconeApiKey.value
      })
      if (result.success) {
        indexes.value = result.indexes || []
        // Prune indexConfigs entries that no longer exist in Pinecone
        const liveNames = new Set(indexes.value.map(i => i.name))
        const staleKeys = Object.keys(indexConfigs.value).filter(k => !liveNames.has(k))
        if (staleKeys.length > 0) {
          const updated = { ...indexConfigs.value }
          for (const k of staleKeys) delete updated[k]
          indexConfigs.value = updated
          await saveConfig()
          // Also clean agent references to removed indexes
          try {
            const { useAgentsStore } = await import('./agents')
            const agentsStore = useAgentsStore()
            await agentsStore.cleanStaleKnowledgeRefs(Object.keys(indexConfigs.value))
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to fetch indexes:', err)
    } finally {
      isLoadingIndexes.value = false
    }
  }

  async function selectIndex(indexName) {
    pineconeIndexName.value = indexName
    indexStats.value = null
    indexSources.value = []
    await saveConfig()
    // Fetch stats for selected index
    if (indexName && window.electronAPI?.knowledge?.describeIndex) {
      try {
        const result = await window.electronAPI.knowledge.describeIndex({
          apiKey: pineconeApiKey.value,
          indexName
        })
        if (result.success) {
          indexStats.value = result.stats
        }
      } catch (err) {
        console.error('Failed to describe index:', err)
      }
    }
    await Promise.all([loadDocuments(), loadIndexSources()])
  }

  async function loadIndexSources() {
    if (!window.electronAPI?.knowledge?.listSources) return
    if (!pineconeApiKey.value || !pineconeIndexName.value) return
    isLoadingSources.value = true
    try {
      const result = await window.electronAPI.knowledge.listSources({
        apiKey: pineconeApiKey.value,
        indexName: pineconeIndexName.value
      })
      if (result.success) {
        indexSources.value = result.sources || []
      }
    } catch (err) {
      console.error('Failed to load index sources:', err)
    } finally {
      isLoadingSources.value = false
    }
  }

  /** Full reload: re-read config from .env, verify, fetch indexes, restore selection */
  async function refresh() {
    await loadConfig()
    if (!pineconeApiKey.value) {
      connectionStatus.value = 'disconnected'
      indexes.value = []
      documents.value = []
      indexStats.value = null
      indexSources.value = []
      return
    }
    const connected = await verifyConnection()
    if (connected) {
      await fetchIndexes()
      if (pineconeIndexName.value) {
        await selectIndex(pineconeIndexName.value)
      }
    }
  }

  async function loadDocuments() {
    if (!window.electronAPI?.knowledge?.listDocuments) return
    isLoadingDocs.value = true
    try {
      const result = await window.electronAPI.knowledge.listDocuments({
        apiKey: pineconeApiKey.value,
        indexName: pineconeIndexName.value
      })
      if (result.success) {
        documents.value = result.documents || []
      }
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      isLoadingDocs.value = false
    }
  }

  async function uploadFiles(filePaths) {
    if (!window.electronAPI?.knowledge?.uploadFiles) return { success: false, error: 'Not in Electron' }
    isUploading.value = true
    uploadProgress.value = 'Preparing files...'
    try {
      const result = await window.electronAPI.knowledge.uploadFiles({
        apiKey: pineconeApiKey.value,
        indexName: pineconeIndexName.value,
        filePaths
      })
      if (result.success) {
        // Record the embedding config used for this index
        await saveIndexEmbeddingConfig(pineconeIndexName.value)
        await Promise.all([loadDocuments(), loadIndexSources()])
      }
      return result
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      isUploading.value = false
      uploadProgress.value = ''
    }
  }

  async function deleteDocument(documentId) {
    if (!window.electronAPI?.knowledge?.deleteDocument) return
    try {
      const result = await window.electronAPI.knowledge.deleteDocument({
        apiKey: pineconeApiKey.value,
        indexName: pineconeIndexName.value,
        documentId
      })
      if (result.success) {
        documents.value = documents.value.filter(d => d.id !== documentId)
      }
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async function deleteSource(sourceName) {
    if (!window.electronAPI?.knowledge?.deleteSource) return { success: false, error: 'Not in Electron' }
    try {
      const result = await window.electronAPI.knowledge.deleteSource({
        apiKey: pineconeApiKey.value,
        indexName: pineconeIndexName.value,
        sourceName
      })
      // Always reload sources and docs from server after deletion attempt
      await Promise.all([loadIndexSources(), loadDocuments()])
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  function getIndexConfig(indexName) {
    return indexConfigs.value[indexName] || null
  }

  async function toggleIndexEnabled(indexName, enabled) {
    const updated = { ...indexConfigs.value }
    if (!updated[indexName]) {
      updated[indexName] = {
        embeddingProvider: embeddingProvider.value,
        embeddingModel: embeddingModel.value,
        enabled
      }
    } else {
      updated[indexName] = { ...updated[indexName], enabled }
    }
    indexConfigs.value = updated
    await saveConfig()
  }

  async function saveIndexEmbeddingConfig(indexName) {
    const updated = { ...indexConfigs.value }
    updated[indexName] = {
      ...(updated[indexName] || {}),
      embeddingProvider: embeddingProvider.value,
      embeddingModel: embeddingModel.value,
      enabled: updated[indexName]?.enabled !== false
    }
    indexConfigs.value = updated
    await saveConfig()
  }

  async function queryKnowledge(query, topK = 5) {
    if (!window.electronAPI?.knowledge?.query) return { success: false, error: 'Not in Electron' }
    try {
      const result = await window.electronAPI.knowledge.query({
        query,
        pineconeApiKey: pineconeApiKey.value,
        pineconeIndexName: pineconeIndexName.value,
        topK,
        embeddingProvider: embeddingProvider.value,
        embeddingModel: embeddingModel.value
      })
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async function getDocumentSummary(documentId) {
    if (!window.electronAPI?.knowledge?.getDocumentSummary) return null
    try {
      const result = await window.electronAPI.knowledge.getDocumentSummary({
        apiKey: pineconeApiKey.value,
        indexName: pineconeIndexName.value,
        documentId
      })
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  return {
    pineconeApiKey, pineconeIndexName,
    connectionStatus, connectionError,
    indexes, isLoadingIndexes,
    documents, isLoadingDocs, isUploading, uploadProgress,
    ragEnabled, indexStats,
    indexSources, isLoadingSources,
    embeddingProvider, embeddingModel,
    indexConfigs, enabledIndexes,
    loadConfig, saveConfig, verifyConnection,
    fetchIndexes, selectIndex, refresh,
    loadDocuments, loadIndexSources, uploadFiles, deleteDocument, deleteSource, getDocumentSummary,
    getIndexConfig, toggleIndexEnabled, saveIndexEmbeddingConfig,
    queryKnowledge
  }
})
