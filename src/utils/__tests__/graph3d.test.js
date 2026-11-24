// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import {
  DIMMED_LABEL_FACTOR, LABEL_CAP, LABEL_MAX_CHARS, NODE_FALLBACK, NODE_PLACEHOLDER,
  fitDistanceFor, initialCameraDistance, labelFade, labelPriority, labelText, nodeRadius,
  resolveNodeColor, selectLabels, splitRgba,
} from '../graph3d'

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

  it('splits rgba strings into an opaque colour plus opacity', () => {
    expect(splitRgba('rgba(91, 110, 136, 0.36)')).toEqual({ color: 'rgb(91, 110, 136)', opacity: 0.36 })
    expect(splitRgba('#abcdef')).toEqual({ color: '#abcdef', opacity: 1 })
  })

  it('ranks hovered above matched above emphasized above dimmed', () => {
    expect(labelPriority({ hovered: true, matched: true, emphasized: true })).toBe(3)
    expect(labelPriority({ hovered: false, matched: true, emphasized: false })).toBe(2)
    expect(labelPriority({ hovered: false, matched: false, emphasized: true })).toBe(1)
    expect(labelPriority({ hovered: false, matched: false, emphasized: false })).toBe(0)
  })

  it('fades labels by distance and keeps high-degree nodes visible longer', () => {
    expect(labelFade(40, 50, 100)).toBe(1)
    expect(labelFade(75, 50, 100)).toBeCloseTo(0.5)
    expect(labelFade(150, 50, 100)).toBe(0)
    expect(labelFade(75, 50, 100, 16)).toBeGreaterThan(labelFade(75, 50, 100, 0))
    expect(labelFade(60, 80, 80)).toBe(1)
    expect(labelFade(90, 80, 80)).toBe(0)
  })

  it('selects labels with hovered and matched nodes first and respects the cap', () => {
    const candidates = [
      { id: 'far-hub', priority: 1, degree: 25, distance: 300 },
      { id: 'near-a', priority: 1, degree: 1, distance: 20 },
      { id: 'near-b', priority: 1, degree: 9, distance: 30 },
      { id: 'dim', priority: 0, degree: 1, distance: 20 },
      { id: 'match', priority: 2, degree: 0, distance: 900 },
      { id: 'hover', priority: 3, degree: 0, distance: 900 },
    ]
    const shown = selectLabels(candidates, { cap: 3, near: 50, far: 100 })
    expect([...shown.keys()]).toEqual(['hover', 'match', 'near-b'])
    expect(shown.get('hover')).toBe(1)
    expect(shown.get('match')).toBe(1)

    const all = selectLabels(candidates, { cap: 10, near: 50, far: 100 })
    expect(all.has('far-hub')).toBe(false)
    expect(all.get('dim')).toBeCloseTo(DIMMED_LABEL_FACTOR)
  })

  it('never selects more labels than the default cap', () => {
    const candidates = Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, priority: i < 100 ? 2 : 1, degree: i, distance: 10 }))
    const shown = selectLabels(candidates, { near: 50, far: 100 })
    expect(shown.size).toBe(LABEL_CAP)
    expect([...shown.keys()].every(id => Number(id.slice(1)) < 100)).toBe(true)
  })

  it('derives camera distances', () => {
    expect(initialCameraDistance(0)).toBeCloseTo(128)
    expect(initialCameraDistance(1000)).toBeCloseTo(470)
    expect(initialCameraDistance(1e9)).toBe(1200)
    const bbox = { x: [-30, 30], y: [-40, 40], z: [0, 0] }
    const radius = 0.5 * Math.hypot(60, 80, 0)
    expect(fitDistanceFor(bbox, 60)).toBeCloseTo(radius / Math.sin(Math.PI / 6))
    expect(fitDistanceFor(undefined)).toBeUndefined()
    expect(fitDistanceFor({ x: [0, 0], y: [0, 0], z: [0, 0] })).toBeUndefined()
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
