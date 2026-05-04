/**
 * ManageKnowledgeTool - LLM-callable wrapper for knowledge base CRUD.
 *
 * SCOPE: KB-level operations only — create / delete / list / get / update
 * the knowledge bases themselves. To ADD or REMOVE documents inside a KB,
 * or to QUERY a KB, use the always-on `knowledge_manage` tool instead.
 *
 * Two storage planes are kept in sync:
 *   1. The vectra index + metadata directory at {DATA_DIR}/knowledge/<id>/
 *      (managed by the host's localVectorStore module — injected as
 *      context.localVectorStore)
 *   2. The knowledge.json registry at {DATA_DIR}/knowledge.json with shape
 *      { knowledgeBases: { <id>: { enabled: true } } }
 *
 * Skill tools cannot require() project modules — see LESSONS.md. BaseTool
 * inlined; localVectorStore + dataPath both injected via constructor context.
 */
const fs = require('fs')
const path = require('path')
// Use Node core crypto instead of the uuid npm package — skill tools deployed
// at {DATA_DIR}/skills/ cannot reach the app's node_modules.
const { randomUUID: uuidv4 } = require('crypto')

class BaseTool {
  constructor(name, description, label) {
    this.name = name
    this.description = description
    this.label = label || name
  }
  definition() {
    return { name: this.name, description: this.description, input_schema: this.schema() }
  }
  schema() { throw new Error('schema() must be implemented') }
  _ok(text, details = {}) {
    return { content: [{ type: 'text', text: String(text) }], details }
  }
  _err(message, details = {}) {
    return { content: [{ type: 'text', text: `Error: ${message}` }], details, isError: true }
  }
}

const MAX_NAME_LEN = 80
const MAX_DESC_LEN = 500

// Pure helpers (unit-testable)

function validateKbInput(input) {
  if (!input || typeof input !== 'object') return 'kb: object required'
  const name = (input.name || '').trim()
  if (!name) return 'kb.name required'
  if (name.length > MAX_NAME_LEN) return `kb.name too long (max ${MAX_NAME_LEN})`
  if ((input.description || '').length > MAX_DESC_LEN) {
    return `kb.description too long (max ${MAX_DESC_LEN})`
  }
  return null
}

function normalizeKbInput(input) {
  return {
    name:        (input.name || '').trim(),
    description: (input.description || '').trim(),
  }
}

function formatKbSummary(kb) {
  if (!kb) return '(none)'
  return `id=${kb.id} | name=${kb.name || '(unnamed)'} | docs=${kb.documentCount || 0}`
}

// Tool class

