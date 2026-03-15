<template>
  <Teleport to="body">
    <div v-if="visible" class="wf-backdrop" @keydown.escape="$emit('close')">
      <div class="wf-modal" tabindex="-1">

        <!-- Header -->
        <div class="wf-header">
          <div class="wf-header-left">
            <div class="wf-header-icon">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/>
                <circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>
                <line x1="12" y1="11" x2="5" y2="16"/><line x1="12" y1="11" x2="19" y2="16"/>
              </svg>
            </div>
            <div>
              <div class="wf-title">{{ t('tasks.workflowPreview') }}</div>
              <div class="wf-subtitle">{{ plan.name }} · {{ plan.steps?.length || 0 }} {{ (plan.steps?.length || 0) !== 1 ? t('tasks.steps') : t('tasks.step') }}</div>
            </div>
          </div>
          <button class="wf-close" @click="$emit('close')" title="Close">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="wf-body" :class="{ 'wf-body--split': selectedStep }">

          <!-- Flow canvas -->
          <div class="wf-flow">

            <!-- START terminus -->
            <div class="wf-terminus wf-terminus--start">
              <div class="wf-terminus-ring"></div>
              <span>{{ t('tasks.start') }}</span>
            </div>

            <template v-for="(wave, wi) in flowWaves" :key="wi">
              <!-- vertical connector -->
              <div class="wf-hconn">
                <div class="wf-hconn-line"></div>
                <svg class="wf-hconn-arrow" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 1 5 5 9 1"/></svg>
              </div>

              <!-- wave column -->
              <div class="wf-wave-col">
                <div v-if="wave.length > 1" class="wf-wave-tag">
                  <span class="wf-parallel-badge">parallel ×{{ wave.length }}</span>
                </div>

                <div
                  v-for="node in wave"
                  :key="node.stepId"
                  :class="['wf-node', node.condClass, node.runClass, { 'wf-node--selected': selectedStepId === node.stepId }]"
                  @click="selectStep(node)"
                >
                  <!-- run status badge -->
                  <div v-if="node.runStatus" class="wf-run-badge" :class="`wf-run-badge--${node.runStatus}`">
                    <svg v-if="node.runStatus === 'done'" style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    <svg v-else-if="node.runStatus === 'failed'" style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    <svg v-else-if="node.runStatus === 'running'" style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
                    <svg v-else style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    {{ node.runStatusLabel }}{{ node.runDuration ? ' · ' + node.runDuration : '' }}
                  </div>

                  <!-- node header -->
                  <div class="wf-node-head">
                    <span class="wf-node-num">{{ node.stepIndex + 1 }}</span>
                    <span class="wf-node-task">{{ node.taskIcon }} {{ node.taskName }}</span>
                    <span v-if="node.conditionBadge" :class="['wf-cond-badge', `wf-cond-badge--${node.runCondition}`]">
                      {{ node.conditionBadge }}
                    </span>
                  </div>
                  <!-- after: Step N label -->
                  <div v-if="node.dependsOnLabels.length > 0" class="wf-node-after">
                    after: {{ node.dependsOnLabels.join(', ') }}
                  </div>
                  <!-- agents -->
                  <div class="wf-agents-line">
                    <span class="wf-agents-label">Agent:</span>
                    <span class="wf-agents-names">{{ node.agents.length ? node.agents.map(p => p.name).join(', ') : '—' }}</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- connector to END -->
            <div class="wf-hconn">
              <div class="wf-hconn-line"></div>
              <svg class="wf-hconn-arrow" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 1 5 5 9 1"/></svg>
            </div>

            <!-- END terminus -->
            <div class="wf-terminus wf-terminus--end">
              <div class="wf-terminus-ring wf-terminus-ring--end"></div>
              <span>END</span>
            </div>

          </div>

          <!-- Step execution detail panel -->
          <div v-if="selectedStep" class="wf-detail">
            <div class="wf-detail-header">
              <div class="wf-detail-title">
                <span class="wf-detail-num">{{ selectedStep.stepIndex + 1 }}</span>
                {{ selectedStep.taskIcon }} {{ selectedStep.taskName }}
              </div>
              <button class="wf-detail-close" @click="selectedStep = null" title="Close">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <!-- status row: shows run status OR "not yet run" — never both -->
            <div v-if="selectedStep.runStatus" class="wf-detail-status" :class="`wf-detail-status--${selectedStep.runStatus}`">
              <svg v-if="selectedStep.runStatus === 'done'" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else-if="selectedStep.runStatus === 'failed'" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <svg v-else-if="selectedStep.runStatus === 'running'" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
              <svg v-else style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {{ selectedStep.runStatusLabel }}
              <span v-if="selectedStep.runAgentName" class="wf-detail-agent-tag">{{ selectedStep.runAgentName }}</span>
              <span v-if="selectedStep.runDuration" class="wf-detail-dur-tag">{{ selectedStep.runDuration }}</span>
            </div>
            <div v-else class="wf-detail-status wf-detail-status--pending">
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
              Not yet run
            </div>

            <!-- step timestamps (independent of status row) -->
            <div v-if="selectedStep.runStartedAt || selectedStep.runCompletedAt" class="wf-detail-timestamps">
              <div v-if="selectedStep.runStartedAt" class="wf-detail-ts">
                <span class="wf-detail-ts-label">Started</span>
                <span class="wf-detail-ts-value">{{ fmtTs(selectedStep.runStartedAt) }}</span>
              </div>
              <div v-if="selectedStep.runCompletedAt" class="wf-detail-ts">
                <span class="wf-detail-ts-label">Finished</span>
                <span class="wf-detail-ts-value">{{ fmtTs(selectedStep.runCompletedAt) }}</span>
              </div>
            </div>

            <!-- output -->
            <div v-if="selectedStep.runOutput" class="wf-detail-section">
              <div class="wf-detail-section-label">Output</div>
              <pre class="wf-detail-pre">{{ selectedStep.runOutput }}</pre>
            </div>

            <!-- error -->
            <div v-if="selectedStep.runError" class="wf-detail-section">
              <div class="wf-detail-section-label wf-detail-section-label--error">Error</div>
              <pre class="wf-detail-pre wf-detail-pre--error">{{ selectedStep.runError }}</pre>
            </div>

            <div v-if="!selectedStep.runOutput && !selectedStep.runError && !selectedStep.runStatus" class="wf-detail-empty">
              No execution data available for this step.
            </div>
          </div>

          <!-- Legend -->
          <div class="wf-legend">
            <span class="wf-legend-item"><span class="wf-legend-dot wf-legend-dot--parallel"></span>Parallel</span>
            <span class="wf-legend-item"><span class="wf-legend-dot wf-legend-dot--success"></span>On success</span>
            <span class="wf-legend-item"><span class="wf-legend-dot wf-legend-dot--failure"></span>On failure</span>
            <template v-if="run">
              <span class="wf-legend-sep"></span>
              <span class="wf-legend-item"><span class="wf-legend-dot wf-legend-dot--run-done"></span>Done</span>
              <span class="wf-legend-item"><span class="wf-legend-dot wf-legend-dot--run-failed"></span>Failed</span>
              <span class="wf-legend-item"><span class="wf-legend-dot wf-legend-dot--run-skipped"></span>Skipped</span>
            </template>
          </div>
        </div>

        <!-- Footer -->
        <div class="wf-footer">
          <div class="wf-footer-meta">
            <span class="wf-schedule-chip">
              <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {{ scheduleLabel }}
            </span>
            <template v-if="run">
              <span class="wf-run-chip">
                <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                {{ runStatusSummary }}
              </span>
              <span v-if="run.startedAt" class="wf-ts-chip">
                <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {{ fmtTs(run.startedAt) }}
              </span>
              <span v-if="run.completedAt" class="wf-ts-chip">
                <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                {{ fmtTs(run.completedAt) }}
              </span>
              <span v-if="fmtDuration(run.startedAt, run.completedAt)" class="wf-dur-chip">
                {{ fmtDuration(run.startedAt, run.completedAt) }}
              </span>
            </template>
          </div>
          <button class="wf-close-btn" @click="$emit('close')">Close</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import { useTasksStore } from '../../stores/tasks'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  visible: { type: Boolean, default: false },
  plan:    { type: Object,  required: true },
  run:     { type: Object,  default: null },
})
defineEmits(['close'])
defineOptions({ inheritAttrs: false })

