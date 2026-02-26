<template>
  <div class="knowledge-page">

    <!-- Header -->
    <div class="knowledge-header">
      <div class="knowledge-header-top">
        <div>
          <h1 class="knowledge-title">AI Knowledge</h1>
          <p class="knowledge-subtitle">
            Manage RAG with Pinecone vector database
          </p>
        </div>
        <div class="header-actions">
          <AppButton @click="refreshAll" :disabled="isRefreshing" :loading="isRefreshing">
            <svg v-if="!isRefreshing" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {{ isRefreshing ? 'Refreshing...' : 'Refresh' }}
          </AppButton>
        </div>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="knowledge-content">
      <div class="knowledge-content-inner">

        <!-- Embedding Configuration (single row, always visible when API key exists) -->
        <div v-if="hasApiKey" class="config-card embedding-config-row-card">
          <div class="embedding-config-row">
            <div class="embedding-config-left">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              </div>
              <div class="embedding-field embedding-provider-field">
                <label class="form-label-inline">Provider</label>
                <ComboBox
                  :model-value="knowledgeStore.embeddingProvider"
                  :options="embeddingProviderOptions"
                  placeholder="Select provider..."
                  @update:model-value="onEmbeddingProviderChange"
                />
              </div>
              <div class="embedding-field embedding-model-field">
                <label class="form-label-inline">Model</label>
                <ComboBox
                  :model-value="knowledgeStore.embeddingModel"
                  :options="embeddingModelOptions"
                  placeholder="Select embedding model..."
                  :disabled="embeddingModelsLoading"
                  @update:model-value="onEmbeddingModelChange"
                />
              </div>
            </div>
            <div class="embedding-config-right">
              <span class="switch-title">RAG Retrieval</span>
              <button class="switch-track" :class="{ active: knowledgeStore.ragEnabled && hasApiKey }" :disabled="!hasApiKey" @click="toggleRag">
                <span class="switch-thumb"></span>
              </button>
              <span v-if="saveMsg" class="save-msg" :class="saveMsg.ok ? 'save-ok' : 'save-err'">{{ saveMsg.text }}</span>
            </div>
          </div>
        </div>

        <!-- Connection status bar -->
        <div class="config-card top-bar-card">
          <div class="top-bar-row">
            <div class="status-left">
              <span class="status-dot" :class="statusDotClass"></span>
              <span class="status-label">{{ connectionLabel }}</span>
            </div>

            <router-link v-if="!hasApiKey" to="/config" class="btn-primary compact">
              Go to Configuration
              <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </router-link>
          </div>
        </div>

        <!-- Empty state: no API key or not connected yet -->
        <div v-if="!hasApiKey || knowledgeStore.connectionStatus !== 'connected'" class="empty-state-card">
          <div class="empty-icon-wrap">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
          <h2 class="empty-title">{{ !hasApiKey ? 'Configure API Key' : 'Connecting...' }}</h2>
          <p class="empty-desc">
            {{ !hasApiKey ? 'Add your Pinecone API key in Configuration to get started.' : 'Establishing connection to Pinecone...' }}
          </p>
        </div>

        <!-- Main content (when connected) -->
        <template v-if="hasApiKey && knowledgeStore.connectionStatus === 'connected'">

          <!-- Two-panel layout: index list | index detail -->
          <div class="index-layout">

            <!-- Left: Index list -->
            <div class="index-list-panel config-card">
              <div class="index-list-header">
                <h3 class="form-section-title">Indexes</h3>
                <span class="hint" style="margin:0;">{{ knowledgeStore.indexes.length }} found</span>
              </div>
              <div v-if="knowledgeStore.isLoadingIndexes" class="hint" style="padding: 12px 0;">Loading...</div>
              <div v-else class="index-list">
                <button
                  v-for="idx in knowledgeStore.indexes"
                  :key="idx.name"
                  class="index-list-item"
                  :class="{ selected: knowledgeStore.pineconeIndexName === idx.name }"
                  @click="onIndexChange(idx.name)"
                >
                  <div class="index-item-info">
                    <span class="index-item-name">{{ idx.name }}</span>
                    <span class="index-item-meta">{{ idx.dimension }}d &middot; {{ idx.metric }}</span>
                  </div>
                  <span
                    class="index-enabled-chip"
                    :class="isIndexEnabled(idx.name) ? 'chip-enabled' : 'chip-disabled'"
                  >{{ isIndexEnabled(idx.name) ? 'On' : 'Off' }}</span>
                </button>
              </div>
            </div>

            <!-- Right: Selected index detail -->
            <div class="index-detail-panel">

              <!-- No index selected -->
              <div v-if="!knowledgeStore.pineconeIndexName" class="config-card" style="text-align:center; padding: 48px 24px;">
                <p class="hint" style="margin:0;">Select an index from the list to view details.</p>
              </div>

              <!-- Index detail card -->
              <template v-else>
                <div class="config-card">
                  <!-- Header row: title + enable switch + upload button -->
                  <div class="detail-header-row">
                    <div class="detail-header-left">
                      <div class="section-icon-sm">
                        <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <ellipse cx="12" cy="5" rx="9" ry="3"/>
                          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                        </svg>
                      </div>
                      <h3 class="form-section-title">{{ knowledgeStore.pineconeIndexName }}</h3>
                      <div class="detail-enable-switch">
                        <span class="form-label-inline">RAG</span>
                        <button
                          class="switch-track"
                          :class="{ active: currentIndexConfig?.enabled }"
                          @click="onToggleCurrentIndex"
                        >
                          <span class="switch-thumb"></span>
                        </button>
                      </div>
                    </div>
                    <AppButton size="compact" @click="pickAndUploadFiles" :disabled="knowledgeStore.isUploading || !hasApiKey" :loading="knowledgeStore.isUploading">
                      <svg v-if="!knowledgeStore.isUploading" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      {{ knowledgeStore.isUploading ? 'Uploading...' : 'Upload' }}
                    </AppButton>
                  </div>

                  <!-- Stats row -->
                  <template v-if="knowledgeStore.indexStats">
                    <div class="index-stats-row">
                      <div class="stat-item-inline">
                        <span class="stat-label">Records</span>
                        <span class="stat-value">{{ (knowledgeStore.indexStats.vectorCount || 0).toLocaleString() }}</span>
                      </div>
                      <div class="stat-item-inline">
                        <span class="stat-label">Region</span>
                        <span class="stat-value">
                          <template v-if="knowledgeStore.indexStats.cloud || knowledgeStore.indexStats.region">{{ knowledgeStore.indexStats.cloud }} {{ knowledgeStore.indexStats.region }}</template>
                          <template v-else>—</template>
                        </span>
                      </div>
                      <div class="stat-item-inline">
                        <span class="stat-label">Type</span>
                        <span class="stat-value">{{ knowledgeStore.indexStats.vectorType || 'Dense' }}</span>
                      </div>
                      <div class="stat-item-inline">
                        <span class="stat-label">Dimension</span>
                        <span class="stat-value">{{ knowledgeStore.indexStats.dimension }}</span>
                      </div>
                      <div class="stat-item-inline">
                        <span class="stat-label">Metric</span>
                        <span class="stat-value">{{ knowledgeStore.indexStats.metric }}</span>
                      </div>
                      <div class="stat-item-inline" v-if="currentIndexConfig">
                        <span class="stat-label">Embedding</span>
                        <span class="stat-value" style="font-size: var(--fs-caption);">
                          {{ currentIndexConfig.embeddingProvider === 'openrouter' ? 'OpenRouter' : 'OpenAI' }}
                          / {{ currentIndexConfig.embeddingModel }}
                        </span>
                      </div>
                    </div>
                    <div v-if="knowledgeStore.indexStats.host" class="index-host-row">
                      <span class="stat-label">Host</span>
                      <span class="stat-value font-mono" style="font-size: var(--fs-caption); word-break: break-all;">{{ knowledgeStore.indexStats.host }}</span>
                    </div>
                  </template>
                  <div v-else class="hint">Loading index details...</div>

                  <!-- Sources in index -->
                  <div class="index-sources-section">
                    <div class="index-sources-header">
                      <span class="stat-label">Sources in Index</span>
                      <span v-if="knowledgeStore.isLoadingSources" class="hint" style="margin: 0;">Loading...</span>
                    </div>
                    <div v-if="knowledgeStore.indexSources.length > 0" class="index-sources-list">
                      <span
                        v-for="src in knowledgeStore.indexSources"
                        :key="src.name"
                        class="source-badge"
                      >
                        <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        {{ src.name }}
                        <span class="source-badge-count">{{ src.chunks }} chunks</span>
                        <button class="source-delete-btn" @click.stop="confirmDeleteSource(src)" :disabled="isDeletingSource">
                          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                      </span>
                    </div>
                    <div v-else-if="!knowledgeStore.isLoadingSources" class="hint" style="margin-top: 4px;">
                      No sources found — upload documents to populate this index.
                    </div>
                  </div>
                </div>

                <!-- Test RAG card -->
                <div class="config-card">
                  <div class="form-section-header">
                    <div class="section-icon-sm">
                      <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                      </svg>
                    </div>
                    <h3 class="form-section-title">Test RAG</h3>
                  </div>
                  <div class="form-group" style="margin-bottom:0;">
                    <div class="test-rag-row">
                      <input
                        v-model="testQuery"
                        type="text"
                        class="field"
                        placeholder="Enter a test query..."
                        @keydown.enter="runTestQuery"
                      />
                      <AppButton @click="runTestQuery" :disabled="!testQuery.trim() || testQueryLoading" :loading="testQueryLoading" size="compact">
                        Search
                      </AppButton>
                    </div>
                  </div>
                  <div v-if="testQueryError" class="test-rag-error">
                    {{ testQueryError }}
                  </div>
                  <div v-if="testQueryResults.length > 0" class="test-rag-results">
                    <div v-for="(match, idx) in testQueryResults" :key="match.id" class="rag-result-item">
                      <div class="rag-result-header">
                        <span class="rag-result-rank">#{{ idx + 1 }}</span>
                        <span class="rag-result-score">Score: {{ match.score?.toFixed(4) }}</span>
                        <span v-if="match.documentName" class="rag-result-source">{{ match.documentName }}</span>
                      </div>
                      <p class="rag-result-text">{{ match.text }}</p>
                    </div>
                  </div>
                  <div v-else-if="testQuerySearched && !testQueryLoading && !testQueryError" class="test-rag-empty">
                    <p class="hint">No matching chunks found.</p>
                  </div>
                </div>

              </template>
            </div>

          </div>

        </template>

      </div>
    </div>

    <!-- Upload result toast -->
    <div v-if="uploadResult" class="upload-toast" :class="uploadResult.success ? 'toast-success' : 'toast-error'">
      <svg v-if="uploadResult.success" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{{ uploadResult.message }}</span>
      <button @click="uploadResult = null" class="toast-close">
        <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>

    <!-- Inspect Modal -->
    <Teleport to="body">
      <div v-if="inspectDoc" class="modal-backdrop" @click.self="inspectDoc = null">
        <div class="modal-container">
          <div class="modal-header">
            <div class="modal-header-left">
              <div class="section-icon-sm">
                <svg class="icon-xs" style="color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <h2 class="modal-title">Document Summary</h2>
            </div>
            <button class="modal-close" @click="inspectDoc = null">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div v-if="inspectLoading" class="modal-loading">
              <svg class="animate-spin icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <p class="hint">Loading summary...</p>
            </div>
            <template v-else-if="inspectData">
              <div class="inspect-row">
                <span class="inspect-label">Document</span>
                <span class="inspect-value">{{ inspectDoc.name || inspectDoc.id }}</span>
              </div>
              <div class="inspect-row">
                <span class="inspect-label">Type</span>
                <span class="inspect-value">{{ inspectDoc.type || 'Unknown' }}</span>
              </div>
              <div class="inspect-row">
                <span class="inspect-label">Size</span>
                <span class="inspect-value">{{ formatSize(inspectDoc.size) }}</span>
              </div>
              <div class="inspect-row">
                <span class="inspect-label">Chunks</span>
                <span class="inspect-value">{{ inspectDoc.chunkCount || 0 }} vector chunks</span>
              </div>
              <div v-if="inspectData.summary" class="inspect-row">
                <span class="inspect-label">Summary</span>
                <span class="inspect-value" style="line-height:1.6;">{{ inspectData.summary }}</span>
              </div>
              <div v-if="inspectData.sampleChunks && inspectData.sampleChunks.length > 0" class="inspect-row">
                <span class="inspect-label">Sample Chunks</span>
                <div class="inspect-chunks">
                  <div v-for="(chunk, idx) in inspectData.sampleChunks" :key="idx" class="inspect-chunk">
                    <span class="inspect-chunk-label">Chunk {{ idx + 1 }}</span>
                    <p class="inspect-chunk-text">{{ chunk }}</p>
                  </div>
                </div>
              </div>
            </template>
            <div v-else-if="inspectError" class="modal-loading">
              <p style="color: #FF3B30;">{{ inspectError }}</p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Delete Source Modal -->
    <ConfirmModal
      v-if="deleteSourceTarget"
      title="Delete Source"
      :message="`Are you sure you want to delete &quot;${deleteSourceTarget.name}&quot; from this index? This removes all vector embeddings for this source file.`"
      confirm-text="Delete"
      confirm-class="primary"
      :loading="isDeletingSource"
      loading-text="Deleting…"
      @confirm="executeDeleteSource"
      @close="deleteSourceTarget = null"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useKnowledgeStore } from '../stores/knowledge'
