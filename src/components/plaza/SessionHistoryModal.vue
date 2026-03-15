<template>
  <Teleport to="body">
    <div class="plaza-modal-backdrop">
      <div class="plaza-modal" style="max-width:34rem;">
        <div class="plaza-modal-header">
          <div class="plaza-modal-icon">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h2 class="plaza-modal-title">Session History</h2>
          <button class="plaza-modal-close" @click="$emit('close')">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="plaza-modal-body">
          <div v-if="loading" style="text-align:center;padding:2rem;color:rgba(255,255,255,0.4);">Loading...</div>
          <div v-else-if="sessions.length === 0" style="text-align:center;padding:2rem;color:rgba(255,255,255,0.4);">No sessions yet.</div>
          <div v-else class="history-list">
            <div v-for="s in sessions" :key="s.id" class="history-row">
              <div class="history-info">
                <span class="history-date">{{ formatDate(s.startedAt) }}</span>
                <span class="history-status" :class="'status-' + s.status">{{ s.status }}</span>
                <span class="history-rounds">{{ s.currentRound }}/{{ s.maxRounds }} rounds</span>
              </div>
              <div class="history-agents">
                <span v-for="msg in uniqueAgentNames(s)" :key="msg" class="history-agent-chip">{{ msg }}</span>
              </div>
              <AppButton size="compact" variant="ghost" @click="$emit('open-session', s)">Open</AppButton>
            </div>
          </div>
        </div>

        <div class="plaza-modal-footer">
          <AppButton variant="secondary" @click="$emit('close')">Close</AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppButton from '../common/AppButton.vue'

const props = defineProps({
  topicId: { type: String, required: true },
})

const emit = defineEmits(['close', 'open-session'])

const sessions = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    sessions.value = await window.electronAPI.plaza.getSessions(props.topicId)
    sessions.value.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
  } catch {}
  loading.value = false
})

function formatDate(ts) {
  if (!ts) return 'Unknown'
  return new Date(ts).toLocaleString()
}

function uniqueAgentNames(session) {
  const names = new Set()
  for (const m of (session.messages || [])) {
    if (m.agentName) names.add(m.agentName)
  }
  return [...names]
}
</script>

<style>
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.history-row {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: var(--radius-sm);
}
.history-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.history-date {
  font-size: var(--fs-caption);
  color: rgba(255,255,255,0.5);
}
.history-status {
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.0625rem 0.375rem;
  border-radius: var(--radius-full);
}
.history-rounds {
  font-size: var(--fs-caption);
  color: rgba(255,255,255,0.4);
}
.history-agents {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.history-agent-chip {
  font-size: var(--fs-small);
  background: #2A2A2A;
  color: rgba(255,255,255,0.6);
  padding: 0.0625rem 0.375rem;
  border-radius: var(--radius-full);
}
</style>
