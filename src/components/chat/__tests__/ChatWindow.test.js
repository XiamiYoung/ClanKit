// @vitest-environment happy-dom
/**
 * ChatWindow Component Tests
 *
 * Layer 2: verifies that given a chat with specific messages, the correct
 * message rows are rendered with proper layout classes and structure.
 * Uses shallowMount to auto-stub MessageRenderer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Module mocks (before imports) ──────────────────────────────────────────

const mockChat = {
  id: 'c1',
  messages: [],
  isRunning: false,
  isThinking: false,
  groupAgentIds: [],
  systemAgentId: null,
  userAgentId: null,
}

vi.mock('../../../stores/chats', () => ({
  useChatsStore: () => ({
    activeChatId: 'c1',
    chats: [mockChat],
    hasOlderSegments: vi.fn(() => false),
    loadOlderSegments: vi.fn(),
    ensureMessages: vi.fn(),
    scrollToBottomSignal: ref(0),
  }),
}))
vi.mock('../../../stores/agents', () => ({
  useAgentsStore: () => ({
    agents: [],
    defaultSystemAgent: { id: 'sys1', name: 'Assistant', avatar: null },
    defaultUserAgent: { id: 'usr1', name: 'User', avatar: null },
    getAgentById: vi.fn(() => ({ id: 'sys1', name: 'Assistant', avatar: null })),
  }),
}))
vi.mock('../../../stores/config', () => ({
  useConfigStore: () => ({
    language: 'en',
  }),
}))
vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('../../agents/agentAvatars', () => ({
  getAvatarDataUri: vi.fn(() => ''),
}))

// Stub window.electronAPI and DOM observers
vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    pickFiles: vi.fn(),
    saveChat: vi.fn().mockResolvedValue(true),
  },
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
})

import ChatWindow from '../ChatWindow.vue'

// ── Helpers ────────────────────────────────────────────────────────────────

function mountWindow(messages = [], extraProps = {}) {
  mockChat.messages = messages
  return shallowMount(ChatWindow, {
    props: { chatId: 'c1', ...extraProps },
    global: {
      stubs: {
        MessageRenderer: { template: '<div class="msg-renderer-stub" />', props: ['message'] },
      },
    },
  })
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  mockChat.messages = []
  mockChat.modeTransitions = []
  mockChat.isRunning = false
  mockChat.groupAgentIds = []
  mockChat.systemAgentId = null
  mockChat.userAgentId = null
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ChatWindow', () => {

  // 1. Waiting indicator — centered with wave animation
  it('renders waiting indicator as centered row with wavebar', () => {
    const wrapper = mountWindow([
      { id: 'w1', isWaitingIndicator: true, waitingState: 'running', role: 'assistant', content: '', streaming: true },
    ])
    expect(wrapper.find('.cw-pre-response-row').exists()).toBe(true)
    expect(wrapper.find('.cw-pre-response-wave').exists()).toBe(true)
    // Should be centered (justify-center class on parent)
    const row = wrapper.find('.justify-center')
    expect(row.exists()).toBe(true)
  })

  // 2. System banner — centered with system-banner class
  it('renders system message as centered banner', () => {
    const wrapper = mountWindow([
      { id: 's1', role: 'system', content: 'Context compacted' },
    ])
    expect(wrapper.find('.cw-system-banner').exists()).toBe(true)
    expect(wrapper.find('.justify-center').exists()).toBe(true)
  })

  // 3. Assistant bubble — left-aligned
  it('renders assistant message left-aligned with avatar column', () => {
    const wrapper = mountWindow([
      { id: 'm1', role: 'assistant', content: 'Hello!', streaming: false },
    ])
    expect(wrapper.find('.justify-start').exists()).toBe(true)
    expect(wrapper.find('.cw-msg-avatar-col').exists()).toBe(true)
  })

  // 4. User bubble — right-aligned
  it('renders user message right-aligned', () => {
    const wrapper = mountWindow([
      { id: 'm1', role: 'user', content: 'Hi there' },
    ])
    expect(wrapper.find('.justify-end').exists()).toBe(true)
  })

  // 5. Hidden messages not rendered
  it('filters out hidden messages', () => {
    const wrapper = mountWindow([
      { id: 'h1', role: 'user', content: 'Hidden', hidden: true },
      { id: 'v1', role: 'user', content: 'Visible' },
    ])
    // Only one message row rendered (the visible one)
    const msgRows = wrapper.findAll('.cw-animate-fade-in')
    expect(msgRows.length).toBe(1)
  })

  // 6. Error bubble styling
  it('applies error styling to error assistant messages', () => {
    const wrapper = mountWindow([
      { id: 'e1', role: 'assistant', content: 'Error occurred', isError: true, streaming: false },
    ])
    expect(wrapper.find('.cw-msg-bubble-error').exists()).toBe(true)
  })

  // 7. Mode-transition dividers
  describe('mode transition divider', () => {
    it('renders divider after the message specified by afterMessageId', () => {
      mockChat.modeTransitions = [{ from: 'chat', to: 'productivity', at: Date.now(), afterMessageId: 'm1' }]
      const wrapper = mountWindow([
        { id: 'm1', role: 'user', content: 'hi' },
        { id: 'm2', role: 'assistant', content: 'hello', streaming: false },
      ])
      expect(wrapper.findAll('.cw-mode-divider').length).toBe(1)
    })

    it('renders multiple dividers for multiple transitions', () => {
      mockChat.modeTransitions = [
        { from: 'chat', to: 'productivity', at: 100, afterMessageId: 'm1' },
        { from: 'productivity', to: 'chat', at: 200, afterMessageId: 'm2' },
      ]
      const wrapper = mountWindow([
        { id: 'm1', role: 'user', content: 'a' },
        { id: 'm2', role: 'assistant', content: 'b', streaming: false },
        { id: 'm3', role: 'user', content: 'c' },
      ])
      expect(wrapper.findAll('.cw-mode-divider').length).toBe(2)
    })

    it('renders no divider when modeTransitions is empty', () => {
      mockChat.modeTransitions = []
      const wrapper = mountWindow([
        { id: 'm1', role: 'user', content: 'hi' },
      ])
      expect(wrapper.findAll('.cw-mode-divider').length).toBe(0)
    })
  })
})
