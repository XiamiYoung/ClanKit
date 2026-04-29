<template>
  <div class="h-full flex flex-col overflow-hidden agents-page">

    <!-- Header -->
    <div class="agents-header">
      <div class="agents-title-row">
        <h1 class="agents-title">{{ selectedView.agentType === 'system' ? t('nav.systemAgents') : t('nav.userPersonas') }}</h1>
        <span class="catalog-count-badge">{{ selectedView.agentType === 'system' ? agentsStore.systemAgents.length : agentsStore.userAgents.length }}</span>
        <div style="flex: 1;"></div>
        <AppButton size="icon" @click="refreshAgents" :loading="refreshing" v-tooltip="t('common.refresh')">
          <svg v-if="!refreshing" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </AppButton>
      </div>
      <p class="agents-subtitle">{{ selectedView.agentType === 'system' ? t('agents.systemAgentsDefinition') : t('agents.userAgentsDefinition') }}</p>
    </div>

    <!-- Shared header row spanning full width -->
    <div class="shared-header">
      <div class="shared-header-nav" :style="{ width: navWidth + 'px' }">
        <span class="shared-header-title">{{ t('common.category', 'Category') }}</span>
        <button class="nav-section-add-btn" v-tooltip="t('common.add') + ' ' + t('common.category', 'Category')" @click="openCreateCategory()">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <!-- 4px spacer matching resize handle -->
      <div style="width:4px;flex-shrink:0;"></div>
      <!-- Content header right side -->
      <div class="shared-header-content">
        <div class="content-header-left">
          <span v-if="selectedView.type === 'category'" class="content-title-emoji">{{ currentCategoryEmoji }}</span>
          <h2 class="content-title">{{ currentViewTitle }}</h2>
          <span class="content-count">{{ visibleAgents.length }}</span>
        </div>
        <div class="content-filter-wrap">
          <svg class="content-filter-icon" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            v-model="filterQuery"
            class="content-filter-input"
            type="text"
            :placeholder="t('agents.searchAgents')"
            @keydown.escape="filterQuery = ''"
          />
          <button v-if="filterQuery" class="content-filter-clear" @click="filterQuery = ''" :aria-label="t('common.clear')">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="content-header-right">
          <template v-if="selectedView.type === 'category'">
            <AppButton v-if="selectMode && selectedAgentIds.size > 0" size="compact" variant="danger" @click="unassignSelected">
              {{ t('agents.remove', 'Unassign') }}
            </AppButton>
            <AppButton size="icon" @click="selectMode ? exitSelectMode() : enterSelectMode()" v-tooltip="selectMode ? t('common.cancel') : t('agents.select', 'Select agents')">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
            </AppButton>
          </template>
          <AppButton v-if="selectedView.type !== 'category' && selectedView.agentType === 'system'" size="icon" @click="openGroupCreator" v-tooltip="t('agents.groupCreator.addMultiple', 'Add Multiple Agents')">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </AppButton>
          <AppButton v-if="selectedView.type !== 'category'" size="icon" @click="openImportWizard" v-tooltip="t('agents.import.title')">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </AppButton>
          <AppButton v-if="selectedView.type !== 'category'" size="icon" @click="createNew(selectedView.agentType)" v-tooltip="t('agents.newAgent')">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </AppButton>
        </div>
      </div>
    </div>

    <!-- Body: left nav + right grid -->
    <div class="agents-body">

      <!-- ── Left Nav ───────────────────────────────────────────────────── -->
      <nav class="agents-nav" :style="{ width: navWidth + 'px' }">

        <div class="nav-section">
          <!-- All -->
          <div class="nav-all-wrap" :class="{ active: selectedView.type === 'all' }">
            <button
              class="nav-item nav-item--all"
              :class="{ active: selectedView.type === 'all' }"
              @click="selectView({ type: 'all', agentType: selectedView.agentType })"
            >
              <span class="nav-item-icon">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
              </span>
              <span class="nav-item-label">{{ t('common.all') }}</span>
              <span class="nav-item-count">{{ selectedView.agentType === 'system' ? agentsStore.systemAgents.length : agentsStore.userAgents.length }}</span>
            </button>
          </div>

          <!-- Categories for active tab -->
          <template v-for="(cat, catIdx) in activeCategories" :key="cat.id">
            <div
              class="nav-item-wrap nav-cat-wrap"
              :class="[`nav-cat-wrap--${catIdx % 8}`, { 'drag-over': dragOverCategoryId === cat.id, 'drag-reject': dragRejectCategoryId === cat.id, 'cat-drag-over': catDragOverId === cat.id, 'cat-dragging': draggingCatId === cat.id }]"
              draggable="true"
              @dragstart="onCatDragStart($event, cat)"
              @dragend="onCatDragEnd"
              @dragover="draggingCatId ? onCatDragOver($event, cat) : onCategoryDragOver($event, cat)"
              @dragleave="draggingCatId ? onCatDragLeave(cat) : onCategoryDragLeave(cat)"
              @drop="draggingCatId ? onCatDrop($event, cat) : onCategoryDrop($event, cat)"
            >
              <button
                class="nav-item nav-cat-btn"
                :class="{ active: selectedView.type === 'category' && selectedView.categoryId === cat.id }"
                @click="selectView({ type: 'category', categoryId: cat.id, agentType: selectedView.agentType })"
                @mouseenter="showNavTooltip($event, cat.name)"
                @mouseleave="hideNavTooltip"
              >
                <span class="nav-item-emoji">{{ cat.emoji }}</span>
                <span class="nav-item-label">{{ cat.name }}</span>
              </button>
              <div class="nav-cat-right">
                <span class="nav-cat-count nav-item-count">{{ agentsStore.agentsInCategory(cat.id).length }}</span>
                <div class="nav-item-actions nav-cat-actions">
                  <button class="nav-icon-btn" v-tooltip="t('common.rename', 'Rename')" @click.stop="openRenameCategory(cat)">
                    <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    class="nav-icon-btn nav-icon-btn-danger"
                    v-tooltip="t('agents.deleteCategory', 'Delete category')"
                    @click.stop="tryDeleteCategory(cat)"
                  >
                    <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </template>

        </div>

      </nav>

      <!-- ── Nav resize handle ────────────────────────────────────────────── -->
      <div class="nav-resize-handle" @mousedown.prevent="startNavResize"></div>

      <!-- ── Right Grid ──────────────────────────────────────────────────── -->
      <div class="agents-content">

        <!-- Drag hint -->
        <p v-if="isDragging && selectedView.type !== 'all'" class="drag-hint">
          {{ t('agents.dragHint', 'Drop onto a category in the left panel to assign') }}
        </p>

        <!-- Grid -->
        <div class="agents-grid-scroll">
          <div v-if="visibleAgents.length > 0" class="agents-grid">
            <div
              v-for="(agent, agentIdx) in visibleAgents"
              :key="agent.id"
              class="agent-card-wrap"
              :class="{ 'select-mode': selectMode, 'is-selected': selectedAgentIds.has(agent.id), 'newly-added': newlyAddedIds.has(agent.id) }"
              :draggable="!selectMode"
              @dragstart="onAgentDragStart($event, agent)"
              @dragend="onAgentDragEnd"
            >
              <!-- Select checkbox overlay -->
              <div v-if="selectMode" class="select-overlay" @click="toggleSelect(agent.id)">
                <div class="select-checkbox" :class="{ checked: selectedAgentIds.has(agent.id) }">
                  <svg v-if="selectedAgentIds.has(agent.id)" style="width:10px;height:10px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
              <div class="agent-card-inner-wrap">
                <AgentCard
                  :agent="agent"
                  :index="agentIdx"
                  :gradient="getAvatarGradient(agent)"
                  :hide-delete="selectedView.type === 'category'"
                  :hide-set-default="selectedView.type === 'category'"
                  :show-unassign="selectedView.type === 'category'"
                  :delete-disabled="isDeleteButtonDisabled(agent)"
                  :delete-title="getDeleteButtonTitle(agent)"
                  :refresh-token="agentCardRefreshToken"
                  @click="selectMode ? toggleSelect(agent.id) : openBodyViewer(agent)"
                  @delete="confirmDelete(agent)"
                  @unassign="agentsStore.unassignFromCategory(agent.id, selectedView.categoryId)"
                  @set-default="agentsStore.setDefault(agent.id)"
                />
              </div>
            </div>
          </div>
          <div v-else class="section-empty">
            <div class="section-empty-inner">
              <svg style="width:28px;height:28px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path v-if="selectedView.agentType === 'system'" d="M12 8V4H8M4 12h16M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1M9 16h0M15 16h0"/>
                <path v-else d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle v-if="selectedView.agentType !== 'system'" cx="12" cy="7" r="4"/>
              </svg>
              <p v-if="selectedView.type === 'category'">{{ t('agents.noAgentsAssigned', 'No agents assigned — drag cards here from another view.') }}</p>
              <p v-else>{{ selectedView.agentType === 'system' ? t('agents.noSystemAgents', 'No system agents yet') : t('agents.noUserAgents', 'No user agents yet') }}</p>
              <div class="section-empty-actions">
                <AppButton 
                  v-if="selectedView.type !== 'category'"
                  size="compact" 
                  variant="primary"
                  @click="createNew(selectedView.agentType)"
                >
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {{ selectedView.agentType === 'system' ? t('agents.createSystem', 'Create System Agent') : t('agents.createUser', 'Create User Agent') }}
                </AppButton>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Agent Body Viewer Modal (create + edit) -->
    <AgentBodyViewer
      v-if="bodyViewerAgent"
      ref="bodyViewerRef"
      :agent-id="bodyViewerAgent.id"
      :agent-type="bodyViewerAgent.type === 'system' ? 'system' : 'users'"
      :agent-name="bodyViewerAgent.name"
      :agent-description="bodyViewerAgent.description"
      :agent-prompt="bodyViewerAgent.prompt"
      :agent-provider-id="bodyViewerAgent.providerId || null"
      :agent-model-id="bodyViewerAgent.modelId || null"
      :agent-voice-id="bodyViewerAgent.voiceId || null"
      :agent-avatar="bodyViewerAgent.avatar || null"
      :agent-required-tool-ids="bodyViewerAgent.requiredToolIds || []"
      :agent-required-skill-ids="bodyViewerAgent.requiredSkillIds || []"
      :agent-required-mcp-server-ids="bodyViewerAgent.requiredMcpServerIds || []"
      :agent-required-knowledge-base-ids="bodyViewerAgent.requiredKnowledgeBaseIds || []"
      :is-new="!!bodyViewerAgent.isNew"
      @close="bodyViewerAgent = null"
      @update-agent="onBodyViewerUpdate"
    />

    <!-- Confirm Delete Agent Modal -->
    <ConfirmModal
      v-if="confirmDeleteTarget"
      :visible="!!confirmDeleteTarget"
      :title="t('agents.deleteAgent')"
      :message="t('agents.deleteAgentConfirm', { name: confirmDeleteTarget.name })"
      confirm-text="Delete"
      confirm-class="danger"
      @confirm="executeDelete"
      @close="confirmDeleteTarget = null"
    />

    <!-- Confirm Delete Category Modal -->
    <ConfirmModal
      v-if="confirmDeleteCategory"
      :visible="!!confirmDeleteCategory"
      :title="t('agents.deleteCategory')"
      :message="t('agents.deleteCategoryConfirm', { name: confirmDeleteCategory.name })"
      confirm-text="Delete"
      confirm-class="danger"
      @confirm="executeDeleteCategory"
      @close="confirmDeleteCategory = null"
    />

    <!-- Category not empty warning -->
    <ConfirmModal
      v-if="deleteCategoryError"
      :visible="!!deleteCategoryError"
      :title="t('agents.cannotDeleteCategory')"
      :message="t('agents.cannotDeleteCategoryReason', { name: deleteCategoryError.name })"
      confirm-text="OK"
      confirm-class="primary"
      @confirm="deleteCategoryError = null"
      @close="deleteCategoryError = null"
    />

    <!-- Category Modal (create / rename) — type is implicit from the current page -->
    <CategoryModal
      :visible="categoryModal.open"
      :mode="categoryModal.mode"
      :type="categoryModal.catType"
      :initial="categoryModal.initial"
      :show-type-selector="false"
      :existingCategories="agentsStore.categories"
      @confirm="onCategoryModalConfirm"
      @close="categoryModal.open = false"
    />

    <!-- Agent Group Creator Modal -->
    <AgentGroupCreator
      v-if="showGroupCreator"
      :agent-type="selectedView.agentType"
      :initial-tab="groupCreatorInitialTab"
      :highlight-category="groupCreatorHighlightCategory"
      @close="showGroupCreator = false; groupCreatorInitialTab = ''; groupCreatorHighlightCategory = ''"
      @created="onAgentsCreated"
    />

  </div>

  <!-- Import Wizard -->
  <AgentImportWizard
    v-if="showImportWizard"
    :agent-type="importWizardAgentType"
    @close="showImportWizard = false"
    @created="onAgentImported"
  />

  <!-- Preview limit modal -->
  <PreviewLimitModal
    :visible="showPreviewLimitModal"
    :message="previewLimitMessage"
    @close="showPreviewLimitModal = false"
  />

  <!-- Nav item name tooltip -->
  <Teleport to="body">
    <div
      v-if="navTooltip.visible"
      class="nav-name-tooltip"
      :style="{ left: navTooltip.left + 'px', top: navTooltip.top + 'px' }"
    >{{ navTooltip.text }}</div>
  </Teleport>
