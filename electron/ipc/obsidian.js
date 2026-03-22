/**
 * IPC handlers for Obsidian-style vault file operations and Draw.io support.
 * Channels: obsidian:*, drawio:*
 */
const path = require('path')
const fs = require('fs')
const { ipcMain, dialog } = require('electron')
const { execFile } = require('child_process')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')
const fh = require('../lib/fileHelpers')

// Normalize paths for the current platform (WSL ↔ Windows ↔ Linux)
function toLinuxPath(p) {
  if (!p) return p
  const m = p.match(/^([A-Za-z]):[/\\](.*)$/)
  if (m) {
    if (fh.IS_WSL) {
      const drive = m[1].toLowerCase()
      const rest = m[2].replace(/\\/g, '/')
      return `/mnt/${drive}/${rest}`.replace(/\/+$/, '') || `/mnt/${drive}`
    }
    return p.replace(/\\/g, '/')
  }
  return p
}

function register() {
  const p = () => ds.paths()

  // Config persistence — DoCPath stored in config.json
  ipcMain.handle('obsidian:get-config', async () => {
    const cfg = await ds.readJSONAsync(p().CONFIG_FILE, {})
    return { vaultPath: cfg.DoCPath || '', lastOpenedDoc: cfg.docsLastOpenedDoc || null }
  })

  ipcMain.handle('obsidian:save-config', async (_, config) => {
    const existing = ds.readJSON(p().CONFIG_FILE, {})
    if ('vaultPath' in config) existing.DoCPath = config.vaultPath || ''
    if ('lastOpenedDoc' in config) {
      if (config.lastOpenedDoc) existing.docsLastOpenedDoc = config.lastOpenedDoc
      else delete existing.docsLastOpenedDoc
    }
    ds.writeJSON(p().CONFIG_FILE, existing)
    return true
  })

  // Folder picker — on WSL use native Windows Explorer dialog via PowerShell
  ipcMain.handle('obsidian:pick-folder', async () => {
    if (fh.isFilePickerOpen()) return null
    fh.setFilePickerOpen(true)
    try {
      if (fh.IS_WSL) {
        try {
          const folder = await fh.showWindowsFolderPicker()
          if (!folder) return null
          return folder
        } catch (err) {
          logger.error('Windows folder picker failed, falling back to GTK:', err.message)
        }
      }
      const result = await dialog.showOpenDialog(winRef.get(), {
        properties: ['openDirectory'],
        title: 'Select Obsidian Vault Folder'
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    } finally {
      fh.setFilePickerOpen(false)
    }
  })

  // Read directory tree (recursive)
  ipcMain.handle('obsidian:read-tree', (_, rawDir) => {
    const dir = toLinuxPath(rawDir)
    const SKIP_DIRS = new Set(['$RECYCLE.BIN', 'System Volume Information', '$WinREAgent', 'Recovery', 'node_modules'])
    const MAX_DEPTH = 10

    function readDir(dirPath, depth) {
      if (depth > MAX_DEPTH) return []
      let entries
      try {
        if (!fs.existsSync(dirPath)) return []
        entries = fs.readdirSync(dirPath, { withFileTypes: true })
      } catch { return [] }
      const items = []
      const sorted = entries
        .filter(e => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })
      for (const entry of sorted) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          const children = readDir(fullPath, depth + 1)
          items.push({ name: entry.name, path: fullPath, type: 'dir', children })
        } else {
          const binaryExts = new Set([
            'exe','dll','so','dylib','bin','o','a','lib',
            'zip','gz','tar','bz2','7z','rar','xz','zst',
            'woff','woff2','ttf','otf','eot',
            'class','pyc','pyo','wasm',
            'db','sqlite','sqlite3',
            'DS_Store',
          ])
          const ext = (entry.name.split('.').pop() || '').toLowerCase()
          if (!binaryExts.has(ext)) {
            items.push({ name: entry.name, path: fullPath, type: 'file' })
          }
        }
      }
      return items
    }

    try { return readDir(dir, 0) } catch (err) {
      logger.error('obsidian:read-tree error', err.message)
      return []
    }
  })

  ipcMain.handle('obsidian:read-file', (_, rawPath) => {
    try { return { content: fs.readFileSync(toLinuxPath(rawPath), 'utf8') } }
    catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:write-file', (_, rawPath, content) => {
    try { fs.writeFileSync(toLinuxPath(rawPath), content, 'utf8'); return { success: true } }
    catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:read-file-binary', (_, rawPath) => {
    try { return { base64: fs.readFileSync(toLinuxPath(rawPath)).toString('base64') } }
    catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:write-file-binary', (_, rawPath, base64) => {
    try { fs.writeFileSync(toLinuxPath(rawPath), Buffer.from(base64, 'base64')); return { success: true } }
    catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:read-image-base64', (_, rawPath) => {
    try {
      const filePath = toLinuxPath(rawPath)
      if (!fs.existsSync(filePath)) return { error: 'File not found' }
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp' }
      const mime = mimeTypes[ext] || 'application/octet-stream'
      const base64 = fs.readFileSync(filePath).toString('base64')
      return { base64, mime }
    } catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:save-image', (_, rawDir, fileName, base64Data) => {
    try {
      const dir = toLinuxPath(rawDir)
      const assetsDir = path.join(dir, 'assets')
      if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })
      const filePath = path.join(assetsDir, fileName)
      const buf = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(filePath, buf)
      logger.info('Saved image:', filePath, `(${buf.length} bytes)`)
      return { success: true, relativePath: `assets/${fileName}`, absolutePath: filePath }
    } catch (err) {
      logger.error('obsidian:save-image error:', err.message)
      return { error: err.message }
    }
  })

  ipcMain.handle('obsidian:create-file', (_, rawDir, name) => {
    try {
      const safeName = name.endsWith('.md') ? name : name + '.md'
      const filePath = path.join(toLinuxPath(rawDir), safeName)
      if (fs.existsSync(filePath)) return { error: 'File already exists' }
      fs.writeFileSync(filePath, '', 'utf8')
      return { success: true, path: filePath }
    } catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:create-folder', (_, rawDir, name) => {
    try {
      const folderPath = path.join(toLinuxPath(rawDir), name)
      if (fs.existsSync(folderPath)) return { error: 'Folder already exists' }
      fs.mkdirSync(folderPath, { recursive: true })
      return { success: true, path: folderPath }
    } catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:create-drawio', (_, rawDir, name) => {
    try {
      const safeName = name.endsWith('.drawio') ? name : name + '.drawio'
      const filePath = path.join(toLinuxPath(rawDir), safeName)
      if (fs.existsSync(filePath)) return { error: 'File already exists' }
      const blankXml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
      fs.writeFileSync(filePath, blankXml, 'utf8')
      return { success: true, path: filePath }
    } catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:create-docx', async (_, rawDir, name) => {
    try {
      const safeName = name.endsWith('.docx') ? name : name + '.docx'
      const filePath = path.join(toLinuxPath(rawDir), safeName)
      if (fs.existsSync(filePath)) return { error: 'File already exists' }
      const { Document, Packer, Paragraph } = require('docx')
      const doc = new Document({ sections: [{ children: [new Paragraph('')] }] })
      const buffer = await Packer.toBuffer(doc)
      fs.writeFileSync(filePath, buffer)
      return { success: true, path: filePath }
    } catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:create-xlsx', async (_, rawDir, name) => {
    try {
      const safeName = name.endsWith('.xlsx') ? name : name + '.xlsx'
      const filePath = path.join(toLinuxPath(rawDir), safeName)
      if (fs.existsSync(filePath)) return { error: 'File already exists' }
      const ExcelJS = require('exceljs')
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('Sheet1')
      const buffer = await workbook.xlsx.writeBuffer()
      fs.writeFileSync(filePath, Buffer.from(buffer))
      return { success: true, path: filePath }
    } catch (err) { return { error: err.message } }
  })

  ipcMain.handle('drawio:get-frame-path', () => path.join(__dirname, '..', 'drawio-frame.html'))
  ipcMain.handle('drawio:get-preload-path', () => path.join(__dirname, '..', 'drawio-preload.js'))

  ipcMain.handle('obsidian:delete-file', (_, rawPath) => {
    try {
      const fp = toLinuxPath(rawPath)
      const stat = fs.statSync(fp)
      if (stat.isDirectory()) fs.rmdirSync(fp)
      else fs.unlinkSync(fp)
      return { success: true }
    } catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:is-dir-empty', (_, rawPath) => {
    try {
      const fp = toLinuxPath(rawPath)
      const stat = fs.statSync(fp)
      if (!stat.isDirectory()) return { isDir: false }
      const entries = fs.readdirSync(fp).filter(e => !e.startsWith('.'))
      return { isDir: true, empty: entries.length === 0 }
    } catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:rename', (_, rawOld, rawNew) => {
    try {
      const op = toLinuxPath(rawOld)
      const np = toLinuxPath(rawNew)
      if (fs.existsSync(np)) return { error: 'Target already exists' }
      fs.renameSync(op, np)
      return { success: true }
    } catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:copy-files-to-dir', (_, sourcePaths, rawDestDir) => {
    const results = []
    const destDir = toLinuxPath(rawDestDir)
    if (!fs.existsSync(destDir)) {
      try { fs.mkdirSync(destDir, { recursive: true }) } catch (err) { return [{ error: err.message }] }
    }
    for (const rawSrc of sourcePaths) {
      try {
        const src = toLinuxPath(rawSrc)
        if (!fs.existsSync(src)) { results.push({ error: `Not found: ${src}` }); continue }
        const stat = fs.statSync(src)
        if (stat.isDirectory()) { results.push({ error: `Directories not supported: ${src}` }); continue }
        const baseName = path.basename(src)
        const ext = path.extname(baseName)
        const stem = path.basename(baseName, ext)
        let destPath = path.join(destDir, baseName)
        let counter = 1
        while (fs.existsSync(destPath)) {
          destPath = path.join(destDir, `${stem} (${counter})${ext}`)
          counter++
        }
        fs.copyFileSync(src, destPath)
        results.push({ success: true, path: destPath, name: path.basename(destPath) })
      } catch (err) { results.push({ error: err.message }) }
    }
    return results
  })
}

module.exports = { register }
