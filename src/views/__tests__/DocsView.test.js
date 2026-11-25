// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Mocks ──
const mockObsidianStore = {
  vaultPath: '',
  fileTree: [],
  treeStatus: 'ready',
  activeFile: null,
  activeContent: '',
  probeCache: {},
  probeReasons: {},
  failedPaths: {},
  expandedFolders: {},
  pickVault: vi.fn(),
  loadVault: vi.fn(),
  loadTree: vi.fn(),
  saveFile: vi.fn(),
  renameItem: vi.fn(),
  readFile: vi.fn(),
  openFile: vi.fn(),
  restoreLastOpenedDoc: vi.fn(),
  resetFailureCache: vi.fn(),
  probeFile: vi.fn(() => Promise.resolve(true)),
  toggleFolder: vi.fn(),
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
// Spy on focusModeStore.enterWith so we can assert the header button wires up
// to the shared "enter focus mode with preselection" helper.
const focusEnterWithSpy = vi.fn()
vi.mock('../../stores/focusMode', () => ({
  useFocusModeStore: () => ({
    isFocusMode: false,
    showDocs: true,
    showChat: true,
    docHamburgerY: null,
    enterWith: focusEnterWithSpy,
    enter: vi.fn(),
    exit: vi.fn(),
  }),
}))
vi.mock('../../stores/chats', () => ({
  useChatsStore: () => ({
    activeChatId: 'chat-xyz',
    chats: [],
  }),
}))
vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('marked', async (importOriginal) => {
  const actual = await importOriginal()
  const Renderer = vi.fn()
  Renderer.prototype.link = vi.fn()
  const marked = vi.fn((s) => s)
  marked.use = vi.fn()
  marked.parse = vi.fn((s) => s)
  marked.Renderer = Renderer
  return { ...actual, marked }
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
  Event: globalThis.Event,
  InputEvent: globalThis.InputEvent,
  KeyboardEvent: globalThis.KeyboardEvent,
  MouseEvent: globalThis.MouseEvent,
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
import { useAiDocStore } from '../../stores/aidoc'

const sourceTreeRoot = 'C:\\Vault'
const sourceTreeDir = sourceTreeRoot + '\\kb_source'
const sourceTreeFiles = [
  { path: sourceTreeDir + '\\draft.md', name: 'draft.md', type: 'file' },
  { path: sourceTreeDir + '\\revised.md', name: 'revised.md', type: 'file' },
  { path: sourceTreeDir + '\\done.md', name: 'done.md', type: 'file' },
  { path: sourceTreeDir + '\\image.svg', name: 'image.svg', type: 'file' },
  { path: sourceTreeRoot + '\\general\\extra.md', name: 'extra.md', type: 'file' },
]

function mountSourceTree() {
  mockObsidianStore.vaultPath = sourceTreeRoot
  mockObsidianStore.fileTree = [
    { path: sourceTreeDir, name: 'kb_source', type: 'dir', children: sourceTreeFiles.slice(0, 4) },
    sourceTreeFiles[4],
  ]
  mockObsidianStore.expandedFolders = { [sourceTreeDir]: true }
  window.electronAPI.aidoc = {
    getSourceStates: vi.fn(async () => ({
      success: true,
      states: Object.fromEntries(['new', 'updated', 'ingested'].map((state, index) => [sourceTreeFiles[index].path, state])),
    })),
  }
  return shallowMount(DocsView, {
    global: {
      stubs: { Teleport: true, TreeNode: false, SourceStateDot: false },
      directives: { tooltip: {} },
    },
  })
}

describe('DocsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockObsidianStore.vaultPath = ''
    mockObsidianStore.configStatus = 'ready'
    mockObsidianStore.fileTree = []
    mockObsidianStore.treeStatus = 'ready'
    mockObsidianStore.expandedFolders = {}
    mockObsidianStore.activeFile = null
    focusEnterWithSpy.mockClear()
    mockObsidianStore.openFile.mockClear()
    mockObsidianStore.renameItem.mockReset().mockResolvedValue({ success: true })
    delete window.electronAPI.aidoc
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

  it('shows a loading message while the workspace config is still pending', () => {
    mockObsidianStore.configStatus = 'loading'
    const wrapper = shallowMount(DocsView)
    expect(wrapper.get('docs-loading-overlay-stub').attributes('label')).toBe('notes.loadingVault')
    expect(wrapper.text()).not.toContain('notes.vaultDesc')
    wrapper.unmount()
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

  it.each([
    ['loading', 'notes.loadingTree'],
    ['error', 'notes.treeLoadFailed'],
    ['ready', 'notes.noFilesFound'],
  ])('shows the correct tree message when the tree status is %s', (status, message) => {
    mockObsidianStore.vaultPath = '/some/vault'
    mockObsidianStore.treeStatus = status
    const wrapper = shallowMount(DocsView)
    const panel = wrapper.get('.doc-tree-panel')
    if (status === 'loading') {
      expect(panel.get('[role="status"] docs-loading-overlay-stub').attributes('label')).toBe(message)
    } else {
      expect(panel.text()).toContain(message)
    }
    expect(panel.text().includes('notes.noFilesFound')).toBe(status === 'ready')
    wrapper.unmount()
  })

  it('shows source status on new and updated files in the tree and search results', async () => {
    const wrapper = mountSourceTree()
    await flushPromises()
    expect(window.electronAPI.aidoc.getSourceStates).toHaveBeenCalledWith({ root: sourceTreeRoot })
    expect(wrapper.findAll('.aidoc-source-state').map(dot => dot.attributes('title'))).toEqual([
      'aidoc.stateNew',
      'aidoc.stateUpdated',
    ])
    await wrapper.get('input.doc-filter-input').setValue('draft')
    expect(wrapper.get('.doc-search-item .aidoc-source-state').attributes('title')).toBe('aidoc.stateNew')
    wrapper.unmount()
  })

  it('shows fixed sections and moves documents across the index boundary', async () => {
    const wrapper = mountSourceTree()
    await flushPromises()
    const sidebar = wrapper.get('.doc-tree-panel')
    expect(sidebar.findAll('.doc-section-heading').map(heading => heading.get('strong').text())).toEqual([
      'aidoc.myFiles', 'aidoc.knowledgeSources', 'aidoc.knowledgePages',
    ])
    expect(sidebar.text()).not.toContain('kb_source')

    const sourceSection = sidebar.get('[data-testid="doc-section-kb_source"]')
    const transfer = {
      types: ['application/x-node-type', 'text/plain'],
      files: [],
      getData: () => sourceTreeFiles[4].path,
    }
    await sourceSection.trigger('dragover', { dataTransfer: transfer })
    expect(sourceSection.text()).toContain('aidoc.dropIntoScope')
    await sourceSection.trigger('drop', { dataTransfer: transfer })
    await flushPromises()
    expect(mockObsidianStore.renameItem).toHaveBeenCalledWith(sourceTreeFiles[4].path, 'C:/Vault/kb_source/extra.md')
    expect(sidebar.get('[role="status"]').text()).toBe('aidoc.movedIntoScope')

    await sidebar.get('[data-testid="doc-section-general"]').trigger('drop', {
      dataTransfer: { ...transfer, getData: () => sourceTreeFiles[0].path },
    })
    await flushPromises()
    expect(mockObsidianStore.renameItem).toHaveBeenLastCalledWith(sourceTreeFiles[0].path, 'C:/Vault/general/draft.md')
    expect(sidebar.get('[role="status"]').text()).toBe('aidoc.movedOutOfScope')
    wrapper.unmount()
  })

  it('renders knowledge pages read-only and rejects drops into the knowledge pages section', async () => {
    const root = '/some/vault'
    const page = { path: root + '/wiki/Page.md', name: 'Page.md', type: 'file', content: '# Page' }
    mockObsidianStore.vaultPath = root
    mockObsidianStore.fileTree = [{ path: root + '/wiki', name: 'wiki', type: 'dir', children: [page] }]
    mockObsidianStore.activeFile = page
    const wrapper = shallowMount(DocsView, {
      global: { stubs: { TreeNode: false, Teleport: true }, directives: { tooltip: {} } },
    })
    expect(wrapper.get('.prose-obsidian').attributes('contenteditable')).toBe('false')
    expect(wrapper.find('.docs-mode-switch').exists()).toBe(false)
    expect(wrapper.find('[class="doc-readonly-label"]').text()).toBe('aidoc.wikiReadonly')
    const section = wrapper.get('[data-testid="doc-section-wiki"]')
    const row = section.get('.cursor-pointer')
    expect(row.attributes('draggable')).toBeUndefined()
    await row.trigger('contextmenu')
    expect(wrapper.get('.notes-ctx-menu').text()).toBe('notes.copyPath')
    await section.trigger('drop', {
      dataTransfer: { types: ['application/x-node-type'], files: [], getData: () => root + '/general/Note.md' },
    })
    expect(mockObsidianStore.renameItem).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('offers organizing only for supported sources and scopes the action to the selected file', async () => {
    const ingestSingle = vi.spyOn(useAiDocStore(), 'ingestSingle').mockResolvedValue()
    const wrapper = mountSourceTree()
    await flushPromises()
    const rightClick = async name => {
      const row = wrapper.findAll('.doc-tree-panel .cursor-pointer').find(row => row.text() === name)
      row.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
      await wrapper.vm.$nextTick()
    }

    await rightClick('draft.md')
    const organize = wrapper.get('[data-testid="aidoc-file-ingest"]')
    expect(organize.text()).toBe('aidoc.ingestFile')
    organize.element.click()
    await wrapper.vm.$nextTick()
    expect(ingestSingle).toHaveBeenCalledWith('kb_source/draft.md')
    await rightClick('done.md')
    expect(wrapper.get('[data-testid="aidoc-file-ingest"]').text()).toBe('aidoc.reingestFile')
    await rightClick('image.svg')
    expect(wrapper.find('[data-testid="aidoc-file-ingest"]').exists()).toBe(false)
    await rightClick('extra.md')
    expect(wrapper.find('[data-testid="aidoc-file-ingest"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides the organize action while a sync or ingest is in progress', async () => {
    const aidoc = useAiDocStore()
    const wrapper = mountSourceTree()
    await flushPromises()
    aidoc.syncPreparing = true
    const row = wrapper.findAll('.doc-tree-panel .cursor-pointer').find(r => r.text() === 'draft.md')
    row.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="aidoc-file-ingest"]').exists()).toBe(false)
    aidoc.syncPreparing = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="aidoc-file-ingest"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens a native Wiki window without opening an embedded Wiki overlay', async () => {
    mockObsidianStore.vaultPath = '/some/vault'
    const open = vi.fn().mockResolvedValue(undefined)
    window.electronAPI.wikiWindow = { open }
    const wrapper = shallowMount(DocsView, { global: { stubs: { Teleport: true } } })
    try {
      wrapper.getComponent({ name: 'AiDocToolbar' }).vm.$emit('open-wiki')
      await flushPromises()
      expect(open).toHaveBeenCalledOnce()
      expect(wrapper.findComponent({ name: 'AiDocWikiPanel' }).exists()).toBe(false)
    } finally {
      wrapper.unmount()
      delete window.electronAPI.wikiWindow
    }
  })

  it('opens and closes the embedded Wiki when desktop window APIs are unavailable', async () => {
    mockObsidianStore.vaultPath = '/some/vault'
    const wrapper = shallowMount(DocsView, { global: { stubs: { Teleport: true } } })
    const toolbar = () => wrapper.findComponent({ name: 'AiDocToolbar' })
    const wiki = () => wrapper.findComponent({ name: 'AiDocWikiPanel' })
    expect(wiki().exists()).toBe(false)
    toolbar().vm.$emit('open-wiki')
    await wrapper.vm.$nextTick()
    expect(wiki().exists()).toBe(true)
    toolbar().vm.$emit('open-graph')
    await wrapper.vm.$nextTick()
    expect(wiki().exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'AiDocGraphPanel' }).exists()).toBe(true)
    toolbar().vm.$emit('open-wiki')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'AiDocGraphPanel' }).exists()).toBe(false)
    wiki().vm.$emit('open-file', { path: '/some/vault/kb_source/a.md', name: 'a.md' })
    await wrapper.vm.$nextTick()
    expect(mockObsidianStore.openFile).toHaveBeenCalledWith('/some/vault/kb_source/a.md', 'a.md')
    expect(wiki().exists()).toBe(false)
    toolbar().vm.$emit('open-wiki')
    await wrapper.vm.$nextTick()
    wiki().vm.$emit('close')
    await wrapper.vm.$nextTick()
    expect(wiki().exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens a graph document and returns to the editor', async () => {
    mockObsidianStore.vaultPath = '/some/vault'
    const wrapper = shallowMount(DocsView, { global: { stubs: { Teleport: true } } })
    wrapper.findComponent({ name: 'AiDocToolbar' }).vm.$emit('open-graph')
    await wrapper.vm.$nextTick()
    const graph = wrapper.findComponent({ name: 'AiDocGraphPanel' })
    expect(graph.element.closest('.docs-display-panel')).toBeNull()
    graph.vm.$emit('open-file', { path: '/some/vault/wiki/note.md', name: 'note.md' })
    await wrapper.vm.$nextTick()
    expect(mockObsidianStore.openFile).toHaveBeenCalledWith('/some/vault/wiki/note.md', 'note.md')
    expect(wrapper.findComponent({ name: 'AiDocGraphPanel' }).exists()).toBe(false)
  })

  it('opens a general document through a wikilink from a wiki page', async () => {
    const root = '/some/vault'
    const fromPath = root + '/wiki/source.md'
    const path = root + '/general/legacy.md'
    mockObsidianStore.vaultPath = root
    mockObsidianStore.activeFile = { path: fromPath, name: 'source.md' }
    mockObsidianStore.fileTree = [{ type: 'dir', children: [{ type: 'file', name: 'legacy.md', path }] }]
    const resolveLink = vi.fn(async () => ({ success: true, kind: 'unresolved' }))
    window.electronAPI.aidoc = { resolveLink }
    const wrapper = shallowMount(DocsView)
    const preview = wrapper.get('.prose-obsidian')
    preview.element.insertAdjacentHTML('beforeend', '<a class="wikilink" data-target="legacy" href="#">Legacy</a>')
    preview.get('a').element.click()
    await flushPromises()
    expect(resolveLink).toHaveBeenCalledWith({ root, fromPath, target: 'legacy' })
    expect(mockObsidianStore.openFile).toHaveBeenCalledWith(path, 'legacy.md')
    wrapper.unmount()
  })

  it('renders focus-mode header button and dispatches enterWith on click', async () => {
    mockObsidianStore.vaultPath = '/some/vault'
    mockObsidianStore.activeFile = { path: '/some/vault/note.md', name: 'note.md' }
    const wrapper = shallowMount(DocsView)

    const focusBtn = wrapper.find('.docs-hdr-focus-bulb')
    expect(focusBtn.exists()).toBe(true)
    // Reuses the shared emoji class
    expect(focusBtn.find('.focus-bulb-emoji').exists()).toBe(true)

    focusBtn.element.click()
    expect(focusEnterWithSpy).toHaveBeenCalledTimes(1)
    expect(focusEnterWithSpy).toHaveBeenCalledWith({
      filePath: '/some/vault/note.md',
      fileName: 'note.md',
      chatId: 'chat-xyz',
    })
  })
})
