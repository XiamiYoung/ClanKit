<template>
  <Teleport to="body">
    <div class="plaza-modal-backdrop">
      <div class="plaza-modal" style="max-width:36rem;">
        <div class="plaza-modal-header">
          <div class="plaza-modal-icon">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div style="flex:1;">
            <h2 class="plaza-modal-title">Setup Discussion</h2>
            <p style="font-size:var(--fs-caption);color:rgba(255,255,255,0.4);margin:0.125rem 0 0;">{{ topicTitle }}</p>
          </div>
          <button class="plaza-modal-close" @click="$emit('close')">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="plaza-modal-body">
          <label class="plaza-label">Select Agents (min. 2)</label>
          <div class="agent-list">
            <label
              v-for="agent in agents"
              :key="agent.id"
              class="agent-row"
              :class="{ selected: selectedIds.has(agent.id) }"
            >
              <input type="checkbox" :checked="selectedIds.has(agent.id)" @change="toggleAgent(agent.id)" />
              <div class="agent-row-avatar" :style="{ background: 'linear-gradient(135deg, #0F0F0F 0%, #374151 100%)' }">
                {{ (agent.name || '?')[0].toUpperCase() }}
              </div>
              <span class="agent-row-name">{{ agent.name }}</span>
              <div v-if="selectedIds.has(agent.id)" class="agent-row-tools">
                <label class="tool-toggle" @click.stop>
                  <input type="checkbox" :checked="toolPermissions[agent.id]" @change="toolPermissions[agent.id] = $event.target.checked" />
                  <span class="tool-toggle-label">Tools</span>
                </label>
              </div>
            </label>
          </div>

          <div class="rounds-row">
            <label class="plaza-label">Max Rounds</label>
            <div class="rounds-control">
              <input type="range" v-model.number="maxRounds" min="1" max="20" class="plaza-range" />
              <span class="rounds-value">{{ maxRounds }}</span>
            </div>
          </div>
        </div>

        <div class="plaza-modal-footer">
          <AppButton variant="secondary" @click="$emit('close')">Cancel</AppButton>
          <AppButton @click="start" :disabled="selectedIds.size < 2" size="modal">
            Start Discussion
          </AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import AppButton from '../common/AppButton.vue'

const props = defineProps({
  topicTitle: { type: String, default: '' },
  prefillAgentIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'start'])

const agentsStore = useAgentsStore()
const agents = computed(() =>
  (agentsStore.agents || []).filter(a => a.type === 'system')
)
const selectedIds = ref(new Set())
const toolPermissions = reactive({})
const maxRounds = ref(5)

onMounted(async () => {
  await agentsStore.loadAgents()
  if (props.prefillAgentIds.length > 0) {
    props.prefillAgentIds.forEach(id => selectedIds.value.add(id))
  }
})

function toggleAgent(id) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
    delete toolPermissions[id]
  } else {
    selectedIds.value.add(id)
    toolPermissions[id] = false
  }
  // Force reactivity
  selectedIds.value = new Set(selectedIds.value)
}

function start() {
  if (selectedIds.value.size < 2) return
  const agentIds = [...selectedIds.value]
  const agentToolPermissions = {}
  for (const id of agentIds) {
    agentToolPermissions[id] = !!toolPermissions[id]
  }
  emit('start', { agentIds, agentToolPermissions, maxRounds: maxRounds.value })
}
</script>

<style>
.agent-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 18rem;
  overflow-y: auto;
  scrollbar-width: thin;
}
.agent-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s ease;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
}
.agent-row:hover { background: #222; }
.agent-row.selected { border-color: #4B5563; }
.agent-row input[type="checkbox"] {
  accent-color: #374151;
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}
.agent-row-avatar {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: var(--fs-caption);
  font-weight: 700;
  flex-shrink: 0;
}
.agent-row-name {
  font-size: var(--fs-body);
  color: #FFFFFF;
  font-weight: 500;
  flex: 1;
}
.agent-row-tools {
  margin-left: auto;
}
.tool-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
}
.tool-toggle input[type="checkbox"] {
  accent-color: #374151;
  width: 0.875rem;
  height: 0.875rem;
}
.tool-toggle-label {
  font-size: var(--fs-caption);
  color: rgba(255,255,255,0.5);
}
.rounds-row {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.rounds-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.plaza-range {
  flex: 1;
  accent-color: #374151;
}
.rounds-value {
  font-size: var(--fs-body);
  font-weight: 700;
  color: #FFFFFF;
  min-width: 1.5rem;
  text-align: center;
}
</style>
