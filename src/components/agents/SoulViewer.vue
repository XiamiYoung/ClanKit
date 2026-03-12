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
            <h2 class="soul-title">{{ isNew ? (personaType === 'system' ? 'New System Persona' : 'New User Persona') : `${draftName || personaName} — ${tabLabel}` }}</h2>
            <span class="soul-meta">{{ personaType === 'system' ? 'System Persona' : 'User Persona' }}</span>
          </div>
        </div>
        <button class="soul-close-btn" @click="$emit('close')" aria-label="Close">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Tab bar -->
      <div class="soul-tabs">
        <button class="soul-tab" :class="{ active: activeTab === 'summary' }" @click="activeTab = 'summary'">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
            <line x1="10" y1="22" x2="14" y2="22"/>
          </svg>
          Summary
          <span v-if="hasSummaryErrors" class="soul-tab-error-dot"></span>
        </button>
        <button v-if="!isNew" class="soul-tab" :class="{ active: activeTab === 'memory' }" @click="activeTab = 'memory'">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 2 17.5v-15A2.5 2.5 0 0 1 4.5 0"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 22 17.5v-15A2.5 2.5 0 0 0 19.5 0"/>
          </svg>
          Memory
        </button>
        <button v-if="personaType === 'system'" class="soul-tab" :class="{ active: activeTab === 'model' }" @click="activeTab = 'model'">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          AI Model
          <span v-if="hasModelErrors" class="soul-tab-error-dot"></span>
        </button>
        <button v-if="personaType === 'system'" class="soul-tab" :class="{ active: activeTab === 'voice' }" @click="activeTab = 'voice'">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
          Voice
          <span v-if="hasVoiceErrors" class="soul-tab-error-dot"></span>
        </button>
      </div>

      <!-- ═══ SUMMARY TAB ═══ -->
      <div v-if="activeTab === 'summary'" class="soul-body soul-summary-body">

        <!-- AI creation bar (new persona only) -->
        <div v-if="isNew && !readOnly" class="soul-ai-create-bar">
          <span class="soul-ai-create-label">Start with AI:</span>
          <button class="soul-btn-inline soul-btn-enhance" :disabled="generating" @click="toggleDescribeInput">
            <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Describe it
          </button>
          <button class="soul-btn-inline soul-btn-enhance" :disabled="generating" @click="generatePersonaFromAI(null, false)">
            <svg v-if="!generating" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>
            <span v-if="generating" class="soul-spinner"></span>
            {{ generating ? 'Generating...' : 'Surprise me' }}
          </button>
        </div>
        <!-- Describe input (toggled) -->
        <div v-if="showDescribeInput && !readOnly" class="soul-describe-wrap">
          <textarea
            v-model="describeText"
            class="soul-describe-textarea"
            placeholder='Describe who you want... e.g. "a grumpy doctor like House MD", "Gordon Ramsay for code reviews", "Yoda as a DevOps engineer"'
            rows="3"
            autofocus
          ></textarea>
          <div class="soul-describe-actions">
            <button class="soul-btn-inline soul-btn-enhance" :disabled="!describeText.trim() || generating" @click="generatePersonaFromAI(describeText, false)">
              <svg v-if="!generating" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <span v-if="generating" class="soul-spinner"></span>
              {{ generating ? 'Generating...' : 'Generate' }}
            </button>
            <button class="soul-btn-inline" :disabled="generating" @click="showDescribeInput = false; describeText = ''">Cancel</button>
          </div>
        </div>

        <div class="soul-persona-card">
          <!-- Avatar + Name row -->
          <div class="soul-identity-row">
            <button v-if="!readOnly" class="soul-avatar-btn" :class="{ 'soul-avatar-error': errors.avatar }" @click="showAvatarPicker = true" title="Change avatar">
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
                :class="{ 'soul-input-error': errors.name }"
                placeholder="Persona name"
                spellcheck="false"
                @input="clearError('name')"
              />
              <span v-else class="soul-persona-value">{{ draftName || '—' }}</span>
              <span v-if="errors.name || errors.avatar" class="soul-validation-error">{{ errors.name || errors.avatar }}</span>
            </div>
          </div>

          <div class="soul-persona-field">
            <span class="soul-persona-label">Description</span>
            <template v-if="!readOnly">
              <textarea
                v-model="draftDescription"
                class="soul-desc-textarea"
                :class="{ 'soul-input-error': errors.description }"
                placeholder="Short description of this persona"
                spellcheck="false"
                rows="3"
                @input="clearError('description')"
              ></textarea>
              <span v-if="errors.description" class="soul-validation-error">{{ errors.description }}</span>
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
              <span v-if="aiError" class="soul-ai-error">{{ aiError }}</span>
            </template>
            <textarea v-else class="soul-desc-textarea soul-desc-readonly" :value="draftDescription || '—'" readonly rows="2"></textarea>
          </div>
          <div class="soul-persona-field soul-prompt-field">
            <span class="soul-persona-label">Persona</span>
            <template v-if="!readOnly">
              <textarea v-model="draftPrompt" class="soul-editor soul-editor-prompt" :class="{ 'soul-input-error': errors.prompt }" spellcheck="false" :placeholder="personaType === 'system' ? 'Enter the persona system prompt...' : 'Describe yourself, your role, and context for the AI...'" @input="clearError('prompt')"></textarea>
              <span v-if="errors.prompt" class="soul-validation-error">{{ errors.prompt }}</span>
              <div class="soul-enhance-row">
                <button class="soul-btn-inline soul-btn-enhance" :disabled="enhancing || generating || !draftPrompt.trim() || !isProviderActive" :title="!isProviderActive ? providerInactiveTooltip : 'Enhance prompt with AI'" @click="enhancePrompt">
                  <svg v-if="!enhancing" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  <span v-if="enhancing" class="soul-spinner"></span>
                  {{ enhancing ? 'Enhancing...' : 'AI Enhance' }}
                </button>
                <button class="soul-btn-inline soul-btn-enhance" :disabled="enhancing || generating || !draftPrompt.trim()" @click="toggleRewriteInput">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  Rewrite from description
                </button>
                <span v-if="!isProviderActive" class="soul-provider-inactive-chip" :title="providerInactiveTooltip">
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Provider inactive
                </span>
              </div>
              <!-- Rewrite input (inline, toggled) -->
              <div v-if="showRewriteInput" class="soul-rewrite-wrap">
                <textarea
                  v-model="rewriteText"
                  class="soul-describe-textarea"
                  placeholder='Give an instruction to update this persona... e.g. "translate to Chinese", "make this a female character", "make the tone more aggressive"'
                  rows="3"
                ></textarea>
                <div class="soul-describe-actions">
                  <button class="soul-btn-inline soul-btn-enhance" :disabled="!rewriteText.trim() || generating" @click="applyRewriteInstruction">
                    <svg v-if="!generating" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    <span v-if="generating" class="soul-spinner"></span>
                    {{ generating ? 'Applying...' : 'Apply' }}
                  </button>
                  <button class="soul-btn-inline" :disabled="generating" @click="showRewriteInput = false; rewriteText = ''">Cancel</button>
                </div>
              </div>
              <span v-if="aiError" class="soul-ai-error">{{ aiError }}</span>
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
        <span v-if="errors.voice" class="soul-validation-error" style="margin-bottom: 0.25rem;">{{ errors.voice }}</span>
        <div class="soul-voice-grid">
          <button
            v-for="v in voiceOptions"
            :key="v.value"
            class="soul-voice-card"
            :class="{ active: draftVoiceId === v.value }"
            @click="draftVoiceId = v.value; clearError('voice')"
          >
            <span class="soul-voice-card-name">{{ v.label }}</span>
            <span class="soul-voice-card-desc">{{ v.desc }}</span>
            <span
              role="button"
              tabindex="0"
              class="soul-voice-demo-btn"
              :class="{ disabled: !isVoiceCallActive || !!playingVoice }"
              :title="isVoiceCallActive ? 'Play demo' : 'Voice call not active — test connection in Configuration'"
              @click.stop="isVoiceCallActive && !playingVoice && playVoiceDemo(v.value)"
              @keydown.enter.stop="isVoiceCallActive && !playingVoice && playVoiceDemo(v.value)"
            >
              <svg v-if="playingVoice !== v.value" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              <span v-else class="soul-demo-playing">
                <span></span><span></span><span></span>
              </span>
            </span>
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
          <div v-else class="soul-provider-custom" :class="{ 'soul-input-error': errors.provider }">
            <button
              type="button"
              class="soul-provider-trigger"
              :class="{ open: providerDropdownOpen }"
              @click.stop="toggleProviderDropdown"
            >
              <span>{{ activeProviderOptions.find(p => p.id === draftProvider)?.label || 'Select a provider' }}</span>
              <svg style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 12 12" fill="none" stroke="#6B7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 4.5L6 7.5L9 4.5"/>
              </svg>
            </button>
            <div v-if="providerDropdownOpen" class="soul-provider-dropdown">
              <button
                v-for="p in activeProviderOptions"
                :key="p.id"
                type="button"
                class="soul-provider-option"
                :class="{ active: draftProvider === p.id }"
                @click.stop="pickProvider(p.id)"
              >
                {{ p.label }}
                <svg v-if="draftProvider === p.id" style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
            </div>
          </div>
          <span v-if="errors.provider" class="soul-validation-error">{{ errors.provider }}</span>
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
          <div class="soul-model-list" :class="{ 'soul-input-error': errors.model }">
            <div v-if="(draftProvider === 'openrouter' && modelsStore.openrouterLoading) || (draftProvider === 'openai' && modelsStore.openaiLoading) || (draftProvider === 'deepseek' && modelsStore.deepseekLoading)" class="soul-model-loading">
              Loading models...
            </div>
            <button
              v-for="m in filteredModels"
              :key="m.id"
              class="soul-model-item"
              :class="{ active: draftModelId === m.id }"
              @click="draftModelId = m.id; clearError('model')"
            >
              <span>{{ m.name || m.label || m.id }}</span>
              <span v-if="m.id !== (m.name || m.label)" class="soul-model-id">{{ m.id }}</span>
            </button>
          </div>
          <span v-if="errors.model" class="soul-validation-error">{{ errors.model }}</span>
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
  isNew:              { type: Boolean, default: false },
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
  clearError('avatar')
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
const providerDropdownOpen = ref(false)

