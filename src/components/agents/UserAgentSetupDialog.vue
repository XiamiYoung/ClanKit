<template>
  <Teleport to="body">
    <div class="uasd-backdrop">
      <div class="uasd-modal">
        <!-- Header -->
        <div class="uasd-header">
          <div class="uasd-icon">
            <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="7" r="4"/><path d="M5.5 21a7.5 7.5 0 0 1 13 0"/>
            </svg>
          </div>
          <div>
            <h2 class="uasd-title">{{ t('agents.setupDialogTitle') }}</h2>
            <p class="uasd-subtitle">{{ t('agents.setupDialogSubtitle') }}</p>
          </div>
        </div>

        <!-- Form -->
        <div class="uasd-body">
          <div class="uasd-field">
            <label class="uasd-label">{{ t('agents.setupName') }}</label>
            <input
              v-model="form.name"
              class="uasd-input"
              :placeholder="t('agents.setupNamePlaceholder')"
              @keydown.enter="focusNext('age')"
            />
          </div>
          <div class="uasd-row">
            <div class="uasd-field">
              <label class="uasd-label">{{ t('agents.setupAge') }}</label>
              <input
                ref="ageRef"
                v-model="form.age"
                class="uasd-input"
                :placeholder="t('agents.setupAgePlaceholder')"
                type="number"
                min="1"
                max="120"
                @keydown.enter="focusNext('occupation')"
              />
            </div>
            <div class="uasd-field" style="flex:2;">
              <label class="uasd-label">{{ t('agents.setupOccupation') }}</label>
              <input
                ref="occupationRef"
                v-model="form.occupation"
                class="uasd-input"
                :placeholder="t('agents.setupOccupationPlaceholder')"
                @keydown.enter="generate"
              />
            </div>
          </div>

          <!-- AI Generate button + hint -->
          <div class="uasd-generate-row">
            <button
              class="uasd-generate-btn"
              :disabled="!canGenerate || generating"
              @click="generate"
            >
              <svg v-if="!generating" style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span v-if="generating" class="uasd-spinner"></span>
              {{ generating ? t('agents.setupGenerating') : t('agents.setupGenerate') }}
            </button>
            <span class="uasd-generate-hint">{{ t('agents.setupGenerateHint') }}</span>
          </div>

          <!-- Error -->
          <p v-if="generateError" class="uasd-error">{{ t('agents.setupGenerateError') }}</p>

          <!-- Generated preview -->
          <template v-if="generated">
            <div class="uasd-preview-field">
              <label class="uasd-label">{{ t('agents.agentDescription') }}</label>
              <textarea v-model="generated.description" class="uasd-textarea" rows="2" />
            </div>
            <div class="uasd-preview-field">
              <label class="uasd-label">{{ t('agents.agentDefinition') }}</label>
              <textarea v-model="generated.prompt" class="uasd-textarea" rows="4" />
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="uasd-footer">
          <button class="uasd-btn-text" @click="$emit('close')">{{ t('common.cancel') }}</button>
          <AppButton
            variant="primary"
            size="modal"
            :disabled="!form.name.trim()"
            @click="confirm"
          >
            {{ t('agents.setupContinue') }}
          </AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useConfigStore } from '../../stores/config'
import AppButton from '../common/AppButton.vue'

const emit = defineEmits(['close', 'confirm'])

const { t, locale } = useI18n()
const configStore = useConfigStore()

const form = ref({ name: '', age: '', occupation: '' })
const generating = ref(false)
const generateError = ref(false)
const generated = ref(null)

const ageRef = ref(null)
const occupationRef = ref(null)

const canGenerate = computed(() => form.value.name.trim() || form.value.occupation.trim())

function focusNext(field) {
  if (field === 'age') ageRef.value?.focus()
  else if (field === 'occupation') occupationRef.value?.focus()
}

