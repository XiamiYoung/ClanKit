<template>
  <div class="aidoc-graph2d-root">
    <div ref="container" class="aidoc-graph2d-canvas"></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ForceGraph from 'force-graph'
import { useI18n } from '../../i18n/useI18n'
import { LABEL_STROKE, NODE_LABEL, labelText, resolveNodeColor } from '../../utils/graph3d'
import { bridgeIds, endId, isSourceNode, layoutRegions, nodeRadius2D, placeLabels } from '../../utils/graph2d'

const FIT_PADDING = 36
const ZOOM_OUT_LIMIT = 0.6
const ZOOM_IN_LIMIT = 6
// Zoomed in this far past the whole map, every node may show its name, not just the key ones.
const DETAIL_ZOOM = 1.6
// Label sizes are screen pixels: text is drawn outside the zoom transform.
const LABEL_PX = 12
const TITLE_PX = 14
const LABEL_MARGIN = 4
const LINK_STYLE = {
  inside: { alpha: 0.07, width: 0.7 },
  across: { alpha: 0.22, width: 0.9 },
  active: { alpha: 0.9, width: 1.8 },
  dim: { alpha: 0.03, width: 0.7 },
}
const DIM_NODE_ALPHA = 0.15

const props = defineProps({
  graph: { type: Object, required: true },
  colors: { type: Object, default: () => ({}) },
  highlightQuery: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])
const { t } = useI18n()
const container = ref(null)
let instance
let resizeObserver
let dataSignature
let hoveredId
let needsFit = false
let fitZoom = 1
let keyNodes = new Set()
let paused = false
let nodes = []
let sourcesById = new Map()
let neighbors = new Map()
let matchedIds = new Set()
let bridges = new Set()
let regions = new Map()
let groupOf = new Map()

const colorOf = node => resolveNodeColor(node, props.colors)
const regionColor = group => resolveNodeColor({ kind: 'doc', group }, props.colors)

function isEmphasized(id) {
  if (hoveredId !== undefined) return id === hoveredId || neighbors.get(hoveredId)?.has(id)
  return !props.highlightQuery || matchedIds.has(id)
}

function syncGraph() {
  const { links } = props.graph
  sourcesById = new Map(props.graph.nodes.map(node => [node.id, node]))
  matchedIds = new Set(props.graph.nodes.filter(node => node.matched).map(node => node.id))
  const plain = props.graph.nodes.map(({ matched, ...node }) => node)
  const signature = JSON.stringify([plain, links])
  if (signature === dataSignature) {
    redraw()
    return
  }

  dataSignature = signature
  let positions
  ;({ regions, groupOf, positions, keyNodes } = layoutRegions(plain, links))
  bridges = bridgeIds(links, groupOf)
  neighbors = new Map(plain.map(node => [node.id, new Set()]))
  for (const { source, target } of links) {
    neighbors.get(source)?.add(target)
    neighbors.get(target)?.add(source)
  }
  if (!neighbors.has(hoveredId)) hoveredId = undefined
  // Fixed coordinates: the layout is computed here and the simulation must not move it.
  nodes = plain.map(node => {
    const { x, y } = positions.get(node.id)
    return { ...node, x, y, fx: x, fy: y }
  })
  instance.graphData({ nodes, links: links.map(link => ({ ...link })) })
  needsFit = true
  fitRegions()
}

