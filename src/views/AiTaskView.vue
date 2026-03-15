<template>
  <div class="atv-container">
    <!-- Header -->
    <div class="atv-header">
      <div class="atv-header-left">
        <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/></svg>
        <div>
          <h1 class="atv-title">{{ t('tasks.aiTasksTitle') }}</h1>
          <p class="atv-subtitle">{{ t('tasks.aiTasksSubtitle') }}</p>
        </div>
      </div>
      <AppButton size="compact" @click="refreshAll" :loading="isRefreshing">
        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
      </AppButton>
    </div>

    <!-- Body: 3-column layout -->
    <div class="atv-body" :style="{ '--tree-width': treePaneWidth + 'px' }">
      <!-- Left tree pane -->
      <div class="atv-tree-pane">
        <AiTaskTree
          :tree="tree"
          :plan-categories="planCategories"
          :selected-item-id="selectedItem?.itemId"
          @select-item="onSelectItem"
        />
      </div>

      <!-- Resize handle -->
      <div class="atv-resize-handle" @mousedown="startTreeResize" />

      <!-- Center detail pane -->
      <div class="atv-detail-pane">
        <AiTaskExecutionDetail
          :selected-item="selectedItem"
          :plan="selectedPlan"
          :runs="itemRuns"
          :all-agents="agents"
          :all-tasks="tasks"
          :scroll-to-step-id="scrollToStepId"
          @run-detail-loaded="onRunDetailSelected"
        />
      </div>

      <!-- Right workflow pane — shown only when selected plan has steps -->
      <template v-if="selectedPlan?.steps?.length">
        <div v-show="workflowVisible" class="atv-workflow-pane">
          <AiTaskWorkflowPanel
            :plan="selectedPlan"
            :run="selectedRunDetail"
            @hide="workflowVisible = false"
            @scroll-to-step="scrollToStep"
          />
        </div>
        <!-- Collapsed toggle button -->
        <button
          v-if="!workflowVisible"
          class="atv-workflow-show-btn"
          @click="workflowVisible = true"
          :title="t('tasks.viewModal.workflow')"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '../i18n/useI18n'
import AppButton from '../components/common/AppButton.vue'
import AiTaskTree from '../components/tasks/AiTaskTree.vue'
import AiTaskExecutionDetail from '../components/tasks/AiTaskExecutionDetail.vue'
import AiTaskWorkflowPanel from '../components/tasks/AiTaskWorkflowPanel.vue'
import { useTasksStore } from '../stores/tasks'
import { useAgentsStore } from '../stores/agents'

const { t } = useI18n()

const tasksStore = useTasksStore()
const agentsStore = useAgentsStore()

const tree = ref({ plans: [] })
const planCategories = ref([])
const selectedItem = ref(null)
const selectedPlan = ref(null)
const itemRuns = ref([])
const treePaneWidth = ref(280)
const isRefreshing = ref(false)

const agents = ref([])
const tasks = ref([])

const workflowVisible = ref(true)
const selectedRunDetail = ref(null)
const scrollToStepId = ref(null)

async function refreshAll() {
  isRefreshing.value = true
  try {
    const [treeData, cats] = await Promise.all([
      window.electronAPI.aiTask.getTree(),
      window.electronAPI.planCategories.list(),
    ])
    tree.value = treeData || { plans: [] }
    planCategories.value = cats || []
    await Promise.all([tasksStore.loadPlans(), tasksStore.loadTasks()])
    agents.value = agentsStore.agents || []
    tasks.value = tasksStore.tasks || []
  } catch (err) {
    console.error('[AiTaskView] refreshAll error:', err)
  } finally {
    isRefreshing.value = false
  }
}

async function onSelectItem({ item, plan }) {
  selectedItem.value = { ...item, planId: plan.planId }
  selectedPlan.value = tasksStore.plans.find(p => p.id === plan.planId)
    || { id: plan.planId, name: plan.planName, steps: [] }
  selectedRunDetail.value = null
  scrollToStepId.value = null
  try {
    itemRuns.value = await window.electronAPI.tasks.getRuns({ itemId: item.itemId }) || []
  } catch (err) {
    console.error('[AiTaskView] getRuns error:', err)
    itemRuns.value = []
  }
}

function onRunDetailSelected(detail) {
  selectedRunDetail.value = detail
}

function scrollToStep(stepIdx) {
  scrollToStepId.value = null
  // Reset to null first so the watcher fires even if same value
  setTimeout(() => {
    scrollToStepId.value = stepIdx
  }, 0)
}

let resizeStartX = 0
let resizeStartWidth = 0

function startTreeResize(e) {
  resizeStartX = e.clientX
  resizeStartWidth = treePaneWidth.value
  document.addEventListener('mousemove', doTreeResize)
  document.addEventListener('mouseup', stopTreeResize)
}

function doTreeResize(e) {
  const delta = e.clientX - resizeStartX
  const newWidth = Math.max(180, Math.min(600, resizeStartWidth + delta))
  treePaneWidth.value = newWidth
}

function stopTreeResize() {
  document.removeEventListener('mousemove', doTreeResize)
  document.removeEventListener('mouseup', stopTreeResize)
}

onMounted(() => {
  refreshAll()
  // Subscribe to plan completions to auto-refresh the tree
  if (window.electronAPI?.tasks?.onRunCompleted) {
    const unsub = window.electronAPI.tasks.onRunCompleted(() => {
      refreshAll()
    })
    onBeforeUnmount(() => {
      if (unsub) unsub()
    })
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', doTreeResize)
  document.removeEventListener('mouseup', stopTreeResize)
})
</script>

<style scoped>
.atv-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-main);
}

.atv-header {
  flex-shrink: 0;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  background: var(--bg-card);
}

.atv-header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
}

.atv-header-left svg {
  flex-shrink: 0;
  color: var(--text-primary);
}

.atv-title {
  margin: 0;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: var(--text-primary);
}

.atv-subtitle {
  margin: 0.25rem 0 0;
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
}

.atv-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  gap: 0;
}

.atv-tree-pane {
  width: var(--tree-width);
  flex-shrink: 0;
  overflow: hidden;
}

.atv-resize-handle {
  width: 6px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
}

.atv-resize-handle:hover {
  background: var(--text-muted);
}

.atv-detail-pane {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.atv-workflow-pane {
  width: 340px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.atv-workflow-show-btn {
  width: 2rem;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  border-top: none;
  border-right: none;
  border-bottom: none;
  background: var(--bg-card);
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
}

.atv-workflow-show-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
</style>
