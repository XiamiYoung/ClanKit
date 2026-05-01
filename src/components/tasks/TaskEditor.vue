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
            <span class="te-header-title">{{ isNew ? t('tasks.taskEditor.newTask') : t('tasks.taskEditor.editTask') }}</span>
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
              <button class="te-icon-btn" @click="showEmojiPicker = true" :title="t('tasks.taskEditor.changeIcon')">{{ draft.icon }}</button>
              <EmojiPicker v-if="showEmojiPicker" :current="draft.icon" @select="e => { draft.icon = e; showEmojiPicker = false }" @close="showEmojiPicker = false" />
              <div class="te-field te-field-grow">
                <label class="te-label">{{ t('tasks.taskEditor.taskName') }} <span class="te-required">*</span></label>
                <input v-model="draft.name" class="te-input" :placeholder="t('tasks.taskEditor.taskName')" maxlength="80" />
              </div>
            </div>

            <!-- Description -->
            <div class="te-field">
              <label class="te-label">{{ t('tasks.taskEditor.description') }}</label>
              <input v-model="draft.description" class="te-input" :placeholder="t('tasks.taskEditor.description')" maxlength="200" />
            </div>

            <!-- Category -->
            <div class="te-field">
              <label class="te-label">{{ t('tasks.taskEditor.category') }}</label>
              <select v-model="draft.categoryId" class="te-input te-select">
                <option :value="null">{{ t('tasks.taskEditor.uncategorized') }}</option>
                <option v-for="c in props.taskCategories" :key="c.id" :value="c.id">
                  {{ c.emoji ? c.emoji + ' ' : '' }}{{ c.name }}
                </option>
              </select>
            </div>

            <!-- Prompt -->
            <div class="te-field">
              <div class="te-label-row">
                <label class="te-label">
                  {{ t('tasks.taskEditor.prompt') }} <span class="te-required">*</span>
                  <span class="te-label-hint">{{ t('tasks.taskEditor.promptHint') }}</span>
                </label>
                <button
                  class="te-ai-enhance-btn"
                  @click="enhancePrompt"
                  :disabled="enhanceLoading || !draft.prompt.trim()"
                >
                  <svg v-if="enhanceLoading" class="te-spin" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  <svg v-else style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  {{ enhanceLoading ? t('tasks.taskEditor.enhancing') : t('tasks.taskEditor.aiEnhance') }}
                </button>
              </div>
              <div v-if="enhanceError" class="te-enhance-error">{{ enhanceError }}</div>

              <textarea
                v-model="draft.prompt"
                class="te-textarea"
                rows="6"
                :placeholder="t('tasks.taskEditor.promptHint')"
              />
            </div>

          </div>

          <!-- Right: used in plans -->
          <div class="te-plans-col">
            <div class="te-plans-label">{{ t('tasks.taskEditor.usedInPlans') }}</div>
            <div v-if="usedInPlans.length === 0" class="te-plans-empty">{{ t('tasks.taskEditor.notUsedInAnyPlan') }}</div>
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
                  <span class="te-plan-steps">{{ plan.steps?.length || 0 }} {{ plan.steps?.length === 1 ? t('tasks.misc.stepSingular') : t('tasks.misc.stepPlural') }}</span>
                </div>
                <svg style="width:12px;height:12px;flex-shrink:0;color:rgba(255,255,255,0.3);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

        </div><!-- /te-columns -->

        <!-- Footer -->
        <div class="te-footer">
          <button class="te-cancel-btn" @click="cancel">{{ t('tasks.taskEditor.cancel') }}</button>
          <button class="te-save-btn" @click="save" :disabled="!canSave">
            {{ isNew ? t('tasks.taskEditor.createTask') : t('tasks.actions.save') }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { v4 as uuid } from 'uuid'
import EmojiPicker from '../agents/EmojiPicker.vue'
import { useConfigStore } from '../../stores/config'
import { useI18n } from '../../i18n/useI18n'
import { detectAgentLanguage } from '../../utils/agentDefinitionPrompts'

const { t } = useI18n()

const props = defineProps({
  visible:        Boolean,
  task:           { type: Object, default: null },
  plans:          { type: Array,  default: () => [] },
  taskCategories: { type: Array,  default: () => [] },
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
const enhanceLoading = ref(false)
const enhanceError = ref('')

const isNew = computed(() => !props.task?.id)

const makeDraft = (task) => ({
  id:          task?.id || uuid(),
  name:        task?.name || '',
  description: task?.description || '',
  icon:        task?.icon || DEFAULT_ICON,
  prompt:      task?.prompt || '',
  categoryId:  task?.categoryId || null,
})

const draft = ref(makeDraft(props.task))

watch(() => props.visible, (v) => {
  if (v) {
    draft.value = makeDraft(props.task)
    showEmojiPicker.value = false
    enhanceLoading.value = false
    enhanceError.value = ''
  }
})

async function enhancePrompt() {
  enhanceLoading.value = true
  enhanceError.value = ''
  try {
    const lang = detectAgentLanguage(draft.value.description, draft.value.prompt, configStore.config?.language || 'en')
    const langInstruction = lang ? `IMPORTANT: Write ALL output entirely in ${lang}.\n\n` : ''
    const result = await window.electronAPI.enhancePrompt({
      prompt: `${langInstruction}You are helping improve a task prompt for an AI agent workflow.
Task name: "${draft.value.name}"${draft.value.description ? `\nTask description: "${draft.value.description}"` : ''}
Current prompt: "${draft.value.prompt}"

Rewrite and enhance the prompt to be clearer, more actionable, and more specific for an AI agent.
Keep it concise (2-4 sentences). Preserve any @AgentName mentions.
Respond with ONLY the improved prompt text, nothing else.`,
      config: JSON.parse(JSON.stringify(configStore.config)),
    })
    if (result.success) {
      draft.value.prompt = result.text.trim().replace(/^["']|["']$/g, '')
    } else {
      enhanceError.value = result.error || 'Failed to enhance prompt'
    }
  } catch (e) {
    enhanceError.value = e.message
  } finally {
    enhanceLoading.value = false
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showEmojiPicker.value) { showEmojiPicker.value = false; return }
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
  
  
  border-right: 1px solid #1E1E1E;
}

/* Right: used-in-plans panel */
.te-plans-col {
  width: 16rem; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 0.625rem;
  padding: 1.5rem 1rem;
  overflow-y: auto;
   
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
.te-select {
  cursor: pointer;
  color: rgba(255, 255, 255, 0.8);
}
.te-select option {
  background: #1A1A1A;
  color: #FFFFFF;
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
.te-ai-enhance-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.1875rem 0.5rem;
  background: linear-gradient(135deg, #92400E 0%, #B45309 40%, #D97706 100%);
  border: none;
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #FFFFFF;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(180,83,9,0.35), 0 1px 3px rgba(180,83,9,0.2);
}
.te-ai-enhance-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #78350F 0%, #92400E 40%, #B45309 100%);
  box-shadow: 0 2px 10px rgba(180,83,9,0.45);
}
.te-ai-enhance-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.te-enhance-error {
  font-size: var(--fs-small);
  color: #EF4444;
  font-style: italic;
}
@keyframes teSpin { to { transform: rotate(360deg); } }
.te-spin { animation: teSpin 0.8s linear infinite; }
</style>
