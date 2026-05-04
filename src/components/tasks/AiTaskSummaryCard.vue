<template>
  <div class="atsc-card" v-if="run">
    <div class="atsc-header">
      <div class="atsc-meta">
        <span :class="['atsc-status', `atsc-status-${run.status}`]">{{ capitalizeStatus(run.status) }}</span>
        <span class="atsc-trigger">{{ run.triggeredBy === 'schedule' ? '🔔 ' + t('tasks.scheduled') : '👆 ' + t('tasks.manual') }}</span>
      </div>
      <div class="atsc-times">
        <span>{{ formatTime(run.startedAt) }} → {{ formatTime(run.completedAt) }}</span>
        <span class="atsc-duration">{{ formatDuration(run.startedAt, run.completedAt) }}</span>
      </div>
    </div>

  </div>
</template>

<script setup>
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

defineProps({
  run:        { type: Object, default: null },
  runDetail:  { type: Object, default: null },
})

function capitalizeStatus(s) {
  const statusMap = {
    completed: t('tasks.status.completed'),
    error: t('tasks.status.error'),
    running: t('tasks.status.running')
  }
  return statusMap[s] || s.charAt(0).toUpperCase() + s.slice(1)
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDuration(start, end) {
  if (!start || !end) return ''
  const ms = new Date(end) - new Date(start)
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.round(secs / 60)
  return `${mins}m`
}
</script>

<style scoped>
.atsc-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1rem;
  margin-bottom: 1rem;
}

.atsc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.atsc-meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.atsc-status {
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
  font-size: var(--fs-caption);
  font-weight: 600;
}

.atsc-status-completed {
  background: #D1FAE5;
  color: #065F46;
}

.atsc-status-error {
  background: #FEE2E2;
  color: #7F1D1D;
}

.atsc-status-running {
  background: #DBEAFE;
  color: #0C2340;
}

.atsc-trigger {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}

.atsc-times {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
}

.atsc-duration {
  font-size: var(--fs-caption);
  color: var(--text-muted);
}

</style>
