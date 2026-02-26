<template>
  <div>
    <!-- ── User message ─────────────────────────────────────────────────────── -->
    <template v-if="message.role === 'user'">
      <div class="prose-sparkai user-content" style="max-width:none; color:#ffffff !important;" v-html="renderMarkdown(message.content || '')" @click="handleContentClick" />
      <BabylonViewer v-for="url in modelUrls" :key="url" :src="url" />
    </template>

    <!-- ── Assistant message ────────────────────────────────────────────────── -->
    <template v-else>
    <!-- ── Todo List Panel (single, live, top of message) ──────────────────── -->
    <div v-if="latestTodos.length > 0" class="mb-3 rounded-xl overflow-hidden" style="border:1px solid #d4e4d4; background:#f8faf7;">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" style="background:#eaf3ea; border-bottom:1px solid #d4e4d4;" @click="todoCollapsed = !todoCollapsed">
        <span style="color:#4c8446; font-size:0.85rem;">☑</span>
        <span style="font-size:0.8rem; font-weight:600; color:#3a6b35;">Task List</span>
        <div class="flex gap-1.5 ml-2">
          <span v-if="todoSummary.done > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:#dcfce7; color:#15803d;">{{ todoSummary.done }} done</span>
          <span v-if="todoSummary.running > 0" class="px-1.5 py-0.5 rounded-full animate-pulse" style="font-size:0.7rem; background:#fef9c3; color:#a16207;">{{ todoSummary.running }} running</span>
          <span v-if="todoSummary.blocked > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:#fee2e2; color:#dc2626;">{{ todoSummary.blocked }} blocked</span>
          <span v-if="todoSummary.pending > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:#F5F5F5; color:#9CA3AF;">{{ todoSummary.pending }} pending</span>
        </div>
        <span class="ml-auto" style="font-size:0.75rem; color:#6b7c6b;">{{ todoSummary.done }}/{{ latestTodos.length }}</span>
        <span style="font-size:0.7rem; color:#9ca89c; margin-left:4px;">{{ todoCollapsed ? '▶' : '▼' }}</span>
      </div>
      <!-- Task rows -->
      <div v-if="!todoCollapsed">
        <div v-for="todo in latestTodos" :key="todo.id" class="flex items-start gap-2 px-3 py-1.5" style="border-bottom:1px solid #f0f4f0;">
          <!-- Status icon -->
          <span class="shrink-0 mt-0.5" style="font-size:0.85rem; width:1.2rem; text-align:center;"
            :class="todo.status === 'in_progress' ? 'animate-pulse' : ''">
            <span v-if="todo.status === 'completed'" style="color:#22c55e;">✓</span>
            <span v-else-if="todo.status === 'in_progress'" style="color:#eab308;">⚡</span>
            <span v-else-if="todo.status === 'blocked'" style="color:#ef4444;">✕</span>
            <span v-else style="color:#9CA3AF;">○</span>
          </span>
          <!-- Title -->
          <span class="flex-1" style="font-size:0.8rem; color:#374151;" :style="todo.status === 'completed' ? 'text-decoration:line-through; color:#9ca3af;' : ''">
            {{ todo.title }}
          </span>
          <!-- Badge -->
          <span class="shrink-0 px-1.5 py-0.5 rounded-full" style="font-size:0.68rem;"
            :style="todo.status === 'completed' ? 'background:#dcfce7; color:#15803d;' :
                    todo.status === 'in_progress' ? 'background:#fef9c3; color:#a16207;' :
                    todo.status === 'blocked' ? 'background:#fee2e2; color:#dc2626;' :
                    'background:#F5F5F5; color:#9CA3AF;'">
            {{ todo.status === 'completed' ? 'done' : todo.status === 'in_progress' ? 'running' : todo.status === 'blocked' ? 'blocked' : 'pending' }}
          </span>
        </div>
      </div>
    </div>

    <!-- ── Segments loop ────────────────────────────────────────────────────── -->
    <template v-for="(seg, i) in message.segments" :key="i">

      <!-- Text segment -->
      <div v-if="seg.type === 'text'" class="prose-sparkai" style="max-width:none;" v-html="renderMarkdown(seg.content)" @click="handleContentClick" />

      <!-- File diff (file_operation write/append) -->
      <div v-else-if="seg.type === 'tool' && isFileWrite(seg)" class="my-2 rounded-xl overflow-hidden" style="border:1px solid #d1d5db; font-size:0.78rem;">
        <!-- Diff header -->
        <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" style="background:#1C1C1E; color:#E5E5EA;" @click="toggleTool(i, seg)">
          <span style="color:#60a5fa;">🔧</span>
          <span style="font-size:0.75rem; font-weight:600;">file_operation</span>
          <span class="px-1.5 py-0.5 rounded" style="background:#374151; color:#9CA3AF; font-size:0.7rem; font-family:monospace;">{{ seg.input?.operation }}</span>
          <span v-if="seg.input?.path" class="px-1.5 py-0.5 rounded" style="background:#1e3a5f; color:#93c5fd; font-size:0.7rem; font-family:monospace;">{{ seg.input.path }}</span>
          <div class="ml-auto flex items-center gap-2">
            <span class="flex items-center gap-1">
              <span style="color:#22c55e; font-size:0.68rem;">+ added</span>
              <span style="color:#ef4444; font-size:0.68rem; margin-left:4px;">− removed</span>
              <span style="color:#60a5fa; font-size:0.68rem; margin-left:4px;">~ updated</span>
            </span>
            <span v-if="seg.output === undefined" class="animate-pulse px-1.5 py-0.5 rounded" style="background:#422006; color:#fb923c; font-size:0.68rem;">writing…</span>
            <span v-else class="px-1.5 py-0.5 rounded" style="background:#14532d; color:#4ade80; font-size:0.68rem;">done</span>
            <span style="color:#6b7280; font-size:0.7rem;">{{ expandedTools[i] ? '▼' : '▶' }}</span>
          </div>
        </div>
        <!-- Diff body -->
        <div v-if="expandedTools[i] !== false">
          <!-- Copy button -->
          <div class="flex items-center justify-between px-3 py-1.5" style="background:#161b22; border-bottom:1px solid #30363d;">
            <span style="font-size:0.7rem; color:#6b7280;">Changes</span>
            <button @click.stop="copyBlock('diff-'+i, seg.input?.content || '')" class="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer" style="background:#21262d; border:1px solid #30363d; color:#8b949e; font-size:0.68rem;">
              <span>{{ copiedBlock === 'diff-'+i ? '✓ Copied' : '⎘ Copy' }}</span>
            </button>
          </div>
          <!-- Diff lines -->
          <div style="background:#0d1117; max-height:400px; overflow-y:auto;">
            <div v-if="!expandedDiffs[i]">
              <div v-for="(line, li) in (getDiff(i, seg).slice(0, 8))" :key="li" class="flex" :style="diffLineStyle(line.type)">
                <span style="width:2.5rem; padding:0 8px; color:#484f58; font-family:monospace; font-size:0.72rem; text-align:right; user-select:none; border-right:1px solid #21262d;">{{ line.lineNo }}</span>
                <span style="width:1rem; padding:0 4px; font-family:monospace; font-size:0.72rem; text-align:center;">{{ diffMarker(line.type) }}</span>
                <span style="flex:1; padding:0 8px; font-family:monospace; font-size:0.72rem; white-space:pre; overflow-x:auto;">{{ line.content }}</span>
              </div>
              <div v-if="getDiff(i, seg).length > 8" class="flex items-center justify-center py-1.5 cursor-pointer" style="background:#161b22; color:#58a6ff; font-size:0.72rem;" @click.stop="expandedDiffs[i] = true">
                Show all {{ getDiff(i, seg).length }} lines ▼
              </div>
            </div>
            <div v-else>
              <div v-for="(line, li) in getDiff(i, seg)" :key="li" class="flex" :style="diffLineStyle(line.type)">
                <span style="width:2.5rem; padding:0 8px; color:#484f58; font-family:monospace; font-size:0.72rem; text-align:right; user-select:none; border-right:1px solid #21262d;">{{ line.lineNo }}</span>
                <span style="width:1rem; padding:0 4px; font-family:monospace; font-size:0.72rem; text-align:center;">{{ diffMarker(line.type) }}</span>
                <span style="flex:1; padding:0 8px; font-family:monospace; font-size:0.72rem; white-space:pre; overflow-x:auto;">{{ line.content }}</span>
              </div>
              <div class="flex items-center justify-center py-1.5 cursor-pointer" style="background:#161b22; color:#58a6ff; font-size:0.72rem;" @click.stop="expandedDiffs[i] = false">
                Show less ▲
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Generic tool / background_task / dispatch_subagent — collapsible summary row -->
      <div v-else-if="seg.type === 'tool' && !isHiddenTool(seg)" class="my-1.5 rounded-xl overflow-hidden" style="border:1px solid #E5E5EA; background:#FFFFFF;">
        <!-- Header row — always visible -->
        <div
          class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
          :style="seg.output === undefined
            ? 'background:#fffbeb; border-left:3px solid #f59e0b;'
            : 'background:#F5F5F5; border-left:3px solid #22c55e;'"
          @click="toggleTool(i, seg)"
        >
          <!-- Icon -->
          <span style="font-size:0.85rem;">
            <span v-if="seg.name === 'dispatch_subagent'">🤖</span>
            <span v-else-if="seg.name === 'background_task'">⚙️</span>
            <span v-else>🔧</span>
          </span>
          <!-- Tool name -->
          <span style="font-size:0.78rem; font-weight:600; color:#374151;">{{ seg.name }}</span>
          <!-- Summary label -->
          <span class="flex-1 truncate" style="font-size:0.75rem; color:#6b7280;">
            {{ toolSummary(seg) }}
          </span>
          <!-- Status badge -->
          <span v-if="seg.output === undefined"
            class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full animate-pulse"
            style="background:#fef3c7; color:#d97706; font-size:0.7rem;">
            <span class="inline-block w-1.5 h-1.5 rounded-full" style="background:#f59e0b;"></span>
            running
          </span>
          <span v-else
            class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full"
            style="background:#dcfce7; color:#15803d; font-size:0.7rem;">
            <span>✓</span>
            done
          </span>
          <!-- Chevron -->
          <span style="font-size:0.7rem; color:#9CA3AF; margin-left:2px;">{{ isToolExpanded(i, seg) ? '▼' : '▶' }}</span>
        </div>
        <!-- Expanded body — shown when running OR manually expanded -->
        <div v-if="isToolExpanded(i, seg)" style="background:#FAFAFA; border-top:1px solid #E5E5EA;">
          <!-- Input -->
          <div v-if="seg.input && Object.keys(seg.input).length > 0" class="px-3 py-2">
            <div class="flex items-center justify-between mb-1">
              <span style="font-size:0.7rem; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">Input</span>
              <button @click.stop="copyBlock('input-'+i, JSON.stringify(seg.input, null, 2))" class="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer" style="background:#F5F5F5; border:1px solid #E5E5EA; color:#9CA3AF; font-size:0.68rem;">
                {{ copiedBlock === 'input-'+i ? '✓ Copied' : '⎘ Copy' }}
              </button>
            </div>
            <pre class="rounded-xl p-2 overflow-x-auto" style="background:#1C1C1E; color:#E5E5EA; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px;">{{ expandedInputs[i] || JSON.stringify(seg.input, null, 2).length <= 50 ? JSON.stringify(seg.input, null, 2) : JSON.stringify(seg.input, null, 2).slice(0, 50) + '…' }}</pre>
            <button v-if="JSON.stringify(seg.input, null, 2).length > 50" @click.stop="expandedInputs[i] = !expandedInputs[i]" class="mt-1 cursor-pointer" style="font-size:0.68rem; color:#007AFF; background:none; border:none; padding:0;">{{ expandedInputs[i] ? 'Show less ▲' : 'View full ▼' }}</button>
          </div>
          <!-- Tool images are rendered via the standalone inline image segment below -->
          <!-- Output -->
          <div v-if="seg.output !== undefined" class="px-3 py-2" style="border-top:1px solid #E5E5EA;">
            <div class="flex items-center justify-between mb-1">
              <span style="font-size:0.7rem; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">Output</span>
              <button @click.stop="copyBlock('output-'+i, String(seg.output))" class="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer" style="background:#F5F5F5; border:1px solid #E5E5EA; color:#9CA3AF; font-size:0.68rem;">
                {{ copiedBlock === 'output-'+i ? '✓ Copied' : '⎘ Copy' }}
              </button>
            </div>
            <pre class="rounded-xl p-2 overflow-x-auto" style="background:#1C1C1E; color:#E5E5EA; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px;">{{ expandedOutputs[i] || String(seg.output).length <= 50 ? String(seg.output) : String(seg.output).slice(0, 50) + '…' }}</pre>
            <button v-if="String(seg.output).length > 50" @click.stop="expandedOutputs[i] = !expandedOutputs[i]" class="mt-1 cursor-pointer" style="font-size:0.68rem; color:#007AFF; background:none; border:none; padding:0;">{{ expandedOutputs[i] ? 'Show less ▲' : 'View full ▼' }}</button>
          </div>
        </div>
      </div>

      <!-- Inline images — always visible in the message flow (base64 or URL) -->
      <div v-else-if="seg.type === 'image' && seg.images && seg.images.length > 0" class="my-2 rounded-xl overflow-hidden" style="border:1px solid #E5E5EA; background:#FFFFFF;">
        <div class="px-3 py-2" style="background:#F5F5F5; border-bottom:1px solid #E5E5EA;">
          <span style="font-size:0.75rem; font-weight:600; color:#6B7280;">Image{{ seg.images.length > 1 ? 's' : '' }}</span>
          <span v-if="seg.source" style="font-size:0.7rem; color:#9CA3AF; margin-left:6px;">from {{ seg.source }}</span>
        </div>
        <div class="inline-images-grid p-3">
          <img
            v-for="(img, imgIdx) in seg.images"
            :key="imgIdx"
            :src="resolveImageSrc(img)"
            class="inline-image"
            @click="openImageFullscreen(resolveImageSrc(img))"
          />
        </div>
      </div>

    </template>

      <!-- 3D models detected in assistant message -->
      <BabylonViewer v-for="url in modelUrls" :key="url" :src="url" />

      <!-- Wave bar + duration: outside segments block so it shows even with no content yet -->
      <div v-if="message.streaming" class="flex items-end gap-0.5 h-5 mt-1 pl-1">
        <span v-for="n in 5" :key="n" class="wave-bar" :style="`--bar-color:#4c8446; --bar-glow:#4c844680; animation-delay:${(n-1)*0.13}s;`" />
      </div>
      <!-- Duration label: live while streaming, final when done -->
      <div v-if="message.streaming && message.streamingStartedAt" class="flex items-center gap-1 mt-1.5" style="color:#9CA3AF; font-size:var(--fs-small);">
        <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>cooking for {{ formatDuration(elapsedMs) }}…</span>
      </div>
      <div v-else-if="!message.streaming && message.durationMs" class="flex items-center gap-1 mt-1.5" style="color:#9CA3AF; font-size:var(--fs-small);">
        <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>cooked for {{ formatDuration(message.durationMs) }}</span>
      </div>
  </template>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import BabylonViewer from './BabylonViewer.vue'

