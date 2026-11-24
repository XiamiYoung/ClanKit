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
    const wrapper = mount(AiDocToolbar)
    const indicator = wrapper.get('[data-testid="aidoc-sync-dot"]')
    expect(store.refreshStatus).toHaveBeenCalledOnce()
    expect(indicator.classes()).toContain('is-stale')
    store.status.indexStale = false
    await nextTick()
    expect(indicator.classes()).not.toContain('is-stale')

    const update = wrapper.get('[data-testid="aidoc-update"]')
    await update.trigger('click')
    expect(store.updateIndex).toHaveBeenCalledOnce()
    store.updating = true
    store.progress = { done: 2, total: 5 }
    await nextTick()
    expect(update.attributes()).toHaveProperty('disabled')
    expect(update.text()).toContain('aidoc.updating')
    expect(update.text()).toContain('2/5')
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
