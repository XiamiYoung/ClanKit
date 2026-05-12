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

describe('ChatHeader mode dropdown', () => {
  it('shows button without productivity class when chat.mode === "chat"', () => {
    const wrapper = mountHeader({ mode: 'chat' })
    const btn = wrapper.find('.ch-mode-dd-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).not.toContain('ch-mode-dd-btn--productivity')
    // Pill is icon-only now; the mode label moved to aria-label + tooltip so
    // screen readers and hover still surface "chat" vs "productivity".
    expect(btn.attributes('aria-label')).toMatch(/chats\.modeChat|chat|聊天/i)
  })

  it('shows productivity class when chat.mode === "productivity"', () => {
    const wrapper = mountHeader({ mode: 'productivity' })
    const btn = wrapper.find('.ch-mode-dd-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).toContain('ch-mode-dd-btn--productivity')
  })

  it('clicking button opens dropdown menu', async () => {
    const wrapper = mountHeader({ mode: 'chat' })
    expect(wrapper.find('.ch-mode-dd-menu').exists()).toBe(false)
    wrapper.find('.ch-mode-dd-btn').element.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ch-mode-dd-menu').exists()).toBe(true)
    expect(wrapper.findAll('.ch-mode-dd-item')).toHaveLength(2)
  })

  it('selecting productivity item with productivityModeNoticeShown=false opens confirm modal', async () => {
    const wrapper = mountHeader({ mode: 'chat', productivityModeNoticeShown: false })
    wrapper.find('.ch-mode-dd-btn').element.click()
    await wrapper.vm.$nextTick()
    const items = wrapper.findAll('.ch-mode-dd-item')
    items[0].element.click() // productivity is now the 1st item
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ConfirmProductivityModal' }).exists()).toBe(true)
  })

  it('selecting productivity item when noticeShown=true switches silently without modal', async () => {
    const wrapper = mountHeader({ mode: 'chat', productivityModeNoticeShown: true })
    wrapper.find('.ch-mode-dd-btn').element.click()
    await wrapper.vm.$nextTick()
    wrapper.findAll('.ch-mode-dd-item')[0].element.click()
    await wrapper.vm.$nextTick()
    expect(setModeMock).toHaveBeenCalledWith('c1', 'productivity')
    expect(wrapper.findComponent({ name: 'ConfirmProductivityModal' }).exists()).toBe(false)
  })

  it('selecting chat item from productivity mode switches without modal', async () => {
    const wrapper = mountHeader({ mode: 'productivity', productivityModeNoticeShown: true })
    wrapper.find('.ch-mode-dd-btn').element.click()
    await wrapper.vm.$nextTick()
    wrapper.findAll('.ch-mode-dd-item')[1].element.click() // chat is now the 2nd item
    await wrapper.vm.$nextTick()
    expect(setModeMock).toHaveBeenCalledWith('c1', 'chat')
    expect(wrapper.findComponent({ name: 'ConfirmProductivityModal' }).exists()).toBe(false)
  })

  it('confirm button in modal calls setMode then closes modal', async () => {
    const wrapper = mountHeader({ mode: 'chat', productivityModeNoticeShown: false })
    wrapper.find('.ch-mode-dd-btn').element.click()
    await wrapper.vm.$nextTick()
    wrapper.findAll('.ch-mode-dd-item')[0].element.click() // productivity 1st
    await wrapper.vm.$nextTick()
    const modal = wrapper.findComponent({ name: 'ConfirmProductivityModal' })
    expect(modal.exists()).toBe(true)
    await modal.vm.$emit('confirm')
    expect(setModeMock).toHaveBeenCalledWith('c1', 'productivity')
    expect(wrapper.findComponent({ name: 'ConfirmProductivityModal' }).exists()).toBe(false)
  })

  it('selecting the current mode is a no-op (no setMode call)', async () => {
    const wrapper = mountHeader({ mode: 'chat', productivityModeNoticeShown: true })
    wrapper.find('.ch-mode-dd-btn').element.click()
    await wrapper.vm.$nextTick()
    wrapper.findAll('.ch-mode-dd-item')[1].element.click() // current 'chat' is 2nd item now
    await wrapper.vm.$nextTick()
    expect(setModeMock).not.toHaveBeenCalled()
  })

  it('dropdown is shown on analysis chats so users can see the locked-in productivity default', () => {
    const wrapper = mountHeader({ type: 'analysis' })
    expect(wrapper.find('.ch-mode-dd-btn').exists()).toBe(true)
  })
})
