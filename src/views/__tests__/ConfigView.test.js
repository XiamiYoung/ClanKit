// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mocks ──
vi.mock('../../stores/config', () => ({
  useConfigStore: () => ({
    language: 'en',
    config: {
      language: 'en',
      dataPath: '/mock/data/path',
      providers: [{ id: 'p1', name: 'OpenAI', type: 'openai', apiKey: 'sk-xxx', baseURL: 'https://api.example.com' }],
      defaultProvider: 'p1',
      defaultModel: 'gpt-4',
    },
    loadConfig: vi.fn(),
    saveConfig: vi.fn(),
  }),
}))
vi.mock('../../stores/models', () => ({
  useModelsStore: () => ({
    models: [],
    fetchModels: vi.fn(),
  }),
}))
vi.mock('../../stores/knowledge', () => ({
  useKnowledgeStore: () => ({
    knowledgeBases: [],
    ragEnabled: false,
    modelReady: false,
    modelChecking: false,
    checkModel: vi.fn(),
  }),
}))
vi.mock('../../stores/obsidian', () => ({
  useObsidianStore: () => ({
    vaultPath: '',
  }),
}))
vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
}))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    getConfig: vi.fn(() => Promise.resolve({})),
    saveConfig: vi.fn(() => Promise.resolve()),
    selectDirectory: vi.fn(() => Promise.resolve(null)),
    testProvider: vi.fn(() => Promise.resolve({ ok: true })),
    getDataPath: vi.fn(() => Promise.resolve('/mock/data')),
    onDeepLink: vi.fn(),
    removeDeepLinkListener: vi.fn(),
  },
})

import ConfigView from '../ConfigView.vue'

describe('ConfigView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts without error', () => {
    const wrapper = shallowMount(ConfigView)
    expect(wrapper.exists()).toBe(true)
  })

  it('renders the page title', () => {
    const wrapper = shallowMount(ConfigView)
    expect(wrapper.text()).toContain('config.title')
  })

  it('renders primary tab navigation', () => {
    const wrapper = shallowMount(ConfigView)
    expect(wrapper.find('.config-primary-tabs').exists()).toBe(true)
  })

  it('renders config body with subnav and content areas', () => {
    const wrapper = shallowMount(ConfigView)
    expect(wrapper.find('.config-body').exists()).toBe(true)
    expect(wrapper.find('.config-subnav').exists()).toBe(true)
    expect(wrapper.find('.config-content').exists()).toBe(true)
  })
})
