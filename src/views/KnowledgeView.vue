<template>
  <div class="knowledge-page">

    <!-- Header -->
    <div class="knowledge-header">
      <div class="knowledge-header-top">
        <div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <h1 class="knowledge-title">{{ t('knowledge.title') }}</h1>
            <span class="catalog-count-badge">{{ knowledgeStore.indexes.length }}</span>
          </div>
          <p class="knowledge-subtitle">
            {{ t('knowledge.subtitle') }}
          </p>
        </div>
        <div class="header-actions">
          <AppButton size="icon" @click="refreshAll" :disabled="isRefreshing" :loading="isRefreshing" :title="t('common.refresh')">
            <svg v-if="!isRefreshing" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </AppButton>
        </div>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="knowledge-content">
      <div class="knowledge-content-inner">

        <!-- Connection status bar -->
        <div class="config-card top-bar-card">
          <div class="top-bar-row">
            <!-- RAG Retrieval switch on left -->
            <div class="embedding-rag-left">
              <span class="switch-title">{{ t('knowledge.ragRetrieval') }}</span>
              <button class="switch-track" :class="{ active: knowledgeStore.ragEnabled && hasApiKey }" :disabled="!hasApiKey" @click="toggleRag">
                <span class="switch-thumb"></span>
              </button>
              <span v-if="saveMsg" class="save-msg" :class="saveMsg.ok ? 'save-ok' : 'save-err'">{{ saveMsg.text }}</span>
            </div>
            <!-- Connection status on right -->
            <div class="status-right">
              <span class="status-dot" :class="statusDotClass"></span>
              <span class="status-label">{{ connectionLabel }}</span>
              <router-link v-if="!hasApiKey" to="/config" class="btn-primary compact">
                {{ t('knowledge.goToConfig') }}
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </router-link>
            </div>
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
          <h2 class="empty-title">{{ !hasApiKey ? t('knowledge.configureApiKey') : t('knowledge.connecting') }}</h2>
          <p class="empty-desc">
            {{ !hasApiKey ? t('knowledge.addApiKeyHint') : t('knowledge.establishingConnection') }}
          </p>
        </div>

        <!-- Main content (when connected) -->
        <template v-if="hasApiKey && knowledgeStore.connectionStatus === 'connected'">

          <!-- Two-panel layout: index list | index detail -->
          <div class="index-layout">

            <!-- Left: Index list -->
            <div class="index-list-panel config-card">
              <div class="index-list-header">
                <h3 class="form-section-title">{{ t('knowledge.indexes') }}</h3>
                <span class="hint" style="margin:0;">{{ knowledgeStore.indexes.length }} {{ t('knowledge.found') }}</span>
              </div>
              <div v-if="knowledgeStore.isLoadingIndexes" class="hint" style="padding: 12px 0;">{{ t('knowledge.loading') }}</div>
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
                  >{{ isIndexEnabled(idx.name) ? t('knowledge.on') : t('knowledge.off') }}</span>
                </button>
              </div>
            </div>

            <!-- Right: Selected index detail -->
            <div class="index-detail-panel">

              <!-- No index selected -->
              <div v-if="!knowledgeStore.pineconeIndexName" class="config-card" style="text-align:center; padding: 48px 24px;">
                <p class="hint" style="margin:0;">{{ t('knowledge.selectIndexHint') }}</p>
              </div>

              <!-- Index detail card -->
              <template v-else>

                <!-- Embedding config card (per-index, above index info) -->
                <div class="config-card embedding-index-card">
                  <div class="embedding-index-row">
                    <!-- Provider -->
                    <div class="embedding-field embedding-provider-field">
                      <label class="form-label-inline">{{ t('knowledge.provider') }}</label>
                      <ComboBox
                        :model-value="knowledgeStore.embeddingProvider"
                        :options="embeddingProviderOptions"
                        :placeholder="t('knowledge.selectProvider')"
                        @update:model-value="onEmbeddingProviderChange"
                      />
                    </div>
                    <!-- Model -->
                    <div class="embedding-field embedding-model-field">
                      <label class="form-label-inline">{{ t('knowledge.model') }}</label>
                      <ComboBox
                        :model-value="knowledgeStore.embeddingModel"
                        :options="embeddingModelOptions"
                        :placeholder="t('knowledge.selectEmbeddingModel')"
                        :disabled="embeddingModelsLoading"
                        @update:model-value="onEmbeddingModelChange"
                      />
                    </div>
                    <!-- Save button -->
                    <AppButton size="compact" :loading="embeddingSaving" @click="saveEmbeddingConfig">
                      <svg v-if="!embeddingSaving" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                      </svg>
                      {{ t('knowledge.save') }}
                    </AppButton>
                  </div>
                  <!-- Warning when no model selected, or selection differs from recorded embedding model -->
                  <div v-if="embeddingModelMismatch" class="embedding-msg embedding-msg-warning">
                    <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span v-if="!knowledgeStore.embeddingModel">{{ t('knowledge.noEmbeddingModel') }}</span>
                    <span v-else>{{ t('knowledge.embeddingModelMismatch', { model: currentIndexConfig?.embeddingModel }) }}</span>
                  </div>
                  <!-- Error messages (e.g. model not found in list) -->
                  <div v-else-if="embeddingError" class="embedding-msg embedding-msg-error">
                    <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {{ embeddingError }}
                  </div>
                </div>

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
                      {{ knowledgeStore.isUploading ? t('knowledge.uploading') : t('knowledge.upload') }}
                    </AppButton>
                  </div>

                  <!-- Stats row -->
                  <template v-if="knowledgeStore.indexStats">
                    <div class="index-stats-row">
                      <div class="stat-item-inline">
                        <span class="stat-label">{{ t('knowledge.records') }}</span>
                        <span class="stat-value">{{ (knowledgeStore.indexStats.vectorCount || 0).toLocaleString() }}</span>
                      </div>
                      <div class="stat-item-inline">
                        <span class="stat-label">{{ t('knowledge.region') }}</span>
                        <span class="stat-value">
                          <template v-if="knowledgeStore.indexStats.cloud || knowledgeStore.indexStats.region">{{ knowledgeStore.indexStats.cloud }} {{ knowledgeStore.indexStats.region }}</template>
                          <template v-else>—</template>
                        </span>
                      </div>
                      <div class="stat-item-inline">
                        <span class="stat-label">{{ t('knowledge.type') }}</span>
                        <span class="stat-value">{{ knowledgeStore.indexStats.vectorType || 'Dense' }}</span>
                      </div>
                      <div class="stat-item-inline">
                        <span class="stat-label">{{ t('knowledge.dimension') }}</span>
                        <span class="stat-value">{{ knowledgeStore.indexStats.dimension }}</span>
                      </div>
                      <div class="stat-item-inline">
                        <span class="stat-label">{{ t('knowledge.metric') }}</span>
                        <span class="stat-value">{{ knowledgeStore.indexStats.metric }}</span>
                      </div>
                      <div class="stat-item-inline" v-if="currentIndexConfig">
                        <span class="stat-label">{{ t('knowledge.embedding') }}</span>
                        <span class="stat-value" style="font-size: var(--fs-caption);">
                          {{ currentIndexConfig.embeddingProvider === 'openrouter' ? 'OpenRouter' : 'OpenAI' }}
                          / {{ currentIndexConfig.embeddingModel }}
                        </span>
                      </div>
                    </div>
                    <div v-if="knowledgeStore.indexStats.host" class="index-host-row">
                      <span class="stat-label">{{ t('knowledge.host') }}</span>
                      <span class="stat-value font-mono" style="font-size: var(--fs-caption); word-break: break-all;">{{ knowledgeStore.indexStats.host }}</span>
                    </div>
                  </template>
                  <div v-else class="hint">{{ t('knowledge.loadingIndexDetails') }}</div>

                  <!-- Sources in index -->
                  <div class="index-sources-section">
                    <div class="index-sources-header">
                      <span class="stat-label">{{ t('knowledge.sourcesInIndex') }}</span>
                      <span v-if="knowledgeStore.isLoadingSources" class="hint" style="margin: 0;">{{ t('knowledge.loading') }}</span>
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
                        <span class="source-badge-count">{{ src.chunks }} {{ t('knowledge.chunks') }}</span>
                        <button class="source-delete-btn" @click.stop="confirmDeleteSource(src)" :disabled="isDeletingSource">
                          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                      </span>
                    </div>
                    <div v-else-if="!knowledgeStore.isLoadingSources" class="hint" style="margin-top: 4px;">
                      {{ t('knowledge.noSourcesFound') }}
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
                    <h3 class="form-section-title">{{ t('knowledge.testRag') }}</h3>
                  </div>
                  <div class="form-group" style="margin-bottom:0;">
                    <div class="test-rag-row">
                      <input
                        v-model="testQuery"
                        type="text"
                        class="field"
                        :placeholder="t('knowledge.enterTestQuery')"
                        @keydown.enter="runTestQuery"
                      />
                      <AppButton @click="runTestQuery" :disabled="!testQuery.trim() || testQueryLoading" :loading="testQueryLoading" size="compact">
                        {{ t('knowledge.search') }}
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
                        <span class="rag-result-score">{{ t('knowledge.score') }}: {{ match.score?.toFixed(4) }}</span>
                        <span v-if="match.documentName" class="rag-result-source">{{ match.documentName }}</span>
                      </div>
                      <p class="rag-result-text">{{ match.text }}</p>
                    </div>
                  </div>
                  <div v-else-if="testQuerySearched && !testQueryLoading && !testQueryError" class="test-rag-empty">
                    <p class="hint">{{ t('knowledge.noMatchingChunks') }}</p>
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
              <h2 class="modal-title">{{ t('knowledge.documentSummary') }}</h2>
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
              <p class="hint">{{ t('knowledge.loadingSummary') }}</p>
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
      :visible="!!deleteSourceTarget"
      :title="t('knowledge.deleteSource')"
      :message="t('knowledge.deleteSourceConfirm', { name: deleteSourceTarget.name })"
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useKnowledgeStore } from '../stores/knowledge'
import { useModelsStore } from '../stores/models'
import { useConfigStore } from '../stores/config'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import AppButton from '../components/common/AppButton.vue'
import ComboBox from '../components/common/ComboBox.vue'
import { useI18n } from '../i18n/useI18n'

