<template>
  <div class="aidoc-toolbar">
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
    <AppTooltip :text="rebuildTooltip">
      <AppButton
        class="aidoc-index-rebuild"
        size="icon"
        data-testid="aidoc-rebuild-index"
        :aria-label="rebuildLabel"
        :loading="store.updating"
        aria-haspopup="dialog"
        :aria-expanded="showRebuild"
        @click="showRebuild = true"
      >
        <svg v-if="!store.updating" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6 7a7 7 0 0 1 11.6-1L20 12M4 12l2.4 6A7 7 0 0 0 18 17" />
        </svg>
        <span v-if="store.status?.indexStale" class="sync-dot" aria-hidden="true" data-testid="aidoc-sync-dot"></span>
      </AppButton>
    </AppTooltip>
    <span class="sr-only" :role="errorText ? 'alert' : 'status'">{{ feedback || rebuildTooltip }}</span>

    <ConfirmModal
      v-if="showRebuild"
      :visible="true"
      :title="t('aidoc.fullRebuild')"
      :message="t('aidoc.fullRebuildHint')"
      :confirm-text="t('aidoc.fullRebuild')"
      confirm-class="primary"
      @close="showRebuild = false"
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
const showRebuild = ref(false)
const syncText = computed(() => {
  const status = store.status
  if (!status) return t('aidoc.statusUnknown')
  return status.indexStale ? t('aidoc.wikiNeedsSync') : t('aidoc.syncOk')
})
const errorText = computed(() => store.errorKey ? t(store.errorKey) : store.error)
const feedback = computed(() => {
  if (errorText.value) return `${t('aidoc.indexFailed')} ${errorText.value}`
  if (store.updating) return ''
  if (store.stats) return t('aidoc.indexDone', store.stats)
  const failed = store.status?.failedCount
  return failed ? t('aidoc.extractionFailed', { n: failed }) : ''
})

const rebuildLabel = computed(() => t(store.updating ? 'aidoc.updating' : 'aidoc.fullRebuild'))
const rebuildTooltip = computed(() => {
  const detail = store.updating
    ? (store.progress && t('aidoc.indexProgress', store.progress))
    : syncText.value
  return [rebuildLabel.value, detail, feedback.value].filter(Boolean).join(' ? ')
})

function rebuildIndex() {
  showRebuild.value = false
  store.updateIndex({ full: true })
}

onMounted(() => store.refreshStatus())
</script>

<style scoped>
.aidoc-toolbar {
  --aidoc-stale-badge: #ef4444;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.aidoc-index-rebuild { position: relative; }
.sync-dot {
  position: absolute;
  inset-block-start: 0.25rem;
  inset-inline-end: 0.25rem;
  width: 0.3125rem;
  height: 0.3125rem;
  border-radius: var(--radius-full);
  background: var(--aidoc-stale-badge);
}
</style>
