<template>
  <Teleport to="body">
    <div v-if="visible && task" class="tvm-backdrop">
      <div class="tvm-modal">

        <!-- Header -->
        <div class="tvm-header">
          <div class="tvm-header-left">
            <div class="tvm-header-icon-wrap">{{ task.icon || '✍️' }}</div>
            <div>
              <div class="tvm-title">{{ task.name }}</div>
              <div v-if="task.description" class="tvm-subtitle">{{ task.description }}</div>
            </div>
          </div>
          <button class="tvm-close" @click="$emit('close')">
            <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Body: two columns -->
        <div class="tvm-body">

          <!-- Left: prompt -->
          <div class="tvm-col-left">
            <div class="tvm-section">
              <div class="tvm-section-label">{{ t('tasks.taskEditor.prompt') }}</div>
              <pre class="tvm-prompt-pre">{{ task.prompt || t('tasks.step.noTask') }}</pre>
            </div>
          </div>

          <!-- Right: used in plans -->
          <div class="tvm-col-right">
            <div class="tvm-section">
              <div class="tvm-section-label">{{ t('tasks.taskEditor.usedInPlans') }}</div>
              <div v-if="usedInPlans.length === 0" class="tvm-plans-empty">{{ t('tasks.taskEditor.notUsedInAnyPlan') }}</div>
              <div v-else class="tvm-plans-list">
                <button
                  v-for="plan in usedInPlans"
                  :key="plan.id"
                  class="tvm-plan-row"
                  @click="$emit('open-plan', plan)"
                >
                  <span class="tvm-plan-icon">{{ plan.icon || '📋' }}</span>
                  <div class="tvm-plan-info">
                    <span class="tvm-plan-name">{{ plan.name }}</span>
                    <span class="tvm-plan-steps">{{ plan.steps?.length || 0 }} {{ plan.steps?.length === 1 ? t('tasks.misc.stepSingular') : t('tasks.misc.stepPlural') }}</span>
                  </div>
                  <svg class="tvm-plan-arrow" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="tvm-footer">
          <button class="tvm-close-btn" @click="$emit('close')">{{ t('tasks.actions.close') }}</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  visible: Boolean,
  task:    { type: Object, default: null },
  plans:   { type: Array,  default: () => [] },
})
const emit = defineEmits(['close', 'edit', 'open-plan'])

const usedInPlans = computed(() => {
  if (!props.task?.id || !props.plans.length) return []
  return props.plans.filter(p =>
    (p.steps || []).some(s => s.taskId === props.task.id)
  )
})

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style>
.tvm-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.tvm-modal {
  background: #0F0F0F; border: 1px solid #2A2A2A; border-radius: 1rem;
  width: 90vw; max-width: 90vw;
  height: 90vh; max-height: 90vh;
  display: flex; flex-direction: column;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  animation: tvmIn 0.2s ease-out; overflow: hidden;
}
@keyframes tvmIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.tvm-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid #1E1E1E; gap: 0.75rem; flex-shrink: 0;
}
.tvm-header-left { display: flex; align-items: flex-start; gap: 0.75rem; min-width: 0; }
.tvm-header-icon-wrap {
  font-size: 1.75rem; line-height: 1; flex-shrink: 0;
  width: 2.75rem; height: 2.75rem;
  display: flex; align-items: center; justify-content: center;
  background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 0.625rem;
}
.tvm-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle); font-weight: 700; color: #FFFFFF;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tvm-subtitle {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: rgba(255,255,255,0.45);
  margin-top: 0.125rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tvm-close {
  width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.5rem; color: rgba(255,255,255,0.5); cursor: pointer;
  transition: all 0.15s; flex-shrink: 0;
}
.tvm-close:hover { background: rgba(255,255,255,0.12); color: #FFFFFF; }

/* Two-column body */
.tvm-body {
  flex: 1; overflow: hidden; display: flex; flex-direction: row; min-height: 0;
}
.tvm-col-left {
  flex: 1; min-width: 0; overflow-y: auto; padding: 1.25rem 1.5rem;
  display: flex; flex-direction: column; gap: 1rem;
  scrollbar-width: thin; scrollbar-color: #2A2A2A transparent;
  border-right: 1px solid #1E1E1E;
}
.tvm-col-right {
  width: 16rem; flex-shrink: 0; overflow-y: auto; padding: 1.25rem 1rem;
  display: flex; flex-direction: column; gap: 0.625rem;
  scrollbar-width: thin; scrollbar-color: #2A2A2A transparent;
}

.tvm-section { display: flex; flex-direction: column; gap: 0.375rem; }
.tvm-section-label {
  font-family: 'Inter', sans-serif; font-weight: 600;
  color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.6875rem;
}
.tvm-prompt-pre {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: rgba(255,255,255,0.85);
  background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 0.625rem;
  padding: 0.875rem 1rem; white-space: pre-wrap; word-break: break-word;
  line-height: 1.65; margin: 0;
}

/* Plans list */
.tvm-plans-empty {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: rgba(255,255,255,0.25);
  font-style: italic; padding: 0.25rem 0;
}
.tvm-plans-list { display: flex; flex-direction: column; gap: 0.375rem; flex: 1; }
.tvm-plan-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  background: rgba(255,255,255,0.04); border: 1px solid #1E1E1E; border-radius: 0.5rem;
  cursor: pointer; transition: all 0.15s; text-align: left; width: 100%;
}
.tvm-plan-row:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: #374151;
}
.tvm-plan-icon { font-size: 1rem; line-height: 1; flex-shrink: 0; }
.tvm-plan-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.125rem; }
.tvm-plan-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tvm-plan-row:hover .tvm-plan-name { color: #FFFFFF; }
.tvm-plan-steps {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: rgba(255,255,255,0.35);
}
.tvm-plan-row:hover .tvm-plan-steps { color: rgba(255,255,255,0.6); }
.tvm-plan-arrow { color: rgba(255,255,255,0.3); flex-shrink: 0; transition: color 0.15s; }
.tvm-plan-row:hover .tvm-plan-arrow { color: rgba(255,255,255,0.7); }

.tvm-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem;
  padding: 1rem 1.5rem; border-top: 1px solid #1A1A1A; background: #0A0A0A;
  border-radius: 0 0 1rem 1rem; flex-shrink: 0;
}
.tvm-close-btn {
  padding: 0.4375rem 1.125rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; border-radius: 0.5rem; font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; color: #FFFFFF;
  cursor: pointer; transition: all 0.15s; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.tvm-close-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
</style>
