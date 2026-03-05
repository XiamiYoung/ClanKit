/**
 * McpManager — singleton managing all MCP server connections.
 *
 * Provides lazy startup, tool discovery, routing, and cleanup.
 *
 * ── On-demand startup ────────────────────────────────────────────────────────
 * MCP servers are NOT started eagerly when a chat begins. Instead:
 *
 * 1. getToolSchemas(configs) — returns cached schemas if available (no process
 *    started). On first call for a server, starts it briefly to discover tools,
 *    caches the schemas, then keeps the process running for subsequent calls.
 *
 * 2. callTool(serverId, config, toolName, args) — lazily starts the server on
 *    first actual tool invocation. If the server is already running, reuses it.
 *    If it crashed, restarts it automatically.
 *
 * Result: no MCP processes are spawned until the user's conversation actually
 * triggers a tool call, or until schemas are needed for the first time.
 */
const { McpClient } = require('./McpClient')
const { logger } = require('../../logger')

class McpManager {
  constructor() {
    this._clients = new Map()     // serverId → McpClient
    this._schemaCache = new Map() // serverId → tool[]
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
    // Cache schemas from freshly-started server
    this._schemaCache.set(id, client.tools)
    return client
  }

  /**
   * Return tool schemas for the given server configs WITHOUT starting servers.
   * For servers with cached schemas, returns them immediately.
   * For servers with no cache, starts them to discover tools, caches, then
   * returns — but only spawns those that haven't been seen before.
   *
   * Each entry: { serverId, serverName, tool }
   */
  async getToolSchemas(serverConfigs) {
    const allTools = []

    // Separate known (cached) vs unknown (need discovery)
    const unknown = serverConfigs.filter(c => !this._schemaCache.has(c.id))

    // Discover tools for unknown servers in parallel
    if (unknown.length > 0) {
      const results = await Promise.allSettled(
        unknown.map(async (config) => {
          const client = await this.ensureStarted(config)
          return { config, tools: client.tools }
        })
      )

      for (const result of results) {
        if (result.status === 'rejected') {
          logger.error('McpManager: Failed to start server for schema discovery:', result.reason?.message)
          // Mark as attempted (empty schema) so we don't retry on every chat turn
          // The server can still be started on-demand via callTool if the user invokes it
        } else {
          // ensureStarted already populated _schemaCache; this is a no-op but explicit
          const { config, tools } = result.value
          if (!this._schemaCache.has(config.id)) {
            this._schemaCache.set(config.id, tools)
          }
        }
      }

      // Mark failed servers with empty cache so they're not retried on the next turn
      for (const config of unknown) {
        if (!this._schemaCache.has(config.id)) {
          this._schemaCache.set(config.id, [])
        }
      }
    }

    // Return schemas from cache for all requested servers
    for (const config of serverConfigs) {
      const tools = this._schemaCache.get(config.id) || []
      for (const tool of tools) {
        allTools.push({ serverId: config.id, serverName: config.name, tool })
      }
    }

    return allTools
  }

  /**
   * @deprecated Use getToolSchemas — kept for callers that passed serverConfigs directly.
   */
  async getToolsForServers(serverConfigs) {
    return this.getToolSchemas(serverConfigs)
  }

  /**
   * Call a tool on a specific server. Lazily starts the server if needed.
   * serverConfig is required so we can restart a crashed server.
   */
  async callTool(serverId, toolName, args = {}, serverConfig = null) {
    // Lazy-start: if server isn't running but we have its config, start it
    if (serverConfig && (!this._clients.has(serverId) || !this._clients.get(serverId)?.started)) {
      await this.ensureStarted(serverConfig)
    }
    const client = this._clients.get(serverId)
    if (!client || !client.started) {
      throw new Error(`MCP server "${serverId}" is not running`)
    }
    return client.callTool(toolName, args)
  }

  /**
   * Test a server connection temporarily — start, list tools, stop.
   * Returns { success, tools, error }.
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
      // Clear schema cache so re-discovery happens on next use
      this._schemaCache.delete(serverId)
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
    this._schemaCache.clear()
  }
}

// Singleton instance
const mcpManager = new McpManager()

module.exports = { mcpManager, McpManager }
