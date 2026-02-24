<template>
  <div class="h-full flex flex-col overflow-hidden" style="background-color: #F8FAFC;">

    <!-- ── NO VAULT SELECTED: Welcome screen ── -->
    <div v-if="!store.vaultPath" class="flex-1 flex items-center justify-center">
      <div class="text-center" style="max-width: 420px;">
        <!-- Vault icon -->
        <div
          class="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center"
          style="background: linear-gradient(135deg, #3B82F6 0%, #6366F1 100%);"
        >
          <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <h2 style="font-family:'Figtree',serif; font-size:var(--fs-page-title); font-weight:700; color:#1E293B; margin:0 0 8px;">
          Notes
        </h2>
        <p style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); color:#64748B; margin:0 0 24px; line-height:1.6;">
          Select a folder to use as your vault. All markdown files in the folder will be available for viewing and editing.
        </p>
        <button
          @click="store.pickVault()"
          class="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 cursor-pointer"
          style="background:#F1F5F9; color:#475569; font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); border:1px solid #E2E8F0;"
          @mouseenter="e => { e.currentTarget.style.background='#E2E8F0'; e.currentTarget.style.color='#1E293B' }"
          @mouseleave="e => { e.currentTarget.style.background='#F1F5F9'; e.currentTarget.style.color='#475569' }"
        >
          <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Browse with Folder Picker
        </button>
      </div>
    </div>

    <!-- ── VAULT LOADED: File tree + Editor ── -->
    <template v-else>
      <!-- Header bar -->
      <div
        class="px-4 py-3 shrink-0 flex items-center justify-between"
        style="background:#fff; border-bottom:1px solid #E2E8F0;"
      >
        <div class="flex items-center gap-3">
          <h1 style="font-family:'Figtree',serif; font-size:var(--fs-section); font-weight:600; color:#1E293B; margin:0;">
            Notes
          </h1>
          <span
            class="px-2.5 py-0.5 rounded-lg truncate"
            style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-caption); color:#64748B; background:#F1F5F9; max-width:300px; border:1px solid #E2E8F0;"
            :title="store.vaultPath"
          >{{ vaultName }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="store.pickVault()"
            class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer"
            style="color:#64748B; background:#F1F5F9; border:1px solid #E2E8F0; font-family:'Noto Sans',sans-serif;"
            @mouseenter="e => { e.currentTarget.style.background='#E2E8F0'; e.currentTarget.style.color='#1E293B' }"
            @mouseleave="e => { e.currentTarget.style.background='#F1F5F9'; e.currentTarget.style.color='#64748B' }"
            title="Change folder"
          >Browse</button>
        </div>
      </div>

      <!-- Main content: file tree + editor -->
      <div class="flex-1 flex overflow-hidden">

        <!-- ── LEFT: File Tree Panel ── -->
        <div
          class="shrink-0 flex flex-col overflow-hidden"
          style="width:280px; min-width:280px; background:#FAFBFC; border-right:1px solid #E2E8F0;"
        >
          <!-- Tree toolbar -->
          <div class="px-3 py-2 flex items-center gap-1 shrink-0" style="border-bottom:1px solid #E2E8F0;">
            <button
              @click="showNewFileInput = true; newItemParent = store.vaultPath"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
              style="color:#3B82F6; background:rgba(59,130,246,0.08); border:none; font-family:'Noto Sans',sans-serif;"
              @mouseenter="e => e.currentTarget.style.background='rgba(59,130,246,0.15)'"
              @mouseleave="e => e.currentTarget.style.background='rgba(59,130,246,0.08)'"
              title="New file"
            >
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              File
            </button>
            <button
              @click="showNewFolderInput = true; newItemParent = store.vaultPath"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
              style="color:#64748B; background:rgba(100,116,139,0.08); border:none; font-family:'Noto Sans',sans-serif;"
              @mouseenter="e => e.currentTarget.style.background='rgba(100,116,139,0.15)'"
              @mouseleave="e => e.currentTarget.style.background='rgba(100,116,139,0.08)'"
              title="New folder"
            >
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
              Folder
            </button>
            <button
              @click="store.loadTree()"
              class="ml-auto p-1.5 rounded-md transition-colors cursor-pointer"
              style="color:#94A3B8; border:none; background:transparent;"
              @mouseenter="e => e.currentTarget.style.color='#475569'"
              @mouseleave="e => e.currentTarget.style.color='#94A3B8'"
              title="Refresh"
            >
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
          </div>

          <!-- New file input (at root) -->
          <div v-if="showNewFileInput && newItemParent === store.vaultPath" class="px-3 py-2" style="border-bottom:1px solid #E2E8F0;">
            <input
              ref="newFileInputRef"
              v-model="newItemName"
              @keydown.enter="handleCreateFile(store.vaultPath)"
              @keydown.escape="showNewFileInput = false; newItemName = ''"
              @blur="showNewFileInput = false; newItemName = ''"
              placeholder="filename.md"
              class="w-full px-2 py-1 rounded text-sm"
              style="border:1px solid #3B82F6; outline:none; font-family:'Noto Sans',sans-serif; font-size:var(--fs-caption);"
            />
          </div>

          <!-- New folder input (at root) -->
          <div v-if="showNewFolderInput && newItemParent === store.vaultPath" class="px-3 py-2" style="border-bottom:1px solid #E2E8F0;">
            <input
              ref="newFolderInputRef"
              v-model="newItemName"
              @keydown.enter="handleCreateFolder(store.vaultPath)"
              @keydown.escape="showNewFolderInput = false; newItemName = ''"
              @blur="showNewFolderInput = false; newItemName = ''"
              placeholder="folder name"
              class="w-full px-2 py-1 rounded text-sm"
              style="border:1px solid #6366F1; outline:none; font-family:'Noto Sans',sans-serif; font-size:var(--fs-caption);"
            />
          </div>

          <!-- File tree -->
          <div class="flex-1 overflow-y-auto py-1" style="scrollbar-width:thin;">
            <div v-if="store.fileTree.length === 0" class="px-4 py-8 text-center">
              <p style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-secondary); color:#94A3B8;">No markdown files found</p>
            </div>
            <TreeNode
              v-for="node in store.fileTree"
              :key="node.path"
              :node="node"
              :depth="0"
              :active-path="store.activeFile?.path"
              :expanded-folders="store.expandedFolders"
              @select-file="(p, n) => store.openFile(p, n)"
              @toggle-folder="(p) => store.toggleFolder(p)"
              @delete-item="handleDeleteItem"
            />
          </div>
        </div>

        <!-- ── RIGHT: Editor / Preview Panel ── -->
        <div class="flex-1 flex flex-col overflow-hidden" style="background:#fff;">

          <!-- No file selected -->
          <div v-if="!store.activeFile" class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <svg class="mx-auto mb-3" style="width:48px;height:48px;color:#CBD5E1;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <p style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); color:#94A3B8;">Select a file to view</p>
            </div>
          </div>

          <!-- File open -->
          <template v-else>
            <!-- File header bar -->
            <div
              class="px-4 py-2.5 shrink-0 flex items-center gap-3"
              style="border-bottom:1px solid #E2E8F0; background:#FAFBFC;"
            >
              <svg style="width:16px;height:16px;color:#64748B;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); font-weight:600; color:#1E293B;">
                {{ store.activeFile.name }}
              </span>
              <div class="ml-auto flex items-center gap-2">
                <!-- Auto-save indicator -->
                <span
                  v-if="saving"
                  class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style="background:#DBEAFE; color:#1D4ED8; font-family:'Noto Sans',sans-serif;"
                >
                  <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
                  saving
                </span>

                <!-- Copy source -->
                <button
                  @click="copySource"
                  class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  style="color:#64748B; background:#F1F5F9; border:1px solid #E2E8F0; font-family:'Noto Sans',sans-serif;"
                  @mouseenter="e => { e.currentTarget.style.background='#E2E8F0'; e.currentTarget.style.color='#1E293B' }"
                  @mouseleave="e => { e.currentTarget.style.background='#F1F5F9'; e.currentTarget.style.color='#64748B' }"
                  title="Copy markdown source"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  {{ copied ? 'Copied' : 'Copy' }}
                </button>

                <!-- Mode toggle -->
                <div
                  class="flex rounded-lg overflow-hidden"
                  style="border:1px solid #E2E8F0;"
                >
                  <button
                    @click="editMode = false"
                    class="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                    :style="!editMode
                      ? 'background:#3B82F6; color:#fff; border:none;'
                      : 'background:#fff; color:#64748B; border:none;'"
                    style="font-family:'Noto Sans',sans-serif;"
                  >Formatted</button>
                  <button
                    @click="editMode = true"
                    class="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                    :style="editMode
                      ? 'background:#3B82F6; color:#fff; border:none;'
                      : 'background:#fff; color:#64748B; border:none;'"
                    style="font-family:'Noto Sans',sans-serif;"
                  >Source</button>
                </div>
              </div>
            </div>

            <!-- Formatted mode (editable rich preview) -->
            <div
              v-if="!editMode"
              class="flex-1 overflow-y-auto py-6"
              style="scrollbar-width:thin; display:flex; justify-content:center;"
              @click="handlePreviewClick"
            >
              <div
                ref="formattedEl"
                class="prose-obsidian"
                contenteditable="true"
                spellcheck="false"
                v-html="formattedHtml"
                @input="onFormattedInput"
                @paste="onFormattedPaste"
              />
              <!-- Link error toast -->
              <div
                v-if="linkError"
                class="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg animate-fade-in"
                style="background:#FEF2F2; border:1px solid #FECACA; color:#991B1B; font-size:var(--fs-secondary); max-width:480px;"
              >
                <svg style="width:18px;height:18px;flex-shrink:0;color:#EF4444;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <span class="flex-1" style="word-break:break-all;">{{ linkError }}</span>
                <button
                  @click="linkError = ''"
                  class="shrink-0 cursor-pointer"
                  style="background:none;border:none;color:#991B1B;font-size:16px;padding:0 0 0 8px;"
                >&times;</button>
              </div>
            </div>

            <!-- Source mode (raw markdown editor) -->
            <div
              v-else
              class="flex-1 overflow-y-auto"
              style="scrollbar-width:thin; display:flex; justify-content:center;"
            >
              <textarea
                v-model="editorContent"
                class="notes-source-editor"
                spellcheck="false"
              />
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount, defineComponent, h } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { useObsidianStore } from '../stores/obsidian'

