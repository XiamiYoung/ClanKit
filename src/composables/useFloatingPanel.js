import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export function useFloatingPanel({ widthRatio, heightRatio, minWidth, minHeight }) {
  const KEY_STEP = 16
  const frame = ref(null)
  const interaction = ref(null)
  const maximized = ref(false)
  let drag = null
  const panelStyle = computed(() => {
    if (maximized.value) return { left: '0px', top: '0px', width: '100%', height: '100%' }
    if (!frame.value) return null
    const { x, y, width, height } = frame.value
    return { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' }
  })

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  function fitFrame({ x, y, width, height }) {
    const w = window.innerWidth
    const h = window.innerHeight
    width = clamp(width, minWidth, w)
    height = clamp(height, minHeight, h)
    frame.value = { x: clamp(x, 0, w - width), y: clamp(y, 0, h - height), width, height }
  }

  function fitViewport() {
    fitFrame(frame.value)
  }

  function resizeFrom({ x, y, width, height }, dx, dy) {
    const availableWidth = window.innerWidth - x
    const availableHeight = window.innerHeight - y
    fitFrame({
      x, y,
      width: clamp(width + dx, minWidth, availableWidth),
      height: clamp(height + dy, minHeight, availableHeight),
    })
  }

  function adjustFrame(initial, dx, dy, mode) {
    if (mode === 'resize') resizeFrom(initial, dx, dy)
    else fitFrame({ ...initial, x: initial.x + dx, y: initial.y + dy })
  }

  function startDrag(event, mode) {
    if (event.button !== 0 || drag || !frame.value || maximized.value) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, frame: frame.value, mode }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    interaction.value = mode
    window.addEventListener('pointermove', moveDrag, true)
    window.addEventListener('pointerup', stopDrag, true)
    window.addEventListener('pointercancel', stopDrag, true)
    window.addEventListener('blur', clearDrag)
  }

  function moveDrag(event) {
    if (drag?.id === event.pointerId) {
      adjustFrame(drag.frame, event.clientX - drag.x, event.clientY - drag.y, drag.mode)
    }
  }

  function stopDrag(event) {
    if (drag?.id === event.pointerId) clearDrag()
  }

  function clearDrag() {
    if (!drag) return
    drag = null
    interaction.value = null
    window.removeEventListener('pointermove', moveDrag, true)
    window.removeEventListener('pointerup', stopDrag, true)
    window.removeEventListener('pointercancel', stopDrag, true)
    window.removeEventListener('blur', clearDrag)
  }

  function adjustWithKeys(event, mode) {
    const directions = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }
    const direction = directions[event.key]
    if (!frame.value || maximized.value || !Array.isArray(direction)) return
    event.preventDefault()
    adjustFrame(frame.value, direction[0], direction[1], mode)
  }

  // The floating frame is kept while maximized, so restoring returns to it.
  function toggleMaximize() {
    clearDrag()
    maximized.value = !maximized.value
  }

  onMounted(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    const width = clamp(Math.round(w * widthRatio), minWidth, w)
    const height = clamp(Math.round(h * heightRatio), minHeight, h)
    fitFrame({ x: (w - width) / 2, y: (h - height) / 2, width, height })
    window.addEventListener('resize', fitViewport)
  })
  onBeforeUnmount(() => {
    clearDrag()
    window.removeEventListener('resize', fitViewport)
  })

  return { panelStyle, interaction, maximized, startDrag, adjustWithKeys, toggleMaximize }
}
