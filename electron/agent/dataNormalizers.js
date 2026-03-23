/**
 * Data normalization utilities for reading JSON config files.
 *
 * Different JSON files use different formats (arrays, dicts, nested objects).
 * These normalizers convert them to consistent array formats used by the
 * agent orchestration pipeline.
 */

/** Normalize agents.json: may be { categories, agents: [] } or plain array */
function normalizeAgents(raw) {
  return Array.isArray(raw) ? raw : (raw?.agents || [])
}

/** Normalize tools.json: may be dict { "id": config } or array. Filters __deletedBuiltins. */
function normalizeTools(raw) {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw)
    .filter(([id]) => id !== '__deletedBuiltins')
    .map(([id, c]) => ({ ...c, id }))
}

/** Normalize mcp-servers.json: may be array (new) or dict (legacy Claude Desktop format) */
function normalizeMcpServers(raw) {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).map(([name, c]) => ({ id: name, name, ...c }))
}

module.exports = { normalizeAgents, normalizeTools, normalizeMcpServers }
