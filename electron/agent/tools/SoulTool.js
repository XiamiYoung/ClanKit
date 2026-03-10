/**
 * SoulTool — allows the agent to read and update persona memory ("soul") files.
 *
 * Soul files are structured markdown documents stored at:
 *   ~/.clankai/souls/system/{personaId}.md  (system personas)
 *   ~/.clankai/souls/users/{personaId}.md   (user personas)
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
const SECTIONS = [
  'Identity',
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
function createTemplate(personaName, personaType) {
  const lines = [
    `# Soul: ${personaName}`,
    `> Last updated: ${isoNow()}`,
    '',
    '## Identity',
    `- Type: ${personaType === 'system' ? 'system' : 'user'}`,
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

class SoulUpdateTool extends BaseTool {
  constructor(soulsDir) {
    super(
      'update_soul_memory',
      'Update memory for a user or system persona. For user personas (persona_type: "users"): store user preferences, facts, habits, and personal context. For system personas (persona_type: "system"): store behavioral learnings, tone/format preferences, and domain context that help this AI persona respond better. Always check existing memory with read_soul_memory before adding duplicates.'
    )
    this.soulsDir = soulsDir
  }

  schema() {
    return {
      type: 'object',
      properties: {
        persona_id:   { type: 'string', description: 'ID of the persona whose memory to update' },
        persona_type: { type: 'string', enum: ['system', 'users'], description: 'Whether this is a system or user persona' },
        section:      { type: 'string', description: 'Section name: Preferences, Communication, Technical, Projects, Personal, Interaction Notes' },
        action:       { type: 'string', enum: ['add', 'update', 'remove'], description: 'What to do' },
        entry:        { type: 'string', description: 'The memory entry to add/update/remove' },
        old_entry:    { type: 'string', description: 'For update action: the existing entry text to replace' },
        persona_name: { type: 'string', description: 'Display name of the persona (used when creating a new soul file)' },
      },
      required: ['persona_id', 'persona_type', 'section', 'action', 'entry']
    }
  }

  async execute(input) {
    const { persona_id, persona_type, section, action, entry, old_entry, persona_name } = input

    if (!persona_id || !persona_type || !section || !action || !entry) {
      return { success: false, error: 'Missing required fields: persona_id, persona_type, section, action, entry' }
    }

    const dir = path.join(this.soulsDir, persona_type)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const filePath = path.join(dir, `${persona_id}.md`)

    // Read or create
    let content
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8')
    } else {
      content = createTemplate(persona_name || persona_id, persona_type)
    }

    const { headerLines, sections } = parseSoul(content)

    // Ensure section exists
    if (!sections.has(section)) {
      sections.set(section, [''])
    }

    const sectionLines = sections.get(section)

    switch (action) {
      case 'add': {
        // Add entry as a bullet point
        // Find last non-empty line to insert after
        let insertIdx = sectionLines.length
        // Insert before trailing blank lines
        while (insertIdx > 0 && sectionLines[insertIdx - 1].trim() === '') insertIdx--
        sectionLines.splice(insertIdx, 0, `- ${entry}`)
        break
      }
      case 'update': {
        if (!old_entry) {
          return { success: false, error: 'update action requires old_entry field' }
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
          return { success: false, error: `Could not find entry matching: "${old_entry}"` }
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
          return { success: false, error: `Could not find entry matching: "${entry}"` }
        }
        break
      }
      default:
        return { success: false, error: `Unknown action: ${action}` }
    }

    // Update timestamp
    updateTimestamp(headerLines)

    // Append to Memory Updates Log
    if (sections.has('Memory Updates Log')) {
      const logLines = sections.get('Memory Updates Log')
      let insertIdx = logLines.length
      while (insertIdx > 0 && logLines[insertIdx - 1].trim() === '') insertIdx--
      logLines.splice(insertIdx, 0, `- [${dateStamp()}] ${action}: ${entry}`)
    }

    // Write back
    const newContent = serializeSoul(headerLines, sections)
    fs.writeFileSync(filePath, newContent, 'utf8')

    logger.agent('SoulUpdateTool', { persona_id, persona_type, section, action, entry: entry.slice(0, 100) })

    return { success: true, message: `Memory ${action}d in ${section}: ${entry}` }
  }
}

// ── SoulReadTool ───────────────────────────────────────────────────────────

class SoulReadTool extends BaseTool {
  constructor(soulsDir) {
    super(
      'read_soul_memory',
      'Read the persona memory (soul file). Use this to check existing memories before adding new ones, or to recall what you know about the user.'
    )
    this.soulsDir = soulsDir
  }

  schema() {
    return {
      type: 'object',
      properties: {
        persona_id:   { type: 'string', description: 'ID of the persona whose memory to read' },
        persona_type: { type: 'string', enum: ['system', 'users'], description: 'Whether this is a system or user persona' },
        section:      { type: 'string', description: 'Optional: specific section to read (e.g. Preferences). Omit to read all.' },
      },
      required: ['persona_id', 'persona_type']
    }
  }

  async execute(input) {
    const { persona_id, persona_type, section } = input

    if (!persona_id || !persona_type) {
      return { success: false, error: 'Missing required fields: persona_id, persona_type' }
    }

    const filePath = path.join(this.soulsDir, persona_type, `${persona_id}.md`)

    if (!fs.existsSync(filePath)) {
      return { success: true, exists: false, content: null, message: 'No soul file exists for this persona yet.' }
    }

    const content = fs.readFileSync(filePath, 'utf8')

    if (!section) {
      return { success: true, exists: true, content }
    }

    // Extract specific section
    const { sections } = parseSoul(content)
    if (sections.has(section)) {
      const lines = sections.get(section).filter(l => l.trim() !== '')
      return { success: true, exists: true, section, content: lines.join('\n') }
    }

    return { success: true, exists: true, section, content: '', message: `Section "${section}" is empty or not found.` }
  }
}

module.exports = { SoulUpdateTool, SoulReadTool }