const agentsStore = useAgentsStore()
const tasksStore    = useTasksStore()

const selectedStepId = ref(null)

// Always derive selectedStep from live flowWaves so it's never stale
const selectedStep = computed(() => {
  if (!selectedStepId.value) return null
  for (const wave of flowWaves.value) {
    const node = wave.find(n => n.stepId === selectedStepId.value)
    if (node) return node
  }
  return null
})

// Clear selection when modal closes or run changes
watch(() => props.visible, v => { if (!v) selectedStepId.value = null })
watch(() => props.run, () => { selectedStepId.value = null })

function selectStep(node) {
  selectedStepId.value = selectedStepId.value === node.stepId ? null : node.stepId
}

function getAgent(id) {
  return agentsStore.getAgentById(id)
}

function agentEmoji(id) {
  const p = getAgent(id)
  return p?.avatar || p?.emoji || '🤖'
}

function agentName(id) {
  return getAgent(id)?.name || '(unknown)'
}

// Build enriched wave nodes for vertical DAG rendering
const flowWaves = computed(() => {
  if (!props.plan?.steps) return []
  const steps = props.plan.steps
  const idSet = new Set(steps.map(s => s.id))
  const resolved = new Set()
  const remaining = [...steps]
  const waves = []

  while (remaining.length > 0) {
    const wave = remaining.filter(s =>
      (s.dependsOn || []).filter(d => idSet.has(d)).every(d => resolved.has(d))
    )
    if (wave.length === 0) {
      waves.push(remaining.map(s => buildNode(s, steps)))
      break
    }
    waves.push(wave.map(s => buildNode(s, steps)))
    wave.forEach(s => { resolved.add(s.id); remaining.splice(remaining.indexOf(s), 1) })
  }
  return waves
})

