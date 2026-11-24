<template>
  <div ref="container" class="aidoc-graph-canvas"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ForceGraph from 'force-graph'

const NODE_FALLBACK = '#8ca6bf'
const NODE_PLACEHOLDER = '#687281'
const NODE_RING = '#eff5ff'
const NODE_LABEL = '#dce7f2'
const NODE_TYPE = '#141a22'
const LINK_NORMAL = 'rgba(147, 164, 185, 0.25)'
const LINK_ACTIVE = 'rgba(176, 205, 236, 0.65)'
const LINK_DIM = 'rgba(147, 164, 185, 0.07)'
const PARTICLE = '#a8caeb'
const PARTICLE_DIM = 'rgba(168, 202, 235, 0.12)'

const props = defineProps({
  graph: { type: Object, required: true },
  colors: { type: Object, default: () => ({}) },
  highlightQuery: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])
const container = ref(null)
let instance
let resizeObserver
let dataSignature
let hoveredId
let fitOnStop = false
let reducedMotion = false
let nodesById = new Map()
let layoutNodes = new Map()
let neighbors = new Map()
let matchedIds = new Set()

function syncGraph() {
  const { nodes, links } = props.graph
  nodesById = new Map(nodes.map(node => [node.id, node]))
  matchedIds = new Set(nodes.filter(node => node.matched).map(node => node.id))
  const graphNodes = nodes.map(({ matched, ...node }) => node)
  const signature = JSON.stringify([graphNodes, links])
  if (signature === dataSignature) return

  dataSignature = signature
  if (!nodesById.has(hoveredId)) hoveredId = undefined
  neighbors = new Map(nodes.map(node => [node.id, new Set()]))
  for (const { source, target } of links) {
    neighbors.get(source)?.add(target)
    neighbors.get(target)?.add(source)
  }
  const nextNodes = graphNodes.map(node => {
    const previous = layoutNodes.get(node.id)
    if (!previous) return node
    const { x, y, vx, vy } = previous
    return { ...node, x, y, vx, vy }
  })
  layoutNodes = new Map(nextNodes.map(node => [node.id, node]))
  instance.graphData({ nodes: nextNodes, links: links.map(link => ({ ...link })) })
}

function radius(node) {
  const base = node.kind === 'doc' ? 3.3 : 2.2
  return base + Math.min(6, Math.sqrt(node.degree || 0))
}

function drawNode(node, context, scale) {
  const isDocument = node.kind === 'doc'
  const isMatch = props.highlightQuery && matchedIds.has(node.id)
  const isHovered = hoveredId === node.id
  const visible = hoveredId !== undefined
    ? isHovered || neighbors.get(hoveredId)?.has(node.id)
    : !props.highlightQuery || isMatch
  const fill = isDocument ? props.colors[node.group] || NODE_FALLBACK : NODE_PLACEHOLDER
  const size = radius(node)

  context.save()
  context.globalAlpha = visible ? 1 : 0.19
  context.beginPath()
  context.arc(node.x, node.y, size, 0, Math.PI * 2)
  context.fillStyle = fill
  if (visible && isDocument) {
    context.shadowColor = fill
    context.shadowBlur = isHovered || isMatch ? 14 : 5
  }
  context.fill()
  context.shadowBlur = 0
  if (isHovered || isMatch) {
    context.lineWidth = 1.25 / scale
    context.strokeStyle = NODE_RING
    context.stroke()
  }

  context.textAlign = 'center'
  const labelOpacity = isHovered ? 1 : Math.min(1, Math.max(0, (scale - 1.3) / 0.7))
  if (labelOpacity) {
    context.globalAlpha *= labelOpacity
    if (isDocument && node.ext && size * scale >= 11) {
      context.font = `600 ${8 / scale}px system-ui`
      context.fillStyle = NODE_TYPE
      context.textBaseline = 'middle'
      context.fillText(node.ext.toUpperCase(), node.x, node.y)
    }
    context.font = `${12 / scale}px system-ui`
    context.textBaseline = 'top'
    context.fillStyle = NODE_LABEL
    context.fillText(node.title || node.name || node.id, node.x, node.y + size + 4 / scale)
  }
  context.restore()
}

function paintPointerArea(node, color, context, scale) {
  context.fillStyle = color
  context.beginPath()
  context.arc(node.x, node.y, Math.max(radius(node), 6 / scale), 0, Math.PI * 2)
  context.fill()
}

function linkIsHighlighted(link) {
  return link.source.id === hoveredId || link.target.id === hoveredId
}

function linkIsDim(link) {
  if (hoveredId !== undefined) return !linkIsHighlighted(link)
  return props.highlightQuery && !matchedIds.has(link.source.id) && !matchedIds.has(link.target.id)
}

function resize() {
  const { clientWidth, clientHeight } = container.value
  if (clientWidth && clientHeight) instance.width(clientWidth).height(clientHeight)
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  instance = new ForceGraph(container.value)
    .backgroundColor('transparent')
    .nodeLabel('')
    .autoPauseRedraw(false)
    .nodeCanvasObject(drawNode)
    .nodePointerAreaPaint(paintPointerArea)
    .linkColor(link => linkIsDim(link) ? LINK_DIM : hoveredId === undefined ? LINK_NORMAL : LINK_ACTIVE)
    .linkWidth(link => hoveredId !== undefined && linkIsHighlighted(link) ? 1.1 : 0.55)
    .linkDirectionalParticles(reducedMotion ? 0 : 1)
    .linkDirectionalParticleColor(link => linkIsDim(link) ? PARTICLE_DIM : PARTICLE)
    .linkDirectionalParticleWidth(1.5)
    .linkDirectionalParticleSpeed(0.004)
    .onNodeHover(node => { hoveredId = node?.id })
    .onNodeClick(node => emit('select', nodesById.get(node.id)))
    .onEngineStop(() => {
      if (!fitOnStop) return
      fitOnStop = false
      instance.zoomToFit(reducedMotion ? 0 : 450, 44)
    })

  resize()
  fitOnStop = props.graph.nodes.length > 1
  syncGraph()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container.value)
})

watch(() => props.graph, () => {
  if (instance) syncGraph()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  instance?._destructor()
})
</script>

<style scoped>
.aidoc-graph-canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
</style>
