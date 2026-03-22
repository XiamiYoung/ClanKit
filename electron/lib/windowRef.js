/**
 * Shared reference to the main BrowserWindow instance.
 * Used by IPC handler modules that need to send events to the renderer.
 */
let _mainWindow = null

module.exports = {
  get: () => _mainWindow,
  set: (win) => { _mainWindow = win },
}
