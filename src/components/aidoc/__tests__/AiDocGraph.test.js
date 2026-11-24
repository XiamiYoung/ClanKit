// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Group, Mesh, PerspectiveCamera } from 'three'
import ForceGraph3D from '3d-force-graph'
import AiDocGraph from '../AiDocGraph.vue'
import { DIM_OPACITY, HOVER_SCALE, LABEL_CAP, nodeRadius } from '../../../utils/graph3d'

vi.mock('3d-force-graph', () => ({ default: vi.fn() }))
vi.mock('three-spritetext', async () => {
  const { Sprite, SpriteMaterial } = await import('three')
  class SpriteTextStub extends Sprite {
    constructor(text, textHeight, color) {
      super(new SpriteMaterial())
      this.text = text
      this.textHeight = textHeight
      this.color = color
    }
  }
  return { default: SpriteTextStub }
})
vi.mock('../../../i18n/useI18n', () => ({ useI18n: () => ({ t: key => key }) }))

const CHAINABLE = [
  'graphData', 'width', 'height', 'backgroundColor', 'showNavInfo', 'nodeLabel', 'nodeResolution',
  'nodeThreeObject', 'linkWidth', 'linkMaterial', 'lights', 'warmupTicks', 'cooldownTicks',
  'onNodeHover', 'onNodeClick', 'onEngineTick', 'onEngineStop', 'zoomToFit', 'cameraPosition',
  'pauseAnimation', 'resumeAnimation', '_destructor',
]

