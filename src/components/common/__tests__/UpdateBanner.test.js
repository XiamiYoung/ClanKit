// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const state = ref('idle')
const available = ref(null)
const progress = ref(0)
const bannerVisible = ref(false)
const currentVersion = ref('0.0.3')
const installFn = vi.fn()
const quitAndInstallFn = vi.fn()
const installOnQuitFn = vi.fn()
const dismissFn = vi.fn()

vi.mock('@/composables/useUpdater', () => ({
  useUpdater: () => ({
    state,
    available,
    progress,
    bannerVisible,
    currentVersion,
    install: installFn,
    quitAndInstall: quitAndInstallFn,
    installOnQuit: installOnQuitFn,
    dismiss: dismissFn,
  }),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key, fallback, vars = {}) => {
      let s = typeof fallback === 'string' ? fallback : key
      const v = typeof fallback === 'object' ? fallback : vars
      Object.entries(v || {}).forEach(([k, val]) => { s = s.replace(`{${k}}`, val) })
      return s
    },
    locale: { value: 'en' },
  }),
}))

import UpdateBanner from '../UpdateBanner.vue'

function reset() {
  state.value = 'idle'
  available.value = null
  progress.value = 0
  bannerVisible.value = false
  currentVersion.value = '0.0.3'
  installFn.mockClear()
  quitAndInstallFn.mockClear()
  installOnQuitFn.mockClear()
  dismissFn.mockClear()
  try { globalThis.localStorage?.clear() } catch {}
}

// Toast Teleports to body, so query the document instead of the wrapper.
function findInBody(selector) {
  return document.querySelector(selector)
}

describe('UpdateBanner (toast)', () => {
  beforeEach(reset)

  it('renders nothing when bannerVisible is false', () => {
    mount(UpdateBanner, { attachTo: document.body })
    expect(findInBody('.update-toast')).toBeNull()
  })

  it('shows version transition + Install now + Remind me later in available state', () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })
    const toast = findInBody('.update-toast')
    expect(toast).not.toBeNull()
    expect(toast.textContent).toContain('0.0.3 → 0.0.4')
    expect(toast.textContent).toContain('Install now')
    expect(toast.textContent).toContain('Remind me later')
  })

  it('renders Download (not Install now) when manualOnly (mac)', () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: true, downloadUrl: 'x' }
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })
    const btn = findInBody('[data-test="update-btn"]')
    expect(btn.textContent).toBe('Download')
  })

  it('shows progress bar + percent while downloading, no action buttons', () => {
    state.value = 'downloading'
    progress.value = 47
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })
    const toast = findInBody('.update-toast')
    expect(toast.textContent).toContain('47')
    const bar = findInBody('[data-test="progress-bar"]')
    expect(bar).not.toBeNull()
    expect(findInBody('[data-test="update-btn"]')).toBeNull()
    expect(findInBody('[data-test="restart-btn"]')).toBeNull()
  })

  it('shows only Restart now when downloaded (Slack-mode: install-on-quit is the implicit default)', () => {
    state.value = 'downloaded'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })
    expect(findInBody('[data-test="restart-btn"]')).not.toBeNull()
    // Install-on-quit was a button in the previous flow; it is now the
    // automatic default (handled by useUpdater on download), so the explicit
    // button is intentionally removed.
    expect(findInBody('[data-test="install-on-quit-btn"]')).toBeNull()
  })

  it('clicking Install now calls install()', async () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })
    findInBody('[data-test="update-btn"]').click()
    expect(installFn).toHaveBeenCalled()
  })

  it('clicking Restart now calls quitAndInstall()', async () => {
    state.value = 'downloaded'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })
    findInBody('[data-test="restart-btn"]').click()
    expect(quitAndInstallFn).toHaveBeenCalled()
  })

  // Removed: "clicking Install on next launch calls installOnQuit()" —
  // the explicit button was removed when install-on-quit became the default
  // behaviour (auto-scheduled by useUpdater when the 'downloaded' event fires).
  // The auto-schedule is covered by useUpdater.test.js.

  it('clicking Remind me later calls dismiss()', async () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })
    findInBody('[data-test="remind-later-btn"]').click()
    expect(dismissFn).toHaveBeenCalled()
  })

  it('clicking the X close button calls dismiss()', async () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })
    findInBody('[data-test="dismiss-btn"]').click()
    expect(dismissFn).toHaveBeenCalled()
  })

  it('shows Retry button in error state', () => {
    state.value = 'error'
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })
    expect(findInBody('[data-test="retry-btn"]')).not.toBeNull()
  })

  it('persists drag position to localStorage', async () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    mount(UpdateBanner, { attachTo: document.body })

    const header = findInBody('.update-toast-header')
    header.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100, bubbles: true }))
    globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 200, bubbles: true }))
    globalThis.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    const raw = globalThis.localStorage.getItem('clankit:update-toast-pos')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw)
    expect(Number.isFinite(parsed.x)).toBe(true)
    expect(Number.isFinite(parsed.y)).toBe(true)
  })
})
