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
            <h1 style="font-family:'Inter',sans-serif; font-size:var(--fs-page-title); font-weight:700; color:#1A1A1A; margin:0;">Skills</h1>
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#6B7280; margin:4px 0 0 0;">
              Skills are loaded from your skills directory. Each subfolder with a SKILL.md is a skill.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <div class="catalog-count-badge">
              <span>{{ filteredSkills.length }} skill{{ filteredSkills.length !== 1 ? 's' : '' }}</span>
            </div>
            <button @click="refresh" class="catalog-refresh-btn" title="Refresh skills">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Refresh
            </button>
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
            placeholder="Search skills by name, description, or content..."
            class="catalog-search-input"
          />
          <span v-if="searchQuery" class="catalog-search-clear" @click="searchQuery = ''">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </span>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="skillsStore.loading" class="flex-1 flex items-center justify-center">
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF;">Loading skills...</p>
      </div>

      <!-- Error -->
      <div v-else-if="skillsStore.error" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#dc2626;">{{ skillsStore.error }}</p>
          <button
            @click="refresh"
            class="mt-3 px-4 py-2 rounded-lg cursor-pointer"
            style="background:#007AFF; color:#fff; border:none; font-family:'Inter',sans-serif;"
          >Retry</button>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="skillsStore.skills.length === 0" class="flex-1 flex items-center justify-center">
        <div class="text-center" style="max-width:420px;">
          <div
            class="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center"
            style="background: #1A1A1A;"
          >
            <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <h2 style="font-family:'Inter',sans-serif; font-size:var(--fs-section); font-weight:700; color:#1A1A1A; margin:0 0 8px;">
            No skills found
          </h2>
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; line-height:1.6; margin:0 0 16px;">
            Create skill folders in your skills directory. Each folder should contain a
            <code style="background:#F5F5F5; padding:2px 6px; border-radius:4px; font-size:0.875em;">SKILL.md</code>
            file with the skill's system prompt.
          </p>
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF;">
            Default path: <code style="background:#F5F5F5; padding:2px 6px; border-radius:4px; font-size:0.875em;">~/.claude/skills</code>
          </p>
        </div>
      </div>

      <!-- Skills Grid -->
      <div v-else class="flex-1 overflow-y-auto skill-grid-bg">
        <!-- No results for search -->
        <div v-if="filteredSkills.length === 0 && searchQuery" class="flex items-center justify-center" style="padding:60px 32px;">
          <div class="text-center">
            <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 4px;">No skills match "{{ searchQuery }}"</p>
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:0;">Try a different search term or clear the filter.</p>
          </div>
        </div>

        <div v-else style="padding:24px 32px;">
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
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Skills
        </button>
        <div class="detail-divider"></div>
        <div class="detail-icon">
          <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        <h1 class="detail-title">{{ skillDisplayName(selectedSkill) }}</h1>
      </div>

      <!-- File explorer + content viewer -->
      <div class="flex-1 flex overflow-hidden">

        <!-- LEFT: File tree sidebar -->
        <div class="detail-sidebar">
          <!-- Tree header -->
          <div class="detail-sidebar-header">
            <span class="detail-sidebar-label">Files</span>
            <span class="detail-sidebar-path" :title="selectedSkill.path">
              {{ selectedSkill.path }}
            </span>
          </div>

          <!-- File tree -->
          <div class="flex-1 overflow-y-auto py-1.5" style="scrollbar-width:thin;">
            <div v-if="fileTree.length === 0" class="px-4 py-8 text-center">
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF;">No files found</p>
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
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; margin-top:12px;">Select a file to view its contents</p>
            </div>
          </div>

          <!-- File open -->
          <template v-else>
            <!-- File tab bar -->
            <div class="detail-file-tab">
              <div class="detail-file-tab-inner">
                <svg style="width:14px;height:14px;color:#1A1A1A;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span class="detail-file-name">{{ activeFileName }}</span>
                <span v-if="isMarkdownFile" class="detail-file-badge">MD</span>
              </div>
            </div>

            <!-- Content area -->
            <div class="detail-content-scroll">
              <div v-if="loadingFile" style="color:#9CA3AF; font-family:'Inter',sans-serif; font-size:var(--fs-body);">Loading...</div>
              <div v-else-if="fileError" style="color:#dc2626; font-family:'Inter',sans-serif; font-size:var(--fs-body);">{{ fileError }}</div>
              <!-- Markdown rendering -->
              <div
                v-else-if="isMarkdownFile"
                class="prose-skills"
                v-html="renderedMarkdown"
              />
              <!-- Raw content -->
              <pre
                v-else
                class="detail-raw-code"
              >{{ fileContent }}</pre>
            </div>
          </template>
        </div>
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, reactive, defineComponent, h } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useSkillsStore } from '../stores/skills'
import { useConfigStore } from '../stores/config'

