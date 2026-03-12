<template>
  <div class="re-page">

    <!-- ── Top-level tabs ── -->
    <div class="re-top-tabs">
      <div class="re-top-tabs-inner">
        <button
          :class="['re-tab', activeTab === 'recipes' && 're-tab--active']"
          @click="activeTab = 'recipes'"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          Schedulers
          <span class="re-tab-badge">{{ recipes.length }}</span>
        </button>
        <button
          :class="['re-tab', activeTab === 'dashboard' && 're-tab--active']"
          @click="switchToDashboard"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Dashboard
          <span v-if="recipesStore.runs.length > 0" class="re-tab-badge">{{ recipesStore.runs.length }}</span>
        </button>
      </div>

      <!-- Header right actions (only in catalog mode) -->
      <div v-if="activeTab === 'recipes' && !selectedRecipe" class="re-header-actions">
        <AppButton size="compact" @click="openNewEditor">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </AppButton>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════ RECIPES TAB -->
    <template v-if="activeTab === 'recipes'">

      <!-- ── Runner Mode ── -->
      <template v-if="selectedRecipe">
        <div class="re-runner-header">
          <button class="re-back-btn" @click="goBack" :disabled="recipesStore.isRunning">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="re-recipe-icon-lg">{{ selectedRecipe.icon }}</span>
              <h1 class="re-page-title">{{ selectedRecipe.name }}</h1>
            </div>
            <p class="re-page-subtitle">{{ selectedRecipe.description }}</p>
          </div>
        </div>

        <div class="re-runner-body">
          <!-- Input form -->
          <div class="re-input-card">
            <div class="re-input-card-header">
              <div class="re-section-icon-sm">
                <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </div>
              <span class="re-input-title">Inputs</span>
            </div>

            <div class="re-input-fields">
              <div
                v-for="inp in selectedRecipe.inputs"
                :key="inp.key"
                class="re-input-field"
              >
                <label class="re-field-label">
                  {{ inp.label }}
                  <span v-if="inp.required" style="color:#EF4444;">*</span>
                </label>
                <textarea
                  v-if="inp.type === 'textarea'"
                  v-model="formInputs[inp.key]"
                  rows="3"
                  :placeholder="inp.placeholder || ''"
                  class="re-field-input re-field-textarea"
                  :disabled="recipesStore.isRunning"
                />
                <input
                  v-else-if="inp.type === 'number'"
                  v-model.number="formInputs[inp.key]"
                  type="number"
                  :min="inp.min"
                  :max="inp.max"
                  class="re-field-input"
                  :disabled="recipesStore.isRunning"
                />
                <input
                  v-else
                  v-model="formInputs[inp.key]"
                  type="text"
                  :placeholder="inp.placeholder || ''"
                  class="re-field-input"
                  :disabled="recipesStore.isRunning"
                />
              </div>

              <!-- No inputs configured -->
              <p v-if="selectedRecipe.inputs.length === 0" class="re-no-inputs">
                This scheduler has no inputs — just click Run.
              </p>
            </div>

            <div class="re-run-actions">
              <AppButton
                v-if="!recipesStore.isRunning && !isCompleted"
                variant="primary"
                @click="handleRun"
                :disabled="!canRun"
              >
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Run
              </AppButton>
              <AppButton
                v-if="recipesStore.isRunning"
                variant="danger"
                @click="handleStop"
              >
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                Stop
              </AppButton>
              <AppButton
                v-if="isCompleted || isError"
                variant="secondary"
                @click="handleReset"
              >
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                Run Again
              </AppButton>
            </div>

            <div v-if="isError" class="re-run-error">
              {{ recipesStore.activeRun?.error }}
            </div>
          </div>

          <!-- Output -->
          <div v-if="recipesStore.activeRun" class="re-output-area">
            <RecipeRunner
              :run="recipesStore.activeRun"
              :recipe="selectedRecipe"
              :readOnly="false"
            />
          </div>
        </div>
      </template>

      <!-- ── Catalog Mode ── -->
      <template v-else>
        <div class="re-catalog-body">
          <div v-if="recipes.length === 0" class="re-empty-state">
            <div class="re-empty-icon">
              <svg style="width:32px;height:32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <h3 class="re-empty-title">No schedulers yet</h3>
            <p class="re-empty-desc">Create your first multi-persona scheduler pipeline.</p>
            <AppButton size="compact" @click="openNewEditor">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </AppButton>
          </div>

          <div v-else class="re-recipe-grid">
            <div
              v-for="recipe in recipes"
              :key="recipe.id"
              class="re-recipe-card"
            >
              <div class="re-card-icon-wrap">
                <span class="re-card-icon">{{ recipe.icon || '✍️' }}</span>
              </div>
              <div class="re-card-body">
                <div class="re-card-name-row">
                  <h3 class="re-card-name">{{ recipe.name }}</h3>
                </div>
                <p class="re-card-desc">{{ recipe.description || 'No description.' }}</p>
                <div class="re-card-meta">
                  <span v-if="recipe.schedule?.enabled" class="re-schedule-badge">
                    <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {{ scheduleLabel(recipe) }}
                  </span>
                  <span class="re-persona-count">
                    {{ (recipe.personas || []).length }} persona{{ (recipe.personas || []).length !== 1 ? 's' : '' }}
                  </span>
                  <span v-if="lastRunForRecipe(recipe.id)" class="re-last-run" :class="lastRunStatusClass(recipe.id)">
                    {{ lastRunRelative(recipe.id) }}
                  </span>
                </div>
              </div>
              <div class="re-card-actions">
                <button class="re-action-btn re-run-btn" @click="selectRecipe(recipe)" title="Run">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
                <button class="re-action-btn" @click="openEditEditor(recipe)" title="Edit">
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="re-action-btn re-delete-btn" @click="confirmDeleteRecipe(recipe)" title="Delete">
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

    </template>

    <!-- ════════════════════════════════════════════════════════ DASHBOARD TAB -->
    <template v-if="activeTab === 'dashboard'">
      <div class="re-dashboard">

        <!-- Left pane: runs list -->
        <div class="re-runs-pane">
          <div class="re-runs-filter">
            <select v-model="filterRecipeId" class="re-filter-select">
              <option value="">All schedulers</option>
              <option v-for="r in recipes" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
            <select v-model="filterStatus" class="re-filter-select">
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="error">Error</option>
              <option value="running">Running</option>
            </select>
          </div>

          <div class="re-runs-list" v-if="filteredRuns.length > 0">
            <div
              v-for="run in filteredRuns"
              :key="run.id"
              class="re-run-row"
              :class="{ 'active': selectedRunId === run.id }"
              @click="selectRun(run.id)"
            >
              <div class="re-run-icon">{{ recipeIcon(run.recipeId) }}</div>
              <div class="re-run-info">
                <div class="re-run-name">{{ run.recipeName }}</div>
                <div class="re-run-meta">
                  <span :class="['re-trigger-badge', run.triggeredBy === 'schedule' ? 're-trigger--sched' : 're-trigger--manual']">
                    {{ run.triggeredBy === 'schedule' ? 'Scheduled' : 'Manual' }}
                  </span>
                  <span class="re-run-time">{{ relativeTime(run.startedAt) }}</span>
                </div>
              </div>
              <div :class="['re-status-dot', `re-status--${run.status}`]" />
            </div>
          </div>
          <div v-else class="re-runs-empty">
            <p>No runs found.</p>
          </div>
        </div>

        <!-- Right pane: run detail -->
        <div class="re-detail-pane">
          <template v-if="selectedRunId && detailRun">
            <!-- Detail header -->
            <div class="re-detail-header">
              <div class="re-detail-meta">
                <div class="re-detail-recipe-row">
                  <span class="re-detail-recipe-icon">{{ recipeIcon(detailRun.recipeId) }}</span>
                  <span class="re-detail-recipe-name">{{ detailRun.recipeName }}</span>
                  <span :class="['re-detail-status', `re-detail-status--${detailRun.status}`]">{{ detailRun.status }}</span>
                </div>
                <div class="re-detail-timestamps">
                  <span>Started: {{ formatDate(detailRun.startedAt) }}</span>
                  <span v-if="detailRun.completedAt">· Completed: {{ formatDate(detailRun.completedAt) }}</span>
                  <span v-if="detailRun.triggeredBy === 'schedule'" class="re-detail-trigger">· Scheduled</span>
                  <span v-else class="re-detail-trigger">· Manual</span>
                </div>
                <div v-if="detailRun.inputs && Object.keys(detailRun.inputs).length > 0" class="re-detail-inputs">
                  <span v-for="(v, k) in detailRun.inputs" :key="k" class="re-detail-input-chip">
                    <span class="re-detail-input-key">{{ k }}:</span> {{ v }}
                  </span>
                </div>
              </div>
              <button class="re-delete-run-btn" @click="confirmDeleteRun(detailRun.id)" title="Delete run">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                Delete run
              </button>
            </div>

            <div v-if="detailRun.error" class="re-detail-error">
              {{ detailRun.error }}
            </div>

            <!-- Runner display -->
            <div class="re-detail-output">
              <RecipeRunner
                :run="detailRun"
                :recipe="recipeForDetail"
                :readOnly="true"
              />
            </div>
          </template>

          <div v-else class="re-detail-empty">
            <div class="re-detail-empty-icon">
              <svg style="width:28px;height:28px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </div>
            <p class="re-detail-empty-text">Select a run to view its outputs</p>
          </div>
        </div>

      </div>
    </template>

    <!-- ── RecipeEditor modal ── -->
    <RecipeEditor
      :visible="editorVisible"
      :recipe="editorRecipe"
      @close="editorVisible = false"
      @saved="handleEditorSaved"
    />

    <!-- ── Delete confirmation modal ── -->
    <Teleport to="body">
      <div v-if="deleteTarget" class="re-confirm-backdrop">
        <div class="re-confirm-modal">
          <h3 class="re-confirm-title">{{ deleteTarget.type === 'recipe' ? 'Delete Scheduler' : 'Delete Run' }}</h3>
          <p class="re-confirm-desc">
            <template v-if="deleteTarget.type === 'recipe'">
              Delete <strong>{{ deleteTarget.name }}</strong>? All run history will remain but the scheduler will no longer be accessible.
            </template>
            <template v-else>
              Delete this run record? This cannot be undone.
            </template>
          </p>
          <div class="re-confirm-footer">
            <button class="re-confirm-cancel" @click="deleteTarget = null">Cancel</button>
            <button class="re-confirm-delete" @click="executeDelete">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRecipesStore } from '../stores/recipes'
