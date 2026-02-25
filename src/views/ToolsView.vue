<template>
  <div class="h-full flex flex-col overflow-hidden tools-page">

    <!-- Header -->
    <div class="catalog-header">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <h1 class="catalog-title">HTTP Tools</h1>
          <p class="catalog-subtitle">
            Define HTTP endpoints the AI agent can call as tools. Each tool becomes available for selection in chat sessions.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div class="catalog-count-badge">
            {{ toolsStore.tools.length }} tool{{ toolsStore.tools.length !== 1 ? 's' : '' }}
          </div>
          <button class="catalog-add-btn" @click="openAdd">
            <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Tool
          </button>
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
          No HTTP tools configured
        </h2>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; line-height:1.6; margin:0;">
          Add an HTTP tool to give the AI agent access to external APIs and services.
          Tools can be enabled per chat session.
        </p>
      </div>
    </div>

    <!-- No search results -->
    <div v-else-if="filteredTools.length === 0 && searchQuery" class="flex-1 flex items-center justify-center tools-grid-bg">
      <div class="text-center">
        <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 4px;">No tools match "{{ searchQuery }}"</p>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:0;">Try a different search term or clear the filter.</p>
      </div>
    </div>

    <!-- Tool Grid -->
    <div v-else class="flex-1 overflow-y-auto tools-grid-bg">
      <div style="padding:24px 32px;">
        <div class="tools-grid">
          <div
            v-for="(tool, idx) in filteredTools"
            :key="tool.id"
            @click="openEdit(tool)"
            class="tools-card"
          >
            <!-- Gradient accent bar -->
            <div class="tools-card-accent" :style="{ background: cardGradient(idx) }"></div>

            <div class="tools-card-body">
              <!-- Icon + title row -->
              <div class="tools-card-title-row">
                <div class="tools-card-icon" :style="{ background: cardGradient(idx) }">
                  <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </div>
                <div style="flex:1;min-width:0;">
                  <h3 class="tools-card-name">{{ tool.name }}</h3>
                </div>
                <!-- Category badge -->
                <span class="tools-category-badge">{{ tool.category || 'HTTP' }}</span>
              </div>

              <!-- Description -->
              <p class="tools-card-desc">{{ tool.description || 'No description' }}</p>

              <!-- Footer -->
              <div class="tools-card-footer">
                <span class="tools-card-method" :class="'method-' + (tool.method || 'GET').toLowerCase()">
                  {{ tool.method || 'GET' }}
                </span>
                <span class="tools-card-endpoint" :title="tool.endpoint">
                  {{ truncateEndpoint(tool.endpoint) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="tools-backdrop" @click.self="closeModal">
        <div class="tools-modal">
          <!-- Modal header -->
          <div class="tools-modal-header">
            <div class="tools-modal-header-left">
              <div class="tools-modal-header-icon">
                <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
              <h2 class="tools-modal-title">{{ editingTool ? 'Edit Tool' : 'Add HTTP Tool' }}</h2>
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
          </div>

          <!-- Modal footer -->
          <div class="tools-modal-footer">
            <div v-if="editingTool" style="flex:1;">
              <button class="modal-delete-btn" @click="confirmDelete">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                Delete
              </button>
            </div>
            <button class="modal-cancel-btn" @click="closeModal">Cancel</button>
            <button class="modal-save-btn" @click="saveForm" :disabled="!form.name?.trim() || !form.endpoint?.trim()">Save</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToolsStore } from '../stores/tools'

const toolsStore = useToolsStore()

onMounted(async () => {
  await toolsStore.loadTools()
})

const searchQuery = ref('')
const showModal = ref(false)
const editingTool = ref(null)

const form = ref(emptyForm())

function emptyForm() {
  return {
    name: '',
    description: '',
    category: 'HTTP',
    method: 'GET',
    endpoint: '',
    headers: [],
    bodyTemplate: '{}',
  }
}

const filteredTools = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return toolsStore.tools
  return toolsStore.tools.filter(t =>
    t.name?.toLowerCase().includes(q) ||
    t.description?.toLowerCase().includes(q) ||
    t.category?.toLowerCase().includes(q)
  )
})

function openAdd() {
  editingTool.value = null
  form.value = emptyForm()
  showModal.value = true
}

