<template>
  <div class="docx-editor">

    <!-- ══════════════ MENUBAR ══════════════ -->
    <div class="docx-menubar">
      <div class="menu-tabs">
        <button
          v-for="tab in menuTabs"
          :key="tab.id"
          class="menu-tab"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = activeTab === tab.id ? '' : tab.id"
        >{{ tab.label }}</button>
      </div>
      <div class="menu-right">
        <span v-if="saving" class="save-indicator">
          <svg class="animate-spin" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
          Saving
        </span>
        <div class="zoom-controls">
          <button class="zoom-btn" @click="zoomOut" :disabled="zoom <= 50">-</button>
          <span class="zoom-label">{{ zoom }}%</span>
          <button class="zoom-btn" @click="zoomIn" :disabled="zoom >= 200">+</button>
        </div>
      </div>
    </div>

    <!-- ── Ribbon: contextual toolbar per tab ── -->
    <div v-if="activeTab" class="docx-ribbon">

      <!-- FILE -->
      <template v-if="activeTab === 'file'">
        <div class="ribbon-group">
          <span class="ribbon-label">File</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="saveDocument" :disabled="saving">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <span>Save</span>
            </button>
          </div>
        </div>
      </template>

      <!-- FORMAT -->
      <template v-if="activeTab === 'format'">
        <div class="ribbon-group">
          <span class="ribbon-label">Text</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive('bold') }" @click="editor?.chain().focus().toggleBold().run()" title="Bold (Ctrl+B)">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/></svg>
            </button>
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive('italic') }" @click="editor?.chain().focus().toggleItalic().run()" title="Italic (Ctrl+I)">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
            </button>
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive('underline') }" @click="editor?.chain().focus().toggleUnderline().run()" title="Underline (Ctrl+U)">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
            </button>
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive('strike') }" @click="editor?.chain().focus().toggleStrike().run()" title="Strikethrough">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H8"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Color</span>
          <div class="ribbon-row">
            <label class="ribbon-btn color-picker-btn" title="Text Color">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16"/><path d="M9.5 4L5 16h2l1-3h8l1 3h2L14.5 4z"/></svg>
              <input type="color" class="color-input" @input="e => editor?.chain().focus().setColor(e.target.value).run()" />
            </label>
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive('highlight') }" @click="editor?.chain().focus().toggleHighlight().run()" title="Highlight">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Alignment</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive({ textAlign: 'left' }) }" @click="editor?.chain().focus().setTextAlign('left').run()" title="Align Left">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
            </button>
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive({ textAlign: 'center' }) }" @click="editor?.chain().focus().setTextAlign('center').run()" title="Center">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="18" y1="14" x2="6" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
            </button>
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive({ textAlign: 'right' }) }" @click="editor?.chain().focus().setTextAlign('right').run()" title="Align Right">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="7" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Lists</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive('bulletList') }" @click="editor?.chain().focus().toggleBulletList().run()" title="Bullet List">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
            </button>
            <button class="ribbon-btn" :class="{ toggled: editor?.isActive('orderedList') }" @click="editor?.chain().focus().toggleOrderedList().run()" title="Numbered List">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fill="currentColor" font-size="7" font-weight="600">1</text><text x="2" y="14" fill="currentColor" font-size="7" font-weight="600">2</text><text x="2" y="20" fill="currentColor" font-size="7" font-weight="600">3</text></svg>
            </button>
          </div>
        </div>
      </template>

      <!-- INSERT -->
      <template v-if="activeTab === 'insert'">
        <div class="ribbon-group">
          <span class="ribbon-label">Heading</span>
          <div class="ribbon-row">
            <button v-for="n in 3" :key="n" class="ribbon-btn" :class="{ toggled: editor?.isActive('heading', { level: n }) }" @click="editor?.chain().focus().toggleHeading({ level: n }).run()">
              <span style="font-weight:700;font-size:13px;">H{{ n }}</span>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Objects</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="insertTable" title="Insert Table">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
              <span>Table</span>
            </button>
            <button class="ribbon-btn" @click="editor?.chain().focus().setHorizontalRule().run()" title="Horizontal Rule">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>
              <span>Rule</span>
            </button>
            <button class="ribbon-btn" @click="editor?.chain().focus().toggleBlockquote().run()" title="Blockquote">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>
              <span>Quote</span>
            </button>
          </div>
        </div>
      </template>

      <!-- TABLE (shown when cursor is inside a table) -->
      <template v-if="activeTab === 'table'">
        <div class="ribbon-group">
          <span class="ribbon-label">Rows</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="editor?.chain().focus().addRowBefore().run()">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Above</span>
            </button>
            <button class="ribbon-btn" @click="editor?.chain().focus().addRowAfter().run()">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Below</span>
            </button>
            <button class="ribbon-btn" @click="editor?.chain().focus().deleteRow().run()">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Columns</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="editor?.chain().focus().addColumnBefore().run()">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Left</span>
            </button>
            <button class="ribbon-btn" @click="editor?.chain().focus().addColumnAfter().run()">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Right</span>
            </button>
            <button class="ribbon-btn" @click="editor?.chain().focus().deleteColumn().run()">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Merge</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="editor?.chain().focus().mergeCells().run()">
              <span>Merge</span>
            </button>
            <button class="ribbon-btn" @click="editor?.chain().focus().splitCell().run()">
              <span>Split</span>
            </button>
            <button class="ribbon-btn" @click="editor?.chain().focus().deleteTable().run()">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              <span>Delete Table</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- ══════════════ EDITOR SURFACE ══════════════ -->
    <div class="docx-surface" ref="surfaceRef">
      <div v-if="loading" class="docx-loading">
        <svg class="animate-spin" style="width:24px;height:24px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
        <span>Loading document...</span>
      </div>
      <div
        v-else
        class="docx-page"
        :style="{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }"
        @contextmenu.prevent="onContextMenu"
      >
        <EditorContent :editor="editor" class="docx-content" />
      </div>
    </div>
  </div>

  <!-- Context menu -->
  <Teleport to="body">
    <div
      v-if="ctxMenu.visible"
      class="docx-ctx-menu"
      :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
      @mousedown.stop
    >
      <button class="docx-ctx-item" @click="ctxCopy">
        <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
        <span class="docx-ctx-shortcut">Ctrl+C</span>
      </button>
      <button class="docx-ctx-item" @click="ctxCut">
        <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
        Cut
        <span class="docx-ctx-shortcut">Ctrl+X</span>
      </button>
      <button class="docx-ctx-item" @click="ctxPaste">
        <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        Paste
        <span class="docx-ctx-shortcut">Ctrl+V</span>
      </button>
      <div class="docx-ctx-sep"></div>
      <button class="docx-ctx-item" @click="ctxSelectAll">
        <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        Select all
        <span class="docx-ctx-shortcut">Ctrl+A</span>
      </button>
      <div class="docx-ctx-sep"></div>
      <button class="docx-ctx-item docx-ctx-item-ai" @click="ctxAskAi">
        <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>
        Ask AI Assistant
        <span class="docx-ctx-shortcut">Ctrl+K</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import mammoth from 'mammoth/mammoth.browser.min.js'

