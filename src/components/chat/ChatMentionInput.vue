<template>
  <div class="cmi-wrap" :class="{ focused: inputFocused }">
    <div class="flex-1 relative" style="min-width:0;">
      <div
        ref="editorEl"
        class="cmi-editor"
        :class="{ 'cmi-editor-compact': compact }"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        :spellcheck="false"
        @input="onInput"
        @keydown="onKeydown"
        @focus="onFocus"
        @blur="onBlur"
        @paste="onPaste"
        @click="onEditorClick"
      />
      <span v-show="isEmpty" class="cmi-placeholder">{{ placeholderText }}</span>
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
import { ref, computed, reactive, nextTick, onMounted, watch } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import { getAvatarDataUri } from '../agents/agentAvatars'
import { v4 as uuidv4 } from 'uuid'
import { useI18n } from '../../i18n/useI18n'

const props = defineProps({
  modelValue: { type: String, default: '' },
  longBlobs: { type: Object, default: () => ({}) },
  agentIds: { type: Array, default: () => [] },
  isGroupChat: { type: Boolean, default: false },
  isRunning: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
})

const emit = defineEmits([
  'update:modelValue', 'update:longBlobs',
  'send', 'stop', 'escape', 'focus', 'blur', 'attach',
  'preview-blob',
])

const agentsStore = useAgentsStore()
const { t } = useI18n()

const editorEl = ref(null)
const inputFocused = ref(false)
// Tracks whether the most recent model update was caused by our own `onInput`.
// Prevents the modelValue watcher from wiping the DOM out from under the cursor.
let _suppressNextModelWatch = false
// Authoritative blob content map. `execCommand('insertHTML')` fires a
// synchronous `input` event BEFORE the parent's v-model update round-trips
// back to our props, so reading blob content from `props.longBlobs` inside
// `extractFromDOM` produces stale data and clobbers the parent state. This
// cache is populated the moment we know a blob exists (paste, draft restore,
// external update) and always reflects the current chip content.
const _blobCache = new Map()

const placeholderText = computed(() => {
  if (props.placeholder) return props.placeholder
  return props.isGroupChat ? t('chats.groupMessagePlaceholder') : t('chats.placeholder')
})

// Bumped whenever the editor DOM mutates (input, render, paste, mention insert).
// `isEmpty` consults the live DOM — relying on props.modelValue alone can lie
// during transient states (external set to empty, post-paste before round-trip,
// chip-only content with no text node, etc.) and leaks the placeholder.
const editorVersion = ref(0)
function bumpEditorVersion() { editorVersion.value++ }

const isEmpty = computed(() => {
  editorVersion.value
  if (props.modelValue) return false
  const root = editorEl.value
  if (!root) return true
  if (root.querySelector('.cmi-blob-chip')) return false
  return !(root.textContent && root.textContent.replace(/​/g, '').length > 0)
})

// ── Long-blob chip helpers ───────────────────────────────────────────────
const LONG_PASTE_THRESHOLD = 500

function chipPreviewLabel(content) {
  const preview = (content || '').slice(0, 10)
  const count = (content || '').length
  return t('chats.longInputChip', { preview, count })
}

function createChipNode(id, content) {
  const span = document.createElement('span')
  span.className = 'cmi-blob-chip'
  span.contentEditable = 'false'
  span.dataset.blobId = id

  const icon = document.createElement('span')
  icon.className = 'cmi-blob-chip__icon'
  icon.textContent = '📄'
  span.appendChild(icon)

  const label = document.createElement('button')
  label.type = 'button'
  label.className = 'cmi-blob-chip__label'
  label.dataset.role = 'preview'
  label.textContent = chipPreviewLabel(content)
  span.appendChild(label)

  const del = document.createElement('button')
  del.type = 'button'
  del.className = 'cmi-blob-chip__delete'
  del.dataset.role = 'delete'
  del.title = t('common.remove')
  del.textContent = '×'
  span.appendChild(del)

  return span
}

