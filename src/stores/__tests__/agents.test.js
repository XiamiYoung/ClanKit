import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

let uuidCounter = 0
vi.mock('uuid', () => ({ v4: () => `uuid-${++uuidCounter}` }))

vi.mock('../../services/storage', () => ({
  storage: {
    getAgents: vi.fn().mockResolvedValue([]),
    saveAgents: vi.fn().mockResolvedValue(true),
  },
}))

vi.mock('../config', () => ({
  useConfigStore: () => ({
    language: 'en',
    config: { utilityModel: {}, providers: [] },
  }),
}))
vi.mock('../tools', () => ({ useToolsStore: () => ({ tools: [] }) }))
vi.mock('../mcp', () => ({ useMcpStore: () => ({ servers: [] }) }))
vi.mock('../skills', () => ({ useSkillsStore: () => ({ allSkillObjects: [] }) }))
vi.mock('../knowledge', () => ({ useKnowledgeStore: () => ({ knowledgeBases: [] }) }))
vi.mock('../../utils/edgeVoices', () => ({ getDefaultVoiceForLocale: () => 'en-US-AriaNeural' }))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    memory: { deleteAgentData: vi.fn().mockResolvedValue(true) },
  },
})

import { useAgentsStore, BUILTIN_SYSTEM_AGENT_ID, BUILTIN_DOC_EDITOR_ID, BUILTIN_ANALYST_ID } from '../agents'
import { storage } from '../../services/storage'

// agents.json schema:
//   { agents: {categories, items}, personas: {categories, items} }
function emptyStore() {
  return {
    agents:   { categories: [], items: [] },
    personas: { categories: [], items: [] },
  }
}
function withSystem(items, categories = []) {
  return { ...emptyStore(), agents: { categories, items } }
}
function withPersonas(items, categories = []) {
  return { ...emptyStore(), personas: { categories, items } }
}

beforeEach(() => {
  setActivePinia(createPinia())
  uuidCounter = 0
  vi.clearAllMocks()
  storage.getAgents.mockResolvedValue(emptyStore())
})

