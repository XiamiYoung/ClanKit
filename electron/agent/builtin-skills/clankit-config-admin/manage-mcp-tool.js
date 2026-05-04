/**
 * ManageMcpTool - LLM-callable wrapper for mcp-servers.json.
 *
 * Schema: array of { id (uuid), name, command, args[], env{}, description }.
 * Secrets must live in env, not args.
 *
 * Action enum:
 *   create_server / update_server / delete_server / list_servers / get_server
 *
 * Skill tools cannot require() project modules — see LESSONS.md "Skill tools
 * cannot require() project modules". BaseTool inlined; host injects dataPath
 * via constructor context. We use plain fs/path against {DATA_DIR}/mcp-servers.json.
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

function validateMcpInput(input) {
  if (!input || typeof input !== 'object') return 'server: object required'
  const name = (input.name || '').trim()
  if (!name) return 'server.name required'
  if (name.length > MAX_NAME_LEN) return `server.name too long (max ${MAX_NAME_LEN})`
  const command = (input.command || '').trim()
  if (!command) return 'server.command required'
  if (input.args != null && !Array.isArray(input.args)) {
    return 'server.args must be an array of strings'
  }
  if (Array.isArray(input.args)) {
    for (const a of input.args) {
      if (typeof a !== 'string') return 'server.args entries must be strings'
    }
  }
  if (input.env != null && (typeof input.env !== 'object' || Array.isArray(input.env))) {
    return 'server.env must be an object of string→string'
  }
  if ((input.description || '').length > MAX_DESC_LEN) {
    return `server.description too long (max ${MAX_DESC_LEN})`
  }
  return null
}

function normalizeMcpInput(input) {
  const env = (input.env && typeof input.env === 'object' && !Array.isArray(input.env))
    ? { ...input.env }
    : {}
  // Stringify env values defensively (env vars must be strings).
  for (const k of Object.keys(env)) {
    if (env[k] != null && typeof env[k] !== 'string') env[k] = String(env[k])
  }
  return {
    name:        (input.name || '').trim(),
    command:     (input.command || '').trim(),
    args:        Array.isArray(input.args) ? input.args.map(a => String(a)) : [],
    env,
    description: (input.description || '').trim(),
  }
}

function formatMcpSummary(s) {
  if (!s) return '(none)'
  return `id=${s.id} | name=${s.name || '(unnamed)'} | command=${s.command || ''}`
}

// Tool class

class ManageMcpTool extends BaseTool {
  constructor(context) {
    super(
      'manage_mcp',
      'Create/update/delete/list MCP (Model Context Protocol) server entries in mcp-servers.json. Each server runs a local subprocess via { command, args[], env{} }. Secrets MUST go in env, not args. Action enum: create_server, update_server, delete_server, list_servers, get_server. NEVER call file_operation or execute_shell to edit mcp-servers.json — use this tool.',
      'Manage MCP'
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
          enum: ['create_server', 'update_server', 'delete_server', 'list_servers', 'get_server'],
        },
        server: {
          type: 'object',
          properties: {
            id:          { type: 'string', description: 'Required for update_server; ignored on create_server' },
            name:        { type: 'string', maxLength: 80 },
            command:     { type: 'string' },
            args:        { type: 'array', items: { type: 'string' } },
            env:         { type: 'object', description: 'Map of env-var name to value (strings). Put secrets here.' },
            description: { type: 'string', maxLength: 500 },
          },
        },
        id: { type: 'string', description: 'Required for delete_server; or for get_server (alternatively use server.name)' },
      },
      required: ['action'],
    }
  }

  // Disk I/O

  _file() {
    if (!this._dataPath) throw new Error('dataPath not injected into skill context')
    return path.join(this._dataPath, 'mcp-servers.json')
  }

  _read() {
    const fp = this._file()
    if (!fs.existsSync(fp)) return []
    try {
      const raw = fs.readFileSync(fp, 'utf8')
      const parsed = JSON.parse(raw)
      // Legacy dict shape: { name: {...} }. We preserve as-is on read but
      // don't write that shape. Dict→array normalization is the renderer's
      // concern (dataNormalizers.normalizeMcpServers).
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed).map(([name, cfg]) => ({
          id: cfg?.id || uuidv4(),
          name,
          command: cfg?.command || '',
          args: Array.isArray(cfg?.args) ? cfg.args : [],
          env: (cfg?.env && typeof cfg.env === 'object') ? cfg.env : {},
          description: cfg?.description || '',
        }))
      }
      return []
    } catch (err) {
      throw new Error(`Failed to read mcp-servers.json: ${err.message}`)
    }
  }

  _write(arr) {
    const fp = this._file()
    const tmp = fp + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf8')
    fs.renameSync(tmp, fp)
  }

  async execute(toolCallId, input) {
    const action = input?.action
    try {
      switch (action) {
        case 'create_server': return this._createServer(input.server)
        case 'update_server': return this._updateServer(input.server)
        case 'delete_server': return this._deleteServer(input.id)
        case 'list_servers':  return this._listServers()
        case 'get_server':    return this._getServer(input.id, input.server?.name)
        default: return this._err(`Unknown action: ${action}`)
      }
    } catch (err) {
      return this._err(`Action ${action} failed: ${err.message}`)
    }
  }

  _createServer(serverInput) {
    const err = validateMcpInput(serverInput)
    if (err) return this._err(err)
    const arr = this._read()
    const norm = normalizeMcpInput(serverInput)
    if (arr.some(s => s.name === norm.name)) {
      return this._err(`MCP server with name "${norm.name}" already exists. Use update_server.`)
    }
    const server = { id: uuidv4(), ...norm }
    arr.push(server)
    this._write(arr)
    return this._ok(`Created MCP server: ${formatMcpSummary(server)}`, { id: server.id, server })
  }

  _updateServer(serverInput) {
    if (!serverInput?.id) return this._err('server.id required for update_server')
    const arr = this._read()
    const idx = arr.findIndex(s => s.id === serverInput.id)
    if (idx === -1) return this._err(`MCP server not found: ${serverInput.id}`)
    const merged = { ...arr[idx], ...serverInput }
    delete merged.id
    const valErr = validateMcpInput(merged)
    if (valErr) return this._err(valErr)
    const norm = normalizeMcpInput(merged)
    arr[idx] = { id: serverInput.id, ...norm }
    this._write(arr)
    return this._ok(`Updated MCP server: ${formatMcpSummary(arr[idx])}`,
      { id: serverInput.id, server: arr[idx] })
  }

  _deleteServer(id) {
    if (!id) return this._err('id required for delete_server')
    const arr = this._read()
    const idx = arr.findIndex(s => s.id === id)
    if (idx === -1) return this._err(`MCP server not found: ${id}`)
    const removed = arr[idx]
    arr.splice(idx, 1)
    this._write(arr)
    return this._ok(`Deleted MCP server: ${formatMcpSummary(removed)}`, { id, deleted: true })
  }

  _listServers() {
    const arr = this._read()
    const summaries = arr.map(formatMcpSummary)
    return this._ok(
      `Found ${arr.length} MCP server(s):\n${summaries.join('\n')}`,
      { count: arr.length, servers: arr.map(s => ({ id: s.id, name: s.name, command: s.command })) }
    )
  }

  _getServer(id, name) {
    const arr = this._read()
    let server = null
    if (id) server = arr.find(s => s.id === id) || null
    if (!server && name) server = arr.find(s => s.name === name) || null
    if (!server) return this._err(`MCP server not found (id=${id || ''} name=${name || ''})`)
    return this._ok(formatMcpSummary(server), { server })
  }
}

module.exports = {
  ManageMcpTool,
  validateMcpInput,
  normalizeMcpInput,
  formatMcpSummary,
}