const props = defineProps({
  message: { type: Object, required: true }
})

// ── 3D asset detection ────────────────────────────────────────────────────────
const MODEL_EXT_RE = /\.(glb|gltf|obj|stl|babylon|fbx)(\?[^\s)]*)?$/i
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

const modelUrls = computed(() => {
  const text = props.message.content || ''
  const segs = props.message.segments || []
  const urls = new Set()
  // Scan main content
  const matches = text.match(URL_RE) || []
  for (const u of matches) {
    if (MODEL_EXT_RE.test(u)) urls.add(u)
  }
  // Scan text segments
  for (const seg of segs) {
    if (seg.type === 'text' && seg.content) {
      const sm = seg.content.match(URL_RE) || []
      for (const u of sm) {
        if (MODEL_EXT_RE.test(u)) urls.add(u)
      }
    }
  }
  return [...urls]
})

// ── Live elapsed timer ─────────────────────────────────────────────────────
const now = ref(Date.now())
let timer = null

function startTimer() {
  if (timer) return
  now.value = Date.now()
  timer = setInterval(() => { now.value = Date.now() }, 1000)
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

const elapsedMs = computed(() => {
  if (!props.message.streamingStartedAt) return 0
  return now.value - props.message.streamingStartedAt
})

watch(() => props.message.streaming, (streaming) => {
  if (streaming) startTimer()
  else stopTimer()
}, { immediate: true })

onBeforeUnmount(stopTimer)

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const hours = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''} ${secs}s`
  return `${mins} min${mins !== 1 ? 's' : ''} ${secs}s`
}

// ── Strip base64 blobs from text before rendering ────────────────────────────
function stripBase64(text) {
  if (!text || text.length < 200) return text
  // Replace data:image URIs with a short label
  let cleaned = text.replace(/data:(image\/[a-z+]+);base64,[A-Za-z0-9+/=]{100,}/gi,
    (m, mime) => `[image: ${mime}]`)
  // Replace any remaining long base64-like runs (100+ chars of pure base64 alphabet)
  cleaned = cleaned.replace(/[A-Za-z0-9+/=]{200,}/g,
    (m) => `[binary data: ${Math.round(m.length * 0.75 / 1024)}KB]`)
  return cleaned
}

// ── Markdown renderer ────────────────────────────────────────────────────────
// File-path regex: matches files with known extensions OR directory paths (trailing / or \)
// Files:  ~/path/file.ext, /abs/path/file.ext, C:\path\file.ext, \\server\share\file.ext
// Dirs:   ~/dir/sub/, /abs/path/dir/, C:\path\dir\, \\server\share\  (2+ segments)
const FILE_PATH_RE = /(?:(?:~\/[\w.\/\-]+|\/(?:[\w.\-]+\/)+[\w.\-]+|[A-Z]:\\(?:[\w.\-]+\\)*[\w.\-]+|\\\\[\w.\-]+(?:\\[\w.\-]+)+)\.(?:md|txt|json|js|ts|jsx|tsx|py|rb|go|rs|java|c|cpp|h|hpp|css|scss|html|xml|yaml|yml|toml|ini|cfg|conf|log|csv|sql|sh|bash|zsh|env|vue|svelte)|(?:~\/(?:[\w.\-]+\/)+|\/(?:[\w.\-]+\/){2,}|[A-Z]:\\(?:[\w.\-]+\\){2,}|\\\\[\w.\-]+(?:\\[\w.\-]+)+\\)(?=[\s.,;:!?)'"}\]]|$))/g

function injectFilePathChips(html) {
  // Split HTML into tags vs text runs so we never match inside tags or <pre>/<a>
  // Note: inline <code> is intentionally allowed so backtick-wrapped paths get chips
  const parts = html.split(/(<[^>]+>)/g)
  let insidePre = 0 // depth counter for <pre>
  let insideA = 0   // depth counter for <a>
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.startsWith('<')) {
      const tag = p.toLowerCase()
      if (/^<pre[\s>]/.test(tag)) insidePre++
      else if (/^<\/pre>/.test(tag)) insidePre = Math.max(0, insidePre - 1)
      if (/^<a[\s>]/.test(tag)) insideA++
      else if (/^<\/a>/.test(tag)) insideA = Math.max(0, insideA - 1)
      continue
    }
    if (insidePre > 0 || insideA > 0) continue
    // Replace file paths in this text node — path text + small open-folder button after it
    parts[i] = p.replace(FILE_PATH_RE, (match) => {
      const escaped = match.replace(/"/g, '&quot;')
      return `<span class="file-path-chip">${match}</span><span class="file-path-open-btn" data-path="${escaped}" title="Open in file explorer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>`
    })
  }
  // Unwrap <code> tags that now contain only a file-path chip (from backtick-wrapped paths)
  return parts.join('').replace(/<code>(<span class="file-path-chip">.*?<\/span>)<\/code>/g, '$1')
}

