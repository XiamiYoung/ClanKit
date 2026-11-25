import { describe, expect, it } from 'vitest'
import {
  bridgeIds, isSourceNode, layoutRegions, nodeRadius2D, placeLabels,
} from '../graph2d'

const doc = (id, group, degree = 1) => ({ id, kind: 'doc', group, degree })

describe('graph2d regions', () => {
  const nodes = [
    ...Array.from({ length: 30 }, (_, i) => doc(`big${i}`, 'Big')),
    doc('small', 'Small'), { id: '?missing', kind: 'unresolved' }, { id: '?lonely', kind: 'unresolved' },
  ]
  const links = [{ source: 'small', target: '?missing' }]

  it('gives each category its own region, sized by node count and never overlapping', () => {
    const { regions, groupOf } = layoutRegions(nodes, links)
    expect(groupOf.get('?missing')).toBe('Small')
    expect(groupOf.get('?lonely')).toBe('')
    expect([...regions.keys()]).toEqual(['Big', 'Small', ''])
    expect(regions.get('Big').radius).toBeGreaterThan(regions.get('Small').radius)
    const all = [...regions.values()]
    for (const a of all) {
      for (const b of all.filter(other => other !== a)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.radius + b.radius)
      }
    }
  })

  it('places every node inside its region without overlaps, best connected first', () => {
    const many = [...nodes, doc('hub', 'Big', 60)]
    const { regions, groupOf, positions, keyNodes } = layoutRegions(many, links)
    for (const node of many) {
      const region = regions.get(groupOf.get(node.id))
      const { x, y } = positions.get(node.id)
      expect(Math.hypot(x - region.x, y - region.y) + nodeRadius2D(node)).toBeLessThan(region.radius)
    }
    for (const a of many) {
      for (const b of many.filter(other => other !== a)) {
        const [p, q] = [positions.get(a.id), positions.get(b.id)]
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(nodeRadius2D(a) + nodeRadius2D(b) + 20)
      }
    }
    expect(keyNodes.has('hub')).toBe(true)
    expect([...keyNodes].filter(id => groupOf.get(id) === 'Big')).toHaveLength(3)
  })

  it('marks pages that reach three or more other categories', () => {
    const groupOf = new Map([['hub', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D'], ['a', 'A']])
    const spokes = ['b', 'c', 'd', 'a'].map(target => ({ source: 'hub', target }))
    expect(bridgeIds(spokes, groupOf)).toEqual(new Set(['hub']))
    expect(bridgeIds(spokes.slice(1), groupOf)).toEqual(new Set())
  })

  it('tells source files apart and grows pages with their links', () => {
    expect(isSourceNode(doc('kb_source/a.pdf', 'A'))).toBe(true)
    expect(isSourceNode(doc('wiki/zh/a.md', 'A'))).toBe(false)
    expect(nodeRadius2D(doc('a', 'A', 25))).toBeGreaterThan(nodeRadius2D(doc('b', 'A', 1)))
    expect(nodeRadius2D(doc('a', 'A', 10000))).toBe(13)
  })

  it('keeps the more important of two overlapping labels unless one is forced', () => {
    const box = (left, top = 0) => ({ left, right: left + 10, top, bottom: top + 4 })
    const labels = [
      { id: 'minor', priority: 1, box: box(5) },
      { id: 'major', priority: 9, box: box(0) },
      { id: 'apart', priority: 2, box: box(40) },
      { id: 'titled', priority: 8, box: box(80) },
      { id: 'hovered', priority: 0, forced: true, box: box(2) },
    ]
    expect(placeLabels(labels, [box(80)]).map(label => label.id)).toEqual(['major', 'apart', 'hovered'])
  })
})
