<template>
  <div class="knowledge-page">

    <!-- Header -->
    <div class="knowledge-header">
      <div class="knowledge-header-top">
        <div>
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <h1 class="knowledge-title">{{ t('knowledge.title') }}</h1>
            <span class="catalog-count-badge">{{ knowledgeStore.knowledgeBases.length }}</span>
            <span class="catalog-assignment-hint">
              <svg class="catalog-assignment-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span class="catalog-assignment-hint-text">{{ t('knowledge.needsAssignmentInfo') }}</span>
              <router-link to="/agents" class="catalog-assignment-hint-link">{{ t('common.goAssign') }} &rarr;</router-link>
            </span>
          </div>
          <p class="knowledge-subtitle">
            {{ t('knowledge.subtitle') }}
          </p>
        </div>
        <div class="header-actions">
          <AppButton size="icon" @click="refreshAll" :disabled="isRefreshing" :loading="isRefreshing" v-tooltip="t('common.refresh')">
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

        <!-- RAG toggle + Create button row -->
        <div class="config-card top-bar-card">
          <div class="top-bar-row">
            <div class="embedding-rag-left">
              <span class="switch-title">RAG</span>
              <button class="switch-track" :class="{ active: knowledgeStore.ragEnabled }" @click="toggleRag">
                <span class="switch-thumb"></span>
              </button>
              <span class="switch-label-text">{{ knowledgeStore.ragEnabled ? t('knowledge.on') : t('knowledge.off') }}</span>
              <span v-if="saveMsg" class="save-msg" :class="saveMsg.ok ? 'save-ok' : 'save-err'">{{ saveMsg.text }}</span>
            </div>
            <AppButton size="compact" @click="addMethodOpen = true" :disabled="!knowledgeStore.modelReady">
              <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {{ t('knowledge.createKnowledgeBase') }}
            </AppButton>
          </div>
        </div>

        <!-- Model not ready — redirect to config (mirrors voice pattern) -->
        <div v-if="!knowledgeStore.modelReady && !knowledgeStore.modelChecking" class="empty-state-card">
          <div class="empty-icon-wrap">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <h2 class="empty-title">{{ t('knowledge.embeddingModel') }}</h2>
          <p class="empty-desc">{{ t('knowledge.modelRequired') }}</p>
          <router-link to="/config?tab=knowledge" class="btn-primary compact" style="margin-top:1rem; display:inline-flex; align-items:center; gap:0.35rem; text-decoration:none;">
            {{ t('common.goToConfig') }}
            <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </router-link>
        </div>

        <!-- Main two-panel layout (only when model ready) -->
        <template v-if="knowledgeStore.modelReady">

          <div class="index-layout">

            <!-- Left: KB list -->
            <div class="index-list-panel config-card">
              <div class="index-list-header">
                <h3 class="form-section-title">{{ t('nav.knowledge') }}</h3>
                <span class="hint" style="margin:0;">{{ knowledgeStore.knowledgeBases.length }}</span>
              </div>
              <div v-if="knowledgeStore.isLoading" class="hint" style="padding:0.75rem 0;">{{ t('knowledge.loading') }}</div>
              <div v-else-if="knowledgeStore.knowledgeBases.length === 0">
                <EmptyStateGuide
                  compact
                  :title="t('knowledge.title')"
                  :description="t('knowledge.emptyGuideDesc')"
                  :useCases="[t('knowledge.emptyGuideUseCase1'), t('knowledge.emptyGuideUseCase2')]"
                  :ctaLabel="t('knowledge.createViaChat')"
                  @create="startChatGuide(t('knowledge.emptyGuideChatMsg'), t('knowledge.title'))"
                />
              </div>
              <div v-else class="index-list">
                <button
                  v-for="(kb, idx) in knowledgeStore.knowledgeBases"
                  :key="kb.id"
                  class="index-list-item"
                  :class="{ selected: knowledgeStore.selectedKbId === kb.id }"
                  @click="onSelectKb(kb.id)"
                >
                  <div class="index-item-info">
                    <span class="index-item-name">{{ kb.name }}</span>
                    <span class="index-item-meta">{{ kb.documentCount || 0 }} {{ t('knowledge.knowledgeDocuments').toLowerCase() }}</span>
                  </div>
                  <AgentUsageChip :agents="kbUsageAgents[kb.id] || []" :gradient="cardGradient(idx)" />
                  <span
                    class="index-enabled-chip"
                    :class="isKbEnabled(kb.id) ? 'chip-enabled' : 'chip-disabled'"
                    @click.stop="toggleKbEnabled(kb.id)"
                  >{{ isKbEnabled(kb.id) ? t('knowledge.on') : t('knowledge.off') }}</span>
                </button>
              </div>
            </div>

            <!-- Right: KB detail -->
            <div class="index-detail-panel">

              <!-- No KB selected -->
              <div v-if="!knowledgeStore.selectedKbId" class="config-card" style="text-align:center; padding:3rem 1.5rem;">
                <p class="hint" style="margin:0;">{{ t('knowledge.selectKbHint') }}</p>
              </div>

              <!-- KB detail card -->
              <template v-else>
                <div class="config-card">
                  <!-- Header row: name + enable switch + upload button -->
                  <div class="detail-header-row">
                    <div class="detail-header-left">
                      <div class="section-icon-sm">
                        <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <ellipse cx="12" cy="5" rx="9" ry="3"/>
                          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                        </svg>
                      </div>
                      <h3 class="form-section-title">{{ selectedKb?.name }}</h3>
                      <div class="detail-enable-switch">
                        <span class="form-label-inline">RAG</span>
                        <button
                          class="switch-track"
                          :class="{ active: isKbEnabled(knowledgeStore.selectedKbId) }"
                          @click="toggleKbEnabled(knowledgeStore.selectedKbId)"
                        >
                          <span class="switch-thumb"></span>
                        </button>
                      </div>
                    </div>
                    <AppButton size="compact" @click="pickAndUploadFiles" :disabled="knowledgeStore.isUploading" :loading="knowledgeStore.isUploading">
                      <svg v-if="!knowledgeStore.isUploading" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      {{ knowledgeStore.isUploading ? t('knowledge.uploading') : t('knowledge.upload') }}
                    </AppButton>
                  </div>

                  <!-- KB info stats -->
                  <div class="index-stats-row">
                    <div v-if="selectedKb?.description" class="stat-item-inline" style="flex-basis:100%;">
                      <span class="stat-label">{{ t('knowledge.knowledgeDescription') }}</span>
                      <span class="stat-value">{{ selectedKb.description }}</span>
                    </div>
                    <div class="stat-item-inline">
                      <span class="stat-label">{{ t('knowledge.knowledgeDocuments') }}</span>
                      <span class="stat-value">{{ selectedKb?.documentCount || 0 }}</span>
                    </div>
                    <div class="stat-item-inline">
                      <span class="stat-label">{{ t('knowledge.createdAt') }}</span>
                      <span class="stat-value">{{ formatDate(selectedKb?.createdAt) }}</span>
                    </div>
                  </div>

                  <!-- Upload progress -->
                  <div v-if="knowledgeStore.uploadProgress" style="margin-top:0.75rem;">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                      <div style="flex:1; height:4px; background:var(--c-border); border-radius:2px; overflow:hidden;">
                        <div
                          style="height:100%; background:linear-gradient(135deg, #0F0F0F, #374151); transition:width 0.3s;"
                          :style="{ width: uploadProgressPct + '%' }"
                        ></div>
                      </div>
                      <span style="font-size:var(--fs-small); color:var(--c-text-muted); min-width:3rem; text-align:right;">{{ uploadProgressPct }}%</span>
                    </div>
                    <p class="hint">{{ uploadProgressLabel }}</p>
                  </div>

                  <!-- Documents section -->
                  <div class="index-sources-section">
                    <div class="index-sources-header">
                      <span class="stat-label">{{ t('knowledge.knowledgeDocuments') }}</span>
                      <span v-if="knowledgeStore.isLoadingDocs" class="hint" style="margin:0;">{{ t('knowledge.loading') }}</span>
                    </div>
                    <div v-if="knowledgeStore.documents.length > 0" class="doc-list">
                      <div
                        v-for="doc in knowledgeStore.documents"
                        :key="doc.id"
                        class="doc-item"
                      >
                        <div class="doc-item-left">
                          <svg class="icon-xs" style="color:var(--text-muted); flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          <div class="doc-item-info">
                            <span class="doc-item-name">{{ doc.name }}</span>
                            <span class="doc-item-meta">
                              <span v-if="doc.type" class="doc-type-badge">{{ doc.type }}</span>
                              {{ doc.chunkCount || 0 }} {{ t('knowledge.knowledgeChunks').toLowerCase() }}
                              <template v-if="doc.uploadedAt"> &middot; {{ formatDate(doc.uploadedAt) }}</template>
                            </span>
                          </div>
                        </div>
                        <div class="doc-item-actions">
                          <button class="doc-inspect-btn" @click="inspectDocument(doc)" v-tooltip="t('knowledge.documentSummary')">
                            <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                            </svg>
                          </button>
                          <button class="source-delete-btn" @click="confirmDeleteDoc(doc)" v-tooltip="t('knowledge.deleteDocument')">
                            <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div v-else-if="!knowledgeStore.isLoadingDocs" class="hint" style="margin-top:4px;">
                      {{ t('knowledge.noKnowledgeHint') }}
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
                    <div v-for="(match, idx) in testQueryResults" :key="idx" class="rag-result-item">
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

                <!-- Delete KB button -->
                <div style="display:flex; justify-content:flex-end;">
                  <AppButton variant="danger-ghost" size="compact" @click="confirmDeleteKb">
                    <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    {{ t('knowledge.deleteKnowledgeBase') }}
                  </AppButton>
                </div>

              </template>
            </div>

          </div>

        </template>

      </div>
    </div>

    <!-- Refresh toast -->
    <Teleport to="body">
      <Transition name="toast-fade">
        <div v-if="refreshToast" class="page-toast">
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          {{ refreshToast }}
        </div>
      </Transition>
    </Teleport>

    <!-- Upload result toast -->
    <div v-if="uploadResult" class="upload-toast" :class="uploadResult.success ? 'toast-success' : 'toast-error'">
      <svg v-if="uploadResult.success" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{{ uploadResult.message }}</span>
      <button @click="uploadResult = null" class="toast-close">
        <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>

    <!-- Create KB Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-backdrop">
        <div class="modal-container" style="width:min(440px, 95vw);">
          <div class="modal-header">
            <div class="modal-header-left">
              <div class="section-icon-sm">
                <svg class="icon-xs" style="color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <h2 class="modal-title">{{ t('knowledge.createKnowledgeBase') }}</h2>
            </div>
            <button class="modal-close" @click="closeCreateModal">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">{{ t('knowledge.knowledgeName') }} *</label>
              <input
                v-model="createForm.name"
                type="text"
                class="field"
                :placeholder="t('knowledge.knowledgeName')"
                @keydown.enter="submitCreateKb"
              />
              <p v-if="createFormError" class="hint" style="color:#FF3B30; margin-top:0.25rem;">{{ createFormError }}</p>
            </div>
            <div class="form-group">
              <label class="form-label">{{ t('knowledge.knowledgeDescription') }}</label>
              <input
                v-model="createForm.description"
                type="text"
                class="field"
                :placeholder="t('knowledge.knowledgeDescription')"
              />
            </div>
          </div>
          <div class="modal-footer">
            <AppButton variant="secondary" size="compact" @click="closeCreateModal">{{ t('common.cancel') }}</AppButton>
            <AppButton size="compact" @click="submitCreateKb" :disabled="isCreatingKb" :loading="isCreatingKb">{{ t('common.save') }}</AppButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Inspect Document Modal -->
    <Teleport to="body">
      <div v-if="inspectDoc" class="modal-backdrop">
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
              <div v-if="inspectDoc.size" class="inspect-row">
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

    <!-- Confirm Delete Document Modal -->
    <ConfirmModal
      v-if="deleteDocTarget"
      :visible="!!deleteDocTarget"
      :title="t('knowledge.deleteDocument')"
      :message="t('knowledge.deleteDocumentConfirm', { name: deleteDocTarget.name })"
      confirm-text="Delete"
      confirm-class="primary"
      :loading="isDeletingDoc"
      loading-text="Deleting..."
      @confirm="executeDeleteDoc"
      @close="deleteDocTarget = null"
    />

    <!-- Confirm Delete KB Modal -->
    <ConfirmModal
      v-if="deleteKbTarget"
      :visible="!!deleteKbTarget"
      :title="t('knowledge.deleteKnowledgeBase')"
      :message="t('knowledge.deleteKnowledgeBaseConfirm', { name: deleteKbTarget.name })"
      confirm-text="Delete"
      confirm-class="primary"
      :loading="isDeletingKb"
      loading-text="Deleting..."
      @confirm="executeDeleteKb"
      @close="deleteKbTarget = null"
    />

    <!-- Add KB method picker -->
    <CreateMethodModal
      :visible="addMethodOpen"
      :title="t('knowledge.createKnowledgeBase')"
      :chat-preview="t('knowledge.emptyGuideChatMsg')"
      @chat="startChatGuide(t('knowledge.emptyGuideChatMsg'), t('knowledge.title'))"
      @manual="openCreateKb()"
      @close="addMethodOpen = false"
    />

  </div>

  <!-- Preview limit modal -->
  <PreviewLimitModal
    :visible="showPreviewLimitModal"
    :message="previewLimitMessage"
    @close="showPreviewLimitModal = false"
  />
