const { ipcMain, BrowserWindow } = require('electron')
const updater = require('../updater')

function register() {
  // Push events to all renderer windows.
  updater.setEmitter((eventName, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send(`updater:${eventName}`, payload)
      } catch (_) { /* window may have been destroyed */ }
    }
  })

  ipcMain.handle('updater:check', async (_e, opts = {}) => {
    return updater.check({ trigger: opts.trigger || 'auto' })
  })

  ipcMain.handle('updater:install', async () => {
    // Win path: starts the download. The "downloaded" event flips the
    // banner into "Restart now"; user's next click hits quit-and-install.
    await updater.startDownload()
  })

  ipcMain.handle('updater:quit-and-install', async () => {
    updater.quitAndInstall()
  })

  ipcMain.handle('updater:open-download-page', async () => {
    updater.openExternalDownload()
  })

  ipcMain.handle('updater:get-status', async () => {
    return updater.getState()
  })
}

module.exports = { register }
