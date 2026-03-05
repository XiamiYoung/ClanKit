<template>
  <div class="soul-backdrop">
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
            <h2 class="soul-title">{{ personaName }} — {{ tabLabel }}</h2>
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
        <button class="soul-tab" :class="{ active: activeTab === 'memory' }" @click="activeTab = 'memory'">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 2 17.5v-15A2.5 2.5 0 0 1 4.5 0"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 22 17.5v-15A2.5 2.5 0 0 0 19.5 0"/>
          </svg>
          Memory
        </button>
        <button class="soul-tab" :class="{ active: activeTab === 'model' }" @click="activeTab = 'model'">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          AI Model
        </button>
        <button class="soul-tab" :class="{ active: activeTab === 'voice' }" @click="activeTab = 'voice'">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
          Voice
        </button>
      </div>

      <!-- ═══ SUMMARY TAB ═══ -->
      <div v-if="activeTab === 'summary'" class="soul-body soul-summary-body">
        <div class="soul-persona-card">
          <!-- Avatar + Name row -->
          <div class="soul-identity-row">
            <button v-if="!readOnly" class="soul-avatar-btn" @click="showAvatarPicker = true" title="Change avatar">
              <img v-if="avatarDataUri" :src="avatarDataUri" class="soul-avatar-img" alt="" />
              <div v-else class="soul-avatar-fallback">{{ fallbackInitial }}</div>
              <span class="soul-avatar-edit-badge">
                <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </span>
            </button>
            <div v-else class="soul-avatar-readonly">
              <img v-if="avatarDataUri" :src="avatarDataUri" class="soul-avatar-img" alt="" />
              <div v-else class="soul-avatar-fallback">{{ fallbackInitial }}</div>
            </div>
            <div class="soul-identity-fields">
              <span class="soul-persona-label">Name</span>
              <input
                v-if="!readOnly"
                v-model="draftName"
                type="text"
                class="soul-name-input"
                placeholder="Persona name"
                spellcheck="false"
              />
              <span v-else class="soul-persona-value">{{ draftName || '—' }}</span>
            </div>
          </div>

          <div class="soul-persona-field">
            <span class="soul-persona-label">Description</span>
            <template v-if="!readOnly">
              <textarea
                v-model="draftDescription"
                class="soul-desc-textarea"
                placeholder="Short description of this persona"
                spellcheck="false"
                rows="3"
              ></textarea>
              <div class="soul-ai-btn-row">
                <button
                  class="soul-btn-inline soul-btn-enhance soul-desc-ai-btn"
                  :disabled="summarizing || !draftPrompt.trim() || !isProviderActive"
                  :title="!isProviderActive ? providerInactiveTooltip : 'Generate description from persona prompt'"
                  @click="summarizeDescription"
                >
                  <svg v-if="!summarizing" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  <span v-if="summarizing" class="soul-spinner"></span>
                  {{ summarizing ? 'Generating...' : 'AI Summarize' }}
                </button>
                <span v-if="!isProviderActive" class="soul-provider-inactive-chip" :title="providerInactiveTooltip">
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Provider inactive
                </span>
              </div>
            </template>
            <textarea v-else class="soul-desc-textarea soul-desc-readonly" :value="draftDescription || '—'" readonly rows="2"></textarea>
          </div>
          <div class="soul-persona-field soul-prompt-field">
            <span class="soul-persona-label">Persona</span>
            <template v-if="!readOnly && personaType === 'system'">
              <textarea v-model="draftPrompt" class="soul-editor soul-editor-prompt" spellcheck="false" placeholder="Enter the persona system prompt..."></textarea>
              <div class="soul-enhance-row">
                <button class="soul-btn-inline soul-btn-enhance" :disabled="enhancing || !draftPrompt.trim() || !isProviderActive" :title="!isProviderActive ? providerInactiveTooltip : 'Enhance prompt with AI'" @click="enhancePrompt">
                  <svg v-if="!enhancing" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  <span v-if="enhancing" class="soul-spinner"></span>
                  {{ enhancing ? 'Enhancing...' : 'AI Enhance' }}
                </button>
                <span v-if="!isProviderActive" class="soul-provider-inactive-chip" :title="providerInactiveTooltip">
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Provider inactive
                </span>
              </div>
            </template>
            <pre v-else class="soul-persona-prompt">{{ personaPrompt || '—' }}</pre>
          </div>
        </div>
      </div>

      <!-- ═══ MEMORY TAB ═══ -->
      <div v-else-if="activeTab === 'memory'" class="soul-body soul-memory-body">
        <div v-if="fileSize" class="soul-memory-meta">
          <span>{{ fileSizeFormatted }}</span>
          <span v-if="lastUpdated"> · Updated: {{ lastUpdated }}</span>
        </div>

        <template v-if="loading">
          <div class="soul-empty">Loading...</div>
        </template>
        <!-- PersonaView: directly editable textarea -->
        <template v-else-if="!readOnly">
          <textarea
            v-model="draftMemory"
            class="soul-editor soul-editor-memory"
            spellcheck="false"
            placeholder="No learned memory yet. The AI will automatically learn preferences and context during conversations."
          ></textarea>
        </template>
        <!-- ChatView (readOnly): rendered markdown or empty state -->
        <template v-else-if="!content">
          <div class="soul-empty">
            <p>No learned memory yet.</p>
            <p class="soul-empty-hint">The AI will automatically learn preferences and context during conversations.</p>
          </div>
        </template>
        <template v-else>
          <div class="soul-rendered" v-html="renderedHtml"></div>
        </template>
      </div>

      <!-- ═══ VOICE TAB (system personas only) ═══ -->
      <div v-else-if="activeTab === 'voice'" class="soul-body soul-voice-body">
        <div class="soul-voice-heading">
          <span class="soul-voice-heading-label">Select a TTS voice for this persona</span>
          <span class="soul-voice-status" :class="isVoiceCallActive ? 'active' : 'inactive'">
            <span class="soul-voice-status-dot"></span>
            {{ isVoiceCallActive ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <div class="soul-voice-grid">
          <button
            v-for="v in voiceOptions"
            :key="v.value"
            class="soul-voice-card"
            :class="{ active: draftVoiceId === v.value }"
            @click="draftVoiceId = v.value"
          >
            <span class="soul-voice-card-name">{{ v.label }}</span>
            <span class="soul-voice-card-desc">{{ v.desc }}</span>
            <button
              class="soul-voice-demo-btn"
              :class="{ disabled: !isVoiceCallActive }"
              :disabled="!isVoiceCallActive || !!playingVoice"
              :title="isVoiceCallActive ? 'Play demo' : 'Voice call not active — test connection in Configuration'"
              @click.stop="playVoiceDemo(v.value)"
            >
              <svg v-if="playingVoice !== v.value" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              <span v-else class="soul-demo-playing">
                <span></span><span></span><span></span>
              </span>
            </button>
          </button>
        </div>
      </div>

      <!-- ═══ AI MODEL TAB (system personas only) ═══ -->
      <div v-else-if="activeTab === 'model'" class="soul-body soul-model-body">
        <!-- Provider -->
        <div class="soul-model-section">
          <div class="soul-model-section-label">
            <span class="soul-step-num">1</span>
            Provider
          </div>
          <div v-if="activeProviderOptions.length === 0" class="soul-no-providers">
            No active providers. Enable a provider in Configuration first.
          </div>
          <select
            v-else
            :value="draftProvider"
            class="soul-provider-select"
            @change="selectProvider($event.target.value)"
          >
            <option v-for="p in activeProviderOptions" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </div>

        <!-- Model -->
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
            <div v-if="(draftProvider === 'openrouter' && modelsStore.openrouterLoading) || (draftProvider === 'openai' && modelsStore.openaiLoading) || (draftProvider === 'deepseek' && modelsStore.deepseekLoading)" class="soul-model-loading">
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

      <!-- ═══ UNIFIED FOOTER ═══ -->
      <div class="soul-footer">
        <div class="soul-footer-left"></div>
        <div class="soul-footer-right">
          <button class="soul-btn secondary" @click="$emit('close')">Cancel</button>
          <button class="soul-btn primary" @click="saveAll">Save</button>
        </div>
      </div>

    </div>

    <!-- Avatar Picker -->
    <AvatarPicker
      v-if="showAvatarPicker"
      :current-avatar-id="draftAvatar || ''"
      @select="onAvatarSelected"
      @close="showAvatarPicker = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import { useModelsStore } from '../../stores/models'
import { useConfigStore } from '../../stores/config'
import { getAvatarDataUri } from './personaAvatars'
import AvatarPicker from './AvatarPicker.vue'

const props = defineProps({
  personaId:          { type: String, required: true },
  personaType:        { type: String, required: true }, // 'system' or 'users'
  personaName:        { type: String, default: 'Persona' },
  personaDescription: { type: String, default: '' },
  personaPrompt:      { type: String, default: '' },
  personaProviderId:  { type: String, default: null },
  personaModelId:     { type: String, default: null },
  personaVoiceId:     { type: String, default: null },
  personaAvatar:      { type: String, default: null },
  readOnly:           { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'update-persona'])

const modelsStore = useModelsStore()
const configStore = useConfigStore()

// ── Tab state ──
const activeTab = ref('summary')

const tabLabel = computed(() => {
  const labels = { summary: 'Summary', memory: 'Memory', model: 'AI Model', voice: 'Voice' }
  return labels[activeTab.value] || 'Summary'
})

// ── Name, avatar, description draft ──
const draftName = ref(props.personaName || '')
const draftAvatar = ref(props.personaAvatar || null)
const draftDescription = ref(props.personaDescription || '')
const showAvatarPicker = ref(false)
const summarizing = ref(false)

const avatarDataUri = computed(() => getAvatarDataUri(draftAvatar.value))
const fallbackInitial = computed(() => (draftName.value || '?').charAt(0).toUpperCase())

function onAvatarSelected(avatarId) {
  draftAvatar.value = avatarId
  showAvatarPicker.value = false
}

// ── Voice options & draft ──
const voiceOptions = [
  { value: 'alloy',   label: 'Alloy',   desc: 'Neutral, balanced' },
  { value: 'echo',    label: 'Echo',     desc: 'Warm, rounded' },
  { value: 'fable',   label: 'Fable',    desc: 'Expressive, British' },
  { value: 'onyx',    label: 'Onyx',     desc: 'Deep, authoritative' },
  { value: 'nova',    label: 'Nova',     desc: 'Friendly, upbeat' },
  { value: 'shimmer', label: 'Shimmer',  desc: 'Clear, gentle' },
]
const draftVoiceId = ref(props.personaVoiceId || 'alloy')

// ── Voice demo ──
const isVoiceCallActive = computed(() => configStore.config.voiceCall?.isActive === true)
const playingVoice = ref(null)

async function playVoiceDemo(voiceId) {
  if (!isVoiceCallActive.value || playingVoice.value) return
  playingVoice.value = voiceId
  const vc = configStore.config.voiceCall || {}
  const text = 'Hello, this is a sample of my voice. How do I sound?'
  const useOpenAI = (vc.ttsMode === 'openai' || vc.ttsMode === 'openai-hd') && vc.whisperApiKey

  if (useOpenAI && window.electronAPI?.voice?.tts) {
    try {
      const result = await window.electronAPI.voice.tts({
        text,
        apiKey: vc.whisperApiKey,
        baseURL: vc.whisperBaseURL,
        model: vc.ttsMode === 'openai-hd' ? 'tts-1-hd' : 'tts-1',
        voice: voiceId,
      })
      if (result.success && result.audio) {
        const audio = new Audio(`data:audio/${result.format || 'mp3'};base64,${result.audio}`)
        audio.onended = () => { playingVoice.value = null }
        audio.onerror = () => { playingVoice.value = null }
        audio.play()
        return
      }
    } catch { /* fall through to browser TTS */ }
  }

  // Browser SpeechSynthesis fallback
  if (window.speechSynthesis) {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => { playingVoice.value = null }
    utterance.onerror = () => { playingVoice.value = null }
    window.speechSynthesis.speak(utterance)
  } else {
    playingVoice.value = null
  }
}

// ── Provider / model draft (AI Model tab) ──
const activeProviderOptions = computed(() => {
  const labels = { anthropic: 'Anthropic', openrouter: 'OpenRouter', openai: 'OpenAI', deepseek: 'DeepSeek' }
  return configStore.activeProviders.map(id => ({ id, label: labels[id] }))
})

const initProvider = props.personaProviderId || (configStore.activeProviders[0] || 'anthropic')
const draftProvider = ref(initProvider)
const draftModelId = ref(props.personaModelId || null)
const modelFilter = ref('')

const filteredModels = computed(() => {
  const q = modelFilter.value.trim().toLowerCase()
  const models = modelsStore.getModelsForProvider(draftProvider.value)
  if (!q) return models
  return models.filter(m => (m.name || m.label || '').toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
})

const currentModelLabel = computed(() => {
  if (!draftModelId.value) return '—'
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
  if (prov === 'deepseek' && !modelsStore.deepseekCached) modelsStore.fetchDeepSeekModels()
}

// ── Memory & content ──
const loading = ref(true)
const content = ref(null)

const draftMemory = ref('')

// ── Prompt draft (always editable in PersonaView) ──
const draftPrompt = ref(props.personaPrompt || '')

// ── Provider active check for AI buttons ──
const PROVIDER_LABELS = { anthropic: 'Anthropic', openrouter: 'OpenRouter', openai: 'OpenAI', deepseek: 'DeepSeek' }
const isProviderActive = computed(() => {
  const pid = draftProvider.value
  return configStore.config[pid]?.isActive === true
})
const providerInactiveTooltip = computed(() => {
  const label = PROVIDER_LABELS[draftProvider.value] || draftProvider.value
  return `${label} provider is inactive — test connection in Configuration first`
})

/** Build a config object that routes to the persona's selected provider + utility model */
function buildProviderConfig() {
  const fullCfg = JSON.parse(JSON.stringify(configStore.config))
  const pid = draftProvider.value
  const provCfg = fullCfg[pid] || {}
  const utilityModel = provCfg.utilityModel || null

  const cfg = { ...fullCfg }
  if (pid === 'anthropic') {
    cfg.apiKey = provCfg.apiKey || ''
    cfg.baseURL = provCfg.baseURL || ''
    if (utilityModel) cfg.customModel = utilityModel
  } else if (pid === 'openrouter') {
    cfg.apiKey = provCfg.apiKey || ''
    cfg.baseURL = provCfg.baseURL || ''
    cfg.defaultProvider = 'openrouter'
    if (utilityModel) cfg.customModel = utilityModel
  } else if (pid === 'openai') {
    cfg.openaiApiKey = provCfg.apiKey || ''
    cfg.openaiBaseURL = provCfg.baseURL || ''
    cfg._resolvedProvider = 'openai'
    cfg.defaultProvider = 'openai'
    if (utilityModel) cfg.customModel = utilityModel
  } else if (pid === 'deepseek') {
    cfg.openaiApiKey = provCfg.apiKey || ''
    cfg.openaiBaseURL = (provCfg.baseURL || '').replace(/\/+$/, '')
    cfg._resolvedProvider = 'openai'
    cfg._directAuth = true
    cfg.defaultProvider = 'openai'
    if (utilityModel) cfg.customModel = utilityModel
  }
  return cfg
}

// ── AI Enhance ──
const enhancing = ref(false)

async function enhancePrompt() {
  if (enhancing.value || !draftPrompt.value.trim() || !isProviderActive.value) return
  enhancing.value = true
  try {
    const cfg = buildProviderConfig()
    const res = await window.electronAPI.runAgent({
      chatId: '__persona_enhance__',
      messages: [{
        role: 'user',
        content: `Enhance this AI system persona prompt. Make it more specific, effective, and well-structured while keeping the same intent. IMPORTANT: Respond in the SAME language as the original prompt. If the prompt is in Chinese, respond in Chinese. If in English, respond in English. Return ONLY the enhanced prompt text, nothing else.\n\nOriginal prompt:\n${draftPrompt.value}`
      }],
      config: cfg,
      enabledAgents: [], enabledSkills: [], mcpServers: [], httpTools: [],
    })
    if (res.success && res.result) {
      draftPrompt.value = res.result.trim()
    }
  } catch (err) {
    console.error('Enhancement failed:', err.message || err)
  }
  enhancing.value = false
}

async function summarizeDescription() {
  const prompt = draftPrompt.value || props.personaPrompt
  if (summarizing.value || !prompt?.trim() || !isProviderActive.value) return
  summarizing.value = true
  try {
    const cfg = buildProviderConfig()
    const res = await window.electronAPI.runAgent({
      chatId: '__persona_describe__',
      messages: [{
        role: 'user',
        content: `Read this persona prompt and write a SHORT description (max 10 words) that tells the user who this persona is. Focus on: role, expertise, key character traits. Use clean, simple words. No punctuation at the end. IMPORTANT: Respond in the SAME language as the prompt. If the prompt is in Chinese, write the description in Chinese. If in English, write in English. Return ONLY the description, nothing else.\n\nPrompt:\n${prompt}`
      }],
      config: cfg,
      enabledAgents: [], enabledSkills: [], mcpServers: [], httpTools: [],
    })
    if (res.success && res.result) {
      draftDescription.value = res.result.trim().replace(/\.+$/, '')
    }
  } catch (err) {
    console.error('Description generation failed:', err.message || err)
  }
  summarizing.value = false
}

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
    draftMemory.value = data || ''
  } catch (err) {
    content.value = null
    draftMemory.value = ''
  }
  loading.value = false
}


// ── Unified save ──
function saveAll() {
  // Emit all current drafts so parent can persist
  emit('update-persona', {
    name: draftName.value || undefined,
    avatar: draftAvatar.value || undefined,
    description: draftDescription.value || undefined,
    prompt: draftPrompt.value || undefined,
    providerId: draftProvider.value,
    modelId: draftModelId.value || null,
    voiceId: draftVoiceId.value,
  })

  // Memory: save if changed
  if (draftMemory.value !== (content.value || '')) {
    window.electronAPI.souls.write(props.personaId, props.personaType, draftMemory.value)
      .then(() => { content.value = draftMemory.value })
      .catch(err => console.error('Memory save failed:', err))
  }

  emit('close')
}

function onKeyDown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  loadContent()
  if (draftProvider.value === 'openrouter' && !modelsStore.openrouterCached) modelsStore.fetchOpenRouterModels()
  if (draftProvider.value === 'openai' && !modelsStore.openaiCached) modelsStore.fetchOpenAIModels()
  if (draftProvider.value === 'deepseek' && !modelsStore.deepseekCached) modelsStore.fetchDeepSeekModels()
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<style scoped>
.soul-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.soul-modal {
  width: min(53.75rem, 94vw); height: min(88vh, 56.25rem);
  background: #0F0F0F; border: 1px solid #2A2A2A;
  border-radius: 1.25rem; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: soul-enter 0.2s ease-out;
}
@keyframes soul-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.soul-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem; border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
}
.soul-header-left { display: flex; align-items: center; gap: 0.625rem; }
.soul-header-icon {
  width: 1.875rem; height: 1.875rem; border-radius: 0.5rem;
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
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280; cursor: pointer; transition: all 0.15s;
}
.soul-close-btn:hover { background: #1F1F1F; color: #FFFFFF; }

/* ── Tab bar ── */
.soul-tabs {
  display: flex; gap: 0.25rem; padding: 0.5rem 1.25rem;
  border-bottom: 1px solid #1F1F1F; flex-shrink: 0;
}
.soul-tab {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.4375rem 0.875rem; border-radius: 0.5rem;
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

/* ── Body ── */
.soul-body {
  flex: 1; overflow-y: auto; padding: 1.25rem;
  scrollbar-width: thin; scrollbar-color: #333 transparent; min-height: 0;
}

/* ── Summary tab ── */
.soul-summary-body {
  display: block;
}
.soul-persona-card {
  background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 0.75rem;
  padding: 0.875rem 1rem; display: flex; flex-direction: column; gap: 0.75rem;
}
/* ── Identity row (avatar + name) ── */
.soul-identity-row {
  display: flex; align-items: center; gap: 0.875rem;
}
.soul-avatar-btn {
  position: relative; width: 3rem; height: 3rem; flex-shrink: 0;
  border: none; background: transparent; cursor: pointer; padding: 0;
  border-radius: 50%;
}
.soul-avatar-btn:hover .soul-avatar-edit-badge { opacity: 1; }
.soul-avatar-readonly {
  width: 3rem; height: 3rem; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden;
}
.soul-avatar-img { width: 3rem; height: 3rem; border-radius: 50%; object-fit: cover; }
.soul-avatar-fallback {
  width: 3rem; height: 3rem; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.125rem; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
}
.soul-avatar-edit-badge {
  position: absolute; bottom: -0.125rem; right: -0.125rem;
  width: 1.25rem; height: 1.25rem; border-radius: 50%;
  background: linear-gradient(135deg, #0F0F0F 0%, #374151 100%);
  border: 2px solid #0F0F0F;
  display: flex; align-items: center; justify-content: center;
  color: #FFFFFF; opacity: 0.6; transition: opacity 0.15s;
}
.soul-identity-fields { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.soul-name-input {
  width: 100%; padding: 0.375rem 0.625rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body, 0.875rem);
  font-weight: 600; color: #FFFFFF; outline: none;
  transition: border-color 0.15s; box-sizing: border-box;
}
.soul-name-input:focus { border-color: #4B5563; }
.soul-name-input::placeholder { color: #4B5563; }

.soul-desc-textarea {
  width: 100%; padding: 0.5rem 0.625rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.8rem);
  color: #FFFFFF; outline: none; transition: border-color 0.15s; box-sizing: border-box;
  resize: vertical; line-height: 1.5; min-height: 3.125rem;
}
.soul-desc-textarea:focus { border-color: #4B5563; }
.soul-desc-textarea::placeholder { color: #4B5563; }
.soul-desc-readonly {
  color: #9CA3AF; cursor: default; resize: none;
}
.soul-ai-btn-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem; }
.soul-desc-ai-btn { }
.soul-provider-inactive-chip {
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  color: #EF4444; padding: 0.1875rem 0.5rem; border-radius: 0.375rem;
  background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2);
  cursor: help;
}

.soul-persona-field { display: flex; flex-direction: column; gap: 0.25rem; }
.soul-prompt-field { display: flex; flex-direction: column; }
.soul-persona-label {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; color: #4B5563; flex-shrink: 0;
}
.soul-persona-value {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body, 0.875rem);
  color: #9CA3AF; line-height: 1.5;
}
.soul-persona-prompt {
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-secondary, 0.8rem);
  color: #9CA3AF; background: #111111; border: 1px solid #2A2A2A; border-radius: 0.5rem;
  padding: 0.625rem 0.75rem; margin: 0; white-space: pre-wrap; word-break: break-word;
  line-height: 1.6; flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #333 transparent;
  min-height: 5rem;
}
.soul-btn-inline {
  align-self: flex-start; padding: 0.25rem 0.625rem; border-radius: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: 0.6875rem; font-weight: 600;
  color: #6B7280; background: #1A1A1A; border: 1px solid #2A2A2A;
  cursor: pointer; transition: all 0.12s;
  display: inline-flex; align-items: center; gap: 0.3125rem;
}
.soul-btn-inline:hover { background: #222222; color: #FFFFFF; border-color: #374151; }
.soul-btn-inline:disabled { opacity: 0.4; cursor: not-allowed; }
.soul-btn-enhance {
  color: #F59E0B; border-color: rgba(245, 158, 11, 0.3);
}
.soul-btn-enhance:hover:not(:disabled) { background: rgba(245, 158, 11, 0.1); color: #FBBF24; border-color: rgba(245, 158, 11, 0.5); }

.soul-enhance-row {
  display: flex; align-items: center; gap: 0.375rem; margin-top: 0.375rem; flex-shrink: 0;
}

.soul-editor {
  width: 100%; min-height: 7.5rem; padding: 0.75rem;
  border: 1px solid #2A2A2A; border-radius: 0.625rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-secondary, 0.8rem);
  color: #FFFFFF; background: #111111; outline: none; resize: vertical;
  line-height: 1.6; box-sizing: border-box; transition: border-color 0.15s;
}
.soul-editor:focus { border-color: #4B5563; }
.soul-editor-prompt { min-height: 12.5rem; height: 18.75rem; }
.soul-editor-memory { flex: 1; min-height: 12.5rem; }

/* Spinner */
.soul-spinner {
  display: inline-block; width: 0.75rem; height: 0.75rem;
  border: 2px solid rgba(245, 158, 11, 0.3); border-top-color: #F59E0B;
  border-radius: 50%; animation: soul-spin 0.6s linear infinite;
}
@keyframes soul-spin { to { transform: rotate(360deg); } }

/* ── Memory tab ── */
.soul-memory-body {
  display: flex; flex-direction: column; gap: 0.75rem;
}
.soul-memory-meta {
  font-family: 'Inter', sans-serif; font-size: 0.6875rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em; color: #4B5563;
  padding: 0 0.125rem; flex-shrink: 0;
}
.soul-memory-actions {
  display: flex; gap: 0.375rem; margin-top: 0.5rem; flex-shrink: 0;
}

/* Empty state */
.soul-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 5rem; color: #4B5563; font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.875rem); text-align: center; flex: 1;
}
.soul-empty p { margin: 0.25rem 0; }
.soul-empty-hint { font-size: var(--fs-secondary, 0.75rem); color: #374151; max-width: 18.75rem; }

.soul-rendered {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body, 0.875rem);
  color: #D1D5DB; line-height: 1.6; flex: 1; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.soul-rendered :deep(h1) { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.5rem; color: #FFFFFF; }
.soul-rendered :deep(h2) { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.375rem; color: #9CA3AF; }
.soul-rendered :deep(ul) { padding-left: 1.25rem; margin: 0.25rem 0; }
.soul-rendered :deep(li) { margin: 0.125rem 0; }
.soul-rendered :deep(blockquote) { border-left: 3px solid #2A2A2A; padding-left: 0.75rem; color: #6B7280; margin: 0.5rem 0; }
.soul-rendered :deep(code) { font-family: 'JetBrains Mono', monospace; font-size: 0.85em; background: #1A1A1A; padding: 0.0625rem 0.25rem; border-radius: 0.1875rem; color: #D1D5DB; }

/* ── Footer ── */
.soul-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.75rem 1.25rem; border-top: 1px solid #1F1F1F; background: #0A0A0A;
  flex-shrink: 0;
}
.soul-footer-left, .soul-footer-right { display: flex; gap: 0.5rem; }

.soul-btn {
  padding: 0.4375rem 1rem; border-radius: 0.5rem;
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

/* ── AI Model tab ── */
.soul-model-body {
  display: flex; flex-direction: column; gap: 0; padding: 1.25rem;
  min-height: 0;
}
.soul-model-section {
  margin-bottom: 1.25rem;
}
.soul-model-section-grow {
  flex: 1; display: flex; flex-direction: column; min-height: 0;
}
.soul-model-section-label {
  display: flex; align-items: center; gap: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600; color: #9CA3AF; margin-bottom: 0.625rem;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.soul-step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.125rem; height: 1.125rem; border-radius: 50%;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
  color: #FFFFFF; font-size: 0.625rem; font-weight: 700;
  flex-shrink: 0;
}
.soul-model-badge {
  font-size: 0.6875rem; font-weight: 600; text-transform: none; letter-spacing: 0;
  padding: 0.125rem 0.5rem; border-radius: 0.375rem;
  background: #1F1F1F; color: #9CA3AF;
  font-family: 'JetBrains Mono', monospace;
}
.soul-provider-select {
  width: 100%; padding: 0.5625rem 0.75rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600; color: #FFFFFF; outline: none;
  cursor: pointer; transition: border-color 0.15s;
  -webkit-appearance: none; appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' fill='none' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 0.75rem center;
}
.soul-provider-select:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75,85,99,0.2); }
.soul-provider-select option { background: #1A1A1A; color: #FFFFFF; }
.soul-no-providers {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.875rem);
  color: #EF4444; padding: 0.625rem 0;
}
.soul-model-search {
  width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption, 0.8rem); outline: none;
  color: #FFFFFF; transition: border-color 0.15s; margin-bottom: 0.5rem;
  box-sizing: border-box;
}
.soul-model-search:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75,85,99,0.2); }
.soul-model-search::placeholder { color: #4B5563; }
.soul-model-list {
  flex: 1; overflow-y: auto;
  border: 1px solid #2A2A2A; border-radius: 0.75rem;
  display: flex; flex-direction: column;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
  background: #1A1A1A; min-height: 0;
}
.soul-model-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; padding: 0.625rem 0.875rem; border: none; background: transparent;
  cursor: pointer; font-family: 'Inter', sans-serif; font-size: var(--fs-caption, 0.8rem);
  font-weight: 500; color: #9CA3AF; text-align: left;
  transition: all 0.12s; border-bottom: 1px solid #1F1F1F; flex-shrink: 0;
}
.soul-model-item:last-child { border-bottom: none; }
.soul-model-item:first-child { border-radius: 0.6875rem 0.6875rem 0 0; }
.soul-model-item:last-child { border-radius: 0 0 0.6875rem 0.6875rem; }
.soul-model-item:hover { background: #222222; color: #FFFFFF; }
.soul-model-item.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
}
.soul-model-item.active .soul-model-id { color: rgba(255,255,255,0.4); }
.soul-model-id {
  font-family: 'JetBrains Mono', monospace; font-size: 0.625rem;
  color: #4B5563; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 12.5rem;
}
.soul-model-loading {
  padding: 1rem; text-align: center; font-size: var(--fs-caption, 0.8rem); color: #4B5563;
}

/* ── Voice tab ── */
.soul-voice-body {
  display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem;
}
.soul-voice-heading {
  display: flex; align-items: center; gap: 0.625rem;
}
.soul-voice-heading-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600; color: #9CA3AF;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.soul-voice-status {
  display: inline-flex; align-items: center; gap: 0.3125rem;
  font-family: 'Inter', sans-serif; font-size: 0.6875rem; font-weight: 600;
  padding: 0.1875rem 0.625rem 0.1875rem 0.5rem; border-radius: 1.25rem;
}
.soul-voice-status.active { color: #34D399; background: rgba(52, 211, 153, 0.1); }
.soul-voice-status.inactive { color: #EF4444; background: rgba(239, 68, 68, 0.1); }
.soul-voice-status-dot {
  width: 0.375rem; height: 0.375rem; border-radius: 50%;
}
.soul-voice-status.active .soul-voice-status-dot { background: #34D399; }
.soul-voice-status.inactive .soul-voice-status-dot { background: #EF4444; }

.soul-voice-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.625rem;
}
.soul-voice-card {
  display: flex; flex-direction: column; gap: 0.25rem;
  padding: 0.875rem 0.75rem; border-radius: 0.625rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  cursor: pointer; transition: all 0.15s; text-align: center;
  position: relative;
}
.soul-voice-card:hover { border-color: #4B5563; }
.soul-voice-card.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.soul-voice-card-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body, 0.9375rem); font-weight: 600;
  color: #9CA3AF; transition: color 0.15s;
}
.soul-voice-card.active .soul-voice-card-name { color: #FFFFFF; }
.soul-voice-card:hover:not(.active) .soul-voice-card-name { color: #D1D5DB; }
.soul-voice-card-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small, 0.75rem);
  color: #4B5563; transition: color 0.15s;
}
.soul-voice-card.active .soul-voice-card-desc { color: rgba(255,255,255,0.5); }

/* Voice demo button */
.soul-voice-demo-btn {
  position: absolute; bottom: 0.5rem; right: 0.5rem;
  width: 1.625rem; height: 1.625rem; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: none; cursor: pointer; transition: all 0.15s;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}
.soul-voice-demo-btn:hover:not(.disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 10px rgba(0,0,0,0.4);
}
.soul-voice-demo-btn.disabled {
  opacity: 0.3; cursor: not-allowed;
}

/* Demo playing animation */
.soul-demo-playing {
  display: flex; align-items: center; gap: 0.125rem; height: 0.75rem;
}
.soul-demo-playing span {
  width: 0.125rem; background: #FFFFFF; border-radius: 0.0625rem;
  animation: soul-eq 0.8s ease-in-out infinite alternate;
}
.soul-demo-playing span:nth-child(1) { height: 0.25rem; animation-delay: 0s; }
.soul-demo-playing span:nth-child(2) { height: 0.5rem; animation-delay: 0.15s; }
.soul-demo-playing span:nth-child(3) { height: 0.3125rem; animation-delay: 0.3s; }
@keyframes soul-eq {
  0% { height: 0.1875rem; }
  100% { height: 0.625rem; }
}
</style>
