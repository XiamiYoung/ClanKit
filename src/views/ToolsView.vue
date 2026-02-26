<template>
  <div class="h-full flex flex-col overflow-hidden tools-page">

    <!-- Header -->
    <div class="catalog-header">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <h1 class="catalog-title">Tools</h1>
          <p class="catalog-subtitle">
            Define HTTP endpoints, code references, and prompt templates the AI agent can use as tools.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div class="catalog-count-badge">
            {{ toolsStore.tools.length }} tool{{ toolsStore.tools.length !== 1 ? 's' : '' }}
          </div>
          <AppButton @click="refreshTools" :loading="refreshing">
            <svg v-if="!refreshing" style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </AppButton>
          <AppButton @click="openAdd">
            <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Tool
          </AppButton>
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
          placeholder="Search tools by name, description, or category..."
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
          All
          <span class="catalog-filter-tab-count">{{ toolsStore.tools.length }}</span>
        </button>
        <button
          class="catalog-filter-tab"
          :class="{ active: typeFilter === 'http' }"
          @click="typeFilter = 'http'"
        >
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          HTTP
          <span class="catalog-filter-tab-count">{{ httpCount }}</span>
        </button>
        <button
          class="catalog-filter-tab"
          :class="{ active: typeFilter === 'code' }"
          @click="typeFilter = 'code'"
        >
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Code
          <span class="catalog-filter-tab-count">{{ codeCount }}</span>
        </button>
        <button
          class="catalog-filter-tab"
          :class="{ active: typeFilter === 'prompt' }"
          @click="typeFilter = 'prompt'"
        >
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Prompt
          <span class="catalog-filter-tab-count">{{ promptCount }}</span>
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="toolsStore.tools.length === 0" class="flex-1 flex items-center justify-center tools-grid-bg">
      <div class="text-center" style="max-width:420px;">
        <div
          class="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center"
          style="background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);"
        >
          <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <h2 style="font-family:'Inter',sans-serif; font-size:var(--fs-section); font-weight:700; color:#1A1A1A; margin:0 0 8px;">
          No tools configured
        </h2>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; line-height:1.6; margin:0;">
          Add HTTP endpoints, code snippets, or prompt templates to give the AI agent access to external APIs, reference code, and reusable instructions.
        </p>
      </div>
    </div>

    <!-- No search/filter results -->
    <div v-else-if="filteredTools.length === 0" class="flex-1 flex items-center justify-center tools-grid-bg">
      <div class="text-center">
        <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p v-if="searchQuery" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 4px;">No tools match "{{ searchQuery }}"</p>
        <p v-else style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 4px;">No {{ typeFilter }} tools</p>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:0;">Try a different search term or filter.</p>
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
            <div class="tools-card-accent" :style="{ background: accentForType(tool.type) }"></div>

            <div class="tools-card-body">
              <!-- Default row — top of card body -->
              <div class="tools-card-default-row" @click.stop>
                <span class="tools-default-label">{{ isToolDefault(tool.id) ? 'Default' : 'Not default' }}</span>
                <label class="default-toggle" :title="isToolDefault(tool.id) ? 'Remove from defaults' : 'Add to defaults'">
                  <input type="checkbox" :checked="isToolDefault(tool.id)" @change="toggleToolDefault(tool.id)" />
                  <span class="default-toggle-track"><span class="default-toggle-thumb"></span></span>
                </label>
              </div>

              <!-- Icon + title row -->
              <div class="tools-card-title-row">
                <div class="tools-card-icon" :style="{ background: iconBgForType(tool.type) }">
                  <!-- HTTP icon: globe -->
                  <svg v-if="tool.type === 'http' || !tool.type" style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  <!-- Code icon: brackets -->
                  <svg v-else-if="tool.type === 'code'" style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                  <!-- Prompt icon: chat bubble -->
                  <svg v-else style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div style="flex:1;min-width:0;">
                  <h3 class="tools-card-name">{{ tool.name }}</h3>
                </div>
                <!-- Type badge -->
                <span class="tools-type-badge" :class="'type-' + (tool.type || 'http')">
                  {{ typeLabelMap[tool.type || 'http'] }}
                </span>
              </div>

              <!-- Description -->
              <p class="tools-card-desc">{{ tool.description || 'No description' }}</p>

              <!-- Footer — adapts by type -->
              <div class="tools-card-footer">
                <div class="tools-card-footer-info">
                  <!-- HTTP footer -->
                  <template v-if="tool.type === 'http' || !tool.type">
                    <span class="tools-card-method" :class="'method-' + (tool.method || 'GET').toLowerCase()">
                      {{ tool.method || 'GET' }}
                    </span>
                    <span class="tools-card-endpoint" :title="tool.endpoint">
                      {{ truncateEndpoint(tool.endpoint) }}
                    </span>
                  </template>
                  <!-- Code footer -->
                  <template v-else-if="tool.type === 'code'">
                    <span class="tools-card-method method-code">
                      {{ (tool.language || 'javascript').toUpperCase().slice(0, 4) }}
                    </span>
                    <span class="tools-card-endpoint">
                      {{ (tool.code || '').split('\n').length }} lines
                    </span>
                  </template>
                  <!-- Prompt footer -->
                  <template v-else>
                    <span class="tools-card-method method-prompt">
                      TMPL
                    </span>
                    <span class="tools-card-endpoint">
                      {{ (tool.promptText || '').length }} chars
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
              <label class="form-label">Name *</label>
              <input v-model="form.name" type="text" class="form-input" placeholder="e.g. Weather API" />
              <p class="form-hint">Display name for the tool (also used as the tool name for the agent)</p>
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <input v-model="form.description" type="text" class="form-input" placeholder="What this tool does — shown to the AI agent" />
            </div>

            <!-- Type selector -->
            <div class="form-group">
              <label class="form-label">Type *</label>
              <select v-model="form.type" class="form-input">
                <option value="http">HTTP Endpoint</option>
                <option value="code">Code Snippet</option>
                <option value="prompt">Prompt Template</option>
              </select>
              <p class="form-hint">
                <template v-if="form.type === 'http'">API endpoint the agent can call directly</template>
                <template v-else-if="form.type === 'code'">Code shown to the agent as a reference — agent uses execute_shell to run</template>
                <template v-else>Text template returned to the agent on demand when it calls this tool</template>
              </p>
            </div>

            <!-- ── HTTP-specific fields ─────────────────────────── -->
            <template v-if="form.type === 'http'">
              <div class="form-group">
                <label class="form-label">Category</label>
                <input v-model="form.category" type="text" class="form-input" placeholder="HTTP, Search, Data, etc." />
                <p class="form-hint">Used for filtering in the chat tool selector</p>
              </div>

              <div class="form-row">
                <div class="form-group" style="width:140px;flex-shrink:0;">
                  <label class="form-label">Method *</label>
                  <select v-model="form.method" class="form-input">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div class="form-group" style="flex:1;">
                  <label class="form-label">Endpoint URL *</label>
                  <input v-model="form.endpoint" type="text" class="form-input" placeholder="https://api.example.com/v1/resource" />
                </div>
              </div>

              <!-- Headers -->
              <div class="env-section">
                <div class="env-header">
                  <h3 class="env-title">Headers</h3>
                  <button class="env-add-btn" @click="addHeader">
                    <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add
                  </button>
                </div>

                <div v-if="form.headers.length === 0" class="env-empty">
                  <p>No custom headers. Add if the endpoint requires authentication or special headers.</p>
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
                <label class="form-label">Body Template</label>
                <textarea
                  v-model="form.bodyTemplate"
                  class="form-textarea"
                  rows="4"
                  placeholder='{"query": "{{input}}"}'
                ></textarea>
                <p class="form-hint">JSON body template. The agent can override or merge fields at runtime.</p>
              </div>
            </template>

            <!-- ── Code Snippet fields ──────────────────────────── -->
            <template v-else-if="form.type === 'code'">
              <div class="form-group">
                <label class="form-label">Language *</label>
                <select v-model="form.language" class="form-input">
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="bash">Bash</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Code *</label>
                <textarea
                  v-model="form.code"
                  class="form-textarea form-textarea-code"
                  rows="12"
                  placeholder="// Paste your reference code here..."
                ></textarea>
                <p class="form-hint">This code is shown to the agent as a reference. The agent will use execute_shell to run similar code.</p>
              </div>
            </template>

            <!-- ── Prompt Template fields ───────────────────────── -->
            <template v-else>
              <div class="form-group">
                <label class="form-label">Prompt Text *</label>
                <textarea
                  v-model="form.promptText"
                  class="form-textarea"
                  rows="8"
                  placeholder="Write your prompt template or instructions here..."
                ></textarea>
                <p class="form-hint">This prompt is returned to the agent when it calls this tool. Use it for reusable instructions or templates.</p>
              </div>
            </template>
          </div>

          <!-- Modal footer -->
          <div class="tools-modal-footer">
            <div v-if="editingTool" style="flex:1;">
              <AppButton variant="danger-ghost" @click="confirmDelete">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                Delete
              </AppButton>
            </div>
            <AppButton variant="secondary" size="modal" @click="closeModal">Cancel</AppButton>
            <AppButton size="modal" @click="saveForm" :disabled="!canSave">Save</AppButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Delete Modal -->
    <ConfirmModal
      v-if="showConfirmDelete && editingTool"
      title="Delete Tool"
      :message="`Are you sure you want to delete &quot;${editingTool.name}&quot;? This action cannot be undone.`"
      confirm-text="Delete"
      confirm-class="danger"
      @confirm="executeDelete"
      @close="showConfirmDelete = false"
    />

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useToolsStore } from '../stores/tools'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import AppButton from '../components/common/AppButton.vue'
import { useConfigStore } from '../stores/config'

