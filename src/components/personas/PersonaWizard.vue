<template>
  <!-- Backdrop -->
  <div class="wiz-backdrop">
    <div class="wiz-modal">
      <!-- Header -->
      <div class="wiz-header">
        <div class="wiz-header-left">
          <div class="wiz-header-icon" :style="{ background: 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)' }">
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
                <div class="wiz-mp-field">
                  <label>AI Provider</label>
                  <select v-model="form.providerId" class="wiz-mp-select">
                    <option value="anthropic">Anthropic</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>
                <div class="wiz-mp-field">
                  <label>Model</label>
                  <ComboBox
                    :model-value="form.modelId"
                    :options="modelComboOptions"
                    placeholder="Search or type model ID..."
                    @update:model-value="onModelComboChange"
                  />
                </div>
                <button class="wiz-option-done" @click="confirmProviderModel" style="margin-top:8px;">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Continue
                </button>
              </div>
              <!-- Tool mapping (system personas only) -->
              <div v-if="msg.toolPicker && msg.active" class="wiz-tool-picker">
                <ComboBox
                  v-if="toolComboOptions.length > 0"
                  :model-value="form.enabledToolIds"
                  :options="toolComboOptions"
                  placeholder="Search tools..."
                  :multiple="true"
                  @update:model-value="form.enabledToolIds = $event"
                />
                <div v-else class="wiz-tool-empty">No HTTP tools configured yet.</div>
                <div class="wiz-tool-actions">
                  <button class="wiz-option-btn" @click="selectAllTools">All</button>
                  <button class="wiz-option-btn" @click="clearAllTools">None</button>
                  <button class="wiz-option-done" @click="confirmTools">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Continue ({{ form.enabledToolIds.length }} selected)
                  </button>
                </div>
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
      <div v-if="showPreview" class="wiz-preview-bar">
        <!-- Avatar display + change button -->
        <div class="wiz-preview-avatar-row">
          <div class="wiz-preview-avatar">
            <img v-if="form.avatar" :src="selectedAvatarDataUri" alt="" style="width:56px;height:56px;border-radius:50%;" />
            <div v-else class="wiz-preview-avatar-placeholder">?</div>
          </div>
          <button class="wiz-change-avatar-btn" @click="showAvatarPicker = true">Change Avatar</button>
        </div>
        <!-- Provider / Model / Tools config (system personas) — above prompt -->
        <div v-if="type === 'system'" class="wiz-preview-config">
          <!-- Provider -->
          <div class="wpc-section">
            <div class="wpc-label">Provider</div>
            <div class="wpc-btn-row">
              <button
                v-for="prov in ['anthropic', 'openrouter', 'openai']"
                :key="prov"
                class="wpc-btn"
                :class="{ active: form.providerId === prov }"
                @click="onPreviewProviderChange(prov)"
              >{{ prov === 'anthropic' ? 'Anthropic' : prov === 'openrouter' ? 'OpenRouter' : 'OpenAI' }}</button>
            </div>
          </div>
          <!-- Model -->
          <div class="wpc-section">
            <div class="wpc-label">Model</div>
            <ComboBox
              :model-value="form.modelId"
              :options="modelComboOptions"
              placeholder="Search models..."
              @update:model-value="onModelComboChange"
            />
          </div>
          <!-- Tools -->
          <div class="wpc-section">
            <div class="wpc-label">Tools <span class="wpc-tool-count">{{ form.enabledToolIds.length }}/{{ availableTools.length }}</span></div>
            <ComboBox
              v-if="availableTools.length > 0"
              :model-value="form.enabledToolIds"
              :options="toolComboOptions"
              placeholder="Search tools..."
              :multiple="true"
              @update:model-value="form.enabledToolIds = $event"
            />
            <div v-else class="wpc-tool-empty">No HTTP tools configured yet.</div>
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
        <div class="wiz-preview-actions">
          <AppButton variant="secondary" size="modal" @click="$emit('close')">Cancel</AppButton>
          <AppButton size="modal" :disabled="!form.generatedPrompt.trim() || saving" :loading="saving" @click="save">
            {{ saving ? 'Saving...' : editPersona ? 'Save Changes' : 'Create Persona' }}
          </AppButton>
        </div>
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
import { useToolsStore } from '../../stores/tools'
import { useConfigStore } from '../../stores/config'
import { useModelsStore } from '../../stores/models'
import { getAvatarDataUri } from './personaAvatars'
import AvatarPicker from './AvatarPicker.vue'
import AppButton from '../common/AppButton.vue'
import ComboBox from '../common/ComboBox.vue'

