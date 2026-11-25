import { expect, it } from 'vitest'
import { filterGraph } from '../aidocGraphFilter'

it('highlights matches and removes nodes isolated by a type filter', () => {
  const graph = {
    nodes: [{ id: 'a', name: 'Note', ext: 'md' }, { id: 'b', ext: 'pdf' }, { id: 'c', ext: 'md' }],
    links: [{ source: 'a', target: 'b' }],
  }
  const searched = filterGraph(graph, { query: 'note' })
  expect(searched.nodes.map(node => node.matched)).toEqual([true, false, false])
  expect(graph.nodes[0].matched).toBeUndefined()
  expect(filterGraph(graph, { hideOrphans: true, hiddenExts: ['pdf'] })).toEqual({ nodes: [], links: [] })
})
