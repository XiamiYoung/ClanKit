<template>
  <div class="perm-prompt" :class="{ 'perm-resolved': resolved || seg.status !== 'pending' }">
    <div class="perm-header">
      <div class="perm-icon">
        <svg style="width:14px;height:14px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <span class="perm-title">Permission Required</span>
      <span v-if="resolved || seg.status !== 'pending'" class="perm-result-badge" :class="resolvedDecision === 'reject' || seg.status === 'rejected' ? 'badge-rejected' : 'badge-allowed'">
        {{ resolvedDecision === 'reject' || seg.status === 'rejected' ? 'Rejected' : 'Allowed' }}
      </span>
    </div>
    <div class="perm-body">
      <p class="perm-description">The agent wants to run:</p>
      <div class="perm-command">
        <span class="perm-tool-name">{{ seg.toolName }}</span>
        <span v-if="seg.command" class="perm-cmd-text">{{ seg.command }}</span>
      </div>
    </div>
    <div v-if="!resolved && seg.status === 'pending'" class="perm-actions">
      <button class="perm-btn perm-btn-primary" @click="decide('allow-chat')">
        Allow this chat
      </button>
      <button class="perm-btn perm-btn-secondary" @click="decide('allow-global')">
        Allow all chats
      </button>
      <button class="perm-btn perm-btn-danger" @click="decide('reject')">
        Reject
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

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
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid #2A2A2A;
  background: #0F0F0F;
  font-family: 'Inter', sans-serif;
}
.perm-resolved {
  opacity: 0.75;
}
.perm-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem 0.5rem;
  border-bottom: 1px solid #1F1F1F;
}
.perm-icon {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.375rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.perm-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #FFFFFF;
  flex: 1;
}
.perm-result-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 99px;
}
.badge-allowed {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}
.badge-rejected {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}
.perm-body {
  padding: 0.625rem 0.875rem;
}
.perm-description {
  font-size: 0.75rem;
  color: #9CA3AF;
  margin: 0 0 0.5rem 0;
}
.perm-command {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.75rem;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.perm-tool-name {
  color: #60a5fa;
  font-weight: 600;
}
.perm-cmd-text {
  color: #E5E5EA;
  word-break: break-all;
}
.perm-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem 0.75rem;
  flex-wrap: wrap;
}
.perm-btn {
  padding: 0.3125rem 0.75rem;
  border-radius: 0.5rem;
  border: none;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.perm-btn-primary {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.perm-btn-primary:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
.perm-btn-secondary {
  background: #1A1A1A;
  color: #9CA3AF;
  border: 1px solid #2A2A2A;
}
.perm-btn-secondary:hover {
  background: #2A2A2A;
  color: #FFFFFF;
}
.perm-btn-danger {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
  border: 1px solid rgba(255, 59, 48, 0.2);
}
.perm-btn-danger:hover {
  background: rgba(255, 59, 48, 0.15);
}
</style>
