<template>
  <Teleport to="body">
    <dialog ref="dialog" class="ingest-dialog" aria-modal="true" aria-labelledby="aidoc-ingest-title" @cancel.prevent="dismiss">
      <header class="ingest-header">
        <h2 id="aidoc-ingest-title">{{ t('aidoc.ingestTitle') }}</h2>
        <AppTooltip :text="t('common.close')">
          <AppButton size="icon" variant="ghost" type="button" :aria-label="t('common.close')" @click="dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </AppButton>
        </AppTooltip>
      </header>

      <div class="ingest-body">
        <div v-if="showModelControls" class="ingest-model">
          <label class="ingest-field">
            <span class="ingest-detail">{{ t('aidoc.ingestProviderLabel') }}</span>
            <select class="ingest-input" data-testid="aidoc-ingest-provider" :value="store.ingestModel.providerId"
              @change="changeProvider($event.target.value)">
              <option v-for="provider in store.ingestPlan.providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
            </select>
          </label>
          <label class="ingest-field">
            <span class="ingest-detail">{{ t('aidoc.ingestModelLabel') }}</span>
            <input class="ingest-input" data-testid="aidoc-ingest-model" type="text" list="aidoc-ingest-models"
              maxlength="200" autocomplete="off" spellcheck="false" :value="store.ingestModel.model"
              @input="store.ingestModel.model = $event.target.value">
            <datalist id="aidoc-ingest-models">
              <option v-for="model in providerModels" :key="model" :value="model" />
            </datalist>
          </label>
          <p v-if="modelSourceKey" class="ingest-detail ingest-model-hint" data-testid="aidoc-ingest-model-source">{{ t(modelSourceKey) }}</p>
          <p class="ingest-detail ingest-model-hint">{{ t('aidoc.ingestModelHint') }}</p>
        </div>

        <fieldset v-if="showLanguageControls" class="ingest-languages" data-testid="aidoc-ingest-languages">
          <legend class="ingest-detail">{{ t('aidoc.ingestLanguagesLabel') }}</legend>
          <div class="ingest-language-options">
            <label v-for="lang in languageChoices" :key="lang" class="ingest-language">
              <input type="checkbox" :value="lang" :data-testid="'aidoc-ingest-language-' + lang"
                :checked="selectedLanguages.includes(lang)" :disabled="isLastSelected(lang)"
                @change="toggleLanguage(lang, $event)">
              <span>{{ t(languageLabelKey(lang)) }}</span>
            </label>
          </div>
          <p class="ingest-detail ingest-language-hint" data-testid="aidoc-ingest-languages-hint">{{ t('aidoc.ingestLanguagesHint') }}</p>
        </fieldset>

        <label v-if="confirming && store.ingestPlan.sources.length" class="ingest-field w-fit">
          <span class="ingest-detail">{{ t('aidoc.ingestBatchSizeLabel') }}</span>
          <select v-model="batchSize" class="ingest-input" data-testid="aidoc-ingest-batch-size">
            <option :value="5">5</option>
            <option :value="10">10</option>
          </select>
          <span class="ingest-detail" data-testid="aidoc-ingest-batch-count">
            {{ t('aidoc.ingestBatchCount', { n: Math.ceil(store.ingestPlan.sources.length / batchSize) }) }}
          </span>
        </label>

        <template v-if="store.ingesting">
          <div class="ingest-summary" role="status">
            <div class="ingest-bar" role="progressbar" :aria-label="t('aidoc.ingestProgressLabel')" aria-valuemin="0" aria-valuemax="100"
              :aria-valuenow="percent" data-testid="aidoc-ingest-progress">
              <div class="ingest-bar-fill" :style="{ width: percent + '%' }"></div>
            </div>
            <p>{{ runningSummary }}</p>
          </div>
          <ul v-if="activeSteps.length" class="ingest-list" data-testid="aidoc-ingest-active">
            <li v-for="step in activeSteps" :key="step.index" class="ingest-failure">
              <span class="ingest-path">{{ step.rel }}</span>
              <span v-if="step.lang" class="ingest-detail">{{ t(languageLabelKey(step.lang)) }}</span>
              <span v-if="step.action" class="ingest-detail">{{ actionLabels[step.action] ? t(actionLabels[step.action]) : step.action }}</span>
            </li>
          </ul>
        </template>

        <template v-else-if="store.ingestResult">
          <div class="ingest-summary" role="status">
            <div class="ingest-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
              :aria-valuenow="percent" data-testid="aidoc-ingest-progress">
              <div class="ingest-bar-fill" :style="{ width: percent + '%' }"></div>
            </div>
            <p>{{ t('aidoc.ingestDone', { n: store.ingestResult.done.length }) }}</p>
            <p>{{ t('aidoc.ingestFailed', { n: store.ingestResult.failed.length }) }}</p>
            <p v-if="store.ingestResult.deletedPages?.length">{{ t('aidoc.ingestDeletedPages', { n: store.ingestResult.deletedPages.length }) }}</p>
            <p v-if="store.ingestResult.updatedPages?.length">{{ t('aidoc.ingestUpdatedPages', { n: store.ingestResult.updatedPages.length }) }}</p>
            <p v-if="store.ingestResult.stopped">{{ t('aidoc.ingestStopped') }}</p>
            <p v-if="store.ingestResult.aborted === 'consecutive_agent_errors'" class="ingest-alert" role="alert">{{ t('aidoc.ingestAbortedAgentErrors') }}</p>
            <p v-if="(store.ingestResult.remaining ?? store.ingestResult.overflow) > 0">{{ t('aidoc.ingestRemaining', { n: store.ingestResult.remaining ?? store.ingestResult.overflow }) }}</p>
            <p v-if="modelErrorHint" class="ingest-alert" role="alert" data-testid="aidoc-ingest-model-hint">{{ t('aidoc.ingestModelErrorHint') }}</p>
          </div>
          <ul v-if="store.ingestResult.failed.length" class="ingest-list">
            <li v-for="failure in store.ingestResult.failed" :key="failure.rel + '|' + failure.lang" class="ingest-failure">
              <span class="ingest-path">{{ failure.rel }}</span>
              <span v-if="failure.lang" class="ingest-detail" data-testid="aidoc-ingest-failure-language">{{ t(languageLabelKey(failure.lang)) }}</span>
              <span class="ingest-detail">{{ t(reasonKeys[failure.reason] || 'aidoc.reasonAgentError') }}</span>
              <span v-if="failure.detail" class="ingest-detail">{{ failure.detail }}</span>
            </li>
          </ul>
          <div v-if="store.ingestResult.warnings?.length" class="ingest-warnings">
            <p>{{ t('aidoc.ingestWarnings') }}</p>
            <ul class="ingest-list">
              <li v-for="(warning, index) in store.ingestResult.warnings" :key="index" class="ingest-failure">
                <span class="ingest-path">{{ warning.rel }}</span>
                <span class="ingest-detail">{{ warning.step }}: {{ warning.detail }}</span>
              </li>
            </ul>
          </div>
          <p v-if="store.ingestResult.indexError" class="ingest-alert" role="alert">
            {{ t('aidoc.ingestIndexError') }} {{ store.ingestResult.indexError }}
          </p>
        </template>

        <template v-else-if="store.ingestPlan">
          <template v-if="!removalOnly">
            <p>{{ t('aidoc.ingestFiles', { n: store.ingestPlan.sources.length }) }}</p>
            <AiDocIngestTree :sources="store.ingestPlan.sources" :format-size="formatSize" />
          </template>
          <p v-if="store.ingestPlan.overflow" class="ingest-detail">
            {{ t('aidoc.ingestOverflow', { n: store.ingestPlan.overflow }) }}
          </p>
          <p v-if="!removalOnly && !store.ingestPlan.providerReady && !hasModelChoice" class="ingest-alert" role="alert">{{ providerMessage }}</p>
        </template>

        <template v-if="!store.ingesting && removedSources.length">
          <p>{{ t(store.ingestResult ? 'aidoc.ingestRemovedSources' : 'aidoc.ingestMissingSources', { n: removedSources.length }) }}</p>
          <ul class="ingest-list" data-testid="aidoc-ingest-removed-sources">
            <li v-for="rel in removedSources" :key="rel" class="ingest-failure ingest-path">{{ rel }}</li>
          </ul>
          <p v-if="confirming" class="ingest-detail">{{ t('aidoc.ingestRemoveHint') }}</p>
        </template>

        <p v-if="store.ingestNothing && !store.ingestResult" class="ingest-detail">{{ t('aidoc.ingestNothing') }}</p>
        <div v-if="store.reclassifying" class="ingest-summary" role="status">
          <div class="ingest-bar" role="progressbar" :aria-label="t('aidoc.wikiClassifyingTopics')" aria-valuemin="0" aria-valuemax="100"
            :aria-valuenow="percent" data-testid="aidoc-reclassify-progress">
            <div class="ingest-bar-fill" :style="{ width: percent + '%' }"></div>
          </div>
          <p>{{ t('aidoc.wikiClassifyingTopics') }} {{ percent }}%</p>
        </div>
        <p v-else-if="store.wikiTopicsLoading" class="ingest-detail" role="status">{{ t('aidoc.wikiClassifyingTopics') }}</p>
        <p v-else-if="store.wikiReclassification?.error" class="ingest-alert" role="alert">
          {{ t(store.wikiReclassification.error === 'providerMissing' ? 'aidoc.providerMissing' : 'aidoc.wikiReclassifyFailed') }}
        </p>
        <div v-else-if="store.wikiReclassification" role="status">
          <p class="ingest-detail">{{ t('aidoc.wikiTopicCoverage', store.wikiReclassification) }}</p>
          <p v-if="store.wikiReclassification.stopped" class="ingest-detail">{{ t('aidoc.wikiClassifyStopped') }}</p>
          <p v-if="store.wikiReclassification.failed" class="ingest-alert" data-testid="aidoc-reclassify-failed">
            {{ t('aidoc.wikiTopicFailed', store.wikiReclassification) }}
          </p>
        </div>
        <p v-if="store.ingestErrorKey || store.ingestError" class="ingest-alert" role="alert">
          {{ store.ingestErrorKey && t(store.ingestErrorKey) }} {{ store.ingestError }}
        </p>
      </div>

      <footer class="ingest-footer">
        <AppButton size="modal" :variant="confirming ? 'ghost' : 'primary'" type="button"
          data-testid="aidoc-ingest-dismiss" @click="dismiss">
          {{ t(confirming ? 'common.cancel' : 'common.close') }}
        </AppButton>
        <AppTooltip v-if="store.ingesting && !indexing" :text="stopLabel">
          <AppButton size="icon" variant="danger" type="button" data-testid="aidoc-ingest-stop"
            :aria-label="stopLabel" :loading="store.ingestStopping" @click="store.stopIngest()">
            <svg v-if="!store.ingestStopping" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </AppButton>
        </AppTooltip>
        <AppButton v-else-if="confirming" size="modal" type="button" data-testid="aidoc-ingest-start"
          :disabled="!canStart || store.updating || store.wikiTopicsLoading" @click="store.confirmIngest(batchSize)">
          {{ t(removedSources.length ? 'aidoc.ingestSyncChanges' : 'aidoc.ingestStart') }}
        </AppButton>
        <AppButton v-else-if="!store.ingesting && modelErrorHint && hasModelChoice" size="modal" type="button" data-testid="aidoc-ingest-retry"
          :disabled="!selectionComplete || store.syncPreparing" @click="retry">
          {{ t('aidoc.ingestRetry') }}
        </AppButton>
        <AppTooltip v-if="store.reclassifying" :text="t('aidoc.wikiClassifyStop')">
          <AppButton size="icon" variant="danger" type="button" data-testid="aidoc-wiki-classify-stop"
            :aria-label="t('aidoc.wikiClassifyStop')" :loading="store.reclassifyStopping" @click="store.stopWikiClassification()">
            <svg v-if="!store.reclassifyStopping" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </AppButton>
        </AppTooltip>
        <AppButton size="modal" variant="ghost" type="button" data-testid="aidoc-wiki-reclassify"
          :disabled="classifyDisabled" @click="store.reclassifyWikiPages(true)">
          {{ t('aidoc.wikiReclassifyAll') }}
        </AppButton>
        <AppButton size="modal" variant="ghost" type="button" data-testid="aidoc-wiki-classify"
          :disabled="classifyDisabled" :loading="store.wikiTopicsLoading" @click="store.reclassifyWikiPages()">
          {{ t('aidoc.wikiClassifyNew') }}
        </AppButton>
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
import AiDocIngestTree from './AiDocIngestTree.vue'
import { languageLabelKey } from '../../utils/aidocLanguages'