</template>

<script setup>
defineOptions({ inheritAttrs: false })
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useRoute, useRouter } from 'vue-router'
import { useAgentsStore } from '../stores/agents'
import { useTasksStore } from '../stores/tasks'
import { useConfigStore } from '../stores/config'
import { AGENT_AVATARS } from '../components/agents/agentAvatars'
import AgentCard from '../components/agents/AgentCard.vue'
import AgentBodyViewer from '../components/agents/AgentBodyViewer.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import PreviewLimitModal from '../components/common/PreviewLimitModal.vue'
import AppButton from '../components/common/AppButton.vue'
import CategoryModal from '../components/agents/CategoryModal.vue'
import AgentGroupCreator from '../components/agents/AgentGroupCreator.vue'
import AgentImportWizard from '../components/agents/AgentImportWizard.vue'
import { useI18n } from '../i18n/useI18n'
import { getDefaultVoiceForLocale } from '../utils/edgeVoices'
import { PREVIEW_LIMITS, isLimitEnforced } from '../utils/guestLimits'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const agentsStore = useAgentsStore()
const tasksStore = useTasksStore()
const configStore = useConfigStore()
const refreshing = ref(false)
const newlyAddedIds = ref(new Set())
const showImportWizard = ref(false)
const importWizardAgentType = ref('system')
const agentCardRefreshToken = ref(0)