const store = useObsidianStore()

const editMode = ref(false)
const linkError = ref('')
let linkErrorTimer = null
const saving = ref(false)
const copied = ref(false)
let copiedTimer = null
const formattedEl = ref(null)
const formattedHtml = ref('')
let autoSaveTimer = null
let editingFormatted = false  // flag to prevent circular updates

// Turndown: HTML → Markdown converter (with GFM tables, strikethrough, etc.)
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  hr: '---',
})
turndown.use(gfm)

// Convert data-URL / data-relpath images back to relative markdown paths
turndown.addRule('local-images', {
  filter: function (node) {
    return node.nodeName === 'IMG' && (node.getAttribute('data-relpath') || node.getAttribute('src')?.startsWith('data:'))
  },
  replacement: function (content, node) {
    const relPath = node.getAttribute('data-relpath')
    const alt = node.getAttribute('alt') || ''
    const title = node.getAttribute('title')
    if (relPath) {
      return `![${alt}](${relPath}${title ? ` "${title}"` : ''})`
    }
    // Fallback: keep the data URL as-is (shouldn't normally happen)
    const src = node.getAttribute('src') || ''
    return `![${alt}](${src}${title ? ` "${title}"` : ''})`
  }
})
const showNewFileInput = ref(false)
const showNewFolderInput = ref(false)
const newItemParent = ref('')
const newItemName = ref('')
const newFileInputRef = ref(null)
const newFolderInputRef = ref(null)

