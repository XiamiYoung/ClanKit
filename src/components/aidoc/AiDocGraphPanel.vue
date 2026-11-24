<template>
  <section
    ref="panel"
    class="aidoc-graph-panel"
    :style="panelPosition"
    :aria-label="t('aidoc.graph')"
    @mousedown.stop
    @mouseup.stop
  >
    <div class="graph-titlebar">
      <div
        class="graph-drag-handle"
        :class="{ 'is-dragging': dragging }"
        tabindex="0"
        :aria-description="t('aidoc.moveGraph')"
        @pointerdown="startDrag"
        @keydown="moveWithKeys"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />
        </svg>
        <h2>{{ t('aidoc.graph') }}</h2>
      </div>
      <AppTooltip :text="t('aidoc.closeGraph')">
        <AppButton size="icon" variant="ghost" data-testid="aidoc-graph-close" :aria-label="t('aidoc.closeGraph')" @click="$emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </AppButton>
      </AppTooltip>
    </div>
    <header class="graph-header">
      <div class="graph-controls">
        <div class="graph-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            v-model="query"
            type="search"
            :aria-label="t('aidoc.search')"
            :placeholder="t('aidoc.search')"
          />
        </div>
        <label class="graph-toggle">
          <input v-model="hideOrphans" type="checkbox" data-testid="aidoc-hide-orphans" />
          {{ t('aidoc.hideOrphans') }}
        </label>
      </div>

      <div class="graph-meta">
        <fieldset v-if="extensions.length" class="graph-types">
          <legend>{{ t('aidoc.typeFilter') }}</legend>
          <label v-for="ext in extensions" :key="ext" class="graph-type">
            <input
              type="checkbox"
              :value="ext"
              :checked="!hiddenExts.includes(ext)"
              data-testid="aidoc-type-filter"
              @change="toggleExtension(ext, $event.target.checked)"
            />
            <span>.{{ ext }}</span>
          </label>
        </fieldset>
        <div class="graph-sync" role="status">
          <span
            class="sync-dot"
            :class="{ 'is-stale': store.status?.indexStale }"
            aria-hidden="true"
          ></span>
          {{ syncText }}
          <span v-if="pendingCount">
            {{ t('aidoc.syncPending', { n: pendingCount }) }}
          </span>
        </div>
      </div>
      <p v-if="errorText" class="graph-feedback" role="alert">
        <strong>{{ t('aidoc.indexFailed') }}</strong> {{ errorText }}
      </p>
      <p v-else-if="store.stats && !store.updating" class="graph-feedback" role="status">
        {{ t('aidoc.indexDone', store.stats) }}
      </p>
      <p v-else-if="store.status?.failedCount && !store.updating" class="graph-feedback" role="status">
        {{ t('aidoc.extractionFailed', { n: store.status.failedCount }) }}
      </p>
    </header>

    <div class="graph-stage">
      <div v-if="graph && (!graph.hasIndex || !graph.nodes.length)" class="graph-empty">
        <h3>{{ t('aidoc.graphEmptyTitle') }}</h3>
        <p>{{ t('aidoc.graphEmptyHint') }}</p>
      </div>
      <p v-else-if="graph && !filteredGraph.nodes.length" class="graph-empty">
        {{ t('aidoc.graphNoMatches') }}
      </p>
      <AiDocGraph
        v-else-if="graph"
        :graph="filteredGraph"
        :colors="graph.colors"
        :highlight-query="Boolean(query.trim())"
        @select="openFile"
      />
      <aside v-if="graph?.hasIndex && graph.nodes.length" class="graph-legend" :aria-label="t('aidoc.legend')">
        <h3>{{ t('aidoc.legend') }}</h3>
        <ul>
          <li v-for="group in graph.groups" :key="group">
            <span class="legend-dot" :style="{ backgroundColor: graph.colors[group] }"></span>
            {{ group }}
          </li>
          <li v-if="hasUnresolved">
            <span class="legend-dot"></span>{{ t('aidoc.unresolvedNode') }}
          </li>
          <li v-if="hasAmbiguous">
            <span class="legend-dot legend-dot--ambiguous"></span>{{ t('aidoc.ambiguousNode') }}
          </li>
        </ul>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useAiDocStore } from '../../stores/aidoc'
import { filterGraph } from '../../utils/aidocGraphFilter'
import AppButton from '../common/AppButton.vue'
import AppTooltip from '../common/AppTooltip.vue'
import AiDocGraph from './AiDocGraph.vue'

