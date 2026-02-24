/**
 * BaseTool — abstract base class for all agent tools.
 * Every tool must implement `definition()` and `execute(input)`.
 */
class BaseTool {
  constructor(name, description) {
    this.name = name
    this.description = description
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

  /** Override in subclass: execute the tool with given input */
  async execute(_input) {
    throw new Error(`${this.constructor.name} must implement execute()`)
  }
}

module.exports = { BaseTool }
