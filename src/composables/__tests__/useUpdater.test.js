import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'

// Provide a fake updater API on globalThis.window.
function makeFakeAPI() {
  const subscribers = {}
  const on = (event) => (cb) => {
    subscribers[event] = subscribers[event] || []
    subscribers[event].push(cb)
    return () => {
      subscribers[event] = subscribers[event].filter(c => c !== cb)
    }
  }
  return {
    api: {
      check: vi.fn(async () => {}),
      install: vi.fn(async () => {}),
      quitAndInstall: vi.fn(async () => {}),
      installOnQuit: vi.fn(async () => {}),
      openDownloadPage: vi.fn(async () => {}),
      getStatus: vi.fn(async () => ({ state: 'idle', currentVersion: '0.0.3', available: null, lastError: null })),
      onCheckStarted: on('check_started'),
      onAvailable: on('available'),
      onNotAvailable: on('not_available'),
      onProgress: on('progress'),
      onDownloaded: on('downloaded'),
      onError: on('error'),
    },
    fire: (event, payload) => (subscribers[event] || []).forEach(cb => cb(payload)),
  }
}

describe('useUpdater', () => {
  let api, fire, useUpdater

  beforeEach(async () => {
    vi.resetModules()
    const fake = makeFakeAPI()
    api = fake.api
    fire = fake.fire
    globalThis.window = { electronAPI: { updater: api, platform: 'win32' } }
    useUpdater = (await import('../useUpdater')).useUpdater
  })

  it('starts in idle state', () => {
    const u = useUpdater()
    expect(u.state.value).toBe('idle')
  })

  it('check() then available event flips state', async () => {
    const u = useUpdater()
    const p = u.check({ trigger: 'manual' })
    expect(api.check).toHaveBeenCalledWith({ trigger: 'manual' })
    fire('available', { version: '0.0.4', sizeBytes: 1000, manualOnly: false })
    await nextTick()
    expect(u.state.value).toBe('available')
    expect(u.available.value.version).toBe('0.0.4')
    await p
  })

  it('not_available transitions back to idle', async () => {
    const u = useUpdater()
    fire('available', { version: '0.0.4', manualOnly: false })
    await nextTick()
    fire('not_available', { currentVersion: '0.0.3' })
    await nextTick()
    expect(u.state.value).toBe('idle')
  })

  it('install() on win path calls install IPC', async () => {
    const u = useUpdater()
    fire('available', { version: '0.0.4', manualOnly: false })
    await nextTick()
    await u.install()
    expect(api.install).toHaveBeenCalled()
  })

  it('install() on mac path opens external download', async () => {
    globalThis.window.electronAPI.platform = 'darwin'
    const u = useUpdater()
    fire('available', { version: '0.0.4', downloadUrl: 'https://x/clankit.dmg', manualOnly: true })
    await nextTick()
    await u.install()
    expect(api.openDownloadPage).toHaveBeenCalled()
    expect(api.install).not.toHaveBeenCalled()
  })

  it('progress events update percent', async () => {
    const u = useUpdater()
    fire('available', { version: '0.0.4', manualOnly: false })
    fire('progress', { percent: 47 })
    await nextTick()
    expect(u.state.value).toBe('downloading')
    expect(u.progress.value).toBe(47)
  })

  it('downloaded event transitions to downloaded', async () => {
    const u = useUpdater()
    fire('available', { version: '0.0.4', manualOnly: false })
    fire('downloaded', { version: '0.0.4' })
    await nextTick()
    expect(u.state.value).toBe('downloaded')
  })

  it('downloaded event auto-schedules install-on-quit (Slack-mode default)', async () => {
    const u = useUpdater()
    fire('available', { version: '0.0.4', manualOnly: false })
    fire('downloaded', { version: '0.0.4' })
    await nextTick()
    expect(api.installOnQuit).toHaveBeenCalledTimes(1)
    // Banner remains visible so user can opt to "Restart now"; only state moved.
    expect(u.bannerVisible.value).toBe(true)
    expect(u.state.value).toBe('downloaded')
  })

  it('dismiss() hides banner for session', async () => {
    const u = useUpdater()
    fire('available', { version: '0.0.4', manualOnly: false })
    await nextTick()
    expect(u.bannerVisible.value).toBe(true)
    u.dismiss()
    await nextTick()
    expect(u.bannerVisible.value).toBe(false)
  })

  it('disabled (no electronAPI) yields a no-op composable', async () => {
    globalThis.window = {}
    vi.resetModules()
    useUpdater = (await import('../useUpdater')).useUpdater
    const u = useUpdater()
    expect(u.state.value).toBe('idle')
    await u.check()
    u.dismiss()
  })
})
