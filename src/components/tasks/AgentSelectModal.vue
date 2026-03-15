<template>
  <Teleport to="body">
    <div v-if="visible" class="agent-select-backdrop">
      <div class="agent-select-modal" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="agent-select-header">
          <div class="agent-select-header-icon">
            <svg style="width:15px;height:15px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <span class="agent-select-title">Select Agent</span>
          <button class="agent-select-close" @click="$emit('close')">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- Search -->
        <div class="agent-select-search">
          <svg style="width:14px;height:14px;flex-shrink:0;color:#6B7280;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="Search agents..."
            class="agent-select-search-input"
          />
        </div>

        <!-- Body -->
        <div class="agent-select-body">
          <!-- Search results (flat) -->
          <template v-if="searchQuery.trim()">
            <button
              v-for="agent in filteredAgents"
              :key="agent.id"
              class="agent-select-item"
              :class="{ selected: isSelected(agent.id) }"
              @click="selectAgent(agent)"
              :title="agent.description || agent.name"
            >
              <div class="agent-select-item-avatar">
                <img
                  v-if="getAgentAvatar(agent)"
                  :src="getAgentAvatar(agent)"
                  alt=""
                  style="width:40px;height:40px;border-radius:50%;object-fit:cover;"
                />
                <span v-else class="agent-select-avatar-fallback">{{ agent.name.charAt(0) }}</span>
              </div>
              <div class="agent-select-item-text">
                <span class="agent-select-item-name">{{ agent.name }}</span>
                <span v-if="agent.description" class="agent-select-item-desc">{{ agent.description }}</span>
              </div>
              <svg v-if="isSelected(agent.id)" style="width:16px;height:16px;flex-shrink:0;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <div v-if="filteredAgents.length === 0" class="agent-select-empty">No agents match</div>
          </template>

          <!-- Category tree -->
          <template v-else>
            <div v-for="cat in categories" :key="cat.id" class="agent-select-cat-section">
              <button class="agent-select-cat-header" @click="toggleCategory(cat.id)">
                <svg class="agent-select-cat-chevron" :class="{ expanded: expandedCats.has(cat.id) }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span v-if="cat.emoji" class="agent-select-cat-emoji">{{ cat.emoji }}</span>
                <span class="agent-select-cat-name">{{ cat.name }}</span>
                <span class="agent-select-cat-count">{{ agentsInCategory(cat.id).length }}</span>
              </button>
              <div v-if="expandedCats.has(cat.id)" class="agent-select-cat-items">
                <button
                  v-for="agent in agentsInCategory(cat.id)"
                  :key="agent.id"
                  class="agent-select-item"
                  :class="{ selected: isSelected(agent.id) }"
                  @click="selectAgent(agent)"
                  :title="agent.description || agent.name"
                >
                  <div class="agent-select-item-avatar">
                    <img
                      v-if="getAgentAvatar(agent)"
                      :src="getAgentAvatar(agent)"
                      alt=""
                      style="width:40px;height:40px;border-radius:50%;object-fit:cover;"
                    />
                    <span v-else class="agent-select-avatar-fallback">{{ agent.name.charAt(0) }}</span>
                  </div>
                  <div class="agent-select-item-text">
                    <span class="agent-select-item-name">{{ agent.name }}</span>
                    <span v-if="agent.description" class="agent-select-item-desc">{{ agent.description }}</span>
                  </div>
                  <svg v-if="isSelected(agent.id)" style="width:16px;height:16px;flex-shrink:0;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
                <div v-if="agentsInCategory(cat.id).length === 0" class="agent-select-cat-empty">No agents</div>
              </div>
            </div>

            <!-- All section -->
            <div class="agent-select-cat-section">
              <button class="agent-select-cat-header" @click="toggleCategory('__all__')">
                <svg class="agent-select-cat-chevron" :class="{ expanded: expandedCats.has('__all__') }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span class="agent-select-cat-name">All</span>
                <span class="agent-select-cat-count">{{ allAgents.length }}</span>
              </button>
              <div v-if="expandedCats.has('__all__')" class="agent-select-cat-items">
                <button
                  v-for="agent in allAgents"
                  :key="agent.id"
                  class="agent-select-item"
                  :class="{ selected: isSelected(agent.id) }"
                  @click="selectAgent(agent)"
                  :title="agent.description || agent.name"
                >
                  <div class="agent-select-item-avatar">
                    <img
                      v-if="getAgentAvatar(agent)"
                      :src="getAgentAvatar(agent)"
                      alt=""
                      style="width:40px;height:40px;border-radius:50%;object-fit:cover;"
                    />
                    <span v-else class="agent-select-avatar-fallback">{{ agent.name.charAt(0) }}</span>
                  </div>
                  <div class="agent-select-item-text">
                    <span class="agent-select-item-name">{{ agent.name }}</span>
                    <span v-if="agent.description" class="agent-select-item-desc">{{ agent.description }}</span>
                  </div>
                  <svg v-if="isSelected(agent.id)" style="width:16px;height:16px;flex-shrink:0;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import { getAvatarDataUri } from '../agents/agentAvatars'

const props = defineProps({
  visible: { type: Boolean, default: false },
  selectedAgentIds: { type: Array, default: () => [] },
  excludeAgentIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'select'])