import { useModelsStore } from '../stores/models'
import { useConfigStore } from '../stores/config'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import AppButton from '../components/common/AppButton.vue'
import ComboBox from '../components/common/ComboBox.vue'

const knowledgeStore = useKnowledgeStore()
const modelsStore = useModelsStore()
const configStore = useConfigStore()

onMounted(async () => {
  if (knowledgeStore.connectionStatus === 'disconnected') {
    await refreshAll()
  }
  // Fetch embedding models for the active provider on page load
  await fetchEmbeddingModels(knowledgeStore.embeddingProvider)
})

const uploadResult = ref(null)
const inspectDoc = ref(null)
const inspectData = ref(null)
const inspectLoading = ref(false)
const inspectError = ref(null)
const deleteSourceTarget = ref(null)
const isDeletingSource = ref(false)
const isRefreshing = ref(false)
const saveMsg = ref(null)

// ── Embedding config ──
const embeddingProviderOptions = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'openrouter', name: 'OpenRouter' },
]

const embeddingModelsLoading = ref(false)

async function fetchEmbeddingModels(provider) {
  if (provider === 'openrouter' && !modelsStore.openrouterCached) {
    embeddingModelsLoading.value = true
    await modelsStore.fetchOpenRouterModels()
    embeddingModelsLoading.value = false
  } else if (provider === 'openai' && !modelsStore.openaiCached) {
    embeddingModelsLoading.value = true
    await modelsStore.fetchOpenAIModels()
    embeddingModelsLoading.value = false
  }
}

