<template>
  <div class="h-full flex flex-col overflow-hidden" style="background-color: #F2F2F7;">

    <!-- ── NO VAULT SELECTED: Welcome screen ── -->
    <div v-if="!store.vaultPath" class="flex-1 flex items-center justify-center">
      <div class="text-center" style="max-width: 420px;">
        <!-- Vault icon -->
        <div
          class="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center"
          style="background: #1A1A1A;"
        >
          <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <h2 style="font-family:'Inter',serif; font-size:var(--fs-page-title); font-weight:700; color:#1A1A1A; margin:0 0 8px;">
          Documents
        </h2>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; margin:0 0 24px; line-height:1.6;">
          Select a folder to use as your vault. Markdown and draw.io diagram files will be available for viewing and editing.
        </p>
        <AppButton size="compact" @click="store.pickVault()">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Browse Folder
        </AppButton>
      </div>
    </div>

    <!-- ── VAULT LOADED: File tree + Editor ── -->
    <template v-else>
      <!-- Header bar -->
      <div
        class="px-4 py-3 shrink-0 flex items-center justify-between"
        style="background:#FFFFFF; border-bottom:1px solid #E5E5EA;"
      >
        <div class="flex items-center gap-3">
          <h1 style="font-family:'Inter',serif; font-size:var(--fs-section); font-weight:600; color:#1A1A1A; margin:0;">
            Documents
          </h1>
          <span
            class="px-2.5 py-0.5 rounded-lg truncate"
            style="font-family:'Inter',sans-serif; font-size:var(--fs-caption); color:#fff; background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); max-width:300px; box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);"
            :title="store.vaultPath"
          >{{ vaultName }}</span>
        </div>
        <div class="flex items-center gap-2">
          <AppButton size="icon" @click="store.loadTree()" title="Refresh">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </AppButton>
          <AppButton size="icon" @click="store.pickVault()" title="Browse folder">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </AppButton>
        </div>
      </div>

      <!-- Main content: file tree + editor -->
      <div class="flex-1 flex overflow-hidden">

        <!-- ── LEFT: File Tree Panel (resizable) ── -->
        <div
          class="doc-tree-panel"
          :style="docTreeCollapsed ? { width: '0', minWidth: '0', overflow: 'hidden' } : { width: notesSidebarWidth + 'px', minWidth: '180px', maxWidth: '600px' }"
        >
          <!-- Resize handle -->
          <div
            v-if="!docTreeCollapsed"
            class="notes-resize-handle"
            @mousedown="startNotesResize"
          ></div>
          <!-- Tree toolbar -->
          <div class="px-3 py-2 flex items-center gap-1 shrink-0" style="border-bottom:1px solid #E5E5EA;">
            <span style="font-family:'Inter',sans-serif;font-size:var(--fs-caption);color:#9CA3AF;">Right-click to add files</span>
          </div>

          <!-- File tree (root drop zone) -->
          <div
            class="flex-1 overflow-y-auto py-1"
            style="scrollbar-width:thin;"
            @dragover.prevent="onRootDragOver"
            @dragleave="onRootDragLeave"
            @drop.prevent="handleRootDrop"
            @contextmenu.prevent="openContextMenu($event, store.vaultPath, '')"
            :class="{ 'root-drag-over': rootDragOver }"
          >
            <div v-if="store.fileTree.length === 0" class="px-4 py-8 text-center">
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF;">No files found</p>
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
              @move-item="handleMoveItem"
              @context-menu="(e, node) => openContextMenu(e, node.path, node.type)"
            />
          </div>
        </div>

        <!-- ── RIGHT: Editor / Preview Panel ── -->
        <div class="flex-1 flex flex-col overflow-hidden" style="background:#fff;position:relative;">
          <!-- Hamburger toggle tab -->
          <button
            @click="docTreeCollapsed = !docTreeCollapsed"
            class="doc-tree-expand-tab"
            :title="docTreeCollapsed ? 'Expand file tree' : 'Collapse file tree'"
            :aria-label="docTreeCollapsed ? 'Expand file tree' : 'Collapse file tree'"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </button>
          <!-- Resize blocker: covers the panel during sidebar drag so the webview doesn't swallow mousemove events -->
          <div v-if="isResizing" style="position:absolute;inset:0;z-index:50;cursor:col-resize;"></div>

          <!-- No file selected -->
          <div v-if="!store.activeFile" class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <svg class="mx-auto mb-3" style="width:48px;height:48px;color:#D1D1D6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF;">Select a file to view</p>
            </div>
          </div>

          <!-- File open -->
          <template v-else>
            <!-- File header bar -->
            <div
              class="px-4 py-2.5 shrink-0 flex items-center gap-3"
              style="border-bottom:1px solid #E5E5EA; background:#F9F9F9;"
            >
              <!-- Diagram icon for .drawio files -->
              <svg v-if="isDrawio" style="width:16px;height:16px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              <!-- Document icon for .md files -->
              <svg v-else style="width:16px;height:16px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#1A1A1A;">
                {{ store.activeFile.name }}
              </span>
              <div class="ml-auto flex items-center gap-2">
                <!-- Auto-save indicator (shared) -->
                <span
                  v-if="saving"
                  class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style="background:rgba(0,122,255,0.1); color:#007AFF; font-family:'Inter',sans-serif;"
                >
                  <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
                  saving
                </span>

                <!-- Copy source (markdown only) -->
                <button
                  v-if="!isDrawio"
                  @click="copySource"
                  class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  style="color:#9CA3AF; background:#F5F5F5; border:1px solid #E5E5EA; font-family:'Inter',sans-serif;"
                  @mouseenter="e => { e.currentTarget.style.background='#E5E5EA'; e.currentTarget.style.color='#1A1A1A' }"
                  @mouseleave="e => { e.currentTarget.style.background='#F5F5F5'; e.currentTarget.style.color='#9CA3AF' }"
                  title="Copy markdown source"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  {{ copied ? 'Copied' : 'Copy' }}
                </button>

                <!-- Mode toggle (markdown only) -->
                <div
                  v-if="!isDrawio"
                  class="flex rounded-lg overflow-hidden"
                  style="border:1px solid #E5E5EA;"
                >
                  <button
                    @click="editMode = false"
                    class="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                    :style="!editMode
                      ? 'background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color:#fff; border:none; box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);'
                      : 'background:#fff; color:#9CA3AF; border:none;'"
                    style="font-family:'Inter',sans-serif;"
                  >Formatted</button>
                  <button
                    @click="editMode = true"
                    class="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                    :style="editMode
                      ? 'background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color:#fff; border:none; box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);'
                      : 'background:#fff; color:#9CA3AF; border:none;'"
                    style="font-family:'Inter',sans-serif;"
                  >Source</button>
                </div>
              </div>
            </div>

            <!-- Draw.io editor panel -->
            <DrawioEditor
              v-if="isDrawio"
              :xml="store.activeFile.content"
              :file-path="store.activeFile.path"
              @save="onDrawioSave"
              style="flex:1;overflow:hidden;"
            />

            <!-- Formatted mode (editable rich preview) — markdown only -->
            <div
              v-else-if="!editMode"
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
                  style="background:none;border:none;color:#991B1B;font-size:var(--fs-body);padding:0 0 0 8px;"
                >&times;</button>
              </div>
            </div>

            <!-- Source mode (raw markdown editor) — markdown only -->
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

    <!-- ── Context Menu ── -->
    <Teleport to="body">
      <!-- Overlay to capture outside clicks -->
      <div v-if="ctxMenu.visible" class="notes-ctx-overlay" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu" />

      <!-- Context menu -->
      <div
        v-if="ctxMenu.visible"
        class="notes-ctx-menu"
        :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
        @click.stop
      >
        <!-- Create options: shown for dirs and background (no target) -->
        <template v-if="ctxMenu.targetType !== 'file'">
          <button class="ctx-item" @click="startCtxAction('newFile', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            New Markdown
          </button>
          <button class="ctx-item" @click="startCtxAction('newDiagram', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            New Diagram
          </button>
          <button class="ctx-item" @click="startCtxAction('newFolder', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            New Folder
          </button>
          <div v-if="ctxMenu.targetType === 'dir'" class="ctx-divider" />
        </template>

        <!-- Item actions: shown when a specific file or folder is right-clicked -->
        <template v-if="ctxMenu.targetType">
          <button class="ctx-item" @click="copyPathFromCtx(ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {{ ctxPathCopied ? 'Copied!' : 'Copy Path' }}
          </button>
          <button class="ctx-item" @click="revealInExplorer(ctxMenu.targetPath); closeContextMenu()">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Open in Explorer
          </button>
          <button class="ctx-item" @click="startCtxAction('rename', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Rename
          </button>
        </template>
      </div>

      <!-- New item / Rename dialog -->
      <div
        v-if="ctxAction.visible"
        class="notes-ctx-dialog"
        :style="{ top: ctxAction.y + 'px', left: ctxAction.x + 'px', width: ctxDialogWidth + 'px' }"
        @click.stop
        @keydown.escape="cancelCtxAction"
      >
        <div class="ctx-dialog-title">{{ ctxActionLabel }}</div>
        <input
          ref="ctxInputRef"
          v-model="ctxInputValue"
          class="ctx-dialog-input"
          :placeholder="ctxActionPlaceholder"
          @keydown.enter="commitCtxAction"
          @keydown.escape="cancelCtxAction"
        />
        <div class="ctx-dialog-footer">
          <button class="ctx-dialog-cancel" @click="cancelCtxAction">Cancel</button>
          <button class="ctx-dialog-confirm" @click="commitCtxAction">
            {{ ctxAction.type === 'rename' ? 'Rename' : 'Create' }}
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Delete Modal -->
    <ConfirmModal
      v-if="confirmDeleteTarget"
      title="Delete Item"
      :message="`Are you sure you want to delete &quot;${confirmDeleteTarget.name}&quot;? This action cannot be undone.`"
      confirm-text="Delete"
      confirm-class="primary"
      :loading="deleting"
      loading-text="Deleting…"
      :error="deleteError"
      @confirm="executeDelete"
      @close="closeDeleteDialog"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onActivated, onBeforeUnmount, defineComponent, h } from 'vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import AppButton from '../components/common/AppButton.vue'
