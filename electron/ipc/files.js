/**
 * IPC handlers for file attachments, drag-drop, image data URI, and clipboard.
 * Channels: files:*, clipboard:get-image
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { v4: uuidv4 } = require('uuid')
const { ipcMain, dialog, shell } = require('electron')
const { execFile } = require('child_process')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')

// --- Media types and image extensions ----------------------------------------

const MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

const IMAGE_EXTS = new Set(Object.keys(MEDIA_TYPES))
const MAX_IMAGE_SIZE = 20 * 1024 * 1024   // 20 MB


// --- Read attachment ---------------------------------------------------------

function readAttachment(rawPath) {
  const filePath = rawPath
  const name = path.basename(filePath)
  const id = uuidv4()

  try {
    const stat = fs.statSync(filePath)
    const ext = path.extname(name).toLowerCase()

    // -- Image: read base64 for visual preview --
    if (!stat.isDirectory() && IMAGE_EXTS.has(ext)) {
      if (stat.size > MAX_IMAGE_SIZE) {
        return { id, name, path: filePath, type: 'image_error', error: `Image too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 20 MB)` }
      }
      const base64 = fs.readFileSync(filePath).toString('base64')
      const mediaType = MEDIA_TYPES[ext]
      return {
        id, name, path: filePath, type: 'image',
        mediaType, base64, size: stat.size,
        preview: `data:${mediaType};base64,${base64}`
      }
    }

    // -- Everything else (folder, text, binary): path only --
    return { id, name, path: filePath, type: 'path' }
  } catch (err) {
    return { id, name, path: filePath, type: 'path' }
  }
}

// --- Guard: prevent concurrent file/folder picker dialogs --------------------
let filePickerOpen = false

/**
 * Show a native Windows file picker via PowerShell.
 * Returns an array of Windows path strings, or [] on cancel.
 */
function showWindowsFilePicker() {
  return new Promise((resolve) => {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.StartPosition = 'Manual'
$owner.Location = New-Object System.Drawing.Point(-9999, -9999)
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.ShowInTaskbar = $false
$owner.Show()
$owner.Hide()

$results = @()

$fd = New-Object System.Windows.Forms.OpenFileDialog
$fd.Multiselect = $true
$fd.Title = 'Select files to attach'
$fd.Filter = 'All files (*.*)|*.*|Images (*.png;*.jpg;*.jpeg;*.gif;*.webp)|*.png;*.jpg;*.jpeg;*.gif;*.webp|Text files (*.txt;*.md;*.js;*.ts;*.py;*.json;*.yaml;*.yml;*.html;*.css;*.xml;*.csv)|*.txt;*.md;*.js;*.ts;*.py;*.json;*.yaml;*.yml;*.html;*.css;*.xml;*.csv'
if ($fd.ShowDialog($owner) -eq 'OK') {
  $results += $fd.FileNames
}

$owner.Close()
$results -join '|'
`.trim()

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 120000 },
      (err, stdout) => {
        if (err) {
          logger.error('PowerShell file picker error:', err.message)
          return resolve([])
        }
        const paths = stdout.trim().split('|').filter(Boolean)
        resolve(paths)
      }
    )
  })
}


function register() {
  // files:pick -- native OS dialog (supports multi-select, files and folders)
  ipcMain.handle('files:pick', async () => {
    if (filePickerOpen) return []
    filePickerOpen = true
    try {
      const mainWindow = winRef.get()
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        title: 'Attach Files'
      })
      if (result.canceled || result.filePaths.length === 0) return []
      return result.filePaths.map(fp => readAttachment(fp))
    } finally {
      filePickerOpen = false
    }
  })

  // files:read-for-attachment -- single path (from drag-drop), auto-converts Windows paths
  ipcMain.handle('files:read-for-attachment', (_, filePath) => {
    return readAttachment(filePath)
  })

  // files:resolve-drop-paths -- resolve multiple raw strings from a drag-drop event
  // Accepts array of raw path strings (Windows or Linux), returns attachment objects
  ipcMain.handle('files:resolve-drop-paths', (_, rawPaths) => {
    if (!Array.isArray(rawPaths)) return []
    return rawPaths
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => readAttachment(p))
  })

  // files:open-image-data-uri -- write a base64 data URI to a temp file and open with the OS viewer
  ipcMain.handle('files:open-image-data-uri', async (_, { dataUri, name }) => {
    try {
      // Extract base64 payload from data URI (data:<mediaType>;base64,<data>)
      const match = dataUri.match(/^data:(image\/[^;]+);base64,(.+)$/s)
      if (!match) return { error: 'Invalid data URI' }
      const ext = match[1].split('/')[1] || 'png'
      // Use a short hash of the image data as filename so each unique image gets its own file
      // and re-clicking never re-writes the same content
      const crypto = require('crypto')
      const hash = crypto.createHash('md5').update(match[2]).digest('hex').slice(0, 10)
      const tmpPath = path.join(os.tmpdir(), `clankai-img-${hash}.${ext}`)
      if (!fs.existsSync(tmpPath)) {
        fs.writeFileSync(tmpPath, Buffer.from(match[2], 'base64'))
      }
      const result = await shell.openPath(tmpPath)
      if (result) return { error: result }
      return { success: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  // Get image from Windows clipboard via PowerShell.
  // On native Linux/macOS: not supported (browser clipboard handles images natively).
  ipcMain.handle('clipboard:get-image', async () => {
    if (process.platform !== 'win32') return { hasImage: false }
    const psCmd = 'powershell'
    return new Promise((resolve) => {
      const ps = `
Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img -eq $null) {
  Write-Output 'NO_IMAGE'
} else {
  $ms = New-Object System.IO.MemoryStream
  $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Close()
  $img.Dispose()
  [Convert]::ToBase64String($bytes)
}
`.trim()

      execFile(psCmd, ['-NoProfile', '-NonInteractive', '-Command', ps],
        { timeout: 15000, maxBuffer: 50 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            logger.error('clipboard:get-image PowerShell error:', err.message)
            return resolve({ hasImage: false, error: err.message })
          }
          const output = stdout.trim()
          if (output === 'NO_IMAGE' || !output) {
            return resolve({ hasImage: false })
          }
          logger.info('clipboard:get-image got image, base64 length:', output.length)
          resolve({ hasImage: true, base64: output, type: 'image/png' })
        }
      )
    })
  })
}

module.exports = {
  register,
  // Exported for use by other modules that need file reading helpers
  readAttachment,
  filePickerOpen: {
    get: () => filePickerOpen,
    set: (v) => { filePickerOpen = v },
  },
  showWindowsFilePicker,
}
