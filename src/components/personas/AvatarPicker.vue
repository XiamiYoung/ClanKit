<template>
  <div class="avpicker-backdrop">
    <div class="avpicker-dialog">
      <div class="avpicker-header">
        <h2 class="avpicker-title">Choose an Avatar</h2>
        <button class="avpicker-close" @click="$emit('close')" aria-label="Close">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Fixed-height grid — never changes size across pages -->
      <div class="avpicker-grid-wrap">
        <div class="avpicker-grid">
          <button
            v-for="av in currentPageAvatars"
            :key="av.id"
            class="avpicker-item"
            :class="{ selected: selectedId === av.id }"
            @click="select(av.id)"
          >
            <img :src="getUri(av.id)" alt="" style="width:5rem;height:5rem;border-radius:50%;" />
          </button>
        </div>
      </div>

      <div class="avpicker-footer">
        <!-- Pagination -->
        <div class="avpicker-pagination">
          <button
            class="avpicker-page-btn"
            :disabled="currentPage === 0"
            @click="currentPage--"
            aria-label="Previous page"
          >
            <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="avpicker-page-info">{{ currentPage + 1 }} / {{ totalPages }}</span>
          <button
            class="avpicker-page-btn"
            :disabled="currentPage >= totalPages - 1"
            @click="currentPage++"
            aria-label="Next page"
          >
            <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <div style="flex:1;"></div>
        <button class="avpicker-btn secondary" @click="$emit('close')">Cancel</button>
        <button class="avpicker-btn primary" :disabled="!selectedId" @click="confirm">Select Avatar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { PERSONA_AVATARS, getAvatarDataUri, generateRandomBatch } from './personaAvatars'

const PAGE_SIZE   = 36  // 6 cols × 6 rows
const EXTRA_PAGES = 9   // pages 2–10 are randomly generated at mount

const props = defineProps({
  currentAvatarId: { type: String, default: '' },
})

const emit = defineEmits(['close', 'select'])

// Build all pages once — stable for the lifetime of this dialog instance
const allPages = [
  [...PERSONA_AVATARS],                          // page 1: presets
  ...Array.from({ length: EXTRA_PAGES }, () => generateRandomBatch(PAGE_SIZE)), // pages 2–10
]

const selectedId  = ref(props.currentAvatarId || '')
const currentPage = ref(0)

const totalPages = computed(() => allPages.length)

const currentPageAvatars = computed(() => allPages[currentPage.value] || [])

function getUri(id) {
  return getAvatarDataUri(id)
}

function select(id) {
  selectedId.value = id
}

function confirm() {
  if (selectedId.value) {
    emit('select', selectedId.value)
  }
}
</script>

<style scoped>
.avpicker-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.avpicker-dialog {
  width: min(56.25rem, 92vw);
  max-height: 88vh;
  background: #0F0F0F; border: 1px solid #2A2A2A;
  border-radius: 1.25rem; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: avpicker-enter 0.2s ease-out;
}
@keyframes avpicker-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.avpicker-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.125rem 1.5rem; border-bottom: 1px solid #1F1F1F;
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

/* Scrollable grid — capped so dialog doesn't exceed screen */
.avpicker-grid-wrap {
  padding: 1.25rem 1.5rem;
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
.avpicker-grid {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.75rem;
  width: 100%;
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
.avpicker-footer {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.875rem 1.5rem; border-top: 1px solid #1F1F1F; background: #0A0A0A;
}

/* Pagination */
.avpicker-pagination {
  display: flex; align-items: center; gap: 0.375rem;
}
.avpicker-page-btn {
  width: 1.875rem; height: 1.875rem;
  border-radius: 0.5rem;
  border: 1px solid #2A2A2A;
  background: #1A1A1A;
  color: #9CA3AF;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.12s;
}
.avpicker-page-btn:hover:not(:disabled) { background: #2A2A2A; color: #FFFFFF; border-color: #374151; }
.avpicker-page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.avpicker-page-info {
  font-family: 'Inter', sans-serif; font-size: 0.8125rem;
  color: #6B7280; min-width: 3.25rem; text-align: center;
}

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