const { t, locale } = useI18n()
const store = useAiDocStore()
const dialog = ref(null)
const batchSize = ref(5)
const confirming = computed(() => !store.ingesting && !!store.ingestPlan && !store.ingestResult)
const removedSources = computed(() => (store.ingestResult ? store.ingestResult.removed : store.ingestPlan?.removed) || [])
const removalOnly = computed(() => confirming.value && removedSources.value.length > 0 && !store.ingestPlan.sources.length)
const providerMessage = computed(() => {
  const error = store.ingestPlan?.providerError
  return error && error !== 'providerMissing' ? error : t('aidoc.providerMissing')
})

const hasModelChoice = computed(() => Boolean(store.ingestPlan?.providers?.length && store.ingestModel))
const showModelControls = computed(() => !store.ingesting && !removalOnly.value && hasModelChoice.value && (confirming.value || modelErrorHint.value))
const providerModels = computed(() => store.ingestPlan?.providers?.find(provider => provider.id === store.ingestModel?.providerId)?.models || [])
const modelSourceKeys = {
  remembered: 'aidoc.ingestModelSourceRemembered',
  utility: 'aidoc.ingestModelSourceUtility',
  default: 'aidoc.ingestModelSourceDefault',
}
// Only explain the origin while the controls still show the server-selected choice.
const modelSourceKey = computed(() => {
  const plan = store.ingestPlan
  const same = plan?.selected?.providerId === store.ingestModel?.providerId && plan?.selected?.model === store.ingestModel?.model
  return same ? modelSourceKeys[plan?.selectedSource] : undefined
})
const selectionComplete = computed(() => Boolean(store.ingestModel?.providerId && store.ingestModel.model?.trim()))
const languageChoices = computed(() => store.ingestPlan?.languages?.available || [])
const selectedLanguages = computed(() => store.ingestLanguages || [])
const showLanguageControls = computed(() => confirming.value && languageChoices.value.length > 0
  && (!removalOnly.value || store.ingestPlan.languages.otherWork))
