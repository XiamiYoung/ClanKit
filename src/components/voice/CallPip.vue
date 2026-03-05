<template>
  <Teleport to="body">
    <div v-if="voiceStore.isCallActive && voiceStore.isPip" class="call-pip" @click="goToCall">
      <!-- Avatar -->
      <div class="call-pip-avatar" :class="statusClass">
        <div class="call-pip-ring"></div>
        <img v-if="personaAvatar" :src="personaAvatar" alt="" class="call-pip-img" />
        <div v-else class="call-pip-fallback">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
      </div>

      <!-- Info -->
      <div class="call-pip-info">
        <span class="call-pip-name">{{ voiceStore.activePersonaName || 'AI' }}</span>
        <span class="call-pip-status">{{ statusLabel }}</span>
      </div>

      <!-- End button -->
      <button class="call-pip-end" @click.stop="endCall" title="End Call">
        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useVoiceStore } from '../../stores/voice'
import { usePersonasStore } from '../../stores/personas'
import { getAvatarDataUri } from '../personas/personaAvatars'

const voiceStore = useVoiceStore()
const personasStore = usePersonasStore()
const router = useRouter()

const emit = defineEmits(['end-call'])

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
  if (s === 'listening') return 'Listening'
  if (s === 'processing') return 'Thinking'
  if (s === 'speaking') return 'Speaking'
  return 'On call'
})

function goToCall() {
  voiceStore.setPip(false)
  router.push('/chats')
}

function endCall() {
  emit('end-call')
}
</script>

<style>
/* Unscoped — teleported to body */
.call-pip {
  position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999;
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.625rem 0.875rem; border-radius: 1rem;
  background: #0F0F0F; border: 1px solid #2A2A2A;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
  cursor: pointer; transition: all 0.15s ease;
  animation: pipEnter 0.2s ease-out;
}
.call-pip:hover {
  background: #1A1A1A;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.25);
}

.call-pip-avatar {
  position: relative; width: 2.25rem; height: 2.25rem; flex-shrink: 0;
}
.call-pip-ring {
  position: absolute; inset: -0.1875rem; border-radius: 50%;
  border: 2px solid #374151; transition: all 0.3s ease;
}
.call-pip-avatar.listening .call-pip-ring {
  border-color: #10B981; box-shadow: 0 0 12px rgba(16,185,129,0.3);
}
.call-pip-avatar.speaking .call-pip-ring {
  border-color: #3B82F6; box-shadow: 0 0 12px rgba(59,130,246,0.3);
  animation: callPulse 1.2s ease-in-out infinite;
}
.call-pip-avatar.processing .call-pip-ring {
  border-color: #F59E0B; box-shadow: 0 0 12px rgba(245,158,11,0.3);
}

.call-pip-img {
  width: 2.25rem; height: 2.25rem; border-radius: 50%; object-fit: cover;
}
.call-pip-fallback {
  width: 2.25rem; height: 2.25rem; border-radius: 50%;
  background: linear-gradient(135deg, #1A1A1A, #374151);
  display: flex; align-items: center; justify-content: center; color: #9CA3AF;
}

.call-pip-info {
  display: flex; flex-direction: column; gap: 0.0625rem;
}
.call-pip-name {
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; font-weight: 600;
  color: #FFFFFF; white-space: nowrap;
}
.call-pip-status {
  font-family: 'Inter', sans-serif; font-size: 0.6875rem; font-weight: 500;
  color: #9CA3AF;
}

.call-pip-end {
  width: 1.75rem; height: 1.75rem; border: none; border-radius: 0.5rem;
  background: #DC2626; color: #FFFFFF;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s ease; flex-shrink: 0;
}
.call-pip-end:hover { background: #EF4444; }

@keyframes pipEnter {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
