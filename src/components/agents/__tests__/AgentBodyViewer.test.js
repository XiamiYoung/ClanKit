// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mock stores ─────────────────────────────────────────────────────────────

vi.mock('../../../stores/agents', () => ({
  useAgentsStore: () => ({
    agents: [],
    getAgentById: vi.fn(),
    loadAgents: vi.fn(),
  }),
  BUILTIN_SYSTEM_AGENT_ID: '__builtin_system__',
}))

vi.mock('../../../stores/models', () => ({
  useModelsStore: () => ({
    models: [],
    loadModels: vi.fn(),
    getModelLabel: vi.fn(() => ''),
  }),
}))

vi.mock('../../../stores/config', () => ({
  useConfigStore: () => ({
    config: { providers: [], language: 'en' },
    language: 'en',
    activeProviders: [],
    getProviderDisplayName: vi.fn(() => ''),
  }),
}))

vi.mock('../../../stores/tools', () => ({
  useToolsStore: () => ({
    tools: [],
    loadTools: vi.fn(),
  }),
}))

vi.mock('../../../stores/skills', () => ({
  useSkillsStore: () => ({
    skills: [],
    loadSkills: vi.fn(),
  }),
}))

vi.mock('../../../stores/mcp', () => ({
  useMcpStore: () => ({
    servers: [],
    loadServers: vi.fn(),
  }),
}))

vi.mock('../../../stores/knowledge', () => ({
  useKnowledgeStore: () => ({
    bases: [],
    loadBases: vi.fn(),
  }),
}))

vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))

vi.mock('../agentAvatars', () => ({
  getAvatarDataUri: vi.fn(() => ''),
  STYLES: [{ key: 'avataaars', label: 'Avataaars' }],
  generateRandomBatch: vi.fn(() => []),
}))

vi.mock('../../../utils/agentDefinitionPrompts', () => ({
  buildAgentEnhancementPrompt: vi.fn(),
  buildAgentGenerationPrompt: vi.fn(),
  detectAgentLanguage: vi.fn(() => 'en'),
  extractJsonPayload: vi.fn(),
}))

vi.mock('../../../utils/edgeVoices', () => ({
  EDGE_VOICES: [{ id: 'en-US-default', name: 'Default', locale: 'en-US' }],
  OPENAI_VOICES: [{ id: 'alloy', name: 'Alloy' }],
  getDefaultVoiceForLocale: vi.fn(() => 'en-US-default'),
}))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    loadSoul: vi.fn().mockResolvedValue(''),
    saveSoul: vi.fn().mockResolvedValue(true),
    sendUtilityMessage: vi.fn().mockResolvedValue({ text: '{}' }),
    loadMemory: vi.fn().mockResolvedValue([]),
    souls: { read: vi.fn().mockResolvedValue(''), write: vi.fn().mockResolvedValue(true) },
  },
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
})

import AgentBodyViewer from '../AgentBodyViewer.vue'

// ── Helpers ─────────────────────────────────────────────────────────────────

function mountViewer(propsOverrides = {}) {
  return shallowMount(AgentBodyViewer, {
    props: {
      agentId: 'agent-1',
      agentType: 'system',
      agentName: 'Test Agent',
      agentDescription: 'A helpful assistant',
      agentPrompt: 'You are a test agent.',
      ...propsOverrides,
    },
    global: {
      stubs: {
        Teleport: { template: '<div><slot /></div>' },
        AppButton: { template: '<button><slot /></button>' },
        ComboBox: { template: '<div />' },
        AvatarPicker: { template: '<div />' },
      },
    },
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('AgentBodyViewer', () => {

  it('renders agent name in the header', () => {
    const wrapper = mountViewer()
    const title = wrapper.find('.bv-title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toContain('Test Agent')
  })

  it('renders description field with provided text', () => {
    const wrapper = mountViewer({ agentDescription: 'My description' })
    const textarea = wrapper.find('.bv-textarea')
    expect(textarea.exists()).toBe(true)
  })

  it('shows readonly text instead of inputs when readOnly is true', () => {
    const wrapper = mountViewer({ readOnly: true })
    expect(wrapper.findAll('.bv-readonly-text').length).toBeGreaterThan(0)
    expect(wrapper.find('.bv-input').exists()).toBe(false)
  })

  it('shows capability hotspots for system agent type', () => {
    const wrapper = mountViewer({ agentType: 'system' })
    // System agents should have tool/skill/knowledge/mcp hotspots
    const hotspots = wrapper.findAll('.bv-hotspot')
    expect(hotspots.length).toBeGreaterThanOrEqual(4)
  })
})
