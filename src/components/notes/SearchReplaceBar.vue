<template>
  <div class="srb-root" @keydown.stop @mousedown.stop>
    <!-- Search row -->
    <div class="srb-row">
      <div class="srb-input-wrap">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          class="srb-input"
          placeholder="Find"
          spellcheck="false"
          @input="onSearchInput"
          @keydown.enter.exact.prevent="findNext"
          @keydown.shift.enter.prevent="findPrev"
          @keydown.escape="$emit('close')"
        />
        <button class="srb-opt-btn" :class="{ active: matchCase }" @click="toggleMatchCase" title="Match Case">Aa</button>
        <button class="srb-opt-btn" :class="{ active: wholeWord }" @click="toggleWholeWord" title="Whole Word">
          <span style="border-bottom:1.5px solid currentColor;line-height:1;letter-spacing:-0.03em;">ab</span>
        </button>
      </div>
      <span class="srb-count" :class="{ 'srb-count--none': matchCount === 0 && searchQuery }">
        {{ countLabel }}
      </span>
      <button class="srb-nav-btn" @click="findPrev" :disabled="matchCount === 0" title="Previous (Shift+Enter)">
        <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <button class="srb-nav-btn" @click="findNext" :disabled="matchCount === 0" title="Next (Enter)">
        <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <button class="srb-close-btn" @click="$emit('close')" title="Close (Esc)">
        <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Replace row -->
    <div class="srb-row">
      <div class="srb-input-wrap" style="flex:1;">
        <input
          v-model="replaceQuery"
          class="srb-input"
          placeholder="Replace"
          spellcheck="false"
          @keydown.escape="$emit('close')"
          @keydown.enter.prevent="replaceNext"
        />
      </div>
      <button class="srb-action-btn" @click="replaceNext" :disabled="matchCount === 0">Replace</button>
      <button class="srb-action-btn" @click="replaceAll" :disabled="matchCount === 0">All</button>
      <span v-if="feedback" class="srb-feedback" :class="feedbackOk ? 'srb-feedback--ok' : 'srb-feedback--err'">{{ feedback }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  textContent: { type: String, default: null },   // raw string for text/md/code files
  textareaEl:  { type: Object, default: null },   // <textarea> DOM element for navigation
  fileType:    { type: String, default: 'text' }, // 'text' | 'pptx' | 'xlsx' | 'docx'
})

const emit = defineEmits(['close', 'count-request', 'find-next', 'find-prev', 'replace-text', 'replace-all-text'])

const searchInputRef = ref(null)
const searchQuery    = ref('')
const replaceQuery   = ref('')
const matchCase      = ref(false)
const wholeWord      = ref(false)
const currentIdx     = ref(0)
const matchCount     = ref(0)
const feedback       = ref('')
const feedbackOk     = ref(true)
let _feedbackTimer   = null

// Internal match list for text mode
const _matches = ref([])

// ── Helpers ──
function makeRegex(flags) {
  if (!searchQuery.value) return null
  try {
    const esc = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pat = wholeWord.value ? `(?<![\\w])${esc}(?![\\w])` : esc
    return new RegExp(pat, flags)
  } catch { return null }
}

function findMatchesInText(text) {
  const re = makeRegex(matchCase.value ? 'g' : 'gi')
  if (!re) return []
  const results = []
  let m
  while ((m = re.exec(text)) !== null) results.push({ start: m.index, end: m.index + m[0].length })
  return results
}

// ── Recompute ──
function recompute() {
  if (!searchQuery.value) {
    _matches.value = []
    matchCount.value = 0
    return
  }
  if (props.fileType === 'text') {
    _matches.value = findMatchesInText(props.textContent || '')
    matchCount.value = _matches.value.length
    if (_matches.value.length > 0) highlightCurrent()
  } else {
    emit('count-request', { query: searchQuery.value, matchCase: matchCase.value, wholeWord: wholeWord.value })
  }
}

function onSearchInput() {
  currentIdx.value = 0
  recompute()
}

// ── Highlight in textarea ──
function highlightCurrent() {
  const ta = props.textareaEl
  if (!ta || _matches.value.length === 0) return
  const m = _matches.value[currentIdx.value]
  if (!m) return
  ta.focus()
  ta.setSelectionRange(m.start, m.end)
  const linesBefore = (props.textContent || '').slice(0, m.start).split('\n').length
  ta.scrollTop = Math.max(0, (linesBefore - 5) * 20)
}

// ── Navigation ──
function findNext() {
  if (matchCount.value === 0) return
  if (props.fileType === 'text') {
    currentIdx.value = (currentIdx.value + 1) % _matches.value.length
    highlightCurrent()
  } else {
    emit('find-next', { query: searchQuery.value, matchCase: matchCase.value, wholeWord: wholeWord.value })
  }
}

function findPrev() {
  if (matchCount.value === 0) return
  if (props.fileType === 'text') {
    currentIdx.value = (currentIdx.value - 1 + _matches.value.length) % _matches.value.length
    highlightCurrent()
  } else {
    emit('find-prev', { query: searchQuery.value, matchCase: matchCase.value, wholeWord: wholeWord.value })
  }
}

