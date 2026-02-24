<template>
  <!-- Full-width drag region — clicks on buttons are excluded via no-drag -->
  <div
    class="titlebar flex items-center shrink-0 select-none"
    style="height:38px; background:#FFFFFF; border-bottom:1px solid #E5E5EA; -webkit-app-region:drag; padding:0 8px 0 14px;"
  >
    <!-- Sidebar toggle -->
    <button
      @click.stop="$emit('toggle-sidebar')"
      class="flex items-center justify-center rounded transition-colors mr-2"
      style="-webkit-app-region:no-drag; width:28px; height:28px; color:#6B7280; background:transparent; border:none; cursor:pointer; flex-shrink:0;"
      @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
      @mouseleave="e => e.currentTarget.style.background='transparent'"
      title="Toggle sidebar"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6"  x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>

    <!-- App name -->
    <span style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#1A1A1A; letter-spacing:0.02em;">
      SparkAI
    </span>

    <div style="flex:1;" />

    <!-- Window controls -->
    <div class="flex items-center" style="-webkit-app-region:no-drag; gap:2px;">
      <!-- Minimize -->
      <button
        @click.stop="minimize"
        class="flex items-center justify-center rounded transition-colors"
        style="width:32px; height:26px; background:transparent; border:none; color:#6B7280; cursor:pointer;"
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
        style="width:32px; height:26px; background:transparent; border:none; color:#6B7280; cursor:pointer;"
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
        style="width:32px; height:26px; background:transparent; border:none; color:#6B7280; cursor:pointer;"
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
import { ref, onMounted, onUnmounted } from 'vue'

defineEmits(['toggle-sidebar'])

const isMaximized = ref(false)

async function minimize() {
  await window.electronAPI?.windowMinimize()
}
async function toggleMaximize() {
  const maximized = await window.electronAPI?.windowMaximize()
  if (maximized !== undefined) isMaximized.value = maximized
}
async function close() {
  await window.electronAPI?.windowClose()
}

let unsubMaximized = null

onMounted(async () => {
  isMaximized.value = (await window.electronAPI?.windowIsMaximized()) ?? false
  unsubMaximized = window.electronAPI?.onWindowMaximized(v => { isMaximized.value = v })
})
onUnmounted(() => { unsubMaximized?.() })
</script>
