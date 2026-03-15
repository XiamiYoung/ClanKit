/**
 * McpManager — singleton managing all MCP server connections via mcporter.
 *
 * Uses mcporter's Runtime (createRuntime) which wraps the official
 * @modelcontextprotocol/sdk client. Supports both stdio and HTTP/SSE servers.
 *
 * mcporter is ESM-only; loaded once via dynamic import() and cached.
 *
 * ── Connection lifecycle ─────────────────────────────────────────────────────
 * mcporter keeps connections alive (keep-alive mode by default).
 * Servers are registered lazily on first use and connections are reused
 * across tool calls within the same session.
 *
 * ── Schema caching ──────────────────────────────────────────────────────────
 * Tool schemas are discovered on first getToolSchemas() call per server and
 * cached in _schemaCache. A crash/reconnect clears the cache for that server
 * so re-discovery happens automatically on the next call.
 */
'use strict'

const os = require('os')
const { logger } = require('../../logger')

// mcporter is bundled as a local ESM file to avoid dependency resolution issues.
// Loaded once via dynamic import() and cached.
const MCPORTER_BUNDLE = new URL('./mcporter-bundle.mjs', `file://${__filename}`).href
let _mcporterPromise = null
function _loadMcporter() {
  if (!_mcporterPromise) {
    _mcporterPromise = import(MCPORTER_BUNDLE).catch(err => {
      _mcporterPromise = null
      throw err
    })
  }
  return _mcporterPromise
}

