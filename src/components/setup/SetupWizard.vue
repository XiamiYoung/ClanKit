<template>
  <Teleport to="body">
    <div v-if="visible" class="sw-backdrop" :class="{ 'sw-tour-mode': phase === 'tour' }" style="z-index: 9999;">
      <div class="sw-container" :class="{ 'sw-tour-card': phase === 'tour' }" :style="phase === 'tour' ? `transform:translate(${tourCardOffset.x}px,${tourCardOffset.y}px)` : ''">

        <!-- ═══ WIZARD PHASE ═══ -->
        <template v-if="phase === 'steps'">
          <!-- Configure later row — centered above step indicators -->
          <div class="sw-dismiss-row">
            <button class="sw-dismiss-btn" @click="skipSetup">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:0.75rem;height:0.75rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              {{ t('setupWizard.configureLater') }}
            </button>
          </div>
          <!-- Step indicator -->
          <div class="sw-steps-bar">
            <div
              v-for="(label, i) in stepLabels"
              :key="i"
              class="sw-step-dot-group"
              :class="{ active: step === i + 1, completed: i + 1 < step }"
            >
              <div class="sw-step-dot">
                <svg v-if="i + 1 < step" class="sw-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span v-else>{{ i + 1 }}</span>
              </div>
              <span class="sw-step-label">{{ label }}</span>
              <div v-if="i < stepLabels.length - 1" class="sw-step-line" :class="{ filled: i + 1 < step }"></div>
            </div>
          </div>

          <!-- Header -->
          <div class="sw-header">
            <h1 class="sw-title">{{ stepTitle }}</h1>
            <p class="sw-subtitle">{{ stepSubtitle }}</p>
          </div>

          <!-- Step Content -->
          <div class="sw-content">

            <!-- Step 1: Language -->
            <template v-if="step === 1">
              <div class="sw-step-content">
                <div class="sw-form-group">
                  <select v-model="selectedLanguage" class="sw-select">
                    <option value="en">{{ t('setupWizard.languageEnglish') }}</option>
                    <option value="zh">{{ t('setupWizard.languageChinese') }}</option>
                  </select>
                </div>
              </div>
              <div class="sw-privacy-notice">
                <svg class="sw-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <div>
                  <p class="sw-privacy-text">{{ t('setupWizard.privacyNotice') }}</p>
                  <p class="sw-privacy-hint">{{ t('setupWizard.privacyHint') }}</p>
                </div>
              </div>
            </template>

            <!-- Step 2: Account (optional) -->
            <template v-else-if="step === 2">
              <div class="sw-step-content sw-step-auth">
                <AuthForm :reset-signal="0" :signup-only="true" @success="onAuthStepSuccess" />
                <button class="sw-auth-skip-card" @click="onAuthStepSkip">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1rem;height:1rem;flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {{ t('setupWizard.signInLater') }}
                </button>
                <p class="sw-auth-privacy-hint">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:0.75rem;height:0.75rem;flex-shrink:0;color:#6EE7B7;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  {{ t('setupWizard.authPrivacyBody') }}
                </p>
              </div>
            </template>

            <!-- Step 3: Choose Provider -->
            <template v-else-if="step === 3">
              <div class="sw-step-content">
                <div class="sw-provider-list">
                  <button
                    v-for="opt in providerOptions"
                    :key="opt.value"
                    class="sw-provider-item"
                    :class="{ selected: selectedProviderType === opt.value }"
                    @click="selectedProviderType = opt.value"
                  >
                    <div class="sw-provider-top">
                      <span class="sw-provider-name">{{ opt.label }}</span>
                      <span v-if="opt.recommended" class="sw-badge recommended">{{ t('onboarding.recommendedBadge') }}</span>
                      <span v-if="opt.freeInfo" class="sw-badge" :class="opt.freeInfo.badge">{{ t(opt.freeInfo.labelKey) }}</span>
                    </div>
                  </button>
                </div>
              </div>
            </template>

            <!-- Step 4: Configure Provider -->
            <template v-else-if="step === 4">
              <div class="sw-step-content">
                <!-- API Key help panel -->
                <div class="sw-apikey-help-panel">
                  <div class="sw-apikey-help-top">
                    <a v-if="currentPreset?.apiKeyUrl" href="#" class="sw-apikey-get-btn" @click.prevent="openUrl(currentPreset.apiKeyUrl)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:0.875rem;height:0.875rem;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      {{ t('setupWizard.getApiKey') }}
                    </a>
                    <button class="sw-apikey-help-toggle" @click="showApiKeyHelp = !showApiKeyHelp">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:0.875rem;height:0.875rem;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      {{ t('setupWizard.apiKeyHelpToggle') }}
                    </button>
                  </div>
                  <div v-if="providerPriceLabel" class="sw-apikey-price-row">
                    <span class="sw-apikey-price-badge" :class="providerPriceBadge">{{ providerPriceLabel }}</span>
                  </div>
                  <div v-if="showApiKeyHelp" class="sw-apikey-help-body">
                    <p class="sw-apikey-help-text">{{ t('setupWizard.apiKeyWhatIs') }}</p>
                    <code class="sw-apikey-example">{{ t('setupWizard.apiKeyExample') }}</code>
                    <p class="sw-apikey-help-steps">{{ t('setupWizard.apiKeySteps') }}</p>
                  </div>
                </div>
                <div class="sw-apikey-privacy">
                  <svg class="sw-apikey-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <p class="sw-apikey-privacy-text">{{ t('setupWizard.apiKeyPrivacyNotice') }}</p>
                </div>
                <div class="sw-form-group">
                  <label class="sw-label">{{ t('setupWizard.apiKey') }}</label>
                  <div class="sw-input-row">
                    <input
                      :type="showApiKey ? 'text' : 'password'"
                      v-model="providerApiKey"
                      class="sw-input"
                      :placeholder="t('setupWizard.apiKeyPlaceholder')"
                    />
                    <button class="sw-icon-btn" @click="showApiKey = !showApiKey">
                      <svg v-if="showApiKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1rem;height:1rem;"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1rem;height:1rem;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </div>
                <div v-if="showBaseUrl" class="sw-form-group">
                  <label class="sw-label">{{ t('setupWizard.baseUrl') }}</label>
                  <input v-model="providerBaseUrl" class="sw-input" :placeholder="currentPreset?.defaultBaseURL || ''" />
                </div>
                <template v-if="selectedProviderType === 'anthropic'">
                  <div class="sw-form-group">
                    <label class="sw-label">Sonnet Model</label>
                    <input v-model="anthropicSonnet" class="sw-input font-mono" placeholder="claude-sonnet-latest" />
                  </div>
                  <div class="sw-form-group">
                    <label class="sw-label">Opus Model</label>
                    <input v-model="anthropicOpus" class="sw-input font-mono" placeholder="claude-opus-latest" />
                  </div>
                  <div class="sw-form-group">
                    <label class="sw-label">Haiku Model</label>
                    <input v-model="anthropicHaiku" class="sw-input font-mono" placeholder="claude-haiku-latest" />
                  </div>
                </template>
                <template v-else>
                  <div class="sw-form-group">
                    <label class="sw-label">{{ t('setupWizard.selectModel') }}</label>
                    <div class="sw-input-row">
                      <select v-model="selectedModelId" class="sw-select" style="flex:1;">
                        <option value="">{{ t('setupWizard.selectModel') }}</option>
                        <option v-for="m in availableModels" :key="m.id" :value="m.id">{{ m.name || m.id }}</option>
                      </select>
                      <AppButton size="compact" @click="handleFetchModels" :disabled="fetchingModels || !providerApiKey" :loading="fetchingModels">
                        {{ fetchingModels ? t('setupWizard.fetchingModels') : t('setupWizard.fetchModels') }}
                      </AppButton>
                    </div>
                    <p v-if="fetchError" class="sw-error-text">{{ fetchError }}</p>
                  </div>
                </template>
                <div class="sw-form-group">
                  <div v-if="testResult" class="sw-test-result" :class="testResult.ok ? 'success' : 'error'">
                    <svg v-if="testResult.ok" style="width:1rem;height:1rem;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    <svg v-else style="width:1rem;height:1rem;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span style="flex:1;">{{ testResult.ok ? t('setupWizard.testSuccess') : (testResult.message || t('setupWizard.testFailed')) }}</span>
                    <button class="sw-retest-btn" @click="handleTestConnection" :disabled="testingConnection">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:0.75rem;height:0.75rem;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      {{ t('setupWizard.retest') }}
                    </button>
                  </div>
                  <AppButton v-else size="compact" style="width:100%;" @click="handleTestConnection" :disabled="testingConnection || !canTest" :loading="testingConnection">
                    {{ testingConnection ? t('setupWizard.testing') : t('setupWizard.testConnection') }}
                  </AppButton>
                </div>
              </div>
            </template>

            <!-- Step 5: Your Profile -->
            <template v-else-if="step === 5">
              <div class="sw-step-content">
                <div class="sw-form-group">
                  <label class="sw-label">{{ t('setupWizard.yourName') }}</label>
                  <input v-model="profileName" class="sw-input" :placeholder="t('setupWizard.yourNamePlaceholder')" />
                </div>
                <div style="display:flex;gap:0.75rem;">
                  <div class="sw-form-group" style="flex:1;">
                    <label class="sw-label">{{ t('setupWizard.yourAge') }}</label>
                    <input v-model="profileAge" class="sw-input" type="number" min="1" max="150" :placeholder="t('setupWizard.yourAgePlaceholder')" />
                  </div>
                  <div class="sw-form-group" style="flex:1;">
                    <label class="sw-label">{{ t('setupWizard.yourGender') }}</label>
                    <select v-model="profileGender" class="sw-select">
                      <option value="male">{{ t('common.male') }}</option>
                      <option value="female">{{ t('common.female') }}</option>
                    </select>
                  </div>
                </div>
                <div class="sw-form-group">
                  <label class="sw-label">{{ t('setupWizard.yourProfession') }}</label>
                  <input v-model="profileProfession" class="sw-input" :placeholder="t('setupWizard.yourProfessionPlaceholder')" />
                </div>
                <div class="sw-form-group">
                  <label class="sw-label">{{ t('setupWizard.yourDescription') }}</label>
                  <textarea v-model="profileDescription" class="sw-textarea" rows="3" maxlength="200" :placeholder="t('setupWizard.yourDescriptionPlaceholder')"></textarea>
                  <div class="sw-char-count">{{ profileDescription.length }} / 200</div>
                </div>
                <!-- AI generating indicator -->
                <div v-if="aiGenerating" class="sw-generating">
                  <div class="sw-generating-spinner"></div>
                  <span>{{ t('setupWizard.generating') }}</span>
                </div>
                <p v-if="aiGenerateError" class="sw-error-text">{{ aiGenerateError }}</p>
              </div>
            </template>

            <!-- Step 6: Customize Agent -->
            <template v-else-if="step === 6">
              <div class="sw-step-content">
                <!-- Agent intro card -->
                <div class="sw-intro-card">
                  <img v-if="avatarUri" :src="avatarUri" class="sw-intro-avatar" />
                  <p class="sw-intro-text">"{{ agentIntro }}"</p>
                </div>
                <!-- Avatar -->
                <div class="sw-form-group">
                  <label class="sw-label">{{ t('setupWizard.avatar') }}</label>
                  <div class="sw-avatar-row">
                    <img v-if="avatarUri" :src="avatarUri" class="sw-avatar-preview" />
                    <button class="sw-btn-text" @click="showAvatarPicker = true">{{ t('setupWizard.changeAvatar') }}</button>
                  </div>
                </div>
                <!-- System Prompt -->
                <div class="sw-form-group">
                  <label class="sw-label">{{ t('setupWizard.systemPrompt') }}</label>
                  <textarea v-model="generatedPrompt" class="sw-textarea" rows="6"></textarea>
                </div>
                <!-- Voice -->
                <div class="sw-form-group">
                  <label class="sw-label">{{ t('setupWizard.voice') }}</label>
                  <div class="sw-voice-grid">
                    <button
                      v-for="v in filteredVoices"
                      :key="v.id"
                      class="sw-voice-card"
                      :class="{ active: selectedVoiceId === v.id }"
                      @click="selectedVoiceId = v.id"
                    >
                      <span class="sw-voice-name">{{ v.name }}</span>
                      <span class="sw-voice-meta">{{ v.gender }}</span>
                    </button>
                  </div>
                  <button class="sw-btn-text" style="margin-top:0.375rem;" @click="previewVoice" :disabled="previewingVoice">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:0.875rem;height:0.875rem;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    {{ previewingVoice ? t('setupWizard.previewing') : t('setupWizard.previewVoice') }}
                  </button>
                </div>
              </div>
            </template>

          </div>

          <!-- Footer -->
          <div class="sw-footer">
            <div>
              <button v-if="step > 1" class="sw-btn-text" @click="goBack">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:0.875rem;height:0.875rem;"><polyline points="15 18 9 12 15 6"/></svg>
                {{ t('common.prev') }}
              </button>
            </div>
            <div class="sw-footer-right">
              <AppButton v-if="step !== 2" variant="primary" size="modal" :disabled="!canProceed || aiGenerating || installingRecommended" :loading="aiGenerating || installingRecommended" @click="goNext">
                {{ t('common.next') }}
              </AppButton>
            </div>
          </div>
        </template>

        <!-- ═══ TOUR PHASE ═══ -->
        <template v-if="phase === 'tour'">
          <div class="sw-tour-header">
            <span class="sw-tour-step-num">{{ tourStep }} / {{ tourSteps.length }}</span>
            <div class="sw-tour-drag" @mousedown.prevent="startTourDrag">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:0.875rem;height:0.875rem;color:#4B5563;"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            </div>
          </div>
          <div class="sw-tour-body">
            <h2 class="sw-tour-title">{{ tourSteps[tourStep - 1]?.title }}</h2>
            <p class="sw-tour-desc">{{ tourSteps[tourStep - 1]?.desc }}</p>
            <!-- Skills hub loading/error -->
            <div v-if="skillsHubLoading" class="sw-generating" style="margin-top:0.5rem;">
              <div class="sw-generating-spinner"></div>
              <span>{{ t('setupWizard.tourSkillsLoading') }}</span>
            </div>
            <p v-if="skillsHubError && tourSteps[tourStep - 1]?.route === '/skills'" class="sw-tour-desc" style="color:#F59E0B;margin-top:0.375rem;">
              {{ t('setupWizard.tourSkillsUnavailable') }}
            </p>
          </div>

          <!-- Skills list (shown in tour card when on skills page) -->
          <div v-if="showSkillsDialog && !skillsInstalled" class="sw-skills-dialog">
            <!-- Install progress bar (above the list) -->
            <div v-if="installingSkills" class="sw-skills-progress" style="margin-bottom:0.5rem;">
              <div class="sw-skills-progress-bar" :style="{ width: skillsInstallProgress + '%' }"></div>
              <span class="sw-skills-progress-text">{{ skillsInstallCurrent }} / {{ topSkills.length }}</span>
            </div>
            <div class="sw-skills-list">
              <label v-for="skill in topSkills" :key="skill.id" class="sw-skills-item">
                <div class="sw-skills-item-info">
                  <span class="sw-skills-item-name">{{ skill.name || skill.id }}</span>
                  <span v-if="skill.description" class="sw-skills-item-desc">{{ skill.description }}</span>
                </div>
              </label>
            </div>
          </div>
          <div class="sw-footer">
            <div>
              <button class="sw-btn-text" @click="tourGoBack" :disabled="installingSkills">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:0.875rem;height:0.875rem;"><polyline points="15 18 9 12 15 6"/></svg>
                {{ t('common.prev') }}
              </button>
            </div>
            <div class="sw-footer-right">
              <!-- Skills page: loading / Install / Skip buttons -->
              <template v-if="isOnSkillsTourStep && !skillsInstalled">
                <template v-if="skillsHubLoading">
                  <AppButton variant="primary" size="compact" :loading="true" :disabled="true">
                    {{ t('setupWizard.tourSkillsLoading') }}
                  </AppButton>
                </template>
                <template v-else-if="showSkillsDialog">
                  <AppButton v-if="!installingSkills" variant="secondary" size="compact" @click="installSelectedSkills">
                    {{ t('setupWizard.tourSkillsInstall') }}
                  </AppButton>
                  <AppButton v-else variant="secondary" size="compact" :loading="true" :disabled="true">
                    {{ t('setupWizard.tourSkillsInstalling') }}
                  </AppButton>
                  <AppButton variant="primary" size="compact" :disabled="installingSkills" @click="skipSkillsInstall">
                    {{ t('setupWizard.tourSkillsSkip') }}
                  </AppButton>
                </template>
                <template v-else>
                  <button class="sw-btn-text" @click="skipSkillsInstall">{{ t('setupWizard.tourSkillsSkip') }}</button>
                </template>
              </template>
              <!-- Normal tour buttons -->
              <template v-else-if="tourStep < tourSteps.length">
                <AppButton variant="primary" size="compact" @click="tourStep++; navigateTour()">
                  {{ t('common.next') }}
                </AppButton>
              </template>
              <template v-else>
                <AppButton variant="primary" size="compact" @click="finishTour">
                  {{ t('setupWizard.startChatting') }}
                </AppButton>
              </template>
            </div>
          </div>
        </template>

      </div>
    </div>

  </Teleport>

  <!-- Avatar Picker — separate Teleport so it renders above the wizard backdrop -->
  <Teleport to="body">
    <div v-if="showAvatarPicker" style="z-index: 10000; position: relative;">
      <AvatarPicker
        :current-avatar-id="selectedAvatar"
        @select="selectedAvatar = $event; showAvatarPicker = false"
        @close="showAvatarPicker = false"
      />
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore, PROVIDER_PRESETS } from '../../stores/config'
import { useModelsStore } from '../../stores/models'
import { useAgentsStore, BUILTIN_SYSTEM_AGENT_ID, BUILTIN_DOC_EDITOR_ID } from '../../stores/agents'
import { useChatsStore } from '../../stores/chats'
import { useSkillsStore } from '../../stores/skills'
import { useI18n } from '../../i18n/useI18n'
import { EDGE_VOICES, getDefaultVoiceForLocale } from '../../utils/edgeVoices'
import { getAvatarDataUri, STYLES } from '../agents/agentAvatars'
import { buildAgentGenerationPrompt, extractJsonPayload, detectAgentLanguage } from '../../utils/agentDefinitionPrompts'
import { getAgentTemplates, getRecommendedTemplateIds, installRecommendedTemplates } from '../../data/agentTemplates'
import AppButton from '../common/AppButton.vue'
import AvatarPicker from '../agents/AvatarPicker.vue'
import AuthForm from '../common/AuthForm.vue'
import { useAuth } from '../../composables/useAuth'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'complete'])