// ── DOM ↔ model sync ──────────────────────────────────────────────────────
function extractFromDOM() {
  const root = editorEl.value
  if (!root) return { text: '', longBlobs: {} }
  let text = ''
  const newLongBlobs = {}

  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        // Text
        text += child.nodeValue
      } else if (child.nodeType === 1) {
        const el = child
        if (el.classList?.contains('cmi-blob-chip')) {
          const id = el.dataset.blobId
          if (id) {
            text += `{{BLOB:${id}}}`
            // Prefer the local cache — it's always current, whereas
            // props.longBlobs may be one render cycle behind.
            if (_blobCache.has(id)) {
              newLongBlobs[id] = _blobCache.get(id)
            } else if (Object.prototype.hasOwnProperty.call(props.longBlobs, id)) {
              newLongBlobs[id] = props.longBlobs[id]
              _blobCache.set(id, props.longBlobs[id])
            }
          }
        } else if (el.tagName === 'BR') {
          text += '\n'
        } else if (el.tagName === 'DIV' || el.tagName === 'P') {
          // Chromium wraps Enter-produced blocks in <div>/<p>.
          // Insert a newline before the block unless we're at the start.
          if (text && !text.endsWith('\n')) text += '\n'
          walk(el)
        } else {
          walk(el)
        }
      }
    }
  }
  walk(root)
  return { text, longBlobs: newLongBlobs }
}

function renderFromModel(value, blobs) {
  const root = editorEl.value
  if (!root) return
  root.innerHTML = ''
  bumpEditorVersion()
  if (!value) return
  const parts = value.split(/(\{\{BLOB:[a-z0-9-]+\}\})/)
  for (const part of parts) {
    if (!part) continue
    const m = part.match(/^\{\{BLOB:([a-z0-9-]+)\}\}$/)
    if (m) {
      const id = m[1]
      const content = blobs?.[id] ?? _blobCache.get(id) ?? ''
      if (content) _blobCache.set(id, content)
      root.appendChild(createChipNode(id, content))
    } else {
      const lines = part.split('\n')
      lines.forEach((line, i) => {
        if (i > 0) root.appendChild(document.createElement('br'))
        if (line) root.appendChild(document.createTextNode(line))
      })
    }
  }
}

// Track plain-text offset of the caret (chips count as their {{BLOB:id}} length;
// this mirrors what extractFromDOM produces, so mention scanning works uniformly).
function getCaretTextOffset() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return -1
  const root = editorEl.value
  if (!root) return -1
  const range = sel.getRangeAt(0)
  if (!root.contains(range.endContainer)) return -1

  let offset = 0
  let found = false

  const walk = (node) => {
    if (found) return
    if (node === range.endContainer) {
      if (node.nodeType === 3) {
        offset += range.endOffset
      } else {
        // End is at a child-index position — count text up to that child.
        for (let i = 0; i < range.endOffset; i++) {
          const c = node.childNodes[i]
          if (c) offset += countLen(c)
        }
      }
      found = true
      return
    }
    if (node.nodeType === 3) {
      offset += node.nodeValue.length
      return
    }
    if (node.nodeType === 1) {
      const el = node
      if (el.classList?.contains('cmi-blob-chip')) {
        const id = el.dataset.blobId
        if (id) offset += `{{BLOB:${id}}}`.length
        return
      }
      if (el.tagName === 'BR') { offset += 1; return }
      if ((el.tagName === 'DIV' || el.tagName === 'P') && offset > 0) {
        // The block boundary will add a newline when extracted.
        offset += 1
      }
      for (const c of el.childNodes) { walk(c); if (found) return }
    }
  }

  const countLen = (node) => {
    if (node.nodeType === 3) return node.nodeValue.length
    if (node.nodeType !== 1) return 0
    const el = node
    if (el.classList?.contains('cmi-blob-chip')) {
      const id = el.dataset.blobId
      return id ? `{{BLOB:${id}}}`.length : 0
    }
    if (el.tagName === 'BR') return 1
    let n = 0
    for (const c of el.childNodes) n += countLen(c)
    if (el.tagName === 'DIV' || el.tagName === 'P') n += 1
    return n
  }

  walk(root)
  return found ? offset : -1
}

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
  const text = props.modelValue
  const cursorPos = getCaretTextOffset()
  if (cursorPos < 0) { showMentionPopup.value = false; return }
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

