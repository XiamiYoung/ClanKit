<template>
  <div class="h-full flex flex-col overflow-hidden" style="background:#F2F2F7;">

    <!-- ════════════════════════════════════════════════════════════════════════
         LEVEL 1 — Skills Grid Catalog
         ════════════════════════════════════════════════════════════════════════ -->
    <template v-if="!selectedSkill">
      <!-- Header -->
      <div class="catalog-header">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <h1 style="font-family:'Inter',sans-serif; font-size:var(--fs-page-title); font-weight:700; color:#1A1A1A; margin:0;">{{ t('skills.title') }}</h1>
              <span class="catalog-count-badge">{{ filteredSkills.length }}</span>
            </div>
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#6B7280; margin:0.25rem 0 0 0;">
              {{ t('skills.subtitle') }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <AppButton size="icon" @click="refresh" :title="t('skills.refreshSkills')">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </AppButton>
          </div>
        </div>

        <!-- Search bar -->
        <div class="catalog-search-wrap">
          <svg class="catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('skills.searchSkills')"
            class="catalog-search-input"
          />
          <span v-if="searchQuery" class="catalog-search-clear" @click="searchQuery = ''">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </span>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="skillsStore.loading" class="flex-1 flex items-center justify-center">
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF;">{{ t('common.loading') }}</p>
      </div>

      <!-- Error -->
      <div v-else-if="skillsStore.error" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#dc2626;">{{ skillsStore.error }}</p>
          <button
            @click="refresh"
            class="mt-3 px-4 py-2 rounded-lg cursor-pointer"
            style="background:#007AFF; color:#fff; border:none; font-family:'Inter',sans-serif;"
          >{{ t('skills.retry') }}</button>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="skillsStore.skills.length === 0" class="flex-1 flex items-center justify-center">
        <div class="text-center" style="max-width:26.25rem;">
          <div
            class="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center"
            style="background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);"
          >
            <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <h2 style="font-family:'Inter',sans-serif; font-size:var(--fs-section); font-weight:700; color:#1A1A1A; margin:0 0 0.5rem;">
            {{ t('skills.noSkillsFound') }}
          </h2>
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; line-height:1.6; margin:0 0 1rem;">
            {{ t('skills.skillFolderHint') }}
          </p>
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF;">
            Default path: <code style="background:#F5F5F5; padding:0.125rem 0.375rem; border-radius:0.25rem; font-size:0.875em;">~/.claude/skills</code>
          </p>
        </div>
      </div>

      <!-- Skills Grid -->
      <div v-else class="flex-1 overflow-y-auto skill-grid-bg">
        <!-- No results for search -->
        <div v-if="filteredSkills.length === 0 && searchQuery" class="flex items-center justify-center" style="padding:3.75rem 2rem;">
          <div class="text-center">
            <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 0.25rem;">{{ t('common.noResults') }} "{{ searchQuery }}"</p>
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:0;">{{ t('skills.clearSearch') }}</p>
          </div>
        </div>

        <div v-else style="padding:1.5rem 2rem;">
          <div class="skill-grid">
            <div
              v-for="(skill, idx) in filteredSkills"
              :key="skill.id"
              @click="selectSkill(skill)"
              class="skill-card"
            >
              <!-- Gradient accent bar -->
              <div class="skill-card-accent" :style="{ background: cardGradient(idx) }"></div>

              <div class="skill-card-body">
                <!-- Icon + title row -->
                <div class="skill-card-title-row">
                  <div class="skill-card-icon" :style="{ background: cardGradient(idx) }">
                    <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  </div>
                  <h3 class="skill-card-name">{{ skillDisplayName(skill) }}</h3>
                </div>

                <!-- Description -->
                <p class="skill-card-desc">{{ skillDescription(skill) }}</p>

                <!-- Footer -->
                <div class="skill-card-footer">
                  <span class="skill-card-file">
                    <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    SKILL.md
                  </span>
                  <span class="skill-card-open">
                    Open
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ════════════════════════════════════════════════════════════════════════
         LEVEL 2 — Skill Detail (file explorer + content viewer)
         ════════════════════════════════════════════════════════════════════════ -->
    <template v-else>
      <!-- Header with back button -->
      <div class="detail-header">
        <button @click="goBack" class="detail-back-btn">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>

      <!-- File explorer + content viewer -->
      <div class="flex-1 flex overflow-hidden" style="flex-direction:column;">
        <!-- Skill title row -->
        <div class="detail-title-row">
          <div class="detail-icon">
            <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <h1 class="detail-title">{{ skillDisplayName(selectedSkill) }}</h1>
        </div>
        <div class="flex-1 flex overflow-hidden">

        <!-- LEFT: File tree sidebar (resizable) -->
        <div class="detail-sidebar" :style="{ width: skillsSidebarWidth + 'px' }">
          <!-- Resize handle -->
          <div
            class="skills-resize-handle"
            @mousedown="startSkillsResize"
          ></div>
          <!-- Tree header -->
          <div class="detail-sidebar-header">
            <span class="detail-sidebar-label">Files</span>
            <span class="detail-sidebar-path" :title="selectedSkill.path">
              {{ selectedSkill.path }}
            </span>
          </div>

          <!-- Tree toolbar -->
          <div class="px-3 py-2 flex items-center gap-1 shrink-0" style="border-bottom:1px solid #E5E5EA;">
            <button
              @click="refreshTree"
              class="ml-auto p-1.5 rounded-lg transition-all duration-150 cursor-pointer"
              style="color:#fff; border:none; background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);"
              @mouseenter="e => e.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)'"
              @mouseleave="e => e.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'"
              :title="t('common.refresh')"
            >
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
          </div>

          <!-- File tree -->
          <div class="flex-1 overflow-y-auto py-1.5" style="scrollbar-width:thin;">
            <div v-if="fileTree.length === 0" class="px-4 py-8 text-center">
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF;">{{ t('common.noData') }}</p>
            </div>
            <SkillTreeNode
              v-for="node in fileTree"
              :key="node.path"
              :node="node"
              :depth="0"
              :active-path="activeFilePath"
              :expanded-folders="expandedFolders"
              @select-file="openFile"
              @toggle-folder="toggleFolder"
              @context-menu="(e, node) => openSkillCtxMenu(e, node.path)"
            />
          </div>
        </div>

        <!-- RIGHT: File content viewer -->
        <div class="detail-content-area">
          <!-- No file selected -->
          <div v-if="!activeFilePath" class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <div class="detail-empty-icon">
                <svg style="width:32px;height:32px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; margin-top:0.75rem;">Select a file to view its contents</p>
            </div>
          </div>

          <!-- File open -->
          <template v-else>
            <!-- File header bar -->
            <div
              class="px-4 py-2.5 shrink-0 flex items-center gap-3"
              style="border-bottom:1px solid #E5E5EA; background:#F9F9F9;"
            >
              <svg style="width:16px;height:16px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#1A1A1A;">
                {{ activeFileName }}
              </span>
              <div class="ml-auto flex items-center gap-2">
                <!-- Auto-save indicator -->
                <span
                  v-if="saving"
                  class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style="background:rgba(0,122,255,0.1); color:#007AFF; font-family:'Inter',sans-serif;"
                >
                  <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
                  saving
                </span>

                <!-- Copy source (markdown files only) -->
                <button
                  v-if="isMarkdownFile"
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

                <!-- Mode toggle (markdown files only) -->
                <div
                  v-if="isMarkdownFile"
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

            <!-- Content area -->
            <template v-if="loadingFile">
              <div class="flex-1 flex items-center justify-center">
                <p style="color:#9CA3AF; font-family:'Inter',sans-serif; font-size:var(--fs-body);">{{ t('common.loading') }}</p>
              </div>
            </template>
            <template v-else-if="fileError">
              <div class="flex-1 flex items-center justify-center">
                <p style="color:#dc2626; font-family:'Inter',sans-serif; font-size:var(--fs-body);">{{ fileError }}</p>
              </div>
            </template>

            <!-- Markdown: Formatted mode (editable rich preview) -->
            <div
              v-else-if="isMarkdownFile && !editMode"
              class="flex-1 overflow-y-auto py-6"
              style="scrollbar-width:thin; display:flex; justify-content:center;"
            >
              <div
                ref="formattedEl"
                contenteditable="true"
                class="prose-skills"
                style="outline:none; cursor:text;"
                v-html="formattedHtml"
                @input="onFormattedInput"
              ></div>
            </div>

            <!-- Markdown: Source mode (textarea) -->
            <div
              v-else-if="isMarkdownFile && editMode"
              class="flex-1 overflow-y-auto"
              style="scrollbar-width:thin; display:flex; justify-content:center;"
            >
              <textarea
                v-model="editorContent"
                class="skills-source-editor"
                spellcheck="false"
              ></textarea>
            </div>

            <!-- Non-markdown: read-only raw view -->
            <div v-else class="detail-content-scroll">
              <pre class="detail-raw-code">{{ fileContent }}</pre>
            </div>
          </template>
        </div>
        </div>
      </div>
    </template>

    <!-- ── Skills file tree context menu ── -->
    <Teleport to="body">
      <div v-if="skillCtxMenu.visible" class="skill-ctx-overlay" @click="closeSkillCtxMenu" @contextmenu.prevent="closeSkillCtxMenu" />
      <div
        v-if="skillCtxMenu.visible"
        class="skill-ctx-menu"
        :style="{ top: skillCtxMenu.y + 'px', left: skillCtxMenu.x + 'px' }"
        @click.stop
      >
        <button class="skill-ctx-item" @click="copySkillPath">
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          {{ skillCtxPathCopied ? 'Copied!' : 'Copy Path' }}
        </button>
        <button class="skill-ctx-item" @click="revealSkillInExplorer(skillCtxMenu.path)">
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Open in Explorer
        </button>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, onBeforeUnmount, defineComponent, h, Teleport } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { useSkillsStore } from '../stores/skills'
