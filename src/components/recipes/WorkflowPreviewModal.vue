<template>
  <Teleport to="body">
    <div class="wfp-backdrop" @keydown.escape="$emit('close')">
      <div class="wfp-modal" tabindex="-1">

        <!-- Header -->
        <div class="wfp-header">
          <div class="wfp-header-left">
            <div class="wfp-header-icon">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/>
                <circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>
                <line x1="12" y1="11" x2="5" y2="16"/><line x1="12" y1="11" x2="19" y2="16"/>
              </svg>
            </div>
            <div>
              <div class="wfp-title">Workflow Preview</div>
              <div class="wfp-subtitle">{{ personas.length }} persona{{ personas.length !== 1 ? 's' : '' }} · {{ stages.length }} stage{{ stages.length !== 1 ? 's' : '' }}</div>
            </div>
          </div>
          <button class="wfp-close" @click="$emit('close')" title="Close">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Legend -->
        <div class="wfp-legend">
          <div class="wfp-legend-item">
            <span class="wfp-legend-dot wfp-legend-dot--parallel"></span> Parallel
          </div>
          <div class="wfp-legend-item">
            <span class="wfp-legend-dot wfp-legend-dot--always"></span> Always
          </div>
          <div class="wfp-legend-item">
            <span class="wfp-legend-dot wfp-legend-dot--success"></span> On success
          </div>
          <div class="wfp-legend-item">
            <span class="wfp-legend-dot wfp-legend-dot--failure"></span> On failure
          </div>
        </div>

        <!-- Flow -->
        <div class="wfp-body">
          <div class="wfp-flow">

            <!-- START node -->
            <div class="wfp-terminus wfp-terminus--start">
              <div class="wfp-terminus-dot"></div>
              <span>START</span>
            </div>

            <!-- Stages -->
            <template v-for="(stage, si) in stages" :key="si">

              <!-- Connector from previous -->
              <div class="wfp-connector">
                <div class="wfp-connector-line"></div>
                <div class="wfp-connector-arrow"></div>
              </div>

              <!-- Stage block -->
              <div class="wfp-stage">
                <!-- Stage header pill -->
                <div class="wfp-stage-pill">
                  <span class="wfp-stage-pill-num">{{ si + 1 }}</span>
                  <span v-if="stage.length > 1" class="wfp-stage-pill-label">
                    Parallel · {{ stage.length }} tasks
                  </span>
                  <span v-else class="wfp-stage-pill-label">Sequential</span>
                </div>

                <!-- Nodes row -->
                <div class="wfp-nodes-row" :class="{ 'wfp-nodes-row--multi': stage.length > 1 }">

                  <!-- For parallel stages: the bracket lines -->
                  <template v-if="stage.length > 1">
                    <div class="wfp-parallel-bracket wfp-parallel-bracket--left"></div>
                    <div class="wfp-parallel-bracket wfp-parallel-bracket--right"></div>
                  </template>

                  <div
                    v-for="rp in stage"
                    :key="rp.personaId"
                    class="wfp-node"
                    :class="nodeClass(rp, stage)"
                  >
                    <!-- Avatar + name row -->
                    <div class="wfp-node-head">
                      <div class="wfp-node-avatar">{{ getPersonaEmoji(rp.personaId) }}</div>
                      <div class="wfp-node-identity">
                        <span class="wfp-node-name">{{ getPersonaName(rp.personaId) }}</span>
                        <!-- Condition badge (only if has deps) -->
                        <span
                          v-if="(rp.dependsOn || []).length > 0"
                          class="wfp-node-badge"
                          :class="`wfp-node-badge--${rp.runCondition || 'always'}`"
                        >
                          <span class="wfp-badge-dot" :class="`wfp-badge-dot--${rp.runCondition || 'always'}`"></span>
                          {{ conditionLabel(rp.runCondition) }}
                        </span>
                        <span v-else-if="stage.length > 1" class="wfp-node-badge wfp-node-badge--parallel">
                          <span class="wfp-badge-dot wfp-badge-dot--parallel"></span>
                          parallel
                        </span>
                      </div>
                    </div>

                    <!-- Prompt preview -->
                    <div v-if="rp.prompt" class="wfp-node-prompt">
                      {{ truncate(rp.prompt, 120) }}
                    </div>
                    <div v-else class="wfp-node-prompt wfp-node-prompt--empty">
                      No prompt set
                    </div>

                    <!-- Depends-on pills -->
                    <div v-if="(rp.dependsOn || []).length > 0" class="wfp-node-deps">
                      <span class="wfp-dep-label">Runs after:</span>
                      <span
                        v-for="depId in rp.dependsOn"
                        :key="depId"
                        class="wfp-dep-pill"
                      >{{ getPersonaEmoji(depId) }} {{ getPersonaName(depId) }}</span>
                    </div>

                    <!-- Output tokens used -->
                    <div v-if="outputTokensIn(rp).length > 0" class="wfp-node-tokens">
                      <span class="wfp-dep-label">Uses output:</span>
                      <span
                        v-for="name in outputTokensIn(rp)"
                        :key="name"
                        class="wfp-token-pill"
                      >{{ name }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Connector to END -->
            <div class="wfp-connector">
              <div class="wfp-connector-line"></div>
              <div class="wfp-connector-arrow"></div>
            </div>

            <!-- END node -->
            <div class="wfp-terminus wfp-terminus--end">
              <div class="wfp-terminus-dot wfp-terminus-dot--end"></div>
              <span>END</span>
            </div>

          </div>
        </div>

        <!-- Footer -->
        <div class="wfp-footer">
          <button class="wfp-close-btn" @click="$emit('close')">Close</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  personas:        { type: Array,    required: true },
  getPersonaName:  { type: Function, required: true },
  getPersonaEmoji: { type: Function, required: true },
})
defineEmits(['close'])

