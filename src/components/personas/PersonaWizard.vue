<template>
  <!-- Backdrop -->
  <div class="wiz-backdrop">
    <div class="wiz-modal">
      <!-- Header -->
      <div class="wiz-header">
        <div class="wiz-header-left">
          <div class="wiz-header-icon" :style="{ background: 'linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)' }">
            <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="type === 'system'" d="M12 8V4H8M4 12h16M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1M9 16h0M15 16h0" />
              <path v-else d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
            </svg>
          </div>
          <h2 class="wiz-title">{{ editPersona ? 'Edit' : 'New' }} {{ type === 'system' ? 'System' : 'User' }} Persona</h2>
        </div>
        <button class="wiz-close-btn" @click="$emit('close')" aria-label="Close">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Chat area (hidden in edit mode when no messages) -->
      <div v-if="chatMessages.length > 0" class="wiz-chat" ref="chatEl">
        <div v-for="(msg, i) in chatMessages" :key="i" class="wiz-msg" :class="msg.from">
          <!-- AI message -->
          <template v-if="msg.from === 'ai'">
            <div class="wiz-msg-avatar ai" :style="{ background: 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)' }">
              <svg style="width:14px;height:14px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8"/></svg>
            </div>
            <div class="wiz-msg-bubble ai">
              <p v-html="msg.text"></p>
              <!-- Options if present -->
              <div v-if="msg.options && msg.active" class="wiz-options">
                <button
                  v-for="opt in msg.options"
                  :key="opt.value"
                  class="wiz-option-btn"
                  :class="{ selected: isOptionSelected(opt.value) }"
                  @click="selectOption(msg, opt)"
                >{{ opt.label }}</button>
                <button class="wiz-option-done" @click="confirmOptions">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Done
                </button>
              </div>
              <!-- Avatar picker trigger -->
              <div v-if="msg.avatarPicker && msg.active" class="wiz-avatar-trigger">
                <button class="wiz-pick-avatar-btn" @click="showAvatarPicker = true">
                  <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Browse Avatars
                </button>
                <span v-if="form.avatar" class="wiz-avatar-preview-inline">
                  <img :src="selectedAvatarDataUri" alt="" style="width:44px;height:44px;border-radius:50%;" />
                  <span class="wiz-avatar-selected-label">Selected</span>
                </span>
              </div>
              <!-- Provider combo (system personas only) -->
              <div v-if="msg.providerPicker && msg.active" class="wiz-model-provider">
                <ProviderModelPicker
                  :provider="form.providerId"
                  :model="form.modelId"
                  @update:provider="val => { form.providerId = val; form.modelId = null }"
                  @update:model="val => form.modelId = val"
                />
                <span v-if="showValidation && !form.providerId" class="wiz-error">Provider is required</span>
                <span v-if="showValidation && form.providerId && !form.modelId" class="wiz-error">Model is required</span>
                <button class="wiz-option-done" @click="confirmProviderModel" style="margin-top:8px;">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Continue
                </button>
              </div>
            </div>
          </template>

          <!-- User message -->
          <template v-if="msg.from === 'user'">
            <div class="wiz-msg-bubble user">
              <p>{{ msg.text }}</p>
            </div>
          </template>
        </div>
      </div>

      <!-- Input area (when waiting for text input) -->
      <div v-if="awaitingTextInput" class="wiz-input-bar">
        <textarea
          ref="inputEl"
          v-model="inputText"
          class="wiz-input"
          :placeholder="inputPlaceholder"
          @keydown.enter.exact="submitInput"
          rows="2"
          autofocus
        ></textarea>
        <button
          class="wiz-send-btn"
          :disabled="!inputText.trim()"
          @click="submitInput"
          aria-label="Send"
        >
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>

      <!-- Preview & Save area (final step) -->
      <div v-if="showPreview" class="wiz-preview-body">
        <!-- Avatar display + change button -->
        <div class="wiz-preview-avatar-row">
          <div class="wiz-preview-avatar">
            <img v-if="form.avatar" :src="selectedAvatarDataUri" alt="" style="width:56px;height:56px;border-radius:50%;" />
            <div v-else class="wiz-preview-avatar-placeholder">?</div>
          </div>
          <div class="wiz-preview-avatar-meta">
            <input
              v-model="form.name"
              class="wiz-name-input"
              :placeholder="type === 'system' ? 'Persona name...' : 'Your name or alias...'"
            />
            <button class="wiz-change-avatar-btn" @click="showAvatarPicker = true">Change Avatar</button>
          </div>
        </div>
        <!-- Provider / Model config (system personas) — above prompt -->
        <div v-if="type === 'system'" class="wiz-preview-config">
          <div class="wpc-section">
            <div class="wpc-label">Provider & Model <span style="color:#EF4444">*</span></div>
            <ProviderModelPicker
              :provider="form.providerId"
              :model="form.modelId"
              @update:provider="val => { form.providerId = val; form.modelId = null }"
              @update:model="val => form.modelId = val"
            />
            <span v-if="showValidation && !form.providerId" class="wiz-error">Provider is required</span>
            <span v-if="showValidation && form.providerId && !form.modelId" class="wiz-error">Model is required</span>
          </div>
        </div>
        <!-- Voice selector (system personas) -->
        <div v-if="type === 'system'" class="wiz-preview-config" style="margin-bottom:12px;">
          <div class="wpc-section" style="margin-bottom:0;">
            <div class="wpc-label">
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              TTS Voice
            </div>
            <div class="wpc-btn-row" style="flex-wrap:wrap;">
              <button
                v-for="v in voiceOptions"
                :key="v.value"
                class="wpc-btn"
                :class="{ active: form.voiceId === v.value }"
                :title="v.desc"
                @click="form.voiceId = v.value"
              >{{ v.label }}</button>
            </div>
          </div>
        </div>
        <!-- Generated prompt -->
        <div class="wiz-preview-prompt">
          <label class="wiz-preview-label">Generated prompt (editable)</label>
          <textarea
            v-model="form.generatedPrompt"
            class="wiz-preview-textarea"
          ></textarea>
        </div>
        <!-- AI Enhance row -->
        <div class="wiz-enhance-row">
          <AppButton
            size="compact"
            :disabled="enhancing || !form.generatedPrompt.trim()"
            :loading="enhancing"
            @click="enhancePrompt"
          >
            <svg v-if="!enhancing" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8"/></svg>
            {{ enhancing ? 'Enhancing...' : 'AI Enhance' }}
          </AppButton>
          <AppButton
            v-if="preEnhancePrompt"
            variant="secondary"
            size="compact"
            @click="revertEnhance"
          >Revert</AppButton>
        </div>
      </div>

      <!-- Footer with actions (matches ccm-footer) -->
      <div v-if="showPreview" class="wiz-footer">
        <button class="wiz-cancel-btn" @click="$emit('close')">Cancel</button>
        <button
          class="wiz-done-btn"
          :disabled="!form.generatedPrompt.trim() || saving"
          @click="save"
        >{{ saving ? 'Saving...' : editPersona ? 'Save Changes' : 'Create Persona' }}</button>
      </div>
    </div>

    <!-- Avatar picker dialog -->
    <AvatarPicker
      v-if="showAvatarPicker"
      :currentAvatarId="form.avatar"
      @select="onAvatarPicked"
      @close="showAvatarPicker = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, computed, onMounted } from 'vue'
