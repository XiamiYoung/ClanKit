<template>
  <div class="h-full flex flex-col overflow-hidden tools-page">

    <!-- Header -->
    <div class="catalog-header">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <h1 class="catalog-title">{{ t('tools.title') }}</h1>
            <span class="catalog-count-badge">{{ toolsStore.tools.length }}</span>
            <span class="catalog-assignment-hint">
              <svg class="catalog-assignment-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span class="catalog-assignment-hint-text">{{ t('tools.needsAssignmentInfo') }}</span>
              <router-link to="/agents" class="catalog-assignment-hint-link">{{ t('common.goAssign') }} &rarr;</router-link>
            </span>
          </div>
          <p class="catalog-subtitle">
            {{ t('tools.subtitle') }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <AppTooltip :text="t('common.refresh')">
            <AppButton size="icon" @click="refreshTools" :loading="refreshing">
              <svg v-if="!refreshing" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </AppButton>
          </AppTooltip>
          <AppTooltip :text="t('tools.addTool')">
            <AppButton size="icon" @click="openAdd">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </AppButton>
          </AppTooltip>
        </div>
      </div>

      <!-- Search bar -->
      <div class="catalog-search-wrap">
        <svg class="catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('tools.searchTools')"
          class="catalog-search-input"
        />
        <span v-if="searchQuery" class="catalog-search-clear" @click="searchQuery = ''">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </span>
      </div>

      <!-- Category filter tabs -->
      <div class="catalog-filter-tabs">
        <button
          class="catalog-filter-tab"
          :class="{ active: !typeFilter }"
          @click="typeFilter = ''"
        >
          {{ t('tools.all') }}
          <span class="catalog-filter-tab-count">{{ toolsStore.tools.length }}</span>
        </button>
        <button
          class="catalog-filter-tab"
          :class="{ active: typeFilter === 'http' }"
          @click="typeFilter = 'http'"
        >
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          {{ t('tools.http') }}
          <span class="catalog-filter-tab-count">{{ httpCount }}</span>
        </button>
        <button
          class="catalog-filter-tab"
          :class="{ active: typeFilter === 'code' }"
          @click="typeFilter = 'code'"
        >
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          {{ t('tools.code') }}
          <span class="catalog-filter-tab-count">{{ codeCount }}</span>
        </button>
        <button
          class="catalog-filter-tab"
          :class="{ active: typeFilter === 'prompt' }"
          @click="typeFilter = 'prompt'"
        >
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {{ t('tools.prompt') }}
          <span class="catalog-filter-tab-count">{{ promptCount }}</span>
        </button>
        <button
          class="catalog-filter-tab"
          :class="{ active: typeFilter === 'smtp' }"
          @click="typeFilter = 'smtp'"
        >
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          {{ t('tools.smtp') }}
          <span class="catalog-filter-tab-count">{{ smtpCount }}</span>
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="toolsStore.tools.length === 0" class="flex-1 flex items-center justify-center tools-grid-bg">
      <EmptyStateGuide
        :title="t('tools.noTools')"
        :description="t('tools.emptyGuideDesc')"
        :useCases="[t('tools.emptyGuideUseCase1'), t('tools.emptyGuideUseCase2'), t('tools.emptyGuideUseCase3')]"
        :ctaLabel="t('tools.createViaChat')"
        @create="startChatGuide(t('tools.emptyGuideChatMsg'), t('tools.title'))"
      >
        <template #icon>
          <svg style="width:1.5rem;height:1.5rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </template>
      </EmptyStateGuide>
    </div>

    <!-- No search/filter results -->
    <div v-else-if="filteredTools.length === 0" class="flex-1 flex items-center justify-center tools-grid-bg">
      <div class="text-center">
        <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p v-if="searchQuery" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 4px;">{{ t('tools.noToolsMatch', { query: searchQuery }) }}</p>
        <p v-else style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 4px;">{{ t('tools.noTypeTools', { type: typeFilter }) }}</p>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:0;">{{ t('tools.tryDifferentFilter') }}</p>
      </div>
    </div>

    <!-- Tool Grid -->
    <div v-else class="flex-1 overflow-y-auto tools-grid-bg">
      <div style="padding:24px 32px;">
        <div class="tools-grid">
          <div
            v-for="tool in filteredTools"
            :key="tool.id"
            @click="openEdit(tool)"
            class="tools-card"
          >
            <!-- Gradient accent bar -->
            <div class="tools-card-accent"></div>

            <div class="tools-card-body">
              <!-- Icon + title row -->
              <div class="tools-card-title-row">
                <div class="tools-card-icon">
                  <!-- HTTP icon: globe -->
                  <svg v-if="tool.type === 'http' || !tool.type" style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  <!-- Code icon: brackets -->
                  <svg v-else-if="tool.type === 'code'" style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                  <!-- SMTP icon: envelope -->
                  <svg v-else-if="tool.type === 'smtp'" style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <!-- Prompt icon: chat bubble -->
                  <svg v-else style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div style="flex:1;min-width:0;">
                  <h3 class="tools-card-name">{{ toolDisplayName(tool) }}</h3>
                </div>
                <!-- Type badge -->
                <span class="tools-type-badge">
                  {{ typeLabelMap[tool.type || 'http'] }}
                </span>
              </div>

              <!-- Description -->
              <p class="tools-card-desc">{{ toolDisplayDesc(tool) || t('tools.noDescription') }}</p>

              <!-- Footer — adapts by type -->
              <div class="tools-card-footer">
                <div class="tools-card-footer-info">
                  <!-- HTTP footer -->
                  <template v-if="tool.type === 'http' || !tool.type">
                    <span class="tools-card-method">
                      {{ tool.method || 'GET' }}
                    </span>
                    <span class="tools-card-endpoint" :title="tool.endpoint">
                      {{ truncateEndpoint(tool.endpoint) }}
                    </span>
                  </template>
                  <!-- Code footer -->
                  <template v-else-if="tool.type === 'code'">
                    <span class="tools-card-method">
                      {{ (tool.language || 'javascript').toUpperCase().slice(0, 4) }}
                    </span>
                    <span class="tools-card-endpoint">
                      {{ t('tools.lines', { n: (tool.code || '').split('\n').length }) }}
                    </span>
                  </template>
                  <!-- SMTP footer -->
                  <template v-else-if="tool.type === 'smtp'">
                    <span class="tools-card-method">SMTP</span>
                    <span class="tools-card-endpoint">{{ t('tools.viaConfigEmail') }}</span>
                  </template>
                  <!-- Prompt footer -->
                  <template v-else>
                    <span class="tools-card-method">
                      TMPL
                    </span>
                    <span class="tools-card-endpoint">
                      {{ t('tools.chars', { n: (tool.promptText || '').length }) }}
                    </span>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="tools-backdrop">
        <div class="tools-modal" role="dialog" aria-modal="true">
          <!-- Modal header -->
          <div class="tools-modal-header">
            <div class="tools-modal-header-left">
              <div class="tools-modal-header-icon">
                <!-- Dynamic icon based on type -->
                <svg v-if="form.type === 'http'" style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <svg v-else-if="form.type === 'code'" style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
                <svg v-else-if="form.type === 'smtp'" style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                <svg v-else style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h2 class="tools-modal-title">{{ modalTitle }}</h2>
            </div>
            <button class="tools-modal-close" @click="closeModal">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <!-- Modal body -->
          <div class="tools-modal-body">
            <div class="form-group">
              <label class="form-label">{{ t('tools.name') }} *</label>
              <input v-model="form.name" type="text" class="form-input" placeholder="e.g. Weather API" />
              <p class="form-hint">{{ t('tools.nameHint') }}</p>
            </div>

            <div class="form-group">
              <label class="form-label">{{ t('tools.description') }}</label>
              <input v-model="form.description" type="text" class="form-input" :placeholder="t('tools.descriptionHint')" />
            </div>

            <!-- Type selector -->
            <div class="form-group">
              <label class="form-label">{{ t('tools.type') }} *</label>
              <select v-model="form.type" class="form-input">
                <option value="http">{{ t('tools.httpEndpoint') }}</option>
                <option value="code">{{ t('tools.codeSnippet') }}</option>
                <option value="prompt">{{ t('tools.promptTemplate') }}</option>
                <option value="smtp">{{ t('tools.smtpEmail') }}</option>
              </select>
              <p class="form-hint">
                <template v-if="form.type === 'http'">{{ t('tools.typeHintHttp') }}</template>
                <template v-else-if="form.type === 'code'">{{ t('tools.typeHintCode') }}</template>
                <template v-else-if="form.type === 'smtp'">{{ t('tools.typeHintSmtp') }}</template>
                <template v-else>{{ t('tools.typeHintPrompt') }}</template>
              </p>
            </div>

            <!-- ── HTTP-specific fields ─────────────────────────── -->
            <template v-if="form.type === 'http'">
              <div class="form-group">
                <label class="form-label">{{ t('tools.category') }}</label>
                <input v-model="form.category" type="text" class="form-input" placeholder="HTTP, Search, Data, etc." />
                <p class="form-hint">{{ t('tools.categoryHint') }}</p>
              </div>

              <div class="form-row">
                <div class="form-group" style="width:140px;flex-shrink:0;">
                  <label class="form-label">{{ t('tools.method') }} *</label>
                  <select v-model="form.method" class="form-input">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div class="form-group" style="flex:1;">
                  <label class="form-label">{{ t('tools.endpointUrl') }} *</label>
                  <input v-model="form.endpoint" type="text" class="form-input" placeholder="https://api.example.com/v1/resource" />
                </div>
              </div>

              <!-- Headers -->
              <div class="env-section">
                <div class="env-header">
                  <h3 class="env-title">{{ t('tools.headers') }}</h3>
                  <button class="env-add-btn" @click="addHeader">
                    <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    {{ t('tools.add') }}
                  </button>
                </div>

                <div v-if="form.headers.length === 0" class="env-empty">
                  <p>{{ t('tools.headersEmpty') }}</p>
                </div>

                <div v-for="(h, idx) in form.headers" :key="idx" class="env-row">
                  <input v-model="h.key" type="text" class="form-input-sm" placeholder="Header name" style="flex:1;" />
                  <input v-model="h.value" type="text" class="form-input-sm" placeholder="value..." style="flex:2;" />
                  <button class="env-remove-btn" @click="removeHeader(idx)">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              </div>

              <!-- Body Template -->
              <div class="form-group" style="margin-top:16px;">
                <label class="form-label">{{ t('tools.bodyTemplate') }}</label>
                <textarea
                  v-model="form.bodyTemplate"
                  class="form-textarea"
                  rows="4"
                  placeholder='{"query": "{{input}}"}'
                ></textarea>
                <p class="form-hint">{{ t('tools.bodyTemplateHint') }}</p>
              </div>
            </template>

            <!-- ── Code Snippet fields ──────────────────────────── -->
            <template v-else-if="form.type === 'code'">
              <div class="form-group">
                <label class="form-label">{{ t('tools.language') }} *</label>
                <select v-model="form.language" class="form-input">
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="bash">Bash</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">{{ t('tools.codeLabel') }} *</label>
                <textarea
                  v-model="form.code"
                  class="form-textarea form-textarea-code"
                  rows="12"
                  placeholder="// Paste your reference code here..."
                ></textarea>
                <p class="form-hint">{{ t('tools.codeHint') }}</p>
              </div>
            </template>

            <!-- ── SMTP fields ──────────────────────────────────── -->
            <template v-else-if="form.type === 'smtp'">
              <div class="form-group">
                <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;">
                  <svg style="width:16px;height:16px;color:#0284C7;flex-shrink:0;margin-top:1px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <div style="font-size:var(--fs-secondary);color:#0369A1;line-height:1.5;">
                    {{ t('tools.smtpInfo', { config: t('tools.smtpInfoConfig') }) }}
                    <br/>{{ t('tools.smtpAgentFields', { fields: 'to, subject, body, html, cc, bcc, from_name, attachments' }) }}
                  </div>
                </div>
              </div>
            </template>

            <!-- ── Prompt Template fields ───────────────────────── -->
            <template v-else>
              <div class="form-group">
                <label class="form-label">{{ t('tools.promptText') }} *</label>
                <textarea
                  v-model="form.promptText"
                  class="form-textarea"
                  rows="8"
                  placeholder="Write your prompt template or instructions here..."
                ></textarea>
                <p class="form-hint">{{ t('tools.promptTextHint') }}</p>
              </div>
            </template>
          </div>

          <!-- Save error -->
          <div v-if="saveError" class="save-error">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ saveError }}
          </div>

          <!-- Modal footer -->
          <div class="tools-modal-footer">
            <div v-if="editingTool" style="flex:1;">
              <AppButton variant="danger-ghost" @click="confirmDelete">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                {{ t('common.delete') }}
              </AppButton>
            </div>
            <AppButton variant="secondary" size="modal" @click="closeModal">{{ t('common.cancel') }}</AppButton>
            <AppButton size="modal" @click="saveForm" :disabled="!canSave">{{ t('common.save') }}</AppButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Delete Modal -->
    <ConfirmModal
      v-if="showConfirmDelete && editingTool"
      :visible="showConfirmDelete && editingTool"
      :title="t('tools.deleteTool')"
      :message="t('tools.deleteToolConfirm', { name: editingTool.name })"
      :confirm-text="t('common.delete')"
      confirm-class="danger"
      @confirm="executeDelete"
      @close="showConfirmDelete = false"
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useToolsStore } from '../stores/tools'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import PreviewLimitModal from '../components/common/PreviewLimitModal.vue'
import AppButton from '../components/common/AppButton.vue'
import AppTooltip from '../components/common/AppTooltip.vue'
import { useConfigStore } from '../stores/config'
import { useI18n } from '../i18n/useI18n'
import EmptyStateGuide from '../components/common/EmptyStateGuide.vue'
import { useChatToCreate } from '../composables/useChatToCreate'
import { PREVIEW_LIMITS, isLimitEnforced } from '../utils/guestLimits'