import AppButton from '../components/common/AppButton.vue'
import RecipeEditor from '../components/recipes/RecipeEditor.vue'
import RecipeRunner from '../components/recipes/RecipeRunner.vue'

const recipesStore = useRecipesStore()

// ── Tab state ─────────────────────────────────────────────────────────────────

const activeTab = ref('recipes')

async function switchToDashboard() {
  activeTab.value = 'dashboard'
  await recipesStore.loadRuns()
}

// ── Recipes catalog ──────────────────────────────────────────────────────────

const recipes = computed(() => recipesStore.recipes)

// ── Runner state ──────────────────────────────────────────────────────────────

const selectedRecipe = ref(null)
const formInputs = ref({})

const isCompleted = computed(() => recipesStore.activeRun?.status === 'completed')
const isError = computed(() => recipesStore.activeRun?.status === 'error')

const canRun = computed(() => {
  if (!selectedRecipe.value) return false
  for (const inp of selectedRecipe.value.inputs) {
    if (inp.required && !formInputs.value[inp.key]) return false
  }
  return true
})

function selectRecipe(recipe) {
  selectedRecipe.value = recipe
  recipesStore.resetActiveRun()
  // Init form with defaults
  formInputs.value = {}
  for (const inp of recipe.inputs || []) {
    formInputs.value[inp.key] = inp.default !== undefined ? inp.default : ''
  }
}