const router = useRouter()
const configStore = useConfigStore()
const modelsStore = useModelsStore()
const agentsStore = useAgentsStore()
const chatsStore = useChatsStore()
const auth = useAuth()
const skillsStore = useSkillsStore()
const { t } = useI18n()

// ── Phase: 'steps' (wizard) or 'tour' (guided walkthrough) ────────────────

const phase = ref('steps')

// ── Step navigation ────────────────────────────────────────────────────────

const step = ref(1)

const stepLabels = computed(() => [
  t('setupWizard.stepLanguage'),
  t('setupWizard.stepAccount'),
  t('setupWizard.stepProvider'),
  t('setupWizard.stepConfigure'),
  t('setupWizard.stepProfile'),
  t('setupWizard.stepAgent'),
])

const stepTitle = computed(() => {
  switch (step.value) {
    case 1: return t('setupWizard.welcomeToClanKit')
    case 2: return t('setupWizard.signInTitle')
    case 3: return t('setupWizard.chooseProvider')
    case 4: return t('setupWizard.configureProvider')
    case 5: return t('setupWizard.yourProfile')
    case 6: return t('setupWizard.customizeAgent')
    default: return ''
  }
})

const stepSubtitle = computed(() => {
  switch (step.value) {
    case 1: return t('setupWizard.selectLanguage')
    case 2: return t('setupWizard.signInDesc')
    case 3: return t('setupWizard.chooseProviderDesc')
    case 4: return t('setupWizard.configureProviderDesc')
    case 5: return t('setupWizard.yourProfileDesc')
    case 6: return t('setupWizard.customizeAgentDesc')
    default: return ''
  }
})