// Vault display name (last folder in path)
const vaultName = computed(() => {
  if (!store.vaultPath) return ''
  const parts = store.vaultPath.split(/[/\\]/)
  return parts[parts.length - 1] || store.vaultPath
})

// Local ref for editor textarea — decoupled from store to avoid reactivity fights during paste
const editorContent = ref('')

// Sync store → local when file changes (open new file, save resets dirty, etc.)
watch(() => store.activeFile?.content, (val) => {
  if (val !== editorContent.value) {
    editorContent.value = val ?? ''
  }
}, { immediate: true })

// Sync local → store on every edit (marks dirty) + trigger auto-save
watch(editorContent, (val) => {
  if (store.activeFile && val !== store.activeFile.content) {
    store.updateContent(val)
    scheduleAutoSave()
  }
})

// Debounced auto-save (800ms after last keystroke)
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    if (store.activeFile?.dirty) {
      saving.value = true
      await store.saveFile()
      saving.value = false
    }
  }, 800)
}

onBeforeUnmount(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  // Flush any pending save
  if (store.activeFile?.dirty) store.saveFile()
})


// Markdown rendering — custom image renderer marks relative images with data-relpath for post-processing
// marked 12.x passes positional args: (href, title, text)
const renderer = new marked.Renderer()
renderer.image = function (href, title, text) {
  // For relative/local paths, store original path in data attributes for async base64 loading
  if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('data:')) {
    const fileDir = store.activeFile?.path?.replace(/[/\\][^/\\]+$/, '') || store.vaultPath
    const absPath = fileDir ? `${fileDir}/${href}` : href
    return `<img src="" data-relpath="${href}" data-abspath="${absPath}" alt="${text || ''}"${title ? ` title="${title}"` : ''} />`
  }
  return `<img src="${href}" alt="${text || ''}"${title ? ` title="${title}"` : ''} />`
}
marked.use({ gfm: true, breaks: true, renderer })