// ── Replace ──
function replaceNext() {
  if (!searchQuery.value || matchCount.value === 0) return
  const m = _matches.value[currentIdx.value]
  emit('replace-text', {
    search: searchQuery.value, replacement: replaceQuery.value,
    matchCase: matchCase.value, wholeWord: wholeWord.value,
    matchStart: m?.start, matchEnd: m?.end,
  })
}

function replaceAll() {
  if (!searchQuery.value || matchCount.value === 0) return
  emit('replace-all-text', {
    search: searchQuery.value, replacement: replaceQuery.value,
    matchCase: matchCase.value, wholeWord: wholeWord.value,
  })
}

// ── Toggle options ──
function toggleMatchCase() { matchCase.value = !matchCase.value }
function toggleWholeWord()  { wholeWord.value = !wholeWord.value }

// ── Feedback ──
function showFeedback(msg, ok = true) {
  feedback.value = msg
  feedbackOk.value = ok
  clearTimeout(_feedbackTimer)
  _feedbackTimer = setTimeout(() => { feedback.value = '' }, 2000)
}

// ── Computed label ──
const countLabel = computed(() => {
  if (!searchQuery.value) return ''
  if (matchCount.value === 0) return 'No results'
  if (props.fileType === 'text') return `${currentIdx.value + 1} / ${matchCount.value}`
  return `${matchCount.value} match${matchCount.value !== 1 ? 'es' : ''}`
})

// ── Public API ──
defineExpose({
  focus:       () => nextTick(() => searchInputRef.value?.focus()),
  setQuery:    (q) => { searchQuery.value = q; onSearchInput() },
  updateCount: (n) => { matchCount.value = n; if (currentIdx.value >= n) currentIdx.value = Math.max(0, n - 1) },
  showFeedback,
  recompute,
})

watch([matchCase, wholeWord], () => { currentIdx.value = 0; recompute() })
watch(() => props.textContent, () => { if (props.fileType === 'text') recompute() })
</script>

<style scoped>
.srb-root {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: #FFFFFF;
  border: 1px solid #D1D5DB;
  border-radius: var(--radius-md);
  padding: 0.4375rem 0.5rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
  width: 26rem;
  max-width: calc(100vw - 2rem);
  font-family: 'Inter', sans-serif;
}

.srb-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.srb-input-wrap {
  display: flex;
  align-items: center;
  flex: 1;
  background: #F5F5F5;
  border: 1px solid #E5E5EA;
  border-radius: var(--radius-sm);
  padding: 0 0.25rem;
  min-width: 0;
  transition: border-color 0.15s, background 0.15s;
}
.srb-input-wrap:focus-within {
  border-color: #1A1A1A;
  background: #FFFFFF;
}

.srb-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 0.3125rem 0.3125rem;
  font-size: var(--fs-small);
  font-family: 'JetBrains Mono', monospace;
  color: #1A1A1A;
  outline: none;
  min-width: 0;
}
.srb-input::placeholder { color: #9CA3AF; font-family: 'Inter', sans-serif; }

.srb-opt-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.125rem 0.3125rem;
  border: none;
  background: transparent;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 700;
  color: #9CA3AF;
  cursor: pointer;
  transition: all 0.12s;
  font-family: 'Inter', sans-serif;
  user-select: none;
}
.srb-opt-btn:hover { background: rgba(0,0,0,0.06); color: #1A1A1A; }
.srb-opt-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  border-radius: 4px;
}

.srb-count {
  flex-shrink: 0;
  font-size: var(--fs-small);
  color: #6B7280;
  min-width: 4.5rem;
  text-align: right;
  white-space: nowrap;
}
.srb-count--none { color: #EF4444; }

.srb-nav-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid #E5E5EA;
  border-radius: var(--radius-sm);
  background: #FFFFFF;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.12s;
}
.srb-nav-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  color: #FFFFFF;
}
.srb-nav-btn:disabled { opacity: 0.3; cursor: default; }

.srb-close-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  transition: all 0.12s;
  margin-left: 0.125rem;
}
.srb-close-btn:hover { background: rgba(239,68,68,0.08); color: #EF4444; }

.srb-action-btn {
  flex-shrink: 0;
  padding: 0.25rem 0.5625rem;
  border: 1px solid #E5E5EA;
  border-radius: var(--radius-sm);
  background: #FFFFFF;
  color: #374151;
  font-size: var(--fs-small);
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.srb-action-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  color: #FFFFFF;
}
.srb-action-btn:disabled { opacity: 0.3; cursor: default; }

.srb-feedback {
  font-size: var(--fs-small);
  font-weight: 600;
  white-space: nowrap;
  padding: 0.1875rem 0.4375rem;
  border-radius: 9999px;
  margin-left: 0.125rem;
}
.srb-feedback--ok  { color: #10B981; background: rgba(16,185,129,0.1); }
.srb-feedback--err { color: #EF4444; background: rgba(239,68,68,0.1); }
</style>
