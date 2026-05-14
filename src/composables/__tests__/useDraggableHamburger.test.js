// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useDraggableHamburger } from '../useDraggableHamburger'

// Build a layout where the panel sits at viewport [100..700], and the button's
// offsetParent (== panel here) starts at the same top. Drift case is exercised
// in a separate scenario where offsetParent is OFFSET below the panel.
function setup({ panelTop = 100, panelHeight = 600, btnTop = 250, offsetParentTop = null } = {}) {
  const panel = document.createElement('div')
  panel.className = 'focus-chat-panel'
  panel.style.position = 'relative'
  document.body.appendChild(panel)

  // If offsetParentTop is provided, insert an inner positioned div that lives
  // BELOW the panel top — simulating DocsView's toolbar pushing the editor
  // pane down.
  let host = panel
  if (offsetParentTop !== null) {
    host = document.createElement('div')
    host.style.position = 'relative'
    panel.appendChild(host)
    host.getBoundingClientRect = () => rect({ top: offsetParentTop, height: panelHeight - (offsetParentTop - panelTop) })
  }

  const btn = document.createElement('button')
  host.appendChild(btn)

  panel.getBoundingClientRect = () => rect({ top: panelTop, height: panelHeight })
  btn.getBoundingClientRect = () => rect({ top: btnTop, height: 48 })
  // happy-dom doesn't populate offsetParent reliably; override.
  Object.defineProperty(btn, 'offsetParent', { configurable: true, get: () => host })

  return { panel, host, btn }
}

function rect({ top, height }) {
  return { top, left: 0, right: 100, bottom: top + height, width: 100, height, x: 0, y: top }
}

function dispatch(type, clientY, button = 0) {
  document.dispatchEvent(new MouseEvent(type, { clientY, button, bubbles: true, cancelable: true }))
}

function mkComposable({ btn, panel, storeY }) {
  return useDraggableHamburger({
    buttonRef: ref(btn),
    getPanelEl: () => panel,
    storeY,
  })
}

function makeStore() {
  const _y = ref(null)
  return computed({ get: () => _y.value, set: (v) => { _y.value = v } })
}