import { usePersonasStore } from '../../stores/personas'
import { useConfigStore } from '../../stores/config'
import { useModelsStore } from '../../stores/models'
import { getAvatarDataUri } from './personaAvatars'
import AvatarPicker from './AvatarPicker.vue'
import AppButton from '../common/AppButton.vue'
import ProviderModelPicker from '../common/ProviderModelPicker.vue'

const props = defineProps({
  type: { type: String, required: true },
  editPersona: { type: Object, default: null },
})

const emit = defineEmits(['close', 'saved'])
const personasStore = usePersonasStore()
const configStore = useConfigStore()
const modelsStore = useModelsStore()


const chatEl = ref(null)
const inputEl = ref(null)
const inputText = ref('')
const showAvatarPicker = ref(false)

const selectedAvatarDataUri = computed(() => getAvatarDataUri(form.avatar))

const form = reactive({
  name: '',
  avatar: '',
  role: '',
  tone: [],
  customInstructions: '',
  description: '',
  generatedPrompt: '',
  providerId: 'anthropic',
  modelId: '',
  voiceId: 'alloy',
})

const voiceOptions = [
  { value: 'alloy',   label: 'Alloy',   desc: 'Neutral, balanced' },
  { value: 'echo',    label: 'Echo',     desc: 'Warm, rounded' },
  { value: 'fable',   label: 'Fable',    desc: 'Expressive, British' },
  { value: 'onyx',    label: 'Onyx',     desc: 'Deep, authoritative' },
  { value: 'nova',    label: 'Nova',     desc: 'Friendly, upbeat' },
  { value: 'shimmer', label: 'Shimmer',  desc: 'Clear, gentle' },
]

