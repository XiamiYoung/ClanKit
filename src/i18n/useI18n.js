import { computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { en, zh } from './index'

const messages = { en, zh }

export function useI18n() {
  const configStore = useConfigStore()

  const locale = computed(() => configStore.language || 'en')

  const t = (key, ...args) => {
    const keys = key.split('.')
    let value = messages[locale.value]
    for (const k of keys) {
      value = value?.[k]
    }
    if (value === undefined) {
      console.log('[i18n] MISSING key:', key, 'locale:', locale.value)
      return args[0] || key
    }
    const firstArg = args[0]
    const params = typeof firstArg === 'object' ? firstArg : args[1]
    if (typeof value === 'string' && params && typeof params === 'object') {
      return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
    }
    return value
  }

  return { t, locale }
}
