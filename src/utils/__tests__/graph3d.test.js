// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import {
  createContainmentForce, hubIds, LABEL_MAX_CHARS, NODE_FALLBACK, NODE_PLACEHOLDER,
  initialCameraDistance, labelText, nodeRadius, resolveNodeColor,
} from '../graph3d'

describe('graph3d hubs', () => {
  const nodes = degrees => degrees.map((degree, index) => ({ id: 'n' + index, degree }))

  it('marks only the best connected nodes as hubs', () => {
    expect(hubIds(nodes([40, 30, ...Array(23).fill(6)]))).toEqual(new Set(['n0', 'n1']))
    expect(hubIds(nodes([4, 3, 2, 1]))).toEqual(new Set())
  })
})

describe('graph3d containment force', () => {
  const at = (x, degree) => ({ x, y: 0, z: 0, vx: 5, vy: 0, vz: 0, degree })

  it('pulls far-away nodes back to the edge of the connected cluster', () => {
    const linked = [at(-100, 1), at(100, 1), at(0, 2)]
    const orphan = at(2000, 0)
    const near = at(40, 0)
    const force = createContainmentForce()
    force.initialize([...linked, orphan, near])
    force(1)

    expect(orphan.x).toBeCloseTo(100 * 1.15 + 15)
    expect(orphan.vx).toBe(0)
    expect(near).toMatchObject({ x: 40, vx: 5 })
    expect(linked.map(node => node.x)).toEqual([-100, 100, 0])
  })

  it('leaves a graph without any links alone', () => {
    const nodes = [at(-900, 0), at(900, 0)]
    const force = createContainmentForce()
    force.initialize(nodes)
    force(1)
    expect(nodes.map(node => node.x)).toEqual([-900, 900])
  })
})

describe('graph3d helpers', () => {
  it('maps degree to a radius, with documents larger than placeholders and growth capped', () => {
    expect(nodeRadius({ kind: 'doc', degree: 0 })).toBe(4.5)
    expect(nodeRadius({ kind: 'doc', degree: 4 })).toBe(6.5)
    expect(nodeRadius({ kind: 'unresolved', degree: 4 })).toBe(4.2)
    expect(nodeRadius({ kind: 'doc' })).toBe(4.5)
    expect(nodeRadius({ kind: 'doc', degree: 10000 })).toBe(10.5)
  })

  it('resolves node colours from group colours with fallbacks', () => {
    const colors = { notes: '#112233' }
    expect(resolveNodeColor({ kind: 'doc', group: 'notes' }, colors)).toBe('#112233')
    expect(resolveNodeColor({ kind: 'doc', group: 'other' }, colors)).toBe(NODE_FALLBACK)
    expect(resolveNodeColor({ kind: 'doc', group: 'notes' })).toBe(NODE_FALLBACK)
    expect(resolveNodeColor({ kind: 'unresolved', group: 'notes' }, colors)).toBe(NODE_PLACEHOLDER)
  })

  it('builds label text from title, name or id and truncates by code point', () => {
    expect(labelText({ id: 'a', title: 'Title', name: 'Name' })).toBe('Title')
    expect(labelText({ id: 'a', name: 'Name' })).toBe('Name')
    expect(labelText({ id: 'a' })).toBe('a')
    const long = '知'.repeat(60)
    const text = labelText({ id: 'a', title: long })
    expect(Array.from(text)).toHaveLength(LABEL_MAX_CHARS - 2)
    expect(text.endsWith('…')).toBe(true)
  })

  it('derives camera distances', () => {
    expect(initialCameraDistance(0)).toBeCloseTo(128)
    expect(initialCameraDistance(1000)).toBeCloseTo(470)
    expect(initialCameraDistance(1e9)).toBe(1200)
  })
})

describe('3D graph dependencies', () => {
  it('resolves 3d-force-graph and three-spritetext under the Vite config without building WebGL', async () => {
    const forceGraph = await import('3d-force-graph')
    const spriteText = await import('three-spritetext')
    expect(typeof forceGraph.default).toBe('function')
    expect(typeof spriteText.default).toBe('function')
  })
})