const props = defineProps({
  base64: { type: String, required: true },
  filePath: { type: String, default: '' },
})
const emit = defineEmits(['save', 'ai-edit'])

const menuTabs = [
  { id: 'file', label: 'File' },
  { id: 'format', label: 'Format' },
  { id: 'insert', label: 'Insert' },
  { id: 'table', label: 'Table' },
]
const activeTab = ref('')
const saving = ref(false)
const loading = ref(true)
const zoom = ref(100)
const surfaceRef = ref(null)
const initialHtml = shallowRef('')

function zoomIn() { zoom.value = Math.min(200, zoom.value + 10) }
function zoomOut() { zoom.value = Math.max(50, zoom.value - 10) }

const editor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Image,
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
  ],
  content: '',
  editorProps: {
    attributes: { class: 'docx-tiptap-editor' },
  },
})

function insertTable() {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

// Parse .docx binary → HTML via mammoth
async function loadDocx(b64) {
  loading.value = true
  try {
    const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const result = await mammoth.convertToHtml({ arrayBuffer: binary.buffer })
    initialHtml.value = result.value || ''
    editor.value?.commands.setContent(initialHtml.value)
  } catch (err) {
    console.error('DocxEditor: failed to parse docx', err)
    editor.value?.commands.setContent('<p>Failed to load document.</p>')
  } finally {
    loading.value = false
  }
}

// Save: TipTap HTML → docx via the `docx` library
async function saveDocument() {
  if (!editor.value || saving.value) return
  saving.value = true
  try {
    const html = editor.value.getHTML()
    const base64 = await htmlToDocxBase64(html)
    emit('save', base64)
  } catch (err) {
    console.error('DocxEditor: save failed', err)
  } finally {
    saving.value = false
  }
}

// Convert TipTap HTML → docx buffer → base64
async function htmlToDocxBase64(html) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel,
          Table: DocxTable, TableRow: DocxTR, TableCell: DocxTC,
          WidthType, AlignmentType, BorderStyle } = await import('docx')

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  const children = []

  function parseInlineRuns(el) {
    const runs = []
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent
        if (!text) continue
        // Walk up to collect formatting
        const opts = { text }
        let parent = node.parentElement
        while (parent && parent !== doc.body) {
          const tag = parent.tagName.toLowerCase()
          if (tag === 'strong' || tag === 'b') opts.bold = true
          if (tag === 'em' || tag === 'i') opts.italics = true
          if (tag === 'u') opts.underline = {}
          if (tag === 's' || tag === 'del') opts.strike = true
          if (tag === 'mark') opts.highlight = 'yellow'
          const color = parent.style?.color
          if (color && color.startsWith('#')) opts.color = color.replace('#', '')
          parent = parent.parentElement
        }
        runs.push(new TextRun(opts))
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        runs.push(...parseInlineRuns(node))
      }
    }
    return runs
  }

  function getAlignment(el) {
    const align = el.style?.textAlign || el.getAttribute('align') || ''
    if (align === 'center') return AlignmentType.CENTER
    if (align === 'right') return AlignmentType.RIGHT
    if (align === 'justify') return AlignmentType.JUSTIFIED
    return undefined
  }

  function walkNodes(container) {
    for (const el of container.children) {
      const tag = el.tagName.toLowerCase()

      if (tag === 'p' || tag === 'div') {
        children.push(new Paragraph({
          children: parseInlineRuns(el),
          alignment: getAlignment(el),
        }))
      } else if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1])
        const headingMap = {
          1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4, 5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6,
        }
        children.push(new Paragraph({
          heading: headingMap[level] || HeadingLevel.HEADING_1,
          children: parseInlineRuns(el),
          alignment: getAlignment(el),
        }))
      } else if (tag === 'ul' || tag === 'ol') {
        const items = el.querySelectorAll(':scope > li')
        items.forEach((li, idx) => {
          children.push(new Paragraph({
            children: parseInlineRuns(li),
            bullet: tag === 'ul' ? { level: 0 } : undefined,
            numbering: tag === 'ol' ? { reference: 'default-numbering', level: 0 } : undefined,
          }))
        })
      } else if (tag === 'blockquote') {
        // Flatten blockquote paragraphs with indent
        for (const child of el.children) {
          children.push(new Paragraph({
            children: parseInlineRuns(child.tagName ? child : el),
            indent: { left: 720 },
          }))
        }
        if (el.children.length === 0) {
          children.push(new Paragraph({
            children: parseInlineRuns(el),
            indent: { left: 720 },
          }))
        }
      } else if (tag === 'table') {
        const rows = []
        const trs = el.querySelectorAll('tr')
        trs.forEach(tr => {
          const cells = []
          tr.querySelectorAll('td, th').forEach(td => {
            cells.push(new DocxTC({
              children: [new Paragraph({ children: parseInlineRuns(td) })],
              width: { size: 2400, type: WidthType.DXA },
            }))
          })
          if (cells.length > 0) rows.push(new DocxTR({ children: cells }))
        })
        if (rows.length > 0) {
          children.push(new DocxTable({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }))
        }
      } else if (tag === 'hr') {
        children.push(new Paragraph({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
        }))
      } else {
        // Fallback: treat as paragraph
        children.push(new Paragraph({ children: parseInlineRuns(el) }))
      }
    }
  }

  walkNodes(doc.body)
  if (children.length === 0) children.push(new Paragraph(''))

  const docx = new Document({
    sections: [{ children }],
  })
  const buffer = await Packer.toBuffer(docx)
  // Convert Buffer to base64
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// Ctrl+S shortcut + Ctrl+K AI edit
function onKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveDocument()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    triggerAiEdit(e)
  }
}

