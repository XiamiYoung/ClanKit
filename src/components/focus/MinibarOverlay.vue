<template>
  <Teleport to="body">
    <div v-if="focusModeStore.isMinibarMode" class="minibar-bar minibar-bar--enter" ref="barEl" @mousedown="onBarDragStart">
      <!-- Logo -->
      <img src="/icon.png" class="minibar-icon" alt="ClankAI" draggable="false" @dragstart.prevent />

      <div class="minibar-sep" />

      <!-- Running count -->
      <div class="minibar-stat">
        <svg v-if="ongoingCount > 0" class="minibar-spinner" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.2)" stroke-width="2.5"/>
          <path d="M12 3a9 9 0 0 1 9 9" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <svg v-else class="minibar-icon-sm" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
          <path d="M8 12l3 3 5-5" stroke="#34D399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="minibar-count">{{ ongoingCount }}</span>
      </div>

      <div class="minibar-sep" />

      <!-- Rolling ticker — flex:1, grows/shrinks with window width -->
      <div v-if="!showCompose" class="minibar-ticker-wrap">
        <template v-if="tickerText">
          <span class="minibar-ticker-dot" :class="'minibar-ticker-dot-' + tickerStatus" />
          <div
            class="minibar-ticker-track"
            :class="tickerStatus === 'running' ? 'minibar-ticker-loop' : 'minibar-ticker-once'"
            :key="tickerKey"
          >
            <span class="minibar-ticker-text">{{ tickerText }}</span>
          </div>
        </template>
        <span v-else class="minibar-ticker-idle">No recent activity</span>
      </div>

      <!-- Compose input (shown when compose is open) -->
      <div v-if="showCompose" class="minibar-compose-wrap">
        <input
          ref="composeInputRef"
          v-model="composeText"
          class="minibar-compose-input"
          placeholder="Send a message…"
          @keydown.enter.exact.prevent="submitCompose"
          @keydown.escape="closeCompose"
        />
        <button
          class="minibar-compose-send"
          :disabled="!composeText.trim()"
          @click="submitCompose"
          title="Send (Enter)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      <div class="minibar-sep" />

      <!-- Compose toggle button -->
      <button
        class="minibar-compose-btn"
        :class="{ active: showCompose }"
        @click="toggleCompose"
        title="Quick message"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>

      <!-- Exit -->
      <button class="minibar-exit" @click="exit" title="Exit minibar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <!-- Right-edge resize handle — only resize source -->
      <div class="minibar-right-handle" @pointerdown.stop.prevent="startResize" />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, onUnmounted, nextTick } from 'vue'
import { useFocusModeStore } from '../../stores/focusMode'
import { useChatsStore } from '../../stores/chats'
import { usePersonasStore } from '../../stores/personas'

const focusModeStore = useFocusModeStore()
const chatsStore = useChatsStore()
const personasStore = usePersonasStore()

// Ensure personas are loaded (may already be loaded by ChatsView; no-op if so)
if (!personasStore.personas.length) personasStore.loadPersonas()

// ── Bar element ref + dynamic window height ────────────────────────────────
const barEl = ref(null)
const MIN_BAR_W = 200
let WINDOW_H = 48 // updated to actual px height after first render

// Sync body class and window height to match the actual bar pixel height
// The bar has 4px inset on all sides, so window = bar + 8px each axis
const INSET = 4 // px inset on each side so rounded corners are transparent within window

watch(() => focusModeStore.isMinibarMode, async (val) => {
  document.body.classList.toggle('minibar-mode', val)
  if (val) {
    await nextTick()
    const rect = barEl.value?.getBoundingClientRect()
    const barH = rect?.height ?? 40
    WINDOW_H = barH + INSET * 2
    window.electronAPI?.window?.setMinibar({ enable: true, height: WINDOW_H })
  }
}, { immediate: true })

const ongoingCount = computed(() => chatsStore.chats.filter(c => c.isRunning).length)

// ── Rolling ticker ─────────────────────────────────────────────────────────
const tickerText = ref('')
const tickerKey = ref(0)
const tickerStatus = ref('idle') // 'idle' | 'running' | 'done'
const lastActiveTickerChatId = ref(null) // chat that produced the last ticker update

