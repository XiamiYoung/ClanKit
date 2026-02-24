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
        <!-- Manual path input -->
        <div class="flex items-center gap-2 mb-4" style="width:100%;">
          <input
            v-model="manualPath"
            @keydown.enter="submitManualPath"
            placeholder="Enter folder path, e.g. /mnt/c/Users/you/notes"
            class="flex-1 px-4 py-3 rounded-xl text-sm"
            style="border:1px solid #E2E8F0; outline:none; font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); color:#1E293B; background:#fff;"
            @focus="e => e.currentTarget.style.borderColor='#3B82F6'"
            @blur="e => e.currentTarget.style.borderColor='#E2E8F0'"
          />
          <button
            @click="submitManualPath"
            class="px-4 py-3 rounded-xl text-white font-semibold transition-all duration-200 cursor-pointer shrink-0"
            style="background:#3B82F6; font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); border:none;"
            @mouseenter="e => e.currentTarget.style.background='#2563EB'"
            @mouseleave="e => e.currentTarget.style.background='#3B82F6'"
          >Open</button>
        </div>

        <div class="flex items-center gap-3 mb-4" style="width:100%;">
          <div style="flex:1; height:1px; background:#E2E8F0;"></div>
          <span style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-caption); color:#94A3B8;">or</span>
          <div style="flex:1; height:1px; background:#E2E8F0;"></div>
        </div>

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
          <template v-if="showVaultPathInput">
            <input
              ref="vaultPathInputRef"
              v-model="manualPath"
              @keydown.enter="submitManualPath"
              @keydown.escape="showVaultPathInput = false"
              placeholder="Enter folder path..."
              class="px-2.5 py-1.5 rounded-lg text-sm"
              style="border:1px solid #3B82F6; outline:none; font-family:'Noto Sans',sans-serif; width:280px; color:#1E293B;"
            />
            <button
              @click="submitManualPath"
              class="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
              style="color:#fff; background:#3B82F6; border:none; font-family:'Noto Sans',sans-serif;"
            >Go</button>
            <button
              @click="showVaultPathInput = false"
              class="px-2 py-1.5 rounded-lg text-sm cursor-pointer"
              style="color:#64748B; background:transparent; border:none;"
            >&times;</button>
          </template>
          <template v-else>
            <button
              @click="showVaultPathInput = true; nextTick(() => vaultPathInputRef?.focus())"
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer"
              style="color:#64748B; background:#F1F5F9; border:1px solid #E2E8F0; font-family:'Noto Sans',sans-serif;"
              @mouseenter="e => { e.currentTarget.style.background='#E2E8F0'; e.currentTarget.style.color='#1E293B' }"
              @mouseleave="e => { e.currentTarget.style.background='#F1F5F9'; e.currentTarget.style.color='#64748B' }"
              title="Enter path manually"
            >Set Path</button>
            <button
              @click="store.pickVault()"
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer"
              style="color:#64748B; background:#F1F5F9; border:1px solid #E2E8F0; font-family:'Noto Sans',sans-serif;"
              @mouseenter="e => { e.currentTarget.style.background='#E2E8F0'; e.currentTarget.style.color='#1E293B' }"
              @mouseleave="e => { e.currentTarget.style.background='#F1F5F9'; e.currentTarget.style.color='#64748B' }"
              title="Browse with folder picker"
            >Browse</button>
          </template>
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
              <span
                v-if="store.activeFile.dirty"
                class="px-1.5 py-0.5 rounded-full text-xs"
                style="background:#FEF3C7; color:#92400E; font-family:'Noto Sans',sans-serif;"
              >unsaved</span>

              <div class="ml-auto flex items-center gap-2">
                <!-- Save button -->
                <button
                  v-if="store.activeFile.dirty"
                  @click="store.saveFile()"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  style="color:#fff; background:#3B82F6; border:none; font-family:'Noto Sans',sans-serif;"
                  @mouseenter="e => e.currentTarget.style.background='#2563EB'"
                  @mouseleave="e => e.currentTarget.style.background='#3B82F6'"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Save
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
                  >Preview</button>
                  <button
                    @click="editMode = true"
                    class="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                    :style="editMode
                      ? 'background:#3B82F6; color:#fff; border:none;'
                      : 'background:#fff; color:#64748B; border:none;'"
                    style="font-family:'Noto Sans',sans-serif;"
                  >Edit</button>
                </div>
              </div>
            </div>

            <!-- Preview mode -->
            <div
              v-if="!editMode"
              class="flex-1 overflow-y-auto px-8 py-6"
              style="scrollbar-width:thin;"
            >
              <div
                class="prose-obsidian"
                v-html="renderedMarkdown"
              />
            </div>

            <!-- Edit mode -->
            <textarea
              v-else
              v-model="editorContent"
              @keydown.ctrl.s.prevent="store.saveFile()"
              @keydown.meta.s.prevent="store.saveFile()"
              class="flex-1 w-full resize-none outline-none px-8 py-6"
              style="font-family:'JetBrains Mono','Fira Code','Cascadia Code',monospace; font-size:var(--fs-secondary); line-height:1.7; color:#1E293B; background:#fff; border:none; scrollbar-width:thin; white-space:pre-wrap; word-wrap:break-word; overflow-wrap:break-word;"
              spellcheck="false"
            />
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, defineComponent, h } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import { useObsidianStore } from '../stores/obsidian'

const store = useObsidianStore()

const editMode = ref(false)
const showNewFileInput = ref(false)
const showNewFolderInput = ref(false)
const newItemParent = ref('')
const newItemName = ref('')
const newFileInputRef = ref(null)
const newFolderInputRef = ref(null)
const manualPath = ref('')
const showVaultPathInput = ref(false)
const vaultPathInputRef = ref(null)

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

// Sync local → store on every edit (marks dirty)
watch(editorContent, (val) => {
  if (store.activeFile && val !== store.activeFile.content) {
    store.updateContent(val)
  }
})

// Markdown rendering
marked.use({ gfm: true, breaks: true })

const renderedMarkdown = computed(() => {
  if (!store.activeFile?.content) return ''
  try {
    const raw = marked.parse(store.activeFile.content)
    return DOMPurify.sanitize(raw)
  } catch { return '' }
})

// Reset edit mode when switching files
watch(() => store.activeFile?.path, () => { editMode.value = false })

// Auto-focus new file/folder inputs
watch(showNewFileInput, async (v) => { if (v) { await nextTick(); newFileInputRef.value?.focus() } })
watch(showNewFolderInput, async (v) => { if (v) { await nextTick(); newFolderInputRef.value?.focus() } })

async function submitManualPath() {
  if (!manualPath.value.trim()) return
  await store.setVaultManually(manualPath.value)
  manualPath.value = ''
  showVaultPathInput.value = false
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
  max-width: 800px;
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
