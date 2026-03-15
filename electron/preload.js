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
  getChatSegments: (params) => ipcRenderer.invoke('store:get-chat-segments', params),
  saveChat: (chat) => ipcRenderer.invoke('store:save-chat', chat),
  deleteChat: (id) => ipcRenderer.invoke('store:delete-chat', id),

  getConfig: () => ipcRenderer.invoke('store:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('store:save-config', config),
  getDataPath: () => ipcRenderer.invoke('store:get-data-path'),
  saveDataPath: (dataPath) => ipcRenderer.invoke('store:save-data-path', dataPath),
  getEnvPaths: () => ipcRenderer.invoke('store:get-env-paths'),
  saveEnvPath: (key, value) => ipcRenderer.invoke('store:save-env-path', key, value),
  getUtilityUsage: () => ipcRenderer.invoke('store:get-utility-usage'),

  getAgents: () => ipcRenderer.invoke('store:get-agents'),
  saveAgents: (agents) => ipcRenderer.invoke('store:save-agents', agents),

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
  editText: (params) => ipcRenderer.invoke('agent:edit-text', params),
  stopEdit: (requestId) => ipcRenderer.invoke('agent:edit-stop', requestId),
  runDocAgent: (params) => ipcRenderer.invoke('agent:doc-run', params),
  stopDocAgent: (requestId) => ipcRenderer.invoke('agent:doc-stop', requestId),
  docPermissionResponse: (requestId, payload) => ipcRenderer.invoke('agent:doc-permission-response', requestId, payload),
  onEditChunk: (callback) => {
    ipcRenderer.removeAllListeners('agent:edit-chunk')
    ipcRenderer.on('agent:edit-chunk', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('agent:edit-chunk')
  },
  resolveAddressees: (params) => ipcRenderer.invoke('agent:resolve-addressees', params),
  dispatchGroupTasks: (params) => ipcRenderer.invoke('agent:dispatch-group-tasks', params),
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
    read:   (agentId, type) => ipcRenderer.invoke('souls:read', agentId, type),
    write:  (agentId, type, content) => ipcRenderer.invoke('souls:write', agentId, type, content),
    exists: (agentId, type) => ipcRenderer.invoke('souls:exists', agentId, type),
    list:   (type) => ipcRenderer.invoke('souls:list', type),
    delete: (agentId, type) => ipcRenderer.invoke('souls:delete', agentId, type),
  },

  // ── Memory Extraction ─────────────────────────────────────────────────
  memory: {
    accept:              (params) => ipcRenderer.invoke('memory:accept', params),
    extractOnChatSwitch: (params) => ipcRenderer.invoke('memory:extract-on-chat-switch', params),
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
    readFileBinary:  (filePath)           => ipcRenderer.invoke('obsidian:read-file-binary', filePath),
    writeFileBinary: (filePath, base64)   => ipcRenderer.invoke('obsidian:write-file-binary', filePath, base64),
    saveImage:    (dir, name, base64)  => ipcRenderer.invoke('obsidian:save-image', dir, name, base64),
    readImageBase64: (filePath)        => ipcRenderer.invoke('obsidian:read-image-base64', filePath),
    createFile:   (dir, name)          => ipcRenderer.invoke('obsidian:create-file', dir, name),
    createFolder: (dir, name)          => ipcRenderer.invoke('obsidian:create-folder', dir, name),
    createDrawio: (dir, name)          => ipcRenderer.invoke('obsidian:create-drawio', dir, name),
    createDocx:  (dir, name)          => ipcRenderer.invoke('obsidian:create-docx', dir, name),
    createXlsx:  (dir, name)          => ipcRenderer.invoke('obsidian:create-xlsx', dir, name),
    deleteFile:   (filePath)           => ipcRenderer.invoke('obsidian:delete-file', filePath),
    isDirEmpty:   (dirPath)            => ipcRenderer.invoke('obsidian:is-dir-empty', dirPath),
    rename:       (oldPath, newPath)   => ipcRenderer.invoke('obsidian:rename', oldPath, newPath),
    copyFilesToDir: (sourcePaths, destDir) => ipcRenderer.invoke('obsidian:copy-files-to-dir', sourcePaths, destDir),
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
    accumulateUsage:(chatId, usage) => ipcRenderer.invoke('agent:accumulate-voice-usage', { chatId, usage }),
  },

  // ── Window ─────────────────────────────────────────────────────────────────
  window: {
    setFullScreen:   (flag) => ipcRenderer.invoke('window:set-fullscreen', flag),
    setMinibar:      (flag) => ipcRenderer.invoke('window:set-minibar', flag),
    saveMinibarBounds: ()   => ipcRenderer.invoke('window:save-minibar-bounds'),
    setPosition:     (x, y) => ipcRenderer.invoke('window:set-position', x, y),
    minimize:        ()     => ipcRenderer.invoke('window:minimize'),
    maximize:        ()     => ipcRenderer.invoke('window:maximize'),
    close:           ()     => ipcRenderer.invoke('window:close'),
    isMaximized:     ()     => ipcRenderer.invoke('window:is-maximized'),
    onMaximized:     (cb)   => {
      const handler = (_e, v) => cb(v)
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.removeListener('window:maximized', handler)
    },
  },

  // Keep legacy top-level aliases used by the existing TitleBar.vue
  windowMinimize:     () => ipcRenderer.invoke('window:minimize'),
  windowMaximize:     () => ipcRenderer.invoke('window:maximize'),
  windowClose:        () => ipcRenderer.invoke('window:close'),
  windowIsMaximized:  () => ipcRenderer.invoke('window:is-maximized'),
  windowGetPosition:  () => ipcRenderer.invoke('window:get-position'),
  windowDragStart:    () => ipcRenderer.send('window:drag-start'),
  windowDragEnd:      () => ipcRenderer.send('window:drag-end'),
  windowMoveTo:       (x, y) => ipcRenderer.send('window:move-to', x, y),
  onWindowMaximized:  (cb) => {
    const handler = (_e, v) => cb(v)
    ipcRenderer.on('window:maximized', handler)
    return () => ipcRenderer.removeListener('window:maximized', handler)
  },

  // ── Email / SMTP ────────────────────────────────────────────────────────────
  testSmtp: (smtpConfig) => ipcRenderer.invoke('store:test-smtp', smtpConfig),

  // ── Draw.io ─────────────────────────────────────────────────────────────────
  drawio: {
    getFramePath:    () => ipcRenderer.invoke('drawio:get-frame-path'),
    getPreloadPath:  () => ipcRenderer.invoke('drawio:get-preload-path'),
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────
  tasks: {
    list:       ()          => ipcRenderer.invoke('tasks:list'),
    save:       (task)      => ipcRenderer.invoke('tasks:save', task),
    delete:     (id)        => ipcRenderer.invoke('tasks:delete', id),
    getRuns:    (params)    => ipcRenderer.invoke('tasks:get-runs', params),
    getRun:     (runId)     => ipcRenderer.invoke('tasks:get-run', runId),
    deleteRun:  (runId)     => ipcRenderer.invoke('tasks:delete-run', runId),
    saveRun:    (runDetail) => ipcRenderer.invoke('tasks:save-run', runDetail),
    onRunCompleted: (cb) => {
      ipcRenderer.removeAllListeners('tasks:run-completed')
      ipcRenderer.on('tasks:run-completed', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('tasks:run-completed')
    },
    onRunStarted: (cb) => {
      ipcRenderer.removeAllListeners('tasks:run-started')
      ipcRenderer.on('tasks:run-started', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('tasks:run-started')
    },
    onRunUpdated: (cb) => {
      ipcRenderer.removeAllListeners('tasks:run-updated')
      ipcRenderer.on('tasks:run-updated', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('tasks:run-updated')
    },
  },

  // ── Plans ─────────────────────────────────────────────────────────────────
  plans: {
    list:   ()     => ipcRenderer.invoke('plans:list'),
    save:   (plan) => ipcRenderer.invoke('plans:save', plan),
    delete: (id)   => ipcRenderer.invoke('plans:delete', id),
  },

  // ── Task Categories ────────────────────────────────────────────────────────
  taskCategories: {
    list:   ()    => ipcRenderer.invoke('task-categories:list'),
    save:   (cat) => ipcRenderer.invoke('task-categories:save', cat),
    delete: (id)  => ipcRenderer.invoke('task-categories:delete', id),
  },

  // ── Plan Categories ────────────────────────────────────────────────────────
  planCategories: {
    list:   ()    => ipcRenderer.invoke('plan-categories:list'),
    save:   (cat) => ipcRenderer.invoke('plan-categories:save', cat),
    delete: (id)  => ipcRenderer.invoke('plan-categories:delete', id),
  },

  // ── AI Task Tree ───────────────────────────────────────────────────────────
  aiTask: {
    syncTree: (payload) => ipcRenderer.invoke('ai-task:sync-tree', payload),
    getTree:  ()        => ipcRenderer.invoke('ai-task:get-tree'),
  },

  // ── Plaza ─────────────────────────────────────────────────────────────────
  plaza: {
    getTopics:        ()     => ipcRenderer.invoke('plaza:get-topics'),
    saveTopics:       (data) => ipcRenderer.invoke('plaza:save-topics', data),
    getSessions:      (topicId) => ipcRenderer.invoke('plaza:get-sessions', topicId),
    saveSession:      (session) => ipcRenderer.invoke('plaza:save-session', session),
    getSessionById:   (id)   => ipcRenderer.invoke('plaza:get-session-by-id', id),
    generateTopics:   (p)    => ipcRenderer.invoke('plaza:generate-topics', p),
    generateFromDesc: (p)    => ipcRenderer.invoke('plaza:generate-from-desc', p),
    surpriseMe:       (p)    => ipcRenderer.invoke('plaza:surprise-me', p),
    runRound:         (p)    => ipcRenderer.invoke('plaza:run-discussion-round', p),
    extractMemories:    (p)  => ipcRenderer.invoke('plaza:extract-memories', p),
    generateConclusion: (p)  => ipcRenderer.invoke('plaza:generate-conclusion', p),
    commitMemories:     (p)  => ipcRenderer.invoke('plaza:commit-memories', p),
    onChunk: (cb) => {
      ipcRenderer.removeAllListeners('plaza:chunk')
      ipcRenderer.on('plaza:chunk', (_, d) => cb(d))
      return () => ipcRenderer.removeAllListeners('plaza:chunk')
    },
  },

  // ── IM Bridge ─────────────────────────────────────────────────────────────
  im: {
    getStatus:   ()       => ipcRenderer.invoke('im:get-status'),
    start:       ()       => ipcRenderer.invoke('im:start'),
    stop:        ()       => ipcRenderer.invoke('im:stop'),
    getSessions:     ()         => ipcRenderer.invoke('im:get-sessions'),
    startPlatform:   (platform) => ipcRenderer.invoke('im:start-platform', platform),
    stopPlatform:    (platform) => ipcRenderer.invoke('im:stop-platform', platform),
    onChatsUpdated: (cb)  => {
      ipcRenderer.removeAllListeners('im:chats-updated')
      ipcRenderer.on('im:chats-updated', () => cb())
      return () => ipcRenderer.removeAllListeners('im:chats-updated')
    },
    onChatUpdated: (cb) => {
      ipcRenderer.removeAllListeners('im:chat-updated')
      ipcRenderer.on('im:chat-updated', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('im:chat-updated')
    },
    requestWhatsAppQr: () => ipcRenderer.invoke('im:whatsapp-request-qr'),
    onWhatsAppQr: (cb) => {
      ipcRenderer.removeAllListeners('im:whatsapp-qr')
      ipcRenderer.on('im:whatsapp-qr', (_e, d) => cb(d))
      return () => ipcRenderer.removeAllListeners('im:whatsapp-qr')
    },
    onWhatsAppReady: (cb) => {
      ipcRenderer.removeAllListeners('im:whatsapp-ready')
      ipcRenderer.on('im:whatsapp-ready', () => cb())
      return () => ipcRenderer.removeAllListeners('im:whatsapp-ready')
    },
    onPlatformStopped: (cb) => {
      ipcRenderer.removeAllListeners('im:platform-stopped')
      ipcRenderer.on('im:platform-stopped', (_e, d) => cb(d))
      return () => ipcRenderer.removeAllListeners('im:platform-stopped')
    },
  },
})