function _lastMsgText(msgs, role) {
  if (!msgs?.length) return null
  for (let j = msgs.length - 1; j >= 0; j--) {
    const m = msgs[j]
    const text = typeof m.content === 'string' ? m.content
      : (Array.isArray(m.content) ? m.content.find(b => b.type === 'text')?.text : null)
    if (m.role === role && text?.trim()) return text.replace(/\n+/g, ' ').trim().slice(0, 220)
  }
  return null
}

watch(
  () => chatsStore.chats.map(c => c.isRunning),
  async (cur, prev) => {
    if (!prev) return
    for (let i = 0; i < chatsStore.chats.length; i++) {
      if (prev[i] === false && cur[i] === true) {
        const chat = chatsStore.chats[i]
        tickerStatus.value = 'running'
        if (chat.messages === null) await chatsStore.ensureMessages(chat.id)
        tickerText.value = _lastMsgText(chat.messages, 'user') ?? chat.title ?? 'Working…'
        tickerKey.value++
        lastActiveTickerChatId.value = chat.id
        break
      } else if (prev[i] === true && cur[i] === false) {
        const chat = chatsStore.chats[i]
        tickerStatus.value = 'done'
        tickerText.value = _lastMsgText(chat.messages, 'assistant') ?? (chat.title ? `"${chat.title}" completed` : 'Task completed')
        tickerKey.value++
        lastActiveTickerChatId.value = chat.id
        break
      }
    }
  },
  { deep: false }
)

// ── Compose ────────────────────────────────────────────────────────────────
const showCompose = ref(false)
const composeText = ref('')
const composeInputRef = ref(null)

function toggleCompose() {
  showCompose.value = !showCompose.value
  if (showCompose.value) {
    nextTick(() => composeInputRef.value?.focus())
  } else {
    composeText.value = ''
  }
}

function closeCompose() {
  showCompose.value = false
  composeText.value = ''
}

async function resolveTargetChatId() {
  // 1. Chat that had last ticker activity
  if (lastActiveTickerChatId.value) {
    const found = chatsStore.chats.find(c => c.id === lastActiveTickerChatId.value)
    if (found) return found.id
  }
  // 2. Currently active chat
  if (chatsStore.activeChatId) return chatsStore.activeChatId
  // 3. First chat in the list
  const first = chatsStore.chats[0]
  if (first) return first.id
  // 4. Create a new chat with the default persona
  const defaultPersonaId = personasStore.defaultSystemPersona?.id ?? null
  const newChat = await chatsStore.createChat('New Chat', defaultPersonaId ? [defaultPersonaId] : null, null)
  return newChat.id
}

async function submitCompose() {
  const text = composeText.value.trim()
  if (!text) return
  const chatId = await resolveTargetChatId()
  composeText.value = ''
  showCompose.value = false
  chatsStore.triggerMinibarSend(text, chatId)
}

// ── Right-edge resize ──────────────────────────────────────────────────────
let _resizeStart = null
let _latestScreenX = 0
let _resizeRafPending = false

