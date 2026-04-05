<template>
  <Teleport to="body">
    <div class="import-wizard-overlay">
      <div class="import-wizard">

        <!-- Header -->
        <div class="wizard-header">
          <div>
            <h2 class="wizard-title">{{ t('agents.import.title') }}</h2>
            <p class="wizard-subtitle">{{ t('agents.import.subtitle') }}</p>
          </div>
          <button class="wizard-close" @click="$emit('close')" :aria-label="t('common.close')">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- Step indicator with navigation -->
        <div class="wizard-steps">
          <button class="step-nav-btn" :disabled="!canGoBack" @click="goBack" :aria-label="t('common.back')">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="step-dots-and-labels">
            <div class="step-dots">
              <div v-for="s in 4" :key="s"
                   class="step-dot" :class="{ active: step === s, done: step > s, clickable: s <= maxReachedStep && s !== step }"
                   @click="s <= maxReachedStep && (step = s)" />
            </div>
            <div class="step-labels">
              <span :class="{ active: step === 1 }">{{ t('agents.import.stepSource') }}</span>
              <span :class="{ active: step === 2 }">{{ t('agents.import.stepProfile') }}</span>
              <span :class="{ active: step === 3 }">{{ t('agents.import.stepGenerate') }}</span>
              <span :class="{ active: step === 4 }">{{ t('agents.import.stepReview') }}</span>
            </div>
          </div>
          <button class="step-nav-btn" :disabled="!canGoForward" @click="goForward" :aria-label="t('common.next')">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <!-- Source tabs — always visible at top -->
        <div v-if="step === 1 && !showContactList" class="source-tabs">
          <button
            v-for="src in SOURCES" :key="src.key"
            class="source-tab" :class="{ active: source === src.key }"
            @click="source = src.key"
          >{{ t('agents.import.' + src.labelKey) }}</button>
        </div>
        <div v-if="step === 1 && showContactList" class="contact-header">
          <p class="contact-list-title">{{ t('agents.import.contactListTitle') }}</p>
          <p class="hint-info" style="font-size:0.75rem;">
            {{ t('agents.import.contactListSubtitle').replace('{count}', contactListWithMessages.length) }}
          </p>
          <input v-model="contactFilter" class="field-input" style="margin-top:0.35rem;"
                 :placeholder="t('agents.import.contactSearchPlaceholder')" />
        </div>

        <!-- Step content -->
        <div class="wizard-body" :class="{ 'body-center': step === 2 || step === 3, 'body-fill': step === 1 && showContactList }">

          <!-- ── Step 1: Source ── -->
          <template v-if="step === 1">

            <!-- WeChat -->
            <template v-if="source === 'wechat'">
              <!-- Contact list (after decryption) -->
              <template v-if="showContactList">
                <div class="contact-list">
                  <div v-if="filteredContacts.length === 0" class="contact-empty">
                    {{ contactFilter ? t('agents.import.noContactsMatch') : t('agents.import.noContactsFound') }}
                  </div>
                  <div v-for="c in filteredContacts" :key="c.wxid"
                       class="contact-item" :class="{ selected: selectedContact?.wxid === c.wxid }"
                       @click="onSelectContact(c)">
                    <img v-if="c.avatar" :src="c.avatar" class="contact-avatar" />
                    <div v-else class="contact-avatar-placeholder">{{ (c.remark || c.nickname || '?')[0] }}</div>
                    <div class="contact-info">
                      <div class="contact-name">{{ c.remark || c.nickname || c.wxid }}</div>
                      <div class="contact-meta">
                        <span v-if="c.remark && c.nickname" class="contact-nickname">{{ c.nickname }}</span>
                        <span class="contact-count">
                          {{ t('agents.import.contactMessages').replace('{count}', c.messageCount || 0) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Source selection (before contact list) -->
              <template v-else>
                <!-- Option A: Auto-read from running WeChat -->
                <div class="import-option" :class="{ selected: wechatMode === 'auto' }" @click="wechatMode = 'auto'">
                  <div class="import-option-radio" :class="{ checked: wechatMode === 'auto' }" />
                  <div class="import-option-content">
                    <div class="import-option-title">{{ t('agents.import.modeAutoTitle') }}</div>
                    <div class="import-option-desc">{{ t('agents.import.modeAutoDesc') }}</div>
                  </div>
                  <span class="env-badge" :class="envReady ? 'ready' : 'not-ready'" style="flex-shrink:0;">
                    {{ envReady ? t('agents.import.toolReady') : t('agents.import.toolNotReady') }}
                  </span>
                </div>
                <!-- Option A details -->
                <template v-if="wechatMode === 'auto'">
                  <div v-if="!envReady" class="env-status-row" style="margin-left:1.75rem;">
                    <AppButton size="compact" :loading="settingUp" @click.stop="doSetupEnv">
                      {{ settingUp ? t('agents.import.settingUp') : t('agents.import.setupEnv') }}
                    </AppButton>
                  </div>
                  <div v-if="setupLog.length > 0" ref="setupLogEl" class="progress-log" style="margin-left:1.75rem;">
                    <div v-for="(l, i) in setupLog" :key="i" class="log-line">{{ l }}</div>
                  </div>
                  <p v-if="setupError" class="error-text" style="margin-left:1.75rem;">{{ setupError }}</p>
                </template>

                <!-- Option B: Already have data directory -->
                <div class="import-option" :class="{ selected: wechatMode === 'manual' }" @click="wechatMode = 'manual'">
                  <div class="import-option-radio" :class="{ checked: wechatMode === 'manual' }" />
                  <div class="import-option-content">
                    <div class="import-option-title">{{ t('agents.import.modeManualTitle') }}</div>
                    <div class="import-option-desc">{{ t('agents.import.modeManualDesc') }}</div>
                  </div>
                </div>
                <!-- Option B details -->
                <template v-if="wechatMode === 'manual'">
                  <div class="field-group" style="margin-left:1.75rem;">
                    <div class="file-row">
                      <input v-model="dbDir" class="field-input" :placeholder="t('agents.import.dbDirPlaceholder')" />
                      <AppButton size="compact" @click="browseDbDir">{{ t('agents.import.browseDir') }}</AppButton>
                    </div>
                  </div>
                </template>
              </template>
            </template>

            <!-- iMessage -->
            <template v-if="source === 'imessage'">
              <div v-if="process.platform !== 'darwin'" class="hint-warn">{{ t('agents.import.macOnlyFeature') }}</div>
              <template v-else>
                <div class="field-group">
                  <label class="field-label">{{ t('agents.import.handleLabel') }}</label>
                  <input v-model="contactName" class="field-input" :placeholder="t('agents.import.handlePlaceholder')" />
                </div>
                <p class="hint-info">{{ t('agents.import.macOnlyNeedAccess') }}</p>
              </template>
            </template>

            <!-- WhatsApp -->
            <template v-if="source === 'whatsapp'">
              <div class="field-group">
                <label class="field-label">{{ t('agents.import.contactNameLabel') }}</label>
                <input v-model="contactName" class="field-input" :placeholder="t('agents.import.contactNamePlaceholder')" />
              </div>
              <div class="file-row">
                <AppButton size="compact" @click="pickWhatsAppFile">{{ t('agents.import.uploadFile') }}</AppButton>
                <span v-if="filePath" class="file-name-label">{{ shortFileName(filePath) }}</span>
              </div>
            </template>

            <!-- Plain text -->
            <template v-if="source === 'text'">
              <div class="field-group">
                <label class="field-label">{{ t('agents.import.contactNameLabel') }}</label>
                <input v-model="contactName" class="field-input" :placeholder="t('agents.import.contactNamePlaceholder')" />
              </div>
              <div class="field-group">
                <label class="field-label">{{ t('agents.import.textareaLabel') }}</label>
                <textarea v-model="rawText" class="field-textarea" rows="8" :placeholder="t('agents.import.textareaPlaceholder')" />
              </div>
            </template>

            <!-- Extraction progress (shown during Next click) -->
            <div v-if="extracting" class="progress-bar-wrap">
              <div class="progress-bar" :style="{ width: extractProgress + '%' }" />
              <span class="progress-msg">{{ extractMsg }}</span>
            </div>
            <div v-if="extractError" class="error-block">
              <p class="error-text" style="white-space:pre-line;">{{ extractError }}</p>
            </div>
          </template>

          <!-- ── Step 2: Profile ── -->
          <template v-if="step === 2">
            <p class="hint-info mb-2">{{ t('agents.import.allOptional') }}</p>

            <div class="field-group">
              <label class="field-label">{{ t('agents.import.profileName') }}</label>
              <input v-model="profile.name" class="field-input" :placeholder="t('agents.import.profileNamePlaceholder')" />
            </div>

            <div class="field-group">
              <label class="field-label">{{ t('agents.import.profileGender') }}</label>
              <div class="chip-row">
                <button
                  v-for="g in GENDERS" :key="g.key"
                  class="chip" :class="{ active: profile.gender === g.key }"
                  @click="profile.gender = profile.gender === g.key ? '' : g.key"
                >{{ t('agents.import.' + g.labelKey) }}</button>
              </div>
            </div>

          </template>

          <!-- ── Step 3: Analyze ── -->
          <template v-if="step === 3">
            <!-- Summary card -->
            <div class="summary-card">
              <div class="summary-row">
                <span class="summary-label">{{ t('agents.import.messageCount').replace('{count}', classified?.total_count || 0) }}</span>
                <span class="summary-label">{{ t('agents.import.theirCount').replace('{count}', classified?.total_their_count || 0) }}</span>
              </div>
              <p v-if="classified?.total_their_count < 50" class="hint-warn mt-1">
                {{ t('agents.import.warningFewMessages').replace('{count}', classified?.total_their_count || 0) }}
              </p>
            </div>

            <!-- Provider / Model selector -->
            <div class="field-group">
              <label class="field-label">{{ t('agents.import.analyzeModel') }}</label>
              <div class="model-select-row">
                <select v-model="analyzeProviderType" class="field-select" @change="onAnalyzeProviderChange">
                  <option v-for="p in activeProviders" :key="p.type" :value="p.type">{{ p.label || p.type }}</option>
                </select>
                <select v-model="analyzeModelId" class="field-select" style="flex:2;">
                  <option v-for="m in analyzeModelList" :key="m.id" :value="m.id">
                    {{ m.name || m.id }}{{ m.context_length ? ` (${Math.round(m.context_length / 1000)}k)` : '' }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Start Analyzing / Re-analyze button -->
            <div v-if="!analyzing" class="mt-1" style="display:flex; justify-content:flex-end;">
              <AppButton size="compact" :loading="analyzing" @click="doAnalyze" style="background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151); color: #fff;">
                {{ generatedPrompt ? t('agents.import.reAnalyze') : t('agents.import.startAnalyzing') }}
              </AppButton>
            </div>

            <!-- Analysis progress -->
            <div v-if="analyzing" class="analyze-progress-card mt-2">
              <div class="analyze-spinner-row">
                <div class="analyze-spinner" />
                <span class="analyze-step-label">{{ analyzeMsg }}</span>
              </div>
              <div class="progress-bar-wrap mt-1">
                <div class="progress-bar" :style="{ width: analyzeProgress + '%' }" />
              </div>
              <p v-if="analyzeTip" class="analyze-tip">{{ analyzeTip }}</p>
            </div>
            <p v-if="analyzeError" class="error-text">{{ analyzeError }}</p>

            <!-- Analysis done preview -->
            <div v-if="generatedPrompt && !analyzing" class="analysis-done-card mt-2">
              <div class="analysis-done-header">
                <svg style="width:16px;height:16px;color:#22c55e;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>{{ t('agents.import.analysisComplete') }}</span>
              </div>
              <p class="hint-info" style="margin-top:0.25rem;">{{ t('agents.import.analysisCompleteHint') }}</p>
            </div>
          </template>

          <!-- ── Step 4: Review & Create ── -->
          <template v-if="step === 4">
            <!-- Avatar + Name row -->
            <div class="review-top-row">
              <div class="avatar-col" @click="showAvatarPicker = true" :title="t('agents.browseAvatars')">
                <img v-if="selectedAvatarUrl" :src="selectedAvatarUrl" class="avatar-preview-lg" />
                <div class="avatar-edit-hint">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </div>
              </div>
              <div class="review-name-col">
                <div class="field-group">
                  <label class="field-label">{{ t('agents.import.agentNameLabel') }}</label>
                  <input v-model="agentName" class="field-input" :placeholder="t('agents.import.agentNamePlaceholder')" />
                </div>
                <div class="field-group">
                  <label class="field-label">{{ t('agents.import.agentDescLabel') }}</label>
                  <input v-model="agentDescription" class="field-input" maxlength="80" :placeholder="t('agents.import.agentDescPlaceholder')" />
                </div>
              </div>
            </div>

            <!-- Relationship & Impression (auto-inferred, editable) -->
            <div class="field-group">
              <label class="field-label">{{ t('agents.import.profileRelationship') }}</label>
              <input v-model="profile.relationship" class="field-input" :placeholder="t('agents.import.profileRelationshipPlaceholder')" />
            </div>
            <div class="field-group">
              <label class="field-label">{{ t('agents.import.profileImpression') }}</label>
              <input v-model="profile.impression" class="field-input" :placeholder="t('agents.import.profileImpressionPlaceholder')" />
            </div>
            <div class="field-group">
              <label class="field-label">{{ t('agents.import.theirImpression') }}</label>
              <input v-model="profile.theirImpression" class="field-input" :placeholder="t('agents.import.theirImpressionPlaceholder')" />
            </div>

            <!-- Agent Provider / Model -->
            <div class="field-group">
              <label class="field-label">{{ t('agents.import.agentModel') }}</label>
              <div class="model-select-row">
                <select v-model="agentProviderType" class="field-select" @change="onAgentProviderChange">
                  <option v-for="p in activeProviders" :key="p.type" :value="p.type">{{ p.label || p.type }}</option>
                </select>
                <select v-model="agentModelId" class="field-select" style="flex:2;">
                  <option v-for="m in agentModelList" :key="m.id" :value="m.id">
                    {{ m.name || m.id }}{{ m.context_length ? ` (${Math.round(m.context_length / 1000)}k)` : '' }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Voice selection -->
            <div class="field-group">
              <label class="field-label">{{ t('agents.voice') }} <span style="color:var(--c-danger);">*</span></label>
              <div class="iw-voice-row">
                <select v-model="importVoiceId" class="field-select" style="flex:1;">
                  <option v-for="v in EDGE_VOICES" :key="v.id" :value="v.id">
                    {{ v.name }} — {{ v.gender === 'Female' ? t('common.female') : v.gender === 'Male' ? t('common.male') : '' }} · {{ v.locale === 'zh-CN' ? t('common.chinese') : t('common.english') }}
                  </option>
                </select>
                <button
                  class="iw-preview-btn"
                  :disabled="previewingVoice"
                  @click="previewImportVoice"
                  :title="t('agents.voicePreview')"
                >
                  <svg v-if="previewingVoice" class="animate-spin" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
                  <svg v-else style="width:14px;height:14px;" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
              </div>
            </div>

            <!-- Save chat history toggle -->
            <div class="memory-toggle-row">
              <label class="toggle-label">
                <input type="checkbox" v-model="saveHistory" class="toggle-checkbox" />
                <span class="toggle-switch" />
                <span class="toggle-text">{{ t('agents.import.saveHistory') }}</span>
              </label>
              <span class="memory-count">{{ classified?.total_count || 0 }} {{ t('agents.import.messagesLabel') }}</span>
            </div>
            <p v-if="saveHistory" class="hint-info" style="font-size:0.7rem;">
              {{ t('agents.import.saveHistoryHint') }}
            </p>

            <!-- Import memories toggle -->
            <div class="memory-toggle-row" style="margin-top:0.35rem;">
              <label class="toggle-label">
                <input type="checkbox" v-model="importMemories" class="toggle-checkbox"
                       :disabled="extractedMemories.length === 0" />
                <span class="toggle-switch" :class="{ disabled: extractedMemories.length === 0 }" />
                <span class="toggle-text">{{ t('agents.import.importMemories') }}</span>
              </label>
              <span class="memory-count">
                {{ extractedMemories.length > 0
                  ? extractedMemories.length + ' ' + t('agents.import.memoryEntries')
                  : t('agents.import.noMemories') }}
              </span>
            </div>
            <p v-if="importMemories && extractedMemories.length > 0" class="hint-info" style="font-size:0.7rem;">
              {{ t('agents.import.importMemoriesHint') }}
            </p>

            <!-- Generated prompt -->
            <div class="field-group">
              <label class="field-label">{{ t('agents.import.generatedPromptLabel') }}</label>
              <textarea v-model="generatedPrompt" class="field-textarea generated-prompt-area" rows="12" />
            </div>
          </template>

        </div>

        <!-- Footer -->
        <div class="wizard-footer">
          <AppButton size="compact" variant="ghost" @click="$emit('close')">{{ t('common.cancel') }}</AppButton>
          <div style="flex:1" />
          <AppButton v-if="canGoBack" size="compact" variant="ghost" @click="goBack">{{ t('agents.import.previousStep') }}</AppButton>
          <AppButton
            v-if="step < 4 && !(step === 3 && !generatedPrompt)"
            size="compact"
            :loading="extracting"
            :disabled="!canProceed"
            @click="nextStep"
            style="background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151); color: #fff;"
          >{{ step === 1 && source === 'wechat' && !showContactList ? t('agents.import.readAndList') : t('common.next') }}</AppButton>
          <AppButton
            v-if="step === 4"
            size="compact"
            :loading="creating"
            :disabled="!agentName.trim() || !generatedPrompt.trim() || !agentProviderType || !agentModelId || !importVoiceId"
            @click="doCreateAgent"
            style="background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151); color: #fff;"
          >{{ t('agents.import.createAgent') }}</AppButton>
        </div>

      </div>
    </div>

    <!-- Avatar Picker Modal -->
    <AvatarPicker
      v-if="showAvatarPicker"
      :current-avatar-id="selectedAvatarId"
      @select="onAvatarSelect"
      @close="showAvatarPicker = false"
    />
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive, watch, nextTick, onUnmounted } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useI18n } from '../../i18n/useI18n'
import { useAgentsStore } from '../../stores/agents'
import { useConfigStore } from '../../stores/config'
import { useModelsStore } from '../../stores/models'
import AppButton from '../common/AppButton.vue'
import AvatarPicker from './AvatarPicker.vue'
import { generateRandomBatch, getAvatarDataUri } from './agentAvatars'
import { EDGE_VOICES, getDefaultVoiceForLocale } from '../../utils/edgeVoices'

const { t } = useI18n()
const agentsStore = useAgentsStore()
const configStore = useConfigStore()
const modelsStore = useModelsStore()

const emit = defineEmits(['close', 'created'])

// ── Step state ──────────────────────────────────────────────────────────────
const step = ref(1)
const maxReachedStep = ref(1)

const canGoBack = computed(() => {
  if (step.value === 1 && showContactList.value) return true
  return step.value > 1
})

const canGoForward = computed(() => {
  if (step.value === 1 && showContactList.value && !selectedContact.value) return false
  return step.value < maxReachedStep.value
})

function goForward() {
  if (step.value < maxReachedStep.value) step.value++
}

// ── Source state ────────────────────────────────────────────────────────────
const SOURCES = [
  { key: 'wechat',    labelKey: 'sourceWeChat' },
  { key: 'imessage', labelKey: 'sourceIMessage' },
  { key: 'whatsapp', labelKey: 'sourceWhatsApp' },
  { key: 'text',     labelKey: 'sourceText' },
]
const source = ref('wechat')
const contactName = ref('')
const dbDir = ref('')
const filePath = ref('')
const rawText = ref('')
const showDbDir = ref(false)
const wechatMode = ref('auto') // 'auto' | 'manual'

// ── WeChat contact list state ────────────────────────────────────────────────
const showContactList = ref(false)
const contactList = ref([])
const selectedContact = ref(null)
const contactFilter = ref('')
const decryptedDir = ref('')

const contactListWithMessages = computed(() =>
  contactList.value.filter(c => (c.messageCount || 0) > 0)
)

const filteredContacts = computed(() => {
  const q = contactFilter.value.trim().toLowerCase()
  if (!q) return contactList.value
  return contactList.value.filter(c =>
    (c.remark || '').toLowerCase().includes(q) ||
    (c.nickname || '').toLowerCase().includes(q) ||
    (c.wxid || '').toLowerCase().includes(q)
  )
})

function onSelectContact(c) {
  selectedContact.value = c
  // Auto-fill profile from contact info
  const displayName = c.remark || c.nickname || c.wxid
  profile.name = displayName
  // Set avatar
  if (c.avatar) {
    selectedAvatarUrl.value = c.avatar
    selectedAvatarId.value = ''
  }
}

// ── Env state ───────────────────────────────────────────────────────────────
const envReady = ref(false)
const settingUp = ref(false)
const setupLog = ref([])
const setupError = ref('')
const setupLogEl = ref(null)

watch(setupLog, async () => {
  await nextTick()
  if (setupLogEl.value) setupLogEl.value.scrollTop = setupLogEl.value.scrollHeight
}, { deep: true })

async function checkEnv() {
  const res = await window.electronAPI.agentImport.checkEnv()
  envReady.value = !!res.ready
}
checkEnv()

async function doSetupEnv() {
  settingUp.value = true
  setupLog.value = []
  setupError.value = ''
  const unsub = window.electronAPI.agentImport.onProgress((data) => {
    if (data.message) setupLog.value.push(data.message)
  })
  try {
    const res = await window.electronAPI.agentImport.setupEnv()
    if (res && res.success) {
      envReady.value = true
      setupLog.value = []
    } else {
      setupError.value = res?.error || t('agents.import.setupFailed')
    }
  } catch (err) {
    setupError.value = err.message || t('agents.import.setupFailedGeneric')
  } finally {
    unsub()
    settingUp.value = false
  }
}

async function browseDbDir() {
  const res = await window.electronAPI.agentImport.pickDir()
  if (res.dirPath) dbDir.value = res.dirPath
}

// ── WhatsApp file pick ──────────────────────────────────────────────────────
async function pickWhatsAppFile() {
  const res = await window.electronAPI.agentImport.pickFile()
  if (res.filePath) filePath.value = res.filePath
}

function shortFileName(fp) {
  return fp ? fp.split(/[\\/]/).pop() : ''
}

// ── Can proceed ─────────────────────────────────────────────────────────────
const canProceed = computed(() => {
  if (step.value === 1) {
    if (source.value === 'wechat') {
      if (showContactList.value) return selectedContact.value !== null
      if (wechatMode.value === 'manual') return dbDir.value.trim().length > 0
      return true  // auto mode — always allow attempt
    }
    if (source.value === 'imessage')  return window.electronAPI?.platform === 'darwin' && contactName.value.trim().length > 0
    if (source.value === 'whatsapp')  return filePath.value.length > 0
    if (source.value === 'text')      return rawText.value.trim().length > 0
    return false
  }
  if (step.value === 2) return true
  if (step.value === 3) return !!generatedPrompt.value  // must analyze before proceeding
  return true
})

// ── Extraction ──────────────────────────────────────────────────────────────
const extracting = ref(false)
const extractProgress = ref(0)
const extractMsg = ref('')
const extractError = ref('')
const classified = ref(null)

async function doDecryptAndList() {
  extracting.value = true
  extractProgress.value = 0
  extractMsg.value = t('agents.import.decrypting')
  extractError.value = ''

  const unsub = window.electronAPI.agentImport.onProgress((data) => {
    extractProgress.value = data.progress || 0
    extractMsg.value = data.message || ''
  })

  try {
    // Manual mode: skip decryption, use provided directory directly
    const useManualDir = wechatMode.value === 'manual' && dbDir.value.trim()
    const decryptRes = useManualDir
      ? { success: true, decryptedDir: dbDir.value.trim() }
      : await window.electronAPI.agentImport.decryptWeChat({})
    if (!decryptRes.success) {
      const err = decryptRes.error || ''
      if (/process not found|未找到微信进程/i.test(err)) {
        extractError.value = t('agents.import.wechatNotFound')
      } else if (/extract any keys|Failed to extract/i.test(err)) {
        extractError.value = t('agents.import.keyExtractionFailed')
      } else if (/data directory not found/i.test(err)) {
        extractError.value = t('agents.import.dataDirNotFound')
      } else {
        extractError.value = err || t('agents.import.readFailed')
      }
      return
    }
    decryptedDir.value = decryptRes.decryptedDir

    extractMsg.value = t('agents.import.loadingContacts')
    const listRes = await window.electronAPI.agentImport.listContacts({
      dbDir: decryptRes.decryptedDir,
      source: 'wechat',
    })
    if (!listRes.success) {
      extractError.value = listRes.error || t('agents.import.loadContactsFailed')
      return
    }

    contactList.value = listRes.contacts || []
    selectedContact.value = null
    contactFilter.value = ''
    showContactList.value = true
    extractProgress.value = 0
    extractMsg.value = ''
  } finally {
    unsub()
    extracting.value = false
  }
}

async function doExtract() {
  extracting.value = true
  extractProgress.value = 0
  extractMsg.value = ''
  extractError.value = ''

  const unsub = window.electronAPI.agentImport.onProgress((data) => {
    extractProgress.value = data.progress || 0
    extractMsg.value = data.message || ''
  })

  // For WeChat with contact list: use wxid directly (avoids fragile display-name lookup)
  const resolvedContactName = (source.value === 'wechat' && selectedContact.value)
    ? selectedContact.value.wxid
    : contactName.value.trim()

  const resolvedDbDir = (source.value === 'wechat' && decryptedDir.value)
    ? decryptedDir.value
    : (dbDir.value.trim() || null)

  const params = {
    source: source.value,
    contactName: resolvedContactName,
    dbDir: resolvedDbDir,
    filePath: filePath.value || null,
    text: rawText.value || null,
  }

  const res = await window.electronAPI.agentImport.extractMessages(params)
  unsub()
  extracting.value = false

  if (!res.success) {
    extractError.value = res.error || t('agents.import.extractionFailed')
    if (source.value === 'wechat' && !dbDir.value && !decryptedDir.value) {
      showDbDir.value = true
    }
    return false
  }

  classified.value = res.classified
  // Pre-fill profile name with selected contact's display name
  if (!profile.name) {
    const fallback = (source.value === 'wechat' && selectedContact.value)
      ? (selectedContact.value.remark || selectedContact.value.nickname || selectedContact.value.wxid)
      : (res.classified?.target_name || '')
    if (fallback) profile.name = fallback
  }
  return true
}

// ── Profile ─────────────────────────────────────────────────────────────────
const GENDERS = [
  { key: 'male',      labelKey: 'genderMale' },
  { key: 'female',    labelKey: 'genderFemale' },
  { key: 'nonbinary', labelKey: 'genderNonBinary' },
  { key: 'unknown',   labelKey: 'genderUnknown' },
]
const profile = reactive({
  name: '',
  gender: '',
  relationship: '',
  impression: '',
  theirImpression: '',
})

// ── Step navigation ─────────────────────────────────────────────────────────
async function nextStep() {
  if (step.value === 1) {
    if (source.value === 'wechat') {
      if (!showContactList.value) {
        // First: decrypt and show contact list
        await doDecryptAndList()
        return  // stay on step 1 with contact list shown
      }
      // Contact selected — extract messages for that contact
      if (!selectedContact.value) return
    }
    const ok = await doExtract()
    if (!ok) return
  }
  step.value++
  if (step.value > maxReachedStep.value) maxReachedStep.value = step.value
}

function goBack() {
  if (step.value === 1 && showContactList.value) {
    showContactList.value = false
    selectedContact.value = null
    contactFilter.value = ''
    extractError.value = ''
  } else {
    step.value--
  }
}

// ── Provider / Model selector for analysis ─────────────────────────────────
const analyzeProviderType = ref('')
const analyzeModelId = ref('')

const activeProviders = computed(() => {
  const cfg = configStore.config || {}
  const providers = Array.isArray(cfg.providers) ? cfg.providers : []
  return providers.filter(p => p?.isActive).map(p => ({
    type: p.type,
    label: p.label || p.type,
    id: p.id || p.type,
  }))
})

const analyzeModelList = computed(() => {
  if (!analyzeProviderType.value) return []
  return modelsStore.getModelsForProvider(analyzeProviderType.value) || []
})

function onAnalyzeProviderChange() {
  // Auto-select first model when provider changes
  const models = analyzeModelList.value
  analyzeModelId.value = models.length > 0 ? models[0].id : ''
}

// Initialize from utility model config
function initAnalyzeModel() {
  const um = configStore.config?.utilityModel
  if (um?.provider) {
    analyzeProviderType.value = um.provider
    analyzeModelId.value = um.model || ''
  } else if (activeProviders.value.length > 0) {
    analyzeProviderType.value = activeProviders.value[0].type
    onAnalyzeProviderChange()
  }
}
initAnalyzeModel()

// ── Agent Provider / Model (for the created agent) ─────────────────────────
const agentProviderType = ref('')
const agentModelId = ref('')
const importVoiceId = ref(getDefaultVoiceForLocale(configStore.language))
const previewingVoice = ref(false)
let _previewAudioEl = null

async function previewImportVoice() {
  if (!importVoiceId.value || previewingVoice.value) return
  // Use agent description (first 200 chars) as preview text
  const text = (agentDescription.value || agentName.value || 'Hello').slice(0, 200)
  previewingVoice.value = true
  try {
    if (_previewAudioEl) { _previewAudioEl.pause(); _previewAudioEl = null }
    const result = await window.electronAPI.voice.edgeTtsNode({ text, voice: importVoiceId.value })
    if (result?.success && result.audio) {
      _previewAudioEl = new Audio(`data:audio/${result.format || 'mp3'};base64,${result.audio}`)
      _previewAudioEl.onended = () => { previewingVoice.value = false }
      _previewAudioEl.onerror = () => { previewingVoice.value = false }
      await _previewAudioEl.play()
      return
    }
  } catch { /* ignore */ }
  previewingVoice.value = false
}

const agentModelList = computed(() => {
  if (!agentProviderType.value) return []
  return modelsStore.getModelsForProvider(agentProviderType.value) || []
})

function onAgentProviderChange() {
  const models = agentModelList.value
  agentModelId.value = models.length > 0 ? models[0].id : ''
}

// Initialize from utility model or first active provider
function initAgentModel() {
  const um = configStore.config?.utilityModel
  if (um?.provider) {
    agentProviderType.value = um.provider
    agentModelId.value = um.model || ''
  } else if (activeProviders.value.length > 0) {
    agentProviderType.value = activeProviders.value[0].type
    onAgentProviderChange()
  }
}
initAgentModel()

// ── Analysis ────────────────────────────────────────────────────────────────
const analyzing = ref(false)
const analyzeProgress = ref(0)
const analyzeMsg = ref('')
const analyzeTip = ref('')
const analyzeError = ref('')
const generatedPrompt = ref('')
const agentName = ref('')
const agentDescription = ref('')
const extractedMemories = ref([])
const saveHistory = ref(true)
const importMemories = ref(true)
let tipTimer = null

const TIPS_EN = [
  'Analyzing speech patterns and catchphrases...',
  'Identifying emotional expression styles...',
  'Mapping conflict and communication patterns...',
  'Extracting personality traits from chat history...',
  'Building behavioral model from real conversations...',
  'This may take a minute for large chat histories.',
]
const TIPS_ZH = [
  '正在分析语言习惯和口头禅...',
  '正在识别情感表达方式...',
  '正在梳理沟通和冲突模式...',
  '正在从聊天记录中提取性格特征...',
  '正在基于真实对话构建行为模型...',
  '聊天记录较多时可能需要几分钟。',
]

function startTipRotation() {
  const tips = configStore.language === 'zh' ? TIPS_ZH : TIPS_EN
  let idx = 0
  analyzeTip.value = tips[0]
  tipTimer = setInterval(() => {
    idx = (idx + 1) % tips.length
    analyzeTip.value = tips[idx]
  }, 6000)
}

function stopTipRotation() {
  if (tipTimer) { clearInterval(tipTimer); tipTimer = null }
  analyzeTip.value = ''
}

async function doAnalyze() {
  analyzing.value = true
  analyzeProgress.value = 0
  analyzeMsg.value = ''
  analyzeError.value = ''
  startTipRotation()

  const unsub = window.electronAPI.agentImport.onProgress((data) => {
    analyzeProgress.value = data.progress || 0
    analyzeMsg.value = data.message || ''
  })

  const config = JSON.parse(JSON.stringify(configStore.config || {}))
  const plainClassified = JSON.parse(JSON.stringify(classified.value || {}))
  const plainProfile = JSON.parse(JSON.stringify(profile))
  const res = await window.electronAPI.agentImport.analyze({
    classified: plainClassified,
    profile: plainProfile,
    config,
    providerType: analyzeProviderType.value || undefined,
    modelId: analyzeModelId.value || undefined,
  })
  unsub()
  stopTipRotation()
  analyzing.value = false

  if (!res.success) {
    analyzeError.value = res.error || t('agents.import.analysisFailed')
    return
  }

  generatedPrompt.value = res.systemPrompt || ''
  agentDescription.value = res.description || ''
  extractedMemories.value = Array.isArray(res.memories) ? res.memories : []
  // Auto-fill relationship and impression from LLM inference (only if user hasn't set them)
  if (!profile.relationship && res.inferredRelationship) profile.relationship = res.inferredRelationship
  if (!profile.impression && res.inferredImpression) profile.impression = res.inferredImpression
  if (!profile.theirImpression && res.inferredTheirImpression) profile.theirImpression = res.inferredTheirImpression
  const contactDisplayName = selectedContact.value
    ? (selectedContact.value.remark || selectedContact.value.nickname || selectedContact.value.wxid)
    : contactName.value
  agentName.value = res.suggestedName || profile.name || contactDisplayName || 'Imported'
  // Analysis done — unlock step 4
  if (maxReachedStep.value < 4) maxReachedStep.value = 4
}

// ── Avatar ──────────────────────────────────────────────────────────────────
const showAvatarPicker = ref(false)
const selectedAvatarId = ref('')
const selectedAvatarUrl = ref('')

// Pick a random default avatar
const defaultBatch = generateRandomBatch(20, 'avataaars')
if (defaultBatch.length > 0) {
  const av = defaultBatch[Math.floor(Math.random() * defaultBatch.length)]
  selectedAvatarId.value = av.id
  selectedAvatarUrl.value = getAvatarDataUri(av.id)
}

function onAvatarSelect(idOrDataUri) {
  if (idOrDataUri && idOrDataUri.startsWith('data:')) {
    selectedAvatarUrl.value = idOrDataUri
    selectedAvatarId.value = ''
  } else {
    selectedAvatarId.value = idOrDataUri
    selectedAvatarUrl.value = getAvatarDataUri(idOrDataUri)
  }
  showAvatarPicker.value = false
}

// ── Build final prompt with relationship context ────────────────────────────
function buildFinalPrompt() {
  let prompt = generatedPrompt.value
  const extras = []
  if (profile.relationship) extras.push(`Relationship: ${profile.relationship}`)
  if (profile.impression) extras.push(`User's impression: ${profile.impression}`)
  if (profile.theirImpression) extras.push(`Their impression of user: ${profile.theirImpression}`)
  if (extras.length > 0) {
    const zh = configStore.language === 'zh'
    const header = zh ? '## 关系与印象' : '## Relationship & Impressions'
    prompt = prompt.trim() + '\n\n' + header + '\n' + extras.join('\n')
  }
  return prompt
}

// ── Create Agent ─────────────────────────────────────────────────────────────
const creating = ref(false)

async function doCreateAgent() {
  if (!agentName.value.trim() || !generatedPrompt.value.trim()) return
  creating.value = true

  const sourceLabelMap = { wechat: 'WeChat', imessage: 'iMessage', whatsapp: 'WhatsApp', text: 'Text' }
  const sourceLabel = sourceLabelMap[source.value] || source.value

  const agentId = uuidv4()

  await agentsStore.saveAgent({
    id: agentId,
    type: 'system',
    name: agentName.value.trim().replace(/\s+/g, '_'),
    prompt: buildFinalPrompt(),
    avatar: selectedAvatarUrl.value || '',
    avatarId: selectedAvatarId.value || '',
    description: agentDescription.value.trim() || t('agents.import.importedFrom', { source: sourceLabel }),
    providerId: agentProviderType.value,
    modelId: agentModelId.value,
    voiceId: importVoiceId.value,
  })

  // Save full chat history if enabled
  if (saveHistory.value && classified.value?.all_messages?.length > 0) {
    try {
      const contactDisplayName = selectedContact.value
        ? (selectedContact.value.remark || selectedContact.value.nickname || selectedContact.value.wxid)
        : (contactName.value || profile.name)
      await window.electronAPI.agentImport.saveHistory({
        agentId,
        messages: JSON.parse(JSON.stringify(classified.value.all_messages)),
        contactName: contactDisplayName,
      })
    } catch (e) {
      console.warn('Failed to save chat history:', e)
    }
  }

  // Write memories to agent's soul file if enabled
  if (importMemories.value && extractedMemories.value.length > 0) {
    try {
      await window.electronAPI.agentImport.writeMemories({
        agentId,
        memories: JSON.parse(JSON.stringify(extractedMemories.value)),
      })
    } catch (e) {
      console.warn('Failed to write memories:', e)
    }
  }

  creating.value = false
  emit('created')
  emit('close')
}

// ── Expose platform for template ─────────────────────────────────────────────
const { platform } = window.electronAPI || {}
const process = { platform: platform || 'unknown' }

// ── Cleanup decrypted data when wizard closes ────────────────────────────────
onUnmounted(() => {
  stopTipRotation()
  window.electronAPI?.agentImport?.cleanup?.()
})
</script>

<style scoped>
.import-wizard-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.import-wizard {
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 16px;
  width: 90vw;
  max-width: 1000px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #FFFFFF;
}

.wizard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.25rem 1.5rem 0.75rem;
  border-bottom: 1px solid #2A2A2A;
  gap: 1rem;
}

.wizard-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #FFFFFF;
  margin: 0 0 0.25rem;
}