const toolsStore = useToolsStore()
const configStore = useConfigStore()
const { t } = useI18n()
const { startChatGuide } = useChatToCreate()
const refreshing = ref(false)
const showPreviewLimitModal = ref(false)
const previewLimitMessage = ref('')

// Resolve display name/description for built-in tools via i18n
function toolDisplayName(tool) {
  if (tool.i18nKey) {
    const k = tool.i18nKey + '.name'
    const v = t(k)
    if (v && v !== k) return v
  }
  return tool.name
}
function toolDisplayDesc(tool) {
  if (tool.i18nKey) {
    const k = tool.i18nKey + '.description'
    const v = t(k)
    if (v && v !== k) return v
  }
  return tool.description
}

const typeLabelMap = computed(() => ({
  http: t('tools.http'),
  code: t('tools.code'),
  prompt: t('tools.prompt'),
  smtp: t('tools.smtp'),
}))

async function refreshTools() {
  refreshing.value = true
  try {
    await toolsStore.loadTools()
  } finally {
    refreshing.value = false
  }
}

onMounted(async () => {
  await toolsStore.loadTools()
})

const searchQuery = ref('')
const typeFilter = ref('')
const showModal = ref(false)
const editingTool = ref(null)
const saveError = ref('')

const form = ref(emptyForm())

