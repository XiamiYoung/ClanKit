/**
 * ManageAgentsTool - LLM-callable wrapper for AgentStore.
 *
 * Action-based dispatch:
 *   - create_agent / update_agent / delete_agent / list_agents / get_agent
 *   - create_category / update_category / delete_category / list_categories
 *
 * The host injects an AgentStore reference via context.agentStore at construction
 * time. This avoids the previous bug where skill tools tried to require()
 * project modules from {DATA_DIR}/skills/... - see LESSONS.md "Skill tools
 * cannot require() project modules".
 *
 * For agents this tool also serves built-in agents (Clank, DocMaster, Analyst).
 * Built-in agents have isBuiltin=true and the UI hides their delete button -
 * this tool follows the same convention but allows update for property tweaks.
 *
 * This file lives in the skill folder (not electron/agent/tools/) because skill
 * tools are deployed to {DATA_DIR}/skills/ at runtime, where they cannot
 * require() project modules. BaseTool is inlined below for the same reason.
 */
// Skill tools live at {DATA_DIR}/skills/... and cannot require() npm packages —
// the user data folder is outside the app's node_modules tree. Use Node core
// crypto.randomUUID() (RFC 4122 v4, available since Node 14.17 / 16) instead
// of the `uuid` package.
const { randomUUID: uuidv4 } = require('crypto')

// Self-contained base — skill tools run from AppData and cannot import project
// modules (the user's skills directory is outside our source tree).
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

const MAX_NAME_LEN     = 50
const MAX_DESC_LEN     = 200
const MAX_TOOLS        = 50    // soft cap, tool warns but doesn't block
const MAX_SKILLS       = 100
const MAX_MCP_SERVERS  = 20

// Pure helpers (unit-testable)

/**
 * Returns null if valid, otherwise an error message string.
 *
 * Note: missing/invalid type is NOT rejected here. normalizeAgentInput
 * defaults it to 'system' (the common case — a 数字人 / digital persona
 * the user chats with). Only an explicit non-system, non-user value is
 * rejected. Disambiguation between system (数字人) and user (用户画像 /
 * user persona) is handled at the prompt-engineering layer (system prompt
 * + skill + tool description) rather than as a hard tool reject.
 */
function validateAgentInput(input) {
  if (!input || typeof input !== 'object') return 'agent: object required'
  if (input.type != null && input.type !== '' && input.type !== 'system' && input.type !== 'user') {
    return `agent.type must be 'system' or 'user' (got ${JSON.stringify(input.type)})`
  }
  const name = (input.name || '').trim()
  if (!name) return 'agent.name required'
  if (name.length > MAX_NAME_LEN) return `agent.name too long (max ${MAX_NAME_LEN})`
  // For system agents (default), provider+model are required.
  const effectiveType = input.type || 'system'
  if (effectiveType === 'system') {
    if (!input.providerId) return 'agent.providerId required for system agents'
    if (!input.modelId) return 'agent.modelId required for system agents'
  }
  // prompt is recommended but not strictly required (some user personas omit it)
  return null
}

/**
 * Returns the agent input with defaults filled in. Does NOT generate an id.
 * Default `type` is 'system' — the LLM should explicitly pass 'user' only
 * when the user asked for a user persona (someone representing the human
 * user themselves, not an AI assistant the user chats with).
 */
function normalizeAgentInput(input) {
  return {
    type: input.type === 'user' ? 'user' : 'system',
    name: (input.name || '').trim(),
    description: (input.description || '').trim(),
    prompt: input.prompt || '',
    avatar: input.avatar || null,
    providerId: input.providerId || null,
    modelId: input.modelId || null,
    voiceId: input.voiceId || null,
    isDefault: input.isDefault === true,
    isBuiltin: input.isBuiltin === true,
    categoryIds: Array.isArray(input.categoryIds) ? input.categoryIds : [],
    requiredToolIds: Array.isArray(input.requiredToolIds) ? input.requiredToolIds : [],
    requiredSkillIds: Array.isArray(input.requiredSkillIds) ? input.requiredSkillIds : [],
    requiredMcpServerIds: Array.isArray(input.requiredMcpServerIds) ? input.requiredMcpServerIds : [],
    requiredKnowledgeBaseIds: Array.isArray(input.requiredKnowledgeBaseIds) ? input.requiredKnowledgeBaseIds : [],
  }
}

function validateCategoryInput(input) {
  if (!input || typeof input !== 'object') return 'category: object required'
  if (input.type !== 'system' && input.type !== 'user') {
    return `category.type must be 'system' or 'user'`
  }
  const name = (input.name || '').trim()
  if (!name) return 'category.name required'
  if (name.length > 40) return 'category.name too long (max 40)'
  return null
}

