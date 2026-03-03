<template>
  <Teleport to="body">
    <div v-if="voiceStore.isCallActive && !voiceStore.isPip" class="call-panel">
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
        <button class="call-panel-close" @click="endCall" title="End Call">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </button>
      </div>

      <!-- Controls row -->
      <div class="call-panel-controls">
        <button
          class="call-panel-btn" :class="{ active: voiceStore.isMuted }"
          @click="toggleMute"
          :title="voiceStore.isMuted ? 'Unmute' : 'Mute'"
        >
          <svg v-if="!voiceStore.isMuted" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          <svg v-else style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .99-.2 1.93-.57 2.78"/>
            <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
        <button class="call-panel-btn end" @click="endCall" title="End Call">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
          End
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useVoiceStore } from '../../stores/voice'
import { usePersonasStore } from '../../stores/personas'
import { getAvatarDataUri } from '../personas/personaAvatars'

const voiceStore = useVoiceStore()
const personasStore = usePersonasStore()

const emit = defineEmits(['end-call', 'toggle-mute'])

const personaAvatar = computed(() => {
  if (!voiceStore.activePersonaId) return null
  const persona = personasStore.personas.find(p => p.id === voiceStore.activePersonaId)
  if (!persona?.avatarOptions) return null
  return getAvatarDataUri(persona.avatarOptions)
})

const statusClass = computed(() => {
  const s = voiceStore.status
  if (s === 'speaking') return 'speaking'
  if (s === 'listening') return 'listening'
  if (s === 'processing') return 'processing'
  return ''
})

const statusLabel = computed(() => {
  const s = voiceStore.status
  if (s === 'listening') return 'Listening...'
  if (s === 'processing') return 'Thinking...'
  if (s === 'speaking') return 'Speaking...'
  return 'Connecting...'
})

function toggleMute() { emit('toggle-mute') }
function endCall() { emit('end-call') }
</script>

<style>
/* Unscoped — teleported to body */
.call-panel {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 200;
  width: 280px;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.15);
  animation: callPanelEnter 0.2s ease-out;
  overflow: hidden;
}

.call-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 10px;
}

/* Avatar with status ring */
.call-panel-avatar {
  position: relative;
  width: 40px; height: 40px;
  border-radius: 50%;
  overflow: visible;
  flex-shrink: 0;
}
.call-panel-ring {
  position: absolute; inset: -3px;
  border-radius: 50%;
  border: 2px solid #374151;
  transition: all 0.3s ease;
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
  width: 40px; height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.call-panel-avatar-fallback {
  width: 40px; height: 40px;
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
  width: 32px; height: 32px;
  border: none; border-radius: 8px;
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

/* Controls */
.call-panel-controls {
  display: flex;
  gap: 8px;
  padding: 8px 14px 14px;
}
.call-panel-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: none;
  border-radius: 10px;
  background: #1A1A1A;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.call-panel-btn:hover { background: #2A2A2A; }
.call-panel-btn.active { background: #374151; }
.call-panel-btn.end {
  background: #DC2626;
  color: #FFFFFF;
}
.call-panel-btn.end:hover { background: #EF4444; }

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
