<template>
  <div class="cmi-wrap" :class="{ focused: inputFocused }">
    <div class="flex-1 relative" style="min-width:0;">
      <textarea
        ref="inputEl"
        v-model="localText"
        @keydown="onKeydown"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @paste="onPaste"
        :placeholder="isGroupChat ? t('chats.groupMessagePlaceholder') : t('chats.placeholder')"
        :rows="compact ? 1 : 3"
        class="cmi-textarea"
        :class="{ 'cmi-textarea-compact': compact }"
      />
      <!-- @Mention autocomplete popup -->
      <div
        v-if="showMentionPopup && mentionSuggestions.length > 0"
        class="cmi-mention-popup"
      >
        <div class="cmi-mention-popup-header">
          <span>{{ t('chats.mentionAgents') }}</span>
          <span class="cmi-mention-popup-hint">{{ t('chats.mentionNavigateHint') }}</span>
        </div>
        <div class="cmi-mention-popup-list">
          <button
            v-for="(s, idx) in mentionSuggestions"
            :key="s.id"
            class="cmi-mention-popup-item"
            :class="{ active: mentionActiveIndex === idx }"
            @mousedown.prevent="insertMention(s)"
            @mouseenter="showTooltip($event, s)"
            @mouseleave="hideTooltip"
          >
            <div class="cmi-mention-popup-avatar">
              <img v-if="getAvatarDataUriForAgent(s)" :src="getAvatarDataUriForAgent(s)" alt="" class="cmi-mention-popup-avatar-img" />
              <span v-else class="cmi-mention-popup-initial">{{ s.name.charAt(0) }}</span>
            </div>
            <div class="cmi-mention-popup-body">
              <div class="cmi-mention-popup-name-row">
                <span class="cmi-mention-popup-name">{{ s.name }}</span>
              </div>
              <span v-if="s.description" class="cmi-mention-popup-desc">{{ s.description }}</span>
            </div>
          </button>
          <button
            class="cmi-mention-popup-item cmi-mention-popup-item-all"
            :class="{ active: mentionActiveIndex === mentionSuggestions.length }"
            @mousedown.prevent="insertMentionAll"
          >
            <div class="cmi-mention-popup-avatar">
              <span class="cmi-mention-popup-initial cmi-mention-popup-initial-all">@</span>
            </div>
            <div class="cmi-mention-popup-body">
              <span class="cmi-mention-popup-name">all</span>
              <span class="cmi-mention-popup-desc">{{ t('chats.mentionBroadcastAll') }}</span>
            </div>
          </button>
        </div>
      </div>
      <!-- Fixed-position tooltip for @mention agent description -->
      <Teleport to="body">
        <div
          v-if="tooltip.visible"
          class="cmi-mention-tooltip-fixed"
          :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px' }"
        >
          <div class="cmi-mention-tooltip-name">{{ tooltip.name }}</div>
          <div class="cmi-mention-tooltip-text">{{ tooltip.text }}</div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, nextTick } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import { getAvatarDataUri } from '../agents/agentAvatars'
import { v4 as uuidv4 } from 'uuid'
import { useI18n } from '../../i18n/useI18n'

const props = defineProps({
  modelValue: { type: String, default: '' },
  agentIds: { type: Array, default: () => [] },
  isGroupChat: { type: Boolean, default: false },
  isRunning: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'send', 'stop', 'focus', 'blur', 'attach'])

const agentsStore = useAgentsStore()
const { t } = useI18n()

const inputEl = ref(null)
const inputFocused = ref(false)

// Local text synced with modelValue
const localText = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

// ── @Mention state ────────────────────────────────────────────────────────
const showMentionPopup = ref(false)
const mentionQuery = ref('')
const mentionActiveIndex = ref(0)
const mentionStartPos = ref(-1)
const tooltip = reactive({ visible: false, name: '', text: '', x: 0, y: 0 })

const mentionSuggestions = computed(() => {
  if (props.agentIds.length < 2) return []
  const q = mentionQuery.value.toLowerCase()
  return props.agentIds
    .map(id => agentsStore.getAgentById(id))
    .filter(a => a && (!q || a.name.toLowerCase().includes(q)))
})

function getAvatarDataUriForAgent(agent) {
  if (!agent?.avatar) return null
  return getAvatarDataUri(agent.avatar)
}


function checkMentionTrigger() {
  if (props.agentIds.length < 2) { showMentionPopup.value = false; return }
  const el = inputEl.value
  if (!el) return
  const text = el.value
  const cursorPos = el.selectionStart
  let atPos = -1
  for (let i = cursorPos - 1; i >= 0; i--) {
    if (text[i] === '@' && (i === 0 || /\s/.test(text[i - 1]))) {
      atPos = i
      break
    }
    if (/\s/.test(text[i])) break
  }
  if (atPos >= 0) {
    mentionStartPos.value = atPos
    mentionQuery.value = text.slice(atPos + 1, cursorPos)
    mentionActiveIndex.value = 0
    showMentionPopup.value = true
  } else {
    showMentionPopup.value = false
  }
}

