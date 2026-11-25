// Pure helpers for the 3D AI Doc knowledge graph (see components/aidoc/AiDocGraph.vue).
// Nothing here touches WebGL, so everything is directly unit-testable.

export const NODE_FALLBACK = '#8ca6bf'
export const NODE_PLACEHOLDER = '#687281'
export const NODE_LABEL = '#29364a'
export const LABEL_STROKE = '#ffffff'
// Links take the colours of the nodes they join; only their opacity depends on the hover and search state.
export const LINK_OPACITY = Object.freeze({ normal: 0.4, active: 0.85, dim: 0.08 })

// Tuning knobs.
export const DIM_OPACITY = 0.19
const AXES = ['x', 'y', 'z']
export const GLOW_SCALE = 7
export const GLOW_OPACITY = 0.9
const HUB_SHARE = 0.08
const HUB_MIN_DEGREE = 8
const GLOW_TEXTURE_SIZE = 64
const CONTAIN_PERCENTILE = 0.95
const CONTAIN_SCALE = 1.15
const CONTAIN_MARGIN = 15
export const HOVER_SCALE = 1.3
export const MATCH_SCALE = 1.15
export const EMISSIVE_ACTIVE = 0.45
export const LABEL_HEIGHT = 5
// Layout spacing; the library defaults (-30 and 30) pack a densely linked wiki too tightly to read.
export const CHARGE_STRENGTH = -120
export const LINK_DISTANCE = 70
export const LABEL_MAX_CHARS = 42
export const DIMMED_LABEL_FACTOR = 0.24

// Nodes with few or no links have nothing pulling them in, so repulsion flings them far away and
// the camera zooms out to fit them. Keep every node near the edge of the connected cluster.
export function createContainmentForce() {
  let nodes = []
  function force() {
    const core = nodes.filter(node => node.degree > 0)
    if (!core.length) return
    const center = { x: 0, y: 0, z: 0 }
    for (const node of core) {
      for (const axis of AXES) center[axis] += (node[axis] || 0) / core.length
    }
    const distance = node => Math.hypot(...AXES.map(axis => (node[axis] || 0) - center[axis]))
    const radii = core.map(distance).sort((a, b) => a - b)
    const limit = radii[Math.floor((radii.length - 1) * CONTAIN_PERCENTILE)] * CONTAIN_SCALE + CONTAIN_MARGIN
    for (const node of nodes) {
      const current = distance(node)
      if (current <= limit) continue
      for (const axis of AXES) {
        node[axis] = center[axis] + ((node[axis] || 0) - center[axis]) * limit / current
        node['v' + axis] = 0
      }
    }
  }
  force.initialize = next => { nodes = next }
  return force
}

// The best connected few percent of the graph.
export function hubIds(nodes) {
  const ranked = [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0))
  const count = Math.max(1, Math.round(ranked.length * HUB_SHARE))
  return new Set(ranked.slice(0, count).filter(node => (node.degree || 0) >= HUB_MIN_DEGREE).map(node => node.id))
}

// White RGBA pixels whose alpha fades out from the centre; the sprite material tints them.
export function glowPixels(size = GLOW_TEXTURE_SIZE) {
  const data = new Uint8Array(size * size * 4).fill(255)
  const half = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.min(1, Math.hypot(x - half, y - half) / half)
      data[(y * size + x) * 4 + 3] = Math.round(255 * (1 - distance) ** 1.5)
    }
  }
  return { data, size }
}

export function nodeRadius(node) {
  const base = node.kind === 'doc' ? 4.5 : 2.2
  return base + Math.min(6, Math.sqrt(node.degree || 0))
}

export function resolveNodeColor(node, colors = {}) {
  return node.kind === 'doc' ? colors[node.group] || NODE_FALLBACK : NODE_PLACEHOLDER
}

export function labelText(node) {
  const name = node.title || node.name || node.id
  return name.length > LABEL_MAX_CHARS ? Array.from(name).slice(0, LABEL_MAX_CHARS - 3).join('') + '…' : name
}

export function initialCameraDistance(nodeCount) {
  return Math.min(1200, 90 + 38 * Math.cbrt(Math.max(1, nodeCount)))
}
