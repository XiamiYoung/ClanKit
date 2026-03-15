<template>
  <div class="pmp-row" ref="rootRef">
    <!-- Provider dropdown (hidden in modelOnly mode) -->
    <div v-if="!modelOnly" class="pmp-select-wrap">
      <button class="pmp-trigger" :class="{ 'pmp-selected': provider }" :disabled="disabled" @click="toggleProviderMenu">
        <span>{{ provider ? PROVIDER_LABELS[provider] : 'Select Provider' }}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div v-if="showProviderMenu" class="pmp-menu">
        <button
          v-if="provider"
          class="pmp-option pmp-clear"
          @click="clearSelection"
        >✕ Clear</button>
        <button
          v-for="p in activeProviderOptions"
          :key="p.id"
          class="pmp-option"
          :class="{ active: provider === p.id }"
          @click="selectProvider(p.id)"
        >{{ p.label }}</button>
        <div v-if="activeProviderOptions.length === 0" class="pmp-empty">
          No active providers.
          <a @click="goToConfig">Configure in Settings &rarr;</a>
        </div>
      </div>
    </div>

    <!-- Provider read-only label (modelOnly mode) -->
    <div v-else class="pmp-provider-readonly">{{ providerLabel }}</div>

    <!-- Model dropdown (disabled until provider selected) -->
    <div class="pmp-select-wrap" :class="{ disabled: !provider }">
      <button class="pmp-trigger" :class="{ 'pmp-selected': model }" :disabled="!provider || disabled" @click="toggleModelMenu">
        <span>{{ model || 'Select Model' }}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div v-if="showModelMenu && provider" class="pmp-menu pmp-menu-model">
        <input v-if="provider !== 'anthropic'" v-model="modelSearch" placeholder="Search models..." class="pmp-search" @mousedown.stop />
        <div v-if="modelsLoading" class="pmp-loading">Loading...</div>
        <button
          v-for="m in filteredModels"
          :key="m.id"
          class="pmp-option"
          :class="{ active: model === m.id }"
          @click="selectModel(m.id)"
        >{{ m.id }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '../../stores/config'
import { useModelsStore } from '../../stores/models'
import { useRouter } from 'vue-router'

const PROVIDER_LABELS = {
  anthropic:  'Anthropic',
  openrouter: 'OpenRouter',
  openai:     'OpenAI',
  deepseek:   'DeepSeek',
}

const props = defineProps({
  provider:      { type: String, default: null },
  model:         { type: String, default: null },
  modelOnly:     { type: Boolean, default: false },
  providerLabel: { type: String, default: null },
  disabled:      { type: Boolean, default: false },
})
const emit = defineEmits(['update:provider', 'update:model'])

const configStore = useConfigStore()
const modelsStore = useModelsStore()
const router = useRouter()

const rootRef = ref(null)
const showProviderMenu = ref(false)
const showModelMenu = ref(false)
const modelSearch = ref('')

const activeProviderOptions = computed(() =>
  configStore.config.providers
    .filter(p => p.isActive && p.apiKey && p.baseURL)
    .map(p => ({ 
      id: p.type,
      label: p.name,
      providerId: p.id
    }))
)

const modelsLoading = computed(() => {
  if (props.provider === 'openrouter') return modelsStore.openrouterLoading
  if (props.provider === 'openai')     return modelsStore.openaiLoading
  if (props.provider === 'deepseek')   return modelsStore.deepseekLoading
  return false
})

const allModels = computed(() => modelsStore.getModelsForProvider(props.provider))

const filteredModels = computed(() => {
  const q = modelSearch.value.trim().toLowerCase()
  if (!q) return allModels.value
  return allModels.value.filter(m => m.id.toLowerCase().includes(q))
})

function toggleProviderMenu() {
  showModelMenu.value = false
  showProviderMenu.value = !showProviderMenu.value
}

function toggleModelMenu() {
  if (!props.provider) return
  showProviderMenu.value = false
  showModelMenu.value = !showModelMenu.value
}

function selectProvider(type) {
  // Find the first active provider with this type
  const provider = configStore.config.providers.find(p => p.type === type && p.isActive && p.apiKey)
  if (provider) {
    emit('update:provider', provider.id)
    emit('update:model', null)
  }
  showProviderMenu.value = false
  modelSearch.value = ''
  if (type === 'openrouter' && !modelsStore.openrouterCached) modelsStore.fetchOpenRouterModels()
  if (type === 'openai'     && !modelsStore.openaiCached)     modelsStore.fetchOpenAIModels()
  if (type === 'deepseek'   && !modelsStore.deepseekCached)   modelsStore.fetchDeepSeekModels()
}

function selectModel(id) {
  emit('update:model', id)
  showModelMenu.value = false
}

function clearSelection() {
  emit('update:provider', null)
  emit('update:model', null)
  showProviderMenu.value = false
  modelSearch.value = ''
}

// Auto-clear stale selections when provider is no longer active or model is no longer in list
watch(activeProviderOptions, (opts) => {
  if (props.provider && !opts.find(p => p.id === props.provider)) {
    emit('update:provider', null)
    emit('update:model', null)
  }
})

watch(allModels, (models) => {
  if (props.model && models.length > 0 && !models.find(m => m.id === props.model)) {
    emit('update:model', null)
  }
})

function goToConfig() {
  router.push('/config')
  showProviderMenu.value = false
}

// Close menus on outside click
function onOutsideClick(e) {
  if (rootRef.value && !rootRef.value.contains(e.target)) {
    showProviderMenu.value = false
    showModelMenu.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', onOutsideClick))
onUnmounted(() => document.removeEventListener('mousedown', onOutsideClick))
</script>

<style scoped>
.pmp-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pmp-select-wrap {
  position: relative;
}
.pmp-select-wrap.disabled { opacity: 0.45; pointer-events: none; }

/* Unselected trigger */
.pmp-trigger {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.pmp-trigger:hover {
  border-color: var(--text-primary);
  color: var(--text-primary);
}

/* Selected trigger — black gradient */
.pmp-trigger.pmp-selected {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.pmp-trigger.pmp-selected:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}

/* Dropdown menu */
.pmp-menu {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  min-width: 11.25rem;
  max-height: 16.25rem;
  overflow-y: auto;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2);
  z-index: 1000;
  padding: 0.375rem;
  animation: pmpMenuEnter 0.15s ease-out;
}
.pmp-menu-model { min-width: 16.25rem; }

@keyframes pmpMenuEnter {
  from { opacity: 0; transform: scale(0.96) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.pmp-search {
  width: 100%;
  padding: 0.375rem 0.625rem;
  margin-bottom: 0.25rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  color: #FFFFFF;
  font-size: var(--fs-caption);
  outline: none;
  box-sizing: border-box;
}
.pmp-search:focus { border-color: #4B5563; }
.pmp-search::placeholder { color: #6B7280; }

.pmp-option {
  display: block;
  width: 100%;
  padding: 0.4375rem 0.625rem;
  background: transparent;
  border: none;
  border-radius: 0.5rem;
  color: #9CA3AF;
  font-size: var(--fs-caption);
  font-family: 'JetBrains Mono', monospace;
  text-align: left;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pmp-option:hover,
.pmp-option.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
  color: #FFFFFF;
}

.pmp-clear {
  color: #EF4444;
  border-bottom: 1px solid #1F1F1F;
  margin-bottom: 0.25rem;
  border-radius: 0.5rem 0.5rem 0 0;
}
.pmp-clear:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #FCA5A5;
}

.pmp-empty {
  padding: 0.625rem;
  color: #6B7280;
  font-size: var(--fs-caption);
  text-align: center;
}
.pmp-empty a {
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
}

.pmp-loading {
  padding: 0.625rem;
  color: #6B7280;
  font-size: var(--fs-caption);
  text-align: center;
}

.pmp-provider-readonly {
  padding: 0.375rem 0.75rem;
  background: #1A1A1A;
  border-radius: var(--radius-sm);
  color: rgba(255,255,255,0.6);
  font-size: var(--fs-secondary);
  font-weight: 500;
  white-space: nowrap;
}

/* Thin scrollbar */
.pmp-menu { scrollbar-width: thin; }
.pmp-menu::-webkit-scrollbar { width: 4px; }
.pmp-menu::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }
</style>
