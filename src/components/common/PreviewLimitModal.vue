<template>
  <Teleport to="body">
    <div v-if="visible" class="limit-backdrop">
      <div class="limit-modal" role="alertdialog" aria-modal="true">
        <!-- Header -->
        <div class="limit-header">
          <div class="limit-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 class="limit-title">{{ t('limits.title') }}</h2>
        </div>

        <!-- Body -->
        <div class="limit-body">
          <p class="limit-message">{{ message }}</p>
        </div>

        <!-- Footer -->
        <div class="limit-footer">
          <button class="limit-close-btn" @click="$emit('close')">{{ t('common.close') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  message: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['close'])

function onKeydown(e) {
  if (e.key === 'Escape' && props.visible) {
    e.stopPropagation()
    emit('close')
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown, true))
onUnmounted(() => document.removeEventListener('keydown', onKeydown, true))
</script>

<style scoped>
.limit-backdrop {
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

.limit-modal {
  width: min(26rem, 90vw);
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: limit-enter 0.2s ease-out;
}

@keyframes limit-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.limit-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.25rem 1rem;
  border-bottom: 1px solid #1F1F1F;
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
}

.limit-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.625rem;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #F59E0B;
}

.limit-icon-wrap svg {
  width: 1.125rem;
  height: 1.125rem;
}

.limit-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}

.limit-body {
  padding: 1.25rem 1.25rem 1.5rem;
}

.limit-message {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #9CA3AF;
  line-height: 1.6;
  margin: 0;
}

.limit-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
}

.limit-close-btn {
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
  color: #fff;
  border: 1px solid #374151;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.limit-close-btn:hover {
  background: linear-gradient(135deg, #1A1A1A, #2D2D2D, #4B5563);
  border-color: #4B5563;
}

@media (prefers-reduced-motion: reduce) {
  .limit-modal { animation: none; }
}
</style>