// ── Input handling ─────────────────────────────────────────────────────────
function emitModel() {
  const { text, longBlobs } = extractFromDOM()
  bumpEditorVersion()
  _suppressNextModelWatch = true
  emit('update:modelValue', text)
  emit('update:longBlobs', longBlobs)
  // Watcher only fires on actual value change; an emit that round-trips to
  // the same modelValue (e.g. IME composition no-ops) leaves the latch set.
  // A later external clear (sendMessage → inputText='') would then be silently
  // suppressed, leaving the editor showing stale text. Reset on next tick so
  // the latch never outlives the emit it was meant to guard.
  nextTick(() => { _suppressNextModelWatch = false })
}

function onInput() {
  bumpEditorVersion()
  emitModel()
  nextTick(checkMentionTrigger)
}

function onEditorClick(e) {
  const previewBtn = e.target.closest('.cmi-blob-chip__label')
  if (previewBtn) {
    e.preventDefault()
    const chip = previewBtn.closest('.cmi-blob-chip')
    const content = props.longBlobs[chip?.dataset.blobId] || ''
    if (content) emit('preview-blob', content)
    return
  }
  const deleteBtn = e.target.closest('.cmi-blob-chip__delete')
  if (deleteBtn) {
    e.preventDefault()
    const chip = deleteBtn.closest('.cmi-blob-chip')
    if (chip) {
      chip.remove()
      emitModel()
    }
    return
  }
}

function onKeydown(e) {
  // Mention popup navigation
  if (showMentionPopup.value && mentionSuggestions.value.length > 0) {
    const totalItems = mentionSuggestions.value.length + 1
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
      e.stopPropagation()
      showMentionPopup.value = false
      tooltip.visible = false
      return
    }
  }
  // Escape (no popup) → parent handles interrupt / retrieve
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('escape')
    return
  }
  // Enter without modifiers sends; Shift+Enter inserts a single line break.
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault()
    emit('send', props.modelValue)
    return
  }
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    // insertLineBreak makes a plain <br> (goes through the native undo stack
    // in Chromium so Ctrl+Z reverses it like any other edit).
    try { document.execCommand('insertLineBreak') } catch { /* ignore */ }
    nextTick(emitModel)
    return
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

// ── Selection helpers ─────────────────────────────────────────────────────
// Vue can rebuild the contenteditable's children between a setStart() call
// and the eventual addRange(), leaving the range pointing at a detached node.
// Browsers throw "addRange(): The given range isn't in document" in that case.
// safeAddRange swallows the error path by verifying both endpoints are still
// connected to the live document before applying the selection.
function safeAddRange(sel, range) {
  if (!sel || !range) return
  const start = range.startContainer
  const end = range.endContainer
  if (!start || !start.isConnected) return
  if (end && !end.isConnected) return
  sel.removeAllRanges()
  sel.addRange(range)
}

function placeCaretAtTextOffset(targetOffset) {
  const root = editorEl.value
  if (!root) return
  let remaining = targetOffset
  let done = false

  const setCaret = (node, offset) => {
    const sel = window.getSelection()
    const range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    safeAddRange(sel, range)
  }

  const walk = (node) => {
    if (done) return
    if (node.nodeType === 3) {
      const len = node.nodeValue.length
      if (remaining <= len) {
        setCaret(node, remaining)
        done = true
      } else {
        remaining -= len
      }
      return
    }
    if (node.nodeType === 1) {
      const el = node
      if (el.classList?.contains('cmi-blob-chip')) {
        const id = el.dataset.blobId
        const len = id ? `{{BLOB:${id}}}`.length : 0
        if (remaining <= 0) {
          // Place cursor before the chip
          const parent = el.parentNode
          const idx = Array.prototype.indexOf.call(parent.childNodes, el)
          setCaret(parent, idx)
          done = true
          return
        }
        remaining -= len
        return
      }
      if (el.tagName === 'BR') {
        if (remaining <= 0) {
          const parent = el.parentNode
          const idx = Array.prototype.indexOf.call(parent.childNodes, el)
          setCaret(parent, idx)
          done = true
          return
        }
        remaining -= 1
        return
      }
      for (const c of el.childNodes) { walk(c); if (done) return }
    }
  }
  walk(root)
  if (!done) {
    // Fall back to end of root
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
    safeAddRange(sel, range)
  }
}

