<template>
  <Teleport to="body">
    <Transition name="update-toast-fade">
      <div
        v-if="bannerVisible"
        class="update-toast"
        :style="toastStyle"
        role="dialog"
        aria-live="polite"
        :aria-label="title"
      >
        <!-- Drag handle: header row (icon + titles) -->
        <div class="update-toast-header" @mousedown="onDragStart">
          <span class="update-toast-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.39 0 4.68.94 6.4 2.6L21 8"/>
              <polyline points="21 3 21 8 16 8"/>
            </svg>
          </span>

          <div class="update-toast-titles">
            <div class="update-toast-title">{{ title }}</div>
            <div v-if="subtitle" class="update-toast-subtitle">{{ subtitle }}</div>
          </div>

          <button
            type="button"
            class="update-toast-close"
            data-test="dismiss-btn"
            :aria-label="t('updater.close', 'Close')"
            @click.stop="onClose"
            @mousedown.stop
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body: state-specific copy + optional progress bar -->
        <div class="update-toast-body">
          <p class="update-toast-message">{{ body }}</p>

          <div v-if="state === 'downloading'" class="update-toast-progress" data-test="progress-bar">
            <div class="update-toast-progress-track">
              <div
                class="update-toast-progress-fill"
                :style="{ width: progress + '%' }"
              ></div>
            </div>
          </div>

          <div v-if="state === 'quitting'" class="update-toast-spinner" data-test="quitting-spinner" aria-hidden="true">
            <span class="update-toast-spinner-dot"></span>
            <span class="update-toast-spinner-dot"></span>
            <span class="update-toast-spinner-dot"></span>
          </div>
        </div>

        <!-- Action row: button layout depends on state -->
        <div v-if="actions.length" class="update-toast-actions">
          <button
            v-for="(action, idx) in actions"
            :key="action.testId"
            type="button"
            :class="['update-toast-btn', action.primary ? 'primary' : 'secondary']"
            :data-test="action.testId"
            @click="action.onClick"
            @mousedown.stop
          >{{ action.label }}</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useUpdater } from '@/composables/useUpdater'
import { useI18n } from '@/i18n/useI18n'

const TOAST_W = 360
const TOAST_H_ESTIMATE = 170
const MARGIN = 16
const STORAGE_KEY = 'clankit:update-toast-pos'

const { state, available, progress, bannerVisible, currentVersion, install, quitAndInstall, installOnQuit, dismiss } = useUpdater()
const { t } = useI18n()

// --- Position (persisted across sessions). Default: bottom-left. ---
const pos = reactive(loadInitialPos())

function loadInitialPos() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        return clampToViewport(parsed.x, parsed.y)
      }
    }
  } catch {}
  return defaultPos()
}

function defaultPos() {
  const w = globalThis.innerWidth || 1280
  const h = globalThis.innerHeight || 800
  return { x: MARGIN, y: h - TOAST_H_ESTIMATE - MARGIN - 24 }
}

function clampToViewport(x, y) {
  const w = globalThis.innerWidth || 1280
  const h = globalThis.innerHeight || 800
  return {
    x: Math.max(MARGIN, Math.min(x, w - TOAST_W - MARGIN)),
    y: Math.max(MARGIN, Math.min(y, h - 80)),
  }
}

const toastStyle = computed(() => ({
  left: `${pos.x}px`,
  top: `${pos.y}px`,
  width: `${TOAST_W}px`,
}))

// --- Drag ---
const drag = ref(null)

function onDragStart(e) {
  if (e.button !== 0) return
  drag.value = {
    startX: e.clientX,
    startY: e.clientY,
    origX: pos.x,
    origY: pos.y,
  }
  globalThis.addEventListener('mousemove', onDragMove)
  globalThis.addEventListener('mouseup', onDragEnd, { once: true })
  e.preventDefault()
}

function onDragMove(e) {
  if (!drag.value) return
  const dx = e.clientX - drag.value.startX
  const dy = e.clientY - drag.value.startY
  const next = clampToViewport(drag.value.origX + dx, drag.value.origY + dy)
  pos.x = next.x
  pos.y = next.y
}

function onDragEnd() {
  globalThis.removeEventListener('mousemove', onDragMove)
  drag.value = null
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ x: pos.x, y: pos.y }))
  } catch {}
}

// Re-clamp on viewport resize so toast doesn't end up off-screen.
function onResize() {
  const next = clampToViewport(pos.x, pos.y)
  pos.x = next.x
  pos.y = next.y
}
onMounted(() => globalThis.addEventListener('resize', onResize))
onBeforeUnmount(() => {
  globalThis.removeEventListener('resize', onResize)
  globalThis.removeEventListener('mousemove', onDragMove)
})

// --- Copy + actions per state ---
const title = computed(() => {
  if (state.value === 'downloading') return t('updater.downloadingTitle', 'Updating ClanKit…')
  if (state.value === 'downloaded')  return t('updater.downloadedTitle', 'Update ready')
  if (state.value === 'error')       return t('updater.errorTitle', 'Update failed')
  if (state.value === 'quitting')    return t('updater.quittingTitle', 'Restarting ClanKit…')
  return t('updater.availableTitle', 'A new version of ClanKit is available!')
})

