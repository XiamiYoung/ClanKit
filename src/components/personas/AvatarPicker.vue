<template>
  <div class="avpicker-backdrop">
    <div class="avpicker-dialog">
      <div class="avpicker-header">
        <h2 class="avpicker-title">Choose an Avatar</h2>
        <button class="avpicker-close" @click="$emit('close')" aria-label="Close">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="avpicker-grid-wrap" ref="gridWrap">
        <div class="avpicker-grid">
          <button
            v-for="av in avatars"
            :key="av.id"
            class="avpicker-item"
            :class="{ selected: selectedId === av.id }"
            @click="select(av.id)"
          >
            <img :src="getUri(av.id)" alt="" style="width:80px;height:80px;border-radius:50%;" />
          </button>
        </div>
      </div>
      <div class="avpicker-footer">
        <button class="avpicker-btn shuffle" @click="randomize" title="Generate new random avatars">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
          Shuffle
        </button>
        <button v-if="isShowingRandom" class="avpicker-btn defaults" @click="resetToDefaults" title="Show default avatars">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          Defaults
        </button>
        <div style="flex:1;"></div>
        <button class="avpicker-btn secondary" @click="$emit('close')">Cancel</button>
        <button class="avpicker-btn primary" :disabled="!selectedId" @click="confirm">Select Avatar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { PERSONA_AVATARS, getAvatarDataUri, generateRandomBatch } from './personaAvatars'

const props = defineProps({
  currentAvatarId: { type: String, default: '' },
})

const emit = defineEmits(['close', 'select'])
const avatars = ref([...PERSONA_AVATARS])
const selectedId = ref(props.currentAvatarId || '')
const gridWrap = ref(null)
const isShowingRandom = ref(false)

function getUri(id) {
  return getAvatarDataUri(id)
}

function select(id) {
  selectedId.value = id
}

function randomize() {
  // Replace the entire grid with a new batch of random avatars
  avatars.value = generateRandomBatch(36)
  isShowingRandom.value = true
  // Scroll back to top so user sees the new batch
  nextTick(() => {
    if (gridWrap.value) gridWrap.value.scrollTop = 0
  })
}

function resetToDefaults() {
  avatars.value = [...PERSONA_AVATARS]
  isShowingRandom.value = false
  // Scroll back to top
  nextTick(() => {
    if (gridWrap.value) gridWrap.value.scrollTop = 0
  })
}

function confirm() {
  if (selectedId.value) {
    emit('select', selectedId.value)
  }
}
</script>

<style scoped>
.avpicker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avpicker-dialog {
  width: min(900px, 92vw);
  max-height: 88vh;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 20px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.avpicker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #E5E5EA;
}
.avpicker-title {
  font-family: 'Inter', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.avpicker-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.15s;
}
.avpicker-close:hover {
  background: #F5F5F5;
}
.avpicker-grid-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  scrollbar-width: thin;
}
.avpicker-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}
@media (max-width: 800px) {
  .avpicker-grid { grid-template-columns: repeat(4, 1fr); }
}
.avpicker-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 14px;
  border: 2.5px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.avpicker-item:hover {
  background: rgba(0, 122, 255, 0.04);
  border-color: rgba(0, 122, 255, 0.2);
  transform: scale(1.04);
}
.avpicker-item.selected {
  border-color: #1A1A1A;
  background: rgba(0, 122, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
}
.avpicker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 24px;
  border-top: 1px solid #E5E5EA;
  background: #F9F9F9;
}
.avpicker-btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}
.avpicker-btn.primary {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  color: #fff;
}
.avpicker-btn.primary:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.avpicker-btn.primary:disabled { background: #9CA3AF; cursor: not-allowed; }
.avpicker-btn.shuffle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  color: #1A1A1A;
  border: 1.5px solid #1A1A1A;
}
.avpicker-btn.shuffle:hover { background: rgba(0, 122, 255, 0.06); }
.avpicker-btn.defaults {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  color: #6B7280;
  border: 1.5px solid #D1D1D6;
}
.avpicker-btn.defaults:hover { background: #F5F5F5; border-color: #9CA3AF; }
.avpicker-btn.secondary {
  background: #F5F5F5;
  color: #6B7280;
}
.avpicker-btn.secondary:hover { background: #E5E5EA; }

@media (prefers-reduced-motion: reduce) {
  .avpicker-item { transition: none; }
  .avpicker-item:hover { transform: none; }
}
</style>
