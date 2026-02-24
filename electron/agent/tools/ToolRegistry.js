/**
 * ToolRegistry — manages tool definitions and execution.
 *
 * Tools are instantiated lazily: the class map stores constructors (not instances)
 * and tools are only created when their agent is enabled by the user toggle.
 * TodoTool is always available regardless of agent selection.
 */
const { logger } = require('../../logger')
const { TodoTool }    = require('./TodoTool')

// Map agent IDs → tool class (lazy — not instantiated until enabled)
const TOOL_CLASS_MAP = {
  'code-executor': () => require('./ShellTool').ShellTool,
  'file-manager':  () => require('./FileTool').FileTool,
  'web-search':    () => require('./WebTool').WebTool,
  'git-agent':     () => require('./GitTool').GitTool,
  'data-analyst':  () => require('./DataTool').DataTool,
}

// TodoTool is always available (for task planning)
const todoTool = new TodoTool()

class ToolRegistry {
  constructor() {
    this.tools = new Map()
    // Always register the todo tool
    this.registerTool('todo_manager', todoTool)
  }

  /**
   * Load tools for the given enabled agents.
   *
   * @param {Array<string|{id:string}>} enabledAgents  Either plain IDs or full agent objects
   *        from the store (only agents whose toggle is on are passed here)
   */
  loadForAgents(enabledAgents) {
    this.tools.clear()
    // Always have todo
    this.registerTool('todo_manager', todoTool)

    for (const entry of enabledAgents) {
      const agentId = typeof entry === 'string' ? entry : entry.id
      const factory = TOOL_CLASS_MAP[agentId]
      if (factory) {
        try {
          const ToolClass = factory()
          const instance = new ToolClass()
          this.registerTool(instance.name, instance)
        } catch (err) {
          logger.error('ToolRegistry: failed to load tool for agent', agentId, err.message)
        }
      } else {
        logger.warn('ToolRegistry: no tool class mapped for agent', agentId)
      }
    }

    logger.agent('ToolRegistry loaded', {
      agents: enabledAgents.map(e => typeof e === 'string' ? e : e.id),
      tools: [...this.tools.keys()]
    })
  }

  registerTool(name, tool) {
    this.tools.set(name, tool)
  }

  /** Get tool definitions array for the API request */
  getToolDefinitions() {
    return [...this.tools.values()].map(t => t.definition())
  }

  /** Execute a tool by name */
  async execute(toolName, toolInput) {
    const tool = this.tools.get(toolName)
    if (!tool) {
      logger.warn('ToolRegistry: unknown tool', toolName)
      return { error: `Unknown tool: ${toolName}` }
    }

    logger.agent('ToolRegistry: execute', {
      tool: toolName,
      input: JSON.stringify(toolInput).slice(0, 200)
    })

    try {
      return await tool.execute(toolInput)
    } catch (err) {
      logger.error('ToolRegistry: execution error', toolName, err.message)
      return { error: err.message }
    }
  }

  /** Get the TodoTool instance for external access */
  getTodoTool() {
    return todoTool
  }
}

module.exports = { ToolRegistry }
