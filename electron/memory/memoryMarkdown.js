/**
 * memoryMarkdown — pure parse/serialize between memory markdown blobs and
 * structured rows.
 *
 * The SQLite-backed MemoryStore is the source of truth, but agents (LLM tool
 * calls), the chat-import pipeline, and the `memory:read/write` IPC contract
 * all still want a markdown view. This module is the boundary: zero side
 * effects, zero IPC, zero DB. Pure functions only — fully testable without
 * native deps.
 *
 * Row shape:
 *   {
 *     id:         uuid          // stable across edits
 *     agentId:    string
 *     agentType:  'system' | 'users'
 *     section:    string        // e.g. 'Preferences', 'Mental Models'
 *     content:    string        // raw text (without leading "- ")
 *     source:     string        // 'tool' | 'extractor-auto' | 'extractor-confirm' | 'import-nuwa' | 'user' | 'unknown'
 *     confidence: number|null   // 0..1, null when unknown
 *     createdAt:  number        // ms since epoch
 *     updatedAt:  number        // ms since epoch
 *   }
 */
const crypto = require('crypto')

// Canonical section ordering. Used for stable serialization so round-tripping
// through the store doesn't
// reorder sections every save.
const SECTIONS = [
  'Identity',
  // Nuwa-methodology sections (chatImport pipeline)
  'Mental Models',
  'Decision Heuristics',
  'Values & Anti-Patterns',
  'Relational Genealogy',
  'Honest Boundaries',
  'Core Tensions',
  'Relationship Timeline',
  // Free-form sections (runtime MemoryExtractor)
  'Preferences',
  'Communication',
  'Technical',
  'Projects',
  'Personal',
  'Interaction Notes',
  'Memory Updates Log',
]

const SECTION_ORDER = new Map(SECTIONS.map((s, i) => [s, i]))

function _isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function _newId() {
  return crypto.randomUUID()
}

/**
 * Stable hash of (agentId + agentType + section + content). Lets the migration
 * script give the SAME id to identical entries on every run, so re-running
 * migration doesn't churn IDs.
 */
