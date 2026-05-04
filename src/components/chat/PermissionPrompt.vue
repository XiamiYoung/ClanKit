<template>
  <div class="perm-prompt" :class="{ 'perm-resolved': resolved || seg.status !== 'pending' }">
    <div class="perm-header">
      <div class="perm-icon">
        <svg style="width:13px;height:13px;color:#FFFFFF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <span class="perm-title">{{ t('chats.permissionRequired') }}</span>
      <span v-if="resolved || seg.status !== 'pending'" class="perm-result-badge" :class="resolvedDecision === 'reject' || seg.status === 'rejected' ? 'badge-rejected' : 'badge-allowed'">
        {{ resolvedDecision === 'reject' || seg.status === 'rejected' ? t('chats.permissionRejected') : t('chats.permissionAllowed') }}
      </span>
    </div>
    <div class="perm-body">
      <p class="perm-description">{{ t('chats.permissionWantsToRun') }}</p>
      <div class="perm-command">
        <span class="perm-tool-name">{{ seg.toolName }}</span>
        <span v-if="seg.command" class="perm-cmd-text">{{ seg.command }}</span>
      </div>
    </div>
    <div v-if="!resolved && seg.status === 'pending'" class="perm-actions">
      <button class="perm-btn perm-btn-primary" @click="decide('allow-global')">
        {{ t('chats.permissionAllowAll') }}
      </button>
      <button class="perm-btn perm-btn-secondary" @click="decide('allow-chat')">
        {{ t('chats.permissionAllowChat') }}
      </button>
      <button class="perm-btn perm-btn-danger" @click="decide('reject')">
        {{ t('chats.permissionReject') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  seg: { type: Object, required: true }
})
const emit = defineEmits(['allow-chat', 'allow-global', 'reject'])

// Initialize from persisted status so buttons don't reappear after navigation/restart
const resolved = ref(props.seg.status !== 'pending')
const resolvedDecision = ref(
  props.seg.status === 'rejected' ? 'reject' : (props.seg.status === 'allowed' ? 'allow-chat' : '')
)

function decide(decision) {
  if (resolved.value || props.seg.status !== 'pending') return
  resolved.value = true
  resolvedDecision.value = decision
  emit(decision, props.seg)
}
</script>

<style scoped>
.perm-prompt {
  margin: 0.5rem 0;
  border-radius: 0.875rem;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #2C2C2E;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  font-family: 'Inter', sans-serif;
}
.perm-resolved {
  opacity: 0.55;
}
.perm-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem 0.625rem;
}
.perm-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: #FF9F0A;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.perm-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #FFFFFF;
  flex: 1;
  letter-spacing: -0.01em;
}
.perm-result-badge {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0.125rem 0.5rem;
  border-radius: 99px;
}
.badge-allowed {
  background: rgba(48, 209, 88, 0.18);
  color: #30D158;
}
.badge-rejected {
  background: rgba(255, 69, 58, 0.15);
  color: #FF453A;
}
.perm-body {
  padding: 0 1rem 0.75rem;
}
.perm-description {
  font-size: 0.75rem;
  color: #98989D;
  margin: 0 0 0.5rem 0;
}
.perm-command {
  display: flex;
  align-items: center;
  padding: 0.4375rem 0.625rem;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 0.5rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.75rem;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.perm-tool-name {
  color: #FF9F0A;
  font-weight: 600;
}
.perm-cmd-text {
  color: #EBEBF5;
  word-break: break-all;
  opacity: 0.75;
}
.perm-actions {
  display: flex;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.perm-btn {
  font-family: 'Inter', sans-serif;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 0.4375rem;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0.3rem 0.625rem;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.perm-btn-primary {
  background: linear-gradient(135deg, #92400E, #B45309);
  color: #FEF3C7;
  box-shadow: 0 1px 4px rgba(180, 83, 9, 0.3);
}
.perm-btn-primary:hover {
  background: linear-gradient(135deg, #A45208, #D97706);
}
.perm-btn-secondary {
  background: linear-gradient(135deg, #065F46, #047857);
  color: #D1FAE5;
  box-shadow: 0 1px 4px rgba(4, 120, 87, 0.3);
}
.perm-btn-secondary:hover {
  background: linear-gradient(135deg, #047857, #059669);
}
.perm-btn-danger {
  background: linear-gradient(135deg, #7F1D1D, #B91C1C);
  color: #FEE2E2;
  box-shadow: 0 1px 4px rgba(185, 28, 28, 0.3);
}
.perm-btn-danger:hover {
  background: linear-gradient(135deg, #991B1B, #DC2626);
}
</style>
