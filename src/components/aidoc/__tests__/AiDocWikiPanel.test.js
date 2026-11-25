// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiDocWikiPanel from '../AiDocWikiPanel.vue'

const { useAiDocStore, renderObsidianMarkdown, locale } = vi.hoisted(() => ({
  useAiDocStore: vi.fn(),
  renderObsidianMarkdown: vi.fn(),
  locale: { value: 'en' },
}))
vi.mock('../../../stores/aidoc', () => ({ useAiDocStore }))
vi.mock('../../../utils/obsidianMarkdown', () => ({ renderObsidianMarkdown }))
vi.mock('../../../i18n/useI18n', () => ({ useI18n: () => ({ t: key => key, locale }) }))

describe('AiDocWikiPanel', () => {
  const home = { rel: 'wiki/index.md', title: 'Index', isIndex: true, mtimeMs: 30 }
  const summary = { rel: 'wiki/a.md', title: 'Alpha summary', type: 'summary', mtimeMs: 10 }
  const concept = { rel: 'wiki/concepts/b.md', title: 'Beta concept', type: 'concept', mtimeMs: 20 }
  let store

  beforeEach(() => {
    locale.value = 'en'
    store = reactive({
      wikiPages: [],
      currentWikiPage: null,
      wikiLoading: false,
      loadWikiPages: vi.fn().mockResolvedValue(undefined),
      openWikiPage: vi.fn().mockResolvedValue(undefined),
    })
    useAiDocStore.mockReturnValue(store)
    renderObsidianMarkdown.mockReset().mockReturnValue('')
  })

  async function openPanel() {
    const wrapper = mount(AiDocWikiPanel)
    await flushPromises()
    return wrapper
  }

  function clickText(wrapper, label, selector = 'button') {
    const button = wrapper.findAll(selector).find(item => item.text().includes(label))
    expect(button).toBeDefined()
    return button.trigger('click')
  }

  it('loads the list and shows the empty state without the columns', async () => {
    const wrapper = await openPanel()
    expect(store.loadWikiPages).toHaveBeenCalledOnce()
    expect(store.openWikiPage).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('aidoc.wikiEmptyTitle')
    expect(wrapper.text()).toContain('aidoc.wikiEmptyHint')
    expect(wrapper.find('.wiki-columns').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([false, true])('shows the graph in the reading area from the sidebar (standalone: %s)', async standalone => {
    store.wikiPages = [home, summary]
    const wrapper = mount(AiDocWikiPanel, {
      props: { standalone },
      global: { stubs: { AiDocGraphPanel: { name: 'AiDocGraphPanel', props: { embedded: Boolean }, template: '<div class="graph-stub" />' } } },
    })
    await flushPromises()
    expect(wrapper.find('.graph-stub').exists()).toBe(false)
    expect(wrapper.find('.wiki-titlebar [data-testid="aidoc-wiki-graph"]').exists()).toBe(false)
    const rows = wrapper.findAll('.wiki-navigation button').map(row => row.text())
    expect(rows.slice(0, 3)).toEqual(['aidoc.wikiOverview', 'aidoc.graph', 'aidoc.wikiAllArticles'])

    const button = () => wrapper.get('[data-testid="aidoc-wiki-graph"]')
    await button().trigger('click')
    const graph = wrapper.getComponent({ name: 'AiDocGraphPanel' })
    expect(graph.props('embedded')).toBe(true)
    expect(wrapper.find('.wiki-columns > .graph-stub').exists()).toBe(true)
    expect(wrapper.find('.wiki-reader').exists()).toBe(false)
    expect(wrapper.find('.wiki-context').exists()).toBe(false)
    expect(button().attributes('aria-current')).toBe('page')

    // Searching shows results; clearing the search returns to the graph.
    await wrapper.get('.wiki-search input').setValue('alpha')
    expect(wrapper.find('.graph-stub').exists()).toBe(false)
    await wrapper.get('.wiki-search input').setValue('')
    expect(wrapper.find('.graph-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'AiDocGraphPanel' }).vm.$emit('open-file', { path: 'C:\\vault\\kb_source\\n.pdf', name: 'n.pdf' })
    await flushPromises()
    expect(wrapper.emitted('open-file')).toEqual([[{ path: 'C:\\vault\\kb_source\\n.pdf', name: 'n.pdf' }]])
    expect(wrapper.find('.graph-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'AiDocGraphPanel' }).vm.$emit('open-file', { path: 'C:\\vault\\wiki\\a.md', name: 'a.md' })
    await flushPromises()
    expect(store.openWikiPage).toHaveBeenCalledWith('wiki/a.md')
    expect(wrapper.find('.graph-stub').exists()).toBe(false)
    expect(wrapper.find('.wiki-reader').exists()).toBe(true)
    expect(button().attributes('aria-current')).toBeUndefined()
    wrapper.unmount()
  })

  it('moves by the title and resizes by the lower-right handle', async () => {
    const wrapper = mount(AiDocWikiPanel, { attachTo: document.body })
    await flushPromises()
    try {
      const style = wrapper.element.style
      const left = parseFloat(style.left)
      const width = parseFloat(style.width)
      const handle = wrapper.get('.wiki-drag-handle')
      await handle.trigger('pointerdown', { button: 0, pointerId: 3, clientX: 100, clientY: 100 })
      await handle.trigger('pointermove', { pointerId: 3, clientX: 0, clientY: 100 })
      expect(parseFloat(style.left)).toBeLessThan(left)
      await handle.trigger('pointerup', { pointerId: 3 })
      await wrapper.get('.wiki-resize-button').trigger('keydown', { key: 'ArrowLeft' })
      expect(parseFloat(style.width)).toBe(width - 16)
    } finally {
      wrapper.unmount()
    }
  })

  it('uses a non-modal surface without simulated window controls in a native window', async () => {
    store.wikiPages = [home, summary]
    const wrapper = mount(AiDocWikiPanel, { props: { standalone: true } })
    await flushPromises()
    expect(wrapper.attributes('role')).toBe('main')
    expect(wrapper.attributes('aria-modal')).toBeUndefined()
    expect(wrapper.find('.wiki-resize-button').exists()).toBe(false)
    expect(wrapper.find('.wiki-drag-handle').exists()).toBe(false)
    wrapper.unmount()
  })

  it('resizes and collapses the two navigation panes independently', async () => {
    store.wikiPages = [home, summary]
    const wrapper = await openPanel()
    try {
      await clickText(wrapper, 'aidoc.wikiAllArticles', '.wiki-navigation button')
      const topics = wrapper.get('[aria-controls="wiki-topics-menu"][role="separator"]')
      await topics.trigger('pointerdown', { button: 0, pointerId: 5, clientX: 220 })
      await topics.trigger('pointermove', { pointerId: 5, clientX: 260 })
      expect(wrapper.get('.wiki-columns').attributes('style')).toContain('--wiki-topics-width: min(260px, 32%)')
      const toggle = wrapper.get('button[aria-controls="wiki-articles-menu"]')
      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(wrapper.get('#wiki-articles-menu').element.style.display).toBe('none')
      expect(wrapper.get('.wiki-columns').attributes('style')).toContain('--wiki-articles-width: 1.5rem')
      expect(wrapper.get('#wiki-topics-menu').element.style.display).not.toBe('none')
      await toggle.trigger('click')
      expect(wrapper.get('#wiki-articles-menu').element.style.display).not.toBe('none')
      expect(wrapper.get('.wiki-columns').attributes('style')).toContain('--wiki-articles-width: min(260px, 32%)')
    } finally {
      wrapper.unmount()
    }
  })

  describe('language wikis', () => {
    const page = (lang, name, extra = {}) => ({ rel: `wiki/${lang}/${name}.md`, lang, title: `${name} ${lang}`, type: 'concept', mtimeMs: 10, ...extra })
    const index = lang => page(lang, 'index', { isIndex: true, title: 'Index' })
    const legacy = { rel: 'wiki/old.md', lang: null, title: 'Old page', type: 'entity', mtimeMs: 5 }
    const bothLanguages = () => [index('en'), page('en', 'alpha'), index('zh'), page('zh', 'beta'), page('zh', 'gamma')]
    const picker = wrapper => wrapper.get('[data-testid="aidoc-wiki-languages"]')
    const listed = wrapper => wrapper.findAll('.wiki-recent-row > span:first-child').map(item => item.text())

    it('shows no switcher when a single language exists', async () => {
      store.wikiPages = [index('en'), page('en', 'alpha')]
      const wrapper = await openPanel()
      expect(wrapper.find('[data-testid="aidoc-wiki-languages"]').exists()).toBe(false)
      expect(store.openWikiPage).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('shows no switcher when the second language holds only its scaffold index', async () => {
      store.wikiPages = [index('en'), page('en', 'alpha'), index('zh')]
      const wrapper = await openPanel()
      expect(wrapper.find('[data-testid="aidoc-wiki-languages"]').exists()).toBe(false)
      expect(listed(wrapper)).not.toContain('Index')
      wrapper.unmount()
    })

    it('shows a labelled language dropdown that defaults to the UI language', async () => {
      locale.value = 'zh'
      store.wikiPages = bothLanguages()
      const wrapper = await openPanel()
      const group = wrapper.get('[data-testid="aidoc-wiki-languages"]')
      expect(group.element.tagName).toBe('SELECT')
      expect(group.attributes('aria-label')).toBe('aidoc.wikiLanguage')
      expect(group.findAll('option').map(button => button.text())).toEqual(['aidoc.langEn', 'aidoc.langZh'])
      expect(picker(wrapper).element.value).toBe('zh')
      expect(store.openWikiPage).not.toHaveBeenCalled()
      expect(listed(wrapper).sort()).toEqual(['beta zh', 'gamma zh'])
      wrapper.unmount()
    })

    it('falls back to an available language when the UI language has no wiki', async () => {
      locale.value = 'zh-CN'
      store.wikiPages = [index('en'), page('en', 'alpha'), index('fr'), page('fr', 'beta')]
      const wrapper = await openPanel()
      expect(picker(wrapper).element.value).toBe('en')
      expect(store.openWikiPage).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('scopes the lists to the chosen language and shows its overview when switching', async () => {
      store.wikiPages = bothLanguages()
      const wrapper = await openPanel()
      expect(new Set(listed(wrapper))).toEqual(new Set(['alpha en']))
      await picker(wrapper).setValue('zh')
      await flushPromises()
      expect(store.openWikiPage).not.toHaveBeenCalled()
      expect(picker(wrapper).element.value).toBe('zh')
      expect(new Set(listed(wrapper))).toEqual(new Set(['beta zh', 'gamma zh']))
      await wrapper.get('input[type="search"]').setValue('alpha')
      expect(wrapper.text()).toContain('common.noResults')
      await picker(wrapper).setValue('en')
      await flushPromises()
      expect(wrapper.get('input[type="search"]').element.value).toBe('')
      expect(store.openWikiPage).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('shows the overview for a language without an index', async () => {
      store.wikiPages = [index('en'), page('en', 'alpha'), page('zh', 'beta')]
      const wrapper = await openPanel()
      await picker(wrapper).setValue('zh')
      await flushPromises()
      expect(store.openWikiPage).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('finds old pages through search without a legacy navigation button', async () => {
      store.wikiPages = [index('en'), page('en', 'alpha')]
      let wrapper = await openPanel()
      expect(wrapper.text()).not.toContain('aidoc.wikiLegacy')
      wrapper.unmount()

      store.wikiPages = [index('en'), page('en', 'alpha'), legacy]
      wrapper = await openPanel()
      expect(wrapper.findAll('.wiki-topic').map(item => item.text()).join(' ')).not.toContain('aidoc.wikiLegacy')
      await wrapper.get('input[type="search"]').setValue('Old page')
      expect(wrapper.get('.wiki-article-row strong').text()).toBe('Old page')
      await wrapper.get('.wiki-article-row').trigger('click')
      expect(store.openWikiPage).toHaveBeenLastCalledWith('wiki/old.md')
      wrapper.unmount()
    })

    it('reads a wiki that only has legacy flat pages', async () => {
      store.wikiPages = [{ rel: 'wiki/index.md', lang: null, title: 'Index', isIndex: true, mtimeMs: 1 }, legacy]
      const wrapper = await openPanel()
      expect(wrapper.find('[data-testid="aidoc-wiki-languages"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('aidoc.wikiLegacy')
      expect(store.openWikiPage).not.toHaveBeenCalled()
      expect(listed(wrapper)).toContain('Old page')
      wrapper.unmount()
    })
  })

  it('shows the empty state when only the scaffold index exists', async () => {
    store.wikiPages = [home]
    const wrapper = await openPanel()
    expect(wrapper.text()).toContain('aidoc.wikiEmptyTitle')
    expect(wrapper.find('.wiki-columns').exists()).toBe(false)
    expect(store.openWikiPage).not.toHaveBeenCalled()
    store.wikiPages = [home, summary]
    await flushPromises()
    expect(wrapper.find('.wiki-columns').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the overview, then filters, previews, and opens a search result', async () => {
    store.wikiPages = [summary, concept, home]
    const wrapper = await openPanel()
    expect(store.openWikiPage).not.toHaveBeenCalled()
    expect(wrapper.findAll('.wiki-recent-row > span:first-child').map(item => item.text())).toEqual([concept.title, summary.title])
    await wrapper.get('input[type="search"]').setValue('CONCEPTS/b')
    expect(wrapper.findAll('.wiki-article-row strong').map(item => item.text())).toEqual([concept.title])
    await wrapper.findAll('.wiki-filter select')[1].setValue('summary')
    expect(wrapper.text()).toContain('common.noResults')
    await wrapper.findAll('.wiki-filter select')[1].setValue('concept')
    store.openWikiPage.mockImplementation(async () => {
      store.currentWikiPage = { ...concept, body: '## Opening\n\nPreview text' }
    })
    await wrapper.get('.wiki-article-row').trigger('click')
    await flushPromises()
    expect(wrapper.get('.wiki-search-preview').text()).toContain('Preview text')
    expect(wrapper.get('.wiki-preview-headings').text()).toContain('Opening')
    await clickText(wrapper, 'aidoc.wikiOpenArticle')
    expect(wrapper.find('.wiki-search-preview').exists()).toBe(false)
    expect(wrapper.get('article h3').text()).toBe(concept.title)
    wrapper.unmount()
  })

  it('shows article metadata and allows navigation through backlinks and existing sources', async () => {
    store.wikiPages = [summary, concept]
    store.currentWikiPage = {
      ...summary,
      updated: '2026-11-24',
      body: 'Article body',
      backlinks: [{ rel: concept.rel, title: concept.title }],
      sources: [
        { rel: 'kb_source/live.md', path: 'D:/knowledge/kb_source/live.md', exists: true },
        { rel: 'kb_source/missing.md', exists: false },
      ],
    }
    renderObsidianMarkdown.mockReturnValue('<p>Article body</p>')
    const wrapper = await openPanel()
    await clickText(wrapper, summary.title, '.wiki-recent-row')
    expect(wrapper.get('article h3').text()).toBe(summary.title)
    expect(wrapper.get('article time').text()).toBe('2026-11-24')
    expect(wrapper.get('.wiki-type').text()).toBe('aidoc.typeSummary')
    expect(wrapper.get('.wiki-markdown').text()).toBe('Article body')
    const [backlink, source] = wrapper.findAll('aside button')
    expect(backlink.text()).toBe(concept.title)
    await source.trigger('click')
    expect(wrapper.emitted('open-file')).toEqual([[{ path: 'D:/knowledge/kb_source/live.md', name: 'live.md' }]])
    expect(wrapper.get('.wiki-missing-source').text()).toContain('aidoc.wikiSourceMissing')
    expect(wrapper.findAll('aside button')).toHaveLength(2)
    await backlink.trigger('click')
    expect(store.openWikiPage).toHaveBeenLastCalledWith(concept.rel)

    const close = wrapper.get('[data-testid="aidoc-wiki-close"]')
    expect(close.text()).toBe('')
    expect(close.attributes('aria-label')).toBe('common.close')
    await close.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('expands three topic levels and lists descendant articles when selecting a parent', async () => {
    store.wikiPages = [home, { ...summary, topics: ['Cloud › Infrastructure › Terraform'] },
      { ...concept, topics: ['Cloud › Governance'] }]
    const wrapper = await openPanel()
    const labels = () => wrapper.findAll('.wiki-topic > .wiki-tree-name').map(item => item.text())
    expect(labels()).toEqual(['Cloud'])
    const cloud = () => wrapper.get('.wiki-topic')
    expect(cloud().find('.wiki-folder-icon').exists()).toBe(true)
    expect(cloud().attributes('aria-expanded')).toBe('false')
    await cloud().trigger('click')
    expect(cloud().attributes('aria-expanded')).toBe('true')
    await cloud().trigger('click')
    expect(cloud().attributes('aria-expanded')).toBe('false')
    expect(labels()).toEqual(['Cloud'])
    expect(wrapper.findAll('.wiki-article-row')).toHaveLength(2)
    await clickText(wrapper, 'Cloud', '.wiki-topic')
    expect(labels()).toEqual(['Cloud', 'Governance', 'Infrastructure'])
    expect(wrapper.findAll('.wiki-article-row')).toHaveLength(2)
    await clickText(wrapper, 'Infrastructure', '.wiki-topic')
    expect(labels()).toContain('Terraform')
    await clickText(wrapper, 'Terraform', '.wiki-topic')
    expect(wrapper.findAll('.wiki-article-row strong').map(item => item.text())).toEqual([summary.title])
    wrapper.unmount()
  })

  it('shows every topic level in the overview and opens a nested topic with its parents expanded', async () => {
    store.wikiPages = [home, { ...summary, topics: ['Cloud › Infrastructure › Terraform'] },
      { ...concept, topics: ['Cloud › Governance'] }]
    const wrapper = await openPanel()
    expect(wrapper.findAll('.wiki-topic-card strong').map(item => item.text())).toEqual(['Cloud'])
    expect(wrapper.findAll('.wiki-subtopic > span:first-child').map(item => item.text()))
      .toEqual(['Governance', 'Infrastructure', 'Terraform'])

    await clickText(wrapper, 'Terraform', '.wiki-subtopic')
    expect(wrapper.findAll('.wiki-article-row strong').map(item => item.text())).toEqual([summary.title])
    expect(wrapper.findAll('.wiki-topic > .wiki-tree-name').map(item => item.text())).toContain('Terraform')
    wrapper.unmount()
  })

  it('groups articles by topic and supports switching between the outline and Markdown source', async () => {
    store.wikiPages = [home,
      { ...summary, sources: ['kb_source/interview/a.md'], topics: ['Orbital mechanics'] },
      { ...concept, sources: ['kb_source/interview/b.md'], topics: ['Database indexes'] },
    ]
    store.currentWikiPage = { ...summary, body: '## Start\n\n## Verify' }
    renderObsidianMarkdown.mockReturnValue('<h2>Start</h2><h2>Verify</h2>')
    const wrapper = await openPanel()
    expect(wrapper.findAll('.wiki-topic-card strong').map(group => group.text())).toEqual([
      'Database indexes', 'Orbital mechanics',
    ])
    await clickText(wrapper, 'Orbital mechanics', '.wiki-topic-card')
    expect(wrapper.findAll('.wiki-article-row strong').map(button => button.text())).toEqual([summary.title])
    expect(wrapper.findAll('.wiki-outline button').map(button => button.text())).toEqual(['Start', 'Verify'])

    const [reading, markdown] = wrapper.findAll('.wiki-view-modes button')
    await markdown.trigger('click')
    expect(wrapper.find('.wiki-outline').exists()).toBe(false)
    expect(wrapper.get('.wiki-source').text()).toContain('## Start')
    await reading.trigger('click')
    expect(wrapper.findAll('.wiki-outline button')).toHaveLength(2)
    wrapper.unmount()
  })

  it('only follows links mapped by the current wiki page and removes unresolved links from keyboard navigation', async () => {
    store.wikiPages = [home, concept]
    store.currentWikiPage = {
      ...home,
      body: '[[Beta]] [[Missing]]',
      links: { Beta: concept.rel, Missing: null, External: 'https://example.com' },
    }
    renderObsidianMarkdown.mockReturnValue(
      '<a class="wikilink" data-target="Beta" data-rel="wiki/concepts/b.md" href="#">Beta</a>' +
      '<a class="wikilink" data-target="Missing" data-unresolved="true" href="#">Missing</a>' +
      '<a class="wikilink" data-target="Beta" data-rel="wiki/forged.md" href="#">Forged</a>' +
      '<a class="wikilink" data-target="External" data-rel="https://example.com" href="https://example.com">External</a>',
    )
    const wrapper = await openPanel()
    await clickText(wrapper, 'aidoc.wikiOriginalIndex')
    const [, { resolveLink }] = renderObsidianMarkdown.mock.lastCall
    expect(resolveLink('Beta')).toBe(concept.rel)
    expect(resolveLink('Missing')).toBeNull()
    expect(resolveLink('External')).toBeNull()
    expect(resolveLink('__proto__')).toBeNull()
    store.openWikiPage.mockClear()

    const [resolved, ...disabled] = wrapper.findAll('.wikilink')
    for (const link of disabled) {
      expect(link.attributes('aria-disabled')).toBe('true')
      expect(link.attributes('tabindex')).toBe('-1')
      expect(link.attributes('href')).toBeUndefined()
      await link.trigger('click')
    }
    expect(store.openWikiPage).not.toHaveBeenCalled()
    await resolved.trigger('click')
    expect(store.openWikiPage).toHaveBeenCalledExactlyOnceWith(concept.rel)
    wrapper.unmount()
  })

  it('is an aria modal dialog; Escape in search only clears it, elsewhere closes', async () => {
    store.wikiPages = [home, concept]
    const wrapper = await openPanel()
    const panel = wrapper.get('[data-testid="aidoc-wiki-panel"]')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('true')
    expect(panel.attributes('aria-label')).toBe('aidoc.wikiDialog')
    const search = wrapper.get('input[type="search"]')
    await search.setValue('beta')
    await search.trigger('keydown.esc')
    expect(search.element.value).toBe('')
    expect(wrapper.emitted('close')).toBeUndefined()
    await panel.trigger('keydown.esc')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('opens a kb_source link as a source file instead of dimming it', async () => {
    store.wikiPages = [home, summary]
    store.currentWikiPage = {
      ...home,
      body: '[[report]]',
      links: { report: 'kb_source/report.md' },
      sources: [{ rel: 'kb_source/report.md', path: 'D:/v/kb_source/report.md', exists: true }],
    }
    renderObsidianMarkdown.mockReturnValue(
      '<a class="wikilink" data-target="report" data-rel="kb_source/report.md" href="#">report</a>')
    const wrapper = await openPanel()
    await clickText(wrapper, 'aidoc.wikiOriginalIndex')
    const link = wrapper.get('.wikilink')
    expect(link.attributes('aria-disabled')).toBeUndefined()
    store.openWikiPage.mockClear()
    await link.trigger('click')
    expect(store.openWikiPage).not.toHaveBeenCalled()
    expect(wrapper.emitted('open-file')).toEqual([[{ path: 'D:/v/kb_source/report.md', name: 'report.md' }]])
    wrapper.unmount()
  })

  it('renders pages with restricted images', async () => {
    store.wikiPages = [home, summary]
    store.currentWikiPage = { ...home, body: 'x', links: {} }
    await openPanel()
    expect(renderObsidianMarkdown.mock.lastCall[1]).toMatchObject({ restrictImages: true })
  })
})
