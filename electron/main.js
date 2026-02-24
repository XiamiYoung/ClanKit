const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')

// Point Chromium's fontconfig at our bundled fonts.conf BEFORE electron is
// required — this is the only hook that runs before Chromium initialises its
// font subsystem. On Linux/WSL2 this makes Segoe UI Emoji available so the
// renderer can display emoji without any user system changes.
if (process.platform === 'linux') {
  process.env.FONTCONFIG_FILE = path.join(__dirname, 'fonts.conf')
}

const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron')
const os = require('os')
const { execFile } = require('child_process')
const { logger, LOG_DIR } = require('./logger')

// Load .env into the Electron main process using a direct parser.
// dotenv v17 has ESM-first issues in Electron; plain fs is 100% reliable.
;(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envFile)) return
  const lines = fs.readFileSync(envFile, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()
    process.env[key] = val   // always override so file wins over shell defaults
  }
})()

logger.info('=== SparkAI starting ===', 'NODE_ENV=' + process.env.NODE_ENV)

const isDev = process.env.NODE_ENV !== 'production'

// ─── Storage ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(os.homedir(), '.sparkai')
const CHATS_FILE = path.join(DATA_DIR, 'chats.json')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
const PERSONAS_FILE = path.join(DATA_DIR, 'personas.json')
const ENV_FILE = path.join(__dirname, '..', '.env')

const OLD_DATA_DIR = path.join(os.homedir(), '.maestro-agent')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

  // Migrate data from old .maestro-agent directory if new directory is empty
  if (fs.existsSync(OLD_DATA_DIR)) {
    for (const file of ['chats.json', 'config.json']) {
      const oldFile = path.join(OLD_DATA_DIR, file)
      const newFile = path.join(DATA_DIR, file)
      if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
        try {
          fs.copyFileSync(oldFile, newFile)
          logger.info(`Migrated ${file} from .maestro-agent to .sparkai`)
        } catch (err) {
          logger.error(`Failed to migrate ${file}:`, err.message)
        }
      }
    }
  }
}

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  return fallback
}

function writeJSON(file, data) {
  ensureDataDir()
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

// ─── Default Data ───────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  apiKey:       process.env.ANTHROPIC_API_KEY                || '',
  baseURL:      process.env.ANTHROPIC_BASE_URL               || 'https://api.anthropic.com',
  sonnetModel:  process.env.ANTHROPIC_DEFAULT_SONNET_MODEL   || 'claude-sonnet-4-5',
  opusModel:    process.env.ANTHROPIC_DEFAULT_OPUS_MODEL     || 'claude-opus-4-6',
  haikuModel:   process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL    || 'claude-haiku-3-5',
  activeModel:  'sonnet',
  skillsPath:   ''
}

// ─── Main Window ────────────────────────────────────────────────────────────
let mainWindow

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const winW = Math.round(screenW * 4 / 5)
  const winH = Math.round(screenH * 4 / 5)

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round((screenW - winW) / 2),
    y: Math.round((screenH - winH) / 2),
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })

  // ── Prevent Electron from navigating when files are dropped ──
  // On WSL2+WSLg, file drops from Windows Explorer can trigger navigation to
  // file:// URLs. Intercept them and send the paths back as attachments.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault()
      logger.info('Intercepted file drop navigation:', url)
      // Send the file path to the renderer for attachment
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-dropped', url)
      }
    }
  })
}