const knowledgeStore = useKnowledgeStore()
const modelsStore = useModelsStore()
const configStore = useConfigStore()
const { t } = useI18n()

onMounted(async () => {
  if (knowledgeStore.connectionStatus === 'disconnected') {
    await refreshAll()
  }
  // Sync embedding config from the already-selected index (if any)
  const selectedIndex = knowledgeStore.pineconeIndexName
  if (selectedIndex) {
    const cfg = knowledgeStore.getIndexConfig(selectedIndex)
    if (cfg && cfg.embeddingProvider) {
      knowledgeStore.embeddingProvider = cfg.embeddingProvider
      knowledgeStore.embeddingModel = cfg.embeddingModel || knowledgeStore.embeddingModel
    }
  }
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
const embeddingError = ref(null)
const embeddingSaving = ref(false)

// True when no model is selected, or the selection differs from the recorded index config
const embeddingModelMismatch = computed(() => {
  if (!knowledgeStore.embeddingModel) return true
  const cfg = currentIndexConfig.value
  if (!cfg || !cfg.embeddingModel) return false
  return (
    knowledgeStore.embeddingModel !== cfg.embeddingModel ||
    knowledgeStore.embeddingProvider !== cfg.embeddingProvider
  )
})

async function saveEmbeddingConfig() {
  const indexName = knowledgeStore.pineconeIndexName
  if (!indexName) return
  embeddingSaving.value = true
  try {
    await knowledgeStore.saveIndexEmbeddingConfig(indexName)
  } finally {
    embeddingSaving.value = false
  }
}

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
  embeddingError.value = null
  knowledgeStore.embeddingProvider = provider
  await fetchEmbeddingModels(provider)
  // If current model isn't valid for this provider, pick the first available
  const currentModel = knowledgeStore.embeddingModel
  const available = embeddingModelOptions.value
  if (!available.some(m => m.id === currentModel) && available.length > 0) {
    knowledgeStore.embeddingModel = available[0].id
  }
}

function onEmbeddingModelChange(modelId) {
  embeddingError.value = null
  knowledgeStore.embeddingModel = modelId
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
    return `${t('knowledge.connected')} — ${count} ${t('knowledge.indexes')}`
  }
  if (s === 'connecting') return t('knowledge.connecting')
  if (s === 'error') return knowledgeStore.connectionError || t('knowledge.error')
  return t('knowledge.notConnected')
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
  embeddingError.value = null
  await knowledgeStore.selectIndex(indexName)

  const cfg = knowledgeStore.getIndexConfig(indexName)
  if (cfg && cfg.embeddingProvider) {
    // Sync dropdowns to this index's recorded config
    const provider = cfg.embeddingProvider
    knowledgeStore.embeddingProvider = provider
    await fetchEmbeddingModels(provider)
    knowledgeStore.embeddingModel = cfg.embeddingModel || knowledgeStore.embeddingModel
    // Warn only if model is recorded but not found in the provider's list
    const available = embeddingModelOptions.value
    if (cfg.embeddingModel && available.length > 0 && !available.some(m => m.id === cfg.embeddingModel)) {
      embeddingError.value = `Recorded model "${cfg.embeddingModel}" was not found in the model list.`
    }
  }
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

function onKeydown(e) {
  if (e.key === 'Escape' && inspectDoc.value) inspectDoc.value = null
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════
   KNOWLEDGE PAGE — Matches ConfigView design language
   ══════════════════════════════════════════════════════════════════════════ */

.knowledge-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-main); }

