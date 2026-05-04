/**
 * IPC handlers for MCP server config and HTTP tools config.
 * Channels: mcp:*, tools:*
 */
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')

let _mcpManager = null

function register({ mcpManager } = {}) {
  _mcpManager = mcpManager

  // --- MCP Server Configuration ---
  ipcMain.handle('mcp:get-config', async () => ds.readJSONAsync(ds.paths().MCP_SERVERS_FILE, {}))

  ipcMain.handle('mcp:save-config', async (_, mcpServers) => {
    try {
      await ds.writeJSONAtomic(ds.paths().MCP_SERVERS_FILE, mcpServers)
      return { success: true }
    } catch (err) {
      logger.error('mcp:save-config error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- MCP Status & Test ---
  ipcMain.handle('mcp:get-status', () => _mcpManager.getRunningStatus())

  ipcMain.handle('mcp:test-connection', async (event, config) => {
    if (!config) return { success: false, error: 'No config provided', tools: [] }
    const transport = (config.url || '').trim()
      ? `http [${config.url}]`
      : `stdio [${(config.command || '').trim()} ${(config.args || []).join(' ')}]`.trim()
    logger.info(`[MCP test] ${config.name || '(unnamed)'} — ${transport}`)
    try {
      const result = await _mcpManager.testConnection(config)
      if (result.success) {
        const toolNames = (result.tools || []).map(t => t.name).join(', ')
        logger.info(`[MCP test] ${config.name} OK — ${result.tools.length} tool(s): ${toolNames || '(none)'}`)
      } else {
        logger.warn(`[MCP test] ${config.name} FAILED — ${result.error}`)
      }
      return result
    } catch (err) {
      logger.error(`[MCP test] ${config.name} ERROR — ${err.message}`)
      return { success: false, error: err.message, tools: [] }
    }
  })

  // --- HTTP Tools Configuration ---
  ipcMain.handle('tools:get-config', async () => ds.readJSONAsync(ds.paths().TOOLS_FILE, {}))

  ipcMain.handle('tools:save-config', async (_, toolsConfig) => {
    try {
      await ds.writeJSONAtomic(ds.paths().TOOLS_FILE, toolsConfig)
      return { success: true }
    } catch (err) {
      logger.error('tools:save-config error', err.message)
      return { success: false, error: err.message }
    }
  })
}

module.exports = { register }
