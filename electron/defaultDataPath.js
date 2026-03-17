// electron/defaultDataPath.js
// Computes the default data directory WITHOUT requiring Electron's `app` module.
// Mirrors: path.join(app.getPath('appData'), 'clankai', 'data')
//
// Windows:  C:\Users\<user>\AppData\Roaming\clankai\data
// macOS:    ~/Library/Application Support/clankai/data
// Linux:    ~/.config/clankai/data
'use strict'
const path = require('path')
const os   = require('os')

function defaultDataPath() {
  let appData
  if (process.platform === 'win32') {
    appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  } else if (process.platform === 'darwin') {
    appData = path.join(os.homedir(), 'Library', 'Application Support')
  } else {
    appData = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  }
  return path.join(appData, 'clankai', 'data')
}

module.exports = { defaultDataPath }