import { useConfigStore } from '../stores/config'
import { useI18n } from '../i18n/useI18n'
import AppButton from '../components/common/AppButton.vue'

const { t } = useI18n()
const skillsStore = useSkillsStore()
const configStore = useConfigStore()

function cardGradient() {
  return 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'
}

function formatName(name) {
  return name
    .replace(/--/g, ' — ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Parse skill text — strip YAML frontmatter, extract description.
 * Handles both multi-line and single-line frontmatter.
 */
function parseSkillMeta(text) {
  if (!text) return { name: '', description: '' }

  // Multi-line frontmatter: ---\n...\n---
  const multiLine = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (multiLine) {
    const meta = {}
    for (const line of multiLine[1].split('\n')) {
      const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
      if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
    const body = multiLine[2].trim()
    return { name: meta.name || '', description: meta.description || body || '' }
  }

  // Single-line / broken frontmatter: "--- name: foo description: bar"
  const singleLine = text.match(/^---\s*/)
  if (singleLine) {
    const stripped = text.replace(/^---\s*/, '').replace(/\s*---\s*$/, '')
    const descMatch = stripped.match(/description:\s*["']?(.*?)["']?\s*$/)
    const desc = descMatch ? descMatch[1] : ''
    const nameMatch = stripped.match(/name:\s*["']?(.*?)["']?\s*(?:description:|$)/)
    const name = nameMatch ? nameMatch[1].trim() : ''
    return { name, description: desc || stripped }
  }

  return { name: '', description: text }
}

/** Get clean description for a skill, stripping any frontmatter. */
function skillDescription(skill) {
  // If backend already parsed it, use that
  if (skill.description) return skill.description
  const parsed = parseSkillMeta(skill.summary || '')
  return parsed.description || 'No description available'
}

/** Get display name for a skill. */
function skillDisplayName(skill) {
  if (skill.displayName) return skill.displayName
  const parsed = parseSkillMeta(skill.summary || '')
  if (parsed.name) return formatName(parsed.name)
  return formatName(skill.name)
}

const searchQuery = ref('')

const filteredSkills = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return skillsStore.skills
  return skillsStore.skills.filter(skill => {
    const name = (skill.displayName || skill.name || '').toLowerCase()
    const desc = skillDescription(skill).toLowerCase()
    const summary = (skill.summary || '').toLowerCase()
    const prompt = (skill.systemPrompt || '').toLowerCase()
    return name.includes(q) || desc.includes(q) || summary.includes(q) || prompt.includes(q)
  })
})

const selectedSkill = ref(null)
const fileTree = ref([])
const activeFilePath = ref(null)
const activeFileName = ref('')
const fileContent = ref('')
const loadingFile = ref(false)
const fileError = ref(null)
const expandedFolders = reactive({})

// ── Context menu ──
const skillCtxMenu = ref({ visible: false, x: 0, y: 0, path: '' })
const skillCtxPathCopied = ref(false)

function openSkillCtxMenu(e, path) {
  e.preventDefault()
  e.stopPropagation()
  const x = Math.min(e.clientX, window.innerWidth - 200)
  const y = Math.min(e.clientY, window.innerHeight - 80)
  skillCtxPathCopied.value = false
  skillCtxMenu.value = { visible: true, x, y, path }
}

function closeSkillCtxMenu() {
  skillCtxMenu.value.visible = false
}

function copySkillPath() {
  navigator.clipboard.writeText(skillCtxMenu.value.path)
  skillCtxPathCopied.value = true
  setTimeout(() => {
    skillCtxPathCopied.value = false
    closeSkillCtxMenu()
  }, 900)
}

function revealSkillInExplorer(path) {
  window.electronAPI.showInFolder(path)
  closeSkillCtxMenu()
}

const isMarkdownFile = computed(() => {
  if (!activeFileName.value) return false
  return activeFileName.value.endsWith('.md')
})

// ── Editing state ──
const editorContent = ref('')
const editMode = ref(false)
const saving = ref(false)
const copied = ref(false)
let copiedTimer = null
const formattedEl = ref(null)
const formattedHtml = ref('')
let autoSaveTimer = null
let editingFormatted = false

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

marked.use({ gfm: true, breaks: true })

function refreshFormattedHtml() {
  if (!editorContent.value) { formattedHtml.value = ''; return }
  try {
    const raw = marked.parse(editorContent.value)
    formattedHtml.value = DOMPurify.sanitize(raw)
  } catch { formattedHtml.value = '' }
}

const renderedMarkdown = computed(() => {
  return formattedHtml.value
})

// Auto-save (800ms debounce)
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    if (!activeFilePath.value || !window.electronAPI?.skills?.writeFile) return
    saving.value = true
    try {
      await window.electronAPI.skills.writeFile(activeFilePath.value, editorContent.value)
    } catch {}
    saving.value = false
  }, 800)
}

// Sync editorContent changes → auto-save + re-render
watch(editorContent, (val) => {
  if (val !== fileContent.value) {
    fileContent.value = val
    scheduleAutoSave()
  }
  if (!editingFormatted) refreshFormattedHtml()
})

onBeforeUnmount(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
})

function onFormattedInput(e) {
  editingFormatted = true
  const html = e.target.innerHTML
  const md = turndown.turndown(html)
  editorContent.value = md
  editingFormatted = false
}

function copySource() {
  navigator.clipboard.writeText(editorContent.value).catch(() => {})
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 2000)
}

