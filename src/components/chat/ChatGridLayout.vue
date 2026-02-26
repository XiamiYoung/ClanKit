<template>
  <div class="grid-layout">
    <!-- Toolbar -->
    <div class="grid-toolbar">
      <button class="grid-back-btn" @click="$emit('exit-grid')" title="Back to single view">
        <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        <span>Single view</span>
      </button>

      <div class="grid-count-pills">
        <button
          v-for="n in gridOptions"
          :key="n"
          class="grid-pill"
          :class="{ active: gridCount === n }"
          @click="$emit('update:gridCount', n)"
        >
          {{ n }}
        </button>
      </div>

      <button class="grid-new-btn" @click="$emit('new-chat')" title="New chat in grid">
        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>New Chat</span>
      </button>
    </div>

    <!-- Grid area (relative wrapper for handle overlay) -->
    <div class="grid-area">
      <div ref="containerEl" class="grid-container" :style="gridStyle">
        <ChatGridPanel
          v-for="(chatId, idx) in gridChatIds"
          :key="chatId"
          :chatId="chatId"
          :gridChatIds="gridChatIds"
          class="grid-cell"
          :style="cellBorderStyle(idx)"
          @select="$emit('select-chat', chatId)"
          @swap-chat="(oldId, newId) => $emit('swap-chat', oldId, newId)"
          @maximize="$emit('maximize-chat', chatId)"
        />
      </div>

      <!-- Resize overlay handles -->
      <template v-if="containerEl">
        <!-- Vertical dividers (between columns) -->
        <div
          v-for="ci in (cols - 1)"
          :key="'cv-' + ci"
          class="grid-handle-v"
          :style="vHandleStyle(ci)"
          @mousedown.prevent="startColResize($event, ci - 1)"
        ></div>
        <!-- Horizontal dividers (between rows) -->
        <div
          v-for="ri in (rows - 1)"
          :key="'rh-' + ri"
          class="grid-handle-h"
          :style="hHandleStyle(ri)"
          @mousedown.prevent="startRowResize($event, ri - 1)"
        ></div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import ChatGridPanel from './ChatGridPanel.vue'

