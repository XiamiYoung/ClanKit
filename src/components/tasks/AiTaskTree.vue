<template>
  <div class="att-panel">
    <div class="att-header">
      <h3 class="att-title">{{ t('tasks.executionTree') }}</h3>
      <input v-model="searchText" class="att-search" :placeholder="t('common.search')" />
    </div>

    <div class="att-tree">
      <div v-for="group in groupedTree" :key="group.id" class="att-category">
        <button class="att-cat-toggle" :class="{ 'is-open': openCategories.has(group.id) }" @click="toggleCategory(group.id)">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
          <span class="att-cat-emoji">{{ group.emoji }}</span>
          <span class="att-cat-name">{{ group.name }}</span>
          <span class="att-cat-count">{{ group.plans.length }}</span>
        </button>

        <div v-show="openCategories.has(group.id)" class="att-category-content">
          <div v-for="plan in filteredPlans(group)" :key="plan.planId" class="att-plan">
            <button class="att-plan-toggle" :class="{ 'is-open': openPlans.has(plan.planId) }" @click="togglePlan(plan.planId)">
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
              <span class="att-plan-label" :class="{ deleted: plan.deletedAt }">{{ plan.planName }}</span>
              <span v-if="plan.deletedAt" class="att-deleted-badge">(deleted)</span>
            </button>

            <div v-show="openPlans.has(plan.planId)" class="att-plan-content">
              <div
                v-for="item in plan.items"
                :key="item.itemId"
                class="att-item"
                :class="{ active: selectedItemId === item.itemId }"
                @click="selectItem({ item, plan })"
              >
                <span class="att-item-icon">
                  <svg v-if="item.type === 'manual'" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                  <svg v-else-if="item.type === 'once'" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <svg v-else style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                </span>
                <span class="att-item-label">{{ itemLabel(item) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  tree:            { type: Object, default: () => ({ plans: [] }) },
  planCategories:  { type: Array, default: () => [] },
  selectedItemId:  { type: String, default: null },
})
const emit = defineEmits(['select-item'])

const searchText = ref('')
const openCategories = ref(new Set())
const openPlans = ref(new Set())

const groupedTree = computed(() => {
  const catMap = Object.fromEntries(props.planCategories.map(c => [c.id, { ...c, plans: [] }]))
  const uncategorized = { id: null, name: 'Uncategorized', emoji: '📋', plans: [] }

  for (const plan of props.tree.plans) {
    if (plan.categoryId && catMap[plan.categoryId]) {
      catMap[plan.categoryId].plans.push(plan)
    } else {
      uncategorized.plans.push(plan)
    }
  }

  const result = [...Object.values(catMap).filter(g => g.plans.length), ...(uncategorized.plans.length ? [uncategorized] : [])]
  // Auto-open first category
  if (result.length > 0 && openCategories.value.size === 0) {
    openCategories.value.add(result[0].id)
  }
  return result
})

function toggleCategory(id) {
  if (openCategories.value.has(id)) {
    openCategories.value.delete(id)
  } else {
    openCategories.value.add(id)
  }
}

function togglePlan(id) {
  if (openPlans.value.has(id)) {
    openPlans.value.delete(id)
  } else {
    openPlans.value.add(id)
  }
}

function filteredPlans(group) {
  const search = searchText.value.toLowerCase()
  if (!search) return group.plans
  return group.plans.filter(p => p.planName.toLowerCase().includes(search))
}

function itemLabel(item) {
  if (item.type === 'manual') return t('tasks.manual')
  if (item.type === 'once') return t('tasks.oneTime')
  if (item.type === 'cron') return `${t('tasks.recurring')}: ${item.cronExpr}`
  return item.description
}

function selectItem(payload) {
  emit('select-item', payload)
}
</script>

<style scoped>
.att-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
}

.att-header {
  flex-shrink: 0;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.att-title {
  margin: 0 0 0.75rem;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--text-primary);
}

.att-search {
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--fs-secondary);
  background: var(--bg-main);
}

.att-tree {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.att-category {
  margin: 0.5rem 0;
}

.att-cat-toggle {
  width: 100%;
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
  transition: background 0.1s;
}

.att-cat-toggle:hover {
  background: var(--bg-hover);
}

.att-cat-toggle svg {
  transition: transform 0.15s;
  flex-shrink: 0;
}
.att-cat-toggle.is-open svg {
  transform: rotate(90deg);
}
.att-plan-toggle svg {
  transition: transform 0.15s;
  flex-shrink: 0;
}
.att-plan-toggle.is-open svg {
  transform: rotate(90deg);
}

.att-cat-emoji {
  flex-shrink: 0;
  font-size: var(--fs-body);
}

.att-cat-name {
  flex: 1;
  text-align: left;
}

.att-cat-count {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  padding: 0.125rem 0.375rem;
  background: var(--bg-main);
  border-radius: var(--radius-sm);
}

.att-category-content {
  padding: 0.25rem 0 0.25rem 1rem;
}

.att-plan {
  margin: 0.25rem 0;
}

.att-plan-toggle {
  width: 100%;
  padding: 0.375rem 0.5rem;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
  transition: background 0.1s;
  text-align: left;
}

.att-plan-toggle:hover {
  background: var(--bg-hover);
}

.att-plan-label {
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.att-plan-label.deleted {
  opacity: 0.5;
  font-style: italic;
  text-decoration: line-through;
}

.att-deleted-badge {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  flex-shrink: 0;
}

.att-plan-content {
  padding: 0.25rem 0 0.25rem 2rem;
}

.att-item {
  padding: 0.375rem 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition: all 0.15s;
}

.att-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.att-item.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}

.att-item-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.att-item-label {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
</style>