app.whenReady().then(() => {
  ensureDataDir()
  createWindow()
  logger.info('Window created. Log dir:', LOG_DIR)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Storage ───────────────────────────────────────────────────────────
ipcMain.handle('store:get-chats', () => readJSON(CHATS_FILE, []))
ipcMain.handle('store:save-chats', (_, chats) => { writeJSON(CHATS_FILE, chats); return true })

ipcMain.handle('store:get-config', () => {
  const saved = readJSON(CONFIG_FILE, {})
  // Only let saved values override defaults when they are non-empty strings.
  // This ensures env vars from .env always populate the config
  // on first launch (or when the user clears a field and saves).
  const nonEmpty = Object.fromEntries(
    Object.entries(saved).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
  const result = { ...DEFAULT_CONFIG, ...nonEmpty }
  logger.info('store:get-config', {
    baseURL: result.baseURL,
    hasApiKey: !!(result.apiKey),
    apiKeyPrefix: result.apiKey ? result.apiKey.slice(0, 8) + '…' : '(empty)',
    sonnetModel: result.sonnetModel,
    activeModel: result.activeModel
  })
  return result
})
ipcMain.handle('store:save-config', (_, config) => { writeJSON(CONFIG_FILE, config); return true })

ipcMain.handle('store:get-personas', () => readJSON(PERSONAS_FILE, []))
ipcMain.handle('store:save-personas', (_, personas) => { writeJSON(PERSONAS_FILE, personas); return true })

// ─── IPC: Skills (filesystem-based) ─────────────────────────────────────────

/**
 * Resolve skills directory path.
 * If configPath is empty, use platform-specific default.
 */
function resolveSkillsPath(configPath) {
  if (configPath && configPath.trim()) return toLinuxPath(configPath.trim())
  // Default: ~/.claude/skills on Linux/WSL, %APPDATA%\Claude\skills on Windows
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'Claude', 'skills')
  }
  return path.join(os.homedir(), '.claude', 'skills')
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { meta: { name, description, ... }, body: "remaining markdown" }
 */
function parseFrontmatter(mdContent) {
  if (!mdContent) return { meta: {}, body: '' }
  const match = mdContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: mdContent }
  const raw = match[1]
  const body = match[2]
  const meta = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '').trim()
      meta[m[1]] = val
    }
  }
  return { meta, body }
}

/**
 * Extract first paragraph from markdown content as a summary.
 * Skips YAML frontmatter and headings.
 */
function extractSummary(mdContent) {
  if (!mdContent) return ''
  const { body } = parseFrontmatter(mdContent)
  const lines = body.split('\n')
  const paragraphLines = []
  let started = false
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip leading headings and blank lines
    if (!started && (trimmed === '' || trimmed.startsWith('#'))) continue
    if (trimmed === '' && started) break
    started = true
    paragraphLines.push(trimmed)
  }
  return paragraphLines.join(' ').slice(0, 200)
}

ipcMain.handle('skills:scan-dir', (_, dirPath) => {
  const dir = resolveSkillsPath(dirPath)
  try {
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const skills = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const skillDir = path.join(dir, entry.name)
      // Look for SKILL.md first, then any .md file as fallback
      let mdFile = null
      const skillMd = path.join(skillDir, 'SKILL.md')
      if (fs.existsSync(skillMd)) {
        mdFile = skillMd
      } else {
        try {
          const files = fs.readdirSync(skillDir).filter(f => f.endsWith('.md'))
          if (files.length > 0) mdFile = path.join(skillDir, files[0])
        } catch {}
      }
      let summary = ''
      let displayName = ''
      let description = ''
      if (mdFile) {
        try {
          const content = fs.readFileSync(mdFile, 'utf8')
          const { meta } = parseFrontmatter(content)
          displayName = meta.name || ''
          description = meta.description || ''
          summary = extractSummary(content)
        } catch {}
      }
      skills.push({
        id: entry.name,
        name: entry.name,
        displayName,
        description,
        summary,
        path: skillDir
      })
    }
    return skills
  } catch (err) {
    logger.error('skills:scan-dir error', err.message)
    return []
  }
})

ipcMain.handle('skills:read-tree', (_, rawSkillPath) => {
  const skillPath = toLinuxPath(rawSkillPath)
  const SKIP_DIRS = new Set(['$RECYCLE.BIN', 'System Volume Information', '$WinREAgent', 'Recovery', 'node_modules', '.git'])

  function readDir(dirPath) {
    let entries
    try {
      if (!fs.existsSync(dirPath)) return []
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return []
    }
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
        const children = readDir(fullPath)
        items.push({ name: entry.name, path: fullPath, type: 'dir', children })
      } else {
        items.push({ name: entry.name, path: fullPath, type: 'file' })
      }
    }
    return items
  }

  try {
    return readDir(skillPath)
  } catch (err) {
    logger.error('skills:read-tree error', err.message)
    return []
  }
})