</template>

<script setup>
defineOptions({ inheritAttrs: false })
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useKnowledgeStore } from '../stores/knowledge'
import { useAgentsStore } from '../stores/agents'
import AgentUsageChip from '../components/common/AgentUsageChip.vue'
import { cardGradient } from '../utils/cardGradients'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import PreviewLimitModal from '../components/common/PreviewLimitModal.vue'
import AppButton from '../components/common/AppButton.vue'
import EmptyStateGuide from '../components/common/EmptyStateGuide.vue'
import CreateMethodModal from '../components/common/CreateMethodModal.vue'
import { useI18n } from '../i18n/useI18n'
import { useChatToCreate } from '../composables/useChatToCreate'
import { PREVIEW_LIMITS, isLimitEnforced } from '../utils/guestLimits'

const knowledgeStore = useKnowledgeStore()
const agentsStore = useAgentsStore()
const { t } = useI18n()

const kbUsageAgents = computed(() => {
  const map = Object.create(null)
  for (const agent of agentsStore.agents || []) {
    for (const kbid of agent.requiredKnowledgeBaseIds || []) {
      if (!map[kbid]) map[kbid] = []
      map[kbid].push(agent)
    }
  }
  return map
})
const { startChatGuide } = useChatToCreate()
const addMethodOpen = ref(false)

