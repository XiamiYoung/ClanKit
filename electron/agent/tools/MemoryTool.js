/**
 * MemoryTool — agent tools for read/update of agent memory.
 *
 * Two tools exported:
 *   - MemoryUpdateTool: add/update/remove entries
 *   - MemoryReadTool:   read existing memory (or a specific section)
 *
 * Storage: SQLite-backed MemoryStore at {DATA_DIR}/memory/memory.db.
 *
 * Compat helpers (`createTemplate`, `parseMarkdown`, `serializeMarkdown`,
 * `SECTIONS`) are exported because the chat-import nuwa pipeline (Phase B)
 * builds memory markdown directly from chat-derived sections, then writes it
 * via `memory:write` — that path lands in the store via the markdown adapter.
 */
const { BaseTool } = require('./BaseTool')
const { logger } = require('../../logger')
const memoryStoreMod = require('../../memory/memoryStore')
const memoryMarkdown = require('../../memory/memoryMarkdown')

// Re-export for chatImport / agentLoop compatibility
const SECTIONS = memoryMarkdown.SECTIONS

// ── Compat helpers used by chatImport ──────────────────────────────────────

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}
function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Create a blank memory template. Used by chatImport when synthesizing a
 * fresh memory document from a chat dump. Output is markdown; caller writes
 * via `memory:write` which lands in the MemoryStore.
 */
function createTemplate(agentName, agentType) {
  const lines = [
    `# Memory: ${agentName}`,
    `> Last updated: ${isoNow()}`,
    '',
    '## Identity',
    `- Type: ${agentType === 'system' ? 'system' : 'user'}`,
    `- Created: ${dateStamp()}`,
    '',
  ]
  for (const section of SECTIONS) {
    if (section === 'Identity') continue
    lines.push(`## ${section}`, '', '')
  }
  return lines.join('\n')
}

/**
 * Compat: parse memory markdown into { headerLines, sections: Map<name, lines[]> }.
 * Used by the chat-import nuwa pipeline.
 */
function parseMarkdown(content) {
  const lines = content.split('\n')
  const sections = new Map()
  let currentSection = null
  const headerLines = []

  for (const line of lines) {
    const sectionMatch = line.match(/^## (.+)$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      if (!sections.has(currentSection)) sections.set(currentSection, [])
    } else if (currentSection) {
      sections.get(currentSection).push(line)
    } else {
      headerLines.push(line)
    }
  }
  return { headerLines, sections }
}

/**
 * Compat: serialize parsed memory back to markdown.
 */
function serializeMarkdown(headerLines, sections) {
  const parts = [...headerLines]
  for (const [name, lines] of sections) {
    parts.push(`## ${name}`)
    parts.push(...lines)
  }
  return parts.join('\n')
}

/**
 * Compat: update the "Last updated" header timestamp in place.
 */
function updateTimestamp(headerLines) {
  for (let i = 0; i < headerLines.length; i++) {
    if (headerLines[i].startsWith('> Last updated:')) {
      headerLines[i] = `> Last updated: ${isoNow()}`
      return
    }
  }
  headerLines.splice(1, 0, `> Last updated: ${isoNow()}`)
}

// ── MemoryUpdateTool ───────────────────────────────────────────────────────

