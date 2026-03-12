<template>
  <Teleport to="body">
    <div
      v-if="voiceStore.isCallActive && !voiceStore.isPip"
      ref="panelEl"
      class="call-panel"
      :style="panelStyle"
      @mousedown="onDragStart"
    >
      <!-- Header -->
      <div class="call-panel-header">
        <div class="call-panel-avatar" :class="statusClass">
          <div class="call-panel-ring"></div>
          <img v-if="personaAvatar" :src="personaAvatar" alt="" class="call-panel-avatar-img" />
          <div v-else class="call-panel-avatar-fallback">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>
        <div class="call-panel-info">
          <span class="call-panel-name">{{ voiceStore.activePersonaName || 'AI' }}</span>
          <span class="call-panel-status">{{ statusLabel }}</span>
        </div>

        <!-- Header actions: cost chip · mute · end -->
        <div class="call-panel-header-actions">
          <!-- Cost chip -->
          <div
            v-if="callCost.whisperCalls > 0 || callCost.llmUsd > 0"
            class="call-cost-chip"
            @mouseenter="openCostTooltip"
            @mouseleave="showCostTooltip = false"
          >
            {{ formatCost(callCost.totalUsd) }}
            <!-- Tooltip -->
            <div v-if="showCostTooltip" class="call-cost-tooltip" :style="tooltipStyle">
              <div class="cct-row cct-header">
                <span>Call cost</span>
                <span class="cct-total">{{ formatCost(callCost.totalUsd) }}</span>
              </div>
              <div v-if="callCost.whisperCalls > 0" class="cct-row">
                <span class="cct-label">Speech-to-text</span>
                <span class="cct-value">{{ callCost.whisperCalls }} rounds · {{ callCost.whisperSecs.toFixed(1) }}s</span>
                <span class="cct-usd">{{ formatCost(callCost.whisperUsd) }}</span>
              </div>
              <div v-if="callCost.llmUsd > 0" class="cct-row">
                <span class="cct-label">AI response</span>
                <span class="cct-value">{{ (n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n)(voiceStore.callVoiceInputTokens + voiceStore.callVoiceOutputTokens) }} tok</span>
                <span class="cct-usd">{{ formatCost(callCost.llmUsd) }}</span>
              </div>
            </div>
          </div>

          <!-- Mute -->
          <button
            class="call-panel-icon-btn" :class="{ active: voiceStore.isMuted }"
            @click="toggleMute"
            :title="voiceStore.isMuted ? 'Unmute' : 'Mute'"
          >
            <svg v-if="!voiceStore.isMuted" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <svg v-else style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .99-.2 1.93-.57 2.78"/>
              <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          <!-- End call -->
          <button class="call-panel-close" @click="endCall" title="End Call">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- STT transcript — last thing you said -->
      <div v-if="voiceStore.lastTranscript" class="call-panel-transcript">
        <span class="call-panel-transcript-label">You said</span>
        <span class="call-panel-transcript-text">{{ voiceStore.lastTranscript }}</span>
      </div>

      <!-- Device selectors -->
      <div class="call-panel-devices">
        <!-- Mic -->
        <div class="call-panel-device-row">
          <svg class="call-panel-device-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
          <select
            class="call-panel-device-select"
            :value="voiceStore.selectedMicId"
            @change="onMicChange"
            title="Microphone"
          >
            <option value="">{{ defaultMicLabel }}</option>
            <option v-for="d in micDevices" :key="d.deviceId" :value="d.deviceId">
              {{ d.label || `Microphone ${d.deviceId.slice(0,8)}` }}
            </option>
          </select>
        </div>
        <!-- Speaker -->
        <div class="call-panel-device-row">
          <svg class="call-panel-device-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
          <select
            class="call-panel-device-select"
            :value="voiceStore.selectedSpeakerId"
            @change="onSpeakerChange"
            title="Speaker"
          >
            <option value="">{{ defaultSpeakerLabel }}</option>
            <option v-for="d in speakerDevices" :key="d.deviceId" :value="d.deviceId">
              {{ d.label || `Speaker ${d.deviceId.slice(0,8)}` }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue'
import { useVoiceStore } from '../../stores/voice'
import { useAgentsStore } from '../../stores/agents'
import { useConfigStore } from '../../stores/config'
import { getAvatarDataUri } from '../personas/personaAvatars'
import { resolveModelPrice, formatCost } from '../../utils/pricing'

const voiceStore = useVoiceStore()
const agentsStore = useAgentsStore()
const configStore = useConfigStore()

const emit = defineEmits(['end-call', 'toggle-mute', 'mic-change', 'speaker-change'])

const micDevices = ref([])
const speakerDevices = ref([])
const showCostTooltip = ref(false)
const tooltipStyle = ref({})

const TOOLTIP_H = 96  // estimated rendered height (2–3 rows)
const TOOLTIP_GAP = 8

function openCostTooltip(e) {
  const r = e.currentTarget.getBoundingClientRect()
  const vw = window.innerWidth
  const style = {}

  // ── Vertical: prefer above, fall back to below ──
  if (r.top - TOOLTIP_H - TOOLTIP_GAP >= 0) {
    style.top = (r.top - TOOLTIP_GAP) + 'px'
    style.transform = 'translateY(-100%)'
  } else {
    style.top = (r.bottom + TOOLTIP_GAP) + 'px'
    style.transform = 'none'
  }

  // ── Horizontal: anchor by whichever edge has more room ──
  // Right half of screen → pin tooltip's right edge to chip's right edge (extends leftward)
  // Left half of screen  → pin tooltip's left  edge to chip's left  edge (extends rightward)
  if (r.right > vw / 2) {
    style.right = (vw - r.right) + 'px'
    style.left = 'auto'
  } else {
    style.left = r.left + 'px'
    style.right = 'auto'
  }

  tooltipStyle.value = style
  showCostTooltip.value = true
}

// ── Drag-to-reposition ──
const panelEl = ref(null)
const PANEL_WIDTH = 300
const dragPos = ref({ right: 24, bottom: 24 })
let dragging = false
let dragStartX = 0
let dragStartY = 0
let startRight = 24
let startBottom = 24

const panelStyle = computed(() => ({
  right: `${dragPos.value.right}px`,
  bottom: `${dragPos.value.bottom}px`,
}))

function clampPos(right, bottom) {
  const panelHeight = panelEl.value?.offsetHeight || 260
  return {
    right:  Math.max(0, Math.min(right,  window.innerWidth  - PANEL_WIDTH)),
    bottom: Math.max(0, Math.min(bottom, window.innerHeight - panelHeight)),
  }
}

function onDragStart(e) {
  // Don't initiate drag on interactive elements
  if (e.target.closest('button, select, option')) return
  dragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  startRight = dragPos.value.right
  startBottom = dragPos.value.bottom
  e.preventDefault()
}

function onMouseMove(e) {
  if (!dragging) return
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  Object.assign(dragPos.value, clampPos(startRight - dx, startBottom - dy))
}

function onMouseUp() {
  dragging = false
}

function onWindowResize() {
  // Re-clamp position when the window is resized so the panel can't end up outside
  Object.assign(dragPos.value, clampPos(dragPos.value.right, dragPos.value.bottom))
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('resize', onWindowResize)
  navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
  // Clamp initial position once the panel has rendered and we know its height
  nextTick(() => Object.assign(dragPos.value, clampPos(dragPos.value.right, dragPos.value.bottom)))
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('resize', onWindowResize)
  navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
})

