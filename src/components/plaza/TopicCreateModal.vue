<template>
  <Teleport to="body">
    <div class="plaza-modal-backdrop">
      <div class="plaza-modal">
        <div class="plaza-modal-header">
          <div class="plaza-modal-icon">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <h2 class="plaza-modal-title">New Topic</h2>
          <button class="plaza-modal-close" @click="$emit('close')">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="plaza-modal-body">
          <!-- Tabs -->
          <div class="topic-tabs">
            <button :class="['topic-tab', { active: tab === 'describe' }]" @click="tab = 'describe'">Describe it</button>
            <button :class="['topic-tab', { active: tab === 'manual' }]" @click="tab = 'manual'">Manual</button>
          </div>

          <!-- Describe tab -->
          <div v-if="tab === 'describe'" class="topic-form">
            <label class="plaza-label">Describe your topic idea</label>
            <textarea
              v-model="descInput"
              class="plaza-textarea"
              placeholder="e.g. Whether space exploration should be a higher priority than solving problems on Earth..."
              rows="3"
            ></textarea>
            <AppButton
              size="compact"
              @click="generateFromDesc"
              :loading="generating"
              :disabled="!descInput.trim()"
              style="align-self:flex-start;"
            >
              Generate
            </AppButton>
          </div>

          <!-- Shared fields (both tabs) -->
          <div class="topic-form">
            <label class="plaza-label">Title</label>
            <input v-model="title" class="plaza-input" placeholder="Topic title" maxlength="60" />
            <label class="plaza-label">Description</label>
            <textarea v-model="description" class="plaza-textarea" placeholder="Brief description" rows="2" maxlength="200"></textarea>
          </div>

          <p v-if="error" class="plaza-error">{{ error }}</p>
        </div>

        <div class="plaza-modal-footer">
          <AppButton variant="secondary" @click="$emit('close')">Cancel</AppButton>
          <AppButton @click="create" :disabled="!title.trim()">Create Topic</AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useConfigStore } from '../../stores/config'
import AppButton from '../common/AppButton.vue'

const emit = defineEmits(['close', 'created'])

const tab = ref('describe')
const descInput = ref('')
const title = ref('')
const description = ref('')
const generating = ref(false)
const error = ref('')

async function generateFromDesc() {
  if (!descInput.value.trim()) return
  generating.value = true
  error.value = ''
  try {
    const config = JSON.parse(JSON.stringify(useConfigStore().config))
    const res = await window.electronAPI.plaza.generateFromDesc({ description: descInput.value, config })
    if (res.success) {
      title.value = res.title || ''
      description.value = res.description || ''
    } else {
      error.value = res.error || 'Failed to generate topic.'
    }
  } catch (err) {
    error.value = err.message || 'Failed to generate topic.'
  } finally {
    generating.value = false
  }
}

function create() {
  if (!title.value.trim()) return
  const topic = {
    id: uuidv4(),
    title: title.value.trim(),
    description: description.value.trim(),
    isBuiltin: false,
    createdAt: Date.now(),
    lastSessionId: null,
    lastSessionStatus: 'idle',
  }
  emit('created', topic)
  emit('close')
}
</script>

<style>
.plaza-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.plaza-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: var(--radius-xl);
  width: 90%;
  max-width: 32rem;
  box-shadow: 0 25px 60px rgba(0,0,0,0.18);
  animation: plazaModalIn 200ms ease-out;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}
@keyframes plazaModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.plaza-modal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #2A2A2A;
}
.plaza-modal-icon {
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.plaza-modal-title {
  font-size: var(--fs-section);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
  flex: 1;
}
.plaza-modal-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  transition: color 0.15s ease;
}
.plaza-modal-close:hover { color: #FFFFFF; }
.plaza-modal-body {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.plaza-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: #0A0A0A;
  border-top: 1px solid #2A2A2A;
  border-radius: 0 0 var(--radius-xl) var(--radius-xl);
}
.plaza-label {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: rgba(255,255,255,0.7);
}
.plaza-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: var(--radius-sm);
  color: #FFFFFF;
  font-size: var(--fs-body);
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}
.plaza-input:focus { border-color: #4B5563; }
.plaza-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: var(--radius-sm);
  color: #FFFFFF;
  font-size: var(--fs-body);
  font-family: inherit;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s ease;
}
.plaza-textarea:focus { border-color: #4B5563; }
.plaza-error {
  color: #EF4444;
  font-size: var(--fs-caption);
  margin: 0;
}
.topic-tabs {
  display: flex;
  gap: 0.25rem;
  background: #1A1A1A;
  border-radius: var(--radius-sm);
  padding: 0.25rem;
}
.topic-tab {
  flex: 1;
  padding: 0.375rem 0.75rem;
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.5);
  font-size: var(--fs-secondary);
  font-weight: 600;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}
.topic-tab.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}
.topic-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