function renderMarkdown(text) {
  if (!text) return ''
  try {
    const clean = stripBase64(String(text))
    const raw = marked.parse(clean, { breaks: true, gfm: true })
    const sanitized = DOMPurify.sanitize(raw)
    // Highlight @mentions
    const withMentions = sanitized.replace(/@(\w[\w\s]*?\w|\w)\b/g, '<span class="mention">@$1</span>')
    // Wrap <pre><code> blocks with a header bar containing a copy button
    const withCodeBlocks = withMentions
      .replace(/<pre><code(?:\s+class="language-(\w+)")?>/g, (m, lang) => {
        const label = lang ? `<span class="code-lang">${lang}</span>` : ''
        return `<div class="code-block-wrap">${label}<span class="code-copy-btn">Copy</span><pre><code${lang ? ` class="language-${lang}"` : ''}>`
      })
      .replace(/<\/code><\/pre>/g, '</code></pre></div>')
    // Inject file-path chips (skipping paths inside code/pre/a)
    return injectFilePathChips(withCodeBlocks)
  } catch { return String(text) }
}

// ── Click handler for code-copy + file-path open (event delegation) ──────────
function handleContentClick(e) {
  // File path open button — directories open directly, files open parent folder
  const fpBtn = e.target.closest('.file-path-open-btn')
  if (fpBtn) {
    const filePath = fpBtn.dataset.path
    if (filePath) {
      const isDir = /[/\\]$/.test(filePath)
      if (isDir && window.electronAPI?.openFile) {
        window.electronAPI.openFile(filePath)
      } else if (window.electronAPI?.showInFolder) {
        window.electronAPI.showInFolder(filePath)
      }
    }
    return
  }
  // Code block copy button
  const btn = e.target.closest('.code-copy-btn')
  if (!btn) return
  const wrap = btn.closest('.code-block-wrap')
  if (!wrap) return
  const code = wrap.querySelector('code')
  if (!code) return
  navigator.clipboard.writeText(code.textContent).then(() => {
    btn.textContent = 'Copied!'
    setTimeout(() => { btn.textContent = 'Copy' }, 2000)
  }).catch(() => {})
}