// ── Stage computation ─────────────────────────────────────────────────────────

const stages = computed(() => {
  if (!props.personas.length) return []
  const idxOf = {}
  props.personas.forEach((rp, i) => { idxOf[rp.personaId] = i })
  const stageOf = new Array(props.personas.length).fill(0)
  for (let i = 0; i < props.personas.length; i++) {
    for (const depId of (props.personas[i].dependsOn || [])) {
      const di = idxOf[depId]
      if (di !== undefined && stageOf[di] >= stageOf[i]) {
        stageOf[i] = stageOf[di] + 1
      }
    }
  }
  const maxStage = Math.max(...stageOf)
  return Array.from({ length: maxStage + 1 }, (_, s) =>
    props.personas.filter((_, i) => stageOf[i] === s)
  )
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function conditionLabel(cond) {
  if (cond === 'on_success') return 'on success'
  if (cond === 'on_failure') return 'on failure'
  return 'always'
}

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len).trimEnd() + '…' : str
}

// Extract {{output:Name}} tokens referenced in a persona's prompt
function outputTokensIn(rp) {
  const matches = (rp.prompt || '').match(/\{\{output:([^}]+)\}\}/g) || []
  return [...new Set(matches.map(m => m.replace(/^\{\{output:|\}\}$/g, '').trim()))]
}

function nodeClass(rp, stage) {
  if ((rp.dependsOn || []).length > 0) {
    if (rp.runCondition === 'on_success') return 'wfp-node--success'
    if (rp.runCondition === 'on_failure') return 'wfp-node--failure'
  }
  if (stage.length > 1) return 'wfp-node--parallel'
  return ''
}
</script>

<style>
/* ── Backdrop ──────────────────────────────────────────────────────────────── */
.wfp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.wfp-modal {
  background: #0A0A0A;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.7);
  animation: wfpIn 0.2s ease-out;
  overflow: hidden;
}
@keyframes wfpIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