/* ── Header ──────────────────────────────────────────────────────────────── */
.knowledge-header { padding: 1.5rem 2rem 1.25rem; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.knowledge-header-top { display: flex; align-items: flex-start; justify-content: space-between; }
.knowledge-title { font-family: 'Inter', sans-serif; font-size: var(--fs-page-title); font-weight: 700; color: var(--text-primary); margin: 0; }
.knowledge-subtitle { font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: var(--text-secondary); margin: 0.25rem 0 0 0; }
.header-actions { display: flex; align-items: center; gap: 0.5rem; }
.catalog-count-badge {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  line-height: 1.4;
}

/* ── Content area ────────────────────────────────────────────────────────── */
.knowledge-content { flex: 1; overflow-y: auto; padding: 1.5rem 2rem 2rem; scrollbar-width: thin; }
.knowledge-content-inner { max-width: 75rem; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem; }

/* ── Embedding config (per-index card, above index info) ─────────────────── */
.embedding-index-card { padding: 0.875rem 1.25rem; }
.embedding-index-row {
  display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
}
.embedding-index-row > :last-child { margin-left: auto; }
.embedding-rag-left {
  display: flex; align-items: center; gap: 0.625rem; flex-shrink: 0;
}
.embedding-field {
  display: flex; align-items: center; gap: 0.5rem;
}
.embedding-provider-field { min-width: 180px; max-width: 260px; }
.embedding-model-field {
  flex: 1; min-width: 200px; max-width: 360px;
}
.form-label-inline {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  color: var(--text-muted); white-space: nowrap;
}
.embedding-msg {
  display: flex; align-items: center; gap: 0.375rem; margin-top: 0.625rem;
  padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 500;
  line-height: 1.4;
}
.embedding-msg-error {
  background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.2);
  color: #FF3B30;
}
.embedding-msg-warning {
  background: rgba(255, 149, 0, 0.08); border: 1px solid rgba(255, 149, 0, 0.2);
  color: #FF9500;
}
.embedding-msg .icon-xs { flex-shrink: 0; }

