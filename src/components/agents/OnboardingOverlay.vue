<template>
  <Teleport to="body">
    <div class="ob-overlay" :style="{ zIndex: noPanels ? 201 : 9998 }">
      <!-- 4-panel click blocker + visual dimming (skip when noPanels — e.g. modal already has backdrop) -->
      <template v-if="!noPanels && targetRect">
        <div class="ob-panel" :style="panelTop"></div>
        <div class="ob-panel" :style="panelBottom"></div>
        <div class="ob-panel" :style="panelLeft"></div>
        <div class="ob-panel" :style="panelRight"></div>
      </template>
      <div v-else-if="!noPanels && !targetRect" class="ob-panel" style="inset:0;"></div>

      <!-- Spotlight border animation -->
      <div
        v-if="!noPanels && targetRect"
        class="ob-spotlight-border"
        :style="spotlightStyle"
      ></div>

      <!-- Draggable guide card -->
      <div
        ref="cardRef"
        class="ob-card"
        :style="finalCardStyle"
        @mousedown="onCardMouseDown"
      >
        <div class="ob-card-drag-handle">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/>
            <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
            <circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
          </svg>
        </div>
        <div class="ob-card-step">{{ stepText }}</div>
        <h3 class="ob-card-title">{{ title }}</h3>
        <p v-if="!steps.length" class="ob-card-desc">{{ description }}</p>
        <!-- Step checklist -->
        <div v-if="steps.length" class="ob-checklist">
          <div
            v-for="(s, i) in steps" :key="i"
            class="ob-check-item"
            :class="{ done: s.done, active: !s.done && (i === 0 || steps[i-1].done) }"
          >
            <div class="ob-check-icon">
              <svg v-if="s.done" style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else class="ob-check-num">{{ i + 1 }}</span>
            </div>
            <span class="ob-check-label">{{ s.label }}</span>
          </div>
        </div>
        <button class="ob-card-skip" @click="showSkipConfirm = true">
          {{ t('onboarding.configureLater') }}
        </button>
      </div>

      <!-- Skip confirmation dialog -->
      <div v-if="showSkipConfirm" class="ob-confirm-backdrop">
        <div class="ob-confirm">
          <h3 class="ob-confirm-title">{{ t('onboarding.skipConfirmTitle') }}</h3>
          <p class="ob-confirm-msg">{{ t('onboarding.skipConfirmMessage') }}</p>
          <div class="ob-confirm-actions">
            <button class="ob-confirm-btn ob-confirm-btn--cancel" @click="showSkipConfirm = false">
              {{ t('common.cancel') }}
            </button>
            <button class="ob-confirm-btn ob-confirm-btn--danger" @click="showSkipConfirm = false; $emit('skip')">
              {{ t('onboarding.skipConfirmOk') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from '../../i18n/useI18n'

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  targetSelector: { type: String, required: true },
  currentStep: { type: Number, default: 1 },
  totalSteps: { type: Number, default: 2 },
  steps: { type: Array, default: () => [] }, // [{ label: string, done: boolean }]
  padding: { type: Number, default: 8 },
  noPanels: { type: Boolean, default: false }, // skip dark panels (for modals with own backdrop)
})

defineEmits(['skip'])

const { t } = useI18n()

const targetRect = ref(null)
const cardRef = ref(null)
const showSkipConfirm = ref(false)

// ── Drag state ──────────────────────────────────────────────────────────────
const dragOffset = ref(null) // { x, y } offset from auto-position, null = auto
const isDragging = ref(false)