const embeddingModelOptions = computed(() => {
  const provider = knowledgeStore.embeddingProvider
  const models = modelsStore.getModelsForProvider(provider)
  // Filter for embedding-related models when possible
  const filtered = models.filter(m => {
    const id = (m.id || '').toLowerCase()
    return id.includes('embed') || id.includes('embedding')
  })
  // If no embedding models found, show all models
  const list = filtered.length > 0 ? filtered : models
  return list.map(m => ({
    id: m.id,
    name: m.name || m.id,
    detail: m.id
  }))
})

async function onEmbeddingProviderChange(provider) {
  knowledgeStore.embeddingProvider = provider
  await fetchEmbeddingModels(provider)
  // Re-select: keep current model if it exists in the new list, otherwise pick the first
  const currentModel = knowledgeStore.embeddingModel
  const available = embeddingModelOptions.value
  const stillValid = available.some(m => m.id === currentModel)
  if (!stillValid && available.length > 0) {
    knowledgeStore.embeddingModel = available[0].id
  }
  await knowledgeStore.saveConfig()
}

async function onEmbeddingModelChange(modelId) {
  knowledgeStore.embeddingModel = modelId
  await knowledgeStore.saveConfig()
}

// ── Test RAG ──
const testQuery = ref('')
const testQueryLoading = ref(false)
const testQueryResults = ref([])
const testQueryError = ref(null)
const testQuerySearched = ref(false)