class ManageKnowledgeTool extends BaseTool {
  constructor(context) {
    super(
      'manage_knowledge',
      'Create / delete / list / update ClanKit knowledge bases (KBs themselves). This tool manages knowledge bases (creation/deletion/list/update of KBs themselves). To ADD or REMOVE documents inside a KB, or to QUERY/SEARCH a KB, use the existing `knowledge_manage` tool instead. Action enum: create_kb, delete_kb, list_kbs, get_kb, update_kb. NEVER call file_operation or execute_shell to edit knowledge.json — use this tool.',
      'Manage Knowledge'
    )
    this._context = context || {}
    this._dataPath = context?.dataPath || ''
    this._lvs = context?.localVectorStore || null
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create_kb', 'delete_kb', 'list_kbs', 'get_kb', 'update_kb'],
        },
        kb: {
          type: 'object',
          properties: {
            id:          { type: 'string', description: 'Required for update_kb' },
            name:        { type: 'string', maxLength: 80 },
            description: { type: 'string', maxLength: 500 },
          },
        },
        id: { type: 'string', description: 'Required for delete_kb / get_kb' },
      },
      required: ['action'],
    }
  }

  // knowledge.json registry — raw fs (cannot require dataStore)

  _registryFile() {
    if (!this._dataPath) throw new Error('dataPath not injected into skill context')
    return path.join(this._dataPath, 'knowledge.json')
  }

  _readRegistry() {
    const fp = this._registryFile()
    if (!fs.existsSync(fp)) return { knowledgeBases: {} }
    try {
      const raw = fs.readFileSync(fp, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        if (!parsed.knowledgeBases || typeof parsed.knowledgeBases !== 'object') {
          parsed.knowledgeBases = {}
        }
        // Strip the legacy ragEnabled field so it stops being persisted.
        delete parsed.ragEnabled
        return parsed
      }
      return { knowledgeBases: {} }
    } catch (err) {
      throw new Error(`Failed to read knowledge.json: ${err.message}`)
    }
  }

  _writeRegistry(reg) {
    const fp = this._registryFile()
    const tmp = fp + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(reg, null, 2), 'utf8')
    fs.renameSync(tmp, fp)
  }

  async execute(toolCallId, input) {
    if (!this._lvs) {
      return this._err('localVectorStore not available — host did not inject context.localVectorStore')
    }
    const action = input?.action
    try {
      switch (action) {
        case 'create_kb': return await this._createKb(input.kb)
        case 'delete_kb': return await this._deleteKb(input.id)
        case 'list_kbs':  return this._listKbs()
        case 'get_kb':    return this._getKb(input.id)
        case 'update_kb': return this._updateKb(input.kb)
        default: return this._err(`Unknown action: ${action}`)
      }
    } catch (err) {
      return this._err(`Action ${action} failed: ${err.message}`)
    }
  }

  async _createKb(kbInput) {
    const err = validateKbInput(kbInput)
    if (err) return this._err(err)
    const norm = normalizeKbInput(kbInput)
    const id = uuidv4()
    const meta = await this._lvs.createKnowledgeBase({ id, name: norm.name, description: norm.description })
    // Register in knowledge.json with enabled: true.
    const reg = this._readRegistry()
    reg.knowledgeBases[id] = { enabled: true }
    this._writeRegistry(reg)
    return this._ok(`Created knowledge base: ${formatKbSummary(meta)}`, { id, kb: meta })
  }

  async _deleteKb(id) {
    if (!id) return this._err('id required for delete_kb')
    await this._lvs.deleteKnowledgeBase(id)
    const reg = this._readRegistry()
    if (reg.knowledgeBases && reg.knowledgeBases[id]) {
      delete reg.knowledgeBases[id]
      this._writeRegistry(reg)
    }
    return this._ok(`Deleted knowledge base: ${id}`, { id, deleted: true })
  }

  _listKbs() {
    const list = this._lvs.listKnowledgeBases() || []
    const summaries = list.map(formatKbSummary)
    return this._ok(
      `Found ${list.length} knowledge base(s):\n${summaries.join('\n')}`,
      { count: list.length, kbs: list.map(k => ({ id: k.id, name: k.name, documentCount: k.documentCount || 0 })) }
    )
  }

  _getKb(id) {
    if (!id) return this._err('id required for get_kb')
    const kb = this._lvs.getKnowledgeBase(id)
    if (!kb) return this._err(`Knowledge base not found: ${id}`)
    return this._ok(formatKbSummary(kb), { kb })
  }

  _updateKb(kbInput) {
    if (!kbInput?.id) return this._err('kb.id required for update_kb')
    const updates = {}
    if (typeof kbInput.name === 'string')        updates.name = kbInput.name.trim()
    if (typeof kbInput.description === 'string') updates.description = kbInput.description.trim()
    if (Object.keys(updates).length === 0) {
      return this._err('No fields provided to update (name and/or description)')
    }
    if (updates.name !== undefined) {
      if (!updates.name) return this._err('kb.name cannot be empty')
      if (updates.name.length > MAX_NAME_LEN) return this._err(`kb.name too long (max ${MAX_NAME_LEN})`)
    }
    if (updates.description !== undefined && updates.description.length > MAX_DESC_LEN) {
      return this._err(`kb.description too long (max ${MAX_DESC_LEN})`)
    }
    const meta = this._lvs.updateKnowledgeBase(kbInput.id, updates)
    return this._ok(`Updated knowledge base: ${formatKbSummary(meta)}`, { id: kbInput.id, kb: meta })
  }
}

module.exports = {
  ManageKnowledgeTool,
  validateKbInput,
  normalizeKbInput,
  formatKbSummary,
}