function onCardMouseDown(e) {
  // Don't drag from buttons
  if (e.target.closest('button')) return
  e.preventDefault()
  isDragging.value = true
  const card = cardRef.value
  if (!card) return
  const rect = card.getBoundingClientRect()
  const startX = e.clientX
  const startY = e.clientY
  const startLeft = rect.left
  const startTop = rect.top

  function onMove(ev) {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    const autoPos = autoCardPosition.value
    dragOffset.value = {
      x: (startLeft + dx) - parseFloat(autoPos.left),
      y: (startTop + dy) - parseFloat(autoPos.top),
    }
  }
  function onUp() {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// Reset drag when target changes
watch(() => props.targetSelector, () => { dragOffset.value = null })

const stepText = computed(() =>
  t('onboarding.step', '', { current: props.currentStep, total: props.totalSteps })
    .replace('{current}', props.currentStep)
    .replace('{total}', props.totalSteps)
)

// ── 4-panel styles ──────────────────────────────────────────────────────────
const panelTop = computed(() => {
  const r = targetRect.value
  return { top: '0', left: '0', right: '0', height: `${r.top - props.padding}px` }
})
const panelBottom = computed(() => {
  const r = targetRect.value
  return { top: `${r.bottom + props.padding}px`, left: '0', right: '0', bottom: '0' }
})
const panelLeft = computed(() => {
  const r = targetRect.value
  return { top: `${r.top - props.padding}px`, left: '0', width: `${r.left - props.padding}px`, height: `${r.height + props.padding * 2}px` }
})
const panelRight = computed(() => {
  const r = targetRect.value
  return { top: `${r.top - props.padding}px`, left: `${r.right + props.padding}px`, right: '0', height: `${r.height + props.padding * 2}px` }
})

// Spotlight border
const spotlightStyle = computed(() => {
  if (!targetRect.value) return null
  const r = targetRect.value
  return {
    top: `${r.top - props.padding}px`,
    left: `${r.left - props.padding}px`,
    width: `${r.width + props.padding * 2}px`,
    height: `${r.height + props.padding * 2}px`,
  }
})

// Auto card position — always outside the spotlight area (in the dark panel region)
const autoCardPosition = computed(() => {
  if (!targetRect.value) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  const r = targetRect.value
  const cardW = 320
  const cardH = 170
  const vh = window.innerHeight
  const vw = window.innerWidth
  const spaceBelow = vh - (r.bottom + props.padding)
  const spaceAbove = r.top - props.padding
  const spaceLeft = r.left - props.padding
  const spaceRight = vw - (r.right + props.padding)

  // Large target (near full-screen modal): position center-right of viewport
  if (r.width > vw * 0.6 && r.height > vh * 0.5) {
    return { top: `${Math.max(16, (vh - cardH) / 2)}px`, left: `${vw - cardW - 24}px` }
  }

  // Prefer below, then above, then right, then left — always in a dark panel
  if (spaceBelow >= cardH + 24) {
    const left = Math.max(16, Math.min(r.left, vw - cardW - 16))
    return { top: `${r.bottom + props.padding + 12}px`, left: `${left}px` }
  }
  if (spaceAbove >= cardH + 24) {
    const left = Math.max(16, Math.min(r.left, vw - cardW - 16))
    return { top: `${r.top - props.padding - cardH - 12}px`, left: `${left}px` }
  }
  if (spaceRight >= cardW + 24) {
    return { top: `${r.top}px`, left: `${r.right + props.padding + 12}px` }
  }
  if (spaceLeft >= cardW + 24) {
    return { top: `${r.top}px`, left: `${r.left - props.padding - cardW - 12}px` }
  }
  // Fallback: center-right of viewport
  return { top: `${Math.max(16, (vh - cardH) / 2)}px`, left: `${vw - cardW - 24}px` }
})

// Final card style = auto position + drag offset
const finalCardStyle = computed(() => {
  const auto = autoCardPosition.value
  if (!dragOffset.value) return { ...auto, cursor: isDragging.value ? 'grabbing' : 'grab' }
  return {
    top: `${parseFloat(auto.top) + dragOffset.value.y}px`,
    left: `${parseFloat(auto.left) + dragOffset.value.x}px`,
    cursor: isDragging.value ? 'grabbing' : 'grab',
  }
})

// ── Position tracking ───────────────────────────────────────────────────────
let trackedEl = null
let resizeObs = null
let mutationObs = null
let rafId = null

function updatePosition() {
  const el = document.querySelector(props.targetSelector)
  if (el) {
    targetRect.value = el.getBoundingClientRect()
  } else {
    targetRect.value = null
  }
}

function startTracking() {
  stopTracking()
  updatePosition()
  const el = document.querySelector(props.targetSelector)
  if (!el) return
  trackedEl = el

  // ResizeObserver: tracks size changes (test result message expanding content)
  resizeObs = new ResizeObserver(() => updatePosition())
  resizeObs.observe(el)

  // MutationObserver: tracks DOM changes inside the target (child nodes added/removed)
  mutationObs = new MutationObserver(() => updatePosition())
  mutationObs.observe(el, { childList: true, subtree: true, attributes: true })
}

function stopTracking() {
  if (resizeObs) { resizeObs.disconnect(); resizeObs = null }
  if (mutationObs) { mutationObs.disconnect(); mutationObs = null }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  trackedEl = null
}

onMounted(() => {
  nextTick(() => startTracking())
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  stopTracking()
})

watch(() => props.targetSelector, () => {
  dragOffset.value = null
  nextTick(() => startTracking())
})
</script>

<style>
/* Unscoped — Teleport to body */

.ob-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.ob-panel {
  position: fixed;
  background: rgba(0, 0, 0, 0.65);
  pointer-events: auto;
  transition: all 0.3s ease;
}

.ob-spotlight-border {
  position: fixed;
  border-radius: var(--radius-sm, 8px);
  pointer-events: none;
  z-index: 1;
}

.ob-spotlight-border::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  border: 2px solid rgba(255, 255, 255, 0.15);
  animation: ob-pulse 2s ease-in-out infinite;
}

@keyframes ob-pulse {
  0%, 100% { border-color: rgba(255, 255, 255, 0.15); }
  50% { border-color: rgba(255, 255, 255, 0.35); }
}

.ob-card {
  position: fixed;
  width: 20rem;
  padding: 1rem 1.25rem;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  z-index: 2;
  pointer-events: auto;
  animation: ob-card-enter 0.25s ease-out;
  user-select: none;
}

.ob-card-drag-handle {
  position: absolute;
  top: 0.625rem;
  right: 0.625rem;
  color: #4B5563;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.ob-card:hover .ob-card-drag-handle {
  opacity: 1;
}

@keyframes ob-card-enter {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: translateY(0); }
}