function renderToHtml(md) {
  if (!md) return ''
  try {
    const raw = marked.parse(md)
    return DOMPurify.sanitize(raw, {
      ALLOW_UNKNOWN_PROTOCOLS: true,
      ADD_ATTR: ['data-relpath', 'data-abspath'],
    })
  } catch { return '' }
}

// Refresh the formatted HTML from the current markdown source.
// Renders markdown to HTML, then asynchronously loads local images as data URLs.
async function refreshFormattedHtml() {
  // renderToHtml() already sanitizes via DOMPurify
  const safeHtml = renderToHtml(editorContent.value)
  formattedHtml.value = safeHtml
  await nextTick()
  // v-html may silently skip updates on contenteditable divs that have been
  // modified by user typing. Force-sync the DOM so images are in the tree.
  if (formattedEl.value) {
    formattedEl.value.textContent = ''                    // clear safely
    formattedEl.value.insertAdjacentHTML('afterbegin', safeHtml) // re-insert DOMPurify-sanitized HTML
  }
  await loadLocalImages()
}

// Scan the formatted view for local images and load them as data: URLs via IPC
async function loadLocalImages() {
  if (!formattedEl.value) return
  const imgs = formattedEl.value.querySelectorAll('img[data-abspath]')
  if (imgs.length === 0) return
  const loadPromises = Array.from(imgs).map(async (img) => {
    const absPath = img.getAttribute('data-abspath')
    if (!absPath) return
    try {
      const result = await window.electronAPI.obsidian.readImageBase64(absPath)
      if (result?.base64 && result?.mime) {
        img.src = `data:${result.mime};base64,${result.base64}`
      }
    } catch {}
  })
  await Promise.all(loadPromises)
}

// When the user types in the contenteditable formatted view,
// convert the edited HTML back to markdown via turndown.
function onFormattedInput() {
  if (!formattedEl.value) return
  const html = formattedEl.value.innerHTML
  const md = turndown.turndown(html)
  // Set flag BEFORE updating so the watcher skips re-rendering
  editingFormatted = true
  editorContent.value = md
}