async function runTestQuery() {
  if (!testQuery.value.trim()) return
  testQueryLoading.value = true
  testQueryError.value = null
  testQueryResults.value = []
  testQuerySearched.value = false
  try {
    const result = await knowledgeStore.queryKnowledge(testQuery.value)
    if (result.success) {
      testQueryResults.value = result.matches || []
    } else {
      testQueryError.value = result.error || 'Query failed'
    }
  } catch (err) {
    testQueryError.value = err.message
  } finally {
    testQueryLoading.value = false
    testQuerySearched.value = true
  }
}

// ── Per-index config ──
const currentIndexConfig = computed(() => {
  return knowledgeStore.getIndexConfig(knowledgeStore.pineconeIndexName)
})

function isIndexEnabled(indexName) {
  const cfg = knowledgeStore.getIndexConfig(indexName)
  return cfg?.enabled === true
}

async function onToggleCurrentIndex() {
  const name = knowledgeStore.pineconeIndexName
  if (!name) return
  const current = knowledgeStore.getIndexConfig(name)
  const newEnabled = !(current?.enabled)
  await knowledgeStore.toggleIndexEnabled(name, newEnabled)
}

const hasApiKey = computed(() => {
  return !!knowledgeStore.pineconeApiKey
})

const connectionLabel = computed(() => {
  const s = knowledgeStore.connectionStatus
  if (s === 'connected') {
    const count = knowledgeStore.indexes.length
    return `Connected — ${count} index${count !== 1 ? 'es' : ''}`
  }
  if (s === 'connecting') return 'Connecting...'
  if (s === 'error') return knowledgeStore.connectionError || 'Connection failed'
  return 'Disconnected'
})

