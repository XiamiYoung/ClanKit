<template>
  <section
    class="aidoc-graph-panel"
    :style="panelStyle"
    :class="{ 'is-maximized': maximized, 'is-embedded': embedded }"
    :aria-label="t('aidoc.graph')"
    @mousedown.stop
    @mouseup.stop
  >
    <div class="graph-titlebar" @pointerdown.self="startDrag?.($event, 'move')" @dblclick.self="toggleMaximize?.()">
      <div
        v-if="!embedded"
        class="graph-drag-handle"
        :class="{ 'is-dragging': interaction === 'move' }"
        tabindex="0"
        :aria-description="t('aidoc.moveGraph')"
        @pointerdown="startDrag($event, 'move')"
        @keydown="adjustWithKeys($event, 'move')"
        @dblclick="toggleMaximize"
      >
        <h2>{{ t('aidoc.graph') }}</h2>
      </div>
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
          @keydown.esc="clearSearch"
        />
      </div>
      <div v-if="!embedded" class="graph-window-controls">
        <button type="button" data-testid="aidoc-graph-maximize" :aria-label="t(maximizeKey)"
          v-tooltip="t(maximizeKey)" @click="toggleMaximize">
          <svg v-if="!maximized" width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <rect x="0.5" y="0.5" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
          </svg>
          <svg v-else width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <rect x="2" y="0.5" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
            <rect class="graph-restore-front" x="0.5" y="2" width="8.5" height="8.5" rx="1" stroke="currentColor" stroke-width="1.2" />
          </svg>
        </button>
        <button type="button" class="graph-window-close" data-testid="aidoc-graph-close" :aria-label="t('aidoc.closeGraph')"
          v-tooltip="t('aidoc.closeGraph')" @click="$emit('close')">
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
    <header class="graph-header">
      <div class="graph-meta">
        <div class="graph-view">
          <div class="graph-dimensions" role="group" :aria-label="t('aidoc.graphViewMode')">
            <button v-for="value in [2, 3]" :key="value" type="button" :data-testid="`aidoc-graph-${value}d`"
              :aria-pressed="dimensions === value" @click="dimensions = value">{{ value }}D</button>
          </div>
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
          <label class="graph-toggle">
            <input v-model="hideOrphans" type="checkbox" data-testid="aidoc-hide-orphans" />
            {{ t('aidoc.hideOrphans') }}
          </label>
        </div>
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
      <component
        :is="dimensions === 2 ? AiDocGraph2D : AiDocGraph"
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
            {{ group || t('aidoc.wikiCategoryUncategorized') }}
          </li>
          <li v-if="hasUnresolved">
            <span class="legend-dot"></span>{{ t('aidoc.unresolvedNode') }}
          </li>
          <li v-if="hasAmbiguous">
            <span class="legend-dot legend-dot--ambiguous"></span>{{ t('aidoc.ambiguousNode') }}
          </li>
          <template v-if="dimensions === 2">
            <li class="legend-shape-first"><span class="legend-shape"></span>{{ t('aidoc.graphShapePage') }}</li>
            <li><span class="legend-shape legend-shape--source"></span>{{ t('aidoc.graphShapeSource') }}</li>
            <li><span class="legend-shape legend-shape--bridge"></span>{{ t('aidoc.graphShapeBridge') }}</li>
          </template>
        </ul>
      </aside>
    </div>
    <AppTooltip v-if="!embedded && !maximized" class="graph-resize-handle" :text="t('aidoc.resizeGraph')">
      <AppButton
        class="graph-resize-button"
        size="icon"
        variant="ghost"
        :aria-label="t('aidoc.resizeGraph')"
        @pointerdown="startDrag($event, 'resize')"
        @keydown="adjustWithKeys($event, 'resize')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="m5 19 14-14m-7 14 7-7" />
        </svg>
      </AppButton>
    </AppTooltip>
  </section>
</template>

<script setup>
import { useFloatingPanel } from '../../composables/useFloatingPanel'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useAiDocStore } from '../../stores/aidoc'
import { filterGraph } from '../../utils/aidocGraphFilter'
import AppButton from '../common/AppButton.vue'
import AppTooltip from '../common/AppTooltip.vue'

const AiDocGraph = defineAsyncComponent(() =>
  import('./AiDocGraph.vue').then(module => module.default))
const AiDocGraph2D = defineAsyncComponent(() =>
  import('./AiDocGraph2D.vue').then(module => module.default))