// ── Todo panel state ─────────────────────────────────────────────────────────
const todoCollapsed = ref(false)

const latestTodos = computed(() => {
  const segs = props.message.segments || []
  const map = new Map()
  const order = []
  for (const seg of segs) {
    if (seg.type !== 'tool' || seg.name !== 'todo_manager') continue
    const out = parseOutput(seg)
    const action = seg.input?.action
    if (action === 'add' && out?.todo) {
      if (!map.has(out.todo.id)) order.push(out.todo.id)
      map.set(out.todo.id, { ...out.todo })
    } else if ((action === 'update' || action === 'complete') && out?.todo) {
      if (map.has(out.todo.id)) {
        Object.assign(map.get(out.todo.id), out.todo)
      }
    } else if (action === 'clear') {
      map.clear(); order.length = 0
    } else if (action === 'remove' && out?.todo) {
      map.delete(out.todo.id)
    }
  }
  return order.map(id => map.get(id)).filter(Boolean)
})

const todoSummary = computed(() => {
  const todos = latestTodos.value
  return {
    done: todos.filter(t => t.status === 'completed').length,
    running: todos.filter(t => t.status === 'in_progress').length,
    blocked: todos.filter(t => t.status === 'blocked').length,
    pending: todos.filter(t => t.status === 'pending').length,
  }
})

