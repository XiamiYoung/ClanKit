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
export const useToolsStore = defineStore('tools', () => {
  const tools = ref([])

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
      method: t.method || 'GET',
      endpoint: t.endpoint || '',
      headers: t.headers || {},
      bodyTemplate: t.bodyTemplate || '{}',
    }
  }

  async function loadTools() {
    const raw = await window.electronAPI.tools.getConfig()
    if (Array.isArray(raw)) {
      tools.value = raw.map(t => normalizeTool(t))
    } else if (raw && typeof raw === 'object') {
      tools.value = Object.entries(raw).map(([id, config]) =>
        normalizeTool({ ...config, id })
      )
    } else {
      tools.value = []
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
    tools.value = tools.value.filter(t => t.id !== id)
    await persist()
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
    const plain = JSON.parse(JSON.stringify(dict))
    const result = await window.electronAPI.tools.saveConfig(plain)
    if (result && !result.success) {
      console.error('tools:save-config failed:', result.error)
    }
  }

  return {
    tools,
    loadTools, saveTool, deleteTool,
  }
})