function openImportWizard() {
  importWizardAgentType.value = selectedView.agentType
  showImportWizard.value = true
}
const showPreviewLimitModal = ref(false)
const previewLimitMessage = ref('')

function onAgentImported() {
  showImportWizard.value = false
  agentsStore.loadAgents()
  agentCardRefreshToken.value++
}

function resolveDefaultProviderModel() {
  const cfg = configStore.config || {}
  const providers = Array.isArray(cfg.providers) ? cfg.providers : []
  const active = providers.filter(p => p?.apiKey)

  const preferredProvider = cfg.utilityModel?.provider || ''
  const preferredModel = cfg.utilityModel?.model || ''

  // preferredProvider is stored as type (e.g., 'anthropic'), not UUID
  const provider = (preferredProvider && active.find(p => p.type === preferredProvider))
    || active[0]
    || null
  if (!provider) return { providerId: null, modelId: null }

  const modelId = preferredModel
    || provider.model
    || provider.settings?.sonnetModel
    || provider.settings?.opusModel
    || provider.settings?.haikuModel
    || null

  return { providerId: provider.id, modelId }
}

onMounted(async () => {
  await agentsStore.loadAgents()
  await tasksStore.loadPlans()

  // Legacy deep-link: ?agentTab=system|user → redirect to matching route
  if (route.query.agentTab === 'system' || route.query.agentTab === 'user') {
    const target = route.query.agentTab === 'user' ? '/personas' : '/agents'
    if (route.path !== target) router.replace({ path: target })
  } else if (route.query.createUserAgent === '1') {
    if (route.path !== '/personas') router.replace({ path: '/personas', query: {} })
    else router.replace({ path: '/personas', query: {} })
    createNew('user')
  } else if (route.query.openGroupCreator === '1') {
    // Direct group creator open (non-onboarding)
    showGroupCreator.value = true
    groupCreatorInitialTab.value = route.query.tab || 'templates'
    groupCreatorHighlightCategory.value = route.query.highlight || ''
    if (route.path !== '/agents') router.replace({ path: '/agents', query: {} })
    else router.replace({ path: '/agents', query: {} })
  } else if (route.query.openAgentId) {
    const agent = agentsStore.getAgentById?.(route.query.openAgentId)
    if (agent) {
      const target = agent.type === 'user' ? '/personas' : '/agents'
      if (route.path !== target) router.replace({ path: target, query: {} })
      else router.replace({ path: target, query: {} })
      openBodyViewer(agent)
    } else {
      router.replace({ path: route.path, query: {} })
    }
  }
})