function emptyForm() {
  return {
    name: '',
    description: '',
    category: '',
    type: 'http',
    // HTTP
    method: 'GET',
    endpoint: '',
    headers: [],
    bodyTemplate: '{}',
    // Code
    language: 'javascript',
    code: '',
    // Prompt
    promptText: '',
  }
}

// Type counts
const httpCount = computed(() => toolsStore.tools.filter(t => (t.type || 'http') === 'http').length)
const codeCount = computed(() => toolsStore.tools.filter(t => t.type === 'code').length)
const promptCount = computed(() => toolsStore.tools.filter(t => t.type === 'prompt').length)
const smtpCount = computed(() => toolsStore.tools.filter(t => t.type === 'smtp').length)

const filteredTools = computed(() => {
  let list = toolsStore.tools
  if (typeFilter.value) {
    list = list.filter(t => (t.type || 'http') === typeFilter.value)
  }
  const q = searchQuery.value.toLowerCase()
  if (q) {
    list = list.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      (t.type || 'http').includes(q)
    )
  }
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
})

const modalTitle = computed(() => {
  const typeLabels = { 
    http: t('tools.httpTool'), 
    code: t('tools.codeSnippet'), 
    prompt: t('tools.promptTool'), 
    smtp: t('tools.smtpEmailTool') 
  }
  const label = typeLabels[form.value.type] || t('tools.title')
  return editingTool.value ? `${t('tools.edit')} ${label}` : `${t('tools.add')} ${label}`
})

