<template>
  <div
    class="titlebar flex items-center shrink-0 select-none"
    style="height:2.375rem; background:#FFFFFF; border-bottom:1px solid #E5E5EA; padding:0 0.5rem 0 0.25rem; position:relative;"
    @mousedown.left="onDragStart"
    @dblclick="toggleMaximize"
  >
    <!-- Left group -->
    <div class="flex items-center gap-1" style="padding-left:0.5rem;" @mousedown.stop @dblclick.stop>
      <button
        @click.stop="$emit('toggle-sidebar')"
        class="tb-btn"
        v-tooltip="t('titlebar.toggleSidebar')"
        @mouseenter="onSidebarBtnHover"
        @mouseleave="onSidebarBtnLeave"
      >
        <svg :class="['tb-btn-glyph', sidebarBtnAnimClass]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
        </svg>
      </button>
      <button
        @click.stop="toggleMinibar"
        class="tb-btn"
        :class="{ 'tb-btn-active': isMinibar }"
        v-tooltip="t('titlebar.minibarMode')"
        @mouseenter="onMinibarBtnHover"
        @mouseleave="onMinibarBtnLeave"
      >
        <svg :class="['tb-btn-glyph', minibarBtnAnimClass]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <rect x="3" y="3" width="18" height="7" rx="2" fill="currentColor" stroke="none"/>
        </svg>
      </button>
      <div id="titlebar-focus-slot" class="tb-focus-slot"></div>
    </div>

    <div style="flex:1;" />

    <!-- Center minibar strip — horizontally draggable within the titlebar -->
    <div
      ref="minibarStripRef"
      class="tb-minibar"
      :style="minibarStripStyle"
      @mousedown="onMinibarStripMouseDown"
      @dblclick.stop
    >
      <MinibarContent />
    </div>

    <!-- Window controls -->
    <div class="flex items-center" style="gap:0.125rem;" @mousedown.stop @dblclick.stop>
      <div id="titlebar-help-slot" class="tb-focus-slot"></div>
      <button @click.stop="minimize" @dblclick.stop class="flex items-center justify-center rounded transition-colors"
        style="width:2rem;height:1.625rem;background:transparent;border:none;color:#6B7280;cursor:pointer;"
        @mouseenter="e=>e.currentTarget.style.background='#F5F5F5'"
        @mouseleave="e=>e.currentTarget.style.background='transparent'" v-tooltip="t('titlebar.minimize')">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1.2" rx="0.6" fill="currentColor"/></svg>
      </button>
      <button @click.stop="toggleMaximize" @dblclick.stop class="flex items-center justify-center rounded transition-colors"
        style="width:2rem;height:1.625rem;background:transparent;border:none;color:#6B7280;cursor:pointer;"
        @mouseenter="e=>e.currentTarget.style.background='#F5F5F5'"
        @mouseleave="e=>e.currentTarget.style.background='transparent'"
        v-tooltip="isMaximized ? t('titlebar.restore') : t('titlebar.maximize')">
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
        v-tooltip="t('titlebar.close')">
        <svg width="11" height="11" viewBox="0 0 11 11">
          <line x1="1" y1="1" x2="10" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <line x1="10" y1="1" x2="1" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useFocusModeStore } from '../../stores/focusMode'
import { useTasksStore } from '../../stores/tasks'
import { useConfigStore } from '../../stores/config'
import { useI18n } from '../../i18n/useI18n'
import MinibarContent from '../focus/MinibarContent.vue'

defineEmits(['toggle-sidebar'])

const focusModeStore = useFocusModeStore()
const tasksStore = useTasksStore()
const configStore = useConfigStore()
const { t } = useI18n()

const isMinibar = computed(() => focusModeStore.isMinibarMode)

const TITLE_BTN_HOVER_ANIMS = [
  'tb-anim-wiggle',
  'tb-anim-bounce',
  'tb-anim-tilt',
  'tb-anim-pop',
  'tb-anim-jello',
]

const sidebarBtnAnimClass = ref('')
const minibarBtnAnimClass = ref('')
let sidebarBtnAnimTimer = null
let minibarBtnAnimTimer = null

function pickTitleBtnAnim() {
  return TITLE_BTN_HOVER_ANIMS[Math.floor(Math.random() * TITLE_BTN_HOVER_ANIMS.length)]
}

