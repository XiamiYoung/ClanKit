import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'

/**
 * MCP Store — manages MCP server configurations.
 *
 * On-disk format (array):
 * [{ id, name, description, command, args, env, url, enabled, updatedAt }]
 *
 * Transport type is inferred:
 *  - url present  → HTTP/SSE remote server
 *  - url absent   → stdio local subprocess (command required)
 *
 * Legacy dict format (Claude Desktop style) is auto-migrated on load:
 * {"server-name":{"command":"npx","args":["-y","pkg"],"env":{}}}
 */
export const useMcpStore = defineStore('mcp', () => {
  const servers = ref([])
  const runningStatus = ref({})

  /**
   * Load MCP servers from disk via IPC.
   * Handles both array format and legacy dict format.
   */
  async function loadServers() {
    const raw = await window.electronAPI.mcp.getConfig()
    if (Array.isArray(raw)) {
      servers.value = raw.map(s => ({
        id: s.id || uuidv4(),
        name: s.name || '',
        command: s.command || '',
        args: s.args || [],
        env: s.env || {},
        url: s.url || '',
        description: s.description || '',
        enabled: s.enabled !== false,
        updatedAt: s.updatedAt || Date.now(),
      }))
    } else if (raw && typeof raw === 'object') {
      // Legacy dict format — migrate
      servers.value = Object.entries(raw).map(([name, config]) => ({
        id: uuidv4(),
        name,
        command: config.command || '',
        args: config.args || [],
        env: config.env || {},
        description: config.description || '',
        enabled: true,
        updatedAt: Date.now(),
      }))
      // Persist immediately in new array format
      await persist()
    } else {
      servers.value = []
    }
  }

  /**
   * Save a server (add or update). Persists to disk.
   */
  async function saveServer(server) {
    const entry = {
      ...server,
      id: server.id || uuidv4(),
      updatedAt: Date.now(),
    }
    // Duplicate name check (case-insensitive) — skip the server being edited
    const nameLower = (entry.name || '').toLowerCase()
    const dup = servers.value.find(s =>
      s.id !== entry.id && (s.name || '').toLowerCase() === nameLower
    )
    if (dup) {
      throw new Error(`A server named "${dup.name}" already exists.`)
    }
    const idx = servers.value.findIndex(s => s.id === entry.id)
    if (idx >= 0) {
      servers.value[idx] = entry
    } else {
      servers.value.push(entry)
    }
    await persist()
  }

  /**
   * Delete a server by id. Persists to disk.
   */
  async function deleteServer(id) {
    servers.value = servers.value.filter(s => s.id !== id)
    await persist()
    // Remove stale references from all agents
    try {
      const { useAgentsStore } = await import('./agents')
      const agentsStore = useAgentsStore()
      let affected = 0
      for (const agent of agentsStore.agents) {
        if (agent.requiredMcpServerIds?.includes(id)) {
          agent.requiredMcpServerIds = agent.requiredMcpServerIds.filter(sid => sid !== id)
          affected++
        }
      }
      if (affected > 0) await agentsStore.persist()
    } catch {}
  }

  /**
   * Test a connection to an MCP server (temporary start → list tools → stop).
   */
  async function testConnection(serverConfig) {
    return await window.electronAPI.mcp.testConnection(serverConfig)
  }

  /**
   * Load runtime status of MCP server subprocesses.
   */
  async function loadStatus() {
    runningStatus.value = await window.electronAPI.mcp.getStatus()
  }

  /**
   * Save the servers array to disk.
   */
  async function persist() {
    await window.electronAPI.mcp.saveConfig(JSON.parse(JSON.stringify(servers.value)))
  }

  return {
    servers, runningStatus,
    loadServers, loadStatus, saveServer, deleteServer, testConnection,
  }
})
