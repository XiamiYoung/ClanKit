/**
 * IPC handlers for window management, minibar mode, and shell helpers.
 * Channels: window:*, shell:open-file, shell:open-external, shell:show-in-folder
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { ipcMain, app, screen, shell } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')

// -- Manual maximize state ----------------------------------------------------
let _isMaximizedManual = false
let _preMaximizeBounds = null

// -- Minibar state ------------------------------------------------------------
const MINIBAR_DEFAULT_W = 230
let _minibarIntendedW = MINIBAR_DEFAULT_W
let _minibarIntendedH = 80
const MINIBAR_MAX_W = 1400 // sanity cap — anything wider is a stale/corrupt save
let _preMinibarBounds = null
// Loaded lazily in register() from config.json (survives restarts)
let _lastMinibarBounds = null
let _minibarBoundsLoaded = false

function _loadMinibarBounds() {
  if (_minibarBoundsLoaded) return
  _minibarBoundsLoaded = true
  const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
  const b = cfg._minibarBounds
  if (b && typeof b.width === 'number' && b.width >= 200 && b.width <= MINIBAR_MAX_W) {
    _lastMinibarBounds = b
    return
  }
  if (b) {
    try { cfg._minibarBounds = null; ds.writeJSON(ds.paths().CONFIG_FILE, cfg) } catch {}
  }
  _lastMinibarBounds = null
}

// -- Title-bar drag state -----------------------------------------------------
let _dragPinnedSize = null

// -- Helper: detect WSL -------------------------------------------------------
function isWSL() {
  try {
    const release = fs.readFileSync('/proc/version', 'utf8').toLowerCase()
    return release.includes('microsoft') || release.includes('wsl')
  } catch { return false }
}

// -- Helper: Linux path to Windows path ---------------------------------------
function toWindowsPath(linuxPath) {
  const { execSync } = require('child_process')
  return execSync('wslpath -w "' + linuxPath + '"').toString().trim().replace(/\\$/, '')
}

// -- Helper: resolve ~ in path ------------------------------------------------
function resolvePath(filePath) {
  return filePath.startsWith('~') ? path.join(os.homedir(), filePath.slice(1)) : filePath
}

// -- Save minibar bounds to config.json ---------------------------------------
function _saveMinibarBounds() {
  const mainWindow = winRef.get()
  if (!mainWindow) return
  // Use intended dimensions — getBounds() can report DPI-drifted sizes that corrupt the restore.
  const cur = mainWindow.getBounds()
  _lastMinibarBounds = { x: cur.x, y: cur.y, width: _minibarIntendedW, height: _minibarIntendedH }
  try {
    const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
    cfg._minibarBounds = _lastMinibarBounds
    ds.writeJSON(ds.paths().CONFIG_FILE, cfg)
  } catch (e) {
    logger.warn('Failed to save minibar bounds:', e.message)
  }
}

// -- Clamp minibar to nearest screen work area after every native drag ends ---
function _attachMinibarMovedGuard(win) {
  win.on('moved', () => {
    // Only enforce while in minibar mode
    if (!_preMinibarBounds) return
    const b = win.getBounds()
    const display = screen.getDisplayMatching(b)
    const wa = display.workArea
    const clampedX = Math.max(wa.x, Math.min(wa.x + wa.width  - _minibarIntendedW,  b.x))
    const clampedY = Math.max(wa.y, Math.min(wa.y + wa.height - _minibarIntendedH, b.y))
    if (clampedX !== b.x || clampedY !== b.y) {
      win.setBounds({ x: clampedX, y: clampedY, width: _minibarIntendedW, height: _minibarIntendedH })
    }
  })
}

function register() {
  // -- File Reveal / Open -----------------------------------------------------

  ipcMain.handle('shell:open-file', async (_, filePath) => {
    try {
      const resolved = resolvePath(filePath)
      if (isWSL()) {
        const { execSync } = require('child_process')
        execSync('explorer.exe "' + toWindowsPath(resolved) + '"')
        return { success: true }
      }
      const result = await shell.openPath(resolved)
      if (result) return { error: result }
      return { success: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('shell:open-external', async (_, url) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('shell:show-in-folder', (_, filePath) => {
    try {
      const resolved = resolvePath(filePath)
      if (isWSL()) {
        const { execSync } = require('child_process')
        execSync('explorer.exe /select,"' + toWindowsPath(resolved) + '"');
        return { success: true }
      }
      shell.showItemInFolder(resolved)
      return { success: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  // -- Window management ------------------------------------------------------

  ipcMain.handle('window:set-fullscreen', (_, flag) => {
    winRef.get()?.setFullScreen(!!flag)
  })

  ipcMain.handle('window:get-position', () => {
    const mainWindow = winRef.get()
    return mainWindow ? mainWindow.getPosition() : [0, 0]
  })

  // Title-bar drag: size is captured once at drag-start and reused for every
  // move so Windows DPI scaling cannot silently grow the window dimensions.
  ipcMain.on('window:drag-start', () => {
    const mainWindow = winRef.get()
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else if (_isMaximizedManual) {
      // Manually maximized via setBounds — restore to pre-maximize bounds for drag
      _isMaximizedManual = false
      if (_preMaximizeBounds) {
        mainWindow.setBounds(_preMaximizeBounds)
        _preMaximizeBounds = null
      }
      mainWindow.webContents.send('window:maximized', false)
    }
    const { width, height } = mainWindow.getBounds()
    _dragPinnedSize = { width, height }
  })

  ipcMain.on('window:drag-end', () => { _dragPinnedSize = null })

  ipcMain.on('window:move-to', (_, x, y) => {
    const mainWindow = winRef.get()
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (_dragPinnedSize) {
      mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: _dragPinnedSize.width, height: _dragPinnedSize.height })
    } else {
      mainWindow.setPosition(Math.round(x), Math.round(y))
    }
  })

  ipcMain.handle('window:minimize', () => { winRef.get()?.minimize() })

  ipcMain.handle('window:maximize', () => {
    const mainWindow = winRef.get()
    if (!mainWindow) return false
    const bounds = mainWindow.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const wa = display.workArea
    if (_isMaximizedManual || mainWindow.isMaximized()) {
      // Restore
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        // Manually maximized — restore to saved pre-maximize bounds, or default 70%
        const restore = _preMaximizeBounds || {
          x: Math.round(wa.x + wa.width * 0.15),
          y: Math.round(wa.y + wa.height * 0.1),
          width: Math.round(wa.width * 0.7),
          height: Math.round(wa.height * 0.8)
        }
        mainWindow.setBounds(restore)
        _preMaximizeBounds = null
        _isMaximizedManual = false
        mainWindow.webContents.send('window:maximized', false)
      }
      return false
    } else {
      // Maximize to current display work area via setBounds (reliable on all monitors)
      _preMaximizeBounds = { ...bounds }
      mainWindow.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height })
      _isMaximizedManual = true
      mainWindow.webContents.send('window:maximized', true)
      return true
    }
  })

  ipcMain.handle('window:close', () => {
    // Force exit after a short grace period in case cleanup hangs
    setTimeout(() => { process.exit(0) }, 3000)
    app.quit()
  })

  ipcMain.handle('window:is-maximized', () => _isMaximizedManual || (winRef.get()?.isMaximized() ?? false))

  // -- Minibar mode -----------------------------------------------------------

  ipcMain.handle('window:set-minibar', (_, arg) => {
    _loadMinibarBounds()
    const mainWindow = winRef.get()
    if (!mainWindow) return
    // arg can be a plain boolean (initial enter/exit) or { enable, height?, width? }
    const enable = typeof arg === 'object' ? arg.enable : !!arg
    if (enable) {
      const explicitW = typeof arg === 'object' && arg.width
      const explicitH = typeof arg === 'object' && arg.height
      const barW = explicitW ? arg.width  : MINIBAR_DEFAULT_W
      const barH = explicitH ? arg.height : 80
      if (!_preMinibarBounds) {
        // Entering minibar mode: save normal bounds, disable OS resize, apply constraints
        _preMinibarBounds = mainWindow.getBounds()
        const allDisplays = screen.getAllDisplays()
        const currentDisplay = screen.getDisplayMatching(_preMinibarBounds)
        logger.info('[minibar] === ENTERING MINIBAR MODE ===')
        logger.info('[minibar] mainWindow bounds:', JSON.stringify(_preMinibarBounds))
        logger.info('[minibar] all displays:', JSON.stringify(allDisplays.map((d, i) => ({ i, id: d.id, bounds: d.bounds, workArea: d.workArea }))))
        logger.info('[minibar] matched display:', JSON.stringify({ id: currentDisplay.id, bounds: currentDisplay.bounds, workArea: currentDisplay.workArea }))
        logger.info('[minibar] _lastMinibarBounds:', JSON.stringify(_lastMinibarBounds))
        mainWindow.setMinimumSize(200, 80)
        mainWindow.setResizable(false)
        mainWindow.setAlwaysOnTop(true, 'floating')
        const wa = currentDisplay.workArea
        // Check if saved minibar bounds are on the same display as the main window
        const savedOnSameDisplay = _lastMinibarBounds
          && screen.getDisplayMatching(_lastMinibarBounds).id === currentDisplay.id
        if (_lastMinibarBounds && savedOnSameDisplay) {
          logger.info('[minibar] restoring saved bounds (same display):', JSON.stringify(_lastMinibarBounds))
          _minibarIntendedW = _lastMinibarBounds.width
          _minibarIntendedH = _lastMinibarBounds.height
          mainWindow.setBounds(_lastMinibarBounds)
        } else {
          // No saved bounds, or saved on a different monitor — center on current display
          const useW = _lastMinibarBounds ? _lastMinibarBounds.width : barW
          const useH = _lastMinibarBounds ? _lastMinibarBounds.height : barH
          _minibarIntendedW = useW
          _minibarIntendedH = useH
          const newBounds = { x: Math.round(wa.x + (wa.width - useW) / 2), y: wa.y, width: useW, height: useH }
          logger.info('[minibar] centering on current display:', JSON.stringify(newBounds), 'savedOnSameDisplay:', savedOnSameDisplay)
          mainWindow.setBounds(newBounds)
        }
      } else {
        // Already in minibar mode: only update what was explicitly passed
        const cur = mainWindow.getBounds()
        const newW = explicitW ? arg.width : _minibarIntendedW
        const newH = explicitH ? arg.height : _minibarIntendedH
        _minibarIntendedW = newW
        _minibarIntendedH = newH
        mainWindow.setBounds({ x: cur.x, y: cur.y, width: newW, height: newH })
      }
    } else {
      // Exiting: snapshot and persist current minibar bounds
      _saveMinibarBounds()
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setResizable(true)
      mainWindow.setMinimumSize(600, 400)
      if (_preMinibarBounds) mainWindow.setBounds(_preMinibarBounds)
      _preMinibarBounds = null
    }
  })

  ipcMain.handle('window:save-minibar-bounds', () => _saveMinibarBounds())

  ipcMain.handle('window:set-position', (_, x, y) => {
    const mainWindow = winRef.get()
    if (!mainWindow) return
    // Use setBounds with pinned intended dimensions to prevent Windows DPI scaling
    // from silently growing the window width on each setPosition call.
    mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: _minibarIntendedW, height: _minibarIntendedH })
  })
}

module.exports = {
  register,
  // Exported for use by createWindow() in main.js
  _attachMinibarMovedGuard,
  // Expose maximize state so main.js window event listeners can write to it
  getMaximizeState: () => ({ _isMaximizedManual, _preMaximizeBounds }),
  setMaximizeState: (manual, bounds) => {
    _isMaximizedManual = manual
    _preMaximizeBounds = bounds
  },
}
