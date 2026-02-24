<template>
  <div class="rich-editor-wrapper">
    <!-- Formatting Toolbar -->
    <div
      class="flex items-center gap-0.5 px-2 py-1.5 flex-wrap"
      style="border-bottom:1px solid #E2E8F0; background:#F8FAFC;"
    >
      <!-- Bold -->
      <button
        @click="editor?.chain().focus().toggleBold().run()"
        :class="toolbarBtnClass(editor?.isActive('bold'))"
        title="Bold (Ctrl+B)"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
        </svg>
      </button>

      <!-- Italic -->
      <button
        @click="editor?.chain().focus().toggleItalic().run()"
        :class="toolbarBtnClass(editor?.isActive('italic'))"
        title="Italic (Ctrl+I)"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>
        </svg>
      </button>

      <!-- Strikethrough -->
      <button
        @click="editor?.chain().focus().toggleStrike().run()"
        :class="toolbarBtnClass(editor?.isActive('strike'))"
        title="Strikethrough"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="12" x2="20" y2="12"/>
          <path d="M17.5 7.5C17.5 5.01 15.49 3 13 3H8v9"/>
          <path d="M8 21h5c2.49 0 4.5-2.01 4.5-4.5 0-1.57-.8-2.95-2-3.76"/>
        </svg>
      </button>

      <!-- Inline Code -->
      <button
        @click="editor?.chain().focus().toggleCode().run()"
        :class="toolbarBtnClass(editor?.isActive('code'))"
        title="Inline code"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
      </button>

      <!-- Divider -->
      <div class="w-px h-5 mx-1" style="background:#E2E8F0;"></div>

      <!-- Heading 2 -->
      <button
        @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
        :class="toolbarBtnClass(editor?.isActive('heading', { level: 2 }))"
        title="Heading"
      >
        <span class="text-xs font-bold" style="line-height:1;">H</span>
      </button>

      <!-- Blockquote -->
      <button
        @click="editor?.chain().focus().toggleBlockquote().run()"
        :class="toolbarBtnClass(editor?.isActive('blockquote'))"
        title="Quote"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 8.5v-3a1 1 0 00-1-1H5a1 1 0 00-1 1V11a5 5 0 005 5h.5a.5.5 0 00.5-.5v-1a.5.5 0 00-.5-.5H9a3 3 0 01-3-3v-.5a.5.5 0 01.5-.5H9a1 1 0 001-1zm10 0v-3a1 1 0 00-1-1h-4a1 1 0 00-1 1V11a5 5 0 005 5h.5a.5.5 0 00.5-.5v-1a.5.5 0 00-.5-.5H19a3 3 0 01-3-3v-.5a.5.5 0 01.5-.5H19a1 1 0 001-1z"/>
        </svg>
      </button>

      <!-- Divider -->
      <div class="w-px h-5 mx-1" style="background:#E2E8F0;"></div>

      <!-- Bullet List -->
      <button
        @click="editor?.chain().focus().toggleBulletList().run()"
        :class="toolbarBtnClass(editor?.isActive('bulletList'))"
        title="Bullet list"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
          <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
      </button>

      <!-- Ordered List -->
      <button
        @click="editor?.chain().focus().toggleOrderedList().run()"
        :class="toolbarBtnClass(editor?.isActive('orderedList'))"
        title="Numbered list"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/>
          <text x="2" y="8" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">1</text>
          <text x="2" y="14" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">2</text>
          <text x="2" y="20" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">3</text>
        </svg>
      </button>

      <!-- Divider -->
      <div class="w-px h-5 mx-1" style="background:#E2E8F0;"></div>

      <!-- Code Block -->
      <button
        @click="editor?.chain().focus().toggleCodeBlock().run()"
        :class="toolbarBtnClass(editor?.isActive('codeBlock'))"
        title="Code block"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <polyline points="8 8 6 10 8 12"/><polyline points="16 8 18 10 16 12"/>
          <line x1="12" y1="7" x2="12" y2="13"/>
        </svg>
      </button>

      <!-- Horizontal Rule -->
      <button
        @click="editor?.chain().focus().setHorizontalRule().run()"
        class="w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer"
        style="color:#64748B;"
        @mouseenter="e => e.currentTarget.style.background='#E2E8F0'"
        @mouseleave="e => e.currentTarget.style.background=''"
        title="Horizontal rule"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"/>
        </svg>
      </button>
    </div>

    <!-- Editor Content Area -->
    <editor-content
      :editor="editor"
      class="rich-editor-content"
    />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Type your message here…' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'submit'])

