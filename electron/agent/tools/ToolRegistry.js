/**
 * ToolRegistry — manages tool definitions and execution.
 *
 * Tools are instantiated lazily: the class map stores constructors (not instances)
 * and tools are only created when their agent is enabled by the user toggle.
 * TodoTool is always available regardless of agent selection.
 */
const { logger } = require('../../logger')
const { TodoTool }    = require('./TodoTool')
const { MemoryUpdateTool, MemoryReadTool } = require('./MemoryTool')
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

// Memory tools are always available — they resolve their store at call time
// from dataStore.paths(), so no constructor args needed.
const memoryUpdateTool = new MemoryUpdateTool()
const memoryReadTool   = new MemoryReadTool()

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
  constructor() {
    this.tools = new Map()
    // Always register the todo tool
    this.registerTool('todo_manager', todoTool)
    // Always register memory tools (for agent long-term memory)
    this.registerTool('update_memory', memoryUpdateTool)
    this.registerTool('read_memory', memoryReadTool)
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
   * @param {Array<string>} [excludedToolNames]  Tool names to forcibly exclude,
   *        even from the always-on list (e.g. doc editing drops memory tools).
   */
  loadForAgents(enabledAgents, excludedToolNames = []) {
    this.tools.clear()
    // Always have todo
    this.registerTool('todo_manager', todoTool)
    // Always have memory tools
    this.registerTool('update_memory', memoryUpdateTool)
    this.registerTool('read_memory', memoryReadTool)
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

    // Drop any explicitly-excluded tool names. Runs last so it overrides
    // all prior always-on registrations.
    for (const name of (excludedToolNames || [])) {
      this.tools.delete(name)
    }

    logger.agent('ToolRegistry loaded', {
      agents: (enabledAgents || []).map(e => typeof e === 'string' ? e : e.id),
      tools: [...this.tools.keys()],
      excluded: excludedToolNames || [],
    })
  }

  registerTool(name, tool) {
    this.tools.set(name, tool)
  }

  /**
   * Compaction config setter — kept as a no-op for back-compat with callers
   * that still invoke it. Structured rows + retrieval replaced LLM-driven
   * markdown compaction, so no tool needs this anymore.
   */
  setMemoryCompactionConfig(_config) {
    // intentionally empty
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