// Read a Blob as base64 (promise-based)
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Save image base64 to vault, insert markdown at cursor position, save file, refresh display
async function saveAndInsertImage(base64, ext, cursorOffset) {
  if (!store.activeFile) return

  const fileName = `img-${Date.now()}.${ext}`
  const fileDir = store.activeFile.path.replace(/[/\\][^/\\]+$/, '') || store.vaultPath

  const result = await window.electronAPI.obsidian.saveImage(fileDir, fileName, base64)

  if (!result || result.error) {
    showLinkError(`Failed to save image: ${result?.error || 'unknown error'}`)
    return
  }

  const imgMarkdown = `\n![${fileName}](${result.relativePath})\n`
  const content = store.activeFile.content || ''

  // Insert at cursor position if provided, otherwise append at end
  let newContent
  if (typeof cursorOffset === 'number' && cursorOffset >= 0 && cursorOffset <= content.length) {
    newContent = content.slice(0, cursorOffset) + imgMarkdown + content.slice(cursorOffset)
  } else {
    newContent = content + imgMarkdown
  }

  // Directly update store content (bypass watcher chain to avoid race conditions)
  store.activeFile.content = newContent
  store.activeFile.dirty = true
  editorContent.value = newContent

  // Save immediately
  await store.saveFile()

  // Refresh display
  editingFormatted = false
  await refreshFormattedHtml()
}

// Get the cursor offset in markdown source corresponding to the current selection in the formatted view
function getCursorMarkdownOffset() {
  if (!formattedEl.value) return -1
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return -1

  // Clone the DOM up to the cursor, convert to markdown, measure length
  const range = sel.getRangeAt(0)
  const preRange = document.createRange()
  preRange.selectNodeContents(formattedEl.value)
  preRange.setEnd(range.startContainer, range.startOffset)

  const fragment = preRange.cloneContents()
  const tempDiv = document.createElement('div')
  tempDiv.appendChild(fragment)
  const mdBefore = turndown.turndown(tempDiv.innerHTML)
  return mdBefore.length
}

// Handle image paste in formatted view
async function onFormattedPaste(e) {
  const items = e.clipboardData?.items

  // Capture cursor position before any async work
  const cursorOffset = getCursorMarkdownOffset()

  // Check browser clipboard for image data first (native Linux/Mac)
  if (items && items.length > 0) {
    let imageItem = null
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItem = items[i]
        break
      }
    }
    if (imageItem) {
      e.preventDefault()
      const blob = imageItem.getAsFile()
      if (!blob) { showLinkError('Could not read image from clipboard'); return }
      try {
        const base64 = await blobToBase64(blob)
        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
        await saveAndInsertImage(base64, ext, cursorOffset)
      } catch (err) {
        showLinkError(`Image paste failed: ${err.message}`)
      }
      return
    }
  }

  // WSL2 fallback: browser clipboard has no image data because WSLg
  // doesn't bridge image binary. Ask PowerShell to read the Windows clipboard.
  if (window.electronAPI?.getClipboardImage) {
    const contentBeforePaste = store.activeFile?.content || ''
    try {
      const clip = await window.electronAPI.getClipboardImage()

      if (clip?.hasImage && clip.base64) {
        // Restore content to pre-paste state (undo the default text paste side-effect)
        store.activeFile.content = contentBeforePaste
        editorContent.value = contentBeforePaste

        const ext = (clip.type?.split('/')[1] || 'png').replace('jpeg', 'jpg')
        await saveAndInsertImage(clip.base64, ext, cursorOffset)
        return
      }
    } catch {}
  }

  // No image found — let default paste proceed (text paste)
}

// Refresh HTML when file changes
watch(() => store.activeFile?.path, async () => {
  editMode.value = false
  editingFormatted = false
  await refreshFormattedHtml()
})

// Refresh HTML when content changes from source mode (not from formatted editing).
// When editing in formatted mode, we skip this to avoid resetting the DOM + cursor.
watch(editorContent, async () => {
  if (editingFormatted) {
    editingFormatted = false
    return
  }
  await refreshFormattedHtml()
})

// Refresh HTML when switching back to formatted mode
watch(editMode, async (val) => {
  if (!val) await refreshFormattedHtml()
})

// Auto-focus new file/folder inputs
watch(showNewFileInput, async (v) => { if (v) { await nextTick(); newFileInputRef.value?.focus() } })
watch(showNewFolderInput, async (v) => { if (v) { await nextTick(); newFolderInputRef.value?.focus() } })

