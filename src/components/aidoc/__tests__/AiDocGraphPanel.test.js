// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiDocGraphPanel from '../AiDocGraphPanel.vue'

const { useAiDocStore } = vi.hoisted(() => ({ useAiDocStore: vi.fn() }))
vi.mock('../../../stores/aidoc', () => ({ useAiDocStore }))
vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key, params) => params?.n == null ? key : `${key} ${params.n}` }),
}))
vi.mock('../AiDocGraph.vue', () => ({
  default: { name: 'AiDocGraph', props: ['graph'], template: '<div />' },
}))

describe('AiDocGraphPanel', () => {
  let store
  const doc = { id: 'a', kind: 'doc', name: 'a.md', path: 'wiki/a.md', ext: 'md', degree: 1 }
  const unresolved = { id: '?target', kind: 'unresolved', name: 'target', degree: 1 }
  const orphan = { id: 'b', kind: 'doc', name: 'b.pdf', path: 'wiki/b.pdf', ext: 'pdf', degree: 0 }

  beforeEach(() => {
    store = reactive({
      graph: { nodes: [doc, unresolved, orphan], links: [{ source: 'a', target: '?target' }], hasIndex: true, groups: [], colors: {} },
      status: { indexStale: true, staleCount: 3, ingestAvailable: false, pending: { new: 2, updated: 1, removed: 1 } },
      loadGraph: vi.fn(),
      refreshStatus: vi.fn(),
    })
    useAiDocStore.mockReturnValue(store)
  })

  it('loads data and displays the unindexed empty state', () => {
    store.graph.hasIndex = false
    const wrapper = mount(AiDocGraphPanel)
    expect(store.loadGraph).toHaveBeenCalledOnce()
    expect(store.refreshStatus).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('aidoc.graphEmptyTitle')
    expect(wrapper.text()).toContain('aidoc.graphEmptyHint')
    expect(wrapper.findComponent({ name: 'AiDocGraph' }).exists()).toBe(false)
    wrapper.unmount()
  })

  it('reports stale status and uses an icon-only close button', async () => {
    const wrapper = mount(AiDocGraphPanel)
    expect(wrapper.text()).toContain('aidoc.syncStale 3')
    expect(wrapper.text()).not.toContain('aidoc.syncPending')
    store.status.ingestAvailable = true
    await nextTick()
    expect(wrapper.text()).toContain('aidoc.syncPending 4')
    const graph = wrapper.getComponent({ name: 'AiDocGraph' })
    graph.vm.$emit('select', unresolved)
    expect(wrapper.emitted('open-file')).toBeUndefined()
    graph.vm.$emit('select', doc)
    expect(wrapper.emitted('open-file')).toEqual([[{ path: doc.path, name: doc.name }]])
    const close = wrapper.get('[data-testid="aidoc-graph-close"]')
    expect(close.classes()).toContain('app-btn--icon')
    expect(close.attributes('aria-label')).toBe('aidoc.closeGraph')
    expect(close.text()).toBe('')
    await close.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps the overlay inside its host when dragged', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = mount(AiDocGraphPanel, { attachTo: host })
    try {
      Object.defineProperties(wrapper.element.parentElement, {
        clientWidth: { value: 600 },
        clientHeight: { value: 480 },
      })
      Object.defineProperties(wrapper.element, {
        offsetWidth: { value: 400 },
        offsetHeight: { value: 300 },
      })
      const handle = wrapper.get('.graph-drag-handle')
      handle.element.setPointerCapture = vi.fn()
      await handle.trigger('pointerdown', { button: 0, pointerId: 7, clientX: 200, clientY: 160 })
      await handle.trigger('pointermove', { pointerId: 7, clientX: 900, clientY: -100 })
      expect(handle.element.setPointerCapture).toHaveBeenCalledWith(7)
      expect(wrapper.element.style.left).toBe('200px')
      expect(wrapper.element.style.top).toBe('0px')
      await handle.trigger('pointerup', { pointerId: 7 })
      await handle.trigger('pointermove', { pointerId: 7, clientX: 0, clientY: 0 })
      expect(wrapper.element.style.left).toBe('200px')
      await handle.trigger('keydown', { key: 'ArrowLeft' })
      expect(wrapper.element.style.left).toBe('184px')
    } finally {
      wrapper.unmount()
      host.remove()
    }
  })

  it('filters orphan nodes and document types', async () => {
    const wrapper = mount(AiDocGraphPanel)
    const graph = wrapper.getComponent({ name: 'AiDocGraph' })
    await wrapper.get('[data-testid="aidoc-hide-orphans"]').setValue(true)
    expect(graph.props('graph').nodes).toEqual([doc, unresolved])
    await wrapper.get('[data-testid="aidoc-hide-orphans"]').setValue(false)
    await wrapper.get('[data-testid="aidoc-type-filter"][value="md"]').setValue(false)
    expect(graph.props('graph').nodes).toEqual([unresolved, orphan])
    store.error = 'File unavailable'
    await nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('aidoc.indexFailed')
    expect(wrapper.get('[role="alert"]').text()).toContain('File unavailable')
    wrapper.unmount()
  })
})