const props = defineProps({
  type: { type: String, required: true },
  editPersona: { type: Object, default: null },
})

const emit = defineEmits(['close', 'saved'])
const personasStore = usePersonasStore()
const toolsStore = useToolsStore()
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
  enabledToolIds: [],
})

// Chat conversation state
const chatMessages = ref([])
const conversationStep = ref(0)
const awaitingTextInput = ref(false)
const showPreview = ref(false)
const inputPlaceholder = ref('')

// AI Enhance state
const enhancing = ref(false)
const preEnhancePrompt = ref(null)

// Available tools from store
const availableTools = computed(() => toolsStore.tools || [])

// ComboBox options for model selector (adapts modelsStore shape to ComboBox shape)
const modelComboOptions = computed(() => {
  const p = form.providerId || 'anthropic'
  return modelsStore.getModelsForProvider(p).map(m => ({
    id: m.id,
    name: m.label || m.name || m.id,
    detail: m.id,
  }))
})

// ComboBox options for tools multi-selector
const toolComboOptions = computed(() =>
  availableTools.value.map(t => ({
    id: t.id,
    name: t.name,
    detail: t.description || 'HTTP tool',
  }))
)

function onModelComboChange(val) {
  form.modelId = val
}

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
    ai: "Select the <strong>AI provider and model</strong> for this persona. You can leave defaults to inherit from global config.",
    field: 'providerModel',
    type: 'provider_picker',
  },
  {
    ai: "Which <strong>HTTP tools</strong> should this persona have access to? Select the ones you want, or skip.",
    field: 'tools',
    type: 'tool_picker',
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
  } else if (q.type === 'tool_picker') {
    aiOpts.toolPicker = true
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
  // Auto-fill default model if provider is set but model is not
  if (form.providerId && !form.modelId) {
    form.modelId = getDefaultModelForProvider(form.providerId)
  }
  const parts = [form.providerId]
  if (form.modelId) parts.push(form.modelId)
  pushUser(parts.join(' / '))
  deactivateLastAI()
  conversationStep.value++
  setTimeout(() => advanceConversation(), 350)
}

function getDefaultModelForProvider(provider) {
  const c = configStore.config
  if (provider === 'anthropic') {
    return configStore.activeModelId || ''
  } else if (provider === 'openrouter') {
    return c.openrouterDefaultModel || c.openrouterModel || ''
  } else if (provider === 'openai') {
    return c.openaiDefaultModel || c.openaiModel || ''
  }
  return ''
}

function onPreviewProviderChange(prov) {
  form.providerId = prov
  const defaultModel = getDefaultModelForProvider(prov)
  form.modelId = defaultModel
}

// ── Tool picker ──────────────────────────────────────────────────────────

function toggleToolId(id) {
  const idx = form.enabledToolIds.indexOf(id)
  if (idx >= 0) form.enabledToolIds.splice(idx, 1)
  else form.enabledToolIds.push(id)
}

function selectAllTools() {
  form.enabledToolIds = availableTools.value.map(t => t.id)
}

function clearAllTools() {
  form.enabledToolIds = []
}