async function copySource() {
  if (!store.activeFile?.content) return
  try {
    await navigator.clipboard.writeText(store.activeFile.content)
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}

function showLinkError(msg) {
  linkError.value = msg
  if (linkErrorTimer) clearTimeout(linkErrorTimer)
  linkErrorTimer = setTimeout(() => { linkError.value = '' }, 6000)
}

async function handlePreviewClick(e) {
  // Walk up from click target to find an <a> tag
  let el = e.target
  while (el && el.tagName !== 'A') {
    if (el === e.currentTarget) return // no link found, do nothing
    el = el.parentElement
  }
  if (!el || !el.href) return

  e.preventDefault()
  e.stopPropagation()

  const href = el.getAttribute('href') || ''
  const fullUrl = el.href // resolved by browser

  // External URL — open in system browser
  if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
    try {
      if (window.electronAPI?.openExternal) {
        const res = await window.electronAPI.openExternal(fullUrl)
        if (res?.error) showLinkError(`Could not open link: ${res.error}`)
      } else {
        window.open(fullUrl, '_blank')
      }
    } catch (err) {
      showLinkError(`Failed to open link: ${err.message}`)
    }
    return
  }

  // Internal .md link — try to open within vault
  if (href.endsWith('.md') || href.includes('.md#')) {
    const mdPath = href.split('#')[0]
    // Resolve relative to current file's directory
    const currentDir = store.activeFile?.path?.replace(/[/\\][^/\\]+$/, '') || store.vaultPath
    const resolved = mdPath.startsWith('/')
      ? store.vaultPath + mdPath
      : currentDir + '/' + mdPath
    try {
      await store.openFile(resolved, mdPath.split('/').pop())
    } catch (err) {
      showLinkError(`Could not open note: ${mdPath}`)
    }
    return
  }

  // Anchor link (same page #fragment)
  if (href.startsWith('#')) {
    const target = document.getElementById(href.slice(1))
    if (target) target.scrollIntoView({ behavior: 'smooth' })
    return
  }

  // Unknown link type
  showLinkError(`Cannot open link: ${href}`)
}

async function handleCreateFile(dir) {
  if (!newItemName.value.trim()) return
  await store.createFile(dir, newItemName.value.trim())
  showNewFileInput.value = false
  newItemName.value = ''
}

async function handleCreateFolder(dir) {
  if (!newItemName.value.trim()) return
  await store.createFolder(dir, newItemName.value.trim())
  showNewFolderInput.value = false
  newItemName.value = ''
}

async function handleDeleteItem(itemPath) {
  await store.deleteItem(itemPath)
}

// ── TreeNode: recursive file tree component ──
const TreeNode = defineComponent({
  name: 'TreeNode',
  props: {
    node: Object,
    depth: Number,
    activePath: String,
    expandedFolders: Object
  },
  emits: ['select-file', 'toggle-folder', 'delete-item'],
  setup(props, { emit }) {
    const hovered = ref(false)

    return () => {
      const isDir = props.node.type === 'dir'
      const isExpanded = props.expandedFolders[props.node.path]
      const isActive = props.activePath === props.node.path
      const indent = 12 + props.depth * 18

      const children = []

      // Main row
      children.push(
        h('div', {
          class: 'flex items-center gap-2 py-1.5 pr-2 cursor-pointer transition-colors duration-100 group relative',
          style: {
            paddingLeft: indent + 'px',
            background: isActive ? 'rgba(59,130,246,0.1)' : (hovered.value ? 'rgba(0,0,0,0.03)' : 'transparent'),
            color: isActive ? '#3B82F6' : '#475569',
            fontFamily: "'Noto Sans',sans-serif",
            fontSize: 'var(--fs-secondary)',
          },
          onClick: () => {
            if (isDir) emit('toggle-folder', props.node.path)
            else emit('select-file', props.node.path, props.node.name)
          },
          onMouseenter: () => { hovered.value = true },
          onMouseleave: () => { hovered.value = false },
        }, [
          // Chevron for folders
          isDir ? h('svg', {
            style: {
              width: '12px', height: '12px', flexShrink: 0, color: '#94A3B8',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s'
            },
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2'
          }, [h('polyline', { points: '9 18 15 12 9 6' })]) : h('span', { style: 'width:12px;display:inline-block;' }),

          // Icon
          isDir
            ? h('svg', { style: 'width:16px;height:16px;flex-shrink:0;color:#F59E0B;', viewBox: '0 0 24 24', fill: 'currentColor' }, [
                h('path', { d: 'M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z' })
              ])
            : h('svg', { style: 'width:16px;height:16px;flex-shrink:0;color:#94A3B8;', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
                h('polyline', { points: '14 2 14 8 20 8' })
              ]),

          // Name
          h('span', {
            class: 'truncate flex-1',
            style: { fontWeight: isDir ? '600' : '400' }
          }, props.node.name.replace(/\.md$/, '')),

          // Delete button (on hover)
          hovered.value ? h('button', {
            style: 'background:none;border:none;color:#EF4444;cursor:pointer;padding:2px;flex-shrink:0;opacity:0.7;',
            title: 'Delete',
            onClick: (e) => { e.stopPropagation(); emit('delete-item', props.node.path) }
          }, [
            h('svg', { style: 'width:12px;height:12px;', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
              h('polyline', { points: '3 6 5 6 21 6' }),
              h('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' })
            ])
          ]) : null
        ])
      )

      // Children (if expanded directory)
      if (isDir && isExpanded && props.node.children) {
        for (const child of props.node.children) {
          children.push(
            h(TreeNode, {
              node: child,
              depth: props.depth + 1,
              activePath: props.activePath,
              expandedFolders: props.expandedFolders,
              'onSelect-file': (p, n) => emit('select-file', p, n),
              'onToggle-folder': (p) => emit('toggle-folder', p),
              'onDelete-item': (p) => emit('delete-item', p),
            })
          )
        }
      }

      return h('div', null, children)
    }
  }
})
</script>

