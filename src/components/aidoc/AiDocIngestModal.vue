<template>
  <Teleport to="body">
    <dialog ref="dialog" class="ingest-dialog" aria-modal="true" aria-labelledby="aidoc-ingest-title" @cancel.prevent="dismiss">
      <header class="ingest-header">
        <h2 id="aidoc-ingest-title">{{ t('aidoc.ingestTitle') }}</h2>
        <AppTooltip v-if="!store.ingesting" :text="t('common.close')">
          <AppButton size="icon" variant="ghost" type="button" :aria-label="t('common.close')" @click="dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </AppButton>
        </AppTooltip>
      </header>

      <div class="ingest-body">
        <section v-if="store.ingesting" class="ingest-running" role="status">
          <template v-if="store.ingestProgress?.total">
            <p>{{ t('aidoc.ingestRunning', { i: store.ingestProgress.index + 1, n: store.ingestProgress.total }) }}</p>
            <p class="ingest-path">{{ store.ingestProgress.rel }}</p>
            <p v-if="store.ingestProgress.action" class="ingest-detail">{{ store.ingestProgress.action }}</p>
          </template>
          <p v-else>{{ t('aidoc.ingestPreparing') }}</p>
        </section>

        <template v-else-if="store.ingestResult">
          <div class="ingest-summary" role="status">
            <p>{{ t('aidoc.ingestDone', { n: store.ingestResult.done.length }) }}</p>
            <p>{{ t('aidoc.ingestFailed', { n: store.ingestResult.failed.length }) }}</p>
            <p v-if="store.ingestResult.stopped">{{ t('aidoc.ingestStopped') }}</p>
            <p v-if="(store.ingestResult.remaining ?? store.ingestResult.overflow) > 0">{{ t('aidoc.ingestRemaining', { n: store.ingestResult.remaining ?? store.ingestResult.overflow }) }}</p>
          </div>
          <ul v-if="store.ingestResult.failed.length" class="ingest-list">
            <li v-for="failure in store.ingestResult.failed" :key="failure.rel" class="ingest-failure">
              <span class="ingest-path">{{ failure.rel }}</span>
              <span class="ingest-detail">{{ t(reasonKeys[failure.reason] || 'aidoc.reasonAgentError') }}</span>
              <span v-if="failure.detail" class="ingest-detail">{{ failure.detail }}</span>
            </li>
          </ul>
          <p v-if="store.ingestResult.indexError" class="ingest-alert" role="alert">
            {{ t('aidoc.ingestIndexError') }} {{ store.ingestResult.indexError }}
          </p>
        </template>

        <template v-else-if="store.ingestPlan">
          <p>{{ t('aidoc.ingestFiles', { n: store.ingestPlan.sources.length }) }}</p>
          <ul class="ingest-list">
            <li v-for="source in store.ingestPlan.sources" :key="source.rel" class="ingest-source">
              <span class="ingest-path">{{ source.rel }}</span>
              <span class="ingest-size ingest-detail">{{ formatSize(source.size) }}</span>
              <span class="ingest-state">{{ t(stateKeys[source.state]) }}</span>
            </li>
          </ul>
          <p v-if="store.ingestPlan.overflow" class="ingest-detail">
            {{ t('aidoc.ingestOverflow', { n: store.ingestPlan.overflow }) }}
          </p>
          <p v-if="!store.ingestPlan.providerReady" class="ingest-alert" role="alert">{{ providerMessage }}</p>
        </template>

        <p v-if="store.ingestErrorKey || store.ingestError" class="ingest-alert" role="alert">
          {{ store.ingestErrorKey && t(store.ingestErrorKey) }} {{ store.ingestError }}
        </p>
      </div>

      <footer class="ingest-footer">
        <AppButton v-if="store.ingesting" size="modal" variant="danger" type="button"
          data-testid="aidoc-ingest-stop" :disabled="store.ingestStopping" @click="store.stopIngest()">
          {{ t('aidoc.ingestStop') }}
        </AppButton>
        <template v-else>
          <AppButton size="modal" :variant="confirming ? 'ghost' : 'primary'" type="button"
            data-testid="aidoc-ingest-dismiss" @click="dismiss">
            {{ t(confirming ? 'common.cancel' : 'common.close') }}
          </AppButton>
          <AppButton v-if="confirming" size="modal" type="button" data-testid="aidoc-ingest-start"
            :disabled="!store.ingestPlan.providerReady" @click="store.confirmIngest()">
            {{ t('aidoc.ingestStart') }}
          </AppButton>
        </template>
      </footer>
    </dialog>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useAiDocStore } from '../../stores/aidoc'
