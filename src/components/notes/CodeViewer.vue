<template>
  <div class="code-viewer-wrap" :class="[`cv-theme-${theme}`]" @keydown="onKeydown" tabindex="0">
    <!-- Toolbar -->
    <div class="cv-toolbar">
      <div class="cv-toolbar-left">
        <button class="cv-tb-btn" :class="{ active: editMode }" @click="toggleEdit" title="Toggle edit mode">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          {{ editMode ? 'Editing' : 'Edit' }}
        </button>
      </div>
      <div class="cv-toolbar-right">
        <button class="cv-tb-btn" :class="{ active: theme === 'dark' }" @click="$emit('update:theme', 'dark')" title="Dark theme">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <button class="cv-tb-btn" :class="{ active: theme === 'light' }" @click="$emit('update:theme', 'light')" title="Light theme">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </button>
      </div>
    </div>

    <!-- Edit mode: plain textarea -->
    <textarea
      v-if="editMode"
      class="cv-edit-area"
      :value="props.content"
      @input="e => emit('content-change', e.target.value)"
      spellcheck="false"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
    />

    <!-- Read mode: highlighted table -->
    <div v-else class="code-viewer-scroll" ref="scrollRef">
      <table class="code-viewer-table">
        <tbody>
          <tr
            v-for="(line, i) in lines"
            :key="i"
            :class="{ 'cv-line-selected': isLineSelected(i), 'cv-line-highlighted': isLineHighlighted(i) }"
          >
            <td
              class="code-line-num"
              :data-line="i + 1"
              @click="onLineNumClick(i, $event)"
              @mousedown.prevent
            >{{ i + 1 }}</td>
            <td class="code-line-content" v-html="line"></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import hljs from 'highlight.js'

const props = defineProps({
  content: { type: String, default: '' },
  fileName: { type: String, default: '' },
  theme: { type: String, default: 'dark' },
})

const emit = defineEmits(['ai-edit', 'content-change', 'update:theme'])

const scrollRef = ref(null)
const selStart = ref(-1)
const selEnd = ref(-1)
const hlStart = ref(-1)
const hlEnd = ref(-1)
const editMode = ref(false)

function toggleEdit() {
  editMode.value = !editMode.value
  if (editMode.value) {
    selStart.value = -1
    selEnd.value = -1
  }
}

const EXT_TO_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
  vue: 'xml', svelte: 'xml',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
  java: 'java', kt: 'kotlin', scala: 'scala', dart: 'dart',
  c: 'c', cpp: 'cpp', h: 'c', cs: 'csharp',
  swift: 'swift', ex: 'elixir', lua: 'lua', r: 'r',
  php: 'php', pl: 'perl',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
  sql: 'sql',
  html: 'xml', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  ini: 'ini', cfg: 'ini', conf: 'ini',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  md: 'markdown',
  env: 'bash', gitignore: 'bash',
}

const lang = computed(() => {
  const ext = (props.fileName.split('.').pop() || '').toLowerCase()
  return EXT_TO_LANG[ext] || null
})

const rawLines = computed(() => {
  if (!props.content) return ['']
  return props.content.split('\n')
})

const lines = computed(() => {
  if (!props.content) return ['']
  let highlighted
  try {
    if (lang.value && hljs.getLanguage(lang.value)) {
      highlighted = hljs.highlight(props.content, { language: lang.value }).value
    } else {
      highlighted = hljs.highlightAuto(props.content).value
    }
  } catch {
    highlighted = props.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
  return highlighted.split('\n')
})

function isLineSelected(idx) {
  if (selStart.value < 0) return false
  const lo = Math.min(selStart.value, selEnd.value)
  const hi = Math.max(selStart.value, selEnd.value)
  return idx >= lo && idx <= hi
}

function onLineNumClick(idx, e) {
  if (e.shiftKey && selStart.value >= 0) {
    selEnd.value = idx
  } else {
    selStart.value = idx
    selEnd.value = idx
  }
}

function clearSelection() {
  selStart.value = -1
  selEnd.value = -1
}

function isLineHighlighted(idx) {
  if (hlStart.value < 0) return false
  return idx >= hlStart.value && idx <= hlEnd.value
}

function setHighlightedLines(start, end) {
  hlStart.value = start
  hlEnd.value = end
}

function clearHighlightedLines() {
  hlStart.value = -1
  hlEnd.value = -1
}

function getSelectedText() {
  if (selStart.value < 0) return null
  const lo = Math.min(selStart.value, selEnd.value)
  const hi = Math.max(selStart.value, selEnd.value)
  const text = rawLines.value.slice(lo, hi + 1).join('\n')
  return { text, startLine: lo, endLine: hi }
}

function replaceSelectedText(newText) {
  if (selStart.value < 0) return
  const lo = Math.min(selStart.value, selEnd.value)
  const hi = Math.max(selStart.value, selEnd.value)
  const allLines = rawLines.value.slice()
  const newLines = newText.split('\n')
  allLines.splice(lo, hi - lo + 1, ...newLines)
  emit('content-change', allLines.join('\n'))
  clearSelection()
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    const data = getSelectedText()
    if (!data || !data.text.trim()) return
    e.preventDefault()
    e.stopPropagation()
    const tableEl = scrollRef.value?.querySelector('.code-viewer-table')
    const rows = tableEl?.querySelectorAll('tr')
    let rect = { bottom: 200, left: 200 }
    if (rows && rows[data.endLine]) {
      rect = rows[data.endLine].getBoundingClientRect()
    }
    const ext = (props.fileName.split('.').pop() || '').toLowerCase()
    emit('ai-edit', {
      selectedText: data.text,
      position: {
        top: Math.min(rect.bottom + 8, window.innerHeight - 320),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 520)),
      },
      fileContext: { fileName: props.fileName, filePath: '', language: ext },
      replaceCallback: (newText) => replaceSelectedText(newText),
    })
  }
  if (e.key === 'Escape') clearSelection()
}