function toggleProviderDropdown() {
  providerDropdownOpen.value = !providerDropdownOpen.value
}

function onProviderDropdownClickOutside(e) {
  if (!e.target.closest('.soul-provider-custom')) {
    providerDropdownOpen.value = false
  }
}

function pickProvider(id) {
  selectProvider(id)
  clearError('provider')
  providerDropdownOpen.value = false
}

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

// ── AI Enhance ──
const enhancing = ref(false)
const aiError = ref('')

async function enhancePrompt() {
  if (enhancing.value || !draftPrompt.value.trim()) return
  enhancing.value = true
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const res = await window.electronAPI.enhancePrompt({
      prompt: `Enhance this AI system persona prompt. Make it more specific, effective, and well-structured while keeping the same intent. IMPORTANT: Respond in the SAME language as the original prompt. If the prompt is in Chinese, respond in Chinese. If in English, respond in English. Return ONLY the enhanced prompt text, nothing else.\n\nOriginal prompt:\n${draftPrompt.value}`,
      config,
    })
    if (res.success && res.text) {
      draftPrompt.value = res.text.trim()
    } else if (!res.success) {
      aiError.value = res.error || 'Enhancement failed.'
    }
  } catch (err) {
    aiError.value = err.message || 'Enhancement failed.'
  }
  enhancing.value = false
}

