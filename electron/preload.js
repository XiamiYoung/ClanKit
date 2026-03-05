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

  // Per-chat granular operations
  getChatIndex: () => ipcRenderer.invoke('store:get-chat-index'),
  saveChatIndex: (index) => ipcRenderer.invoke('store:save-chat-index', index),
  getChat: (id) => ipcRenderer.invoke('store:get-chat', id),
  saveChat: (chat) => ipcRenderer.invoke('store:save-chat', chat),
  deleteChat: (id) => ipcRenderer.invoke('store:delete-chat', id),

  getConfig: () => ipcRenderer.invoke('store:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('store:save-config', config),
  getDataPath: () => ipcRenderer.invoke('store:get-data-path'),
  saveDataPath: (dataPath) => ipcRenderer.invoke('store:save-data-path', dataPath),
  getEnvPaths: () => ipcRenderer.invoke('store:get-env-paths'),
  saveEnvPath: (key, value) => ipcRenderer.invoke('store:save-env-path', key, value),

  getPersonas: () => ipcRenderer.invoke('store:get-personas'),
  savePersonas: (personas) => ipcRenderer.invoke('store:save-personas', personas),

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
    writeFile:      (filePath, content) => ipcRenderer.invoke('skills:write-file', filePath, content),
    loadAllPrompts: (dirPath)   => ipcRenderer.invoke('skills:load-all-prompts', dirPath),
  },

  // ── Agent Loop ────────────────────────────────────────────────────────────
  runAgent: (params) => ipcRenderer.invoke('agent:run', params),
  stopAgent: (chatId) => ipcRenderer.invoke('agent:stop', chatId),
  accumulateVoiceUsage: (chatId, usage) => ipcRenderer.invoke('agent:accumulate-voice-usage', { chatId, usage }),
  permissionResponse: (chatId, payload) => ipcRenderer.invoke('agent:permission-response', chatId, payload),
  updatePermissionMode: (chatId, payload) => ipcRenderer.invoke('agent:update-permission-mode', chatId, payload),
  compactContext: (chatId) => ipcRenderer.invoke('agent:compact', chatId),
  compactContextStandalone: (params) => ipcRenderer.invoke('agent:compact-standalone', params),
  getContextSnapshot: (chatId) => ipcRenderer.invoke('agent:get-context', chatId),
  enhancePrompt: (params) => ipcRenderer.invoke('agent:enhance-prompt', params),
  resolveAddressees: (params) => ipcRenderer.invoke('agent:resolve-addressees', params),
  testProvider: (params) => ipcRenderer.invoke('agent:test-provider', params),
  onAgentChunk: (callback) => {
    ipcRenderer.removeAllListeners('agent:chunk')
    ipcRenderer.on('agent:chunk', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('agent:chunk')
  },

  // ── File Attachments ────────────────────────────────────────────────────
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  readFileForAttachment: (filePath) => ipcRenderer.invoke('files:read-for-attachment', filePath),
  resolveDropPaths: (rawPaths) => ipcRenderer.invoke('files:resolve-drop-paths', rawPaths),
  onFileDropped: (callback) => {
    ipcRenderer.removeAllListeners('file-dropped')
    ipcRenderer.on('file-dropped', (_, url) => callback(url))
    return () => ipcRenderer.removeAllListeners('file-dropped')
  },

  // ── Shell ─────────────────────────────────────────────────────────────────
  execShell: (cmd, args) => ipcRenderer.invoke('shell:exec', { cmd, args }),
  openFile: (filePath) => ipcRenderer.invoke('shell:open-file', filePath),
  openImageDataUri: (dataUri, name) => ipcRenderer.invoke('files:open-image-data-uri', { dataUri, name }),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:show-in-folder', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getClipboardImage: () => ipcRenderer.invoke('clipboard:get-image'),

  // ── Soul Memory ────────────────────────────────────────────────────────
  souls: {
    read:   (personaId, type) => ipcRenderer.invoke('souls:read', personaId, type),
    write:  (personaId, type, content) => ipcRenderer.invoke('souls:write', personaId, type, content),
    exists: (personaId, type) => ipcRenderer.invoke('souls:exists', personaId, type),
    list:   (type) => ipcRenderer.invoke('souls:list', type),
    delete: (personaId, type) => ipcRenderer.invoke('souls:delete', personaId, type),
  },

  // ── Memory Extraction ─────────────────────────────────────────────────
  memory: {
    accept: (params) => ipcRenderer.invoke('memory:accept', params),
  },

  // ── Knowledge / Pinecone RAG ─────────────────────────────────────────────
  knowledge: {
    getConfig:           ()       => ipcRenderer.invoke('knowledge:get-config'),
    saveConfig:          (config) => ipcRenderer.invoke('knowledge:save-config', config),
    verifyConnection:    (params) => ipcRenderer.invoke('knowledge:verify-connection', params),
    listIndexes:         (params) => ipcRenderer.invoke('knowledge:list-indexes', params),
    describeIndex:       (params) => ipcRenderer.invoke('knowledge:describe-index', params),
    listDocuments:       (params) => ipcRenderer.invoke('knowledge:list-documents', params),
    listSources:         (params) => ipcRenderer.invoke('knowledge:list-sources', params),
    pickFiles:           ()       => ipcRenderer.invoke('knowledge:pick-files'),
    uploadFiles:         (params) => ipcRenderer.invoke('knowledge:upload-files', params),
    deleteDocument:      (params) => ipcRenderer.invoke('knowledge:delete-document', params),
    deleteSource:        (params) => ipcRenderer.invoke('knowledge:delete-source', params),
    getDocumentSummary:  (params) => ipcRenderer.invoke('knowledge:get-document-summary', params),
    generateEmbeddings:  (params) => ipcRenderer.invoke('knowledge:generate-embeddings', params),
    query:               (params) => ipcRenderer.invoke('knowledge:query', params),
  },

  // ── News RSS Feeds ─────────────────────────────────────────────────────
  news: {
    fetchFeeds: (feeds) => ipcRenderer.invoke('news:fetch-feeds', feeds),
  },

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
    createDrawio: (dir, name)          => ipcRenderer.invoke('obsidian:create-drawio', dir, name),
    deleteFile:   (filePath)           => ipcRenderer.invoke('obsidian:delete-file', filePath),
    rename:       (oldPath, newPath)   => ipcRenderer.invoke('obsidian:rename', oldPath, newPath),
  },

  // -- Coding Mode / Claude Context ------------------------------------------
  claude: {
    // One-shot: load and merge CLAUDE.md hierarchy for a given project path.
    loadContext:   (projectPath)           => ipcRenderer.invoke('claude:load-context', projectPath),
    // Watch: start watching all CLAUDE.md files in the hierarchy.
    // Fires claude:context-updated(chatId, merged) to renderer on any change (debounced 300ms).
    watchContext:  (chatId, projectPath)   => ipcRenderer.invoke('claude:watch-context', { chatId, projectPath }),
    // Unwatch: tear down watchers for a chat session.
    unwatchContext: (chatId)               => ipcRenderer.invoke('claude:unwatch-context', chatId),
    // Subscribe to file-change push events from main process.
    onContextUpdated: (cb) => ipcRenderer.on('claude:context-updated', (_e, payload) => cb(payload)),
    offContextUpdated: (cb) => ipcRenderer.removeListener('claude:context-updated', cb),
  },

  // ── Voice Call ──────────────────────────────────────────────────────────────
  voice: {
    start:      (params)   => ipcRenderer.invoke('voice:start', params),
    stop:       ()         => ipcRenderer.invoke('voice:stop'),
    audioChunk: (buffer)   => ipcRenderer.invoke('voice:audio-chunk', buffer),
    mute:               (params)  => ipcRenderer.invoke('voice:mute', params),
    notifyTaskComplete: (summary) => ipcRenderer.invoke('voice:task-complete', summary),
    updateHistory:      (history) => ipcRenderer.invoke('voice:update-history', history),
    onStatus:       (cb) => { ipcRenderer.on('voice:status', (_e, data) => cb(data)); return () => ipcRenderer.removeAllListeners('voice:status') },
    onTranscription:(cb) => { ipcRenderer.on('voice:transcription', (_e, data) => cb(data)); return () => ipcRenderer.removeAllListeners('voice:transcription') },
    onAiText:       (cb) => { ipcRenderer.on('voice:ai-text', (_e, data) => cb(data)); return () => ipcRenderer.removeAllListeners('voice:ai-text') },
    onTaskTriggered:(cb) => { ipcRenderer.on('voice:task-triggered', (_e, data) => cb(data)); return () => ipcRenderer.removeAllListeners('voice:task-triggered') },
    onError:        (cb) => { ipcRenderer.on('voice:error', (_e, data) => cb(data)); return () => ipcRenderer.removeAllListeners('voice:error') },
    onUsage:        (cb) => { ipcRenderer.on('voice:usage', (_e, data) => cb(data)); return () => ipcRenderer.removeAllListeners('voice:usage') },
    tts:            (params) => ipcRenderer.invoke('voice:tts', params),
  },

  // ── Email / SMTP ────────────────────────────────────────────────────────────
  testSmtp: (smtpConfig) => ipcRenderer.invoke('store:test-smtp', smtpConfig),

  // ── Draw.io ─────────────────────────────────────────────────────────────────
  drawio: {
    getFramePath:    () => ipcRenderer.invoke('drawio:get-frame-path'),
    getPreloadPath:  () => ipcRenderer.invoke('drawio:get-preload-path'),
  },
})