const emit = defineEmits(['close', 'open-file'])
const { t } = useI18n()
const store = useAiDocStore()
const errorText = computed(() => store.errorKey ? t(store.errorKey) : store.error)
const graph = computed(() => store.graph)
const query = ref('')
const hideOrphans = ref(false)
const hiddenExts = ref([])

const panel = ref(null)
const position = ref({ x: 0, y: 0 })
const dragging = ref(false)
let drag = null
let resizeObserver
const panelPosition = computed(() => ({
  left: position.value.x + 'px',
  top: position.value.y + 'px',
}))

function movePanel(x, y) {
  const host = panel.value.parentElement
  if (!host) return
  const maxX = Math.max(0, host.clientWidth - panel.value.offsetWidth)
  const maxY = Math.max(0, host.clientHeight - panel.value.offsetHeight)
  position.value = { x: Math.max(0, Math.min(x, maxX)), y: Math.max(0, Math.min(y, maxY)) }
}

function startDrag(event) {
  if (event.button !== 0 || drag) return
  drag = { id: event.pointerId, x: event.clientX - position.value.x, y: event.clientY - position.value.y }
  event.currentTarget.setPointerCapture(event.pointerId)
  dragging.value = true
  window.addEventListener('pointermove', moveDrag, true)
  window.addEventListener('pointerup', stopDrag, true)
  window.addEventListener('pointercancel', stopDrag, true)
  window.addEventListener('blur', clearDrag)
}

function moveDrag(event) {
  if (drag?.id === event.pointerId) movePanel(event.clientX - drag.x, event.clientY - drag.y)
}

function stopDrag(event) {
  if (drag?.id === event.pointerId) clearDrag()
}

function clearDrag() {
  if (!drag) return
  drag = null
  dragging.value = false
  window.removeEventListener('pointermove', moveDrag, true)
  window.removeEventListener('pointerup', stopDrag, true)
  window.removeEventListener('pointercancel', stopDrag, true)
  window.removeEventListener('blur', clearDrag)
}

function moveWithKeys(event) {
  const step = 16
  const directions = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const direction = directions[event.key]
  if (!Array.isArray(direction)) return
  event.preventDefault()
  movePanel(position.value.x + direction[0], position.value.y + direction[1])
}

const extensions = computed(() => [...new Set(
  graph.value?.nodes.map(node => node.ext).filter(Boolean) ?? [],
)].sort())
const hasUnresolved = computed(() => graph.value?.nodes.some(node => node.kind === 'unresolved'))
const hasAmbiguous = computed(() => graph.value?.nodes.some(node => node.kind === 'ambiguous'))
const filteredGraph = computed(() => filterGraph(graph.value, {
  query: query.value.trim(),
  hideOrphans: hideOrphans.value,
  hiddenExts: hiddenExts.value,
}))
const syncText = computed(() => {
  const status = store.status
  if (!status) return t('aidoc.statusUnknown')
  return status.indexStale ? t('aidoc.syncStale', { n: status.staleCount }) : t('aidoc.syncOk')
})
const pendingCount = computed(() => {
  const { ingestAvailable, pending } = store.status ?? {}
  if (!ingestAvailable || !pending) return 0
  return pending.new + pending.updated + pending.removed
})

function toggleExtension(ext, visible) {
  hiddenExts.value = visible ? hiddenExts.value.filter(value => value !== ext) : [...hiddenExts.value, ext]
}

function openFile(node) {
  if (node?.kind === 'doc' && node.path) emit('open-file', { path: node.path, name: node.name })
}

