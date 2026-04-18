// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mock stores ─────────────────────────────────────────────────────────────

vi.mock('../../../stores/agents', () => ({
  useAgentsStore: () => ({
    agents: [],
    loadAgents: vi.fn(),
    saveAgent: vi.fn(),
  }),
}))

vi.mock('../../../stores/config', () => ({
  useConfigStore: () => ({
    config: { providers: [], language: 'en' },
    language: 'en',
  }),
}))

vi.mock('../../../stores/models', () => ({
  useModelsStore: () => ({
    models: [],
    loadModels: vi.fn(),
  }),
}))

vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))

vi.mock('../agentAvatars', () => ({
  getAvatarDataUri: vi.fn(() => ''),
  generateRandomBatch: vi.fn(() => []),
}))

vi.mock('../../../utils/edgeVoices', () => ({
  EDGE_VOICES: [],
  getDefaultVoiceForLocale: vi.fn(() => 'en-US-default'),
}))

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    pickFiles: vi.fn(),
    pickDirectory: vi.fn(),
    decryptWechat: vi.fn(),
    importWechatMessages: vi.fn(),
    sendUtilityMessage: vi.fn().mockResolvedValue({ text: '{}' }),
  },
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
})

import AgentImportWizard from '../AgentImportWizard.vue'

// ── Helpers ─────────────────────────────────────────────────────────────────

function mountWizard(propsOverrides = {}) {
  return shallowMount(AgentImportWizard, {
    props: {
      agentType: 'system',
      ...propsOverrides,
    },
    global: {
      stubs: {
        Teleport: { template: '<div><slot /></div>' },
        AppButton: { template: '<button><slot /></button>' },
        AvatarPicker: { template: '<div />' },
      },
    },
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('AgentImportWizard', () => {

  it('renders the wizard overlay', () => {
    const wrapper = mountWizard()
    expect(wrapper.find('.import-wizard-overlay').exists()).toBe(true)
    expect(wrapper.find('.import-wizard').exists()).toBe(true)
  })

  it('shows step indicator dots', () => {
    const wrapper = mountWizard()
    const dots = wrapper.findAll('.step-dot')
    expect(dots.length).toBe(4)
    // First dot should be active
    expect(dots[0].classes()).toContain('active')
  })

  it('shows source tabs in step 1', () => {
    const wrapper = mountWizard()
    const tabs = wrapper.findAll('.source-tab')
    expect(tabs.length).toBe(4) // wechat, imessage, whatsapp, text
  })

  it('renders header with title and close button', () => {
    const wrapper = mountWizard()
    expect(wrapper.find('.wizard-title').exists()).toBe(true)
    expect(wrapper.find('.wizard-close').exists()).toBe(true)
  })
})