const canSave = computed(() => {
  if (!form.value.name?.trim()) return false
  if (form.value.type === 'http') return !!form.value.endpoint?.trim()
  if (form.value.type === 'code') return !!form.value.code?.trim()
  if (form.value.type === 'prompt') return !!form.value.promptText?.trim()
  if (form.value.type === 'smtp') return true  // only name required
  return false
})

function openAdd() {
  if (isLimitEnforced() && toolsStore.tools.length >= PREVIEW_LIMITS.maxTools) {
    previewLimitMessage.value = t('limits.maxTools')
    showPreviewLimitModal.value = true
    return
  }
  editingTool.value = null
  form.value = emptyForm()
  saveError.value = ''
  showModal.value = true
}

function openEdit(tool) {
  editingTool.value = tool
  saveError.value = ''
  const base = {
    id: tool.id,
    name: tool.name || '',
    description: tool.description || '',
    category: tool.category || '',
    type: tool.type || 'http',
    // HTTP defaults
    method: tool.method || 'GET',
    endpoint: tool.endpoint || '',
    headers: Object.entries(tool.headers || {}).map(([key, value]) => ({ key, value })),
    bodyTemplate: tool.bodyTemplate || '{}',
    // Code defaults
    language: tool.language || 'javascript',
    code: tool.code || '',
    // Prompt defaults
    promptText: tool.promptText || '',
  }
  form.value = base
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingTool.value = null
}