// ── Recommended-agent silent install (runs after step 5) ──────────────────
// User-facing UI was removed — every recommended group ships by default. The
// loading state surfaces in the footer button so the user sees the transition
// take a second instead of feeling like a hang.

const installingRecommended = ref(false)

async function runInstallRecommended() {
  if (installingRecommended.value) return
  installingRecommended.value = true
  try {
    const lang = configStore.config.language || selectedLanguage.value || 'en'
    const recIds = getRecommendedTemplateIds(lang)
    const templates = getAgentTemplates(lang).filter(t => recIds.includes(t.id))
    if (templates.length === 0) return
    const providerId = selectedProviderType.value
    const modelId = selectedProviderType.value === 'anthropic' ? anthropicSonnet.value : selectedModelId.value
    await installRecommendedTemplates({
      templates,
      agentsStore,
      providerModel: { providerId, modelId },
    })
  } catch (err) {
    console.error('[SetupWizard] silent install recommended failed:', err)
  } finally {
    installingRecommended.value = false
  }
}

// ── Step 1: Language ───────────────────────────────────────────────────────

// Auto-detect system language via Electron app.getLocale()
const selectedLanguage = ref(configStore.config.language || 'en')
let languageInitialized = false

// Initialize language when wizard becomes visible (for fresh install)
watch(() => props.visible, (newVal) => {
  if (newVal && !languageInitialized && (configStore.config.setupWizardStep || 0) === 0 && window.electronAPI?.getLocale) {
    languageInitialized = true
    window.electronAPI.getLocale().then(locale => {
      const lang = String(locale || '').startsWith('zh') ? 'zh' : 'en'
      selectedLanguage.value = lang
      // Immediately save to switch i18n
      configStore.saveConfig({ language: lang })
    })
  }
}, { immediate: true })

watch(selectedLanguage, async (lang) => {
  if (!props.visible) return
  await configStore.saveConfig({ language: lang })
})

// ── Step 2: Provider type ──────────────────────────────────────────────────

const recommendedProvider = computed(() => selectedLanguage.value === 'zh' ? 'qwen' : 'google')
const selectedProviderType = ref(recommendedProvider.value)

watch(recommendedProvider, (val) => {
  if (!wizardProviderId.value) selectedProviderType.value = val
})

const wizardProviderTypes = ['google', 'qwen', 'anthropic', 'openai_official', 'deepseek', 'openrouter', 'groq', 'glm', 'moonshot', 'doubao', 'ollama', 'mistral', 'xai']

const providerOptions = computed(() => {
  return wizardProviderTypes.map(type => {
    const preset = PROVIDER_PRESETS[type]
    return {
      value: type,
      label: type === 'qwen' ? 'Qwen（通义千问）'
           : type === 'glm' ? 'GLM（智谱清言）'
           : type === 'moonshot' ? 'Moonshot / Kimi（月之暗面）'
           : type === 'doubao' ? 'Doubao（豆包）'
           : type === 'deepseek' ? 'DeepSeek（深度求索）'
           : preset.name,
      recommended: type === recommendedProvider.value,
      freeInfo: preset.freeInfo,
    }
  })
})

// ── Step 3: Configure provider ─────────────────────────────────────────────

const wizardProviderId = ref(null)
const providerApiKey = ref('')
const providerBaseUrl = ref('')
const showApiKey = ref(false)
const selectedModelId = ref('')
const fetchingModels = ref(false)
const fetchError = ref('')
const testingConnection = ref(false)
const testResult = ref(null)
const anthropicSonnet = ref('')
const anthropicOpus = ref('')
const anthropicHaiku = ref('')

const currentPreset = computed(() => PROVIDER_PRESETS[selectedProviderType.value])
const showApiKeyHelp = ref(false)

const providerPriceLabel = computed(() => {
  const fi = currentPreset.value?.freeInfo
  if (!fi) return ''
  if (fi.badge === 'free') return t('setupWizard.apiKeyFree')
  if (fi.badge === 'trial') return t('setupWizard.apiKeyFreeTrial')
  return t('setupWizard.apiKeyPaid')
})

const providerPriceBadge = computed(() => {
  const fi = currentPreset.value?.freeInfo
  if (!fi) return ''
  return fi.badge // 'free' | 'trial' | 'paid'
})

const showBaseUrl = computed(() => {
  const type = selectedProviderType.value
  return type === 'ollama' || type === 'openai' || type === 'custom' || !currentPreset.value?.defaultBaseURL
})

const availableModels = computed(() => {
  if (!wizardProviderId.value) return []
  return modelsStore.getModelsForProvider(wizardProviderId.value)
})

const canTest = computed(() => {
  if (!providerApiKey.value && selectedProviderType.value !== 'ollama') return false
  if (selectedProviderType.value === 'anthropic') return !!anthropicSonnet.value
  return !!selectedModelId.value
})

