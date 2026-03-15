<template>
  <div class="attb-block">
    <div class="attb-header">
      <span class="attb-task-name">{{ taskName }}</span>
      <span :class="['attb-status', `attb-status-${taskStatus}`]">{{ capitalizeStatus(taskStatus) }}</span>
    </div>

    <div class="attb-results">
      <div v-for="result in stepResults" :key="result.agentId" class="attb-result">
        <div class="attb-result-header">
          <img v-if="getAgentAvatar(result.agentId)" :src="getAgentAvatar(result.agentId)" class="attb-avatar" />
          <div v-else class="attb-avatar-fallback">{{ getAgentInitials(result.agentId) }}</div>
          <span class="attb-agent-name">{{ result.agentName || 'Unknown' }}</span>
          <span :class="['attb-status-chip', `attb-status-chip-${result.status}`]">{{ capitalizeStatus(result.status) }}</span>
        </div>

        <div v-if="result.output" class="attb-output">
          <div class="prose-clankai" v-html="sanitizeHtml(result.output)"></div>
        </div>

        <div v-if="result.error" class="attb-error">
          {{ result.error }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps({
  taskName:     { type: String, required: true },
  taskStatus:   { type: String, default: 'pending' },
  stepResults:  { type: Array, default: () => [] },
  allAgents:    { type: Array, default: () => [] },
})

function capitalizeStatus(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getAgent(agentId) {
  return props.allAgents.find(a => a.id === agentId)
}

function getAgentAvatar(agentId) {
  const agent = getAgent(agentId)
  if (!agent?.avatar) return null
  try {
    const url = new URL(agent.avatar)
    return url.href
  } catch {
    return null
  }
}

function getAgentInitials(agentId) {
  const agent = getAgent(agentId)
  if (!agent?.name) return '?'
  return agent.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function sanitizeHtml(text) {
  if (!text) return ''
  try {
    const md = marked(text)
    return DOMPurify.sanitize(md)
  } catch {
    return DOMPurify.sanitize(text)
  }
}
</script>

<style scoped>
.attb-block {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1rem;
  margin-bottom: 1rem;
}

.attb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-light);
}

.attb-task-name {
  font-weight: 600;
  font-size: var(--fs-subtitle);
  color: var(--text-primary);
}

.attb-status {
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
  font-size: var(--fs-caption);
  font-weight: 600;
}

.attb-status-done {
  background: #D1FAE5;
  color: #065F46;
}

.attb-status-failed {
  background: #FEE2E2;
  color: #7F1D1D;
}

.attb-status-skipped {
  background: #F3F4F6;
  color: #4B5563;
}

.attb-results {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.attb-result {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.attb-result-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.attb-avatar {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.attb-avatar-fallback {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 600;
  flex-shrink: 0;
}

.attb-agent-name {
  font-weight: 500;
  color: var(--text-primary);
}

.attb-status-chip {
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  font-weight: 600;
  margin-left: auto;
}

.attb-status-chip-done {
  background: #D1FAE5;
  color: #065F46;
}

.attb-status-chip-failed {
  background: #FEE2E2;
  color: #7F1D1D;
}

.attb-status-chip-skipped {
  background: #F3F4F6;
  color: #4B5563;
}

.attb-output {
  background: var(--bg-main);
  border-radius: var(--radius-sm);
  padding: 0.75rem;
  font-size: var(--fs-secondary);
  line-height: 1.6;
  overflow-x: auto;
}

.attb-error {
  background: #FEE2E2;
  color: #7F1D1D;
  border-radius: var(--radius-sm);
  padding: 0.75rem;
  font-size: var(--fs-secondary);
  border-left: 3px solid #DC2626;
}

:deep(.prose-clankai) {
  color: var(--text-primary);
  line-height: 1.65;
}

:deep(.prose-clankai a) {
  color: var(--accent);
  text-decoration: underline;
}

:deep(.prose-clankai code) {
  background: var(--accent-light);
  color: var(--accent);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85em;
}

:deep(.prose-clankai pre) {
  background: #1C1C1E;
  color: #E5E5EA;
  padding: 0.75rem;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-size: 0.8rem;
  line-height: 1.5;
}

:deep(.prose-clankai pre code) {
  background: none;
  color: inherit;
  padding: 0;
  border-radius: 0;
}

:deep(.prose-clankai blockquote) {
  border-left: 3px solid var(--text-muted);
  padding-left: 0.75rem;
  color: var(--text-secondary);
  font-style: italic;
  margin: 0.5rem 0;
}
</style>
