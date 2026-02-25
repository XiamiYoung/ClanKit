<template>
  <div class="soul-backdrop" @click.self="$emit('close')">
    <div class="soul-modal">
      <!-- Header -->
      <div class="soul-header">
        <div class="soul-header-left">
          <div class="soul-header-icon">
            <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
              <line x1="10" y1="22" x2="14" y2="22"/>
            </svg>
          </div>
          <div>
            <h2 class="soul-title">{{ personaName }} — Summary</h2>
            <span class="soul-meta">{{ personaType === 'system' ? 'System Persona' : 'User Persona' }}</span>
          </div>
        </div>
        <button class="soul-close-btn" @click="$emit('close')" aria-label="Close">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Content -->
      <div class="soul-body">
        <!-- Persona info card (always visible) -->
        <div class="soul-persona-card">
          <div class="soul-persona-field">
            <span class="soul-persona-label">Description</span>
            <span v-if="!editingPrompt" class="soul-persona-value">{{ personaDescription || '—' }}</span>
          </div>
          <div class="soul-persona-field">
            <span class="soul-persona-label">System Prompt</span>
            <template v-if="!editingPrompt">
              <pre class="soul-persona-prompt">{{ personaPrompt || '—' }}</pre>
              <button v-if="personaType === 'system'" class="soul-btn-inline" @click="startEditingPrompt">Edit Prompt</button>
            </template>
            <template v-else>
              <textarea v-model="editPromptContent" class="soul-editor" spellcheck="false" rows="6"></textarea>
              <div class="soul-prompt-actions">
                <button class="soul-btn secondary" @click="cancelEditingPrompt">Cancel</button>
                <button class="soul-btn primary" @click="savePrompt">Save Prompt</button>
              </div>
            </template>
          </div>
        </div>

        <!-- Divider -->
        <div class="soul-divider">
          <span class="soul-divider-label">Learned Memory</span>
          <span v-if="fileSize" class="soul-divider-meta">{{ fileSizeFormatted }} | Updated: {{ lastUpdated || 'never' }}</span>
        </div>

        <!-- Soul memory content -->
        <template v-if="loading">
          <div class="soul-empty">Loading...</div>
        </template>
        <template v-else-if="!content">
          <div class="soul-empty">
            <p>No learned memory yet.</p>
            <p class="soul-empty-hint">The AI will automatically learn preferences and context during conversations.</p>
          </div>
        </template>
        <template v-else>
          <div v-if="!editingMemory" class="soul-rendered" v-html="renderedHtml"></div>
          <textarea
            v-else
            v-model="editContent"
            class="soul-editor"
            spellcheck="false"
          ></textarea>
        </template>
      </div>

      <!-- Footer -->
      <div class="soul-footer">
        <div class="soul-footer-left">
          <button v-if="content" class="soul-btn danger" @click="confirmClear">Clear Memory</button>
        </div>
        <div class="soul-footer-right">
          <template v-if="!editingMemory && content">
            <button class="soul-btn secondary" @click="startEditingMemory">Edit Memory</button>
          </template>
          <template v-if="editingMemory">
            <button class="soul-btn secondary" @click="cancelEditingMemory">Cancel</button>
            <button class="soul-btn primary" @click="saveMemoryEdit">Save</button>
          </template>
        </div>
      </div>
    </div>

    <!-- Confirm Clear Modal -->
    <ConfirmModal
      v-if="showConfirmClear"
      title="Clear Memory"
      :message="`Clear all learned memory for &quot;${personaName}&quot;? This cannot be undone.`"
      confirm-text="Clear"
      confirm-class="danger"
      @confirm="executeClear"
      @close="showConfirmClear = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { marked } from 'marked'
import ConfirmModal from '../common/ConfirmModal.vue'

const props = defineProps({
  personaId:          { type: String, required: true },
  personaType:        { type: String, required: true }, // 'system' or 'users'
  personaName:        { type: String, default: 'Persona' },
  personaDescription: { type: String, default: '' },
  personaPrompt:      { type: String, default: '' },
})

const emit = defineEmits(['close', 'update-persona'])

const loading = ref(true)
const content = ref(null)

// Memory editing
const editingMemory = ref(false)
const editContent = ref('')

// Prompt editing
const editingPrompt = ref(false)
const editPromptContent = ref('')

const fileSize = computed(() => content.value ? new Blob([content.value]).size : 0)
const fileSizeFormatted = computed(() => {
  const s = fileSize.value
  if (s < 1024) return `${s} B`
  return `${(s / 1024).toFixed(1)} KB`
})

const lastUpdated = computed(() => {
  if (!content.value) return null
  const match = content.value.match(/^> Last updated: (.+)$/m)
  return match ? match[1] : null
})

const renderedHtml = computed(() => {
  if (!content.value) return ''
  return marked(content.value, { breaks: true })
})