class McpManager {
  constructor() {
    this._runtime        = null         // mcporter Runtime instance (created lazily)
    this._schemaCache    = new Map()    // serverId → ServerToolInfo[]
    this._registeredIds  = new Set()    // serverIds registered in the runtime
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Convert a ClankAI server config to a mcporter ServerDefinition.
   * Uses serverId as the mcporter name for a 1:1 mapping.
   *
   * Supports two transport kinds:
   *  - 'http'  — when serverConfig.url is present (HTTP/SSE remote servers)
   *  - 'stdio' — default, local subprocess via command/args
   */
  _toDefinition(serverConfig) {
    const { id, name, command, args = [], env = {}, url, headers } = serverConfig
    const serverId = id || name || 'unnamed-server'
    if (url) {
      return {
        name: serverId,
        command: {
          kind: 'http',
          url: new URL(url),
          ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
        },
        ...(Object.keys(env).length > 0 ? { env } : {}),
      }
    }
    return {
      name: serverId,
      command: {
        kind: 'stdio',
        command,
        args,
        cwd: os.homedir(),
      },
      ...(Object.keys(env).length > 0 ? { env } : {}),
    }
  }

  /** Lazily create the mcporter Runtime on first use. */
  async _getRuntime() {
    if (!this._runtime) {
      const { createRuntime } = await _loadMcporter()
      this._runtime = await createRuntime({ servers: [] })
      logger.info('[McpManager] mcporter Runtime created')
    }
    return this._runtime
  }

  /**
   * Ensure a server is registered in the runtime. Idempotent.
   * Must be called before any listTools / callTool for that server.
   */
  async _ensureRegistered(serverConfig) {
    const runtime = await this._getRuntime()
    if (!this._registeredIds.has(serverConfig.id)) {
      const def = this._toDefinition(serverConfig)
      runtime.registerDefinition(def, { overwrite: false })
      this._registeredIds.add(serverConfig.id)
      logger.info(`[McpManager] Registered server: ${serverConfig.name} (${serverConfig.id})`)
    }
    return runtime
  }

  // ── Public API (same surface as the old McpClient-based McpManager) ────────

  /**
   * Ensure a server is registered and connected (forces an initial listTools
   * to establish the connection). Kept for backwards-compat callers.
   */
  async ensureStarted(serverConfig) {
    const runtime = await this._ensureRegistered(serverConfig)
    // Trigger connection by listing tools; result goes to schema cache
    const tools = await runtime.listTools(serverConfig.id)
    this._schemaCache.set(serverConfig.id, tools)
    logger.info(`[McpManager] Connected: ${serverConfig.name} — ${tools.length} tool(s)`)
    return { started: true, name: serverConfig.name }
  }

  /**
   * Return tool schemas for the given server configs.
   * Cached on first discovery; subsequent calls are instant.
   * Each entry: { serverId, serverName, tool: { name, description, inputSchema } }
   */
  async getToolSchemas(serverConfigs) {
    const unknown = serverConfigs.filter(c => !this._schemaCache.has(c.id))

    if (unknown.length > 0) {
      await Promise.allSettled(
        unknown.map(async (config) => {
          try {
            const runtime = await this._ensureRegistered(config)
            const tools = await runtime.listTools(config.id)
            this._schemaCache.set(config.id, tools)
            logger.info(`[McpManager] Schema cached: ${config.name} — ${tools.length} tool(s)`)
          } catch (err) {
            logger.error(`[McpManager] Schema discovery failed: ${config.name} —`, err.message)
            // Mark with empty cache so we don't retry on every turn
            this._schemaCache.set(config.id, [])
          }
        })
      )
    }

    const allTools = []
    for (const config of serverConfigs) {
      const tools = this._schemaCache.get(config.id) || []
      for (const tool of tools) {
        allTools.push({
          serverId: config.id,
          serverName: config.name,
          tool: {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          },
        })
      }
    }
    return allTools
  }

  /** @deprecated Use getToolSchemas — kept for callers that passed serverConfigs directly. */
  async getToolsForServers(serverConfigs) {
    return this.getToolSchemas(serverConfigs)
  }

  /**
   * Call a tool on a specific server.
   * Returns the raw MCP CallToolResult: { content: [...], isError?: bool }
   * agentLoop's _executeMcpToolViaManager handles content parsing.
   */
  async callTool(serverId, toolName, args = {}, serverConfig = null) {
    if (serverConfig) {
      await this._ensureRegistered(serverConfig)
    }
    const runtime = await this._getRuntime()
    try {
      return await runtime.callTool(serverId, toolName, { args })
    } catch (err) {
      // Clear schema cache on connection errors so the next call re-discovers
      if (this._schemaCache.has(serverId)) {
        this._schemaCache.delete(serverId)
        logger.warn(`[McpManager] Cleared schema cache for ${serverId} after error`)
      }
      throw err
    }
  }

  /**
   * Test a server connection: register, list tools, then immediately close.
   * Returns { success, tools, error }.
   */
  async testConnection(serverConfig) {
    if (!serverConfig) {
      return { success: false, error: 'No server config provided', tools: [] }
    }
    const serverId = serverConfig.id || serverConfig.name || 'test-server'
    // Use a fresh isolated registration so the test doesn't pollute live state
    try {
      const { createRuntime } = await _loadMcporter()
      const def = this._toDefinition({ ...serverConfig, id: serverId })
      const rt = await createRuntime({ servers: [def] })
      try {
        const tools = await rt.listTools(serverId, {
          autoAuthorize: false,
          allowCachedAuth: true,
        })
        return {
          success: true,
          tools: tools.map(t => ({ name: t.name, description: t.description || '' })),
        }
      } finally {
        await rt.close().catch(() => {})
      }
    } catch (err) {
      return { success: false, error: err.message, tools: [] }
    }
  }

  /**
   * Stop and unregister a specific server by ID.
   * The next callTool/getToolSchemas for this server will reconnect.
   */
  async stopServer(serverId) {
    if (this._runtime && this._registeredIds.has(serverId)) {
      await this._runtime.close(serverId).catch(() => {})
      this._registeredIds.delete(serverId)
      this._schemaCache.delete(serverId)
      logger.info(`[McpManager] Stopped server: ${serverId}`)
    }
  }

  /**
   * Return { serverId: boolean } indicating which servers have active connections.
   */
  getRunningStatus() {
    const status = {}
    for (const id of this._registeredIds) {
      status[id] = true
    }
    return status
  }

  /**
   * Stop all servers and tear down the runtime.
   */
  async stopAll() {
    if (this._runtime) {
      await this._runtime.close().catch(() => {})
      this._runtime = null
      logger.info('[McpManager] All servers stopped, runtime disposed')
    }
    this._registeredIds.clear()
    this._schemaCache.clear()
  }
}

// Singleton instance
const mcpManager = new McpManager()

module.exports = { mcpManager, McpManager }
