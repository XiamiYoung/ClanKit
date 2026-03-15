<template>
  <Teleport to="body">
    <div v-if="visible" class="confirm-backdrop">
      <div class="confirm-modal" role="alertdialog" aria-modal="true">
        <!-- Header -->
        <div class="confirm-header">
          <h2 class="confirm-title">{{ title }}</h2>
          <button class="confirm-close-btn" @click="$emit('close')" :disabled="loading" aria-label="Close">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="confirm-body">
          <p class="confirm-message">{{ message }}</p>
          <p v-if="error" class="confirm-error">{{ error }}</p>
        </div>

        <!-- Footer -->
        <div class="confirm-footer">
          <button v-if="computedCancelText" class="confirm-cancel-btn" @click="$emit('close')" :disabled="loading">{{ computedCancelText }}</button>
          <button
            class="confirm-action-btn"
            :class="[confirmClass, { 'confirm-action-loading': loading }]"
            :disabled="loading"
            @click="$emit('confirm')"
          >
            <svg v-if="loading" class="confirm-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            {{ loading ? computedLoadingText : computedConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

defineOptions({ inheritAttrs: false })
const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  confirmText: {
    type: String,
    default: '',
  },
  confirmClass: {
    type: String,
    default: 'danger',
  },
  cancelText: {
    type: String,
    default: undefined,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  loadingText: {
    type: String,
    default: '',
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['confirm', 'close'])

function onBackdropClick() {
  if (!props.loading) {
    emit('close')
  }
}

const computedConfirmText = computed(() => props.confirmText || t('common.delete'))
const computedCancelText = computed(() => {
  if (props.cancelText === '') return ''
  return props.cancelText ?? t('common.cancel')
})
const computedLoadingText = computed(() => props.loadingText || t('common.deleting'))

function onKeydown(e) {
  if (e.key === 'Escape' && !props.loading) {
    e.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-modal {
  width: min(27.5rem, 90vw);
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: confirm-enter 0.2s ease-out;
}

@keyframes confirm-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.confirm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1F1F1F;
}

.confirm-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}

.confirm-close-btn {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s;
}
.confirm-close-btn:hover:not(:disabled) { background: #1F1F1F; color: #FFFFFF; }
.confirm-close-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.confirm-body {
  padding: 1.25rem 1.25rem 1.5rem;
}

.confirm-message {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #9CA3AF;
  line-height: 1.6;
  margin: 0;
}

.confirm-error {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #FCA5A5;
  line-height: 1.5;
  margin: 0.625rem 0 0;
  padding: 0.5rem 0.75rem;
  background: rgba(239, 68, 68, 0.12);
  border-radius: 0.5rem;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.confirm-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.625rem;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
}

.confirm-cancel-btn {
  padding: 0.5rem 1.125rem;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  background: #1A1A1A;
  color: #9CA3AF;
  border: 1px solid #2A2A2A;
  cursor: pointer;
  transition: all 0.15s;
}
.confirm-cancel-btn:hover:not(:disabled) { background: #222222; color: #FFFFFF; border-color: #374151; }
.confirm-cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.confirm-action-btn {
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.confirm-action-btn:disabled { opacity: 0.7; cursor: not-allowed; }

.confirm-action-btn.danger {
  background: #DC2626;
  color: #fff;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
}
.confirm-action-btn.danger:hover:not(:disabled) {
  background: #EF4444;
  box-shadow: 0 2px 12px rgba(220, 38, 38, 0.4);
}

.confirm-action-btn.primary {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #fff;
  border: 1px solid #374151;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.confirm-action-btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #2D2D2D 0%, #374151 40%, #6B7280 100%);
}

.confirm-spinner {
  width: 1rem;
  height: 1rem;
  animation: confirm-spin 0.8s linear infinite;
}

@keyframes confirm-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .confirm-modal { animation: none; }
  .confirm-spinner { animation: none; }
}
</style>
