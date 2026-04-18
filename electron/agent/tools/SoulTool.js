/**
 * SoulTool — allows the agent to read and update agent memory ("soul") files.
 *
 * Soul files are structured markdown documents stored at:
 *   {DATA_DIR}/souls/system/{agentId}.md  (system agents)
 *   {DATA_DIR}/souls/users/{agentId}.md   (user agents)
 *
 * Two tools are exported:
 *   - SoulUpdateTool: add/update/remove entries in soul memory
 *   - SoulReadTool:   read existing soul memory (or a specific section)
 */
const fs = require('fs')
const path = require('path')
const { BaseTool } = require('./BaseTool')
const { logger } = require('../../logger')

// ── Standard section headings ──────────────────────────────────────────────
// Order matters: Identity first, then Nuwa-methodology sections (populated by
// the chatImport pipeline), then existing free-form sections (populated by
// MemoryExtractor at runtime), then logs at the bottom.
const SECTIONS = [
  'Identity',
  // Nuwa-methodology sections (populated by chatImport 4-phase pipeline)
  'Mental Models',
  'Decision Heuristics',
  'Values & Anti-Patterns',
  'Relational Genealogy',
  'Honest Boundaries',
  'Core Tensions',
  'Relationship Timeline',
  // Existing free-form sections (populated by runtime MemoryExtractor)
  'Preferences',
  'Communication',
  'Technical',
  'Projects',
  'Personal',
  'Interaction Notes',
  'Memory Updates Log',
]

// ── Helpers ────────────────────────────────────────────────────────────────

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Create a blank soul file template.
 */
function createTemplate(agentName, agentType) {
  const lines = [
    `# Soul: ${agentName}`,
    `> Last updated: ${isoNow()}`,
    '',
    '## Identity',
    `- Type: ${agentType === 'system' ? 'system' : 'user'}`,
    `- Created: ${dateStamp()}`,
    '',
  ]
  for (const section of SECTIONS) {
    if (section === 'Identity') continue // already added
    lines.push(`## ${section}`, '', '')
  }
  return lines.join('\n')
}

/**
 * Parse a soul markdown file into { header, sections: Map<name, lines[]> }.
 * Preserves ordering.
 */
function parseSoul(content) {
  const lines = content.split('\n')
  const sections = new Map()
  let currentSection = null
  const headerLines = []

  for (const line of lines) {
    const sectionMatch = line.match(/^## (.+)$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      if (!sections.has(currentSection)) {
        sections.set(currentSection, [])
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line)
    } else {
      headerLines.push(line)
    }
  }

  return { headerLines, sections }
}

/**
 * Serialize parsed soul back to markdown string.
 */
function serializeSoul(headerLines, sections) {
  const parts = [...headerLines]
  for (const [name, lines] of sections) {
    parts.push(`## ${name}`)
    parts.push(...lines)
  }
  return parts.join('\n')
}

/**
 * Update the "Last updated" timestamp in header lines.
 */
function updateTimestamp(headerLines) {
  for (let i = 0; i < headerLines.length; i++) {
    if (headerLines[i].startsWith('> Last updated:')) {
      headerLines[i] = `> Last updated: ${isoNow()}`
      return
    }
  }
  // If not found, insert after the title
  headerLines.splice(1, 0, `> Last updated: ${isoNow()}`)
}

// ── SoulUpdateTool ─────────────────────────────────────────────────────────

const COMPACTION_THRESHOLD = 4096 // bytes — trigger compaction above this
const COMPACTION_COOLDOWN  = 300000 // ms — at most once per 5 minutes per agent
const _compactionTimestamps = new Map() // agentId → last compaction time

class SoulUpdateTool extends BaseTool {
  constructor(soulsDir) {
    super(
      'update_soul_memory',
      'Update memory for a user or system agent. For user agents (agent_type: "users"): store user preferences, facts, habits, and personal context. For system agents (agent_type: "system"): store behavioral learnings, tone/format preferences, and domain context that help this AI agent respond better. Always check existing memory with read_soul_memory before adding duplicates.',
      'update_soul_memory'
    )
    this.soulsDir = soulsDir
    this._compactionConfig = null // { model, apiKey, baseURL, isOpenAI, directAuth }
  }

  /**
   * Set utility model config for LLM-based compaction.
   * Called by agentLoop after tool registration.
   */
  setCompactionConfig(config) {
    this._compactionConfig = config
  }

