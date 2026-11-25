// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
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
vi.mock('../AiDocGraph2D.vue', () => ({
  default: { name: 'AiDocGraph2D', props: ['graph'], template: '<div />' },
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

  it('switches between 3D and 2D left of the type filter and starts in 3D every time', async () => {
    const wrapper = mount(AiDocGraphPanel)
    await flushPromises()
    const button = value => wrapper.get(`.graph-view > [role="group"] [data-testid="aidoc-graph-${value}d"]`)
    const shows = (target, name) => target.findComponent({ name }).exists()
    expect(shows(wrapper, 'AiDocGraph')).toBe(true)
    expect(wrapper.text()).not.toContain('aidoc.graphShapeSource')
    expect(button(3).attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('.graph-view').element.firstElementChild.className).toBe('graph-dimensions')

    await button(2).trigger('click')
    await flushPromises()
    expect(shows(wrapper, 'AiDocGraph2D')).toBe(true)
    expect(shows(wrapper, 'AiDocGraph')).toBe(false)
    expect(wrapper.text()).toContain('aidoc.graphShapeSource')
    expect(button(2).attributes('aria-pressed')).toBe('true')
    wrapper.unmount()

    const reopened = mount(AiDocGraphPanel)
    await flushPromises()
    expect(shows(reopened, 'AiDocGraph')).toBe(true)
    expect(shows(reopened, 'AiDocGraph2D')).toBe(false)
    reopened.unmount()
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

  it('reports stale status and closes from an icon-only button', async () => {
    const wrapper = mount(AiDocGraphPanel)
    expect(wrapper.text()).toContain('aidoc.syncStale 3')
    expect(wrapper.text()).toContain('aidoc.syncPending 1')
    store.status.ingestAvailable = true
    await flushPromises()
    expect(wrapper.text()).toContain('aidoc.syncPending 4')
    const graph = wrapper.getComponent({ name: 'AiDocGraph' })
    graph.vm.$emit('select', unresolved)
    expect(wrapper.emitted('open-file')).toBeUndefined()
    graph.vm.$emit('select', doc)
    expect(wrapper.emitted('open-file')).toEqual([[{ path: doc.path, name: doc.name }]])
    const close = wrapper.get('[data-testid="aidoc-graph-close"]')
    expect(close.attributes('aria-label')).toBe('aidoc.closeGraph')
    expect(close.text()).toBe('')
    await close.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('opens at the center of the viewport and can move and resize', async () => {
    const wrapper = mount(AiDocGraphPanel, { attachTo: document.body })
    try {
      await nextTick()
      const { style } = wrapper.element
      const width = Math.round(window.innerWidth * 0.84)
      const height = Math.round(window.innerHeight * 0.86)
      expect(style.width).toBe(width + 'px')
      expect(style.height).toBe(height + 'px')
      expect(parseFloat(style.left) * 2 + width).toBe(window.innerWidth)
      expect(parseFloat(style.top) * 2 + height).toBe(window.innerHeight)
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

  it('keeps search in the title bar and maximizes to the whole viewport and back', async () => {
    const wrapper = mount(AiDocGraphPanel, { attachTo: document.body })
    try {
      await nextTick()
      expect(wrapper.find('.graph-titlebar input[type="search"]').exists()).toBe(true)
      const { style } = wrapper.element
      const frame = () => [style.left, style.top, style.width, style.height]
      const initial = frame()
      const maximize = () => wrapper.get('[data-testid="aidoc-graph-maximize"]')
      expect(maximize().attributes('aria-label')).toBe('titlebar.maximize')

      await maximize().trigger('click')
      expect(frame()).toEqual(['0px', '0px', '100%', '100%'])
      expect(maximize().attributes('aria-label')).toBe('titlebar.restore')
      expect(wrapper.find('.graph-resize-button').exists()).toBe(false)
      await wrapper.get('.graph-drag-handle').trigger('keydown', { key: 'ArrowRight' })
      expect(frame()).toEqual(['0px', '0px', '100%', '100%'])

      await maximize().trigger('click')
      expect(frame()).toEqual(initial)
      await wrapper.get('.graph-titlebar').trigger('dblclick')
      expect(style.width).toBe('100%')
      await wrapper.get('.graph-drag-handle').trigger('dblclick')
      expect(frame()).toEqual(initial)
      await wrapper.get('.graph-search input').trigger('dblclick')
      expect(frame()).toEqual(initial)
    } finally {
      wrapper.unmount()
    }
  })

  it('sits inside its container when embedded, without window chrome', async () => {
    const wrapper = mount(AiDocGraphPanel, { props: { embedded: true }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.classes()).toContain('is-embedded')
    expect(wrapper.attributes('style')).toBeUndefined()
    for (const selector of ['.graph-drag-handle', '.graph-window-controls', '.graph-resize-button']) {
      expect(wrapper.find(selector).exists()).toBe(false)
    }
    await wrapper.get('.graph-titlebar').trigger('dblclick')
    expect(wrapper.attributes('style')).toBeUndefined()

    // Escape clears a search first, so it does not reach the surrounding window.
    const outer = vi.fn()
    document.body.addEventListener('keydown', outer)
    const search = wrapper.get('.graph-search input')
    await search.setValue('a')
    await search.trigger('keydown', { key: 'Escape' })
    expect(search.element.value).toBe('')
    expect(outer).not.toHaveBeenCalled()
    await search.trigger('keydown', { key: 'Escape' })
    expect(outer).toHaveBeenCalledOnce()
    document.body.removeEventListener('keydown', outer)
    wrapper.unmount()
  })

  it('filters orphan nodes and document types', async () => {
    const wrapper = mount(AiDocGraphPanel)
    await flushPromises()
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