function buildNode(step, allSteps) {
  const agents = (step.defaultAgentIds || []).map(pid => ({
    key:   `fixed-${pid}`,
    name:  agentName(pid),
    emoji: agentEmoji(pid),
  }))

  const hasDeps = (step.dependsOn || []).length > 0
  const cond = step.runCondition || 'always'
  const stepIndex = allSteps.indexOf(step)

  // Resolve run result for this step
  const runResult = props.run?.stepResults?.find(r => r.stepIndex === stepIndex)
  const runStatus = runResult?.status || null
  const runStatusLabels = { done: 'Done', failed: 'Failed', skipped: 'Skipped', running: 'Running' }
  const runClass = runStatus === 'done'    ? 'wf-node--run-done'
                 : runStatus === 'failed'  ? 'wf-node--run-failed'
                 : runStatus === 'skipped' ? 'wf-node--run-skipped'
                 : runStatus === 'running' ? 'wf-node--run-running'
                 : ''

  const task = tasksStore.tasks.find(t => t.id === step.taskId) || null
  return {
    stepId: step.id,
    stepIndex,
    taskName: task?.name || (step.taskId ? '(unknown)' : 'No task'),
    taskIcon: task?.icon || '✍️',
    agents,
    runCondition: cond,
    conditionBadge: hasDeps && cond !== 'always' ? (cond === 'on_success' ? 'on success' : 'on failure') : null,
    condClass: hasDeps ? (cond === 'on_success' ? 'wf-node--success' : cond === 'on_failure' ? 'wf-node--failure' : '') : '',
    dependsOnLabels: (step.dependsOn || []).map(id => {
      const di = allSteps.findIndex(s => s.id === id)
      return di === -1 ? '?' : `Step ${di + 1}`
    }),
    // run result fields
    runStatus,
    runStatusLabel: runStatus ? (runStatusLabels[runStatus] || runStatus) : null,
    runClass,
    runOutput: runResult?.output || null,
    runError:  runResult?.error  || null,
    runAgentName: runResult?.agentName || null,
    runStartedAt:   runResult?.startedAt   || null,
    runCompletedAt: runResult?.completedAt || null,
    runDuration:    fmtDuration(runResult?.startedAt, runResult?.completedAt),
  }
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

function fmtTs(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const scheduleLabel = computed(() => {
  const s = props.plan?.schedule
  if (!s || s.type === 'manual') return t('tasks.manualOnly')
  if (s.type === 'once')  return s.runAt ? `Once at ${new Date(s.runAt).toLocaleString()}` : 'Once (no time set)'
  if (s.type === 'cron')  return s.cron ? `Cron: ${s.cron}` : 'Cron (no expression)'
  return ''
})

const runStatusSummary = computed(() => {
  if (!props.run?.stepResults) return 'No data'
  const results = props.run.stepResults
  const done    = results.filter(r => r.status === 'done').length
  const failed  = results.filter(r => r.status === 'failed').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const total   = props.plan?.steps?.length || 0
  const parts = []
  if (done)    parts.push(`${done} done`)
  if (failed)  parts.push(`${failed} failed`)
  if (skipped) parts.push(`${skipped} skipped`)
  if (parts.length === 0) parts.push(`0/${total}`)
  return parts.join(', ')
})
</script>

<style>
/* ── Backdrop ─────────────────────────────────────────────────────────────── */
.wf-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0,0,0,0.78);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.wf-modal {
  background: #0A0A0A;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: 60vw;
  max-width: 60rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 32px 80px rgba(0,0,0,0.7);
  animation: wfModalIn 0.2s ease-out;
  overflow: hidden;
}
@keyframes wfModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.wf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1A1A1A;
  flex-shrink: 0;
}
.wf-header-left { display: flex; align-items: center; gap: 0.75rem; }
.wf-header-icon {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.5rem;
  color: #FFF;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.wf-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #FFFFFF;
}
.wf-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #4B5563;
  margin-top: 0.125rem;
}
.wf-close {
  width: 1.875rem;
  height: 1.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.06);
  border: none;
  border-radius: 0.375rem;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  transition: all 0.15s ease;
}
.wf-close:hover { background: rgba(255,255,255,0.12); color: #FFF; }

/* ── Body ────────────────────────────────────────────────────────────────── */
.wf-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.wf-body--split {
  flex-direction: row;
}
.wf-body--split .wf-flow {
  flex: 1;
  min-width: 0;
  border-right: 1px solid #1E1E1E;
}
.wf-body--split .wf-legend {
  display: none;
}

/* ── Vertical flow ───────────────────────────────────────────────────────── */
.wf-flow {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  gap: 0;
  scrollbar-width: thin;
  scrollbar-color: #2A2A2A transparent;
}

/* ── Wave row (each wave is a horizontal strip) ──────────────────────────── */
.wf-wave-col {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  flex-shrink: 0;
  width: 100%;
}

/* ── Wave tag ────────────────────────────────────────────────────────────── */
.wf-wave-tag {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 700;
  color: rgba(255,255,255,0.45);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  width: 100%;
}
.wf-parallel-badge {
  background: rgba(96,165,250,0.15);
  color: #60A5FA;
  padding: 0.0625rem 0.375rem;
  border-radius: 9999px;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
}

/* ── Vertical connector ──────────────────────────────────────────────────── */
.wf-hconn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.125rem 0;
  flex-shrink: 0;
  gap: 0;
}
.wf-hconn-line {
  width: 1px;
  height: 1.5rem;
  background: #3A3A3A;
  flex-shrink: 0;
}
.wf-hconn-arrow {
  color: #555555;
  width: 0.625rem;
  height: 0.375rem;
  flex-shrink: 0;
  display: block;
}