const toolsStore = useToolsStore()
const configStore = useConfigStore()
const refreshing = ref(false)

function isToolDefault(toolId) {
  const ids = configStore.config.defaultToolIds
  if (!ids) return true // null = all default
  return ids.includes(toolId)
}

function toggleToolDefault(toolId) {
  const allIds = toolsStore.tools.map(t => t.id)
  let current = configStore.config.defaultToolIds
  if (!current) {
    // null = all default → removing one means explicit list of all minus this one
    current = allIds.filter(id => id !== toolId)
  } else if (current.includes(toolId)) {
    current = current.filter(id => id !== toolId)
  } else {
    current = [...current, toolId]
  }
  // If all are selected, store null
  const isAll = current.length === allIds.length && allIds.every(id => current.includes(id))
  configStore.saveConfig({ defaultToolIds: isAll ? null : current })
}

const typeLabelMap = {
  http: 'HTTP',
  code: 'Code',
  prompt: 'Prompt',
}

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
  // Sort defaults to front
  return [...list].sort((a, b) => {
    const aD = isToolDefault(a.id) ? 0 : 1
    const bD = isToolDefault(b.id) ? 0 : 1
    return aD - bD
  })
})

const modalTitle = computed(() => {
  const typeLabels = { http: 'HTTP Tool', code: 'Code Snippet', prompt: 'Prompt Tool' }
  const label = typeLabels[form.value.type] || 'Tool'
  return editingTool.value ? `Edit ${label}` : `Add ${label}`
})

