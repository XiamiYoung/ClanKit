const path = require('node:path')
const fs = require('node:fs/promises')
const { app, BrowserWindow, ipcMain, screen } = require('electron')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')
const { logger } = require('../logger')
const { classifyAiDocPath, resolveAiDocRoot } = require('../lib/aidocLayout')

function registerWikiWindow() {
  let wikiWindow
  const isWikiSender = event => !!wikiWindow && !wikiWindow.isDestroyed() && event.sender === wikiWindow.webContents

  async function settings() {
    const paths = ds.paths()
    const config = await ds.readJSONAsync(paths.CONFIG_FILE, {})
    return {
      root: resolveAiDocRoot({ DoCPath: config.DoCPath, dataPath: paths.DATA_DIR }),
      language: config.language === 'zh' ? 'zh' : 'en',
    }
  }

  ipcMain.handle('wiki-window:open', async event => {
    const main = winRef.get()
    if (!main || main.isDestroyed() || event.sender !== main.webContents) return
    if (wikiWindow && !wikiWindow.isDestroyed()) {
      if (wikiWindow.isMinimized()) wikiWindow.restore()
      wikiWindow.show()
      wikiWindow.focus()
      return
    }

    const work = screen.getDisplayMatching(main.getBounds()).workArea
    const width = Math.round(work.width * 0.88)
    const height = Math.round(work.height * 0.88)
    const win = new BrowserWindow({
      title: 'Wiki · ClanKit',
      icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, '../../public/icon.png'),
      x: work.x + Math.round((work.width - width) / 2),
      y: work.y + Math.round((work.height - height) / 2),
      width, height,
      minWidth: Math.min(520, width),
      minHeight: Math.min(360, height),
      show: false,
      frame: false, // The renderer draws a title bar matching the main window.
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: path.join(__dirname, '../wikiPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    wikiWindow = win
    win.removeMenu()
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', event => event.preventDefault())
    win.on('page-title-updated', event => event.preventDefault())
    win.once('ready-to-show', () => win.show())
    const sendMaximized = value => () => { if (!win.isDestroyed()) win.webContents.send('wiki-window:maximized', value) }
    win.on('maximize', sendMaximized(true))
    win.on('unmaximize', sendMaximized(false))
    const closeWithApp = () => { if (!win.isDestroyed()) win.destroy() }
    main.once('closed', closeWithApp)
    win.once('closed', () => {
      main.removeListener('closed', closeWithApp)
      if (wikiWindow === win) wikiWindow = null
    })
    try {
      if (process.env.ELECTRON_DEV === 'true') await win.loadURL('http://localhost:5173/#/wiki-window')
      else await win.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/wiki-window' })
    } catch (error) {
      if (!win.isDestroyed()) {
        logger.warn('[aidoc] Wiki window failed to load', error.message)
        win.destroy()
        return { success: false }
      }
    }
  })

  ipcMain.handle('wiki-window:settings', event => isWikiSender(event) ? settings() : undefined)
  ipcMain.handle('wiki-window:close', event => { if (isWikiSender(event)) wikiWindow.close() })
  ipcMain.handle('wiki-window:minimize', event => { if (isWikiSender(event)) wikiWindow.minimize() })
  ipcMain.handle('wiki-window:toggle-maximize', event => {
    if (!isWikiSender(event)) return
    if (wikiWindow.isMaximized()) wikiWindow.unmaximize()
    else wikiWindow.maximize()
  })
  ipcMain.handle('wiki-window:is-maximized', event => isWikiSender(event) && wikiWindow.isMaximized())
  ipcMain.handle('wiki-window:open-source', async (event, filePath) => {
    if (!isWikiSender(event) || typeof filePath !== 'string') return
    const { root } = await settings()
    if (classifyAiDocPath(root, filePath) !== 'kb_source') return
    try {
      const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(filePath)])
      if (classifyAiDocPath(realRoot, realFile) !== 'kb_source' || !(await fs.stat(realFile)).isFile()) return
    } catch { return }
    const main = winRef.get()
    if (!isWikiSender(event) || !main || main.isDestroyed()) return
    if (main.isMinimized()) main.restore()
    main.show()
    main.webContents.send('wiki-window:source', filePath)
    main.focus()
  })
}

module.exports = { registerWikiWindow }