function normalizeCategoryInput(input) {
  return {
    type: input.type,
    name: (input.name || '').trim(),
    emoji: input.emoji || '📁',
    sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : 0,
  }
}

function formatAgentSummary(a) {
  if (!a) return '(none)'
  // description is capped at 200 chars at the schema level — show it in full
  // so the LLM doesn't mistake a slice cutoff for a tool-side truncation.
  return `id=${a.id} | name=${a.name || '(unnamed)'} | type=${a.type} | desc=${a.description || ''}`
}

/**
 * Verbose text rendering for a single agent. Used by get_agent when the caller
 * wants to read the full prompt body (e.g. to tune tone / phrasing) — the
 * summary line alone is not enough since `prompt` was never exposed to the
 * LLM via formatAgentSummary or via details (stripHeavyFields removes it).
 */
function formatAgentDetail(a) {
  if (!a) return '(none)'
  const lines = [
    `id: ${a.id}`,
    `name: ${a.name || '(unnamed)'}`,
    `type: ${a.type}`,
    `description: ${a.description || ''}`,
    `providerId: ${a.providerId || '(none)'}`,
    `modelId: ${a.modelId || '(none)'}`,
    `voiceId: ${a.voiceId || '(none)'}`,
    `isDefault: ${!!a.isDefault}`,
    `isBuiltin: ${!!a.isBuiltin}`,
    `categoryIds: ${JSON.stringify(a.categoryIds || [])}`,
    `requiredToolIds: ${JSON.stringify(a.requiredToolIds || [])}`,
    `requiredSkillIds: ${JSON.stringify(a.requiredSkillIds || [])}`,
    `requiredMcpServerIds: ${JSON.stringify(a.requiredMcpServerIds || [])}`,
    `requiredKnowledgeBaseIds: ${JSON.stringify(a.requiredKnowledgeBaseIds || [])}`,
    '',
    '--- prompt ---',
    a.prompt || '(empty)',
  ]
  return lines.join('\n')
}

/**
 * Strip heavy fields (`avatar` base64 PNG, `prompt` body) before stuffing an
 * agent into a tool-result `details` payload. The text part of the result
 * (formatAgentSummary) already carries id/name/type/desc — the structured
 * details are for UI inspection, not LLM context, and dragging the full
 * base64 avatar through IPC + into tool_result segments bloats persisted
 * chats and renderer memory.
 */
function stripHeavyFields(a) {
  if (!a) return a
  const { avatar, prompt, ...rest } = a
  return rest
}

/**
 * Auto-fill providerId/modelId for system-type agents from `config.utilityModel`.
 * Pure function — caller passes the parsed config object. Returns a NEW input
 * object with defaults applied; does not mutate. No-op for user personas (no
 * provider/model needed) or when caller explicitly provided both fields.
 */
function autoFillProviderModel(agentInput, config) {
  const effectiveType = agentInput?.type === 'user' ? 'user' : 'system'
  if (effectiveType !== 'system') return agentInput
  if (agentInput?.providerId && agentInput?.modelId) return agentInput
  const um = config?.utilityModel || {}
  const out = { ...agentInput }
  if (!out.providerId && um.provider) out.providerId = um.provider
  if (!out.modelId && um.model) out.modelId = um.model
  return out
}

// Tool class

