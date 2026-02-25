import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Tools Store — manages HTTP tool configurations.
 *
 * On-disk format (dict):
 * {"tool-id":{"name":"...","description":"...","category":"...","method":"GET","endpoint":"...","headers":{},"bodyTemplate":"{}"}}
 *
 * Also handles array format for forward-compat.
 */
export const useToolsStore = defineStore('tools', () => {
  const tools = ref([])

  async function loadTools() {
    const raw = await window.electronAPI.tools.getConfig()
    if (Array.isArray(raw)) {
      // Array format
      tools.value = raw.map(t => ({
        id: t.id || t.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '',
        name: t.name || '',
        description: t.description || '',
        category: t.category || 'HTTP',
        method: t.method || 'GET',
        endpoint: t.endpoint || '',
        headers: t.headers || {},
        bodyTemplate: t.bodyTemplate || '{}',
      }))
    } else if (raw && typeof raw === 'object') {
      // Dict format
      tools.value = Object.entries(raw).map(([id, config]) => ({
        id,
        name: config.name || id,
        description: config.description || '',
        category: config.category || 'HTTP',
        method: config.method || 'GET',
        endpoint: config.endpoint || '',
        headers: config.headers || {},
        bodyTemplate: config.bodyTemplate || '{}',
      }))
    } else {
      tools.value = []
    }
  }

  async function saveTool(tool) {
    const idx = tools.value.findIndex(t => t.id === tool.id)
    if (idx >= 0) {
      tools.value[idx] = { ...tool }
    } else {
      tools.value.push({ ...tool, id: tool.id || tool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') })
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
      dict[t.id] = {
        name: t.name,
        description: t.description || '',
        category: t.category || 'HTTP',
        method: t.method || 'GET',
        endpoint: t.endpoint,
        headers: t.headers || {},
        bodyTemplate: t.bodyTemplate || '{}',
      }
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
