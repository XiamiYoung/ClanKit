import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Tools Store — manages tool configurations for HTTP, Code Snippet, Prompt, and SMTP tools.
 *
 * Tool schema:
 *   All types:  { id, name, description, category, type: 'http'|'code'|'prompt'|'smtp' }
 *   HTTP:       + { method, endpoint, headers, bodyTemplate }
 *   Code:       + { language: 'javascript'|'python'|'bash', code }
 *   Prompt:     + { promptText }
 *   SMTP:       (no extra fields — credentials come from Config → Email)
 *
 * On-disk format (dict):
 * {"tool-id":{"name":"...","type":"http",...}}
 *
 * Also handles array format for forward-compat.
 */
// Built-in zero-registration tools seeded on first load.
// name/description are English for LLM consumption.
// i18nKey drives UI display via t(i18nKey + '.name') and t(i18nKey + '.description').
const BUILTIN_TOOLS = [
  {
    id: 'builtin-my-location',
    name: 'Get My Location',
    description: 'Detect current city, country, timezone and coordinates via IP address. No parameters needed.',
    category: 'Life Tools',
    i18nKey: 'tools.builtin.myLocation',
    type: 'http', method: 'GET',
    endpoint: 'http://ip-api.com/json?lang=zh-CN&fields=status,country,regionName,city,lat,lon,timezone,isp',
    headers: {}, bodyTemplate: '{}',
  },
  {
    id: 'builtin-weather-auto',
    name: 'Current Location Weather',
    description: 'Auto-detect current location and fetch real-time weather including temperature, humidity, wind and conditions. No parameters needed.',
    category: 'Life Tools',
    i18nKey: 'tools.builtin.weatherAuto',
    type: 'http', method: 'GET',
    endpoint: 'https://wttr.in/auto?format=j1',
    headers: {}, bodyTemplate: '{}',
  },
  {
    id: 'builtin-weather-city',
    name: 'City Weather Lookup',
    description: 'Get real-time weather for any city. Parameter city: city name in English (e.g. Beijing, Shanghai, Tokyo).',
    category: 'Life Tools',
    i18nKey: 'tools.builtin.weatherCity',
    type: 'http', method: 'GET',
    endpoint: 'https://wttr.in/{city}?format=j1',
    headers: {}, bodyTemplate: '{}',
  },
  {
    id: 'builtin-exchange-rates',
    name: 'Exchange Rate Lookup',
    description: 'Get live exchange rates for any currency. Parameter base: currency code such as CNY, USD, EUR, JPY, GBP.',
    category: 'Life Tools',
    i18nKey: 'tools.builtin.exchangeRates',
    type: 'http', method: 'GET',
    endpoint: 'https://open.er-api.com/v6/latest/{base}',
    headers: {}, bodyTemplate: '{}',
  },
  {
    id: 'builtin-country-info',
    name: 'Country Information',
    description: 'Look up details about any country: capital, languages, currency, population, area. Parameter name: country name in English.',
    category: 'Life Tools',
    i18nKey: 'tools.builtin.countryInfo',
    type: 'http', method: 'GET',
    endpoint: 'https://restcountries.com/v3.1/name/{name}?fields=name,currencies,languages,capital,flag,population,continents,area',
    headers: {}, bodyTemplate: '{}',
  },
  {
    id: 'builtin-public-holidays',
    name: 'Public Holidays',
    description: 'Get public holidays for a country and year. Parameters: year (e.g. 2026), countryCode (CN, JP, US, GB, etc.).',
    category: 'Life Tools',
    i18nKey: 'tools.builtin.publicHolidays',
    type: 'http', method: 'GET',
    endpoint: 'https://date.nager.at/api/v3/publicholidays/{year}/{countryCode}',
    headers: {}, bodyTemplate: '{}',
  },
  {
    id: 'builtin-fun-fact',
    name: 'Random Fun Fact',
    description: 'Get a random interesting science or trivia fact. No parameters needed.',
    category: 'Life Tools',
    i18nKey: 'tools.builtin.funFact',
    type: 'http', method: 'GET',
    endpoint: 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en',
    headers: {}, bodyTemplate: '{}',
  },
]

