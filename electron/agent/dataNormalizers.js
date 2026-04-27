/**
 * Data normalization utilities for reading JSON config files.
 *
 * Different JSON files use different formats (arrays, dicts, nested objects).
 * These normalizers convert them to consistent array formats used by the
 * agent orchestration pipeline.
 */

/**
 * Flatten agents.json into a single array of agent records.
 *
 * On-disk schema:
 *   { agents:   { categories, items: [system agents] },
 *     personas: { categories, items: [user personas]  } }
 *
 * The renderer-side store keeps system agents and user personas in separate
 * refs (and separate top-level keys on disk) so a bug in any system-agent
 * flow can't accidentally wipe personas. Electron-side readers don't care
 * about the split — they just want one list of agents — so this normalizer
 * flattens both sections back together.
 */
function normalizeAgents(raw) {
  if (!raw || typeof raw !== 'object') return []
  const sys = Array.isArray(raw.agents?.items) ? raw.agents.items : []
  const usr = Array.isArray(raw.personas?.items) ? raw.personas.items : []
  return [...sys, ...usr]
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
