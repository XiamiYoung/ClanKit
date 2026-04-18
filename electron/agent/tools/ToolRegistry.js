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
const { SearchHistoryTool } = require('./SearchHistoryTool')
const { NewsfeedTool } = require('./NewsfeedTool')
const { KnowledgeTool } = require('./KnowledgeTool')
const { WebFetchTool } = require('./WebFetchTool')

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

// NewsfeedTool is always available (singleton; config injected at runtime)
const newsfeedTool = new NewsfeedTool()

// TodoTool is always available (for task planning)
const todoTool = new TodoTool()

// KnowledgeTool is always available (for RAG management)
const knowledgeTool = new KnowledgeTool()

// WebFetchTool is always available (for reading web pages)
const webFetchTool = new WebFetchTool()

// Soul tools are always available (for agent memory)
let soulUpdateTool = null
let soulReadTool = null

function initSoulTools(soulsDir) {
  if (soulsDir && !soulUpdateTool) {
    soulUpdateTool = new SoulUpdateTool(soulsDir)
    soulReadTool = new SoulReadTool(soulsDir)
  }
}

// SearchHistoryTool — keyed by agentId, searches chat history via SQLite FTS5
const searchHistoryToolCache = new Map()

function getSearchHistoryTool(memoryDir, agentId) {
  if (!memoryDir || !agentId) return null
  if (!searchHistoryToolCache.has(agentId)) {
    searchHistoryToolCache.set(agentId, new SearchHistoryTool(memoryDir, agentId))
  }
  return searchHistoryToolCache.get(agentId)
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
    // Always register newsfeed tool
    this.registerTool('fetch_newsfeed', newsfeedTool)
    // Always register knowledge tool (RAG management)
    this.registerTool('knowledge_manage', knowledgeTool)
    // Always register web fetch tool (read web pages)
    this.registerTool('web_fetch', webFetchTool)
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
    // Always have newsfeed tool
    this.registerTool('fetch_newsfeed', newsfeedTool)
    // Always have knowledge tool
    this.registerTool('knowledge_manage', knowledgeTool)
    // Always have web fetch tool
    this.registerTool('web_fetch', webFetchTool)
    // Always have core tools (shell + file)
    this._loadAlwaysOnTools()

    for (const entry of (enabledAgents || [])) {
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
      agents: (enabledAgents || []).map(e => typeof e === 'string' ? e : e.id),
      tools: [...this.tools.keys()]
    })
  }

  registerTool(name, tool) {
    this.tools.set(name, tool)
  }

  /**
   * Set utility model config for soul file compaction.
   * Called by AgentLoop.run() once config is available.
   */
  setSoulCompactionConfig(config) {
    if (soulUpdateTool && config) {
      soulUpdateTool.setCompactionConfig(config)
    }
  }

  /**
   * Inject full runtime config into tools that need it (e.g. NewsfeedTool reads config.newsFeeds).
   * Called by AgentLoop.run() once config is available.
   */
  setRuntimeConfig(config) {
    if (config) {
      newsfeedTool.setConfig(config)
    }
  }

  /**
   * Inject LLM config into AnalyzeAgentTool for parallel analysis.
   * Called by AgentLoop.run() after registerTool('analyze_agent_history', ...).
   */
  setAnalysisConfig(config) {
    const tool = this.tools.get('analyze_agent_history')
    if (tool && typeof tool.setLLMConfig === 'function' && config) {
      tool.setLLMConfig(config)
    }
  }

  /**
   * Register SearchHistoryTool for a specific agent.
   * Called by AgentLoop.run() once systemAgentId is known.
   */
  registerSearchHistoryTool(memoryDir, agentId) {
    if (!memoryDir || !agentId) return
    const tool = getSearchHistoryTool(memoryDir, agentId)
    if (tool) this.registerTool('search_chat_history', tool)
  }

  /** Get tool definitions array for the API request */
  getToolDefinitions() {
    return [...this.tools.values()].map(t => t.definition())
  }

  /**
   * Execute a tool by name.
   * Returns the unified { content, details } result from the tool,
   * or falls back to a plain error object if the tool is not found.
   */
  async execute(toolName, toolInput, toolCallId = '', onUpdate = null, signal = null) {
    const tool = this.tools.get(toolName)
    if (!tool) {
      logger.warn('ToolRegistry: unknown tool', toolName)
      return { content: [{ type: 'text', text: `Error: Unknown tool: ${toolName}` }], details: {}, isError: true }
    }

    logger.agent('ToolRegistry: execute', {
      tool: toolName
    })

    try {
      return await tool.execute(toolCallId, toolInput, signal, onUpdate)
    } catch (err) {
      logger.error('ToolRegistry: execution error', toolName, err.message)
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], details: {}, isError: true }
    }
  }

  /** Get the TodoTool instance for external access */
  getTodoTool() {
    return todoTool
  }
}

module.exports = { ToolRegistry }
