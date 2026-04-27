<template>
  <Teleport to="body">
    <Transition name="se-fade">
      <div v-if="auth.sessionExpiredOpen.value" class="se-backdrop">
        <Transition name="se-pop" appear>
          <div v-if="auth.sessionExpiredOpen.value" class="se-dialog" role="dialog" aria-modal="true">
            <div class="se-icon-wrap">
              <svg class="se-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h2 class="se-title">{{ t('auth.sessionExpiredTitle') }}</h2>
            <p class="se-body">{{ t('auth.sessionExpiredBody') }}</p>
            <div class="se-actions">
              <button class="se-btn se-btn-secondary" @click="auth.dismissSessionExpired()">
                {{ t('auth.continueWithoutLogin') }}
              </button>
              <button class="se-btn se-btn-primary" @click="auth.reauthenticate()">
                {{ t('auth.signInAgain') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { useAuth } from '../../composables/useAuth'
import { useI18n } from '../../i18n/useI18n'

const auth = useAuth()
const { t } = useI18n()
</script>

<style scoped>
.se-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}
.se-dialog {
  background: #FFFFFF;
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  width: 100%; max-width: 26rem;
  padding: 2rem 1.75rem 1.5rem;
  display: flex; flex-direction: column; align-items: center;
  font-family: 'Inter', sans-serif;
}
.se-icon-wrap {
  width: 3.5rem; height: 3.5rem;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.12);
  color: #F59E0B;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 1.25rem;
}
.se-icon { width: 1.75rem; height: 1.75rem; }
.se-title {
  font-size: var(--fs-h3);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.5rem;
  text-align: center;
}
.se-body {
  font-size: var(--fs-body);
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.5;
  margin: 0 0 1.5rem;
}
.se-actions {
  display: flex; gap: 0.625rem;
  width: 100%;
}
.se-btn {
  flex: 1;
  padding: 0.625rem 1rem;
  border-radius: var(--radius-md);
  font-size: var(--fs-body);
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition: filter 0.15s, background 0.15s;
}
.se-btn-secondary {
  background: #F3F4F6;
  border-color: #E5E7EB;
  color: var(--text-primary);
}
.se-btn-secondary:hover { background: #E5E7EB; }
.se-btn-primary {
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
  color: #FFFFFF;
}
.se-btn-primary:hover { filter: brightness(1.1); }

.se-fade-enter-active, .se-fade-leave-active { transition: opacity 0.18s ease; }
.se-fade-enter-from, .se-fade-leave-to { opacity: 0; }
.se-pop-enter-active { transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease; }
.se-pop-leave-active { transition: transform 0.15s ease, opacity 0.15s ease; }
.se-pop-enter-from { transform: scale(0.92); opacity: 0; }
.se-pop-leave-to { transform: scale(0.96); opacity: 0; }
</style>