<style>
.prose-obsidian {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  line-height: 1.75;
  color: #1E293B;
  width: 95%;
  max-width: 95%;
  outline: none;
  cursor: text;
}
.prose-obsidian:focus {
  outline: none;
}
.notes-source-editor {
  width: 95%;
  max-width: 95%;
  height: 100%;
  resize: none;
  outline: none;
  padding: 24px 0;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: var(--fs-secondary);
  line-height: 1.7;
  color: #1E293B;
  background: #fff;
  border: none;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.prose-obsidian h1 { font-family: 'Figtree', serif; font-size: var(--fs-page-title); font-weight: 700; margin: 0 0 16px; color: #0F172A; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px; }
.prose-obsidian h2 { font-family: 'Figtree', serif; font-size: var(--fs-section); font-weight: 600; margin: 28px 0 12px; color: #1E293B; }
.prose-obsidian h3 { font-family: 'Figtree', serif; font-size: var(--fs-subtitle); font-weight: 600; margin: 24px 0 8px; color: #334155; }
.prose-obsidian p { margin: 0 0 12px; }
.prose-obsidian ul, .prose-obsidian ol { margin: 0 0 12px; padding-left: 24px; }
.prose-obsidian li { margin: 4px 0; }
.prose-obsidian code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875em;
  background: #F1F5F9;
  padding: 2px 6px;
  border-radius: 4px;
  color: #7C3AED;
}
.prose-obsidian pre {
  background: #0F172A;
  color: #E2E8F0;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0 0 16px;
  font-size: var(--fs-secondary);
  line-height: 1.5;
}
.prose-obsidian pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}
.prose-obsidian blockquote {
  border-left: 3px solid #3B82F6;
  margin: 0 0 12px;
  padding: 8px 16px;
  color: #475569;
  background: #F8FAFC;
  border-radius: 0 8px 8px 0;
}
.prose-obsidian a { color: #3B82F6; text-decoration: none; }
.prose-obsidian a:hover { text-decoration: underline; }
.prose-obsidian hr { border: none; border-top: 1px solid #E2E8F0; margin: 24px 0; }
.prose-obsidian table { border-collapse: collapse; margin: 0 0 16px; width: 100%; }
.prose-obsidian th, .prose-obsidian td { border: 1px solid #E2E8F0; padding: 8px 12px; text-align: left; }
.prose-obsidian th { background: #F8FAFC; font-weight: 600; }
.prose-obsidian img { max-width: 100%; border-radius: 8px; }
</style>