const subtitle = computed(() => {
  if (state.value === 'available' && available.value?.version && currentVersion.value) {
    return t('updater.versionTransition', '{from} → {to}', {
      from: currentVersion.value,
      to: available.value.version,
    })
  }
  return ''
})

const body = computed(() => {
  if (state.value === 'downloading') {
    return t('updater.downloadingBody', '{percent}% · Downloading in the background.', {
      percent: Math.round(progress.value || 0),
    })
  }
  if (state.value === 'downloaded') {
    return t('updater.downloadedBody', 'Update will apply automatically on next restart.')
  }
  if (state.value === 'error') {
    return t('updater.checkFailed', 'Update check failed. Please try again later.')
  }
  if (state.value === 'quitting') {
    return t('updater.quittingBody', 'The installer will open in a moment. Do not relaunch ClanKit.')
  }
  if (available.value?.manualOnly) {
    return t('updater.macAvailableBody', 'Download the new version from your browser to install it.')
  }
  return t('updater.availableBody', "Would you like to install it now? We'll restart the app for you.")
})

const actions = computed(() => {
  if (state.value === 'available') {
    const primaryLabel = available.value?.manualOnly
      ? t('updater.download', 'Download')
      : t('updater.installNow', 'Install now')
    return [
      {
        testId: 'remind-later-btn',
        label: t('updater.remindMeLater', 'Remind me later'),
        primary: false,
        onClick: onDismiss,
      },
      {
        testId: 'update-btn',
        label: primaryLabel,
        primary: true,
        onClick: onPrimary,
      },
    ]
  }
  if (state.value === 'downloaded') {
    // Slack-mode: install-on-quit is now the default (auto-scheduled by
    // useUpdater on download). The banner only exposes "Restart now" for
    // users who want immediate application; closing via X dismisses the
    // toast and the queued install still fires on next quit.
    return [
      {
        testId: 'restart-btn',
        label: t('updater.restartNow', 'Restart now'),
        primary: true,
        onClick: onRestart,
      },
    ]
  }
  if (state.value === 'error') {
    return [
      {
        testId: 'retry-btn',
        label: t('updater.retry', 'Retry'),
        primary: true,
        onClick: onPrimary,
      },
    ]
  }
  // 'downloading' / 'quitting' — no buttons; close (X) is the only escape
  // (and on 'quitting' even that just dismisses the toast — quit is in flight).
  return []
})

function onPrimary() { install() }
function onRestart() { quitAndInstall() }
function onInstallOnQuit() { installOnQuit() }
function onDismiss() { dismiss() }
function onClose() { dismiss() }
</script>

<style scoped>
.update-toast {
  position: fixed;
  z-index: 9999;
  background: linear-gradient(180deg, #1F1F22 0%, #181819 100%);
  color: #F5F5F7;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.35),
    0 2px 6px rgba(0, 0, 0, 0.25);
  font-size: 0.875rem;
  user-select: none;
  -webkit-user-select: none;
  padding: 0.875rem 0.875rem 0.75rem 0.875rem;
}

.update-toast-header {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  cursor: grab;
}
.update-toast-header:active { cursor: grabbing; }

.update-toast-icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 1px;
  opacity: 0.85;
}
.update-toast-icon svg { width: 100%; height: 100%; }

.update-toast-titles {
  flex: 1;
  min-width: 0;
}

.update-toast-title {
  font-weight: 600;
  font-size: 0.9375rem;
  line-height: 1.3;
}

.update-toast-subtitle {
  margin-top: 2px;
  font-size: 0.8125rem;
  color: rgba(245, 245, 247, 0.55);
  font-variant-numeric: tabular-nums;
}

.update-toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: rgba(245, 245, 247, 0.55);
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.update-toast-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.update-toast-close svg { width: 14px; height: 14px; }

.update-toast-body {
  margin-top: 0.5rem;
  padding-left: 28px; /* align under titles, past the icon */
}
.update-toast-message {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: rgba(245, 245, 247, 0.78);
}

.update-toast-progress {
  margin-top: 0.625rem;
}
.update-toast-progress-track {
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.update-toast-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3B82F6, #60A5FA);
  border-radius: 999px;
  transition: width 0.18s ease-out;
}

.update-toast-spinner {
  display: inline-flex;
  gap: 5px;
  margin-top: 0.625rem;
  align-items: center;
}
.update-toast-spinner-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  animation: update-toast-bounce 1.05s ease-in-out infinite both;
}
.update-toast-spinner-dot:nth-child(1) { animation-delay: -0.32s; }
.update-toast-spinner-dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes update-toast-bounce {
  0%, 80%, 100% { transform: scale(0.55); opacity: 0.55; }
  40% { transform: scale(1); opacity: 1; }
}

.update-toast-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.875rem;
}

.update-toast-btn {
  padding: 0.4375rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid transparent;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.update-toast-btn.secondary {
  background: transparent;
  color: rgba(245, 245, 247, 0.7);
  border-color: transparent;
}
.update-toast-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.update-toast-btn.primary {
  background: #FFFFFF;
  color: #111;
  border-color: #FFFFFF;
  font-weight: 600;
}
.update-toast-btn.primary:hover {
  background: #F0F0F0;
}

.update-toast-fade-enter-active,
.update-toast-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.update-toast-fade-enter-from,
.update-toast-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
