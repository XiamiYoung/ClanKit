import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useKnowledgeStore = defineStore('knowledge', () => {
  // Knowledge bases (local)
  const knowledgeBases = ref([])         // [{ id, name, description, createdAt, documentCount }]
  const selectedKbId = ref(null)
  const isLoading = ref(false)

  // Documents for selected KB
  const documents = ref([])
  const isLoadingDocs = ref(false)
  const isUploading = ref(false)
  const uploadProgress = ref(null)       // { stage, current, total, documentName }

  // Per-KB configs: { [kbId]: { enabled } }
  const kbConfigs = ref({})

  // Embedding model status. Post-bundle cutover: the model ships with the
  // installer so `modelReady` is normally true the first time it's checked.
  // The legacy download flow is retained as a no-op fallback in case a user's
  // bundled files were corrupted or removed manually.
  const modelReady = ref(false)
  const modelChecking = ref(false)
  const modelSetupProgress = ref(null)   // { step, progress, message } — legacy
  const modelSetupError = ref(null)
  // Full info from the embedding engine: { modelId, version, sizeMB, source, ... }
  const modelInfo = ref(null)

  // Computed: enabled knowledge bases
  const enabledKnowledgeBases = computed(() => {
    return knowledgeBases.value.filter(kb => {
      const cfg = kbConfigs.value[kb.id]
      return cfg?.enabled !== false
    })
  })

  // ── Config ──────────────────────────────────────────────────────────────────

  async function loadConfig() {
    if (!window.electronAPI?.knowledge?.getConfig) return
    try {
      const config = await window.electronAPI.knowledge.getConfig()
      kbConfigs.value = config.knowledgeBases || {}
    } catch (err) {
      console.error('Failed to load knowledge config:', err)
    }
    // Also load KB list so other views (AgentBodyViewer) can see available KBs
    await loadKnowledgeBases()
  }

  async function saveConfig() {
    if (!window.electronAPI?.knowledge?.saveConfig) return
    try {
      await window.electronAPI.knowledge.saveConfig({
        knowledgeBases: JSON.parse(JSON.stringify(kbConfigs.value))
      })
    } catch (err) {
      console.error('Failed to save knowledge config:', err)
    }
  }

  // ── Knowledge Base CRUD ─────────────────────────────────────────────────────

  async function loadKnowledgeBases() {
    if (!window.electronAPI?.knowledge?.listKnowledgeBases) return
    isLoading.value = true
    try {
      const result = await window.electronAPI.knowledge.listKnowledgeBases()
      if (result.success) {
        knowledgeBases.value = result.knowledgeBases || []
        // Prune configs for deleted KBs
        const liveIds = new Set(knowledgeBases.value.map(kb => kb.id))
        const staleKeys = Object.keys(kbConfigs.value).filter(k => !liveIds.has(k))
        if (staleKeys.length > 0) {
          const updated = { ...kbConfigs.value }
          for (const k of staleKeys) delete updated[k]
          kbConfigs.value = updated
          await saveConfig()
        }
      }
    } catch (err) {
      console.error('Failed to load knowledge bases:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function createKnowledgeBase(name, description) {
    if (!window.electronAPI?.knowledge?.createKnowledgeBase) return null
    try {
      const result = await window.electronAPI.knowledge.createKnowledgeBase({ name, description })
      if (result.success) {
        await loadKnowledgeBases()
        await loadConfig()
        return result.knowledgeBase
      }
      return null
    } catch (err) {
      console.error('Failed to create knowledge base:', err)
      return null
    }
  }

  async function deleteKnowledgeBase(kbId) {
    if (!window.electronAPI?.knowledge?.deleteKnowledgeBase) return false
    try {
      const result = await window.electronAPI.knowledge.deleteKnowledgeBase({ kbId })
      if (result.success) {
        if (selectedKbId.value === kbId) {
          selectedKbId.value = null
          documents.value = []
        }
        await loadKnowledgeBases()
        await loadConfig()
        // Main-process IPC prunes agent references in SQLite; refresh renderer.
        try {
          const { useAgentsStore } = await import('./agents')
          await useAgentsStore().loadAgents()
        } catch (err) {
          console.error('[knowledge] post-delete agents refresh failed:', err)
        }
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to delete knowledge base:', err)
      return false
    }
  }

  async function selectKnowledgeBase(kbId) {
    selectedKbId.value = kbId
    documents.value = []
    if (kbId) {
      await loadDocuments(kbId)
    }
  }

  async function toggleKbEnabled(kbId, enabled) {
    const updated = { ...kbConfigs.value }
    if (!updated[kbId]) updated[kbId] = { enabled }
    else updated[kbId] = { ...updated[kbId], enabled }
    kbConfigs.value = updated
    await saveConfig()
  }

  // ── Documents ───────────────────────────────────────────────────────────────

  async function loadDocuments(kbId) {
    if (!window.electronAPI?.knowledge?.listDocuments) return
    const id = kbId || selectedKbId.value
    if (!id) return
    isLoadingDocs.value = true
    try {
      const result = await window.electronAPI.knowledge.listDocuments({ kbId: id })
      if (result.success) {
        documents.value = result.documents || []
      }
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      isLoadingDocs.value = false
    }
  }

  async function uploadFiles(kbId, filePaths) {
    if (!window.electronAPI?.knowledge?.uploadFiles) return { success: false, error: 'Not in Electron' }
    const id = kbId || selectedKbId.value
    if (!id) return { success: false, error: 'No knowledge base selected' }

    isUploading.value = true
    uploadProgress.value = null

    // Listen for progress events
    const cleanup = window.electronAPI.knowledge.onUploadProgress?.((data) => {
      uploadProgress.value = data
    })

    try {
      const result = await window.electronAPI.knowledge.uploadFiles({ kbId: id, filePaths })
      if (result.success) {
        await loadDocuments(id)
        await loadKnowledgeBases() // refresh document counts
      }
      return result
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      isUploading.value = false
      uploadProgress.value = null
      if (cleanup) cleanup()
    }
  }

  async function deleteDocument(kbId, documentId) {
    if (!window.electronAPI?.knowledge?.deleteDocument) return { success: false }
    const id = kbId || selectedKbId.value
    try {
      const result = await window.electronAPI.knowledge.deleteDocument({ kbId: id, documentId })
      if (result.success) {
        documents.value = documents.value.filter(d => d.id !== documentId)
        await loadKnowledgeBases() // refresh counts
      }
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async function getDocumentSummary(kbId, documentId) {
    if (!window.electronAPI?.knowledge?.getDocumentSummary) return null
    try {
      return await window.electronAPI.knowledge.getDocumentSummary({ kbId, documentId })
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // ── Query ───────────────────────────────────────────────────────────────────

  async function queryKnowledge(kbId, query, topK = 5) {
    if (!window.electronAPI?.knowledge?.query) return { success: false, error: 'Not in Electron' }
    try {
      return await window.electronAPI.knowledge.query({ query, knowledgeBaseId: kbId, topK })
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // ── Embedding Model Management ──────────────────────────────────────────────

  async function checkModel() {
    if (!window.electronAPI?.knowledge?.checkModel) return
    modelChecking.value = true
    try {
      const info = await window.electronAPI.knowledge.checkModel()
      modelReady.value = !!info?.ready
      modelInfo.value = info || null
    } catch (err) {
      modelReady.value = false
      modelInfo.value = null
    } finally {
      modelChecking.value = false
    }
  }

  async function setupModel(source) {
    if (!window.electronAPI?.knowledge?.setupModel) return { success: false }
    modelSetupProgress.value = null
    modelSetupError.value = null

    const cleanup = window.electronAPI.knowledge.onSetupProgress?.((data) => {
      modelSetupProgress.value = data
      if (data.step === 'error') modelSetupError.value = data.message
    })

    try {
      const result = await window.electronAPI.knowledge.setupModel({ source })
      if (result.success) {
        modelReady.value = true
      } else {
        modelSetupError.value = result.error
      }
      return result
    } catch (err) {
      modelSetupError.value = err.message
      return { success: false, error: err.message }
    } finally {
      if (cleanup) cleanup()
    }
  }

  async function removeModel() {
    if (!window.electronAPI?.knowledge?.removeModel) return
    try {
      await window.electronAPI.knowledge.removeModel()
      modelReady.value = false
    } catch (err) {
      console.error('Failed to remove model:', err)
    }
  }

  // ── Refresh (full reload) ───────────────────────────────────────────────────

  async function refresh() {
    await loadConfig()
    await Promise.all([loadKnowledgeBases(), checkModel()])
  }

  return {
    knowledgeBases, selectedKbId, isLoading,
    documents, isLoadingDocs, isUploading, uploadProgress,
    kbConfigs, enabledKnowledgeBases,
    modelReady, modelChecking, modelSetupProgress, modelSetupError, modelInfo,
    loadConfig, saveConfig,
    loadKnowledgeBases, createKnowledgeBase, deleteKnowledgeBase,
    selectKnowledgeBase, toggleKbEnabled,
    loadDocuments, uploadFiles, deleteDocument, getDocumentSummary,
    queryKnowledge,
    checkModel, setupModel, removeModel,
    refresh,
  }
})