const props = defineProps({
  gridCount: { type: Number, default: 4 },
  gridChatIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:gridCount', 'update:gridChatIds', 'exit-grid', 'new-chat', 'select-chat', 'swap-chat', 'maximize-chat'])

const gridOptions = [2, 4, 8]
const containerEl = ref(null)

// Layout calculations
const cols = computed(() => {
  if (props.gridCount <= 2) return 2
  if (props.gridCount <= 4) return 2
  return 4
})

const rows = computed(() => {
  if (props.gridCount <= 2) return 1
  return 2
})

// Resizable sizes stored as percentages (0-100)
const colPcts = ref([])
const rowPcts = ref([])

function resetSizes() {
  const c = cols.value
  const r = rows.value
  colPcts.value = Array(c).fill(100 / c)
  rowPcts.value = Array(r).fill(100 / r)
}

watch(() => props.gridCount, () => { resetSizes() }, { immediate: true })

const gridStyle = computed(() => {
  const colTemplate = colPcts.value.map(p => `${p}%`).join(' ')
  const rowTemplate = rowPcts.value.map(p => `${p}%`).join(' ')
  return {
    gridTemplateColumns: colTemplate,
    gridTemplateRows: rowTemplate,
  }
})

function cellBorderStyle(idx) {
  const col = idx % cols.value
  const row = Math.floor(idx / cols.value)
  const styles = {}
  if (col < cols.value - 1) styles.borderRight = '1px solid #9CA3AF'
  if (row < rows.value - 1) styles.borderBottom = '1px solid #9CA3AF'
  return styles
}

// Compute cumulative percentage positions for handles
function vHandleStyle(ci) {
  // ci is 1-based (1 = first divider, between col 0 and col 1)
  const cumPct = colPcts.value.slice(0, ci).reduce((a, b) => a + b, 0)
  return {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: `calc(${cumPct}% - 4px)`,
    width: '8px',
    cursor: 'col-resize',
    pointerEvents: 'auto',
  }
}

function hHandleStyle(ri) {
  const cumPct = rowPcts.value.slice(0, ri).reduce((a, b) => a + b, 0)
  return {
    position: 'absolute',
    left: '0',
    right: '0',
    top: `calc(${cumPct}% - 4px)`,
    height: '8px',
    cursor: 'row-resize',
    pointerEvents: 'auto',
  }
}

// ── Resize logic ──
let resizing = false
let resizeType = ''
let resizeIndex = 0
let startPos = 0
let startPcts = []

function startColResize(e, colIdx) {
  resizing = true
  resizeType = 'col'
  resizeIndex = colIdx
  startPos = e.clientX
  startPcts = [...colPcts.value]
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function startRowResize(e, rowIdx) {
  resizing = true
  resizeType = 'row'
  resizeIndex = rowIdx
  startPos = e.clientY
  startPcts = [...rowPcts.value]
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e) {
  if (!resizing || !containerEl.value) return

  const minPct = 10 // minimum 10% per panel

  if (resizeType === 'col') {
    const totalWidth = containerEl.value.clientWidth
    const deltaPx = e.clientX - startPos
    const deltaPct = (deltaPx / totalWidth) * 100

    const newPcts = [...startPcts]
    newPcts[resizeIndex] = Math.max(minPct, startPcts[resizeIndex] + deltaPct)
    newPcts[resizeIndex + 1] = Math.max(minPct, startPcts[resizeIndex + 1] - deltaPct)

    // Only apply if both are above minimum
    if (newPcts[resizeIndex] >= minPct && newPcts[resizeIndex + 1] >= minPct) {
      colPcts.value = newPcts
    }
  } else {
    const totalHeight = containerEl.value.clientHeight
    const deltaPx = e.clientY - startPos
    const deltaPct = (deltaPx / totalHeight) * 100

    const newPcts = [...startPcts]
    newPcts[resizeIndex] = Math.max(minPct, startPcts[resizeIndex] + deltaPct)
    newPcts[resizeIndex + 1] = Math.max(minPct, startPcts[resizeIndex + 1] - deltaPct)

    if (newPcts[resizeIndex] >= minPct && newPcts[resizeIndex + 1] >= minPct) {
      rowPcts.value = newPcts
    }
  }
}

function onResizeEnd() {
  resizing = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})
</script>

<style scoped>
.grid-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-height: 0;
  background: var(--bg-main, #F2F2F7);
  position: relative;
}

.grid-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-card, #FFFFFF);
  border-bottom: 1px solid var(--border, #E5E5EA);
  flex-shrink: 0;
  gap: 12px;
}

.grid-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--text-secondary, #6B7280);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.grid-back-btn:hover {
  background: var(--bg-hover, #F5F5F5);
  color: var(--text-primary, #1A1A1A);
}

.grid-count-pills {
  display: flex;
  gap: 0;
  background: #F2F2F7;
  border-radius: var(--radius-sm, 8px);
  padding: 2px;
}

.grid-pill {
  padding: 5px 16px;
  border: none;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
  color: var(--text-secondary, #6B7280);
}
.grid-pill.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.grid-pill:not(.active):hover {
  background: rgba(0,0,0,0.04);
  color: var(--text-primary, #1A1A1A);
}

.grid-new-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.grid-new-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

.grid-area {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.grid-container {
  display: grid;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-card, #FFFFFF);
}

.grid-cell {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* Vertical resize handle (positioned absolutely in .grid-area) */
.grid-handle-v {
  position: absolute;
  z-index: 10;
}
.grid-handle-v::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 3px;
  background: linear-gradient(180deg, #9CA3AF 0%, #6B7280 50%, #9CA3AF 100%);
  transition: all 0.15s ease;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.grid-handle-v:hover::after {
  background: linear-gradient(180deg, #4B5563 0%, #374151 50%, #4B5563 100%);
  width: 4px;
  left: 2px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}

/* Horizontal resize handle (positioned absolutely in .grid-area) */
.grid-handle-h {
  position: absolute;
  z-index: 10;
}
.grid-handle-h::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 2px;
  height: 3px;
  background: linear-gradient(90deg, #9CA3AF 0%, #6B7280 50%, #9CA3AF 100%);
  transition: all 0.15s ease;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.grid-handle-h:hover::after {
  background: linear-gradient(90deg, #4B5563 0%, #374151 50%, #4B5563 100%);
  height: 4px;
  top: 2px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}
</style>
