<template>
  <ul ref="tree" class="ingest-tree" role="tree" :aria-label="t('aidoc.ingestTreeLabel')" data-testid="aidoc-ingest-tree"
    @keydown="onKeydown">
    <AiDocIngestTreeNode :node="root" :level="1" />
  </ul>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { buildIngestTree, defaultExpanded } from '../../utils/ingestTree'
import AiDocIngestTreeNode from './AiDocIngestTreeNode.vue'

const props = defineProps({
  sources: { type: Array, required: true },
  formatSize: { type: Function, required: true },
})

const { t } = useI18n()
const tree = ref(null)
const root = computed(() => buildIngestTree(props.sources))
const expanded = ref(defaultExpanded())
const activeId = ref(root.value.id)
watch(root, () => {
  expanded.value = defaultExpanded()
  activeId.value = root.value.id
})

function toggle(id, open = !expanded.value.has(id)) {
  const next = new Set(expanded.value)
  if (open) next.add(id)
  else {
    next.delete(id)
    // The focus target may live inside the subtree that is about to disappear.
    activeId.value = id
  }
  expanded.value = next
}
provide('ingestTree', { expanded, activeId, toggle, formatSize: (...args) => props.formatSize(...args) })

// Collapsed subtrees are not rendered, so DOM order is exactly the visible order.
const items = () => [...tree.value.querySelectorAll('[role="treeitem"]')]
const focusItem = el => el?.focus()

function onKeydown(event) {
  const el = event.target
  if (el.getAttribute?.('role') !== 'treeitem') return
  const folder = el.hasAttribute('aria-expanded')
  const open = el.getAttribute('aria-expanded') === 'true'
  const id = el.dataset.id
  const list = items()
  const index = list.indexOf(el)
  let handled = true
  if (event.key === 'ArrowDown') focusItem(list[index + 1])
  else if (event.key === 'ArrowUp') focusItem(list[index - 1])
  else if (event.key === 'Home') focusItem(list[0])
  else if (event.key === 'End') focusItem(list[list.length - 1])
  else if (event.key === 'ArrowRight') {
    if (folder && !open) toggle(id, true)
    else if (folder) focusItem(el.querySelector(':scope > [role="group"] > [role="treeitem"]'))
  } else if (event.key === 'ArrowLeft') {
    if (folder && open) toggle(id, false)
    else focusItem(el.parentElement.closest('[role="treeitem"]'))
  } else if ((event.key === 'Enter' || event.key === ' ') && folder) toggle(id)
  else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

</script>

<style scoped>
.ingest-tree {
  max-height: 50vh;
  margin: 0;
  padding: 0.25rem;
  overflow: auto;
  list-style: none;
  background: var(--ingest-footer, transparent);
  border-radius: var(--radius-sm);
}
</style>
