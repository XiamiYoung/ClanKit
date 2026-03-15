<template>
  <div class="topic-card" @click="$emit('click')">
    <div class="topic-card-accent" :style="{ background: accentGradient }"></div>
    <div class="topic-card-body">
      <div class="topic-card-header">
        <h3 class="topic-card-title">{{ topic.title }}</h3>
        <span v-if="statusLabel" class="topic-card-status" :class="'status-' + topic.lastSessionStatus">
          {{ statusLabel }}
        </span>
      </div>
      <p class="topic-card-desc">{{ topic.description || 'No description' }}</p>
      <div class="topic-card-footer">
        <AppButton size="compact" @click.stop="$emit('start')">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          {{ topic.lastSessionStatus === 'running' ? 'Resume' : 'Start' }}
        </AppButton>
        <AppButton size="compact" variant="ghost" @click.stop="$emit('history')">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          History
        </AppButton>
        <button
          v-if="!topic.isBuiltin"
          class="topic-delete-btn"
          @click.stop="$emit('delete')"
          title="Delete topic"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AppButton from '../common/AppButton.vue'

const props = defineProps({
  topic: { type: Object, required: true },
})

defineEmits(['click', 'start', 'history', 'delete'])

const accentGradient = computed(() => {
  const s = props.topic.lastSessionStatus
  if (s === 'running') return 'linear-gradient(90deg, #F59E0B, #EF4444)'
  if (s === 'concluded') return 'linear-gradient(90deg, #10B981, #059669)'
  if (s === 'deadlocked') return 'linear-gradient(90deg, #6B7280, #374151)'
  return 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'
})

const statusLabel = computed(() => {
  const s = props.topic.lastSessionStatus
  if (s === 'running') return 'Running'
  if (s === 'concluded') return 'Concluded'
  if (s === 'deadlocked') return 'Deadlocked'
  if (s === 'paused') return 'Paused'
  return null
})
</script>

<style scoped>
.topic-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.topic-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}
.topic-card-accent {
  height: 3px;
}
.topic-card-body {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.topic-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.topic-card-title {
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
}
.topic-card-status {
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  white-space: nowrap;
}
.status-running { background: rgba(245,158,11,0.12); color: #D97706; }
.status-concluded { background: rgba(16,185,129,0.12); color: #059669; }
.status-deadlocked { background: rgba(107,114,128,0.12); color: #4B5563; }
.status-paused { background: rgba(99,102,241,0.12); color: #6366F1; }
.topic-card-desc {
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.topic-card-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.topic-delete-btn {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.topic-delete-btn:hover {
  color: #EF4444;
  background: rgba(239,68,68,0.08);
}
</style>
