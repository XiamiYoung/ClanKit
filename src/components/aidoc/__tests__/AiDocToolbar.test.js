// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiDocToolbar from '../AiDocToolbar.vue'

const { useAiDocStore } = vi.hoisted(() => ({ useAiDocStore: vi.fn() }))
vi.mock('../../../stores/aidoc', () => ({ useAiDocStore }))
vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key, params) => params?.done == null ? key : `${key} ${params.done}/${params.total}`,
  }),
}))

describe('AiDocToolbar', () => {
  let store

  beforeEach(() => {
    store = reactive({
      status: { indexStale: true, staleCount: 3 },
      updating: false,
      progress: null,
      refreshStatus: vi.fn(),
      ensureIngestListener: vi.fn(),
      updateIndex: vi.fn(),
      runSync: vi.fn(),
    })
    useAiDocStore.mockReturnValue(store)
  })

  it('puts Wiki and Graph before Sync and badges pending changes', async () => {
    const wrapper = mount(AiDocToolbar, { global: { stubs: { Teleport: true } } })
    expect(store.refreshStatus).toHaveBeenCalledOnce()
    const rebuild = wrapper.get('[data-testid="aidoc-sync"]')
    const graph = wrapper.get('[data-testid="aidoc-open-graph"]')
    expect(wrapper.findAll('button').map(button => button.attributes('data-testid')))
      .toEqual(['aidoc-open-wiki', 'aidoc-open-graph', 'aidoc-sync', 'aidoc-rebuild'])
    expect(rebuild.get('[data-testid="aidoc-sync-dot"]').exists()).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('aidoc.wikiNeedsSync')
    store.status.indexStale = false
    await nextTick()
    expect(rebuild.find('[data-testid="aidoc-sync-dot"]').exists()).toBe(false)

    for (const [button, label] of [[graph, 'aidoc.graph'], [rebuild, 'aidoc.sync']]) {
      expect(button.classes()).toContain('app-btn--icon')
      expect(button.attributes('aria-label')).toBe(label)
      expect(button.text()).toBe('')
    }
    vi.useFakeTimers()
    try {
      graph.element.parentElement.dispatchEvent(new Event('focusin'))
      await vi.advanceTimersByTimeAsync(120)
      expect(wrapper.get('.app-tooltip').text()).toBe('aidoc.graph')
    } finally {
      vi.useRealTimers()
    }
    store.status.ingestAvailable = true
    store.status.pending = { new: 2, updated: 1 }
    await nextTick()
    expect(rebuild.find('[data-testid="aidoc-sync-dot"]').exists()).toBe(false)
    expect(rebuild.get('[data-testid="aidoc-sync-pending"]').text()).toBe('3')
    await rebuild.trigger('click')
    expect(store.runSync).toHaveBeenCalledOnce()
    await wrapper.get('[data-testid="aidoc-open-wiki"]').trigger('click')
    expect(wrapper.emitted('open-wiki')).toHaveLength(1)
    store.updating = true
    store.progress = { done: 2, total: 5 }
    await nextTick()
    expect(rebuild.attributes()).toHaveProperty('disabled')
    expect(rebuild.attributes('aria-label')).toBe('aidoc.updating')
    expect(rebuild.text()).toBe('3')
    expect(wrapper.get('[role="status"]').text()).toContain('2/5')
    await wrapper.get('[data-testid="aidoc-open-graph"]').trigger('click')
    expect(wrapper.emitted('open-graph')).toHaveLength(1)
    wrapper.unmount()
  })

  it('uses a distinct glyph for every toolbar button', () => {
    const wrapper = mount(AiDocToolbar, { global: { stubs: { Teleport: true } } })
    const glyphs = wrapper.findAll('button').map(button => button.get('svg').html())
    expect(new Set(glyphs).size).toBe(glyphs.length)
    expect(wrapper.get('[data-testid="aidoc-rebuild"] svg').html())
      .not.toBe(wrapper.get('[data-testid="aidoc-sync"] svg').html())
    wrapper.unmount()
  })

  it('offers a visible full rebuild control that still requires confirmation', async () => {
    const wrapper = mount(AiDocToolbar, { global: { stubs: { Teleport: true } } })
    const rebuild = wrapper.get('[data-testid="aidoc-rebuild"]')
    expect(rebuild.attributes('aria-label')).toBe('aidoc.fullRebuild')
    await rebuild.trigger('click')
    expect(store.updateIndex).not.toHaveBeenCalled()
    await wrapper.get('.confirm-action-btn').trigger('click')
    expect(store.updateIndex).toHaveBeenCalledExactlyOnceWith({ full: true })
    wrapper.unmount()
  })

  it('only starts a full rebuild after confirmation', async () => {
    const wrapper = mount(AiDocToolbar, { global: { stubs: { Teleport: true } } })
    await wrapper.get('[data-testid="aidoc-sync"]').trigger('contextmenu')
    expect(store.updateIndex).not.toHaveBeenCalled()
    await wrapper.get('.confirm-action-btn').trigger('click')
    expect(store.updateIndex).toHaveBeenCalledExactlyOnceWith({ full: true })
    expect(wrapper.find('.confirm-action-btn').exists()).toBe(false)
    wrapper.unmount()
  })
})