// ── Lifecycle ──
onMounted(async () => {
  await knowledgeStore.refresh()
  if (!agentsStore.agents.length) agentsStore.loadAgents()
})

// ── Local state ──
const isRefreshing = ref(false)
const saveMsg = ref(null)
const uploadResult = ref(null)
const refreshToast = ref('')
let refreshToastTimer = null

// Preview limit modal
const showPreviewLimitModal = ref(false)
const previewLimitMessage = ref('')

function openCreateKb() {
  if (isLimitEnforced() && knowledgeStore.knowledgeBases.length >= PREVIEW_LIMITS.maxKnowledgeBases) {
    previewLimitMessage.value = t('limits.maxKnowledgeBases')
    showPreviewLimitModal.value = true
    return
  }
  showCreateModal.value = true
}

// Create KB modal
const showCreateModal = ref(false)
const createForm = ref({ name: '', description: '' })
const createFormError = ref('')
const isCreatingKb = ref(false)

// Inspect doc modal
const inspectDoc = ref(null)
const inspectData = ref(null)
const inspectLoading = ref(false)
const inspectError = ref(null)

// Delete doc
const deleteDocTarget = ref(null)
const isDeletingDoc = ref(false)

// Delete KB
const deleteKbTarget = ref(null)
const isDeletingKb = ref(false)