function startResize(e) {
  const el = e.currentTarget
  el.setPointerCapture(e.pointerId)
  _resizeStart = {
    el,
    screenX: e.screenX,
    barW: barEl.value?.getBoundingClientRect().width ?? 230,
  }
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

// ── Bar drag (JS-based so all areas including buttons can drag) ────────────
let _drag = null
let _latestDragX = 0
let _latestDragY = 0
let _dragRafPending = false
let _lastSentX = null
let _lastSentY = null

function onBarDragStart(e) {
  if (e.button !== 0) return
  if (e.target.closest('.minibar-right-handle')) return
  if (e.target.closest('.minibar-compose-wrap')) return
  _drag = {
    startWinX: window.screenX,
    startWinY: window.screenY,
    startMouseX: e.screenX,
    startMouseY: e.screenY,
  }
  _latestDragX = e.screenX
  _latestDragY = e.screenY
  _lastSentX = null
  _lastSentY = null
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e) {
  if (!_drag) return
  _latestDragX = e.screenX
  _latestDragY = e.screenY
  if (!_dragRafPending) {
    _dragRafPending = true
    requestAnimationFrame(() => {
      _dragRafPending = false
      if (!_drag) return
      const x = Math.round(_drag.startWinX + (_latestDragX - _drag.startMouseX))
      const y = Math.round(_drag.startWinY + (_latestDragY - _drag.startMouseY))
      if (x === _lastSentX && y === _lastSentY) return
      _lastSentX = x
      _lastSentY = y
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

// ── Exit ──────────────────────────────────────────────────────────────────
function exit() {
  focusModeStore.exitMinibar()
  window.electronAPI?.window?.setMinibar({ enable: false })
}
</script>

<style>
/* Constrain #app to the bar height so it never extends beyond the visible bar */
body.minibar-mode,
body.minibar-mode #app {
  height: 3rem !important;
  overflow: hidden !important;
  background: transparent !important;
}

.minibar-bar {
  position: fixed;
  top: 4px;
  left: 4px;
  right: 4px;
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
.minibar-bar--enter {
  animation: minibar-enter-shake 0.5s ease-out;
}

.minibar-icon {
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 0.3125rem;
  flex-shrink: 0;
}

.minibar-sep {
  width: 1px;
  height: 1.25rem;
  background: rgba(255,255,255,0.1);
  margin: 0 0.5rem;
  flex-shrink: 0;
}

.minibar-stat {
  display: flex;
  align-items: center;
  gap: 0.3125rem;
  flex-shrink: 0;
}

.minibar-spinner {
  width: 0.9375rem;
  height: 0.9375rem;
  animation: minibar-spin 0.85s linear infinite;
  flex-shrink: 0;
}

@keyframes minibar-spin {
  to { transform: rotate(360deg); }
}

.minibar-icon-sm {
  width: 0.9375rem;
  height: 0.9375rem;
  flex-shrink: 0;
}

.minibar-count {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(255,255,255,0.75);
  min-width: 0.875rem;
  text-align: center;
}

/* ── Ticker — fills all remaining space ───────────────────────────────────── */
.minibar-ticker-wrap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.minibar-ticker-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.minibar-ticker-dot-running {
  background: #60A5FA;
  animation: minibar-dot-pulse 1.2s ease-in-out infinite;
}
.minibar-ticker-dot-done { background: #34D399; }

@keyframes minibar-dot-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.minibar-ticker-track {
  display: flex;
  align-items: center;
  white-space: nowrap;
  will-change: transform;
  overflow: hidden;
}
.minibar-ticker-loop { animation: minibar-ticker 16s linear infinite; }
.minibar-ticker-once { animation: minibar-ticker 20s linear 1 forwards; }

@keyframes minibar-ticker {
  from { transform: translateX(100%); }
  to   { transform: translateX(-100%); }
}

.minibar-ticker-text {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.6);
  font-weight: 400;
  white-space: nowrap;
  font-family: 'Inter', sans-serif;
}

.minibar-ticker-idle {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.2);
  font-style: italic;
  font-family: 'Inter', sans-serif;
  white-space: nowrap;
}

/* ── Compose row ──────────────────────────────────────────────────────────── */
.minibar-compose-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.minibar-compose-input {
  flex: 1;
  min-width: 0;
  height: 1.75rem;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 0.375rem;
  padding: 0 0.5rem;
  color: #FFFFFF;
  font-size: 0.75rem;
  font-family: 'Inter', sans-serif;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.minibar-compose-input::placeholder {
  color: rgba(255,255,255,0.3);
}
.minibar-compose-input:focus {
  border-color: rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.12);
}

.minibar-compose-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 0.375rem;
  background: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
}
.minibar-compose-send:hover:not(:disabled) {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.minibar-compose-send:disabled {
  opacity: 0.35;
  cursor: default;
}

/* ── Compose toggle button ────────────────────────────────────────────────── */
.minibar-compose-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.35);
  cursor: pointer;
  border-radius: 0.3125rem;
  transition: background 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}
.minibar-compose-btn:hover {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.8);
}
.minibar-compose-btn.active {
  color: #60A5FA;
  background: rgba(96,165,250,0.12);
}

/* ── Exit ─────────────────────────────────────────────────────────────────── */
.minibar-exit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.3);
  cursor: pointer;
  border-radius: 0.3125rem;
  transition: background 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}
.minibar-exit:hover {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.8);
}

/* ── Right-edge resize handle ─────────────────────────────────────────────── */
.minibar-right-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 0.5rem;
  cursor: ew-resize;
  border-radius: 0 0.875rem 0.875rem 0;
  transition: background 0.15s ease;
}
.minibar-right-handle:hover {
  background: rgba(255,255,255,0.08);
}
</style>