// Lock body scroll & handle ESC when modal is open
watch(showModal, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onModalKeydown, true)
  } else {
    document.body.style.overflow = ''
    document.removeEventListener('keydown', onModalKeydown, true)
  }
})

function onModalKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    closeModal()
  }
}

onUnmounted(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onModalKeydown, true)
})

function addHeader() {
  form.value.headers.push({ key: '', value: '' })
}

function removeHeader(idx) {
  form.value.headers.splice(idx, 1)
}

async function saveForm() {
  const type = form.value.type || 'http'
  const toolData = {
    id: editingTool.value ? editingTool.value.id : form.value.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    category: form.value.category.trim(),
    type,
  }

  if (type === 'http') {
    const headers = Object.fromEntries(
      form.value.headers
        .filter(h => h.key.trim())
        .map(h => [h.key.trim(), h.value])
    )
    toolData.method = form.value.method
    toolData.endpoint = form.value.endpoint.trim()
    toolData.headers = headers
    toolData.bodyTemplate = form.value.bodyTemplate || '{}'
  } else if (type === 'code') {
    toolData.language = form.value.language
    toolData.code = form.value.code
  } else if (type === 'prompt') {
    toolData.promptText = form.value.promptText
  }

  try {
    await toolsStore.saveTool(toolData)
  } catch (err) {
    saveError.value = err.message || t('common.errorOccurred')
    return
  }
  closeModal()
}

const showConfirmDelete = ref(false)

function confirmDelete() {
  if (!editingTool.value) return
  showConfirmDelete.value = true
}

async function executeDelete() {
  if (!editingTool.value) return
  showConfirmDelete.value = false
  await toolsStore.deleteTool(editingTool.value.id)
  closeModal()
}

