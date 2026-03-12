<template>
  <Teleport to="body">
    <div v-if="visible" class="phm-backdrop">
      <div class="phm-modal">

        <!-- Header -->
        <div class="phm-header">
          <div class="phm-header-left">
            <div class="phm-header-icon">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <div class="phm-title">Execution History</div>
              <div class="phm-subtitle">{{ plan?.name }}</div>
            </div>
          </div>
          <button class="phm-close" @click="$emit('close')">
            <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body: run list | workflow canvas | output panel -->
        <div class="phm-body" ref="bodyRef">

          <!-- Left: run list (fixed 22%) -->
          <div class="phm-sidebar">
            <div class="phm-sidebar-header">
              <span class="phm-sidebar-title">Runs</span>
              <button class="phm-refresh-btn" @click="loadRuns" title="Refresh">
                <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-8.9"/></svg>
              </button>
            </div>

            <div v-if="loading" class="phm-empty">Loading…</div>
            <div v-else-if="mergedRuns.length === 0" class="phm-empty">No runs yet.</div>

            <div v-else class="phm-run-list" ref="runListRef">
              <div
                v-for="run in visibleRuns"
                :key="run.id"
                :class="['phm-run-item', selectedRunId === run.id && 'phm-run-item--active']"
                @click="selectRun(run.id)"
              >
                <div :class="['phm-run-dot', `phm-dot--${run.status}`]"></div>
                <div class="phm-run-info">
                  <div class="phm-run-date">{{ fmtDate(run.startedAt) }}</div>
                  <div class="phm-run-meta">
                    {{ run.triggeredBy }} · {{ run.status }}
                    <span v-if="fmtDuration(run.startedAt, run.completedAt)" class="phm-run-dur">{{ fmtDuration(run.startedAt, run.completedAt) }}</span>
                  </div>
                </div>
              </div>
              <!-- load-more sentinel -->
              <div v-if="visibleCount < mergedRuns.length" ref="loadMoreRef" class="phm-load-more">
                <span>{{ mergedRuns.length - visibleCount }} more…</span>
              </div>
            </div>
          </div>

          <!-- Center: workflow canvas -->
          <div class="phm-canvas" :style="{ width: canvasPct + '%' }">
            <div v-if="!selectedRunId" class="phm-canvas-empty">
              <svg style="width:32px;height:32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="11" x2="5" y2="16"/><line x1="12" y1="11" x2="19" y2="16"/></svg>
              <span>Select a run to see the workflow</span>
            </div>

            <template v-else-if="plan">
              <!-- canvas header -->
              <div class="phm-canvas-header">
                <!-- Row 1: timing + summary -->
                <div class="phm-canvas-row">
                  <span class="phm-canvas-label">Workflow</span>
                  <div class="phm-canvas-chips">
                    <span v-if="activeRun?.startedAt" class="phm-chip">
                      <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {{ fmtTs(activeRun.startedAt) }}
                    </span>
                    <span v-if="activeRun?.completedAt" class="phm-chip">
                      <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                      {{ fmtTs(activeRun.completedAt) }}
                    </span>
                    <span v-if="fmtDuration(activeRun?.startedAt, activeRun?.completedAt)" class="phm-chip phm-chip--dur">
                      {{ fmtDuration(activeRun.startedAt, activeRun.completedAt) }}
                    </span>
                    <span v-if="runSummary" :class="['phm-chip', `phm-chip--${activeRun?.status}`]">{{ runSummary }}</span>
                  </div>
                </div>
                <!-- Row 2: run metadata -->
                <div class="phm-canvas-row phm-canvas-row--meta">
                  <!-- Trigger type -->
                  <span class="phm-chip phm-chip--meta">
                    <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    {{ activeRun?.triggeredBy === 'schedule' ? 'Scheduled' : 'Manual' }}
                  </span>
                  <!-- Schedule type + detail -->
                  <template v-if="plan.schedule?.type === 'once' && plan.schedule?.runAt">
                    <span class="phm-chip phm-chip--meta">
                      <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      Once · {{ fmtTs(plan.schedule.runAt) }}
                    </span>
                  </template>
                  <template v-else-if="plan.schedule?.type === 'cron' && plan.schedule?.cron">
                    <span class="phm-chip phm-chip--meta">
                      <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Cron · {{ plan.schedule.cron }}
                    </span>
                    <span v-if="plan.schedule?.timezone" class="phm-chip phm-chip--meta">
                      <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      {{ plan.schedule.timezone }}
                    </span>
                  </template>
                  <template v-else-if="plan.schedule?.type === 'manual'">
                    <span class="phm-chip phm-chip--meta">
                      <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                      Manual only
                    </span>
                  </template>
                  <!-- Permission mode -->
                  <span class="phm-chip phm-chip--meta">
                    <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    {{ { all_permissions: 'All Permissions', chat_only: 'Chat Only', inherit: 'Inherit' }[plan.permissionMode] || plan.permissionMode || 'All Permissions' }}
                  </span>
                  <!-- Schedule enabled/disabled -->
                  <span v-if="plan.schedule?.type !== 'manual'" :class="['phm-chip', plan.schedule?.enabled ? 'phm-chip--enabled' : 'phm-chip--disabled']">
                    {{ plan.schedule?.enabled ? 'Enabled' : 'Disabled' }}
                  </span>
                </div>
              </div>

              <!-- workflow flow -->
              <div class="phm-flow">
                <div class="phm-terminus phm-terminus--start">
                  <div class="phm-terminus-dot"></div>
                  <span>START</span>
                </div>

                <template v-for="(wave, wi) in flowWaves" :key="wi">
                  <div class="phm-conn">
                    <div class="phm-conn-line"></div>
                    <svg class="phm-conn-arrow" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 1 5 5 9 1"/></svg>
                  </div>
                  <div class="phm-wave">
                    <div v-if="wave.length > 1" class="phm-parallel-badge">parallel ×{{ wave.length }}</div>
                    <div
                      v-for="node in wave"
                      :key="node.stepId"
                      :class="['phm-node', node.condClass, node.runClass, { 'phm-node--selected': selectedStepId === node.stepId }]"
                      @click="selectStep(node)"
                    >
                      <div v-if="node.runStatus" class="phm-node-run-row">
                        <span :class="['phm-run-badge', `phm-run-badge--${node.runStatus}`]">
                          <svg v-if="node.runStatus==='done'" style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                          <svg v-else-if="node.runStatus==='failed'" style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          <svg v-else style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          {{ node.runStatusLabel }}
                        </span>
                        <span v-if="node.runDuration" class="phm-node-dur">{{ node.runDuration }}</span>
                      </div>
                      <div class="phm-node-head">
                        <span class="phm-node-num">{{ node.stepIndex + 1 }}</span>
                        <span class="phm-node-task">{{ node.taskIcon }} {{ node.taskName }}</span>
                      </div>
                      <div v-if="node.runError" class="phm-node-error-preview">
                        <svg style="width:9px;height:9px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span>{{ node.runError.length > 80 ? node.runError.slice(0, 80) + '…' : node.runError }}</span>
                      </div>
                      <div v-if="node.conditionBadge" class="phm-node-cond-row">
                        <span :class="['phm-cond-badge', `phm-cond-badge--${node.runCondition}`]">{{ node.conditionBadge }}</span>
                      </div>
                      <div v-if="node.dependsOnLabels.length" class="phm-node-after">after: {{ node.dependsOnLabels.join(', ') }}</div>
                      <div class="phm-personas-line">
                        <span class="phm-personas-label">Persona:</span>
                        <span class="phm-personas-names">{{ node.personas.length ? node.personas.map(p=>p.name).join(', ') : '—' }}</span>
                      </div>
                    </div>
                  </div>
                </template>

                <div class="phm-conn">
                  <div class="phm-conn-line"></div>
                  <svg class="phm-conn-arrow" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 1 5 5 9 1"/></svg>
                </div>
                <div class="phm-terminus phm-terminus--end">
                  <div class="phm-terminus-dot phm-terminus-dot--end"></div>
                  <span>END</span>
                </div>
              </div>
            </template>
          </div>

          <!-- Resizable divider (only visible when a step is selected) -->
          <div
            v-if="selectedStep"
            class="phm-output-divider"
            @mousedown="onDividerMousedown"
            title="Drag to resize"
          >
            <div class="phm-output-divider-handle"></div>
          </div>

          <!-- Right: output panel (30% default, resizable) -->
          <div v-if="selectedStep" class="phm-output-panel" :style="{ width: outputPct + '%' }">
            <!-- Panel header -->
            <div class="phm-output-header">
              <div class="phm-output-title">
                <span class="phm-output-step-num">{{ selectedStep.stepIndex + 1 }}</span>
                <span class="phm-output-step-name">{{ selectedStep.taskIcon }} {{ selectedStep.taskName }}</span>
              </div>
              <div class="phm-output-header-right">
                <div v-if="selectedStep.runStatus" :class="['phm-output-status', `phm-output-status--${selectedStep.runStatus}`]">
                  <svg v-if="selectedStep.runStatus==='done'" style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else-if="selectedStep.runStatus==='failed'" style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  <svg v-else style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {{ selectedStep.runStatusLabel }}
                </div>
                <button class="phm-output-close" @click="selectedStepId = null" title="Close panel">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <!-- Meta row: timestamps + duration -->
            <div class="phm-output-meta">
              <span v-if="selectedStep.runStartedAt" class="phm-output-meta-chip">
                <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {{ fmtTs(selectedStep.runStartedAt) }}
              </span>
              <span v-if="selectedStep.runCompletedAt" class="phm-output-meta-chip">
                <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                {{ fmtTs(selectedStep.runCompletedAt) }}
              </span>
              <span v-if="selectedStep.runDuration" class="phm-output-meta-chip phm-output-meta-chip--dur">
                {{ selectedStep.runDuration }}
              </span>
              <span v-if="selectedStep.runResults && selectedStep.runResults.length > 1" class="phm-output-meta-chip">
                {{ selectedStep.runResults.length }} personas
              </span>
            </div>

            <!-- Output scrollable area -->
            <div class="phm-output-scroll">
              <template v-if="selectedStep.runResults && selectedStep.runResults.length > 0">
                <template v-for="(res, ri) in selectedStep.runResults" :key="ri">
                  <!-- Persona header (only if more than one result) -->
                  <div v-if="selectedStep.runResults.length > 1" class="phm-output-persona-row">
                    <span class="phm-output-persona-chip">
                      <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      {{ res.personaName || '(unknown)' }}
                    </span>
                    <span :class="['phm-output-res-badge', `phm-run-badge--${res.status}`]">{{ res.status }}</span>
                    <span v-if="fmtDuration(res.startedAt, res.completedAt)" class="phm-output-res-dur">{{ fmtDuration(res.startedAt, res.completedAt) }}</span>
                  </div>
                  <template v-if="res.output">
                    <div class="phm-output-section-label">{{ selectedStep.runResults.length > 1 ? 'Output' : 'Output' }}</div>
                    <pre class="phm-output-pre">{{ res.output }}</pre>
                  </template>
                  <template v-if="res.error">
                    <div class="phm-output-section-label phm-output-section-label--err">Error</div>
                    <pre class="phm-output-pre phm-output-pre--err">{{ res.error }}</pre>
                  </template>
                  <template v-if="!res.output && !res.error">
                    <div class="phm-output-empty phm-output-empty--inline">
                      <span>No output.</span>
                    </div>
                  </template>
                </template>
              </template>
              <div v-else class="phm-output-empty">
                <svg style="width:24px;height:24px;opacity:0.25;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>No output yet.</span>
              </div>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="phm-footer">
          <span class="phm-footer-count">{{ mergedRuns.length }} run{{ mergedRuns.length !== 1 ? 's' : '' }}</span>
          <button class="phm-close-btn" @click="$emit('close')">Close</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useTasksStore } from '../../stores/tasks'
