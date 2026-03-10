/**
 * BaseTool — abstract base class for all agent tools.
 *
 * Execute signature is forward-compatible with pi-agent-core's AgentTool:
 *   execute(toolCallId, params, signal, onUpdate)
 *
 * Return format is unified:
 *   { content: [{ type: 'text', text: string }], details: object }
 *
 * Use _ok(text, details) and _err(message, details) helpers in subclasses.
 * ToolRegistry.execute() serializes content[0].text for the LLM.
 */
class BaseTool {
  constructor(name, description, label) {
    this.name = name
    this.description = description
    this.label = label || name
  }

  /** Return the Anthropic tool definition object */
  definition() {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.schema()
    }
  }

  /** Override in subclass: return JSON schema for inputs */
  schema() {
    throw new Error(`${this.constructor.name} must implement schema()`)
  }

  /**
   * Override in subclass.
   * @param {string} toolCallId  - unique ID for this invocation (from the LLM block)
   * @param {object} params      - validated tool input (same as the old `input`)
   * @param {AbortSignal} [signal] - abort signal (optional, for future use)
   * @param {Function} [onUpdate] - streaming progress callback (optional)
   * @returns {Promise<{ content: Array<{type:'text',text:string}>, details: object }>}
   */
  async execute(toolCallId, params, signal, onUpdate) {
    throw new Error(`${this.constructor.name} must implement execute()`)
  }

  /** Build a successful result */
  _ok(text, details = {}) {
    return { content: [{ type: 'text', text: String(text) }], details }
  }

  /** Build an error result */
  _err(message, details = {}) {
    return { content: [{ type: 'text', text: `Error: ${message}` }], details, isError: true }
  }
}

module.exports = { BaseTool }
