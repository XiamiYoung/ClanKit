import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('uuid', () => ({ v4: () => 'mock-uuid-provider' }))
vi.mock('../../services/storage', () => ({
  storage: {
    getConfig: vi.fn().mockResolvedValue({}),
    saveConfig: vi.fn().mockResolvedValue(true),
  },
}))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    getEnvPaths: vi.fn().mockResolvedValue({}),
  },
})

import { useConfigStore, PROVIDER_PRESETS } from '../config'
import { storage } from '../../services/storage'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('configStore', () => {
  // ── Provider CRUD ──
  describe('provider management', () => {
    it('addProvider creates a provider with preset defaults', () => {
      const store = useConfigStore()
      const p = store.addProvider('anthropic')
      expect(p.id).toBe('mock-uuid-provider')
      expect(p.type).toBe('anthropic')
      expect(p.baseURL).toBe('https://api.anthropic.com')
      expect(p.apiKey).toBe('')
      expect(p.isActive).toBe(false)
      expect(store.config.providers).toHaveLength(1)
    })

    it('addProvider uses custom preset for unknown type', () => {
      const store = useConfigStore()
      const p = store.addProvider('custom')
      expect(p.type).toBe('custom')
      expect(p.settings.protocol).toBe('openai')
    })

    it('removeProvider removes by id', () => {
      const store = useConfigStore()
      const p = store.addProvider('openai')
      expect(store.config.providers).toHaveLength(1)
      store.removeProvider(p.id)
      expect(store.config.providers).toHaveLength(0)
    })

    it('updateProvider merges updates into existing provider', () => {
      const store = useConfigStore()
      const p = store.addProvider('deepseek')
      store.updateProvider(p.id, { apiKey: 'sk-test', isActive: true })
      const updated = store.getProvider(p.id)
      expect(updated.apiKey).toBe('sk-test')
      expect(updated.isActive).toBe(true)
      expect(updated.type).toBe('deepseek') // original preserved
    })

    it('getProvider returns undefined for non-existent id', () => {
      const store = useConfigStore()
      expect(store.getProvider('nonexistent')).toBeUndefined()
    })
  })

  // ── Computed properties ──
  describe('computed state', () => {
    it('isConfigured is false when no active provider with key', () => {
      const store = useConfigStore()
      store.addProvider('anthropic')
      expect(store.isConfigured).toBe(false)
    })

    it('isConfigured is true when active provider has key + baseURL', () => {
      const store = useConfigStore()
      const p = store.addProvider('anthropic')
      store.updateProvider(p.id, { apiKey: 'sk-test', isActive: true })
      expect(store.isConfigured).toBe(true)
    })

    it('activeProviders returns only active provider ids', () => {
      const store = useConfigStore()
      const p1 = store.addProvider('anthropic')
      const p2 = store.addProvider('openai')
      store.updateProvider(p1.id, { isActive: true })
      expect(store.activeProviders).toEqual([p1.id])
    })
  })

  // ── loadConfig ──
  describe('loadConfig', () => {
    it('merges saved config with defaults', async () => {
      storage.getConfig.mockResolvedValue({
        language: 'zh',
        providers: [{ id: 'p1', type: 'anthropic', apiKey: 'saved-key', baseURL: 'https://api.anthropic.com', settings: {} }],
      })
      const store = useConfigStore()
      await store.loadConfig()
      expect(store.config.language).toBe('zh')
      expect(store.config.providers).toHaveLength(1)
      expect(store.config.providers[0].apiKey).toBe('saved-key')
      // Defaults preserved for missing fields
      expect(store.config.sandboxConfig).toBeDefined()
      expect(store.config.sandboxConfig.dangerBlockList.length).toBeGreaterThan(0)
    })
  })

  // ── Language ──
  describe('language', () => {
    it('language getter returns config.language', () => {
      const store = useConfigStore()
      expect(store.language).toBe('en')
      store.config.language = 'zh'
      expect(store.language).toBe('zh')
    })
  })

  // ── PROVIDER_PRESETS ──
  describe('PROVIDER_PRESETS', () => {
    it('contains all expected provider types', () => {
      const types = Object.keys(PROVIDER_PRESETS)
      expect(types).toContain('anthropic')
      expect(types).toContain('openai')
      expect(types).toContain('deepseek')
      expect(types).toContain('google')
      expect(types).toContain('ollama')
    })

    it('each preset has required fields', () => {
      for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
        expect(preset.name).toBeTruthy()
        expect(preset.type).toBeTruthy()
        expect(preset.auth).toBeTruthy()
        expect(typeof preset.defaultBaseURL).toBe('string')
      }
    })
  })
})