/* ── Top bar (connection status + RAG switch) ────────────────────────── */
.top-bar-card { padding: 0.875rem 1.25rem; }
.top-bar-row {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
}
.status-right { display: flex; align-items: center; gap: 0.5rem; }

/* ── Config card (reuses ConfigView pattern) ─────────────────────────────── */
.config-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}

/* ── Status elements ─────────────────────────────────────────────────────── */
.status-label { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600; color: var(--text-primary); }
.status-dot {
  width: 0.5rem; height: 0.5rem; border-radius: 50%; flex-shrink: 0;
}
.dot-connected { background: var(--accent); }
.dot-error { background: #FF3B30; }
.dot-warning { background: #FF9500; }
.dot-idle { background: #D1D1D6; }

/* ── Form elements (matches ConfigView) ──────────────────────────────────── */
.form-group { margin-bottom: 1rem; }
.form-group:last-child { margin-bottom: 0; }
.form-label { display: block; margin-bottom: 0.375rem; font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 500; color: var(--text-secondary); }
.form-divider { height: 1px; background: var(--border); margin: 1rem 0; }
.form-section-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.section-icon-sm { width: 1.75rem; height: 1.75rem; border-radius: 0.4375rem; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #FFFFFF; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); }
.form-section-title { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600; color: var(--text-primary); margin: 0; }
.hint { margin-top: 0.25rem; color: var(--text-muted); font-family: 'Inter', sans-serif; font-size: var(--fs-caption); }
.test-connection-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }


/* ── Index stats row (single horizontal line) ────────────────────────────── */
.index-stats-row {
  display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
}
.stat-item-inline {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.375rem 0.75rem; border-radius: var(--radius-sm);
  background: var(--bg-main); border: 1px solid var(--border-light);
  white-space: nowrap;
}
.stat-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 700;
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
  display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.625rem;
  padding: 0.375rem 0.75rem; border-radius: var(--radius-sm);
  background: var(--bg-main); border: 1px solid var(--border-light);
}

/* ── Sources in index ─────────────────────────────────────────────────────── */
.index-sources-section {
  margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-light);
}
.index-sources-header {
  display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;
}
.index-sources-list {
  display: flex; flex-wrap: wrap; gap: 0.375rem;
}
.source-badge {
  display: inline-flex; align-items: center; gap: 0.3125rem;
  padding: 0.25rem 0.625rem; border-radius: var(--radius-sm);
  background: var(--bg-main); border: 1px solid var(--border-light);
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 500;
  color: var(--text-primary);
}
.source-badge .icon-xs { color: var(--text-muted); }
.source-badge-count {
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-small); font-weight: 600;
  color: var(--text-muted); margin-left: 2px;
}
.source-delete-btn {
  display: flex; align-items: center; justify-content: center;
  width: 1rem; height: 1rem; border-radius: 50%; border: none; padding: 0;
  background: transparent; color: var(--text-muted); cursor: pointer;
  transition: all 0.12s ease; margin-left: 0.125rem;
}
.source-delete-btn:hover { background: rgba(255, 59, 48, 0.15); color: #FF3B30; }
.source-delete-btn:disabled { opacity: 0.3; cursor: not-allowed; }

@media (max-width: 600px) {
  .index-stats-row { gap: 0.5rem; }
}

/* ── Index two-panel layout ──────────────────────────────────────────────── */
.index-layout {
  display: grid; grid-template-columns: 16.25rem 1fr; gap: 1.25rem; align-items: stretch;
}
@media (max-width: 900px) {
  .index-layout { grid-template-columns: 1fr; }
}

/* ── Index list panel (left) ─────────────────────────────────────────────── */
.index-list-panel { padding: 1rem; display: flex; flex-direction: column; height: 100%; }
.index-list-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-shrink: 0;
}
.index-list {
  display: flex; flex-direction: column; gap: 0.125rem;
  flex: 1; overflow-y: auto; scrollbar-width: thin;
}
.index-list-item {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  width: 100%; padding: 0.625rem 0.75rem; border-radius: var(--radius-sm);
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
  flex-shrink: 0; padding: 0.125rem 0.5rem; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.chip-enabled, .chip-disabled {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.chip-disabled { opacity: 0.45; }

/* ── Index detail panel (right) ──────────────────────────────────────────── */
.index-detail-panel {
  display: flex; flex-direction: column; gap: 1.25rem;
}
.detail-header-row {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem;
}
.detail-header-left {
  display: flex; align-items: center; gap: 0.625rem; min-width: 0;
}
.detail-enable-switch {
  display: flex; align-items: center; gap: 0.5rem; margin-left: 0.5rem;
}

/* ── Link styled as button (for router-link) ─────────────────────────────── */
.btn-primary {
  display: flex; align-items: center; gap: 0.4375rem; padding: 0.375rem 0.75rem; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #FFFFFF;
  border: none; cursor: pointer; transition: all 0.15s ease; text-decoration: none;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); flex-shrink: 0;
}
.btn-primary:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }

