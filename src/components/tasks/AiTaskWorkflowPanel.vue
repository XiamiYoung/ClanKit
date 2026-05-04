<template>
  <div class="atwp-panel">
    <!-- Header -->
    <div class="atwp-header">
      <div class="atwp-header-left">
        <span class="atwp-title">{{ t('tasks.workflow') }}</span>
        <span class="atwp-step-count">{{ plan.steps?.length || 0 }} {{ t('tasks.step.steps') }}</span>
      </div>
      <button class="atwp-hide-btn" @click="$emit('hide')" :title="t('tasks.hideWorkflow')">
        <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>

    <!-- Scrollable flow graph -->
    <div class="atwp-scroll">

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
            <span class="wf-parallel-badge">{{ t('tasks.step.parallelCount', { count: wave.length }) }}</span>
          </div>

          <div
            v-for="node in wave"
            :key="node.stepId"
            :class="['wf-node', node.condClass, node.runClass]"
            @click="$emit('scroll-to-step', node.stepIndex)"
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
              {{ t('tasks.step.after') }}: {{ node.dependsOnLabels.join(', ') }}
            </div>
            <!-- agents -->
            <div class="wf-agents-line">
              <span class="wf-agents-label">{{ t('tasks.step.agentsLabel') }}</span>
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
        <span>{{ t('tasks.status.completed') }}</span>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import { useTasksStore } from '../../stores/tasks'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  plan: { type: Object, required: true },
  run:  { type: Object, default: null },
})

defineEmits(['hide', 'scroll-to-step'])

const agentsStore = useAgentsStore()
const tasksStore  = useTasksStore()

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

  const runResult = props.run?.stepResults?.find(r => r.stepIndex === stepIndex)
  const runStatus = runResult?.status || null
  const runStatusLabels = computed(() => ({ done: t('tasks.status.completed'), failed: t('tasks.status.error'), skipped: t('tasks.dashboard.skipped'), running: t('tasks.status.running') }))
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
    conditionBadge: hasDeps && cond !== 'always' ? (cond === 'on_success' ? t('tasks.actions.onSuccess') : t('tasks.actions.onFailure')) : null,
    condClass: hasDeps ? (cond === 'on_success' ? 'wf-node--success' : cond === 'on_failure' ? 'wf-node--failure' : '') : '',
    dependsOnLabels: (step.dependsOn || []).map(id => {
      const di = allSteps.findIndex(s => s.id === id)
      return di === -1 ? '?' : `${t('tasks.step.step')} ${di + 1}`
    }),
    runStatus,
    runStatusLabel: runStatus ? (runStatusLabels[runStatus] || runStatus) : null,
    runClass,
    runDuration: fmtDuration(runResult?.startedAt, runResult?.completedAt),
  }
}
</script>

<style scoped>
.atwp-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-card);
}

.atwp-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
}

.atwp-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.atwp-title {
  font-weight: 700;
  font-size: var(--fs-secondary);
  color: var(--text-primary);
}

.atwp-step-count {
  font-size: var(--fs-caption);
  color: var(--text-muted);
}

.atwp-hide-btn {
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: color 0.15s, background 0.15s;
}

.atwp-hide-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.atwp-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.25rem 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  background: var(--bg-main);
}
</style>

<!-- wf-* node/wave/terminus/connector CSS — light theme, scoped under .atwp-scroll -->
<style>
/* ── Wave col ────────────────────────────────────────────────────────────── */
.atwp-scroll .wf-wave-col {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  flex-shrink: 0;
  width: 100%;
}

.atwp-scroll .wf-wave-tag {
  font-size: var(--fs-small);
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  width: 100%;
}

.atwp-scroll .wf-parallel-badge {
  background: #DBEAFE;
  color: #1D4ED8;
  padding: 0.0625rem 0.375rem;
  border-radius: 9999px;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
}