// Without a language, or while the plan is recomputed for a changed selection, there is nothing valid to start.
const languagesReady = computed(() => selectedLanguages.value.length > 0 && store.ingestPlan?.sources.length > 0)
const canStart = computed(() => !store.ingestPlanLoading && (removalOnly.value
  || Boolean((hasModelChoice.value ? selectionComplete.value : store.ingestPlan?.providerReady) && languagesReady.value)))
// A model that the provider rejects fails every source the same way, so point the user at the picker.
const modelErrorHint = computed(() => {
  const result = store.ingestResult
  return Boolean(result && (result.aborted === 'consecutive_agent_errors'
    || result.failed?.some(failure => /model.*(not exist|not found)|404/i.test(failure.detail || ''))))
})

// The last selected language cannot be unchecked: its box is disabled and a forced change is ignored.
const isLastSelected = lang => selectedLanguages.value.length === 1 && selectedLanguages.value[0] === lang

function toggleLanguage(lang, event) {
  const next = new Set(selectedLanguages.value)
  if (event.target.checked) next.add(lang)
  else next.delete(lang)
  if (!next.size) {
    event.target.checked = true
    return
  }
  store.setIngestLanguages([...next])
}

function changeProvider(providerId) {
  const remembered = store.ingestPlan.selected
  const models = store.ingestPlan.providers.find(provider => provider.id === providerId)?.models || []
  store.ingestModel = {
    providerId,
    model: remembered?.providerId === providerId && remembered.model ? remembered.model : (models[0] || ''),
  }
}

