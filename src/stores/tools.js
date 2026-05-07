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
// Built-in HTTP tools seeded on first load.
// Core tools (execute_shell, file_operation, web_fetch, etc.) are registered
// directly in ToolRegistry as always-on tools — they do NOT go here.
// This array is for pre-configured HTTP API tools only.
// Keep it minimal — one practical example that shows users what tools are.
const BUILTIN_TOOLS = [
  {
    id: 'builtin-weather-city',
    name: 'City Weather Lookup',
    description: 'Get real-time weather for any city. Parameter city: city name in English (e.g. Beijing, Shanghai, Tokyo, London, NewYork).',
    category: 'Life Tools',
    i18nKey: 'tools.builtin.weatherCity',
    type: 'http', method: 'GET',
    endpoint: 'https://wttr.in/{city}?format=j1',
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
    // Main-process IPC prunes agent references in SQLite; refresh renderer.
    try {
      const { useAgentsStore } = await import('./agents')
      await useAgentsStore().loadAgents()
    } catch (err) {
      console.error('[tools] post-delete agents refresh failed:', err)
    }
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
