<template>
  <div class="aidoc-toolbar">
    <AppTooltip :text="t('aidoc.wiki')">
      <AppButton size="icon" data-testid="aidoc-open-wiki" :aria-label="t('aidoc.wiki')" @click="$emit('open-wiki')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 6a7 7 0 0 0-7-2H3v15h2a7 7 0 0 1 7 2 7 7 0 0 1 7-2h2V4h-2a7 7 0 0 0-7 2Zm0 0v15" />
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
    <AppTooltip :text="syncTooltip">
      <AppButton
        class="aidoc-sync"
        size="icon"
        data-testid="aidoc-sync"
        :aria-label="syncLabel"
        :loading="syncBusy"
        aria-haspopup="dialog"
        :aria-expanded="Boolean(showRebuild || showIngest)"
        @click="onSyncClick"
        @contextmenu.prevent="openRebuild"
        @keydown.shift.f10.prevent="openRebuild"
        @keydown.context-menu.prevent="openRebuild"
      >
        <svg v-if="!syncBusy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 5h6l2 2h8v12H4zM12 16v-6m-3 3 3-3 3 3" />
        </svg>
        <span v-if="running" class="sync-bar" aria-hidden="true" data-testid="aidoc-sync-bar">
          <span class="sync-bar-fill" :style="{ width: percent + '%' }"></span>
        </span>
        <span v-if="resultBadge" class="sync-result" :class="'sync-result--' + resultBadge.variant" aria-hidden="true" data-testid="aidoc-sync-result">{{ resultBadge.text }}</span>
        <span v-if="pendingCount" class="sync-count" aria-hidden="true" data-testid="aidoc-sync-pending">{{ pendingCount }}</span>
        <span v-else-if="store.status?.indexStale" class="sync-dot" aria-hidden="true" data-testid="aidoc-sync-dot"></span>
      </AppButton>
    </AppTooltip>
    <span v-if="showPercent" class="sync-percent" data-testid="aidoc-sync-percent" aria-hidden="true">{{ percent }}%</span>
    <AppTooltip :text="t(store.ingesting ? 'aidoc.ingestAutoRebuild' : 'aidoc.fullRebuild')">
      <AppButton
        size="icon"
        data-testid="aidoc-rebuild"
        :aria-label="t('aidoc.fullRebuild')"
        :disabled="syncBusy || store.ingesting"
        aria-haspopup="dialog"
        @click="openRebuild"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20 11a8 8 0 0 0-14.3-4.9L4 8m0-5v5h5M4 13a8 8 0 0 0 14.3 4.9L20 16m0 5v-5h-5" />
        </svg>
      </AppButton>
    </AppTooltip>
    <span class="sr-only" :role="errorText ? 'alert' : 'status'">{{ feedback || syncTooltip }}</span>

    <AiDocIngestModal v-if="showIngest" />
    <ConfirmModal
      v-if="showRebuild && !store.ingesting"
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
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useAiDocStore } from '../../stores/aidoc'
import AppButton from '../common/AppButton.vue'
import AppTooltip from '../common/AppTooltip.vue'
import ConfirmModal from '../common/ConfirmModal.vue'
import AiDocIngestModal from './AiDocIngestModal.vue'

defineEmits(['open-graph', 'open-wiki'])
const { t } = useI18n()
const store = useAiDocStore()
const showRebuild = ref(false)
const showIngest = computed(() => store.ingestDialogVisible)
const syncBusy = computed(() => store.updating || store.syncPreparing)
watch(() => store.ingesting, running => {
  if (running) showRebuild.value = false
})
const pendingCount = computed(() => {
  const { ingestAvailable, pending } = store.status || {}
  return (ingestAvailable && pending ? pending.new + pending.updated : 0) + (pending?.removed ?? 0)
})
const syncText = computed(() => {
  const status = store.status
  if (!status) return t('aidoc.statusUnknown')
  return status.indexStale ? t('aidoc.wikiNeedsSync') : t('aidoc.syncOk')
})
const errorText = computed(() => {
  const key = store.ingestErrorKey || store.errorKey
  return key ? t(key) : store.ingestError || store.error
})
const feedback = computed(() => {
  if (errorText.value) return `${t('aidoc.indexFailed')} ${errorText.value}`
  if (syncBusy.value) return ''
  if (store.ingestNothing) return t('aidoc.ingestNothing')
  if (store.stats) return t('aidoc.indexDone', store.stats)
  const failed = store.status?.failedCount
  return failed ? t('aidoc.extractionFailed', { n: failed }) : ''
})

const percent = computed(() => store.syncPercent ?? 0)
// Organizing and reclassifying both run in the background behind the Sync button.
const running = computed(() => store.ingesting || store.reclassifying)
const showPercent = computed(() => syncBusy.value || running.value)