function parseOutput(seg) {
  if (!seg.output) return null
  if (typeof seg.output === 'object') return seg.output
  try { return JSON.parse(seg.output) } catch { return null }
}

// ── Tool expand/collapse state ───────────────────────────────────────────────
const expandedTools  = reactive({})   // manually toggled
const expandedInputs  = reactive({})
const expandedOutputs = reactive({})
const expandedDiffs   = reactive({})
const diffCache       = reactive({})
const copiedBlock     = ref(null)

// A tool is expanded if:
//  - output is undefined (still running) => always expanded
//  - user manually toggled it open
function isToolExpanded(i, seg) {
  if (seg.output === undefined) return true          // running → always open
  return expandedTools[i] === true                   // done → only if user opened it
}

function toggleTool(i, seg) {
  // Get current visible state, then flip it
  const currentlyExpanded = isToolExpanded(i, seg)
  expandedTools[i] = !currentlyExpanded
}

// ── Tool helpers ─────────────────────────────────────────────────────────────
function isHiddenTool(seg) {
  // Only hide file_operation read-only ops and todo_manager list
  if (seg.name === 'file_operation' && seg.input) {
    const hiddenOps = ['read', 'list', 'search', 'exists']
    if (hiddenOps.includes(seg.input.operation)) return true
  }
  if (seg.name === 'todo_manager') return true
  if (seg.name === 'execute_shell') return true
  return false
}

