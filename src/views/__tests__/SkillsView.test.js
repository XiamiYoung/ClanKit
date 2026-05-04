// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mocks ──
const mockSkillsStore = {
  skills: [],
  loading: false,
  error: null,
  loadSkills: vi.fn(),
}

vi.mock('../../stores/skills', () => ({
  useSkillsStore: () => mockSkillsStore,
}))
vi.mock('../../stores/agents', () => ({
  useAgentsStore: () => ({ agents: [], loadAgents: vi.fn() }),
}))
vi.mock('../../stores/config', () => ({
  useConfigStore: () => ({ language: 'en', config: { providers: [] } }),
}))
vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('marked', () => {
  const marked = vi.fn((s) => s)
  marked.use = vi.fn()
  marked.parse = vi.fn((s) => s)
  return { marked }
})
vi.mock('dompurify', () => ({ default: { sanitize: (s) => s } }))
vi.mock('../../composables/useChatToCreate', () => ({
  useChatToCreate: () => ({ startChatGuide: vi.fn() }),
}))
vi.mock('../../utils/guestLimits', () => ({
  PREVIEW_LIMITS: {},
  isLimitEnforced: vi.fn(() => false),
}))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    getSkills: vi.fn(() => Promise.resolve([])),
    refreshSkills: vi.fn(() => Promise.resolve([])),
    deleteSkill: vi.fn(() => Promise.resolve()),
    installSkill: vi.fn(() => Promise.resolve()),
  },
})

import SkillsView from '../SkillsView.vue'

describe('SkillsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockSkillsStore.skills = []
    mockSkillsStore.loading = false
    mockSkillsStore.error = null
  })

  it('mounts without error', () => {
    const wrapper = shallowMount(SkillsView)
    expect(wrapper.exists()).toBe(true)
  })

  it('renders the page title', () => {
    const wrapper = shallowMount(SkillsView)
    expect(wrapper.text()).toContain('skills.title')
  })

  it('shows empty state when no skills exist', () => {
    const wrapper = shallowMount(SkillsView)
    // EmptyStateGuide is shallow-stubbed, but it should exist in the DOM
    expect(wrapper.text()).toContain('skills.subtitle')
  })

  it('renders tab buttons for local/tencent/clawhub', () => {
    const wrapper = shallowMount(SkillsView)
    expect(wrapper.find('.catalog-tabs').exists()).toBe(true)
    const tabs = wrapper.findAll('.catalog-tab')
    expect(tabs.length).toBe(3)
  })
})
