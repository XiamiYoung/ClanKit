/**
 * Telemetry IPC — exposes a manual trigger for the install ping so the renderer
 * can fire it the moment the setup wizard completes (instead of waiting until
 * the next app launch). The startup-time call in main.js still runs but is
 * gated on `onboardingCompleted=true` inside telemetry.js itself.
 *
 * Channels: telemetry:*
 */
const { ipcMain } = require('electron')

function register() {
  ipcMain.handle('telemetry:fire-install-ping', async () => {
    try {
      await require('../lib/telemetry').sendInstallPing()
      return { ok: true }
    } catch (err) {
      // sendInstallPing already retries internally; we swallow the final error
      // so the renderer flow (wizard → /chats) never blocks on this.
      return { ok: false, error: err?.message || String(err) }
    }
  })
}

module.exports = { register }
