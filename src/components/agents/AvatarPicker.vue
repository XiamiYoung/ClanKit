<template>
  <div class="avpicker-backdrop">
    <div class="avpicker-dialog">
      <!-- Header -->
      <div class="avpicker-header">
        <h2 class="avpicker-title">Choose an Avatar</h2>
        <button class="avpicker-close" @click="$emit('close')" aria-label="Close">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Style tabs (horizontal scroll) -->
      <div class="avpicker-tabs-wrap">
        <button
          v-for="style in STYLES"
          :key="style.key"
          class="avpicker-tab"
          :class="{ active: activeStyleKey === style.key }"
          @click="switchStyle(style.key)"
        >{{ style.label }}</button>
      </div>

      <!-- Scrollable avatar grid -->
      <div class="avpicker-grid-wrap">
        <div class="avpicker-grid">
          <button
            v-for="av in currentAvatars"
            :key="av.id"
            class="avpicker-item"
            :class="{ selected: selectedId === av.id }"
            @click="select(av.id)"
          >
            <img :src="getUri(av.id)" alt="" style="width:4.5rem;height:4.5rem;border-radius:50%;" />
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="avpicker-footer">
        <label class="avpicker-upload-btn" title="Upload a photo from your computer">
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Photo
          <input type="file" accept="image/*" style="display:none;" @change="onFileUpload" />
        </label>
        <div style="flex:1;"></div>
        <button class="avpicker-btn secondary" @click="$emit('close')">Cancel</button>
        <button class="avpicker-btn primary" :disabled="!selectedId" @click="confirm">Select Avatar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { STYLES, getAvatarDataUri, generateRandomBatch } from './agentAvatars'

const BATCH_SIZE = 120  // avatars per style tab

const props = defineProps({
  currentAvatarId: { type: String, default: '' },
})
const emit = defineEmits(['close', 'select'])

function detectStyleKey(id) {
  if (!id) return STYLES[0].key
  if (id.includes(':')) return id.split(':')[0]
  return 'avataaars'
}

const selectedId     = ref(props.currentAvatarId || '')
const activeStyleKey = ref(detectStyleKey(props.currentAvatarId))

// Per-style avatar cache
const batchCache = new Map()

function getBatch(styleKey) {
  if (!batchCache.has(styleKey)) {
    batchCache.set(styleKey, generateRandomBatch(BATCH_SIZE, styleKey))
  }
  return batchCache.get(styleKey)
}

getBatch(activeStyleKey.value)

const currentAvatars = computed(() => getBatch(activeStyleKey.value))

function switchStyle(styleKey) {
  if (activeStyleKey.value === styleKey) return
  activeStyleKey.value = styleKey
  getBatch(styleKey)
}

function getUri(id) {
  return getAvatarDataUri(id)
}

function select(id) {
  selectedId.value = id
}

function confirm() {
  if (selectedId.value) emit('select', selectedId.value)
}

function onFileUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUri = e.target.result
    selectedId.value = dataUri
    emit('select', dataUri)
  }
  reader.readAsDataURL(file)
}
</script>

<style scoped>
.avpicker-backdrop {
  position: fixed; inset: 0; z-index: 2100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.avpicker-dialog {
  width: min(56.25rem, 92vw);
  height: min(82vh, 52rem);
  background: #0F0F0F; border: 1px solid #2A2A2A;
  border-radius: 1.25rem; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: avpicker-enter 0.2s ease-out;
}
@keyframes avpicker-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.avpicker-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.125rem 1.5rem; border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
}
.avpicker-title {
  font-family: 'Inter', sans-serif; font-size: 1.125rem; font-weight: 700;
  color: #FFFFFF; margin: 0;
}
.avpicker-close {
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280;
  cursor: pointer; transition: all 0.15s;
}
.avpicker-close:hover { background: #1F1F1F; color: #FFFFFF; }

/* Tabs — horizontal scroll, no wrap */
.avpicker-tabs-wrap {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.75rem 1.5rem;
  overflow-x: auto;
  border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
  
  
}
.avpicker-tabs-wrap::-webkit-scrollbar { height: 3px; }
.avpicker-tabs-wrap::-webkit-scrollbar-track { background: transparent; }
.avpicker-tabs-wrap::-webkit-scrollbar-thumb { background: #333; border-radius: 9999px; }
.avpicker-tab {
  padding: 0.3125rem 0.875rem;
  border-radius: 9999px;
  border: 1px solid #2A2A2A;
  background: #1A1A1A;
  color: #9CA3AF;
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; font-weight: 500;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
  transition: all 0.15s;
}
.avpicker-tab:hover:not(.active) {
  background: #242424; color: #D1D5DB; border-color: #374151;
}
.avpicker-tab.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; border-color: #4B5563;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

/* Scrollable grid */
.avpicker-grid-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.25rem 1.25rem 1.5rem;
  
  
}
.avpicker-grid-wrap::-webkit-scrollbar { width: 6px; }
.avpicker-grid-wrap::-webkit-scrollbar-track { background: transparent; }
.avpicker-grid-wrap::-webkit-scrollbar-thumb { background: #444; border-radius: 9999px; }
.avpicker-grid-wrap::-webkit-scrollbar-thumb:hover { background: #666; }

.avpicker-grid {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.625rem;
}
@media (max-width: 800px) {
  .avpicker-grid { grid-template-columns: repeat(4, 1fr); }
}
.avpicker-item {
  display: flex; align-items: center; justify-content: center;
  padding: 0.5rem; border-radius: 0.875rem; border: 2.5px solid transparent;
  background: transparent; cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.avpicker-item:hover {
  background: rgba(75, 85, 99, 0.15); border-color: rgba(75, 85, 99, 0.4);
  transform: scale(1.04);
}
.avpicker-item.selected {
  border-color: #FFFFFF; background: rgba(75, 85, 99, 0.2);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
}

/* Footer */
.avpicker-footer {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.875rem 1.5rem; border-top: 1px solid #1F1F1F; background: #0A0A0A;
  flex-shrink: 0;
}

.avpicker-upload-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.5rem 1rem; border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: 0.875rem; font-weight: 600;
  cursor: pointer; border: 1px solid #2A2A2A; background: #1A1A1A;
  color: #9CA3AF; transition: all 0.15s; white-space: nowrap;
}
.avpicker-upload-btn:hover { background: #242424; color: #FFFFFF; border-color: #374151; }
.avpicker-btn {
  padding: 0.5rem 1.25rem; border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: 0.875rem; font-weight: 600;
  cursor: pointer; border: none; transition: all 0.15s;
}
.avpicker-btn.primary {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #fff; border: 1px solid #374151;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.avpicker-btn.primary:hover { background: linear-gradient(135deg, #2D2D2D 0%, #374151 40%, #6B7280 100%); }
.avpicker-btn.primary:disabled { background: #2A2A2A; color: #4B5563; cursor: not-allowed; border-color: #2A2A2A; }
.avpicker-btn.secondary {
  background: #1A1A1A; color: #9CA3AF; border: 1px solid #2A2A2A;
}
.avpicker-btn.secondary:hover { background: #222222; color: #FFFFFF; border-color: #374151; }

@media (prefers-reduced-motion: reduce) {
  .avpicker-item { transition: none; }
  .avpicker-item:hover { transform: none; }
  .avpicker-dialog { animation: none; }
}
</style>
