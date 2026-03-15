<template>
  <div class="ated-panel">
    <div v-if="!selectedItem" class="ated-empty">
      <svg style="width:3rem;height:3rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <p>{{ t('tasks.selectAnExecution') }}</p>
    </div>

    <div v-else class="ated-content">
      <!-- History strip -->
      <div class="ated-history">
        <div class="ated-history-label">{{ t('tasks.executionHistory') }}</div>
        <div v-if="runs.length === 0" class="ated-history-empty">{{ t('tasks.noRunsYet') }}</div>
        <div v-else class="ated-history-scroll">
          <div
            v-for="r in runs"
            :key="r.id"
            class="ated-history-chip"
            :class="{ active: selectedRunId === r.id }"
            @click="selectRun(r.id)"
          >
            <span :class="['ated-history-dot', `ated-dot-${r.status}`]"></span>
            <span class="ated-history-time">{{ formatTime(r.startedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Detail area -->
      <div v-if="loadingDetail" class="ated-loading">
        <div class="spinner"></div>
        <p>{{ t('tasks.loadingExecutionDetails') }}</p>
      </div>

      <div v-else-if="runDetail" class="ated-detail">
        <AiTaskSummaryCard
          :run="selectedRun"
          :run-detail="runDetail"
        />

        <div
          v-for="(group, idx) in taskGroups"
          :key="group.taskId || idx"
          :data-step-index="group.results[0]?.stepIndex ?? idx"
        >
          <AiTaskTaskBlock
            :task-name="group.taskName"
            :task-status="group.status"
            :step-results="group.results"
            :all-agents="allAgents"
          />
        </div>
      </div>

      <div v-else-if="selectedRunId" class="ated-empty">
        <p>{{ t('tasks.noDetailAvailable') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import AiTaskSummaryCard from './AiTaskSummaryCard.vue'
import AiTaskTaskBlock from './AiTaskTaskBlock.vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  selectedItem:   { type: Object, default: null },
  plan:           { type: Object, default: null },
  runs:           { type: Array, default: () => [] },
  allAgents:      { type: Array, default: () => [] },
  allTasks:       { type: Array, default: () => [] },
  scrollToStepId: { type: Number, default: null },
})
const emit = defineEmits(['run-detail-loaded'])

const selectedRunId = ref(null)
const runDetail     = ref(null)
const loadingDetail = ref(false)

const selectedRun = computed(() => props.runs.find(r => r.id === selectedRunId.value) || null)

const taskGroups = computed(() => {
  if (!runDetail.value?.stepResults) return []
  const groups = []
  const seen = new Set()
  for (const result of runDetail.value.stepResults) {
    if (seen.has(result.taskId)) {
      groups.find(g => g.taskId === result.taskId)?.results.push(result)
    } else {
      groups.push({ taskId: result.taskId, taskName: result.taskName, status: result.status, results: [result] })
      seen.add(result.taskId)
    }
  }
  return groups
})

async function selectRun(runId) {
  selectedRunId.value = runId
  runDetail.value = null
  loadingDetail.value = true
  try {
    runDetail.value = await window.electronAPI.tasks.getRun(runId)
    emit('run-detail-loaded', runDetail.value)
  } catch (err) {
    console.error('[AiTaskExecutionDetail] getRun error:', err)
  } finally {
    loadingDetail.value = false
  }
}

watch(() => props.scrollToStepId, (stepIdx) => {
  if (stepIdx === null || stepIdx === undefined) return
  nextTick(() => {
    const el = document.querySelector(`[data-step-index="${stepIdx}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Auto-select first run when runs load or item changes
watch(
  () => [props.runs, props.selectedItem],
  ([newRuns]) => {
    if (newRuns?.length > 0) {
      selectRun(newRuns[0].id)
    } else {
      selectedRunId.value = null
      runDetail.value = null
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.ated-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.ated-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  gap: 0.5rem;
}

.ated-empty svg { opacity: 0.5; }
.ated-empty p { font-size: var(--fs-secondary); }

.ated-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.ated-history {
  flex-shrink: 0;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.ated-history-label {
  font-weight: 600;
  font-size: var(--fs-secondary);
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.ated-history-empty {
  font-size: var(--fs-caption);
  color: var(--text-muted);
}

.ated-history-scroll {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.ated-history-chip {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-main);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--fs-caption);
  white-space: nowrap;
  transition: all 0.15s ease;
}

.ated-history-chip:hover { background: var(--bg-hover); }

.ated-history-chip.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  border-color: #374151;
}

.ated-history-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.ated-dot-completed { background: #10B981; }
.ated-dot-error     { background: #EF4444; }
.ated-dot-running   { background: #3B82F6; animation: pulse 1s ease-in-out infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}

.ated-history-time { font-size: inherit; }

.ated-detail {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ated-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1rem;
  color: var(--text-secondary);
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid var(--border);
  border-top-color: var(--text-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>
