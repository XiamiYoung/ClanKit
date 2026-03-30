<template>
  <div
    ref="barEl"
    class="focus-bar"
    :style="barStyle"
    @mousedown="onBarMousedown"
  >
    <!-- App icon -->
    <img :src="appIconUrl" alt="" class="focus-bar-icon" />

    <div class="focus-bar-sep" />

    <!-- Chat toggle -->
    <button
      class="focus-bar-btn"
      :class="{ 'panel-on': focusStore.showChat, 'panel-off': !focusStore.showChat }"
      @click="onClickChat"
      :title="focusStore.showChat ? t('focusMode.hideChat') : t('focusMode.showChat')"
    >
      <svg v-if="focusStore.showChat" style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg v-else style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <line x1="3" y1="3" x2="21" y2="21"/>
      </svg>
    </button>

    <!-- Docs toggle -->
    <button
      class="focus-bar-btn"
      :class="{ 'panel-on': focusStore.showDocs, 'panel-off': !focusStore.showDocs }"
      @click="onClickDocs"
      :title="focusStore.showDocs ? t('focusMode.hideDocs') : t('focusMode.showDocs')"
    >
      <svg v-if="focusStore.showDocs" style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
      <svg v-else style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        <line x1="3" y1="3" x2="21" y2="21"/>
      </svg>
    </button>

    <div class="focus-bar-sep" />

    <!-- Exit -->
    <button
      class="focus-bar-exit"
      @click="onClickExit"
      :title="t('focusMode.exitFocusMode')"
    >
      <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import appIconUrl from '@/assets/icon.png'
import { useFocusModeStore } from '../../stores/focusMode'
import { useI18n } from '../../i18n/useI18n'

const focusStore = useFocusModeStore()
const { t } = useI18n()

const barEl = ref(null)

const pos = ref(null)
const dragging = ref(false)
const didDrag = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const mousedownPos = ref({ x: 0, y: 0 })

const DRAG_THRESHOLD = 4

const barStyle = computed(() => {
  if (!pos.value) {
    return { top: '2rem', left: '0.75rem' }
  }
  return { left: pos.value.left + 'px', top: pos.value.top + 'px', transform: 'none' }
})

function onBarMousedown(e) {
  if (e.button !== 0) return
  didDrag.value = false
  dragging.value = true
  mousedownPos.value = { x: e.clientX, y: e.clientY }
  const rect = barEl.value.getBoundingClientRect()
  dragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  document.addEventListener('mousemove', onMousemove)
  document.addEventListener('mouseup', onMouseup)
}

function onMousemove(e) {
  if (!dragging.value) return
  const dx = e.clientX - mousedownPos.value.x
  const dy = e.clientY - mousedownPos.value.y
  if (!didDrag.value && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    didDrag.value = true
  }
  if (!didDrag.value) return
  const rect = barEl.value.getBoundingClientRect()
  pos.value = {
    left: Math.max(0, Math.min(window.innerWidth  - rect.width,  e.clientX - dragOffset.value.x)),
    top:  Math.max(0, Math.min(window.innerHeight - rect.height, e.clientY - dragOffset.value.y)),
  }
}

function onMouseup() {
  dragging.value = false
  document.removeEventListener('mousemove', onMousemove)
  document.removeEventListener('mouseup', onMouseup)
}

function onClickChat() {
  if (didDrag.value) return
  focusStore.toggleChat()
}
function onClickDocs() {
  if (didDrag.value) return
  focusStore.toggleDocs()
}
function onClickExit() {
  if (didDrag.value) return
  focusStore.exit()
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMousemove)
  document.removeEventListener('mouseup', onMouseup)
})
</script>

<style>
.focus-bar {
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.3125rem 0.5rem;
  border-radius: 0.625rem;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2);
  cursor: grab;
  user-select: none;
  animation: focusBarEnter 0.4s ease-out;
}
.focus-bar:active { cursor: grabbing; }

.focus-bar-icon {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.25rem;
  object-fit: contain;
  flex-shrink: 0;
  margin-right: 0.125rem;
  pointer-events: none;
}

.focus-bar-sep {
  width: 1px;
  height: 1rem;
  background: #2A2A2A;
  margin: 0 0.25rem;
  flex-shrink: 0;
  pointer-events: none;
}

.focus-bar-btn,
.focus-bar-exit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  cursor: inherit;
  transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
  flex-shrink: 0;
}

.focus-bar-btn.panel-on {
  color: #E5E7EB;
  opacity: 1;
}
.focus-bar-btn.panel-on:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}

.focus-bar-btn.panel-off {
  color: #4B5563;
  opacity: 0.7;
}
.focus-bar-btn.panel-off:hover {
  background: rgba(255,255,255,0.06);
  color: #9CA3AF;
  opacity: 1;
}

.focus-bar-exit {
  color: #6B7280;
}
.focus-bar-exit:hover {
  background: rgba(220,38,38,0.18);
  color: #EF4444;
}

@keyframes focusBarEnter {
  0%   { opacity: 0; transform: translateY(-4px); }
  20%  { opacity: 1; transform: translateX(-6px); }
  40%  { transform: translateX(5px); }
  60%  { transform: translateX(-4px); }
  80%  { transform: translateX(3px); }
  100% { transform: translateX(0); }
}
</style>
