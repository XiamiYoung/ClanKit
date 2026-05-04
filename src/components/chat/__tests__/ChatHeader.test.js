// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const mockChat = {
  id: 'c1',
  title: 'Test Chat',
  isRunning: false,
  groupAgentIds: [],
  systemAgentId: 'sys1',
  userAgentId: null,
  workingPath: '',
  maxAgentRounds: 10,
  isGroupChat: false,
}

const mockChatsStore = {
  chats: [mockChat],
  pendingPermissionChatIds: new Set(),
  renameChat: vi.fn(),
  setChatAgent: vi.fn(),
  getChatFolderPath: vi.fn(() => ''),
  addGroupAgent: vi.fn(),
  removeGroupAgent: vi.fn(),
  toggleGroupMode: vi.fn(),
  setChatSettings: vi.fn(),
}

vi.mock('../../../stores/chats', () => ({
  useChatsStore: () => mockChatsStore,
}))
vi.mock('../../../stores/agents', () => ({
  useAgentsStore: () => ({
    agents: [],
    systemAgents: [],
    userAgents: [],
    systemCategories: [],
    userCategories: [],
    defaultSystemAgent: { id: 'sys1', name: 'Assistant', avatar: null },
    defaultUserAgent: { id: 'usr1', name: 'User', avatar: null },
    getAgentById: vi.fn((id) => {
      if (id === 'sys1') return { id: 'sys1', name: 'Assistant', avatar: null, description: '' }
      if (id === 'usr1') return { id: 'usr1', name: 'User', avatar: null }
      return null
    }),
    isAgentDeleted: vi.fn((id) => !!id && id !== 'sys1' && id !== 'usr1'),
    agentsInCategory: vi.fn(() => []),
  }),
}))
vi.mock('../../../stores/config', () => ({
  useConfigStore: () => ({
    language: 'en',
    config: { providers: [], artifactPath: '/tmp', dataPath: '/data', voiceCall: {} },
  }),
}))
vi.mock('../../../stores/models', () => ({
  useModelsStore: () => ({}),
}))
vi.mock('../../../stores/tools', () => ({
  useToolsStore: () => ({ tools: [] }),
}))
vi.mock('../../../stores/mcp', () => ({
  useMcpStore: () => ({ servers: [], runningStatus: {} }),
}))
vi.mock('../../../stores/knowledge', () => ({
  useKnowledgeStore: () => ({ kbConfigs: {} }),
}))
vi.mock('../../../stores/voice', () => ({
  useVoiceStore: () => ({ isCallActive: false }),
}))
vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('../../agents/agentAvatars', () => ({
  getAvatarDataUri: vi.fn(() => ''),
}))
vi.mock('../../../utils/tokenEstimate', () => ({
  estimateToolTokens: vi.fn(() => 0),
  estimateMcpTokens: vi.fn(() => 0),
  formatTokens: vi.fn(() => '0'),
}))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {},
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  innerWidth: 1024,
  innerHeight: 768,
})

import ChatHeader from '../ChatHeader.vue'

function mountHeader(overrides = {}) {
  Object.assign(mockChat, { isRunning: false, title: 'Test Chat', groupAgentIds: [], systemAgentId: 'sys1' }, overrides)
  return shallowMount(ChatHeader, {
    props: { chatId: 'c1' },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockChatsStore.pendingPermissionChatIds = new Set()
})

describe('ChatHeader', () => {
  it('renders the chat title', () => {
    const wrapper = mountHeader({ title: 'My Chat Title' })
    expect(wrapper.find('.chat-header-title').text()).toBe('My Chat Title')
  })

  it('does NOT show a running status badge (running state is conveyed via the title spinner)', () => {
    const wrapper = mountHeader({ isRunning: true })
    expect(wrapper.find('.ch-status-badge--running').exists()).toBe(false)
  })

  it('still does not show running badge when chat is not running', () => {
    const wrapper = mountHeader({ isRunning: false })
    expect(wrapper.find('.ch-status-badge--running').exists()).toBe(false)
  })

  it('shows spinner in title badge when running', () => {
    const wrapper = mountHeader({ isRunning: true })
    expect(wrapper.find('.ch-title-spinner').exists()).toBe(true)
  })

  it('emits open-chat-settings when settings button is clicked', () => {
    const wrapper = mountHeader()
    wrapper.find('.chat-config-btn').element.click()
    expect(wrapper.emitted('open-chat-settings')).toBeTruthy()
  })
})
