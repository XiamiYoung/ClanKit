<template>
  <div class="plaza-stage" :class="'stage-' + backgroundKey">
    <div
      v-for="(id, i) in agentIds"
      :key="id"
      class="plaza-char"
      :class="{ 'is-speaking': id === speakingId }"
      :style="{ left: id === speakingId ? '50%' : slotLeft(i) }"
    >
      <div v-if="id === speakingId" class="char-speech">
        {{ (agentNames[id] || 'Agent') }} is speaking...
      </div>
      <div class="char-body" :style="{ animationDelay: (i * 0.3) + 's' }">
        <img v-if="agentAvatars[id]" :src="agentAvatars[id]" alt="" class="char-avatar-img" />
        <div v-else class="char-avatar" :style="{ background: avatarColor(i) }">
          {{ (agentNames[id] || '?')[0].toUpperCase() }}
        </div>
      </div>
      <div class="char-label">{{ agentNames[id] || 'Agent' }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'

const AVATAR_COLORS = [
  'linear-gradient(135deg, #3B82F6, #1D4ED8)',
  'linear-gradient(135deg, #F59E0B, #D97706)',
  'linear-gradient(135deg, #EF4444, #B91C1C)',
  'linear-gradient(135deg, #8B5CF6, #6D28D9)',
  'linear-gradient(135deg, #10B981, #059669)',
  'linear-gradient(135deg, #EC4899, #BE185D)',
]

const props = defineProps({
  agentIds: { type: Array, default: () => [] },
  agentNames: { type: Object, default: () => ({}) },
  agentAvatars: { type: Object, default: () => ({}) },
  backgroundKey: { type: String, default: 'library' },
})

const speakingId = ref(null)
let speechTimer = null

function slotLeft(index) {
  const n = props.agentIds.length
  if (n <= 1) return '50%'
  const start = 20
  const end = 80
  const step = (end - start) / (n - 1)
  return (start + index * step) + '%'
}

function avatarColor(index) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length]
}

function triggerSpeak(agentId, text) {
  if (speakingId.value) return
  speakingId.value = agentId

  const displayMs = Math.min(Math.max(text.length * 40, 2500), 8000)
  clearTimeout(speechTimer)
  speechTimer = setTimeout(() => {
    speakingId.value = null
  }, displayMs)
}

function triggerReset() {
  speakingId.value = null
  clearTimeout(speechTimer)
}

onBeforeUnmount(() => {
  clearTimeout(speechTimer)
})

defineExpose({ triggerSpeak, triggerReset })
</script>

<style scoped>
.plaza-stage {
  position: relative;
  width: 100%;
  height: 10rem;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
}
.stage-cafe    { background: url('/plaza/backgrounds/cafe.svg') center/cover no-repeat, #2C1810; }
.stage-library { background: url('/plaza/backgrounds/library.svg') center/cover no-repeat, #1A0F07; }
.stage-office  { background: url('/plaza/backgrounds/office.svg') center/cover no-repeat, #1E293B; }
.stage-park    { background: url('/plaza/backgrounds/park.svg') center/cover no-repeat, #1A3A2A; }
.stage-space   { background: url('/plaza/backgrounds/space.svg') center/cover no-repeat, #0A0A1A; }

.plaza-char {
  position: absolute;
  bottom: 12%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: left 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}
.plaza-char.is-speaking {
  z-index: 10;
}

.char-body {
  animation: charBob 2s ease-in-out infinite;
}
@keyframes charBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.char-avatar-img {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border: 2px solid rgba(255,255,255,0.2);
}
.char-avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-weight: 700;
  font-size: var(--fs-secondary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border: 2px solid rgba(255,255,255,0.2);
}
.is-speaking .char-avatar-img,
.is-speaking .char-avatar {
  animation: charPop 200ms ease-out;
  border-color: rgba(255,255,255,0.5);
}
@keyframes charPop {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.char-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #FFFFFF;
  background: rgba(0,0,0,0.5);
  padding: 0.0625rem 0.375rem;
  border-radius: var(--radius-sm);
  margin-top: 0.25rem;
  white-space: nowrap;
  max-width: 6rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.char-speech {
  position: absolute;
  bottom: calc(100% + 0.375rem);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(26, 26, 26, 0.92);
  border: 1px solid #374151;
  border-radius: var(--radius-sm);
  padding: 0.375rem 0.625rem;
  color: #FFFFFF;
  font-size: var(--fs-small);
  max-width: 14rem;
  text-align: center;
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
  animation: bubbleIn 200ms ease-out;
  pointer-events: none;
}
@keyframes bubbleIn {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
