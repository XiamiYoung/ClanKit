<template>
  <!-- Full-width drag region — clicks on buttons are excluded via no-drag -->
  <div
    class="titlebar flex items-center shrink-0 select-none"
    style="height:2.375rem; background:#FFFFFF; border-bottom:1px solid #E5E5EA; -webkit-app-region:drag; padding:0 0.5rem 0 0.25rem;"
  >
    <!-- Left group: PanelLeft + minibar -->
    <div class="flex items-center gap-1" style="-webkit-app-region:no-drag; padding-left:0.5rem;">
      <!-- Sidebar toggle (PanelLeft icon) -->
      <button
        @click.stop="$emit('toggle-sidebar')"
        class="tb-btn"
        title="Toggle sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 3v18"/>
        </svg>
      </button>

      <!-- Minibar toggle -->
      <button
        @click.stop="toggleMinibar"
        class="tb-btn"
        :class="{ 'tb-btn-active': isMinibar }"
        title="Minibar mode"
      >
        <!-- Compress-to-bar icon: rectangle being squashed into a thin strip -->
        <!-- PanelTop: window with filled header bar = compact/minibar mode -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <rect x="3" y="3" width="18" height="7" rx="2" fill="currentColor" stroke="none"/>
        </svg>
      </button>
    </div>

    <div style="flex:1;" />

    <!-- Window controls -->
    <div class="flex items-center" style="-webkit-app-region:no-drag; gap:0.125rem;">
      <!-- Minimize -->
      <button
        @click.stop="minimize"
        class="flex items-center justify-center rounded transition-colors"
        style="width:2rem; height:1.625rem; background:transparent; border:none; color:#6B7280; cursor:pointer;"
        @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
        @mouseleave="e => e.currentTarget.style.background='transparent'"
        title="Minimize"
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="1" y="5.5" width="10" height="1.2" rx="0.6" fill="currentColor"/>
        </svg>
      </button>

      <!-- Maximize / Restore -->
      <button
        @click.stop="toggleMaximize"
        class="flex items-center justify-center rounded transition-colors"
        style="width:2rem; height:1.625rem; background:transparent; border:none; color:#6B7280; cursor:pointer;"
        @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
        @mouseleave="e => e.currentTarget.style.background='transparent'"
        :title="isMaximized ? 'Restore' : 'Maximize'"
      >
        <!-- Maximize icon -->
        <svg v-if="!isMaximized" width="11" height="11" viewBox="0 0 11 11">
          <rect x="0.5" y="0.5" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
        </svg>
        <!-- Restore icon -->
        <svg v-else width="11" height="11" viewBox="0 0 11 11">
          <rect x="2" y="0.5" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
          <rect x="0.5" y="2"   width="8.5" height="8.5" rx="1" fill="#FFFFFF" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>

      <!-- Close -->
      <button
        @click.stop="close"
        class="flex items-center justify-center rounded transition-colors"
        style="width:2rem; height:1.625rem; background:transparent; border:none; color:#6B7280; cursor:pointer;"
        @mouseenter="e => { e.currentTarget.style.background='#c0392b'; e.currentTarget.style.color='#ffffff'; }"
        @mouseleave="e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#6B7280'; }"
        title="Close"
      >
        <svg width="11" height="11" viewBox="0 0 11 11">
          <line x1="1" y1="1" x2="10" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <line x1="10" y1="1" x2="1"  y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useFocusModeStore } from '../../stores/focusMode'

defineEmits(['toggle-sidebar'])

const focusModeStore = useFocusModeStore()
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

const isMaximized = ref(false)

async function minimize() { await window.electronAPI?.windowMinimize() }
async function toggleMaximize() {
  const maximized = await window.electronAPI?.windowMaximize()
  if (maximized !== undefined) isMaximized.value = maximized
}
async function close() { await window.electronAPI?.windowClose() }

let unsubMaximized = null
onMounted(async () => {
  isMaximized.value = (await window.electronAPI?.windowIsMaximized()) ?? false
  unsubMaximized = window.electronAPI?.onWindowMaximized(v => { isMaximized.value = v })
})
onUnmounted(() => { unsubMaximized?.() })
</script>

<style scoped>
.tb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #6B7280;
  cursor: pointer;
  border-radius: 0.375rem;
  transition: background 0.15s, color 0.15s;
}
.tb-btn:hover {
  background: #F5F5F5;
  color: #1A1A1A;
}
.tb-btn-active {
  color: #007AFF;
}
.tb-btn-active:hover {
  background: rgba(0, 122, 255, 0.08);
  color: #007AFF;
}
</style>
