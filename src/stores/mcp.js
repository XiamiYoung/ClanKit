import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * MCP Store — manages MCP server configurations stored in .env as MCP_SERVERS.
 *
 * .env format (Claude Desktop style):
 * MCP_SERVERS={"server-name":{"command":"npx","args":["-y","pkg"],"env":{}}}
 *
 * Internal format (flat array for UI convenience):
 * [{ id: "server-name", name: "server-name", command: "npx", args: [...], env: {...} }]
 */
export const useMcpStore = defineStore('mcp', () => {
  const servers = ref([])
  const runningStatus = ref({})

  /**
   * Load MCP servers from .env via IPC.
   * Converts the dict format { name: { command, args, env } }
   * to an array format for easier UI rendering.
   */
  async function loadServers() {
    const dict = await window.electronAPI.mcp.getConfig()
    servers.value = Object.entries(dict || {}).map(([name, config]) => ({
      id: name,
      name,
      command: config.command || '',
      args: config.args || [],
      env: config.env || {},
      description: config.description || '',
    }))
  }

  /**
   * Save a server (add or update). Persists back to .env.
   */
  async function saveServer(server) {
    const idx = servers.value.findIndex(s => s.id === server.id)
    if (idx >= 0) {
      servers.value[idx] = { ...server }
    } else {
      servers.value.push({ ...server, id: server.name })
    }
    await persist()
  }

  /**
   * Delete a server by id. Persists back to .env.
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
   * Convert internal array back to dict format and save to .env.
   */
  async function persist() {
    const dict = {}
    for (const s of servers.value) {
      dict[s.name] = {
        command: s.command,
        args: s.args || [],
        env: s.env || {},
        ...(s.description ? { description: s.description } : {}),
      }
    }
    await window.electronAPI.mcp.saveConfig(dict)
  }

  return {
    servers, runningStatus,
    loadServers, loadStatus, saveServer, deleteServer, testConnection,
  }
})
