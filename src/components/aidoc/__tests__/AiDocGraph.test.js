// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ForceGraph from 'force-graph'
import AiDocGraph from '../AiDocGraph.vue'

vi.mock('force-graph', () => ({ default: vi.fn() }))

describe('AiDocGraph', () => {
  let instance
  let observer
  let onResize

  beforeEach(() => {
    instance = {}
    for (const name of [
      'graphData', 'width', 'height', 'autoPauseRedraw', 'backgroundColor', 'nodeLabel',
      'nodeCanvasObject', 'nodePointerAreaPaint', 'linkColor', 'linkWidth',
      'linkDirectionalParticles', 'linkDirectionalParticleColor',
      'linkDirectionalParticleWidth', 'linkDirectionalParticleSpeed',
      'onNodeHover', 'onNodeClick', 'onEngineStop', 'zoomToFit', '_destructor',
    ]) {
      instance[name] = vi.fn().mockReturnValue(instance)
    }
    vi.mocked(ForceGraph).mockClear().mockImplementation(function () { return instance })
    observer = { observe: vi.fn(), disconnect: vi.fn() }
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) {
        onResize = callback
        return observer
      }
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('creates an instance, supplies cloned graph data, emits selections and destroys it', async () => {
    const first = { id: 'a', kind: 'doc', degree: 1 }
    const second = { id: 'b', kind: 'doc', degree: 1 }
    const graph = { nodes: [first, second], links: [{ source: 'a', target: 'b' }] }
    const wrapper = mount(AiDocGraph, { props: { graph } })

    expect(ForceGraph).toHaveBeenCalledExactlyOnceWith(wrapper.element)
    const data = instance.graphData.mock.lastCall[0]
    expect(data).toEqual(graph)
    expect(data.nodes[0]).not.toBe(first)
    expect(data.links[0]).not.toBe(graph.links[0])
    instance.onNodeClick.mock.lastCall[0](data.nodes[0])
    expect(wrapper.emitted('select')).toEqual([[first]])

    data.nodes[0].x = 42
    await wrapper.setProps({ graph: { nodes: [{ ...first }], links: [] } })
    expect(instance.graphData).toHaveBeenCalledTimes(2)
    expect(instance.graphData.mock.lastCall[0].nodes[0].x).toBe(42)
    expect(first.x).toBeUndefined()
    expect(observer.observe).toHaveBeenCalledExactlyOnceWith(wrapper.element)
    Object.defineProperties(wrapper.element, {
      clientWidth: { value: 640 },
      clientHeight: { value: 360 },
    })
    onResize()
    expect(instance.width).toHaveBeenLastCalledWith(640)
    expect(instance.height).toHaveBeenLastCalledWith(360)
    wrapper.unmount()
    expect(instance._destructor).toHaveBeenCalledOnce()
    expect(observer.disconnect).toHaveBeenCalledOnce()
  })

  it('highlights matches without updating the simulation data', async () => {
    const node = { id: 'a', kind: 'doc', degree: 0 }
    const wrapper = mount(AiDocGraph, { props: { graph: { nodes: [node], links: [] } } })
    await wrapper.setProps({ graph: { nodes: [{ ...node, matched: true }], links: [] }, highlightQuery: true })
    expect(instance.graphData).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
