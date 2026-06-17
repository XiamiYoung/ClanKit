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
 * `SECTIONS`) are exported because the chat-import persona pipeline (Phase B)
 * builds memory markdown directly from chat-derived sections, then writes it
 * via `memory:write` — that path lands in the store via the markdown adapter.
 */
const { BaseTool } = require('./BaseTool')
const { logger } = require('../../logger')
const memoryStoreMod = require('../../memory/memoryStore')
const memoryMarkdown = require('../../memory/memoryMarkdown')

// Re-export for chatImport / agentLoop compatibility
const SECTIONS = memoryMarkdown.SECTIONS

// ── Dedup helpers ─────────────────────────────────────────────────────────

const _CJK_RE = /[⺀-鿿豈-﫿]/
function _tokenize(text) {
  const tokens = new Set()
  const words = text.split(/[\s,;.!?，。；！？、：:""''（）()【】[\]]+/).filter(Boolean)
  for (const w of words) {
    if (_CJK_RE.test(w)) {
      for (let i = 0; i < w.length - 1; i++) tokens.add(w[i] + w[i + 1])
      if (w.length === 1) tokens.add(w)
    } else {
      tokens.add(w)
    }
  }
  return tokens
}

function _jaccardSimilarity(setA, setB) {
  if (!setA.size || !setB.size) return 0
  let intersection = 0
  for (const t of setA) { if (setB.has(t)) intersection++ }
  return intersection / (setA.size + setB.size - intersection)
}

