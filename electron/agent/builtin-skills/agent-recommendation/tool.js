/**
 * ListAgentsTool — bundled inside the `agent-recommendation` built-in skill.
 *
 * Returns the catalog of installed specialist agents (system type, non-builtin)
 * so Clank can recommend a more specialized counterpart to the user when their
 * question matches another agent's domain. Always returns the full list — let
 * the LLM do semantic matching (substring filtering misses synonyms like
 * 旅游/旅行, travel/vacation, etc.).
 *
 * Lives inside the skill folder rather than electron/agent/tools/ so:
 *   1. It only loads when the skill is enabled (Clank gets all skills by default;
 *      character agents do not get this skill, preserving their immersion).
 *   2. It travels with the skill — bumping the skill manifest version is enough
 *      to roll out an update through ensureBuiltinSkills.
 */
const fs = require('fs')
const path = require('path')

const SKILL_DIR = __dirname

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

class ListAgentsTool extends BaseTool {
  /**
   * @param {object} context — { dataPath, agentId, agentName, agentType, language }
   */
  constructor(context) {
    super(
      'list_agents',
      'List the other AI agents installed in this ClanKit app. Use this when the user\'s question may fit a specialist agent (e.g. travel, fitness, niche professional, in-character roleplay) better than you. Returns each agent\'s id, name, and short description so you can pick one and recommend it via the <recommend-agent/> tag.',
      'List Agents'
    )
    this._context = context || {}
    this._agentsFilePath = context?.dataPath
      ? path.join(context.dataPath, 'agents.json')
      : null
  }

  schema() {
    // No parameters — the tool always returns the full catalog. Substring
    // filtering is the LLM's job; the tool would miss synonyms (旅游/旅行).
    return { type: 'object', properties: {}, required: [] }
  }

  async execute() {
    if (!this._agentsFilePath) return this._err('Agents file path not available in skill context')
    if (!fs.existsSync(this._agentsFilePath)) return this._err('agents.json does not exist')

    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(this._agentsFilePath, 'utf8'))
    } catch (err) {
      return this._err(`Failed to parse agents.json: ${err.message}`)
    }

    // Schema-tolerant: accept the legacy flat array, the {agents:[]} wrapper,
    // and the newer {agents:{categories,items}, personas:{...}} shape.
    let list = []
    if (Array.isArray(parsed)) {
      list = parsed
    } else if (Array.isArray(parsed?.agents)) {
      list = parsed.agents
    } else if (Array.isArray(parsed?.agents?.items)) {
      list = parsed.agents.items
    }

    const items = list
      .filter(a => a && a.id && a.type === 'system')
      // Exclude infrastructure built-ins (Clank itself, doc editor, analyst).
      // The user shouldn't be redirected to them — they aren't "specialists".
      .filter(a => !a.isBuiltin)
      .map(a => ({
        id: a.id,
        name: a.name || '(unnamed)',
        description: (a.description || '').trim(),
      }))

    if (items.length === 0) {
      return this._ok(
        'No specialist agents are installed beyond the built-ins. Answer the user\'s question yourself — do NOT output a <recommend-agent/> tag.',
        { count: 0 }
      )
    }

    const lines = items.map(a => {
      const desc = a.description || '(no description)'
      return `- id: ${a.id}\n  name: ${a.name}\n  description: ${desc}`
    })
    const text = `Installed specialist agents (${items.length}):\n\n${lines.join('\n\n')}\n\n` +
      `If one of these is a clear match for the user's current question (semantic match, not just keyword — "旅游" matches a "旅行" agent, "fitness" matches "健身", etc.), output exactly:\n` +
      `<recommend-agent id="THE_ID_FROM_ABOVE" reason="one short sentence in the user's language explaining why this agent fits"/>\n\n` +
      `Wrap the tag with one or two natural sentences acknowledging the question and naming the agent. Use the user's own language. Only use ids from the list above — never invent ids. If no agent is a strong match, do NOT output a tag — answer the question yourself.`
    return this._ok(text, { count: items.length })
  }
}

module.exports = { ListAgentsTool }
