<template>
  <div class="esg" :class="{ 'esg--compact': compact }">
    <!-- Icon -->
    <div v-if="!compact" class="esg-icon-wrap">
      <slot name="icon" />
    </div>

    <!-- Title -->
    <h3 class="esg-title">{{ title }}</h3>

    <!-- Description -->
    <p class="esg-desc">{{ description }}</p>

    <!-- Use cases -->
    <ul v-if="useCases && useCases.length" class="esg-cases">
      <li v-for="(uc, i) in useCases" :key="i">{{ uc }}</li>
    </ul>

    <!-- Action buttons -->
    <div class="esg-actions">
      <button v-if="secondaryLabel" class="esg-cta esg-cta--secondary" @click="$emit('secondary')">
        <slot name="secondaryIcon" />
        {{ secondaryLabel }}
      </button>
      <button class="esg-cta" @click="$emit('create')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {{ ctaLabel }}
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title:          { type: String, required: true },
  description:    { type: String, required: true },
  useCases:       { type: Array,  default: () => [] },
  ctaLabel:       { type: String, required: true },
  secondaryLabel: { type: String, default: '' },
  compact:        { type: Boolean, default: false },
})
defineEmits(['create', 'secondary'])
</script>

<style scoped>
.esg {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 26.25rem;
  margin: 0 auto;
  padding: 2.5rem 2rem;
  gap: 0.625rem;
}

/* Icon wrapper */
.esg-icon-wrap {
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9CA3AF;
  margin-bottom: 0.25rem;
}

.esg-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section, 1rem);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}

.esg-desc {
  font-size: var(--fs-body, 0.875rem);
  color: #6B7280;
  margin: 0;
  line-height: 1.5;
}

.esg-cases {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  text-align: left;
  width: 100%;
}

.esg-cases li {
  font-size: var(--fs-secondary, 0.8125rem);
  color: #6B7280;
  padding-left: 1rem;
  position: relative;
  line-height: 1.4;
}
.esg-cases li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.5em;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: #9CA3AF;
}

.esg-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

.esg-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  border: 1px solid #374151;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.esg-cta:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563;
}

.esg-cta--secondary {
  background: #FFFFFF;
  color: #374151;
  border-color: #D1D5DB;
}
.esg-cta--secondary:hover {
  background: #F9FAFB;
  border-color: #9CA3AF;
}

/* ── Compact mode (KnowledgeView left panel) ───────────────────────── */
.esg--compact {
  max-width: 100%;
  padding: 1.25rem 0.75rem;
  gap: 0.5rem;
}
.esg--compact .esg-title {
  font-size: var(--fs-body, 0.875rem);
}
.esg--compact .esg-desc {
  font-size: var(--fs-secondary, 0.8125rem);
}
.esg--compact .esg-cases li {
  font-size: 0.75rem;
}
.esg--compact .esg-cta {
  padding: 0.375rem 1rem;
  font-size: 0.75rem;
}
</style>