import DrawioEditor from '../components/notes/DrawioEditor.vue'
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
const isDrawio = computed(() => store.activeFile?.name?.endsWith('.drawio') ?? false)

// ── Context menu state ──
const ctxMenu = ref({ visible: false, x: 0, y: 0, targetPath: '', targetType: '' })
const ctxAction = ref({ visible: false, type: '', parent: '', targetPath: '', x: 0, y: 0 })
const ctxInputValue = ref('')
const ctxInputRef = ref(null)

// Dialog width: grows with the input value, clamped between 280px and 640px.
// ~9.5px per char for JetBrains Mono at --fs-secondary + 64px for padding/borders.
const ctxDialogWidth = computed(() => Math.max(280, Math.min(640, ctxInputValue.value.length * 9.5 + 64)))

const ctxActionLabel = computed(() => {
  const t = ctxAction.value.type
  if (t === 'newFile')    return 'New Markdown File'
  if (t === 'newDiagram') return 'New Diagram'
  if (t === 'newFolder')  return 'New Folder'
  if (t === 'rename')     return 'Rename'
  return ''
})

const ctxActionPlaceholder = computed(() => {
  const t = ctxAction.value.type
  if (t === 'newFile')    return 'note.md'
  if (t === 'newDiagram') return 'diagram.drawio'
  if (t === 'newFolder')  return 'folder name'
  return ''
})

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