const defaultMicLabel = ref('Default microphone')
const defaultSpeakerLabel = ref('Default speaker')

function parseDefaultLabel(raw, fallback) {
  if (!raw) return fallback
  // "Default - AirPods Pro" or "Default (AirPods Pro)" → "Default (AirPods Pro)"
  const match = raw.match(/^Default\s*[-–—]\s*(.+)$/i)
  return match ? `Default (${match[1].trim()})` : raw
}

async function enumerateDevices() {
  try {
    // Need to request mic permission first so labels are available
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()))
    const devices = await navigator.mediaDevices.enumerateDevices()

    const defMic = devices.find(d => d.kind === 'audioinput' && d.deviceId === 'default')
    const defSpk = devices.find(d => d.kind === 'audiooutput' && d.deviceId === 'default')
    defaultMicLabel.value = parseDefaultLabel(defMic?.label, 'Default microphone')
    defaultSpeakerLabel.value = parseDefaultLabel(defSpk?.label, 'Default speaker')

    micDevices.value = devices.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
    speakerDevices.value = devices.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
  } catch {
    // Silently fall back to unnamed defaults
  }
}

onMounted(enumerateDevices)

const personaAvatar = computed(() => {
  if (!voiceStore.activePersonaId) return null
  const persona = agentsStore.agents.find(p => p.id === voiceStore.activePersonaId)
  if (!persona?.avatar) return null
  return getAvatarDataUri(persona.avatar)
})