ipcMain.handle('skills:read-file', (_, rawPath) => {
  try {
    return { content: fs.readFileSync(toLinuxPath(rawPath), 'utf8') }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('skills:load-all-prompts', (_, dirPath) => {
  const dir = resolveSkillsPath(dirPath)
  try {
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const skills = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const skillDir = path.join(dir, entry.name)
      const skillMd = path.join(skillDir, 'SKILL.md')
      if (fs.existsSync(skillMd)) {
        try {
          const content = fs.readFileSync(skillMd, 'utf8')
          skills.push({
            id: entry.name,
            name: entry.name,
            systemPrompt: content
          })
        } catch {}
      }
    }
    return skills
  } catch (err) {
    logger.error('skills:load-all-prompts error', err.message)
    return []
  }
})

// ─── IPC: Shell Execution ────────────────────────────────────────────────────
// Uses execFile (not exec) to prevent shell injection - command and args separated
ipcMain.handle('shell:exec', async (_, { cmd, args }) => {
  return new Promise((resolve) => {
    const safeArgs = Array.isArray(args) ? args : []
    execFile(cmd, safeArgs, { timeout: 30000, cwd: os.homedir() }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', error: err ? err.message : null })
    })
  })
})

// ─── IPC: Agent Loop ─────────────────────────────────────────────────────────
const { AgentLoop } = require('./agent/agentLoop')
const activeLoops = new Map()          // chatId → AgentLoop
const lastContextSnapshots = new Map() // chatId → snapshot

logger.info('IPC handlers registered: agent:run, agent:stop')

ipcMain.handle('agent:run', async (event, { chatId, messages, config, enabledAgents, enabledSkills, currentAttachments, personaPrompts }) => {
  logger.agent('IPC agent:run received', { chatId, model: config?.activeModel, msgCount: messages?.length })
  logger.agent('config snapshot', {
    baseURL: config?.baseURL,
    hasApiKey: !!(config?.apiKey),
    apiKeyPrefix: config?.apiKey ? config.apiKey.slice(0, 8) + '…' : '(empty)',
    sonnetModel: config?.sonnetModel,
    activeModel: config?.activeModel
  })

  // If this chat already has a running loop, stop it first
  if (activeLoops.has(chatId)) {
    activeLoops.get(chatId).stop()
    activeLoops.delete(chatId)
  }

  const loop = new AgentLoop(config)
  activeLoops.set(chatId, loop)

  logger.agent('run start', { chatId, model: config.activeModel, msgCount: messages.length, agents: enabledAgents, skills: enabledSkills })

  try {
    const result = await loop.run(
      messages,
      enabledAgents,
      enabledSkills,
      (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk })
        }
      },
      currentAttachments,
      personaPrompts
    )
    logger.agent('run done', { chatId, success: result !== undefined, resultLen: typeof result === 'string' ? result.length : 0 })
    return { success: true, result }
  } catch (err) {
    logger.error('agent:run error', { chatId, error: err.message })
    return { success: false, error: err.message }
  } finally {
    // Save snapshot before cleanup
    if (activeLoops.has(chatId)) {
      lastContextSnapshots.set(chatId, activeLoops.get(chatId).getContextSnapshot())
    }
    activeLoops.delete(chatId)
  }
})

ipcMain.handle('agent:stop', (event, chatId) => {
  if (chatId && activeLoops.has(chatId)) {
    activeLoops.get(chatId).stop()
    activeLoops.delete(chatId)
    return true
  }
  // Fallback: stop ALL loops (backward compat / stop-all)
  if (!chatId && activeLoops.size > 0) {
    for (const [, loop] of activeLoops) {
      loop.stop()
    }
    activeLoops.clear()
    return true
  }
  return false
})

ipcMain.handle('agent:compact', (event, chatId) => {
  const loop = chatId ? activeLoops.get(chatId) : null
  if (loop && typeof loop.requestCompaction === 'function') {
    loop.requestCompaction()
    return true
  }
  return false
})