function _pickSurvivor(a, b) {
  if ((a.revision || 0) !== (b.revision || 0)) return (a.revision || 0) > (b.revision || 0) ? a : b
  return (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b
}

function _cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

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
 * Used by the chat-import persona pipeline.
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
        section:    { type: 'string', description: 'Section name. Free-form sections (use these for runtime memory updates): Preferences, Communication, Technical, Projects, Personal, Interaction Notes. Persona-methodology sections (populated by chat import, do not modify casually): Mental Models, Decision Heuristics, Values & Anti-Patterns, Relational Genealogy, Honest Boundaries, Core Tensions, Relationship Timeline.' },
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
        const entryLower = entry.toLowerCase().trim()

        // Phase 1: exact / substring dedup — identical or contained text
        for (const r of sectionRows) {
          const existing = r.content.toLowerCase().trim()
          if (existing && (existing === entryLower || existing.includes(entryLower))) {
            return this._ok(`Similar entry already exists in ${section}: "${r.content}"`, { agent_id, section, action: 'skipped_duplicate' })
          }
        }

        // Phase 2: fuzzy dedup — Jaccard (fast) then vector semantic (precise)
        const sectionIds = new Set(sectionRows.map(r => r.id))
        let bestMatch = null
        let bestScore = 0
        let matchMethod = ''

        // 2a: Jaccard bigram similarity
        const JACCARD_THRESHOLD = 0.45
        const newTokens = _tokenize(entryLower)
        for (const r of sectionRows) {
          const score = _jaccardSimilarity(newTokens, _tokenize(r.content.toLowerCase().trim()))
          if (score > bestScore) { bestScore = score; bestMatch = r; matchMethod = 'jaccard' }
        }

        // 2b: vector semantic search (if Jaccard didn't find a strong match)
        if (bestScore < JACCARD_THRESHOLD) {
          try {
            const semHits = await store.searchSemantic(agent_id, agent_type, entry, 5)
            for (const hit of semHits) {
              if (!sectionIds.has(hit.id)) continue
              const vecScore = hit._vecScore || 0
              if (vecScore > bestScore) { bestScore = vecScore; bestMatch = hit; matchMethod = 'semantic' }
            }
          } catch (_) { /* embedding unavailable — rely on Jaccard only */ }
        }

        const MERGE_THRESHOLD = matchMethod === 'semantic' ? 0.82 : JACCARD_THRESHOLD
        if (bestMatch && bestScore >= MERGE_THRESHOLD) {
          store.updateRow(bestMatch.id, { content: entry, bumpRevision: true })
            logger.agent('MemoryUpdateTool', { agent_type, section, action: 'auto-merged', matchMethod, similarity: bestScore.toFixed(2) })
          await this._cleanAllSections(store, agent_id, agent_type)
          return this._ok(
            `Auto-merged into existing entry (${matchMethod} ${(bestScore * 100).toFixed(0)}%, revision ${(bestMatch.revision || 0) + 1}): ${entry}`,
            { agent_id, section, action: 'auto-merged' }
          )
        }

        store.addRow({
          agentId: agent_id,
          agentType: agent_type,
          section,
          content: entry,
          source: 'tool',
        })
        break
      }
      case 'update': {
        if (!old_entry) return this._err('update action requires old_entry field')
        const target = sectionRows.find(r => r.content.includes(old_entry))
        if (!target) return this._err(`Could not find entry matching: "${old_entry}"`)
        store.updateRow(target.id, { content: entry, bumpRevision: true })
        break
      }
      case 'remove': {
        const target = sectionRows.find(r => r.content.includes(entry))
        if (!target) return this._err(`Could not find entry matching: "${entry}"`)
        store.deleteRow(target.id)
        break
      }
      default:
        return this._err(`Unknown action: ${action}`)
    }

    await this._cleanAllSections(store, agent_id, agent_type)
    logger.agent('MemoryUpdateTool', { agent_type, section, action })
    return this._ok(`Memory ${action}d in ${section}: ${entry}`, { agent_id, section, action })
  }

  /**
   * Run dedup across all sections for an agent. Lightweight — typically < 100 rows total.
   */
  async _cleanAllSections(store, agentId, agentType) {
    try {
      const rows = store.listRows(agentId, agentType)
      // Delete all Memory Updates Log entries
      const logRows = rows.filter(r => r.section === 'Memory Updates Log')
      for (const r of logRows) store.deleteRow(r.id)
      const sections = new Set(rows.map(r => r.section))
      sections.delete('Memory Updates Log')
      for (const section of sections) {
        await this._cleanSectionDuplicates(store, agentId, agentType, section)
      }
    } catch (err) {
      logger.warn('[MemoryUpdateTool] _cleanAllSections failed (non-fatal)', err.message)
    }
  }

  /**
   * Scan a section for pairwise duplicates and remove the weaker one.
   * Uses Jaccard bigram similarity first, then vector cosine for pairs Jaccard missed.
   */
  async _cleanSectionDuplicates(store, agentId, agentType, section) {
    const SKIP_SECTIONS = new Set(['Identity'])
    if (SKIP_SECTIONS.has(section)) return
    try {
      const rows = store.listRows(agentId, agentType).filter(r => r.section === section)
      if (rows.length < 2) return

      const JACCARD_THRESHOLD = 0.45
      const VEC_THRESHOLD = 0.82
      const toDelete = new Set()

      // Build embedding cache for vector comparison
      let embedFn = null
      try {
        const emb = require('../../lib/localEmbedding')
        if (emb.isModelReady().ready) embedFn = (text) => emb.embed(text)
      } catch (_) { /* vector unavailable */ }

      const vecCache = new Map()
      async function getVec(row) {
        if (!embedFn) return null
        if (vecCache.has(row.id)) return vecCache.get(row.id)
        try {
          const v = await embedFn(row.content)
          vecCache.set(row.id, v)
          return v
        } catch (_) { return null }
      }

      for (let i = 0; i < rows.length; i++) {
        if (toDelete.has(rows[i].id)) continue
        const tokensI = _tokenize(rows[i].content.toLowerCase().trim())
        for (let j = i + 1; j < rows.length; j++) {
          if (toDelete.has(rows[j].id)) continue

          // Fast path: Jaccard
          const jScore = _jaccardSimilarity(tokensI, _tokenize(rows[j].content.toLowerCase().trim()))
          let isDuplicate = jScore >= JACCARD_THRESHOLD

          // Slow path: vector cosine (only if Jaccard didn't match and embeddings available)
          if (!isDuplicate && embedFn) {
            const [vecI, vecJ] = await Promise.all([getVec(rows[i]), getVec(rows[j])])
            if (vecI && vecJ) {
              const cosine = _cosineSimilarity(vecI, vecJ)
              isDuplicate = cosine >= VEC_THRESHOLD
            }
          }

          if (isDuplicate) {
            const keep = _pickSurvivor(rows[i], rows[j])
            const drop = keep.id === rows[i].id ? rows[j] : rows[i]
            toDelete.add(drop.id)
            if ((keep.revision || 0) <= (drop.revision || 0)) {
              store.updateRow(keep.id, { bumpRevision: true })
            }
          }
        }
      }
      for (const id of toDelete) store.deleteRow(id)
      if (toDelete.size > 0) {
        logger.agent('MemoryUpdateTool._cleanSectionDuplicates', { section, removed: toDelete.size })
      }
    } catch (err) {
      logger.warn('[MemoryUpdateTool] _cleanSectionDuplicates failed (non-fatal)', err.message)
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