describe('AiDocGraph', () => {
  let instance
  let observer
  let onResize
  let camera
  let controls
  let renderer

  const mountGraph = (graph, extra = {}) => mount(AiDocGraph, { props: { graph, ...extra } })
  const doc = (id, extra = {}) => ({ id, kind: 'doc', degree: 1, title: `Title ${id}`, group: 'notes', ...extra })
  // Build the objects the library would request for the node data that was passed to graphData().
  const buildObjects = () => instance.graphData.mock.lastCall[0].nodes.map(node => {
    node.__threeObj = instance.nodeThreeObject.mock.lastCall[0](node)
    return node
  })
  const sphereOf = node => node.__threeObj.children.find(child => child instanceof Mesh)
  const labelOf = node => node.__threeObj.children.find(child => child.isSprite)

  beforeEach(() => {
    instance = {}
    for (const name of CHAINABLE) instance[name] = vi.fn().mockReturnValue(instance)
    camera = new PerspectiveCamera(50)
    camera.position.set(0, 0, 100)
    controls = { addEventListener: vi.fn() }
    renderer = { forceContextLoss: vi.fn() }
    instance.camera = vi.fn(() => camera)
    instance.controls = vi.fn(() => controls)
    instance.renderer = vi.fn(() => renderer)
    instance.getGraphBbox = vi.fn(() => ({ x: [-50, 50], y: [-50, 50], z: [-50, 50] }))
    instance.lights = vi.fn(function (lights) { return lights ? instance : [{ position: { set: vi.fn() } }, { position: { set: vi.fn() } }] })
    vi.mocked(ForceGraph3D).mockClear().mockImplementation(function () { return instance })
    observer = { observe: vi.fn(), disconnect: vi.fn() }
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) {
        onResize = callback
        return observer
      }
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('creates an orbit-controlled transparent 3D instance, supplies cloned graph data, emits selections and cleans up', async () => {
    const first = doc('a')
    const second = doc('b')
    const graph = { nodes: [first, second], links: [{ source: 'a', target: 'b' }] }
    const wrapper = mountGraph(graph)
    const mountPoint = wrapper.find('.aidoc-graph-canvas').element

    expect(ForceGraph3D).toHaveBeenCalledExactlyOnceWith(mountPoint, expect.objectContaining({
      controlType: 'orbit',
      rendererConfig: expect.objectContaining({ alpha: true }),
    }))
    expect(instance.backgroundColor).toHaveBeenCalledWith('rgba(0, 0, 0, 0)')
    expect(instance.nodeLabel).toHaveBeenCalledWith('')
    expect(instance.cooldownTicks).toHaveBeenCalled()
    expect(instance.warmupTicks).toHaveBeenCalled()
    expect(controls.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    const data = instance.graphData.mock.lastCall[0]
    expect(data).toEqual(graph)
    expect(data.nodes[0]).not.toBe(first)
    expect(data.links[0]).not.toBe(graph.links[0])
    instance.onNodeClick.mock.lastCall[0](data.nodes[0])
    expect(wrapper.emitted('select')).toEqual([[first]])

    Object.assign(data.nodes[0], { x: 42, y: 1, z: -7 })
    await wrapper.setProps({ graph: { nodes: [{ ...first }], links: [] } })
    expect(instance.graphData).toHaveBeenCalledTimes(2)
    const next = instance.graphData.mock.lastCall[0].nodes[0]
    expect([next.x, next.y, next.z]).toEqual([42, 1, -7])
    expect(first.x).toBeUndefined()
    expect(observer.observe).toHaveBeenCalledExactlyOnceWith(mountPoint)

    Object.defineProperties(mountPoint, {
      clientWidth: { value: 640 },
      clientHeight: { value: 360 },
    })
    onResize()
    expect(instance.width).toHaveBeenLastCalledWith(640)
    expect(instance.height).toHaveBeenLastCalledWith(360)
    wrapper.unmount()
    expect(instance.pauseAnimation).toHaveBeenCalled()
    expect(instance._destructor).toHaveBeenCalledOnce()
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce()
    expect(observer.disconnect).toHaveBeenCalledOnce()
  })

  it('builds shaded spheres sized by degree and coloured by node type', () => {
    const colors = { notes: '#336699' }
    const graph = {
      nodes: [doc('a', { degree: 4 }), { id: 'u', kind: 'unresolved', degree: 0 }, { id: 'm', kind: 'ambiguous', degree: 0 }],
      links: [],
    }
    const wrapper = mountGraph(graph, { colors })
    const [a, u, m] = buildObjects()

    expect(a.__threeObj).toBeInstanceOf(Group)
    expect(sphereOf(a).geometry.type).toBe('SphereGeometry')
    expect(sphereOf(a).geometry.parameters.radius).toBe(nodeRadius({ kind: 'doc', degree: 4 }))
    expect(sphereOf(a).material.type).toBe('MeshLambertMaterial')
    expect(sphereOf(a).material.color.getHexString()).toBe('336699')
    expect(sphereOf(u).material.color.getHexString()).toBe('687281')
    expect(sphereOf(m).geometry.type).toBe('OctahedronGeometry')
    wrapper.unmount()
  })

  it('shows hovered labels with a depth-test-free sprite that cannot be picked, and highlights the hovered node', () => {
    const wrapper = mountGraph({ nodes: [doc('a'), doc('b'), doc('c')], links: [{ source: 'a', target: 'b' }] })
    const [a, b, c] = buildObjects()
    const links = instance.graphData.mock.lastCall[0].links
    links.forEach(link => { link.source = a; link.target = b })
    // Place nodes far from the camera so that only hovered / matched labels pass the distance fade.
    for (const node of [a, b, c]) Object.assign(node, { x: 0, y: 0, z: -5000 })
    instance.onNodeHover.mock.lastCall[0](a)

    expect(labelOf(a).text).toBe('Title a')
    expect(labelOf(a).visible).toBe(true)
    expect(labelOf(a).material.opacity).toBe(1)
    expect(labelOf(a).material.depthTest).toBe(false)
    expect(labelOf(a).material.depthWrite).toBe(false)
    expect(labelOf(a).raycast()).toBeUndefined()
    expect(labelOf(c)).toBeUndefined()
    expect(sphereOf(a).scale.x).toBe(HOVER_SCALE)
    expect(sphereOf(a).material.emissiveIntensity).toBeGreaterThan(0)
    expect(sphereOf(b).material.opacity).toBe(1)
    expect(sphereOf(c).material.opacity).toBe(DIM_OPACITY)
    expect(sphereOf(c).material.transparent).toBe(true)

    instance.onNodeHover.mock.lastCall[0](null)
    expect(sphereOf(a).scale.x).toBe(1)
    expect(sphereOf(c).material.opacity).toBe(1)
    expect(labelOf(a).visible).toBe(false)
    wrapper.unmount()
  })

  it('dims links that do not touch the hovered node by swapping shared materials', () => {
    const wrapper = mountGraph({ nodes: [doc('a'), doc('b'), doc('c')], links: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }] })
    const [a, b, c] = buildObjects()
    const links = instance.graphData.mock.lastCall[0].links
    const lineObjects = links.map(() => ({ material: null }))
    links.forEach((link, i) => { link.source = [a, b][i]; link.target = [b, c][i]; link.__lineObj = lineObjects[i] })
    const linkMaterial = instance.linkMaterial.mock.lastCall[0]
    expect(instance.linkWidth).toHaveBeenCalledWith(0)
    const normal = linkMaterial(links[0])
    expect(normal.opacity).toBeCloseTo(0.36)
    expect(normal.transparent).toBe(true)

    instance.onNodeHover.mock.lastCall[0](a)
    expect(lineObjects[0].material.opacity).toBeCloseTo(0.75)
    expect(lineObjects[1].material.opacity).toBeCloseTo(0.1)
    instance.onNodeHover.mock.lastCall[0](null)
    expect(lineObjects[1].material).toBe(normal)
    wrapper.unmount()
  })

  it('highlights search matches without updating the simulation data and labels them first', async () => {
    const node = doc('a', { degree: 0 })
    const other = doc('b', { degree: 0 })
    const wrapper = mountGraph({ nodes: [node, other], links: [] })
    const [a, b] = buildObjects()
    for (const n of [a, b]) Object.assign(n, { x: 0, y: 0, z: -5000 })
    await wrapper.setProps({ graph: { nodes: [{ ...node, matched: true }, other], links: [] }, highlightQuery: true })

    expect(instance.graphData).toHaveBeenCalledOnce()
    expect(sphereOf(a).material.opacity).toBe(1)
    expect(sphereOf(a).material.emissiveIntensity).toBeGreaterThan(0)
    expect(sphereOf(b).material.opacity).toBe(DIM_OPACITY)
    expect(labelOf(a).visible).toBe(true)
    expect(labelOf(b)).toBeUndefined()

    await wrapper.setProps({ highlightQuery: false })
    expect(sphereOf(b).material.opacity).toBe(1)
    expect(labelOf(a).visible).toBe(false)
    wrapper.unmount()
  })

  it('never shows more than the label cap, matched nodes first', async () => {
    const nodes = Array.from({ length: LABEL_CAP + 40 }, (_, i) => doc(`n${i}`, { degree: i }))
    const wrapper = mountGraph({ nodes, links: [] })
    const objects = buildObjects()
    objects.forEach(node => Object.assign(node, { x: 0, y: 0, z: 0 }))
    camera.position.set(0, 0, 1)
    const matchedIds = new Set(['n0', 'n1'])
    await wrapper.setProps({
      graph: { nodes: nodes.map(node => ({ ...node, matched: matchedIds.has(node.id) })), links: [] },
      highlightQuery: true,
    })
    const matched = objects.filter(node => matchedIds.has(node.id))
    expect(matched.map(node => labelOf(node)?.material.opacity)).toEqual([1, 1])
    const faint = objects.filter(node => !matchedIds.has(node.id) && labelOf(node)?.visible)
    expect(faint.length).toBeLessThanOrEqual(LABEL_CAP - 2)
    expect(faint.every(node => labelOf(node).material.opacity < 0.3)).toBe(true)

    await wrapper.setProps({ highlightQuery: false })
    const shown = objects.filter(node => labelOf(node)?.visible)
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThanOrEqual(LABEL_CAP)
    // High-degree nodes win the slots.
    expect(shown.every(node => Number(node.id.slice(1)) >= 40)).toBe(true)
    wrapper.unmount()
  })

  it('fits the camera once after the engine settles and respects reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const wrapper = mountGraph({ nodes: [doc('a'), doc('b')], links: [] })
    expect(instance.cameraPosition).toHaveBeenCalledWith(expect.objectContaining({ z: expect.any(Number) }), expect.anything(), 0)
    const stop = instance.onEngineStop.mock.lastCall[0]
    stop()
    stop()
    expect(instance.zoomToFit).toHaveBeenCalledExactlyOnceWith(450, 44)
    wrapper.unmount()

    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const reduced = mountGraph({ nodes: [doc('a'), doc('b')], links: [] })
    instance.onEngineStop.mock.lastCall[0]()
    expect(instance.zoomToFit).toHaveBeenLastCalledWith(0, 44)
    reduced.unmount()
  })

  it('pauses rendering while the container has no size and resumes when it is shown again', () => {
    const wrapper = mountGraph({ nodes: [doc('a')], links: [] })
    const mountPoint = wrapper.find('.aidoc-graph-canvas').element
    onResize()
    expect(instance.pauseAnimation).toHaveBeenCalledOnce()
    Object.defineProperties(mountPoint, { clientWidth: { value: 300 }, clientHeight: { value: 200 } })
    onResize()
    expect(instance.resumeAnimation).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('shows an inline message instead of crashing when WebGL cannot be created', async () => {
    vi.mocked(ForceGraph3D).mockImplementation(function () { throw new Error('Error creating WebGL context.') })
    const wrapper = mountGraph({ nodes: [doc('a')], links: [] })
    await nextTick()
    expect(wrapper.get('[role="alert"]').text()).toBe('aidoc.graphWebglUnavailable')
    await wrapper.setProps({ graph: { nodes: [doc('a'), doc('b')], links: [] } })
    wrapper.unmount()
    expect(instance._destructor).not.toHaveBeenCalled()
  })
})