const statusClass = computed(() => {
  const s = voiceStore.status
  if (s === 'speaking')  return 'speaking'
  if (s === 'listening') return 'listening'
  if (s === 'processing') return 'processing'
  if (s === 'standby')   return 'standby'
  return ''
})

const statusLabel = computed(() => {
  const s = voiceStore.status
  if (s === 'standby')   return 'Ready'
  if (s === 'listening') return 'Listening...'
  if (s === 'processing') return 'Thinking...'
  if (s === 'speaking')  return 'Speaking...'
  return 'Connecting...'
})

// Real-time call cost
const callCost = computed(() => {
  const M = 1_000_000
  const pricing = configStore.config?.pricing

  const whisperPrice   = resolveModelPrice('whisper-1', pricing)
  const whisperUsd     = (voiceStore.callWhisperSecs) * (whisperPrice?.perSec ?? 0.0001)

  const llmModelId     = voiceStore.callModelId
  const llmPrice       = llmModelId ? resolveModelPrice(llmModelId, pricing) : null
  const llmUsd         = llmPrice
    ? ((voiceStore.callVoiceInputTokens  / M) * (llmPrice.input  || 0)
    +  (voiceStore.callVoiceOutputTokens / M) * (llmPrice.output || 0))
    : 0

  const totalUsd = whisperUsd + llmUsd
  return {
    totalUsd,
    whisperUsd,
    llmUsd,
    whisperSecs:  voiceStore.callWhisperSecs,
    whisperCalls: voiceStore.callWhisperCalls,
    hasLlmPrice:  !!llmPrice,
  }
})

function onMicChange(e) {
  voiceStore.setMicId(e.target.value)
  emit('mic-change', e.target.value)
}

function onSpeakerChange(e) {
  voiceStore.setSpeakerId(e.target.value)
  emit('speaker-change', e.target.value)
}

function toggleMute() { emit('toggle-mute') }
function endCall() { emit('end-call') }
</script>

<style>
/* Unscoped — teleported to body */
.call-panel {
  position: fixed;
  z-index: 200;
  cursor: grab;
  user-select: none;
  width: 18.75rem;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.15);
  animation: callPanelEnter 0.2s ease-out;
  overflow: hidden;
}