function deterministicId(agentId, agentType, section, content) {
  const h = crypto.createHash('sha1')
  h.update(`${agentId}${agentType}${section}${content.trim()}`)
  // 32 hex chars → format as a uuid-shaped string so any consumer expecting
  // the uuid pattern still parses it.
  const hex = h.digest('hex').slice(0, 32)
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`
}

/**
 * Parse a memory markdown blob into structured rows.
 *
 * Behaviour notes:
 * - Section headings are matched as `^## (.+)$`.
 * - Within a section, only lines starting with `- ` count as entries. Anything
 *   else (blank lines, raw paragraphs, sub-headers like `### Foo`) is ignored
 *   for entry extraction. The `## Identity` block uses `- Type: …` / `- Created: …`
 *   bullets so it is captured naturally.
 * - Entries preserve the original text after the `- ` prefix verbatim, including
 *   any inline markdown.
 *
 * @param {string} content      The full .md file contents
 * @param {string} agentId
 * @param {string} agentType    'system' | 'users'
 * @param {object} [opts]
 * @param {string} [opts.source]      Default source for new rows
 * @param {number} [opts.timestamp]   Default created/updated timestamp (ms)
 * @param {boolean} [opts.deterministic]  Use deterministic IDs (for idempotent migration)
 * @returns {{ headerLines: string[], rows: object[], agentName: string|null }}
 */
function parseMarkdownToRows(content, agentId, agentType, opts = {}) {
  const source = opts.source || 'unknown'
  const ts = typeof opts.timestamp === 'number' ? opts.timestamp : Date.now()
  const useDeterministicId = !!opts.deterministic

  const lines = (content || '').split('\n')
  const rows = []
  const headerLines = []
  let currentSection = null
  let agentName = null

  for (const line of lines) {
    const titleMatch = line.match(/^#\s+Memory:\s+(.+)$/)
    if (titleMatch && !currentSection) {
      agentName = titleMatch[1].trim()
      headerLines.push(line)
      continue
    }

    const sectionMatch = line.match(/^##\s+(.+)$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim()
      continue
    }

    if (!currentSection) {
      headerLines.push(line)
      continue
    }

    const entryMatch = line.match(/^-\s+(.+?)\s*$/)
    if (entryMatch) {
      const entryContent = entryMatch[1]
      // Skip empty bullets that some legacy files contain
      if (!entryContent.trim()) continue

      const id = useDeterministicId
        ? deterministicId(agentId, agentType, currentSection, entryContent)
        : _newId()

      rows.push({
        id,
        agentId,
        agentType,
        section: currentSection,
        content: entryContent,
        source,
        confidence: null,
        createdAt: ts,
        updatedAt: ts,
      })
    }
    // Non-bullet lines inside a section are dropped — they're either blank
    // separators or stale free-form text that doesn't fit the row model.
  }

  return { headerLines, rows, agentName }
}

/**
 * Serialize structured rows back into a memory markdown document.
 *
 * Sections are emitted in the canonical SECTIONS order. Rows in unknown
 * sections (custom or deprecated) come AFTER known sections in alphabetical
 * order — so they're not lost.
 *
 * Within a section, rows preserve their input order (caller is responsible
 * for ordering — typically by createdAt ASC).
 *
 * @param {object[]} rows         Rows for ONE agent (caller filters by agentId+agentType)
 * @param {object}   [headerInfo] { agentName, agentType, lastUpdated, createdDate }
 * @returns {string} Full markdown document
 */
function rowsToMarkdown(rows, headerInfo = {}) {
  const agentName = headerInfo.agentName || (rows[0] && rows[0].agentId) || 'agent'
  const agentType = headerInfo.agentType || (rows[0] && rows[0].agentType) || 'system'
  const lastUpdated = headerInfo.lastUpdated || _isoNow()

  const out = []
  out.push(`# Memory: ${agentName}`)
  out.push(`> Last updated: ${lastUpdated}`)
  out.push('')

  // Group rows by section
  const bySection = new Map()
  for (const r of rows) {
    if (!bySection.has(r.section)) bySection.set(r.section, [])
    bySection.get(r.section).push(r)
  }

  // Emit sections in canonical order. Always render Identity even if empty so
  // round-tripping a freshly-templated memory stays stable.
  const knownSections = SECTIONS.slice()
  const unknownSections = [...bySection.keys()]
    .filter(s => !SECTION_ORDER.has(s))
    .sort((a, b) => a.localeCompare(b))
  const ordered = [...knownSections, ...unknownSections]

  for (const section of ordered) {
    const sectionRows = bySection.get(section) || []
    if (section === 'Identity' && sectionRows.length === 0) {
      // Render a minimal Identity block (used by templates of brand-new agents)
      out.push('## Identity')
      out.push(`- Type: ${agentType === 'users' ? 'user' : 'system'}`)
      if (headerInfo.createdDate) out.push(`- Created: ${headerInfo.createdDate}`)
      out.push('')
      continue
    }
    if (sectionRows.length === 0 && SECTION_ORDER.has(section)) {
      // Empty known section — emit header for shape stability with old format
      out.push(`## ${section}`)
      out.push('')
      out.push('')
      continue
    }
    if (sectionRows.length === 0) continue

    out.push(`## ${section}`)
    out.push('')
    for (const r of sectionRows) {
      out.push(`- ${r.content}`)
    }
    out.push('')
  }

  return out.join('\n')
}

/**
 * Diff two row sets to produce minimal CRUD operations. Used by `memory:write`
 * to reconcile an externally-edited markdown blob (e.g. agent saved memory
 * via the legacy textarea) back into the row store without losing IDs of
 * unchanged entries.
 *
 * Matching strategy:
 * 1. Pair rows by (section, content) — exact text match keeps the existing ID
 * 2. Remaining oldRows → deletes
 * 3. Remaining newRows → inserts
 *
 * Updates (text edits to the same logical entry) appear as a delete+insert,
 * which is fine — the structured-card UI does explicit updates via the
 * memories:update IPC, so it preserves IDs there.
 *
 * @param {object[]} oldRows     Rows currently in the store for this agent
 * @param {object[]} newRows     Rows parsed from the incoming markdown
 * @returns {{ inserts: object[], deletes: string[], unchanged: object[] }}
 */
function diffRows(oldRows, newRows) {
  const oldByKey = new Map()
  for (const r of oldRows) {
    const key = `${r.section}${r.content.trim()}`
    if (!oldByKey.has(key)) oldByKey.set(key, [])
    oldByKey.get(key).push(r)
  }

  const inserts = []
  const unchanged = []
  const usedIds = new Set()

  for (const newRow of newRows) {
    const key = `${newRow.section}${newRow.content.trim()}`
    const matches = oldByKey.get(key)
    if (matches && matches.length > 0) {
      const oldRow = matches.shift()
      usedIds.add(oldRow.id)
      unchanged.push({ ...oldRow, updatedAt: newRow.updatedAt || oldRow.updatedAt })
    } else {
      inserts.push(newRow)
    }
  }

  const deletes = []
  for (const r of oldRows) {
    if (!usedIds.has(r.id)) deletes.push(r.id)
  }

  return { inserts, deletes, unchanged }
}

module.exports = {
  SECTIONS,
  SECTION_ORDER,
  parseMarkdownToRows,
  rowsToMarkdown,
  diffRows,
  deterministicId,
}