const skillsStore = useSkillsStore()
const configStore = useConfigStore()

const CARD_GRADIENTS = [
  '#1A1A1A',
  '#007AFF',
  '#34C759',
  '#FF9500',
  '#FF2D55',
  '#5856D6',
  '#FF3B30',
  '#00C7BE',
]
function cardGradient(idx) {
  return CARD_GRADIENTS[idx % CARD_GRADIENTS.length]
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

const isMarkdownFile = computed(() => {
  if (!activeFileName.value) return false
  return activeFileName.value.endsWith('.md')
})

marked.use({ gfm: true, breaks: true })

const renderedMarkdown = computed(() => {
  if (!fileContent.value) return ''
  try {
    const raw = marked.parse(fileContent.value)
    return DOMPurify.sanitize(raw)
  } catch { return '' }
})

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
  fileError.value = null
  loadingFile.value = true
  if (!window.electronAPI?.skills?.readFile) return
  try {
    const result = await window.electronAPI.skills.readFile(filePath)
    if (result.error) {
      fileError.value = result.error
    } else {
      fileContent.value = result.content
    }
  } catch (err) {
    fileError.value = err.message
  } finally {
    loadingFile.value = false
  }
}

function toggleFolder(folderPath) {
  expandedFolders[folderPath] = !expandedFolders[folderPath]
}

// ── SkillTreeNode: recursive file tree component ──
const SkillTreeNode = defineComponent({
  name: 'SkillTreeNode',
  props: {
    node: Object,
    depth: Number,
    activePath: String,
    expandedFolders: Object
  },
  emits: ['select-file', 'toggle-folder'],
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
            background: isActive ? 'rgba(0, 0, 0, 0.06)' : (hovered.value ? 'rgba(0, 0, 0, 0.02)' : 'transparent'),
            borderRight: isActive ? '2px solid #1A1A1A' : '2px solid transparent',
            color: isActive ? '#1A1A1A' : '#6B7280',
            fontFamily: "'Inter',sans-serif",
            fontSize: 'var(--fs-secondary)',
            transition: 'background 0.15s, color 0.15s',
          },
          onClick: () => {
            if (isDir) emit('toggle-folder', props.node.path)
            else emit('select-file', props.node.path, props.node.name)
          },
          onMouseenter: () => { hovered.value = true },
          onMouseleave: () => { hovered.value = false },
        }, [
          isDir ? h('svg', {
            style: {
              width: '12px', height: '12px', flexShrink: 0, color: '#9CA3AF',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s'
            },
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2'
          }, [h('polyline', { points: '9 18 15 12 9 6' })]) : h('span', { style: 'width:12px;display:inline-block;' }),

          isDir
            ? h('svg', { style: 'width:14px;height:14px;flex-shrink:0;color:#F59E0B;', viewBox: '0 0 24 24', fill: 'currentColor' }, [
                h('path', { d: 'M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z' })
              ])
            : h('svg', { style: 'width:14px;height:14px;flex-shrink:0;color:#9CA3AF;', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
                h('polyline', { points: '14 2 14 8 20 8' })
              ]),

          h('span', {
            class: 'truncate flex-1',
            style: { fontWeight: isDir ? '600' : '400' }
          }, props.node.name)
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
  padding: 16px 24px 14px;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.catalog-count-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
  font-weight: 600;
}
.catalog-refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #9CA3AF;
  background: #F5F5F5;
  border: 1px solid #E5E5EA;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.catalog-refresh-btn:hover {
  background: #E5E5EA;
  color: #1A1A1A;
}

