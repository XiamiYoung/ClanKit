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

  it('uses the document for initial size and the viewport for movement and resizing', async () => {
    const anchor = document.createElement('div')
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ left: 240, top: 120, width: 600, height: 480 })
    const wrapper = mount(AiDocGraphPanel, { attachTo: document.body, props: { anchor } })
    try {
      await nextTick()
      const { style } = wrapper.element
      expect([style.left, style.top, style.width, style.height]).toEqual(['256px', '136px', '568px', '448px'])
      const handle = wrapper.get('.graph-drag-handle')
      handle.element.setPointerCapture = vi.fn()
      await handle.trigger('pointerdown', { button: 0, pointerId: 7, clientX: 300, clientY: 160 })
      await handle.trigger('pointermove', { pointerId: 7, clientX: 0, clientY: 0 })
      expect(handle.element.setPointerCapture).toHaveBeenCalledWith(7)
      expect([style.left, style.top]).toEqual(['0px', '0px'])
      await handle.trigger('pointerup', { pointerId: 7 })
      await handle.trigger('pointermove', { pointerId: 7, clientX: 500, clientY: 500 })
      expect([style.left, style.top]).toEqual(['0px', '0px'])

      const resize = wrapper.get('.graph-resize-button')
      resize.element.setPointerCapture = vi.fn()
      await resize.trigger('pointerdown', { button: 0, pointerId: 8, clientX: 560, clientY: 440 })
      await resize.trigger('pointermove', { pointerId: 8, clientX: 2000, clientY: 2000 })
      expect([style.width, style.height]).toEqual([window.innerWidth + 'px', window.innerHeight + 'px'])
      await resize.trigger('pointerup', { pointerId: 8 })
      await resize.trigger('keydown', { key: 'ArrowLeft' })
      expect(style.width).toBe(window.innerWidth - 16 + 'px')
      await handle.trigger('keydown', { key: 'ArrowRight' })
      expect(style.left).toBe('16px')
    } finally {
      wrapper.unmount()
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