onMounted(() => {
  const host = panel.value.parentElement
  if (host) {
    movePanel((host.clientWidth - panel.value.offsetWidth) / 2, (host.clientHeight - panel.value.offsetHeight) / 2)
    resizeObserver = new ResizeObserver(() => movePanel(position.value.x, position.value.y))
    resizeObserver.observe(host)
  }
  store.loadGraph()
  store.refreshStatus()
})
onBeforeUnmount(() => {
  clearDrag()
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.aidoc-graph-panel {
  --graph-surface: var(--bg-card);
  --graph-control: var(--bg-hover);
  --graph-line: var(--border);
  --graph-muted: var(--text-secondary);
  --graph-placeholder: #687281;
  --graph-error: #b91c1c;
  --graph-grid: #d5dce5;
  position: absolute;
  z-index: 70;
  display: flex;
  flex-direction: column;
  width: min(42rem, calc(100% - 1.25rem));
  height: min(30rem, calc(100% - 1.25rem));
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--graph-line);
  border-radius: var(--radius-md);
  background: var(--graph-surface);
  color: var(--text-primary);
  box-shadow: 0 0.625rem 2rem var(--shadow-hover), 0 0.125rem 0.375rem var(--shadow);
}
.graph-titlebar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3125rem 0.375rem 0.3125rem 0.625rem;
  border-bottom: 1px solid var(--graph-line);
}
.graph-drag-handle {
  display: flex;
  flex: 1;
  align-items: center;
  align-self: stretch;
  gap: 0.375rem;
  min-width: 0;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.graph-drag-handle.is-dragging { cursor: grabbing; }
.graph-drag-handle svg { flex: 0 0 auto; color: var(--graph-muted); }
.graph-drag-handle h2 { margin: 0; font-size: var(--fs-subtitle); font-weight: 700; }
.graph-header {
  display: grid;
  gap: 0.5rem;
  max-height: 50%;
  overflow: auto;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--graph-line);
}
.graph-controls, .graph-meta, .graph-sync, .graph-toggle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
}
.graph-search {
  flex: 1 1 9rem;
  max-width: 20rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--graph-line);
  border-radius: var(--radius-sm);
  background: var(--graph-control);
}
.graph-search:focus-within { border-color: var(--graph-muted); }
.graph-search svg {
  width: 0.875rem;
  flex-shrink: 0;
  color: var(--graph-muted);
}
.graph-search input {
  background: transparent;
  color: inherit;
  border: 0;
  outline: none;
  flex: 1;
  min-width: 0;
  font-size: var(--fs-secondary);
}
.graph-search input::placeholder { color: var(--graph-muted); }
.graph-toggle, .graph-meta, .graph-feedback { font-size: var(--fs-small); }
.graph-toggle input, .graph-type input { accent-color: var(--accent); }
.graph-meta { justify-content: space-between; color: var(--graph-muted); }
.graph-types {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  border: 0;
}
.graph-types legend {
  float: inline-start;
  padding: 0;
  margin-inline-end: 0.5rem;
}
.graph-type {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  border: 1px solid var(--graph-line);
  border-radius: var(--radius-sm);
}
.graph-type:has(input:checked) { background: var(--graph-control); }
.sync-dot, .legend-dot {
  display: inline-block;
  flex: 0 0 0.375rem;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: var(--radius-full);
  background: var(--graph-placeholder);
}
.sync-dot.is-stale { background: var(--graph-error); }
.legend-dot--ambiguous { border-radius: 0; transform: rotate(45deg); }
.graph-feedback { margin: 0; color: var(--graph-muted); overflow-wrap: anywhere; }
.graph-feedback[role='alert'] { color: var(--graph-error); }
.graph-stage {
  display: grid;
  place-items: center;
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.graph-stage::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background-image: radial-gradient(circle, var(--graph-grid) 0.04rem, transparent 0.055rem);
  background-size: 0.65rem 0.65rem;
  opacity: 0.45;
  transition: opacity 0.18s ease;
}
.graph-stage:hover::before { opacity: 0.85; }
.graph-empty {
  position: relative;
  max-width: 26rem;
  padding: 1.25rem;
  color: var(--graph-muted);
  text-align: center;
  font-size: var(--fs-secondary);
}
.graph-empty h3 { margin-bottom: 0.375rem; color: var(--graph-text); font-size: var(--fs-subtitle); }
.graph-legend {
  position: absolute;
  inset: auto auto 1rem 1rem;
  max-width: min(16rem, calc(100% - 2rem));
  max-height: 42%;
  overflow: auto;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--graph-line);
  border-radius: var(--radius-sm);
  background: var(--graph-surface);
  font-size: var(--fs-small);
}
.graph-legend h3 { margin: 0 0 0.375rem; font-weight: 600; }
.graph-legend ul { list-style: none; padding: 0; margin: 0; color: var(--graph-muted); }
.graph-legend li { display: flex; align-items: center; gap: 0.375rem; overflow-wrap: anywhere; }
.graph-legend li + li { margin-top: 0.25rem; }
@media (prefers-reduced-motion: reduce) {
  .graph-stage::before { transition: none; }
}
</style>