function truncateEndpoint(ep) {
  if (!ep) return ''
  return ep.length > 50 ? ep.slice(0, 47) + '...' : ep
}

</script>

<style scoped>
/* ── Page shell ────────────────────────────────────────────────────────────── */
.tools-page {
  background: #F2F2F7;
}

/* ── Header ────────────────────────────────────────────────────────────────── */
.catalog-header {
  flex-shrink: 0;
  padding: 1rem 1.5rem 0;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.catalog-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.catalog-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #6B7280;
  margin: 0.25rem 0 0 0;
}
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
/* ── Search bar ────────────────────────────────────────────────────────────── */
.catalog-search-wrap {
  position: relative;
  margin-top: 0.875rem;
}
.catalog-search-icon {
  position: absolute;
  left: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.125rem;
  height: 1.125rem;
  color: #9CA3AF;
  pointer-events: none;
  transition: color 0.2s;
}
.catalog-search-input {
  width: 100%;
  padding: 0.6875rem 2.625rem 0.6875rem 2.625rem;
  border-radius: 0.75rem;
  border: 1px solid #E5E5EA;
  background: rgba(255, 255, 255, 0.8);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.catalog-search-input::placeholder { color: #9CA3AF; font-weight: 400; }
.catalog-search-input:hover { border-color: #9CA3AF; }
.catalog-search-input:focus {
  border-color: #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}
.catalog-search-wrap:focus-within .catalog-search-icon { color: #1A1A1A; }
.catalog-search-clear {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.625rem;
  height: 1.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.catalog-search-clear:hover { background: #F5F5F5; color: #6B7280; }

/* ── Filter tabs ───────────────────────────────────────────────────────────── */
.catalog-filter-tabs {
  display: flex;
  gap: 0.375rem;
  padding: 0.75rem 0 0.75rem;
}
.catalog-filter-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.3125rem 0.75rem;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  border: 1px solid #E5E5EA;
  background: #F2F2F7;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s;
}
.catalog-filter-tab:hover:not(.active) { background: #E5E5EA; }
.catalog-filter-tab.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  border-color: #1A1A1A;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.catalog-filter-tab-count {
  font-size: var(--fs-small);
  font-weight: 700;
  padding: 0.0625rem 0.3125rem;
  border-radius: 0.25rem;
  background: rgba(0,0,0,0.06);
}
.catalog-filter-tab.active .catalog-filter-tab-count {
  background: rgba(255,255,255,0.2);
}

/* ── Grid background ───────────────────────────────────────────────────────── */
.tools-grid-bg {
  background: #F2F2F7;
}

/* ── Grid ──────────────────────────────────────────────────────────────────── */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem;
}
@media (max-width: 1100px) { .tools-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 800px) { .tools-grid { grid-template-columns: repeat(2, 1fr); } }

/* ── Card ──────────────────────────────────────────────────────────────────── */
.tools-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  overflow: hidden;
  cursor: pointer;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.tools-card:hover {
  transform: translateY(-0.1875rem);
  border-color: #D1D1D6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.tools-card:active { transform: translateY(-0.0625rem); transition-duration: 0.1s; }
.tools-card-accent {
  height: 4px; width: 100%; flex-shrink: 0;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
}
.tools-card-body { padding: 1.25rem 1.25rem 1rem; display: flex; flex-direction: column; flex: 1; }

.tools-card-title-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.875rem; }
.tools-card-icon {
  width: 2.25rem; height: 2.25rem;
  border-radius: 0.75rem;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.tools-card-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Type badge ────────────────────────────────────────────────────────────── */
.tools-type-badge {
  display: inline-flex;
  align-items: center;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 0.375rem;
  flex-shrink: 0;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.tools-card-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #6B7280;
  line-height: 1.55;
  margin: 0 0 0.875rem;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tools-card-footer {
  border-top: 1px solid #E5E5EA;
  padding-top: 0.75rem;
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.tools-card-footer-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}
.tools-card-method {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-caption);
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  flex-shrink: 0;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.tools-card-endpoint {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-caption);
  color: #9CA3AF;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1;
}

/* ── Modal ─────────────────────────────────────────────────────────────────── */
.tools-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: tools-backdrop-in 0.2s ease-out;
}
@keyframes tools-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
.tools-modal {
  width: min(40rem, 95vw); max-height: 85vh;
  background: #0F0F0F; border: 1px solid #2A2A2A; border-radius: 1.25rem;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: tools-modal-in 0.2s ease-out;
}
@keyframes tools-modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.tools-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem; border-bottom: 1px solid #1F1F1F;
}
.tools-modal-header-left { display: flex; align-items: center; gap: 0.625rem; }
.tools-modal-header-icon {
  width: 1.875rem; height: 1.875rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.tools-modal-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.tools-modal-close {
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280;
  cursor: pointer; transition: all 0.15s;
}
.tools-modal-close:hover { background: #1F1F1F; color: #FFFFFF; }
.tools-modal-body {
  flex: 1; overflow-y: auto; padding: 1.5rem;
   
}
.save-error {
  display: flex; align-items: center; gap: 0.5rem; margin: 0 1.5rem 0;
  padding: 0.625rem 0.875rem; border-radius: var(--radius-sm, 8px);
  background: rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.3);
  color: #FF6B6B; font-size: var(--fs-secondary, 0.875rem); font-family: 'Inter', sans-serif;
}
.tools-modal-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 0.625rem;
  padding: 1rem 1.5rem; border-top: 1px solid #1F1F1F; background: #0A0A0A;
}

/* ── Form fields ───────────────────────────────────────────────────────────── */
.form-group { margin-bottom: 1rem; }
.form-row { display: flex; gap: 0.75rem; }
.form-label {
  display: block; font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; color: #9CA3AF; margin-bottom: 0.375rem;
}
.form-input {
  width: 100%; padding: 0.5625rem 0.75rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  color: #FFFFFF; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75, 85, 99, 0.2); }
.form-input::placeholder { color: #4B5563; }
.form-input-sm {
  width: 100%; padding: 0.4375rem 0.625rem; border-radius: 0.375rem;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FFFFFF; outline: none; transition: border-color 0.15s;
}
.form-input-sm:focus { border-color: #4B5563; }
.form-input-sm::placeholder { color: #4B5563; }
.form-textarea {
  width: 100%; padding: 0.5rem 0.625rem; border-radius: 0.375rem;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-small);
  color: #FFFFFF; outline: none; resize: vertical; transition: border-color 0.15s;
}
.form-textarea:focus { border-color: #4B5563; }
.form-textarea::placeholder { color: #4B5563; }
.form-textarea-code {
  background: #111111; color: #E5E5EA; border-color: #2A2A2A; line-height: 1.5;
}
.form-textarea-code:focus { border-color: #3B82F6; }
.form-hint {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563; margin: 0.25rem 0 0;
}
select.form-input { appearance: auto; cursor: pointer; }

/* ── Headers section ───────────────────────────────────────────────────────── */
.env-section { margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid #1F1F1F; }
.env-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;
}
.env-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.env-add-btn {
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0.3125rem 0.75rem; border-radius: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  background: #1A1A1A; color: #9CA3AF; border: 1px solid #2A2A2A;
  cursor: pointer; transition: all 0.15s;
}
.env-add-btn:hover { background: #222222; color: #FFFFFF; border-color: #374151; }
.env-empty {
  padding: 1.25rem; border-radius: 0.625rem;
  background: #1A1A1A; border: 1.5px dashed #2A2A2A; text-align: center;
}
.env-empty p {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #4B5563; margin: 0;
}
.env-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
.env-remove-btn {
  width: 1.75rem; height: 1.75rem;
  display: flex; align-items: center; justify-content: center;
  border-radius: 0.375rem; border: none; background: none;
  color: #4B5563; cursor: pointer; flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.env-remove-btn:hover { background: rgba(239,68,68,0.15); color: #EF4444; }

/* ── Reduced motion ─────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .tools-card { transition: none; }
  .tools-card:hover { transform: none; }
  .tools-backdrop, .tools-modal { animation: none; }
}

</style>