/* ── Terminus ────────────────────────────────────────────────────────────── */
.wf-terminus {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.55);
}
.wf-terminus-ring {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 2px solid #60A5FA;
  background: #3B82F6;
  flex-shrink: 0;
  box-shadow: 0 0 10px rgba(59,130,246,0.45);
}
.wf-terminus-ring--end {
  background: #10B981;
  border-color: #34D399;
  box-shadow: 0 0 10px rgba(16,185,129,0.4);
}

/* ── Step node card ──────────────────────────────────────────────────────── */
.wf-node {
  background: #161616;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4375rem;
  flex-shrink: 0;
  min-width: 12rem;
  max-width: 16rem;
  width: 15rem;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  position: relative;
}
.wf-node:hover {
  border-color: #3A3A3A;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.wf-node--selected {
  border-color: #60A5FA !important;
  box-shadow: 0 0 0 1px rgba(96,165,250,0.25) !important;
}

/* condition classes */
.wf-node--success {
  border-color: rgba(52,211,153,0.25);
  background: rgba(52,211,153,0.04);
}
.wf-node--failure {
  border-color: rgba(248,113,113,0.25);
  background: rgba(248,113,113,0.04);
}

/* run result classes */
.wf-node--run-done {
  border-color: rgba(52,211,153,0.5) !important;
  background: rgba(16,185,129,0.08) !important;
}
.wf-node--run-failed {
  border-color: rgba(248,113,113,0.5) !important;
  background: rgba(239,68,68,0.08) !important;
}
.wf-node--run-skipped {
  border-color: rgba(107,114,128,0.4) !important;
  background: rgba(55,65,81,0.06) !important;
  opacity: 0.7;
}
.wf-node--run-running {
  border-color: rgba(251,191,36,0.5) !important;
  background: rgba(245,158,11,0.08) !important;
}