async function loadContent() {
  loading.value = true
  try {
    const data = await window.electronAPI.souls.read(props.personaId, props.personaType)
    content.value = data || null
  } catch (err) {
    content.value = null
  }
  loading.value = false
}

// Memory editing
function startEditingMemory() {
  editContent.value = content.value || ''
  editingMemory.value = true
}

function cancelEditingMemory() {
  editingMemory.value = false
  editContent.value = ''
}

async function saveMemoryEdit() {
  await window.electronAPI.souls.write(props.personaId, props.personaType, editContent.value)
  content.value = editContent.value
  editingMemory.value = false
}

// Prompt editing
function startEditingPrompt() {
  editPromptContent.value = props.personaPrompt || ''
  editingPrompt.value = true
}

function cancelEditingPrompt() {
  editingPrompt.value = false
  editPromptContent.value = ''
}

function savePrompt() {
  emit('update-persona', { prompt: editPromptContent.value })
  editingPrompt.value = false
}

// Clear
const showConfirmClear = ref(false)

function confirmClear() {
  showConfirmClear.value = true
}

async function executeClear() {
  showConfirmClear.value = false
  await window.electronAPI.souls.delete(props.personaId, props.personaType)
  content.value = null
  editingMemory.value = false
}

onMounted(loadContent)
</script>

<style scoped>
.soul-backdrop {
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

.soul-modal {
  width: min(700px, 90vw);
  max-height: 85vh;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 20px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.soul-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #E5E5EA;
}
.soul-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.soul-header-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.soul-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle, 0.95rem);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.soul-meta {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.75rem);
  color: #9CA3AF;
}
.soul-close-btn {
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
.soul-close-btn:hover { background: #F5F5F5; }

.soul-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  scrollbar-width: thin;
  min-height: 200px;
}

/* ── Persona info card ──────────────────────────────────────────────── */
.soul-persona-card {
  background: #F9FAFB;
  border: 1px solid #E5E5EA;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.soul-persona-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.soul-persona-label {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9CA3AF;
}
.soul-persona-value {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.875rem);
  color: #374151;
  line-height: 1.5;
}
.soul-persona-prompt {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-secondary, 0.8rem);
  color: #374151;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  max-height: 150px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.soul-btn-inline {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  cursor: pointer;
  transition: all 0.12s;
  margin-top: 4px;
}
.soul-btn-inline:hover {
  background: #F5F5F5;
  color: #1A1A1A;
  border-color: #D1D1D6;
}
.soul-prompt-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

/* ── Divider ────────────────────────────────────────────────────────── */
.soul-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.soul-divider-label {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #1A1A1A;
  white-space: nowrap;
}
.soul-divider-meta {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: #9CA3AF;
  white-space: nowrap;
}
.soul-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #E5E5EA;
}

/* ── Empty state ────────────────────────────────────────────────────── */
.soul-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  color: #9CA3AF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.875rem);
  text-align: center;
}
.soul-empty p { margin: 4px 0; }
.soul-empty-hint {
  font-size: var(--fs-secondary, 0.75rem);
  color: #D1D1D6;
  max-width: 300px;
}

.soul-rendered {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.875rem);
  color: #1A1A1A;
  line-height: 1.6;
}
.soul-rendered :deep(h1) { font-size: 1.25rem; font-weight: 700; margin: 0 0 8px; }
.soul-rendered :deep(h2) { font-size: 1rem; font-weight: 600; margin: 16px 0 6px; color: #374151; }
.soul-rendered :deep(ul) { padding-left: 20px; margin: 4px 0; }
.soul-rendered :deep(li) { margin: 2px 0; }
.soul-rendered :deep(blockquote) { border-left: 3px solid #E5E5EA; padding-left: 12px; color: #6B7280; margin: 8px 0; }
.soul-rendered :deep(code) { font-family: 'JetBrains Mono', monospace; font-size: 0.85em; background: #F5F5F5; padding: 1px 4px; border-radius: 3px; }

.soul-editor {
  width: 100%;
  min-height: 120px;
  padding: 12px;
  border: 1px solid #E5E5EA;
  border-radius: 10px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-secondary, 0.8rem);
  color: #1A1A1A;
  background: #FAFAFA;
  outline: none;
  resize: vertical;
  line-height: 1.6;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.soul-editor:focus { border-color: #1A1A1A; }

.soul-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #E5E5EA;
  background: #F9F9F9;
}
.soul-footer-left, .soul-footer-right {
  display: flex;
  gap: 8px;
}

.soul-btn {
  padding: 7px 16px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.8rem);
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}
.soul-btn.primary {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
}
.soul-btn.primary:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.soul-btn.secondary {
  background: #F5F5F5;
  color: #6B7280;
  border: 1px solid #E5E5EA;
}
.soul-btn.secondary:hover { background: #E5E5EA; }
.soul-btn.danger {
  background: transparent;
  color: #EF4444;
  border: 1px solid #FECACA;
}
.soul-btn.danger:hover { background: #FEF2F2; }
</style>