/* ── Switch row ──────────────────────────────────────────────────────────── */
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.switch-info { display: flex; flex-direction: column; gap: 0.125rem; }
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
  position: relative; width: 2.75rem; height: 1.5rem; border-radius: 0.75rem; border: none;
  background: #D1D1D6; cursor: pointer; transition: background 0.2s ease; flex-shrink: 0; padding: 0;
}
.switch-track.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
}
.switch-thumb {
  position: absolute; top: 0.125rem; left: 0.125rem;
  width: 1.25rem; height: 1.25rem; border-radius: 50%;
  background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.2s ease;
}
.switch-track.active .switch-thumb { transform: translateX(1.25rem); }
.switch-track:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Icon sizes ──────────────────────────────────────────────────────────── */
.icon-sm { width: 1.125rem; height: 1.125rem; flex-shrink: 0; }
.icon-xs { width: 0.875rem; height: 0.875rem; flex-shrink: 0; }
.icon-lg { width: 1.75rem; height: 1.75rem; flex-shrink: 0; }

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-state-card {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: 3rem 1.5rem;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}
.empty-icon-wrap {
  width: 4rem; height: 4rem; border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center; margin-bottom: 1rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.empty-icon { width: 2rem; height: 2rem; color: #fff; }
.empty-title { font-family: 'Inter', sans-serif; font-size: var(--fs-section); font-weight: 700; color: var(--text-primary); margin: 0 0 0.5rem; }
.empty-desc { font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: var(--text-muted); line-height: 1.6; margin: 0 0 1.25rem; max-width: 22.5rem; }

/* ── Toast ────────────────────────────────────────────────────────────────── */
.upload-toast {
  position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1.125rem;
  border-radius: var(--radius-md); font-family: 'Inter', sans-serif;
  font-size: var(--fs-body); font-weight: 500; z-index: 200;
  animation: toast-in 0.3s ease; box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.toast-success { background: rgba(0,122,255,0.95); color: #fff; }
.toast-error { background: rgba(255,59,48,0.95); color: #fff; }
.toast-close { background: none; border: none; cursor: pointer; color: inherit; padding: 0.125rem; }
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
  padding: 1rem 1.25rem; border-bottom: 1px solid #1F1F1F;
}
.modal-header-left { display: flex; align-items: center; gap: 0.625rem; }
.modal-title { font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle); font-weight: 700; color: #FFFFFF; margin: 0; }
.modal-close {
  width: 2rem; height: 2rem; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280;
  cursor: pointer; transition: all 0.15s;
}
.modal-close:hover { background: #1F1F1F; color: #FFFFFF; }
.modal-body { flex: 1; overflow-y: auto; padding: 1.5rem; scrollbar-width: thin; scrollbar-color: #333 transparent; }
.modal-loading { text-align: center; padding: 1.5rem 0; color: #4B5563; }

/* Inspect rows */
.inspect-row { margin-bottom: 1rem; }
.inspect-label {
  display: block; font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 700;
  color: #4B5563; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.25rem;
}
.inspect-value { display: block; font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: #D1D5DB; margin: 0; }
.inspect-chunks { display: flex; flex-direction: column; gap: 0.5rem; }
.inspect-chunk {
  padding: 0.625rem 0.875rem; border-radius: var(--radius-sm);
  background: #1A1A1A; border: 1px solid #2A2A2A;
}
.inspect-chunk-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 700;
  color: #4B5563; text-transform: uppercase;
}
.inspect-chunk-text {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #9CA3AF;
  margin: 0.25rem 0 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}

/* ── Input field (scoped override for black style) ──────────────────── */
.field {
  width: 100%; display: block; padding: 0.5625rem 0.75rem; border-radius: var(--radius-sm);
  background: var(--bg-card); border: 1.5px solid var(--text-primary); color: var(--text-primary);
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field::placeholder { color: var(--text-muted); }
.field:focus { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08); }

/* ── Test RAG section ────────────────────────────────────────────────── */
.test-rag-row { display: flex; align-items: center; gap: 0.5rem; }
.test-rag-row .field { flex: 1; }
.test-rag-error {
  margin-top: 0.75rem; padding: 0.625rem 0.875rem; border-radius: var(--radius-sm);
  background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.2);
  color: #FF3B30; font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
}
.test-rag-results { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }
.rag-result-item {
  padding: 0.75rem 0.875rem; border-radius: var(--radius-sm);
  background: var(--bg-main); border: 1px solid var(--border-light);
}
.rag-result-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.375rem; flex-wrap: wrap; }
.rag-result-rank {
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-caption); font-weight: 700;
  color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border);
  padding: 0.0625rem 0.375rem; border-radius: 0.25rem;
}
.rag-result-score {
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-caption); font-weight: 600;
  color: #059669;
}
.rag-result-source {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 500;
  color: var(--text-muted); margin-left: auto;
}
.rag-result-text {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: var(--text-secondary);
  margin: 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
  max-height: 120px; overflow-y: auto;
}
.test-rag-empty { padding: 0.75rem 0 0; }

/* ── Reduced motion ──────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .doc-item { transition: none; }
}
</style>