/* ── Run status badge (top-right of card) ────────────────────────────────── */
.wf-run-badge {
  position: absolute;
  top: 0.4375rem;
  right: 0.4375rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-size: 0.5625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.wf-run-badge--done    { background: rgba(16,185,129,0.15);  color: #34D399; }
.wf-run-badge--failed  { background: rgba(239,68,68,0.15);   color: #F87171; }
.wf-run-badge--skipped { background: rgba(107,114,128,0.15); color: #9CA3AF; }
.wf-run-badge--running { background: rgba(245,158,11,0.15);  color: #FBBF24; }

/* ── Node head ───────────────────────────────────────────────────────────── */
.wf-node-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  flex-wrap: wrap;
  padding-right: 2rem; /* leave room for run badge */
}
.wf-node-num {
  width: 1.125rem;
  height: 1.125rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1A1A1A, #374151);
  border-radius: 50%;
  font-family: 'Inter', sans-serif;
  font-size: 0.5625rem;
  font-weight: 700;
  color: #FFF;
  flex-shrink: 0;
}
.wf-node-task {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 700;
  color: #E5E7EB;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-cond-badge {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.0625rem 0.375rem;
  border-radius: 9999px;
  flex-shrink: 0;
}
.wf-cond-badge--on_success { background: rgba(52,211,153,0.12); color: #34D399; }
.wf-cond-badge--on_failure { background: rgba(248,113,113,0.12); color: #F87171; }

/* ── After line ──────────────────────────────────────────────────────────── */
.wf-node-after {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.625rem;
  color: rgba(255,255,255,0.45);
  text-align: center;
}

/* ── Agents ────────────────────────────────────────────────────────────── */
.wf-agents-line {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.3rem;
  padding-top: 0.3125rem;
  border-top: 1px solid #1E1E1E;
  margin-top: 0.125rem;
  min-width: 0;
}
.wf-agents-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 700;
  color: rgba(255,255,255,0.35);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.wf-agents-names {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  color: #E5E7EB;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Step execution detail panel ─────────────────────────────────────────── */
.wf-detail {
  width: 22rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0D0D0D;
  animation: wfDetailIn 0.15s ease-out;
}
@keyframes wfDetailIn {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}

.wf-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid #1A1A1A;
  flex-shrink: 0;
}
.wf-detail-title {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 700;
  color: #E5E7EB;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wf-detail-num {
  width: 1.25rem;
  height: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1A1A1A, #374151);
  border-radius: 50%;
  font-size: 0.5625rem;
  font-weight: 700;
  color: #FFF;
  flex-shrink: 0;
}
.wf-detail-close {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.06);
  border: none;
  border-radius: 0.25rem;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.wf-detail-close:hover { background: rgba(255,255,255,0.12); color: #FFF; }

.wf-detail-status {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 1rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #141414;
  flex-shrink: 0;
}
.wf-detail-status--done    { color: #34D399; background: rgba(16,185,129,0.06); }
.wf-detail-status--failed  { color: #F87171; background: rgba(239,68,68,0.06); }
.wf-detail-status--skipped { color: #9CA3AF; background: rgba(107,114,128,0.06); }
.wf-detail-status--running { color: #FBBF24; background: rgba(245,158,11,0.06); }
.wf-detail-status--pending { color: #6B7280; background: transparent; }
.wf-detail-agent-tag {
  margin-left: auto;
  font-size: 0.625rem;
  font-weight: 600;
  color: rgba(255,255,255,0.4);
  text-transform: none;
  letter-spacing: 0;
}

.wf-detail-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #141414;
}
.wf-detail-section-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 700;
  color: rgba(255,255,255,0.35);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.wf-detail-section-label--error { color: rgba(248,113,113,0.7); }

.wf-detail-pre {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  color: #D1D5DB;
  background: #111111;
  border: 1px solid #1E1E1E;
  border-radius: 0.375rem;
  padding: 0.625rem 0.75rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 16rem;
  line-height: 1.5;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: #2A2A2A transparent;
}
.wf-detail-pre--error {
  color: #FCA5A5;
  background: rgba(239,68,68,0.05);
  border-color: rgba(239,68,68,0.15);
}

.wf-detail-empty {
  padding: 1.5rem 1rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #4B5563;
  text-align: center;
}

/* ── Legend ──────────────────────────────────────────────────────────────── */
.wf-legend {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.625rem 1.25rem;
  border-top: 1px solid #141414;
  flex-shrink: 0;
  flex-wrap: wrap;
  background: #070707;
}
.wf-legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.wf-legend-sep {
  width: 1px;
  height: 0.875rem;
  background: #1E1E1E;
  flex-shrink: 0;
}
.wf-legend-dot {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.wf-legend-dot--parallel   { background: #60A5FA; }
.wf-legend-dot--success    { background: #34D399; }
.wf-legend-dot--failure    { background: #F87171; }
.wf-legend-dot--run-done   { background: #10B981; }
.wf-legend-dot--run-failed { background: #EF4444; }
.wf-legend-dot--run-skipped{ background: #6B7280; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.wf-footer {
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #141414;
  background: #070707;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.wf-footer-meta { display: flex; align-items: center; gap: 0.5rem; }
.wf-schedule-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 9999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  color: #6B7280;
}
.wf-run-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: rgba(16,185,129,0.08);
  border: 1px solid rgba(16,185,129,0.2);
  border-radius: 9999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  color: #34D399;
}
.wf-ts-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.5rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 9999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.625rem;
  color: #4B5563;
}
.wf-dur-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  background: rgba(96,165,250,0.08);
  border: 1px solid rgba(96,165,250,0.15);
  border-radius: 9999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.625rem;
  font-weight: 700;
  color: #60A5FA;
}

.wf-detail-dur-tag {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.5625rem;
  font-weight: 700;
  color: rgba(96,165,250,0.8);
  text-transform: none;
  letter-spacing: 0;
}
.wf-detail-timestamps {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #141414;
  flex-shrink: 0;
  background: rgba(255,255,255,0.015);
}
.wf-detail-ts {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.wf-detail-ts-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.5625rem;
  font-weight: 700;
  color: rgba(255,255,255,0.25);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}
.wf-detail-ts-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.5625rem;
  color: #6B7280;
}

.wf-close-btn {
  padding: 0.4375rem 1.25rem;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: rgba(255,255,255,0.65);
  cursor: pointer;
  transition: all 0.15s ease;
}
.wf-close-btn:hover { background: rgba(255,255,255,0.12); color: #FFF; }
</style>