const editor = useEditor({
  content: props.modelValue ? markdownToHtml(props.modelValue) : '',
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] }
    }),
    Placeholder.configure({
      placeholder: props.placeholder
    })
  ],
  editorProps: {
    attributes: {
      class: 'outline-none leading-relaxed',
      style: 'color:#1E293B; font-size:var(--fs-body); min-height:72px; max-height:200px; overflow-y:auto; padding:8px 12px;'
    },
    handleKeyDown(view, event) {
      // Enter without shift = submit
      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
        // Don't submit if in a list or code block
        const { state } = view
        const { $from } = state.selection
        const inList = $from.node(-1)?.type?.name === 'listItem'
        const inCodeBlock = $from.parent?.type?.name === 'codeBlock'
        if (inList || inCodeBlock) return false

        event.preventDefault()
        emit('submit')
        return true
      }
      return false
    }
  },
  onUpdate({ editor: ed }) {
    emit('update:modelValue', getMarkdown(ed))
  }
})

watch(() => props.disabled, (val) => {
  editor.value?.setEditable(!val)
})

watch(() => props.modelValue, (val) => {
  // Only update if the value differs from current editor content
  if (editor.value && getMarkdown(editor.value) !== val) {
    editor.value.commands.setContent(val ? markdownToHtml(val) : '')
  }
})

function toolbarBtnClass(isActive) {
  return [
    'w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer',
    isActive
      ? 'bg-blue-100 text-blue-600'
      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
  ]
}

/** Convert editor HTML to markdown */
function getMarkdown(ed) {
  if (!ed) return ''
  const html = ed.getHTML()
  if (!html || html === '<p></p>') return ''
  return htmlToMarkdown(html)
}

/** Simple HTML→Markdown conversion using Turndown */
function htmlToMarkdown(html) {
  try {
    const TurndownService = require('turndown')
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-'
    })
    // Fix: preserve line breaks within blocks
    td.addRule('lineBreak', {
      filter: 'br',
      replacement: () => '\n'
    })
    return td.turndown(html).trim()
  } catch {
    // Fallback: strip tags
    return html.replace(/<[^>]+>/g, '').trim()
  }
}

/** Simple markdown→HTML for initial content loading */
function markdownToHtml(md) {
  if (!md) return ''
  // Basic conversion for pre-existing text
  // Bold, italic, code, lists are handled by TipTap on paste
  // For initial content, wrap in <p> tags
  return md.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('')
}

/** Focus the editor */
function focus() {
  editor.value?.commands.focus()
}

/** Clear editor content */
function clear() {
  editor.value?.commands.clearContent()
}

/** Check if editor is empty */
function isEmpty() {
  return editor.value?.isEmpty ?? true
}

defineExpose({ focus, clear, isEmpty, getMarkdown: () => getMarkdown(editor.value) })

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<style>
/* TipTap editor styling */
.rich-editor-content .tiptap {
  outline: none;
  min-height: 72px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px 12px;
  font-size: var(--fs-body);
  line-height: 1.65;
  color: #1E293B;
}

.rich-editor-content .tiptap p {
  margin: 0 0 0.25em 0;
}

.rich-editor-content .tiptap p:last-child {
  margin-bottom: 0;
}

.rich-editor-content .tiptap h1,
.rich-editor-content .tiptap h2,
.rich-editor-content .tiptap h3 {
  font-weight: 600;
  margin: 0.5em 0 0.25em 0;
  color: #0F172A;
}

.rich-editor-content .tiptap h1 { font-size: var(--fs-section); }
.rich-editor-content .tiptap h2 { font-size: var(--fs-subtitle); }
.rich-editor-content .tiptap h3 { font-size: var(--fs-body); }

.rich-editor-content .tiptap strong {
  font-weight: 700;
}

.rich-editor-content .tiptap em {
  font-style: italic;
}

.rich-editor-content .tiptap s {
  text-decoration: line-through;
  opacity: 0.7;
}

.rich-editor-content .tiptap code {
  background: #F1F5F9;
  color: #E11D48;
  border-radius: 4px;
  padding: 0.15em 0.35em;
  font-size: 0.85em;
  font-family: 'JetBrains Mono', monospace;
}

.rich-editor-content .tiptap pre {
  background: #0F172A;
  color: #E2E8F0;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 0.5em 0;
  overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-caption);
  line-height: 1.5;
}

.rich-editor-content .tiptap pre code {
  background: none;
  color: inherit;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

.rich-editor-content .tiptap blockquote {
  border-left: 3px solid #3B82F6;
  padding-left: 12px;
  margin: 0.5em 0;
  color: #475569;
  font-style: italic;
}

.rich-editor-content .tiptap ul,
.rich-editor-content .tiptap ol {
  padding-left: 1.5em;
  margin: 0.25em 0;
}

.rich-editor-content .tiptap li {
  margin: 0.15em 0;
}

.rich-editor-content .tiptap ul li {
  list-style-type: disc;
}

.rich-editor-content .tiptap ol li {
  list-style-type: decimal;
}

.rich-editor-content .tiptap hr {
  border: none;
  border-top: 1px solid #E2E8F0;
  margin: 0.75em 0;
}

/* Placeholder styling */
.rich-editor-content .tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #94A3B8;
  pointer-events: none;
  height: 0;
}
</style>