function isFileWrite(seg) {
  return seg.name === 'file_operation' &&
    seg.input && ['write', 'append'].includes(seg.input.operation)
}

function toolSummary(seg) {
  if (!seg.input) return ''
  if (seg.name === 'dispatch_subagent') {
    const task = seg.input.task || ''
    return task.length > 80 ? task.slice(0, 80) + '…' : task
  }
  if (seg.name === 'background_task') {
    if (seg.input.action === 'start') {
      const cmd = seg.input.command || ''
      const rawArgs = seg.input.args || []
      const args = Array.isArray(rawArgs) ? rawArgs.join(' ') : String(rawArgs)
      return (cmd + ' ' + args).trim().slice(0, 80)
    }
    return seg.input.action || ''
  }
  // Generic: show key input fields
  const parts = []
  if (seg.input.operation) parts.push(seg.input.operation)
  if (seg.input.path) parts.push(seg.input.path)
  if (seg.input.command) parts.push(seg.input.command)
  if (seg.input.action) parts.push(seg.input.action)
  return parts.join('  ').slice(0, 80)
}

async function copyBlock(key, text) {
  try {
    await navigator.clipboard.writeText(text)
    copiedBlock.value = key
    setTimeout(() => { copiedBlock.value = null }, 2000)
  } catch {}
}

