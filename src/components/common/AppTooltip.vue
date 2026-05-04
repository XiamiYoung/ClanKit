<template>
  <span
    ref="wrapEl"
    class="app-tooltip-wrap"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
    <Teleport to="body">
      <Transition name="app-tip-fade">
        <div
          v-if="visible && hasContent"
          ref="tipEl"
          class="app-tooltip"
          :class="`app-tooltip--${placement}`"
          :style="positionStyle"
        >
          <slot name="content">
            <span class="app-tooltip-text">{{ text }}</span>
          </slot>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  placement: {
    type: String,
    default: 'bottom',
    validator: v => ['top', 'bottom', 'left', 'right'].includes(v),
  },
  offset: { type: Number, default: 8 },
  delay: { type: Number, default: 120 },
  disabled: { type: Boolean, default: false },
})

const slots = defineSlots()

const wrapEl = ref(null)
const tipEl = ref(null)
const visible = ref(false)
const positionStyle = ref({})
let showTimer = null

const hasContent = computed(() => !!props.text || !!slots.content)

// Compute final top/left given trigger rect + measured tooltip rect.
// Flips placement when the preferred side would overflow, then clamps
// to viewport so the tooltip can never render off-screen.
function _resolveCoords(triggerRect, tipRect) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 8
  const o = props.offset
  let top, left, placement = props.placement

  // Flip to opposite side if the preferred side overflows
  if (placement === 'top' && triggerRect.top - tipRect.height - o < margin) placement = 'bottom'
  else if (placement === 'bottom' && triggerRect.bottom + tipRect.height + o > vh - margin) placement = 'top'
  else if (placement === 'left' && triggerRect.left - tipRect.width - o < margin) placement = 'right'
  else if (placement === 'right' && triggerRect.right + tipRect.width + o > vw - margin) placement = 'left'

  switch (placement) {
    case 'top':
      top  = triggerRect.top - tipRect.height - o
      left = triggerRect.left + triggerRect.width / 2 - tipRect.width / 2
      break
    case 'left':
      left = triggerRect.left - tipRect.width - o
      top  = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2
      break
    case 'right':
      left = triggerRect.right + o
      top  = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2
      break
    case 'bottom':
    default:
      top  = triggerRect.bottom + o
      left = triggerRect.left + triggerRect.width / 2 - tipRect.width / 2
  }
  // Final clamp so the tooltip never leaves the viewport
  left = Math.max(margin, Math.min(left, vw - tipRect.width  - margin))
  top  = Math.max(margin, Math.min(top,  vh - tipRect.height - margin))
  return { top, left, placement }
}

async function computePosition() {
  if (!wrapEl.value) return
  // Wait for the Teleported tooltip to mount so we can measure its box.
  await nextTick()
  if (!tipEl.value) return
  const triggerRect = wrapEl.value.getBoundingClientRect()
  const tipRect     = tipEl.value.getBoundingClientRect()
  const { top, left } = _resolveCoords(triggerRect, tipRect)
  positionStyle.value = { position: 'fixed', zIndex: 9999, top: `${top}px`, left: `${left}px` }
}

function show() {
  if (props.disabled || !hasContent.value) return
  clearTimeout(showTimer)
  showTimer = setTimeout(() => {
    // Pre-hide via visibility so the first frame doesn't flash at (0,0)
    // before we measure and reposition.
    positionStyle.value = { position: 'fixed', zIndex: 9999, top: '0px', left: '0px', visibility: 'hidden' }
    visible.value = true
    computePosition()
  }, props.delay)
}

function hide() {
  clearTimeout(showTimer)
  visible.value = false
}

onBeforeUnmount(() => {
  clearTimeout(showTimer)
})
</script>

<style scoped>
.app-tooltip-wrap {
  display: inline-flex;
  align-items: center;
}
</style>

<style>
/* Global so Teleported tooltip is styled */
.app-tooltip {
  pointer-events: none;
  background: #1A1A1A;
  color: #FFFFFF;
  border-radius: 0.625rem;
  padding: 0.5rem 0.75rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  /* Shrink-to-fit width so the box always matches text length, capped so it
     can never exceed the viewport. */
  width: max-content;
  max-width: min(18rem, calc(100vw - 16px));
  white-space: normal;
  font-family: 'Inter', sans-serif;
  box-sizing: border-box;
}
.app-tooltip-text {
  display: block;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255,255,255,0.92);
  line-height: 1.5;
  /* Allow wrapping when the text exceeds the max-width; short text stays on
     one line because the parent is sized via `width: max-content`. */
  white-space: normal;
  word-break: break-word;
}
.app-tooltip--top,
.app-tooltip--bottom,
.app-tooltip--left,
.app-tooltip--right {
  /* placement-specific styling hooks (currently identical) */
}

.app-tip-fade-enter-active,
.app-tip-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.app-tip-fade-enter-from,
.app-tip-fade-leave-to {
  opacity: 0;
}

/* Optional row layout for key/value tooltips */
.app-tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.125rem 0;
}
.app-tooltip-row .att-key {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
}
.app-tooltip-row .att-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #FFFFFF;
  text-align: right;
  word-break: break-all;
}
</style>
