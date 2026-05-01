import { ref, readonly, watch } from 'vue'

/**
 * Singleton state — shared across all components that call useUpdater().
 * Keeping state at module scope means the banner and the Settings page see
 * the same picture and don't double-subscribe to IPC events.
 */
const state = ref('idle')             // idle | checking | available | downloading | downloaded | error
const available = ref(null)           // { version, downloadUrl?, sizeBytes?, manualOnly }
const progress = ref(0)               // 0..100
const lastError = ref(null)           // string | null
const dismissedVersion = ref(null)    // version the user explicitly clicked "Later" on; banner stays hidden until next launch
const currentVersion = ref('')
const bannerVisible = ref(false)

let _wired = false
let _detachers = []

function recomputeBannerVisible() {
  if (state.value === 'idle' || state.value === 'checking') {
    bannerVisible.value = false
    return
  }
  if (state.value === 'available' && dismissedVersion.value === available.value?.version) {
    bannerVisible.value = false
    return
  }
  bannerVisible.value = true
}

watch([state, available, dismissedVersion], recomputeBannerVisible, { immediate: true })

function wire(api) {
  if (_wired) return

  api.getStatus().then(s => {
    currentVersion.value = s.currentVersion || ''
    // Only adopt the snapshot if no live event has arrived first. getStatus()
    // resolves on a later microtask; if a real event fired in the meantime
    // we must not roll state back to the stale snapshot.
    if (state.value === 'idle' && !available.value) {
      if (s.state) state.value = s.state
      if (s.available) available.value = s.available
    }
  }).catch(() => {})

  _detachers.push(api.onCheckStarted(() => { state.value = 'checking' }))
  _detachers.push(api.onAvailable((info) => {
    available.value = info
    progress.value = 0
    state.value = 'available'
  }))
  _detachers.push(api.onNotAvailable(() => {
    available.value = null
    state.value = 'idle'
  }))
  _detachers.push(api.onProgress((p) => {
    state.value = 'downloading'
    progress.value = p?.percent || 0
  }))
  _detachers.push(api.onDownloaded(() => {
    state.value = 'downloaded'
  }))
  _detachers.push(api.onError((e) => {
    lastError.value = e?.message || 'Unknown error'
    state.value = 'error'
  }))

  _wired = true
}

function isDarwin() {
  return globalThis.window?.electronAPI?.platform === 'darwin'
}

export function useUpdater() {
  const api = globalThis.window?.electronAPI?.updater
  const enabled = !!api

  // Wire on first call, regardless of which component calls first. Singleton.
  if (enabled) wire(api)

  async function check({ trigger = 'auto' } = {}) {
    if (!enabled) return
    try {
      await api.check({ trigger })
    } catch (err) {
      lastError.value = err?.message || String(err)
      state.value = 'error'
    }
  }

  async function install() {
    if (!enabled) return
    if (isDarwin() && available.value?.manualOnly) {
      await api.openDownloadPage()
      return
    }
    await api.install()
  }

  async function quitAndInstall() {
    if (!enabled) return
    await api.quitAndInstall()
  }

  function dismiss() {
    if (!enabled) return
    dismissedVersion.value = available.value?.version || null
  }

  return {
    state: readonly(state),
    available: readonly(available),
    progress: readonly(progress),
    lastError: readonly(lastError),
    bannerVisible: readonly(bannerVisible),
    currentVersion: readonly(currentVersion),
    check,
    install,
    quitAndInstall,
    dismiss,
    enabled,
  }
}

export function _resetForTest() {
  state.value = 'idle'
  available.value = null
  progress.value = 0
  lastError.value = null
  dismissedVersion.value = null
  currentVersion.value = ''
  bannerVisible.value = false
  _detachers.forEach(d => { try { d() } catch (_) {} })
  _detachers = []
  _wired = false
}