export const useToolsStore = defineStore('tools', () => {
  const tools = ref([])
  // Set of builtin tool IDs the user has explicitly deleted — never re-seeded
  const deletedBuiltins = ref(new Set())

  function normalizeTool(t) {
    const type = t.type || 'http'
    const base = {
      id: t.id || t.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '',
      name: t.name || '',
      description: t.description || '',
      category: t.category || '',
      type,
    }

    if (type === 'code') {
      return {
        ...base,
        language: t.language || 'javascript',
        code: t.code || '',
      }
    }

    if (type === 'prompt') {
      return {
        ...base,
        promptText: t.promptText || '',
      }
    }

    if (type === 'smtp') {
      return base  // no extra fields — uses Config → Email credentials
    }

    // HTTP (default)
    return {
      ...base,
      i18nKey: t.i18nKey || '',
      method: t.method || 'GET',
      endpoint: t.endpoint || '',
      headers: t.headers || {},
      bodyTemplate: t.bodyTemplate || '{}',
    }
  }

  async function loadTools() {
    const raw = await window.electronAPI.tools.getConfig()
    // Load the set of user-deleted builtin IDs first
    const deleted = raw?.__deletedBuiltins
    deletedBuiltins.value = new Set(Array.isArray(deleted) ? deleted : [])
    if (Array.isArray(raw)) {
      tools.value = raw.map(t => normalizeTool(t))
    } else if (raw && typeof raw === 'object') {
      tools.value = Object.entries(raw)
        .filter(([id]) => id !== '__deletedBuiltins')
        .map(([id, config]) => normalizeTool({ ...config, id }))
    } else {
      tools.value = []
    }
    // Re-attach i18nKey from BUILTIN_TOOLS for any existing builtins (persist() strips it)
    const builtinMap = new Map(BUILTIN_TOOLS.map(bt => [bt.id, bt.i18nKey]))
    for (const t of tools.value) {
      const key = builtinMap.get(t.id)
      if (key) t.i18nKey = key
    }
    // Seed missing built-in tools, skipping any the user has explicitly deleted
    const existingIds = new Set(tools.value.map(t => t.id))
    const missing = BUILTIN_TOOLS.filter(bt => !existingIds.has(bt.id) && !deletedBuiltins.value.has(bt.id))
    if (missing.length > 0) {
      missing.forEach(bt => tools.value.push(normalizeTool(bt)))
      await persist()
    }
  }

  async function saveTool(tool) {
    const normalized = normalizeTool(tool)
    if (!normalized.id) {
      normalized.id = tool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    }
    // Duplicate name check (case-insensitive) — skip the tool being edited
    const nameLower = normalized.name.toLowerCase()
    const dup = tools.value.find(t =>
      t.id !== normalized.id && t.name.toLowerCase() === nameLower
    )
    if (dup) {
      throw new Error(`A tool named "${dup.name}" already exists.`)
    }
    const idx = tools.value.findIndex(t => t.id === normalized.id)
    if (idx >= 0) {
      tools.value[idx] = normalized
    } else {
      tools.value.push(normalized)
    }
    await persist()
  }

  async function deleteTool(id) {
    if (id.startsWith('builtin-')) {
      deletedBuiltins.value = new Set([...deletedBuiltins.value, id])
    }
    tools.value = tools.value.filter(t => t.id !== id)
    await persist()
    // Remove stale references from all agents
    try {
      const { useAgentsStore } = await import('./agents')
      const agentsStore = useAgentsStore()
      let affected = 0
      for (const agent of agentsStore.agents) {
        if (agent.requiredToolIds?.includes(id)) {
          agent.requiredToolIds = agent.requiredToolIds.filter(tid => tid !== id)
          affected++
        }
      }
      if (affected > 0) await agentsStore.persist()
    } catch {}
  }

  async function persist() {
    if (!window.electronAPI?.tools?.saveConfig) return
    const dict = {}
    for (const t of tools.value) {
      const entry = {
        name: t.name,
        description: t.description || '',
        category: t.category || '',
        type: t.type || 'http',
      }

      if (t.type === 'code') {
        entry.language = t.language || 'javascript'
        entry.code = t.code || ''
      } else if (t.type === 'prompt') {
        entry.promptText = t.promptText || ''
      } else if (t.type === 'smtp') {
        // no extra fields
      } else {
        // HTTP
        entry.method = t.method || 'GET'
        entry.endpoint = t.endpoint || ''
        entry.headers = t.headers || {}
        entry.bodyTemplate = t.bodyTemplate || '{}'
      }

      dict[t.id] = entry
    }
    // Persist deleted builtin IDs so they are never re-seeded
    if (deletedBuiltins.value.size > 0) {
      dict.__deletedBuiltins = [...deletedBuiltins.value]
    }
    const plain = JSON.parse(JSON.stringify(dict))
    const result = await window.electronAPI.tools.saveConfig(plain)
    if (result && !result.success) {
      throw new Error(result.error || 'Failed to save tool configuration')
    }
  }

  return {
    tools,
    loadTools, saveTool, deleteTool,
    deletedBuiltins,
  }
})
