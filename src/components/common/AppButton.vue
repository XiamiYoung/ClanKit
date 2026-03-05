<template>
  <button
    class="app-btn"
    :class="[
      `app-btn--${variant}`,
      `app-btn--${size}`,
      { 'app-btn--loading': loading },
    ]"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <svg v-if="loading" class="app-btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    <slot />
  </button>
</template>

<script setup>
defineOptions({ inheritAttrs: false })

defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: v => ['primary', 'secondary', 'ghost', 'danger', 'danger-ghost'].includes(v),
  },
  size: {
    type: String,
    default: 'default',
    validator: v => ['default', 'compact', 'save', 'modal'].includes(v),
  },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
</script>

<style scoped>
/* ── Base ────────────────────────────────────────────────────────────────── */
.app-btn {
  display: flex; align-items: center; gap: 0.4375rem;
  font-family: 'Inter', sans-serif; font-weight: 600;
  border: none; cursor: pointer; transition: all 0.15s ease;
  flex-shrink: 0; text-decoration: none;
}
.app-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Variant: primary ────────────────────────────────────────────────────── */
.app-btn--primary {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.app-btn--primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

/* ── Variant: secondary (cancel / neutral) ───────────────────────────────── */
.app-btn--secondary {
  background: #F5F5F5; color: #6B7280;
  box-shadow: none;
}
.app-btn--secondary:hover:not(:disabled) { background: #E5E5EA; }

/* ── Variant: ghost ──────────────────────────────────────────────────────── */
.app-btn--ghost {
  background: var(--bg-hover); color: var(--text-primary);
  box-shadow: none;
}
.app-btn--ghost:hover:not(:disabled) { background: var(--border); }

/* ── Variant: danger ─────────────────────────────────────────────────────── */
.app-btn--danger {
  background: #EF4444; color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(239,68,68,0.25);
}
.app-btn--danger:hover:not(:disabled) {
  background: #DC2626;
  box-shadow: 0 2px 12px rgba(239,68,68,0.35);
}

/* ── Variant: danger-ghost ───────────────────────────────────────────────── */
.app-btn--danger-ghost {
  background: rgba(255,59,48,0.08); color: #FF3B30;
  box-shadow: none;
}
.app-btn--danger-ghost:hover:not(:disabled) { background: rgba(255,59,48,0.12); }

/* ── Size: default ───────────────────────────────────────────────────────── */
.app-btn--default {
  padding: 0.5rem 1rem; border-radius: var(--radius-sm);
  font-size: var(--fs-body);
}

/* ── Size: compact (standard page-level action buttons) ─────────────────── */
.app-btn--compact {
  padding: 0.375rem 0.875rem; border-radius: var(--radius-sm);
  font-size: var(--fs-secondary);
}

/* ── Size: save ──────────────────────────────────────────────────────────── */
.app-btn--save {
  padding: 0.625rem 1.25rem; border-radius: var(--radius-md);
  font-size: var(--fs-body);
}

/* ── Size: modal (for modal footer buttons) ──────────────────────────────── */
.app-btn--modal {
  padding: 0.5rem 1.375rem; border-radius: 0.5rem;
  font-size: var(--fs-body);
}

/* ── Ghost size overrides (smaller gaps, font) ───────────────────────────── */
.app-btn--ghost.app-btn--default {
  gap: 0.25rem; padding: 0.3125rem 0.625rem; border-radius: 0.375rem;
  font-size: var(--fs-caption);
}
.app-btn--ghost.app-btn--default:hover { background: var(--border); }
.app-btn--ghost.danger:hover { background: #FEE2E2; color: #DC2626; }

/* ── Spinner ─────────────────────────────────────────────────────────────── */
.app-btn-spinner {
  width: 1.125rem; height: 1.125rem; flex-shrink: 0;
  animation: app-btn-spin 0.8s linear infinite;
}
.app-btn--compact .app-btn-spinner { width: 0.875rem; height: 0.875rem; }

@keyframes app-btn-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
</style>
