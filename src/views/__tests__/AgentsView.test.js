// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref, computed } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mock stores ─────────────────────────────────────────────────────────────

const mockAgents = ref([])
const mockCategories = ref([])

vi.mock('../../stores/agents', () => ({
  useAgentsStore: () => ({
    agents: mockAgents.value,
    get systemAgents() { return mockAgents.value.filter(a => a.type === 'system') },
    get userAgents() { return mockAgents.value.filter(a => a.type === 'user') },
    get systemCategories() { return mockCategories.value.filter(c => c.type === 'system') },
    get userCategories() { return mockCategories.value.filter(c => c.type === 'user') },
    agentsInCategory: vi.fn(() => []),
    getCategoryById: vi.fn(() => null),
    loadAgents: vi.fn().mockResolvedValue(),
    saveAgent: vi.fn(),
    deleteAgent: vi.fn(),
    setDefault: vi.fn(),
    unassignFromCategory: vi.fn(),
    getAgentById: vi.fn(),
    defaultSystemAgent: { id: 'sys1', name: 'System', avatar: null },
    defaultUserAgent: { id: 'usr1', name: 'User', avatar: null },
    isAgentUsedInPlans: vi.fn(() => 0),
  }),
}))

vi.mock('../../stores/tasks', () => ({
  useTasksStore: () => ({
    loadPlans: vi.fn().mockResolvedValue(),
  }),
}))

vi.mock('../../stores/config', () => ({
  useConfigStore: () => ({
    config: { providers: [], language: 'en', utilityModel: {} },
    language: 'en',
  }),
}))

vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))

vi.mock('../../components/agents/agentAvatars', () => ({
  AGENT_AVATARS: [],
  getAvatarDataUri: vi.fn(() => ''),
  generateRandomBatch: vi.fn(() => []),
}))

vi.mock('../../utils/edgeVoices', () => ({
  getDefaultVoiceForLocale: vi.fn(() => 'en-US-default'),
}))

vi.mock('../../utils/guestLimits', () => ({
  PREVIEW_LIMITS: { agents: 5 },
  isLimitEnforced: vi.fn(() => false),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    pickFiles: vi.fn(),
    saveChat: vi.fn().mockResolvedValue(true),
    pickDirectory: vi.fn(),
  },
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
})

import AgentsView from '../AgentsView.vue'

// ── Helpers ─────────────────────────────────────────────────────────────────

function mountView() {
  return shallowMount(AgentsView, {
    global: {
      stubs: {
        AgentCard: { template: '<div class="agent-card-stub" />', props: ['agent'] },
        AgentBodyViewer: { template: '<div />' },
        ConfirmModal: { template: '<div />' },
        PreviewLimitModal: { template: '<div />' },
        AppButton: { template: '<button><slot /></button>' },
        CategoryModal: { template: '<div />' },
        AgentGroupCreator: { template: '<div />' },
        AgentImportWizard: { template: '<div />' },
        Teleport: { template: '<div><slot /></div>' },
      },
    },
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  mockAgents.value = []
  mockCategories.value = []
})

describe('AgentsView', () => {

  it('renders agent cards when agents exist', () => {
    mockAgents.value = [
      { id: 'a1', name: 'Agent One', type: 'system', description: '' },
      { id: 'a2', name: 'Agent Two', type: 'system', description: '' },
    ]
    const wrapper = mountView()
    const cards = wrapper.findAll('.agent-card-stub')
    expect(cards.length).toBe(2)
  })

  it('shows categories in the nav sidebar', () => {
    mockCategories.value = [
      { id: 'cat1', name: 'Writing', type: 'system', emoji: '✍️' },
      { id: 'cat2', name: 'Coding', type: 'system', emoji: '💻' },
    ]
    const wrapper = mountView()
    const catButtons = wrapper.findAll('.nav-cat-btn')
    expect(catButtons.length).toBe(2)
  })

  it('shows empty state when no agents match', () => {
    mockAgents.value = []
    const wrapper = mountView()
    expect(wrapper.find('.section-empty').exists()).toBe(true)
  })

  it('displays the agent count badge', () => {
    mockAgents.value = [
      { id: 'a1', name: 'Agent One', type: 'system', description: '' },
    ]
    const wrapper = mountView()
    const badge = wrapper.find('.catalog-count-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1')
  })

  it('has a search input for filtering agents', () => {
    mockAgents.value = [
      { id: 'a1', name: 'Writer Bot', type: 'system', description: '' },
    ]
    const wrapper = mountView()
    const input = wrapper.find('.content-filter-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('type')).toBe('text')
  })
})