const statusDotClass = computed(() => {
  const s = knowledgeStore.connectionStatus
  if (s === 'connected') return 'dot-connected'
  if (s === 'error') return 'dot-error'
  if (s === 'connecting') return 'dot-warning'
  return 'dot-idle'
})

async function toggleRag() {
  knowledgeStore.ragEnabled = !knowledgeStore.ragEnabled
  saveMsg.value = null
  try {
    await knowledgeStore.saveConfig()
    saveMsg.value = { ok: true, text: 'Saved successfully' }
  } catch {
    saveMsg.value = { ok: false, text: 'Failed to save' }
  }
  setTimeout(() => { saveMsg.value = null }, 2500)
}

async function refreshAll() {
  isRefreshing.value = true
  try {
    await knowledgeStore.refresh()
  } finally {
    isRefreshing.value = false
  }
}

async function onIndexChange(indexName) {
  await knowledgeStore.selectIndex(indexName)
}

async function pickAndUploadFiles() {
  if (!window.electronAPI?.knowledge?.pickFiles) return
  try {
    const filePaths = await window.electronAPI.knowledge.pickFiles()
    if (!filePaths || filePaths.length === 0) return
    const result = await knowledgeStore.uploadFiles(filePaths)
    if (result.success) {
      uploadResult.value = { success: true, message: `Successfully uploaded ${filePaths.length} file(s)` }
    } else {
      uploadResult.value = { success: false, message: result.error || 'Upload failed' }
    }
    setTimeout(() => { uploadResult.value = null }, 4000)
  } catch (err) {
    uploadResult.value = { success: false, message: err.message }
    setTimeout(() => { uploadResult.value = null }, 4000)
  }
}

function confirmDeleteSource(src) {
  deleteSourceTarget.value = src
}

async function executeDeleteSource() {
  if (!deleteSourceTarget.value || isDeletingSource.value) return
  isDeletingSource.value = true
  try {
    await knowledgeStore.deleteSource(deleteSourceTarget.value.name)
  } finally {
    isDeletingSource.value = false
  }
  deleteSourceTarget.value = null
}

