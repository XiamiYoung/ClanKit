<template>
  <div class="aidoc-toolbar">
    <AppTooltip :text="updateTooltip">
      <AppButton
        class="aidoc-index-update"
        size="icon"
        data-testid="aidoc-update"
        :aria-label="updateLabel"
        :loading="store.updating"
        @click="store.updateIndex()"
      >
        <svg v-if="!store.updating" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6 7a7 7 0 0 1 11.6-1L20 12M4 12l2.4 6A7 7 0 0 0 18 17" />
        </svg>
        <span
          v-if="store.status && !store.updating"
          class="sync-dot"
          :class="{ 'is-stale': store.status.indexStale }"
          aria-hidden="true"
          data-testid="aidoc-sync-dot"
        ></span>
      </AppButton>
    </AppTooltip>
    <AppTooltip :text="t('aidoc.indexOptions')">
      <AppButton
        size="icon"
        data-testid="aidoc-index-options"
        :aria-label="t('aidoc.indexOptions')"
        aria-haspopup="dialog"
        :aria-expanded="showOptions"
        :disabled="store.updating"
        @click="showOptions = true"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </AppButton>
    </AppTooltip>
    <AppTooltip :text="t('aidoc.graph')">
      <AppButton
        size="icon"
        data-testid="aidoc-open-graph"
        :aria-label="t('aidoc.graph')"
        @click="$emit('open-graph')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="5" cy="12" r="2.5" />
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="17" cy="19" r="2.5" />
          <path d="m7.3 10.8 8.4-4.6m-8.4 7.1 7.5 4.4" />
        </svg>
      </AppButton>
    </AppTooltip>
    <span class="sr-only" :role="store.error ? 'alert' : 'status'">{{ feedback || updateTooltip }}</span>

    <ConfirmModal
      v-if="showOptions"
      :visible="true"
      :title="t('aidoc.indexOptions')"
      :message="t('aidoc.fullRebuildHint')"
      :confirm-text="t('aidoc.fullRebuild')"
      confirm-class="primary"
      @close="showOptions = false"
      @confirm="rebuildIndex"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useAiDocStore } from '../../stores/aidoc'
import AppButton from '../common/AppButton.vue'
import AppTooltip from '../common/AppTooltip.vue'
import ConfirmModal from '../common/ConfirmModal.vue'

defineEmits(['open-graph'])
const { t } = useI18n()
const store = useAiDocStore()
const showOptions = ref(false)
const syncText = computed(() => {
  const status = store.status
  if (!status) return t('aidoc.statusUnknown')
  return status.indexStale ? t('aidoc.syncStale', { n: status.staleCount }) : t('aidoc.syncOk')
})
const feedback = computed(() => {
  if (store.error) return `${t('aidoc.indexFailed')} ${store.error}`
  return store.stats && !store.updating ? t('aidoc.indexDone', store.stats) : ''
})

const updateLabel = computed(() => t(store.updating ? 'aidoc.updating' : 'aidoc.updateIndex'))
const updateTooltip = computed(() => {
  const detail = store.updating
    ? (store.progress && t('aidoc.indexProgress', store.progress))
    : syncText.value
  return [updateLabel.value, detail, feedback.value].filter(Boolean).join(' ? ')
})

function rebuildIndex() {
  showOptions.value = false
  store.updateIndex({ full: true })
}

onMounted(() => store.refreshStatus())
</script>

<style scoped>
.aidoc-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.aidoc-index-update { position: relative; }
.sync-dot {
  position: absolute;
  inset-block-start: 0.25rem;
  inset-inline-end: 0.25rem;
  width: 0.3125rem;
  height: 0.3125rem;
  border-radius: var(--radius-full);
  background: var(--text-muted);
}
.sync-dot.is-stale { background: var(--accent); }
</style>
