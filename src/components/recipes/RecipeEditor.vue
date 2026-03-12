<template>
  <Teleport to="body">
    <div v-if="visible" class="re-backdrop">
      <div class="re-modal">

        <!-- ── Header ── -->
        <div class="re-header">
          <div class="re-header-left">
            <div class="re-header-icon">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <span class="re-header-title">{{ isNew ? 'New Scheduler' : 'Edit Scheduler' }}</span>
          </div>
          <button class="re-close-btn" @click="cancel" title="Close">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- ── Step bar ── -->
        <div class="re-stepbar">
          <button
            v-for="(s, i) in STEPS"
            :key="s.id"
            class="re-step"
            :class="{
              'is-active':    currentStep === i,
              'is-done':      currentStep > i,
              'is-clickable': i < maxReachedStep || currentStep > i,
            }"
            @click="goToStep(i)"
          >
            <div class="re-step-dot">
              <svg v-if="currentStep > i" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else>{{ i + 1 }}</span>
            </div>
            <span class="re-step-label">{{ s.label }}</span>
            <div v-if="i < STEPS.length - 1" class="re-step-connector" :class="{ 'is-done': currentStep > i }" />
          </button>
        </div>

        <!-- ── Step body ── -->
        <div class="re-body" ref="bodyRef">

          <!-- Step 1: Basic Info -->
          <template v-if="currentStep === 0">
            <div class="re-step-title">
              <div class="re-step-title-icon">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <div class="re-step-title-text">Basic Info</div>
                <div class="re-step-title-hint">Name your recipe and set its category</div>
              </div>
            </div>

            <div class="re-fields">
              <div class="re-field-row">
                <div class="re-field" style="flex:0 0 5rem;">
                  <label class="re-label">Icon</label>
                  <button class="re-icon-btn" @click="showIconPicker = true" type="button" title="Choose icon">
                    <span class="re-icon-btn-em">{{ draft.icon || '✍️' }}</span>
                  </button>
                </div>
                <div class="re-field" style="flex:1;">
                  <label class="re-label">Name <span class="re-req">*</span></label>
                  <input v-model="draft.name" type="text" class="re-input" placeholder="e.g. Title Workshop" maxlength="80" />
                </div>
              </div>

              <div class="re-field">
                <label class="re-label">Description</label>
                <input v-model="draft.description" type="text" class="re-input" placeholder="What does this recipe do?" maxlength="200" />
              </div>

              <div class="re-field">
                <label class="re-label">
                  Global Prompt
                  <span class="re-label-hint">— shared context injected into every persona</span>
                </label>
                <textarea
                  v-model="draft.globalPrompt"
                  class="re-textarea"
                  rows="5"
                  placeholder="Optional. Write shared instructions that apply to all personas. Use {{variable}} for input substitution."
                />
                <div class="re-enhance-row">
                  <button class="re-enhance-btn" @click="enhanceGlobalPrompt" :disabled="enhancingGlobal || !draft.globalPrompt">
                    <svg v-if="!enhancingGlobal" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    <svg v-else style="width:11px;height:11px;" class="re-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    AI Enhance
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- Step 2: Workflow -->
          <template v-if="currentStep === 1">
            <div class="re-step-title">
              <div class="re-step-title-icon">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><path d="M19 8h2m-1-1v2"/><path d="M3 8h2m-1-1v2"/></svg>
              </div>
              <div style="flex:1;">
                <div class="re-step-title-text">Workflow <span class="re-req">*</span></div>
                <div class="re-step-title-hint">Add personas and define their run order.</div>
              </div>
              <button
                v-if="draft.personas.length > 0"
                class="re-view-flow-btn"
                @click="showFlowPreview = true"
                type="button"
              >
                <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="11" x2="5" y2="16"/><line x1="12" y1="11" x2="19" y2="16"/></svg>
                View Flow
              </button>
            </div>

            <!-- Added persona cards -->
            <div v-for="(rp, idx) in draft.personas" :key="rp.personaId" class="re-persona-card">
              <div class="re-persona-card-header">
                <div class="re-persona-identity">
                  <div class="re-persona-avatar">{{ getPersonaEmoji(rp.personaId) }}</div>
                  <span class="re-persona-name">{{ getPersonaName(rp.personaId) }}</span>
                  <span class="re-persona-number">#{{ idx + 1 }}</span>
                </div>
                <button class="re-persona-remove" @click="removePersona(idx)" title="Remove">
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div class="re-field">
                <label class="re-label">Persona Prompt <span class="re-req">*</span></label>
                <textarea
                  v-model="rp.prompt"
                  class="re-textarea re-textarea-sm"
                  rows="4"
                  :placeholder="`Instructions specific to ${getPersonaName(rp.personaId)}.`"
                />
                <!-- Output token hints for dependent personas -->
                <div v-if="(rp.dependsOn || []).length > 0" class="re-output-tokens">
                  <span class="re-output-tokens-label">Available output tokens:</span>
                  <code
                    v-for="depId in rp.dependsOn"
                    :key="depId"
                    class="re-output-token"
                    :title="`Inserts the full output of ${getPersonaName(depId)}`"
                    @click="insertOutputToken(rp, depId)"
                  >&#123;&#123;output:{{ getPersonaName(depId) }}&rcub;&rcub;</code>
                </div>
                <div class="re-enhance-row">
                  <button class="re-enhance-btn" @click="enhancePersonaPrompt(idx)" :disabled="enhancingPersona === idx || !rp.prompt">
                    <svg v-if="enhancingPersona !== idx" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    <svg v-else style="width:11px;height:11px;" class="re-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    AI Enhance
                  </button>
                </div>
              </div>

              <!-- ── Dependencies ── -->
              <div v-if="idx > 0" class="re-dep-section">
                <button class="re-dep-toggle" @click="toggleDep(idx)" type="button">
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                  Run order
                  <span v-if="(rp.dependsOn || []).length > 0" class="re-dep-count">{{ (rp.dependsOn || []).length }} dep{{ (rp.dependsOn || []).length !== 1 ? 's' : '' }}</span>
                  <svg class="re-dep-chevron" :class="{ 'is-open': depOpen[idx] }" style="width:11px;height:11px;margin-left:auto;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                <div v-if="depOpen[idx]" class="re-dep-body">
                  <div class="re-dep-hint">
                    By default personas run in parallel. Set dependencies to create a sequence.
                  </div>

                  <div class="re-dep-field">
                    <label class="re-dep-label">Runs after</label>
                    <div class="re-dep-chips">
                      <button
                        v-for="prev in draft.personas.slice(0, idx)"
                        :key="prev.personaId"
                        type="button"
                        class="re-dep-chip"
                        :class="{ 'is-selected': (rp.dependsOn || []).includes(prev.personaId) }"
                        @click="toggleDepPersona(rp, prev.personaId)"
                      >
                        <span>{{ getPersonaEmoji(prev.personaId) }}</span>
                        {{ getPersonaName(prev.personaId) }}
                        <svg v-if="(rp.dependsOn || []).includes(prev.personaId)" style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                    </div>
                  </div>

                  <div v-if="(rp.dependsOn || []).length > 0" class="re-dep-field">
                    <label class="re-dep-label">Run condition</label>
                    <div class="re-dep-condition-row">
                      <button
                        v-for="c in RUN_CONDITIONS"
                        :key="c.id"
                        type="button"
                        class="re-dep-cond-btn"
                        :class="{ 'is-active': (rp.runCondition || 'always') === c.id }"
                        @click="rp.runCondition = c.id"
                      >
                        <span class="re-dep-cond-dot" :class="`re-dep-cond-dot--${c.id}`" />
                        {{ c.label }}
                      </button>
                    </div>
                    <div class="re-dep-cond-desc">{{ conditionDesc(rp) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Add persona button -->
            <button class="re-add-persona-btn" @click="openPersonaPicker" ref="addPersonaBtnRef">
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Persona
            </button>

            <p v-if="draft.personas.length === 0" class="re-step-hint-msg">
              Click "Add Persona" to choose from your existing personas.
            </p>
          </template>

          <!-- Step 3: Schedule -->
          <template v-if="currentStep === 2">
            <div class="re-step-title">
              <div class="re-step-title-icon">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <div class="re-step-title-text">Schedule <span class="re-optional">(optional)</span></div>
                <div class="re-step-title-hint">Run this recipe automatically on a cron schedule</div>
              </div>
            </div>

            <!-- Enable toggle row -->
            <div class="re-toggle-row">
              <div>
                <div class="re-toggle-row-label">Enable scheduling</div>
                <div class="re-toggle-row-hint">Recipe will run automatically based on the schedule below</div>
              </div>
              <div class="re-toggle" @click="draft.schedule.enabled = !draft.schedule.enabled" :class="{ 'on': draft.schedule.enabled }">
                <div class="re-toggle-knob" />
              </div>
            </div>

            <template v-if="draft.schedule.enabled">
              <div class="re-fields">
                <div class="re-field">
                  <label class="re-label">Frequency</label>
                  <div class="re-preset-grid">
                    <button
                      v-for="p in PRESETS"
                      :key="p.id"
                      :class="['re-preset-btn', draft.schedule.preset === p.id && 're-preset-btn--active']"
                      @click="selectPreset(p.id)"
                    >
                      <span class="re-preset-icon">{{ p.icon }}</span>
                      <span class="re-preset-label">{{ p.label }}</span>
                    </button>
                  </div>
                </div>

                <div v-if="draft.schedule.preset !== 'hourly' && draft.schedule.preset !== 'custom'" class="re-field-row">
                  <div v-if="draft.schedule.preset !== 'hourly'" class="re-field" style="flex:1;">
                    <label class="re-label">Time</label>
                    <input v-model="draft.schedule.time" type="time" class="re-input" @change="buildCron" />
                  </div>
                  <div v-if="draft.schedule.preset === 'weekly'" class="re-field" style="flex:1;">
                    <label class="re-label">Day of week</label>
                    <select v-model="draft.schedule.day" class="re-select" @change="buildCron">
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                      <option value="0">Sunday</option>
                    </select>
                  </div>
                </div>

                <div v-if="draft.schedule.preset === 'custom'" class="re-field">
                  <label class="re-label">Cron expression</label>
                  <input v-model="draft.schedule.cron" type="text" class="re-input re-input-mono" placeholder="0 9 * * *" />
                </div>

                <div class="re-field">
                  <label class="re-label">Timezone</label>
                  <select v-model="draft.schedule.timezone" class="re-select">
                    <option v-for="tz in TIMEZONES" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
                  </select>
                </div>

                <div v-if="draft.schedule.cron" class="re-cron-preview">
                  <span class="re-cron-label">Cron expression:</span>
                  <code class="re-cron-value">{{ draft.schedule.cron }}</code>
                </div>
              </div>
            </template>

            <p v-else class="re-step-hint-msg">
              Scheduling is disabled. You can always run this recipe manually from the Recipes catalog.
            </p>
          </template>

        </div>

        <!-- ── Footer ── -->
        <div class="re-footer">
          <div class="re-footer-left">
            <button v-if="currentStep > 0" class="re-nav-btn re-nav-btn--back" @click="prevStep">
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <button class="re-nav-btn re-nav-btn--cancel" @click="cancel">Cancel</button>
          </div>
          <div class="re-footer-right">
            <span v-if="!stepValid" class="re-footer-error">{{ stepError }}</span>
            <button
              v-if="currentStep < STEPS.length - 1"
              class="re-nav-btn re-nav-btn--next"
              @click="nextStep"
              :disabled="!stepValid"
            >
              Next
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button
              v-else
              class="re-save-btn"
              @click="save"
              :disabled="!canSave || isSaving"
            >
              <svg v-if="isSaving" style="width:14px;height:14px;" class="re-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <svg v-else style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              {{ isSaving ? 'Saving…' : 'Save Scheduler' }}
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- ── Icon / Emoji picker ── -->
    <EmojiPicker
      v-if="showIconPicker"
      :current="draft.icon"
      @select="draft.icon = $event; showIconPicker = false"
      @close="showIconPicker = false"
    />

    <!-- ── Persona picker — teleported to body so it's never clipped ── -->
    <div v-if="showPersonaPicker" class="re-picker-overlay" @click.self="showPersonaPicker = false">
      <div class="re-picker-panel" :style="pickerStyle">
        <div class="re-picker-header">
          <svg style="width:13px;height:13px;color:#9CA3AF;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            v-model="personaSearch"
            ref="personaSearchRef"
            type="text"
            class="re-picker-search"
            placeholder="Search personas…"
            @keydown.escape="showPersonaPicker = false"
          />
        </div>
        <div class="re-picker-list">
          <div
            v-for="p in filteredAvailablePersonas"
            :key="p.id"
            class="re-picker-item"
            @click="addPersona(p)"
          >
            <div class="re-picker-avatar">{{ p.avatar || '🤖' }}</div>
            <div class="re-picker-info">
              <span class="re-picker-name">{{ p.name }}</span>
              <span class="re-picker-desc">{{ p.description || 'No description' }}</span>
            </div>
            <svg style="width:13px;height:13px;color:rgba(255,255,255,0.2);flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <div v-if="filteredAvailablePersonas.length === 0" class="re-picker-empty">
            <svg style="width:20px;height:20px;color:#4B5563;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <span>{{ personaSearch ? 'No personas match your search' : 'All personas already added' }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Workflow preview modal (separate teleport so it layers above the editor) ── -->
  <WorkflowPreviewModal
    v-if="showFlowPreview"
    :personas="draft.personas"
    :get-persona-name="getPersonaName"
    :get-persona-emoji="getPersonaEmoji"
    @close="showFlowPreview = false"
  />
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { v4 as uuid } from 'uuid'
import { useAgentsStore } from '../../stores/agents'
import { useConfigStore } from '../../stores/config'
import EmojiPicker from '../agents/EmojiPicker.vue'
import WorkflowPreviewModal from './WorkflowPreviewModal.vue'

const agentsStore = useAgentsStore()
const configStore = useConfigStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  recipe:  { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

// ── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'basic',    label: 'Basic Info' },
  { id: 'workflow', label: 'Workflow'   },
  { id: 'schedule', label: 'Schedule'   },
]

const PRESETS = [
  { id: 'hourly', icon: '⏱', label: 'Every hour'  },
  { id: 'daily',  icon: '📅', label: 'Daily'       },
  { id: 'weekly', icon: '🗓', label: 'Weekly'      },
  { id: 'custom', icon: '⚙️', label: 'Custom cron' },
]

const currentStep    = ref(0)
const maxReachedStep = ref(0)
const bodyRef        = ref(null)
const showIconPicker   = ref(false)
const showFlowPreview  = ref(false)

function goToStep(i) {
  if (i <= maxReachedStep.value || i < currentStep.value) {
    currentStep.value = i
  }
}

function prevStep() {
  if (currentStep.value > 0) currentStep.value--
}

function nextStep() {
  if (!stepValid.value) return
  if (currentStep.value < STEPS.length - 1) {
    currentStep.value++
    if (currentStep.value > maxReachedStep.value) maxReachedStep.value = currentStep.value
    nextTick(() => bodyRef.value?.scrollTo({ top: 0 }))
  }
}

// Per-step validation
const stepValid = computed(() => {
  if (currentStep.value === 0) return draft.value.name.trim().length > 0
  if (currentStep.value === 1) {
    if (draft.value.personas.length === 0) return false
    return draft.value.personas.every(p => p.prompt.trim().length > 0)
  }
  return true
})

const stepError = computed(() => {
  if (currentStep.value === 0) return 'Name is required'
  if (currentStep.value === 1) {
    if (draft.value.personas.length === 0) return 'Add at least one persona'
    if (draft.value.personas.some(p => !p.prompt.trim())) return 'Each persona needs a prompt'
  }
  return ''
})

// ── Draft ────────────────────────────────────────────────────────────────────

const isNew = computed(() => !props.recipe)
const isSaving = ref(false)

function makeBlankDraft() {
  return {
    id:           uuid(),
    name:         '',
    icon:         '✍️',
    description:  '',
    globalPrompt: '',
    personas:     [],
    inputs:       [],
    schedule: {
      enabled:   false,
      preset:    'daily',
      time:      '09:00',
      day:       '1',
      cron:      '0 9 * * *',
      timezone:  'Asia/Shanghai',
      lastRunAt: null,
      nextRunAt: null,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

const draft = ref(makeBlankDraft())

watch([() => props.visible, () => props.recipe], ([vis]) => {
  if (!vis) return
  draft.value = props.recipe
    ? JSON.parse(JSON.stringify(props.recipe))
    : makeBlankDraft()
  if (!draft.value.personas)   draft.value.personas   = []
  if (!draft.value.inputs)     draft.value.inputs     = []
  if (!draft.value.schedule)   draft.value.schedule   = makeBlankDraft().schedule
  // Ensure legacy personas have dependency fields
  for (const rp of draft.value.personas) {
    if (!rp.dependsOn)    rp.dependsOn    = []
    if (!rp.runCondition) rp.runCondition = 'always'
  }
  currentStep.value    = 0
  maxReachedStep.value = 0
  depOpen.value        = {}
  showPersonaPicker.value = false
  personaSearch.value  = ''
}, { immediate: true })

const canSave = computed(() => {
  if (!draft.value.name.trim()) return false
  if (draft.value.personas.length === 0) return false
  return draft.value.personas.every(p => p.prompt.trim().length > 0)
})

// ── Persona picker ───────────────────────────────────────────────────────────

const showPersonaPicker  = ref(false)
const personaSearch      = ref('')
const personaSearchRef   = ref(null)
const addPersonaBtnRef   = ref(null)
const pickerStyle        = ref({})

const alreadyAddedIds = computed(() => new Set(draft.value.personas.map(p => p.personaId)))

const filteredAvailablePersonas = computed(() => {
  const q = personaSearch.value.toLowerCase()
  return agentsStore.systemAgents.filter(p =>
    !alreadyAddedIds.value.has(p.id) &&
    (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
  )
})

async function openPersonaPicker() {
  personaSearch.value = ''
  showPersonaPicker.value = true
  await nextTick()

  // Position the picker below the button
  const btn = addPersonaBtnRef.value
  if (btn) {
    const r = btn.getBoundingClientRect()
    const panelH = 320
    const spaceBelow = window.innerHeight - r.bottom - 8
    const top = spaceBelow >= panelH
      ? r.bottom + 8
      : Math.max(8, r.top - panelH - 8)
    pickerStyle.value = {
      position: 'fixed',
      top:  top + 'px',
      left: r.left + 'px',
      width: Math.max(r.width, 300) + 'px',
    }
  }

  await nextTick()
  personaSearchRef.value?.focus()
}

function addPersona(persona) {
  draft.value.personas.push({ personaId: persona.id, prompt: '', dependsOn: [], runCondition: 'always' })
  showPersonaPicker.value = false
}

function removePersona(idx) {
  const removedId = draft.value.personas[idx].personaId
  draft.value.personas.splice(idx, 1)
  // Clean up any dependencies pointing to the removed persona
  for (const rp of draft.value.personas) {
    if (rp.dependsOn) rp.dependsOn = rp.dependsOn.filter(id => id !== removedId)
  }
  // Clean up depOpen
  const newDepOpen = {}
  for (const [k, v] of Object.entries(depOpen.value)) {
    const ni = parseInt(k)
    if (ni < idx) newDepOpen[ni] = v
    else if (ni > idx) newDepOpen[ni - 1] = v
  }
  depOpen.value = newDepOpen
}

function getPersonaName(personaId) {
  return agentsStore.getAgentById(personaId)?.name || personaId
}

function getPersonaEmoji(personaId) {
  return agentsStore.getAgentById(personaId)?.avatar || '🤖'
}

// ── Dependency helpers ───────────────────────────────────────────────────────

const RUN_CONDITIONS = [
  { id: 'always',     label: 'Always' },
  { id: 'on_success', label: 'On success' },
  { id: 'on_failure', label: 'On failure' },
]

const depOpen = ref({})

function toggleDep(idx) {
  depOpen.value = { ...depOpen.value, [idx]: !depOpen.value[idx] }
}

function toggleDepPersona(rp, personaId) {
  if (!rp.dependsOn) rp.dependsOn = []
  const i = rp.dependsOn.indexOf(personaId)
  if (i === -1) rp.dependsOn.push(personaId)
  else rp.dependsOn.splice(i, 1)
  if (rp.dependsOn.length === 0) rp.runCondition = 'always'
}

function conditionDesc(rp) {
  const cond = rp.runCondition || 'always'
  const names = (rp.dependsOn || []).map(id => getPersonaName(id)).join(', ')
  if (cond === 'on_success') return `Runs only if ${names} succeeded`
  if (cond === 'on_failure') return `Runs only if ${names} failed`
  return `Runs after ${names} (regardless of outcome)`
}

// ── Output token insertion ────────────────────────────────────────────────────

function insertOutputToken(rp, depId) {
  const name = getPersonaName(depId)
  rp.prompt = (rp.prompt || '') + `{{output:${name}}}`
}

// ── Schedule ─────────────────────────────────────────────────────────────────

function buildCron() {
  const s = draft.value.schedule
  const [hh = '9', mm = '0'] = (s.time || '09:00').split(':')
  const h = parseInt(hh, 10) || 0
  const m = parseInt(mm, 10) || 0
  if (s.preset === 'hourly')      s.cron = `0 * * * *`
  else if (s.preset === 'daily')  s.cron = `${m} ${h} * * *`
  else if (s.preset === 'weekly') s.cron = `${m} ${h} * * ${s.day || '1'}`
}

function selectPreset(id) {
  draft.value.schedule.preset = id
  buildCron()
}

// ── AI Enhance ───────────────────────────────────────────────────────────────

const enhancingGlobal  = ref(false)
const enhancingPersona = ref(null)

async function enhanceGlobalPrompt() {
  if (!draft.value.globalPrompt || enhancingGlobal.value) return
  enhancingGlobal.value = true
  try {
    const result = await callEnhance(
      `Improve this recipe global prompt. Keep the intent and {{variable}} placeholders intact. Return only the improved prompt.\n\nOriginal:\n${draft.value.globalPrompt}`
    )
    if (result) draft.value.globalPrompt = result
  } finally {
    enhancingGlobal.value = false
  }
}

async function enhancePersonaPrompt(idx) {
  const rp = draft.value.personas[idx]
  if (!rp?.prompt || enhancingPersona.value === idx) return
  enhancingPersona.value = idx
  try {
    const name = getPersonaName(rp.personaId)
    const result = await callEnhance(
      `Improve this prompt for the persona '${name}'. Keep intent and {{variable}} placeholders. Return only the improved prompt.\n\nOriginal:\n${rp.prompt}`
    )
    if (result) rp.prompt = result
  } finally {
    enhancingPersona.value = null
  }
}

async function callEnhance(metaPrompt) {
  if (!window.electronAPI?.enhancePrompt) return null
  try {
    const raw  = configStore.config
    const prov = raw.defaultProvider || 'anthropic'
    const cfg  = { ...raw }
    if (prov === 'anthropic') {
      cfg.apiKey  = raw.anthropic?.apiKey  || ''
      cfg.baseURL = raw.anthropic?.baseURL || ''
    } else if (prov === 'openrouter') {
      cfg.apiKey  = raw.openrouter?.apiKey  || ''
      cfg.baseURL = raw.openrouter?.baseURL || ''
    } else if (prov === 'openai') {
      cfg.openaiApiKey  = raw.openai?.apiKey  || ''
      cfg.openaiBaseURL = raw.openai?.baseURL || ''
      cfg._resolvedProvider = 'openai'
      cfg.defaultProvider   = 'openai'
    } else if (prov === 'deepseek') {
      cfg.openaiApiKey  = raw.deepseek?.apiKey  || ''
      cfg.openaiBaseURL = (raw.deepseek?.baseURL || '').replace(/\/+$/, '')
      cfg._resolvedProvider = 'openai'
      cfg._directAuth       = true
      cfg.defaultProvider   = 'openai'
    }
    const res = await window.electronAPI.enhancePrompt({ prompt: metaPrompt, config: JSON.parse(JSON.stringify(cfg)) })
    return res?.enhanced || null
  } catch (err) {
    console.warn('[RecipeEditor] enhance error:', err)
    return null
  }
}

// ── Save / Cancel ─────────────────────────────────────────────────────────────

async function save() {
  if (!canSave.value || isSaving.value) return
  isSaving.value = true
  try {
    draft.value.updatedAt = new Date().toISOString()
    if (!draft.value.createdAt) draft.value.createdAt = draft.value.updatedAt
    if (draft.value.schedule.enabled && draft.value.schedule.preset !== 'custom') buildCron()
    emit('saved', JSON.parse(JSON.stringify(draft.value)))
  } finally {
    isSaving.value = false
  }
}

function cancel() {
  showPersonaPicker.value = false
  emit('close')
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showPersonaPicker.value) { showPersonaPicker.value = false; return }
    cancel()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: 'UTC',                 label: 'UTC' },
  { value: 'America/New_York',    label: 'America/New_York (ET)' },
  { value: 'America/Chicago',     label: 'America/Chicago (CT)' },
  { value: 'America/Denver',      label: 'America/Denver (MT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PT)' },
  { value: 'America/Sao_Paulo',   label: 'America/Sao_Paulo (BRT)' },
  { value: 'Europe/London',       label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris',        label: 'Europe/Paris (CET)' },
  { value: 'Europe/Berlin',       label: 'Europe/Berlin (CET)' },
  { value: 'Europe/Moscow',       label: 'Europe/Moscow (MSK)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (SAST)' },
  { value: 'Asia/Dubai',          label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Kolkata',        label: 'Asia/Kolkata (IST)' },
  { value: 'Asia/Bangkok',        label: 'Asia/Bangkok (ICT)' },
  { value: 'Asia/Singapore',      label: 'Asia/Singapore (SGT)' },
  { value: 'Asia/Shanghai',       label: 'Asia/Shanghai (CST)' },
  { value: 'Asia/Tokyo',          label: 'Asia/Tokyo (JST)' },
  { value: 'Asia/Seoul',          label: 'Asia/Seoul (KST)' },
  { value: 'Australia/Sydney',    label: 'Australia/Sydney (AEST)' },
  { value: 'Pacific/Auckland',    label: 'Pacific/Auckland (NZST)' },
  { value: 'Pacific/Honolulu',    label: 'Pacific/Honolulu (HST)' },
]
</script>

<style>
/* ── Backdrop + modal ──────────────────────────────────────────────────────── */
.re-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.re-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: 100%;
  max-width: 660px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px rgba(0,0,0,0.55);
  animation: reModalIn 0.2s ease-out;
  overflow: hidden;
  transition: max-width 0.25s ease;
  /* Ensure GPU layer respects border-radius during scale animation */
  will-change: transform;
  transform: translateZ(0);
  -webkit-mask-image: -webkit-radial-gradient(white, black);
}
@keyframes reModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
}

/* ── Header ─────────────────────────────────────────────────────────────────── */
.re-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1E1E1E;
  flex-shrink: 0;
}
.re-header-left { display: flex; align-items: center; gap: 0.625rem; }
.re-header-icon {
  width: 2rem; height: 2rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.5rem;
  color: #FFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.re-header-title {
  font-family: 'Inter', sans-serif;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #FFFFFF;
}
.re-close-btn {
  width: 1.875rem; height: 1.875rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.06);
  border: none; border-radius: 0.375rem;
  color: rgba(255,255,255,0.45);
  cursor: pointer; transition: all 0.15s ease;
}
.re-close-btn:hover { background: rgba(255,255,255,0.12); color: #FFF; }

/* ── Step bar ────────────────────────────────────────────────────────────────── */
.re-stepbar {
  display: flex;
  align-items: center;
  padding: 0.875rem 1.5rem;
  border-bottom: 1px solid #1E1E1E;
  flex-shrink: 0;
  gap: 0;
}
.re-step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  cursor: default;
  padding: 0;
  flex: 1;
  position: relative;
}
.re-step.is-clickable { cursor: pointer; }
.re-step-dot {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: 2px solid #3A3A3A;
  background: #0F0F0F;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 700;
  color: #6B7280;
  flex-shrink: 0;
  transition: all 0.2s ease;
}
.re-step.is-active .re-step-dot {
  border-color: #FFFFFF;
  background: #FFFFFF;
  color: #0F0F0F;
}
.re-step.is-done .re-step-dot {
  border-color: #10B981;
  background: #10B981;
  color: #FFF;
}
.re-step-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: #4B5563;
  white-space: nowrap;
  transition: color 0.2s ease;
}
.re-step.is-active .re-step-label { color: #FFFFFF; }
.re-step.is-done  .re-step-label { color: #10B981; }

.re-step-connector {
  flex: 1;
  height: 1px;
  background: #2A2A2A;
  margin: 0 0.5rem;
  transition: background 0.2s ease;
}
.re-step-connector.is-done { background: #10B981; }
/* Last step has no connector */
.re-step:last-child .re-step-connector { display: none; }

/* ── Body ────────────────────────────────────────────────────────────────────── */
.re-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

/* Step title block */
.re-step-title {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #1E1E1E;
}
.re-step-title-icon {
  width: 2.25rem; height: 2.25rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
  border-radius: 0.5rem;
  color: rgba(255,255,255,0.85);
  flex-shrink: 0;
}
.re-step-title-text {
  font-family: 'Inter', sans-serif;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #FFFFFF;
}
.re-step-title-hint {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  color: #6B7280;
  margin-top: 0.125rem;
}

/* ── Fields ──────────────────────────────────────────────────────────────────── */
.re-fields { display: flex; flex-direction: column; gap: 0.875rem; }
.re-field  { display: flex; flex-direction: column; gap: 0.3125rem; }
.re-field-row { display: flex; gap: 0.75rem; }

.re-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: #9CA3AF;
}
.re-label-hint {
  font-weight: 400;
  color: #6B7280;
  font-size: 0.6875rem;
}
.re-req     { color: #EF4444; }
.re-optional { font-size: 0.75rem; font-weight: 400; color: #6B7280; margin-left: 0.25rem; }
.re-code { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: #10B981; background: rgba(16,185,129,0.1); padding: 0.0625rem 0.25rem; border-radius: 0.25rem; }

.re-input {
  background: #171717;
  border: 1px solid #2A2A2A;
  border-radius: 0.4375rem;
  padding: 0.5rem 0.75rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  color: #FFFFFF;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.re-input:focus { border-color: #4B5563; box-shadow: 0 0 0 2px rgba(75,85,99,0.25); }
.re-input-center { text-align: center; }
.re-input-mono { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }
.re-input-sm { padding: 0.3125rem 0.5rem; font-size: 0.75rem; }

.re-var-hint {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #10B981;
  background: rgba(16,185,129,0.08);
  border: 1px solid rgba(16,185,129,0.15);
  border-radius: 0.3125rem;
  padding: 0.125rem 0.4rem;
  display: inline-block;
  margin-bottom: 0.3125rem;
}

.re-icon-btn {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.re-icon-btn:hover { border-color: #4B5563; background: #222222; }
.re-icon-btn-em { font-size: 1.625rem; line-height: 1; }

.re-select {
  background: #171717;
  border: 1px solid #2A2A2A;
  border-radius: 0.4375rem;
  padding: 0.5rem 0.75rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  color: #FFFFFF;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.re-select:focus { border-color: #4B5563; }
.re-select option { background: #1A1A1A; }
.re-select-sm { padding: 0.3125rem 0.5rem; font-size: 0.75rem; }

.re-textarea {
  background: #171717;
  border: 1px solid #2A2A2A;
  border-radius: 0.4375rem;
  padding: 0.625rem 0.75rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  color: #FFFFFF;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  outline: none;
  line-height: 1.55;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.re-textarea:focus { border-color: #4B5563; box-shadow: 0 0 0 2px rgba(75,85,99,0.25); }
.re-textarea-sm { min-height: 5rem; }

/* Pill toggle */
.re-pill-toggle { display: flex; border: 1px solid #2A2A2A; border-radius: 0.4375rem; overflow: hidden; }
.re-pill {
  flex: 1; padding: 0.5rem 0.75rem;
  background: transparent; border: none; cursor: pointer;
  font-family: 'Inter', sans-serif; font-size: 0.75rem; font-weight: 600;
  color: #6B7280; transition: all 0.15s ease;
}
.re-pill + .re-pill { border-left: 1px solid #2A2A2A; }
.re-pill:hover { color: #FFF; background: rgba(255,255,255,0.06); }
.re-pill--active { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #FFF; }

/* Enhance */
.re-enhance-row { display: flex; justify-content: flex-end; margin-top: 0.25rem; }
.re-enhance-btn {
  display: inline-flex; align-items: center; gap: 0.3125rem;
  padding: 0.3125rem 0.625rem;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: 0.75rem; font-weight: 600;
  color: rgba(255,255,255,0.55); cursor: pointer; transition: all 0.15s ease;
}
.re-enhance-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #FFF; }
.re-enhance-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Persona cards ───────────────────────────────────────────────────────────── */
.re-persona-card {
  background: #171717;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.re-persona-card-header {
  display: flex; align-items: center; justify-content: space-between;
}
.re-persona-identity { display: flex; align-items: center; gap: 0.5rem; }
.re-persona-avatar {
  width: 2rem; height: 2rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
  border-radius: 50%; font-size: 0.9375rem; flex-shrink: 0;
}
.re-persona-name {
  font-family: 'Inter', sans-serif; font-size: 0.875rem; font-weight: 700; color: #FFFFFF;
}
.re-persona-number {
  font-family: 'Inter', sans-serif; font-size: 0.75rem; color: #4B5563;
}
.re-persona-remove {
  width: 1.625rem; height: 1.625rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(239,68,68,0.1); border: none; border-radius: 0.3125rem;
  color: #EF4444; cursor: pointer; transition: all 0.15s ease;
}
.re-persona-remove:hover { background: rgba(239,68,68,0.22); }

/* ── Dependency section ───────────────────────────────────────────────────── */
.re-dep-section {
  margin-top: 0.5rem;
  border-top: 1px solid #2A2A2A;
  padding-top: 0.5rem;
}

.re-dep-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.3125rem 0;
  background: transparent;
  border: none;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: #9CA3AF;
  cursor: pointer;
  transition: color 0.15s ease;
}
.re-dep-toggle:hover { color: #D1D5DB; }

.re-dep-count {
  font-size: 0.6875rem;
  background: rgba(59,130,246,0.15);
  color: #60A5FA;
  padding: 0.0625rem 0.3125rem;
  border-radius: 9999px;
}

.re-dep-chevron {
  transition: transform 0.15s ease;
}
.re-dep-chevron.is-open {
  transform: rotate(180deg);
}

.re-dep-body {
  padding: 0.5rem 0 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.re-dep-hint {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  color: #6B7280;
  line-height: 1.4;
}

.re-dep-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.re-dep-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.re-dep-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.re-dep-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  color: #9CA3AF;
  cursor: pointer;
  transition: all 0.15s ease;
}
.re-dep-chip:hover {
  background: rgba(255,255,255,0.1);
  color: #E5E7EB;
}
.re-dep-chip.is-selected {
  background: rgba(59,130,246,0.2);
  border-color: rgba(59,130,246,0.4);
  color: #93C5FD;
}

.re-dep-condition-row {
  display: flex;
  gap: 0.375rem;
}

.re-dep-cond-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.3125rem 0.625rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s ease;
}
.re-dep-cond-btn:hover { background: rgba(255,255,255,0.09); color: #D1D5DB; }
.re-dep-cond-btn.is-active {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.2);
  color: #F9FAFB;
}

.re-dep-cond-dot {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.re-dep-cond-dot--always     { background: #6B7280; }
.re-dep-cond-dot--on_success { background: #10B981; }
.re-dep-cond-dot--on_failure { background: #EF4444; }

.re-dep-cond-desc {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  color: #6B7280;
  font-style: italic;
}

.re-add-persona-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: rgba(255,255,255,0.05); border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; font-weight: 600;
  color: rgba(255,255,255,0.6); cursor: pointer; transition: all 0.15s ease;
  align-self: flex-start;
}
.re-add-persona-btn:hover { background: rgba(255,255,255,0.09); color: #FFF; border-color: rgba(255,255,255,0.35); }

.re-step-hint-msg {
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; color: #4B5563;
  text-align: center; padding: 1.5rem 0;
  margin: 0;
}

/* ── View Flow button ─────────────────────────────────────────────────────── */
.re-view-flow-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3125rem 0.75rem;
  background: rgba(167,139,250,0.1);
  border: 1px solid rgba(167,139,250,0.25);
  border-radius: 0.4375rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: #A78BFA;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.re-view-flow-btn:hover {
  background: rgba(167,139,250,0.2);
  border-color: rgba(167,139,250,0.45);
  color: #C4B5FD;
}

/* ── Output token hints ───────────────────────────────────────────────────── */
.re-output-tokens {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.375rem;
}
.re-output-tokens-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #4B5563;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.re-output-token {
  display: inline-flex;
  align-items: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  color: #A78BFA;
  background: rgba(167,139,250,0.1);
  border: 1px solid rgba(167,139,250,0.25);
  border-radius: 0.3125rem;
  padding: 0.125rem 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.re-output-token:hover {
  background: rgba(167,139,250,0.2);
  border-color: rgba(167,139,250,0.45);
  color: #C4B5FD;
}

/* ── Inputs cards ─────────────────────────────────────────────────────────────── */
.re-inputs-tip {
  display: flex;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  background: rgba(59,130,246,0.07);
  border: 1px solid rgba(59,130,246,0.18);
  border-radius: 0.625rem;
  color: #60A5FA;
  margin-bottom: 0.75rem;
}
.re-inputs-tip-title {
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; font-weight: 700;
  color: #93C5FD; margin-bottom: 0.25rem;
}
.re-inputs-tip-body {
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; color: rgba(147,197,253,0.8); line-height: 1.5;
}
.re-inputs-tip-eg {
  display: block; margin-top: 0.375rem; color: rgba(147,197,253,0.65);
}

.re-input-card-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  background: #171717;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  padding: 0.875rem;
  margin-bottom: 0.5rem;
}
.re-input-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.re-input-card-fields {
  display: flex;
  gap: 0.625rem;
}
.re-input-card-remove {
  width: 1.875rem; height: 1.875rem; flex-shrink: 0; margin-top: 0.125rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(239,68,68,0.08); border: none; border-radius: 0.375rem;
  color: #EF4444; cursor: pointer; transition: all 0.15s ease;
}
.re-input-card-remove:hover { background: rgba(239,68,68,0.18); }

.re-add-input-btn {
  display: inline-flex; align-items: center; gap: 0.3125rem;
  padding: 0.375rem 0.75rem;
  background: rgba(255,255,255,0.05); border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; font-weight: 600;
  color: rgba(255,255,255,0.6); cursor: pointer; transition: all 0.15s ease;
  align-self: flex-start;
}
.re-add-input-btn:hover { background: rgba(255,255,255,0.09); color: #FFF; border-color: rgba(255,255,255,0.35); }

/* ── Schedule ─────────────────────────────────────────────────────────────────── */
.re-toggle-row {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.875rem 1rem;
  background: #171717; border: 1px solid #2A2A2A; border-radius: 0.75rem;
}
.re-toggle-row-label { font-family: 'Inter', sans-serif; font-size: 0.875rem; font-weight: 600; color: #FFFFFF; }
.re-toggle-row-hint  { font-family: 'Inter', sans-serif; font-size: 0.75rem; color: #6B7280; margin-top: 0.125rem; }
.re-toggle {
  width: 2.75rem; height: 1.5rem;
  background: #333; border-radius: 9999px;
  position: relative; cursor: pointer; flex-shrink: 0;
  transition: background 0.2s ease;
}
.re-toggle.on { background: #3B82F6; }
.re-toggle-knob {
  position: absolute; top: 0.1875rem; left: 0.1875rem;
  width: 1.125rem; height: 1.125rem;
  background: #FFF; border-radius: 50%;
  transition: transform 0.2s ease;
}
.re-toggle.on .re-toggle-knob { transform: translateX(1.25rem); }

/* Preset grid */
.re-preset-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem;
}
.re-preset-btn {
  display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
  padding: 0.625rem 0.5rem;
  background: #171717; border: 1px solid #2A2A2A; border-radius: 0.5rem;
  cursor: pointer; transition: all 0.15s ease;
}
.re-preset-btn:hover { border-color: #4B5563; background: #1F1F1F; }
.re-preset-btn--active {
  border-color: #FFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
}
.re-preset-icon { font-size: 1.125rem; line-height: 1; }
.re-preset-label { font-family: 'Inter', sans-serif; font-size: 0.6875rem; font-weight: 600; color: #9CA3AF; }
.re-preset-btn--active .re-preset-label { color: rgba(255,255,255,0.8); }

.re-cron-preview {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.5rem 0.875rem;
  background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.2);
  border-radius: 0.375rem;
}
.re-cron-label { font-size: 0.75rem; color: #6B7280; font-family: 'Inter', sans-serif; }
.re-cron-value { font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem; color: #10B981; }

/* ── Footer ───────────────────────────────────────────────────────────────────── */
.re-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid #1E1E1E;
  background: #0A0A0A;
  flex-shrink: 0;
  gap: 0.75rem;
}
.re-footer-left  { display: flex; align-items: center; gap: 0.5rem; }
.re-footer-right { display: flex; align-items: center; gap: 0.75rem; }
.re-footer-error {
  font-family: 'Inter', sans-serif; font-size: 0.75rem; color: #EF4444;
}

.re-nav-btn {
  display: inline-flex; align-items: center; gap: 0.3125rem;
  padding: 0.4375rem 0.875rem;
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; font-weight: 600;
  border-radius: 0.5rem; cursor: pointer; transition: all 0.15s ease;
}
.re-nav-btn--back, .re-nav-btn--cancel {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.65);
}
.re-nav-btn--back:hover, .re-nav-btn--cancel:hover {
  background: rgba(255,255,255,0.1); color: #FFF;
}
.re-nav-btn--next {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  color: #FFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}
.re-nav-btn--next:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.re-nav-btn--next:disabled { opacity: 0.35; cursor: not-allowed; }

.re-save-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.5rem 1.125rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: 0.875rem; font-weight: 600;
  color: #FFF; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  transition: all 0.15s ease;
}
.re-save-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.re-save-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Persona picker (teleported, fixed position) ─────────────────────────────── */
.re-picker-overlay {
  position: fixed; inset: 0; z-index: 500;
}
.re-picker-panel {
  background: #0A0A0A;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3);
  overflow: hidden;
  max-height: 20rem;
  display: flex;
  flex-direction: column;
  z-index: 501;
}
.re-picker-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid #2A2A2A;
  flex-shrink: 0;
}
.re-picker-search {
  flex: 1; background: transparent; border: none; outline: none;
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; color: #FFF;
}
.re-picker-search::placeholder { color: #4B5563; }
.re-picker-list { flex: 1; overflow-y: auto; }
.re-picker-item {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.625rem 0.875rem;
  cursor: pointer; transition: background 0.1s ease;
}
.re-picker-item:hover { background: rgba(255,255,255,0.06); }
.re-picker-avatar {
  width: 2.125rem; height: 2.125rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
  border-radius: 50%; font-size: 0.9375rem; flex-shrink: 0;
}
.re-picker-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.re-picker-name { font-family: 'Inter', sans-serif; font-size: 0.8125rem; font-weight: 600; color: #FFF; }
.re-picker-desc {
  font-family: 'Inter', sans-serif; font-size: 0.75rem; color: #6B7280;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.re-picker-empty {
  display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
  padding: 1.5rem 1rem; text-align: center;
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; color: #4B5563;
}

/* ── Misc ─────────────────────────────────────────────────────────────────────── */
@keyframes re-spin { to { transform: rotate(360deg); } }
.re-spin { animation: re-spin 0.8s linear infinite; }
</style>
