<template>
  <Teleport to="body">
    <div v-if="visible" class="te-backdrop">
      <div class="te-modal">

        <!-- Header -->
        <div class="te-header">
          <div class="te-header-left">
            <div class="te-header-icon">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
            <span class="te-header-title">{{ isNew ? 'New Task' : 'Edit Task' }}</span>
          </div>
          <button class="te-close-btn" @click="cancel">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Body: two-column -->
        <div class="te-columns">

          <!-- Left: form -->
          <div class="te-body">

            <!-- Name + Icon row -->
            <div class="te-field-row">
              <button class="te-icon-btn" @click="showEmojiPicker = true" title="Change icon">{{ draft.icon }}</button>
              <EmojiPicker v-if="showEmojiPicker" :current="draft.icon" @select="e => { draft.icon = e; showEmojiPicker = false }" @close="showEmojiPicker = false" />
              <div class="te-field te-field-grow">
                <label class="te-label">Task name <span class="te-required">*</span></label>
                <input v-model="draft.name" class="te-input" placeholder="e.g. Send daily report" maxlength="80" />
              </div>
            </div>

            <!-- Description -->
            <div class="te-field">
              <label class="te-label">Description</label>
              <input v-model="draft.description" class="te-input" placeholder="What does this task accomplish?" maxlength="200" />
            </div>

            <!-- Prompt -->
            <div class="te-field">
              <div class="te-label-row">
                <label class="te-label">
                  Prompt <span class="te-required">*</span>
                  <span class="te-label-hint">Use @PersonaName to address personas directly.</span>
                </label>
                <button
                  class="te-describe-btn"
                  @click="showDescribePanel = !showDescribePanel; describeInput = ''; describeError = ''"
                  :disabled="!draft.name.trim()"
                  title="Let AI draft the prompt"
                >
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  Describe it
                </button>
              </div>

              <!-- Inline describe panel -->
              <div v-if="showDescribePanel" class="te-describe-panel">
                <textarea
                  v-model="describeInput"
                  class="te-describe-textarea"
                  placeholder='Describe what this task should do... e.g. "pull latest GitHub issues, summarize them, post to Slack"'
                  rows="3"
                  autofocus
                ></textarea>
                <div v-if="describeError" class="te-describe-error">{{ describeError }}</div>
                <div class="te-describe-actions">
                  <button
                    class="te-gen-btn"
                    @click="generatePrompt"
                    :disabled="describeLoading"
                  >
                    <svg v-if="describeLoading" class="te-spin" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    <svg v-else style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    {{ describeLoading ? 'Generating…' : 'Generate' }}
                  </button>
                  <button
                    class="te-cancel-inline-btn"
                    @click="showDescribePanel = false; describeInput = ''"
                    :disabled="describeLoading"
                  >Cancel</button>
                </div>
              </div>

              <textarea
                v-model="draft.prompt"
                class="te-textarea"
                rows="6"
                placeholder="@analyst review today's market data and @writer draft a summary..."
              />
            </div>

          </div>

          <!-- Right: used in plans -->
          <div class="te-plans-col">
            <div class="te-plans-label">Used in plans</div>
            <div v-if="usedInPlans.length === 0" class="te-plans-empty">Not used in any plan</div>
            <div v-else class="te-plans-list">
              <button
                v-for="plan in usedInPlans"
                :key="plan.id"
                class="te-plan-row"
                @click="$emit('open-plan', plan)"
              >
                <span class="te-plan-icon">{{ plan.icon || '📋' }}</span>
                <div class="te-plan-info">
                  <span class="te-plan-name">{{ plan.name }}</span>
                  <span class="te-plan-steps">{{ plan.steps?.length || 0 }} step{{ plan.steps?.length === 1 ? '' : 's' }}</span>
                </div>
                <svg style="width:12px;height:12px;flex-shrink:0;color:rgba(255,255,255,0.3);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

        </div><!-- /te-columns -->

        <!-- Footer -->
        <div class="te-footer">
          <button class="te-cancel-btn" @click="cancel">Cancel</button>
          <button class="te-save-btn" @click="save" :disabled="!canSave">
            {{ isNew ? 'Create Task' : 'Save' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { v4 as uuid } from 'uuid'
import EmojiPicker from '../personas/EmojiPicker.vue'
import { useConfigStore } from '../../stores/config'

const props = defineProps({
  visible: Boolean,
  task:    { type: Object, default: null },
  plans:   { type: Array,  default: () => [] },
})
const emit = defineEmits(['close', 'saved', 'open-plan'])

const usedInPlans = computed(() => {
  if (!props.task?.id || !props.plans.length) return []
  return props.plans.filter(p =>
    (p.steps || []).some(s => s.taskId === props.task.id)
  )
})

const configStore = useConfigStore()
const DEFAULT_ICON = '✍️'
const showEmojiPicker = ref(false)
const showDescribePanel = ref(false)
const describeInput = ref('')
const describeLoading = ref(false)
const describeError = ref('')

const isNew = computed(() => !props.task?.id)

const makeDraft = (task) => ({
  id:          task?.id || uuid(),
  name:        task?.name || '',
  description: task?.description || '',
  icon:        task?.icon || DEFAULT_ICON,
  prompt:      task?.prompt || '',
})

const draft = ref(makeDraft(props.task))

watch(() => props.visible, (v) => {
  if (v) {
    draft.value = makeDraft(props.task)
    showEmojiPicker.value = false
    showDescribePanel.value = false
    describeInput.value = ''
    describeError.value = ''
  }
})

async function generatePrompt() {
  describeLoading.value = true
  describeError.value = ''
  try {
    const userDesc = describeInput.value.trim()
    const result = await window.electronAPI.enhancePrompt({
      prompt: `You are helping write a task prompt for an AI agent workflow.
Task name: "${draft.value.name}"${draft.value.description ? `\nTask description: "${draft.value.description}"` : ''}${userDesc ? `\nUser description: "${userDesc}"` : ''}

Write a clear, actionable prompt that an AI agent should follow to complete this task.
The prompt should be concise (2-4 sentences), specific, and use @PersonaName if multiple agents may be involved.
Respond with ONLY the prompt text, nothing else.`,
      config: JSON.parse(JSON.stringify(configStore.config)),
    })
    if (result.success) {
      draft.value.prompt = result.text.trim().replace(/^["']|["']$/g, '')
      showDescribePanel.value = false
      describeInput.value = ''
    } else {
      describeError.value = result.error || 'Failed to generate prompt'
    }
  } catch (e) {
    describeError.value = e.message
  } finally {
    describeLoading.value = false
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showEmojiPicker.value) { showEmojiPicker.value = false; return }
    if (showDescribePanel.value) { showDescribePanel.value = false; describeInput.value = ''; return }
    cancel()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const canSave = computed(() => {
  if (!draft.value.name.trim()) return false
  if (!draft.value.prompt.trim()) return false
  return true
})

function save() {
  if (!canSave.value) return
  emit('saved', JSON.parse(JSON.stringify(draft.value)))
}

function cancel() {
  emit('close')
}
</script>

<style>
/* Unscoped — teleported outside component DOM */
.te-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.te-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: 90vw; max-width: 90vw;
  height: 90vh; max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  animation: teModalIn 0.2s ease-out;
  overflow: hidden;
}
@keyframes teModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.te-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #1E1E1E;
  flex-shrink: 0;
}
.te-header-left {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.te-header-icon {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.5rem;
  color: #FFFFFF;
  border: 1px solid #2A2A2A;
}
.te-header-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #FFFFFF;
}
.te-close-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.5rem;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.15s ease;
}
.te-close-btn:hover { background: rgba(255,255,255,0.12); color: #FFFFFF; }

/* Two-column wrapper */
.te-columns {
  flex: 1; display: flex; flex-direction: row; min-height: 0; overflow: hidden;
}

.te-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  scrollbar-width: thin;
  scrollbar-color: #2A2A2A transparent;
  border-right: 1px solid #1E1E1E;
}

/* Right: used-in-plans panel */
.te-plans-col {
  width: 16rem; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 0.625rem;
  padding: 1.5rem 1rem;
  overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #2A2A2A transparent;
}
.te-plans-label {
  font-family: 'Inter', sans-serif; font-size: 0.6875rem; font-weight: 600;
  color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em;
  flex-shrink: 0;
}
.te-plans-empty {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: rgba(255,255,255,0.25);
  font-style: italic;
}
.te-plans-list { display: flex; flex-direction: column; gap: 0.375rem; }
.te-plan-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  background: rgba(255,255,255,0.04); border: 1px solid #1E1E1E; border-radius: 0.5rem;
  cursor: pointer; transition: all 0.15s; text-align: left; width: 100%;
}
.te-plan-row:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: #374151;
}
.te-plan-icon { font-size: 1rem; line-height: 1; flex-shrink: 0; }
.te-plan-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.125rem; }
.te-plan-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.te-plan-row:hover .te-plan-name { color: #FFFFFF; }
.te-plan-steps { font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: rgba(255,255,255,0.35); }
.te-plan-row:hover .te-plan-steps { color: rgba(255,255,255,0.6); }

.te-field { display: flex; flex-direction: column; gap: 0.375rem; }
.te-field-grow { flex: 1; }
.te-field-row { display: flex; align-items: flex-end; gap: 0.625rem; }

.te-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.te-required { color: #EF4444; }
.te-label-hint {
  font-weight: 400;
  font-size: var(--fs-small);
  color: rgba(255,255,255,0.35);
  font-style: italic;
}

.te-input {
  padding: 0.5625rem 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #FFFFFF;
  outline: none;
  transition: border-color 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}
.te-input::placeholder { color: rgba(255,255,255,0.25); }
.te-input:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(255,255,255,0.04); }

.te-textarea {
  padding: 0.5625rem 0.75rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #FFFFFF;
  outline: none;
  resize: vertical;
  min-height: 7rem;
  width: 100%;
  box-sizing: border-box;
  line-height: 1.6;
  transition: border-color 0.15s ease;
}
.te-textarea::placeholder { color: rgba(255,255,255,0.25); }
.te-textarea:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(255,255,255,0.04); }

