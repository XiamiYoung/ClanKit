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

      <!-- Tab bar (only for system personas) -->
      <div v-if="personaType === 'system'" class="soul-tabs">
        <button class="soul-tab" :class="{ active: activeTab === 'summary' }" @click="activeTab = 'summary'">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
            <line x1="10" y1="22" x2="14" y2="22"/>
          </svg>
          Summary
        </button>
        <button class="soul-tab" :class="{ active: activeTab === 'model' }" @click="activeTab = 'model'">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          AI Model
        </button>
      </div>

      <!-- ═══ SUMMARY TAB (or user persona — always shows this) ═══ -->
      <template v-if="activeTab === 'summary'">
        <!-- Content -->
        <div class="soul-body">
          <!-- Persona info card -->
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
      </template>

      <!-- ═══ AI MODEL TAB (system personas only) ═══ -->
      <template v-else-if="activeTab === 'model'">
        <div class="soul-body soul-model-body">
          <!-- Step 1: Provider -->
          <div class="soul-model-section">
            <div class="soul-model-section-label">
              <span class="soul-step-num">1</span>
              Provider
              <span class="soul-model-badge">{{ draftProvider === 'anthropic' ? 'Anthropic' : draftProvider === 'openrouter' ? 'OpenRouter' : 'OpenAI' }}</span>
            </div>
            <div class="soul-provider-cards">
              <button
                v-for="prov in [
                  { id: 'anthropic',  label: 'Anthropic',  sub: 'Claude models' },
                  { id: 'openrouter', label: 'OpenRouter', sub: 'Multi-provider' },
                  { id: 'openai',     label: 'OpenAI',     sub: 'GPT / custom' }
                ]"
                :key="prov.id"
                class="soul-provider-card"
                :class="{ active: draftProvider === prov.id }"
                @click="selectProvider(prov.id)"
              >
                <span class="soul-provider-card-name">{{ prov.label }}</span>
                <span class="soul-provider-card-sub">{{ prov.sub }}</span>
              </button>
            </div>
          </div>

          <!-- Step 2: Model -->
          <div class="soul-model-section soul-model-section-grow">
            <div class="soul-model-section-label">
              <span class="soul-step-num">2</span>
              Model
              <span class="soul-model-badge">{{ currentModelLabel }}</span>
            </div>
            <input
              v-if="draftProvider !== 'anthropic'"
              v-model="modelFilter"
              type="text"
              placeholder="Search models..."
              class="soul-model-search"
              @click.stop
            />
            <div class="soul-model-list">
              <button
                class="soul-model-item"
                :class="{ active: draftModelId === null }"
                @click="draftModelId = null"
              >
                <span>Default</span>
                <span class="soul-model-id">{{ defaultModelLabel }}</span>
              </button>
              <div v-if="(draftProvider === 'openrouter' && modelsStore.openrouterLoading) || (draftProvider === 'openai' && modelsStore.openaiLoading)" class="soul-model-loading">
                Loading models...
              </div>
              <button
                v-for="m in filteredModels"
                :key="m.id"
                class="soul-model-item"
                :class="{ active: draftModelId === m.id }"
                @click="draftModelId = m.id"
              >
                <span>{{ m.name || m.label || m.id }}</span>
                <span v-if="m.id !== (m.name || m.label)" class="soul-model-id">{{ m.id }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Footer with Save -->
        <div class="soul-footer">
          <div class="soul-footer-left"></div>
          <div class="soul-footer-right">
            <button class="soul-btn secondary" @click="$emit('close')">Cancel</button>
            <button class="soul-btn primary" @click="saveModel">Save</button>
          </div>
        </div>
      </template>

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
import { useModelsStore } from '../../stores/models'

const props = defineProps({
  personaId:          { type: String, required: true },
  personaType:        { type: String, required: true }, // 'system' or 'users'
  personaName:        { type: String, default: 'Persona' },
  personaDescription: { type: String, default: '' },
  personaPrompt:      { type: String, default: '' },
  personaProviderId:  { type: String, default: null },
  personaModelId:     { type: String, default: null },
})

const emit = defineEmits(['close', 'update-persona'])

const modelsStore = useModelsStore()

// ── Tab state ──
const activeTab = ref('summary')

// ── Provider / model draft (AI Model tab) ──
const draftProvider = ref(props.personaProviderId || 'anthropic')
const draftModelId = ref(props.personaModelId || null)
const modelFilter = ref('')

const filteredModels = computed(() => {
  const q = modelFilter.value.trim().toLowerCase()
  const models = modelsStore.getModelsForProvider(draftProvider.value)
  if (!q) return models
  return models.filter(m => (m.name || m.label || '').toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
})

const defaultModelLabel = computed(() => modelsStore.getDefaultModelLabel(draftProvider.value))

const currentModelLabel = computed(() => {
  if (!draftModelId.value) return 'Default'
  const models = modelsStore.getModelsForProvider(draftProvider.value)
  const m = models.find(x => x.id === draftModelId.value)
  return m?.name || m?.label || draftModelId.value
})

function selectProvider(prov) {
  draftProvider.value = prov
  draftModelId.value = null
  modelFilter.value = ''
  if (prov === 'openrouter' && !modelsStore.openrouterCached) modelsStore.fetchOpenRouterModels()
  if (prov === 'openai' && !modelsStore.openaiCached) modelsStore.fetchOpenAIModels()
}

function saveModel() {
  emit('update-persona', {
    providerId: draftProvider.value === 'anthropic' ? null : draftProvider.value,
    modelId: draftModelId.value || null,
  })
  emit('close')
}

// ── Memory & content ──
const loading = ref(true)
const content = ref(null)

const editingMemory = ref(false)
const editContent = ref('')

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
  let text = content.value
  // Replace the raw persona ID with the display name wherever it appears in the soul file
  if (props.personaId && props.personaId !== '__default_user__') {
    text = text.replace(new RegExp(props.personaId, 'g'), props.personaName)
  }
  return marked(text, { breaks: true })
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

onMounted(() => {
  loadContent()
  if (draftProvider.value === 'openrouter' && !modelsStore.openrouterCached) modelsStore.fetchOpenRouterModels()
  if (draftProvider.value === 'openai' && !modelsStore.openaiCached) modelsStore.fetchOpenAIModels()
})
</script>

<style scoped>
.soul-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.soul-modal {
  width: min(700px, 90vw); max-height: 85vh;
  background: #0F0F0F; border: 1px solid #2A2A2A;
  border-radius: 20px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: soul-enter 0.2s ease-out;
}
@keyframes soul-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.soul-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
}
.soul-header-left { display: flex; align-items: center; gap: 10px; }
.soul-header-icon {
  width: 30px; height: 30px; border-radius: 8px;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.soul-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle, 0.95rem);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.soul-meta {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.75rem); color: #4B5563;
}
.soul-close-btn {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280; cursor: pointer; transition: all 0.15s;
}
.soul-close-btn:hover { background: #1F1F1F; color: #FFFFFF; }

/* ── Tab bar ── */
.soul-tabs {
  display: flex; gap: 4px; padding: 8px 20px;
  border-bottom: 1px solid #1F1F1F; flex-shrink: 0;
}
.soul-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.875rem); font-weight: 600;
  color: #6B7280; background: transparent; border: none; cursor: pointer;
  transition: all 0.15s;
}
.soul-tab:hover { color: #9CA3AF; background: #1A1A1A; }
.soul-tab.active {
  color: #FFFFFF;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

/* ── Summary tab body ── */
.soul-body {
  flex: 1; overflow-y: auto; padding: 20px;
  scrollbar-width: thin; scrollbar-color: #333 transparent; min-height: 200px;
}

/* ── Model tab body ── */
.soul-model-body {
  display: flex; flex-direction: column; gap: 0; padding: 20px;
  min-height: 0;
}

/* Persona info card */
.soul-persona-card {
  background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 12px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;
}
.soul-persona-field { display: flex; flex-direction: column; gap: 4px; }
.soul-persona-label {
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; color: #4B5563;
}
.soul-persona-value {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body, 0.875rem);
  color: #9CA3AF; line-height: 1.5;
}
.soul-persona-prompt {
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-secondary, 0.8rem);
  color: #9CA3AF; background: #111111; border: 1px solid #2A2A2A; border-radius: 8px;
  padding: 10px 12px; margin: 0; white-space: pre-wrap; word-break: break-word;
  line-height: 1.6; max-height: 150px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.soul-btn-inline {
  align-self: flex-start; padding: 4px 10px; border-radius: 6px;
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  color: #6B7280; background: #1A1A1A; border: 1px solid #2A2A2A;
  cursor: pointer; transition: all 0.12s; margin-top: 4px;
}
.soul-btn-inline:hover { background: #222222; color: #FFFFFF; border-color: #374151; }
.soul-prompt-actions { display: flex; gap: 6px; margin-top: 6px; }

/* Divider */
.soul-divider {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
}
.soul-divider-label {
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; color: #FFFFFF; white-space: nowrap;
}
.soul-divider-meta {
  font-family: 'Inter', sans-serif; font-size: 11px; color: #4B5563; white-space: nowrap;
}
.soul-divider::after { content: ''; flex: 1; height: 1px; background: #1F1F1F; }

/* Empty state */
.soul-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 80px; color: #4B5563; font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.875rem); text-align: center;
}
.soul-empty p { margin: 4px 0; }
.soul-empty-hint { font-size: var(--fs-secondary, 0.75rem); color: #374151; max-width: 300px; }

.soul-rendered {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body, 0.875rem);
  color: #D1D5DB; line-height: 1.6;
}
.soul-rendered :deep(h1) { font-size: 1.25rem; font-weight: 700; margin: 0 0 8px; color: #FFFFFF; }
.soul-rendered :deep(h2) { font-size: 1rem; font-weight: 600; margin: 16px 0 6px; color: #9CA3AF; }
.soul-rendered :deep(ul) { padding-left: 20px; margin: 4px 0; }
.soul-rendered :deep(li) { margin: 2px 0; }
.soul-rendered :deep(blockquote) { border-left: 3px solid #2A2A2A; padding-left: 12px; color: #6B7280; margin: 8px 0; }
.soul-rendered :deep(code) { font-family: 'JetBrains Mono', monospace; font-size: 0.85em; background: #1A1A1A; padding: 1px 4px; border-radius: 3px; color: #D1D5DB; }

.soul-editor {
  width: 100%; min-height: 120px; padding: 12px;
  border: 1px solid #2A2A2A; border-radius: 10px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-secondary, 0.8rem);
  color: #FFFFFF; background: #1A1A1A; outline: none; resize: vertical;
  line-height: 1.6; box-sizing: border-box; transition: border-color 0.15s;
}
.soul-editor:focus { border-color: #4B5563; }

/* ── Footer ── */
.soul-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; border-top: 1px solid #1F1F1F; background: #0A0A0A;
  flex-shrink: 0;
}
.soul-footer-left, .soul-footer-right { display: flex; gap: 8px; }

.soul-btn {
  padding: 7px 16px; border-radius: 8px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.8rem);
  font-weight: 600; cursor: pointer; border: none; transition: all 0.15s;
}
.soul-btn.primary {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #fff; border: 1px solid #374151;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.soul-btn.primary:hover { background: linear-gradient(135deg, #2D2D2D 0%, #374151 40%, #6B7280 100%); }
.soul-btn.secondary {
  background: #1A1A1A; color: #9CA3AF; border: 1px solid #2A2A2A;
}
.soul-btn.secondary:hover { background: #222222; color: #FFFFFF; border-color: #374151; }
.soul-btn.danger {
  background: transparent; color: #EF4444; border: 1px solid rgba(239,68,68,0.3);
}
.soul-btn.danger:hover { background: rgba(239,68,68,0.1); }

/* ── AI Model tab ── */
.soul-model-section {
  margin-bottom: 20px;
}
.soul-model-section-grow {
  flex: 1; display: flex; flex-direction: column; min-height: 0;
}
.soul-model-section-label {
  display: flex; align-items: center; gap: 8px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600; color: #9CA3AF; margin-bottom: 10px;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.soul-step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
  color: #FFFFFF; font-size: 10px; font-weight: 700;
  flex-shrink: 0;
}
.soul-model-badge {
  font-size: 11px; font-weight: 600; text-transform: none; letter-spacing: 0;
  padding: 2px 8px; border-radius: 6px;
  background: #1F1F1F; color: #9CA3AF;
  font-family: 'JetBrains Mono', monospace;
}
.soul-provider-cards {
  display: flex; gap: 8px;
}
.soul-provider-card {
  flex: 1; padding: 12px 10px; border-radius: 10px;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  cursor: pointer; transition: all 0.15s; text-align: center;
  display: flex; flex-direction: column; gap: 3px;
}
.soul-provider-card:hover { border-color: #4B5563; }
.soul-provider-card.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.soul-provider-card-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.875rem); font-weight: 600;
  color: #9CA3AF; transition: color 0.15s;
}
.soul-provider-card.active .soul-provider-card-name { color: #FFFFFF; }
.soul-provider-card:hover:not(.active) .soul-provider-card-name { color: #D1D5DB; }
.soul-provider-card-sub {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small, 0.75rem);
  color: #4B5563; transition: color 0.15s;
}
.soul-provider-card.active .soul-provider-card-sub { color: rgba(255,255,255,0.5); }
.soul-model-search {
  width: 100%; padding: 8px 12px; border-radius: 8px;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption, 0.8rem); outline: none;
  color: #FFFFFF; transition: border-color 0.15s; margin-bottom: 8px;
  box-sizing: border-box;
}
.soul-model-search:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75,85,99,0.2); }
.soul-model-search::placeholder { color: #4B5563; }
.soul-model-list {
  flex: 1; overflow-y: auto;
  border: 1px solid #2A2A2A; border-radius: 12px;
  display: flex; flex-direction: column;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
  background: #1A1A1A; min-height: 0;
}
.soul-model-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 10px 14px; border: none; background: transparent;
  cursor: pointer; font-family: 'Inter', sans-serif; font-size: var(--fs-caption, 0.8rem);
  font-weight: 500; color: #9CA3AF; text-align: left;
  transition: all 0.12s; border-bottom: 1px solid #1F1F1F; flex-shrink: 0;
}
.soul-model-item:last-child { border-bottom: none; }
.soul-model-item:first-child { border-radius: 11px 11px 0 0; }
.soul-model-item:last-child { border-radius: 0 0 11px 11px; }
.soul-model-item:hover { background: #222222; color: #FFFFFF; }
.soul-model-item.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
}
.soul-model-item.active .soul-model-id { color: rgba(255,255,255,0.4); }
.soul-model-id {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: #4B5563; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 200px;
}
.soul-model-loading {
  padding: 16px; text-align: center; font-size: var(--fs-caption, 0.8rem); color: #4B5563;
}
</style>
