<template>
  <Teleport to="body">
    <div v-if="focusStore.isFocusMode" class="focus-root" :class="{ 'focus-resizing': isResizing }">

      <!-- Chat panel -->
      <div
        v-show="focusStore.showChat"
        class="focus-panel focus-chat-panel"
        :style="chatPanelStyle"
      >
        <ChatsView ref="chatsViewRef" class="focus-inner" />
      </div>

      <!-- Resize handle (only when both panels visible) -->
      <div
        v-if="showBothPanels"
        class="focus-resize-handle"
        @mousedown.prevent="startResize"
      />

      <!-- Docs panel -->
      <div
        v-show="focusStore.showDocs"
        class="focus-panel focus-docs-panel"
        :style="docsPanelStyle"
      >
        <DocsView ref="docsViewRef" class="focus-inner" :is-embedded="true" />
      </div>

      <!-- Transparent overlay during resize to prevent webview/iframe stealing mouse events -->
      <div v-if="isResizing" class="focus-resize-overlay" />

      <!-- Both hidden message -->
      <div v-if="!focusStore.showChat && !focusStore.showDocs" class="focus-both-hidden">
        <span>No panels visible — use the bar above to show a panel.</span>
      </div>

      <!-- Floating control bar -->
      <FocusModeBar />
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useFocusModeStore } from '../stores/focusMode'
import { useObsidianStore } from '../stores/obsidian'
import { useChatsStore } from '../stores/chats'
import ChatsView from './ChatsView.vue'
import DocsView from './DocsView.vue'
import FocusModeBar from '../components/focus/FocusModeBar.vue'

const focusStore  = useFocusModeStore()
const obsidian    = useObsidianStore()
const chatsStore  = useChatsStore()

const chatsViewRef = ref(null)
const docsViewRef  = ref(null)

// Find the first file node in the tree (depth-first)
function findFirstFile(nodes) {
  for (const node of nodes) {
    if (node.type === 'file') return node
    if (node.children?.length) {
      const found = findFirstFile(node.children)
      if (found) return found
    }
  }
  return null
}

// Collapse sidebars + restore/open doc when entering focus mode
watch(() => focusStore.isFocusMode, async (active) => {
  if (!active) return
  await nextTick()
  if (chatsViewRef.value) chatsViewRef.value.chatSidebarCollapsed = true
  if (chatsViewRef.value?.chatHeaderRef) chatsViewRef.value.chatHeaderRef.headerExpanded = false
  if (docsViewRef.value)  docsViewRef.value.docTreeCollapsed       = true

  // Restore last chat selection
  if (focusStore.lastChatId) {
    chatsStore.setActiveChat(focusStore.lastChatId)
  }

  // Restore last doc, or open first available doc
  if (focusStore.lastDocPath) {
    await obsidian.openFile(focusStore.lastDocPath, focusStore.lastDocName)
  } else if (!obsidian.activeFile) {
    const first = findFirstFile(obsidian.fileTree)
    if (first) await obsidian.openFile(first.path, first.name)
  }
})

// Track last selected doc while in focus mode
watch(() => obsidian.activeFile, (file) => {
  if (!focusStore.isFocusMode) return
  focusStore.lastDocPath = file?.path ?? null
  focusStore.lastDocName = file?.name ?? null
})

// Track last selected chat while in focus mode
watch(() => chatsStore.activeChatId, (id) => {
  if (!focusStore.isFocusMode) return
  focusStore.lastChatId = id ?? null
})

// Split ratio — fraction of total width given to chat panel (default 50%)
const splitRatio = ref(0.5)

const showBothPanels = computed(() => focusStore.showChat && focusStore.showDocs)

const chatPanelStyle = computed(() => {
  if (!showBothPanels.value) return { flex: '1' }
  return { width: `${splitRatio.value * 100}%`, flex: 'none' }
})

const docsPanelStyle = computed(() => {
  if (!showBothPanels.value) return { flex: '1' }
  // Docs panel takes the remaining width (minus 4px for the resize handle)
  return { width: `calc(${(1 - splitRatio.value) * 100}% - 4px)`, flex: 'none' }
})

// ── Drag resize ────────────────────────────────────────────────────────────
const isResizing = ref(false)

function startResize(e) {
  if (e.button !== 0) return
  e.stopPropagation()
  isResizing.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', stopResize)
}

function onResizeMove(e) {
  if (!isResizing.value) return
  const ratio = e.clientX / window.innerWidth
  splitRatio.value = Math.max(0.2, Math.min(0.8, ratio))
}

function stopResize() {
  isResizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', stopResize)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<style>
/* Unscoped — teleported to body */
.focus-root {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: row;
  background: #F2F2F7;
  overflow: hidden;
}

.focus-panel {
  display: flex;
  flex-direction: column;
  min-width: 17.5rem; /* 280px */
  overflow: hidden;
}

.focus-inner {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.focus-resize-handle {
  width: 4px;
  flex-shrink: 0;
  background: #E5E5EA;
  cursor: col-resize;
  transition: background 0.15s ease;
  z-index: 2;
}
.focus-resize-handle:hover,
.focus-resizing .focus-resize-handle {
  background: #007AFF;
}

/* Covers entire screen during drag to prevent webview/iframe from stealing mouse events */
.focus-resize-overlay {
  position: fixed;
  inset: 0;
  z-index: 101;
  cursor: col-resize;
}

/* Disable pointer events on panels during resize so webview can't interfere */
.focus-resizing .focus-panel {
  pointer-events: none;
}

.focus-both-hidden {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', sans-serif;
  font-size: 0.9375rem;
  color: #9CA3AF;
}
</style>
