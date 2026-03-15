<template>
  <div
    class="titlebar flex items-center shrink-0 select-none"
    style="height:2.375rem; background:#FFFFFF; border-bottom:1px solid #E5E5EA; padding:0 0.5rem 0 0.25rem; position:relative;"
    @mousedown.left="onDragStart"
    @dblclick="toggleMaximize"
  >
    <!-- Left group -->
    <div class="flex items-center gap-1" style="padding-left:0.5rem;" @mousedown.stop @dblclick.stop>
      <button @click.stop="$emit('toggle-sidebar')" class="tb-btn" :title="t('titlebar.toggleSidebar')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
        </svg>
      </button>
      <button @click.stop="toggleMinibar" class="tb-btn" :class="{ 'tb-btn-active': isMinibar }" :title="t('titlebar.minibarMode')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <rect x="3" y="3" width="18" height="7" rx="2" fill="currentColor" stroke="none"/>
        </svg>
      </button>
    </div>

    <div style="flex:1;" />

    <!-- Center minibar strip — 30% of titlebar width, absolutely centered -->
    <div class="tb-minibar" @mousedown.stop @dblclick.stop>
      <MinibarContent />
    </div>

    <!-- Window controls -->
    <div class="flex items-center" style="gap:0.125rem;" @mousedown.stop @dblclick.stop>
      <button @click.stop="minimize" @dblclick.stop class="flex items-center justify-center rounded transition-colors"
        style="width:2rem;height:1.625rem;background:transparent;border:none;color:#6B7280;cursor:pointer;"
        @mouseenter="e=>e.currentTarget.style.background='#F5F5F5'"
        @mouseleave="e=>e.currentTarget.style.background='transparent'" :title="t('titlebar.minimize')">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1.2" rx="0.6" fill="currentColor"/></svg>
      </button>
      <button @click.stop="toggleMaximize" @dblclick.stop class="flex items-center justify-center rounded transition-colors"
        style="width:2rem;height:1.625rem;background:transparent;border:none;color:#6B7280;cursor:pointer;"
        @mouseenter="e=>e.currentTarget.style.background='#F5F5F5'"
        @mouseleave="e=>e.currentTarget.style.background='transparent'"
        :title="isMaximized ? t('titlebar.restore') : t('titlebar.maximize')">
        <svg v-if="!isMaximized" width="11" height="11" viewBox="0 0 11 11">
          <rect x="0.5" y="0.5" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
        </svg>
        <svg v-else width="11" height="11" viewBox="0 0 11 11">
          <rect x="2" y="0.5" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
          <rect x="0.5" y="2" width="8.5" height="8.5" rx="1" fill="#FFFFFF" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>
      <button @click.stop="close" @dblclick.stop class="flex items-center justify-center rounded transition-colors"
        style="width:2rem;height:1.625rem;background:transparent;border:none;color:#6B7280;cursor:pointer;"
        @mouseenter="e=>{e.currentTarget.style.background='#c0392b';e.currentTarget.style.color='#ffffff';}"
        @mouseleave="e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#6B7280';}"
        :title="t('titlebar.close')">
        <svg width="11" height="11" viewBox="0 0 11 11">
          <line x1="1" y1="1" x2="10" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <line x1="10" y1="1" x2="1" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useFocusModeStore } from '../../stores/focusMode'
import { useTasksStore } from '../../stores/tasks'
import { useI18n } from '../../i18n/useI18n'
import MinibarContent from '../focus/MinibarContent.vue'

defineEmits(['toggle-sidebar'])

const focusModeStore = useFocusModeStore()
const tasksStore = useTasksStore()
const { t } = useI18n()

const isMinibar = computed(() => focusModeStore.isMinibarMode)

function toggleMinibar() {
  if (focusModeStore.isMinibarMode) {
    focusModeStore.exitMinibar()
    window.electronAPI?.window?.setMinibar(false)
  } else {
    focusModeStore.enterMinibar()
    window.electronAPI?.window?.setMinibar(true)
  }
}

// ── Window controls ────────────────────────────────────────────────────────
const isMaximized = ref(false)
async function minimize() { await window.electronAPI?.windowMinimize() }
async function toggleMaximize() {
  const maximized = await window.electronAPI?.windowMaximize()
  if (maximized !== undefined) isMaximized.value = maximized
}
async function close() { await window.electronAPI?.windowClose() }

// ── Custom window drag ─────────────────────────────────────────────────────
let isDragging = false, dragOffsetX = 0, dragOffsetY = 0

async function onDragStart(e) {
  if (isMaximized.value) return
  const pos = await window.electronAPI?.windowGetPosition()
  if (!pos) return
  isDragging = true
  dragOffsetX = e.screenX - pos[0]
  dragOffsetY = e.screenY - pos[1]
  window.electronAPI?.windowDragStart()
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e) { if (!isDragging) return; window.electronAPI?.windowMoveTo(e.screenX - dragOffsetX, e.screenY - dragOffsetY) }
function onDragEnd() {
  isDragging = false
  window.electronAPI?.windowDragEnd()
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

let unsubMaximized = null
onMounted(async () => {
  isMaximized.value = (await window.electronAPI?.windowIsMaximized()) ?? false
  unsubMaximized = window.electronAPI?.onWindowMaximized(v => { isMaximized.value = v })
  tasksStore.subscribeToScheduledRuns()
})
onUnmounted(() => {
  unsubMaximized?.()
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})
</script>

<style scoped>
.tb-btn {
  display:flex; align-items:center; justify-content:center;
  width:2rem; height:2rem; flex-shrink:0;
  border:none; background:transparent; color:#6B7280;
  cursor:pointer; border-radius:0.375rem;
  transition:background 0.15s,color 0.15s;
}
.tb-btn:hover { background:#F5F5F5; color:#1A1A1A; }
.tb-btn-active { color:#007AFF; }
.tb-btn-active:hover { background:rgba(0,122,255,0.08); color:#007AFF; }

.tb-minibar {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 20%;
  height: 1.75rem;
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #2D2D2D 100%);
  border-radius: 0.5rem;
  padding: 0 0.5rem;
  overflow: hidden;
  pointer-events: auto;
}
</style>