async function refresh() {
  await skillsStore.loadSkills(configStore.config.skillsPath)
  await skillsStore.loadSkillPrompts(configStore.config.skillsPath)
  if (selectedSkill.value && !skillsStore.skills.find(s => s.id === selectedSkill.value.id)) {
    goBack()
  }
}

function goBack() {
  selectedSkill.value = null
  fileTree.value = []
  activeFilePath.value = null
  activeFileName.value = ''
  fileContent.value = ''
  fileError.value = null
}

async function selectSkill(skill) {
  selectedSkill.value = skill
  activeFilePath.value = null
  activeFileName.value = ''
  fileContent.value = ''
  fileError.value = null
  Object.keys(expandedFolders).forEach(k => delete expandedFolders[k])
  if (!window.electronAPI?.skills?.readTree) return
  try {
    fileTree.value = await window.electronAPI.skills.readTree(skill.path)
  } catch {
    fileTree.value = []
  }
  // Auto-open SKILL.md (or first .md file as fallback)
  const skillMd = fileTree.value.find(n => n.type === 'file' && n.name === 'SKILL.md')
  const fallbackMd = !skillMd && fileTree.value.find(n => n.type === 'file' && n.name.endsWith('.md'))
  const autoOpen = skillMd || fallbackMd
  if (autoOpen) {
    openFile(autoOpen.path, autoOpen.name)
  }
}

