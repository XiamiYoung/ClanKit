// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ForceGraph from 'force-graph'
import AiDocGraph2D from '../AiDocGraph2D.vue'

vi.mock('force-graph', () => ({ default: vi.fn() }))
vi.mock('../../../i18n/useI18n', () => ({ useI18n: () => ({ t: key => key }) }))

const CHAINABLE = [
  'graphData', 'width', 'height', 'backgroundColor', 'nodeLabel', 'nodeCanvasObject', 'nodePointerAreaPaint',
  'linkCanvasObject', 'onRenderFramePre', 'onRenderFramePost', 'cooldownTicks', 'enableNodeDrag', 'onNodeHover',
  'onNodeClick', 'centerAt', 'zoom', 'minZoom', 'maxZoom', 'pauseAnimation', 'resumeAnimation', '_destructor',
]

// Records what is drawn, since happy-dom has no 2D canvas.
function fakeContext() {
  const calls = []
  const context = { calls, measureText: text => ({ width: text.length * 6 }), createLinearGradient: () => ({ stops: [], addColorStop(at, color) { this.stops.push(color) } }) }
  for (const name of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'rect', 'fill', 'stroke', 'strokeText', 'fillText', 'setTransform']) {
    context[name] = (...args) => calls.push([name, ...args, name === 'stroke' ? context.strokeStyle : context.globalAlpha])
  }
  return context
}