function onInput(e) {
  autoResize(e)
  checkMentionTrigger()
}

function autoResize(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, props.compact ? 100 : 200) + 'px'
}

function onKeydown(e) {
  // When mention popup is open, intercept navigation and selection keys
  if (showMentionPopup.value && mentionSuggestions.value.length > 0) {
    const totalItems = mentionSuggestions.value.length + 1 // +1 for @all
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      mentionActiveIndex.value = (mentionActiveIndex.value + 1) % totalItems
      return
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      mentionActiveIndex.value = (mentionActiveIndex.value - 1 + totalItems) % totalItems
      return
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      if (mentionActiveIndex.value < mentionSuggestions.value.length) {
        insertMention(mentionSuggestions.value[mentionActiveIndex.value])
      } else {
        insertMentionAll()
      }
      return
    } else if (e.key === 'Escape') {
      e.preventDefault()
      showMentionPopup.value = false
      tooltip.visible = false
      return
    }
  }
  // Enter without modifiers sends the message
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault()
    emit('send', localText.value)
  }
}

function onFocus() {
  inputFocused.value = true
  emit('focus')
}

function onBlur() {
  inputFocused.value = false
  emit('blur')
  setTimeout(() => { showMentionPopup.value = false }, 200)
}

function insertMention(agent) {
  const el = inputEl.value
  if (!el || mentionStartPos.value < 0) return
  const before = localText.value.slice(0, mentionStartPos.value)
  const after = localText.value.slice(el.selectionStart)
  localText.value = `${before}@${agent.name} ${after}`
  showMentionPopup.value = false
  tooltip.visible = false
  nextTick(() => {
    const pos = before.length + 1 + agent.name.length + 1
    el.setSelectionRange(pos, pos)
    el.focus()
  })
}

function insertMentionAll() {
  const el = inputEl.value
  if (!el || mentionStartPos.value < 0) return
  const before = localText.value.slice(0, mentionStartPos.value)
  const after = localText.value.slice(el.selectionStart)
  localText.value = `${before}@all ${after}`
  showMentionPopup.value = false
  tooltip.visible = false
  nextTick(() => {
    const pos = before.length + 5
    el.setSelectionRange(pos, pos)
    el.focus()
  })
}

function showTooltip(event, agent) {
  if (!agent.description) { tooltip.visible = false; return }
  const rect = event.currentTarget.getBoundingClientRect()
  tooltip.name = agent.name
  tooltip.text = agent.description
  tooltip.x = rect.right + 12
  tooltip.y = rect.top + rect.height / 2
  tooltip.visible = true
}

function hideTooltip() {
  tooltip.visible = false
}

/**
 * Insert text at current cursor position in the textarea.
 */
function insertTextAtCursor(text) {
  const el = inputEl.value
  if (!el) {
    appendTextToInput(text)
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  const before = localText.value.slice(0, start)
  const after = localText.value.slice(end)
  localText.value = `${before}${text}${after}`
  nextTick(() => {
    const newPos = start + text.length
    el.setSelectionRange(newPos, newPos)
    el.focus()
  })
}

/**
 * Append text into the textarea (below existing content).
 */
function appendTextToInput(text) {
  const prefix = localText.value.trimEnd()
  localText.value = prefix ? `${prefix}\n${text}` : text
}

/**
 * Route resolved attachment results: images get chips + path in textarea;
 * all other types (path/folder/etc.) get only path in textarea.
 */
function handleAttachResults(results) {
  const imageAtts = []
  const pathTexts = []
  for (const att of results) {
    if (att.type === 'image') {
      const placeholder = att.path || att.name
      imageAtts.push({ ...att, placeholderText: placeholder })
      pathTexts.push(placeholder)
    } else {
      if (att.path) pathTexts.push(att.path)
    }
  }
  if (imageAtts.length > 0) emit('attach', imageAtts)
  if (pathTexts.length > 0) insertTextAtCursor(pathTexts.join('\n'))
}

/**
 * Handle paste: files from OS, path strings, or clipboard screenshots.
 * Emits 'attach' with image attachment objects for the parent to store.
 */
async function onPaste(e) {
  const cd = e.clipboardData

  if (window.electronAPI?.resolveDropPaths) {
    // 1. Files copied from OS (Ctrl+C in Explorer) — .path exposed by Electron
    const filePaths = Array.from(cd?.files || []).map(f => f.path).filter(Boolean)
    if (filePaths.length > 0) {
      e.preventDefault()
      try {
        const results = await window.electronAPI.resolveDropPaths(filePaths)
        if (results?.length > 0) handleAttachResults(results)
      } catch { /* ignore */ }
      return
    }

    // 2. Pasted path strings in text/plain
    const pasted = cd?.getData('text/plain') || ''
    const lines = pasted.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)
    const pathLines = lines.filter(l =>
      /^[A-Za-z]:[/\\]/.test(l) ||
      l.startsWith('/') ||
      l.startsWith('file://') ||
      l.startsWith('\\\\')
    )
    if (pathLines.length > 0 && pathLines.length === lines.length) {
      e.preventDefault()
      try {
        const results = await window.electronAPI.resolveDropPaths(pathLines)
        if (results?.length > 0) handleAttachResults(results)
      } catch { /* ignore */ }
      return
    }
  }

  // 3. Clipboard image (PrtSc / screenshot)
  const items = cd?.items
  if (items) {
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const mediaType = item.type
        const ext = mediaType.split('/')[1] || 'png'
        const name = `screenshot-${Date.now()}.${ext}`
        const placeholder = `[${name}]`
        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUri = ev.target.result
          const base64 = dataUri.split(',')[1]
          emit('attach', [{
            id: uuidv4(), name, type: 'image',
            base64, mediaType, preview: dataUri,
            size: file.size, path: null, placeholderText: placeholder,
          }])
          appendTextToInput(placeholder)
        }
        reader.readAsDataURL(file)
        return
      }
    }
  }
  // 4. Default text paste — browser handles it
}

