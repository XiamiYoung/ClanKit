// Pure helpers for the flat region map of the AI Doc knowledge graph (see components/aidoc/AiDocGraph2D.vue).
// Each category owns a circular region, so a node's position says which topic it belongs to.
import { packEnclose, packSiblings } from 'd3-hierarchy'

// A page linking to at least this many other categories connects topics.
export const BRIDGE_CATEGORIES = 3
// Free room kept around every node, so that neighbours and their names do not crowd each other.
const NODE_SPACING = 16
const REGION_PADDING = 10
const REGION_GAP = 36
const KEY_NODES_PER_REGION = 3

export const endId = end => (typeof end === 'object' ? end.id : end)

export const isSourceNode = node => node.kind === 'doc' && node.id.startsWith('kb_source/')

export function nodeRadius2D(node) {
  if (node.kind !== 'doc') return 2.5
  return Math.min(13, 3 + Math.sqrt(node.degree || 0) * 1.3)
}

// Packs each category's nodes into its own circle (best connected in the middle), then packs the circles.
// Positions are final: every node is inside its region by construction.
export function layoutRegions(nodes, links) {
  const groupOf = new Map(nodes.filter(node => node.group !== undefined).map(node => [node.id, node.group]))
  // Placeholder nodes have no category of their own and sit with the first page that links to them.
  for (const { source, target } of links) {
    const [a, b] = [endId(source), endId(target)]
    if (!groupOf.has(b) && groupOf.has(a)) groupOf.set(b, groupOf.get(a))
    if (!groupOf.has(a) && groupOf.has(b)) groupOf.set(a, groupOf.get(b))
  }
  for (const node of nodes) if (!groupOf.has(node.id)) groupOf.set(node.id, '')

  const members = new Map()
  for (const node of nodes) {
    const group = groupOf.get(node.id)
    if (!members.has(group)) members.set(group, [])
    members.get(group).push(node)
  }
  const clusters = [...members]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([group, list]) => {
      const ranked = [...list].sort((a, b) => (b.degree || 0) - (a.degree || 0) || a.id.localeCompare(b.id))
      const circles = packSiblings(ranked.map(node => ({ node, r: nodeRadius2D(node) + NODE_SPACING })))
      const center = packEnclose(circles)
      const radius = center.r + REGION_PADDING
      return { group, ranked, circles, center, radius, r: radius + REGION_GAP / 2 }
    })
  packSiblings(clusters)

  const regions = new Map()
  const positions = new Map()
  const keyNodes = new Set()
  for (const { group, ranked, circles, center, radius, x, y } of clusters) {
    regions.set(group, { group, count: ranked.length, radius, x, y })
    for (const circle of circles) positions.set(circle.node.id, { x: x + circle.x - center.x, y: y + circle.y - center.y })
    for (const node of ranked.slice(0, KEY_NODES_PER_REGION)) keyNodes.add(node.id)
  }
  return { regions, groupOf, positions, keyNodes }
}

export function bridgeIds(links, groupOf) {
  const reached = new Map()
  for (const { source, target } of links) {
    const [a, b] = [endId(source), endId(target)]
    for (const [from, to] of [[a, b], [b, a]]) {
      if (groupOf.get(from) === groupOf.get(to)) continue
      if (!reached.has(from)) reached.set(from, new Set())
      reached.get(from).add(groupOf.get(to))
    }
  }
  return new Set([...reached].filter(([, groups]) => groups.size >= BRIDGE_CATEGORIES).map(([id]) => id))
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

// Greedy decluttering: higher priority labels are placed first, later ones only where there is room.
// Zooming in spreads the nodes on screen, so more labels fit.
export function placeLabels(candidates, reserved = []) {
  const taken = [...reserved]
  return [...candidates].sort((a, b) => b.priority - a.priority).filter(candidate => {
    if (!candidate.forced && taken.some(box => overlaps(box, candidate.box))) return false
    taken.push(candidate.box)
    return true
  })
}