describe('agentsStore', () => {
  // ── loadAgents ──
  describe('loadAgents', () => {
    it('creates builtin system, doc editor, and analyst agents when missing', async () => {
      const store = useAgentsStore()
      await store.loadAgents()
      expect(store.agents.length).toBe(3)
      const ids = store.agents.map(a => a.id)
      expect(ids).toContain(BUILTIN_SYSTEM_AGENT_ID)
      expect(ids).toContain(BUILTIN_DOC_EDITOR_ID)
      expect(ids).toContain(BUILTIN_ANALYST_ID)
      // System agent should be default
      const sys = store.getAgentById(BUILTIN_SYSTEM_AGENT_ID)
      expect(sys.isDefault).toBe(true)
      expect(sys.isBuiltin).toBe(true)
    })

    it('preserves existing agents and backfills fields', async () => {
      storage.getAgents.mockResolvedValue(withSystem([
        { id: 'custom-1', name: 'Custom', type: 'system' },
        { id: BUILTIN_SYSTEM_AGENT_ID, name: 'Old Clank', type: 'system', providerId: 'my-provider' },
      ]))
      const store = useAgentsStore()
      await store.loadAgents()
      // Custom agent preserved
      const custom = store.getAgentById('custom-1')
      expect(custom).not.toBeNull()
      expect(custom.requiredToolIds).toEqual([])
      expect(custom.categoryIds).toEqual([])
      expect(custom.voiceId).toBe('en-US-AriaNeural')
      // Builtin system agent merged, preserves providerId
      const sys = store.getAgentById(BUILTIN_SYSTEM_AGENT_ID)
      expect(sys.providerId).toBe('my-provider')
      expect(sys.isBuiltin).toBe(true)
    })

    it('routes system agents and user personas into separate sections', async () => {
      storage.getAgents.mockResolvedValue({
        agents:   { categories: [{ id: 'cat1', name: 'Test', emoji: '', type: 'system' }], items: [] },
        personas: { categories: [], items: [{ id: 'a1', name: 'Agent', type: 'user', isDefault: true }] },
      })
      const store = useAgentsStore()
      await store.loadAgents()
      expect(store.categories.length).toBe(1)
      expect(store.categories[0].name).toBe('Test')
      // user agent + 3 builtins
      expect(store.agents.length).toBe(4)
    })
  })

  // ── saveAgent ──
  describe('saveAgent', () => {
    it('updates existing agent by id', async () => {
      const store = useAgentsStore()
      await store.loadAgents()
      const sys = store.getAgentById(BUILTIN_SYSTEM_AGENT_ID)
      const oldName = sys.name
      await store.saveAgent({ ...sys, name: 'Renamed' })
      expect(store.getAgentById(BUILTIN_SYSTEM_AGENT_ID).name).toBe('Renamed')
      expect(storage.saveAgents).toHaveBeenCalled()
    })

    it('creates new agent with generated id', async () => {
      const store = useAgentsStore()
      await store.loadAgents()
      const before = store.agents.length
      await store.saveAgent({ name: 'New Agent', type: 'user' })
      expect(store.agents.length).toBe(before + 1)
      const newAgent = store.agents.find(a => a.name === 'New Agent')
      expect(newAgent.id).toBe('uuid-1')
      expect(newAgent.isBuiltin).toBe(false)
      // First user agent auto-defaults
      expect(newAgent.isDefault).toBe(true)
    })
  })

  // ── deleteAgent ──
  describe('deleteAgent', () => {
    it('removes non-builtin agent', async () => {
      storage.getAgents.mockResolvedValue(withPersonas([
        { id: 'user-1', name: 'User Agent', type: 'user' },
      ]))
      const store = useAgentsStore()
      await store.loadAgents()
      const before = store.agents.length
      await store.deleteAgent('user-1')
      expect(store.agents.length).toBe(before - 1)
      expect(store.getAgentById('user-1')).toBeNull()
    })

    it('blocks deletion of builtin agents', async () => {
      const store = useAgentsStore()
      await store.loadAgents()
      const before = store.agents.length
      await store.deleteAgent(BUILTIN_SYSTEM_AGENT_ID)
      expect(store.agents.length).toBe(before)
    })
  })

  // ── setDefault ──
  describe('setDefault', () => {
    it('clears previous default of same type and sets new', async () => {
      storage.getAgents.mockResolvedValue(withPersonas([
        { id: 'u1', name: 'A', type: 'user', isDefault: true },
        { id: 'u2', name: 'B', type: 'user', isDefault: false },
      ]))
      const store = useAgentsStore()
      await store.loadAgents()
      await store.setDefault('u2')
      expect(store.getAgentById('u1').isDefault).toBe(false)
      expect(store.getAgentById('u2').isDefault).toBe(true)
      // System agents should not be affected
      const sys = store.getAgentById(BUILTIN_SYSTEM_AGENT_ID)
      expect(sys.isDefault).toBe(true)
    })
  })

  // ── getAgentById ──
  describe('getAgentById', () => {
    it('returns agent or null', async () => {
      const store = useAgentsStore()
      await store.loadAgents()
      expect(store.getAgentById(BUILTIN_SYSTEM_AGENT_ID)).not.toBeNull()
      expect(store.getAgentById('nonexistent')).toBeNull()
    })
  })

  // ── Category CRUD ──
  describe('addCategory / deleteCategory', () => {
    it('adds a category', async () => {
      const store = useAgentsStore()
      await store.loadAgents()
      const id = await store.addCategory('Dev', '🔧', 'system')
      expect(id).toBe('uuid-1')
      expect(store.categories.length).toBe(1)
      expect(store.categories[0].name).toBe('Dev')
    })

    it('deleteCategory blocks when agents assigned', async () => {
      storage.getAgents.mockResolvedValue(withSystem(
        [{ id: 'a1', name: 'A', type: 'system', categoryIds: ['cat1'] }],
        [{ id: 'cat1', name: 'C', emoji: '', type: 'system' }]
      ))
      const store = useAgentsStore()
      await store.loadAgents()
      const result = await store.deleteCategory('cat1')
      expect(result).toBe(false)
      expect(store.categories.length).toBe(1)
    })

    it('deleteCategory succeeds when no agents assigned', async () => {
      const store = useAgentsStore()
      await store.loadAgents()
      const id = await store.addCategory('Empty', '', 'system')
      const result = await store.deleteCategory(id)
      expect(result).toBe(true)
      expect(store.categories.length).toBe(0)
    })
  })

  // ── Computed: systemAgents / userAgents ──
  describe('computed filters', () => {
    it('systemAgents and userAgents filter by type', async () => {
      storage.getAgents.mockResolvedValue(withPersonas([
        { id: 'u1', name: 'U', type: 'user', isDefault: true, createdAt: 1 },
      ]))
      const store = useAgentsStore()
      await store.loadAgents()
      // 3 builtins are system type
      expect(store.systemAgents.length).toBe(3)
      expect(store.userAgents.length).toBe(1)
    })

    it('defaultSystemAgent / defaultUserAgent return correct agents', async () => {
      storage.getAgents.mockResolvedValue(withPersonas([
        { id: 'u1', name: 'U', type: 'user', isDefault: true },
      ]))
      const store = useAgentsStore()
      await store.loadAgents()
      expect(store.defaultSystemAgent.id).toBe(BUILTIN_SYSTEM_AGENT_ID)
      expect(store.defaultUserAgent.id).toBe('u1')
    })
  })
})