// Chat conversation state
const chatMessages = ref([])
const conversationStep = ref(0)
const awaitingTextInput = ref(false)
const showPreview = ref(false)
const inputPlaceholder = ref('')

// AI Enhance state
const enhancing = ref(false)
const preEnhancePrompt = ref(null)


// Tone options for system personas
const toneOptions = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual',       label: 'Casual' },
  { value: 'concise',      label: 'Concise' },
  { value: 'detailed',     label: 'Detailed' },
  { value: 'friendly',     label: 'Friendly' },
  { value: 'technical',    label: 'Technical' },
  { value: 'creative',     label: 'Creative' },
  { value: 'patient',      label: 'Patient' },
]

function isOptionSelected(value) {
  return form.tone.includes(value)
}

// ── Conversation flows ──────────────────────────────────────────────────

const systemFlow = [
  {
    ai: "Let's create a new AI personality. <strong>What should this AI be called?</strong>",
    field: 'name',
    placeholder: 'e.g. CodeMentor, Aria, DevBot...',
    type: 'text',
  },
  {
    ai: "Now pick an <strong>avatar</strong> for this persona.",
    field: 'avatar',
    type: 'avatar',
  },
  {
    ai: "Looking good! <strong>What is this AI's role or area of expertise?</strong>",
    field: 'role',
    placeholder: 'e.g. Senior Python developer, Creative writing coach...',
    type: 'text',
  },
  {
    ai: "<strong>How should it communicate?</strong> Pick one or more styles, then click Done.",
    field: 'tone',
    type: 'options',
    options: toneOptions,
  },
  {
    ai: "Any <strong>specific instructions or constraints</strong>? Type them below, or type <strong>skip</strong> to continue.",
    field: 'customInstructions',
    placeholder: 'e.g. Always use TypeScript. Respond in bullet points...',
    type: 'text',
  },
  {
    ai: "Select the <strong>AI provider and model</strong> for this persona.",
    field: 'providerModel',
    type: 'provider_picker',
  },
]

const userFlow = [
  {
    ai: "Let's set up your profile. <strong>What's your name or alias?</strong>",
    field: 'name',
    placeholder: 'e.g. John, Team Lead, @jdoe...',
    type: 'text',
  },
  {
    ai: "Now pick an <strong>avatar</strong> for your profile.",
    field: 'avatar',
    type: 'avatar',
  },
  {
    ai: "Nice! <strong>What's your role or background?</strong>",
    field: 'role',
    placeholder: 'e.g. Full-stack developer, Data scientist...',
    type: 'text',
  },
  {
    ai: "<strong>How should AI communicate with you?</strong> Pick one or more styles, then click Done.",
    field: 'tone',
    type: 'options',
    options: toneOptions,
  },
  {
    ai: "What <strong>preferences</strong> should the AI know about? Type them below, or type <strong>skip</strong>.",
    field: 'customInstructions',
    placeholder: 'e.g. I prefer TypeScript. Explain things simply...',
    type: 'text',
  },
]

const flow = computed(() => props.type === 'system' ? systemFlow : userFlow)

function scrollChat() {
  nextTick(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
    if (inputEl.value) inputEl.value.focus()
  })
}

function pushAI(text, opts = {}) {
  chatMessages.value.push({ from: 'ai', text, active: true, ...opts })
  scrollChat()
}

function pushUser(text) {
  chatMessages.value.push({ from: 'user', text })
  scrollChat()
}

function deactivateLastAI() {
  for (let i = chatMessages.value.length - 1; i >= 0; i--) {
    if (chatMessages.value[i].from === 'ai') {
      chatMessages.value[i].active = false
      break
    }
  }
}

