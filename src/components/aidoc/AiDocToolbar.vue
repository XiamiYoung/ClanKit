<template>
  <div class="aidoc-toolbar">
    <div class="aidoc-toolbar-actions">
      <AppTooltip :text="syncText">
        <span
          class="sync-dot"
          :class="{ 'is-stale': store.status?.indexStale }"
          :aria-label="syncText"
          role="img"
          tabindex="0"
          data-testid="aidoc-sync-dot"
        ></span>
      </AppTooltip>
      <div class="aidoc-index-actions">
        <AppButton
          class="aidoc-index-update"
          size="compact"
          data-testid="aidoc-update"
          :loading="store.updating"
          @click="store.updateIndex()"
        >
          <svg v-if="!store.updating" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M20 7v5h-5M4 17v-5h5" />
            <path d="M6 7a7 7 0 0 1 11.6-1L20 12M4 12l2.4 6A7 7 0 0 0 18 17" />
          </svg>
          {{ store.updating ? t('aidoc.updating') : t('aidoc.updateIndex') }}
          <span v-if="store.updating && store.progress">
            {{ t('aidoc.indexProgress', store.progress) }}
          </span>
        </AppButton>
        <AppTooltip :text="t('aidoc.indexOptions')">
          <AppButton
            class="aidoc-index-options"
            size="compact"
            data-testid="aidoc-index-options"
            :aria-label="t('aidoc.indexOptions')"
            aria-haspopup="dialog"
            :aria-expanded="showOptions"
            :disabled="store.updating"
            @click="showOptions = true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </AppButton>
        </AppTooltip>
      </div>
      <AppButton size="compact" data-testid="aidoc-open-graph" @click="$emit('open-graph')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="5" cy="12" r="2.5" />
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="17" cy="19" r="2.5" />
          <path d="m7.3 10.8 8.4-4.6m-8.4 7.1 7.5 4.4" />
        </svg>
        {{ t('aidoc.graph') }}
      </AppButton>
    </div>
    <AppTooltip v-if="feedback" :text="feedback">
      <span class="aidoc-index-feedback" :role="store.error ? 'alert' : 'status'" tabindex="0">{{ feedback }}</span>
    </AppTooltip>

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

function rebuildIndex() {
  showOptions.value = false
  store.updateIndex({ full: true })
}

onMounted(() => store.refreshStatus())
</script>

<style scoped>
.aidoc-toolbar {
  --aidoc-error: #b91c1c;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}
.aidoc-toolbar-actions, .aidoc-index-actions { display: flex; align-items: center; }
.aidoc-toolbar-actions { gap: 0.5rem; }
.sync-dot {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: var(--radius-full);
  background: var(--text-muted);
}
.sync-dot.is-stale { background: var(--accent); }
.aidoc-index-update { border-start-end-radius: 0; border-end-end-radius: 0; }
.aidoc-index-options {
  border-start-start-radius: 0;
  border-end-start-radius: 0;
  border-inline-start: 1px solid var(--bg-card);
  padding-inline: 0.4375rem;
}
.aidoc-index-feedback {
  display: block;
  max-width: 14rem;
  color: var(--text-secondary);
  font-size: var(--fs-small);
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aidoc-index-feedback[role='alert'] { color: var(--aidoc-error); }
</style>
