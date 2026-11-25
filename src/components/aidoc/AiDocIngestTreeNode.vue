<template>
  <li class="tree-node" role="treeitem" :aria-level="level" :aria-expanded="isFolder ? expanded : undefined"
    :tabindex="ctx.activeId.value === node.id ? 0 : -1" :data-id="node.id" @focus="ctx.activeId.value = node.id">
    <div class="tree-row" :style="{ paddingLeft: `${(level - 1) * 1.25 + 0.5}rem` }">
      <template v-if="isFolder">
        <button type="button" class="tree-toggle" tabindex="-1" data-testid="aidoc-ingest-tree-toggle"
          :aria-label="t(expanded ? 'aidoc.ingestTreeCollapse' : 'aidoc.ingestTreeExpand', { name: node.name })"
          @click="ctx.toggle(node.id)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            aria-hidden="true" :class="{ 'tree-chevron-open': expanded }">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
        <span class="tree-name">{{ node.name }} ({{ node.count }})</span>
      </template>
      <template v-else>
        <span class="tree-toggle-spacer" aria-hidden="true"></span>
        <span class="tree-name">{{ node.name }}</span>
        <span class="tree-meta">{{ ctx.formatSize(node.source.size) }}</span>
        <span class="tree-state">{{ t(stateKeys[node.source.state]) }}</span>
      </template>
    </div>
    <ul v-if="isFolder && expanded" role="group" class="tree-group">
      <AiDocIngestTreeNode v-for="child in node.children" :key="child.id" :node="child" :level="level + 1" />
    </ul>
  </li>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useI18n } from '../../i18n/useI18n'

defineOptions({ name: 'AiDocIngestTreeNode' })
const props = defineProps({
  node: { type: Object, required: true },
  level: { type: Number, required: true },
})

const { t } = useI18n()
const ctx = inject('ingestTree')
const isFolder = computed(() => props.node.type === 'folder')
const expanded = computed(() => ctx.expanded.value.has(props.node.id))
const stateKeys = { new: 'aidoc.stateNew', updated: 'aidoc.stateUpdated', ingested: 'aidoc.stateIngested' }
</script>

<style scoped>
.tree-node { list-style: none; outline: none; }
.tree-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.75rem;
  padding-right: 0.5rem;
  border-radius: var(--radius-sm);
}
.tree-row:hover { background: var(--primary); }
.tree-node:focus-visible > .tree-row {
  outline: 0.125rem solid var(--text-muted);
  outline-offset: -0.125rem;
}
.tree-toggle, .tree-toggle-spacer {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
}
.tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--text-muted);
  background: none;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.tree-toggle:hover { color: inherit; }
.tree-chevron-open { transform: rotate(90deg); }
.tree-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.tree-meta, .tree-state {
  flex: none;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: var(--fs-caption);
}
.tree-group { margin: 0; padding: 0; }
@media (prefers-reduced-motion: no-preference) {
  .tree-chevron-open, .tree-toggle svg { transition: transform 0.15s ease-out; }
}
</style>