/* ── Header ─────────────────────────────────────────────────────────────────── */
.wfp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1A1A1A;
  flex-shrink: 0;
}
.wfp-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.wfp-header-icon {
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
.wfp-title {
  font-family: 'Inter', sans-serif;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #FFFFFF;
}
.wfp-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  color: #4B5563;
  margin-top: 0.125rem;
}
.wfp-close {
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
.wfp-close:hover { background: rgba(255,255,255,0.12); color: #FFF; }

/* ── Legend ─────────────────────────────────────────────────────────────────── */
.wfp-legend {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 0.5rem 1.25rem;
  border-bottom: 1px solid #141414;
  flex-shrink: 0;
}
.wfp-legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #4B5563;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.wfp-legend-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.wfp-legend-dot--parallel { background: #3B82F6; }
.wfp-legend-dot--always   { background: #6B7280; }
.wfp-legend-dot--success  { background: #10B981; }
.wfp-legend-dot--failure  { background: #EF4444; }

/* ── Scrollable body ────────────────────────────────────────────────────────── */
.wfp-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.75rem 2rem;
}

/* ── Flow column ────────────────────────────────────────────────────────────── */
.wfp-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

/* ── Terminus (START / END) ─────────────────────────────────────────────────── */
.wfp-terminus {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #3A3A3A;
}
.wfp-terminus--end { color: #3A3A3A; }
.wfp-terminus-dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: #2A2A2A;
  border: 2px solid #3A3A3A;
}
.wfp-terminus-dot--end {
  background: #10B981;
  border-color: #10B981;
  box-shadow: 0 0 8px rgba(16,185,129,0.4);
}

/* ── Connector ──────────────────────────────────────────────────────────────── */
.wfp-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.wfp-connector-line {
  width: 1px;
  height: 2rem;
  background: linear-gradient(180deg, #2A2A2A 0%, #3A3A3A 100%);
}
.wfp-connector-arrow {
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid #3A3A3A;
}

/* ── Stage ──────────────────────────────────────────────────────────────────── */
.wfp-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.wfp-stage-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.1875rem 0.625rem;
  background: #141414;
  border: 1px solid #252525;
  border-radius: 9999px;
}
.wfp-stage-pill-num {
  width: 1rem;
  height: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1A1A1A, #374151);
  border-radius: 50%;
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 700;
  color: #FFF;
  flex-shrink: 0;
}
.wfp-stage-pill-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── Nodes row ──────────────────────────────────────────────────────────────── */
.wfp-nodes-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  gap: 0.625rem;
  position: relative;
}
.wfp-nodes-row--multi {
  padding-left: 1rem;
  padding-right: 1rem;
}

/* Bracket lines for parallel groups */
.wfp-parallel-bracket {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, transparent 0%, #3B82F6 20%, #3B82F6 80%, transparent 100%);
  border-radius: 2px;
}
.wfp-parallel-bracket--left  { left: 0; }
.wfp-parallel-bracket--right { right: 0; }

/* ── Individual node card ───────────────────────────────────────────────────── */
.wfp-node {
  background: #111111;
  border: 1px solid #252525;
  border-radius: 0.75rem;
  padding: 0.875rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  transition: border-color 0.15s;
}
.wfp-node--parallel {
  border-color: rgba(59,130,246,0.2);
  background: rgba(59,130,246,0.03);
}
.wfp-node--success {
  border-color: rgba(16,185,129,0.25);
  background: rgba(16,185,129,0.03);
}
.wfp-node--failure {
  border-color: rgba(239,68,68,0.2);
  background: rgba(239,68,68,0.03);
}

.wfp-node-head {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.wfp-node-avatar {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.0625rem;
  background: rgba(255,255,255,0.04);
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.06);
}
.wfp-node-identity {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
  min-width: 0;
}
.wfp-node-name {
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  font-weight: 700;
  color: #E5E7EB;
}

/* Condition / parallel badge */
.wfp-node-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.125rem 0.4375rem;
  border-radius: 9999px;
  width: fit-content;
}
.wfp-node-badge--always   { background: rgba(107,114,128,0.12); color: #9CA3AF; }
.wfp-node-badge--on_success { background: rgba(16,185,129,0.12); color: #34D399; }
.wfp-node-badge--on_failure { background: rgba(239,68,68,0.12);  color: #F87171; }
.wfp-node-badge--parallel   { background: rgba(59,130,246,0.12); color: #60A5FA; }

.wfp-badge-dot {
  width: 0.3125rem;
  height: 0.3125rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.wfp-badge-dot--always     { background: #6B7280; }
.wfp-badge-dot--on_success { background: #10B981; }
.wfp-badge-dot--on_failure { background: #EF4444; }
.wfp-badge-dot--parallel   { background: #3B82F6; }

/* Prompt preview */
.wfp-node-prompt {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  color: #6B7280;
  line-height: 1.55;
  padding: 0.5rem 0.625rem;
  background: rgba(255,255,255,0.02);
  border: 1px solid #1E1E1E;
  border-radius: 0.375rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.wfp-node-prompt--empty {
  color: #3A3A3A;
  font-style: italic;
}

/* Depends-on row */
.wfp-node-deps,
.wfp-node-tokens {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3125rem;
}
.wfp-dep-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #3A3A3A;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.wfp-dep-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.1875rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: #9CA3AF;
  background: rgba(255,255,255,0.04);
  border: 1px solid #2A2A2A;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}
.wfp-token-pill {
  display: inline-flex;
  align-items: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  color: #A78BFA;
  background: rgba(167,139,250,0.1);
  border: 1px solid rgba(167,139,250,0.2);
  padding: 0.125rem 0.4375rem;
  border-radius: 0.3125rem;
}

/* ── Footer ─────────────────────────────────────────────────────────────────── */
.wfp-footer {
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #141414;
  background: #070707;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
.wfp-close-btn {
  padding: 0.4375rem 1.25rem;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(255,255,255,0.65);
  cursor: pointer;
  transition: all 0.15s ease;
}
.wfp-close-btn:hover { background: rgba(255,255,255,0.12); color: #FFF; }
</style>
