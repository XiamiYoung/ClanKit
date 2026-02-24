import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Tools Store — manages HTTP tool configurations stored in .env as HTTP_TOOLS.
 *
 * .env format:
 * HTTP_TOOLS={"tool-id":{"name":"...","description":"...","category":"...","method":"GET","endpoint":"...","headers":{},"bodyTemplate":"{}"}}
 *
 * Internal format (flat array for UI convenience):
 * [{ id, name, description, category, method, endpoint, headers, bodyTemplate }]
 */
export const useToolsStore = defineStore('tools', () => {
  const tools = ref([])

  async function loadTools() {
    const dict = await window.electronAPI.tools.getConfig()
    tools.value = Object.entries(dict || {}).map(([id, config]) => ({
      id,
      name: config.name || id,
      description: config.description || '',
      category: config.category || 'HTTP',
      method: config.method || 'GET',
      endpoint: config.endpoint || '',
      headers: config.headers || {},
      bodyTemplate: config.bodyTemplate || '{}',
    }))
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
    await window.electronAPI.tools.saveConfig(dict)
  }

  return {
    tools,
    loadTools, saveTool, deleteTool,
  }
})