/* ── Search bar ────────────────────────────────────────────────────────── */
.catalog-search-wrap {
  position: relative;
  margin-top: 14px;
}
.catalog-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: #9CA3AF;
  pointer-events: none;
  transition: color 0.2s;
}
.catalog-search-input {
  width: 100%;
  padding: 11px 42px 11px 42px;
  border-radius: 12px;
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
  border-color: #007AFF;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}
.catalog-search-wrap:focus-within .catalog-search-icon {
  color: #007AFF;
}
.catalog-search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border-radius: 7px;
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
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
@media (max-width: 1200px) { .skill-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 900px)  { .skill-grid { grid-template-columns: repeat(2, 1fr); } }

/* ── Skill Card — iOS Minimalist ─────────────────────────────────────── */
.skill-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
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
  transform: translateY(-3px);
  background: #FFFFFF;
  border-color: #D1D1D6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.skill-card:active {
  transform: translateY(-1px);
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
  padding: 20px 20px 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

/* Icon + title inline row */
.skill-card-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.skill-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: none;
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
  margin: 0 0 16px 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Footer */
.skill-card-footer {
  border-top: 1px solid #E5E5EA;
  padding-top: 12px;
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
  gap: 5px;
}
.skill-card-open {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #007AFF;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: gap 0.2s ease, color 0.2s ease;
}
.skill-card:hover .skill-card-open {
  gap: 6px;
  color: #0056CC;
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
  gap: 12px;
  padding: 12px 20px;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}
.detail-back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #9CA3AF;
  background: #F5F5F5;
  border: 1px solid #E5E5EA;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}
.detail-back-btn:hover {
  background: #E5E5EA;
  color: #1A1A1A;
  border-color: #D1D1D6;
}
.detail-divider {
  width: 1px;
  height: 22px;
  background: #E5E5EA;
}
.detail-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1A1A1A;
  flex-shrink: 0;
  box-shadow: none;
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
  width: 260px;
  min-width: 260px;
  background: #F5F5F5;
  border-right: 1px solid #E5E5EA;
}
.detail-sidebar-header {
  padding: 10px 14px;
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
  max-width: 140px;
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
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #F5F5F5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  border: 1px solid #E5E5EA;
}
.detail-file-tab {
  flex-shrink: 0;
  padding: 10px 20px 0;
  background: #F5F5F5;
  border-bottom: 1px solid #E5E5EA;
}
.detail-file-tab-inner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 10px 10px 0 0;
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
  padding: 1px 7px;
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-small);
  font-weight: 600;
  background: rgba(0, 0, 0, 0.05);
  color: #1A1A1A;
}
.detail-content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 28px 36px;
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
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #E5E5EA;
}

/* ── Prose (markdown preview) ──────────────────────────────────────────────── */
.prose-skills {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  line-height: 1.75;
  color: #1A1A1A;
  max-width: 820px;
}
.prose-skills h1 {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  margin: 0 0 20px;
  color: #1A1A1A;
  border-bottom: 2px solid rgba(0, 0, 0, 0.08);
  padding-bottom: 10px;
}
.prose-skills h2 {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  margin: 32px 0 14px;
  color: #1A1A1A;
  padding-left: 12px;
  border-left: 3px solid #1A1A1A;
}
.prose-skills h3 {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  margin: 24px 0 10px;
  color: #374151;
}
.prose-skills p { margin: 0 0 14px; }
.prose-skills ul, .prose-skills ol { margin: 0 0 14px; padding-left: 24px; }
.prose-skills li { margin: 5px 0; }
.prose-skills li::marker { color: #1A1A1A; }
.prose-skills code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85em;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 7px;
  border-radius: 5px;
  color: #1A1A1A;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.prose-skills pre {
  background: #1A1A1A;
  color: #E5E5EA;
  padding: 18px 20px;
  border-radius: 12px;
  overflow-x: auto;
  margin: 0 0 18px;
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
  margin: 0 0 14px;
  padding: 10px 18px;
  color: #6B7280;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 0 10px 10px 0;
}
.prose-skills a { color: #007AFF; text-decoration: none; font-weight: 500; }
.prose-skills a:hover { text-decoration: underline; color: #0056CC; }
.prose-skills hr { border: none; border-top: 1px solid #E5E5EA; margin: 28px 0; }
.prose-skills table { border-collapse: collapse; margin: 0 0 18px; width: 100%; border-radius: 10px; overflow: hidden; }
.prose-skills th, .prose-skills td { border: 1px solid #E5E5EA; padding: 9px 14px; text-align: left; }
.prose-skills th { background: rgba(0, 0, 0, 0.02); font-weight: 600; color: #1A1A1A; }
</style>