// Reopens the plan with the model controls so the user can run again with another model.
function retry() {
  const plan = store.ingestPlan
  store.runSync({ force: plan.force, rels: plan.force ? plan.sources.map(source => source.rel) : undefined })
}

const reasonKeys = {
  scanned_pdf: 'aidoc.reasonScannedPdf',
  unsupported: 'aidoc.reasonUnsupported',
  empty: 'aidoc.reasonEmpty',
  extract_failed: 'aidoc.reasonExtractFailed',
  no_pages: 'aidoc.reasonNoPages',
  read_failed: 'aidoc.reasonReadFailed',
  agent_error: 'aidoc.reasonAgentError',
  output_truncated: 'aidoc.reasonOutputTruncated',
  record_failed: 'aidoc.reasonRecordFailed',
  registry_unreadable: 'aidoc.reasonRegistryUnreadable'
}
const percent = computed(() => store.syncPercent ?? 0)
const classifyDisabled = computed(() => store.ingesting || store.updating || store.syncPreparing || store.wikiTopicsLoading)
const indexing = computed(() => store.ingestProgress?.phase === 'indexing')
const stopLabel = computed(() => t(store.ingestStopping ? 'aidoc.syncStopping' : 'aidoc.ingestStop'))
const activeSteps = computed(() => indexing.value ? [] : store.ingestProgress?.active ?? [])
const runningSummary = computed(() => {
  const progress = store.ingestProgress
  if (indexing.value) return t('aidoc.ingestIndexing')
  if (progress?.phase === 'reconciling') return t('aidoc.ingestReconciling')
  if (!progress?.total) return t('aidoc.ingestPreparing')
  return t('aidoc.ingestBatchProgress', { done: progress.completed ?? 0, total: progress.total, percent: percent.value })
})
const actionLabels = {
  list: 'aidoc.actionList',
  read_source: 'aidoc.actionReadSource',
  read_wiki: 'aidoc.actionReadWiki',
  write_wiki: 'aidoc.actionWriteWiki',
  edit_wiki: 'aidoc.actionEditWiki',
}

