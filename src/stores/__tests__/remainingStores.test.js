import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// ── Global stubs ──
vi.stubGlobal('localStorage', {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
})

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    skills: {
      scanDir: vi.fn().mockResolvedValue([]),
      loadAllPrompts: vi.fn().mockResolvedValue([]),
      fetchRemote: vi.fn().mockResolvedValue([]),
      installRemote: vi.fn().mockResolvedValue({ success: true }),
      deleteSkill: vi.fn().mockResolvedValue(true),
    },
    tools: {
      getConfig: vi.fn().mockResolvedValue({}),
      saveConfig: vi.fn().mockResolvedValue({ success: true }),
    },
    mcp: {
      getConfig: vi.fn().mockResolvedValue([]),
      saveConfig: vi.fn().mockResolvedValue(true),
      getStatus: vi.fn().mockResolvedValue({}),
      testConnection: vi.fn().mockResolvedValue({ success: true }),
    },
    knowledge: {
      getConfig: vi.fn().mockResolvedValue({ ragEnabled: true, knowledgeBases: {} }),
      saveConfig: vi.fn().mockResolvedValue(true),
      listKnowledgeBases: vi.fn().mockResolvedValue({ success: true, knowledgeBases: [] }),
      checkModel: vi.fn().mockResolvedValue({ ready: false }),
    },
    loadModelCache: vi.fn().mockResolvedValue({}),
    saveModelCache: vi.fn().mockResolvedValue(true),
    news: { fetchFeeds: vi.fn().mockResolvedValue({ success: true, feeds: [] }) },
    obsidian: {
      getConfig: vi.fn().mockResolvedValue({}),
      readTree: vi.fn().mockResolvedValue([]),
      pickFolder: vi.fn().mockResolvedValue(null),
    },
    window: { setFullScreen: vi.fn() },
  },
})

// UUID mock
let uuidCounter = 0
vi.mock('uuid', () => ({ v4: () => `uuid-${++uuidCounter}` }))