function goBack() {
  if (recipesStore.isRunning) return
  recipesStore.resetActiveRun()
  selectedRecipe.value = null
}

async function handleRun() {
  if (!selectedRecipe.value || !canRun.value) return
  await recipesStore.runRecipe(selectedRecipe.value.id, { ...formInputs.value })
}

async function handleStop() {
  await recipesStore.stopRecipe()
}

function handleReset() {
  recipesStore.resetActiveRun()
}

// ── Recipe editor ─────────────────────────────────────────────────────────────

const editorVisible = ref(false)
const editorRecipe = ref(null)

function openNewEditor() {
  editorRecipe.value = null
  editorVisible.value = true
}

function openEditEditor(recipe) {
  editorRecipe.value = recipe
  editorVisible.value = true
}

async function handleEditorSaved(recipe) {
  editorVisible.value = false
  const result = await recipesStore.saveRecipe(recipe)
  if (!result?.success) {
    console.error('[RecipesView] Save failed:', result?.error)
  }
}

// ── Delete confirmation ───────────────────────────────────────────────────────

const deleteTarget = ref(null)  // { type: 'recipe'|'run', id, name }

function confirmDeleteRecipe(recipe) {
  deleteTarget.value = { type: 'recipe', id: recipe.id, name: recipe.name }
}