function replaceTextRange(startOffset, endOffset, replacement) {
  const before = props.modelValue.slice(0, startOffset)
  const after = props.modelValue.slice(endOffset)
  const newValue = `${before}${replacement}${after}`
  _suppressNextModelWatch = true
  emit('update:modelValue', newValue)
  // Re-render is triggered by the modelValue watcher below? No — we suppressed it.
  // Do the DOM rewrite explicitly so the caret math stays correct.
  renderFromModel(newValue, props.longBlobs)
  nextTick(() => {
    _suppressNextModelWatch = false
    editorEl.value?.focus()
    placeCaretAtTextOffset(before.length + replacement.length)
  })
}

function insertMention(agent) {
  if (mentionStartPos.value < 0) return
  const cursor = getCaretTextOffset()
  if (cursor < 0) return
  const replacement = `@${agent.name} `
  showMentionPopup.value = false
  tooltip.visible = false
  replaceTextRange(mentionStartPos.value, cursor, replacement)
}

function insertMentionAll() {
  if (mentionStartPos.value < 0) return
  const cursor = getCaretTextOffset()
  if (cursor < 0) return
  showMentionPopup.value = false
  tooltip.visible = false
  replaceTextRange(mentionStartPos.value, cursor, '@all ')
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

// ── Attach integration ────────────────────────────────────────────────────
function appendTextAtEnd(text) {
  const prefix = (props.modelValue || '').trimEnd()
  const newValue = prefix ? `${prefix}\n${text}` : text
  _suppressNextModelWatch = true
  emit('update:modelValue', newValue)
  renderFromModel(newValue, props.longBlobs)
  nextTick(() => { _suppressNextModelWatch = false })
}

function insertTextAtCursor(text) {
  editorEl.value?.focus()
  try { document.execCommand('insertText', false, text) } catch { appendTextAtEnd(text); return }
  emitModel()
}

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

// ── Paste ─────────────────────────────────────────────────────────────────
async function onPaste(e) {
  const cd = e.clipboardData

  if (window.electronAPI?.resolveDropPaths) {
    const filePaths = Array.from(cd?.files || []).map(f => f.path).filter(Boolean)
    if (filePaths.length > 0) {
      e.preventDefault()
      try {
        const results = await window.electronAPI.resolveDropPaths(filePaths)
        if (results?.length > 0) handleAttachResults(results)
      } catch { /* ignore */ }
      return
    }

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

  // Clipboard image (PrtSc / screenshot)
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
          appendTextAtEnd(placeholder)
        }
        reader.readAsDataURL(file)
        return
      }
    }
  }

  // Long text paste → insert chip at cursor
  const text = cd?.getData('text/plain') || ''
  if (text.length > LONG_PASTE_THRESHOLD) {
    e.preventDefault()
    const id = uuidv4()
    // Authoritative write happens to the local cache first — extractFromDOM
    // fires synchronously from execCommand's `input` event, before the v-model
    // update round-trips back through props, so props.longBlobs is stale at
    // that moment and can't be trusted for the new id.
    _blobCache.set(id, text)
    const nextBlobs = { ...props.longBlobs, [id]: text }
    emit('update:longBlobs', nextBlobs)
    // execCommand writes into the native undo stack, so Ctrl+Z reverses the
    // chip insertion just like any other edit. We append a trailing
    // zero-width space so there's a real text node after the chip for the
    // cursor to land in, then explicitly move the caret past the chip —
    // otherwise execCommand sometimes leaves the caret sandwiched between
    // the chip and the ZWSP in a position where the next keystroke ends up
    // visually before the chip.
    const chip = createChipNode(id, text)
    editorEl.value?.focus()
    const ZWSP = '​'
    let inserted = false
    try {
      if (document.execCommand('insertHTML', false, chip.outerHTML + ZWSP)) {
        inserted = true
      }
    } catch { /* fall through to Range API */ }
    if (!inserted) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        range.insertNode(chip)
        const zwsp = document.createTextNode(ZWSP)
        chip.parentNode.insertBefore(zwsp, chip.nextSibling)
      } else {
        editorEl.value?.appendChild(chip)
        editorEl.value?.appendChild(document.createTextNode(ZWSP))
      }
    }
    // Place the caret AFTER the chip (just past the trailing ZWSP) so the
    // next keystroke appears to the right of the chip, not inside it or
    // before it.
    const insertedChip = editorEl.value?.querySelector(`[data-blob-id="${id}"]`)
    if (insertedChip) {
      const sel = window.getSelection()
      const range = document.createRange()
      const after = insertedChip.nextSibling
      if (after && after.nodeType === 3) {
        range.setStart(after, after.nodeValue.length)
      } else {
        range.setStartAfter(insertedChip)
      }
      range.collapse(true)
      safeAddRange(sel, range)
    }
    nextTick(emitModel)
    return
  }
  // Short text — let the browser paste as plain text (avoids styled HTML).
  if (text) {
    e.preventDefault()
    try { document.execCommand('insertText', false, text) } catch { /* ignore */ }
    nextTick(emitModel)
  }
}