class MemoryUpdateTool extends BaseTool {
  constructor() {
    super(
      'update_memory',
      'Update memory for a user or system agent. For user agents (agent_type: "users"): store user preferences, facts, habits, and personal context. For system agents (agent_type: "system"): store behavioral learnings, tone/format preferences, and domain context that help this AI agent respond better. Always check existing memory with read_memory before adding duplicates.',
      'update_memory'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        agent_id:   { type: 'string', description: 'ID of the agent whose memory to update' },
        agent_type: { type: 'string', enum: ['system', 'users'], description: 'Whether this is a system or user agent' },
        section:    { type: 'string', description: 'Section name. Free-form sections (use these for runtime memory updates): Preferences, Communication, Technical, Projects, Personal, Interaction Notes. Nuwa-methodology sections (populated by chat import, do not modify casually): Mental Models, Decision Heuristics, Values & Anti-Patterns, Relational Genealogy, Honest Boundaries, Core Tensions, Relationship Timeline.' },
        action:     { type: 'string', enum: ['add', 'update', 'remove'], description: 'What to do' },
        entry:      { type: 'string', description: 'The memory entry to add/update/remove' },
        old_entry:  { type: 'string', description: 'For update action: the existing entry text to replace' },
        agent_name: { type: 'string', description: 'Display name of the agent (recorded on first write)' },
      },
      required: ['agent_id', 'agent_type', 'section', 'action', 'entry']
    }
  }

  _getStore() {
    const ds = require('../../lib/dataStore')
    return memoryStoreMod.getInstance(ds.paths().MEMORY_DIR)
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { agent_id, agent_type, section, action, entry, old_entry, agent_name } = params

    if (!agent_id || !agent_type || !section || !action || !entry) {
      return this._err('Missing required fields: agent_id, agent_type, section, action, entry')
    }

    const store = this._getStore()
    if (agent_name) store.upsertMeta(agent_id, agent_type, agent_name)

    const existingRows = store.listRows(agent_id, agent_type)
    const sectionRows = existingRows.filter(r => r.section === section)

    switch (action) {
      case 'add': {
        // Dedup: case-insensitive substring inclusion either direction
        const entryLower = entry.toLowerCase().trim()
        for (const r of sectionRows) {
          const existing = r.content.toLowerCase().trim()
          if (existing && (existing === entryLower || existing.includes(entryLower) || entryLower.includes(existing))) {
            return this._ok(`Similar entry already exists in ${section}: "${r.content}"`, { agent_id, section, action: 'skipped_duplicate' })
          }
        }
        store.addRow({
          agentId: agent_id,
          agentType: agent_type,
          section,
          content: entry,
          source: 'tool',
        })
        this._appendLog(store, agent_id, agent_type, action, entry)
        break
      }
      case 'update': {
        if (!old_entry) return this._err('update action requires old_entry field')
        const target = sectionRows.find(r => r.content.includes(old_entry))
        if (!target) return this._err(`Could not find entry matching: "${old_entry}"`)
        store.updateRow(target.id, { content: entry })
        this._appendLog(store, agent_id, agent_type, action, entry)
        break
      }
      case 'remove': {
        const target = sectionRows.find(r => r.content.includes(entry))
        if (!target) return this._err(`Could not find entry matching: "${entry}"`)
        store.deleteRow(target.id)
        this._appendLog(store, agent_id, agent_type, action, entry)
        break
      }
      default:
        return this._err(`Unknown action: ${action}`)
    }

    logger.agent('MemoryUpdateTool', { agent_type, section, action })
    return this._ok(`Memory ${action}d in ${section}: ${entry}`, { agent_id, section, action })
  }

  /**
   * Append a Memory Updates Log entry. Bounded to 50 most recent rows.
   */
  _appendLog(store, agentId, agentType, action, entry) {
    try {
      store.addRow({
        agentId,
        agentType,
        section: 'Memory Updates Log',
        content: `[${dateStamp()}] ${action}: ${entry}`,
        source: 'tool',
      })
      const allLog = store.listRows(agentId, agentType).filter(r => r.section === 'Memory Updates Log')
      if (allLog.length > 50) {
        const toDelete = allLog.slice(0, allLog.length - 50)
        for (const r of toDelete) store.deleteRow(r.id)
      }
    } catch (err) {
      logger.warn('[MemoryUpdateTool] _appendLog failed (non-fatal)', err.message)
    }
  }
}

// ── MemoryReadTool ─────────────────────────────────────────────────────────

class MemoryReadTool extends BaseTool {
  constructor() {
    super(
      'read_memory',
      'Read the agent memory. Use this to check existing memories before adding new ones, or to recall what you know about the user.',
      'read_memory'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        agent_id:   { type: 'string', description: 'ID of the agent whose memory to read' },
        agent_type: { type: 'string', enum: ['system', 'users'], description: 'Whether this is a system or user agent' },
        section:    { type: 'string', description: 'Optional: specific section to read (e.g. Preferences). Omit to read all.' },
      },
      required: ['agent_id', 'agent_type']
    }
  }

  _getStore() {
    const ds = require('../../lib/dataStore')
    return memoryStoreMod.getInstance(ds.paths().MEMORY_DIR)
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { agent_id, agent_type, section } = params

    if (!agent_id || !agent_type) {
      return this._err('Missing required fields: agent_id, agent_type')
    }

    const store = this._getStore()

    if (!store.exists(agent_id, agent_type)) {
      return this._ok('No memory exists for this agent yet.', { exists: false })
    }

    if (!section) {
      const md = store.readMarkdown(agent_id, agent_type)
      return this._ok(md || '(empty)', { exists: true })
    }

    const rows = store.listRows(agent_id, agent_type).filter(r => r.section === section)
    if (rows.length === 0) {
      return this._ok(`Section "${section}" is empty or not found.`, { exists: true, section, empty: true })
    }
    return this._ok(rows.map(r => `- ${r.content}`).join('\n'), { exists: true, section })
  }
}

module.exports = {
  MemoryUpdateTool,
  MemoryReadTool,
  // Compat helpers — chatImport pipeline still uses these for direct .md synthesis
  createTemplate,
  parseMarkdown,
  serializeMarkdown,
  updateTimestamp,
  SECTIONS,
}