function triggerAiEdit(e) {
  if (!editor.value) return
  const { from, to, empty } = editor.value.state.selection
  if (empty) return
  const text = editor.value.state.doc.textBetween(from, to, '\n')
  if (!text.trim()) return

  e.preventDefault()
  e.stopPropagation()

  // Get position from browser selection
  const sel = window.getSelection()
  let top = 200, left = 200
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    top = Math.min(rect.bottom + 8, window.innerHeight - 320)
    left = Math.max(16, Math.min(rect.left, window.innerWidth - 520))
  }

  emit('ai-edit', {
    selectedText: text,
    position: { top, left },
    fileContext: {
      fileName: props.filePath.split(/[/\\]/).pop() || 'document.docx',
      filePath: props.filePath,
      language: 'rich-text',
    },
    replaceCallback: (newText) => {
      editor.value?.chain().focus().insertContentAt({ from, to }, newText).run()
    },
  })
}

// ── Context menu ──────────────────────────────────────────────────────────────
const ctxMenu = reactive({ visible: false, x: 0, y: 0 })

function onContextMenu(e) {
  ctxMenu.x = Math.min(e.clientX, window.innerWidth - 200)
  ctxMenu.y = Math.min(e.clientY, window.innerHeight - 200)
  ctxMenu.visible = true
  nextTick(() => {
    document.addEventListener('mousedown', closeCtxMenu, { once: true })
  })
}

