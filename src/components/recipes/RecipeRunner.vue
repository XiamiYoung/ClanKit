<template>
  <div class="rr-root">
    <!-- Column grid -->
    <div
      v-if="columns.length > 0"
      class="rr-grid"
      :style="{ 'grid-template-columns': `repeat(${columns.length}, 1fr)` }"
    >
      <div v-for="col in columns" :key="col.agentId" class="rr-col" :class="`rr-col--${col.status}`">
        <!-- Column header -->
        <div class="rr-col-header">
          <div class="rr-col-identity">
            <div class="rr-col-avatar">{{ col.avatar }}</div>
            <span class="rr-col-name">{{ col.agentName }}</span>
          </div>
          <div class="rr-col-actions">
            <span v-if="col.status === 'done'" class="rr-status-badge rr-status--done">Done</span>
            <span v-else-if="col.status === 'skipped'" class="rr-status-badge rr-status--skipped">Skipped</span>
            <span v-else-if="col.status === 'failed'" class="rr-status-badge rr-status--failed">Failed</span>
            <span v-else-if="col.status === 'waiting'" class="rr-status-badge rr-status--waiting">Waiting</span>
            <div v-else-if="col.status === 'running'" class="rr-streaming-indicator">
              <span class="rr-eq-bar" /><span class="rr-eq-bar" /><span class="rr-eq-bar" />
            </div>
            <button
              v-if="col.text"
              class="rr-copy-btn"
              @click="copyColumn(col)"
              :title="copyFeedback === col.agentId ? 'Copied!' : 'Copy'"
            >
              <svg v-if="copyFeedback !== col.agentId" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <svg v-else style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Column body -->
        <div class="rr-col-body">
          <div v-if="col.text" class="rr-output-text" v-text="col.text" />
          <div v-else-if="col.status === 'running'" class="rr-loading">
            <span class="rr-eq-bar" /><span class="rr-eq-bar" /><span class="rr-eq-bar" />
          </div>
          <div v-else-if="col.status === 'skipped'" class="rr-empty rr-empty--skipped">
            <svg style="width:16px;height:16px;opacity:0.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Skipped
          </div>
          <div v-else-if="col.status === 'waiting'" class="rr-empty">Waiting…</div>
          <div v-else class="rr-empty">No output</div>
        </div>
      </div>
    </div>

    <!-- No agents configured -->
    <div v-else class="rr-no-agents">
      No agent outputs available.
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAgentsStore } from '../../stores/agents'

const agentsStore = useAgentsStore()

const props = defineProps({
  // For live runs: pass activeRun from store
  // For history: pass loaded RunDetail
  run: { type: Object, default: null },
  recipe: { type: Object, default: null },
  // readOnly=true → static display (history view)
  readOnly: { type: Boolean, default: false },
})

const copyFeedback = ref(null)

// Resolve per-agent status
function resolveStatus(rp) {
  if (!props.run) return 'waiting'
  // Live run: use agentStatuses map
  if (props.run.agentStatuses) {
    return props.run.agentStatuses[rp.agentId] || 'waiting'
  }
  // History run: infer from outputs + run status
  const hasOutput = !!(props.run.outputs?.[rp.agentId])
  if (props.run.status === 'completed' || hasOutput) return 'done'
  return 'waiting'
}

// Build columns from recipe.agents + run.outputs
const columns = computed(() => {
  if (!props.recipe || !props.run) return []
  const agents = props.recipe.agents || []
  const outputs = props.run.outputs || {}
  return agents.map(rp => {
    const agent = agentsStore.getAgentById(rp.agentId)
    return {
      agentId: rp.agentId,
      agentName: agent?.name || rp.agentId,
      avatar: agent?.avatar || '🤖',
      text: outputs[rp.agentId] || '',
      status: resolveStatus(rp),
    }
  })
})

function copyColumn(col) {
  navigator.clipboard.writeText(col.text).then(() => {
    copyFeedback.value = col.agentId
    setTimeout(() => { copyFeedback.value = null }, 1500)
  })
}
</script>

<style scoped>
.rr-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.rr-grid {
  display: grid;
  gap: 0.875rem;
  flex: 1;
  min-height: 0;
}

.rr-col {
  display: flex;
  flex-direction: column;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: var(--radius-lg, 1rem);
  overflow: hidden;
  min-height: 12rem;
}

/* Column header */
.rr-col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid #2A2A2A;
  background: #0A0A0A;
  gap: 0.5rem;
}
.rr-col-identity {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.rr-col-avatar {
  width: 1.625rem;
  height: 1.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
  border-radius: 50%;
  font-size: 0.8125rem;
  flex-shrink: 0;
}
.rr-col-name {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #FFFFFF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rr-col-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

.rr-status-badge {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
}
.rr-status--done    { color: #10B981; background: rgba(16,185,129,0.12); }
.rr-status--skipped { color: #F59E0B; background: rgba(245,158,11,0.12); }
.rr-status--failed  { color: #EF4444; background: rgba(239,68,68,0.12); }
.rr-status--waiting { color: #6B7280; background: rgba(107,114,128,0.1); }

/* Column tint for skipped/failed */
.rr-col--skipped { opacity: 0.6; }
.rr-col--failed  { border-color: rgba(239,68,68,0.35) !important; }

.rr-streaming-indicator {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Equalizer bars */
.rr-eq-bar {
  display: inline-block;
  width: 3px;
  height: 0.875rem;
  background: #6B7280;
  border-radius: 2px;
  animation: rr-eq 0.8s ease-in-out infinite alternate;
}
.rr-eq-bar:nth-child(2) { animation-delay: 0.15s; }
.rr-eq-bar:nth-child(3) { animation-delay: 0.3s; }
@keyframes rr-eq {
  0%   { transform: scaleY(0.3); opacity: 0.4; }
  100% { transform: scaleY(1);   opacity: 1; }
}

.rr-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.625rem;
  height: 1.625rem;
  background: rgba(255,255,255,0.07);
  border: none;
  border-radius: 0.3125rem;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.15s ease;
}
.rr-copy-btn:hover {
  background: rgba(255,255,255,0.14);
  color: #FFFFFF;
}

/* Column body */
.rr-col-body {
  flex: 1;
  padding: 0.875rem;
  overflow-y: auto;
}

.rr-output-text {
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  color: #E5E5EA;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.rr-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 2.5rem 0;
}

.rr-empty {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  color: #4B5563;
  text-align: center;
  padding: 2.5rem 0;
}
.rr-empty--skipped {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  color: #6B7280;
}

.rr-no-agents {
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  color: #6B7280;
  text-align: center;
  padding: 3rem 0;
}
</style>
