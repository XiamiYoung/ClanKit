/**
 * IPC handlers for CLAUDE.md context loading and file watching (Coding Mode).
 * Channels: claude:*
 *
 * Replicates Claude Code CLAUDE.md hierarchy:
 *   1. ~/.claude/CLAUDE.md          (global user instructions)
 *   2. Parent dirs outermost->innermost (walk up from projectPath, stop at home)
 *   3. <projectPath>/CLAUDE.md      (project root)
 *   4. <projectPath>/.claude/CLAUDE.md
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { ipcMain, BrowserWindow } = require('electron')
const { logger } = require('../logger')

// Registry: chatId -> { watchers: FSWatcher[], debounceTimer: Timeout|null, projectPath }
const _claudeWatchers = new Map()

function _claudeResolvePaths(projectPath) {
  const homeDir = os.homedir()
  const paths = []
  paths.push(path.join(homeDir, '.claude', 'CLAUDE.md'))
  if (projectPath) {
    const parentDirs = []
    let current = path.dirname(projectPath)
    while (current && current !== path.dirname(current) && current !== homeDir) {
      parentDirs.push(current)
      current = path.dirname(current)
    }
    parentDirs.reverse()
    for (const dir of parentDirs) paths.push(path.join(dir, 'CLAUDE.md'))
    paths.push(path.join(projectPath, 'CLAUDE.md'))
    paths.push(path.join(projectPath, '.claude', 'CLAUDE.md'))
  }
  return paths
}

function _claudeReadAndMerge(projectPath) {
  const sections = []
  const candidates = _claudeResolvePaths(projectPath)
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8').trim()
        if (content) sections.push({ label: filePath, content })
      }
    } catch (err) {
      logger.warn(`claude: could not read ${filePath}:`, err.message)
    }
  }
  if (sections.length === 0) return null
  return sections.map(s => `<!-- Source: ${s.label} -->\n${s.content}`).join('\n\n---\n\n')
}

function _claudeTeardown(chatId) {
  const entry = _claudeWatchers.get(chatId)
  if (!entry) return
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
  for (const w of entry.watchers) { try { w.close() } catch (_) {} }
  _claudeWatchers.delete(chatId)
}

function register() {
  ipcMain.handle('claude:load-context', async (_, projectPath) => {
    const merged = _claudeReadAndMerge(projectPath)
    logger.agent('claude:load-context', { projectPath, found: !!merged })
    return merged
  })

  ipcMain.handle('claude:watch-context', async (event, { chatId, projectPath }) => {
    _claudeTeardown(chatId)

    const watchPaths = _claudeResolvePaths(projectPath)
    const watchers = []
    let debounceTimer = null

    function onFileChange(filePath) {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        const merged = _claudeReadAndMerge(projectPath)
        logger.agent('claude:context-updated (watch)', { chatId, filePath })
        const wins = BrowserWindow.getAllWindows()
        for (const win of wins) {
          if (!win.isDestroyed()) {
            win.webContents.send('claude:context-updated', { chatId, context: merged })
          }
        }
      }, 300)
    }

    for (const watchPath of watchPaths) {
      try {
        const dir = path.dirname(watchPath)
        const filename = path.basename(watchPath)
        if (!fs.existsSync(dir)) continue
        const watcher = fs.watch(dir, { persistent: false }, (eventType, changedFile) => {
          if (changedFile === filename) onFileChange(watchPath)
        })
        watcher.on('error', (err) => logger.warn(`claude:watcher error ${watchPath}:`, err.message))
        watchers.push(watcher)
      } catch (err) {
        logger.warn(`claude: could not watch ${watchPath}:`, err.message)
      }
    }

    _claudeWatchers.set(chatId, { watchers, debounceTimer, projectPath })
    logger.agent('claude:watch-context', { chatId, projectPath, watching: watchers.length })
    return { watching: watchers.length }
  })

  ipcMain.handle('claude:unwatch-context', async (_, chatId) => {
    _claudeTeardown(chatId)
    logger.agent('claude:unwatch-context', { chatId })
  })
}

// Export teardown for use by app lifecycle (before-quit cleanup)
module.exports = { register, teardownAll: () => { for (const id of _claudeWatchers.keys()) _claudeTeardown(id) } }
