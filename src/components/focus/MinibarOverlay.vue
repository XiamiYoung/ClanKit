<template>
  <Teleport to="body">
    <div v-if="focusModeStore.isMinibarMode" class="minibar-bar minibar-bar--enter" ref="barEl" @mousedown="onBarDragStart">
      <!-- Logo -->
      <img :src="appIconUrl" class="minibar-icon" alt="ClankAI" draggable="false" @dragstart.prevent />
      <div class="minibar-sep" />

      <!-- Shared content (count, plan, ticker, compose) -->
      <MinibarContent />

      <!-- Exit -->
      <button class="minibar-exit" @click.stop="exit" :title="t('titlebar.exitMinibar')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <!-- Right-edge resize handle -->
      <div class="minibar-right-handle" @pointerdown.stop.prevent="startResize" />
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onUnmounted } from 'vue'
import appIconUrl from '@/assets/icon.png'
import { useFocusModeStore } from '../../stores/focusMode'
import { useI18n } from '../../i18n/useI18n'
import MinibarContent from './MinibarContent.vue'

const focusModeStore = useFocusModeStore()
const { t } = useI18n()
const barEl = ref(null)
const MIN_BAR_W = 200
let WINDOW_H = 48
const INSET = 4

watch(() => focusModeStore.isMinibarMode, async (val) => {
  document.body.classList.toggle('minibar-mode', val)
  if (val) {
    await nextTick()
    const rect = barEl.value?.getBoundingClientRect()
    const barH = rect?.height ?? 40
    WINDOW_H = barH + INSET * 2
    const defaultW = Math.round(window.innerWidth / 3)
    window.electronAPI?.window?.setMinibar({ enable: true, width: defaultW, height: WINDOW_H })
  }
}, { immediate: true })

// ── Right-edge resize ──────────────────────────────────────────────────────
let _resizeStart = null
let _latestScreenX = 0
let _resizeRafPending = false

function startResize(e) {
  const el = e.currentTarget
  el.setPointerCapture(e.pointerId)
  const currentW = barEl.value?.getBoundingClientRect().width
  _resizeStart = { el, screenX: e.screenX, barW: currentW ?? Math.round(window.innerWidth / 3) }
  _latestScreenX = e.screenX
  el.addEventListener('pointermove', onResizeMove)
  el.addEventListener('pointerup', onResizeEnd)
  el.addEventListener('pointercancel', onResizeEnd)
}

function onResizeMove(e) {
  if (!_resizeStart) return
  _latestScreenX = e.screenX
  if (!_resizeRafPending) {
    _resizeRafPending = true
    requestAnimationFrame(() => {
      _resizeRafPending = false
      if (!_resizeStart) return
      const newW = Math.max(MIN_BAR_W, Math.round(_resizeStart.barW + (_latestScreenX - _resizeStart.screenX)))
      window.electronAPI?.window?.setMinibar({ enable: true, width: newW, height: WINDOW_H })
    })
  }
}

function onResizeEnd() {
  const el = _resizeStart?.el
  if (el) {
    el.removeEventListener('pointermove', onResizeMove)
    el.removeEventListener('pointerup', onResizeEnd)
    el.removeEventListener('pointercancel', onResizeEnd)
  }
  _resizeStart = null
  window.electronAPI?.window?.saveMinibarBounds()
}

// ── Bar drag ───────────────────────────────────────────────────────────────
let _drag = null
let _latestDragX = 0, _latestDragY = 0
let _dragRafPending = false
let _lastSentX = null, _lastSentY = null

function onBarDragStart(e) {
  if (e.button !== 0) return
  if (e.target.closest('.minibar-right-handle')) return
  if (e.target.closest('.mbc-compose-wrap')) return
  _drag = { startWinX: window.screenX, startWinY: window.screenY, startMouseX: e.screenX, startMouseY: e.screenY }
  _latestDragX = e.screenX; _latestDragY = e.screenY
  _lastSentX = null; _lastSentY = null
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e) {
  if (!_drag) return
  _latestDragX = e.screenX; _latestDragY = e.screenY
  if (!_dragRafPending) {
    _dragRafPending = true
    requestAnimationFrame(() => {
      _dragRafPending = false
      if (!_drag) return
      const x = Math.round(_drag.startWinX + (_latestDragX - _drag.startMouseX))
      const y = Math.round(_drag.startWinY + (_latestDragY - _drag.startMouseY))
      if (x === _lastSentX && y === _lastSentY) return
      _lastSentX = x; _lastSentY = y
      window.electronAPI?.window?.setPosition(x, y)
    })
  }
}

function onDragEnd() {
  _drag = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

onUnmounted(() => {
  document.body.classList.remove('minibar-mode')
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  if (_resizeStart?.el) {
    _resizeStart.el.removeEventListener('pointermove', onResizeMove)
    _resizeStart.el.removeEventListener('pointerup', onResizeEnd)
    _resizeStart.el.removeEventListener('pointercancel', onResizeEnd)
  }
  _resizeStart = null
})

function exit() {
  focusModeStore.exitMinibar()
  window.electronAPI?.window?.setMinibar({ enable: false })
}
</script>

<style>
body.minibar-mode,
body.minibar-mode #app {
  height: 3rem !important;
  overflow: hidden !important;
  background: transparent !important;
}

.minibar-bar {
  position: fixed;
  top: 4px; left: 4px; right: 4px;
  height: calc(3rem - 8px);
  z-index: 9999;
  pointer-events: auto;
  display: flex;
  align-items: center;
  padding: 0 0.625rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #2D2D2D 100%);
  border-radius: 0.875rem;
  cursor: grab;
  user-select: none;
}
.minibar-bar:active { cursor: grabbing; }

@keyframes minibar-enter-shake {
  0%   { transform: translateX(0); }
  15%  { transform: translateX(-6px); }
  30%  { transform: translateX(6px); }
  45%  { transform: translateX(-5px); }
  60%  { transform: translateX(5px); }
  75%  { transform: translateX(-3px); }
  90%  { transform: translateX(3px); }
  100% { transform: translateX(0); }
}
.minibar-bar--enter { animation: minibar-enter-shake 0.5s ease-out; }

.minibar-icon {
  width: 1.375rem; height: 1.375rem;
  border-radius: 0.3125rem; flex-shrink: 0;
}

.minibar-sep {
  width: 1px; height: 1.25rem;
  background: rgba(255,255,255,0.1);
  margin: 0 0.5rem; flex-shrink: 0;
}

.minibar-exit {
  display:flex; align-items:center; justify-content:center;
  width:1.5rem; height:1.5rem; border:none; background:transparent;
  color:rgba(255,255,255,0.3); cursor:pointer; border-radius:0.3125rem;
  transition:background 0.15s ease,color 0.15s ease; flex-shrink:0;
}
.minibar-exit:hover { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.8); }

.minibar-right-handle {
  position:absolute; right:0; top:0; bottom:0; width:0.5rem;
  cursor:ew-resize; border-radius:0 0.875rem 0.875rem 0;
  transition:background 0.15s ease;
}
.minibar-right-handle:hover { background:rgba(255,255,255,0.08); }
</style>