async function summarizeDescription() {
  const prompt = draftPrompt.value || props.personaPrompt
  if (summarizing.value || !prompt?.trim()) return
  summarizing.value = true
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const res = await window.electronAPI.enhancePrompt({
      prompt: `Read this persona prompt and write a SHORT description (max 10 words) that tells the user who this persona is. Focus on: role, expertise, key character traits. Use clean, simple words. No punctuation at the end. IMPORTANT: Respond in the SAME language as the prompt. If the prompt is in Chinese, write the description in Chinese. If in English, write in English. Return ONLY the description, nothing else.\n\nPrompt:\n${prompt}`,
      config,
    })
    if (res.success && res.text) {
      draftDescription.value = res.text.trim().replace(/\.+$/, '')
    } else if (!res.success) {
      aiError.value = res.error || 'Description generation failed.'
    }
  } catch (err) {
    aiError.value = err.message || 'Description generation failed.'
  }
  summarizing.value = false
}

// ── AI Generation (Describe / Surprise me / Rewrite) ─────────────────────
const generating = ref(false)
const showDescribeInput = ref(false)
const describeText = ref('')
const showRewriteInput = ref(false)
const rewriteText = ref('')

function toggleDescribeInput() {
  showDescribeInput.value = !showDescribeInput.value
  describeText.value = ''
}

