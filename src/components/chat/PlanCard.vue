<template>
  <div
    class="plan-card"
    :class="{
      'plan-card--approved': state === 'approved' || state === 'completed',
      'plan-card--rejected': state === 'rejected'
    }"
  >
    <!-- Header -->
    <div class="plan-card__header">
      <span class="plan-card__header-icon">📋</span>
      <span class="plan-card__title">{{ plan.title }}</span>
      <div v-if="state !== 'pending'" class="plan-card__header-badge"
        :class="{
          'badge--executing': state === 'approved',
          'badge--completed': state === 'completed',
          'badge--rejected': state === 'rejected'
        }">
        <span v-if="state === 'approved'" class="plan-card__exec-dot" />
        <svg v-else-if="state === 'completed'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>{{ state === 'approved' ? 'Executing' : state === 'completed' ? 'Completed' : 'Rejected' }}</span>
      </div>
    </div>

    <!-- Steps -->
    <ul class="plan-card__steps">
      <li v-for="(step, i) in plan.steps" :key="i" class="plan-card__step">
        <span class="plan-card__step-num">
          <svg v-if="state === 'approved' || state === 'completed'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span v-else>{{ i + 1 }}</span>
        </span>
        <span class="plan-card__step-label">{{ step.label }}</span>
      </li>
    </ul>

    <!-- Actions — only shown when pending -->
    <div v-if="state === 'pending'" class="plan-card__actions">
      <button class="plan-card__btn plan-card__btn--approve" @click="$emit('approve')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Execute
      </button>
      <button class="plan-card__btn plan-card__btn--refine" @click="$emit('refine')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        Refine
      </button>
      <button class="plan-card__btn plan-card__btn--reject" @click="$emit('reject')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Reject
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  plan:  { type: Object, required: true },
  state: { type: String, default: 'pending' }  // 'pending' | 'approved' | 'completed' | 'rejected'
})
defineEmits(['approve', 'refine', 'reject'])
</script>

<style scoped>
.plan-card {
  margin-top: 0.625rem;
  background: #f4f0fb;
  border: 1px solid #8b7ab8;
  border-radius: 0.875rem;
  overflow: hidden;
  transition: opacity 0.2s ease;
}
.plan-card--rejected {
  opacity: 0.45;
}

/* ── Header ── */
.plan-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, #6b5b95, #4a3d70);
  border-bottom: 1px solid #5a4a82;
}
.plan-card__header-icon {
  font-size: 0.85rem;
  flex-shrink: 0;
}
.plan-card__title {
  font-family: 'Inter', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  color: #FFFFFF;
  letter-spacing: -0.01em;
  flex: 1;
}
.plan-card__header-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 600;
  flex-shrink: 0;
}
.badge--executing {
  background: rgba(255, 255, 255, 0.2);
  color: #fde68a;
}
.badge--completed {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}
.badge--rejected {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.6);
}

/* ── Steps ── */
.plan-card__steps {
  list-style: none;
  margin: 0;
  padding: 0.375rem 0;
}
.plan-card__step {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.3rem 0.875rem;
}
.plan-card__step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  border: 1px solid #b8a9d4;
  background: rgba(255, 255, 255, 0.6);
  font-size: 0.6875rem;
  font-weight: 600;
  color: #6b5b95;
  flex-shrink: 0;
}
.plan-card--approved .plan-card__step-num {
  border-color: #8b7ab8;
  background: rgba(107, 91, 149, 0.15);
  color: #6b5b95;
}
.plan-card__step-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.8rem;
  color: #4a3d70;
  line-height: 1.4;
}

/* ── Actions ── */
.plan-card__actions {
  display: flex;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem 0.625rem;
  border-top: 1px solid #d4c8ee;
  background: rgba(255, 255, 255, 0.35);
}
.plan-card__btn {
  font-family: 'Inter', sans-serif;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 0.4375rem;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0.3rem 0.625rem;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.plan-card__btn--approve {
  background: linear-gradient(135deg, #6b5b95, #4a3d70);
  color: #fff;
  box-shadow: 0 1px 4px rgba(74, 61, 112, 0.25);
}
.plan-card__btn--approve:hover {
  background: linear-gradient(135deg, #7d6ba6, #5a4a82);
}
.plan-card__btn--refine {
  background: rgba(107, 91, 149, 0.12);
  color: #6b5b95;
  border-color: #b8a9d4;
}
.plan-card__btn--refine:hover {
  background: rgba(107, 91, 149, 0.22);
  color: #4a3d70;
}
.plan-card__btn--reject {
  background: rgba(239, 68, 68, 0.08);
  color: #EF4444;
  border-color: rgba(239, 68, 68, 0.2);
}
.plan-card__btn--reject:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* ── Exec dot animation ── */
.plan-card__exec-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fde68a;
  box-shadow: 0 0 6px rgba(253, 230, 138, 0.7);
  flex-shrink: 0;
  animation: exec-pulse 1.4s ease-in-out infinite;
}
@keyframes exec-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}
</style>
