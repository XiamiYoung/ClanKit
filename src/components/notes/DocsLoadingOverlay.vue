<template>
  <!-- Generic loading state for DocsView panels.
       Two visual variants:
         - variant="overlay" (default): absolute-positioned, semi-transparent
           backdrop with blur. Use when there is content underneath that should
           peek through (e.g. HTML webview navigating to a new page).
         - variant="inline": fills the parent flex area with a solid background.
           Use when the editor has no content yet (initial parse of pptx/docx,
           or disk-read phase before activeFile is set).

       The 300ms fade-in delay prevents flicker on fast loads — if the work
       completes before 300ms, the overlay never becomes visible. -->
  <transition name="docs-loading-fade">
    <div
      v-if="loading"
      class="docs-loading"
      :class="`docs-loading--${variant}`"
      :style="delay !== 300 ? { animationDelay: `${delay}ms` } : undefined"
    >
      <div class="docs-loading__spinner"></div>
      <div class="docs-loading__text">{{ label || t('common.loading') }}</div>
    </div>
  </transition>
</template>

<script setup>
import { useI18n } from '../../i18n/useI18n'

defineProps({
  loading: { type: Boolean, required: true },
  label: { type: String, default: '' },
  variant: {
    type: String,
    default: 'overlay',
    validator: v => v === 'overlay' || v === 'inline',
  },
  delay: { type: Number, default: 300 },
})

const { t } = useI18n()
</script>

<style>
.docs-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  pointer-events: none;
  z-index: 5;
  opacity: 0;
  animation: docs-loading-fade-in 200ms ease-out 300ms forwards;
}
.docs-loading--overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  border-radius: inherit;
}
.docs-loading--inline {
  flex: 1;
  min-height: 0;
  background: transparent;
}
.docs-loading__spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2.5px solid rgba(55, 65, 81, 0.15);
  border-top-color: #374151;
  animation: docs-loading-spin 0.9s linear infinite;
}
.docs-loading__text {
  font-size: var(--fs-small, 13px);
  color: #6B7280;
  font-family: 'Inter', system-ui, sans-serif;
  letter-spacing: 0.02em;
}
@keyframes docs-loading-spin {
  to { transform: rotate(360deg); }
}
@keyframes docs-loading-fade-in {
  to { opacity: 1; }
}
.docs-loading-fade-leave-active {
  transition: opacity 180ms ease-out;
}
.docs-loading-fade-leave-to {
  opacity: 0;
}
</style>