// The regions are fixed, so the view can frame them at once instead of waiting for the layout to settle.
function fitRegions() {
  const { clientWidth, clientHeight } = container.value
  // A canvas still being sized would give a tiny or negative zoom, which mirrors the whole drawing.
  if (Math.min(clientWidth, clientHeight) < FIT_PADDING * 4 || !regions.size) return
  const all = [...regions.values()]
  const left = Math.min(...all.map(region => region.x - region.radius))
  const right = Math.max(...all.map(region => region.x + region.radius))
  const top = Math.min(...all.map(region => region.y - region.radius))
  const bottom = Math.max(...all.map(region => region.y + region.radius))
  // The region names sit above the circles.
  const nextFit = Math.min(
    (clientWidth - FIT_PADDING * 2) / (right - left),
    (clientHeight - FIT_PADDING * 2 - TITLE_PX) / (bottom - top),
  )
  if (!needsFit && nextFit === fitZoom) return
  // A resize keeps what the user is looking at, scaled to the new size.
  const zoom = needsFit ? nextFit : instance.zoom() * nextFit / fitZoom
  fitZoom = nextFit
  instance.minZoom(fitZoom * ZOOM_OUT_LIMIT)
  instance.maxZoom(fitZoom * ZOOM_IN_LIMIT)
  if (needsFit) instance.centerAt((left + right) / 2, (top + bottom) / 2 - TITLE_PX / 2 / fitZoom)
  instance.zoom(zoom)
  needsFit = false
}

const hasRing = node => bridges.has(node.id) || node.id === hoveredId
const ringRadius = node => nodeRadius2D(node) * (isSourceNode(node) ? 1.45 : 1) + 2.5

function drawNode(node, ctx) {
  const radius = nodeRadius2D(node)
  const { x, y } = node
  ctx.save()
  ctx.globalAlpha = isEmphasized(node.id) ? 1 : DIM_NODE_ALPHA
  ctx.fillStyle = colorOf(node)
  ctx.beginPath()
  if (isSourceNode(node)) ctx.rect(x - radius, y - radius, radius * 2, radius * 2)
  else if (node.kind === 'ambiguous') {
    ctx.moveTo(x, y - radius * 1.4)
    ctx.lineTo(x + radius * 1.4, y)
    ctx.lineTo(x, y + radius * 1.4)
    ctx.lineTo(x - radius * 1.4, y)
    ctx.closePath()
  } else ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  if (hasRing(node)) {
    ctx.beginPath()
    ctx.arc(x, y, ringRadius(node), 0, Math.PI * 2)
    ctx.strokeStyle = NODE_LABEL
    ctx.lineWidth = 1.2
    ctx.stroke()
  }
  ctx.restore()
}

function paintHitArea(node, color, ctx) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(node.x, node.y, nodeRadius2D(node) + 2, 0, Math.PI * 2)
  ctx.fill()
}

function linkState(a, b) {
  if (hoveredId !== undefined) return a.id === hoveredId || b.id === hoveredId ? 'active' : 'dim'
  if (props.highlightQuery && !matchedIds.has(a.id) && !matchedIds.has(b.id)) return 'dim'
  return groupOf.get(a.id) === groupOf.get(b.id) ? 'inside' : 'across'
}

function drawLink(link, ctx, scale) {
  const { source, target } = link
  if (typeof source !== 'object' || typeof target !== 'object') return
  const { alpha, width } = LINK_STYLE[linkState(source, target)]
  const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y)
  gradient.addColorStop(0, colorOf(source))
  gradient.addColorStop(1, colorOf(target))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = gradient
  ctx.lineWidth = width / scale
  ctx.beginPath()
  ctx.moveTo(source.x, source.y)
  ctx.lineTo(target.x, target.y)
  ctx.stroke()
  ctx.restore()
}

function drawRegions(ctx, scale) {
  for (const { group, radius, x, y } of regions.values()) {
    const color = regionColor(group)
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.globalAlpha = 0.07
    ctx.fillStyle = color
    ctx.fill()
    ctx.globalAlpha = 0.55
    ctx.strokeStyle = color
    ctx.lineWidth = 1.2 / scale
    ctx.stroke()
    ctx.restore()
  }
}

function textBox(ctx, text, x, top, height) {
  const half = ctx.measureText(text).width / 2 + LABEL_MARGIN
  return { left: x - half, right: x + half, top: top - LABEL_MARGIN / 2, bottom: top + height + LABEL_MARGIN / 2 }
}

