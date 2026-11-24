<template>
  <div class="aidoc-graph-root">
    <div ref="container" class="aidoc-graph-canvas"></div>
    <p v-if="webglFailed" class="aidoc-graph-fallback" role="alert">
      {{ t('aidoc.graphWebglUnavailable') }}
    </p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ForceGraph3D from '3d-force-graph'
import SpriteText from 'three-spritetext'
import {
  AmbientLight, DirectionalLight, Group, LineBasicMaterial, Mesh, MeshLambertMaterial,
  OctahedronGeometry, SphereGeometry,
} from 'three'
import { useI18n } from '../../i18n/useI18n'
import {
  DIM_OPACITY, EMISSIVE_ACTIVE, HOVER_SCALE, LABEL_CAP, LABEL_FAR_RATIO, LABEL_HEIGHT, LABEL_NEAR_RATIO,
  LABEL_STROKE, LINK_ACTIVE, LINK_DIM, LINK_NORMAL, MATCH_SCALE, NODE_LABEL,
  fitDistanceFor, initialCameraDistance, labelPriority, labelText, nodeRadius, resolveNodeColor,
  selectLabels, splitRgba,
} from '../../utils/graph3d'

const NODE_SEGMENTS = 20
const WARMUP_TICKS = 20
const COOLDOWN_TICKS = 220
const FIT_DURATION_MS = 450
const FIT_PADDING = 44
const MAX_IDLE_LABELS = LABEL_CAP * 3

const props = defineProps({
  graph: { type: Object, required: true },
  colors: { type: Object, default: () => ({}) },
  highlightQuery: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])
const { t } = useI18n()
const container = ref(null)
const webglFailed = ref(false)
let instance
let resizeObserver
let dataSignature
let hoveredId
let fitOnStop = false
let reducedMotion = false
let paused = false
let fitDistance = 0
let labelFrame = 0
let nodesById = new Map()
let layoutNodes = new Map()
let layoutLinks = []
let neighbors = new Map()
let matchedIds = new Set()
let records = new Map()
let geometries = new Map()
const linkMaterials = {}

function syncGraph() {
  const { nodes, links } = props.graph
  nodesById = new Map(nodes.map(node => [node.id, node]))
  matchedIds = new Set(nodes.filter(node => node.matched).map(node => node.id))
  const graphNodes = nodes.map(({ matched, ...node }) => node)
  const signature = JSON.stringify([graphNodes, links])
  if (signature === dataSignature) {
    applyStyles()
    return
  }

  dataSignature = signature
  if (!nodesById.has(hoveredId)) hoveredId = undefined
  neighbors = new Map(nodes.map(node => [node.id, new Set()]))
  for (const { source, target } of links) {
    neighbors.get(source)?.add(target)
    neighbors.get(target)?.add(source)
  }
  for (const [id, record] of records) {
    if (nodesById.has(id)) continue
    disposeRecord(record)
    records.delete(id)
  }
  const nextNodes = graphNodes.map(node => {
    const previous = layoutNodes.get(node.id)
    if (!previous) return node
    const { x, y, z, vx, vy, vz } = previous
    return { ...node, x, y, z, vx, vy, vz }
  })
  layoutNodes = new Map(nextNodes.map(node => [node.id, node]))
  layoutLinks = links.map(link => ({ ...link }))
  instance.graphData({ nodes: nextNodes, links: layoutLinks })
  fitDistance = fitDistance || initialCameraDistance(nodes.length)
  applyStyles()
}

function isEmphasized(id) {
  if (hoveredId !== undefined) return id === hoveredId || neighbors.get(hoveredId)?.has(id)
  return !props.highlightQuery || matchedIds.has(id)
}

function isMatch(id) {
  return props.highlightQuery && matchedIds.has(id)
}

function geometryFor(node, size) {
  const shape = node.kind === 'ambiguous' ? 'octahedron' : 'sphere'
  const key = `${shape}:${size.toFixed(2)}`
  let geometry = geometries.get(key)
  if (!geometry) {
    geometry = shape === 'octahedron'
      ? new OctahedronGeometry(size * 1.2)
      : new SphereGeometry(size, NODE_SEGMENTS, NODE_SEGMENTS)
    geometries.set(key, geometry)
  }
  return geometry
}

