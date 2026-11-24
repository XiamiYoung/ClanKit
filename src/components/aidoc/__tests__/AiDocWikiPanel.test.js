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

  it('loads the list and shows the empty state without the columns', async () => {
    const wrapper = await openPanel()
    expect(store.loadWikiPages).toHaveBeenCalledOnce()
    expect(store.openWikiPage).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('aidoc.wikiEmptyTitle')
    expect(wrapper.text()).toContain('aidoc.wikiEmptyHint')
    expect(wrapper.find('.wiki-columns').exists()).toBe(false)
    wrapper.unmount()
  })

  describe('language wikis', () => {
    const page = (lang, name, extra = {}) => ({ rel: `wiki/${lang}/${name}.md`, lang, title: `${name} ${lang}`, type: 'concept', mtimeMs: 10, ...extra })
    const index = lang => page(lang, 'index', { isIndex: true, title: 'Index' })
    const legacy = { rel: 'wiki/old.md', lang: null, title: 'Old page', type: 'entity', mtimeMs: 5 }
    const bothLanguages = () => [index('en'), page('en', 'alpha'), index('zh'), page('zh', 'beta'), page('zh', 'gamma')]
    const radio = (wrapper, lang) => wrapper.get(`[data-testid="aidoc-wiki-language-${lang}"]`)
    const listed = wrapper => wrapper.findAll('.wiki-nav-group button').map(button => button.text())

    it('shows no switcher when a single language exists', async () => {
      store.wikiPages = [index('en'), page('en', 'alpha')]
      const wrapper = await openPanel()
      expect(wrapper.find('[data-testid="aidoc-wiki-languages"]').exists()).toBe(false)
      expect(store.openWikiPage).toHaveBeenCalledExactlyOnceWith('wiki/en/index.md')
      wrapper.unmount()
    })

    it('shows no switcher when the second language holds only its scaffold index', async () => {
      store.wikiPages = [index('en'), page('en', 'alpha'), index('zh')]
      const wrapper = await openPanel()
      expect(wrapper.find('[data-testid="aidoc-wiki-languages"]').exists()).toBe(false)
      expect(listed(wrapper)).not.toContain('Index')
      wrapper.unmount()
    })

    it('shows a labelled segmented control that defaults to the UI language', async () => {
      locale.value = 'zh'
      store.wikiPages = bothLanguages()
      const wrapper = await openPanel()
      const group = wrapper.get('[data-testid="aidoc-wiki-languages"]')
      expect(group.attributes('role')).toBe('radiogroup')
      expect(group.attributes('aria-label')).toBe('aidoc.wikiLanguage')
      expect(group.findAll('button').map(button => button.text())).toEqual(['aidoc.langEn', 'aidoc.langZh'])
      expect(radio(wrapper, 'zh').attributes('aria-checked')).toBe('true')
      expect(radio(wrapper, 'en').attributes('aria-checked')).toBe('false')
      expect(store.openWikiPage).toHaveBeenCalledExactlyOnceWith('wiki/zh/index.md')
      expect(listed(wrapper).sort()).toEqual(['beta zh', 'beta zh', 'gamma zh', 'gamma zh'])
      wrapper.unmount()
    })

    it('falls back to an available language when the UI language has no wiki', async () => {
      locale.value = 'zh-CN'
      store.wikiPages = [index('en'), page('en', 'alpha'), index('fr'), page('fr', 'beta')]
      const wrapper = await openPanel()
      expect(radio(wrapper, 'en').attributes('aria-checked')).toBe('true')
      expect(store.openWikiPage).toHaveBeenCalledExactlyOnceWith('wiki/en/index.md')
      wrapper.unmount()
    })

    it('scopes the lists to the chosen language and opens its home when switching', async () => {
      store.wikiPages = bothLanguages()
      const wrapper = await openPanel()
      expect(new Set(listed(wrapper))).toEqual(new Set(['alpha en']))
      await radio(wrapper, 'zh').trigger('click')
      await flushPromises()
      expect(store.openWikiPage).toHaveBeenLastCalledWith('wiki/zh/index.md')
      expect(radio(wrapper, 'zh').attributes('aria-checked')).toBe('true')
      expect(new Set(listed(wrapper))).toEqual(new Set(['beta zh', 'gamma zh']))
      await wrapper.get('input[type="search"]').setValue('alpha')
      expect(wrapper.text()).toContain('common.noResults')
      await radio(wrapper, 'en').trigger('click')
      await flushPromises()
      expect(wrapper.get('input[type="search"]').element.value).toBe('')
      expect(store.openWikiPage).toHaveBeenLastCalledWith('wiki/en/index.md')
      wrapper.unmount()
    })

    it('opens the first page of a language that has no index', async () => {
      store.wikiPages = [index('en'), page('en', 'alpha'), page('zh', 'beta')]
      const wrapper = await openPanel()
      await radio(wrapper, 'zh').trigger('click')
      await flushPromises()
      expect(store.openWikiPage).toHaveBeenLastCalledWith('wiki/zh/beta.md')
      wrapper.unmount()
    })

    it('lists legacy flat pages in their own group only when some exist', async () => {
      store.wikiPages = [index('en'), page('en', 'alpha')]
      let wrapper = await openPanel()
      expect(wrapper.text()).not.toContain('aidoc.wikiLegacy')
      wrapper.unmount()

      store.wikiPages = [index('en'), page('en', 'alpha'), legacy]
      wrapper = await openPanel()
      const groups = wrapper.findAll('.wiki-nav-group')
      expect(groups.at(-1).get('h3').text()).toBe('aidoc.wikiLegacy')
      expect(groups.at(-1).findAll('button').map(button => button.text())).toEqual(['Old page'])
      await groups.at(-1).get('button').trigger('click')
      expect(store.openWikiPage).toHaveBeenLastCalledWith('wiki/old.md')
      wrapper.unmount()
    })

    it('reads a wiki that only has legacy flat pages', async () => {
      store.wikiPages = [{ rel: 'wiki/index.md', lang: null, title: 'Index', isIndex: true, mtimeMs: 1 }, legacy]
      const wrapper = await openPanel()
      expect(wrapper.find('[data-testid="aidoc-wiki-languages"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('aidoc.wikiLegacy')
      expect(store.openWikiPage).toHaveBeenCalledExactlyOnceWith('wiki/index.md')
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

  it('opens the index after loading, sorts recent pages, and filters grouped pages by title or path', async () => {
    store.wikiPages = null
    store.loadWikiPages.mockImplementation(async () => { store.wikiPages = [summary, concept, home] })
    const wrapper = await openPanel()
    expect(store.openWikiPage).toHaveBeenCalledExactlyOnceWith(home.rel)
    const groups = wrapper.findAll('.wiki-nav-group')
    expect(groups.map(group => group.get('h3').text())).toEqual([
      'aidoc.wikiRecent', 'aidoc.typeSummary', 'aidoc.typeConcept',
    ])
    expect(groups[0].findAll('button').map(button => button.text())).toEqual([concept.title, summary.title])

    await wrapper.get('input[type="search"]').setValue('CONCEPTS/b')
    expect(wrapper.findAll('.wiki-nav-group').map(group => group.get('h3').text())).toEqual(['aidoc.typeConcept'])
    await wrapper.get('.wiki-nav-group button').trigger('click')
    expect(store.openWikiPage).toHaveBeenLastCalledWith(concept.rel)

    await wrapper.get('input[type="search"]').setValue('missing page')
    expect(wrapper.text()).toContain('common.noResults')
    expect(wrapper.get('nav > button').text()).toBe('aidoc.wikiHome')
    wrapper.unmount()
  })

  it('falls back to the first page, shows metadata and allows navigation through backlinks and existing sources', async () => {
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
    expect(store.openWikiPage).toHaveBeenCalledExactlyOnceWith(summary.rel)
    expect(wrapper.get('article h3').text()).toBe(summary.title)
    expect(wrapper.get('article time').text()).toBe('2026-11-24')
    expect(wrapper.get('.wiki-type').text()).toBe('aidoc.typeSummary')
    expect(wrapper.get('.wiki-markdown').text()).toBe('Article body')
    const [backlink, source] = wrapper.findAll('aside button')
    expect(backlink.text()).toBe(concept.title)
    await backlink.trigger('click')
    expect(store.openWikiPage).toHaveBeenLastCalledWith(concept.rel)
    await source.trigger('click')
    expect(wrapper.emitted('open-file')).toEqual([[{ path: 'D:/knowledge/kb_source/live.md', name: 'live.md' }]])
    expect(wrapper.get('.wiki-missing-source').text()).toContain('aidoc.wikiSourceMissing')
    expect(wrapper.findAll('aside button')).toHaveLength(2)

    const close = wrapper.get('[data-testid="aidoc-wiki-close"]')
    expect(close.text()).toBe('')
    expect(close.attributes('aria-label')).toBe('common.close')
    await close.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
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
