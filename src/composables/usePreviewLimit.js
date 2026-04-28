import { ref, computed } from 'vue'
import { useI18n } from '../i18n/useI18n'

// Module-level singleton state — shared across the whole renderer so any
// store / composable can trigger the global preview-limit modal without
// having to thread refs through view layers.
const visible = ref(false)
const messageKey = ref('')

/**
 * Trigger the global preview-limit modal.
 * @param {string} key - one of the PREVIEW_LIMITS keys (e.g. 'maxAgents'),
 *                       which maps to `limits.<key>` in the i18n dictionary.
 */
export function triggerPreviewLimit(key) {
  messageKey.value = key
  visible.value = true
}

export function usePreviewLimit() {
  const { t } = useI18n()
  const message = computed(() => messageKey.value ? t(`limits.${messageKey.value}`) : '')
  function close() { visible.value = false }
  return { visible, message, close }
}
