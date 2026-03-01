// Preload for the draw.io webview.
// Runs in the context of drawio-frame.html (the local bridge page).
// The draw.io iframe posts messages to window.parent (this window).
// We forward those messages to the Vue host via ipcRenderer.sendToHost.
const { ipcRenderer } = require('electron')

window.addEventListener('message', function (e) {
  if (!e.data) return
  try {
    var msg = e.data
    if (typeof msg === 'string') msg = JSON.parse(msg)
    // Only forward draw.io → host messages (they carry an 'event' field).
    // Ignore action messages (host → draw.io) to prevent echo loops.
    if (msg && typeof msg.event === 'string') {
      ipcRenderer.sendToHost('drawio-message', msg)
    }
  } catch (err) {
    // Non-JSON or unexpected shape — ignore
  }
})