  /**
   * Async LLM-based soul file compaction. Merges duplicates, removes outdated entries,
   * and consolidates the file to stay within a reasonable size.
   * Fire-and-forget — errors are logged but never surface to the user.
   */
  async _runCompaction(filePath, agentId) {
    const cfg = this._compactionConfig
    if (!cfg?.model || !cfg?.apiKey) return

    const content = fs.readFileSync(filePath, 'utf8')
    const prompt = `You are a memory maintenance system. The following is an agent's soul/memory file in markdown format. It has grown too large and needs compaction.

Rules:
- Merge duplicate or near-duplicate entries into single entries
- Remove entries that are clearly outdated or no longer relevant (e.g., "meeting tomorrow" from weeks ago)
- Preserve ALL unique preferences, personality traits, corrections, and important facts
- Keep the exact same markdown structure (## section headings, bullet points)
- Keep the header (# Soul: ... and > Last updated: ...) unchanged
- In Memory Updates Log, keep only the 10 most recent entries
- Output ONLY the compacted markdown, nothing else

Current soul file:
${content}`

    try {
      let compacted
      if (cfg.isOpenAI) {
        const { OpenAIClient } = require('../core/OpenAIClient')
        const client = new OpenAIClient({
          openaiApiKey: cfg.apiKey,
          openaiBaseURL: cfg.baseURL,
          customModel: cfg.model,
          _resolvedProvider: 'openai',
          defaultProvider: 'openai',
          _scenario: 'soul-tool',
          ...(cfg.directAuth ? { _directAuth: true } : {}),
          provider: { type: cfg.providerType || 'openai' },
        })
        const response = await client.getClient().chat.completions.create({
          model: cfg.model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        })
        compacted = response.choices?.[0]?.message?.content || ''
      } else {
        const { AnthropicClient } = require('../core/AnthropicClient')
        const client = new AnthropicClient({
          apiKey: cfg.apiKey,
          baseURL: cfg.baseURL,
          customModel: cfg.model,
          _scenario: 'soul-tool',
        }).getClient()
        const response = await client.messages.create({
          model: cfg.model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        })
        compacted = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
      }

      // Validate compaction result — must still be valid markdown with sections
      if (compacted && compacted.includes('## ') && compacted.length > 100) {
        const oldSize = Buffer.byteLength(content, 'utf8')
        const newSize = Buffer.byteLength(compacted, 'utf8')
        // Only apply if it actually reduced size
        if (newSize < oldSize) {
          fs.writeFileSync(filePath, compacted, 'utf8')
          logger.info('[SoulTool] compaction complete', { agentId, oldSize, newSize, reduction: `${((1 - newSize / oldSize) * 100).toFixed(0)}%` })
        }
      }
    } catch (err) {
      logger.error('[SoulTool] compaction LLM call failed', err.message)
    }
  }

  schema() {
    return {
      type: 'object',
      properties: {
        agent_id:   { type: 'string', description: 'ID of the agent whose memory to update' },
        agent_type: { type: 'string', enum: ['system', 'users'], description: 'Whether this is a system or user agent' },
        section:      { type: 'string', description: 'Section name. Free-form sections (use these for runtime memory updates): Preferences, Communication, Technical, Projects, Personal, Interaction Notes. Nuwa-methodology sections (populated by chat import, do not modify casually): Mental Models, Decision Heuristics, Values & Anti-Patterns, Relational Genealogy, Honest Boundaries, Core Tensions, Relationship Timeline.' },
        action:       { type: 'string', enum: ['add', 'update', 'remove'], description: 'What to do' },
        entry:        { type: 'string', description: 'The memory entry to add/update/remove' },
        old_entry:    { type: 'string', description: 'For update action: the existing entry text to replace' },
        agent_name: { type: 'string', description: 'Display name of the agent (used when creating a new soul file)' },
      },
      required: ['agent_id', 'agent_type', 'section', 'action', 'entry']
    }
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { agent_id, agent_type, section, action, entry, old_entry, agent_name } = params

    if (!agent_id || !agent_type || !section || !action || !entry) {
      return this._err('Missing required fields: agent_id, agent_type, section, action, entry')
    }

    const dir = path.join(this.soulsDir, agent_type)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const filePath = path.join(dir, `${agent_id}.md`)

    // Read or create
    let content
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8')
    } else {
      content = createTemplate(agent_name || agent_id, agent_type)
    }

    const { headerLines, sections } = parseSoul(content)

    // Ensure section exists
    if (!sections.has(section)) {
      sections.set(section, [''])
    }

    const sectionLines = sections.get(section)