// Expose focus() and resetHeight() for parent to call
function focus() {
  inputEl.value?.focus()
}

function resetHeight() {
  if (inputEl.value) inputEl.value.style.height = 'auto'
}

function insertTextAtCursorExposed(text) {
  insertTextAtCursor(text)
}

defineExpose({ focus, resetHeight, insertTextAtCursor: insertTextAtCursorExposed })
</script>

<style scoped>
.cmi-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cmi-textarea {
  width: 100%;
  background: transparent;
  resize: none;
  outline: none;
  line-height: 1.65;
  overflow-y: auto;
  color: #1A1A1A;
  font-size: var(--fs-body, 0.9375rem);
  min-height: 4.5rem;
  max-height: 12.5rem;
  font-family: 'Inter', sans-serif;
}

.cmi-textarea-compact {
  min-height: 2.25rem;
  max-height: 6.25rem;
  font-size: var(--fs-secondary, 0.875rem);
}
</style>

<!-- Unscoped: mention popup + tooltip need to work in both scoped and teleported contexts -->
<style>
.cmi-mention-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 0.375rem;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 0.875rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0,0,0,0.06);
  z-index: 50;
  min-width: 18.75rem;
  max-width: 23.75rem;
  overflow: hidden;
}
.cmi-mention-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.875rem 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9CA3AF;
  border-bottom: 1px solid #F0F0F0;
}
.cmi-mention-popup-hint {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.625rem;
  color: #D1D1D6;
}
.cmi-mention-popup-list {
  padding: 0.25rem 0;
  max-height: 20rem;
  overflow-y: auto;
  
}
.cmi-mention-popup-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  width: 100%;
  border: none;
  background: transparent;
  color: #1A1A1A;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  position: relative;
}
.cmi-mention-popup-item:hover,
.cmi-mention-popup-item.active {
  background: #F7F7F8;
}
.cmi-mention-popup-item.active {
  background: #F0F0F2;
}
.cmi-mention-popup-item + .cmi-mention-popup-item {
  border-top: 1px solid #F5F5F5;
}
.cmi-mention-popup-item-all {
  border-top: 1px solid #E5E5EA !important;
}
.cmi-mention-popup-avatar {
  flex-shrink: 0;
}
.cmi-mention-popup-avatar-img {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.cmi-mention-popup-initial {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.cmi-mention-popup-initial-all {
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
}
.cmi-mention-popup-body {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
}
.cmi-mention-popup-name-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.cmi-mention-popup-name {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1A1A1A;
  white-space: nowrap;
}
.cmi-mention-popup-meta {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  padding: 0.125rem 0.375rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.25rem;
  letter-spacing: 0.01em;
}
.cmi-mention-popup-desc {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 500;
  color: #374151;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cmi-mention-tooltip-fixed {
  position: fixed;
  transform: translateY(-50%);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-family: 'Inter', sans-serif;
  padding: 0.625rem 0.875rem;
  border-radius: 0.625rem;
  width: 17.5rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  z-index: 9999;
  pointer-events: none;
}
.cmi-mention-tooltip-fixed::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: #0F0F0F;
}
.cmi-mention-tooltip-name {
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.cmi-mention-tooltip-text {
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.5;
  white-space: normal;
}
</style>
