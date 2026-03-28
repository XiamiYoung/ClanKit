/**
 * IPC handlers for IM Bridge (Telegram, Feishu, WhatsApp, Teams).
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

  ipcMain.handle('im:teams-request-auth', (_, opts) => {
    _imBridge.requestTeamsAuth(opts)
  })

  ipcMain.handle('im:teams-sign-out', () => {
    _imBridge.teamsSignOut()
    return _imBridge.getStatus()
  })

  ipcMain.handle('im:teams-auth-status', () => {
    return _imBridge.getTeamsAuthStatus()
  })
}

module.exports = { register }
