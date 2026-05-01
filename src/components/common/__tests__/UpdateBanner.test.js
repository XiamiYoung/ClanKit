// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const state = ref('idle')
const available = ref(null)
const progress = ref(0)
const bannerVisible = ref(false)
const installFn = vi.fn()
const quitAndInstallFn = vi.fn()
const dismissFn = vi.fn()

vi.mock('@/composables/useUpdater', () => ({
  useUpdater: () => ({
    state,
    available,
    progress,
    bannerVisible,
    install: installFn,
    quitAndInstall: quitAndInstallFn,
    dismiss: dismissFn,
  }),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key, fallback, vars = {}) => {
      // First arg can be a key only; or key + fallback; or key + fallback + vars.
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
  installFn.mockClear()
  quitAndInstallFn.mockClear()
  dismissFn.mockClear()
}

describe('UpdateBanner', () => {
  beforeEach(reset)

  it('renders nothing when bannerVisible is false', () => {
    const w = mount(UpdateBanner)
    expect(w.find('.update-banner').exists()).toBe(false)
  })

  it('renders Update + Later in available state on win', () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    const w = mount(UpdateBanner)
    expect(w.text()).toContain('0.0.4')
    expect(w.text()).toContain('Update')
    expect(w.text()).toContain('Later')
  })

  it('renders Download (not Update) when manualOnly', () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: true, downloadUrl: 'x' }
    bannerVisible.value = true
    const w = mount(UpdateBanner)
    expect(w.text()).toContain('Download')
    // The literal word "Update" appears in "ClanKit 0.0.4 is available." not at all,
    // and not in any other label when manualOnly. Verify the primary button is "Download".
    const btn = w.find('[data-test="update-btn"]')
    expect(btn.text()).toBe('Download')
  })

  it('renders progress while downloading', () => {
    state.value = 'downloading'
    progress.value = 47
    bannerVisible.value = true
    const w = mount(UpdateBanner)
    expect(w.text()).toContain('47')
  })

  it('renders Restart now when downloaded', () => {
    state.value = 'downloaded'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    const w = mount(UpdateBanner)
    expect(w.text()).toContain('Restart')
  })

  it('clicking Update calls install()', async () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    const w = mount(UpdateBanner)
    await w.find('[data-test="update-btn"]').trigger('click')
    expect(installFn).toHaveBeenCalled()
  })

  it('clicking Restart now calls quitAndInstall()', async () => {
    state.value = 'downloaded'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    const w = mount(UpdateBanner)
    await w.find('[data-test="restart-btn"]').trigger('click')
    expect(quitAndInstallFn).toHaveBeenCalled()
  })

  it('clicking Later calls dismiss()', async () => {
    state.value = 'available'
    available.value = { version: '0.0.4', manualOnly: false }
    bannerVisible.value = true
    const w = mount(UpdateBanner)
    await w.find('[data-test="dismiss-btn"]').trigger('click')
    expect(dismissFn).toHaveBeenCalled()
  })
})
