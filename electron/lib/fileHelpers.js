/**
 * Shared file/path utilities used by multiple IPC handler modules.
 * Path conversion, file picker helpers, attachment reading.
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { v4: uuidv4 } = require('uuid')
const { execFile } = require('child_process')
const { logger } = require('../logger')

// --- Media types and limits ---
const MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}
const IMAGE_EXTS = new Set(Object.keys(MEDIA_TYPES))
const MAX_IMAGE_SIZE = 20 * 1024 * 1024   // 20 MB

/**
 * Read a file attachment, returning metadata + base64 for images.
 */
function readAttachment(rawPath) {
  const filePath = rawPath
  const name = path.basename(filePath)
  const id = uuidv4()
  try {
    const stat = fs.statSync(filePath)
    const ext = path.extname(name).toLowerCase()
    if (!stat.isDirectory() && IMAGE_EXTS.has(ext)) {
      if (stat.size > MAX_IMAGE_SIZE) {
        return { id, name, path: filePath, type: 'image_error', error: `Image too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 20 MB)` }
      }
      const base64 = fs.readFileSync(filePath).toString('base64')
      const mediaType = MEDIA_TYPES[ext]
      return { id, name, path: filePath, type: 'image', mediaType, base64, size: stat.size, preview: `data:${mediaType};base64,${base64}` }
    }
    return { id, name, path: filePath, type: 'path' }
  } catch (err) {
    return { id, name, path: filePath, type: 'path' }
  }
}

// Guard: prevent concurrent file/folder picker dialogs
let filePickerOpen = false
function isFilePickerOpen() { return filePickerOpen }
function setFilePickerOpen(val) { filePickerOpen = val }

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

/**
 * Show a native Windows folder picker via PowerShell.
 * Returns a Windows path string, or null on cancel.
 */
function showWindowsFolderPicker() {
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

$fbd = New-Object System.Windows.Forms.FolderBrowserDialog
$fbd.Description = 'Select a folder'
$fbd.ShowNewFolderButton = $true
if ($fbd.ShowDialog($owner) -eq 'OK') {
  $fbd.SelectedPath
} else {
  ''
}

$owner.Close()
`.trim()
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 120000 },
      (err, stdout) => {
        if (err) {
          logger.error('PowerShell folder picker error:', err.message)
          return resolve(null)
        }
        const selected = stdout.trim()
        resolve(selected || null)
      }
    )
  })
}

module.exports = {
  MEDIA_TYPES,
  IMAGE_EXTS,
  MAX_IMAGE_SIZE,
  readAttachment,
  isFilePickerOpen,
  setFilePickerOpen,
  showWindowsFilePicker,
  showWindowsFolderPicker,
}