ipcMain.handle('agent:compact-standalone', async (event, { chatId, messages, config, enabledAgents, enabledSkills }) => {
  logger.agent('Standalone compaction requested', { chatId, msgCount: messages?.length })
  const loop = new AgentLoop(config)
  try {
    const result = await loop.compactStandalone(
      messages,
      enabledAgents,
      enabledSkills,
      (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:chunk', { chatId, chunk })
        }
      }
    )
    lastContextSnapshots.set(chatId, loop.getContextSnapshot())
    return { success: true, ...result }
  } catch (err) {
    logger.error('agent:compact-standalone error', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('agent:get-context', (event, chatId) => {
  if (chatId && activeLoops.has(chatId)) return activeLoops.get(chatId).getContextSnapshot()
  if (chatId) return lastContextSnapshots.get(chatId) || null
  return null
})

// ─── IPC: File Attachments ──────────────────────────────────────────────────

const MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

const IMAGE_EXTS = new Set(Object.keys(MEDIA_TYPES))
const MAX_IMAGE_SIZE = 20 * 1024 * 1024   // 20 MB
const MAX_TEXT_SIZE = 1 * 1024 * 1024      // 1 MB

// Detect WSL environment
const IS_WSL = (() => {
  try {
    if (process.platform !== 'linux') return false
    const release = os.release().toLowerCase()
    if (release.includes('microsoft') || release.includes('wsl')) return true
    if (fs.existsSync('/proc/version')) {
      const ver = fs.readFileSync('/proc/version', 'utf8').toLowerCase()
      return ver.includes('microsoft') || ver.includes('wsl')
    }
  } catch {}
  return false
})()

logger.info('WSL detection:', IS_WSL ? 'YES — will use PowerShell file dialogs' : 'NO')

/**
 * Convert a Windows path to its WSL2 mount equivalent.
 * Handles: C:\foo\bar, C:/foo/bar, file:///C:/foo/bar, \\wsl$\...
 * Falls through for paths that are already Linux-native.
 */
function toWslPath(inputPath) {
  if (!inputPath) return inputPath
  let p = inputPath.trim()

  // Strip file:// URI prefix
  if (p.startsWith('file:///')) {
    p = decodeURIComponent(p.slice(7))  // file:///C:/foo → C:/foo
  } else if (p.startsWith('file://')) {
    p = decodeURIComponent(p.slice(5))
  }

  // Strip surrounding quotes
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1)
  }

  // Windows drive letter path: C:\foo or C:/foo
  const driveMatch = p.match(/^([A-Za-z]):[/\\](.*)$/)
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase()
    const rest = driveMatch[2].replace(/\\/g, '/')
    return `/mnt/${drive}/${rest}`.replace(/\/+$/, '') || `/mnt/${drive}`
  }

  // UNC \\wsl$\distro\path → /path  (already inside WSL)
  const wslUncMatch = p.match(/^\\\\wsl\$\\[^\\]+\\(.*)$/)
  if (wslUncMatch) {
    return '/' + wslUncMatch[1].replace(/\\/g, '/')
  }

  // Already a Linux path
  return p
}

