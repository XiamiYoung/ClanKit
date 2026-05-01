<template>
  <div v-if="bannerVisible" class="update-banner">
    <span class="update-banner-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.39 0 4.68.94 6.4 2.6L21 8"/>
        <polyline points="21 3 21 8 16 8"/>
      </svg>
    </span>

    <span class="update-banner-text">
      <template v-if="state === 'available'">
        {{ t('updater.available', 'ClanKit {version} is available.', { version: available?.version }) }}
      </template>
      <template v-else-if="state === 'downloading'">
        {{ t('updater.downloading', 'Downloading update… {percent}%', { percent: progress }) }}
      </template>
      <template v-else-if="state === 'downloaded'">
        {{ t('updater.downloaded', 'Update ready. Restart to install.') }}
      </template>
      <template v-else-if="state === 'error'">
        {{ t('updater.checkFailed', 'Update check failed. Please try again later.') }}
      </template>
    </span>

    <span class="update-banner-actions">
      <!-- Available + Win path: Update -->
      <button
        v-if="state === 'available' && !available?.manualOnly"
        data-test="update-btn"
        class="update-banner-btn primary"
        @click="onPrimary"
      >{{ t('updater.update', 'Update') }}</button>
      <!-- Available + Mac path: Download -->
      <button
        v-if="state === 'available' && available?.manualOnly"
        data-test="update-btn"
        class="update-banner-btn primary"
        @click="onPrimary"
      >{{ t('updater.download', 'Download') }}</button>
      <!-- Downloaded: Restart now -->
      <button
        v-if="state === 'downloaded'"
        data-test="restart-btn"
        class="update-banner-btn primary"
        @click="onRestart"
      >{{ t('updater.restartNow', 'Restart now') }}</button>
      <!-- Later (only when banner is dismissable; not during downloading or error) -->
      <button
        v-if="state === 'available' || state === 'downloaded'"
        data-test="dismiss-btn"
        class="update-banner-btn"
        @click="onDismiss"
      >{{ t('updater.later', 'Later') }}</button>
    </span>
  </div>
</template>

<script setup>
import { useUpdater } from '@/composables/useUpdater'
import { useI18n } from '@/i18n/useI18n'

const { state, available, progress, bannerVisible, install, quitAndInstall, dismiss } = useUpdater()
const { t } = useI18n()

function onPrimary() { install() }
function onRestart() { quitAndInstall() }
function onDismiss() { dismiss() }
</script>

<style scoped>
.update-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  min-height: 2.5rem;
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
  color: #fff;
  font-size: 0.875rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.update-banner-icon {
  display: inline-flex;
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  opacity: 0.85;
}
.update-banner-icon svg { width: 100%; height: 100%; }
.update-banner-text { flex: 1; }
.update-banner-actions {
  display: inline-flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
.update-banner-btn {
  padding: 0.25rem 0.75rem;
  font-size: 0.8125rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
}
.update-banner-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.update-banner-btn.primary {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
  font-weight: 600;
}
.update-banner-btn.primary:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