defineExpose({ getSelectedText, replaceSelectedText, clearSelection, setHighlightedLines, clearHighlightedLines })
</script>

<style>
/* ── Wrapper ── */
.code-viewer-wrap {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid #2C2C2E;
  border-radius: 8px;
  outline: none;
}

/* ── Toolbar ── */
.cv-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.3rem 0.6rem;
  border-bottom: 1px solid #2C2C2E;
  flex-shrink: 0;
}
.cv-toolbar-left, .cv-toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.cv-tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.5rem;
  border-radius: 5px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: 0.7rem;
  font-weight: 500;
  transition: background 0.12s, color 0.12s;
}
.cv-tb-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}

/* ── Edit textarea ── */
.cv-edit-area {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  padding: 1rem 1.25rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-secondary);
  line-height: 1.6;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
  scrollbar-width: thin;
}

/* ── Scroll container ── */
.code-viewer-scroll {
  flex: 1;
  overflow: auto;
  scrollbar-width: thin;
  padding: 1rem 0;
}
.code-viewer-table {
  border-collapse: collapse;
  width: 100%;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-secondary);
  line-height: 1.6;
}
.code-line-num {
  width: 1px;
  white-space: nowrap;
  padding: 0 1rem 0 1.25rem;
  text-align: right;
  user-select: none;
  vertical-align: top;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: color 0.1s;
}
.code-line-num:hover { color: #9CA3AF !important; }
.code-line-content {
  padding: 0 1.25rem 0 0.75rem;
  white-space: pre;
}

/* ── DARK theme (default) ── */
.cv-theme-dark {
  background: #1C1C1E;
}
.cv-theme-dark .cv-toolbar {
  background: #161618;
  border-color: #2C2C2E;
}
.cv-theme-dark .cv-tb-btn {
  color: #6B7280;
}
.cv-theme-dark .cv-tb-btn:hover:not(.active) {
  background: rgba(255,255,255,0.06);
  color: #D1D5DB;
}
.cv-theme-dark .cv-edit-area {
  background: #1C1C1E;
  color: #E5E5EA;
  scrollbar-color: #3A3A3C transparent;
}
.cv-theme-dark .code-viewer-scroll {
  scrollbar-color: #3A3A3C transparent;
}
.cv-theme-dark .code-line-num { color: #4B5563; }
.cv-theme-dark .code-line-content { color: #E5E5EA; }
.cv-theme-dark .code-viewer-table tr:hover .code-line-content {
  background: rgba(255,255,255,0.03);
}

/* ── LIGHT theme ── */
.cv-theme-light {
  background: #FFFFFF;
  border-color: #E5E5EA;
}
.cv-theme-light .cv-toolbar {
  background: #F9F9F9;
  border-color: #E5E5EA;
}
.cv-theme-light .cv-tb-btn {
  color: #6B7280;
}
.cv-theme-light .cv-tb-btn:hover:not(.active) {
  background: rgba(0,0,0,0.05);
  color: #1A1A1A;
}
.cv-theme-light .cv-edit-area {
  background: #FFFFFF;
  color: #1C1C1E;
  scrollbar-color: #D1D1D6 transparent;
}
.cv-theme-light .code-viewer-scroll {
  scrollbar-color: #D1D1D6 transparent;
  background: #FFFFFF;
}
.cv-theme-light .code-line-num { color: #9CA3AF; }
.cv-theme-light .code-line-num:hover { color: #4B5563 !important; }
.cv-theme-light .code-line-content { color: #1C1C1E; }
.cv-theme-light .code-viewer-table tr:hover .code-line-content {
  background: rgba(0,0,0,0.03);
}
/* Override hljs token colors for light theme */
.cv-theme-light .hljs-keyword,
.cv-theme-light .hljs-built_in      { color: #AF52DE; }
.cv-theme-light .hljs-string        { color: #C41A16; }
.cv-theme-light .hljs-number        { color: #1C00CF; }
.cv-theme-light .hljs-comment       { color: #007400; font-style: italic; }
.cv-theme-light .hljs-title,
.cv-theme-light .hljs-title.function_  { color: #0000C7; }
.cv-theme-light .hljs-attr,
.cv-theme-light .hljs-variable      { color: #836C28; }
.cv-theme-light .hljs-tag           { color: #881350; }
.cv-theme-light .hljs-name          { color: #881350; }
.cv-theme-light .hljs-type          { color: #5C2699; }

/* ── Line selection ── */
.cv-line-selected .code-line-num {
  color: #60A5FA !important;
  background: rgba(59,130,246,0.15);
}
.cv-line-selected .code-line-content {
  background: rgba(59,130,246,0.1) !important;
}
/* ── AI edit highlight ── */
.cv-line-highlighted .code-line-num {
  color: #34D399 !important;
  background: rgba(16,185,129,0.12);
}
.cv-line-highlighted .code-line-content {
  background: rgba(16,185,129,0.08) !important;
  border-left: 2px solid rgba(16,185,129,0.5);
}
</style>