function onSidebarBtnHover() {
  clearTimeout(sidebarBtnAnimTimer)
  sidebarBtnAnimClass.value = pickTitleBtnAnim()
  sidebarBtnAnimTimer = setTimeout(() => { sidebarBtnAnimClass.value = '' }, 700)
  window.dispatchEvent(new CustomEvent('titlebar:logo-hint-enter', {
    detail: { text: t('titlebar.toggleSidebar') }
  }))
}

function onSidebarBtnLeave() {
  clearTimeout(sidebarBtnAnimTimer)
  sidebarBtnAnimTimer = setTimeout(() => { sidebarBtnAnimClass.value = '' }, 120)
  window.dispatchEvent(new CustomEvent('titlebar:logo-hint-leave'))
}

function onMinibarBtnHover() {
  clearTimeout(minibarBtnAnimTimer)
  minibarBtnAnimClass.value = pickTitleBtnAnim()
  minibarBtnAnimTimer = setTimeout(() => { minibarBtnAnimClass.value = '' }, 700)
  window.dispatchEvent(new CustomEvent('titlebar:logo-hint-enter', {
    detail: {
      text: focusModeStore.isMinibarMode ? t('titlebar.exitMinibar') : t('titlebar.minibarMode')
    }
  }))
}

function onMinibarBtnLeave() {
  clearTimeout(minibarBtnAnimTimer)
  minibarBtnAnimTimer = setTimeout(() => { minibarBtnAnimClass.value = '' }, 120)
  window.dispatchEvent(new CustomEvent('titlebar:logo-hint-leave'))
}

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

// ── Draggable minibar strip ────────────────────────────────────────────────
// `minibarLeft` is an absolute pixel offset from the titlebar's left edge.
// `null` means "use the default centered position" (applies before the user
// has moved it or before the saved config has loaded).
const MINIBAR_EDGE_MARGIN = 10
const DRAG_THRESHOLD_PX = 5
const minibarStripRef = ref(null)
const minibarLeft = ref(null)

const minibarStripStyle = computed(() =>
  minibarLeft.value == null
    ? {}
    : { left: minibarLeft.value + 'px', transform: 'translateY(-50%)' }
)

function _getMinibarBounds() {
  const titlebar = minibarStripRef.value?.closest('.titlebar')
  const strip = minibarStripRef.value
  if (!titlebar || !strip) return null
  const tbRect = titlebar.getBoundingClientRect()
  const focusSlot = document.getElementById('titlebar-focus-slot')
  const helpSlot = document.getElementById('titlebar-help-slot')
  const focusRect = focusSlot?.getBoundingClientRect()
  const helpRect = helpSlot?.getBoundingClientRect()
  const stripW = strip.offsetWidth
  const minLeft = (focusRect ? focusRect.right - tbRect.left : 0) + MINIBAR_EDGE_MARGIN
  const maxLeft = (helpRect ? helpRect.left - tbRect.left : tbRect.width) - MINIBAR_EDGE_MARGIN - stripW
  return { minLeft, maxLeft, stripW, tbLeft: tbRect.left }
}

// Returns null when bounds are not yet valid (e.g. transient narrow titlebar
// while the Electron window is still resizing back from minibar mode).
// Callers must skip applying in that case so the stored value isn't corrupted.
function _clampMinibarLeft(v) {
  const b = _getMinibarBounds()
  if (!b) return null
  if (b.maxLeft < b.minLeft) return null
  return Math.max(b.minLeft, Math.min(b.maxLeft, v))
}

// Read the saved position from config and apply it, clamped to the current
// bounds. Idempotent; safe to call repeatedly. Skips silently when bounds are
// not yet valid (subsequent resize events will retry).
function _applySavedPosition() {
  const saved = configStore.config.titlebarMinibarLeft
  if (typeof saved !== 'number') return
  const clamped = _clampMinibarLeft(saved)
  if (clamped == null) return
  minibarLeft.value = clamped
}

let _stripDrag = null
function onMinibarStripMouseDown(e) {
  if (e.button !== 0) return
  // Leave interactive children to handle their own mousedown (e.g. compose input).
  if (e.target.closest('input, textarea, .mbc-compose-wrap')) return
  const strip = minibarStripRef.value
  const titlebar = strip?.closest('.titlebar')
  if (!strip || !titlebar) return
  const tbRect = titlebar.getBoundingClientRect()
  const stripRect = strip.getBoundingClientRect()
  _stripDrag = {
    startX: e.clientX,
    startLeft: stripRect.left - tbRect.left,
    moved: false,
    target: e.target,
  }
  document.addEventListener('mousemove', onMinibarStripMouseMove)
  document.addEventListener('mouseup', onMinibarStripMouseUp, { once: true })
  e.stopPropagation()
}