function confirmDeleteRun(runId) {
  deleteTarget.value = { type: 'run', id: runId }
}

async function executeDelete() {
  if (!deleteTarget.value) return
  if (deleteTarget.value.type === 'recipe') {
    await recipesStore.deleteRecipe(deleteTarget.value.id)
    // If viewing this recipe in runner, go back
    if (selectedRecipe.value?.id === deleteTarget.value.id) {
      selectedRecipe.value = null
      recipesStore.resetActiveRun()
    }
  } else {
    await recipesStore.deleteRun(deleteTarget.value.id)
    if (selectedRunId.value === deleteTarget.value.id) {
      selectedRunId.value = null
      detailRun.value = null
    }
  }
  deleteTarget.value = null
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

const filterRecipeId = ref('')
const filterStatus = ref('')
const selectedRunId = ref(null)
const detailRun = ref(null)

const filteredRuns = computed(() => {
  let list = recipesStore.runs
  if (filterRecipeId.value) list = list.filter(r => r.recipeId === filterRecipeId.value)
  if (filterStatus.value) list = list.filter(r => r.status === filterStatus.value)
  return list
})

const recipeForDetail = computed(() => {
  if (!detailRun.value) return null
  return recipes.value.find(r => r.id === detailRun.value.recipeId) || null
})

async function selectRun(runId) {
  selectedRunId.value = runId
  detailRun.value = await recipesStore.getRunDetail(runId)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function recipeIcon(recipeId) {
  return recipes.value.find(r => r.id === recipeId)?.icon || '📋'
}

function lastRunForRecipe(recipeId) {
  return recipesStore.runs.find(r => r.recipeId === recipeId) || null
}

function lastRunStatusClass(recipeId) {
  const run = lastRunForRecipe(recipeId)
  if (!run) return ''
  return run.status === 'completed' ? 're-last-run--ok' : run.status === 'error' ? 're-last-run--err' : ''
}

function lastRunRelative(recipeId) {
  const run = lastRunForRecipe(recipeId)
  if (!run) return ''
  return relativeTime(run.startedAt)
}

function permissionLabel(permission) {
  if (permission === 'chat_only') return 'Ask'
  if (permission === 'all_permissions') return 'All Perms'
  return 'Inherit'
}

function scheduleLabel(recipe) {
  const s = recipe.schedule
  if (!s?.enabled) return ''
  if (s.preset === 'hourly') return 'Hourly'
  if (s.preset === 'daily') return `Daily ${s.time || ''}`
  if (s.preset === 'weekly') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const day = days[parseInt(s.day || '1')] || 'Mon'
    return `${day} ${s.time || ''}`
  }
  return s.cron || ''
}

function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  await recipesStore.loadRecipes()
  await recipesStore.loadRuns()
  recipesStore.subscribeToScheduledRuns()
})

function onKeydown(e) {
  if (e.key === 'Escape' && deleteTarget.value) deleteTarget.value = null
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  recipesStore.unsubscribeFromScheduledRuns()
  if (!recipesStore.isRunning) {
    recipesStore.resetActiveRun()
  }
})
</script>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.re-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-main);
}