function buildNodeObject(node) {
  const previous = records.get(node.id)
  if (previous) disposeRecord(previous)
  const size = nodeRadius(node)
  const color = resolveNodeColor(node, props.colors)
  const material = new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0 })
  const mesh = new Mesh(geometryFor(node, size), material)
  const group = new Group()
  group.add(mesh)
  const record = { node, size, group, mesh, material, label: null }
  records.set(node.id, record)
  styleRecord(record)
  return group
}

function disposeLabel(record) {
  const { label } = record
  if (!label) return
  label.removeFromParent()
  label.material.map?.dispose()
  label.material.dispose()
  record.label = null
}

function disposeRecord(record) {
  disposeLabel(record)
  record.material.dispose()
}

function styleRecord(record) {
  const { node, material, mesh } = record
  const hovered = hoveredId === node.id
  const match = isMatch(node.id)
  const emphasized = isEmphasized(node.id)
  material.opacity = emphasized ? 1 : DIM_OPACITY
  material.transparent = !emphasized
  material.depthWrite = emphasized
  material.emissiveIntensity = hovered || match ? EMISSIVE_ACTIVE : 0
  mesh.scale.setScalar(hovered ? HOVER_SCALE : match ? MATCH_SCALE : 1)
  if (record.label) placeLabel(record)
}

function placeLabel(record) {
  record.label.position.set(0, -(record.size * record.mesh.scale.x + LABEL_HEIGHT * 0.75), 0)
}

function ensureLabel(record) {
  if (record.label) return record.label
  const label = new SpriteText(labelText(record.node), LABEL_HEIGHT, NODE_LABEL)
  label.fontWeight = '500'
  label.strokeWidth = 2
  label.strokeColor = LABEL_STROKE
  // Labels must stay legible on top of spheres and must never intercept pointer events.
  label.material.depthTest = false
  label.material.depthWrite = false
  label.renderOrder = 20
  label.raycast = () => {}
  record.label = label
  record.group.add(label)
  placeLabel(record)
  return label
}

function linkEndId(end) {
  return typeof end === 'object' ? end.id : end
}

function linkIsHighlighted(link) {
  return linkEndId(link.source) === hoveredId || linkEndId(link.target) === hoveredId
}

function linkIsDim(link) {
  if (hoveredId !== undefined) return !linkIsHighlighted(link)
  return props.highlightQuery && !matchedIds.has(linkEndId(link.source)) && !matchedIds.has(linkEndId(link.target))
}

function linkMaterialFor(link) {
  const state = linkIsDim(link) ? 'dim' : hoveredId === undefined ? 'normal' : 'active'
  if (!linkMaterials[state]) {
    const { color, opacity } = splitRgba({ dim: LINK_DIM, normal: LINK_NORMAL, active: LINK_ACTIVE }[state])
    linkMaterials[state] = new LineBasicMaterial({ color, opacity, transparent: true, depthWrite: false })
  }
  return linkMaterials[state]
}

function applyStyles() {
  for (const record of records.values()) styleRecord(record)
  for (const link of layoutLinks) {
    if (link.__lineObj) link.__lineObj.material = linkMaterialFor(link)
  }
  updateLabels()
}

function updateLabels() {
  if (!instance) return
  const camera = instance.camera()
  const near = fitDistance * LABEL_NEAR_RATIO
  const far = fitDistance * LABEL_FAR_RATIO
  const candidates = []
  for (const { node } of records.values()) {
    const layout = layoutNodes.get(node.id)
    if (!layout || !Number.isFinite(layout.x)) continue
    const { x, y, z = 0 } = layout
    candidates.push({
      id: node.id,
      degree: node.degree || 0,
      distance: Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z),
      priority: labelPriority({
        hovered: hoveredId === node.id,
        matched: isMatch(node.id),
        emphasized: isEmphasized(node.id),
      }),
    })
  }
  const shown = selectLabels(candidates, { cap: LABEL_CAP, near, far })
  let idle = 0
  for (const record of records.values()) {
    const opacity = shown.get(record.node.id)
    if (opacity) {
      const label = ensureLabel(record)
      label.visible = true
      label.material.opacity = opacity
    } else if (record.label) {
      record.label.visible = false
      idle++
    }
  }
  if (idle > MAX_IDLE_LABELS) {
    for (const record of records.values()) if (record.label && !record.label.visible) disposeLabel(record)
  }
}