function onMinibarStripMouseMove(e) {
  if (!_stripDrag) return
  const dx = e.clientX - _stripDrag.startX
  if (!_stripDrag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return
  _stripDrag.moved = true
  const clamped = _clampMinibarLeft(_stripDrag.startLeft + dx)
  if (clamped != null) minibarLeft.value = clamped
  e.preventDefault()
}

function onMinibarStripMouseUp() {
  document.removeEventListener('mousemove', onMinibarStripMouseMove)
  const moved = !!_stripDrag?.moved
  _stripDrag = null
  if (!moved) return
  // Suppress ONLY the synthetic click that fires immediately after a drag ends
  // so chat/plan sections do not navigate. Auto-expire after 200ms so a later
  // user click (e.g. the minibar-mode toggle button) is not eaten.
  const suppress = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', suppress, true) }
  window.addEventListener('click', suppress, { capture: true })
  setTimeout(() => window.removeEventListener('click', suppress, true), 200)
  if (typeof minibarLeft.value === 'number') {
    configStore.saveConfig({ titlebarMinibarLeft: minibarLeft.value })
  }
}

function _onWindowResize() {
  // Don't fight an active drag — the user's live input owns the position.
  if (_stripDrag) return
  nextTick(_applySavedPosition)
}

let unsubMaximized = null
onMounted(async () => {
  isMaximized.value = (await window.electronAPI?.windowIsMaximized()) ?? false
  unsubMaximized = window.electronAPI?.onWindowMaximized(v => { isMaximized.value = v })
  tasksStore.subscribeToScheduledRuns()
  window.addEventListener('resize', _onWindowResize)
})

// Apply the saved position whenever it changes (initial config load, or after a drag).
watch(
  () => configStore.config.titlebarMinibarLeft,
  () => { nextTick(_applySavedPosition) },
  { immediate: true }
)

onUnmounted(() => {
  unsubMaximized?.()
  clearTimeout(sidebarBtnAnimTimer)
  clearTimeout(minibarBtnAnimTimer)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('mousemove', onMinibarStripMouseMove)
  window.removeEventListener('resize', _onWindowResize)
})
</script>

<style scoped>
.tb-btn {
  display:flex; align-items:center; justify-content:center;
  width:1.75rem; height:1.75rem; flex-shrink:0;
  border:none; background:transparent; color:#6B7280;
  cursor:pointer; border-radius:0.375rem;
  transition:background 0.15s,color 0.15s;
}
.tb-btn:hover { background:#F5F5F5; color:#1A1A1A; }
.tb-btn-active { color:#007AFF; }
.tb-btn-active:hover { background:rgba(0,122,255,0.08); color:#007AFF; }

.tb-btn-glyph {
  transform-origin: center;
}

.tb-focus-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  min-height: 1.75rem;
}

.tb-anim-wiggle { animation: tb-wiggle 0.55s ease-in-out; }
.tb-anim-bounce { animation: tb-bounce 0.5s ease-in-out; }
.tb-anim-tilt { animation: tb-tilt 0.45s ease-in-out; }
.tb-anim-pop { animation: tb-pop 0.4s cubic-bezier(.175,.885,.32,1.275); }
.tb-anim-jello { animation: tb-jello 0.65s ease-in-out; }

@keyframes tb-wiggle {
  0% { transform: rotate(0deg); }
  20% { transform: rotate(-10deg); }
  40% { transform: rotate(8deg); }
  60% { transform: rotate(-6deg); }
  80% { transform: rotate(4deg); }
  100% { transform: rotate(0deg); }
}

@keyframes tb-bounce {
  0%, 100% { transform: translateY(0); }
  30% { transform: translateY(-3px); }
  60% { transform: translateY(1px); }
}

@keyframes tb-tilt {
  0%, 100% { transform: rotate(0deg) scale(1); }
  35% { transform: rotate(-8deg) scale(1.03); }
  70% { transform: rotate(6deg) scale(0.98); }
}

@keyframes tb-pop {
  0% { transform: scale(1); }
  45% { transform: scale(1.22); }
  100% { transform: scale(1); }
}

@keyframes tb-jello {
  0%, 100% { transform: skew(0deg, 0deg); }
  25% { transform: skew(-7deg, -3deg); }
  50% { transform: skew(5deg, 2deg); }
  75% { transform: skew(-3deg, -1deg); }
}

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
  cursor: grab;
}
.tb-minibar:active { cursor: grabbing; }
</style>