async function generate() {
  if (!canGenerate.value || generating.value) return
  generating.value = true
  generateError.value = false
  generated.value = null

  const isZh = locale.value === 'zh'
  const parts = []
  if (form.value.name.trim()) parts.push(isZh ? `姓名：${form.value.name.trim()}` : `Name: ${form.value.name.trim()}`)
  if (form.value.age) parts.push(isZh ? `年龄：${form.value.age}` : `Age: ${form.value.age}`)
  if (form.value.occupation.trim()) parts.push(isZh ? `职业：${form.value.occupation.trim()}` : `Occupation: ${form.value.occupation.trim()}`)

  const langInstruction = isZh
    ? '请用中文回答。'
    : 'Reply in English.'

  const prompt = isZh
    ? `根据以下用户基本信息，为一个AI助手应用中的"用户画像"角色生成：
1. 一句话简短描述（description），介绍这个用户是谁，不超过30字
2. 一段详细的角色提示词（prompt），描述这个用户的背景、性格、沟通风格和偏好，用于指导AI扮演这个用户角色，200字以内

${parts.join('\n')}

请严格按以下JSON格式输出，不要有任何多余内容：
{"description":"...","prompt":"..."}`
    : `Based on the following user information, generate for a user persona in an AI assistant app:
1. A short one-sentence description (max 20 words) of who this person is
2. A detailed persona prompt (max 150 words) describing their background, personality, communication style and preferences, to guide the AI in roleplaying as this user

${parts.join('\n')}

Reply strictly in this JSON format with no extra text:
{"description":"...","prompt":"..."}`

  try {
    const config = JSON.parse(JSON.stringify(configStore.config || {}))
    const res = await window.electronAPI.enhancePrompt({ prompt, config })
    if (!res.success) throw new Error(res.error)

    // Parse JSON from response, tolerating markdown code fences
    let text = res.text.trim()
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) text = fence[1].trim()
    const parsed = JSON.parse(text)
    generated.value = {
      description: parsed.description || '',
      prompt: parsed.prompt || '',
    }
  } catch {
    generateError.value = true
  } finally {
    generating.value = false
  }
}

function confirm() {
  if (!form.value.name.trim()) return
  emit('confirm', {
    name: form.value.name.trim(),
    description: generated.value?.description || '',
    prompt: generated.value?.prompt || '',
  })
}
</script>

<style scoped>
.uasd-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.uasd-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: min(30rem, 92vw);
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  animation: uasd-enter 0.18s ease-out;
}

@keyframes uasd-enter {
  from { opacity: 0; transform: scale(0.96) translateY(0.5rem); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

.uasd-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid #1F1F1F;
}

.uasd-icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.625rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.uasd-title {
  font-size: var(--fs-section, 1.0625rem);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0 0 0.125rem;
  letter-spacing: -0.01em;
}

.uasd-subtitle {
  font-size: var(--fs-secondary, 0.875rem);
  color: #6B7280;
  margin: 0;
}

.uasd-body {
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.uasd-row {
  display: flex;
  gap: 0.75rem;
}

.uasd-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
}

.uasd-label {
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 500;
  color: #9CA3AF;
}

.uasd-input {
  padding: 0.5rem 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-size: var(--fs-body, 0.9375rem);
  color: #FFFFFF;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.uasd-input:focus {
  border-color: #4B5563;
}

.uasd-input[type="number"]::-webkit-inner-spin-button {
  opacity: 0.4;
}

.uasd-generate-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.uasd-generate-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.875rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: 1px solid #374151;
  border-radius: 0.5rem;
  font-family: inherit;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  color: #D1D5DB;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.uasd-generate-btn:hover:not(:disabled) {
  border-color: #6B7280;
  color: #fff;
}

.uasd-generate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.uasd-generate-hint {
  font-size: 0.75rem;
  color: #6B7280;
  line-height: 1.4;
}

.uasd-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #4B5563;
  border-top-color: #D1D5DB;
  border-radius: 50%;
  animation: uasd-spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes uasd-spin {
  to { transform: rotate(360deg); }
}

.uasd-error {
  font-size: 0.75rem;
  color: #F87171;
  margin: 0;
}

.uasd-preview-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.uasd-textarea {
  padding: 0.5rem 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-size: var(--fs-secondary, 0.875rem);
  color: #FFFFFF;
  font-family: inherit;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s;
  line-height: 1.5;
}

.uasd-textarea:focus {
  border-color: #4B5563;
}

.uasd-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
  border-radius: 0 0 1rem 1rem;
}

.uasd-btn-text {
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  color: #6B7280;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s;
  font-family: inherit;
}

.uasd-btn-text:hover {
  color: #9CA3AF;
}
</style>