function confirmTools() {
  pushUser(`${form.enabledToolIds.length} tool(s) selected`)
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
      enabledToolIds: form.enabledToolIds.length > 0 ? [...form.enabledToolIds] : null,
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
    form.enabledToolIds = props.editPersona.enabledToolIds ? [...props.editPersona.enabledToolIds] : []
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
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wiz-modal {
  width: min(1100px, 90vw);
  height: 92vh;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 20px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* -- Header ---------------------------------------------------------------- */
.wiz-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #E5E5EA;
}
.wiz-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.wiz-header-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wiz-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.wiz-close-btn {
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
.wiz-close-btn:hover { background: #F5F5F5; }

/* -- Chat area ------------------------------------------------------------- */
.wiz-chat {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: thin;
}
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
.wiz-msg-bubble.ai { background: #F5F5F5; color: #1A1A1A; border-bottom-left-radius: 4px; }
.wiz-msg-bubble.user { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #fff; border-bottom-right-radius: 4px; }
.wiz-msg-bubble p { margin: 0; }

/* -- Option pills ---------------------------------------------------------- */
.wiz-options { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.wiz-option-btn {
  padding: 5px 12px; border-radius: 9999px; border: 1px solid #D1D1D6;
  background: #fff; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 500; color: #6B7280; cursor: pointer; transition: all 0.15s;
}
.wiz-option-btn:hover { border-color: #1A1A1A; color: #1A1A1A; background: rgba(0,0,0,0.03); }
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
  border: 1.5px solid #1A1A1A;
  background: rgba(0, 0, 0, 0.03);
  color: #1A1A1A;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
}
.wiz-pick-avatar-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
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
  color: #1A1A1A;
}

/* -- Provider / Model combo ------------------------------------------------ */
.wiz-model-provider {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding: 10px 12px;
  background: #F9FAFB;
  border-radius: 10px;
  border: 1px solid #E5E5EA;
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
  border: 1px solid #E5E5EA;
  border-radius: 8px;
  font-size: 0.85rem;
  background: #FFFFFF;
  color: #1A1A1A;
  outline: none;
  transition: border-color 0.15s;
}
.wiz-mp-select:focus {
  border-color: #1A1A1A;
}

/* -- Tool picker ----------------------------------------------------------- */
.wiz-tool-picker {
  margin-top: 10px;
  padding: 10px 12px;
  background: #F9FAFB;
  border-radius: 10px;
  border: 1px solid #E5E5EA;
}
.wiz-tool-empty {
  padding: 12px;
  text-align: center;
  color: #9CA3AF;
  font-size: 0.85rem;
}
.wiz-tool-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #E5E5EA;
}

/* -- Input bar ------------------------------------------------------------- */
.wiz-input-bar {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 12px 16px; border-top: 1px solid #E5E5EA; background: #F9F9F9;
}
.wiz-input {
  flex: 1; padding: 10px 14px; border: 1px solid #E5E5EA; border-radius: 10px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: #1A1A1A;
  background: #fff; outline: none; transition: border-color 0.15s; box-sizing: border-box;
  resize: none; line-height: 1.5; min-height: 44px; max-height: 120px;
}
.wiz-input:focus { border-color: #1A1A1A; }
.wiz-send-btn {
  width: 38px; height: 38px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.15s; flex-shrink: 0;
}
.wiz-send-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.wiz-send-btn:disabled { background: #D1D1D6; cursor: not-allowed; }

/* -- Preview bar ----------------------------------------------------------- */
.wiz-preview-bar {
  border-top: 1px solid #E5E5EA; padding: 14px 16px; background: #F9F9F9;
  flex: 1; min-height: 0; display: flex; flex-direction: column;
}
.wiz-preview-avatar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.wiz-preview-avatar-placeholder {
  width: 56px; height: 56px; border-radius: 50%; background: #E5E5EA;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; color: #9CA3AF;
}
.wiz-change-avatar-btn {
  padding: 6px 14px; border-radius: 8px; border: 1px solid #E5E5EA;
  background: #fff; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #1A1A1A; cursor: pointer; transition: background 0.15s, border-color 0.15s;
}
.wiz-change-avatar-btn:hover { background: #F5F5F5; border-color: #1A1A1A; }
.wiz-preview-prompt {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
}
.wiz-preview-label {
  display: block; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #6B7280; margin-bottom: 6px; flex-shrink: 0;
}
.wiz-preview-textarea {
  width: 100%; flex: 1; min-height: 80px; padding: 10px 12px; border: 1px solid #E5E5EA; border-radius: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-secondary);
  color: #1A1A1A; background: #fff; outline: none; resize: none; line-height: 1.6;
  box-sizing: border-box; transition: border-color 0.15s;
}
.wiz-preview-textarea:focus { border-color: #1A1A1A; }

/* -- Enhance row ----------------------------------------------------------- */
.wiz-enhance-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

/* -- Preview config (provider/model/tools — spc-style) --------------------- */
.wiz-preview-config {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #F9FAFB;
  border-radius: 10px;
  border: 1px solid #E5E5EA;
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
  color: #9CA3AF;
  padding: 0 2px 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.wpc-tool-count {
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  padding: 1px 7px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.wpc-btn-row {
  display: flex;
  gap: 4px;
}
.wpc-btn {
  flex: 1;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid #E5E5EA;
  background: #FAFAFA;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.12s;
  text-align: center;
}
.wpc-btn:hover {
  border-color: #9CA3AF;
  background: #F5F5F5;
}
.wpc-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
.wpc-tool-empty {
  padding: 8px;
  text-align: center;
  color: #9CA3AF;
  font-size: 11px;
}

.wiz-preview-actions {
  display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .wiz-option-btn, .wiz-pick-avatar-btn, .wiz-send-btn { transition: none; animation: none; }
}
</style>