function ensureWizardProvider() {
  const type = selectedProviderType.value
  if (wizardProviderId.value) {
    const existing = configStore.getProvider(wizardProviderId.value)
    if (existing && existing.type === type) return existing
    configStore.removeProvider(wizardProviderId.value)
    wizardProviderId.value = null
  }
  const existingByType = configStore.config.providers.find(p => p.type === type)
  if (existingByType) {
    wizardProviderId.value = existingByType.id
    providerApiKey.value = existingByType.apiKey || ''
    providerBaseUrl.value = existingByType.baseURL || currentPreset.value?.defaultBaseURL || ''
    selectedModelId.value = existingByType.model || ''
    if (type === 'anthropic') {
      anthropicSonnet.value = existingByType.model || ''
      anthropicOpus.value = existingByType.settings?.opusModel || ''
      anthropicHaiku.value = existingByType.settings?.haikuModel || ''
    }
    return existingByType
  }
  const provider = configStore.addProvider(type)
  wizardProviderId.value = provider.id
  providerBaseUrl.value = provider.baseURL || ''
  return provider
}

function syncProviderFields() {
  if (!wizardProviderId.value) return
  const type = selectedProviderType.value
  const updates = {
    apiKey: providerApiKey.value,
    baseURL: providerBaseUrl.value || currentPreset.value?.defaultBaseURL || '',
  }
  if (type === 'anthropic') {
    updates.model = anthropicSonnet.value
    updates.settings = { ...configStore.getProvider(wizardProviderId.value)?.settings, opusModel: anthropicOpus.value, haikuModel: anthropicHaiku.value }
  } else {
    updates.model = selectedModelId.value
  }
  configStore.updateProvider(wizardProviderId.value, updates)
}

async function handleFetchModels() {
  syncProviderFields()
  fetchingModels.value = true
  fetchError.value = ''
  try {
    const ok = await modelsStore.fetchModelsForProvider(wizardProviderId.value)
    if (!ok) {
      fetchError.value = t('setupWizard.testFailed')
    } else {
      const models = modelsStore.getModelsForProvider(wizardProviderId.value)
      if (models.length) {
        try {
          const rec = await window.electronAPI.recommendModel({
            providerType: selectedProviderType.value,
            modelIds: models.map(m => m.id),
          })
          selectedModelId.value = (rec?.modelId && models.some(m => m.id === rec.modelId))
            ? rec.modelId
            : models[0].id
        } catch {
          selectedModelId.value = models[0].id
        }
      }
    }
  } catch (err) {
    fetchError.value = err.message || t('setupWizard.testFailed')
  } finally {
    fetchingModels.value = false
  }
}

// Auto-test when model is selected (non-Anthropic)
watch(selectedModelId, (newVal) => {
  if (newVal && canTest.value && !testingConnection.value) handleTestConnection()
})

// Auto-test for Anthropic when sonnet model field is filled (debounced)
let _anthropicTestTimer = null
watch(anthropicSonnet, (newVal) => {
  if (!newVal || !canTest.value || testingConnection.value) return
  clearTimeout(_anthropicTestTimer)
  _anthropicTestTimer = setTimeout(() => handleTestConnection(), 800)
})

async function handleTestConnection() {
  syncProviderFields()
  testingConnection.value = true
  testResult.value = null
  try {
    const model = selectedProviderType.value === 'anthropic' ? anthropicSonnet.value : selectedModelId.value
    const baseURL = providerBaseUrl.value || currentPreset.value?.defaultBaseURL || ''
    const res = await window.electronAPI.testProvider({
      provider: selectedProviderType.value, apiKey: providerApiKey.value, baseURL, utilityModel: model,
    })
    testResult.value = { ok: !!res.success, message: res.error || '' }
    if (res.success) {
      configStore.updateProvider(wizardProviderId.value, { isActive: true, testedAt: Date.now() })
    }
  } catch (err) {
    testResult.value = { ok: false, message: err.message || t('setupWizard.testFailed') }
  } finally {
    testingConnection.value = false
  }
}

// ── Step 4: Profile ────────────────────────────────────────────────────────

const profileName = ref('')
const profileAge = ref('')
const profileGender = ref('male')
const profileProfession = ref('')
const profileDescription = ref('')

function buildAvatarSeed() {
  // Include all profile attributes so different profiles produce different avatars
  const parts = [
    profileName.value.trim(),
    profileGender.value,
    profileAge.value,
    profileProfession.value.trim(),
  ].filter(Boolean)
  return parts.join('_') || 'default'
}

function buildProfileDescription() {
  const name = profileName.value.trim()
  const age = profileAge.value
  const gender = profileGender.value
  const profession = profileProfession.value.trim()
  const desc = profileDescription.value.trim()
  const lang = configStore.config.language || selectedLanguage.value || 'en'
  const parts = [name]
  if (gender) parts.push(lang === 'zh' ? (gender === 'male' ? '男' : '女') : gender)
  if (age) parts.push(lang === 'zh' ? `${age}岁` : `age ${age}`)
  if (profession) parts.push(profession)
  if (desc) parts.push(desc)
  return parts.join(', ')
}

// ── Step 5: Customize Agent ────────────────────────────────────────────────

const generatedPrompt = ref('')
const selectedAvatar = ref('')
const showAvatarPicker = ref(false)
const selectedVoiceId = ref(getDefaultVoiceForLocale(configStore.config.language || 'en'))
const previewingVoice = ref(false)
const aiGenerating = ref(false)
const aiGenerateError = ref('')

const avatarUri = computed(() => {
  if (!selectedAvatar.value) return null
  try { return getAvatarDataUri(selectedAvatar.value) } catch { return null }
})

async function generateAgentWithAI() {
  aiGenerating.value = true
  aiGenerateError.value = ''
  try {
    const desc = buildProfileDescription()
    const lang = detectAgentLanguage(desc, '', selectedLanguage.value)
    // Build the standard user-persona generation prompt
    let basePrompt = buildAgentGenerationPrompt({
      agentType: 'user',
      description: desc,
      lang,
      existingName: profileName.value.trim(),
    })
    // Append avatar style + voice selection instructions
    const voiceList = EDGE_VOICES.map(v => `${v.id} (${v.name}, ${v.gender}, ${v.locale})`).join('; ')
    basePrompt += `\n\nAlso:
1. Choose an avatar style. RULE: if the persona is a HUMAN, you MUST use "agents" (realistic digital persona portraits). Only use other styles for non-human personas: "bottts" for robots/AI, "funEmoji" for playful characters, "pixelArt" for retro/gaming, "bigEars"/"bigSmile" for cute cartoon animals, "shapes"/"rings" for abstract entities. Add an "avatarStyle" field.
2. Choose the best voice from: [${voiceList}]. CRITICAL: match the voice gender to the persona's gender (Male voice for male, Female voice for female). Match locale to language. Add a "voiceId" field.`

    const config = JSON.parse(JSON.stringify(configStore.config))
    const res = await window.electronAPI.enhancePrompt({ prompt: basePrompt, config })
    if (res.success && res.text) {
      const extracted = extractJsonPayload(res.text)
      let data = null
      try { data = JSON.parse(extracted) } catch {}
      if (!data) {
        const pm = extracted.match(/"prompt"\s*:\s*"([\s\S]*?)"\s*[,}]/s) || extracted.match(/"prompt"\s*:\s*"([\s\S]*)"\s*\}?\s*$/s)
        if (pm) data = { prompt: pm[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') }
      }
      if (data?.prompt) generatedPrompt.value = typeof data.prompt === 'string' ? data.prompt : JSON.stringify(data.prompt, null, 2)
      if (data?.description) profileDescription.value = String(data.description)
      // Apply AI-chosen avatar style (default: agents for humans)
      const validKeys = STYLES.map(s => s.key)
      const aiStyle = data?.avatarStyle && validKeys.includes(data.avatarStyle) ? data.avatarStyle : 'agents'
      selectedAvatar.value = `${aiStyle}:${buildAvatarSeed()}`
      // Apply voice — enforce gender + language match with guaranteed fallback
      selectedVoiceId.value = pickVoiceForProfile(data?.voiceId)
      return true
    } else {
      aiGenerateError.value = res.error || t('setupWizard.generateError')
      return false
    }
  } catch (err) {
    aiGenerateError.value = err.message || t('setupWizard.generateError')
    return false
  } finally {
    aiGenerating.value = false
  }
}

// Agent intro sentence — used for voice preview and display on step 5
const agentIntro = computed(() => {
  const name = profileName.value.trim()
  const lang = configStore.config.language || selectedLanguage.value || 'en'
  if (lang === 'zh') {
    return `嗨，${name || ''}，你的专属 AI 画像已就绪，让我们开启全新的 AI 协作之旅吧！`
  }
  return `Hey ${name || 'there'}, your AI persona is ready. Let's start a brand new journey together!`
})