const fileName = rel => String(rel || '').split('/').pop()
// The latest finished run, shown as a badge until the user opens and dismisses it.
const resultBadge = computed(() => {
  if (running.value || store.ingestDialogVisible) return null
  const result = store.ingestResult
  const topics = store.wikiReclassification
  if (!result && topics && !topics.error) {
    return { variant: 'ok', text: '✓' + topics.count, tip: t('aidoc.wikiTopicCoverage', topics) }
  }
  if (!result) return null
  const done = result.done?.length || 0
  const failed = result.failed?.length || 0
  const removed = result.removed?.length || 0
  const params = { done, failed }
  if (result.aborted) return { variant: 'warn', text: '!', tip: t('aidoc.syncResultAborted', params) }
  if (result.stopped) return { variant: 'warn', text: '!', tip: t('aidoc.syncResultStopped', params) }
  const issue = failed || result.indexError || result.warnings?.length || result.remaining
  const tip = removed ? t('aidoc.syncResultWithRemovals', { ...params, removed }) : t('aidoc.syncResult', params)
  return { variant: issue ? 'warn' : 'ok', text: issue ? '!' : '✓' + (done + removed), tip }
})

const syncLabel = computed(() => {
  if (store.reclassifying) return t('aidoc.wikiClassifyingTopics')
  return t(store.ingesting ? 'aidoc.syncInProgress' : (syncBusy.value ? 'aidoc.updating' : 'aidoc.sync'))
})
const ingestDetail = computed(() => {
  const info = store.ingestProgress
  if (info?.phase === 'reconciling') return t('aidoc.ingestReconciling')
  if (!info?.total) return `${percent.value}%`
  if (Number.isInteger(info.completed)) {
    return t('aidoc.ingestBatchProgress', { done: info.completed, total: info.total, percent: percent.value })
  }
  return t('aidoc.syncRunning', { i: info.index + 1, n: info.total, name: fileName(info.rel), percent: percent.value })
})
const syncTooltip = computed(() => {
  if (running.value) {
    const detail = store.reclassifying ? `${percent.value}%` : ingestDetail.value
    return [syncLabel.value, detail, t('aidoc.ingestOpenProgress')].join(' · ')
  }
  const detail = store.updating
    ? (store.progress && t('aidoc.indexProgress', store.progress))
    : syncText.value
  const percentText = store.updating ? t('aidoc.indexPercent', { percent: percent.value }) : ''
  const pending = pendingCount.value ? t('aidoc.syncPending', { n: pendingCount.value }) : ''
  const options = syncBusy.value ? '' : t('aidoc.syncOptionsHint')
  return [resultBadge.value?.tip || syncLabel.value, detail, percentText, pending, feedback.value, options].filter(Boolean).join(' · ')
})

function onSyncClick() {
  if (running.value || resultBadge.value) store.openIngestResult()
  else store.runSync()
}

function openRebuild() {
  if (!syncBusy.value && !store.ingesting && !showIngest.value) showRebuild.value = true
}

function rebuildIndex() {
  showRebuild.value = false
  if (!store.ingesting && !syncBusy.value) store.updateIndex({ full: true })
}

onMounted(() => {
  store.ensureIngestListener()
  store.refreshStatus()
  store.restoreIngestStatus()
})
</script>

<style scoped>
.aidoc-toolbar {
  --aidoc-stale-badge: #ef4444;
  --aidoc-result-ok: #16a34a;
  --aidoc-result-warn: #d97706;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.aidoc-sync { position: relative; }
.sync-bar {
  position: absolute;
  inset-inline: 0.25rem;
  inset-block-end: 0.125rem;
  height: 0.125rem;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--border);
}
.sync-bar-fill {
  display: block;
  height: 100%;
  background: currentColor;
  transition: width 0.3s ease-out;
}
.sync-result {
  position: absolute;
  inset-block-end: -0.25rem;
  inset-inline-end: -0.25rem;
  min-width: 0.875rem;
  padding: 0 0.1875rem;
  border-radius: var(--radius-full);
  color: #fff;
  font-size: 0.625rem;
  line-height: 0.875rem;
  text-align: center;
}
.sync-result--ok { background: var(--aidoc-result-ok); }
.sync-result--warn { background: var(--aidoc-result-warn); }
.sync-percent {
  min-width: 2rem;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  font-variant-numeric: tabular-nums;
}
.sync-count {
  position: absolute;
  inset-block-start: -0.25rem;
  inset-inline-end: -0.25rem;
  min-width: 0.875rem;
  padding: 0 0.1875rem;
  border-radius: var(--radius-full);
  background: var(--aidoc-stale-badge);
  color: #fff;
  font-size: 0.625rem;
  line-height: 0.875rem;
  text-align: center;
}
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