// Test RAG
const testQuery = ref('')
const testQueryLoading = ref(false)
const testQueryResults = ref([])
const testQueryError = ref(null)
const testQuerySearched = ref(false)

// ── Computed ──
const selectedKb = computed(() => {
  if (!knowledgeStore.selectedKbId) return null
  return knowledgeStore.knowledgeBases.find(kb => kb.id === knowledgeStore.selectedKbId) || null
})

const uploadProgressPct = computed(() => {
  const p = knowledgeStore.uploadProgress
  if (!p || !p.total) return 0
  return Math.round((p.current / p.total) * 100)
})

const uploadProgressLabel = computed(() => {
  const p = knowledgeStore.uploadProgress
  if (!p) return ''
  if (p.documentName) return `${p.stage || ''} ${p.documentName} (${p.current}/${p.total})`.trim()
  return t('knowledge.uploadProgress', { current: p.current || 0, total: p.total || 0 })
})

// ── RAG toggle ──
async function toggleRag() {
  knowledgeStore.ragEnabled = !knowledgeStore.ragEnabled
  saveMsg.value = null
  try {
    await knowledgeStore.saveConfig()
    saveMsg.value = { ok: true, text: 'Saved' }
  } catch {
    saveMsg.value = { ok: false, text: 'Failed' }
  }
  setTimeout(() => { saveMsg.value = null }, 2500)
}