async function inspectDocument(doc) {
  inspectDoc.value = doc
  inspectData.value = null
  inspectError.value = null
  inspectLoading.value = true
  try {
    const result = await knowledgeStore.getDocumentSummary(doc.id)
    if (result && result.success) {
      inspectData.value = result
    } else {
      inspectError.value = result?.error || 'Failed to load summary'
    }
  } catch (err) {
    inspectError.value = err.message
  } finally {
    inspectLoading.value = false
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════
   KNOWLEDGE PAGE — Matches ConfigView design language
   ══════════════════════════════════════════════════════════════════════════ */

.knowledge-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-main); }

/* ── Header ──────────────────────────────────────────────────────────────── */
.knowledge-header { padding: 24px 32px 20px; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.knowledge-header-top { display: flex; align-items: flex-start; justify-content: space-between; }
.knowledge-title { font-family: 'Inter', sans-serif; font-size: var(--fs-page-title); font-weight: 700; color: var(--text-primary); margin: 0; }
.knowledge-subtitle { font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: var(--text-secondary); margin: 4px 0 0 0; }
.header-actions { display: flex; align-items: center; gap: 8px; }

/* ── Content area ────────────────────────────────────────────────────────── */
.knowledge-content { flex: 1; overflow-y: auto; padding: 24px 32px 32px; scrollbar-width: thin; }
.knowledge-content-inner { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }

/* ── Embedding Configuration (single row above connection bar) ────────────── */
.embedding-config-row-card { padding: 14px 20px; }
.embedding-config-row {
  display: flex; align-items: center; gap: 16px;
}
.embedding-config-left {
  display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0;
}
.embedding-config-right {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0; margin-left: auto;
}
.embedding-field {
  display: flex; align-items: center; gap: 8px;
}
.embedding-model-field {
  flex: 1; min-width: 200px; max-width: 360px;
}
.form-label-inline {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  color: var(--text-muted); white-space: nowrap;
}

@media (max-width: 900px) {
  .embedding-config-row { flex-wrap: wrap; }
  .embedding-config-left { flex-wrap: wrap; }
  .embedding-model-field { min-width: 160px; }
}

/* ── Top bar (connection status) ─────────────────────────────────────── */
.top-bar-card { padding: 14px 20px; }
.top-bar-row {
  display: flex; align-items: center; gap: 16px;
}

/* ── Config card (reuses ConfigView pattern) ─────────────────────────────── */
.config-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}