.te-icon-btn {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.te-icon-btn:hover { background: #242424; }


.te-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #1A1A1A;
  background: #0A0A0A;
  border-radius: 0 0 1rem 1rem;
  flex-shrink: 0;
}
.te-cancel-btn {
  padding: 0.4375rem 0.875rem;
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
.te-cancel-btn:hover { background: rgba(255,255,255,0.12); color: #FFFFFF; }
.te-save-btn {
  padding: 0.4375rem 1.125rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.te-save-btn:hover:not(:disabled) { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.te-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.te-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.te-describe-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.625rem;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}
.te-describe-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #FFFFFF; }
.te-describe-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Inline describe panel */
.te-describe-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
}
.te-describe-textarea {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  background: #1A1A1A;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #FFFFFF;
  outline: none;
  resize: none;
  line-height: 1.5;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.te-describe-textarea:focus { border-color: #4B5563; }
.te-describe-textarea::placeholder { color: #4B5563; }
.te-describe-error {
  font-size: var(--fs-small);
  color: #EF4444;
  font-style: italic;
}
.te-describe-actions {
  display: flex;
  gap: 0.5rem;
}
.te-gen-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.te-gen-btn:hover:not(:disabled) { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.te-gen-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.te-cancel-inline-btn {
  padding: 0.375rem 0.875rem;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: rgba(255,255,255,0.65);
  cursor: pointer;
  transition: all 0.15s;
}
.te-cancel-inline-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); color: #FFFFFF; }
.te-cancel-inline-btn:disabled { opacity: 0.4; cursor: not-allowed; }
@keyframes teSpin { to { transform: rotate(360deg); } }
.te-spin { animation: teSpin 0.8s linear infinite; }
</style>
