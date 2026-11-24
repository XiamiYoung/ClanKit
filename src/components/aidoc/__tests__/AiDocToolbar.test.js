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
      updateIndex: vi.fn(),
    })
    useAiDocStore.mockReturnValue(store)
  })

  it('checks sync state, updates the index and opens the graph', async () => {
    const wrapper = mount(AiDocToolbar, { global: { stubs: { Teleport: true } } })
    const indicator = wrapper.get('[data-testid="aidoc-sync-dot"]')
    expect(store.refreshStatus).toHaveBeenCalledOnce()
    expect(indicator.classes()).toContain('is-stale')
    store.status.indexStale = false
    await nextTick()
    expect(indicator.classes()).not.toContain('is-stale')

    const update = wrapper.get('[data-testid="aidoc-update"]')
    const graph = wrapper.get('[data-testid="aidoc-open-graph"]')
    for (const [button, label] of [[update, 'aidoc.updateIndex'], [graph, 'aidoc.graph']]) {
      expect(button.classes()).toContain('app-btn--icon')
      expect(button.attributes('aria-label')).toBe(label)
      expect(button.text()).toBe('')
    }
    vi.useFakeTimers()
    try {
      await graph.element.parentElement.dispatchEvent(new Event('focusin'))
      await vi.advanceTimersByTimeAsync(120)
      expect(wrapper.get('.app-tooltip').text()).toBe('aidoc.graph')
    } finally {
      vi.useRealTimers()
    }
    await update.trigger('click')
    expect(store.updateIndex).toHaveBeenCalledOnce()
    store.updating = true
    store.progress = { done: 2, total: 5 }
    await nextTick()
    expect(update.attributes()).toHaveProperty('disabled')
    expect(update.attributes('aria-label')).toBe('aidoc.updating')
    expect(update.text()).toBe('')
    expect(wrapper.get('[role="status"]').text()).toContain('2/5')
    await wrapper.get('[data-testid="aidoc-open-graph"]').trigger('click')
    expect(wrapper.emitted('open-graph')).toHaveLength(1)
    wrapper.unmount()
  })

  it('starts a full rebuild from the index options', async () => {
    const wrapper = mount(AiDocToolbar, { global: { stubs: { Teleport: true } } })
    await wrapper.get('[data-testid="aidoc-index-options"]').trigger('click')
    await wrapper.get('.confirm-action-btn').trigger('click')
    expect(store.updateIndex).toHaveBeenCalledExactlyOnceWith({ full: true })
    expect(wrapper.find('.confirm-action-btn').exists()).toBe(false)
    wrapper.unmount()
  })
})