function scheduleLabelUpdate() {
  if (labelFrame) return
  labelFrame = requestAnimationFrame(() => {
    labelFrame = 0
    updateLabels()
  })
}

function setPaused(next) {
  if (!instance || next === paused) return
  paused = next
  if (next) instance.pauseAnimation()
  else instance.resumeAnimation()
}

function resize() {
  const { clientWidth, clientHeight } = container.value
  if (clientWidth && clientHeight) {
    instance.width(clientWidth).height(clientHeight)
    if (!document.hidden) setPaused(false)
  } else {
    setPaused(true)
  }
}

function onVisibilityChange() {
  if (document.hidden) setPaused(true)
  else if (container.value?.clientWidth) setPaused(false)
}

function fitCamera() {
  instance.zoomToFit(reducedMotion ? 0 : FIT_DURATION_MS, FIT_PADDING)
  fitDistance = fitDistanceFor(instance.getGraphBbox?.(), instance.camera().fov) || fitDistance
}

function createInstance() {
  const controlConfig = {
    controlType: 'orbit',
    rendererConfig: { alpha: true, antialias: true, powerPreference: 'high-performance' },
  }
  try {
    return new ForceGraph3D(container.value, controlConfig)
  } catch {
    webglFailed.value = true
    return undefined
  }
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  instance = createInstance()
  if (!instance) return

  instance
    .backgroundColor('rgba(0, 0, 0, 0)')
    .showNavInfo(false)
    .nodeLabel('')
    .nodeResolution(NODE_SEGMENTS)
    .nodeThreeObject(buildNodeObject)
    .linkWidth(0)
    .linkMaterial(linkMaterialFor)
    .lights([new AmbientLight(0xffffff, Math.PI * 0.85), new DirectionalLight(0xffffff, Math.PI * 0.75)])
    .warmupTicks(WARMUP_TICKS)
    .cooldownTicks(COOLDOWN_TICKS)
    .onNodeHover(node => {
      hoveredId = node?.id
      applyStyles()
    })
    .onNodeClick(node => emit('select', nodesById.get(node.id)))
    .onEngineTick(scheduleLabelUpdate)
    .onEngineStop(() => {
      if (!fitOnStop) return
      fitOnStop = false
      fitCamera()
    })
  instance.lights()[1]?.position?.set(1, 1.4, 1.2)
  instance.controls?.()?.addEventListener?.('change', scheduleLabelUpdate)

  fitDistance = initialCameraDistance(props.graph.nodes.length)
  instance.cameraPosition({ x: 0, y: 0, z: fitDistance }, { x: 0, y: 0, z: 0 }, 0)
  resize()
  fitOnStop = props.graph.nodes.length > 1
  syncGraph()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container.value)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

watch(() => props.graph, () => {
  if (instance) syncGraph()
})

watch(() => props.colors, () => {
  for (const record of records.values()) {
    const color = resolveNodeColor(record.node, props.colors)
    record.material.color.set(color)
    record.material.emissive.set(color)
  }
})

watch(() => props.highlightQuery, () => {
  if (instance) applyStyles()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (labelFrame) cancelAnimationFrame(labelFrame)
  labelFrame = 0
  if (!instance) return
  const renderer = instance.renderer?.()
  instance.pauseAnimation()
  instance._destructor()
  renderer?.forceContextLoss?.()
  for (const record of records.values()) disposeRecord(record)
  records.clear()
  for (const geometry of geometries.values()) geometry.dispose()
  geometries.clear()
  for (const material of Object.values(linkMaterials)) material.dispose()
  instance = undefined
})
</script>

<style scoped>
.aidoc-graph-root,
.aidoc-graph-canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.aidoc-graph-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 1.5rem;
  text-align: center;
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
}
</style>