const numberFormat = computed(() => new Intl.NumberFormat(locale?.value, { maximumFractionDigits: 1 }))
function formatSize(bytes) {
  if (bytes < 1024) return `${numberFormat.value.format(bytes)} B`
  if (bytes < 1024 ** 2) return `${numberFormat.value.format(bytes / 1024)} KB`
  return `${numberFormat.value.format(bytes / 1024 ** 2)} MB`
}

function dismiss() {
  store.cancelIngestPlan()
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
  width: min(46rem, 92vw);
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
}
.ingest-header h2 {
  margin: 0;
  font-size: var(--fs-subtitle);
  font-weight: 700;
}
.ingest-body {
  display: grid;
  gap: 1rem;
  overflow: auto;
  padding: 0.5rem 1.25rem 1.25rem;
}
.ingest-model {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  gap: 0.5rem 0.75rem;
}
.ingest-field {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}
.ingest-input {
  width: 100%;
  min-width: 0;
  padding: 0.375rem 0.5rem;
  color: var(--ingest-title);
  background: var(--ingest-footer);
  border: 1px solid var(--ingest-border);
  border-radius: var(--radius-sm);
  font: inherit;
}
.ingest-input:focus-visible {
  outline: 0.125rem solid var(--text-muted);
  outline-offset: 0.0625rem;
}
.ingest-input:disabled { opacity: 0.6; }
.ingest-model-hint {
  grid-column: 1 / -1;
  margin: 0;
  font-size: var(--fs-caption);
}
.ingest-languages {
  display: grid;
  gap: 0.375rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.ingest-languages legend {
  padding: 0;
  margin-bottom: 0.25rem;
}
.ingest-language-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 1.25rem;
}
.ingest-language {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
}
.ingest-language input {
  margin: 0;
  accent-color: var(--ingest-title);
}
.ingest-language input:disabled { cursor: not-allowed; }
.ingest-language input:focus-visible {
  outline: 0.125rem solid var(--text-muted);
  outline-offset: 0.0625rem;
}
.ingest-language-hint {
  margin: 0;
  font-size: var(--fs-caption);
}
.ingest-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--ingest-border);
  border-radius: var(--radius-sm);
}
.ingest-list li + li { border-top: 1px solid var(--ingest-border); }
.ingest-failure, .ingest-running, .ingest-summary {
  display: grid;
  gap: 0.25rem;
}
.ingest-failure { padding: 0.5rem 0.75rem; }
.ingest-path, .ingest-detail, .ingest-alert { overflow-wrap: anywhere; }
.ingest-detail { color: var(--text-muted); }
.ingest-alert { color: var(--ingest-danger); }
.ingest-warnings { display: grid; gap: 0.25rem; }
.ingest-bar {
  height: 0.5rem;
  overflow: hidden;
  background: var(--ingest-border);
  border-radius: var(--radius-full);
}
.ingest-bar-fill {
  height: 100%;
  background: linear-gradient(135deg, #0f0f0f, #1a1a1a, #374151);
  box-shadow: inset 0 0 0 1px var(--text-muted);
  border-radius: var(--radius-full);
  transition: width 0.3s ease-out;
}
.ingest-footer {
  flex-wrap: wrap;
  justify-content: flex-end;
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