// ── Refresh ──
async function refreshAll() {
  isRefreshing.value = true
  try {
    await knowledgeStore.refresh()
    refreshToast.value = t('common.dataRefreshed')
    if (refreshToastTimer) clearTimeout(refreshToastTimer)
    refreshToastTimer = setTimeout(() => { refreshToast.value = '' }, 2000)
  } finally {
    isRefreshing.value = false
  }
}

// ── KB selection ──
function onSelectKb(kbId) {
  testQuery.value = ''
  testQueryResults.value = []
  testQueryError.value = null
  testQuerySearched.value = false
  knowledgeStore.selectKnowledgeBase(kbId)
}

// ── KB enabled toggle ──
function isKbEnabled(kbId) {
  const cfg = knowledgeStore.kbConfigs[kbId]
  return cfg?.enabled !== false
}

async function toggleKbEnabled(kbId) {
  const current = isKbEnabled(kbId)
  await knowledgeStore.toggleKbEnabled(kbId, !current)
}

// ── Create KB ──
function closeCreateModal() {
  showCreateModal.value = false
  createForm.value = { name: '', description: '' }
  createFormError.value = ''
}

async function submitCreateKb() {
  const name = createForm.value.name.trim()
  if (!name) {
    createFormError.value = t('knowledge.nameRequired')
    return
  }
  isCreatingKb.value = true
  createFormError.value = ''
  try {
    const kb = await knowledgeStore.createKnowledgeBase(name, createForm.value.description.trim())
    if (kb) {
      closeCreateModal()
      knowledgeStore.selectKnowledgeBase(kb.id)
    } else {
      createFormError.value = t('knowledge.error')
    }
  } catch (err) {
    createFormError.value = err.message
  } finally {
    isCreatingKb.value = false
  }
}

// ── Upload files ──
async function pickAndUploadFiles() {
  if (!window.electronAPI?.knowledge?.pickFiles) return
  try {
    const filePaths = await window.electronAPI.knowledge.pickFiles()
    if (!filePaths || filePaths.length === 0) return

    const result = await knowledgeStore.uploadFiles(knowledgeStore.selectedKbId, filePaths)
    if (result.success) {
      const perFile = result.results || []
      const succeeded = perFile.filter(r => r.success)
      const failed = perFile.filter(r => r.error)
      if (failed.length === 0) {
        uploadResult.value = { success: true, message: `Successfully uploaded ${succeeded.length} file(s)` }
      } else if (succeeded.length === 0) {
        const errMsg = failed.map(r => `${r.name}: ${r.error}`).join('; ')
        uploadResult.value = { success: false, message: `Upload failed — ${errMsg}` }
      } else {
        const errMsg = failed.map(r => `${r.name}: ${r.error}`).join('; ')
        uploadResult.value = { success: false, message: `${succeeded.length} uploaded, ${failed.length} failed — ${errMsg}` }
      }
    } else {
      uploadResult.value = { success: false, message: result.error || 'Upload failed' }
    }
    setTimeout(() => { uploadResult.value = null }, 6000)
  } catch (err) {
    uploadResult.value = { success: false, message: err.message }
    setTimeout(() => { uploadResult.value = null }, 6000)
  }
}