.wizard-subtitle {
  font-size: 0.875rem;
  color: rgba(255,255,255,0.5);
  margin: 0;
}

.wizard-close {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255,255,255,0.5);
  padding: 0.25rem;
  flex-shrink: 0;
}
.wizard-close:hover { color: #FFFFFF; }

/* Steps */
.wizard-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  gap: 0.75rem;
}

.step-nav-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #3A3A3A;
  background: transparent;
  color: rgba(255,255,255,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.step-nav-btn:hover:not(:disabled) { background: #1E1E1E; color: #FFFFFF; border-color: #555; }
.step-nav-btn:disabled { opacity: 0.2; cursor: not-allowed; }

.step-dots-and-labels {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.step-dots {
  display: flex;
  gap: 0.5rem;
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3A3A3A;
  transition: background 0.2s;
}
.step-dot.active { background: #FFFFFF; box-shadow: 0 0 0 3px rgba(255,255,255,0.15); }
.step-dot.done   { background: #6366f1; }
.step-dot.clickable { cursor: pointer; }
.step-dot.clickable:hover { background: #818cf8; }

.step-labels {
  display: flex;
  gap: 1.5rem;
  font-size: 0.75rem;
  color: rgba(255,255,255,0.35);
  margin-left: 0.5rem;
}
.step-labels span.active { color: #FFFFFF; font-weight: 500; }

/* Body */
.wizard-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.wizard-body.body-center {
  justify-content: center;
}
.wizard-body.body-fill {
  padding-top: 0;
}

/* Contact header (above scrollable list) */
.contact-header {
  padding: 0.5rem 2rem 0;
  flex-shrink: 0;
}

/* Source tabs */
.source-tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid #2A2A2A;
  padding: 0 2rem;
  flex-shrink: 0;
}

.source-tab {
  background: none;
  border: none;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.source-tab:hover  { color: #FFFFFF; }
.source-tab.active { color: #FFFFFF; border-bottom-color: #FFFFFF; }

/* Import option cards */
.import-option {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.import-option:hover { border-color: #444; }
.import-option.selected { border-color: #6366f1; background: rgba(99,102,241,0.06); }

.import-option-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #555;
  flex-shrink: 0;
  margin-top: 2px;
  transition: border-color 0.15s;
}
.import-option-radio.checked {
  border-color: #6366f1;
  background: radial-gradient(circle, #6366f1 40%, transparent 41%);
}

.import-option-content { flex: 1; min-width: 0; }
.import-option-title { font-size: 0.875rem; font-weight: 500; color: #FFFFFF; }
.import-option-desc { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 0.15rem; }

/* Fields */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
}

.field-input {
  background: #111111;
  border: 1px solid #3A3A3A;
  border-radius: 8px;
  color: #FFFFFF;
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  outline: none;
  width: 100%;
}
.field-input::placeholder { color: rgba(255,255,255,0.3); }
.field-input:focus { border-color: #6366f1; }

.field-textarea {
  background: #111111;
  border: 1px solid #3A3A3A;
  border-radius: 8px;
  color: #FFFFFF;
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  outline: none;
  width: 100%;
  resize: vertical;
  font-family: inherit;
}
.field-textarea::placeholder { color: rgba(255,255,255,0.3); }
.field-textarea:focus { border-color: #6366f1; }

.generated-prompt-area {
  font-family: monospace;
  font-size: 0.75rem;
  min-height: 200px;
}

/* File row */
.file-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.file-name-label {
  font-size: 0.875rem;
  color: rgba(255,255,255,0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 250px;
}

/* Env status */
.env-status-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.env-badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-weight: 500;
}
.env-badge.ready     { background: rgba(34,197,94,0.15); color: #22c55e; }
.env-badge.not-ready { background: rgba(251,191,36,0.15); color: #fbbf24; }

/* Progress log */
.progress-log {
  background: #0D0D0D;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  padding: 0.5rem;
  max-height: 80px;
  overflow-y: auto;
}
.log-line {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.5);
  font-family: monospace;
}

/* Collapsible */
.collapsible-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255,255,255,0.5);
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0;
}
.collapsible-toggle:hover { color: #FFFFFF; }

/* Hints */
.hint-warn {
  font-size: 0.75rem;
  color: #fbbf24;
  margin: 0;
}
.hint-info {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.35);
  margin: 0;
}

/* Chips */
.chip-row {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.chip {
  background: #1A1A1A;
  border: 1px solid #3A3A3A;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.chip:hover  { color: #FFFFFF; border-color: #555; }
.chip.active {
  background: linear-gradient(135deg, #0F0F0F, #374151);
  color: #FFFFFF;
  border-color: #555;
}

/* Progress bar */
.progress-bar-wrap {
  background: #2A2A2A;
  border-radius: 999px;
  overflow: hidden;
  height: 4px;
  position: relative;
}
.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #818cf8);
  transition: width 0.3s ease;
}
.progress-msg {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.5);
  display: block;
  margin-top: 0.35rem;
}

/* Summary card */
.summary-card {
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.summary-row {
  display: flex;
  gap: 1.5rem;
}
.summary-label {
  font-size: 0.875rem;
  color: rgba(255,255,255,0.6);
}

/* Avatar */
.avatar-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.avatar-preview {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
}

/* Model selector row */
.model-select-row {
  display: flex;
  gap: 0.5rem;
}

.field-select {
  background: #111111;
  border: 1px solid #3A3A3A;
  border-radius: 8px;
  color: #FFFFFF;
  font-size: 0.8125rem;
  padding: 0.4rem 0.6rem;
  outline: none;
  flex: 1;
  min-width: 0;
}
.field-select:focus { border-color: #6366f1; }
.field-select option { background: #1A1A1A; color: #FFFFFF; }

/* Analysis progress card */
.analyze-progress-card {
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.analyze-spinner-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.analyze-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #3A3A3A;
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.analyze-step-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #FFFFFF;
}

.analyze-tip {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.35);
  margin: 0.5rem 0 0;
  font-style: italic;
  transition: opacity 0.3s;
}

/* Analysis done card */
.analysis-done-card {
  background: rgba(34,197,94,0.08);
  border: 1px solid rgba(34,197,94,0.25);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}

.analysis-done-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #22c55e;
}

/* Step 4: Review top row */
.review-top-row {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.avatar-col {
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
}

.avatar-preview-lg {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  object-fit: cover;
  border: 2px solid #3A3A3A;
  transition: border-color 0.15s;
}
.avatar-col:hover .avatar-preview-lg { border-color: #6366f1; }

.avatar-edit-hint {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #1A1A1A;
  border: 1px solid #3A3A3A;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.6);
}

.review-name-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Memory toggle */
.memory-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.toggle-checkbox { display: none; }

.toggle-switch {
  width: 32px;
  height: 18px;
  border-radius: 9px;
  background: #3A3A3A;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #888;
  transition: transform 0.2s, background 0.2s;
}
.toggle-checkbox:checked + .toggle-switch { background: #4B4BD4; }
.toggle-checkbox:checked + .toggle-switch::after { transform: translateX(14px); background: #fff; }
.toggle-switch.disabled { opacity: 0.35; cursor: not-allowed; }

.toggle-text {
  font-size: 0.8125rem;
  color: #FFFFFF;
  font-weight: 500;
}

.memory-count {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
}

/* Error */
.error-text {
  font-size: 0.875rem;
  color: #f87171;
  margin: 0;
}

/* Footer */
.wizard-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-top: 1px solid #2A2A2A;
}

/* Contact list */
.contact-list-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #FFFFFF;
  margin: 0;
}

.contact-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  padding: 0.25rem;
  background: #111111;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
}
.contact-item:hover { background: #1E1E1E; }
.contact-item.selected { background: #2A2A40; border: 1px solid #4B4BD4; }

.contact-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.contact-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #2A2A2A;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: rgba(255,255,255,0.5);
  flex-shrink: 0;
}

.contact-info {
  min-width: 0;
  flex: 1;
}

.contact-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #FFFFFF;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.1rem;
}

.contact-nickname {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
}

.contact-count {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.35);
}

.contact-empty {
  padding: 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: rgba(255,255,255,0.35);
}

/* Voice row */
.iw-voice-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.iw-preview-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: 1px solid #3A3A3A;
  border-radius: 8px;
  background: #111111;
  color: #FFFFFF;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.iw-preview-btn:hover:not(:disabled) { border-color: #6366f1; background: #1A1A1A; }
.iw-preview-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Utilities */
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.mt-3 { margin-top: 0.75rem; }
.mb-2 { margin-bottom: 0.5rem; }
.flex-wrap { flex-wrap: wrap; }
</style>