// GitHub-style heading slug — lowercase, strip non-word chars, spaces to hyphens.
// Matches the anchor format used in hand-written Markdown TOCs.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-_]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// Markdown rendering — custom renderers for images and headings
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
renderer.heading = function (text, level) {
  const id = slugify(text.replace(/<[^>]+>/g, ''))
  return `<h${level} id="${id}">${text}</h${level}>\n`
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

// Refresh tree + re-render active md file when navigating to this view
async function onViewEnter() {
  if (store.vaultPath) store.loadTree()
  if (store.activeFile && !store.activeFile.name?.endsWith('.drawio')) {
    await refreshFormattedHtml()
  }
}
onMounted(onViewEnter)
onActivated(onViewEnter)

// Auto-focus context action input when it appears
watch(() => ctxAction.value.visible, async (v) => {
  if (v) { await nextTick(); ctxInputRef.value?.focus() }
})

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

  // Anchor link (same page #fragment) — must be checked before external URL
  // because in dev mode el.href resolves to http://localhost:...#fragment.
  // marked URL-encodes hrefs, so decode before getElementById lookup.
  if (href.startsWith('#')) {
    const id = decodeURIComponent(href.slice(1))
    const target = document.getElementById(id)
    if (target) target.scrollIntoView({ behavior: 'smooth' })
    return
  }

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

  // Unknown link type
  showLinkError(`Cannot open link: ${href}`)
}