const agentsStore = useAgentsStore()
const searchInputRef = ref(null)
const searchQuery = ref('')
const expandedCats = ref(new Set())

const allAgents = computed(() => {
  return agentsStore.agents
    .filter(a => !props.excludeAgentIds.includes(a.id))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const categories = computed(() => agentsStore.systemCategories)

const filteredAgents = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return allAgents.value.filter(a =>
    a.name.toLowerCase().includes(q) ||
    (a.description && a.description.toLowerCase().includes(q))
  )
})

function agentsInCategory(catId) {
  return agentsStore.agentsInCategory(catId)
    .filter(a => !props.excludeAgentIds.includes(a.id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function isSelected(agentId) {
  return props.selectedAgentIds.includes(agentId)
}

function selectAgent(agent) {
  emit('select', agent.id)
}

function toggleCategory(catId) {
  if (expandedCats.value.has(catId)) {
    expandedCats.value.delete(catId)
  } else {
    expandedCats.value.add(catId)
  }
}

function getAgentAvatar(agent) {
  return agent?.avatar ? getAvatarDataUri(agent.avatar) : null
}

watch(() => props.visible, (v) => {
  if (v) {
    searchQuery.value = ''
    expandedCats.value = new Set()
    setTimeout(() => searchInputRef.value?.focus(), 50)
  }
})
</script>

<style scoped>
/* Scoped styles for agent select modal contents */
</style>

<style>
/* Unscoped styles for the Teleported modal (escapes component DOM) */
.agent-select-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}

.agent-select-modal {
  background: #0F0F0F; border: 1px solid #2A2A2A; border-radius: 1rem;
  width: 90vw; height: 70vh; max-width: 500px;
  display: flex; flex-direction: column;
  box-shadow: 0 25px 60px rgba(0,0,0,0.3);
  animation: agentSelectModalIn 0.18s ease-out;
  overflow: hidden;
}

@keyframes agentSelectModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.agent-select-header {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 1rem 1.5rem; border-bottom: 1px solid #1E1E1E; flex-shrink: 0;
}

.agent-select-header-icon {
  width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.5rem; border: 1px solid #2A2A2A; flex-shrink: 0;
}

.agent-select-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 700;
  color: #FFFFFF; flex: 1;
}

.agent-select-close {
  width: 1.75rem; height: 1.75rem; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.375rem; color: rgba(255,255,255,0.5); cursor: pointer;
  transition: all 0.15s ease; flex-shrink: 0;
}

.agent-select-close:hover { background: rgba(255,255,255,0.12); color: #FFFFFF; }

/* Search bar */
.agent-select-search {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.625rem 1rem; border-bottom: 1px solid #1A1A1A; flex-shrink: 0;
}

.agent-select-search-input {
  flex: 1; background: transparent; border: none; color: #FFFFFF;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  outline: none; caret-color: #007AFF;
}

.agent-select-search-input::placeholder { color: #6B7280; }

/* Body */
.agent-select-body {
  flex: 1; overflow-y: auto; padding: 0;
  scrollbar-width: thin; scrollbar-color: #2A2A2A transparent;
}

/* Category section */
.agent-select-cat-section { border-bottom: 1px solid #1A1A1A; }

.agent-select-cat-header {
  display: flex; align-items: center; gap: 0.5rem;
  width: 100%; padding: 0.75rem 1rem; background: transparent; border: none;
  cursor: pointer; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #9CA3AF; font-weight: 600; text-align: left;
  transition: background 0.15s ease;
}

.agent-select-cat-header:hover { background: #1A1A1A; }

.agent-select-cat-chevron {
  color: #6B7280; transition: transform 0.15s ease; flex-shrink: 0;
}

.agent-select-cat-chevron.expanded { transform: rotate(90deg); }

.agent-select-cat-emoji { font-size: 1rem; flex-shrink: 0; }

.agent-select-cat-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.agent-select-cat-count {
  font-size: var(--fs-caption); color: #6B7280; flex-shrink: 0;
}

.agent-select-cat-items { border-top: 1px solid #1A1A1A; }

.agent-select-cat-empty {
  padding: 0.75rem 1rem; font-size: var(--fs-body); color: #6B7280; text-align: center;
}

/* Item (agent) */
.agent-select-item {
  display: flex; align-items: center; gap: 0.75rem;
  width: 100%; padding: 0.75rem 1rem; background: transparent; border: none;
  cursor: pointer; text-align: left; transition: background 0.15s ease;
  border-bottom: 1px solid #0F0F0F;
}

.agent-select-item:hover { background: #1A1A1A; }

.agent-select-item.selected { background: linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 40%, #4B5563 100%); }

.agent-select-item-avatar {
  width: 2.5rem; height: 2.5rem; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden; background: #1A1A1A;
}

.agent-select-avatar-fallback {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 700;
  color: #FFFFFF; text-transform: uppercase;
}

.agent-select-item-text {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.25rem;
}

.agent-select-item-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: #FFFFFF;
}

.agent-select-item-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: #9CA3AF;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.agent-select-empty {
  padding: 2rem 1rem; text-align: center;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: #6B7280;
}
</style>
