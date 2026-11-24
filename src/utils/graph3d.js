// Pure helpers for the 3D AI Doc knowledge graph (see components/aidoc/AiDocGraph.vue).
// Nothing here touches WebGL, so everything is directly unit-testable.

export const NODE_FALLBACK = '#8ca6bf'
export const NODE_PLACEHOLDER = '#687281'
export const NODE_LABEL = '#29364a'
export const LABEL_STROKE = '#ffffff'
export const LINK_NORMAL = 'rgba(91, 110, 136, 0.36)'
export const LINK_ACTIVE = 'rgba(53, 91, 142, 0.75)'
export const LINK_DIM = 'rgba(91, 110, 136, 0.10)'

// Tuning knobs.
export const DIM_OPACITY = 0.19
export const HOVER_SCALE = 1.3
export const MATCH_SCALE = 1.15
export const EMISSIVE_ACTIVE = 0.45
export const LABEL_CAP = 60
export const LABEL_HEIGHT = 4
export const LABEL_MAX_CHARS = 42
export const LABEL_NEAR_RATIO = 0.5
export const LABEL_FAR_RATIO = 1.2
export const DEGREE_FADE_BOOST = 0.25
export const DIMMED_LABEL_FACTOR = 0.24

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

// Split a CSS rgba() string into an opaque colour and an opacity, because three.js colours carry no alpha.
export function splitRgba(value) {
  const match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(value)
  if (!match) return { color: value, opacity: 1 }
  return { color: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, opacity: Number(match[4]) }
}

// 3 = hovered, 2 = search match, 1 = emphasized, 0 = de-emphasized.
export function labelPriority({ hovered, matched, emphasized }) {
  return hovered ? 3 : matched ? 2 : emphasized ? 1 : 0
}

export function labelFade(distance, near, far, degree = 0) {
  const effective = distance / (1 + DEGREE_FADE_BOOST * Math.sqrt(Math.max(0, degree)))
  if (far <= near) return effective <= near ? 1 : 0
  return Math.min(1, Math.max(0, (far - effective) / (far - near)))
}

// candidates: [{ id, priority, degree, distance }]. Returns Map(id -> label opacity) holding at most `cap` entries.
// Hovered and matched nodes always win a slot (priority >= 2); the rest depend on camera distance.
export function selectLabels(candidates, { cap = LABEL_CAP, near, far }) {
  const eligible = []
  for (const candidate of candidates) {
    const { priority, degree = 0, distance } = candidate
    const fade = priority >= 2 ? 1 : labelFade(distance, near, far, degree)
    if (fade <= 0) continue
    eligible.push({ ...candidate, opacity: priority >= 2 ? 1 : fade * (priority ? 1 : DIMMED_LABEL_FACTOR) })
  }
  eligible.sort((a, b) => b.priority - a.priority || (b.degree || 0) - (a.degree || 0) || a.distance - b.distance)
  const selected = new Map()
  for (const { id, opacity } of eligible.slice(0, cap)) selected.set(id, opacity)
  return selected
}

export function initialCameraDistance(nodeCount) {
  return Math.min(1200, 90 + 38 * Math.cbrt(Math.max(1, nodeCount)))
}

// Camera distance at which a sphere around the bounding box fills the vertical field of view.
export function fitDistanceFor(bbox, fovDegrees = 50) {
  if (!bbox) return undefined
  const { x, y, z } = bbox
  const radius = 0.5 * Math.hypot(x[1] - x[0], y[1] - y[0], z[1] - z[0])
  if (!Number.isFinite(radius) || radius <= 0) return undefined
  return radius / Math.sin((fovDegrees * Math.PI) / 360)
}
