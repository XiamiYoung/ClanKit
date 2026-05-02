/**
 * ManageToolsJsonTool - LLM-callable wrapper for tools.json (HTTP / code /
 * prompt / smtp tool definitions). Action enum:
 *   create_tool / update_tool / delete_tool / list_tools / get_tool
 *
 * tools.json is a flat dict { "<tool-id>": { name, type, ... } } with one
 * reserved key `__deletedBuiltins` that this tool MUST NOT touch.
 *
 * Skill tools cannot require() project modules — see LESSONS.md "Skill tools
 * cannot require() project modules". BaseTool is inlined; the host injects
 * dataPath via the constructor context. We use plain fs/path to read & write
 * tools.json directly from {DATA_DIR}/tools.json.
 */
const fs = require('fs')
const path = require('path')

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

const TOOL_TYPES = new Set(['http', 'code', 'prompt', 'smtp'])
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const MAX_NAME_LEN = 80
const MAX_DESC_LEN = 500

// Pure helpers (unit-testable)

/**
 * Derive a kebab-case ASCII id from a tool name. Handles the common case
 * where the name is purely English / ASCII. For names with NO ASCII letters
 * or digits at all (e.g. fully-CJK names like "天气查询") returns '' so the
 * caller can fall back to a UUID-style id — historically this branch ate the
 * whole name and forced the LLM to invent an English alias.
 *
 * Mixed names (e.g. "AWS 文档工具") still derive cleanly to "aws-" then
 * trimmed to "aws", which is a reasonable best-effort.
 */
function deriveToolId(name) {
  if (!name || typeof name !== 'string') return ''
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // If the slug is empty or starts with a digit (invalid id), let caller pick fallback.
  if (!slug) return ''
  if (!/^[a-z]/.test(slug)) return ''
  return slug
}

/**
 * Generate a fallback id when deriveToolId returns empty (e.g. CJK-only name).
 * Format: tool-<8 hex chars> — short, ASCII, collision-resistant. Uses Node
 * core crypto.randomUUID() (skill tools cannot require the uuid npm package).
 */
function fallbackToolId() {
  const { randomUUID } = require('crypto')
  return 'tool-' + randomUUID().slice(0, 8)
}

function validateToolInput(input) {
  if (!input || typeof input !== 'object') return 'tool: object required'
  const name = (input.name || '').trim()
  if (!name) return 'tool.name required'
  if (name.length > MAX_NAME_LEN) return `tool.name too long (max ${MAX_NAME_LEN})`
  if (!input.type) return 'tool.type required'
  if (!TOOL_TYPES.has(input.type)) {
    return `tool.type must be one of ${[...TOOL_TYPES].join(', ')}`
  }
  if ((input.description || '').length > MAX_DESC_LEN) {
    return `tool.description too long (max ${MAX_DESC_LEN})`
  }
  // Type-specific required fields
  if (input.type === 'http') {
    if (!input.endpoint || !String(input.endpoint).trim()) {
      return 'tool.endpoint required for http tools'
    }
    if (input.method && !HTTP_METHODS.has(String(input.method).toUpperCase())) {
      return `tool.method must be one of ${[...HTTP_METHODS].join(', ')}`
    }
    if (input.headers != null && (typeof input.headers !== 'object' || Array.isArray(input.headers))) {
      return 'tool.headers must be an object'
    }
  } else if (input.type === 'code') {
    if (!input.code || !String(input.code).trim()) {
      return 'tool.code required for code tools'
    }
  } else if (input.type === 'prompt') {
    if (!input.promptText || !String(input.promptText).trim()) {
      return 'tool.promptText required for prompt tools'
    }
  }
  // smtp has no extra required fields beyond name/type/description (uses config.smtp)
  return null
}

