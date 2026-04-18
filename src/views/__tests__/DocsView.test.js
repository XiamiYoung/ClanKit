// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mocks ──
const mockObsidianStore = {
  vaultPath: '',
  fileTree: [],
  activeFile: null,
  activeContent: '',
  pickVault: vi.fn(),
  loadVault: vi.fn(),
  loadTree: vi.fn(),
  saveFile: vi.fn(),
  readFile: vi.fn(),
}

vi.mock('../../stores/obsidian', () => ({
  useObsidianStore: () => mockObsidianStore,
}))
vi.mock('../../stores/agents', () => ({
  useAgentsStore: () => ({ agents: [] }),
  BUILTIN_DOC_EDITOR_ID: 'doc-editor',
}))
vi.mock('../../stores/config', () => ({
  useConfigStore: () => ({ language: 'en', config: { providers: [] } }),
}))
vi.mock('../../stores/skills', () => ({
  useSkillsStore: () => ({ skills: [] }),
}))
vi.mock('../../stores/mcp', () => ({
  useMcpStore: () => ({ servers: [] }),
}))
vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('marked', () => {
  const Renderer = vi.fn()
  Renderer.prototype.link = vi.fn()
  const marked = vi.fn((s) => s)
  marked.use = vi.fn()
  marked.parse = vi.fn((s) => s)
  marked.Renderer = Renderer
  return { marked }
})
vi.mock('highlight.js', () => ({ default: { highlightElement: vi.fn() } }))
vi.mock('dompurify', () => ({ default: { sanitize: (s) => s } }))
vi.mock('turndown', () => {
  const T = vi.fn()
  T.prototype.use = vi.fn()
  T.prototype.turndown = vi.fn((s) => s)
  T.prototype.addRule = vi.fn()
  return { default: T }
})
vi.mock('turndown-plugin-gfm', () => ({ gfm: vi.fn() }))

vi.stubGlobal('window', {
  ...globalThis.window,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  electronAPI: {
    readFile: vi.fn(() => Promise.resolve('')),
    writeFile: vi.fn(() => Promise.resolve()),
    pickDirectory: vi.fn(() => Promise.resolve(null)),
    obsidianListFiles: vi.fn(() => Promise.resolve([])),
    obsidianReadFile: vi.fn(() => Promise.resolve('')),
    obsidianSaveFile: vi.fn(() => Promise.resolve()),
  },
})

import DocsView from '../DocsView.vue'

describe('DocsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockObsidianStore.vaultPath = ''
    mockObsidianStore.fileTree = []
  })

  it('mounts without error', () => {
    const wrapper = shallowMount(DocsView)
    expect(wrapper.exists()).toBe(true)
  })

  it('shows welcome/empty state when no vault is selected', () => {
    const wrapper = shallowMount(DocsView)
    // Should show the vault description text
    expect(wrapper.text()).toContain('notes.vaultDesc')
  })

  it('shows vault header when vault is loaded', () => {
    mockObsidianStore.vaultPath = '/some/vault'
    const wrapper = shallowMount(DocsView)
    expect(wrapper.text()).toContain('notes.title')
  })

  it('shows file tree panel when vault is loaded', () => {
    mockObsidianStore.vaultPath = '/some/vault'
    mockObsidianStore.fileTree = []
    const wrapper = shallowMount(DocsView)
    expect(wrapper.find('.doc-tree-panel').exists()).toBe(true)
  })
})