/* ── Connector ───────────────────────────────────────────────────────────── */
.atwp-scroll .wf-hconn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.125rem 0;
  flex-shrink: 0;
  gap: 0;
}

.atwp-scroll .wf-hconn-line {
  width: 1px;
  height: 1.5rem;
  background: var(--border);
  flex-shrink: 0;
}

.atwp-scroll .wf-hconn-arrow {
  color: var(--text-muted);
  width: 0.625rem;
  height: 0.375rem;
  flex-shrink: 0;
  display: block;
}

/* ── Terminus ────────────────────────────────────────────────────────────── */
.atwp-scroll .wf-terminus {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
  font-size: var(--fs-small);
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.atwp-scroll .wf-terminus-ring {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 2px solid #93C5FD;
  background: #DBEAFE;
  flex-shrink: 0;
}

.atwp-scroll .wf-terminus-ring--end {
  background: #D1FAE5;
  border-color: #6EE7B7;
}

/* ── Step node card ──────────────────────────────────────────────────────── */
.atwp-scroll .wf-node {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4375rem;
  flex-shrink: 0;
  min-width: 10rem;
  max-width: 14rem;
  width: 13rem;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.atwp-scroll .wf-node:hover {
  border-color: var(--text-muted);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

/* condition classes */
.atwp-scroll .wf-node--success {
  border-color: #6EE7B7;
  background: #F0FDF4;
}
.atwp-scroll .wf-node--failure {
  border-color: #FCA5A5;
  background: #FFF5F5;
}

/* run result classes */
.atwp-scroll .wf-node--run-done    { border-color: #10B981 !important; background: #ECFDF5 !important; }
.atwp-scroll .wf-node--run-failed  { border-color: #EF4444 !important; background: #FEF2F2 !important; }
.atwp-scroll .wf-node--run-skipped { border-color: var(--border) !important; background: var(--bg-main) !important; opacity: 0.65; }
.atwp-scroll .wf-node--run-running { border-color: #F59E0B !important; background: #FFFBEB !important; }

/* ── Run status badge — in normal flow, not absolute ─────────────────────── */
.atwp-scroll .wf-run-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.5625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  align-self: flex-start;
}

.atwp-scroll .wf-run-badge--done    { background: #D1FAE5; color: #065F46; }
.atwp-scroll .wf-run-badge--failed  { background: #FEE2E2; color: #7F1D1D; }
.atwp-scroll .wf-run-badge--skipped { background: #F3F4F6; color: #4B5563; }
.atwp-scroll .wf-run-badge--running { background: #FEF3C7; color: #92400E; }

/* ── Node head ───────────────────────────────────────────────────────────── */
.atwp-scroll .wf-node-head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: nowrap;
}

.atwp-scroll .wf-node-num {
  width: 1.125rem;
  height: 1.125rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 50%;
  font-size: 0.5625rem;
  font-weight: 700;
  color: #FFF;
  flex-shrink: 0;
}

.atwp-scroll .wf-node-task {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.atwp-scroll .wf-cond-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.0625rem 0.375rem;
  border-radius: 9999px;
  flex-shrink: 0;
}
.atwp-scroll .wf-cond-badge--on_success { background: #D1FAE5; color: #065F46; }
.atwp-scroll .wf-cond-badge--on_failure { background: #FEE2E2; color: #7F1D1D; }

/* ── After / dependency label ────────────────────────────────────────────── */
.atwp-scroll .wf-node-after {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.625rem;
  color: var(--text-muted);
  text-align: center;
}

/* ── Agents row ──────────────────────────────────────────────────────────── */
.atwp-scroll .wf-agents-line {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  padding-top: 0.3125rem;
  border-top: 1px solid var(--border-light);
  margin-top: 0.125rem;
  min-width: 0;
}

.atwp-scroll .wf-agents-label {
  font-size: 0.625rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.atwp-scroll .wf-agents-names {
  font-size: var(--fs-small);
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