// ── Delete document ──
function confirmDeleteDoc(doc) {
  deleteDocTarget.value = doc
}

async function executeDeleteDoc() {
  if (!deleteDocTarget.value || isDeletingDoc.value) return
  isDeletingDoc.value = true
  try {
    await knowledgeStore.deleteDocument(knowledgeStore.selectedKbId, deleteDocTarget.value.id)
  } finally {
    isDeletingDoc.value = false
  }
  deleteDocTarget.value = null
}

// ── Delete KB ──
function confirmDeleteKb() {
  if (!selectedKb.value) return
  deleteKbTarget.value = selectedKb.value
}

async function executeDeleteKb() {
  if (!deleteKbTarget.value || isDeletingKb.value) return
  isDeletingKb.value = true
  try {
    await knowledgeStore.deleteKnowledgeBase(deleteKbTarget.value.id)
  } finally {
    isDeletingKb.value = false
  }
  deleteKbTarget.value = null
}

// ── Test RAG ──
async function runTestQuery() {
  if (!testQuery.value.trim()) return
  testQueryLoading.value = true
  testQueryError.value = null
  testQueryResults.value = []
  testQuerySearched.value = false
  try {
    const result = await knowledgeStore.queryKnowledge(knowledgeStore.selectedKbId, testQuery.value)
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

// ── Inspect document ──
async function inspectDocument(doc) {
  inspectDoc.value = doc
  inspectData.value = null
  inspectError.value = null
  inspectLoading.value = true
  try {
    const result = await knowledgeStore.getDocumentSummary(knowledgeStore.selectedKbId, doc.id)
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

// ── Helpers ──
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
  if (e.key === 'Escape') {
    if (inspectDoc.value) inspectDoc.value = null
    else if (showCreateModal.value) closeCreateModal()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════
   KNOWLEDGE PAGE — Local RAG, matches ConfigView design language
   ══════════════════════════════════════════════════════════════════════════ */

.knowledge-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-main); }

/* ── Header ──────────────────────────────────────────────────────────────── */
.knowledge-header { padding: 1.5rem 2rem 1.25rem; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.knowledge-header-top { display: flex; align-items: flex-start; justify-content: space-between; }
.knowledge-title { font-family: 'Inter', sans-serif; font-size: var(--fs-page-title); font-weight: 700; color: var(--text-primary); margin: 0; }
.knowledge-subtitle { font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: var(--text-secondary); margin: 0.25rem 0 0 0; }
.catalog-assignment-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: #FEF3C7;
  border: 1px solid #FCD34D;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: #92400E;
  line-height: 1.3;
  white-space: nowrap;
}
.catalog-assignment-hint-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: #B45309;
}
.catalog-assignment-hint-text {
  white-space: nowrap;
}
.catalog-assignment-hint-link {
  padding: 0.0625rem 0.375rem;
  margin-left: 0.125rem;
  border-radius: 9999px;
  color: #92400E;
  text-decoration: none;
  font-weight: 600;
  transition: background 0.15s;
}
.catalog-assignment-hint-link:hover {
  background: rgba(180, 83, 9, 0.18);
}
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
.knowledge-content { flex: 1; overflow-y: auto; padding: 1.5rem 2rem 2rem; scrollbar-width: thin; display: flex; flex-direction: column; }
.knowledge-content-inner { max-width: 75rem; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem; flex: 1; width: 100%; }

/* ── Top bar (RAG switch + create button) ────────────────────────── */
.top-bar-card { padding: 0.875rem 1.25rem; }
.top-bar-row {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
}
.embedding-rag-left {
  display: flex; align-items: center; gap: 0.625rem; flex-shrink: 0;
}

/* ── Config card (reuses ConfigView pattern) ─────────────────────────────── */
.config-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}

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
.form-label-inline {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  color: var(--text-muted); white-space: nowrap;
}

/* ── Test result (error display for model setup) ─────────────────────────── */
.test-result {
  display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.625rem 0.875rem;
  border-radius: var(--radius-sm); font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
}
.test-result.error {
  background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.2);
  color: #FF3B30;
}