.call-panel-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.875rem 0.875rem 0.625rem;
}
.call-panel-header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.call-panel-icon-btn {
  width: 2rem; height: 2rem;
  border: none; border-radius: 0.5rem;
  background: rgba(255,255,255,0.06);
  color: #9CA3AF;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.call-panel-icon-btn:hover { background: rgba(255,255,255,0.1); color: #FFFFFF; }
.call-panel-icon-btn.active { background: #374151; color: #FFFFFF; }

/* Avatar with status ring */
.call-panel-avatar {
  position: relative;
  width: 2.5rem; height: 2.5rem;
  border-radius: 50%;
  overflow: visible;
  flex-shrink: 0;
}
.call-panel-ring {
  position: absolute; inset: -0.1875rem;
  border-radius: 50%;
  border: 2px solid #374151;
  transition: all 0.3s ease;
}
.call-panel-avatar.standby .call-panel-ring {
  border-color: #4B5563;
  box-shadow: none;
}
.call-panel-avatar.listening .call-panel-ring {
  border-color: #10B981;
  box-shadow: 0 0 12px rgba(16,185,129,0.3);
  animation: callPulse 2s ease-in-out infinite;
}
.call-panel-avatar.speaking .call-panel-ring {
  border-color: #3B82F6;
  box-shadow: 0 0 12px rgba(59,130,246,0.3);
  animation: callPulse 1.2s ease-in-out infinite;
}
.call-panel-avatar.processing .call-panel-ring {
  border-color: #F59E0B;
  box-shadow: 0 0 12px rgba(245,158,11,0.3);
  animation: callSpin 1.5s linear infinite;
}
.call-panel-avatar-img {
  width: 2.5rem; height: 2.5rem;
  border-radius: 50%;
  object-fit: cover;
}
.call-panel-avatar-fallback {
  width: 2.5rem; height: 2.5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
  display: flex; align-items: center; justify-content: center;
  color: #9CA3AF;
}

.call-panel-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.call-panel-name {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #FFFFFF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.call-panel-status {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 500;
  color: #9CA3AF;
}

.call-panel-close {
  width: 2rem; height: 2rem;
  border: none; border-radius: 0.5rem;
  background: rgba(255,255,255,0.06);
  color: #EF4444;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.call-panel-close:hover {
  background: rgba(239,68,68,0.15);
  color: #F87171;
}

/* STT transcript */
.call-panel-transcript {
  margin: 0 0.625rem 0.375rem;
  padding: 0.375rem 0.625rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.call-panel-transcript-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #10B981;
}
.call-panel-transcript-text {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  color: #E5E5EA;
  line-height: 1.4;
  word-break: break-word;
}

/* Cost chip + tooltip */
.call-cost-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.625rem;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  color: #F59E0B;
  cursor: default;
  white-space: nowrap;
  flex-shrink: 0;
}
.call-cost-tooltip {
  position: fixed;
  min-width: 14rem;
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  padding: 0.5rem 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  pointer-events: none;
  z-index: 9999;
}
.cct-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.cct-header {
  justify-content: space-between;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #2A2A2A;
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #F59E0B;
}
.cct-total {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: #FFFFFF;
}
.cct-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #6B7280;
  width: 7rem;
  flex-shrink: 0;
}
.cct-value {
  flex: 1;
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  color: #9CA3AF;
}
.cct-usd {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.6875rem;
  color: #D1D5DB;
  white-space: nowrap;
}

/* Device selectors */
.call-panel-devices {
  padding: 0 0.625rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
  border-top: 1px solid #1A1A1A;
  padding-top: 0.625rem;
}
.call-panel-device-row {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
}
.call-panel-device-icon {
  width: 0.8125rem;
  height: 0.8125rem;
  color: #6B7280;
  flex-shrink: 0;
}
.call-panel-device-select {
  flex: 1;
  min-width: 0;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.4375rem;
  color: #D1D5DB;
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  padding: 0.25rem 0.375rem;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color 0.15s ease;
}
.call-panel-device-select:hover,
.call-panel-device-select:focus {
  border-color: #4B5563;
}
.call-panel-device-select option {
  background: #1A1A1A;
  color: #D1D5DB;
}

/* Animations */
@keyframes callPanelEnter {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes callPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.06); opacity: 0.8; }
}
@keyframes callSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
