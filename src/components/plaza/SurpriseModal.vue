<template>
  <Teleport to="body">
    <div class="surprise-backdrop">
      <div class="surprise-modal">
        <div class="surprise-header">
          <div class="surprise-icon">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <h2 class="surprise-title">Surprise Me</h2>
          <button class="surprise-close" @click="$emit('close')">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="surprise-body">
          <!-- Language selector -->
          <div class="surprise-lang-row">
            <label class="surprise-label">Language</label>
            <select v-model="lang" class="surprise-lang-select" :disabled="loading">
              <option value="en">English</option>
              <option value="zh">Chinese</option>
            </select>
          </div>

          <!-- Loading state -->
          <div v-if="loading" class="surprise-loading">
            <div class="surprise-spinner"></div>
            <span>Generating...</span>
          </div>

          <!-- Error state -->
          <div v-else-if="error" class="surprise-error">
            <p>{{ error }}</p>
          </div>

          <!-- Generated content -->
          <div v-else-if="generatedTopic" class="surprise-result">
            <div class="surprise-topic-card">
              <h3 class="surprise-topic-title">{{ generatedTopic.title }}</h3>
              <p class="surprise-topic-desc">{{ generatedTopic.description }}</p>
            </div>

            <label class="surprise-label" style="margin-top:0.75rem;">Selected Agents</label>
            <div class="surprise-agents">
              <div v-for="id in generatedAgentIds" :key="id" class="surprise-agent-chip">
                <img v-if="agentAvatarUri(id)" :src="agentAvatarUri(id)" alt="" class="surprise-agent-avatar" />
                <div v-else class="surprise-agent-fallback">{{ (agentName(id))[0].toUpperCase() }}</div>
                <span class="surprise-agent-name">{{ agentName(id) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="surprise-footer">
          <button class="surprise-btn-secondary" @click="$emit('close')">Cancel</button>
          <button class="surprise-btn-rotate" @click="generate" :disabled="loading">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Rotate
          </button>
          <button class="surprise-btn-primary" @click="confirm" :disabled="loading || !generatedTopic">
            Confirm
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { usePlazaStore } from '../../stores/plaza'
import { useAgentsStore } from '../../stores/agents'
import { getAvatarDataUri } from '../agents/agentAvatars'

const props = defineProps({
  language: { type: String, default: 'en' },
})

const emit = defineEmits(['close', 'confirm'])

const plazaStore = usePlazaStore()
const agentsStore = useAgentsStore()

const lang = ref(props.language)
const loading = ref(false)
const error = ref('')
const generatedTopic = ref(null)
const generatedAgentIds = ref([])

function agentName(id) {
  const a = (agentsStore.agents || []).find(x => x.id === id)
  return a?.name || 'Agent'
}

function agentAvatarUri(id) {
  const a = (agentsStore.agents || []).find(x => x.id === id)
  return a?.avatar ? getAvatarDataUri(a.avatar) : null
}

async function generate() {
  loading.value = true
  error.value = ''
  generatedTopic.value = null
  generatedAgentIds.value = []
  try {
    const res = await plazaStore.surpriseMe(lang.value)
    if (res.success) {
      generatedTopic.value = res.topic
      generatedAgentIds.value = res.agentIds || []
    } else {
      error.value = res.error || 'Failed to generate.'
    }
  } catch (err) {
    error.value = err.message || 'Unexpected error.'
  } finally {
    loading.value = false
  }
}

function confirm() {
  if (!generatedTopic.value) return
  emit('confirm', {
    topic: generatedTopic.value,
    agentIds: generatedAgentIds.value,
  })
}

// Auto-generate on mount
onMounted(() => {
  generate()
})

// Re-generate when language changes
watch(lang, () => {
  generate()
})
</script>

<style>
.surprise-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(6px);
}
.surprise-modal {
  width: 28rem;
  max-height: 80vh;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 16px;
  box-shadow: 0 25px 60px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  animation: surpriseIn 200ms ease-out;
}
@keyframes surpriseIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.surprise-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #2A2A2A;
}
.surprise-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.surprise-title {
  flex: 1;
  font-size: 1.0625rem;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}
.surprise-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 6px;
  transition: all 0.15s ease;
}
.surprise-close:hover {
  color: #FFFFFF;
  background: rgba(255,255,255,0.08);
}
.surprise-body {
  padding: 1rem 1.25rem;
  overflow-y: auto;
  flex: 1;
}
.surprise-lang-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.surprise-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(255,255,255,0.6);
}
.surprise-lang-select {
  padding: 0.3125rem 0.5rem;
  border-radius: 8px;
  border: 1px solid #2A2A2A;
  background: #1A1A1A;
  color: #FFFFFF;
  font-size: 0.8125rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s ease;
}
.surprise-lang-select:focus {
  border-color: #4B5563;
}
.surprise-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2.5rem 0;
  color: rgba(255,255,255,0.5);
  font-size: 0.875rem;
}
.surprise-spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid #2A2A2A;
  border-top-color: #FFFFFF;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.surprise-error {
  padding: 1rem;
  color: #EF4444;
  font-size: 0.875rem;
  text-align: center;
}
.surprise-error p { margin: 0; }
.surprise-result {
  animation: resultIn 200ms ease-out;
}
@keyframes resultIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.surprise-topic-card {
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  padding: 0.875rem 1rem;
}
.surprise-topic-title {
  font-size: 1rem;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0 0 0.375rem;
  line-height: 1.4;
}
.surprise-topic-desc {
  font-size: 0.875rem;
  color: rgba(255,255,255,0.5);
  margin: 0;
  line-height: 1.5;
}
.surprise-agents {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.surprise-agent-chip {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 9999px;
  padding: 0.25rem 0.625rem 0.25rem 0.25rem;
}
.surprise-agent-avatar {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  object-fit: cover;
}
.surprise-agent-fallback {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #0F0F0F 0%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: 0.6875rem;
  font-weight: 700;
}
.surprise-agent-name {
  font-size: 0.8125rem;
  color: #FFFFFF;
  font-weight: 500;
}
.surprise-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #2A2A2A;
  background: #0A0A0A;
  border-radius: 0 0 16px 16px;
}
.surprise-btn-secondary {
  padding: 0.4375rem 0.875rem;
  border-radius: 8px;
  border: none;
  background: #1A1A1A;
  color: rgba(255,255,255,0.6);
  font-size: 0.875rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}
.surprise-btn-secondary:hover {
  background: #2A2A2A;
  color: #FFFFFF;
}
.surprise-btn-rotate {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.875rem;
  border-radius: 8px;
  border: 1px solid #2A2A2A;
  background: transparent;
  color: #FFFFFF;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: auto;
}
.surprise-btn-rotate:hover:not(:disabled) {
  background: rgba(255,255,255,0.06);
  border-color: #4B5563;
}
.surprise-btn-rotate:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.surprise-btn-primary {
  padding: 0.4375rem 1rem;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  transition: all 0.15s ease;
}
.surprise-btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.surprise-btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