/* ── Index two-panel layout ──────────────────────────────────────────────── */
.index-layout {
  display: grid; grid-template-columns: 16.25rem 1fr; gap: 1.25rem; align-items: stretch;
  flex: 1; min-height: 0;
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
  text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer;
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

/* ── Index stats row ────────────────────────────────────────────────────── */
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

/* ── Documents section ───────────────────────────────────────────────────── */
.index-sources-section {
  margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-light);
}
.index-sources-header {
  display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;
}

/* ── Document list ───────────────────────────────────────────────────────── */
.doc-list {
  display: flex; flex-direction: column; gap: 0.25rem;
}
.doc-item {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);
  background: var(--bg-main); border: 1px solid var(--border-light);
  transition: background 0.12s ease;
}
.doc-item:hover { background: var(--bg-hover); }
.doc-item-left {
  display: flex; align-items: center; gap: 0.5rem; min-width: 0; flex: 1;
}
.doc-item-info {
  display: flex; flex-direction: column; gap: 1px; min-width: 0;
}
.doc-item-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600;
  color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.doc-item-meta {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); color: var(--text-muted);
  display: flex; align-items: center; gap: 0.375rem;
}
.doc-type-badge {
  display: inline-block; padding: 0.0625rem 0.375rem; border-radius: 0.25rem;
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-small); font-weight: 700;
  color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border);
  text-transform: uppercase;
}
.doc-item-actions {
  display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0;
}
.doc-inspect-btn {
  display: flex; align-items: center; justify-content: center;
  width: 1.5rem; height: 1.5rem; border-radius: var(--radius-sm); border: none; padding: 0;
  background: transparent; color: var(--text-muted); cursor: pointer;
  transition: all 0.12s ease;
}
.doc-inspect-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.source-delete-btn {
  display: flex; align-items: center; justify-content: center;
  width: 1.5rem; height: 1.5rem; border-radius: var(--radius-sm); border: none; padding: 0;
  background: transparent; color: var(--text-muted); cursor: pointer;
  transition: all 0.12s ease;
}
.source-delete-btn:hover { background: rgba(255, 59, 48, 0.15); color: #FF3B30; }
.source-delete-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── Switch row ──────────────────────────────────────────────────────────── */
.switch-title { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600; color: var(--text-primary); }
.switch-label-text { font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600; color: var(--text-muted); }
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

/* ── Spin animation ──────────────────────────────────────────────────────── */
.spin { animation: spin 1s linear infinite; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

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

/* ── Input field (scoped override for black style) ──────────────────── */
.field {
  width: 100%; display: block; padding: 0.5625rem 0.75rem; border-radius: var(--radius-sm);
  background: var(--bg-card); border: 1.5px solid var(--text-primary); color: var(--text-primary);
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field::placeholder { color: var(--text-muted); }
.field:focus { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08); }
select.field { cursor: pointer; }

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

/* ── Page toast ─────────────────────────────────────────────────────────── */
.page-toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: #1C1C1E;
  color: #fff;
  padding: 0.625rem 1rem;
  border-radius: 0.625rem;
  font-size: var(--fs-secondary);
  font-family: 'Inter', sans-serif;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  z-index: 9999;
  white-space: nowrap;
}
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(0.5rem);
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
.modal-body .form-label { color: #9CA3AF; }
.modal-body .field {
  background: #1A1A1A; border-color: #333; color: #D1D5DB;
}
.modal-body .field::placeholder { color: #6B7280; }
.modal-body .field:focus { border-color: #555; box-shadow: 0 0 0 3px rgba(255,255,255,0.05); }
.modal-body .hint { color: #6B7280; }
.modal-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem;
  padding: 0.875rem 1.25rem; border-top: 1px solid #1F1F1F;
}
.modal-loading { text-align: center; padding: 1.5rem 0; color: #4B5563; }

/* ── Inspect rows ──────────────────────────────────────────────────────── */
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

/* ── Reduced motion ──────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .doc-item { transition: none; }
  .spin { animation: none; }
}

@media (max-width: 600px) {
  .index-stats-row { gap: 0.5rem; }
}
</style>