const canSave = computed(() => {
  if (!form.value.name?.trim()) return false
  if (form.value.type === 'http') return !!form.value.endpoint?.trim()
  if (form.value.type === 'code') return !!form.value.code?.trim()
  if (form.value.type === 'prompt') return !!form.value.promptText?.trim()
  return false
})

function openAdd() {
  editingTool.value = null
  form.value = emptyForm()
  showModal.value = true
}

function openEdit(tool) {
  editingTool.value = tool
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
    console.error('Failed to save tool:', err)
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

function accentForType(type) {
  if (type === 'code') return 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)'
  if (type === 'prompt') return 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)'
  return 'linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)'
}

function iconBgForType(type) {
  if (type === 'code') return 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)'
  if (type === 'prompt') return 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)'
  return 'linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)'
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
  padding: 16px 24px 0;
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
  margin: 4px 0 0 0;
}
.catalog-count-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #9CA3AF;
  background: rgba(245, 245, 245, 0.8);
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(229, 229, 234, 0.5);
}
/* ── Search bar ────────────────────────────────────────────────────────────── */
.catalog-search-wrap {
  position: relative;
  margin-top: 14px;
}
.catalog-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: #9CA3AF;
  pointer-events: none;
  transition: color 0.2s;
}
.catalog-search-input {
  width: 100%;
  padding: 11px 42px 11px 42px;
  border-radius: 12px;
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
  border-color: #007AFF;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}
.catalog-search-wrap:focus-within .catalog-search-icon { color: #007AFF; }
.catalog-search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.catalog-search-clear:hover { background: #F5F5F5; color: #6B7280; }

/* ── Filter tabs ───────────────────────────────────────────────────────────── */
.catalog-filter-tabs {
  display: flex;
  gap: 6px;
  padding: 12px 0 12px;
}
.catalog-filter-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 8px;
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
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
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
  gap: 20px;
}
@media (max-width: 1200px) { .tools-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 900px)  { .tools-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px)  { .tools-grid { grid-template-columns: 1fr; } }

/* ── Card ──────────────────────────────────────────────────────────────────── */
.tools-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
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
  transform: translateY(-3px);
  border-color: #D1D1D6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.tools-card:active { transform: translateY(-1px); transition-duration: 0.1s; }
.tools-card-accent { height: 4px; width: 100%; flex-shrink: 0; }
.tools-card-body { padding: 20px 20px 16px; display: flex; flex-direction: column; flex: 1; }

/* ── Default row — top of card body ───────────────────────────────────────── */
.tools-card-default-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid #E5E5EA;
}
.tools-default-label {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #9CA3AF;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tools-card-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.tools-card-icon {
  width: 36px; height: 36px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
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

/* ── Type badges ───────────────────────────────────────────────────────────── */
.tools-type-badge {
  display: inline-flex;
  align-items: center;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}
.tools-type-badge.type-http {
  background: #EFF6FF;
  color: #2563EB;
}
.tools-type-badge.type-code {
  background: #F0FDF4;
  color: #16A34A;
}
.tools-type-badge.type-prompt {
  background: #F5F3FF;
  color: #7C3AED;
}

.tools-card-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #6B7280;
  line-height: 1.55;
  margin: 0 0 14px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tools-card-footer {
  border-top: 1px solid #E5E5EA;
  padding-top: 12px;
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tools-card-footer-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.tools-card-method {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.method-get { background: #EFF6FF; color: #2563EB; }
.method-post { background: #FEF3C7; color: #D97706; }
.method-put { background: #FFF7ED; color: #EA580C; }
.method-delete { background: #FEF2F2; color: #DC2626; }
.method-code { background: #F0FDF4; color: #16A34A; }
.method-prompt { background: #F5F3FF; color: #7C3AED; }
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
  width: min(640px, 95vw); max-height: 85vh;
  background: #0F0F0F; border: 1px solid #2A2A2A; border-radius: 20px;
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
  padding: 16px 20px; border-bottom: 1px solid #1F1F1F;
}
.tools-modal-header-left { display: flex; align-items: center; gap: 10px; }
.tools-modal-header-icon {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.tools-modal-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.tools-modal-close {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280;
  cursor: pointer; transition: all 0.15s;
}
.tools-modal-close:hover { background: #1F1F1F; color: #FFFFFF; }
.tools-modal-body {
  flex: 1; overflow-y: auto; padding: 24px;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.tools-modal-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding: 16px 24px; border-top: 1px solid #1F1F1F; background: #0A0A0A;
}

/* ── Form fields ───────────────────────────────────────────────────────────── */
.form-group { margin-bottom: 16px; }
.form-row { display: flex; gap: 12px; }
.form-label {
  display: block; font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; color: #9CA3AF; margin-bottom: 6px;
}
.form-input {
  width: 100%; padding: 9px 12px; border-radius: 8px;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  color: #FFFFFF; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75, 85, 99, 0.2); }
.form-input::placeholder { color: #4B5563; }
.form-input-sm {
  width: 100%; padding: 7px 10px; border-radius: 6px;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FFFFFF; outline: none; transition: border-color 0.15s;
}
.form-input-sm:focus { border-color: #4B5563; }
.form-input-sm::placeholder { color: #4B5563; }
.form-textarea {
  width: 100%; padding: 8px 10px; border-radius: 6px;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px;
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
  color: #4B5563; margin: 4px 0 0;
}
select.form-input { appearance: auto; cursor: pointer; }

/* ── Headers section ───────────────────────────────────────────────────────── */
.env-section { margin-top: 8px; padding-top: 16px; border-top: 1px solid #1F1F1F; }
.env-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.env-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.env-add-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 12px; border-radius: 6px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  background: #1A1A1A; color: #9CA3AF; border: 1px solid #2A2A2A;
  cursor: pointer; transition: all 0.15s;
}
.env-add-btn:hover { background: #222222; color: #FFFFFF; border-color: #374151; }
.env-empty {
  padding: 20px; border-radius: 10px;
  background: #1A1A1A; border: 1.5px dashed #2A2A2A; text-align: center;
}
.env-empty p {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #4B5563; margin: 0;
}
.env-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.env-remove-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px; border: none; background: none;
  color: #4B5563; cursor: pointer; flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.env-remove-btn:hover { background: rgba(239,68,68,0.15); color: #EF4444; }

/* ── Default toggle switch ──────────────────────────────────────────────────── */
.default-toggle {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.default-toggle input { display: none; }
.default-toggle-track {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 10px;
  background: #D1D1D6;
  transition: background 0.2s;
}
.default-toggle input:checked + .default-toggle-track {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
}
.default-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.2s;
}
.default-toggle input:checked + .default-toggle-track .default-toggle-thumb {
  transform: translateX(14px);
}

/* ── Reduced motion ─────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .tools-card { transition: none; }
  .tools-card:hover { transform: none; }
  .tools-backdrop, .tools-modal { animation: none; }
  .default-toggle-track, .default-toggle-thumb { transition: none; }
}
</style>