async function openFile(filePath, fileName) {
  activeFilePath.value = filePath
  activeFileName.value = fileName
  fileContent.value = ''
  editorContent.value = ''
  fileError.value = null
  loadingFile.value = true
  editMode.value = false
  if (!window.electronAPI?.skills?.readFile) return
  try {
    const result = await window.electronAPI.skills.readFile(filePath)
    if (result.error) {
      fileError.value = result.error
    } else {
      fileContent.value = result.content
      editorContent.value = result.content
      refreshFormattedHtml()
    }
  } catch (err) {
    fileError.value = err.message
  } finally {
    loadingFile.value = false
  }
}

async function refreshTree() {
  if (!selectedSkill.value || !window.electronAPI?.skills?.readTree) return
  try {
    fileTree.value = await window.electronAPI.skills.readTree(selectedSkill.value.path)
  } catch {
    fileTree.value = []
  }
}

function toggleFolder(folderPath) {
  expandedFolders[folderPath] = !expandedFolders[folderPath]
}

// ── Resizable sidebar ──
const skillsSidebarWidth = ref(260)

function startSkillsResize(e) {
  e.preventDefault()
  const startX = e.clientX
  const startW = skillsSidebarWidth.value

  function onMouseMove(ev) {
    const delta = ev.clientX - startX
    const newW = Math.min(600, Math.max(180, startW + delta))
    skillsSidebarWidth.value = newW
  }
  function onMouseUp() {
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

  if (ext === 'json') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1' }),
      h('path', { d: 'M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1' }),
    ])
  }

  if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('polyline', { points: '16 18 22 12 16 6' }),
      h('polyline', { points: '8 6 2 12 8 18' }),
    ])
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }),
      h('circle', { cx: '8.5', cy: '8.5', r: '1.5' }),
      h('polyline', { points: '21 15 16 10 5 21' }),
    ])
  }

  if (ext === 'pdf') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('path', { d: 'M9 15h1a1 1 0 0 0 0-2H9v4' }),
      h('path', { d: 'M14 13h1.5a1.5 1.5 0 0 1 0 3H14v-3z' }),
    ])
  }

  if (['txt', 'log', 'env', 'ini', 'cfg', 'conf', 'toml', 'yaml', 'yml'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('line', { x1: '8', y1: '13', x2: '16', y2: '13' }),
      h('line', { x1: '8', y1: '17', x2: '13', y2: '17' }),
    ])
  }

  return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('polyline', { points: '14 2 14 8 20 8' }),
  ])
}

