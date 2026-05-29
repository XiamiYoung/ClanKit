// Vitest alias target for `require('electron')` / `import from 'electron'`.
// Replaces the real `electron` module so Node-side tests don't need the
// Electron binary to be downloaded (which is fragile on CI runners — see
// commit history of .github/workflows/ci.yml).
//
// Each exported member is a minimal stub that satisfies the surface area
// touched at module-load time across electron/{main,ipc,lib}/*.js. The stubs
// are NOT a behavioral replica — tests that need real behavior must mock the
// specific call sites explicitly.

const noop = () => {}
const noopAsync = async () => {}

const app = {
  getPath: (name) => {
    // Used by dataStore.paths() etc. Return a writable tmp-style dir so tests
    // that do touch the filesystem land somewhere harmless.
    const os = require('os')
    const path = require('path')
    return path.join(os.tmpdir(), `clankit-test-${name || 'userData'}`)
  },
  getName: () => 'clankit-test',
  getVersion: () => '0.0.0-test',
  isPackaged: false,
  isReady: () => true,
  whenReady: async () => undefined,
  on: noop,
  once: noop,
  off: noop,
  removeAllListeners: noop,
  quit: noop,
  exit: noop,
  commandLine: { appendSwitch: noop, appendArgument: noop },
  setPath: noop,
  getLoginItemSettings: () => ({ openAtLogin: false }),
  setLoginItemSettings: noop,
}

const ipcMain = {
  handle: noop,
  handleOnce: noop,
  on: noop,
  once: noop,
  removeAllListeners: noop,
  removeHandler: noop,
  removeListener: noop,
}

const ipcRenderer = {
  invoke: noopAsync,
  send: noop,
  sendSync: noop,
  on: noop,
  once: noop,
  off: noop,
  removeAllListeners: noop,
  removeListener: noop,
}

const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s) => Buffer.from(String(s ?? ''), 'utf8'),
  decryptString: (b) => Buffer.isBuffer(b) ? b.toString('utf8') : String(b ?? ''),
}

const shell = {
  openExternal: noopAsync,
  openPath: noopAsync,
  showItemInFolder: noop,
  beep: noop,
  trashItem: noopAsync,
}

const dialog = {
  showOpenDialog:    async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog:    async () => ({ canceled: true, filePath: '' }),
  showMessageBox:    async () => ({ response: 0 }),
  showErrorBox:      noop,
  showOpenDialogSync:    () => [],
  showSaveDialogSync:    () => '',
  showMessageBoxSync:    () => 0,
}

class BrowserWindow {
  constructor() { this.webContents = { send: noop, on: noop, once: noop, executeJavaScript: noopAsync } }
  loadURL()     { return Promise.resolve() }
  loadFile()    { return Promise.resolve() }
  show()        {}
  hide()        {}
  close()       {}
  destroy()     {}
  isDestroyed() { return false }
  getBounds()   { return { x: 0, y: 0, width: 1280, height: 800 } }
  setBounds()   {}
  on()          {}
  once()        {}
  static getAllWindows() { return [] }
  static getFocusedWindow() { return null }
}

const screen = {
  getDisplayMatching:    () => ({ workArea: { x: 0, y: 0, width: 1280, height: 800 }, bounds: { x: 0, y: 0, width: 1280, height: 800 } }),
  getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 800 } }),
  getPrimaryDisplay:     () => ({ workArea: { x: 0, y: 0, width: 1280, height: 800 } }),
  getAllDisplays:        () => [],
  on: noop,
}

const protocol = {
  registerSchemesAsPrivileged: noop,
  registerFileProtocol:        noop,
  registerHttpProtocol:        noop,
  registerStringProtocol:      noop,
  registerBufferProtocol:      noop,
  handle:                      noop,
  unhandle:                    noop,
}

const net = {
  request: () => ({ on: noop, end: noop, write: noop }),
  fetch:   async () => ({ ok: false, status: 0, text: async () => '', json: async () => ({}) }),
}

const session = {
  defaultSession: {
    webRequest:  { onBeforeRequest: noop, onHeadersReceived: noop, onCompleted: noop },
    cookies:     { get: async () => [], set: noopAsync, remove: noopAsync },
    clearCache:  noopAsync,
    clearStorageData: noopAsync,
  },
  fromPartition: () => session.defaultSession,
}

const Menu = {
  buildFromTemplate:    () => ({ popup: noop, closePopup: noop }),
  setApplicationMenu:   noop,
  getApplicationMenu:   () => null,
}

class Notification {
  constructor() {}
  show() {}
  close() {}
  on() {}
  static isSupported() { return false }
}

const contextBridge = {
  exposeInMainWorld: noop,
  exposeInIsolatedWorld: noop,
}

const nativeImage = {
  createEmpty:      () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0), toDataURL: () => '' }),
  createFromPath:   () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0), toDataURL: () => '' }),
  createFromBuffer: () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0), toDataURL: () => '' }),
  createFromDataURL: () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0), toDataURL: () => '' }),
}

const clipboard = {
  readText:   () => '',
  writeText:  noop,
  clear:      noop,
  readImage:  () => nativeImage.createEmpty(),
  writeImage: noop,
}

const powerSaveBlocker = {
  start: () => 0,
  stop:  noop,
  isStarted: () => false,
}

const autoUpdater = {
  setFeedURL: noop,
  checkForUpdates: noop,
  quitAndInstall: noop,
  on: noop,
  once: noop,
}

const desktopCapturer = {
  getSources: async () => [],
}

module.exports = {
  app,
  ipcMain,
  ipcRenderer,
  safeStorage,
  shell,
  dialog,
  BrowserWindow,
  screen,
  protocol,
  net,
  session,
  Menu,
  Notification,
  contextBridge,
  nativeImage,
  clipboard,
  powerSaveBlocker,
  autoUpdater,
  desktopCapturer,
}