function drawText(ctx, text, x, top, color) {
  ctx.strokeText(text, x, top)
  ctx.fillStyle = color
  ctx.fillText(text, x, top)
}

// Region names come first; node names then fill whatever room is left. Everything here is in screen pixels,
// because fonts scaled down to match the zoom level render badly.
function drawLabels(ctx, scale) {
  const family = getComputedStyle(container.value).fontFamily || 'sans-serif'
  const ratio = window.devicePixelRatio || 1
  ctx.save()
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.direction = 'ltr'
  // The app tightens letter spacing globally and canvas text inherits it.
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = LABEL_STROKE

  ctx.font = `700 ${TITLE_PX}px ${family}`
  const titles = [...regions.values()].map(({ group, count, radius, x, y }) => {
    const text = `${group || t('aidoc.wikiCategoryUncategorized')} · ${count}`
    const point = instance.graph2ScreenCoords(x, y - radius)
    const top = point.y - TITLE_PX - 2
    return { text, x: point.x, top, color: regionColor(group), box: textBox(ctx, text, point.x, top, TITLE_PX) }
  })

  ctx.font = `500 ${LABEL_PX}px ${family}`
  const detailed = scale >= fitZoom * DETAIL_ZOOM
  const candidates = []
  for (const node of nodes) {
    if (!isEmphasized(node.id)) continue
    const hovered = node.id === hoveredId
    const near = hoveredId !== undefined || (props.highlightQuery && matchedIds.has(node.id))
    const key = keyNodes.has(node.id) || bridges.has(node.id)
    if (!near && !key && !detailed) continue
    const text = labelText(node)
    const point = instance.graph2ScreenCoords(node.x, node.y)
    // The name goes below the node and its ring.
    const top = point.y + (hasRing(node) ? ringRadius(node) + 0.6 : nodeRadius2D(node)) * scale + 3
    candidates.push({
      text, x: point.x, top, forced: hovered, box: textBox(ctx, text, point.x, top, LABEL_PX),
      priority: (hovered ? 1e6 : 0) + (near ? 1e5 : 0) + (key ? 1e3 : 0) + (node.degree || 0),
    })
  }
  for (const label of placeLabels(candidates, titles.map(title => title.box))) {
    drawText(ctx, label.text, label.x, label.top, NODE_LABEL)
  }

  ctx.font = `700 ${TITLE_PX}px ${family}`
  for (const title of titles) drawText(ctx, title.text, title.x, title.top, title.color)
  ctx.restore()
}

// Assigning an accessor again makes the library repaint a settled graph.
function redraw() {
  instance?.nodeCanvasObject((node, ctx) => drawNode(node, ctx))
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
    fitRegions()
    if (!document.hidden) setPaused(false)
  } else {
    setPaused(true)
  }
}

function onVisibilityChange() {
  if (document.hidden) setPaused(true)
  else if (container.value?.clientWidth) setPaused(false)
}

onMounted(() => {
  instance = new ForceGraph(container.value)
  instance
    .backgroundColor('rgba(0, 0, 0, 0)')
    .nodeLabel('')
    .nodeCanvasObject(drawNode)
    .nodePointerAreaPaint(paintHitArea)
    .linkCanvasObject(drawLink)
    .onRenderFramePre(drawRegions)
    .onRenderFramePost(drawLabels)
    .cooldownTicks(0)
    .enableNodeDrag(false)
    .onNodeHover(node => {
      hoveredId = node?.id
      redraw()
    })
    .onNodeClick(node => emit('select', sourcesById.get(node.id)))

  resize()
  syncGraph()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container.value)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

watch(() => props.graph, () => {
  if (instance) syncGraph()
})

watch(() => [props.colors, props.highlightQuery], redraw)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  instance?.pauseAnimation()
  instance?._destructor()
  instance = undefined
})
</script>

<style scoped>
.aidoc-graph2d-root,
.aidoc-graph2d-canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
</style>
