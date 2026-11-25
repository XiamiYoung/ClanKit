// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BufferGeometry, Color, Group, Mesh, PerspectiveCamera } from 'three'
import ForceGraph3D from '3d-force-graph'
import AiDocGraph from '../AiDocGraph.vue'
import { DIM_OPACITY, DIMMED_LABEL_FACTOR, HOVER_SCALE, nodeRadius } from '../../../utils/graph3d'

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
  'nodeThreeObject', 'linkWidth', 'linkMaterial', 'linkPositionUpdate', 'lights', 'warmupTicks', 'cooldownTicks',
  'onNodeHover', 'onNodeClick', 'onEngineTick', 'onEngineStop', 'zoomToFit', 'cameraPosition',
  'pauseAnimation', 'resumeAnimation', '_destructor', 'd3Force',
]

describe('AiDocGraph', () => {
  let instance
  let forces
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
    forces = { charge: { strength: vi.fn() }, link: { distance: vi.fn() } }
    instance.d3Force = vi.fn((name, force) => force ? instance : forces[name])
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

  it('pads labels so tall glyphs and their outline are not clipped', () => {
    const wrapper = mountGraph({ nodes: [doc('a'), doc('b')], links: [] })
    const nodes = buildObjects()
    expect(labelOf(nodes[0]).padding).toEqual([1.25, 1.25])
    wrapper.unmount()
  })

  it('spreads nodes further apart than the library defaults', () => {
    const wrapper = mountGraph({ nodes: [doc('a')], links: [] })
    expect(forces.charge.strength.mock.lastCall[0]).toBeLessThan(-30)
    expect(forces.link.distance.mock.lastCall[0]).toBeGreaterThan(30)
    wrapper.unmount()
  })

  it('puts a glow behind hub nodes only, beneath the labels', () => {
    const wrapper = mountGraph({ nodes: [doc('hub', { degree: 30 }), doc('leaf')], links: [] })
    const [hub, leaf] = buildObjects()
    const glowOf = node => node.__threeObj.children.find(child => child.name === 'glow')

    expect(glowOf(leaf)).toBeUndefined()
    expect(glowOf(hub).material.depthWrite).toBe(false)
    expect(glowOf(hub).renderOrder).toBeLessThan(20)
    wrapper.unmount()
  })

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

  it('labels every node without hovering, however many there are or however far they sit', () => {
    const wrapper = mountGraph({ nodes: Array.from({ length: 150 }, (_, i) => doc(`n${i}`, { degree: 0 })), links: [] })
    const objects = buildObjects()
    for (const node of objects) Object.assign(node, { x: 0, y: 0, z: -5000 })

    expect(objects.every(node => labelOf(node).visible && labelOf(node).material.opacity === 1)).toBe(true)
    wrapper.unmount()
  })

  it('draws labels as depth-test-free sprites that cannot be picked, and highlights the hovered node', () => {
    const wrapper = mountGraph({ nodes: [doc('a'), doc('b'), doc('c')], links: [{ source: 'a', target: 'b' }] })
    const [a, b, c] = buildObjects()
    const links = instance.graphData.mock.lastCall[0].links
    links.forEach(link => { link.source = a; link.target = b })
    instance.onNodeHover.mock.lastCall[0](a)

    expect(labelOf(a).text).toBe('Title a')
    expect(labelOf(a).visible).toBe(true)
    expect(labelOf(a).material.opacity).toBe(1)
    expect(labelOf(a).material.depthTest).toBe(false)
    expect(labelOf(a).material.depthWrite).toBe(false)
    expect(labelOf(a).raycast()).toBeUndefined()
    expect(labelOf(c).material.opacity).toBe(DIMMED_LABEL_FACTOR)
    expect(sphereOf(a).scale.x).toBe(HOVER_SCALE)
    expect(sphereOf(a).material.emissiveIntensity).toBeGreaterThan(0)
    expect(sphereOf(b).material.opacity).toBe(1)
    expect(sphereOf(c).material.opacity).toBe(DIM_OPACITY)
    expect(sphereOf(c).material.transparent).toBe(true)

    instance.onNodeHover.mock.lastCall[0](null)
    expect(sphereOf(a).scale.x).toBe(1)
    expect(sphereOf(c).material.opacity).toBe(1)
    expect(labelOf(c).material.opacity).toBe(1)
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
    expect(normal.opacity).toBeCloseTo(0.4)
    expect(normal.vertexColors).toBe(true)
    expect(normal.transparent).toBe(true)

    instance.onNodeHover.mock.lastCall[0](a)
    expect(lineObjects[0].material.opacity).toBeCloseTo(0.85)
    expect(lineObjects[1].material.opacity).toBeCloseTo(0.08)
    instance.onNodeHover.mock.lastCall[0](null)
    expect(lineObjects[1].material).toBe(normal)
    wrapper.unmount()
  })

  it('blends each link from the colour of one end to the other and repaints when colours change', async () => {
    const nodes = [doc('a', { group: 'one' }), doc('b', { group: 'two' })]
    const wrapper = mountGraph({ nodes, links: [{ source: 'a', target: 'b' }] }, { colors: { one: '#ff0000', two: '#0000ff' } })
    const [link] = instance.graphData.mock.lastCall[0].links
    link.__lineObj = { geometry: new BufferGeometry() }
    const colorsOf = () => [...link.__lineObj.geometry.getAttribute('color').array].map(value => Number(value.toFixed(4)))
    const expected = (...hexes) => hexes.flatMap(hex => new Color(hex).toArray()).map(value => Number(value.toFixed(4)))

    // Returning false lets the library keep positioning the line.
    expect(instance.linkPositionUpdate.mock.lastCall[0](link.__lineObj, {}, link)).toBe(false)
    expect(colorsOf()).toEqual(expected('#ff0000', '#0000ff'))

    await wrapper.setProps({ colors: { one: '#00ff00', two: '#0000ff' } })
    expect(colorsOf()).toEqual(expected('#00ff00', '#0000ff'))
    wrapper.unmount()
  })

  it('highlights search matches without updating the simulation data and fades the other labels', async () => {
    const node = doc('a', { degree: 0 })
    const other = doc('b', { degree: 0 })
    const wrapper = mountGraph({ nodes: [node, other], links: [] })
    const [a, b] = buildObjects()
    await wrapper.setProps({ graph: { nodes: [{ ...node, matched: true }, other], links: [] }, highlightQuery: true })

    expect(instance.graphData).toHaveBeenCalledOnce()
    expect(sphereOf(a).material.opacity).toBe(1)
    expect(sphereOf(a).material.emissiveIntensity).toBeGreaterThan(0)
    expect(sphereOf(b).material.opacity).toBe(DIM_OPACITY)
    expect(labelOf(a).material.opacity).toBe(1)
    expect(labelOf(b).material.opacity).toBe(DIMMED_LABEL_FACTOR)

    await wrapper.setProps({ highlightQuery: false })
    expect(sphereOf(b).material.opacity).toBe(1)
    expect(labelOf(b).material.opacity).toBe(1)
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