function advanceConversation() {
  const step = conversationStep.value
  if (step >= flow.value.length) {
    finishConversation()
    return
  }

  const q = flow.value[step]
  const aiOpts = {}

  if (q.type === 'options') {
    aiOpts.options = q.options
  } else if (q.type === 'avatar') {
    aiOpts.avatarPicker = true
  } else if (q.type === 'provider_picker') {
    aiOpts.providerPicker = true
  }

  pushAI(q.ai, aiOpts)

  if (q.type === 'text') {
    awaitingTextInput.value = true
    inputPlaceholder.value = q.placeholder || 'Type your answer...'
  } else {
    awaitingTextInput.value = false
  }
}

function submitInput(e) {
  if (e) e.preventDefault()
  const text = inputText.value.trim()
  if (!text) return

  const step = conversationStep.value
  const q = flow.value[step]

  pushUser(text)
  deactivateLastAI()

  if (text.toLowerCase() === 'skip') {
    form[q.field] = ''
  } else {
    form[q.field] = text
  }

  inputText.value = ''
  awaitingTextInput.value = false
  conversationStep.value++
  setTimeout(() => advanceConversation(), 350)
}

function selectOption(msg, opt) {
  const idx = form.tone.indexOf(opt.value)
  if (idx >= 0) {
    form.tone.splice(idx, 1)
  } else {
    form.tone.push(opt.value)
  }
}

function confirmOptions() {
  const labels = form.tone.map(v => {
    const o = toneOptions.find(t => t.value === v)
    return o ? o.label : v
  })
  pushUser(labels.length > 0 ? labels.join(', ') : 'No preference')
  deactivateLastAI()
  conversationStep.value++
  setTimeout(() => advanceConversation(), 350)
}

// ── Provider / Model picker ──────────────────────────────────────────────

function confirmProviderModel() {
  if (!form.providerId || !form.modelId) {
    showValidation.value = true
    return
  }
  const parts = [form.providerId]
  if (form.modelId) parts.push(form.modelId)
  pushUser(parts.join(' / '))
  deactivateLastAI()
  conversationStep.value++
  setTimeout(() => advanceConversation(), 350)
}

// ── Avatar ────────────────────────────────────────────────────────────────

function onAvatarPicked(avatarId) {
  form.avatar = avatarId
  showAvatarPicker.value = false

  // If we're still in the avatar step of the flow, advance
  const step = conversationStep.value
  if (step < flow.value.length && flow.value[step].type === 'avatar') {
    pushUser('Avatar selected')
    deactivateLastAI()
    conversationStep.value++
    setTimeout(() => advanceConversation(), 350)
  }
  scrollChat()
}

// ── Finish / Preview ──────────────────────────────────────────────────────

function finishConversation() {
  form.generatedPrompt = generatePrompt()
  form.description = form.role || form.name
  awaitingTextInput.value = false
  showPreview.value = true
}

function generatePrompt() {
  if (props.type === 'system') {
    let p = `You are ${form.name}`
    if (form.role) p += `, a ${form.role}`
    p += '.'
    if (form.tone.length > 0) {
      const labels = form.tone.map(v => toneOptions.find(t => t.value === v)?.label.toLowerCase() || v)
      p += `\nCommunication style: ${labels.join(', ')}.`
    }
    if (form.customInstructions) p += `\n\n${form.customInstructions}`
    return p
  } else {
    let p = `The user you are talking to is ${form.name}`
    if (form.role) p += `, a ${form.role}`
    p += '.'
    if (form.tone.length > 0) {
      const labels = form.tone.map(v => toneOptions.find(t => t.value === v)?.label.toLowerCase() || v)
      p += `\nPreferred communication style: ${labels.join(', ')}.`
    }
    if (form.customInstructions) p += `\nTheir preferences: ${form.customInstructions}`
    return p
  }
}

// ── AI Enhance ────────────────────────────────────────────────────────────

async function enhancePrompt() {
  if (enhancing.value || !form.generatedPrompt.trim()) return
  preEnhancePrompt.value = form.generatedPrompt
  enhancing.value = true

  try {
    const res = await window.electronAPI.runAgent({
      chatId: '__persona_enhance__',
      messages: [
        {
          role: 'user',
          content: `Enhance this ${props.type === 'system' ? 'AI system' : 'user'} persona prompt. Make it more specific, effective, and well-structured while keeping the same intent. Return ONLY the enhanced prompt text, nothing else.\n\nOriginal prompt:\n${form.generatedPrompt}`
        }
      ],
      config: JSON.parse(JSON.stringify(await getConfigForEnhance())),
      enabledAgents: [],
      enabledSkills: [],
      mcpServers: [],
      httpTools: [],
    })
    if (res.success && res.result) {
      form.generatedPrompt = res.result.trim()
    }
  } catch (err) {
    console.error('Enhancement failed:', err.message || err)
  }
  enhancing.value = false
}

