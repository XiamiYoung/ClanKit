/**
 * ToolRegistry — manages tool definitions and execution.
 *
 * Tools are instantiated lazily: the class map stores constructors (not instances)
 * and tools are only created when their agent is enabled by the user toggle.
 * TodoTool is always available regardless of agent selection.
 */
const { logger } = require('../../logger')
const { TodoTool }    = require('./TodoTool')
const { SoulUpdateTool, SoulReadTool } = require('./SoulTool')

// Map agent IDs → tool class (lazy — not instantiated until enabled)
const TOOL_CLASS_MAP = {
  'code-executor': () => require('./ShellTool').ShellTool,
  'file-manager':  () => require('./FileTool').FileTool,
  'web-search':    () => require('./WebTool').WebTool,
  'git-agent':     () => require('./GitTool').GitTool,
  'data-analyst':  () => require('./DataTool').DataTool,
}

// Core tools that are always available (file + shell operations are essential)
const ALWAYS_ON_AGENTS = ['code-executor', 'file-manager']

// TodoTool is always available (for task planning)
const todoTool = new TodoTool()

// Soul tools are always available (for persona memory)
let soulUpdateTool = null
let soulReadTool = null

function initSoulTools(soulsDir) {
  if (soulsDir && !soulUpdateTool) {
    soulUpdateTool = new SoulUpdateTool(soulsDir)
    soulReadTool = new SoulReadTool(soulsDir)
  }
}

class ToolRegistry {
  constructor(soulsDir) {
    this.tools = new Map()
    // Always register the todo tool
    this.registerTool('todo_manager', todoTool)
    // Always register soul tools if soulsDir is available
    if (soulsDir) {
      initSoulTools(soulsDir)
    }
    if (soulUpdateTool) {
      this.registerTool('update_soul_memory', soulUpdateTool)
      this.registerTool('read_soul_memory', soulReadTool)
    }
    // Always register core tools (shell + file operations)
    this._loadAlwaysOnTools()
  }

  /** Load always-on core tools (shell + file) */
  _loadAlwaysOnTools() {
    for (const agentId of ALWAYS_ON_AGENTS) {
      const factory = TOOL_CLASS_MAP[agentId]
      if (factory && !this.tools.has(agentId)) {
        try {
          const ToolClass = factory()
          const instance = new ToolClass()
          this.registerTool(instance.name, instance)
        } catch (err) {
          logger.error('ToolRegistry: failed to load always-on tool', agentId, err.message)
        }
      }
    }
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
    // Always have soul tools
    if (soulUpdateTool) {
      this.registerTool('update_soul_memory', soulUpdateTool)
      this.registerTool('read_soul_memory', soulReadTool)
    }
    // Always have core tools (shell + file)
    this._loadAlwaysOnTools()

    for (const entry of enabledAgents) {
      const agentId = typeof entry === 'string' ? entry : entry.id
      // Skip if already loaded as always-on
      if (ALWAYS_ON_AGENTS.includes(agentId)) continue
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
