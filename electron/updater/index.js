/**
 * Updater — single entry point for the auto-update feature.
 *
 * Responsibilities:
 *   - Read feedUrl from build-config.
 *   - On Windows: drive electron-updater autoUpdater.
 *   - On macOS:   call macFallback.checkMacUpdate; emit equivalent events.
 *   - Publish a uniform event stream the IPC layer forwards to the renderer.
 *
 * State machine:
 *   idle → checking → (available | not_available | error)
 *   available → downloading → (downloaded | error)
 *   downloaded → quitting (terminal — app restarts)
 *
 *   Mac path skips downloading/downloaded; "available (manualOnly)" is the
 *   end state for Mac — clicking the button opens the system browser to the
 *   DMG URL and we stay in "available" until next launch.
 */
const { app, shell } = require('electron')
const { logger } = require('../logger')
const { load: loadBuildConfig } = require('../lib/buildConfig')
const macFallback = require('./macFallback')

let _state = 'idle'
let _lastError = null
let _lastAvailable = null  // { version, downloadUrl?, sizeBytes?, manualOnly }
let _emitter = null
let _autoUpdater = null    // lazily required (avoids loading on Mac, where we don't use it)

function _emit(eventName, payload) {
  if (_emitter) _emitter(eventName, payload)
}

function _setState(next) {
  logger.info(`[updater] state: ${_state} → ${next}`)
  _state = next
}

function getState() {
  return {
    state: _state,
    lastError: _lastError ? _lastError.message || String(_lastError) : null,
    available: _lastAvailable,
    currentVersion: app.getVersion(),
  }
}

function _isEnabled() {
  const cfg = loadBuildConfig()
  const url = cfg.releaseFeedUrl
  if (!url) {
    logger.info('[updater] disabled: releaseFeedUrl is null/empty in build-config')
    return false
  }
  return true
}

function _loadAutoUpdater() {
  if (_autoUpdater) return _autoUpdater
  const { autoUpdater } = require('electron-updater')
  autoUpdater.logger = logger
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  const cfg = loadBuildConfig()
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: cfg.releaseFeedUrl,
    channel: 'latest',
  })

  autoUpdater.on('update-available', (info) => {
    _lastAvailable = {
      version: info.version,
      sizeBytes: info.files?.[0]?.size || null,
      manualOnly: false,
    }
    _setState('available')
    _emit('available', _lastAvailable)
  })
  autoUpdater.on('update-not-available', () => {
    _setState('idle')
    _emit('not_available', { currentVersion: app.getVersion() })
  })
  autoUpdater.on('error', (err) => {
    _lastError = err
    _setState('error')
    _emit('error', { message: err?.message || String(err) })
  })
  autoUpdater.on('download-progress', (p) => {
    _setState('downloading')
    _emit('progress', { percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    _setState('downloaded')
    _emit('downloaded', { version: info.version })
  })

  _autoUpdater = autoUpdater
  return _autoUpdater
}

async function check({ trigger = 'auto' } = {}) {
  if (!_isEnabled()) {
    _emit('not_available', { currentVersion: app.getVersion(), reason: 'disabled' })
    return
  }
  if (_state === 'checking' || _state === 'downloading') {
    logger.info(`[updater] check ignored: already ${_state}`)
    return
  }
  _setState('checking')
  _emit('check_started', { trigger })

  if (process.platform === 'darwin') {
    try {
      const cfg = loadBuildConfig()
      const result = await macFallback.checkMacUpdate({
        feedUrl: cfg.releaseFeedUrl,
        currentVersion: app.getVersion(),
        arch: process.arch,
      })
      if (!result.available) {
        _setState('idle')
        _emit('not_available', { currentVersion: app.getVersion() })
        return
      }
      _lastAvailable = {
        version: result.version,
        downloadUrl: result.downloadUrl,
        manualOnly: true,
      }
      _setState('available')
      _emit('available', _lastAvailable)
    } catch (err) {
      _lastError = err
      _setState('error')
      _emit('error', { message: err.message })
    }
    return
  }

  if (process.platform === 'win32') {
    try {
      _loadAutoUpdater().checkForUpdates()
      // electron-updater emits its own events; state transitions happen there.
    } catch (err) {
      _lastError = err
      _setState('error')
      _emit('error', { message: err.message })
    }
    return
  }

  // Linux / unsupported: silently mark idle.
  _setState('idle')
  _emit('not_available', { currentVersion: app.getVersion(), reason: 'unsupported_platform' })
}

async function startDownload() {
  if (process.platform !== 'win32') {
    throw new Error('startDownload is only supported on Windows')
  }
  if (_state !== 'available') {
    throw new Error(`startDownload called in state ${_state}`)
  }
  _loadAutoUpdater().downloadUpdate()
}

function quitAndInstall() {
  if (process.platform !== 'win32') {
    throw new Error('quitAndInstall is only supported on Windows')
  }
  if (_state !== 'downloaded') {
    throw new Error(`quitAndInstall called in state ${_state}`)
  }
  _setState('quitting')
  // With nsis.oneClick:true + perMachine:false the installer already runs
  // without prompts, but DOES show its own small progress window. Passing
  // isSilent=false (the default) keeps that progress UI visible so the user
  // sees something happening while the ~233MB installer extracts; otherwise
  // the screen is blank for 1–2 minutes and the app looks dead.
  _loadAutoUpdater().quitAndInstall(false, true)
}

/**
 * Mark the downloaded update to be installed on the next normal quit.
 * Lets the user keep working until they close the app, then the installer
 * runs silently as part of the quit sequence.
 */
function scheduleInstallOnQuit() {
  if (process.platform !== 'win32') {
    throw new Error('scheduleInstallOnQuit is only supported on Windows')
  }
  if (_state !== 'downloaded') {
    throw new Error(`scheduleInstallOnQuit called in state ${_state}`)
  }
  const u = _loadAutoUpdater()
  u.autoInstallOnAppQuit = true
  _emit('install_scheduled', { version: _lastAvailable?.version || null })
}

function openExternalDownload() {
  if (process.platform !== 'darwin') {
    throw new Error('openExternalDownload is only supported on macOS')
  }
  if (_state !== 'available' || !_lastAvailable?.downloadUrl) {
    throw new Error(`openExternalDownload: nothing to open (state=${_state})`)
  }
  shell.openExternal(_lastAvailable.downloadUrl)
}

function setEmitter(fn) {
  _emitter = fn
}

function _resetForTest() {
  _state = 'idle'
  _lastError = null
  _lastAvailable = null
  _emitter = null
  _autoUpdater = null
}

module.exports = {
  check,
  startDownload,
  quitAndInstall,
  scheduleInstallOnQuit,
  openExternalDownload,
  setEmitter,
  getState,
  _resetForTest,
}