    switch (action) {
      case 'add': {
        // Dedup: check if a similar entry already exists in this section
        const entryLower = entry.toLowerCase().trim()
        for (const line of sectionLines) {
          const lineTrimmed = line.replace(/^-\s*/, '').toLowerCase().trim()
          if (lineTrimmed && (lineTrimmed === entryLower || lineTrimmed.includes(entryLower) || entryLower.includes(lineTrimmed))) {
            return this._ok(`Similar entry already exists in ${section}: "${line.trim()}"`, { agent_id, section, action: 'skipped_duplicate' })
          }
        }
        // Add entry as a bullet point
        let insertIdx = sectionLines.length
        while (insertIdx > 0 && sectionLines[insertIdx - 1].trim() === '') insertIdx--
        sectionLines.splice(insertIdx, 0, `- ${entry}`)
        break
      }
      case 'update': {
        if (!old_entry) {
          return this._err('update action requires old_entry field')
        }
        let found = false
        for (let i = 0; i < sectionLines.length; i++) {
          if (sectionLines[i].includes(old_entry)) {
            sectionLines[i] = `- ${entry}`
            found = true
            break
          }
        }
        if (!found) {
          return this._err(`Could not find entry matching: "${old_entry}"`)
        }
        break
      }
      case 'remove': {
        let found = false
        for (let i = 0; i < sectionLines.length; i++) {
          if (sectionLines[i].includes(entry)) {
            sectionLines.splice(i, 1)
            found = true
            break
          }
        }
        if (!found) {
          return this._err(`Could not find entry matching: "${entry}"`)
        }
        break
      }
      default:
        return this._err(`Unknown action: ${action}`)
    }

    // Update timestamp
    updateTimestamp(headerLines)

    // Append to Memory Updates Log (keep last 20 entries)
    if (sections.has('Memory Updates Log')) {
      const logLines = sections.get('Memory Updates Log')
      let insertIdx = logLines.length
      while (insertIdx > 0 && logLines[insertIdx - 1].trim() === '') insertIdx--
      logLines.splice(insertIdx, 0, `- [${dateStamp()}] ${action}: ${entry}`)

      // Trim to last 20 log entries
      const MAX_LOG_ENTRIES = 50
      const logEntries = logLines.filter(l => l.startsWith('- ['))
      if (logEntries.length > MAX_LOG_ENTRIES) {
        const toRemove = logEntries.length - MAX_LOG_ENTRIES
        let removed = 0
        for (let i = 0; i < logLines.length && removed < toRemove; i++) {
          if (logLines[i].startsWith('- [')) {
            logLines.splice(i, 1)
            removed++
            i-- // adjust index after splice
          }
        }
      }
    }

    // Write back
    const newContent = serializeSoul(headerLines, sections)
    fs.writeFileSync(filePath, newContent, 'utf8')

    logger.agent('SoulUpdateTool', { agent_type, section, action })

    const fileSize = Buffer.byteLength(newContent, 'utf8')

    // Trigger async LLM compaction if file is too large
    if (fileSize > COMPACTION_THRESHOLD && this._compactionConfig) {
      const lastCompaction = _compactionTimestamps.get(agent_id) || 0
      if (Date.now() - lastCompaction > COMPACTION_COOLDOWN) {
        _compactionTimestamps.set(agent_id, Date.now())
        this._runCompaction(filePath, agent_id).catch(err =>
          logger.error('[SoulTool] compaction error (non-fatal)', err.message)
        )
      }
    }

    return this._ok(`Memory ${action}d in ${section}: ${entry}`, { agent_id, section, action, fileSize })
  }
}

// ── SoulReadTool ───────────────────────────────────────────────────────────

class SoulReadTool extends BaseTool {
  constructor(soulsDir) {
    super(
      'read_soul_memory',
      'Read the agent memory (soul file). Use this to check existing memories before adding new ones, or to recall what you know about the user.',
      'read_soul_memory'
    )
    this.soulsDir = soulsDir
  }

  schema() {
    return {
      type: 'object',
      properties: {
        agent_id:   { type: 'string', description: 'ID of the agent whose memory to read' },
        agent_type: { type: 'string', enum: ['system', 'users'], description: 'Whether this is a system or user agent' },
        section:      { type: 'string', description: 'Optional: specific section to read (e.g. Preferences). Omit to read all.' },
      },
      required: ['agent_id', 'agent_type']
    }
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { agent_id, agent_type, section } = params

    if (!agent_id || !agent_type) {
      return this._err('Missing required fields: agent_id, agent_type')
    }

    const filePath = path.join(this.soulsDir, agent_type, `${agent_id}.md`)

    if (!fs.existsSync(filePath)) {
      return this._ok('No soul file exists for this agent yet.', { exists: false })
    }

    const content = fs.readFileSync(filePath, 'utf8')

    if (!section) {
      return this._ok(content, { exists: true })
    }

    // Extract specific section
    const { sections } = parseSoul(content)
    if (sections.has(section)) {
      const lines = sections.get(section).filter(l => l.trim() !== '')
      return this._ok(lines.join('\n'), { exists: true, section })
    }

    return this._ok(`Section "${section}" is empty or not found.`, { exists: true, section, empty: true })
  }
}

module.exports = {
  SoulUpdateTool,
  SoulReadTool,
  // Internal helpers exposed for the chat-import nuwa pipeline (Phase B).
  // Use these to read/write soul files directly when bulk-importing structured
  // sections instead of going through the per-entry SoulUpdateTool interface.
  createTemplate,
  parseSoul,
  serializeSoul,
  updateTimestamp,
  SECTIONS,
}