// Open body viewer when navigated to with ?openAgentId=xxx after mount (e.g. from another view)
watch(() => route.query.openAgentId, (id) => {
  if (!id) return
  const agent = agentsStore.getAgentById?.(id)
  if (agent) {
    openBodyViewer(agent)
  }
  router.replace({ path: route.path, query: {} })
})

async function refreshAgents() {
  refreshing.value = true
  try {
    await agentsStore.loadAgents()
  } finally {
    refreshing.value = false
  }
}

async function onAgentsCreated(ids = []) {
  await refreshAgents()
  if (ids.length > 0) {
    // Imports always create system agents — navigate to /agents if not there.
    if (route.path !== '/agents') router.push('/agents')
    selectedView.type = 'all'
    selectedView.agentType = 'system'
    selectedView.categoryId = null
    newlyAddedIds.value = new Set(ids)
    setTimeout(() => { newlyAddedIds.value = new Set() }, 5000)
  }
}

// ── Nav panel resize ────────────────────────────────────────────────────────
const NAV_MIN = 200
const NAV_MAX = 420
const navWidth = ref(300) // ~18.75rem default

function startNavResize(e) {
  const startX     = e.clientX
  const startWidth = navWidth.value
  function onMove(ev) {
    const delta = ev.clientX - startX
    navWidth.value = Math.min(NAV_MAX, Math.max(NAV_MIN, startWidth + delta))
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup',  onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor    = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup',  onUp)
}

// ── Nav item tooltip ────────────────────────────────────────────────────────
const navTooltip = ref({ visible: false, text: '', left: 0, top: 0 })

function showNavTooltip(e, text) {
  const labelEl = e.currentTarget.querySelector('.nav-item-label')
  if (!labelEl || labelEl.scrollWidth <= labelEl.clientWidth) return
  const rect = e.currentTarget.getBoundingClientRect()
  navTooltip.value = { visible: true, text, left: rect.right + 8, top: rect.top + rect.height / 2 }
}

function hideNavTooltip() {
  navTooltip.value.visible = false
}

// ── View selection ─────────────────────────────────────────────────────────
// agentType is driven by route path: /personas → 'user', everything else (/agents) → 'system'
const selectedView = reactive({
  type: 'all',
  agentType: route.path === '/personas' ? 'user' : 'system',
  categoryId: null
})

// Sync agentType with route path (user clicking sidebar menu)
watch(() => route.path, (path) => {
  const next = path === '/personas' ? 'user' : 'system'
  if (selectedView.agentType === next) return
  selectedView.agentType = next
  selectedView.type = 'all'
  selectedView.categoryId = null
  filterQuery.value = ''
})

// Handle agentTab query param (legacy tour deep-link — redirects to matching route)
watch(() => route.query.agentTab, (tab) => {
  if (tab !== 'system' && tab !== 'user') return
  const target = tab === 'user' ? '/personas' : '/agents'
  if (route.path !== target) router.replace({ path: target })
})

const filterQuery = ref('')

function selectView(view) {
  Object.assign(selectedView, view)
  filterQuery.value = ''
  exitSelectMode()
}


const activeCategories = computed(() => {
  return selectedView.agentType === 'system'
    ? agentsStore.systemCategories
    : agentsStore.userCategories
})

const currentViewTitle = computed(() => {
  if (selectedView.type === 'all') {
    return selectedView.agentType === 'system' ? t('nav.systemAgents') : t('nav.userPersonas')
  }
  const cat = agentsStore.getCategoryById(selectedView.categoryId)
  return cat?.name || t('common.category', 'Category')
})

const currentCategoryEmoji = computed(() => {
  if (selectedView.type !== 'category') return ''
  return agentsStore.getCategoryById(selectedView.categoryId)?.emoji || '📁'
})

const visibleAgents = computed(() => {
  let list
  if (selectedView.type === 'all') {
    list = selectedView.agentType === 'system'
      ? agentsStore.systemAgents
      : agentsStore.userAgents
  } else {
    // category
    list = agentsStore.agentsInCategory(selectedView.categoryId)
  }

  const q = filterQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(p =>
      (p.name        || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.prompt      || '').toLowerCase().includes(q) ||
      (p.modelId     || '').toLowerCase().includes(q) ||
      (p.providerId  || '').toLowerCase().includes(q)
    )
  }

  return [...list].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
})

// ── AgentBodyViewer (create + edit) ───────────────────────────────────────
const bodyViewerAgent = ref(null)
const bodyViewerRef = ref(null)

function openBodyViewer(agent) {
  bodyViewerAgent.value = { ...agent }
}

// Wizard tour: auto-open Clank's body viewer when the assign-reminder step is active
watch(() => agentsStore.wizardHighlightAgentId, async (id) => {
  if (id) {
    if (!agentsStore.systemAgents.length) await agentsStore.loadAgents()
    const target = agentsStore.getAgentById(id)
    if (target) bodyViewerAgent.value = { ...target }
  } else if (bodyViewerAgent.value) {
    bodyViewerAgent.value = null
  }
}, { immediate: true })