// ── External modelValue sync ──────────────────────────────────────────────
watch(() => props.modelValue, (newVal) => {
  if (_suppressNextModelWatch) {
    _suppressNextModelWatch = false
    return
  }
  const { text } = extractFromDOM()
  if (text === newVal) return
  renderFromModel(newVal, props.longBlobs)
})

watch(() => props.longBlobs, (blobs) => {
  if (_suppressNextModelWatch) return
  const root = editorEl.value
  if (!root) return
  // Refresh chip labels when the blob map changes from outside (e.g. draft
  // restore). Only apply content we actually have — an empty `blobs` from a
  // transient round-trip must not blank out labels we already know are correct.
  for (const chip of root.querySelectorAll('.cmi-blob-chip')) {
    const id = chip.dataset.blobId
    if (!id) continue
    const external = blobs?.[id]
    if (external != null && external !== _blobCache.get(id)) {
      _blobCache.set(id, external)
      const label = chip.querySelector('.cmi-blob-chip__label')
      if (label) label.textContent = chipPreviewLabel(external)
    }
  }
}, { deep: true })

onMounted(() => {
  renderFromModel(props.modelValue, props.longBlobs)
})

// ── Exposed API ──────────────────────────────────────────────────────────
function focus() {
  const el = editorEl.value
  if (!el) return
  el.focus()
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  safeAddRange(sel, range)
}

function resetHeight() {
  if (editorEl.value) editorEl.value.style.height = ''
}

defineExpose({ focus, resetHeight, insertTextAtCursor })
</script>

<style scoped>
.cmi-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cmi-editor {
  width: 100%;
  background: transparent;
  outline: none;
  line-height: 1.65;
  overflow-y: auto;
  color: #1A1A1A;
  font-size: var(--fs-body, 0.9375rem);
  min-height: 4.5rem;
  max-height: 12.5rem;
  font-family: 'Inter', sans-serif;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
}
.cmi-editor-compact {
  min-height: 2.25rem;
  max-height: 6.25rem;
  font-size: var(--fs-secondary, 0.875rem);
}
.cmi-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  padding-top: 0; /* inherits editor line-height */
  color: #9CA3AF;
  pointer-events: none;
  font-size: var(--fs-body, 0.9375rem);
  line-height: 1.65;
  user-select: none;
}
.cmi-editor-compact + .cmi-placeholder,
.cmi-editor-compact ~ .cmi-placeholder {
  font-size: var(--fs-secondary, 0.875rem);
}
</style>

<!-- Unscoped: chip nodes are injected via DOM APIs, so scoped [data-v-*] selectors would miss them -->
<style>
.cmi-blob-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.45rem 0.15rem 0.35rem;
  margin: 0 0.125rem;
  background: linear-gradient(135deg, #5C4033, #8B6F5E);
  border-radius: 0.65rem;
  font-size: 0.78rem;
  color: #FFF8F0;
  max-width: 18rem;
  box-shadow: 0 1px 4px rgba(92, 64, 51, 0.3);
  vertical-align: middle;
  user-select: none;
  white-space: nowrap;
}
.cmi-blob-chip__icon {
  flex-shrink: 0;
  font-size: 0.75rem;
  line-height: 1;
}
.cmi-blob-chip__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: none;
  border: none;
  color: inherit;
  font-size: inherit;
  cursor: pointer;
  padding: 0;
  min-width: 0;
  max-width: 14rem;
  font-family: inherit;
  line-height: 1.3;
}
.cmi-blob-chip__label:hover { text-decoration: underline; }
.cmi-blob-chip__delete {
  background: none;
  border: none;
  color: rgba(255, 248, 240, 0.6);
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0 0.125rem;
  flex-shrink: 0;
}
.cmi-blob-chip__delete:hover { color: #FFF8F0; }
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
