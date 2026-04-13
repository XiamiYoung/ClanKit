/**
 * afterPack hook — embeds icon into the app exe after electron-builder packs it.
 * Required because signAndEditExecutable=false skips winCodeSign (which fails on
 * Windows without admin privileges due to macOS symlinks in the 7z archive).
 * We use rcedit directly just to set the icon, which doesn't need winCodeSign.
 */
const path = require('path')
const { execSync } = require('child_process')
const fs = require('fs')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exePath = path.join(context.appOutDir, 'ClankAI.exe')
  const iconPath = path.resolve(__dirname, '../build/icons/icon.ico')
  const rceditPath = path.resolve(__dirname, '../node_modules/electron-winstaller/vendor/rcedit.exe')

  if (!fs.existsSync(rceditPath)) {
    console.warn('[after-pack] rcedit.exe not found:', rceditPath)
    return
  }
  if (!fs.existsSync(iconPath)) {
    console.warn('[after-pack] icon.ico not found:', iconPath)
    return
  }

  try {
    execSync(`"${rceditPath}" "${exePath}" --set-icon "${iconPath}"`, { stdio: 'inherit' })
    console.log('[after-pack] Icon embedded successfully')
  } catch (err) {
    console.error('[after-pack] Failed to embed icon:', err.message)
  }
}