function createNew(type) {
  const resolvedType = type || selectedView.agentType
  if (isLimitEnforced()) {
    const isUser = resolvedType === 'user'
    const cap = isUser ? PREVIEW_LIMITS.maxUserPersonas : PREVIEW_LIMITS.maxAgents
    const count = isUser ? agentsStore.userAgents.length : agentsStore.systemAgents.length
    if (count >= cap) {
      previewLimitMessage.value = t(isUser ? 'limits.maxUserPersonas' : 'limits.maxAgents')
      showPreviewLimitModal.value = true
      return
    }
  }
  const { providerId, modelId } = resolveDefaultProviderModel()
  bodyViewerAgent.value = {
    id: uuidv4(),
    name: '',
    type: resolvedType,
    description: '',
    prompt: '',
    avatar: null,
    providerId,
    modelId,
    voiceId: getDefaultVoiceForLocale(configStore.language),
    requiredToolIds: [],
    requiredSkillIds: [],
    requiredMcpServerIds: [],
    requiredKnowledgeBaseIds: [],
    isNew: true,
  }
}

async function onBodyViewerUpdate(updates) {
  if (!bodyViewerAgent.value) return
  // Strip the Nuwa seed payload before persisting — memory/speech belong in
  // the memory store and agent-artifacts/, not in agents.json.
  const { _memorySeed, _speechSeed, ...agentUpdates } = updates
  const updated = { ...bodyViewerAgent.value }
  delete updated.isNew
  Object.assign(updated, agentUpdates)
  if (!updated.name) updated.name = 'Untitled Agent'
  await agentsStore.saveAgent(updated)

  // After save the agent has a stable id (existing or freshly minted by the
  // store). If the AI generation step produced Nuwa-style seed data, write it
  // to the memory store + speech file now. Best-effort — failures don't block save.
  if (_memorySeed || _speechSeed) {
    try {
      const { templateMemoryToSections, templateSpeechToDna } = await import('../data/agentTemplates')
      const persisted = agentsStore.agents.find(a => a.id === updated.id) || updated
      const agentType = persisted.type === 'user' ? 'user' : 'system'
      if (_memorySeed) {
        const sections = templateMemoryToSections(_memorySeed)
        if (sections) {
          await window.electronAPI.agentImport.writeNuwaSections({
            agentId:    persisted.id,
            agentName:  persisted.name,
            agentType,
            sections,
            evidenceIndex: null,
          })
        }
      }
      if (_speechSeed) {
        const dna = templateSpeechToDna(_speechSeed, persisted.name)
        if (dna) {
          await window.electronAPI.agentImport.writeSpeechDna({
            agentId:   persisted.id,
            agentType,
            speechDna: dna,
          })
        }
      }
    } catch (err) {
      console.warn('[AgentsView] failed to write Nuwa seed for', updated.name, err)
    }
  }
}

// ── Delete agent ────────────────────────────────────────────────────────────
const confirmDeleteTarget = ref(null)

function confirmDelete(agent) {
  if (!agent.isBuiltin && !agentsStore.isAgentUsedInPlans(agent.id)) {
    confirmDeleteTarget.value = agent
  }
}

async function executeDelete() {
  if (!confirmDeleteTarget.value) return
  const id = confirmDeleteTarget.value.id
  confirmDeleteTarget.value = null
  await agentsStore.deleteAgent(id)
}

// ── Category modal ─────────────────────────────────────────────────────────
const categoryModal = reactive({ open: false, mode: 'create', catType: 'system', initial: null, editId: null })

function openCreateCategory() {
  Object.assign(categoryModal, { open: true, mode: 'create', catType: selectedView.agentType, initial: { name: '', emoji: '📁' }, editId: null })
}

function openRenameCategory(cat) {
  Object.assign(categoryModal, { open: true, mode: 'rename', catType: cat.type, initial: { name: cat.name, emoji: cat.emoji }, editId: cat.id })
}

async function onCategoryModalConfirm({ name, emoji, type }) {
  categoryModal.open = false
  if (categoryModal.mode === 'create') {
    const catType = type || categoryModal.catType
    const id = await agentsStore.addCategory(name, emoji, catType)
    selectView({ type: 'category', categoryId: id, agentType: catType })
  } else {
    await agentsStore.renameCategory(categoryModal.editId, name, emoji)
  }
}

const showGroupCreator = ref(false)
const groupCreatorInitialTab = ref('')
const groupCreatorHighlightCategory = ref('')

const confirmDeleteCategory = ref(null)
const deleteCategoryError   = ref(null)

function openGroupCreator() {
  showGroupCreator.value = true
}

function tryDeleteCategory(cat) {
  if (agentsStore.agentsInCategory(cat.id).length > 0) {
    deleteCategoryError.value = cat
    return
  }
  confirmDeleteCategory.value = cat
}

async function executeDeleteCategory() {
  const cat = confirmDeleteCategory.value
  if (!cat) return
  confirmDeleteCategory.value = null
  await agentsStore.deleteCategory(cat.id)
  // If we were viewing this category, fall back to All
  if (selectedView.type === 'category' && selectedView.categoryId === cat.id) {
    selectView({ type: 'all', agentType: cat.type })
  }
}

// ── Drag & drop assignment ─────────────────────────────────────────────────
const draggingAgentId    = ref(null)
const isDragging         = ref(false)
const dragOverCategoryId = ref(null)
const dragRejectCategoryId = ref(null)

function onAgentDragStart(e, agent) {
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', agent.id)
  draggingAgentId.value = agent.id
  isDragging.value = true
}

function onAgentDragEnd() {
  draggingAgentId.value    = null
  isDragging.value         = false
  dragOverCategoryId.value = null
  dragRejectCategoryId.value = null
}

function onCategoryDragOver(e, category) {
  const agent = agentsStore.getAgentById(draggingAgentId.value)
  if (!agent || agent.type !== category.type) {
    e.dataTransfer.dropEffect = 'none'
    dragOverCategoryId.value  = null
    dragRejectCategoryId.value = category.id
    return
  }
  e.preventDefault()
  e.dataTransfer.dropEffect   = 'copy'
  dragOverCategoryId.value    = category.id
  dragRejectCategoryId.value  = null
}

