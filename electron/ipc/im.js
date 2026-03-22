/**
 * IPC handlers for IM Bridge (Telegram, Feishu, WhatsApp).
 * Channels: im:*
 */
const { ipcMain } = require('electron')
const ds = require('../lib/dataStore')

let _imBridge = null

function register({ imBridge }) {
  _imBridge = imBridge

  ipcMain.handle('im:get-status', () => _imBridge.getStatus())

  ipcMain.handle('im:start', () => {
    const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
    _imBridge.start(cfg)
    return _imBridge.getStatus()
  })

  ipcMain.handle('im:stop', () => {
    _imBridge.stop()
    return _imBridge.getStatus()
  })

  ipcMain.handle('im:get-sessions', () => _imBridge.getStatus().sessions)

  ipcMain.handle('im:start-platform', (_, platform) => {
    const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
    _imBridge.start(cfg)
    return _imBridge.startPlatform(platform)
  })

  ipcMain.handle('im:stop-platform', (_, platform) => _imBridge.stopPlatform(platform))

  ipcMain.handle('im:whatsapp-request-qr', () => {
    _imBridge.requestWhatsAppQR()
  })
}

module.exports = { register }
