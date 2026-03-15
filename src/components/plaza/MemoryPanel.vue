<template>
  <div class="memory-panel">
    <h3 class="memory-panel-title">Agent Memories</h3>

    <div v-if="!hasMemories" class="memory-empty">
      No memories extracted yet.
    </div>

    <div v-for="agentId in agentIds" :key="agentId" class="memory-agent-block">
      <div class="memory-agent-header">
        <div class="memory-avatar" :style="{ background: 'linear-gradient(135deg, #0F0F0F 0%, #374151 100%)' }">
          {{ (agentNames[agentId] || '?')[0].toUpperCase() }}
        </div>
        <span class="memory-agent-name">{{ agentNames[agentId] || agentId }}</span>
      </div>
      <ul v-if="(memories[agentId] || []).length > 0" class="memory-list">
        <li v-for="(m, i) in memories[agentId]" :key="i" class="memory-item">{{ m }}</li>
      </ul>
      <p v-else class="memory-none">No memories for this agent.</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  agentIds: { type: Array, default: () => [] },
  agentNames: { type: Object, default: () => ({}) },
  memories: { type: Object, default: () => ({}) },
})

const hasMemories = computed(() => {
  return Object.values(props.memories).some(arr => arr && arr.length > 0)
})
</script>

<style scoped>
.memory-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow-y: auto;
}
.memory-panel-title {
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.memory-empty {
  font-size: var(--fs-secondary);
  color: var(--text-muted);
  text-align: center;
  padding: 1.5rem 0;
}
.memory-agent-block {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-light);
}
.memory-agent-block:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.memory-agent-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.memory-avatar {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: var(--fs-small);
  font-weight: 700;
  flex-shrink: 0;
}
.memory-agent-name {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
}
.memory-list {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.memory-item {
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
  line-height: 1.5;
}
.memory-none {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  margin: 0;
}
</style>
