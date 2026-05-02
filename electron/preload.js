const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Platform ────────────────────────────────────────────────────────────────
  platform: process.platform,
  getLocale: () => ipcRenderer.invoke('app:get-locale'),

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
  relaunchApp: () => ipcRenderer.invoke('app:relaunch'),
  getEnvPaths: () => ipcRenderer.invoke('store:get-env-paths'),
  saveEnvPath: (key, value) => ipcRenderer.invoke('store:save-env-path', key, value),

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

  // ── Model fetching & cache ──────────────────────────────────────────────
  fetchOpenRouterModels: (params) => ipcRenderer.invoke('openrouter:fetch-models', params),
  fetchOpenAIModels: (params) => ipcRenderer.invoke('openai:fetch-models', params),
  fetchGoogleModels: (params) => ipcRenderer.invoke('google:fetch-models', params),
  loadModelCache: () => ipcRenderer.invoke('models:load-cache'),
  saveModelCache: (data) => ipcRenderer.invoke('models:save-cache', data),
  enrichModelContext: (params) => ipcRenderer.invoke('models:enrich-context', params),
  getDefaultMaxOutputTokens: (modelId) => ipcRenderer.invoke('models:get-default-max-output-tokens', modelId),
  getAllDefaultMaxOutputTokens: () => ipcRenderer.invoke('models:get-all-default-max-output-tokens'),
  getCatalogEntries: () => ipcRenderer.invoke('models:get-catalog-entries'),
  recommendModel: (params) => ipcRenderer.invoke('models:recommend', params),
  enrichModelsFromCatalog: (params) => ipcRenderer.invoke('models:enrich-from-catalog', params),

  // ── Skills (filesystem-based) ───────────────────────────────────────────
  skills: {
    scanDir:        (dirPath)   => ipcRenderer.invoke('skills:scan-dir', dirPath),
    readTree:       (skillPath) => ipcRenderer.invoke('skills:read-tree', skillPath),
    readFile:       (filePath)  => ipcRenderer.invoke('skills:read-file', filePath),
    writeFile:      (filePath, content) => ipcRenderer.invoke('skills:write-file', filePath, content),
    loadAllPrompts: (dirPath)   => ipcRenderer.invoke('skills:load-all-prompts', dirPath),
    fetchRemote:    (sourceId, options) => ipcRenderer.invoke('skills:fetch-remote', sourceId, options),
    installRemote:  (sourceId, skillId, skillUrl, skillsPath) => ipcRenderer.invoke('skills:install-remote', sourceId, skillId, skillUrl, skillsPath),
    deleteSkill:    (skillPath) => ipcRenderer.invoke('skills:delete-skill', skillPath),
  },

  // ── Agent Loop ────────────────────────────────────────────────────────────
  runAgent: (params) => ipcRenderer.invoke('agent:run', params),
  runAgentAdditional: (params) => ipcRenderer.invoke('agent:run-additional', params),
  stopAgent: (chatId) => ipcRenderer.invoke('agent:stop', chatId),
  getRunningAgents: () => ipcRenderer.invoke('agent:get-running'),
  accumulateVoiceUsage: (chatId, usage) => ipcRenderer.invoke('agent:accumulate-voice-usage', { chatId, usage }),
  permissionResponse: (chatId, payload) => ipcRenderer.invoke('agent:permission-response', chatId, payload),
  updatePermissionMode: (chatId, payload) => ipcRenderer.invoke('agent:update-permission-mode', chatId, payload),
  compactContext: (chatId) => ipcRenderer.invoke('agent:compact', chatId),
  compactContextStandalone: (params) => ipcRenderer.invoke('agent:compact-standalone', params),
  getContextSnapshot: (chatId) => ipcRenderer.invoke('agent:get-context', chatId),
  enhancePrompt: (params) => ipcRenderer.invoke('agent:enhance-prompt', params),
  editText: (params) => ipcRenderer.invoke('agent:edit-text', params),
  stopEdit: (requestId) => ipcRenderer.invoke('agent:edit-stop', requestId),
  generateGreeting: (params) => ipcRenderer.invoke('agent:generate-greeting', params),
  cancelGreeting: (chatId) => ipcRenderer.invoke('agent:cancel-greeting', chatId),
  onGreetChunk: (callback) => {
    const listener = (_, data) => callback(data)
    ipcRenderer.on('agent:greet-chunk', listener)
    return () => ipcRenderer.removeListener('agent:greet-chunk', listener)
  },
  runDocAgent: (params) => ipcRenderer.invoke('agent:doc-run', params),
  stopDocAgent: (requestId) => ipcRenderer.invoke('agent:doc-stop', requestId),
  docPermissionResponse: (requestId, payload) => ipcRenderer.invoke('agent:doc-permission-response', requestId, payload),
  onEditChunk: (callback) => {
    // Per-subscriber listener so concurrent users of the edit-chunk channel
    // (inline edit + AI Doc panel) don't evict each other. The returned
    // cleanup removes only this subscription.
    const listener = (_, data) => callback(data)
    ipcRenderer.on('agent:edit-chunk', listener)
    return () => ipcRenderer.removeListener('agent:edit-chunk', listener)
  },
  sendMessage: (params) => ipcRenderer.invoke('agent:send-message', params),
  resolveAddressees: (params) => ipcRenderer.invoke('agent:resolve-addressees', params),
  routeGroupAudience: (params) => ipcRenderer.invoke('agent:route-group-audience', params),
  dispatchGroupTasks: (params) => ipcRenderer.invoke('agent:dispatch-group-tasks', params),
  suggestChatTitle: (params) => ipcRenderer.invoke('agent:suggest-chat-title', params),
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

  // ── Memory ─────────────────────────────────────────────────────────────
  // Unified namespace for all memory operations. Three groups of channels:
  //   - blob: read/write/exists/listAgents/deleteAgent/deleteAgentData
  //   - structured CRUD: listEntries/addEntry/updateEntry/deleteEntry/search/reindex
  //   - extraction: accept/extractOnChatSwitch/extractCollaboration
  memory: {
    // Markdown blob contract
    read:             (agentId, type)              => ipcRenderer.invoke('memory:read', agentId, type),
    write:            (agentId, type, content)     => ipcRenderer.invoke('memory:write', agentId, type, content),
    exists:           (agentId, type)              => ipcRenderer.invoke('memory:exists', agentId, type),
    listAgents:       (type)                       => ipcRenderer.invoke('memory:list-agents', type),
    deleteAgent:      (agentId, type)              => ipcRenderer.invoke('memory:delete-agent', agentId, type),
    deleteAgentData:  (agentId, type)              => ipcRenderer.invoke('memory:delete-agent-data', agentId, type),
    // Structured CRUD
    listEntries:      (agentId, agentType)         => ipcRenderer.invoke('memory:list-entries', agentId, agentType),
    addEntry:         (payload)                    => ipcRenderer.invoke('memory:add-entry', payload),
    updateEntry:      (payload)                    => ipcRenderer.invoke('memory:update-entry', payload),
    deleteEntry:      (id)                         => ipcRenderer.invoke('memory:delete-entry', id),
    search:           (payload)                    => ipcRenderer.invoke('memory:search', payload),
    reindex:          ()                           => ipcRenderer.invoke('memory:reindex'),
    // Extraction
    accept:               (params)                 => ipcRenderer.invoke('memory:accept', params),
    extractOnChatSwitch:  (params)                 => ipcRenderer.invoke('memory:extract-on-chat-switch', params),
    extractCollaboration: (params)                 => ipcRenderer.invoke('memory:extract-collaboration', params),
  },

  // ── Knowledge / Local RAG ────────────────────────────────────────────────
  knowledge: {
    getConfig:            ()       => ipcRenderer.invoke('knowledge:get-config'),
    saveConfig:           (config) => ipcRenderer.invoke('knowledge:save-config', config),
    listKnowledgeBases:   ()       => ipcRenderer.invoke('knowledge:list-knowledge-bases'),
    getKnowledgeBase:     (params) => ipcRenderer.invoke('knowledge:get-knowledge-base', params),
    createKnowledgeBase:  (params) => ipcRenderer.invoke('knowledge:create-knowledge-base', params),
    deleteKnowledgeBase:  (params) => ipcRenderer.invoke('knowledge:delete-knowledge-base', params),
    listDocuments:        (params) => ipcRenderer.invoke('knowledge:list-documents', params),
    pickFiles:            ()       => ipcRenderer.invoke('knowledge:pick-files'),
    uploadFiles:          (params) => ipcRenderer.invoke('knowledge:upload-files', params),
    deleteDocument:       (params) => ipcRenderer.invoke('knowledge:delete-document', params),
    getDocumentSummary:   (params) => ipcRenderer.invoke('knowledge:get-document-summary', params),
    query:                (params) => ipcRenderer.invoke('knowledge:query', params),
    // Embedding model management (mirrors voice.localCheckEnv/localSetupEnv pattern)
    checkModel:           ()       => ipcRenderer.invoke('knowledge:check-model'),
    setupModel:           (params) => ipcRenderer.invoke('knowledge:setup-model', params),
    removeModel:          ()       => ipcRenderer.invoke('knowledge:remove-model'),
    onSetupProgress:      (cb)     => {
      ipcRenderer.on('knowledge:setup-progress', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('knowledge:setup-progress')
    },
    onUploadProgress:     (cb)     => {
      ipcRenderer.on('knowledge:upload-progress', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('knowledge:upload-progress')
    },
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
    probeFile:    (filePath)           => ipcRenderer.invoke('obsidian:probe-file', filePath),
    probeFiles:   (filePaths)          => ipcRenderer.invoke('obsidian:probe-files', filePaths),
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

  // -- HTML Preview local server -----------------------------------------------
  htmlPreview: {
    getPort: () => ipcRenderer.invoke('html-preview:port'),
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
    audioChunk: (buffer, mimeType) => ipcRenderer.invoke('voice:audio-chunk', buffer, mimeType),
    mute:               (params)  => ipcRenderer.invoke('voice:mute', params),
    bargeIn:            ()        => ipcRenderer.invoke('voice:barge-in'),
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
    // Local voice (SenseVoice STT + Edge-TTS)
    localSetupEnv:     ()      => ipcRenderer.invoke('voice:local-setup-env'),
    localCheckEnv:     ()      => ipcRenderer.invoke('voice:local-check-env'),
    localStartServer:  ()      => ipcRenderer.invoke('voice:local-start-server'),
    localStopServer:   ()      => ipcRenderer.invoke('voice:local-stop-server'),
    localHealth:       ()      => ipcRenderer.invoke('voice:local-health'),
    detectGPU:         ()      => ipcRenderer.invoke('voice:detect-gpu'),
    removeLocalEnv:    ()      => ipcRenderer.invoke('voice:remove-local-env'),
    localTts:          (params)=> ipcRenderer.invoke('voice:local-tts', params),
    edgeTtsNode:       (params)=> ipcRenderer.invoke('voice:edge-tts-node', params),
    edgeTtsChunked:    (params)=> ipcRenderer.invoke('voice:edge-tts-chunked', params),
    edgeTtsCancel:     (params)=> ipcRenderer.invoke('voice:edge-tts-cancel', params),
    edgeTtsCleanup:    (params)=> ipcRenderer.invoke('voice:edge-tts-cleanup', params),
    onTtsChunkReady:   (cb)    => { const handler = (_e, d) => cb(d); ipcRenderer.on('voice:tts-chunk-ready', handler); return handler },
    offTtsChunkReady:  (handler)=> ipcRenderer.removeListener('voice:tts-chunk-ready', handler),
    localTest:         ()      => ipcRenderer.invoke('voice:local-test'),
    edgeVoices:        ()      => ipcRenderer.invoke('voice:edge-voices'),
    edgePreview:       (params)=> ipcRenderer.invoke('voice:edge-preview', params),
    onSetupProgress:   (cb)    => { ipcRenderer.on('voice:setup-progress', (_e, d) => cb(d)); return () => ipcRenderer.removeAllListeners('voice:setup-progress') },
  },

  // ── Agent Import (Chat History → Create Agent) ─────────────────────────────
  agentImport: {
    checkEnv:        ()       => ipcRenderer.invoke('agent:import-check-env'),
    setupEnv:        ()       => ipcRenderer.invoke('agent:import-setup-env'),
    pickFile:        ()       => ipcRenderer.invoke('agent:import-pick-file'),
    pickDir:         ()       => ipcRenderer.invoke('agent:import-pick-dir'),
    decryptWeChat:   (p)      => ipcRenderer.invoke('agent:import-decrypt-wechat', p),
    listContacts:    (p)      => ipcRenderer.invoke('agent:import-list-contacts', p),
    listWhatsAppSenders: (p)  => ipcRenderer.invoke('agent:import-list-whatsapp-senders', p),
    extractMessages: (params) => ipcRenderer.invoke('agent:import-extract-messages', params),
    analyze:         (params) => ipcRenderer.invoke('agent:import-analyze', params),
    writeMemories:   (params) => ipcRenderer.invoke('agent:import-write-memories', params),
    writeSpeechDna:  (params) => ipcRenderer.invoke('agent:import-write-speech-dna', params),
    writePersonaSections: (params) => ipcRenderer.invoke('agent:import-write-persona-sections', params),
    validateHarness: (params) => ipcRenderer.invoke('agent:import-validate-harness', params),
    writeHarness:    (params) => ipcRenderer.invoke('agent:import-write-harness', params),
    saveHistory:     (params) => ipcRenderer.invoke('agent:import-save-history', params),
    recommendVoice:  (params) => ipcRenderer.invoke('agent:recommend-voice', params),
    cleanup:         ()       => ipcRenderer.invoke('agent:import-cleanup'),
    onProgress:      (cb)     => {
      ipcRenderer.on('agent:import-progress', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('agent:import-progress')
    },
  },

  // ── Agent Analysis ─────────────────────────────────────────────────────────
  agentAnalysis: {
    hasHistory: (p) => ipcRenderer.invoke('agent:analysis-has-history', p),
  },

  // ── Window ─────────────────────────────────────────────────────────────────
  window: {
    setFullScreen:   (flag) => ipcRenderer.invoke('window:set-fullscreen', flag),
    setMinibar:      (flag) => ipcRenderer.invoke('window:set-minibar', flag),
    setMinibarExpand: (opts) => ipcRenderer.invoke('window:set-minibar-expand', opts),
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
    // Report route + active chat to main process so completion notifications
    // can suppress when the user is already looking at the relevant chat.
    setUIState: (payload) => ipcRenderer.invoke('window:set-ui-state', payload),
  },

  // ── Completion Notifications ───────────────────────────────────────────────
  // Click-through from notification → renderer opens the target chat.
  onOpenChat: (cb) => {
    ipcRenderer.removeAllListeners('notifier:open-chat')
    ipcRenderer.on('notifier:open-chat', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('notifier:open-chat')
  },

  // App info (no IPC needed — available in preload context)
  getAppVersion:      () => require('../package.json').version,
  getPlatformInfo:    () => {
    const os = require('os')
    const platform = process.platform
    const release = os.release()
    let name = platform
    if (platform === 'win32') {
      const major = parseInt(release.split('.')[0], 10)
      const build = parseInt(release.split('.')[2], 10) || 0
      name = major >= 10 && build >= 22000 ? 'Windows 11' : major >= 10 ? 'Windows 10' : `Windows (${release})`
    } else if (platform === 'darwin') {
      name = `macOS ${release}`
    } else if (platform === 'linux') {
      name = `Linux ${release.split('-')[0]}`
    }
    return { platform: name }
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

  // ── Auto-Update ───────────────────────────────────────────────────────────
  updater: {
    check:               (opts) => ipcRenderer.invoke('updater:check', opts),
    install:             ()     => ipcRenderer.invoke('updater:install'),
    quitAndInstall:      ()     => ipcRenderer.invoke('updater:quit-and-install'),
    openDownloadPage:    ()     => ipcRenderer.invoke('updater:open-download-page'),
    getStatus:           ()     => ipcRenderer.invoke('updater:get-status'),
    onCheckStarted:      (cb)   => { const h=(_e,d)=>cb(d); ipcRenderer.on('updater:check_started', h); return () => ipcRenderer.removeListener('updater:check_started', h) },
    onAvailable:         (cb)   => { const h=(_e,d)=>cb(d); ipcRenderer.on('updater:available', h); return () => ipcRenderer.removeListener('updater:available', h) },
    onNotAvailable:      (cb)   => { const h=(_e,d)=>cb(d); ipcRenderer.on('updater:not_available', h); return () => ipcRenderer.removeListener('updater:not_available', h) },
    onProgress:          (cb)   => { const h=(_e,d)=>cb(d); ipcRenderer.on('updater:progress', h); return () => ipcRenderer.removeListener('updater:progress', h) },
    onDownloaded:        (cb)   => { const h=(_e,d)=>cb(d); ipcRenderer.on('updater:downloaded', h); return () => ipcRenderer.removeListener('updater:downloaded', h) },
    onError:             (cb)   => { const h=(_e,d)=>cb(d); ipcRenderer.on('updater:error', h); return () => ipcRenderer.removeListener('updater:error', h) },
  },

  // ── Email / SMTP ────────────────────────────────────────────────────────────
  testSmtp: (smtpConfig) => ipcRenderer.invoke('store:test-smtp', smtpConfig),

  // ── Authentication (Google OAuth) ──────────────────────────────────────────
  // Returns { idToken } on success; throws on user cancel / timeout / config error.
  // The renderer then forwards idToken to the backend via /auth/google.
  signInWithGoogle: () => ipcRenderer.invoke('auth:google-sign-in'),
  getAuthBaseUrl: () => ipcRenderer.invoke('auth:get-base-url'),

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
    getTree: () => ipcRenderer.invoke('ai-task:get-tree'),
  },

  // ── Chat lifecycle events (main → renderer) ────────────────────────────────
  onChatClearModeTransitionPending: (cb) => {
    const listener = (_, data) => cb(data)
    ipcRenderer.on('chat:clear-mode-transition-pending', listener)
    return () => ipcRenderer.removeListener('chat:clear-mode-transition-pending', listener)
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
    onAgentStreamStart: (cb) => {
      ipcRenderer.removeAllListeners('im:agent-stream-start')
      ipcRenderer.on('im:agent-stream-start', (_e, d) => cb(d))
      return () => ipcRenderer.removeAllListeners('im:agent-stream-start')
    },
    onAgentChunk: (cb) => {
      ipcRenderer.removeAllListeners('im:agent-chunk')
      ipcRenderer.on('im:agent-chunk', (_e, d) => cb(d))
      return () => ipcRenderer.removeAllListeners('im:agent-chunk')
    },
    onAgentStreamEnd: (cb) => {
      ipcRenderer.removeAllListeners('im:agent-stream-end')
      ipcRenderer.on('im:agent-stream-end', (_e, d) => cb(d))
      return () => ipcRenderer.removeAllListeners('im:agent-stream-end')
    },
    // Per-callback listeners (LESSONS.md #29) — multiple subscribers can coexist.
    onRunStarted: (cb) => {
      const listener = (_e, d) => cb(d)
      ipcRenderer.on('im:run-started', listener)
      return () => ipcRenderer.removeListener('im:run-started', listener)
    },
    onRunEnded: (cb) => {
      const listener = (_e, d) => cb(d)
      ipcRenderer.on('im:run-ended', listener)
      return () => ipcRenderer.removeListener('im:run-ended', listener)
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
    // Teams
    teamsRequestAuth: (opts) => ipcRenderer.invoke('im:teams-request-auth', opts),
    teamsSignOut:     () => ipcRenderer.invoke('im:teams-sign-out'),
    teamsAuthStatus:  () => ipcRenderer.invoke('im:teams-auth-status'),
    onTeamsDeviceCode: (cb) => {
      ipcRenderer.removeAllListeners('im:teams-device-code')
      ipcRenderer.on('im:teams-device-code', (_e, d) => cb(d))
      return () => ipcRenderer.removeAllListeners('im:teams-device-code')
    },
    onTeamsReady: (cb) => {
      ipcRenderer.removeAllListeners('im:teams-ready')
      ipcRenderer.on('im:teams-ready', (_e, d) => cb(d))
      return () => ipcRenderer.removeAllListeners('im:teams-ready')
    },
    onTeamsAuthError: (cb) => {
      ipcRenderer.removeAllListeners('im:teams-auth-error')
      ipcRenderer.on('im:teams-auth-error', (_e, d) => cb(d))
      return () => ipcRenderer.removeAllListeners('im:teams-auth-error')
    },
  },
})
