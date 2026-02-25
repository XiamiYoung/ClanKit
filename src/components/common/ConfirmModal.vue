<template>
  <Teleport to="body">
    <div class="confirm-backdrop" @click.self="!loading && $emit('close')" @keydown.escape="!loading && $emit('close')">
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
          <button class="confirm-cancel-btn" @click="$emit('close')" :disabled="loading">{{ cancelText }}</button>
          <button
            class="confirm-action-btn"
            :class="[confirmClass, { 'confirm-action-loading': loading }]"
            :disabled="loading"
            @click="$emit('confirm')"
          >
            <svg v-if="loading" class="confirm-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            {{ loading ? loadingText : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'

const props = defineProps({
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
    default: 'Delete',
  },
  confirmClass: {
    type: String,
    default: 'danger',
  },
  cancelText: {
    type: String,
    default: 'Cancel',
  },
  loading: {
    type: Boolean,
    default: false,
  },
  loadingText: {
    type: String,
    default: 'Deleting…',
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['confirm', 'close'])

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
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-modal {
  width: min(440px, 90vw);
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 16px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: confirm-enter 0.2s ease-out;
}

@keyframes confirm-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.confirm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #E5E5EA;
}

.confirm-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}

.confirm-close-btn {
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
.confirm-close-btn:hover:not(:disabled) {
  background: #F5F5F5;
}
.confirm-close-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.confirm-body {
  padding: 20px 20px 24px;
}

.confirm-message {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #6B7280;
  line-height: 1.6;
  margin: 0;
}

.confirm-error {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #EF4444;
  line-height: 1.5;
  margin: 10px 0 0;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.08);
  border-radius: 8px;
}

.confirm-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #E5E5EA;
  background: #F9F9F9;
}

.confirm-cancel-btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
}
.confirm-cancel-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.confirm-cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confirm-action-btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.confirm-action-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.confirm-action-btn.danger {
  background: #EF4444;
  color: #fff;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25);
}
.confirm-action-btn.danger:hover:not(:disabled) {
  background: #DC2626;
  box-shadow: 0 2px 12px rgba(239, 68, 68, 0.35);
}

.confirm-action-btn.primary {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
}
.confirm-action-btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

.confirm-spinner {
  width: 16px;
  height: 16px;
  animation: confirm-spin 0.8s linear infinite;
}

@keyframes confirm-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .confirm-modal {
    animation: none;
  }
  .confirm-spinner {
    animation: none;
  }
}
</style>
