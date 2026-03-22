/**
 * IPC handlers for shell execution and file/URL opening.
 * Channels: shell:*
 */
const { ipcMain, shell } = require('electron')
const os = require('os')
const { execFile } = require('child_process')

function register() {
  // Uses execFile (not exec) to prevent shell injection - command and args separated
  ipcMain.handle('shell:exec', async (_, { cmd, args }) => {
    return new Promise((resolve) => {
      const safeArgs = Array.isArray(args) ? args : []
      execFile(cmd, safeArgs, { timeout: 30000, cwd: os.homedir() }, (err, stdout, stderr) => {
        resolve({ stdout: stdout || '', stderr: stderr || '', error: err ? err.message : null })
      })
    })
  })
}

module.exports = { register }