function onCategoryDragLeave(category) {
  if (dragOverCategoryId.value  === category.id) dragOverCategoryId.value  = null
  if (dragRejectCategoryId.value === category.id) dragRejectCategoryId.value = null
}

async function onCategoryDrop(e, category) {
  e.preventDefault()
  dragOverCategoryId.value   = null
  dragRejectCategoryId.value = null
  const id = e.dataTransfer.getData('text/plain')
  const agent = agentsStore.getAgentById(id)
  if (!agent || agent.type !== category.type) return
  await agentsStore.assignToCategory(id, category.id)
  draggingAgentId.value = null
  isDragging.value      = false
}

// ── Category drag-to-reorder ───────────────────────────────────────────────
const draggingCatId   = ref(null)
const catDragOverId   = ref(null)

function onCatDragStart(e, cat) {
  e.stopPropagation()
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('cat-id', cat.id)
  draggingCatId.value = cat.id
}

function onCatDragOver(e, cat) {
  if (!draggingCatId.value) return          // agent drag — let existing handler run
  if (cat.id === draggingCatId.value) return
  const draggedCat = agentsStore.getCategoryById(draggingCatId.value)
  if (!draggedCat || draggedCat.type !== cat.type) return  // no cross-section reorder
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'move'
  catDragOverId.value = cat.id
}

function onCatDragLeave(cat) {
  if (catDragOverId.value === cat.id) catDragOverId.value = null
}

async function onCatDrop(e, cat) {
  if (!draggingCatId.value) return          // agent drop — let existing handler run
  e.preventDefault()
  e.stopPropagation()
  catDragOverId.value = null
  await agentsStore.reorderCategory(draggingCatId.value, cat.id)
  draggingCatId.value = null
}

function onCatDragEnd() {
  draggingCatId.value = null
  catDragOverId.value = null
}

// ── Multi-select unassign ──────────────────────────────────────────────────
const selectMode      = ref(false)
const selectedAgentIds = ref(new Set())

function enterSelectMode() {
  selectMode.value = true
  selectedAgentIds.value = new Set()
}

function exitSelectMode() {
  selectMode.value = false
  selectedAgentIds.value = new Set()
}

function toggleSelect(id) {
  const s = new Set(selectedAgentIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedAgentIds.value = s
}

async function unassignSelected() {
  if (selectedView.type !== 'category') return
  const catId = selectedView.categoryId
  for (const id of selectedAgentIds.value) {
    await agentsStore.unassignFromCategory(id, catId)
  }
  exitSelectMode()
}

// ── Avatars ────────────────────────────────────────────────────────────────
const CIRCLE_COLORS = [
  '#1A1A1A', '#2D3748', '#374151', '#4A5568', '#1F2937',
  '#111827', '#1E293B', '#334155', '#3F3F46', '#27272A',
  '#18181B', '#292524', '#1C1917', '#1E1B4B', '#172554',
]

function getAvatarGradient(agent) {
  const idx = AGENT_AVATARS.findIndex(a => a.id === agent.avatar)
  if (idx >= 0) {
    const c = CIRCLE_COLORS[idx % CIRCLE_COLORS.length]
    return `linear-gradient(135deg, ${c}, ${c}dd)`
  }
  return 'linear-gradient(135deg, #0F0F0F, #374151)'
}

function getDeleteButtonTitle(agent) {
  if (agent.isBuiltin) return t('agents.deleteAgentBuiltinTooltip')
  const count = agentsStore.isAgentUsedInPlans(agent.id)
  if (count) {
    const plural = count === 1 ? t('agents.planStepSingular') : t('agents.planStepPlural')
    return t('agents.deleteAgentInUseTooltip', { count, plural })
  }
  return t('common.delete')
}

function isDeleteButtonDisabled(agent) {
  return agent.isBuiltin || agentsStore.isAgentUsedInPlans(agent.id) > 0
}
</script>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
.agents-page {
  background: #F2F2F7;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.agents-header {
  padding: 1.5rem 2rem 1.25rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
}
.agents-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.agents-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
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
  flex-shrink: 0;
}
.agents-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #6B7280;
  margin: 0.25rem 0 0;
}

/* ── Shared header ───────────────────────────────────────────────────────── */
.shared-header {
  display: flex;
  align-items: center;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
}
.shared-header-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1rem 0.875rem;
  flex-shrink: 0;
  border-right: 1px solid #E5E5EA;
}
.shared-header-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #1A1A1A;
}
.shared-header-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0.875rem;
  gap: 1rem;
  min-width: 0;
}

/* ── Body layout ─────────────────────────────────────────────────────────── */
.agents-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Left nav ────────────────────────────────────────────────────────────── */
.agents-nav {
  flex-shrink: 0;
  background: #FFFFFF;
  border-right: 1px solid #E5E5EA;
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Nav section fills available height and scrolls */
.agents-nav .nav-section {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 0.625rem;
}

/* ── Nav resize handle ───────────────────────────────────────────────────── */
.nav-resize-handle {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  position: relative;
  z-index: 1;
}
.nav-resize-handle:hover,
.nav-resize-handle:active {
  background: #E5E5EA;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0 0.625rem 0.5rem;
}
.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.25rem 0.375rem 0.5rem;
}
.nav-section-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.nav-section-add-btn {
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s;
  flex-shrink: 0;
}
.nav-section-add-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.16), 0 2px 4px rgba(0,0,0,0.1);
}
.nav-section-add-btn:active {
  transform: translateY(0);
}