function readAttachment(rawPath) {
  const filePath = IS_WSL ? toWslPath(rawPath) : rawPath
  const name = path.basename(filePath)
  const id = uuidv4()

  try {
    const stat = fs.statSync(filePath)

    // ── Folder ──
    if (stat.isDirectory()) {
      let listing = ''
      try {
        const entries = fs.readdirSync(filePath, { withFileTypes: true })
          .filter(e => !e.name.startsWith('.'))
          .sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1
            if (!a.isDirectory() && b.isDirectory()) return 1
            return a.name.localeCompare(b.name)
          })
        listing = entries.map(e => (e.isDirectory() ? '[dir]  ' : '       ') + e.name).join('\n')
      } catch {}
      return {
        id, name, path: filePath, type: 'folder', size: 0,
        preview: `Folder: ${filePath}` + (listing ? `\n${listing}` : '')
      }
    }

    const ext = path.extname(name).toLowerCase()

    // ── Image ──
    if (IMAGE_EXTS.has(ext)) {
      if (stat.size > MAX_IMAGE_SIZE) {
        return { id, name, path: filePath, type: 'error', error: `Image too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 20 MB)`, preview: name }
      }
      const base64 = fs.readFileSync(filePath).toString('base64')
      return {
        id, name, path: filePath, type: 'image',
        mediaType: MEDIA_TYPES[ext],
        base64, size: stat.size,
        preview: `Image: ${name} (${(stat.size / 1024).toFixed(1)} KB)`
      }
    }

    // ── Text / code file ──
    if (stat.size > MAX_TEXT_SIZE) {
      return { id, name, path: filePath, type: 'error', error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 1 MB)`, preview: name }
    }
    const buf = fs.readFileSync(filePath)
    // Binary detection: check for null bytes in the first 8KB
    const sample = buf.subarray(0, 8192)
    if (sample.includes(0)) {
      return { id, name, path: filePath, type: 'error', error: 'Binary file — not supported', preview: name }
    }
    const content = buf.toString('utf8')
    return {
      id, name, path: filePath, type: 'text',
      content, size: stat.size,
      preview: `${name} (${(stat.size / 1024).toFixed(1)} KB)`
    }
  } catch (err) {
    return { id, name, path: filePath, type: 'error', error: err.message, preview: name }
  }
}

/**
 * Show a native Windows file picker via PowerShell.
 * Returns an array of Windows path strings, or [] on cancel.
 */
function showWindowsFilePicker() {
  return new Promise((resolve) => {
    // PowerShell script that shows OpenFileDialog + FolderBrowserDialog
    // User picks files first, then optionally picks a folder
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
$results = @()

$fd = New-Object System.Windows.Forms.OpenFileDialog
$fd.Multiselect = $true
$fd.Title = 'Select files to attach'
$fd.Filter = 'All files (*.*)|*.*|Images (*.png;*.jpg;*.jpeg;*.gif;*.webp)|*.png;*.jpg;*.jpeg;*.gif;*.webp|Text files (*.txt;*.md;*.js;*.ts;*.py;*.json;*.yaml;*.yml;*.html;*.css;*.xml;*.csv)|*.txt;*.md;*.js;*.ts;*.py;*.json;*.yaml;*.yml;*.html;*.css;*.xml;*.csv'
if ($fd.ShowDialog() -eq 'OK') {
  $results += $fd.FileNames
}

$answer = [System.Windows.Forms.MessageBox]::Show('Do you also want to attach a folder?', 'Attach Folder', 'YesNo', 'Question')
if ($answer -eq 'Yes') {
  $dd = New-Object System.Windows.Forms.FolderBrowserDialog
  $dd.Description = 'Select a folder to attach'
  if ($dd.ShowDialog() -eq 'OK') {
    $results += $dd.SelectedPath
  }
}

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

// files:pick — on WSL use native Windows dialog, otherwise GTK
ipcMain.handle('files:pick', async () => {
  if (IS_WSL) {
    try {
      const winPaths = await showWindowsFilePicker()
      if (winPaths.length === 0) return []
      return winPaths.map(wp => readAttachment(wp))
    } catch (err) {
      logger.error('Windows file picker failed, falling back to GTK:', err.message)
      // fall through to GTK dialog
    }
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    title: 'Attach Files or Folders'
  })
  if (result.canceled || result.filePaths.length === 0) return []
  return result.filePaths.map(fp => readAttachment(fp))
})

// files:read-for-attachment — single path (from drag-drop), auto-converts Windows paths
ipcMain.handle('files:read-for-attachment', (_, filePath) => {
  return readAttachment(filePath)
})

// files:resolve-drop-paths — resolve multiple raw strings from a drag-drop event
// Accepts array of raw path strings (Windows or Linux), returns attachment objects
ipcMain.handle('files:resolve-drop-paths', (_, rawPaths) => {
  if (!Array.isArray(rawPaths)) return []
  return rawPaths
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => readAttachment(p))
})

// ─── IPC: Obsidian Vault ──────────────────────────────────────────────────────

// Convert Windows paths to WSL2 mount paths (e.g. D:\notes → /mnt/d/notes)
function toLinuxPath(p) {
  if (!p) return p
  // Match Windows drive letter paths like D:\, C:\Users, E:/folder
  const m = p.match(/^([A-Za-z]):[/\\](.*)$/)
  if (m) {
    const drive = m[1].toLowerCase()
    const rest = m[2].replace(/\\/g, '/')
    return `/mnt/${drive}/${rest}`.replace(/\/+$/, '') || `/mnt/${drive}`
  }
  // Already a Linux path or relative path
  return p
}

// Config persistence — stored in .env as OBSIDIAN_VAULT_PATH
ipcMain.handle('obsidian:get-config', () => {
  return { vaultPath: process.env.OBSIDIAN_VAULT_PATH || '' }
})
ipcMain.handle('obsidian:save-config', (_, config) => {
  const vaultPath = config.vaultPath || ''
  process.env.OBSIDIAN_VAULT_PATH = vaultPath
  // Write back to .env file
  try {
    let content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : ''
    if (content.match(/^OBSIDIAN_VAULT_PATH=.*$/m)) {
      content = content.replace(/^OBSIDIAN_VAULT_PATH=.*$/m, `OBSIDIAN_VAULT_PATH=${vaultPath}`)
    } else {
      content = content.trimEnd() + `\nOBSIDIAN_VAULT_PATH=${vaultPath}\n`
    }
    fs.writeFileSync(ENV_FILE, content, 'utf8')
  } catch (err) {
    logger.error('Failed to write OBSIDIAN_VAULT_PATH to env file:', err.message)
  }
  return true
})

// Folder picker
ipcMain.handle('obsidian:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Obsidian Vault Folder'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// Read directory tree (recursive, .md files + folders only)
ipcMain.handle('obsidian:read-tree', (_, rawDir) => {
  const dir = toLinuxPath(rawDir)
  // Skip Windows system/hidden directories that are unreadable via WSL
  const SKIP_DIRS = new Set(['$RECYCLE.BIN', 'System Volume Information', '$WinREAgent', 'Recovery', 'node_modules'])
  const MAX_DEPTH = 10

  function readDir(dirPath, depth) {
    if (depth > MAX_DEPTH) return []
    let entries
    try {
      if (!fs.existsSync(dirPath)) return []
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      // Permission denied or other read error — skip this directory
      return []
    }
    const items = []

    // Sort: folders first, then files, both alphabetical
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
      } else if (entry.name.endsWith('.md')) {
        items.push({ name: entry.name, path: fullPath, type: 'file' })
      }
    }
    return items
  }

  try {
    return readDir(dir, 0)
  } catch (err) {
    logger.error('obsidian:read-tree error', err.message)
    return []
  }
})

// Read a single markdown file
ipcMain.handle('obsidian:read-file', (_, rawPath) => {
  try {
    return { content: fs.readFileSync(toLinuxPath(rawPath), 'utf8') }
  } catch (err) {
    return { error: err.message }
  }
})

// Write/save a file
ipcMain.handle('obsidian:write-file', (_, rawPath, content) => {
  try {
    fs.writeFileSync(toLinuxPath(rawPath), content, 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// Create a new markdown file
ipcMain.handle('obsidian:create-file', (_, rawDir, name) => {
  try {
    const safeName = name.endsWith('.md') ? name : name + '.md'
    const filePath = path.join(toLinuxPath(rawDir), safeName)
    if (fs.existsSync(filePath)) return { error: 'File already exists' }
    fs.writeFileSync(filePath, '', 'utf8')
    return { success: true, path: filePath }
  } catch (err) {
    return { error: err.message }
  }
})

// Create a new folder
ipcMain.handle('obsidian:create-folder', (_, rawDir, name) => {
  try {
    const folderPath = path.join(toLinuxPath(rawDir), name)
    if (fs.existsSync(folderPath)) return { error: 'Folder already exists' }
    fs.mkdirSync(folderPath, { recursive: true })
    return { success: true, path: folderPath }
  } catch (err) {
    return { error: err.message }
  }
})

// Delete a file or empty folder
ipcMain.handle('obsidian:delete-file', (_, rawPath) => {
  try {
    const p = toLinuxPath(rawPath)
    const stat = fs.statSync(p)
    if (stat.isDirectory()) {
      fs.rmdirSync(p)
    } else {
      fs.unlinkSync(p)
    }
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// Rename a file or folder
ipcMain.handle('obsidian:rename', (_, rawOld, rawNew) => {
  try {
    const op = toLinuxPath(rawOld)
    const np = toLinuxPath(rawNew)
    if (fs.existsSync(np)) return { error: 'Target already exists' }
    fs.renameSync(op, np)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// ── File Reveal / Open ───────────────────────────────────────────────────────

// Helper: detect WSL
function isWSL() {
  try {
    const release = require('fs').readFileSync('/proc/version', 'utf8').toLowerCase()
    return release.includes('microsoft') || release.includes('wsl')
  } catch { return false }
}

// Helper: Linux path to Windows path
function toWindowsPath(linuxPath) {
  const { execSync } = require('child_process')
  return execSync('wslpath -w "' + linuxPath + '"').toString().trim()
}

// Helper: resolve ~ in path
function resolvePath(filePath) {
  const os = require('os')
  const path = require('path')
  return filePath.startsWith('~') ? path.join(os.homedir(), filePath.slice(1)) : filePath
}

ipcMain.handle('shell:open-file', async (_, filePath) => {
  try {
    const resolved = resolvePath(filePath)
    if (isWSL()) {
      const { execSync } = require('child_process')
      execSync('explorer.exe "' + toWindowsPath(resolved) + '")')
      return { success: true }
    }
    const result = await shell.openPath(resolved)
    if (result) return { error: result }
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('shell:show-in-folder', (_, filePath) => {
  try {
    const resolved = resolvePath(filePath)
    if (isWSL()) {
      const { execSync } = require('child_process')
      execSync('explorer.exe /select,"' + toWindowsPath(resolved) + '"');
      return { success: true }
    }
    shell.showItemInFolder(resolved)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})
