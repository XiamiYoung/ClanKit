const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Storage ──────────────────────────────────────────────────────────────
  getChats: () => ipcRenderer.invoke('store:get-chats'),
  saveChats: (chats) => ipcRenderer.invoke('store:save-chats', chats),

  getConfig: () => ipcRenderer.invoke('store:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('store:save-config', config),

  getPersonas: () => ipcRenderer.invoke('store:get-personas'),
  savePersonas: (personas) => ipcRenderer.invoke('store:save-personas', personas),

  // ── Skills (filesystem-based) ───────────────────────────────────────────
  skills: {
    scanDir:        (dirPath)   => ipcRenderer.invoke('skills:scan-dir', dirPath),
    readTree:       (skillPath) => ipcRenderer.invoke('skills:read-tree', skillPath),
    readFile:       (filePath)  => ipcRenderer.invoke('skills:read-file', filePath),
    loadAllPrompts: (dirPath)   => ipcRenderer.invoke('skills:load-all-prompts', dirPath),
  },

  // ── Agent Loop ────────────────────────────────────────────────────────────
  runAgent: (params) => ipcRenderer.invoke('agent:run', params),
  stopAgent: (chatId) => ipcRenderer.invoke('agent:stop', chatId),
  compactContext: (chatId) => ipcRenderer.invoke('agent:compact', chatId),
  compactContextStandalone: (params) => ipcRenderer.invoke('agent:compact-standalone', params),
  getContextSnapshot: (chatId) => ipcRenderer.invoke('agent:get-context', chatId),
  onAgentChunk: (callback) => {
    ipcRenderer.on('agent:chunk', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('agent:chunk')
  },

  // ── File Attachments ────────────────────────────────────────────────────
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  readFileForAttachment: (filePath) => ipcRenderer.invoke('files:read-for-attachment', filePath),
  resolveDropPaths: (rawPaths) => ipcRenderer.invoke('files:resolve-drop-paths', rawPaths),
  onFileDropped: (callback) => {
    ipcRenderer.on('file-dropped', (_, url) => callback(url))
    return () => ipcRenderer.removeAllListeners('file-dropped')
  },

  // ── Shell ─────────────────────────────────────────────────────────────────
  execShell: (cmd, args) => ipcRenderer.invoke('shell:exec', { cmd, args }),
  openFile: (filePath) => ipcRenderer.invoke('shell:open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:show-in-folder', filePath),

  // ── Obsidian Vault ──────────────────────────────────────────────────────
  obsidian: {
    getConfig:    ()                   => ipcRenderer.invoke('obsidian:get-config'),
    saveConfig:   (config)             => ipcRenderer.invoke('obsidian:save-config', config),
    pickFolder:   ()                   => ipcRenderer.invoke('obsidian:pick-folder'),
    readTree:     (dir)                => ipcRenderer.invoke('obsidian:read-tree', dir),
    readFile:     (filePath)           => ipcRenderer.invoke('obsidian:read-file', filePath),
    writeFile:    (filePath, content)  => ipcRenderer.invoke('obsidian:write-file', filePath, content),
    createFile:   (dir, name)          => ipcRenderer.invoke('obsidian:create-file', dir, name),
    createFolder: (dir, name)          => ipcRenderer.invoke('obsidian:create-folder', dir, name),
    deleteFile:   (filePath)           => ipcRenderer.invoke('obsidian:delete-file', filePath),
    rename:       (oldPath, newPath)   => ipcRenderer.invoke('obsidian:rename', oldPath, newPath),
  }
})