const emit = defineEmits(['close', 'open-file'])
// Embedded, the graph fills its container instead of floating as a dialog.
const props = defineProps({ embedded: Boolean })
const { t } = useI18n()
const store = useAiDocStore()
const errorText = computed(() => store.errorKey ? t(store.errorKey) : store.error)
const graph = computed(() => store.graph)
const query = ref('')
const hideOrphans = ref(false)
const hiddenExts = ref([])
// Every opening starts in 3D.
const dimensions = ref(3)

const { panelStyle, interaction, maximized, startDrag, adjustWithKeys, toggleMaximize } = props.embedded ? {} : useFloatingPanel({
  widthRatio: 0.84, heightRatio: 0.86, minWidth: 360, minHeight: 260,
})
const maximizeKey = computed(() => maximized?.value ? 'titlebar.restore' : 'titlebar.maximize')

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
  return (ingestAvailable && pending ? pending.new + pending.updated : 0) + (pending?.removed ?? 0)
})

function toggleExtension(ext, visible) {
  hiddenExts.value = visible ? hiddenExts.value.filter(value => value !== ext) : [...hiddenExts.value, ext]
}

function clearSearch(event) {
  if (!query.value) return
  event.preventDefault()
  event.stopPropagation()
  query.value = ''
}

function openFile(node) {
  if (node?.kind === 'doc' && node.path) emit('open-file', { path: node.path, name: node.name })
}

onMounted(() => {
  store.loadGraph()
  store.refreshStatus()
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
  position: fixed;
  z-index: 100;
  -webkit-app-region: no-drag;
  display: flex;
  flex-direction: column;
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
.aidoc-graph-panel.is-maximized { border: 0; border-radius: 0; }
.aidoc-graph-panel.is-embedded {
  position: relative;
  z-index: auto;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
/* Mirrors the Wiki window title bar: title, centered search, window controls. */
.graph-titlebar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  min-height: 3rem;
  padding: 0.5rem 0.5rem 0.5rem 0.75rem;
  border-bottom: 1px solid var(--graph-line);
  user-select: none;
}
.is-embedded .graph-titlebar { min-height: 0; padding: 0.625rem 0.75rem 0; border: 0; }
.is-embedded .graph-search { width: min(24rem, 100%); margin: 0; }
.graph-drag-handle {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  align-self: stretch;
  cursor: grab;
  touch-action: none;
}
.graph-drag-handle.is-dragging { cursor: grabbing; }
.graph-drag-handle h2 { margin: 0; font-size: var(--fs-subtitle); font-weight: 700; }
.graph-window-controls { display: flex; flex-shrink: 0; align-items: center; gap: 0.125rem; }
.graph-window-controls button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 1.625rem;
  border-radius: var(--radius-sm);
  color: var(--graph-muted);
  transition: background 0.15s, color 0.15s;
}
.graph-window-controls button:hover { background: var(--graph-control); color: var(--text-primary); }
.graph-window-controls .graph-window-close:hover { background: #c0392b; color: #fff; }
.graph-restore-front { fill: var(--graph-surface); }
.graph-dimensions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.125rem;
  padding: 0.125rem;
  border: 1px solid var(--graph-line);
  border-radius: var(--radius-sm);
}
.graph-dimensions button {
  min-width: 2.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
  color: var(--graph-muted);
  font-size: var(--fs-small);
  font-weight: 600;
}
.graph-dimensions button:hover { background: var(--graph-control); }
.graph-dimensions button[aria-pressed='true'] {
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
  color: #FFFFFF;
}
.graph-header {
  display: grid;
  gap: 0.5rem;
  max-height: 50%;
  overflow: auto;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--graph-line);
}
.graph-meta, .graph-sync, .graph-toggle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
}
.graph-search {
  width: min(34rem, 46%);
  height: 1.75rem;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding-inline: 0.625rem;
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
.graph-view { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
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
.legend-shape-first { padding-top: 0.25rem; border-top: 1px solid var(--graph-line); }
.legend-shape {
  flex: 0 0 0.5rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--radius-full);
  background: var(--graph-placeholder);
}
.legend-shape--source { border-radius: 0; }
.legend-shape--bridge { box-shadow: 0 0 0 1px var(--graph-surface), 0 0 0 2px var(--text-primary); }
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
.graph-resize-handle {
  position: absolute;
  right: 0.25rem;
  bottom: 0.25rem;
}
.graph-resize-button { cursor: nwse-resize; touch-action: none; }
@media (prefers-reduced-motion: reduce) {
  .graph-stage::before { transition: none; }
}
</style>
