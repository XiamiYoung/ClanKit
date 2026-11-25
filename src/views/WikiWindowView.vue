<template>
  <AiDocWikiPanel v-if="root" :key="root" standalone @close="api.close()" @open-file="api.openSource($event.path)">
    <template #window-controls>
      <div class="wiki-window-controls" @dblclick.stop>
        <button type="button" data-testid="wiki-window-minimize" :aria-label="t('titlebar.minimize')"
          v-tooltip="t('titlebar.minimize')" @click="api.minimize()">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="5.5" width="10" height="1.2" rx="0.6" fill="currentColor" /></svg>
        </button>
        <button type="button" data-testid="wiki-window-maximize" :aria-label="t(maximizeKey)"
          v-tooltip="t(maximizeKey)" @click="api.toggleMaximize()">
          <svg v-if="!maximized" width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <rect x="0.5" y="0.5" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
          </svg>
          <svg v-else width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <rect x="2" y="0.5" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
            <rect class="wiki-window-restore-front" x="0.5" y="2" width="8.5" height="8.5" rx="1" stroke="currentColor" stroke-width="1.2" />
          </svg>
        </button>
        <button type="button" class="wiki-window-close" data-testid="wiki-window-close" :aria-label="t('titlebar.close')"
          v-tooltip="t('titlebar.close')" @click="api.close()">
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </template>
  </AiDocWikiPanel>
  <p v-else class="p-4" role="status">{{ t(failed ? 'aidoc.wikiWindowFailed' : 'common.loading') }}</p>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AiDocWikiPanel from '../components/aidoc/AiDocWikiPanel.vue'
import { useAiDocStore } from '../stores/aidoc'
import { useConfigStore } from '../stores/config'
import { useI18n } from '../i18n/useI18n'

const api = window.electronAPI.wikiWindow
const store = useAiDocStore()
const config = useConfigStore()
const { t } = useI18n()
const root = ref('')
const failed = ref(false)
const maximized = ref(false)
const maximizeKey = computed(() => maximized.value ? 'titlebar.restore' : 'titlebar.maximize')
let offMaximized
let disposed = false

async function refresh() {
  try {
    const settings = await api.settings()
    if (disposed) return
    if (!settings?.root) throw new Error('Wiki root unavailable')
    config.config.language = settings.language
    failed.value = false
    if (root.value === settings.root) void store.loadWikiPages()
    else {
      store.setRoot(settings.root)
      root.value = settings.root
    }
  } catch {
    if (!disposed && !root.value) failed.value = true
  }
}

onMounted(async () => {
  void refresh()
  window.addEventListener('focus', refresh)
  offMaximized = api.onMaximized?.(value => { maximized.value = value })
  maximized.value = Boolean(await api.isMaximized?.())
})
onBeforeUnmount(() => {
  disposed = true
  offMaximized?.()
  window.removeEventListener('focus', refresh)
  store.dispose()
})
</script>

<style scoped>
.wiki-window-controls {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  -webkit-app-region: no-drag;
}
.wiki-window-controls button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 1.625rem;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
}
.wiki-window-controls button:hover { background: var(--bg-hover); color: var(--text-primary); }
.wiki-window-controls .wiki-window-close:hover { background: #c0392b; color: #fff; }
.wiki-window-restore-front { fill: var(--bg-card); }
</style>
