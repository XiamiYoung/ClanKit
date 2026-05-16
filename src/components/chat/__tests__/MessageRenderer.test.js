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
// Shared mutable mock state so individual tests can flip flags
// (e.g. aidoc-dir config + probeCache hit) without re-mocking the module.
const mockState = vi.hoisted(() => ({
  docPath: '',
  probeCache: {},
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
    get config() { return { DoCPath: mockState.docPath, language: 'en' } },
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
    get probeCache() { return mockState.probeCache },
    probeFile: vi.fn(() => Promise.resolve(true)),
  }),
}))
// Track focus-mode enterWith calls so the chip-click test can assert it.
const focusEnterWithSpy = vi.fn()
vi.mock('../../../stores/focusMode', () => ({
  useFocusModeStore: () => ({
    enterWith: focusEnterWithSpy,
    enter: vi.fn(),
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
  mockState.docPath = ''
  mockState.probeCache = {}
  focusEnterWithSpy.mockClear()
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

  // 9. Focus-mode chip — rendered next to 📝 aidoc chip when path is under
  // the aidoc dir AND obsidian probeCache confirms it's openable.
  it('renders focus-mode chip for aidoc files and dispatches enterWith on click', async () => {
    mockState.docPath = '/aidoc'
    mockState.probeCache = { '/aidoc/notes/foo.md': true }

    const wrapper = mountMsg({
      role: 'assistant',
      streaming: false,
      content: 'Saved to /aidoc/notes/foo.md',
      segments: [{ type: 'text', content: 'Saved to /aidoc/notes/foo.md' }],
    })

    // The 📑 chip's button should be in the DOM with data-action="open-in-focus".
    const focusBtn = wrapper.find('[data-action="open-in-focus"]')
    expect(focusBtn.exists()).toBe(true)
    expect(focusBtn.classes()).toContain('file-path-focus')

    // Clicking the chip should call focusMode.enterWith with the file path
    // and the active chat id (mock returns 'c1'). Native .click() is used
    // because vue-test-utils' trigger() hits a happy-dom incompatibility for
    // these dynamically-injected button elements.
    focusBtn.element.click()
    expect(focusEnterWithSpy).toHaveBeenCalledTimes(1)
    expect(focusEnterWithSpy).toHaveBeenCalledWith({
      filePath: '/aidoc/notes/foo.md',
      fileName: 'foo.md',
      chatId: 'c1',
    })
  })

  // 10. No focus-mode chip when path is NOT under aidoc dir
  it('does NOT render focus-mode chip when file path is outside aidoc dir', () => {
    mockState.docPath = '/aidoc'
    mockState.probeCache = { '/other/foo.md': true }

    const wrapper = mountMsg({
      role: 'assistant',
      streaming: false,
      content: 'See /other/foo.md',
      segments: [{ type: 'text', content: 'See /other/foo.md' }],
    })
    expect(wrapper.find('[data-action="open-in-focus"]').exists()).toBe(false)
  })

})
