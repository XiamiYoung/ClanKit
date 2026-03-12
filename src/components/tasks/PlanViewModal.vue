<template>
  <Teleport to="body">
    <div v-if="visible" class="pv-backdrop">
      <div class="pv-modal">

        <!-- Header -->
        <div class="pv-header">
          <div class="pv-header-left">
            <div class="pv-header-icon">
              <span v-if="plan?.icon" style="font-size:1.125rem;">{{ plan.icon }}</span>
              <svg v-else style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <span class="pv-header-title">{{ plan?.name || 'View Plan' }}</span>
          </div>
          <div class="pv-header-center">
            <button v-if="plan?.id" class="pv-history-btn" @click="showHistory = true">
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Execution History
            </button>
          </div>
          <button class="pv-close-btn" @click="$emit('close')">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Two-column layout: form | workflow canvas -->
        <div class="pv-columns" :style="{ '--split-pct': splitPct + '%' }">

          <!-- LEFT: form (readonly) -->
          <div class="pv-body">

            <!-- Plan description -->
            <div v-if="plan?.description" class="pv-info-desc">{{ plan.description }}</div>

            <!-- Steps -->
            <div class="pv-section">
              <div class="pv-section-header">
                <div class="pv-section-icon">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <span class="pv-section-title">Steps</span>
                <span class="pv-section-hint">{{ plan?.steps?.length || 0 }} step{{ plan?.steps?.length === 1 ? '' : 's' }}</span>
              </div>

              <div v-if="!plan?.steps?.length" class="pv-no-steps">No steps defined.</div>

              <div class="pv-steps-list">
                <div v-for="(step, stepIdx) in plan?.steps || []" :key="step.id" class="pv-step-card">

                  <div class="pv-step-head">
                    <div class="pv-step-num">{{ stepIdx + 1 }}</div>
                    <span class="pv-step-task-label">{{ taskName(step.taskId) || '(no task)' }}</span>
                  </div>

                  <!-- Personas -->
                  <template v-if="step.taskId && step.defaultPersonaIds?.length">
                    <div class="pv-step-field">
                      <label class="pv-step-label">Persona(s)</label>
                      <div class="pv-persona-chips">
                        <span v-for="pid in step.defaultPersonaIds" :key="pid" class="pv-persona-chip">
                          {{ personaName(pid) }}
                        </span>
                      </div>
                    </div>
                  </template>

                  <!-- Prompt override -->
                  <div v-if="step.promptOverride" class="pv-step-field">
                    <label class="pv-step-label">Prompt override</label>
                    <div class="pv-prompt-pre">{{ step.promptOverride }}</div>
                  </div>

                  <!-- Dependencies -->
                  <div v-if="(step.dependsOn || []).length > 0" class="pv-step-field">
                    <label class="pv-step-label">Run after</label>
                    <div class="pv-dep-info">
                      {{ dependsOnLabels(step).join(', ') }}
                      <span v-if="(step.runCondition || 'always') !== 'always'" :class="['pv-cond-badge', `pv-cond-badge--${step.runCondition}`]">
                        {{ step.runCondition === 'on_success' ? 'on success' : 'on failure' }}
                      </span>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            <!-- Schedule -->
            <div class="pv-section">
              <div class="pv-section-header">
                <div class="pv-section-icon">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <span class="pv-section-title">Schedule</span>
                <span class="pv-section-hint">{{ schedTypeLabel(plan?.schedule?.type) }}</span>
              </div>
              <template v-if="plan?.schedule?.type === 'once' && plan?.schedule?.runAt">
                <div class="pv-sched-row">
                  <span class="pv-sched-key">Run at</span>
                  <span class="pv-sched-val">{{ new Date(plan.schedule.runAt).toLocaleString() }}</span>
                </div>
              </template>
              <template v-if="plan?.schedule?.type === 'cron'">
                <div class="pv-sched-row">
                  <span class="pv-sched-key">Cron</span>
                  <span class="pv-sched-val pv-sched-val--mono">{{ plan.schedule.cron || '—' }}</span>
                </div>
                <div v-if="plan?.schedule?.cron" class="pv-cron-desc">
                  <svg style="width:10px;height:10px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {{ describeCronSimple(plan.schedule.cron) }}
                </div>
                <div class="pv-sched-row">
                  <span class="pv-sched-key">Timezone</span>
                  <span class="pv-sched-val">{{ plan.schedule.timezone || 'UTC' }}</span>
                </div>
              </template>
              <template v-if="plan?.schedule?.type !== 'manual'">
                <div class="pv-schedule-status">
                  <div :class="['pv-toggle-switch-display', plan?.schedule?.enabled && 'pv-toggle-switch-display--on']">
                    <span class="pv-toggle-knob-display"></span>
                  </div>
                  <span :class="['pv-status-text', plan?.schedule?.enabled ? 'pv-status-text--on' : 'pv-status-text--off']">
                    {{ plan?.schedule?.enabled ? 'Enabled — will run on schedule' : 'Disabled — will not run automatically' }}
                  </span>
                </div>
              </template>
            </div>

          </div>

          <!-- DRAG DIVIDER -->
          <div class="pv-divider" @mousedown="onDividerMousedown">
            <div class="pv-divider-handle"></div>
          </div>

          <!-- RIGHT: workflow canvas (same as PlanEditor, readonly) -->
          <div class="pv-canvas">
            <div class="pv-canvas-label">
              <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="11" x2="5" y2="16"/><line x1="12" y1="11" x2="19" y2="16"/></svg>
              Workflow
            </div>
            <div class="pv-flow-scroll">
              <div v-if="!flowWaves.length" class="pv-flow-empty">
                <svg style="width:28px;height:28px;opacity:0.2;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="11" x2="5" y2="16"/><line x1="12" y1="11" x2="19" y2="16"/></svg>
                <span>No steps</span>
              </div>

              <div v-else class="pv-flow">
                <div class="pf-terminus">
                  <div class="pf-terminus-dot"></div>
                  <span>START</span>
                </div>
                <template v-for="(wave, wi) in flowWaves" :key="wi">
                  <div class="pf-hconn">
                    <div class="pf-hconn-line"></div>
                    <svg class="pf-hconn-arrow" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 1 5 5 9 1"/></svg>
                  </div>
                  <div class="pf-wave-col">
                    <div v-if="wave.length > 1" class="pf-wave-tag">
                      <span class="pf-wave-parallel">parallel ×{{ wave.length }}</span>
                    </div>
                    <div v-for="node in wave" :key="node.stepId" :class="['pf-step-block', node.condClass]">
                      <div class="pf-step-pill">
                        <span class="pf-step-num">{{ node.stepIndex + 1 }}</span>
                        <span class="pf-step-task">{{ node.taskIcon }} {{ node.taskName }}</span>
                        <span v-if="node.conditionBadge" :class="['pf-cond-badge', `pf-cond-badge--${node.runCondition}`]">
                          <span class="pf-cond-dot" :class="`pf-cond-dot--${node.runCondition}`"></span>
                          {{ node.conditionBadge }}
                        </span>
                      </div>
                      <div v-if="node.dependsOnLabels.length > 0" class="pf-depends-on">
                        after: {{ node.dependsOnLabels.join(', ') }}
                      </div>
                      <div class="pf-personas-line">
                        <span class="pf-personas-label">Persona:</span>
                        <span class="pf-personas-names">{{ node.personas.length ? node.personas.map(p => p.name).join(', ') : '—' }}</span>
                      </div>
                    </div>
                  </div>
                </template>
                <div class="pf-hconn">
                  <div class="pf-hconn-line"></div>
                  <svg class="pf-hconn-arrow" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 1 5 5 9 1"/></svg>
                </div>
                <div class="pf-terminus">
                  <div class="pf-terminus-dot pf-terminus-dot--end"></div>
                  <span>END</span>
                </div>
              </div>
            </div>
            <div class="pv-canvas-legend">
              <span class="pf-legend-item"><span class="pf-legend-dot pf-legend-dot--parallel"></span>Parallel</span>
              <span class="pf-legend-item"><span class="pf-legend-dot pf-legend-dot--success"></span>On success</span>
              <span class="pf-legend-item"><span class="pf-legend-dot pf-legend-dot--failure"></span>On failure</span>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="pv-footer">
          <div></div>
          <button class="pv-close-footer-btn" @click="$emit('close')">Close</button>
        </div>

      </div>
    </div>

    <PlanHistoryModal
      :visible="showHistory"
      :plan="plan"
      @close="showHistory = false"
    />
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { usePersonasStore } from '../../stores/personas'
import PlanHistoryModal from './PlanHistoryModal.vue'