// Always returns a valid voice ID matching user's gender + language
function pickVoiceForProfile(aiSuggestion) {
  const lang = configStore.config.language || selectedLanguage.value || 'en'
  const prefix = lang === 'zh' ? 'zh-' : 'en-'
  const genderLabel = profileGender.value === 'female' ? 'Female' : 'Male'
  const validIds = EDGE_VOICES.map(v => v.id)

  // 1. Use AI suggestion if it matches gender + language
  if (aiSuggestion && validIds.includes(aiSuggestion)) {
    const picked = EDGE_VOICES.find(v => v.id === aiSuggestion)
    if (picked?.id.startsWith(prefix) && picked?.gender === genderLabel) return aiSuggestion
  }
  // 2. Find first voice matching gender + language
  const genderMatch = EDGE_VOICES.find(v => v.id.startsWith(prefix) && v.gender === genderLabel)
  if (genderMatch) return genderMatch.id
  // 3. Find first voice matching language only
  const langMatch = EDGE_VOICES.find(v => v.id.startsWith(prefix))
  if (langMatch) return langMatch.id
  // 4. Absolute fallback
  return getDefaultVoiceForLocale(lang)
}

const filteredVoices = computed(() => {
  const lang = configStore.config.language || selectedLanguage.value || 'en'
  const prefix = lang === 'zh' ? 'zh-' : 'en-'
  return EDGE_VOICES.filter(v => v.id.startsWith(prefix))
})

async function previewVoice() {
  if (previewingVoice.value) return
  previewingVoice.value = true
  try {
    const result = await window.electronAPI?.voice?.edgePreview?.({
      voice: selectedVoiceId.value,
      text: agentIntro.value,
    })
    if (result?.success && result.audio) {
      new Audio(`data:audio/mpeg;base64,${result.audio}`).play()
    }
  } catch { /* ignore */ }
  finally { previewingVoice.value = false }
}

// ── Can proceed logic ──────────────────────────────────────────────────────

const canProceed = computed(() => {
  switch (step.value) {
    case 1: return true
    case 2: return true                          // auth is optional; AuthForm/skip button drive progression
    case 3: return !!selectedProviderType.value
    case 4: return !!testResult.value?.ok
    case 5: return !!profileName.value.trim()
    case 6: return !installingRecommended.value
    default: return true
  }
})

// ── Navigation ─────────────────────────────────────────────────────────────

function goBack() {
  if (step.value > 1) step.value--
}

async function goNext() {
  if (!canProceed.value) return
  const current = step.value

  if (current === 1) {
    await configStore.saveConfig({ language: selectedLanguage.value, setupWizardStep: 1 })
  } else if (current === 2) {
    // Auth step — AuthForm.success or onAuthStepSkip drives advancement; just persist progress.
    await configStore.saveConfig({ setupWizardStep: 2 })
  } else if (current === 3) {
    ensureWizardProvider()
    await configStore.saveConfig({ setupWizardStep: 3 })
  } else if (current === 4) {
    syncProviderFields()
    // Set utilityModel so AI generation works in step 6
    const model = selectedProviderType.value === 'anthropic' ? anthropicSonnet.value : selectedModelId.value
    await configStore.saveConfig({
      defaultProvider: selectedProviderType.value,
      utilityModel: { provider: selectedProviderType.value, model },
      setupWizardStep: 4,
    })
  } else if (current === 5) {
    // Set defaults, then generate prompt + avatar with AI before entering step 6
    selectedAvatar.value = `agents:${buildAvatarSeed()}`
    selectedVoiceId.value = pickVoiceForProfile(null)
    generatedPrompt.value = ''
    await configStore.saveConfig({ setupWizardStep: 5 })
    // Block on AI generation — loading shown in step 5
    const ok = await generateAgentWithAI()
    if (!ok) return // Stay on step 5 if AI failed
  } else if (current === 6) {
    // Create the agent
    const name = profileName.value.trim()
    const age = profileAge.value
    const profession = profileProfession.value.trim()
    const lang = selectedLanguage.value
    const desc = lang === 'zh'
      ? `${name}${age ? `，${age}岁` : ''}${profession ? `，${profession}` : ''}`
      : `${name}${age ? `, ${age}` : ''}${profession ? `, ${profession}` : ''}`
    await agentsStore.saveAgent({
      name,
      description: desc,
      prompt: generatedPrompt.value,
      type: 'user',
      avatar: selectedAvatar.value,
      voiceId: selectedVoiceId.value,
    })
    await configStore.saveConfig({ defaultProvider: selectedProviderType.value, setupWizardStep: 6 })
    // Silently install all recommended built-in agents (with their pre-fab
    // Memory + Speech DNA) before entering the tour. Failures are swallowed so
    // a hiccup here can't block onboarding — user can re-install via the
    // Templates panel later.
    await runInstallRecommended()
    phase.value = 'tour'
    tourStep.value = 1
    navigateTour()
    return
  }

  step.value = current + 1
}

// ── Step 2 (auth) callbacks ────────────────────────────────────────────────
async function onAuthStepSuccess() {
  // Sign-in succeeded — applyTokens already marked authOnboarded. Advance.
  if (step.value === 2) await goNext()
}
async function onAuthStepSkip() {
  // User clicked "Sign in later" — mark onboarded and advance past the auth step.
  await auth.markAuthOnboarded()
  if (step.value === 2) await goNext()
}

// ── Tour ───────────────────────────────────────────────────────────────────

const tourStep = ref(1)

const tourSteps = computed(() => [
  { route: '/config', title: t('setupWizard.tourConfig'), desc: t('setupWizard.tourConfigDesc') },
  { route: '/agents',   title: t('setupWizard.tourAgentsSystem'), desc: t('setupWizard.tourAgentsSystemDesc') },
  { route: '/personas', title: t('setupWizard.tourAgentsUser'),   desc: t('setupWizard.tourAgentsUserDesc') },
  { route: '/skills', title: t('setupWizard.tourSkills'), desc: t('setupWizard.tourSkillsDesc') },
  { route: '/tools', title: t('setupWizard.tourTools'), desc: t('setupWizard.tourToolsDesc') },
  { route: '/mcp', title: t('setupWizard.tourMcp'), desc: t('setupWizard.tourMcpDesc') },
  { route: '/knowledge', title: t('setupWizard.tourKnowledge'), desc: t('setupWizard.tourKnowledgeDesc') },
  { route: '/agents', title: t('setupWizard.tourAssignReminder'), desc: t('setupWizard.tourAssignReminderDesc'), highlightAssignBody: true },
  { route: '/news', title: t('setupWizard.tourNews'), desc: t('setupWizard.tourNewsDesc') },
  { route: '/notes', title: t('setupWizard.tourDocs'), desc: t('setupWizard.tourDocsDesc') },
])

const isOnSkillsTourStep = computed(() => tourSteps.value[tourStep.value - 1]?.route === '/skills')

// Tour card drag
const tourCardOffset = ref({ x: 0, y: 0 })