describe('AiDocGraph2D', () => {
  let instance
  const doc = (id, group, extra = {}) => ({ id, kind: 'doc', degree: 1, title: `Title ${id}`, group, ...extra })
  const graph = {
    nodes: [doc('wiki/a.md', 'One'), doc('kb_source/b.pdf', 'Two')],
    links: [{ source: 'wiki/a.md', target: 'kb_source/b.pdf' }],
  }
  const colors = { One: '#ff0000', Two: '#0000ff' }
  const mountGraph = () => mount(AiDocGraph2D, { props: { graph, colors } })
  const last = name => instance[name].mock.lastCall[0]

  beforeEach(() => {
    instance = {}
    for (const name of CHAINABLE) instance[name] = vi.fn().mockReturnValue(instance)
    instance.graph2ScreenCoords = vi.fn((x, y) => ({ x: x * 2, y: y * 2 }))
    vi.mocked(ForceGraph).mockClear().mockImplementation(function () { return instance })
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('uses the 2D library with a fixed category layout and cleans up', () => {
    const wrapper = mountGraph()
    const data = last('graphData')
    expect(data.nodes.map(node => node.id)).toEqual(graph.nodes.map(node => node.id))
    expect(data.nodes[0]).not.toBe(graph.nodes[0])
    expect(data.nodes.every(node => Number.isFinite(node.x) && node.fx === node.x && node.fy === node.y)).toBe(true)
    expect(instance.enableNodeDrag).toHaveBeenCalledWith(false)

    last('onNodeClick')(data.nodes[0])
    expect(wrapper.emitted('select')).toEqual([[graph.nodes[0]]])
    wrapper.unmount()
    expect(instance._destructor).toHaveBeenCalledOnce()
  })

  it('frames all regions as soon as the canvas has a size, and only once per data set', () => {
    let onResize
    vi.stubGlobal('ResizeObserver', class { constructor(callback) { onResize = callback } observe() {} disconnect() {} })
    const wrapper = mountGraph()
    expect(instance.zoom).not.toHaveBeenCalled()
    Object.defineProperties(wrapper.get('.aidoc-graph2d-canvas').element, { clientWidth: { value: 800 }, clientHeight: { value: 600 } })
    onResize()
    onResize()
    expect(instance.centerAt).toHaveBeenCalledOnce()
    expect(instance.zoom).toHaveBeenCalledOnce()
    expect(last('zoom')).toBeGreaterThan(0)
    expect(last('maxZoom')).toBeCloseTo(last('zoom') * 6)
    wrapper.unmount()
  })

  it('keeps the same relative zoom when the canvas is resized, for example when maximized', () => {
    let onResize
    vi.stubGlobal('ResizeObserver', class { constructor(callback) { onResize = callback } observe() {} disconnect() {} })
    let current = 1
    instance.zoom = vi.fn(next => next === undefined ? current : (current = next, instance))
    const wrapper = mountGraph()
    let size = 400
    const element = wrapper.get('.aidoc-graph2d-canvas').element
    Object.defineProperties(element, { clientWidth: { get: () => size * 10 }, clientHeight: { get: () => size } })
    onResize()
    const fitted = current
    current = fitted * 2
    size = 800
    onResize()
    expect(current).toBeGreaterThan(fitted * 4)
    expect(last('maxZoom')).toBeCloseTo(current * 3)
    expect(instance.centerAt).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('does not frame a canvas that is still too small, which would mirror the drawing', () => {
    let onResize
    vi.stubGlobal('ResizeObserver', class { constructor(callback) { onResize = callback } observe() {} disconnect() {} })
    const wrapper = mountGraph()
    Object.defineProperties(wrapper.get('.aidoc-graph2d-canvas').element, { clientWidth: { value: 40 }, clientHeight: { value: 600 } })
    onResize()
    expect(instance.zoom).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('writes text at a fixed pixel size whatever the zoom, naming only key nodes until zoomed in', () => {
    const wrapper = mount(AiDocGraph2D, {
      props: { graph: { nodes: Array.from({ length: 8 }, (_, i) => doc(`wiki/${i}.md`, 'One', { degree: 8 - i })), links: [] }, colors },
    })
    for (const [i, node] of last('graphData').nodes.entries()) Object.assign(node, { x: i * 500, y: 0 })
    const written = scale => {
      const ctx = fakeContext()
      last('onRenderFramePost')(ctx, scale)
      expect(ctx.calls.find(call => call[0] === 'setTransform').slice(1, 5)).toEqual([1, 0, 0, 1])
      expect(ctx.font).toMatch(/^700 14px/)
      expect(ctx.direction).toBe('ltr')
      expect(ctx.letterSpacing).toBe('0px')
      return ctx.calls.filter(call => call[0] === 'fillText' && call[1].startsWith('Title')).length
    }
    expect(written(0.5)).toBe(3)
    expect(written(40)).toBe(8)
    wrapper.unmount()
  })

  it('draws sources as squares, pages as circles, gradient links, region names and node names', () => {
    const wrapper = mountGraph()
    const { nodes } = last('graphData')
    const ctx = fakeContext()
    const names = () => ctx.calls.map(call => call[0])

    last('nodeCanvasObject')(nodes[0], ctx)
    expect(names()).toContain('arc')
    expect(names()).not.toContain('rect')
    ctx.calls.length = 0
    last('nodeCanvasObject')(nodes[1], ctx)
    expect(names()).toContain('rect')

    ctx.calls.length = 0
    last('linkCanvasObject')({ source: nodes[0], target: nodes[1] }, ctx, 1)
    expect(ctx.calls.find(call => call[0] === 'stroke').at(-1).stops).toEqual(['#ff0000', '#0000ff'])

    ctx.calls.length = 0
    last('onRenderFramePost')(ctx, 1)
    const written = ctx.calls.filter(call => call[0] === 'fillText').map(call => call[1])
    expect(written).toEqual(expect.arrayContaining(['One · 1', 'Two · 1', 'Title wiki/a.md']))
    wrapper.unmount()
  })

  it('fades everything that is not next to the hovered node', async () => {
    const wrapper = mount(AiDocGraph2D, {
      props: { graph: { nodes: [...graph.nodes, doc('wiki/c.md', 'One')], links: graph.links }, colors },
    })
    const { nodes } = last('graphData')
    last('onNodeHover')(nodes[0])
    const alphaOf = node => {
      const ctx = fakeContext()
      last('nodeCanvasObject')(node, ctx)
      return ctx.calls.find(call => call[0] === 'fill').at(-1)
    }
    expect([alphaOf(nodes[0]), alphaOf(nodes[1]), alphaOf(nodes[2])]).toEqual([1, 1, 0.15])
    wrapper.unmount()
  })
})