/**
 * Resolve an image object to a renderable src string.
 * Supports: { url }, { src }, { data, mimeType } (base64), or a plain string.
 */
function resolveImageSrc(img) {
  if (typeof img === 'string') return img
  if (img.url) return img.url
  if (img.src) return img.src
  if (img.data && img.mimeType) return `data:${img.mimeType};base64,${img.data}`
  if (img.data) return `data:image/png;base64,${img.data}`
  return ''
}

// Open image in a new window for fullscreen viewing
function openImageFullscreen(dataUri) {
  const win = window.open('', '_blank')
  if (!win) return
  const style = win.document.createElement('style')
  style.textContent = 'body{margin:0;background:#1A1A1A;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;object-fit:contain;}'
  win.document.head.appendChild(style)
  win.document.title = 'MCP Image'
  const img = win.document.createElement('img')
  img.src = dataUri
  win.document.body.appendChild(img)
}

// ── File diff ────────────────────────────────────────────────────────────────
function getDiff(i, seg) {
  if (diffCache[i]) return diffCache[i]
  const newContent = seg.input?.content || ''
  const oldContent = typeof seg.output === 'string' ? seg.output : ''
  diffCache[i] = computeDiff(oldContent, newContent)
  return diffCache[i]
}

function computeDiff(oldText, newText) {
  const oldLines = oldText ? oldText.split('\n') : []
  const newLines = newText ? newText.split('\n') : []
  const result = []
  let lineNo = 1
  if (oldLines.length === 0) {
    for (const line of newLines) result.push({ type: 'add', content: line, lineNo: lineNo++ })
    return result
  }
  const m = oldLines.length, n = newLines.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1])
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: 'equal', content: newLines[j], lineNo: lineNo++ })
      i++; j++
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      result.push({ type: 'add', content: newLines[j], lineNo: lineNo++ })
      j++
    } else {
      result.push({ type: 'remove', content: oldLines[i], lineNo: lineNo++ })
      i++
    }
  }
  return result
}

function diffLineStyle(type) {
  if (type === 'add')    return 'background:#0f2a1a; color:#4ade80;'
  if (type === 'remove') return 'background:#2a0f0f; color:#f87171; text-decoration:line-through;'
  return 'color:#9ca3af;'
}