.ob-card-step {
  font-size: var(--fs-small, 0.75rem);
  color: #6B7280;
  font-weight: 500;
  margin-bottom: 0.375rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ob-card-title {
  font-size: var(--fs-subtitle, 1.0625rem);
  font-weight: 600;
  color: #FFFFFF;
  margin: 0 0 0.25rem;
}

.ob-card-desc {
  font-size: var(--fs-caption, 0.8125rem);
  color: #9CA3AF;
  margin: 0 0 0.75rem;
  line-height: 1.4;
}

/* Checklist */
.ob-checklist {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.ob-check-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  opacity: 0.4;
  transition: opacity 0.15s;
}

.ob-check-item.done {
  opacity: 0.6;
}

.ob-check-item.active {
  opacity: 1;
}

.ob-check-icon {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 0.625rem;
  font-weight: 700;
  transition: all 0.15s;
}

.ob-check-item.done .ob-check-icon {
  background: #059669;
  color: #FFFFFF;
}

.ob-check-item.active .ob-check-icon {
  background: linear-gradient(135deg, #0F0F0F 0%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15);
}

.ob-check-item:not(.done):not(.active) .ob-check-icon {
  background: #2A2A2A;
  color: #6B7280;
}

.ob-check-num {
  font-size: 0.5625rem;
  line-height: 1;
}

.ob-check-label {
  font-size: var(--fs-caption, 0.8125rem);
  color: #9CA3AF;
}

.ob-check-item.active .ob-check-label {
  color: #FFFFFF;
  font-weight: 500;
}

.ob-check-item.done .ob-check-label {
  color: #6B7280;
  text-decoration: line-through;
  text-decoration-color: #4B5563;
}

.ob-card-skip {
  padding: 0.375rem 0.75rem;
  background: transparent;
  border: 1px solid #2A2A2A;
  border-radius: 0.375rem;
  color: #6B7280;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.ob-card-skip:hover {
  border-color: #4B5563;
  color: #9CA3AF;
}

/* Skip confirmation dialog */
.ob-confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: auto;
}

.ob-confirm {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  padding: 1.25rem;
  width: min(22rem, 90vw);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  animation: ob-card-enter 0.2s ease-out;
}

.ob-confirm-title {
  font-size: var(--fs-subtitle, 1.0625rem);
  font-weight: 600;
  color: #FFFFFF;
  margin: 0 0 0.5rem;
}

.ob-confirm-msg {
  font-size: var(--fs-body, 0.9375rem);
  color: #9CA3AF;
  margin: 0 0 1rem;
  line-height: 1.5;
}

.ob-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.ob-confirm-btn {
  padding: 0.4375rem 1rem;
  border-radius: 0.5rem;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.ob-confirm-btn--cancel {
  background: transparent;
  border: 1px solid #2A2A2A;
  color: #9CA3AF;
}
.ob-confirm-btn--cancel:hover {
  border-color: #4B5563;
  color: #FFFFFF;
}

.ob-confirm-btn--danger {
  background: #DC2626;
  border: none;
  color: #FFFFFF;
}
.ob-confirm-btn--danger:hover {
  background: #B91C1C;
}
</style>
