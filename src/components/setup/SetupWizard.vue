<template>
  <Teleport to="body">
    <div v-if="visible" class="sw-backdrop" style="z-index: 9999;">
      <div class="sw-container">
        <!-- Header -->
        <div class="sw-header">
          <h1 class="sw-title">Welcome to ClankAI / 欢迎使用 ClankAI</h1>
          <p class="sw-subtitle">Let's get you set up / 让我们来完成初始配置</p>
        </div>

        <!-- Step Content -->
        <div class="sw-content">
          <div class="sw-step-content">
            <h2 class="sw-section-title">{{ t('setupWizard.selectLanguage') }}</h2>
            <div class="sw-form-group">
              <select v-model="selectedLanguage" class="sw-select">
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
          </div>

          <!-- Privacy Notice -->
          <div class="sw-privacy-notice">
            <svg class="sw-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <div>
              <p class="sw-privacy-text">{{ t('setupWizard.privacyNotice') }}</p>
              <p class="sw-privacy-hint">{{ t('setupWizard.privacyHint') }}</p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="sw-footer">
          <div></div>
          <div class="sw-footer-right">
            <button class="sw-btn-text" @click="skipSetup">{{ t('setupWizard.configureLater') }}</button>
            <AppButton variant="primary" size="modal" @click="completeSetup">
              {{ t('setupWizard.getStarted') }}
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '../../stores/config'
import { useI18n } from '../../i18n/useI18n'
import AppButton from '../common/AppButton.vue'

defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'complete'])

const router = useRouter()
const configStore = useConfigStore()
const { t } = useI18n()

const selectedLanguage = ref(configStore.config.language || 'en')

watch(selectedLanguage, async (lang) => {
  await configStore.saveConfig({ language: lang })
})

async function completeSetup() {
  try {
    await configStore.saveConfig({
      language: selectedLanguage.value,
      setupDismissed: true,
    })
    emit('complete')
    // Navigate to Config page with onboarding mode for AI provider setup
    router.push({ path: '/config', query: { onboarding: '1', tab: 'models' } })
  } catch (err) {
    console.error('Setup failed:', err)
  }
}

async function skipSetup() {
  await configStore.saveConfig({ setupDismissed: true, onboardingCompleted: true })
  emit('close')
}
</script>

<style>
/* Unscoped — required for Teleport to body */

.sw-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sw-container {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: min(28rem, 90vw);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  animation: sw-enter 0.2s ease-out;
}

@keyframes sw-enter {
  from { opacity: 0; transform: scale(0.95) translateY(0.5rem); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.sw-header {
  text-align: center;
  padding: 1.5rem 1.5rem 1rem;
  border-bottom: 1px solid #1F1F1F;
}

.sw-title {
  font-size: var(--fs-page-title, 1.5rem);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0 0 0.25rem;
  letter-spacing: -0.02em;
}

.sw-subtitle {
  font-size: var(--fs-secondary, 0.875rem);
  color: #9CA3AF;
  margin: 0;
}

.sw-content {
  padding: 1.5rem;
}

.sw-step-content {
  animation: sw-fade 0.2s ease;
}

@keyframes sw-fade {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: translateY(0); }
}

.sw-section-title {
  font-size: var(--fs-section, 1.25rem);
  font-weight: 600;
  color: #FFFFFF;
  margin: 0 0 1rem;
  letter-spacing: -0.01em;
}

.sw-form-group {
  margin-bottom: 1rem;
}

.sw-select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-size: var(--fs-body, 0.9375rem);
  color: #FFFFFF;
  transition: border-color 0.15s;
  outline: none;
}

.sw-select:focus { border-color: #4B5563; }

.sw-select option {
  background: #1A1A1A;
  color: #FFFFFF;
}

.sw-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
}

.sw-footer-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sw-btn-text {
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

.sw-btn-text:hover {
  color: #9CA3AF;
}

.sw-privacy-notice {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  margin-top: 0.25rem;
}

.sw-privacy-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: #6B7280;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.sw-privacy-text {
  font-size: var(--fs-secondary, 0.875rem);
  color: #D1D5DB;
  margin: 0 0 0.25rem;
  line-height: 1.4;
}

.sw-privacy-hint {
  font-size: 0.75rem;
  color: #6B7280;
  margin: 0;
  line-height: 1.4;
}
</style>