/* nav item wrapper — needed for action icon reveal on hover */
.nav-item-wrap {
  position: relative;
  border-radius: 0.5rem;
  transition: background 0.12s ease;
}
.nav-item-wrap.drag-over {
  background: rgba(0, 122, 255, 0.08);
  outline: 2px dashed rgba(0, 122, 255, 0.5);
  outline-offset: -2px;
}
.nav-item-wrap.drag-reject {
  background: rgba(239, 68, 68, 0.06);
  outline: 2px dashed rgba(239, 68, 68, 0.4);
  outline-offset: -2px;
}
.nav-item-wrap:hover .nav-item-actions { opacity: 1; }

/* ── Non-category nav items (All System / All User / Uncategorized) ─────── */
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  width: 100%;
  padding: 0.4375rem 0.25rem 0.4375rem 0.5rem;
  border: none;
  border-radius: 0.5rem;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
  min-width: 0;
}
.nav-item:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}
.nav-item:hover .nav-item-icon { opacity: 1; }
.nav-item:hover .nav-item-count {
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.8);
}
.nav-item.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.nav-item-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  opacity: 0.6;
}
.nav-item.active .nav-item-icon { opacity: 1; }
.nav-item-emoji {
  font-size: 0.875rem;
  flex-shrink: 0;
  line-height: 1;
}
.nav-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-item-count {
  font-size: var(--fs-small);
  color: #9CA3AF;
  background: #F0F0F0;
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  flex-shrink: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
}
.nav-item.active .nav-item-count {
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.8);
}

/* All button wrapper — mirrors nav-cat-wrap so gradient + rounded corners live on the wrapper */
.nav-all-wrap {
  display: flex;
  align-items: center;
  border-radius: 0.5rem;
  padding-right: 0.25rem;
  transition: background 0.12s ease, box-shadow 0.12s ease;
}
.nav-all-wrap:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.nav-all-wrap.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