async function onDrawioSave(xml) {
  store.updateContent(xml)
  saving.value = true
  await store.saveFile()
  saving.value = false
}

// ── Context menu handlers ──
const ctxPathCopied = ref(false)

function openContextMenu(e, targetPath, targetType) {
  e.preventDefault?.()
  e.stopPropagation?.()
  const x = Math.min(e.clientX, window.innerWidth - 210)
  const y = Math.min(e.clientY, window.innerHeight - 220)
  ctxPathCopied.value = false
  ctxMenu.value = { visible: true, x, y, targetPath, targetType }
}

function closeContextMenu() {
  ctxMenu.value.visible = false
}

function copyPathFromCtx(path) {
  navigator.clipboard.writeText(path)
  ctxPathCopied.value = true
  setTimeout(() => {
    ctxPathCopied.value = false
    closeContextMenu()
  }, 900)
}

function revealInExplorer(path) {
  window.electronAPI.showInFolder(path)
}

function startCtxAction(type, pathArg) {
  const pos = { x: ctxMenu.value.x, y: ctxMenu.value.y }
  closeContextMenu()
  // For rename: parent = folder containing the item, targetPath = item itself
  // For new*:   parent = directory to create in,      targetPath = ''
  const parent = type === 'rename'
    ? pathArg.replace(/[/\\][^/\\]+$/, '') || store.vaultPath
    : pathArg
  const currentName = type === 'rename' ? pathArg.split(/[/\\]/).pop() : ''
  ctxInputValue.value = currentName
  ctxAction.value = { visible: true, type, parent, targetPath: type === 'rename' ? pathArg : '', x: pos.x, y: pos.y }
}

function cancelCtxAction() {
  ctxAction.value.visible = false
  ctxInputValue.value = ''
}

async function commitCtxAction() {
  const { type, parent, targetPath } = ctxAction.value
  const rawName = ctxInputValue.value.trim()
  if (!rawName) return
  cancelCtxAction()

  if (type === 'newFile') {
    await store.createFile(parent, rawName)
  } else if (type === 'newDiagram') {
    const result = await store.createDrawio(parent, rawName)
    if (result?.path) {
      const parts = result.path.split(/[/\\]/)
      await store.openFile(result.path, parts[parts.length - 1])
    }
  } else if (type === 'newFolder') {
    await store.createFolder(parent, rawName)
  } else if (type === 'rename') {
    const origExt = targetPath.match(/(\.[^./\\]+)$/)?.[1] || ''
    const newName = rawName.includes('.') ? rawName : rawName + origExt
    await store.renameItem(targetPath, parent + '/' + newName)
  }
}

const confirmDeleteTarget = ref(null)
const deleting = ref(false)
const deleteError = ref('')

function handleDeleteItem(itemPath) {
  const parts = itemPath.split(/[/\\]/)
  const name = parts[parts.length - 1] || itemPath
  deleteError.value = ''
  confirmDeleteTarget.value = { path: itemPath, name }
}

function closeDeleteDialog() {
  if (deleting.value) return
  confirmDeleteTarget.value = null
  deleteError.value = ''
}

async function executeDelete() {
  if (!confirmDeleteTarget.value || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await store.deleteItem(confirmDeleteTarget.value.path)
    confirmDeleteTarget.value = null
  } catch (err) {
    deleteError.value = err.message || 'Failed to delete item'
  } finally {
    deleting.value = false
  }
}

// ── Resizable sidebar ──
const notesSidebarWidth = ref(280)
const docTreeCollapsed = ref(false)
const isResizing = ref(false)

