// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiDocWikiPanel from '../AiDocWikiPanel.vue'

const { useAiDocStore, renderObsidianMarkdown } = vi.hoisted(() => ({
  useAiDocStore: vi.fn(),
  renderObsidianMarkdown: vi.fn(),
}))
vi.mock('../../../stores/aidoc', () => ({ useAiDocStore }))
vi.mock('../../../utils/obsidianMarkdown', () => ({ renderObsidianMarkdown }))
vi.mock('../../../i18n/useI18n', () => ({ useI18n: () => ({ t: key => key }) }))

describe('AiDocWikiPanel', () => {
  const home = { rel: 'wiki/index.md', title: 'Index', isIndex: true, mtimeMs: 30 }
  const summary = { rel: 'wiki/a.md', title: 'Alpha summary', type: 'summary', mtimeMs: 10 }
  const concept = { rel: 'wiki/concepts/b.md', title: 'Beta concept', type: 'concept', mtimeMs: 20 }
  let store

  beforeEach(() => {
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