/* ── Status row ──────────────────────────────────────────────────────────── */
.status-left { display: flex; align-items: center; gap: 8px; }
.status-label { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600; color: var(--text-primary); }
.status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.dot-connected { background: var(--accent); }
.dot-error { background: #FF3B30; }
.dot-warning { background: #FF9500; }
.dot-idle { background: #D1D1D6; }

/* ── Form elements (matches ConfigView) ──────────────────────────────────── */
.form-group { margin-bottom: 16px; }
.form-group:last-child { margin-bottom: 0; }
.form-label { display: block; margin-bottom: 6px; font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 500; color: var(--text-secondary); }
.form-divider { height: 1px; background: var(--border); margin: 16px 0; }
.form-section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.section-icon-sm { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #FFFFFF; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); }
.form-section-title { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600; color: var(--text-primary); margin: 0; }
.hint { margin-top: 4px; color: var(--text-muted); font-family: 'Inter', sans-serif; font-size: var(--fs-caption); }
.test-connection-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }


/* ── Index stats row (single horizontal line) ────────────────────────────── */
.index-stats-row {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.stat-item-inline {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: var(--radius-sm);
  background: var(--bg-main); border: 1px solid var(--border-light);
  white-space: nowrap;
}
.stat-label {
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 700;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em;
}
.stat-value {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600;
  color: var(--text-primary);
}
.status-ready { color: #059669; }
.status-pending { color: #FF9500; }

/* ── Index host (below stats row) ────────────────────────────────────────── */
.index-host-row {
  display: flex; align-items: baseline; gap: 8px; margin-top: 10px;
  padding: 6px 12px; border-radius: var(--radius-sm);
  background: var(--bg-main); border: 1px solid var(--border-light);
}

/* ── Sources in index ─────────────────────────────────────────────────────── */
.index-sources-section {
  margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light);
}
.index-sources-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.index-sources-list {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.source-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: var(--radius-sm);
  background: var(--bg-main); border: 1px solid var(--border-light);
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 500;
  color: var(--text-primary);
}
.source-badge .icon-xs { color: var(--text-muted); }
.source-badge-count {
  font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600;
  color: var(--text-muted); margin-left: 2px;
}
.source-delete-btn {
  display: flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%; border: none; padding: 0;
  background: transparent; color: var(--text-muted); cursor: pointer;
  transition: all 0.12s ease; margin-left: 2px;
}
.source-delete-btn:hover { background: rgba(255, 59, 48, 0.15); color: #FF3B30; }
.source-delete-btn:disabled { opacity: 0.3; cursor: not-allowed; }

@media (max-width: 600px) {
  .index-stats-row { gap: 8px; }
}

/* ── Index two-panel layout ──────────────────────────────────────────────── */
.index-layout {
  display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: start;
}
@media (max-width: 900px) {
  .index-layout { grid-template-columns: 1fr; }
}

/* ── Index list panel (left) ─────────────────────────────────────────────── */
.index-list-panel { padding: 16px; display: flex; flex-direction: column; min-height: 480px; max-height: calc(100vh - 280px); }
.index-list-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-shrink: 0;
}
.index-list {
  display: flex; flex-direction: column; gap: 2px;
  flex: 1; overflow-y: auto; scrollbar-width: thin;
}
.index-list-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 10px 12px; border-radius: var(--radius-sm);
  border: 1px solid transparent; background: transparent;
  cursor: pointer; transition: all 0.12s ease; text-align: left;
  font-family: 'Inter', sans-serif; flex-shrink: 0;
}
.index-list-item:hover { background: var(--bg-hover); }
.index-list-item.selected {
  background: var(--bg-main); border-color: var(--border);
}
.index-item-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.index-item-name {
  font-size: var(--fs-body); font-weight: 600; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.index-item-meta {
  font-size: var(--fs-caption); color: var(--text-muted);
}
.index-enabled-chip {
  flex-shrink: 0; padding: 2px 8px; border-radius: 10px;
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.chip-enabled, .chip-disabled {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.chip-disabled { opacity: 0.45; }

/* ── Index detail panel (right) ──────────────────────────────────────────── */
.index-detail-panel {
  display: flex; flex-direction: column; gap: 20px;
}
.detail-header-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;
}
.detail-header-left {
  display: flex; align-items: center; gap: 10px; min-width: 0;
}
.detail-enable-switch {
  display: flex; align-items: center; gap: 8px; margin-left: 8px;
}

/* ── Link styled as button (for router-link) ─────────────────────────────── */
.btn-primary {
  display: flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 10px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #FFFFFF;
  border: none; cursor: pointer; transition: all 0.15s ease; text-decoration: none;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); flex-shrink: 0;
}
.btn-primary:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }

/* ── Switch row ──────────────────────────────────────────────────────────── */
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.switch-info { display: flex; flex-direction: column; gap: 2px; }
.switch-title { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600; color: var(--text-primary); }
.switch-desc { font-family: 'Inter', sans-serif; font-size: var(--fs-caption); color: var(--text-muted); }
.save-msg {
  display: inline-block; font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  animation: fadeIn 0.2s ease;
}
.save-ok { color: var(--text-primary); }
.save-err { color: #FF3B30; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Toggle switch (black style) ─────────────────────────────────────────── */
.switch-track {
  position: relative; width: 44px; height: 24px; border-radius: 12px; border: none;
  background: #D1D1D6; cursor: pointer; transition: background 0.2s ease; flex-shrink: 0; padding: 0;
}
.switch-track.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
}
.switch-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 20px; height: 20px; border-radius: 50%;
  background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.2s ease;
}
.switch-track.active .switch-thumb { transform: translateX(20px); }
.switch-track:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Icon sizes ──────────────────────────────────────────────────────────── */
.icon-sm { width: 18px; height: 18px; flex-shrink: 0; }
.icon-xs { width: 14px; height: 14px; flex-shrink: 0; }
.icon-lg { width: 28px; height: 28px; flex-shrink: 0; }

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-state-card {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: 48px 24px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}
.empty-icon-wrap {
  width: 64px; height: 64px; border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.empty-icon { width: 32px; height: 32px; color: #fff; }
.empty-title { font-family: 'Inter', sans-serif; font-size: var(--fs-section); font-weight: 700; color: var(--text-primary); margin: 0 0 8px; }
.empty-desc { font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: var(--text-muted); line-height: 1.6; margin: 0 0 20px; max-width: 360px; }

/* ── Toast ────────────────────────────────────────────────────────────────── */
.upload-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; padding: 10px 18px;
  border-radius: var(--radius-md); font-family: 'Inter', sans-serif;
  font-size: var(--fs-body); font-weight: 500; z-index: 200;
  animation: toast-in 0.3s ease; box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.toast-success { background: rgba(0,122,255,0.95); color: #fff; }
.toast-error { background: rgba(255,59,48,0.95); color: #fff; }
.toast-close { background: none; border: none; cursor: pointer; color: inherit; padding: 2px; }
@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* ── Modal (dark theme) ──────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.modal-container {
  width: min(580px, 95vw); max-height: 85vh;
  background: #0F0F0F; border: 1px solid #2A2A2A; border-radius: var(--radius-xl);
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: modal-enter 0.2s ease-out;
}
@keyframes modal-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #1F1F1F;
}
.modal-header-left { display: flex; align-items: center; gap: 10px; }
.modal-title { font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle); font-weight: 700; color: #FFFFFF; margin: 0; }
.modal-close {
  width: 32px; height: 32px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280;
  cursor: pointer; transition: all 0.15s;
}
.modal-close:hover { background: #1F1F1F; color: #FFFFFF; }
.modal-body { flex: 1; overflow-y: auto; padding: 24px; scrollbar-width: thin; scrollbar-color: #333 transparent; }
.modal-loading { text-align: center; padding: 24px 0; color: #4B5563; }

/* Inspect rows */
.inspect-row { margin-bottom: 16px; }
.inspect-label {
  display: block; font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 700;
  color: #4B5563; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;
}
.inspect-value { display: block; font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: #D1D5DB; margin: 0; }
.inspect-chunks { display: flex; flex-direction: column; gap: 8px; }
.inspect-chunk {
  padding: 10px 14px; border-radius: var(--radius-sm);
  background: #1A1A1A; border: 1px solid #2A2A2A;
}
.inspect-chunk-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 700;
  color: #4B5563; text-transform: uppercase;
}
.inspect-chunk-text {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #9CA3AF;
  margin: 4px 0 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}

/* ── Embedding provider combo ────────────────────────────────────────── */
.embedding-provider-field { min-width: 200px; max-width: 280px; }

/* ── Input field (scoped override for black style) ──────────────────── */
.field {
  width: 100%; display: block; padding: 9px 12px; border-radius: var(--radius-sm);
  background: var(--bg-card); border: 1.5px solid var(--text-primary); color: var(--text-primary);
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field::placeholder { color: var(--text-muted); }
.field:focus { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08); }

/* ── Test RAG section ────────────────────────────────────────────────── */
.test-rag-row { display: flex; align-items: center; gap: 8px; }
.test-rag-row .field { flex: 1; }
.test-rag-error {
  margin-top: 12px; padding: 10px 14px; border-radius: var(--radius-sm);
  background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.2);
  color: #FF3B30; font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
}
.test-rag-results { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.rag-result-item {
  padding: 12px 14px; border-radius: var(--radius-sm);
  background: var(--bg-main); border: 1px solid var(--border-light);
}
.rag-result-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.rag-result-rank {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700;
  color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border);
  padding: 1px 6px; border-radius: 4px;
}
.rag-result-score {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;
  color: #059669;
}
.rag-result-source {
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 500;
  color: var(--text-muted); margin-left: auto;
}
.rag-result-text {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: var(--text-secondary);
  margin: 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
  max-height: 120px; overflow-y: auto;
}
.test-rag-empty { padding: 12px 0 0; }

/* ── Reduced motion ──────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .doc-item { transition: none; }
}
</style>
