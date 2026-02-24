/**
 * McpManager — singleton managing all MCP server connections.
 *
 * Provides lazy startup, tool discovery, routing, and cleanup.
 */
const { McpClient } = require('./McpClient')
const { logger } = require('../../logger')

class McpManager {
  constructor() {
    this._clients = new Map() // serverId → McpClient
  }

  /**
   * Lazy-start a client for the given server config. Returns the client.
   */
  async ensureStarted(serverConfig) {
    const { id, name, command, args = [], env = {} } = serverConfig

    if (this._clients.has(id)) {
      const existing = this._clients.get(id)
      if (existing.started) return existing
      // Previous client crashed — clean up and restart
      await existing.stop().catch(() => {})
      this._clients.delete(id)
    }

    const client = new McpClient({ name, command, args, env })
    this._clients.set(id, client)
    await client.start()
    return client
  }

  /**
   * Start all servers and return a flat list of discovered tools.
   * Each entry: { serverId, serverName, tool }
   * where tool has { name, description, inputSchema }.
   */
  async getToolsForServers(serverConfigs) {
    const allTools = []

    const results = await Promise.allSettled(
      serverConfigs.map(async (config) => {
        const client = await this.ensureStarted(config)
        return { config, tools: client.tools }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { config, tools } = result.value
        for (const tool of tools) {
          allTools.push({
            serverId: config.id,
            serverName: config.name,
            tool,
          })
        }
      } else {
        logger.error('McpManager: Failed to start server:', result.reason?.message)
      }
    }

    return allTools
  }

  /**
   * Call a tool on a specific server.
   */
  async callTool(serverId, toolName, args = {}) {
    const client = this._clients.get(serverId)
    if (!client || !client.started) {
      throw new Error(`MCP server "${serverId}" is not running`)
    }
    return client.callTool(toolName, args)
  }

  /**
   * Test a server connection temporarily — start, list tools, stop.
   * Returns { success, tools, serverInfo, error }.
   */
  async testConnection(serverConfig) {
    const client = new McpClient({
      name: serverConfig.name || 'test',
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: serverConfig.env || {},
    })

    try {
      await client.start()
      const tools = client.tools
      await client.stop()
      return {
        success: true,
        tools: tools.map(t => ({
          name: t.name,
          description: t.description || '',
        })),
      }
    } catch (err) {
      await client.stop().catch(() => {})
      return {
        success: false,
        error: err.message,
        tools: [],
      }
    }
  }

  /**
   * Stop a specific server by ID.
   */
  async stopServer(serverId) {
    const client = this._clients.get(serverId)
    if (client) {
      await client.stop()
      this._clients.delete(serverId)
    }
  }

  /**
   * Return a dict of { serverId: boolean } indicating which servers are running.
   */
  getRunningStatus() {
    const status = {}
    for (const [id, client] of this._clients) {
      status[id] = client.started === true
    }
    return status
  }

  /**
   * Stop all running servers.
   */
  async stopAll() {
    const stops = []
    for (const [id, client] of this._clients) {
      stops.push(client.stop().catch((err) => {
        logger.warn(`McpManager: Error stopping ${id}:`, err.message)
      }))
    }
    await Promise.all(stops)
    this._clients.clear()
  }
}

// Singleton instance
const mcpManager = new McpManager()

module.exports = { mcpManager, McpManager }
