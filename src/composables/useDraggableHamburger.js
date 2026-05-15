import { computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

const DRAG_THRESHOLD_PX = 4
const BUTTON_HEIGHT_PX = 48
const EDGE_PAD_PX = 8

/**
 * Make a hamburger toggle button vertically draggable inside its panel.
 *
 * A tap (<4px move) passes through to the existing click handler; a real drag
 * mutates storeY and is suppressed in the click capture phase so the toggle
 * does NOT fire. The cursor follows the button exactly because Y is computed
 * in the button's CSS positioning context (offsetParent), not in the panel.
 *
 * @param {object} opts
 * @param {import('vue').Ref<HTMLElement|null>} opts.buttonRef - ref to the button element
 * @param {() => HTMLElement|null} opts.getPanelEl - returns the panel that clamps Y
 * @param {import('vue').Ref<number|null>|import('vue').WritableComputedRef<number|null>} opts.storeY - reactive Y offset in px (null = use CSS default)
 */
export function useDraggableHamburger({ buttonRef, getPanelEl, storeY }) {
  let dragHappened = false
  let startMouseY = 0
  let grabOffset = 0     // distance from mouse Y to button top at mousedown
  let panelTop = 0
  let panelBottom = 0
  let offsetParentTop = 0
  let overlayEl = null

  function showOverlay() {
    if (overlayEl) return
    overlayEl = document.createElement('div')
    overlayEl.style.cssText = 'position:fixed;inset:0;z-index:9998;cursor:grabbing;'
    document.body.appendChild(overlayEl)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  function hideOverlay() {
    if (overlayEl) {
      overlayEl.remove()
      overlayEl = null
    }
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  function onMouseMove(e) {
    const delta = e.clientY - startMouseY
    if (!dragHappened && Math.abs(delta) > DRAG_THRESHOLD_PX) {
      dragHappened = true
      showOverlay()
    }
    if (!dragHappened) return
    // Compute desired button-top in viewport coords so the grab point stays
    // glued to the cursor, then clamp against the panel and convert into the
    // offsetParent-local coord system that CSS `top` is interpreted in.
    const desiredViewportTop = e.clientY - grabOffset
    const minViewportTop = panelTop + EDGE_PAD_PX
    const maxViewportTop = panelBottom - BUTTON_HEIGHT_PX - EDGE_PAD_PX
    const clamped = Math.max(minViewportTop, Math.min(maxViewportTop, desiredViewportTop))
    storeY.value = clamped - offsetParentTop
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    hideOverlay()
    // If mouseup happens off the button, no click event fires and dragHappened
    // would otherwise stay true forever, breaking subsequent keyboard activation
    // (Enter/Space → synthetic click → suppressed by onClickCapture). Reset
    // after a macrotask so the click that does fire (mouseup-on-button case)
    // still sees the flag and is suppressed.
    setTimeout(() => { dragHappened = false }, 0)
  }

  function onMouseDown(e) {
    if (e.button !== 0) return
    const panel = getPanelEl()
    const btn = buttonRef.value
    if (!panel || !btn) return
    const panelRect = panel.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    const op = btn.offsetParent || btn.parentElement
    const opRect = op.getBoundingClientRect()
    // Clamp is the intersection of the requested panel AND the button's
    // offsetParent — when the caller picks a wider panel (e.g. focus-docs-panel
    // spans above the editor's top), dragging beyond the offsetParent's bounds
    // pushes the button into an `overflow: hidden` clip region of its parent
    // and it disappears with no way to recover. Intersection keeps the button
    // inside its own visible scroll/clip box.
    panelTop = Math.max(panelRect.top, opRect.top)
    panelBottom = Math.min(panelRect.top + panelRect.height, opRect.top + opRect.height)
    offsetParentTop = opRect.top
    startMouseY = e.clientY
    grabOffset = e.clientY - btnRect.top
    dragHappened = false
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onClickCapture(e) {
    if (dragHappened) {
      e.stopPropagation()
      e.preventDefault()
      dragHappened = false
    }
  }

  const dynamicStyle = computed(() => {
    // == null covers both null and undefined — defensive against a future
    // mis-wiring where the store doesn't expose the ref. Without this guard
    // a fall-through emits { top: 'undefinedpx', transform: 'none' }, which
    // silently clobbers the CSS `translateY(-50%)` centering.
    if (storeY.value == null) return null
    return { top: storeY.value + 'px', transform: 'none' }
  })

  // Re-clamp on window resize. If the panel shrinks, the stored Y could now
  // be outside [panelTop+8, panelBottom-56]; snap it back so the button never
  // renders beyond the panel.
  function onWindowResize() {
    if (storeY.value == null) return
    const panel = getPanelEl()
    const btn = buttonRef.value
    if (!panel || !btn) return
    const panelRect = panel.getBoundingClientRect()
    const op = btn.offsetParent || btn.parentElement
    if (!op) return
    const opRect = op.getBoundingClientRect()
    const opTop = opRect.top
    // Same intersection clamp as onMouseDown — never let the button render
    // outside its offsetParent's visible box even if the requested panel is wider.
    const effectiveTop    = Math.max(panelRect.top, opRect.top)
    const effectiveBottom = Math.min(panelRect.top + panelRect.height, opRect.top + opRect.height)
    const currentVpTop = storeY.value + opTop
    const minVpTop = effectiveTop + EDGE_PAD_PX
    const maxVpTop = effectiveBottom - BUTTON_HEIGHT_PX - EDGE_PAD_PX
    const clampedVp = Math.max(minVpTop, Math.min(maxVpTop, currentVpTop))
    if (clampedVp !== currentVpTop) {
      storeY.value = clampedVp - opTop
    }
  }

  window.addEventListener('resize', onWindowResize)

  // Re-clamp once the button is mounted and laid out. Rescues users whose
  // persisted storeY was saved by an older buggy version where the button
  // could end up clipped by `overflow: hidden` on an ancestor — without this
  // they can't click it to trigger onMouseDown's re-clamp.
  onMounted(() => { nextTick(() => onWindowResize()) })
  watch(buttonRef, (el) => { if (el) nextTick(() => onWindowResize()) })

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('resize', onWindowResize)
    hideOverlay()
  })

  return { onMouseDown, onClickCapture, dynamicStyle }
}