function normalizeToolInput(input) {
  const out = {
    name: (input.name || '').trim(),
    description: (input.description || '').trim(),
    category: (input.category || '').trim(),
    type: input.type,
  }
  if (input.type === 'http') {
    out.method = (input.method ? String(input.method).toUpperCase() : 'GET')
    out.endpoint = String(input.endpoint || '').trim()
    out.headers = (input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers))
      ? { ...input.headers }
      : {}
    // GET / HEAD / DELETE have no request body — default to "{}" so downstream
    // executors that JSON.parse the template don't choke on empty strings.
    // Caller-provided non-empty bodyTemplate is preserved verbatim (e.g. POST).
    const bodylessMethod = ['GET', 'HEAD', 'DELETE'].includes(out.method)
    out.bodyTemplate = (input.bodyTemplate && String(input.bodyTemplate).trim())
      || (bodylessMethod ? '{}' : '')
  } else if (input.type === 'code') {
    out.language = input.language || 'javascript'
    out.code = input.code || ''
  } else if (input.type === 'prompt') {
    out.promptText = input.promptText || ''
  }
  // smtp: nothing extra
  return out
}

function formatToolSummary(t) {
  if (!t) return '(none)'
  return `id=${t.id} | name=${t.name || '(unnamed)'} | type=${t.type}`
}

// Tool class

