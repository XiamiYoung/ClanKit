<template>
  <span
    class="auc-chip"
    :class="{ 'auc-chip--zero': agents.length === 0 }"
    :style="agents.length > 0 && gradient ? { background: gradient } : null"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
    {{ agents.length }}
  </span>

  <Teleport to="body">
    <div
      v-if="open && agents.length > 0"
      class="auc-popover"
      :style="{ top: pos.top + 'px', left: pos.left + 'px' }"
      @mouseenter="cancelHide"
      @mouseleave="onLeave"
    >
      <div class="auc-popover-header">{{ t('common.usedByAgents', '', { n: agents.length }) }}</div>
      <div v-for="a in agents" :key="a.id" class="auc-popover-row">
        <img
          v-if="resolveAvatar(a.avatar)"
          :src="resolveAvatar(a.avatar)"
          class="auc-popover-avatar"
          alt=""
        />
        <span v-else class="auc-popover-avatar auc-popover-avatar--fallback">{{ initialOf(a.name) }}</span>
        <span class="auc-popover-name">{{ a.name || a.id }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { getAvatarDataUri } from '../agents/agentAvatars'

const props = defineProps({
  agents: { type: Array, default: () => [] },
  gradient: { type: String, default: '' },
})

const { t } = useI18n()

const open = ref(false)
const pos = ref({ top: 0, left: 0 })
let hideTimer = null

function onEnter(e) {
  if (props.agents.length === 0) return
  cancelHide()
  const rect = e.currentTarget.getBoundingClientRect()
  // Show below by default; flip above if too close to viewport bottom
  const estimatedHeight = Math.min(280, 40 + props.agents.length * 36)
  const top = rect.bottom + estimatedHeight + 12 > window.innerHeight
    ? Math.max(8, rect.top - estimatedHeight - 6)
    : rect.bottom + 6
  let left = rect.left
  const popoverWidth = 220
  if (left + popoverWidth + 8 > window.innerWidth) left = Math.max(8, window.innerWidth - popoverWidth - 8)
  pos.value = { top, left }
  open.value = true
}
function onLeave() {
  hideTimer = setTimeout(() => { open.value = false }, 80)
}
function cancelHide() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
}

function resolveAvatar(id) {
  try { return getAvatarDataUri(id) } catch { return '' }
}
function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?'
}
</script>

<style scoped>
.auc-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
  white-space: nowrap;
  line-height: 1.4;
  color: #fff;
  cursor: default;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.auc-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}
.auc-chip--zero {
  background: #F3F4F6;
  color: #9CA3AF;
}
.auc-chip--zero:hover {
  transform: none;
  box-shadow: none;
}
.auc-popover {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #E5E5EA;
  border-radius: 0.625rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 0.5rem 0;
  min-width: 12rem;
  max-width: 18rem;
  max-height: 18rem;
  overflow-y: auto;
}
.auc-popover-header {
  font-size: var(--fs-caption);
  font-weight: 600;
  color: #6B7280;
  padding: 0.25rem 0.875rem 0.5rem;
  border-bottom: 1px solid #F2F2F7;
  margin-bottom: 0.25rem;
}
.auc-popover-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.875rem;
}
.auc-popover-row:hover {
  background: #F5F5F7;
}
.auc-popover-avatar {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}
.auc-popover-avatar--fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-weight: 600;
  font-size: 0.75rem;
}
.auc-popover-name {
  font-size: var(--fs-secondary);
  color: #1A1A1A;
  font-family: 'Inter', sans-serif;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
