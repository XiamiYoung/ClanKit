// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// Base chat fixture
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
  mode: 'chat',
  productivityModeNoticeShown: false,
  type: 'chat',
}

const setModeMock = vi.fn()

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
  setMode: setModeMock,
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

function mountHeader(chatOverrides = {}) {
  Object.assign(mockChat, {
    isRunning: false,
    title: 'Test Chat',
    groupAgentIds: [],
    systemAgentId: 'sys1',
    mode: 'chat',
    productivityModeNoticeShown: false,
    type: 'chat',
  }, chatOverrides)
  return shallowMount(ChatHeader, {
    props: { chatId: 'c1' },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockChatsStore.pendingPermissionChatIds = new Set()
  setModeMock.mockClear()
})

describe('ChatHeader mode toggle switch', () => {
  it('shows track without "on" class when chat.mode === "chat"', () => {
    const wrapper = mountHeader({ mode: 'chat' })
    const sw = wrapper.find('.ch-mode-switch')
    expect(sw.exists()).toBe(true)
    expect(wrapper.find('.ch-mode-switch-track').classes()).not.toContain('on')
    expect(wrapper.find('.ch-mode-switch-label').text()).toMatch(/chat|聊天|Chat/i)
  })

  it('shows productivity style (track.on) when chat.mode === "productivity"', () => {
    const wrapper = mountHeader({ mode: 'productivity' })
    expect(wrapper.find('.ch-mode-switch').exists()).toBe(true)
    expect(wrapper.find('.ch-mode-switch-track').classes()).toContain('on')
  })

  it('clicking switch in chat mode with productivityModeNoticeShown=false opens confirm modal', async () => {
    const wrapper = mountHeader({ mode: 'chat', productivityModeNoticeShown: false })
    wrapper.find('.ch-mode-switch').element.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ConfirmProductivityModal' }).exists()).toBe(true)
  })

  it('clicking switch when noticeShown=true switches silently without modal', async () => {
    const wrapper = mountHeader({ mode: 'chat', productivityModeNoticeShown: true })
    wrapper.find('.ch-mode-switch').element.click()
    await wrapper.vm.$nextTick()
    expect(setModeMock).toHaveBeenCalledWith('c1', 'productivity')
    expect(wrapper.findComponent({ name: 'ConfirmProductivityModal' }).exists()).toBe(false)
  })

  it('clicking switch in productivity mode switches to chat without modal', async () => {
    const wrapper = mountHeader({ mode: 'productivity', productivityModeNoticeShown: true })
    wrapper.find('.ch-mode-switch').element.click()
    await wrapper.vm.$nextTick()
    expect(setModeMock).toHaveBeenCalledWith('c1', 'chat')
    expect(wrapper.findComponent({ name: 'ConfirmProductivityModal' }).exists()).toBe(false)
  })

  it('confirm button in modal calls setMode then closes modal', async () => {
    const wrapper = mountHeader({ mode: 'chat', productivityModeNoticeShown: false })
    wrapper.find('.ch-mode-switch').element.click()
    await wrapper.vm.$nextTick()
    const modal = wrapper.findComponent({ name: 'ConfirmProductivityModal' })
    expect(modal.exists()).toBe(true)
    await modal.vm.$emit('confirm')
    expect(setModeMock).toHaveBeenCalledWith('c1', 'productivity')
    // Modal should be gone
    expect(wrapper.findComponent({ name: 'ConfirmProductivityModal' }).exists()).toBe(false)
  })

  it('switch is hidden when chat.type === "analysis"', () => {
    const wrapper = mountHeader({ type: 'analysis' })
    expect(wrapper.find('.ch-mode-switch').exists()).toBe(false)
  })
})