function startTourDrag(e) {
  const startX = e.clientX - tourCardOffset.value.x
  const startY = e.clientY - tourCardOffset.value.y
  function onMove(ev) {
    tourCardOffset.value = { x: ev.clientX - startX, y: ev.clientY - startY }
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'grabbing'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// Skills hub state
const showSkillsDialog = ref(false)
const skillsHubLoading = ref(false)
const skillsHubError = ref(false)
const topSkills = ref([])
const installingSkills = ref(false)
const skillsInstalled = ref(false)
const skillsInstallCurrent = ref(0)
const skillsInstallProgress = computed(() => topSkills.value.length ? Math.round(skillsInstallCurrent.value / topSkills.value.length * 100) : 0)

async function fetchTopSkills() {
  if (skillsInstalled.value || showSkillsDialog.value) return
  const sourceId = selectedLanguage.value === 'zh' ? 'tencent' : 'clawhub'
  skillsHubLoading.value = true
  skillsHubError.value = false
  try {
    await skillsStore.fetchRemoteSkills(sourceId)
    // Wait a tick for store reactivity to settle
    await nextTick()
    const all = skillsStore.remoteSkills?.[sourceId] || []
    const err = skillsStore.remoteError?.[sourceId]
    if (err || all.length === 0) {
      skillsHubError.value = true
      return
    }
    topSkills.value = all.filter(s => !s.installed && s.downloadUrl).slice(0, 3)
    if (topSkills.value.length > 0) {
      showSkillsDialog.value = true
    } else {
      // All already installed
      skillsInstalled.value = true
    }
  } catch (e) {
    console.error('[wizard] fetchTopSkills error:', e)
    skillsHubError.value = true
  } finally {
    skillsHubLoading.value = false
  }
}

function skipSkillsInstall() {
  showSkillsDialog.value = false
  tourStep.value++
  navigateTour()
}

async function installSelectedSkills() {
  installingSkills.value = true
  skillsInstallCurrent.value = 0
  const sourceId = selectedLanguage.value === 'zh' ? 'tencent' : 'clawhub'
  const skillsPath = configStore.config.skillsPath || ''
  for (let i = 0; i < topSkills.value.length; i++) {
    const skill = topSkills.value[i]
    skillsInstallCurrent.value = i + 1
    if (!skill.downloadUrl) continue
    try {
      await skillsStore.installRemoteSkill(sourceId, skill.id, skill.downloadUrl, skillsPath)
    } catch { /* best effort */ }
  }
  installingSkills.value = false
  skillsInstalled.value = true
  showSkillsDialog.value = false
  // Auto-advance to next step after install
  setTimeout(() => { tourStep.value++; navigateTour() }, 500)
}

// ── Default news feeds (seeded during tour) ────────────────────────────────
const DEFAULT_NEWS_FEEDS_EN = [
  { id: 'google-ai', name: 'Google AI', url: 'https://blog.google/technology/ai/rss/' },
  { id: 'openai', name: 'OpenAI', url: 'https://openai.com/blog/rss.xml' },
  { id: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' },
  { id: 'hackernews', name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  { id: 'arstechnica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { id: 'theverge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'wired', name: 'Wired', url: 'https://www.wired.com/feed/rss' },
  { id: 'mittech', name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
  { id: 'venturebeat', name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' },
  { id: 'aws-main', name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/' },
  { id: 'aws-architecture', name: 'AWS Architecture Blog', url: 'https://aws.amazon.com/blogs/architecture/feed/' },
  { id: 'aws-big-data', name: 'AWS Big Data Blog', url: 'https://aws.amazon.com/blogs/big-data/feed/' },
  { id: 'aws-compute', name: 'AWS Compute Blog', url: 'https://aws.amazon.com/blogs/compute/feed/' },
  { id: 'aws-containers', name: 'AWS Containers Blog', url: 'https://aws.amazon.com/blogs/containers/feed/' },
  { id: 'aws-database', name: 'AWS Database Blog', url: 'https://aws.amazon.com/blogs/database/feed/' },
  { id: 'aws-devops', name: 'AWS DevOps Blog', url: 'https://aws.amazon.com/blogs/devops/feed/' },
  { id: 'aws-gametech', name: 'AWS GameTech Blog', url: 'https://aws.amazon.com/blogs/gametech/feed/' },
  { id: 'aws-hpc', name: 'AWS HPC Blog', url: 'https://aws.amazon.com/blogs/hpc/feed/' },
  { id: 'aws-infrastructure', name: 'AWS Infrastructure Blog', url: 'https://aws.amazon.com/blogs/infrastructure-and-automation/feed/' },
  { id: 'aws-machine-learning', name: 'AWS Machine Learning Blog', url: 'https://aws.amazon.com/blogs/machine-learning/feed/' },
  { id: 'aws-networking', name: 'AWS Networking Blog', url: 'https://aws.amazon.com/blogs/networking-and-content-delivery/feed/' },
  { id: 'aws-opensource', name: 'AWS Open Source Blog', url: 'https://aws.amazon.com/blogs/opensource/feed/' },
  { id: 'aws-security', name: 'AWS Security Blog', url: 'https://aws.amazon.com/blogs/security/feed/' },
  { id: 'aws-storage', name: 'AWS Storage Blog', url: 'https://aws.amazon.com/blogs/storage/feed/' },
  { id: 'aws-media', name: 'AWS Media Blog', url: 'https://aws.amazon.com/blogs/media/feed/' },
]
const DEFAULT_NEWS_FEEDS_ZH = [
  { id: '36kr', name: '36\u6c2a', url: 'https://36kr.com/feed' },
  { id: 'sspai', name: '\u5c11\u6570\u6d3e', url: 'https://sspai.com/feed' },
  { id: 'ifanr', name: '\u7231\u8303\u513f', url: 'https://www.ifanr.com/feed' },
  { id: 'infoq-cn', name: 'InfoQ \u4e2d\u6587', url: 'https://www.infoq.cn/feed' },
  { id: 'leiphone', name: '\u96f7\u950b\u7f51', url: 'https://www.leiphone.com/feed' },
  { id: 'cnbeta', name: 'cnBeta', url: 'https://www.cnbeta.com.tw/backend.php' },
  { id: 'tmtpost', name: '\u949b\u5a92\u4f53', url: 'https://www.tmtpost.com/feed' },
  { id: 'geekpark', name: '\u6781\u5ba2\u516c\u56ed', url: 'https://www.geekpark.net/rss/' },
]

async function seedDefaultNewsFeeds() {
  const existing = configStore.config.newsFeeds || []
  if (existing.length > 0) return
  const feeds = selectedLanguage.value === 'zh' ? DEFAULT_NEWS_FEEDS_ZH : DEFAULT_NEWS_FEEDS_EN
  await configStore.saveConfig({ newsFeeds: feeds })
}

function navigateTour() {
  const s = tourSteps.value[tourStep.value - 1]
  if (s) router.push({ path: s.route, query: s.query || {} })
  // Auto-fetch skills when landing on skills tour step
  if (s?.route === '/skills') fetchTopSkills()
  // Auto-seed default news feeds when landing on news tour step
  if (s?.route === '/news') seedDefaultNewsFeeds()
  // Open Clank's BodyViewer with section highlights on the assign-reminder step
  agentsStore.wizardHighlightAgentId = s?.highlightAssignBody ? BUILTIN_SYSTEM_AGENT_ID : null
}

function tourGoBack() {
  if (tourStep.value > 1) {
    tourStep.value--
    navigateTour()
  } else {
    // Tour step 1 → go back to wizard step 5
    phase.value = 'steps'
    step.value = 5
  }
}

async function finishTour() {
  try {
    // Clear any wizard-driven body viewer highlight before navigating to chats
    agentsStore.wizardHighlightAgentId = null
    // Read language from config (persisted to disk in step 1) — ref may be stale after restarts
    const lang = configStore.config.language || selectedLanguage.value || 'en'
    const userAgent = agentsStore.userAgents.find(a => !a.isBuiltin)
    const userAgentId = userAgent?.id || null
    const chatTitle = lang === 'zh' ? '新聊天' : 'New Chat'
    // Wizard's first chat defaults to productivity mode — onboarding intent is
    // 'get work done with the AI', not 'chat with a persona'.
    const chat = await chatsStore.createChat(chatTitle, [BUILTIN_SYSTEM_AGENT_ID, BUILTIN_DOC_EDITOR_ID], null, { userAgentId, mode: 'productivity' })
    const chatId = chat?.id
    if (chatId) await chatsStore.setChatSettings(chatId, { permissionMode: 'all_permissions' })
    // Mark this chat for AI Docs nav highlight when agent replies
    chatsStore.wizardFirstChatId = chatId
    await configStore.saveConfig({ setupDismissed: true, onboardingCompleted: true })
    emit('complete')
    router.push('/chats')
    // Auto-send greeting in user's language after navigation settles
    await nextTick()
    setTimeout(() => {
      if (chatId) {
        const greeting = lang === 'zh'
          ? '@Clank @文档大师 你好！@Clank 请先简单介绍一下你自己——你是谁、你能做什么、你最擅长帮我处理什么事情；然后告诉我你目前对我有多少了解（比如我的身份、偏好、正在做的事），如果还不太了解我也直说没关系。最后把这份介绍整理成一份 markdown 文档保存到 AI Doc，告诉我文件路径。@文档大师 请在 Clank 写完后审阅这份文档，补充一些有用的段落（比如使用建议、协作方式），并在文档末尾加上 author 字段。'
          : '@Clank @DocMaster Hi! @Clank please give me a short self-introduction — who you are, what you can do, and what you can help me with most. Then tell me how much you currently know about me (e.g. my role, preferences, what I am working on); it is fine to say you do not know me well yet. Finally, save the introduction as a markdown document to AI Doc and tell me the file path. @DocMaster please review the document after Clank finishes, add a few useful sections (e.g. usage tips, collaboration suggestions), and append an author field at the end.'
        chatsStore.sendMinibarMessage(greeting, chatId)
      }
      // Trigger logo dance animation to welcome the user
      setTimeout(() => {
        const logo = document.querySelector('.logo-wrap')
        if (logo) logo.click()
      }, 800)
    }, 500)
  } catch (err) {
    console.error('Tour finish failed:', err)
  }
}

async function skipSetup() {
  agentsStore.wizardHighlightAgentId = null
  await configStore.saveConfig({ setupDismissed: true })
  emit('close')
}

function openUrl(url) {
  window.electronAPI?.openExternal(url)
}

// ── Resume at correct step on mount ────────────────────────────────────────

watch(() => props.visible, (val) => {
  if (!val) return
  const lastCompleted = configStore.config.setupWizardStep || 0
  let resumeStep = lastCompleted + 1
  // step 5 = profile (creates user agent); step 4 = configure (verifies provider)
  if (resumeStep > 5) {
    const hasUserAgent = agentsStore.userAgents.some(a => !a.isBuiltin)
    if (!hasUserAgent) resumeStep = 5
  }
  if (resumeStep > 4) {
    const hasActiveProvider = configStore.config.providers.some(p => p.isActive)
    if (!hasActiveProvider) resumeStep = 4
  }

  // If step 6 (final agent step) was completed, go directly to tour
  if (resumeStep > 6) {
    phase.value = 'tour'
    tourStep.value = 1
    navigateTour()
    return
  }

  phase.value = 'steps'
  step.value = Math.min(resumeStep, 5)

  // Restore provider type from saved providers
  if (step.value >= 2) {
    const providers = configStore.config.providers || []
    const savedProvider = providers.length ? providers[providers.length - 1] : null
    if (savedProvider) selectedProviderType.value = savedProvider.type
  }
  // Restore full provider state
  if (step.value >= 3) {
    const type = selectedProviderType.value
    const existing = configStore.config.providers.find(p => p.type === type)
    if (existing) {
      wizardProviderId.value = existing.id
      providerApiKey.value = existing.apiKey || ''
      providerBaseUrl.value = existing.baseURL || currentPreset.value?.defaultBaseURL || ''
      selectedModelId.value = existing.model || ''
      if (type === 'anthropic') {
        anthropicSonnet.value = existing.model || ''
        anthropicOpus.value = existing.settings?.opusModel || ''
        anthropicHaiku.value = existing.settings?.haikuModel || ''
      }
      if (existing.isActive) testResult.value = { ok: true }
    }
  }
  // Restore profile
  if (step.value >= 4) {
    const userAgent = agentsStore.userAgents.find(a => !a.isBuiltin)
    if (userAgent) profileName.value = userAgent.name || ''
  }
  // Restore step 5 agent customization
  if (step.value >= 5) {
    const userAgent = agentsStore.userAgents.find(a => !a.isBuiltin)
    if (userAgent) {
      generatedPrompt.value = userAgent.prompt || ''
      selectedAvatar.value = userAgent.avatar || `agents:${buildAvatarSeed()}`
      selectedVoiceId.value = userAgent.voiceId || pickVoiceForProfile(null)
    } else {
      // No agent yet — go back to step 4, user clicks Next to re-generate
      step.value = 4
      selectedAvatar.value = `agents:${buildAvatarSeed()}`
      selectedVoiceId.value = pickVoiceForProfile(null)
    }
  }
}, { immediate: true })

watch(step, (val) => {
  if (val === 3) {
    const provider = ensureWizardProvider()
    if (!provider?.isActive) testResult.value = null
  }
})
</script>

<style>
/* Unscoped — required for Teleport to body */

.sw-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(1px);
  pointer-events: all;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sw-backdrop.sw-tour-mode {
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(1px);
  align-items: flex-end;
  justify-content: flex-end;
  padding: 1.25rem 1.5rem 2rem;
}

.sw-container {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: min(38rem, 92vw);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  animation: sw-enter 0.2s ease-out;
}

.sw-container.sw-tour-card {
  width: min(28rem, 85vw);
  min-height: 18rem;
  max-height: 75vh;
  animation: sw-tour-enter 0.25s ease-out;
}

@keyframes sw-enter {
  from { opacity: 0; transform: scale(0.95) translateY(0.5rem); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes sw-tour-enter {
  from { opacity: 0; transform: translateX(-1rem); }
  to { opacity: 1; transform: translateX(0); }
}

/* ── Step indicator ────────────────────────────────────────────────── */

.sw-steps-bar {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 1.25rem 1.5rem 0.75rem;
  gap: 0;
}

.sw-step-dot-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  flex: 1;
}

.sw-step-dot {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 2px solid #374151;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6B7280;
  background: #0F0F0F;
  transition: all 0.2s;
  position: relative;
  z-index: 1;
}

.sw-step-dot-group.active .sw-step-dot {
  border-color: #6366F1;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
}

.sw-step-dot-group.completed .sw-step-dot {
  border-color: #6EE7B7;
  color: #6EE7B7;
  background: #064E3B;
}

.sw-check-icon { width: 0.875rem; height: 0.875rem; }

.sw-step-label {
  font-size: 0.6875rem;
  color: #6B7280;
  margin-top: 0.25rem;
  white-space: nowrap;
}

.sw-step-dot-group.active .sw-step-label { color: #D1D5DB; }
.sw-step-dot-group.completed .sw-step-label { color: #6EE7B7; }

.sw-step-line {
  position: absolute;
  top: 0.875rem;
  left: calc(50% + 1rem);
  width: calc(100% - 2rem);
  height: 2px;
  background: #374151;
  z-index: 0;
}

.sw-step-line.filled { background: #6EE7B7; }

/* ── Header ────────────────────────────────────────────────────────── */

.sw-header {
  text-align: center;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #1F1F1F;
}

.sw-title {
  font-size: var(--fs-page-title, 1.5rem);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0 0 0.125rem;
  letter-spacing: -0.02em;
}

.sw-subtitle {
  font-size: var(--fs-secondary, 0.875rem);
  color: #9CA3AF;
  margin: 0;
}

/* ── Content ───────────────────────────────────────────────────────── */

.sw-content {
  padding: 1.25rem 1.5rem;
  max-height: 55vh;
  overflow-y: auto;
}

.sw-step-content { animation: sw-fade 0.2s ease; }
.sw-dismiss-row {
  display: flex;
  justify-content: flex-end;
  padding: 0.625rem 1.5rem 0;
  border-bottom: 1px solid #1F1F1F;
}

.sw-dismiss-btn {
  background: transparent;
  border: none;
  color: #6B7280;
  cursor: pointer;
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 500;
  font-family: inherit;
  transition: color 0.12s;
}
.sw-dismiss-btn:hover { color: #9CA3AF; }

.sw-step-auth {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.sw-auth-skip-card {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 11px 16px;
  background: var(--bg-card, #1A1A1A);
  border: 1px solid var(--border, #2A2A2A);
  border-radius: 10px;
  color: var(--text-primary, #FFFFFF);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s, transform 0.12s;
}
.sw-auth-skip-card:hover { background: var(--bg-hover, #222222); border-color: var(--text-secondary, #6B7280); }
.sw-auth-skip-card:active { transform: translateY(1px); }

.sw-auth-privacy-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: #6B7280;
  margin: 0;
  line-height: 1.45;
  padding: 0 0.25rem;
}

@keyframes sw-fade {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Form elements ─────────────────────────────────────────────────── */

.sw-form-group { margin-bottom: 0.875rem; }

.sw-label {
  display: block;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 500;
  color: #D1D5DB;
  margin-bottom: 0.25rem;
}

.sw-select, .sw-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-size: var(--fs-body, 0.9375rem);
  color: #FFFFFF;
  transition: border-color 0.15s;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.sw-select:focus, .sw-input:focus { border-color: #4B5563; }
.sw-select option { background: #1A1A1A; color: #FFFFFF; }
.sw-input::placeholder { color: #4B5563; }

.sw-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-size: var(--fs-secondary, 0.875rem);
  color: #FFFFFF;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  resize: vertical;
  line-height: 1.5;
}

.sw-textarea:focus { border-color: #4B5563; }

.sw-input-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.sw-input-row .sw-input,
.sw-input-row .sw-select {
  flex: 1;
  min-width: 0;
}

.sw-icon-btn {
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  padding: 0.5rem;
  cursor: pointer;
  color: #9CA3AF;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, color 0.15s;
}

.sw-icon-btn:hover { border-color: #4B5563; color: #D1D5DB; }

/* ── API Key help panel ─────────────────────────────────────────────── */

.sw-apikey-help-panel {
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.875rem;
}

.sw-apikey-privacy {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.875rem;
  background: rgba(110, 231, 183, 0.06);
  border: 1px solid rgba(110, 231, 183, 0.2);
  border-radius: 0.5rem;
}
.sw-apikey-privacy-icon {
  flex-shrink: 0;
  width: 0.875rem;
  height: 0.875rem;
  margin-top: 0.125rem;
  color: #6EE7B7;
}
.sw-apikey-privacy-text {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: #D1D5DB;
}

.sw-apikey-help-top {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.sw-apikey-get-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.625rem;
  background: rgba(110, 231, 183, 0.1);
  border: 1px solid rgba(110, 231, 183, 0.3);
  border-radius: 0.375rem;
  color: #6EE7B7;
  font-size: 0.8125rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.15s;
}

.sw-apikey-get-btn:hover {
  background: rgba(110, 231, 183, 0.18);
  border-color: rgba(110, 231, 183, 0.55);
  color: #A7F3D0;
}

.sw-apikey-price-row {
  margin-top: 0.375rem;
}

.sw-apikey-price-badge {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0.125rem 0.4rem;
  border-radius: 0.25rem;
  letter-spacing: 0.01em;
}

.sw-apikey-price-badge.free { background: #064E3B; color: #6EE7B7; }
.sw-apikey-price-badge.trial { background: #78350F; color: #FCD34D; }
.sw-apikey-price-badge.paid { background: #1F2937; color: #9CA3AF; }

.sw-apikey-help-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  color: #6B7280;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.125rem 0;
  font-family: inherit;
  transition: color 0.12s;
}

.sw-apikey-help-toggle:hover { color: #A5B4FC; }

.sw-apikey-help-body {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #2A2A2A;
}

.sw-apikey-help-text {
  font-size: 0.75rem;
  color: #9CA3AF;
  margin: 0 0 0.375rem;
  line-height: 1.5;
}

.sw-apikey-example {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  background: #0F0F0F;
  border: 1px solid #374151;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  color: #6EE7B7;
  font-family: 'SF Mono', 'Fira Code', monospace;
  margin-bottom: 0.375rem;
}

.sw-apikey-help-steps {
  font-size: 0.75rem;
  color: #D1D5DB;
  margin: 0;
  line-height: 1.7;
  white-space: pre-line;
}
.sw-error-text { font-size: 0.8125rem; color: #F87171; margin: 0.25rem 0 0; }

.sw-test-result {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: var(--fs-secondary, 0.875rem);
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
}

.sw-test-result.success { background: #064E3B; color: #6EE7B7; }
.sw-test-result.error { background: #7F1D1D; color: #FCA5A5; }

.sw-retest-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  background: transparent;
  border: none;
  font-size: 0.75rem;
  font-weight: 500;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
  transition: opacity 0.12s;
}
.sw-retest-btn:hover { opacity: 1; }
.sw-retest-btn:disabled { opacity: 0.35; cursor: default; }

/* ── Provider list ─────────────────────────────────────────────────── */

.sw-provider-list { display: flex; flex-direction: column; gap: 0.375rem; }

.sw-provider-item {
  width: 100%;
  text-align: left;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  font-family: inherit;
}

.sw-provider-item:hover { border-color: #4B5563; background: #222222; }
.sw-provider-item.selected { border-color: #6366F1; background: #1E1E30; }

.sw-provider-top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

.sw-provider-name { font-size: var(--fs-body, 0.9375rem); font-weight: 500; color: #FFFFFF; }

.sw-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.125rem 0.4rem;
  border-radius: 0.25rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.sw-badge.recommended { background: #312E81; color: #A5B4FC; }
.sw-badge.free { background: #064E3B; color: #6EE7B7; }
.sw-badge.trial { background: #78350F; color: #FCD34D; }
.sw-badge.paid { background: #1F2937; color: #9CA3AF; }

/* ── Privacy notice ────────────────────────────────────────────────── */

.sw-privacy-notice {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  margin-top: 0.25rem;
}

.sw-privacy-icon { width: 1.25rem; height: 1.25rem; color: #6B7280; flex-shrink: 0; margin-top: 0.125rem; }
.sw-privacy-text { font-size: var(--fs-secondary, 0.875rem); color: #D1D5DB; margin: 0 0 0.25rem; line-height: 1.4; }
.sw-privacy-hint { font-size: 0.75rem; color: #6B7280; margin: 0; line-height: 1.4; }

/* ── Agent intro card ──────────────────────────────────────────────── */

.sw-intro-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  margin-bottom: 1rem;
}

.sw-intro-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.sw-intro-text {
  font-size: var(--fs-secondary, 0.875rem);
  color: #D1D5DB;
  margin: 0;
  font-style: italic;
  line-height: 1.4;
}

/* ── Avatar ────────────────────────────────────────────────────────── */

.sw-avatar-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sw-avatar-preview {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  border: 2px solid #2A2A2A;
  background: #1A1A1A;
  object-fit: cover;
}

/* ── Voice grid ────────────────────────────────────────────────────── */

.sw-voice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 0.375rem;
}

.sw-voice-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 0.375rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  font-family: inherit;
}

.sw-voice-card:hover { border-color: #4B5563; background: #222222; }
.sw-voice-card.active { border-color: #6366F1; background: #1E1E30; }

.sw-voice-name { font-size: 0.8125rem; font-weight: 500; color: #FFFFFF; }
.sw-voice-meta { font-size: 0.6875rem; color: #6B7280; }

/* ── Tour ──────────────────────────────────────────────────────────── */

.sw-tour-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.75rem 0;
}

.sw-tour-drag {
  cursor: grab;
  padding: 0.25rem;
  border-radius: 0.25rem;
  transition: background 0.12s;
}

.sw-tour-drag:hover { background: #1F1F1F; }
.sw-tour-drag:active { cursor: grabbing; }

.sw-tour-step-num {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6B7280;
  background: #1A1A1A;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
}

.sw-tour-body {
  padding: 0.75rem 1.25rem 1rem;
  flex: 1;
}

.sw-tour-title {
  font-size: var(--fs-section, 1.125rem);
  font-weight: 600;
  color: #FFFFFF;
  margin: 0 0 0.375rem;
}

.sw-tour-desc {
  font-size: var(--fs-secondary, 0.875rem);
  color: #9CA3AF;
  margin: 0;
  line-height: 1.5;
}

/* ── Skills install dialog ─────────────────────────────────────────── */

.sw-skills-dialog {
  border-top: 1px solid #1F1F1F;
  padding: 0.625rem 1rem;
  max-height: 14rem;
  overflow-y: auto;
}

.sw-skills-dialog-header {
  margin-bottom: 0.5rem;
}

.sw-skills-dialog-title {
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  color: #FFFFFF;
  display: block;
}

.sw-skills-dialog-subtitle {
  font-size: 0.75rem;
  color: #6B7280;
}

.sw-skills-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sw-skills-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.12s;
}

.sw-skills-item:hover { background: #1A1A1A; }
.sw-skills-item.selected { background: #1E1E30; }

.sw-skills-item input[type="checkbox"] {
  margin-top: 0.125rem;
  accent-color: #6366F1;
}

.sw-skills-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sw-skills-item-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #FFFFFF;
}

.sw-skills-item-desc {
  font-size: 0.6875rem;
  color: #6B7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sw-skills-progress {
  margin-top: 0.5rem;
  position: relative;
  height: 1.25rem;
  background: #1A1A1A;
  border-radius: 0.375rem;
  overflow: hidden;
}

.sw-skills-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6366F1, #818CF8);
  border-radius: 0.375rem;
  transition: width 0.3s;
}

.sw-skills-progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #FFFFFF;
}

/* ── Footer ────────────────────────────────────────────────────────── */

.sw-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
  flex-shrink: 0;
}

.sw-footer-right { display: flex; align-items: center; gap: 0.5rem; flex-wrap: nowrap; }

.sw-btn-text {
  display: flex;
  align-items: center;
  gap: 0.25rem;
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

.sw-btn-text:hover { color: #9CA3AF; }
.sw-btn-text:disabled { opacity: 0.5; cursor: default; }

.font-mono { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; }

/* ── Char count ────────────────────────────────────────────────────── */

.sw-char-count {
  font-size: 0.6875rem;
  color: #4B5563;
  text-align: right;
  margin-top: 0.125rem;
}

/* ── AI generating ─────────────────────────────────────────────────── */

.sw-generating {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  margin-bottom: 0.875rem;
  color: #9CA3AF;
  font-size: var(--fs-secondary, 0.875rem);
}

.sw-generating-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid #374151;
  border-top-color: #818CF8;
  border-radius: 50%;
  animation: sw-spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes sw-spin {
  to { transform: rotate(360deg); }
}
</style>
