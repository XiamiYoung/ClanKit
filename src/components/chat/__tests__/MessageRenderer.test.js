// @vitest-environment happy-dom
/**
 * MessageRenderer Component Tests
 *
 * Layer 2 of the chat testing infrastructure: verifies that given a specific
 * message shape, the correct DOM structure is rendered. Uses shallowMount
 * to stub child components (BabylonViewer, PermissionPrompt, PlanCard).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Module mocks (before imports) ──────────────────────────────────────────

vi.mock('marked', () => ({
  marked: {
    parse: (text) => `<p>${text}</p>`,
    setOptions: vi.fn(),
    use: vi.fn(),
  },
}))
vi.mock('dompurify', () => ({
  default: { sanitize: (html) => html },
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('../../../stores/chats', () => ({
  useChatsStore: () => ({
    activeChatId: 'c1',
    chats: [],
    clearPermissionPending: vi.fn(),
    persist: vi.fn(),
  }),
}))
vi.mock('../../../stores/config', () => ({
  useConfigStore: () => ({
    language: 'en',
    DoCPath: '',
  }),
}))
vi.mock('../../../stores/agents', () => ({
  useAgentsStore: () => ({
    agents: [],
    defaultSystemAgent: null,
    getAgentById: vi.fn(() => null),
  }),
}))
vi.mock('../../../stores/obsidian', () => ({
  useObsidianStore: () => ({
    openFile: vi.fn(),
    probeCache: {},
    probeFile: vi.fn(() => Promise.resolve(true)),
  }),
}))
vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))

// Stub window.electronAPI
vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    openImageDataUri: vi.fn(),
    openFile: vi.fn(),
    showInFolder: vi.fn(),
    saveChat: vi.fn().mockResolvedValue(true),
    permissionResponse: vi.fn().mockResolvedValue({}),
  },
})

import MessageRenderer from '../MessageRenderer.vue'

// ── Helpers ────────────────────────────────────────────────────────────────

function mountMsg(message, extraProps = {}) {
  return shallowMount(MessageRenderer, {
    props: { message, ...extraProps },
  })
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MessageRenderer', () => {

  // 1. Streaming with empty content — wavebar should show
  it('shows wavebar when streaming with empty content', () => {
    const wrapper = mountMsg({
      role: 'assistant',
      streaming: true,
      streamingStartedAt: Date.now(),
      content: '',
      segments: [],
    })
    expect(wrapper.findAll('.wave-bar').length).toBeGreaterThan(0)
  })

  // 2. Streaming with text content — wavebar + text
  it('shows wavebar and text when streaming with content', () => {
    const wrapper = mountMsg({
      role: 'assistant',
      streaming: true,
      streamingStartedAt: Date.now(),
      content: 'Hello world',
      segments: [{ type: 'text', content: 'Hello world' }],
    })
    expect(wrapper.findAll('.wave-bar').length).toBeGreaterThan(0)
    expect(wrapper.find('.prose-clankit').exists()).toBe(true)
  })

  // 3. Completed message — no wavebar, duration shown
  it('shows duration and no wavebar when completed', () => {
    const wrapper = mountMsg({
      role: 'assistant',
      streaming: false,
      durationMs: 2500,
      content: 'Done!',
      segments: [{ type: 'text', content: 'Done!' }],
    })
    expect(wrapper.findAll('.wave-bar').length).toBe(0)
    // Duration label should contain the i18n key
    expect(wrapper.text()).toContain('chats.cookedFor')
  })

  // 4. Tool segments — collapsible header shows segment count
  it('shows execution steps header with badge count for tool segments', () => {
    const wrapper = mountMsg({
      role: 'assistant',
      streaming: false,
      content: '',
      segments: [
        { type: 'tool', name: 'execute_shell', input: { command: 'ls' }, output: 'file.txt' },
      ],
    })
    // The collapsible "Execution steps" header should show with badge "1"
    expect(wrapper.find('.steps-header').exists()).toBe(true)
    expect(wrapper.find('.steps-badge').text()).toBe('1')
  })

  // 5. Permission pending — wavebar hidden (hasPendingPermission)
  it('hides wavebar when a permission segment is pending', () => {
    const wrapper = mountMsg({
      role: 'assistant',
      streaming: true,
      streamingStartedAt: Date.now(),
      content: '',
      segments: [
        { type: 'permission', blockId: 'b1', toolName: 'execute_shell', status: 'pending', input: {} },
      ],
    })
    // Wavebar should be hidden (hasPendingPermission = true)
    expect(wrapper.findAll('.wave-bar').length).toBe(0)
    // The steps header should show (permission counts as a process segment)
    expect(wrapper.find('.steps-header').exists()).toBe(true)
  })

  // 6. Error state — error content rendered, no wavebar
  it('renders error content without wavebar', () => {
    const wrapper = mountMsg({
      role: 'assistant',
      streaming: false,
      isError: true,
      content: 'Error: Provider rate limit exceeded',
      segments: [{ type: 'text', content: 'Error: Provider rate limit exceeded' }],
    })
    expect(wrapper.findAll('.wave-bar').length).toBe(0)
    expect(wrapper.text()).toContain('Error: Provider rate limit exceeded')
  })

  // 7. User message — user-content div rendered
  it('renders user message content', () => {
    const wrapper = mountMsg({
      role: 'user',
      content: 'Hello from user',
    })
    expect(wrapper.find('.user-content').exists()).toBe(true)
    expect(wrapper.html()).toContain('Hello from user')
  })

  // 8. User message with image attachments
  it('renders image attachments for user messages', () => {
    const wrapper = mountMsg({
      role: 'user',
      content: 'Look at this',
      attachments: [
        { type: 'image', preview: 'data:image/png;base64,ABC', name: 'test.png', id: 'img1' },
      ],
    })
    const images = wrapper.findAll('img')
    expect(images.length).toBeGreaterThan(0)
  })

})