beforeEach(() => {
  setActivePinia(createPinia())
  uuidCounter = 0
  vi.clearAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════
// 1. Skills Store
// ══════════════════════════════════════════════════════════════════════════
describe('skillsStore', () => {
  let useSkillsStore
  beforeEach(async () => {
    const mod = await import('../skills')
    useSkillsStore = mod.useSkillsStore
  })

  it('loadSkills populates skills from electronAPI', async () => {
    window.electronAPI.skills.scanDir.mockResolvedValue([
      { id: 's1', name: 'Skill1', summary: 'test' },
    ])
    const store = useSkillsStore()
    await store.loadSkills('/path')
    expect(store.skills.length).toBe(1)
    expect(store.skills[0].id).toBe('s1')
  })

  it('allSkillObjects filters skills with systemPrompt', () => {
    const store = useSkillsStore()
    store.skills = [
      { id: 's1', name: 'A', summary: '', systemPrompt: 'Do stuff' },
      { id: 's2', name: 'B', summary: '' }, // no systemPrompt
    ]
    expect(store.allSkillObjects.length).toBe(1)
    expect(store.allSkillObjects[0].id).toBe('s1')
  })

  it('isSkillInstalled checks local skills', () => {
    const store = useSkillsStore()
    store.skills = [{ id: 'abc', name: 'X' }]
    expect(store.isSkillInstalled('abc')).toBe(true)
    expect(store.isSkillInstalled('zzz')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 2. Tools Store
// ══════════════════════════════════════════════════════════════════════════
describe('toolsStore', () => {
  let useToolsStore
  beforeEach(async () => {
    const mod = await import('../tools')
    useToolsStore = mod.useToolsStore
  })

  it('loadTools normalizes dict format to array', async () => {
    window.electronAPI.tools.getConfig.mockResolvedValue({
      'my-tool': { name: 'My Tool', type: 'http', method: 'POST', endpoint: 'https://example.com' },
    })
    const store = useToolsStore()
    await store.loadTools()
    // my-tool + builtin weather tool (seeded)
    expect(store.tools.length).toBeGreaterThanOrEqual(1)
    const myTool = store.tools.find(t => t.id === 'my-tool')
    expect(myTool).toBeDefined()
    expect(myTool.method).toBe('POST')
  })

  it('loadTools seeds builtin tools when missing', async () => {
    window.electronAPI.tools.getConfig.mockResolvedValue({})
    const store = useToolsStore()
    await store.loadTools()
    const weather = store.tools.find(t => t.id === 'builtin-weather-city')
    expect(weather).toBeDefined()
    expect(weather.type).toBe('http')
  })

  it('loadTools respects deletedBuiltins', async () => {
    window.electronAPI.tools.getConfig.mockResolvedValue({
      __deletedBuiltins: ['builtin-weather-city'],
    })
    const store = useToolsStore()
    await store.loadTools()
    const weather = store.tools.find(t => t.id === 'builtin-weather-city')
    expect(weather).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 3. MCP Store
// ══════════════════════════════════════════════════════════════════════════
describe('mcpStore', () => {
  let useMcpStore
  beforeEach(async () => {
    const mod = await import('../mcp')
    useMcpStore = mod.useMcpStore
  })

  it('loadServers handles array format', async () => {
    window.electronAPI.mcp.getConfig.mockResolvedValue([
      { id: 's1', name: 'Server1', command: 'npx', args: ['-y', 'pkg'] },
    ])
    const store = useMcpStore()
    await store.loadServers()
    expect(store.servers.length).toBe(1)
    expect(store.servers[0].name).toBe('Server1')
    expect(store.servers[0].enabled).toBe(true)
  })

  it('loadServers migrates legacy dict format', async () => {
    window.electronAPI.mcp.getConfig.mockResolvedValue({
      'my-server': { command: 'node', args: ['server.js'] },
    })
    const store = useMcpStore()
    await store.loadServers()
    expect(store.servers.length).toBe(1)
    expect(store.servers[0].name).toBe('my-server')
    expect(store.servers[0].command).toBe('node')
    // Should persist immediately after migration
    expect(window.electronAPI.mcp.saveConfig).toHaveBeenCalled()
  })

  it('loadServers handles null/empty', async () => {
    window.electronAPI.mcp.getConfig.mockResolvedValue(null)
    const store = useMcpStore()
    await store.loadServers()
    expect(store.servers).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 4. Knowledge Store
// ══════════════════════════════════════════════════════════════════════════
describe('knowledgeStore', () => {
  let useKnowledgeStore
  beforeEach(async () => {
    const mod = await import('../knowledge')
    useKnowledgeStore = mod.useKnowledgeStore
  })

  it('loadConfig sets kbConfigs and loads KB list', async () => {
    window.electronAPI.knowledge.getConfig.mockResolvedValue({
      knowledgeBases: { kb1: { enabled: true } },
    })
    window.electronAPI.knowledge.listKnowledgeBases.mockResolvedValue({
      success: true,
      knowledgeBases: [{ id: 'kb1', name: 'KB1' }],
    })
    const store = useKnowledgeStore()
    await store.loadConfig()
    expect(store.kbConfigs).toEqual({ kb1: { enabled: true } })
    expect(store.knowledgeBases.length).toBe(1)
  })

  it('enabledKnowledgeBases filters by config', async () => {
    const store = useKnowledgeStore()
    store.knowledgeBases = [
      { id: 'kb1', name: 'A' },
      { id: 'kb2', name: 'B' },
    ]
    store.kbConfigs = { kb2: { enabled: false } }
    expect(store.enabledKnowledgeBases.length).toBe(1)
    expect(store.enabledKnowledgeBases[0].id).toBe('kb1')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 5. Models Store
// ══════════════════════════════════════════════════════════════════════════
vi.mock('../config', () => ({
  useConfigStore: () => ({
    config: {
      providers: [
        { id: 'p1', type: 'anthropic', apiKey: 'sk-test', model: 'claude-sonnet', settings: { opusModel: 'claude-opus' } },
      ],
      newsFeeds: [],
      feedSelection: [],
    },
    language: 'en',
    saveConfig: vi.fn(),
  }),
}))

describe('modelsStore', () => {
  let useModelsStore
  beforeEach(async () => {
    const mod = await import('../models')
    useModelsStore = mod.useModelsStore
  })

  it('loadFromDisk hydrates cache', async () => {
    window.electronAPI.loadModelCache.mockResolvedValue({
      p2: { type: 'openai', models: [{ id: 'gpt-4', name: 'GPT-4', context_length: 128000 }] },
    })
    const store = useModelsStore()
    await store.loadFromDisk()
    expect(store.providerModels.p2.models.length).toBe(1)
  })

  it('getAllContextWindows returns map from all providers', () => {
    const store = useModelsStore()
    store.providerModels = {
      p2: { type: 'openai', models: [{ id: 'gpt-4', context_length: 128000 }] },
    }
    const map = store.getAllContextWindows()
    expect(map['gpt-4']).toBe(128000)
    // Anthropic models derived from config mock
    expect(map['claude-sonnet']).toBe(1000000)
  })

  it('isCached returns true for anthropic type', () => {
    const store = useModelsStore()
    expect(store.isCached('anthropic')).toBe(true)
    expect(store.isCached('nonexistent')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 6. FocusMode Store
// ══════════════════════════════════════════════════════════════════════════
describe('focusModeStore', () => {
  let useFocusModeStore
  beforeEach(async () => {
    const mod = await import('../focusMode')
    useFocusModeStore = mod.useFocusModeStore
  })

  it('enter sets isFocusMode true and calls fullscreen', () => {
    const store = useFocusModeStore()
    expect(store.isFocusMode).toBe(false)
    store.enter()
    expect(store.isFocusMode).toBe(true)
    expect(window.electronAPI.window.setFullScreen).toHaveBeenCalledWith(true)
  })

  it('exit sets isFocusMode false and triggers justExited', () => {
    const store = useFocusModeStore()
    store.enter()
    store.exit()
    expect(store.isFocusMode).toBe(false)
    expect(store.justExited).toBe(true)
    expect(window.electronAPI.window.setFullScreen).toHaveBeenCalledWith(false)
  })

  it('enterMinibar / exitMinibar toggle isMinibarMode', () => {
    const store = useFocusModeStore()
    expect(store.isMinibarMode).toBe(false)
    store.enterMinibar()
    expect(store.isMinibarMode).toBe(true)
    store.exitMinibar()
    expect(store.isMinibarMode).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 7. Voice Store
// ══════════════════════════════════════════════════════════════════════════
vi.mock('../../utils/guestLimits', () => ({
  PREVIEW_LIMITS: { maxVoiceSecsPerDay: 600 },
  isLimitEnforced: () => false,
}))

describe('voiceStore', () => {
  let useVoiceStore
  beforeEach(async () => {
    const mod = await import('../voice')
    useVoiceStore = mod.useVoiceStore
  })

  it('startCall sets active state', () => {
    const store = useVoiceStore()
    store.startCall('chat1', 'agent1', 'TestAgent', 'model-1')
    expect(store.isCallActive).toBe(true)
    expect(store.activeChatId).toBe('chat1')
    expect(store.activeAgentName).toBe('TestAgent')
  })

  it('endCall resets all state', () => {
    const store = useVoiceStore()
    store.startCall('chat1', 'agent1', 'TestAgent', 'model-1')
    store.endCall()
    expect(store.isCallActive).toBe(false)
    expect(store.activeChatId).toBeNull()
    expect(store.callWhisperSecs).toBe(0)
  })

  it('setPip sets pip state', () => {
    const store = useVoiceStore()
    expect(store.isPip).toBe(false)
    store.setPip(true)
    expect(store.isPip).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 8. News Store
// ══════════════════════════════════════════════════════════════════════════
describe('newsStore', () => {
  let useNewsStore
  beforeEach(async () => {
    const mod = await import('../news')
    useNewsStore = mod.useNewsStore
  })

  it('initializes with 8 empty card slots', () => {
    const store = useNewsStore()
    expect(store.cards.length).toBe(8)
    expect(store.cards[0].articles).toEqual([])
    expect(store.hasFetchedOnce).toBe(false)
  })

  it('setCardFeed updates card and clears articles', () => {
    const store = useNewsStore()
    store.cards[0].articles = [{ title: 'old' }]
    store.setCardFeed(0, 'feed-1')
    expect(store.cards[0].selectedFeedId).toBe('feed-1')
    expect(store.cards[0].articles).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 9. Obsidian Store
// ══════════════════════════════════════════════════════════════════════════
describe('obsidianStore', () => {
  let useObsidianStore
  beforeEach(async () => {
    const mod = await import('../obsidian')
    useObsidianStore = mod.useObsidianStore
  })

  it('starts with empty vault state', () => {
    const store = useObsidianStore()
    expect(store.vaultPath).toBe('')
    expect(store.fileTree).toEqual([])
    expect(store.activeFile).toBeNull()
  })

  it('toggleFolder toggles expanded state', () => {
    const store = useObsidianStore()
    store.toggleFolder('/docs')
    expect(store.expandedFolders['/docs']).toBe(true)
    store.toggleFolder('/docs')
    expect(store.expandedFolders['/docs']).toBeUndefined()
  })

  it('updateContent sets dirty flag', () => {
    const store = useObsidianStore()
    store.activeFile = { path: '/test.md', name: 'test.md', content: 'old', dirty: false }
    store.updateContent('new content')
    expect(store.activeFile.content).toBe('new content')
    expect(store.activeFile.dirty).toBe(true)
  })
})