class ManageAgentsTool extends BaseTool {
  constructor(context) {
    super(
      'manage_agents',
      // Tool description for the LLM. Keep concise but cover all actions -
      // the LLM picks an action enum based on intent.
      'Create/update/delete/list ClanKit "数字人" (digital personas) and "用户画像" (user personas), plus their categories. TERMINOLOGY: in ClanKit, type="system" means a "数字人 / 系统数字人 / 系统智能体" — an AI persona the user chats with or @-mentions (translator, code reviewer, travel guide, any specialist). type="user" means a "用户画像 / 用户智能体 / user persona" — an entity representing the human user themselves. When the user just says "智能体 / agent / assistant" without qualifier, they mean 数字人 — use type="system". Only use type="user" when the user explicitly says "用户画像 / 用户智能体 / user persona / a persona for me / represent me". Default to system. type is immutable after creation. Action enum: create_agent, update_agent, delete_agent, list_agents, get_agent, create_category, update_category, delete_category, list_categories. Persisted to SQLite — never call file_operation, execute_shell, or sqlite3 for agent data. When you need to READ or TUNE an existing agent\'s prompt (e.g. user asks to adjust tone, phrasing, behavior), call get_agent with includeFullBody:true — the default summary does NOT contain the prompt body, so editing without includeFullBody risks overwriting work blindly.',
      'Manage Agents'
    )
    this._context = context || {}
    this._agentStore = context?.agentStore || null
    // Optional: host-injected callback that regenerates a user persona's
    // identity card via the LLM utility model. Called after create / update
    // of a type='user' agent so the card stays in sync with the prompt.
    // Skill tools cannot require() project modules from {DATA_DIR}/skills/,
    // so the host must wire this when constructing skillCtx.
    this._regenerateIdentityCard = context?.regenerateIdentityCard || null
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create_agent', 'update_agent', 'delete_agent', 'list_agents', 'get_agent',
            'create_category', 'update_category', 'delete_category', 'list_categories',
          ],
        },
        // Agent payload - required for create_agent/update_agent
        agent: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Required for update_agent; ignored on create_agent' },
            type: { type: 'string', enum: ['system', 'user'] },
            name: { type: 'string', maxLength: 50 },
            description: { type: 'string', maxLength: 200 },
            prompt: { type: 'string' },
            avatar: { type: 'string' },
            providerId: { type: 'string' },
            modelId: { type: 'string' },
            voiceId: { type: 'string' },
            isDefault: { type: 'boolean' },
            requiredToolIds:          { type: 'array', items: { type: 'string' } },
            requiredSkillIds:         { type: 'array', items: { type: 'string' } },
            requiredMcpServerIds:     { type: 'array', items: { type: 'string' } },
            requiredKnowledgeBaseIds: { type: 'array', items: { type: 'string' } },
            categoryIds:              { type: 'array', items: { type: 'string' } },
          },
        },
        // Category payload - required for create_category/update_category
        category: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Required for update_category' },
            type: { type: 'string', enum: ['system', 'user'] },
            name: { type: 'string', maxLength: 40 },
            emoji: { type: 'string' },
            sortOrder: { type: 'number' },
          },
        },
        // ID payload - required for delete_*, get_agent
        id: { type: 'string' },
        // Filter for list_agents / list_categories
        kind: { type: 'string', enum: ['system', 'user'], description: 'Optional filter; default returns both' },
        // get_agent only: when true, returns the full prompt body and all
        // configuration fields. Default is a short summary line. Use this
        // when you need to read or tune the agent's existing prompt.
        includeFullBody: { type: 'boolean', description: 'get_agent only: include full prompt body and all fields. Default false (summary line only).' },
      },
      required: ['action'],
    }
  }

  async execute(toolCallId, input) {
    if (!this._agentStore) {
      return this._err('AgentStore not available - host did not inject context.agentStore')
    }
    const action = input?.action
    try {
      switch (action) {
        case 'create_agent':    return await this._createAgent(input.agent)
        case 'update_agent':    return await this._updateAgent(input.agent)
        case 'delete_agent':    return this._deleteAgent(input.id)
        case 'list_agents':     return this._listAgents(input.kind)
        case 'get_agent':       return this._getAgent(input.id, input.includeFullBody === true)
        case 'create_category': return this._createCategory(input.category)
        case 'update_category': return this._updateCategory(input.category)
        case 'delete_category': return this._deleteCategory(input.id)
        case 'list_categories': return this._listCategories(input.kind)
        default: return this._err(`Unknown action: ${action}`)
      }
    } catch (err) {
      return this._err(`Action ${action} failed: ${err.message}`)
    }
  }

  // Agent actions

  async _createAgent(agentInput) {
    // Auto-fill provider/model defaults from config.utilityModel for system
    // agents when the caller omitted them. Eliminates the prior workflow gap
    // where the LLM had to file_operation read config.json before this call.
    //
    // Skill tools cannot require() the project's dataStore — the host injects
    // a getConfig() function via context. Best-effort: if it isn't there or
    // throws, validateAgentInput will catch the missing provider/model below.
    let filled = agentInput
    try {
      const cfg = (typeof this._context?.getConfig === 'function')
        ? (this._context.getConfig() || {})
        : {}
      filled = autoFillProviderModel(agentInput, cfg)
    } catch (err) {
      // Best-effort. Validation below catches missing provider/model.
    }
    const err = validateAgentInput(filled)
    if (err) return this._err(err)
    const agent = { ...normalizeAgentInput(filled), id: uuidv4(), createdAt: Date.now(), updatedAt: Date.now() }
    this._agentStore.saveAgent(agent)
    // For user personas, kick off identity-card generation so speaking
    // agents get a fact-only summary rather than verbatim user prompt.
    // Best-effort: failures are logged inside the callback and do not
    // block the create_agent response.
    if (agent.type === 'user' && this._regenerateIdentityCard) {
      try { await this._regenerateIdentityCard(agent.id) } catch (_) {}
    }
    return this._ok(`Created agent: ${formatAgentSummary(agent)}`, { id: agent.id, agent: stripHeavyFields(agent) })
  }

  async _updateAgent(agentInput) {
    if (!agentInput?.id) return this._err('agent.id required for update_agent')
    const existing = this._agentStore.getById(agentInput.id)
    if (!existing) return this._err(`Agent not found: ${agentInput.id}`)
    // Merge: caller may send only the fields they want changed.
    const merged = {
      ...existing,
      ...normalizeAgentInput({ ...existing, ...agentInput }),
      id: existing.id,
      type: existing.type, // type is immutable post-create
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      isBuiltin: existing.isBuiltin, // immutable
    }
    const err = validateAgentInput(merged)
    if (err) return this._err(err)
    this._agentStore.saveAgent(merged)
    // Regenerate the identity card when a user persona's prompt changed.
    // For other field-only edits (e.g. avatar), skipping is fine — the
    // existing card is still accurate for fact lookup.
    const promptChanged = (merged.type === 'user') && ((existing.prompt || '') !== (merged.prompt || ''))
    if (promptChanged && this._regenerateIdentityCard) {
      try { await this._regenerateIdentityCard(merged.id) } catch (_) {}
    }
    return this._ok(`Updated agent: ${formatAgentSummary(merged)}`, { id: merged.id, agent: stripHeavyFields(merged) })
  }

  _deleteAgent(id) {
    if (!id) return this._err('id required for delete_agent')
    const existing = this._agentStore.getById(id)
    if (!existing) return this._err(`Agent not found: ${id}`)
    if (existing.isBuiltin) {
      return this._err(`Cannot delete built-in agent "${existing.name}". Built-in agents (Clank, DocMaster, Analyst) cannot be removed.`)
    }
    this._agentStore.deleteAgent(id)
    return this._ok(`Deleted agent: ${formatAgentSummary(existing)}`, { id, deleted: true })
  }

  _listAgents(kind) {
    let agents
    if (kind === 'system' || kind === 'user') {
      agents = this._agentStore.getByKind(kind)
    } else {
      agents = this._agentStore.getAll()
    }
    const summaries = agents.map(formatAgentSummary)
    return this._ok(
      `Found ${agents.length} agent(s):\n${summaries.join('\n')}`,
      { count: agents.length, agents: agents.map(a => ({ id: a.id, name: a.name, type: a.type, isBuiltin: a.isBuiltin })) }
    )
  }

  _getAgent(id, includeFullBody) {
    if (!id) return this._err('id required for get_agent')
    const a = this._agentStore.getById(id)
    if (!a) return this._err(`Agent not found: ${id}`)
    const text = includeFullBody ? formatAgentDetail(a) : formatAgentSummary(a)
    return this._ok(text, { agent: stripHeavyFields(a) })
  }

  // Category actions

  _createCategory(catInput) {
    const err = validateCategoryInput(catInput)
    if (err) return this._err(err)
    const cat = { ...normalizeCategoryInput(catInput), id: uuidv4() }
    this._agentStore.saveCategory(cat)
    return this._ok(`Created ${cat.type} category: ${cat.emoji} ${cat.name}`, { id: cat.id, category: cat })
  }

  _updateCategory(catInput) {
    if (!catInput?.id) return this._err('category.id required for update_category')
    const merged = { ...normalizeCategoryInput(catInput), id: catInput.id }
    const err = validateCategoryInput(merged)
    if (err) return this._err(err)
    this._agentStore.saveCategory(merged)
    return this._ok(`Updated category: ${merged.emoji} ${merged.name}`, { id: merged.id, category: merged })
  }

  _deleteCategory(id) {
    if (!id) return this._err('id required for delete_category')
    this._agentStore.deleteCategory(id)
    return this._ok(`Deleted category ${id}`, { id, deleted: true })
  }

  _listCategories(kind) {
    if (!kind) {
      const sys = this._agentStore.getCategoriesByKind('system')
      const usr = this._agentStore.getCategoriesByKind('user')
      const all = [...sys, ...usr]
      return this._ok(
        `${all.length} categories total (${sys.length} system, ${usr.length} user)`,
        { categories: all }
      )
    }
    const cats = this._agentStore.getCategoriesByKind(kind)
    return this._ok(`${cats.length} ${kind} categories`, { categories: cats })
  }
}

module.exports = {
  ManageAgentsTool,
  // Pure helpers exported for unit testing
  validateAgentInput,
  normalizeAgentInput,
  validateCategoryInput,
  normalizeCategoryInput,
  formatAgentSummary,
  formatAgentDetail,
  autoFillProviderModel,
  stripHeavyFields,
}