import AppButton from '../common/AppButton.vue'
import AppTooltip from '../common/AppTooltip.vue'

const { t, locale } = useI18n()
const store = useAiDocStore()
const dialog = ref(null)
const confirming = computed(() => !!store.ingestPlan && !store.ingestResult)
const providerMessage = computed(() => {
  const error = store.ingestPlan?.providerError
  return error && error !== 'providerMissing' ? error : t('aidoc.providerMissing')
})

const stateKeys = { new: 'aidoc.stateNew', updated: 'aidoc.stateUpdated', ingested: 'aidoc.stateIngested' }
const reasonKeys = {
  scanned_pdf: 'aidoc.reasonScannedPdf',
  unsupported: 'aidoc.reasonUnsupported',
  empty: 'aidoc.reasonEmpty',
  extract_failed: 'aidoc.reasonExtractFailed',
  no_pages: 'aidoc.reasonNoPages',
  read_failed: 'aidoc.reasonReadFailed',
  agent_error: 'aidoc.reasonAgentError',
  record_failed: 'aidoc.reasonRecordFailed'
}

const numberFormat = computed(() => new Intl.NumberFormat(locale?.value, { maximumFractionDigits: 1 }))
function formatSize(bytes) {
  if (bytes < 1024) return `${numberFormat.value.format(bytes)} B`
  if (bytes < 1024 ** 2) return `${numberFormat.value.format(bytes / 1024)} KB`
  return `${numberFormat.value.format(bytes / 1024 ** 2)} MB`
}

function dismiss() {
  if (!store.ingesting) store.cancelIngestPlan()
}

onMounted(() => dialog.value.showModal())
onUnmounted(() => dialog.value?.close())
</script>

<style scoped>
.ingest-dialog {
  --ingest-surface: #0f0f0f;
  --ingest-footer: #0a0a0a;
  --ingest-border: #2a2a2a;
  --ingest-title: #fff;
  --ingest-danger: #fca5a5;
  --ingest-shadow: 0 1.25rem 3rem rgb(0 0 0 / 45%);
  --ingest-backdrop: rgb(0 0 0 / 60%);
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(32rem, calc(100% - 2rem));
  max-height: calc(100% - 2rem);
  padding: 0;
  overflow: hidden;
  color: var(--ingest-title);
  background: var(--ingest-surface);
  border: 1px solid var(--ingest-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--ingest-shadow);
  font-size: var(--fs-secondary);
}
.ingest-dialog[open] {
  display: flex;
  flex-direction: column;
  animation: ingest-enter 0.2s ease-out;
}
.ingest-dialog::backdrop {
  background: var(--ingest-backdrop);
  backdrop-filter: blur(0.3rem);
}
.ingest-header, .ingest-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}
.ingest-header {
  min-height: 3.5rem;
  justify-content: space-between;
  border-bottom: 1px solid var(--ingest-border);
}
.ingest-header h2 {
  margin: 0;
  font-size: var(--fs-subtitle);
  font-weight: 700;
}
.ingest-body {
  display: grid;
  gap: 0.75rem;
  overflow: auto;
  padding: 1rem;
}
.ingest-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--ingest-border);
  border-radius: var(--radius-sm);
}
.ingest-list li + li { border-top: 1px solid var(--ingest-border); }
.ingest-source {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
}
.ingest-failure, .ingest-running, .ingest-summary {
  display: grid;
  gap: 0.25rem;
}
.ingest-failure { padding: 0.5rem 0.75rem; }
.ingest-path, .ingest-detail, .ingest-alert { overflow-wrap: anywhere; }
.ingest-detail { color: var(--text-muted); }
.ingest-state, .ingest-size {
  white-space: nowrap;
  font-size: var(--fs-caption);
}
.ingest-state {
  padding: 0.125rem 0.375rem;
  background: var(--primary);
  border-radius: var(--radius-sm);
}
.ingest-alert { color: var(--ingest-danger); }
.ingest-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--ingest-border);
  background: var(--ingest-footer);
}
.ingest-dialog :deep(.app-btn--ghost) {
  color: var(--ingest-title);
  background: var(--primary);
}
.ingest-dialog :deep(.app-btn--ghost:hover) { background: var(--primary-hover); }
@keyframes ingest-enter {
  from { opacity: 0; transform: scale(0.95) translateY(0.4rem); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .ingest-dialog[open] { animation: none; }
}
</style>