describe('useDraggableHamburger', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('small movement under threshold is treated as a click (toggle passes through)', () => {
    const { btn, panel } = setup()
    const storeY = makeStore()
    const d = mkComposable({ btn, panel, storeY })

    d.onMouseDown(new MouseEvent('mousedown', { clientY: 300, button: 0 }))
    dispatch('mousemove', 302)
    dispatch('mouseup', 302)

    expect(storeY.value).toBe(null)

    const click = new MouseEvent('click', { clientY: 302, bubbles: true, cancelable: true })
    const stop = vi.spyOn(click, 'stopPropagation')
    d.onClickCapture(click)
    expect(stop).not.toHaveBeenCalled()
  })

  it('drag past threshold stores Y in offsetParent-local coords and suppresses click', () => {
    // Button at viewport 250, offsetParent == panel at 100 → button local top = 150
    // grabOffset = 300 - 250 = 50. Move mouse to 320 → desired viewport top = 270 → local = 170
    const { btn, panel } = setup()
    const storeY = makeStore()
    const d = mkComposable({ btn, panel, storeY })

    d.onMouseDown(new MouseEvent('mousedown', { clientY: 300, button: 0 }))
    dispatch('mousemove', 320)
    expect(storeY.value).toBe(170)
    dispatch('mouseup', 320)

    const click = new MouseEvent('click', { clientY: 320, bubbles: true, cancelable: true })
    const stop = vi.spyOn(click, 'stopPropagation')
    const prevent = vi.spyOn(click, 'preventDefault')
    d.onClickCapture(click)
    expect(stop).toHaveBeenCalled()
    expect(prevent).toHaveBeenCalled()
  })

  it('Y is in offsetParent coords when offsetParent is below panel top (DocsView-like)', () => {
    // Panel top=100, offsetParent top=150 (50px toolbar above), button at viewport 250.
    // grabOffset = 300-250 = 50. Move to 320 → desired viewport top = 270, clamp OK,
    // local = 270 - 150 = 120. With the old (panel-relative) math this would have
    // been 270 - 100 = 170 → drift of 50px versus the cursor. Test guards the fix.
    const { btn, panel } = setup({ offsetParentTop: 150 })
    const storeY = makeStore()
    const d = mkComposable({ btn, panel, storeY })

    d.onMouseDown(new MouseEvent('mousedown', { clientY: 300, button: 0 }))
    dispatch('mousemove', 320)
    expect(storeY.value).toBe(120)
    dispatch('mouseup', 320)
  })

  it('clamps button against panel top/bottom regardless of offsetParent', () => {
    const { btn, panel } = setup({ offsetParentTop: 150 })
    const storeY = makeStore()
    const d = mkComposable({ btn, panel, storeY })

    // Try to drag way below the panel: max desired viewport top = panelBottom - 48 - 8 = 700 - 56 = 644
    // local = 644 - 150 = 494
    d.onMouseDown(new MouseEvent('mousedown', { clientY: 300, button: 0 }))
    dispatch('mousemove', 99999)
    expect(storeY.value).toBe(700 - 48 - 8 - 150)
    dispatch('mouseup', 99999)

    // Drag above: min desired viewport top = panelTop + 8 = 108, local = 108 - 150 = -42
    d.onMouseDown(new MouseEvent('mousedown', { clientY: 300, button: 0 }))
    dispatch('mousemove', -99999)
    expect(storeY.value).toBe(100 + 8 - 150)
    dispatch('mouseup', -99999)
  })

  it('dynamicStyle returns null when storeY is null, applies px-top otherwise', async () => {
    const { btn, panel } = setup()
    const _y = ref(null)
    const storeY = computed({ get: () => _y.value, set: v => { _y.value = v } })
    const d = mkComposable({ btn, panel, storeY })
    expect(d.dynamicStyle.value).toBe(null)

    _y.value = 200
    await nextTick()
    expect(d.dynamicStyle.value).toEqual({ top: '200px', transform: 'none' })
  })

  it('non-left mouse button is ignored', () => {
    const { btn, panel } = setup()
    const storeY = makeStore()
    const d = mkComposable({ btn, panel, storeY })
    d.onMouseDown(new MouseEvent('mousedown', { clientY: 300, button: 2 }))
    dispatch('mousemove', 350)
    expect(storeY.value).toBe(null)
  })

  it('dragHappened is reset after mouseup macrotask — keyboard activation works next', async () => {
    const { btn, panel } = setup()
    const storeY = makeStore()
    const d = mkComposable({ btn, panel, storeY })

    d.onMouseDown(new MouseEvent('mousedown', { clientY: 300, button: 0 }))
    dispatch('mousemove', 320) // triggers drag
    dispatch('mouseup', 320)   // mouseup OFF button → no click fires

    // After a macrotask, dragHappened should be cleared so the next keyboard
    // activation (synthetic click without preceding mousedown) is NOT swallowed.
    await new Promise(r => setTimeout(r, 1))

    const synthetic = new MouseEvent('click', { clientY: 320, bubbles: true, cancelable: true })
    const stop = vi.spyOn(synthetic, 'stopPropagation')
    d.onClickCapture(synthetic)
    expect(stop).not.toHaveBeenCalled()
  })

  it('window resize re-clamps storeY back into the panel', () => {
    const { btn, panel } = setup({ panelTop: 100, panelHeight: 700 })
    const storeY = makeStore()
    storeY.value = 600 // valid initially: 100..700 → max local = 700-48-8 = 644

    mkComposable({ btn, panel, storeY })

    // Shrink the panel: same top, new height 300 → maxVpTop = 100+300-48-8 = 344, local max = 244
    panel.getBoundingClientRect = () => rect({ top: 100, height: 300 })
    window.dispatchEvent(new Event('resize'))
    expect(storeY.value).toBeLessThanOrEqual(244)
    expect(storeY.value).toBe(244)
  })

  it('dynamicStyle treats undefined like null (defensive guard)', async () => {
    const { btn, panel } = setup()
    const _y = ref(undefined)
    const storeY = computed({ get: () => _y.value, set: v => { _y.value = v } })
    const d = mkComposable({ btn, panel, storeY })
    expect(d.dynamicStyle.value).toBe(null)
  })
})