import { usePersonasStore } from '../../stores/personas'

const props = defineProps({
  visible:      { type: Boolean, default: false },
  plan:         { type: Object, default: null },
  initialRunId: { type: String, default: null },
})
const emit = defineEmits(['close'])

const tasksStore    = useTasksStore()
const personasStore = usePersonasStore()

const runs          = ref([])
const loading       = ref(false)
const selectedRunId = ref(null)
const activeRun     = ref(null)
const selectedStepId = ref(null)

const PAGE_SIZE   = 10
const visibleCount = ref(PAGE_SIZE)
const runListRef   = ref(null)
const loadMoreRef  = ref(null)
let _loadMoreObserver = null

const visibleRuns = computed(() => mergedRuns.value.slice(0, visibleCount.value))

// ── Resizable output panel ─────────────────────────────────────────────────────
const bodyRef   = ref(null)
const outputPct = ref(30)   // default 30%
const MIN_OUTPUT_PCT = 15
const MAX_OUTPUT_PCT = 60
// canvas gets whatever is left after sidebar (22%) and output panel
const canvasPct = computed(() => selectedStep.value ? (100 - 22 - outputPct.value) : (100 - 22))

function onDividerMousedown(e) {
  e.preventDefault()
  const body = bodyRef.value
  if (!body) return
  const bodyRect = body.getBoundingClientRect()
  const bodyW    = bodyRect.width

  function onMousemove(ev) {
    // Distance from right edge gives output panel width
    const fromRight = bodyRect.right - ev.clientX
    const pct = Math.min(MAX_OUTPUT_PCT, Math.max(MIN_OUTPUT_PCT, (fromRight / bodyW) * 100))
    outputPct.value = Math.round(pct * 10) / 10
  }
  function onMouseup() {
    document.removeEventListener('mousemove', onMousemove)
    document.removeEventListener('mouseup', onMouseup)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMousemove)
  document.addEventListener('mouseup', onMouseup)
}