async function getConfigForEnhance() {
  if (window.electronAPI?.getConfig) {
    return await window.electronAPI.getConfig()
  }
  return {}
}

function revertEnhance() {
  if (preEnhancePrompt.value) {
    form.generatedPrompt = preEnhancePrompt.value
    preEnhancePrompt.value = null
  }
}

// ── AI Description ────────────────────────────────────────────────────────

const saving = ref(false)
const showValidation = ref(false)

async function generateDescription(prompt) {
  if (!prompt.trim()) return form.name || 'Untitled'
  try {
    const config = await getConfigForEnhance()
    const res = await window.electronAPI.runAgent({
      chatId: '__persona_describe__',
      messages: [{
        role: 'user',
        content: `Read this persona prompt and write a SHORT description (max 10 words) that tells the user who this persona is. Focus on: role, expertise, key character traits. Use clean, simple words. No punctuation at the end. Return ONLY the description, nothing else.\n\nPrompt:\n${prompt}`
      }],
      config: JSON.parse(JSON.stringify(config)),
      enabledAgents: [],
      enabledSkills: [],
      mcpServers: [],
      httpTools: [],
    })
    if (res.success && res.result) {
      return res.result.trim().replace(/\.+$/, '')
    }
  } catch (err) {
    console.error('Description generation failed:', err)
  }
  // Fallback: use name or role
  return form.role || form.name || 'Untitled'
}

// ── Save ──────────────────────────────────────────────────────────────────

async function save() {
  // System personas require provider + model
  if (props.type === 'system' && (!form.providerId || !form.modelId)) {
    showValidation.value = true
    return
  }
  saving.value = true
  try {
    const description = await generateDescription(form.generatedPrompt)
    const persona = {
      ...(props.editPersona || {}),
      type: props.type,
      name: form.name || 'Untitled',
      avatar: form.avatar || 'a1',
      description,
      prompt: form.generatedPrompt.trim(),
      providerId: form.providerId || null,
      modelId: form.modelId || null,
      voiceId: form.voiceId || null,
    }
    await personasStore.savePersona(persona)
    emit('saved')
    emit('close')
  } finally {
    saving.value = false
  }
}

// ── Init / Edit mode ──────────────────────────────────────────────────────

onMounted(() => {
  if (props.editPersona) {
    form.name = props.editPersona.name || ''
    form.avatar = props.editPersona.avatar || ''
    form.role = props.editPersona.role || ''
    form.description = props.editPersona.description || ''
    form.generatedPrompt = props.editPersona.prompt || ''
    form.providerId = props.editPersona.providerId || 'anthropic'
    form.modelId = props.editPersona.modelId || ''
    form.voiceId = props.editPersona.voiceId || 'alloy'
    showPreview.value = true
  } else {
    advanceConversation()
  }
})
</script>

<style scoped>
.wiz-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: wiz-fade 0.15s ease-out;
}
@keyframes wiz-fade { from { opacity: 0; } to { opacity: 1; } }

