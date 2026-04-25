/**
 * IPC handlers for Obsidian-style vault file operations and Draw.io support.
 * Channels: obsidian:*, drawio:*
 */
const path = require('path')
const fs = require('fs')
const fsp = require('fs').promises
const { ipcMain, dialog } = require('electron')
const { execFile } = require('child_process')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')
const fh = require('../lib/fileHelpers')

// Normalize path separators
function toLinuxPath(p) {
  if (!p) return p
  return p
}

// Hard caps for AI Doc open path. 20MB is well above any realistic markdown/code
// file; anything larger is almost certainly binary or a log dump.
const AIDOC_MAX_BYTES = 20 * 1024 * 1024
// Probe reads the file head to decide if it looks like text.
const PROBE_HEAD_BYTES = 8 * 1024
const PROBE_TIMEOUT_MS = 3000

// Read up to `head` bytes from a file with a hard timeout. Never throws; on
// failure returns null so callers can treat it as "unprobable".
async function _readHeadWithTimeout(filePath, head, timeoutMs) {
  let fh = null
  let timer = null
  try {
    const openP = fsp.open(filePath, 'r')
    fh = await Promise.race([
      openP,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('probe_timeout')), timeoutMs) }),
    ])
    clearTimeout(timer); timer = null
    const buf = Buffer.alloc(head)
    const { bytesRead } = await Promise.race([
      fh.read(buf, 0, head, 0),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('probe_timeout')), timeoutMs) }),
    ])
    clearTimeout(timer); timer = null
    return buf.subarray(0, bytesRead)
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
    if (fh) { try { await fh.close() } catch {} }
  }
}

// Heuristic: decide if a buffer looks like text.
//   - Any NUL byte (0x00) → binary.
//   - Otherwise strictly validate as UTF-8 with TextDecoder fatal mode.
function _looksLikeText(buf) {
  if (!buf || buf.length === 0) return true // empty file is editable
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x00) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return true
  } catch {
    return false
  }
}

// Extensions that are binary but DO have dedicated renderers in AI Doc.
// These skip the text-probe and are always considered openable (size permitting).
const AIDOC_BINARY_RENDERABLE = new Set([
  'pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tiff', 'svg',
  'drawio',
])

async function _probeSingle(rawPath) {
  const filePath = toLinuxPath(rawPath)
  let stat
  try { stat = await fsp.stat(filePath) } catch (err) { return { openable: false, reason: 'stat_error', error: err.message } }
  if (stat.isDirectory()) return { openable: false, reason: 'is_directory' }
  if (stat.size > AIDOC_MAX_BYTES) return { openable: false, reason: 'too_large', size: stat.size }

  const ext = (path.extname(filePath) || '').slice(1).toLowerCase()
  if (AIDOC_BINARY_RENDERABLE.has(ext)) return { openable: true, kind: 'binary_renderable', size: stat.size }

  const head = await _readHeadWithTimeout(filePath, PROBE_HEAD_BYTES, PROBE_TIMEOUT_MS)
  if (head === null) return { openable: false, reason: 'probe_timeout_or_io' }
  return _looksLikeText(head)
    ? { openable: true, kind: 'text', size: stat.size }
    : { openable: false, reason: 'binary_content', size: stat.size }
}

function register() {
  const p = () => ds.paths()

  // Config persistence — DoCPath stored in config.json
  ipcMain.handle('obsidian:get-config', async () => {
    const cfg = await ds.readJSONAsync(p().CONFIG_FILE, {})
    let vaultPath = cfg.DoCPath || ''
    // Auto-initialize to default aidoc path if not set
    if (!vaultPath) {
      const dataDir = p().DATA_DIR || ''
      if (dataDir) {
        vaultPath = path.join(dataDir, 'clank_aidoc')
        try { fs.mkdirSync(vaultPath, { recursive: true }) } catch {}
        // Persist so it's used next time
        cfg.DoCPath = vaultPath
        ds.writeJSON(p().CONFIG_FILE, cfg)
      }
    }
    return { vaultPath, lastOpenedDoc: cfg.docsLastOpenedDoc || null }
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

  // Folder picker
  ipcMain.handle('obsidian:pick-folder', async () => {
    if (fh.isFilePickerOpen()) return null
    fh.setFilePickerOpen(true)
    try {
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
          // All files are returned. The renderer filters the tree by probing
          // each file's content (see obsidian:probe-files) — we no longer
          // maintain an extension blocklist here because it can't be exhaustive.
          items.push({ name: entry.name, path: fullPath, type: 'file' })
        }
      }
      return items
    }

    try { return readDir(dir, 0) } catch (err) {
      logger.error('obsidian:read-tree error', err.message)
      return []
    }
  })

  // Async read with 20MB stat precheck. Sync readFileSync used to block the
  // main process event loop on slow/stub files (OneDrive placeholders, hangs),
  // defeating the renderer-side timeout. Async + stat guard fixes both.
  ipcMain.handle('obsidian:read-file', async (_, rawPath) => {
    try {
      const fp = toLinuxPath(rawPath)
      const stat = await fsp.stat(fp)
      if (stat.size > AIDOC_MAX_BYTES) return { error: 'FILE_TOO_LARGE', code: 'too_large', size: stat.size }
      const content = await fsp.readFile(fp, 'utf8')
      return { content }
    } catch (err) { return { error: err.message, code: 'io_error' } }
  })

  ipcMain.handle('obsidian:write-file', (_, rawPath, content) => {
    try { fs.writeFileSync(toLinuxPath(rawPath), content, 'utf8'); return { success: true } }
    catch (err) { return { error: err.message } }
  })

  ipcMain.handle('obsidian:read-file-binary', async (_, rawPath) => {
    try {
      const fp = toLinuxPath(rawPath)
      const stat = await fsp.stat(fp)
      if (stat.size > AIDOC_MAX_BYTES) return { error: 'FILE_TOO_LARGE', code: 'too_large', size: stat.size }
      const buf = await fsp.readFile(fp)
      return { base64: buf.toString('base64') }
    } catch (err) { return { error: err.message, code: 'io_error' } }
  })

  ipcMain.handle('obsidian:probe-file', async (_, rawPath) => _probeSingle(rawPath))

  // Batch probe — returns a dict keyed by path. Runs probes in parallel but
  // caps concurrency to avoid saturating the libuv threadpool on large vaults.
  ipcMain.handle('obsidian:probe-files', async (_, rawPaths) => {
    if (!Array.isArray(rawPaths) || rawPaths.length === 0) return {}
    const result = {}
    const CONCURRENCY = 16
    let i = 0
    async function worker() {
      while (i < rawPaths.length) {
        const idx = i++
        const p = rawPaths[idx]
        try { result[p] = await _probeSingle(p) }
        catch (err) { result[p] = { openable: false, reason: 'probe_exception', error: err.message } }
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, rawPaths.length) }, worker)
    await Promise.all(workers)
    return result
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