/* ── Top tabs bar ─────────────────────────────────────────────────────────── */
.re-top-tabs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  gap: 1rem;
}
.re-top-tabs-inner {
  display: flex;
  gap: 0.125rem;
}
.re-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: -1px;
}
.re-tab:hover { color: #1A1A1A; }
.re-tab--active {
  color: #1A1A1A;
  border-bottom-color: #1A1A1A;
}
.re-tab-badge {
  font-size: var(--fs-small);
  font-weight: 700;
  background: #F3F4F6;
  color: #6B7280;
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
}
.re-tab--active .re-tab-badge {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}

.re-header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

/* ── Runner header ─────────────────────────────────────────────────────────── */
.re-runner-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1.5rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.re-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.875rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.re-back-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.re-back-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.re-recipe-icon-lg { font-size: 1.5rem; line-height: 1; }
.re-page-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.re-page-subtitle {
  font-size: var(--fs-body);
  color: #6B7280;
  margin: 0.125rem 0 0 0;
}

/* ── Runner body ─────────────────────────────────────────────────────────── */
.re-runner-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ── Input card ──────────────────────────────────────────────────────────── */
.re-input-card {
  background: #FFFFFF;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.re-input-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.re-section-icon-sm {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.375rem;
  color: #FFFFFF;
  flex-shrink: 0;
}
.re-input-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #1A1A1A;
}
.re-input-fields {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}
.re-input-field { display: flex; flex-direction: column; gap: 0.3125rem; }
.re-field-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #374151;
}
.re-field-input {
  padding: 0.5625rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
  background: #FFFFFF;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  width: 100%;
}
.re-field-input:focus {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
}
.re-field-input:disabled { opacity: 0.5; cursor: not-allowed; }
.re-field-textarea { resize: vertical; min-height: 5rem; }
.re-no-inputs {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
}
.re-run-actions {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-top: 1rem;
}
.re-run-error {
  margin-top: 0.75rem;
  padding: 0.625rem 0.875rem;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #DC2626;
}

/* ── Output area ─────────────────────────────────────────────────────────── */
.re-output-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 14rem;
}

/* ── Catalog body ─────────────────────────────────────────────────────────── */
.re-catalog-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
}

/* Empty state */
.re-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 0;
  gap: 0.75rem;
}
.re-empty-icon {
  width: 5rem;
  height: 5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 1.25rem;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.re-empty-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.re-empty-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #9CA3AF;
  margin: 0 0 0.5rem 0;
}

/* Recipe grid */
.re-recipe-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}
@media (min-width: 1920px) { .re-recipe-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 2560px) { .re-recipe-grid { grid-template-columns: repeat(4, 1fr); } }

/* Recipe card */
.re-recipe-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.125rem;
  background: #FFFFFF;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  transition: all 0.15s ease;
}
.re-recipe-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  border-color: #D1D5DB;
}

.re-card-icon-wrap {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: var(--radius-md);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.re-card-icon { font-size: 1.375rem; }

.re-card-body { flex: 1; min-width: 0; }
.re-card-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  flex-wrap: wrap;
}
.re-card-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.re-vis-badge {
  font-size: var(--fs-small);
  font-weight: 600;
  color: #3B82F6;
  background: rgba(59,130,246,0.08);
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
}
.re-card-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #6B7280;
  margin: 0 0 0.5rem 0;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.re-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.re-schedule-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--fs-small);
  font-weight: 600;
  color: #F59E0B;
  background: rgba(245,158,11,0.1);
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
}
.re-persona-count {
  font-size: var(--fs-small);
  color: #9CA3AF;
}
.re-last-run {
  font-size: var(--fs-small);
  color: #9CA3AF;
}
.re-last-run--ok { color: #10B981; }
.re-last-run--err { color: #EF4444; }

/* Card action buttons */
.re-card-actions {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex-shrink: 0;
}
.re-action-btn {
  width: 1.875rem;
  height: 1.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26,26,26,0.05);
  border: none;
  border-radius: 0.375rem;
  color: rgba(26,26,26,0.5);
  cursor: pointer;
  transition: all 0.15s ease;
}
.re-action-btn:hover {
  background: rgba(26,26,26,0.1);
  color: #1A1A1A;
}
.re-run-btn:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%) !important;
  color: #FFFFFF !important;
}
.re-delete-btn:hover {
  background: rgba(239,68,68,0.1) !important;
  color: #EF4444 !important;
}