.wiz-modal {
  width: 900px;
  max-width: 95vw;
  height: 85vh;
  max-height: 85vh;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 20px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: wiz-enter 0.2s ease-out;
}
@keyframes wiz-enter {
  from { opacity: 0; transform: scale(0.95) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* -- Header ---------------------------------------------------------------- */
.wiz-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
}
.wiz-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.wiz-header-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.wiz-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}
.wiz-close-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.12s;
}
.wiz-close-btn:hover { background: #1F1F1F; color: #FFFFFF; }

/* -- Chat area ------------------------------------------------------------- */
.wiz-chat {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: thin;
  scrollbar-color: #374151 transparent;
}
.wiz-chat::-webkit-scrollbar { width: 6px; }
.wiz-chat::-webkit-scrollbar-track { background: transparent; }
.wiz-chat::-webkit-scrollbar-thumb { background: #374151; border-radius: 9999px; }
.wiz-chat::-webkit-scrollbar-thumb:hover { background: #4B5563; }
.wiz-msg { display: flex; gap: 10px; max-width: 92%; }
.wiz-msg.ai { align-self: flex-start; }
.wiz-msg.user { align-self: flex-end; }
.wiz-msg-avatar {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: 2px;
}
.wiz-msg-bubble {
  border-radius: 12px; padding: 10px 14px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); line-height: 1.55;
}
.wiz-msg-bubble.ai { background: #1A1A1A; color: #D1D5DB; border-bottom-left-radius: 4px; }
.wiz-msg-bubble.user { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #fff; border-bottom-right-radius: 4px; }
.wiz-msg-bubble p { margin: 0; }

/* -- Option pills ---------------------------------------------------------- */
.wiz-options { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.wiz-option-btn {
  padding: 5px 12px; border-radius: 9999px; border: 1px solid #2A2A2A;
  background: #1A1A1A; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 500; color: #9CA3AF; cursor: pointer; transition: all 0.15s;
}
.wiz-option-btn:hover { border-color: #4B5563; color: #FFFFFF; background: #222222; }
.wiz-option-btn.selected { border-color: #1A1A1A; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); color: #fff; }
.wiz-option-done {
  padding: 5px 14px; border-radius: 9999px; border: 1.5px solid #374151;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: #fff; cursor: pointer; transition: background 0.15s; display: flex; align-items: center; gap: 4px;
}
.wiz-option-done:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); border-color: #4B5563; }

/* -- Avatar picker trigger ------------------------------------------------- */
.wiz-avatar-trigger {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
}
.wiz-pick-avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  border: 1.5px solid #374151;
  background: rgba(255, 255, 255, 0.05);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
}
.wiz-pick-avatar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.wiz-avatar-preview-inline {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wiz-avatar-selected-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #9CA3AF;
}

/* -- Provider / Model combo ------------------------------------------------ */
.wiz-model-provider {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding: 10px 12px;
  background: #1A1A1A;
  border-radius: 10px;
  border: 1px solid #2A2A2A;
}
.wiz-error {
  font-size: var(--fs-caption);
  color: #EF4444;
  font-weight: 600;
}
.wiz-mp-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.wiz-mp-field label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6B7280;
}
.wiz-mp-select {
  padding: 6px 10px;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  font-size: 0.85rem;
  background: #111111;
  color: #FFFFFF;
  outline: none;
  transition: border-color 0.15s;
}
.wiz-mp-select:focus {
  border-color: #4B5563;
}

/* -- Input bar ------------------------------------------------------------- */
.wiz-input-bar {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 14px 24px; border-top: 1px solid #1F1F1F; background: #0A0A0A;
  flex-shrink: 0;
}
.wiz-input {
  flex: 1; padding: 10px 14px; border: 1px solid #2A2A2A; border-radius: 10px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: #FFFFFF;
  background: #1A1A1A; outline: none; transition: border-color 0.15s; box-sizing: border-box;
  resize: none; line-height: 1.5; min-height: 44px; max-height: 120px;
}
.wiz-input:focus { border-color: #4B5563; }
.wiz-input::placeholder { color: #4B5563; }
.wiz-send-btn {
  width: 38px; height: 38px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.15s; flex-shrink: 0;
}
.wiz-send-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.wiz-send-btn:disabled { background: #2A2A2A; color: #4B5563; cursor: not-allowed; }

/* -- Preview body (scrollable content area) -------------------------------- */
.wiz-preview-body {
  border-top: 1px solid #1F1F1F; padding: 20px 24px; background: #0A0A0A;
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
.wiz-preview-avatar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.wiz-preview-avatar-placeholder {
  width: 56px; height: 56px; border-radius: 50%; background: #1F1F1F;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; color: #4B5563;
}
.wiz-preview-avatar-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.wiz-name-input {
  width: 100%;
  padding: 7px 12px;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  color: #FFFFFF;
  background: #1A1A1A;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.wiz-name-input:focus { border-color: #4B5563; }
.wiz-name-input::placeholder { color: #4B5563; font-weight: 400; }
.wiz-change-avatar-btn {
  padding: 6px 14px; border-radius: 8px; border: 1px solid #2A2A2A;
  background: #1A1A1A; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #FFFFFF; cursor: pointer; transition: background 0.15s, border-color 0.15s;
}
.wiz-change-avatar-btn:hover { background: #222222; border-color: #374151; }
.wiz-preview-prompt {
  flex: 1; min-height: 120px; display: flex; flex-direction: column;
}
.wiz-preview-label {
  display: block; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #6B7280; margin-bottom: 6px; flex-shrink: 0;
}
.wiz-preview-textarea {
  width: 100%; flex: 1; min-height: 80px; padding: 10px 12px; border: 1px solid #2A2A2A; border-radius: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-secondary);
  color: #FFFFFF; background: #1A1A1A; outline: none; resize: none; line-height: 1.6;
  box-sizing: border-box; transition: border-color 0.15s;
}
.wiz-preview-textarea:focus { border-color: #4B5563; }

/* -- Enhance row ----------------------------------------------------------- */
.wiz-enhance-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

/* -- Preview config (provider/model) ---------------------------------------- */
.wiz-preview-config {
  margin-bottom: 16px;
  padding: 12px 14px;
  background: #1A1A1A;
  border-radius: 10px;
  border: 1px solid #2A2A2A;
  flex-shrink: 0;
}
.wpc-section {
  margin-bottom: 10px;
}
.wpc-section:last-child {
  margin-bottom: 0;
}
.wpc-label {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6B7280;
  padding: 0 2px 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.wpc-btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.wpc-btn {
  flex: 1;
  min-width: 70px;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid #2A2A2A;
  background: #111111;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.12s;
  text-align: center;
}
.wpc-btn:hover {
  border-color: #4B5563;
  background: #1A1A1A;
  color: #D1D5DB;
}
.wpc-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
/* -- Footer (matches ccm-footer) ------------------------------------------- */
.wiz-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
  flex-shrink: 0;
}
.wiz-cancel-btn {
  padding: 8px 20px;
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  background: transparent;
  color: #6B7280;
  border: 1px solid #2A2A2A;
  cursor: pointer;
  transition: all 0.15s;
}
.wiz-cancel-btn:hover {
  border-color: #4B5563;
  color: #9CA3AF;
  background: #1A1A1A;
}
.wiz-done-btn {
  padding: 8px 24px;
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
  border: 1px solid #374151;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.wiz-done-btn:hover {
  background: linear-gradient(135deg, #2D2D2D 0%, #374151 40%, #6B7280 100%);
  border-color: #4B5563;
}
.wiz-done-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* -- ComboBox dark overrides (inside wizard) ------------------------------- */
.wiz-preview-body :deep(.combo-box),
.wiz-chat :deep(.combo-box) {
  background: #111111;
  border-color: #2A2A2A;
}
.wiz-preview-body :deep(.combo-box:focus-within),
.wiz-chat :deep(.combo-box:focus-within) {
  border-color: #4B5563;
  box-shadow: 0 0 0 3px rgba(75, 85, 99, 0.2);
}
.wiz-preview-body :deep(.combo-input),
.wiz-preview-body :deep(.combo-multi-input),
.wiz-chat :deep(.combo-input),
.wiz-chat :deep(.combo-multi-input) {
  color: #FFFFFF;
}
.wiz-preview-body :deep(.combo-input::placeholder),
.wiz-preview-body :deep(.combo-multi-input::placeholder),
.wiz-chat :deep(.combo-input::placeholder),
.wiz-chat :deep(.combo-multi-input::placeholder) {
  color: #4B5563;
}
.wiz-preview-body :deep(.combo-dropdown),
.wiz-chat :deep(.combo-dropdown) {
  background: #1A1A1A;
  border-color: #2A2A2A;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2);
}
.wiz-preview-body :deep(.combo-option-name),
.wiz-chat :deep(.combo-option-name) {
  color: #9CA3AF;
}
.wiz-preview-body :deep(.combo-option:hover),
.wiz-chat :deep(.combo-option:hover) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
}
.wiz-preview-body :deep(.combo-option:hover .combo-option-name),
.wiz-chat :deep(.combo-option:hover .combo-option-name) {
  color: #FFFFFF;
}

@media (prefers-reduced-motion: reduce) {
  .wiz-backdrop, .wiz-modal, .wiz-option-btn, .wiz-pick-avatar-btn, .wiz-send-btn { transition: none; animation: none; }
}
</style>