const props = defineProps({
  visible:     Boolean,
  plan:        { type: Object, default: null },
  tasks:       { type: Array, default: () => [] },
  openHistory: { type: Boolean, default: false },
})
defineEmits(['close'])

const personasStore = usePersonasStore()
const showHistory   = ref(false)

watch(() => props.visible, (v) => {
  if (v && props.openHistory) showHistory.value = true
  else if (!v) showHistory.value = false
})

// ── Resizable split ─────────────────────────────────────────────────────────
const splitPct = ref(50)
let _dragStartX = 0, _dragStartPct = 0, _columnsEl = null

function onDividerMousedown(e) {
  e.preventDefault()
  _dragStartX = e.clientX
  _dragStartPct = splitPct.value
  _columnsEl = e.currentTarget.parentElement
  window.addEventListener('mousemove', onDividerMousemove)
  window.addEventListener('mouseup', onDividerMouseup)
}
function onDividerMousemove(e) {
  if (!_columnsEl) return
  const totalW = _columnsEl.getBoundingClientRect().width
  const delta = e.clientX - _dragStartX
  splitPct.value = Math.min(75, Math.max(25, _dragStartPct + (delta / totalW) * 100))
}
function onDividerMouseup() {
  window.removeEventListener('mousemove', onDividerMousemove)
  window.removeEventListener('mouseup', onDividerMouseup)
  _columnsEl = null
}
function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showHistory.value) { showHistory.value = false; return }
    emit('close')
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousemove', onDividerMousemove)
  window.removeEventListener('mouseup', onDividerMouseup)
})