// ── Derived: always fresh from flowWaves ──────────────────────────────────────
const selectedStep = computed(() => {
  if (!selectedStepId.value) return null
  for (const wave of flowWaves.value) {
    const n = wave.find(n => n.stepId === selectedStepId.value)
    if (n) return n
  }
  return null
})

const liveRunEntry = computed(() => {
  const ar = tasksStore.activeRun
  if (!ar || ar.planId !== props.plan?.id) return null
  return {
    id: ar.id || 'live',
    planId: ar.planId,
    status: ar.status || 'running',
    triggeredBy: ar.triggeredBy || 'manual',
    startedAt: ar.startedAt,
    completedAt: ar.completedAt || null,
  }
})

const mergedRuns = computed(() => {
  if (!liveRunEntry.value) return runs.value
  const exists = runs.value.some(r => r.id === liveRunEntry.value.id)
  if (exists) return runs.value
  return [liveRunEntry.value, ...runs.value]
})

watch(() => props.visible, async v => {
  if (v) { await loadRuns() }
  else   { reset() }
})

watch(() => props.plan, () => { if (props.visible) loadRuns() })

watch(() => tasksStore.activeRun, async (ar, prevAr) => {
  if (!ar) {
    // Run just completed — reload from disk to get final stepResults with completed statuses
    if ((selectedRunId.value === 'live' || selectedRunId.value === prevAr?.runId) && prevAr?.runId && props.visible) {
      await loadRuns()
      // Re-select the now-completed run to refresh activeRun from disk
      const completedRunId = prevAr.runId
      const step = selectedStepId.value
      await selectRun(completedRunId)
      // Restore the selected step so output panel stays visible
      if (step) await nextTick().then(() => { selectedStepId.value = step })
    }
    return
  }
  if (selectedRunId.value === (ar.id || 'live') || selectedRunId.value === 'live') {
    activeRun.value = ar
  }
  if (ar.planId === props.plan?.id && props.visible && !selectedRunId.value) {
    selectRun(ar.id || 'live')
  }
}, { deep: true })