function startNotesResize(e) {
  e.preventDefault()
  isResizing.value = true
  const startX = e.clientX
  const startW = notesSidebarWidth.value

  function onMouseMove(ev) {
    const delta = ev.clientX - startX
    const newW = Math.min(600, Math.max(180, startW + delta))
    notesSidebarWidth.value = newW
  }
  function onMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// ── Drag-and-drop: move items between folders ──
const rootDragOver = ref(false)

async function handleMoveItem(sourcePath, destFolderPath) {
  const fileName = sourcePath.split(/[/\\]/).pop()
  const newPath = destFolderPath + '/' + fileName
  // Don't move to the same location
  if (sourcePath === newPath) return
  try {
    await store.renameItem(sourcePath, newPath)
  } catch (err) {
    console.error('Move failed:', err)
  }
}

function onRootDragOver(e) {
  e.dataTransfer.dropEffect = 'move'
  rootDragOver.value = true
}

function onRootDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    rootDragOver.value = false
  }
}

function handleRootDrop(e) {
  rootDragOver.value = false
  const sourcePath = e.dataTransfer.getData('text/plain')
  if (!sourcePath || !store.vaultPath) return
  // Move to vault root
  handleMoveItem(sourcePath, store.vaultPath)
}

// ── File-type icon helper ──
function fileTypeIcon(name, color, active = false) {
  const s = `width:18px;height:18px;flex-shrink:0;color:${color};`
  const ext = (name.split('.').pop() || '').toLowerCase()

  // Markdown — official Markdown Mark (dcurtis/markdown-mark), solid variant
  if (ext === 'md') {
    return h('svg', { style: `width:22px;height:14px;flex-shrink:0;`, viewBox: '0 0 208 128', fill: active ? '#fff' : '#1e1e1e' }, [
      h('path', { d: 'M193 128H15a15 15 0 0 1-15-15V15A15 15 0 0 1 15 0h178a15 15 0 0 1 15 15v98a15 15 0 0 1-15 15zM50 98V59l20 25 20-25v39h20V30H90L70 55 50 30H30v68zm134-34h-20V30h-20v34h-20l30 35z' })
    ])
  }

  // Draw.io — official diagrams.net icon (Simple Icons), brand orange #F08705
  if (ext === 'drawio') {
    return h('svg', { style: `width:18px;height:18px;flex-shrink:0;`, viewBox: '0 0 24 24', fill: active ? '#fff' : '#F08705' }, [
      h('path', { d: 'M19.69 13.419h-2.527l-2.667-4.555a1.292 1.292 0 001.035-1.28V4.16c0-.725-.576-1.312-1.302-1.312H9.771c-.726 0-1.312.576-1.312 1.301v3.435c0 .619.426 1.152 1.034 1.28l-2.666 4.555H4.309c-.725 0-1.312.576-1.312 1.301v3.435c0 .725.576 1.312 1.302 1.312h4.458c.726 0 1.312-.576 1.312-1.302v-3.434c0-.726-.576-1.312-1.301-1.312h-.437l2.645-4.523h2.059l2.656 4.523h-.438c-.725 0-1.312.576-1.312 1.301v3.435c0 .725.576 1.312 1.302 1.312H19.7c.726 0 1.312-.576 1.312-1.302v-3.434c0-.726-.576-1.312-1.301-1.312zM24 22.976c0 .565-.459 1.024-1.013 1.024H1.024A1.022 1.022 0 010 22.987V1.024C0 .459.459 0 1.013 0h21.963C23.541 0 24 .459 24 1.013z' })
    ])
  }

  // JSON
  if (ext === 'json') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1' }),
      h('path', { d: 'M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1' }),
    ])
  }

  // JavaScript / TypeScript
  if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx' || ext === 'mjs' || ext === 'cjs') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('polyline', { points: '16 18 22 12 16 6' }),
      h('polyline', { points: '8 6 2 12 8 18' }),
    ])
  }

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }),
      h('circle', { cx: '8.5', cy: '8.5', r: '1.5' }),
      h('polyline', { points: '21 15 16 10 5 21' }),
    ])
  }

  // PDF
  if (ext === 'pdf') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('path', { d: 'M9 15h1a1 1 0 0 0 0-2H9v4' }),
      h('path', { d: 'M14 13h1.5a1.5 1.5 0 0 1 0 3H14v-3z' }),
    ])
  }

  // Plain text / config
  if (['txt', 'log', 'env', 'ini', 'cfg', 'conf', 'toml', 'yaml', 'yml'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('line', { x1: '8', y1: '13', x2: '16', y2: '13' }),
      h('line', { x1: '8', y1: '17', x2: '13', y2: '17' }),
    ])
  }

  // Default: generic document
  return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('polyline', { points: '14 2 14 8 20 8' }),
  ])
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
  emits: ['select-file', 'toggle-folder', 'delete-item', 'move-item', 'context-menu'],
  setup(props, { emit }) {
    const hovered = ref(false)
    const dragOver = ref(false)

    return () => {
      const isDir = props.node.type === 'dir'
      const isExpanded = props.expandedFolders[props.node.path]
      const isActive = props.activePath === props.node.path
      const indent = 12 + props.depth * 18

      const children = []

      // Drag-and-drop event handlers
      const dragEvents = {
        draggable: true,
        onDragstart: (e) => {
          e.dataTransfer.setData('text/plain', props.node.path)
          e.dataTransfer.setData('application/x-node-type', props.node.type)
          e.dataTransfer.effectAllowed = 'move'
          e.currentTarget.classList.add('tree-dragging')
        },
        onDragend: (e) => {
          e.currentTarget.classList.remove('tree-dragging')
        },
      }

      // Drop target events (folders only)
      if (isDir) {
        dragEvents.onDragover = (e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          dragOver.value = true
        }
        dragEvents.onDragleave = (e) => {
          // Only reset if leaving the element itself (not entering a child)
          if (!e.currentTarget.contains(e.relatedTarget)) {
            dragOver.value = false
          }
        }
        dragEvents.onDrop = (e) => {
          e.preventDefault()
          e.stopPropagation()
          dragOver.value = false
          const sourcePath = e.dataTransfer.getData('text/plain')
          if (!sourcePath) return
          const destFolder = props.node.path
          // Prevent dropping onto self or into own subtree
          if (sourcePath === destFolder || destFolder.startsWith(sourcePath + '/')) return
          emit('move-item', sourcePath, destFolder)
        }
      }

      // Row background: drag-over highlight takes priority
      let rowBg = isActive ? 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)' : (hovered.value ? 'rgba(0,0,0,0.03)' : 'transparent')
      if (dragOver.value && isDir) rowBg = 'rgba(0, 122, 255, 0.12)'

      // Main row
      children.push(
        h('div', {
          class: 'flex items-center gap-2 py-1.5 pr-2 cursor-pointer transition-colors duration-100 group relative',
          style: {
            paddingLeft: indent + 'px',
            background: rowBg,
            color: isActive ? '#fff' : '#6B7280',
            boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)' : 'none',
            borderRadius: (isActive || (dragOver.value && isDir)) ? '8px' : '0',
            margin: (isActive || (dragOver.value && isDir)) ? '0 8px' : '0',
            fontFamily: "'Inter',sans-serif",
            fontSize: 'var(--fs-body)',
            border: dragOver.value && isDir ? '1px dashed #007AFF' : '1px solid transparent',
          },
          onClick: () => {
            if (isDir) emit('toggle-folder', props.node.path)
            else emit('select-file', props.node.path, props.node.name)
          },
          onContextmenu: (e) => { e.preventDefault(); e.stopPropagation(); emit('context-menu', e, props.node) },
          onMouseenter: () => { hovered.value = true },
          onMouseleave: () => { hovered.value = false },
          ...dragEvents,
        }, [
          // Chevron for folders
          isDir ? h('svg', {
            style: {
              width: '14px', height: '14px', flexShrink: 0, color: isActive ? '#fff' : '#9CA3AF',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s'
            },
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2'
          }, [h('polyline', { points: '9 18 15 12 9 6' })]) : h('span', { style: 'width:14px;display:inline-block;' }),

          // Icon
          isDir
            ? h('svg', { style: `width:18px;height:18px;flex-shrink:0;color:${isActive ? '#fff' : '#6B7280'};`, viewBox: '0 0 24 24', fill: 'currentColor' }, [
                h('path', { d: 'M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z' })
              ])
            : fileTypeIcon(props.node.name, isActive ? '#fff' : '#9CA3AF', isActive),

          // Name
          h('span', {
            class: 'truncate flex-1',
            style: { fontWeight: isDir ? '600' : '400' }
          }, props.node.name),
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
              'onMove-item': (src, dest) => emit('move-item', src, dest),
              'onContext-menu': (e, node) => emit('context-menu', e, node),
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
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  line-height: 1.75;
  color: #1A1A1A;
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
  color: #1A1A1A;
  background: #fff;
  border: none;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.prose-obsidian h1 { font-family: 'Inter', serif; font-size: var(--fs-page-title); font-weight: 700; margin: 0 0 16px; color: #1A1A1A; border-bottom: 1px solid #E5E5EA; padding-bottom: 8px; }
.prose-obsidian h2 { font-family: 'Inter', serif; font-size: var(--fs-section); font-weight: 600; margin: 28px 0 12px; color: #1A1A1A; }
.prose-obsidian h3 { font-family: 'Inter', serif; font-size: var(--fs-subtitle); font-weight: 600; margin: 24px 0 8px; color: #1A1A1A; }
.prose-obsidian p { margin: 0 0 12px; }
.prose-obsidian ul, .prose-obsidian ol { margin: 0 0 12px; padding-left: 24px; }
.prose-obsidian li { margin: 4px 0; }
.prose-obsidian code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875em;
  background: #F5F5F5;
  padding: 2px 6px;
  border-radius: 4px;
  color: #5856D6;
}
.prose-obsidian pre {
  background: #1C1C1E;
  color: #E5E5EA;
  padding: 16px;
  border-radius: 12px;
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
  border-left: 3px solid #007AFF;
  margin: 0 0 12px;
  padding: 8px 16px;
  color: #6B7280;
  background: #F2F2F7;
  border-radius: 0 8px 8px 0;
}
.prose-obsidian a { color: #007AFF; text-decoration: none; }
.prose-obsidian a:hover { text-decoration: underline; }
.prose-obsidian hr { border: none; border-top: 1px solid #E5E5EA; margin: 24px 0; }
.prose-obsidian table { border-collapse: collapse; margin: 0 0 16px; width: 100%; }
.prose-obsidian th, .prose-obsidian td { border: 1px solid #E5E5EA; padding: 8px 12px; text-align: left; }
.prose-obsidian th { background: #F9F9F9; font-weight: 600; }
.prose-obsidian img { max-width: 100%; border-radius: 8px; }

/* ── Context menu ── */
.notes-ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}
.notes-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
  animation: ctxEnter 0.1s ease-out;
}
@keyframes ctxEnter {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1)  translateY(0); }
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #E5E5EA;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.ctx-item:hover { background: #1F1F1F; color: #FFFFFF; }
.ctx-item.ctx-danger { color: #FF453A; }
.ctx-item.ctx-danger:hover { background: rgba(255,69,58,0.15); }
.ctx-divider { height: 1px; background: #2A2A2A; margin: 4px 0; }

/* ── Context action dialog ── */
.notes-ctx-dialog {
  position: fixed;
  z-index: 9999;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  animation: ctxEnter 0.15s ease-out;
}
.ctx-dialog-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
  margin-bottom: 10px;
}
.ctx-dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  color: #FFFFFF;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-secondary);
  outline: none;
}
.ctx-dialog-input:focus { border-color: #4B5563; }
.ctx-dialog-input::placeholder { color: #4B5563; }
.ctx-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.ctx-dialog-cancel {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #2A2A2A;
  background: transparent;
  color: #9CA3AF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  cursor: pointer;
}
.ctx-dialog-cancel:hover { background: #1A1A1A; color: #FFFFFF; }
.ctx-dialog-confirm {
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.ctx-dialog-confirm:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }

/* Drag-and-drop states */
.tree-dragging {
  opacity: 0.4;
}
.root-drag-over {
  background: rgba(0, 122, 255, 0.04);
}

/* Resize handle */
.notes-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: #E5E5EA;
  transition: background 0.15s;
}
.notes-resize-handle:hover,
.notes-resize-handle:active {
  background: #007AFF;
}
.doc-tree-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #F9F9F9;
  position: relative;
  transition: width 0.2s ease, min-width 0.2s ease;
}
.doc-tree-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  flex-shrink: 0;
}
.doc-tree-icon-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.doc-tree-expand-tab {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 3rem;
  border: none;
  border-radius: 0 0.5rem 0.5rem 0;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  cursor: pointer;
  box-shadow: 2px 0 8px rgba(0,0,0,0.12);
  transition: width 0.15s ease, background 0.15s ease;
}
.doc-tree-expand-tab:hover {
  width: 1.875rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
</style>