function closeCtxMenu() {
  ctxMenu.visible = false
}

function ctxCopy() {
  closeCtxMenu()
  document.execCommand('copy')
}

function ctxCut() {
  closeCtxMenu()
  document.execCommand('cut')
}

function ctxPaste() {
  closeCtxMenu()
  navigator.clipboard?.readText().then(text => {
    if (text) editor.value?.chain().focus().insertContent(text).run()
  }).catch(() => {
    document.execCommand('paste')
  })
}

function ctxSelectAll() {
  closeCtxMenu()
  editor.value?.chain().focus().selectAll().run()
}

function ctxAskAi() {
  closeCtxMenu()
  if (!editor.value) return
  const fullText = getPlainText()
  const { from, to, empty } = editor.value.state.selection
  const fileName = props.filePath.split(/[/\\]/).pop() || 'document.docx'
  const pos = {
    top: Math.min(ctxMenu.y + 8, window.innerHeight - 320),
    left: Math.max(16, Math.min(ctxMenu.x, window.innerWidth - 520)),
  }
  const fileContext = { fileName, filePath: props.filePath, language: 'rich-text' }

  if (empty) {
    // No selection — open panel with full document as context
    emit('ai-edit', {
      selectedText: '',
      fullFileContent: fullText,
      position: pos,
      fileContext,
      replaceCallback: null,
    })
  } else {
    const text = editor.value.state.doc.textBetween(from, to, '\n')
    emit('ai-edit', {
      selectedText: text,
      fullFileContent: fullText,
      position: pos,
      fileContext,
      replaceCallback: (newText) => {
        editor.value?.chain().focus().insertContentAt({ from, to }, newText).run()
      },
    })
  }
}

/** Extract full document plain text for AI context. */
function getPlainText() {
  if (!editor.value) return ''
  return editor.value.state.doc.textContent
}

onMounted(() => {
  loadDocx(props.base64)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('mousedown', closeCtxMenu)
  editor.value?.destroy()
})

function _makeSearchRegex(query, { matchCase, wholeWord }) {
  const flags = matchCase ? 'g' : 'gi'
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped
  return new RegExp(pattern, flags)
}

function countMatches(query, opts = {}) {
  if (!query || !editor.value) return 0
  const text = editor.value.state.doc.textContent
  const m = text.match(_makeSearchRegex(query, opts))
  return m ? m.length : 0
}

function performSearchReplace(query, replacement, opts = {}) {
  if (!query || !editor.value) return { matchCount: 0, replaced: 0 }
  const text = editor.value.state.doc.textContent
  const re = _makeSearchRegex(query, opts)
  const matches = text.match(re)
  const matchCount = matches ? matches.length : 0
  if (matchCount === 0 || replacement === null) return { matchCount, replaced: 0 }
  // Use TipTap replaceAll approach: get full HTML, replace text, set content
  const html = editor.value.getHTML()
  const newHtml = html.replace(re, replacement)
  editor.value.commands.setContent(newHtml, false)
  return { matchCount, replaced: matchCount }
}

defineExpose({ getPlainText, countMatches, performSearchReplace })

watch(() => props.base64, (val) => {
  if (val) loadDocx(val)
})
</script>

<style scoped>
.docx-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #F2F2F7;
  font-family: 'Inter', sans-serif;
}