function toggleRewriteInput() {
  showRewriteInput.value = !showRewriteInput.value
  rewriteText.value = ''
}

function detectLanguage() {
  const text = (draftDescription.value || '') + ' ' + (draftPrompt.value || '')
  if (/[\u4e00-\u9fff]/.test(text)) return 'Chinese'
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'Japanese'
  if (/[\uac00-\ud7af]/.test(text)) return 'Korean'
  return null // default: English
}

function extractJSON(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return match[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

async function generatePersonaFromAI(description, isRewrite) {
  generating.value = true
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const descLine = description
      ? `The user wants a persona described as: "${description}"\n\n`
      : 'Generate a completely random, creative, and surprising persona. Be imaginative — pick something unexpected.\n\n'

    const lang = detectLanguage()
    const langInstruction = lang ? `\n\nIMPORTANT: Generate ALL fields (name, description, prompt) entirely in ${lang}.` : ''
    const res = await window.electronAPI.enhancePrompt({
      prompt: `${descLine}Create a detailed AI persona character. Be specific and creative. It can be a fictional character, historical figure, professional archetype, mythological being, movie/TV character, or anything interesting.\n\nReturn ONLY valid JSON (no markdown, no code blocks, no explanation):\n{"name":"character name","role":"brief role or identity (5-10 words)","description":"one sentence who they are (max 15 words)","prompt":"300-500 word character prompt — start with 'You are [name]...', include: who they are, how they speak day-to-day, their personality quirks, what they genuinely care about, what annoys them, their background. Make them feel like a real person or character — NOT an AI assistant. No \\"Certainly!\\", no formal helper voice."}${langInstruction}`,
      config,
    })

    if (res.success && res.text) {
      let data
      try {
        data = JSON.parse(extractJSON(res.text))
      } catch {
        aiError.value = 'AI returned invalid JSON. Try again.'
        generating.value = false
        return
      }
      draftName.value = data.name || draftName.value || 'Unnamed'
      draftDescription.value = data.description || ''
      draftPrompt.value = data.prompt || ''
      if (!isRewrite) {
        draftAvatar.value = `a${Math.floor(Math.random() * 36) + 1}`
      }
      showDescribeInput.value = false
      describeText.value = ''
    } else {
      aiError.value = res.error || 'Generation failed. Make sure your utility model is configured in Config → AI → Models.'
    }
  } catch (err) {
    aiError.value = err.message || 'Generation failed.'
  }
  generating.value = false
}

async function applyRewriteInstruction() {
  const instruction = rewriteText.value.trim()
  if (!instruction) return
  generating.value = true
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const res = await window.electronAPI.enhancePrompt({
      prompt: `You are updating an existing AI persona based on the user's instruction. Apply the instruction to the name, description, and prompt — only change what the instruction requires, keep everything else intact.\n\nCurrent persona:\n- Name: ${draftName.value}\n- Description: ${draftDescription.value}\n- Prompt: ${draftPrompt.value}\n\nUser instruction: "${instruction}"\n\nReturn ONLY valid JSON (no markdown, no code blocks, no explanation):\n{"name":"updated name","description":"updated description","prompt":"updated full prompt"}`,
      config,
    })

    if (res.success && res.text) {
      let data
      try {
        data = JSON.parse(extractJSON(res.text))
      } catch {
        aiError.value = 'AI returned invalid JSON. Try again.'
        generating.value = false
        return
      }
      if (data.name) draftName.value = data.name
      if (data.description) draftDescription.value = data.description
      if (data.prompt) draftPrompt.value = data.prompt
      showRewriteInput.value = false
      rewriteText.value = ''
    } else {
      aiError.value = res.error || 'Rewrite failed. Make sure your utility model is configured in Config → AI → Models.'
    }
  } catch (err) {
    aiError.value = err.message || 'Rewrite failed.'
  }
  generating.value = false
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


// ── Validation ──
const errors = ref({})

const hasSummaryErrors = computed(() => !!(errors.value.name || errors.value.avatar || errors.value.description || errors.value.prompt))
const hasModelErrors = computed(() => !!(errors.value.provider || errors.value.model))
const hasVoiceErrors = computed(() => !!errors.value.voice)

function clearError(field) {
  if (errors.value[field]) {
    const e = { ...errors.value }
    delete e[field]
    errors.value = e
  }
}

// ── Unified save ──
function saveAll() {
  const e = {}
  if (!draftName.value.trim()) e.name = 'Name is required'
  if (!draftAvatar.value) e.avatar = 'Avatar is required'
  if (!draftDescription.value.trim()) e.description = 'Description is required'
  if (!draftPrompt.value.trim()) e.prompt = 'Persona prompt is required'
  if (props.personaType === 'system') {
    if (!draftProvider.value) e.provider = 'Provider is required'
    if (!draftModelId.value) e.model = 'Model is required'
    if (!draftVoiceId.value) e.voice = 'Voice is required'
  }

  if (Object.keys(e).length > 0) {
    errors.value = e
    // Navigate to the first tab with errors
    if (e.name || e.avatar || e.description || e.prompt) activeTab.value = 'summary'
    else if (e.provider || e.model) activeTab.value = 'model'
    else if (e.voice) activeTab.value = 'voice'
    return
  }
  errors.value = {}

  // Emit all current drafts so parent can persist
  emit('update-persona', {
    name: draftName.value,
    avatar: draftAvatar.value,
    description: draftDescription.value,
    prompt: draftPrompt.value,
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
  window.addEventListener('click', onProviderDropdownClickOutside)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('click', onProviderDropdownClickOutside)
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
.soul-tab-error-dot {
  width: 0.375rem; height: 0.375rem; border-radius: 50%;
  background: #EF4444; flex-shrink: 0;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.6);
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
.soul-avatar-error { outline: 2px solid #EF4444; outline-offset: 2px; }
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
.soul-input-error { border-color: #EF4444 !important; }
.soul-validation-error {
  font-family: 'Inter', sans-serif; font-size: 0.6875rem; font-weight: 600;
  color: #EF4444; margin-top: 0.125rem;
}
.soul-ai-error {
  display: block; font-family: 'Inter', sans-serif; font-size: 0.6875rem; font-weight: 500;
  color: #FCA5A5; margin-top: 0.25rem; line-height: 1.4;
}

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
.soul-provider-custom {
  position: relative; width: 100%;
}
.soul-provider-custom.soul-input-error .soul-provider-trigger {
  border-color: #EF4444 !important;
}
.soul-provider-trigger {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 0.5625rem 0.75rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600; color: #FFFFFF; outline: none;
  cursor: pointer; transition: border-color 0.15s;
  text-align: left;
}
.soul-provider-trigger:hover { border-color: #4B5563; }
.soul-provider-trigger.open { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75,85,99,0.2); }
.soul-provider-dropdown {
  position: absolute; top: calc(100% + 0.25rem); left: 0; right: 0; z-index: 50;
  background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 0.5rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
  overflow: hidden;
}
.soul-provider-option {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 0.5625rem 0.75rem; border: none; background: transparent;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600; color: #9CA3AF; cursor: pointer; text-align: left;
  transition: all 0.12s; border-bottom: 1px solid #1F1F1F;
}
.soul-provider-option:last-child { border-bottom: none; }
.soul-provider-option:hover { background: #222222; color: #FFFFFF; }
.soul-provider-option.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
}
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

/* -- AI creation bar (new persona) --------------------------------------- */
.soul-ai-create-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: rgba(245, 158, 11, 0.05);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 0.625rem;
  margin-bottom: 0.875rem;
  flex-shrink: 0;
}
.soul-ai-create-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #6B7280;
  margin-right: 0.125rem;
}

/* -- Describe / Rewrite input -------------------------------------------- */
.soul-describe-wrap,
.soul-rewrite-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}
.soul-describe-textarea {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #FFFFFF;
  background: #1A1A1A;
  outline: none;
  resize: none;
  line-height: 1.5;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.soul-describe-textarea:focus { border-color: #4B5563; }
.soul-describe-textarea::placeholder { color: #4B5563; }
.soul-describe-actions {
  display: flex;
  gap: 0.375rem;
}
</style>