function diffMarker(type) {
  if (type === 'add')    return '+'
  if (type === 'remove') return '−'
  return ' '
}
</script>

<style scoped>
/* ── Code block copy button ────────────────────────────────────────────────── */
:deep(.code-block-wrap) {
  position: relative;
  margin: 0.5rem 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #30363d;
}
:deep(.code-lang) {
  position: absolute;
  top: 8px;
  left: 12px;
  font-size: 0.65rem;
  color: #6b7280;
  font-family: monospace;
  text-transform: lowercase;
  z-index: 1;
  pointer-events: none;
}
:deep(.code-copy-btn) {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 2;
  font-size: 0.7rem;
  color: #fff;
  background: #1A1A1A;
  border: none;
  border-radius: 8px;
  padding: 3px 10px;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  transition: background 0.15s, opacity 0.15s;
  opacity: 0;
}
:deep(.code-block-wrap:hover .code-copy-btn) {
  opacity: 1;
}
:deep(.code-copy-btn:hover) {
  color: #fff;
  background: #374151;
}
:deep(.code-block-wrap pre) {
  margin: 0;
  padding: 32px 12px 12px;
  background: #1C1C1E;
  overflow-x: auto;
}
:deep(.code-block-wrap code) {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.78rem;
  color: #E5E5EA;
  background: transparent;
  padding: 0;
}

/* ── Inline Images (base64 or URL) ─────────────────────────────────────────── */
.inline-images-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.inline-image {
  max-width: 100%;
  max-height: 400px;
  border-radius: 12px;
  border: 1px solid #E5E5EA;
  cursor: pointer;
  transition: opacity 0.15s, box-shadow 0.15s;
  object-fit: contain;
  background: #FFFFFF;
}
.inline-image:hover {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.wave-bar {
  display: inline-block;
  width: 3.5px;
  height: 18px;
  border-radius: 2px;
  transform-origin: bottom;
  transform: scaleY(0.3);
  background: var(--bar-color);
  box-shadow: 0 0 0px var(--bar-glow);
  animation: wave-oscillate 1.3s ease-in-out infinite, wave-hue 6s linear infinite;
}
@keyframes wave-oscillate {
  0%, 100% { transform: scaleY(0.3); opacity: 0.45; box-shadow: 0 0 0px var(--bar-glow); }
  50% { transform: scaleY(1); opacity: 1; box-shadow: 0 0 10px var(--bar-glow), 0 0 20px var(--bar-glow); }
}
@keyframes wave-hue {
  0%   { filter: hue-rotate(0deg) brightness(1); }
  50%  { filter: hue-rotate(45deg) brightness(1.15); }
  100% { filter: hue-rotate(0deg) brightness(1); }
}

/* @Mention highlighting */
:deep(.mention) {
  background: rgba(99, 102, 241, 0.15);
  color: #6366F1;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 600;
}

/* ── File path chip (inline styled text) ──────────────────────────────────── */
:deep(.file-path-chip) {
  display: inline;
  padding: 2px 6px;
  margin: 0 1px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border, #E5E5EA);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85em;
  color: inherit;
}
/* ── File path open button (small icon after the path, macOS blue) ─────────── */
:deep(.file-path-open-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 3px;
  border-radius: 5px;
  background: linear-gradient(135deg, #56CCF2 0%, #2F80ED 100%);
  color: #FFFFFF;
  cursor: pointer;
  vertical-align: middle;
  transition: all 0.15s ease;
  box-shadow: 0 1px 4px rgba(47,128,237,0.25);
}
:deep(.file-path-open-btn:hover) {
  background: linear-gradient(135deg, #6DD5F5 0%, #4A9AF5 100%);
  box-shadow: 0 2px 8px rgba(47,128,237,0.35);
}
:deep(.file-path-open-btn svg) {
  display: block;
}
/* User bubble overrides (light text on dark background) */
.user-content :deep(.file-path-chip) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
}
.user-content :deep(.file-path-open-btn) {
  background: rgba(255, 255, 255, 0.2);
  box-shadow: none;
}
.user-content :deep(.file-path-open-btn:hover) {
  background: rgba(255, 255, 255, 0.35);
}
</style>