/* All button — transparent bg (wrapper provides gradient), bolder label */
.nav-item--all,
.nav-item--all:hover,
.nav-item--all.active {
  font-weight: 600;
  background: transparent !important;
  box-shadow: none !important;
}
.nav-all-wrap:hover .nav-item--all,
.nav-all-wrap.active .nav-item--all { color: #FFFFFF; }
.nav-item--all .nav-item-count {
  background: transparent;
  color: #9CA3AF;
  font-weight: 700;
  font-size: var(--fs-secondary);
  padding: 0.125rem 0.375rem;
}
.nav-all-wrap:hover .nav-item--all .nav-item-count,
.nav-all-wrap.active .nav-item--all .nav-item-count {
  background: transparent;
  color: rgba(255,255,255,0.6);
}

/* ── Category rows: full-row hover background on wrapper ─────────────────── */
.nav-cat-wrap {
  display: flex;
  align-items: center;
  border-radius: 0.5rem;
  transition: background 0.12s ease, box-shadow 0.12s ease;
  padding-right: 0.25rem;
}
/* Hover: full row gets the dark gradient */
.nav-cat-wrap:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

/* Per-category colored hover + active gradients — active matches hover so the
   selected row stays in its own color instead of flipping to deep black. */
.nav-cat-wrap--0:hover,
.nav-cat-wrap--0:has(.nav-item.active) { background: linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #3B82F6 100%); box-shadow: 0 2px 8px rgba(37, 99, 235, 0.28); }
.nav-cat-wrap--1:hover,
.nav-cat-wrap--1:has(.nav-item.active) { background: linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #8B5CF6 100%); box-shadow: 0 2px 8px rgba(124, 58, 237, 0.28); }
.nav-cat-wrap--2:hover,
.nav-cat-wrap--2:has(.nav-item.active) { background: linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%); box-shadow: 0 2px 8px rgba(5, 150, 105, 0.28); }
.nav-cat-wrap--3:hover,
.nav-cat-wrap--3:has(.nav-item.active) { background: linear-gradient(135deg, #92400E 0%, #D97706 60%, #F59E0B 100%); box-shadow: 0 2px 8px rgba(217, 119, 6, 0.28); }
.nav-cat-wrap--4:hover,
.nav-cat-wrap--4:has(.nav-item.active) { background: linear-gradient(135deg, #991B1B 0%, #DC2626 60%, #EF4444 100%); box-shadow: 0 2px 8px rgba(220, 38, 38, 0.28); }
.nav-cat-wrap--5:hover,
.nav-cat-wrap--5:has(.nav-item.active) { background: linear-gradient(135deg, #164E63 0%, #0891B2 60%, #06B6D4 100%); box-shadow: 0 2px 8px rgba(8, 145, 178, 0.28); }
.nav-cat-wrap--6:hover,
.nav-cat-wrap--6:has(.nav-item.active) { background: linear-gradient(135deg, #713F12 0%, #CA8A04 60%, #EAB308 100%); box-shadow: 0 2px 8px rgba(202, 138, 4, 0.28); }
.nav-cat-wrap--7:hover,
.nav-cat-wrap--7:has(.nav-item.active) { background: linear-gradient(135deg, #831843 0%, #BE185D 60%, #EC4899 100%); box-shadow: 0 2px 8px rgba(190, 24, 93, 0.28); }
/* The button inside a category row is transparent — wrapper provides bg */
.nav-cat-btn {
  flex: 1;
  min-width: 0;
  background: transparent !important;
  box-shadow: none !important;
  padding-right: 0.25rem;
  /* inherit color from wrapper */
  color: #6B7280;
  transition: color 0.12s ease;
}
.nav-cat-wrap:hover .nav-cat-btn,
.nav-cat-wrap:has(.nav-item.active) .nav-cat-btn {
  color: #FFFFFF;
}
.nav-cat-wrap:has(.nav-item.active) .nav-cat-btn {
  font-weight: 600;
}

/* Right side: count + action buttons */
.nav-cat-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  position: relative;
  /* wide enough for 2 icon buttons (2 × 1.5rem = 3rem) */
  min-width: 3rem;
  height: 2rem;
  justify-content: flex-end;
}
.nav-cat-count {
  font-size: var(--fs-small);
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  flex-shrink: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
  /* default: light badge */
  color: #9CA3AF;
  background: #F0F0F0;
}
/* On hover or active row: white badge, then hide it for actions */
.nav-cat-wrap:hover .nav-cat-count,
.nav-cat-wrap:has(.nav-item.active) .nav-cat-count {
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.8);
}
/* Hide count on hover/active to show action buttons */
.nav-cat-wrap:hover .nav-cat-count,
.nav-cat-wrap:has(.nav-item.active) .nav-cat-count {
  opacity: 0;
  pointer-events: none;
}

.nav-cat-actions {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}
/* Show actions on hover OR when active (always show on selected item) */
.nav-cat-wrap:hover .nav-cat-actions,
.nav-cat-wrap:has(.nav-item.active) .nav-cat-actions {
  opacity: 1;
}

/* Category drag-to-reorder states */
.nav-cat-wrap { cursor: grab; }
.nav-cat-wrap:active { cursor: grabbing; }
.nav-cat-wrap.cat-dragging { opacity: 0.4; }
.nav-cat-wrap.cat-drag-over {
  box-shadow: 0 2px 0 0 #374151;
}

/* Icon buttons — base (light bg) */
.nav-item-actions {
  display: flex;
  gap: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
  flex-shrink: 0;
}
.nav-icon-btn {
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  border-radius: 0.3125rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.nav-icon-btn:hover { background: rgba(255, 255, 255, 0.15); color: #FFFFFF; }
.nav-icon-btn-danger:hover { background: rgba(255, 59, 48, 0.25); color: #FF6B6B; }

/* ── Right content area ───────────────────────────────────────────────────── */
.agents-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.content-title-emoji {
  font-size: 1.25rem;
  line-height: 1;
}
.content-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.content-count {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.08);
}
.content-filter-wrap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  max-width: 18rem;
  background: #F5F5F5;
  border: 1px solid #E5E5EA;
  border-radius: var(--radius-sm);
  padding: 0.3125rem 0.5rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.content-filter-wrap:focus-within {
  border-color: #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
  background: #FFFFFF;
}
.content-filter-icon {
  color: #9CA3AF;
  flex-shrink: 0;
  transition: color 0.15s;
}
.content-filter-wrap:focus-within .content-filter-icon { color: #1A1A1A; }
.content-filter-input {
  flex: 1;
  border: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #1A1A1A;
  outline: none;
  min-width: 0;
}
.content-filter-input::placeholder { color: #9CA3AF; }
.content-filter-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.125rem;
  height: 1.125rem;
  border: none;
  background: #D1D5DB;
  color: #6B7280;
  border-radius: 9999px;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: background 0.12s, color 0.12s;
}
.content-filter-clear:hover { background: #9CA3AF; color: #FFFFFF; }
.content-header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.drag-hint {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #007AFF;
  text-align: center;
  padding: 0.5rem 1.5rem;
  background: rgba(0, 122, 255, 0.04);
  border-bottom: 1px solid rgba(0, 122, 255, 0.1);
  margin: 0;
  flex-shrink: 0;
}

/* ── Scrollable grid area ─────────────────────────────────────────────────── */
.agents-grid-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  
}
.agents-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.875rem;
}
@media (min-width: 1920px) {
  .agents-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 2560px) {
  .agents-grid { grid-template-columns: repeat(4, 1fr); }
}

/* ── Draggable card wrapper ───────────────────────────────────────────────── */
.agent-card-wrap {
  position: relative;
  cursor: grab;
  border-radius: 1rem;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.agent-card-wrap:active { cursor: grabbing; }
.agent-card-wrap.select-mode { cursor: pointer; }
.agent-card-wrap.is-selected { outline: 2px solid #007AFF; outline-offset: 2px; }
.agent-card-wrap.newly-added {
  animation: agentNewlyAdded 5s ease-out forwards;
}
@keyframes agentNewlyAdded {
  0%   { outline: 2px solid #10B981; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(16,185,129,0.25); }
  60%  { outline: 2px solid #10B981; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(16,185,129,0.25); }
  100% { outline: 2px solid transparent; outline-offset: 2px; box-shadow: none; }
}

/* Body View button: appears on card hover */
.agent-card-inner-wrap {
  position: relative;
}

.body-view-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid rgba(0, 122, 255, 0.3);
  background: rgba(0, 0, 0, 0.7);
  color: #60A5FA;
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 600;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
  z-index: 5;
  white-space: nowrap;
  backdrop-filter: blur(4px);
}

.agent-card-inner-wrap:hover .body-view-btn {
  opacity: 1;
}

.body-view-btn:hover {
  background: rgba(0, 122, 255, 0.15);
  border-color: rgba(0, 122, 255, 0.6);
  color: #93C5FD;
}

.select-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  border-radius: 1rem;
  cursor: pointer;
}
.select-checkbox {
  position: absolute;
  top: 0.625rem;
  right: 0.625rem;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 0.3125rem;
  border: 2px solid #D1D5DB;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.select-checkbox.checked {
  background: #007AFF;
  border-color: #007AFF;
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
.section-empty {
  padding: 1.5rem;
}
.section-empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.75rem 1.5rem;
  border-radius: 1rem;
  background: #F9F9F9;
  border: 1.5px dashed #D1D1D6;
}
.section-empty-inner p {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
  margin: 0;
  text-align: center;
}
.section-empty-actions {
  display: flex;
  justify-content: center;
  margin-top: 0.75rem;
}
</style>

<style>
/* Teleported — must be unscoped */
.nav-name-tooltip {
  position: fixed;
  transform: translateY(-50%);
  white-space: nowrap;
  background: #1A1A1A;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid #2A2A2A;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  pointer-events: none;
  z-index: 9999;
}

</style>