/* ── Menubar ── */
.docx-menubar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
  height: 2.25rem;
  background: #fff;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
}
.menu-tabs { display: flex; gap: 0; }
.menu-tab {
  padding: 0.25rem 0.75rem;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: #6B7280;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}
.menu-tab:hover { color: #1A1A1A; background: #F5F5F5; }
.menu-tab.active {
  color: #fff;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
}
.menu-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.save-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--fs-caption);
  color: #007AFF;
}
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.zoom-btn {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--radius-sm);
  border: 1px solid #E5E5EA;
  background: #fff;
  font-size: 14px;
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.zoom-btn:hover:not(:disabled) { background: #F5F5F5; color: #1A1A1A; }
.zoom-btn:disabled { opacity: 0.4; cursor: default; }
.zoom-label {
  font-size: var(--fs-small);
  color: #6B7280;
  min-width: 2.5rem;
  text-align: center;
}

/* ── Ribbon ── */
.docx-ribbon {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #FAFAFA;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
  overflow-x: auto;
}
.ribbon-group { display: flex; flex-direction: column; gap: 0.25rem; }
.ribbon-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9CA3AF;
  font-weight: 600;
}
.ribbon-row { display: flex; gap: 0.125rem; }
.ribbon-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.5rem;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: #374151;
  font-size: var(--fs-caption);
  cursor: pointer;
  transition: all 0.15s ease;
}
.ribbon-btn:hover:not(:disabled) { background: #E5E5EA; }
.ribbon-btn:disabled { opacity: 0.35; cursor: default; }
.ribbon-btn.toggled {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
}
.ribbon-sep {
  width: 1px;
  height: 2rem;
  background: #E5E5EA;
  flex-shrink: 0;
  align-self: center;
}
.color-picker-btn { position: relative; overflow: hidden; }
.color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

/* ── Editor surface ── */
.docx-surface {
  flex: 1;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
  
}
.docx-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 4rem;
  color: #9CA3AF;
  font-size: var(--fs-secondary);
}
.docx-page {
  width: 8.5in;
  min-height: 11in;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
  border-radius: 4px;
  padding: 1in 1.25in;
  transition: transform 0.15s ease;
}
</style>

<style>
/* TipTap editor styles (unscoped for deep reach) */
.docx-tiptap-editor {
  outline: none;
  font-family: 'Inter', 'Noto Sans', system-ui, sans-serif;
  font-size: 11pt;
  line-height: 1.6;
  color: #1A1A1A;
  min-height: 9in;
}
.docx-tiptap-editor p { margin: 0 0 0.5em; }
.docx-tiptap-editor h1 { font-size: 24pt; font-weight: 700; margin: 0.5em 0 0.3em; }
.docx-tiptap-editor h2 { font-size: 18pt; font-weight: 700; margin: 0.5em 0 0.3em; }
.docx-tiptap-editor h3 { font-size: 14pt; font-weight: 600; margin: 0.4em 0 0.2em; }
.docx-tiptap-editor h4 { font-size: 12pt; font-weight: 600; margin: 0.4em 0 0.2em; }
.docx-tiptap-editor ul, .docx-tiptap-editor ol { padding-left: 1.5em; margin: 0.3em 0; }
.docx-tiptap-editor li { margin: 0.15em 0; }
.docx-tiptap-editor blockquote {
  border-left: 3px solid #D1D5DB;
  padding-left: 1em;
  margin: 0.5em 0;
  color: #6B7280;
  font-style: italic;
}
.docx-tiptap-editor hr {
  border: none;
  border-top: 1px solid #D1D5DB;
  margin: 1em 0;
}
.docx-tiptap-editor table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}
.docx-tiptap-editor th,
.docx-tiptap-editor td {
  border: 1px solid #D1D5DB;
  padding: 0.4em 0.6em;
  min-width: 80px;
  vertical-align: top;
}
.docx-tiptap-editor th {
  background: #F3F4F6;
  font-weight: 600;
}
.docx-tiptap-editor img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
.docx-tiptap-editor mark {
  background: #FEF08A;
  padding: 0.1em 0.2em;
  border-radius: 2px;
}
/* Table selected cell highlight */
.docx-tiptap-editor .selectedCell {
  background: rgba(0, 122, 255, 0.08);
}

/* ── Docx Context Menu ── */
.docx-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 196px;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.14);
  padding: 0.3rem 0;
  animation: docxCtxEnter 0.12s ease-out;
}
@keyframes docxCtxEnter {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.docx-ctx-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.35rem 0.75rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #D1D5DB;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s, color 0.1s;
}
.docx-ctx-item:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
}
.docx-ctx-item svg { flex-shrink: 0; color: #6B7280; }
.docx-ctx-item:hover svg { color: rgba(255,255,255,0.7); }
.docx-ctx-item-ai { color: #FCD34D; }
.docx-ctx-item-ai:hover {
  background: linear-gradient(135deg, #78350F 0%, #92400E 40%, #B45309 100%) !important;
  color: #FFFFFF !important;
}
.docx-ctx-item-ai:hover svg { color: #FCD34D !important; }
.docx-ctx-shortcut {
  margin-left: auto;
  font-size: 0.6875rem;
  color: #4B5563;
  font-family: 'JetBrains Mono', monospace;
}
.docx-ctx-item:hover .docx-ctx-shortcut { color: rgba(255,255,255,0.35); }
.docx-ctx-sep {
  height: 1px;
  background: #1E1E1E;
  margin: 0.2rem 0;
}
</style>
