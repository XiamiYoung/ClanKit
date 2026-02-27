<template>
  <div
    class="plan-card"
    :class="{
      'plan-card--approved': state === 'approved',
      'plan-card--rejected': state === 'rejected'
    }"
  >
    <!-- Header -->
    <div class="plan-card__header">
      <div class="plan-card__icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      </div>
      <span class="plan-card__title">{{ plan.title }}</span>
    </div>

    <!-- Steps -->
    <ul class="plan-card__steps">
      <li v-for="(step, i) in plan.steps" :key="i" class="plan-card__step">
        <span class="plan-card__step-num">
          <svg v-if="state === 'approved'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
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
        Approve &amp; Execute
      </button>
      <button class="plan-card__btn plan-card__btn--refine" @click="$emit('refine')">
        Refine...
      </button>
      <button class="plan-card__btn plan-card__btn--reject" @click="$emit('reject')">
        Reject
      </button>
    </div>

    <div v-else-if="state === 'approved'" class="plan-card__status plan-card__status--approved">
      Plan approved — executing
    </div>
    <div v-else-if="state === 'rejected'" class="plan-card__status plan-card__status--rejected">
      Plan rejected
    </div>
  </div>
</template>

<script setup>
defineProps({
  plan:  { type: Object, required: true },
  state: { type: String, default: 'pending' }  // 'pending' | 'approved' | 'rejected'
})
defineEmits(['approve', 'refine', 'reject'])
</script>

<style scoped>
.plan-card {
  margin-top: 10px;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 14px;
  overflow: hidden;
  transition: opacity 0.2s ease;
}
.plan-card--rejected {
  opacity: 0.45;
}

.plan-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid #1F1F1F;
}
.plan-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #fff;
  flex-shrink: 0;
}
.plan-card__title {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: -0.01em;
}

.plan-card__steps {
  list-style: none;
  margin: 0;
  padding: 8px 0;
}
.plan-card__step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
}
.plan-card__step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #3A3A3A;
  background: #1A1A1A;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #9CA3AF;
  flex-shrink: 0;
}
.plan-card--approved .plan-card__step-num {
  border-color: #007AFF;
  background: rgba(0, 122, 255, 0.12);
  color: #007AFF;
}
.plan-card__step-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  color: #D1D5DB;
  line-height: 1.4;
}

.plan-card__actions {
  display: flex;
  gap: 6px;
  padding: 10px 14px 12px;
  border-top: 1px solid #1F1F1F;
}
.plan-card__btn {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  padding: 5px 12px;
  transition: all 0.15s ease;
}
.plan-card__btn--approve {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.plan-card__btn--approve:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.plan-card__btn--refine {
  background: transparent;
  color: #9CA3AF;
  border: 1px solid #2A2A2A;
}
.plan-card__btn--refine:hover {
  background: #1A1A1A;
  color: #FFFFFF;
}
.plan-card__btn--reject {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
  border: 1px solid transparent;
}
.plan-card__btn--reject:hover {
  background: rgba(255, 59, 48, 0.15);
}

.plan-card__status {
  padding: 8px 14px 10px;
  border-top: 1px solid #1F1F1F;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 500;
}
.plan-card__status--approved { color: #007AFF; }
.plan-card__status--rejected { color: #9CA3AF; }
</style>