// ── Cron simple description ──────────────────────────────────────────────────
function describeCronSimple(expr) {
  if (!expr) return null
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return 'Invalid expression'
  const [minF, hourF, domF, monthF, dowF] = parts
  if (minF === '*' && hourF === '*') return `Every minute (${expr})`
  if (minF.startsWith('*/')) return `Every ${minF.split('/')[1]} minutes`
  if (hourF.startsWith('*/')) return `Every ${hourF.split('/')[1]} hours`
  // Try to form HH:MM
  const h = parseInt(hourF), m = parseInt(minF)
  if (!isNaN(h) && !isNaN(m) && !hourF.includes(',') && !minF.includes(',')) {
    const ampm = h < 12 ? 'AM' : 'PM'
    const hh = h % 12 === 0 ? 12 : h % 12
    const time = `${hh}:${String(m).padStart(2,'0')} ${ampm}`
    if (domF === '*' && monthF === '*' && dowF === '*') return `At ${time} every day`
    if (domF === '*' && monthF === '*') return `At ${time} on selected weekdays`
    if (dowF === '*' && monthF === '*') return `At ${time} on day ${domF} of every month`
  }
  return expr
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function taskName(taskId) {
  const t = props.tasks.find(t => t.id === taskId)
  return t ? `${t.icon} ${t.name}` : ''
}
function personaName(pid) {
  if (!pid) return null
  return personasStore.getPersonaById(pid)?.name || pid
}
function schedTypeLabel(type) {
  if (type === 'once')   return 'One-time'
  if (type === 'cron')   return 'Recurring (cron)'
  return 'Manual only'
}
function dependsOnLabels(step) {
  const steps = props.plan?.steps || []
  return (step.dependsOn || []).map(id => {
    const di = steps.findIndex(s => s.id === id)
    return di === -1 ? '?' : `Step ${di + 1}`
  })
}

// ── Flow wave builder ────────────────────────────────────────────────────────
const flowWaves = computed(() => {
  const steps = props.plan?.steps || []
  if (!steps.length) return []
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
  const task = props.tasks.find(t => t.id === step.taskId)
  const personas = (step.defaultPersonaIds || []).map(pid => ({ name: personaName(pid) || '(unknown)' }))
  const hasDeps = (step.dependsOn || []).length > 0
  const cond = step.runCondition || 'always'
  return {
    stepId: step.id,
    stepIndex: allSteps.indexOf(step),
    taskName: task?.name || (step.taskId ? '(unknown)' : 'No task'),
    taskIcon: task?.icon || '✍️',
    personas, runCondition: cond,
    conditionBadge: hasDeps && cond !== 'always' ? (cond === 'on_success' ? 'on success' : 'on failure') : null,
    condClass: hasDeps ? (cond === 'on_success' ? 'pf-step-block--success' : cond === 'on_failure' ? 'pf-step-block--failure' : '') : '',
    dependsOnLabels: (step.dependsOn || []).map(id => {
      const di = allSteps.findIndex(s => s.id === id)
      return di === -1 ? '?' : `Step ${di + 1}`
    }),
  }
}
</script>

<style>
/* Unscoped — teleported outside component DOM */
.pv-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.65); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.pv-modal {
  background: #0F0F0F; border: 1px solid #2A2A2A; border-radius: 1rem;
  width: 90vw; height: 90vh; max-width: 90vw; max-height: 90vh;
  display: flex; flex-direction: column;
  box-shadow: 0 25px 60px rgba(0,0,0,0.6);
  animation: pvModalIn 0.2s ease-out; overflow: hidden;
}
@keyframes pvModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.pv-header {
  display: grid; grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid #1E1E1E; flex-shrink: 0;
}
.pv-header-left { display: flex; align-items: center; gap: 0.625rem; }
.pv-header-center { display: flex; align-items: center; justify-content: center; }
.pv-header-icon {
  width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.5rem; color: #FFFFFF; border: 1px solid #2A2A2A;
}
.pv-header-title { font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle); font-weight: 700; color: #FFFFFF; }
.pv-close-btn {
  justify-self: end;
  width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.5rem; color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.15s ease;
}
.pv-close-btn:hover { background: rgba(255,255,255,0.12); color: #FFFFFF; }

/* Two-column layout */
.pv-columns {
  flex: 1; display: flex; flex-direction: row; min-height: 0; overflow: hidden; user-select: none;
}
.pv-columns > .pv-body {
  width: var(--split-pct, 50%); flex-shrink: 0; flex-grow: 0;
}
.pv-columns > .pv-canvas { flex: 1; min-width: 0; }

/* Drag divider */
.pv-divider {
  width: 5px; flex-shrink: 0; background: #1A1A1A; cursor: col-resize;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s ease; user-select: none;
}
.pv-divider:hover, .pv-divider:active { background: #374151; }
.pv-divider-handle {
  width: 3px; height: 2.5rem; background: rgba(255,255,255,0.12); border-radius: 9999px;
}
.pv-divider:hover .pv-divider-handle { background: rgba(255,255,255,0.3); }

/* LEFT: form */
.pv-body {
  overflow-y: auto; padding: 1.5rem;
  display: flex; flex-direction: column; gap: 1.125rem;
  scrollbar-width: thin; scrollbar-color: #2A2A2A transparent;
}

/* Plan description */
.pv-info-desc { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: rgba(255,255,255,0.45); font-style: italic; }

/* Compact schedule key-value rows */
.pv-sched-row { display: flex; align-items: baseline; gap: 0.625rem; }
.pv-sched-key { font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 600; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0; min-width: 4.5rem; }
.pv-sched-val { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 500; color: rgba(255,255,255,0.75); }
.pv-sched-val--mono { font-family: 'JetBrains Mono', monospace; font-size: var(--fs-secondary); color: #60A5FA; }

/* Section */
.pv-section {
  display: flex; flex-direction: column; gap: 0.75rem;
  padding: 1rem; background: rgba(255,255,255,0.03);
  border: 1px solid #1E1E1E; border-radius: 0.75rem;
}
.pv-section-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.pv-section-icon {
  width: 1.5rem; height: 1.5rem; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.375rem; color: #FFFFFF; flex-shrink: 0;
}
.pv-section-title { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 700; color: rgba(255,255,255,0.85); }
.pv-section-hint { font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: rgba(255,255,255,0.3); }
.pv-no-steps { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: rgba(255,255,255,0.3); text-align: center; padding: 0.5rem 0; }

/* Step cards */
.pv-steps-list { display: flex; flex-direction: column; gap: 0.625rem; }
.pv-step-card {
  background: rgba(255,255,255,0.04); border: 1px solid #222222;
  border-radius: 0.625rem; padding: 0.875rem;
  display: flex; flex-direction: column; gap: 0.625rem;
}
.pv-step-head { display: flex; align-items: center; gap: 0.625rem; }
.pv-step-num {
  width: 1.5rem; height: 1.5rem; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 50%; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small); font-weight: 700; color: #FFFFFF; flex-shrink: 0;
}
.pv-step-task-label {
  flex: 1; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: rgba(255,255,255,0.75);
  min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pv-step-field { display: flex; flex-direction: column; gap: 0.3125rem; }
.pv-step-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 600;
  color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.05em;
}
.pv-assignments { display: flex; flex-direction: column; gap: 0.375rem; }
.pv-assign-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.pv-assign-slot { font-family: 'JetBrains Mono', monospace; font-size: var(--fs-secondary); font-weight: 700; color: rgba(255,255,255,0.5); flex-shrink: 0; min-width: 6rem; }
.pv-assign-val { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: rgba(255,255,255,0.7); }
.pv-persona-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; }
.pv-persona-chip {
  display: inline-flex; align-items: center; padding: 0.25rem 0.625rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 9999px; font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 600; color: #FFFFFF;
}
.pv-prompt-pre {
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-small); color: #D1D5DB;
  background: #111; border: 1px solid #1E1E1E; border-radius: 0.375rem;
  padding: 0.5rem 0.625rem; white-space: pre-wrap; word-break: break-word; line-height: 1.5;
  max-height: 10rem; overflow: auto; scrollbar-width: thin; scrollbar-color: #1E1E1E transparent;
}
.pv-dep-info {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-small); color: rgba(255,255,255,0.5);
}
.pv-cond-badge {
  padding: 0.0625rem 0.375rem; border-radius: 9999px;
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
}
.pv-cond-badge--on_success { background: rgba(52,211,153,0.12); color: #34D399; }
.pv-cond-badge--on_failure { background: rgba(248,113,113,0.12); color: #F87171; }
.pv-status-badge {
  display: inline-flex; padding: 0.125rem 0.625rem; border-radius: 9999px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 600;
}
.pv-status-badge--on  { background: rgba(16,185,129,0.1); color: #10B981; }
.pv-status-badge--off { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.4); }

/* RIGHT: canvas — reuses pf-* classes from PlanEditor */
.pv-canvas {
  display: flex; flex-direction: column; background: #080808; overflow: hidden; min-height: 0;
}
.pv-canvas-label {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.75rem 1rem 0.5rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 700;
  color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.07em;
  flex-shrink: 0; border-bottom: 1px solid #1E1E1E;
}
.pv-flow-scroll {
  flex: 1; overflow: auto;
  scrollbar-width: thin; scrollbar-color: #2A2A2A transparent;
  display: flex; flex-direction: column;
  min-height: 0;
}
.pv-flow-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.625rem; font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: rgba(255,255,255,0.2); text-align: center; min-height: 10rem; padding: 2rem;
}
.pv-flow {
  display: flex; flex-direction: column; align-items: center; gap: 0;
  padding: 1.25rem 1rem; min-width: max-content; box-sizing: border-box;
}
.pv-canvas-legend {
  display: flex; align-items: center; gap: 0.875rem;
  padding: 0.5rem 1rem; border-top: 1px solid #141414; flex-shrink: 0; flex-wrap: wrap;
}

/* Footer */
.pv-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 1rem 1.5rem; border-top: 1px solid #1A1A1A;
  background: #0A0A0A; border-radius: 0 0 1rem 1rem; flex-shrink: 0;
}
.pv-history-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 9999px; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.15s ease;
}
.pv-history-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); color: #FFF; }
.pv-close-footer-btn {
  padding: 0.4375rem 0.875rem; min-width: 5.5rem; text-align: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; border-radius: 0.5rem; font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; color: #FFFFFF;
  cursor: pointer; transition: all 0.15s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.pv-close-footer-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }

/* Plan icon display */
.pv-icon-display { font-size: 2rem; }

/* Cron description */
.pv-cron-desc {
  display: flex; align-items: flex-start; gap: 0.375rem; margin-top: 0.25rem;
  padding: 0.4rem 0.625rem;
  background: rgba(96,165,250,0.07); border: 1px solid rgba(96,165,250,0.15);
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: #93C5FD;
}

/* Schedule status toggle display */
.pv-schedule-status { display: flex; align-items: center; gap: 0.625rem; }
.pv-toggle-switch-display {
  position: relative; width: 2.25rem; height: 1.25rem;
  background: rgba(255,255,255,0.12); border-radius: 9999px; flex-shrink: 0;
}
.pv-toggle-switch-display--on { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); }
.pv-toggle-knob-display {
  position: absolute; top: 0.125rem; left: 0.125rem;
  width: 1rem; height: 1rem; border-radius: 50%;
  background: #FFFFFF; display: block; box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  transition: transform 0.2s ease;
}
.pv-toggle-switch-display--on .pv-toggle-knob-display { transform: translateX(1rem); }
.pv-status-text { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600; }
.pv-status-text--on { color: rgba(255,255,255,0.85); }
.pv-status-text--off { color: rgba(255,255,255,0.35); }
</style>
