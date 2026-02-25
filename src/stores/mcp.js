import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'

/**
 * MCP Store — manages MCP server configurations.
 *
 * On-disk format (array):
 * [{ id, name, description, command, args, env, enabled, updatedAt }]
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
    const idx = servers.value.findIndex(s => s.id === server.id)
    const entry = {
      ...server,
      id: server.id || uuidv4(),
      updatedAt: Date.now(),
    }
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
