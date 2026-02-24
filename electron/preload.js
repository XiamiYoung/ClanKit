const { contextBridge, ipcRenderer } = require('electron')
const os = require('os')

// Detect WSL so the renderer can skip path conversions on native Windows/Linux
const IS_WSL = (() => {
  try {
    if (process.platform !== 'linux') return false
    const release = os.release().toLowerCase()
    return release.includes('microsoft') || release.includes('wsl')
  } catch { return false }
})()

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Platform ────────────────────────────────────────────────────────────────
  isWSL: IS_WSL,
  platform: process.platform,

  // ── Storage ──────────────────────────────────────────────────────────────
  getChats: () => ipcRenderer.invoke('store:get-chats'),
  saveChats: (chats) => ipcRenderer.invoke('store:save-chats', chats),

  getConfig: () => ipcRenderer.invoke('store:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('store:save-config', config),

  getPersonas: () => ipcRenderer.invoke('store:get-personas'),
  savePersonas: (personas) => ipcRenderer.invoke('store:save-personas', personas),

  getMcpServers: () => ipcRenderer.invoke('store:get-mcp-servers'),
  saveMcpServers: (servers) => ipcRenderer.invoke('store:save-mcp-servers', servers),

  // ── MCP Server Management ────────────────────────────────────────────────
  mcp: {
    getConfig:      ()       => ipcRenderer.invoke('mcp:get-config'),
    saveConfig:     (config) => ipcRenderer.invoke('mcp:save-config', config),
    testConnection: (config) => ipcRenderer.invoke('mcp:test-connection', config),
    getStatus:      ()       => ipcRenderer.invoke('mcp:get-status'),
  },

  // ── HTTP Tools Management ────────────────────────────────────────────────
  tools: {
    getConfig:  ()       => ipcRenderer.invoke('tools:get-config'),
    saveConfig: (config) => ipcRenderer.invoke('tools:save-config', config),
  },

  // ── OpenRouter ─────────────────────────────────────────────────────────
  fetchOpenRouterModels: (params) => ipcRenderer.invoke('openrouter:fetch-models', params),

  // ── OpenAI ─────────────────────────────────────────────────────────────
  fetchOpenAIModels: (params) => ipcRenderer.invoke('openai:fetch-models', params),

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
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getClipboardImage: () => ipcRenderer.invoke('clipboard:get-image'),

  // ── Obsidian Vault ──────────────────────────────────────────────────────
  obsidian: {
    getConfig:    ()                   => ipcRenderer.invoke('obsidian:get-config'),
    saveConfig:   (config)             => ipcRenderer.invoke('obsidian:save-config', config),
    pickFolder:   ()                   => ipcRenderer.invoke('obsidian:pick-folder'),
    readTree:     (dir)                => ipcRenderer.invoke('obsidian:read-tree', dir),
    readFile:     (filePath)           => ipcRenderer.invoke('obsidian:read-file', filePath),
    writeFile:    (filePath, content)  => ipcRenderer.invoke('obsidian:write-file', filePath, content),
    saveImage:    (dir, name, base64)  => ipcRenderer.invoke('obsidian:save-image', dir, name, base64),
    readImageBase64: (filePath)        => ipcRenderer.invoke('obsidian:read-image-base64', filePath),
    createFile:   (dir, name)          => ipcRenderer.invoke('obsidian:create-file', dir, name),
    createFolder: (dir, name)          => ipcRenderer.invoke('obsidian:create-folder', dir, name),
    deleteFile:   (filePath)           => ipcRenderer.invoke('obsidian:delete-file', filePath),
    rename:       (oldPath, newPath)   => ipcRenderer.invoke('obsidian:rename', oldPath, newPath),
  }
})
