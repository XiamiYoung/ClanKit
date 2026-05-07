/**
 * IPC handlers for MCP server config and HTTP tools config.
 * Channels: mcp:*, tools:*
 */
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const { getInstance: getAgentStore } = require('../agent/AgentStore')

let _mcpManager = null

// Extract IDs from the MCP servers file. Today the file is an array; legacy
// dict format is migrated to array on first renderer load and never written
// back as dict, so we only need the array branch here.
function _extractMcpIds(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(s => s && s.id).filter(Boolean)
}

// Tool config is persisted as a dict { id: cfg, __deletedBuiltins?: [...] }.
// Filter out the reserved key when extracting IDs.
function _extractToolIds(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.keys(raw).filter(k => k && k !== '__deletedBuiltins')
}

function register({ mcpManager } = {}) {
  _mcpManager = mcpManager

  // --- MCP Server Configuration ---
  ipcMain.handle('mcp:get-config', async () => ds.readJSONAsync(ds.paths().MCP_SERVERS_FILE, {}))

  ipcMain.handle('mcp:save-config', async (_, mcpServers) => {
    try {
      const prev = await ds.readJSONAsync(ds.paths().MCP_SERVERS_FILE, [])
      const prevIds = _extractMcpIds(prev)
      const nextIds = _extractMcpIds(mcpServers)
      const removed = prevIds.filter(id => !nextIds.includes(id))
      const added = nextIds.filter(id => !prevIds.includes(id))
      await ds.writeJSONAtomic(ds.paths().MCP_SERVERS_FILE, mcpServers)
      if (removed.length || added.length) {
        const store = getAgentStore(ds.paths().DATA_DIR)
        for (const id of removed) store.pruneReferences('mcp', id)
        // Auto-enable newly added MCP servers on the default system agent
        // (Clank). Other agents stay opt-in. Avoids the "user added MCP, then
        // it doesn't work in chat" trap when Clank's required list was empty
        // and silently filtered the new server out.
        if (added.length) {
          const systemAgents = store.getByKind('system') || []
          const clank = systemAgents.find(a => a.isDefault)
          if (clank) {
            const cur = Array.isArray(clank.requiredMcpServerIds) ? clank.requiredMcpServerIds : []
            const merged = Array.from(new Set([...cur, ...added]))
            if (merged.length !== cur.length) {
              store.saveAgent({ ...clank, requiredMcpServerIds: merged, updatedAt: Date.now() })
              logger.info(`[mcp:save-config] auto-enabled ${added.length} MCP server(s) for default system agent ${clank.id}`)
            }
          }
        }
      }
      return { success: true }
    } catch (err) {
      logger.error('mcp:save-config error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- MCP Status & Test ---
  ipcMain.handle('mcp:get-status', () => _mcpManager.getRunningStatus())

  ipcMain.handle('mcp:stop-server', async (_, serverId) => {
    try {
      await _mcpManager.stopServer(serverId)
      return { success: true }
    } catch (err) {
      logger.error('mcp:stop-server error', err.message)
      return { success: false, error: err.message }
    }
  })

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
      const prev = await ds.readJSONAsync(ds.paths().TOOLS_FILE, {})
      const prevIds = _extractToolIds(prev)
      const nextIds = _extractToolIds(toolsConfig)
      const removed = prevIds.filter(id => !nextIds.includes(id))
      await ds.writeJSONAtomic(ds.paths().TOOLS_FILE, toolsConfig)
      if (removed.length) {
        const store = getAgentStore(ds.paths().DATA_DIR)
        for (const id of removed) store.pruneReferences('tool', id)
      }
      return { success: true }
    } catch (err) {
      logger.error('tools:save-config error', err.message)
      return { success: false, error: err.message }
    }
  })
}

module.exports = {
  register,
  // exported for unit tests
  _extractMcpIds,
  _extractToolIds,
}