function openEdit(tool) {
  editingTool.value = tool
  form.value = {
    id: tool.id,
    name: tool.name || '',
    description: tool.description || '',
    category: tool.category || 'HTTP',
    method: tool.method || 'GET',
    endpoint: tool.endpoint || '',
    headers: Object.entries(tool.headers || {}).map(([key, value]) => ({ key, value })),
    bodyTemplate: tool.bodyTemplate || '{}',
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingTool.value = null
}

function addHeader() {
  form.value.headers.push({ key: '', value: '' })
}

function removeHeader(idx) {
  form.value.headers.splice(idx, 1)
}

async function saveForm() {
  const headers = Object.fromEntries(
    form.value.headers
      .filter(h => h.key.trim())
      .map(h => [h.key.trim(), h.value])
  )

  const toolData = {
    id: editingTool.value ? editingTool.value.id : form.value.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    category: form.value.category.trim() || 'HTTP',
    method: form.value.method,
    endpoint: form.value.endpoint.trim(),
    headers,
    bodyTemplate: form.value.bodyTemplate || '{}',
  }

  await toolsStore.saveTool(toolData)
  closeModal()
}

async function confirmDelete() {
  if (!editingTool.value) return
  if (confirm(`Delete tool "${editingTool.value.name}"?`)) {
    await toolsStore.deleteTool(editingTool.value.id)
    closeModal()
  }
}

function truncateEndpoint(ep) {
  if (!ep) return ''
  return ep.length > 50 ? ep.slice(0, 47) + '...' : ep
}

function cardGradient() {
  return 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'
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
  padding: 16px 24px 14px;
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
.catalog-add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 12px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.catalog-add-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.catalog-add-btn:active {
  transform: scale(0.97);
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
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease, border-color 0.25s ease;
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
.tools-card-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.tools-card-icon {
  width: 36px; height: 36px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: none;
}
.tools-card-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tools-category-badge {
  display: inline-flex;
  align-items: center;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: #F5F5F5;
  color: #6B7280;
  flex-shrink: 0;
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
  border-top: 1px solid rgba(229, 229, 234, 0.5);
  padding-top: 12px;
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tools-card-method {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.method-get { background: #F5F5F5; color: #1A1A1A; }
.method-post { background: #F5F5F5; color: #1A1A1A; }
.method-put { background: #F5F5F5; color: #1A1A1A; }
.method-delete { background: #F5F5F5; color: #1A1A1A; }
.tools-card-endpoint {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-caption);
  color: #9CA3AF;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1;
}

/* ── Modal ─────────────────────────────────────────────────────────────────── */
.tools-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tools-modal {
  width: min(640px, 95vw);
  max-height: 85vh;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 20px;
  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.18),
    0 8px 32px rgba(255, 149, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tools-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #E5E5EA;
}
.tools-modal-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tools-modal-header-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.tools-modal-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.tools-modal-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.15s;
}
.tools-modal-close:hover { background: #F5F5F5; }
.tools-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  scrollbar-width: thin;
}
.tools-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #E5E5EA;
}

/* ── Form fields ───────────────────────────────────────────────────────────── */
.form-group { margin-bottom: 16px; }
.form-row { display: flex; gap: 12px; }
.form-label {
  display: block;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}
.form-input {
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid #E5E5EA;
  background: #fff;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus {
  border-color: #007AFF;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}
.form-input-sm {
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid #E5E5EA;
  background: #F9F9F9;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #1A1A1A;
  outline: none;
  transition: border-color 0.15s;
}
.form-input-sm:focus { border-color: #007AFF; }
.form-textarea {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #E5E5EA;
  background: #F9F9F9;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: #1A1A1A;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s;
}
.form-textarea:focus { border-color: #007AFF; }
.form-hint {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #9CA3AF;
  margin: 4px 0 0;
}
select.form-input {
  appearance: auto;
  cursor: pointer;
}

/* ── Headers section ───────────────────────────────────────────────────────── */
.env-section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid #E5E5EA;
}
.env-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.env-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.env-add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  background: #F5F5F5;
  color: #1A1A1A;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.env-add-btn:hover { background: #E5E5EA; }
.env-empty {
  padding: 20px;
  border-radius: 10px;
  background: #F2F2F7;
  border: 1.5px dashed #D1D1D6;
  text-align: center;
}
.env-empty p {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
  margin: 0;
}
.env-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.env-remove-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  border: none; background: none;
  color: #9CA3AF; cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.env-remove-btn:hover { background: #FEE2E2; color: #DC2626; }

/* ── Modal buttons ─────────────────────────────────────────────────────────── */
.modal-cancel-btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 500;
  background: #F5F5F5;
  color: #6B7280;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.modal-cancel-btn:hover { background: #E5E5EA; }
.modal-save-btn {
  padding: 8px 22px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.modal-save-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.modal-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-delete-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.modal-delete-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }

/* ── Reduced motion ─────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .tools-card, .catalog-add-btn { transition: none; }
  .tools-card:hover { transform: none; }
}
</style>
