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
const visible = ref(false)
const positionStyle = ref({})
let showTimer = null

const hasContent = computed(() => !!props.text || !!slots.content)

function computePosition() {
  if (!wrapEl.value) return
  const rect = wrapEl.value.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const o = props.offset
  let style = { position: 'fixed', zIndex: 9999 }
  switch (props.placement) {
    case 'top':
      style.bottom = `${vh - rect.top + o}px`
      style.left = `${rect.left + rect.width / 2}px`
      style.transform = 'translateX(-50%)'
      break
    case 'left':
      style.right = `${vw - rect.left + o}px`
      style.top = `${rect.top + rect.height / 2}px`
      style.transform = 'translateY(-50%)'
      break
    case 'right':
      style.left = `${rect.right + o}px`
      style.top = `${rect.top + rect.height / 2}px`
      style.transform = 'translateY(-50%)'
      break
    case 'bottom':
    default:
      style.top = `${rect.bottom + o}px`
      style.left = `${rect.left + rect.width / 2}px`
      style.transform = 'translateX(-50%)'
      break
  }
  positionStyle.value = style
}

function show() {
  if (props.disabled || !hasContent.value) return
  clearTimeout(showTimer)
  showTimer = setTimeout(async () => {
    visible.value = true
    await nextTick()
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
  max-width: 18rem;
  white-space: normal;
  font-family: 'Inter', sans-serif;
}
.app-tooltip-text {
  display: block;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255,255,255,0.92);
  line-height: 1.5;
  white-space: nowrap;
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