function reset() {
  runs.value = []
  selectedRunId.value = null
  activeRun.value = null
  selectedStepId.value = null
  visibleCount.value = PAGE_SIZE
}

async function loadRuns() {
  if (!props.plan?.id) return
  loading.value = true
  try {
    runs.value = await window.electronAPI.tasks.getRuns({ planId: props.plan.id }) || []
    visibleCount.value = PAGE_SIZE
    if (!selectedRunId.value) {
      // initialRunId from dashboard click — pre-select that run
      if (props.initialRunId && runs.value.some(r => r.id === props.initialRunId)) {
        await selectRun(props.initialRunId)
      } else if (tasksStore.activeRun?.planId === props.plan.id) {
        selectedRunId.value = tasksStore.activeRun.id || 'live'
        activeRun.value = tasksStore.activeRun
      } else if (runs.value.length > 0) {
        await selectRun(runs.value[0].id)
      }
    } else {
      // Refresh currently selected run if it's still running (scheduled)
      if (selectedRunId.value && selectedRunId.value !== 'live' && !tasksStore.activeRun) {
        const cur = runs.value.find(r => r.id === selectedRunId.value)
        if (cur?.status === 'running') {
          const step = selectedStepId.value
          try { activeRun.value = await tasksStore.getRunDetail(selectedRunId.value) } catch {}
          if (step) await nextTick().then(() => { selectedStepId.value = step })
        }
      }
    }
  } catch {
    runs.value = []
  } finally {
    loading.value = false
  }
}

async function selectRun(runId) {
  selectedRunId.value = runId
  selectedStepId.value = null
  activeRun.value = null
  const liveId = tasksStore.activeRun?.id || (tasksStore.isRunning ? 'live' : null)
  if (runId === liveId || runId === 'live') {
    activeRun.value = tasksStore.activeRun
  } else {
    try {
      activeRun.value = await tasksStore.getRunDetail(runId)
    } catch {
      activeRun.value = null
    }
  }
  // Auto-select first step so the output panel shows by default
  await nextTick()
  const waves = flowWaves.value
  if (waves.length > 0 && waves[0].length > 0) {
    selectedStepId.value = waves[0][0].stepId
  }
}

function selectStep(node) {
  selectedStepId.value = selectedStepId.value === node.stepId ? null : node.stepId
}

// ── Flow wave builder ─────────────────────────────────────────────────────────

const flowWaves = computed(() => {
  if (!props.plan?.steps) return []
  const steps = props.plan.steps
  const idSet = new Set(steps.map(s => s.id))
  const resolved = new Set()
  const remaining = [...steps]
  const waves = []
  while (remaining.length > 0) {
    const wave = remaining.filter(s => (s.dependsOn || []).filter(d => idSet.has(d)).every(d => resolved.has(d)))
    if (wave.length === 0) { waves.push(remaining.map(s => buildNode(s, steps))); break }
    waves.push(wave.map(s => buildNode(s, steps)))
    wave.forEach(s => { resolved.add(s.id); remaining.splice(remaining.indexOf(s), 1) })
  }
  return waves
})

function buildNode(step, allSteps) {
  const task = tasksStore.tasks.find(t => t.id === step.taskId)
  const personas = (step.defaultPersonaIds || []).map(pid => {
    const p = personasStore.getPersonaById(pid)
    return { name: p?.name || '(unknown)' }
  })
  const hasDeps = (step.dependsOn || []).length > 0
  const cond = step.runCondition || 'always'
  const stepIndex = allSteps.indexOf(step)

  // Collect ALL results for this step (one per persona)
  const allResults = (activeRun.value?.stepResults || []).filter(r => r.stepIndex === stepIndex)
  // Aggregate status: failed > running > done > skipped > null
  const statusPriority = { failed: 4, running: 3, done: 2, skipped: 1 }
  const runStatus = allResults.reduce((best, r) => {
    const p = statusPriority[r.status] || 0
    return p > (statusPriority[best] || 0) ? r.status : best
  }, null)

  const statusLabels = { done: 'Done', failed: 'Failed', skipped: 'Skipped', running: 'Running' }
  const runClass = runStatus === 'done'    ? 'phm-node--run-done'
                 : runStatus === 'failed'  ? 'phm-node--run-failed'
                 : runStatus === 'skipped' ? 'phm-node--run-skipped'
                 : runStatus === 'running' ? 'phm-node--run-running'
                 : ''

  // Duration: earliest start → latest end across all results
  const starts = allResults.map(r => r.startedAt).filter(Boolean)
  const ends   = allResults.map(r => r.completedAt).filter(Boolean)
  const runStartedAt   = starts.length ? starts.reduce((a, b) => a < b ? a : b) : null
  const runCompletedAt = ends.length   ? ends.reduce((a, b) => a > b ? a : b)   : null

  return {
    stepId: step.id, stepIndex,
    taskName:  task?.name || (step.taskId ? '(unknown)' : 'No task'),
    taskIcon:  task?.icon || '✍️',
    personas, runCondition: cond,
    conditionBadge: hasDeps && cond !== 'always' ? (cond === 'on_success' ? 'on success' : 'on failure') : null,
    condClass: hasDeps ? (cond === 'on_success' ? 'phm-node--cond-success' : cond === 'on_failure' ? 'phm-node--cond-failure' : '') : '',
    dependsOnLabels: (step.dependsOn || []).map(id => { const di = allSteps.findIndex(s => s.id === id); return di === -1 ? '?' : `Step ${di + 1}` }),
    runStatus, runStatusLabel: runStatus ? (statusLabels[runStatus] || runStatus) : null, runClass,
    // All per-persona results for the output panel
    runResults: allResults,
    // Legacy single-result fields (first non-empty result) for backward compat
    runOutput: allResults.find(r => r.output)?.output || null,
    runError:  allResults.find(r => r.error)?.error   || null,
    runPersonaName: allResults[0]?.personaName || null,
    runStartedAt, runCompletedAt,
    runDuration: fmtDuration(runStartedAt, runCompletedAt),
  }
}