/* ── Dashboard ─────────────────────────────────────────────────────────────── */
.re-dashboard {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Runs pane (left) */
.re-runs-pane {
  width: 20rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #E5E5EA;
  background: #FFFFFF;
  overflow: hidden;
}
.re-runs-filter {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem;
  border-bottom: 1px solid #E5E5EA;
}
.re-filter-select {
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #1A1A1A;
  background: #FFFFFF;
  outline: none;
  cursor: pointer;
}
.re-runs-list {
  flex: 1;
  overflow-y: auto;
}
.re-run-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem;
  cursor: pointer;
  border-bottom: 1px solid #F0F0F0;
  transition: background 0.1s ease;
}
.re-run-row:hover { background: #F5F5F5; }
.re-run-row.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
}
.re-run-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.re-run-info { flex: 1; min-width: 0; }
.re-run-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #1A1A1A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.re-run-row.active .re-run-name { color: #FFFFFF; }
.re-run-meta {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.125rem;
}
.re-trigger-badge {
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.0625rem 0.3125rem;
  border-radius: 9999px;
}
.re-trigger--manual {
  background: rgba(107,114,128,0.12);
  color: #6B7280;
}
.re-trigger--sched {
  background: rgba(245,158,11,0.12);
  color: #F59E0B;
}
.re-run-row.active .re-trigger-badge {
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.8);
}
.re-run-time {
  font-size: var(--fs-small);
  color: #9CA3AF;
}
.re-run-row.active .re-run-time { color: rgba(255,255,255,0.5); }

/* Status dot */
.re-status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.re-status--completed { background: #10B981; }
.re-status--error { background: #EF4444; }
.re-status--running { background: #3B82F6; animation: pulse 1s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

.re-runs-empty {
  padding: 2rem;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
}

/* Detail pane (right) */
.re-detail-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-main);
}

.re-detail-header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  gap: 1rem;
}
.re-detail-meta { display: flex; flex-direction: column; gap: 0.375rem; }
.re-detail-recipe-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.re-detail-recipe-icon { font-size: 1.25rem; }
.re-detail-recipe-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #1A1A1A;
}
.re-detail-status {
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  text-transform: capitalize;
}
.re-detail-status--completed { background: rgba(16,185,129,0.1); color: #10B981; }
.re-detail-status--error     { background: rgba(239,68,68,0.1);  color: #EF4444; }
.re-detail-status--running   { background: rgba(59,130,246,0.1); color: #3B82F6; }
.re-detail-timestamps {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #9CA3AF;
}
.re-detail-trigger { font-style: italic; }
.re-detail-inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.re-detail-input-chip {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  background: #F3F4F6;
  color: #374151;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
}
.re-detail-input-key { color: #6B7280; }

.re-delete-run-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: rgba(239,68,68,0.07);
  border: 1px solid rgba(239,68,68,0.15);
  border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  color: #EF4444;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.re-delete-run-btn:hover {
  background: rgba(239,68,68,0.14);
}

.re-detail-error {
  margin: 0.75rem 1.5rem 0;
  padding: 0.625rem 0.875rem;
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #DC2626;
}

.re-detail-output {
  flex: 1;
  overflow: hidden;
  padding: 1rem 1.5rem 1.5rem;
  display: flex;
  flex-direction: column;
}

.re-detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}
.re-detail-empty-icon {
  width: 4rem;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 1rem;
  color: #FFFFFF;
}
.re-detail-empty-text {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
  margin: 0;
}

/* ── Delete confirmation modal ──────────────────────────────────────────────── */
.re-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.re-confirm-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 0.875rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
}
.re-confirm-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0 0 0.625rem 0;
}
.re-confirm-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: rgba(255,255,255,0.6);
  margin: 0 0 1.25rem 0;
  line-height: 1.6;
}
.re-confirm-desc strong { color: rgba(255,255,255,0.9); }
.re-confirm-footer { display: flex; justify-content: flex-end; gap: 0.5rem; }
.re-confirm-cancel {
  padding: 0.4375rem 0.875rem;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  transition: all 0.15s ease;
}
.re-confirm-cancel:hover { background: rgba(255,255,255,0.14); color: #FFFFFF; }
.re-confirm-delete {
  padding: 0.4375rem 0.875rem;
  background: rgba(239,68,68,0.15);
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #EF4444;
  cursor: pointer;
  transition: all 0.15s ease;
}
.re-confirm-delete:hover { background: rgba(239,68,68,0.25); }
</style>
