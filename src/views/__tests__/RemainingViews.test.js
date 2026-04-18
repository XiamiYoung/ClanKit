// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── Shared mocks ──
vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('../../composables/useChatToCreate', () => ({
  useChatToCreate: () => ({ startChatGuide: vi.fn() }),
}))
vi.mock('../../utils/guestLimits', () => ({
  PREVIEW_LIMITS: {},
  isLimitEnforced: vi.fn(() => false),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
  RouterLink: { template: '<a><slot/></a>' },
}))
vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }))

// ── Store mocks ──
const mockKnowledgeStore = {
  knowledgeBases: [],
  ragEnabled: false,
  modelReady: true,
  modelChecking: false,
  loadKnowledgeBases: vi.fn(),
  checkModel: vi.fn(),
  refresh: vi.fn(),
}
vi.mock('../../stores/knowledge', () => ({
  useKnowledgeStore: () => mockKnowledgeStore,
}))

const mockMcpStore = {
  servers: [],
  loadServers: vi.fn(),
  loadStatus: vi.fn(),
}
vi.mock('../../stores/mcp', () => ({
  useMcpStore: () => mockMcpStore,
}))

const mockToolsStore = {
  tools: [],
  loadTools: vi.fn(),
}
vi.mock('../../stores/tools', () => ({
  useToolsStore: () => mockToolsStore,
}))

const mockNewsStore = {
  feeds: [],
  articles: [],
  loading: false,
  isRotated: false,
  topArticles: [],
  topLoading: false,
  hasFetchedOnce: false,
  cards: [],
  allFeeds: [],
  loadFeeds: vi.fn(),
  loadArticles: vi.fn(),
  fetchAllCards: vi.fn(),
  startAutoRefresh: vi.fn(),
  stopAutoRefresh: vi.fn(),
  rotateFeeds: vi.fn(),
  restoreDefaults: vi.fn(),
  setCardFeed: vi.fn(),
  fetchCard: vi.fn(),
  recomputeTop: vi.fn(),
}
vi.mock('../../stores/news', () => ({
  useNewsStore: () => mockNewsStore,
}))

const mockTasksStoreData = {
  tasks: [],
  plans: [],
  runs: [],
  taskCategories: [],
  planCategories: [],
  activeRun: null,
  isRunning: false,
}
const mockTasksStore = new Proxy(mockTasksStoreData, {
  get(target, prop) {
    if (prop in target) return target[prop]
    // Auto-create mock functions for any method access
    target[prop] = vi.fn(() => 0)
    return target[prop]
  },
})
vi.mock('../../stores/tasks', () => ({
  useTasksStore: () => mockTasksStore,
}))

vi.mock('../../stores/config', () => ({
  useConfigStore: () => ({ language: 'en', config: { providers: [] }, loadConfig: vi.fn() }),
}))

vi.stubGlobal('window', {
  ...globalThis.window,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  electronAPI: {
    getKnowledgeBases: vi.fn(() => Promise.resolve([])),
    getMcpServers: vi.fn(() => Promise.resolve([])),
    getTools: vi.fn(() => Promise.resolve([])),
    getNewsFeeds: vi.fn(() => Promise.resolve([])),
    getNewsArticles: vi.fn(() => Promise.resolve([])),
    getTasks: vi.fn(() => Promise.resolve([])),
    getPlans: vi.fn(() => Promise.resolve([])),
    refreshMcpServer: vi.fn(() => Promise.resolve()),
    deleteTool: vi.fn(() => Promise.resolve()),
    deleteKnowledgeBase: vi.fn(() => Promise.resolve()),
  },
})

// ── Imports (after all mocks) ──
import KnowledgeView from '../KnowledgeView.vue'
import McpView from '../McpView.vue'
import ToolsView from '../ToolsView.vue'
import NewsView from '../NewsView.vue'
import TaskEngineView from '../TaskEngineView.vue'

describe('KnowledgeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKnowledgeStore.knowledgeBases = []
  })

  it('mounts without error', () => {
    const wrapper = shallowMount(KnowledgeView, { global: { stubs: { RouterLink: { template: '<a><slot/></a>' } } } })
    expect(wrapper.exists()).toBe(true)
  })

  it('renders the page title', () => {
    const wrapper = shallowMount(KnowledgeView, { global: { stubs: { RouterLink: { template: '<a><slot/></a>' } } } })
    expect(wrapper.text()).toContain('knowledge.title')
  })

  it('renders the knowledge page container', () => {
    const wrapper = shallowMount(KnowledgeView, { global: { stubs: { RouterLink: { template: '<a><slot/></a>' } } } })
    expect(wrapper.find('.knowledge-page').exists()).toBe(true)
  })
})

describe('McpView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockMcpStore.servers = []
  })

  it('mounts without error', () => {
    const wrapper = shallowMount(McpView)
    expect(wrapper.exists()).toBe(true)
  })

  it('renders the page title', () => {
    const wrapper = shallowMount(McpView)
    expect(wrapper.text()).toContain('mcp.title')
  })

  it('renders the mcp page container', () => {
    const wrapper = shallowMount(McpView)
    expect(wrapper.find('.mcp-page').exists()).toBe(true)
  })
})

describe('ToolsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockToolsStore.tools = []
  })

  it('mounts without error', () => {
    const wrapper = shallowMount(ToolsView)
    expect(wrapper.exists()).toBe(true)
  })

  it('renders the page title', () => {
    const wrapper = shallowMount(ToolsView)
    expect(wrapper.text()).toContain('tools.title')
  })

  it('renders the tools page container', () => {
    const wrapper = shallowMount(ToolsView)
    expect(wrapper.find('.tools-page').exists()).toBe(true)
  })
})

describe('NewsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts without error', () => {
    const wrapper = shallowMount(NewsView)
    expect(wrapper.exists()).toBe(true)
  })

  it('renders the page title', () => {
    const wrapper = shallowMount(NewsView)
    expect(wrapper.text()).toContain('news.title')
  })

  it('renders the news page container', () => {
    const wrapper = shallowMount(NewsView)
    expect(wrapper.find('.news-page').exists()).toBe(true)
  })
})

describe('TaskEngineView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockTasksStore.tasks = []
    mockTasksStore.plans = []
  })

  it('mounts without error', () => {
    const wrapper = shallowMount(TaskEngineView)
    expect(wrapper.exists()).toBe(true)
  })

  it('renders the page title', () => {
    const wrapper = shallowMount(TaskEngineView)
    expect(wrapper.text()).toContain('tasks.title')
  })

  it('renders the root container', () => {
    const wrapper = shallowMount(TaskEngineView)
    expect(wrapper.find('.tev-root').exists()).toBe(true)
  })
})