class ManageToolsJsonTool extends BaseTool {
  constructor(context) {
    super(
      'manage_tools',
      'Create/update/delete/list ClanKit HTTP / code / prompt / smtp tool definitions stored in tools.json. Types: http (method, endpoint, headers, bodyTemplate), code (language, code), prompt (promptText), smtp (uses global SMTP config). Tool id is derived from the name (lowercase + non-alphanumeric → hyphen). Action enum: create_tool, update_tool, delete_tool, list_tools, get_tool. NEVER call file_operation or execute_shell to edit tools.json — use this tool.',
      'Manage Tools'
    )
    this._context = context || {}
    this._dataPath = context?.dataPath || ''
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create_tool', 'update_tool', 'delete_tool', 'list_tools', 'get_tool'],
        },
        tool: {
          type: 'object',
          properties: {
            id:           { type: 'string', description: 'Required for update_tool; ignored on create_tool (derived from name).' },
            name:         { type: 'string', maxLength: 80 },
            description:  { type: 'string', maxLength: 500 },
            category:     { type: 'string' },
            type:         { type: 'string', enum: ['http', 'code', 'prompt', 'smtp'] },
            method:       { type: 'string', description: 'http only' },
            endpoint:     { type: 'string', description: 'http only' },
            headers:      { type: 'object', description: 'http only' },
            bodyTemplate: { type: 'string', description: 'http only' },
            language:     { type: 'string', description: 'code only' },
            code:         { type: 'string', description: 'code only' },
            promptText:   { type: 'string', description: 'prompt only' },
          },
        },
        id:       { type: 'string', description: 'Required for delete_tool / get_tool' },
        type:     { type: 'string', description: 'Optional filter for list_tools' },
        category: { type: 'string', description: 'Optional filter for list_tools' },
      },
      required: ['action'],
    }
  }

  // Disk I/O — direct fs (cannot require dataStore from skill folder)

  _file() {
    if (!this._dataPath) throw new Error('dataPath not injected into skill context')
    return path.join(this._dataPath, 'tools.json')
  }

  _read() {
    const fp = this._file()
    if (!fs.existsSync(fp)) return {}
    try {
      const raw = fs.readFileSync(fp, 'utf8')
      const parsed = JSON.parse(raw)
      // tools.json is a flat dict; if some legacy installs have an array,
      // refuse rather than corrupt — let user surface this.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      throw new Error('tools.json shape unexpected (not an object)')
    } catch (err) {
      throw new Error(`Failed to read tools.json: ${err.message}`)
    }
  }

  _write(dict) {
    const fp = this._file()
    const tmp = fp + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(dict, null, 2), 'utf8')
    fs.renameSync(tmp, fp)
  }

  async execute(toolCallId, input) {
    const action = input?.action
    try {
      switch (action) {
        case 'create_tool': return this._createTool(input.tool)
        case 'update_tool': return this._updateTool(input.tool)
        case 'delete_tool': return this._deleteTool(input.id)
        case 'list_tools':  return this._listTools(input.type, input.category)
        case 'get_tool':    return this._getTool(input.id)
        default: return this._err(`Unknown action: ${action}`)
      }
    } catch (err) {
      return this._err(`Action ${action} failed: ${err.message}`)
    }
  }

  _createTool(toolInput) {
    const err = validateToolInput(toolInput)
    if (err) return this._err(err)
    const dict = this._read()
    const norm = normalizeToolInput(toolInput)
    // Caller-provided id wins (e.g. for predictable ids on import). Otherwise
    // try to derive from name; if that yields empty (CJK-only name, etc.)
    // fall back to a short uuid-suffixed id so the tool still gets created
    // with the user's original Chinese name preserved in the `name` field.
    let id = (toolInput.id || '').trim()
    if (!id) id = deriveToolId(norm.name)
    if (!id) id = fallbackToolId()
    if (id === '__deletedBuiltins') return this._err('Reserved id')
    if (dict[id]) return this._err(`Tool already exists with id "${id}". Use update_tool instead.`)
    dict[id] = norm
    this._write(dict)
    return this._ok(`Created tool: ${formatToolSummary({ ...norm, id })}`, { id, tool: { ...norm, id } })
  }

  _updateTool(toolInput) {
    if (!toolInput?.id) return this._err('tool.id required for update_tool')
    if (toolInput.id === '__deletedBuiltins') return this._err('Cannot edit reserved key')
    const dict = this._read()
    const existing = dict[toolInput.id]
    if (!existing) return this._err(`Tool not found: ${toolInput.id}`)
    // Merge: callers may pass partial fields. Type stays the same unless explicit.
    const merged = { ...existing, ...toolInput }
    delete merged.id // not part of stored value
    const valErr = validateToolInput(merged)
    if (valErr) return this._err(valErr)
    const norm = normalizeToolInput(merged)
    dict[toolInput.id] = norm
    this._write(dict)
    return this._ok(`Updated tool: ${formatToolSummary({ ...norm, id: toolInput.id })}`,
      { id: toolInput.id, tool: { ...norm, id: toolInput.id } })
  }

  _deleteTool(id) {
    if (!id) return this._err('id required for delete_tool')
    if (id === '__deletedBuiltins') return this._err('Cannot delete reserved key')
    const dict = this._read()
    if (!dict[id]) return this._err(`Tool not found: ${id}`)
    const removed = dict[id]
    delete dict[id]
    this._write(dict)
    return this._ok(`Deleted tool: ${formatToolSummary({ ...removed, id })}`, { id, deleted: true })
  }

  _listTools(typeFilter, categoryFilter) {
    const dict = this._read()
    const items = []
    for (const [id, val] of Object.entries(dict)) {
      if (id === '__deletedBuiltins') continue
      if (!val || typeof val !== 'object') continue
      if (typeFilter && val.type !== typeFilter) continue
      if (categoryFilter && val.category !== categoryFilter) continue
      items.push({ ...val, id })
    }
    const summaries = items.map(formatToolSummary)
    return this._ok(
      `Found ${items.length} tool(s):\n${summaries.join('\n')}`,
      { count: items.length, tools: items.map(t => ({ id: t.id, name: t.name, type: t.type, category: t.category })) }
    )
  }

  _getTool(id) {
    if (!id) return this._err('id required for get_tool')
    if (id === '__deletedBuiltins') return this._err('Reserved key')
    const dict = this._read()
    const t = dict[id]
    if (!t) return this._err(`Tool not found: ${id}`)
    return this._ok(formatToolSummary({ ...t, id }), { tool: { ...t, id } })
  }
}

module.exports = {
  ManageToolsJsonTool,
  validateToolInput,
  normalizeToolInput,
  deriveToolId,
  fallbackToolId,
  formatToolSummary,
}
