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
          <img v-if="agentAvatar" :src="agentAvatar" alt="" class="call-panel-avatar-img" />
          <div v-else class="call-panel-avatar-fallback">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>
        <div class="call-panel-info">
          <span class="call-panel-name">{{ voiceStore.activeAgentName || 'AI' }}</span>
          <span class="call-panel-status">{{ statusLabel }}</span>
        </div>

        <!-- Header actions: mute · end -->
        <div class="call-panel-header-actions">
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
import { getAvatarDataUri } from '../agents/agentAvatars'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const voiceStore = useVoiceStore()
const agentsStore = useAgentsStore()
const configStore = useConfigStore()

const emit = defineEmits(['end-call', 'toggle-mute', 'mic-change', 'speaker-change'])

const panelEl = ref(null)
const micDevices = ref([])
const speakerDevices = ref([])

const panelPos = ref(null) // null = centered, { left, top } = user-dragged position
let _drag = null

const panelStyle = computed(() => {
  if (!panelPos.value) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  return { left: panelPos.value.left + 'px', top: panelPos.value.top + 'px', transform: 'none' }
})

const agentAvatar = computed(() => {
  if (!voiceStore.activeAgentId) return null
  const agent = agentsStore.agents.find(p => p.id === voiceStore.activeAgentId)
  if (!agent?.avatar) return null
  return getAvatarDataUri(agent.avatar)
})

const statusClass = computed(() => {
  const s = voiceStore.status
  if (s === 'listening') return 'listening'
  if (s === 'processing' || s === 'speaking') return 'processing'
  return ''
})

const statusLabel = computed(() => {
  const s = voiceStore.status
  if (s === 'listening') return t('voice.listening')
  if (s === 'processing' || s === 'speaking') return t('voice.thinking')
  return t('voice.idle')
})

const defaultMicLabel = computed(() => {
  return configStore.config?.voiceCall?.defaultMicLabel || 'Default Microphone'
})

const defaultSpeakerLabel = computed(() => {
  return configStore.config?.voiceCall?.defaultSpeakerLabel || 'Default Speaker'
})

function onDragStart(e) {
  if (e.button !== 0) return
  // If still centered (null pos), compute actual position from element
  if (!panelPos.value && panelEl.value) {
    const rect = panelEl.value.getBoundingClientRect()
    panelPos.value = { left: rect.left, top: rect.top }
  }
  const pos = panelPos.value || { left: 0, top: 0 }
  _drag = { startX: e.clientX, startY: e.clientY, startLeft: pos.left, startTop: pos.top }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e) {
  if (!_drag) return
  const panelWidth = 300
  const panelHeight = 200
  panelPos.value = {
    left: Math.max(0, Math.min(_drag.startLeft + (e.clientX - _drag.startX), window.innerWidth - panelWidth)),
    top: Math.max(0, Math.min(_drag.startTop + (e.clientY - _drag.startY), window.innerHeight - panelHeight)),
  }
}

function onDragEnd() {
  _drag = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

async function loadDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    micDevices.value = devices.filter(d => d.kind === 'audioinput')
    speakerDevices.value = devices.filter(d => d.kind === 'audiooutput')
  } catch (err) {
    console.error('Failed to enumerate devices:', err)
  }
}

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

onMounted(() => {
  loadDevices()
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})
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