const runSummary = computed(() => {
  const r = activeRun.value?.stepResults
  if (!r) return null
  // Count unique step indices (not individual persona results)
  const stepPriority = { failed: 4, running: 3, done: 2, skipped: 1 }
  const byStep = {}
  for (const x of r) {
    const p = stepPriority[x.status] || 0
    if (!(x.stepIndex in byStep) || p > (stepPriority[byStep[x.stepIndex]] || 0)) {
      byStep[x.stepIndex] = x.status
    }
  }
  const statuses = Object.values(byStep)
  const done   = statuses.filter(s => s === 'done').length
  const failed = statuses.filter(s => s === 'failed').length
  const parts = []
  if (done)   parts.push(`${done} done`)
  if (failed) parts.push(`${failed} failed`)
  return parts.join(', ') || null
})

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtTs(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return null
  const ms = new Date(endIso) - new Date(startIso)
  if (ms < 0) return null
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), rs = s % 60
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`
  const h = Math.floor(m / 60), rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (selectedStepId.value) { selectedStepId.value = null; return }
    emit('close')
  }
}
// Watch for the load-more sentinel element and observe it
watch(loadMoreRef, (el) => {
  if (_loadMoreObserver) { _loadMoreObserver.disconnect(); _loadMoreObserver = null }
  if (!el) return
  _loadMoreObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, mergedRuns.value.length)
    }
  }, { threshold: 0.1 })
  _loadMoreObserver.observe(el)
})

// ── Live updates for scheduled runs ──────────────────────────────────────────
let _unsubRunUpdated = null

function _subscribeRunUpdated() {
  if (_unsubRunUpdated || !window.electronAPI?.tasks?.onRunUpdated) return
  _unsubRunUpdated = window.electronAPI.tasks.onRunUpdated(async ({ runId }) => {
    if (!props.visible || !selectedRunId.value) return
    // If we're viewing the run that just had a step finish, reload it
    if (selectedRunId.value === runId) {
      const step = selectedStepId.value
      try {
        activeRun.value = await tasksStore.getRunDetail(runId)
      } catch {}
      // Also refresh the sidebar run list to pick up status change
      await loadRuns()
      // Restore step selection
      if (step) await nextTick().then(() => { selectedStepId.value = step })
    }
  })
}

function _unsubscribeRunUpdated() {
  if (_unsubRunUpdated) { _unsubRunUpdated(); _unsubRunUpdated = null }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  _subscribeRunUpdated()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (_loadMoreObserver) { _loadMoreObserver.disconnect(); _loadMoreObserver = null }
  _unsubscribeRunUpdated()
})
</script>

<style>
/* ── Backdrop ─────────────────────────────────────────────────────────────── */
.phm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.phm-modal {
  background: #0A0A0A;
  border: 1px solid #222;
  border-radius: 1rem;
  width: 92vw;
  max-width: 86rem;
  height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 32px 80px rgba(0,0,0,0.7);
  animation: phmIn 0.2s ease-out;
  overflow: hidden;
}
@keyframes phmIn {
  from { opacity:0; transform: scale(0.95) translateY(10px); }
  to   { opacity:1; transform: scale(1) translateY(0); }
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.phm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid #1A1A1A;
  flex-shrink: 0;
}
.phm-header-left { display: flex; align-items: center; gap: 0.75rem; }
.phm-header-icon {
  width: 2rem; height: 2rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.5rem; color: #FFF; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.phm-title  { font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:700; color:#FFFFFF; }
.phm-subtitle { font-family:'Inter',sans-serif; font-size:var(--fs-small); color:#4B5563; margin-top:0.1rem; }
.phm-close {
  width:1.75rem; height:1.75rem;
  display:flex; align-items:center; justify-content:center;
  background:rgba(255,255,255,0.06); border:none; border-radius:0.375rem;
  color:rgba(255,255,255,0.4); cursor:pointer; transition:all 0.15s ease;
}
.phm-close:hover { background:rgba(255,255,255,0.12); color:#FFF; }

/* ── Body ────────────────────────────────────────────────────────────────── */
.phm-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

/* ── Sidebar (22%) ───────────────────────────────────────────────────────── */
.phm-sidebar {
  width: 22%;
  min-width: 13rem;
  max-width: 20rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #1A1A1A;
  overflow: hidden;
}
.phm-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #141414;
  flex-shrink: 0;
}
.phm-sidebar-title { font-family:'Inter',sans-serif; font-size:var(--fs-secondary); font-weight:700; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:0.06em; }
.phm-refresh-btn {
  width:1.5rem; height:1.5rem;
  display:flex; align-items:center; justify-content:center;
  background:rgba(255,255,255,0.05); border:1px solid #2A2A2A;
  border-radius:0.375rem; color:#6B7280; cursor:pointer; transition:all 0.15s ease;
}
.phm-refresh-btn:hover { background:rgba(255,255,255,0.1); color:#FFF; }

.phm-empty {
  flex:1; display:flex; align-items:center; justify-content:center;
  font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#4B5563;
}

.phm-run-list { flex:1; overflow-y:auto; scrollbar-width:thin; scrollbar-color:#1E1E1E transparent; }

.phm-run-item {
  display:flex; align-items:center; gap:0.625rem;
  padding:0.75rem 1rem;
  border-bottom:1px solid #111;
  cursor:pointer;
  transition:background 0.1s ease;
  position:relative;
}
.phm-run-item:hover { background:rgba(255,255,255,0.03); }
.phm-run-item--active { background:rgba(255,255,255,0.05); border-left:2px solid #60A5FA; }

.phm-run-dot { width:0.5rem; height:0.5rem; border-radius:50%; flex-shrink:0; }
.phm-dot--completed { background:#10B981; }
.phm-dot--error     { background:#EF4444; }
.phm-dot--running   { background:#F59E0B; animation: phmPulse 1s ease-in-out infinite; }
@keyframes phmPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.phm-run-info { flex:1; min-width:0; }
.phm-run-date { font-family:'Inter',sans-serif; font-size:var(--fs-secondary); font-weight:600; color:#D1D5DB; }
.phm-run-meta { font-family:'Inter',sans-serif; font-size:var(--fs-small); color:#6B7280; display:flex; align-items:center; gap:0.3rem; flex-wrap:wrap; margin-top:0.125rem; }
.phm-run-dur {
  padding:0 0.3rem;
  background:rgba(96,165,250,0.1); color:#60A5FA;
  border-radius:9999px; font-size:0.625rem; font-weight:700;
}
.phm-load-more {
  padding:0.625rem 1rem; text-align:center;
  font-family:'Inter',sans-serif; font-size:var(--fs-small); color:#4B5563;
  border-top:1px solid #111;
}

/* ── Canvas (fluid) ──────────────────────────────────────────────────────── */
.phm-canvas {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.05s ease;
  min-width: 0;
  border-right: 1px solid #1A1A1A;
}

.phm-canvas-empty {
  flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:0.75rem; color:#3A3A3A;
  font-family:'Inter',sans-serif; font-size:var(--fs-secondary);
}

.phm-canvas-header {
  display:flex; flex-direction:column; gap:0.375rem;
  padding:0.625rem 1.25rem;
  border-bottom:1px solid #141414;
  flex-shrink:0;
  background:#080808;
}
.phm-canvas-row { display:flex; align-items:center; gap:0.625rem; flex-wrap:wrap; }
.phm-canvas-row--meta { padding-top:0.125rem; border-top:1px solid rgba(255,255,255,0.04); }
.phm-canvas-label { font-family:'Inter',sans-serif; font-size:var(--fs-small); font-weight:700; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.06em; }
.phm-canvas-chips { display:flex; align-items:center; gap:0.375rem; flex-wrap:wrap; }
.phm-chip {
  display:inline-flex; align-items:center; gap:0.25rem;
  padding:0.1875rem 0.5rem;
  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07);
  border-radius:9999px;
  font-family:'JetBrains Mono',monospace; font-size:0.625rem; color:#4B5563;
}
.phm-chip--dur      { background:rgba(96,165,250,0.08);  border-color:rgba(96,165,250,0.15);  color:#60A5FA; font-weight:700; }
.phm-chip--completed{ background:rgba(16,185,129,0.08);  border-color:rgba(16,185,129,0.2);   color:#34D399; }
.phm-chip--error    { background:rgba(239,68,68,0.08);   border-color:rgba(239,68,68,0.2);    color:#F87171; }
.phm-chip--meta     { color:rgba(255,255,255,0.4); font-family:'Inter',sans-serif; }
.phm-chip--enabled  { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.08); color:rgba(255,255,255,0.35); }
.phm-chip--disabled { background:rgba(239,68,68,0.06);  border-color:rgba(239,68,68,0.12);   color:rgba(239,68,68,0.6); }

/* ── Flow ────────────────────────────────────────────────────────────────── */
.phm-flow {
  flex:1;
  display:flex; flex-direction:column; align-items:center;
  overflow-x:hidden; overflow-y:auto;
  padding:1.5rem 2rem; gap:0;
  scrollbar-width:thin; scrollbar-color:#1E1E1E transparent;
}

/* ── Connectors ──────────────────────────────────────────────────────────── */
.phm-conn { display:flex; flex-direction:column; align-items:center; flex-shrink:0; }
.phm-conn-line { width:1px; height:1.5rem; background:#2A2A2A; }
.phm-conn-arrow { color:#444; width:0.625rem; height:0.375rem; flex-shrink:0; display:block; }

/* ── Terminus ────────────────────────────────────────────────────────────── */
.phm-terminus {
  display:flex; flex-direction:column; align-items:center; gap:0.375rem; flex-shrink:0;
  font-family:'Inter',sans-serif; font-size:var(--fs-small); font-weight:700; letter-spacing:0.1em; color:rgba(255,255,255,0.5);
}
.phm-terminus--start { }
.phm-terminus--end   { }
.phm-terminus-dot {
  width:1.875rem; height:1.875rem; border-radius:50%;
  background:#3B82F6; border:2px solid #60A5FA;
  box-shadow:0 0 10px rgba(59,130,246,0.4); flex-shrink:0;
}
.phm-terminus-dot--end { background:#10B981; border-color:#34D399; box-shadow:0 0 10px rgba(16,185,129,0.35); }

/* ── Wave row ────────────────────────────────────────────────────────────── */
.phm-wave {
  display:flex; flex-direction:row; flex-wrap:wrap;
  justify-content:center; gap:0.75rem;
  flex-shrink:0; width:100%;
}
.phm-parallel-badge {
  width:100%; text-align:center; margin-bottom:0.25rem;
  font-family:'Inter',sans-serif; font-size:0.625rem; font-weight:700;
  background:rgba(96,165,250,0.12); color:#60A5FA;
  border-radius:9999px; padding:0.0625rem 0; letter-spacing:0;
}

/* ── Step node ───────────────────────────────────────────────────────────── */
.phm-node {
  background:#161616; border:1px solid #2A2A2A; border-radius:0.75rem;
  padding:0.75rem; display:flex; flex-direction:column; gap:0.375rem;
  flex-shrink:0; width:15rem; min-width:12rem; max-width:16rem;
  cursor:pointer; transition:border-color 0.15s ease, box-shadow 0.15s ease;
  position:relative;
}
.phm-node:hover { border-color:#3A3A3A; box-shadow:0 4px 16px rgba(0,0,0,0.4); }
.phm-node--selected { border-color:#60A5FA !important; box-shadow:0 0 0 1px rgba(96,165,250,0.2) !important; }
.phm-node--cond-success { border-color:rgba(52,211,153,0.25); background:rgba(52,211,153,0.04); }
.phm-node--cond-failure { border-color:rgba(248,113,113,0.25); background:rgba(248,113,113,0.04); }
.phm-node--run-done    { border-color:rgba(52,211,153,0.5) !important; background:rgba(16,185,129,0.08) !important; }
.phm-node--run-failed  { border-color:rgba(248,113,113,0.5) !important; background:rgba(239,68,68,0.08) !important; }
.phm-node--run-skipped { border-color:rgba(107,114,128,0.4) !important; background:rgba(55,65,81,0.06) !important; opacity:0.7; }
.phm-node--run-running { border-color:rgba(251,191,36,0.5) !important; background:rgba(245,158,11,0.08) !important; }

.phm-node-run-row { display:flex; align-items:center; justify-content:space-between; gap:0.375rem; }
.phm-node-dur { font-family:'JetBrains Mono',monospace; font-size:0.5rem; font-weight:700; color:rgba(96,165,250,0.75); flex-shrink:0; }
.phm-node-cond-row { display:flex; align-items:center; justify-content:flex-start; }

.phm-run-badge {
  display:inline-flex; align-items:center; gap:0.2rem;
  padding:0.1rem 0.35rem; border-radius:9999px;
  font-family:'Inter',sans-serif; font-size:0.5rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;
}
.phm-run-badge--done    { background:rgba(16,185,129,0.15); color:#34D399; }
.phm-run-badge--failed  { background:rgba(239,68,68,0.15);  color:#F87171; }
.phm-run-badge--skipped { background:rgba(107,114,128,0.15);color:#9CA3AF; }
.phm-run-badge--running { background:rgba(245,158,11,0.15);  color:#FBBF24; }

.phm-node-head { display:flex; align-items:center; justify-content:center; gap:0.375rem; flex-wrap:wrap; }
.phm-node-num {
  width:1.125rem; height:1.125rem;
  display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg,#1A1A1A,#374151);
  border-radius:50%; font-family:'Inter',sans-serif; font-size:0.5625rem; font-weight:700; color:#FFF; flex-shrink:0;
}
.phm-node-task { font-family:'Inter',sans-serif; font-size:var(--fs-secondary); font-weight:700; color:#E5E7EB; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.phm-cond-badge { font-family:'Inter',sans-serif; font-size:0.625rem; font-weight:600; padding:0.0625rem 0.375rem; border-radius:9999px; flex-shrink:0; }
.phm-cond-badge--on_success { background:rgba(52,211,153,0.12); color:#34D399; }
.phm-cond-badge--on_failure { background:rgba(248,113,113,0.12); color:#F87171; }
.phm-node-after { font-family:'JetBrains Mono',monospace; font-size:0.625rem; color:rgba(255,255,255,0.4); text-align:center; }
.phm-node-error-preview {
  display:flex; align-items:flex-start; gap:0.3rem;
  background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:0.375rem;
  padding:0.3rem 0.5rem; color:#F87171; font-family:'Inter',sans-serif; font-size:0.625rem; line-height:1.4;
}
.phm-personas-line { display:flex; align-items:baseline; justify-content:center; gap:0.3rem; padding-top:0.3rem; border-top:1px solid #1E1E1E; min-width:0; }
.phm-personas-label { font-family:'Inter',sans-serif; font-size:0.625rem; font-weight:700; color:rgba(255,255,255,0.3); text-transform:uppercase; letter-spacing:0.05em; flex-shrink:0; }
.phm-personas-names { font-family:'Inter',sans-serif; font-size:var(--fs-small); font-weight:600; color:#E5E7EB; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ── Resizable divider ───────────────────────────────────────────────────── */
.phm-output-divider {
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background: #141414;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  position: relative;
}
.phm-output-divider:hover,
.phm-output-divider:active {
  background: #374151;
}
.phm-output-divider-handle {
  width: 3px;
  height: 2rem;
  background: rgba(255,255,255,0.12);
  border-radius: 9999px;
  transition: background 0.15s ease;
}
.phm-output-divider:hover .phm-output-divider-handle,
.phm-output-divider:active .phm-output-divider-handle {
  background: rgba(255,255,255,0.35);
}

/* ── Output panel (right, resizable) ─────────────────────────────────────── */
.phm-output-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0D0D0D;
  min-width: 12rem;
  animation: phmOutputIn 0.15s ease-out;
}
@keyframes phmOutputIn {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}

.phm-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid #1A1A1A;
  flex-shrink: 0;
  gap: 0.5rem;
}
.phm-output-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  overflow: hidden;
}
.phm-output-step-num {
  width: 1.25rem; height: 1.25rem;
  display: inline-flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg,#1A1A1A,#374151);
  border-radius: 50%;
  font-family: 'Inter', sans-serif; font-size: 0.5625rem; font-weight: 700; color: #FFF;
  flex-shrink: 0;
}
.phm-output-step-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 700;
  color: #E5E7EB;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.phm-output-header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.phm-output-status {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-size: 0.5625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.phm-output-status--done    { background: rgba(16,185,129,0.15);  color: #34D399; }
.phm-output-status--failed  { background: rgba(239,68,68,0.15);   color: #F87171; }
.phm-output-status--skipped { background: rgba(107,114,128,0.15); color: #9CA3AF; }
.phm-output-status--running { background: rgba(245,158,11,0.15);  color: #FBBF24; }
.phm-output-close {
  width: 1.5rem; height: 1.5rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.06); border: none; border-radius: 0.25rem;
  color: rgba(255,255,255,0.4); cursor: pointer; transition: all 0.15s ease;
  flex-shrink: 0;
}
.phm-output-close:hover { background: rgba(255,255,255,0.12); color: #FFF; }

.phm-output-meta {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.875rem;
  border-bottom: 1px solid #141414;
  flex-shrink: 0;
  background: rgba(255,255,255,0.015);
}
.phm-output-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem 0.5rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 9999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem;
  color: #6B7280;
}
.phm-output-meta-chip--persona {
  background: rgba(96,165,250,0.08);
  border-color: rgba(96,165,250,0.15);
  color: #93C5FD;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
}
.phm-output-meta-chip--dur {
  background: rgba(96,165,250,0.08);
  border-color: rgba(96,165,250,0.15);
  color: #60A5FA;
  font-weight: 700;
}

.phm-output-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  scrollbar-width: thin;
  scrollbar-color: #2A2A2A transparent;
}

.phm-output-section-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 700;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}
.phm-output-section-label--err { color: rgba(248,113,113,0.65); }

.phm-output-pre {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  color: #D1D5DB;
  background: #111;
  border: 1px solid #1E1E1E;
  border-radius: 0.5rem;
  padding: 0.75rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  scrollbar-width: thin;
  scrollbar-color: #2A2A2A transparent;
  flex-shrink: 0;
}
.phm-output-pre--err {
  color: #FCA5A5;
  background: rgba(239,68,68,0.05);
  border-color: rgba(239,68,68,0.15);
}

.phm-output-persona-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.375rem 0;
  border-top: 1px solid #1A1A1A;
  margin-top: 0.25rem;
}
.phm-output-persona-row:first-child { border-top: none; margin-top: 0; }
.phm-output-persona-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem 0.5rem;
  background: rgba(96,165,250,0.08);
  border: 1px solid rgba(96,165,250,0.15);
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-size: 0.6rem;
  font-weight: 600;
  color: #93C5FD;
}
.phm-output-res-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.35rem;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-size: 0.5rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.phm-output-res-dur {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.5rem;
  font-weight: 700;
  color: rgba(96,165,250,0.75);
}
.phm-output-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  color: #3A3A3A;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
}
.phm-output-empty--inline {
  flex: unset;
  padding: 0.5rem 0;
  color: #3A3A3A;
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
.phm-footer {
  display:flex; align-items:center; justify-content:space-between;
  padding:0.75rem 1.25rem;
  border-top:1px solid #141414; background:#070707; flex-shrink:0;
}
.phm-footer-count { font-family:'JetBrains Mono',monospace; font-size:var(--fs-small); color:#4B5563; }
.phm-close-btn {
  padding:0.4375rem 1.25rem;
  background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.1); border-radius:0.5rem;
  font-family:'Inter',sans-serif; font-size:var(--fs-secondary); font-weight:600; color:rgba(255,255,255,0.65);
  cursor:pointer; transition:all 0.15s ease;
}
.phm-close-btn:hover { background:rgba(255,255,255,0.12); color:#FFF; }
</style>