// ── SkillTreeNode: recursive file tree component (matches DocsView TreeNode) ──
const SkillTreeNode = defineComponent({
  name: 'SkillTreeNode',
  props: {
    node: Object,
    depth: Number,
    activePath: String,
    expandedFolders: Object
  },
  emits: ['select-file', 'toggle-folder', 'context-menu'],
  setup(props, { emit }) {
    const hovered = ref(false)

    return () => {
      const isDir = props.node.type === 'dir'
      const isExpanded = props.expandedFolders[props.node.path]
      const isActive = props.activePath === props.node.path
      const indent = 12 + props.depth * 18

      const children = []

      children.push(
        h('div', {
          class: 'flex items-center gap-2 py-1.5 pr-2 cursor-pointer',
          style: {
            paddingLeft: indent + 'px',
            background: isActive ? 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)' : (hovered.value ? 'rgba(0,0,0,0.03)' : 'transparent'),
            color: isActive ? '#fff' : '#6B7280',
            boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)' : 'none',
            borderRadius: isActive ? '0.5rem' : '0',
            margin: isActive ? '0 0.5rem' : '0',
            fontFamily: "'Inter',sans-serif",
            fontSize: 'var(--fs-secondary)',
            transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
          },
          onClick: () => {
            if (isDir) emit('toggle-folder', props.node.path)
            else emit('select-file', props.node.path, props.node.name)
          },
          onContextmenu: (e) => { e.preventDefault(); e.stopPropagation(); emit('context-menu', e, props.node) },
          onMouseenter: () => { hovered.value = true },
          onMouseleave: () => { hovered.value = false },
        }, [
          isDir ? h('svg', {
            style: {
              width: '14px', height: '14px', flexShrink: 0, color: isActive ? '#fff' : '#9CA3AF',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s'
            },
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2'
          }, [h('polyline', { points: '9 18 15 12 9 6' })]) : h('span', { style: 'width:14px;display:inline-block;' }),

          isDir
            ? h('svg', { style: `width:18px;height:18px;flex-shrink:0;color:${isActive ? '#fff' : '#6B7280'};`, viewBox: '0 0 24 24', fill: 'currentColor' }, [
                h('path', { d: 'M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z' })
              ])
            : fileTypeIcon(props.node.name, isActive ? '#fff' : '#9CA3AF', isActive),

          h('span', {
            class: 'truncate flex-1',
            style: { fontWeight: isDir ? '600' : '400' }
          }, props.node.name.replace(/\.md$/, ''))
        ])
      )

      if (isDir && isExpanded && props.node.children) {
        for (const child of props.node.children) {
          children.push(
            h(SkillTreeNode, {
              node: child,
              depth: props.depth + 1,
              activePath: props.activePath,
              expandedFolders: props.expandedFolders,
              'onSelect-file': (p, n) => emit('select-file', p, n),
              'onToggle-folder': (p) => emit('toggle-folder', p),
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
/* ══════════════════════════════════════════════════════════════════════════
   LEVEL 1 — Catalog Header + Search
   ══════════════════════════════════════════════════════════════════════════ */
.catalog-header {
  flex-shrink: 0;
  padding: 1rem 1.5rem 0.875rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.catalog-count-badge {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  line-height: 1.4;
}

/* ── Search bar ────────────────────────────────────────────────────────── */
.catalog-search-wrap {
  position: relative;
  margin-top: 0.875rem;
}
.catalog-search-icon {
  position: absolute;
  left: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.125rem;
  height: 1.125rem;
  color: #9CA3AF;
  pointer-events: none;
  transition: color 0.2s;
}
.catalog-search-input {
  width: 100%;
  padding: 0.6875rem 2.625rem 0.6875rem 2.625rem;
  border-radius: 0.75rem;
  border: 1.5px solid #D1D1D6;
  background: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.catalog-search-input::placeholder {
  color: #9CA3AF;
  font-weight: 400;
}
.catalog-search-input:hover {
  border-color: #9CA3AF;
}
.catalog-search-input:focus {
  border-color: #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}
.catalog-search-wrap:focus-within .catalog-search-icon {
  color: #1A1A1A;
}
.catalog-search-clear {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 0.4375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.catalog-search-clear:hover {
  background: #F5F5F5;
  color: #6B7280;
}

/* ── Grid background: flat iOS style ──────────────────────────────────── */
.skill-grid-bg {
  background: #F2F2F7;
}

/* ── Skills Grid ───────────────────────────────────────────────────────────── */
.skill-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.25rem;
}
@media (min-width: 1920px) { .skill-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 2560px) { .skill-grid { grid-template-columns: repeat(4, 1fr); } }

/* ── Skill Card — iOS Minimalist ─────────────────────────────────────── */
.skill-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  cursor: pointer;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  overflow: hidden;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.skill-card:hover {
  transform: translateY(-0.1875rem);
  background: #FFFFFF;
  border-color: #D1D1D6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.skill-card:active {
  transform: translateY(-0.0625rem);
  transition-duration: 0.1s;
}

/* Top accent bar */
.skill-card-accent {
  height: 4px;
  width: 100%;
  flex-shrink: 0;
}

/* Card body — single section */
.skill-card-body {
  padding: 1.25rem 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}

/* Icon + title inline row */
.skill-card-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.875rem;
}
.skill-card-icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.skill-card-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* Description — the main content */
.skill-card-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #6B7280;
  line-height: 1.65;
  margin: 0 0 1rem 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Footer */
.skill-card-footer {
  border-top: 1px solid #E5E5EA;
  padding-top: 0.75rem;
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.skill-card-file {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #9CA3AF;
  display: flex;
  align-items: center;
  gap: 0.3125rem;
}
.skill-card-open {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #1A1A1A;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.1875rem;
  transition: gap 0.2s ease, color 0.2s ease;
}
.skill-card:hover .skill-card-open {
  gap: 0.375rem;
  color: #374151;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .skill-card,
  .skill-card-open {
    transition: none;
  }
  .skill-card:hover {
    transform: none;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   LEVEL 2 — Skill Detail Page
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Detail header bar ─────────────────────────────────────────────────── */
.detail-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0.625rem 1.25rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}
.detail-title-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-shrink: 0;
  padding: 0.625rem 1.25rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.detail-back-btn {
  display: flex;
  align-items: center;
  gap: 0;
  width: 2rem; height: 2rem; padding: 0;
  border-radius: var(--radius-sm, 8px);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  justify-content: center;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.detail-back-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
.detail-divider {
  width: 1px;
  height: 1.375rem;
  background: #E5E5EA;
}
.detail-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.detail-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-description {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Sidebar file tree panel ───────────────────────────────────────────── */
.detail-sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 11.25rem;
  max-width: 37.5rem;
  background: #F9F9F9;
  border-right: none;
  position: relative;
}

/* Resize handle */
.skills-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 0.3125rem;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: #E5E5EA;
  transition: background 0.15s;
}
.skills-resize-handle:hover,
.skills-resize-handle:active {
  background: #007AFF;
}
.detail-sidebar-header {
  padding: 0.625rem 0.875rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #E5E5EA;
}
.detail-sidebar-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.detail-sidebar-path {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-small);
  color: #9CA3AF;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 8.75rem;
}

/* ── Content area ──────────────────────────────────────────────────────── */
.detail-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #FFFFFF;
}
.detail-empty-icon {
  width: 4rem;
  height: 4rem;
  border-radius: 1rem;
  background: #F5F5F5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  border: 1px solid #E5E5EA;
}
.detail-file-tab {
  flex-shrink: 0;
  padding: 0.625rem 1.25rem 0;
  background: #F5F5F5;
  border-bottom: 1px solid #E5E5EA;
}
.detail-file-tab-inner {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.625rem 0.625rem 0 0;
  background: #fff;
  border: 1px solid #E5E5EA;
  border-bottom: 1px solid #fff;
  margin-bottom: -1px;
  position: relative;
}
.detail-file-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #1A1A1A;
}
.detail-file-badge {
  padding: 0.0625rem 0.4375rem;
  border-radius: 0.375rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-small);
  font-weight: 600;
  background: rgba(0, 0, 0, 0.05);
  color: #1A1A1A;
}
.detail-content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1.75rem 2.25rem;
  scrollbar-width: thin;
}
.detail-raw-code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-secondary);
  line-height: 1.7;
  color: #1A1A1A;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  background: #F5F5F5;
  padding: 1.25rem;
  border-radius: 0.75rem;
  border: 1px solid #E5E5EA;
}

/* ── Prose (markdown preview) ──────────────────────────────────────────────── */
.prose-skills {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  line-height: 1.75;
  color: #1A1A1A;
  max-width: 51.25rem;
}
.prose-skills h1 {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  margin: 0 0 1.25rem;
  color: #1A1A1A;
  border-bottom: 2px solid rgba(0, 0, 0, 0.08);
  padding-bottom: 0.625rem;
}
.prose-skills h2 {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  margin: 2rem 0 0.875rem;
  color: #1A1A1A;
  padding-left: 0.75rem;
  border-left: 3px solid #1A1A1A;
}
.prose-skills h3 {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  margin: 1.5rem 0 0.625rem;
  color: #374151;
}
.prose-skills p { margin: 0 0 0.875rem; }
.prose-skills ul, .prose-skills ol { margin: 0 0 0.875rem; padding-left: 1.5rem; }
.prose-skills li { margin: 0.3125rem 0; }
.prose-skills li::marker { color: #1A1A1A; }
.prose-skills code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85em;
  background: rgba(0, 0, 0, 0.04);
  padding: 0.125rem 0.4375rem;
  border-radius: 0.3125rem;
  color: #1A1A1A;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.prose-skills pre {
  background: #1A1A1A;
  color: #E5E5EA;
  padding: 1.125rem 1.25rem;
  border-radius: 0.75rem;
  overflow-x: auto;
  margin: 0 0 1.125rem;
  font-size: var(--fs-secondary);
  line-height: 1.6;
  border: 1px solid #1A1A1A;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.prose-skills pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
  border: none;
}
.prose-skills blockquote {
  border-left: 3px solid #1A1A1A;
  margin: 0 0 0.875rem;
  padding: 0.625rem 1.125rem;
  color: #6B7280;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 0 0.625rem 0.625rem 0;
}
.prose-skills a { color: #007AFF; text-decoration: none; font-weight: 500; }
.prose-skills a:hover { text-decoration: underline; color: #0056CC; }
.prose-skills hr { border: none; border-top: 1px solid #E5E5EA; margin: 1.75rem 0; }
.prose-skills table { border-collapse: collapse; margin: 0 0 1.125rem; width: 100%; border-radius: 0.625rem; overflow: hidden; }
.prose-skills th, .prose-skills td { border: 1px solid #E5E5EA; padding: 0.5625rem 0.875rem; text-align: left; }
.prose-skills th { background: rgba(0, 0, 0, 0.02); font-weight: 600; color: #1A1A1A; }

/* ── Source editor (textarea) ──────────────────────────────────────────── */
.skills-source-editor {
  width: 95%;
  max-width: 95%;
  height: 100%;
  resize: none;
  outline: none;
  padding: 1.5rem 0;
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

/* ── Skills file tree context menu ── */
.skill-ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}
.skill-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  padding: 0.25rem;
  min-width: 10rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
  animation: skillCtxEnter 0.1s ease-out;
}
@keyframes skillCtxEnter {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1)  translateY(0); }
}
.skill-ctx-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: #E5E5EA;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.skill-ctx-item:hover { background: #1F1F1F; color: #FFFFFF; }
</style>
