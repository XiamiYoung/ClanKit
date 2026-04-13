/**
 * AnalyzeAgentTool — dedicated deep-analysis tool for analysis chats.
 *
 * Only registered when a chat has type='analysis' and an analysisTargetAgentId.
 * Provides two actions:
 *   - 'stats': returns aggregate statistics + monthly heat map for the whole dataset
 *   - 'messages': returns paginated messages (150/page, chronological) for reading all history
 *
 * This bypasses the topK/group-cap limits in the regular search tool, allowing the
 * LLM to read the entire imported chat history to produce comprehensive analysis.
 *
 * Typical LLM workflow:
 *   1. Call analyze_agent_history(action="stats") → understand scope + heat map
 *   2. Call analyze_agent_history(action="messages", page=1) through all pages
 *   3. Write the analysis as MD or HTML via file_operation
 */
const path = require('path')
const { BaseTool } = require('./BaseTool')
const { logger } = require('../../logger')

class AnalyzeAgentTool extends BaseTool {
  /**
   * @param {string} memoryDir          Root memory directory (DATA_DIR/memory)
   * @param {string} targetAgentId      Agent being analyzed
   * @param {string} targetAgentName    Display name
   * @param {string} targetAgentPrompt  Agent's system prompt (persona definition)
   * @param {string} dataPath           DATA_DIR for building output file paths
   * @param {string} [docPath]          DoCPath override (user-configured aidoc folder)
   */
  constructor(memoryDir, targetAgentId, targetAgentName, targetAgentPrompt, dataPath, docPath) {
    super(
      'analyze_agent_history',
      `Load the complete imported chat history for "${targetAgentName}" to perform deep analysis. ` +
      'Step 1: call with action="stats" to get total message count, date range, monthly activity heat map, and sender breakdown. ' +
      'Step 2: call with action="messages" and page=1,2,3... to read all messages chronologically (150 per page). ' +
      'After reading the data, write a comprehensive analysis report using file_operation. ' +
      'The default output format is Markdown (.md); optionally generate an HTML dashboard.',
      'analyze_agent_history'
    )
    this.memoryDir = memoryDir
    this.targetAgentId = targetAgentId
    this.targetAgentName = targetAgentName
    this.targetAgentPrompt = targetAgentPrompt
    this.dataPath = dataPath
    // Resolve aidoc dir: user-configured DoCPath takes priority over default
    this.aidocPath = docPath || path.join(dataPath || '', 'clank_aidoc')
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['stats', 'messages'],
          description: '"stats": get dataset overview (count, date range, monthly heat map, senders). "messages": load messages by page (150 per page, chronological).',
        },
        page: {
          type: 'integer',
          description: 'For action="messages": which page to load (1-based). Check total_pages from the stats call to know how many pages exist.',
        },
      },
      required: ['action'],
    }
  }

  async execute(toolCallId, params) {
    const { action, page = 1 } = params

    if (!this.targetAgentId) {
      return this._err('No target agent configured for analysis.')
    }

    try {
      const { HistoryIndex } = require('../../memory/HistoryIndex')
      const agentMemoryDir = path.join(this.memoryDir, 'agents')
      const idx = new HistoryIndex(agentMemoryDir)

      if (action === 'stats') {
        const stats = idx.getStats(this.targetAgentId)
        if (!stats) {
          return this._err(`No imported chat history found for "${this.targetAgentName}". The agent needs to have chat history imported first.`)
        }

        // Include agent prompt snippet so LLM can reference the persona definition
        const promptSnippet = this.targetAgentPrompt
          ? this.targetAgentPrompt.slice(0, 500) + (this.targetAgentPrompt.length > 500 ? '...' : '')
          : null

        const result = {
          agent_name: this.targetAgentName,
          agent_prompt_snippet: promptSnippet,
          ...stats,
          instructions: `Total pages: ${stats.total_pages}. Call analyze_agent_history(action="messages", page=N) for each page from 1 to ${stats.total_pages} to read all messages. Then write a comprehensive analysis report using file_operation.`,
          suggested_output_path: path.join(this.aidocPath, `${this.targetAgentName.replace(/\s+/g, '_')}_analysis.md`),
          suggested_html_path: path.join(this.aidocPath, `${this.targetAgentName.replace(/\s+/g, '_')}_dashboard.html`),
        }

        logger.agent('[AnalyzeAgentTool] stats', { agentId: this.targetAgentId, total: stats.total_messages, pages: stats.total_pages })
        return this._ok(JSON.stringify(result, null, 0), { total: stats.total_messages })
      }

      if (action === 'messages') {
        const result = idx.getPagedMessages(this.targetAgentId, page, 150)
        if (!result) {
          return this._err(`No imported chat history found for "${this.targetAgentName}".`)
        }

        logger.agent('[AnalyzeAgentTool] messages', { agentId: this.targetAgentId, page, total_pages: result.total_pages, count: result.messages.length })
        return this._ok(JSON.stringify(result, null, 0), { page, count: result.messages.length })
      }

      return this._err(`Unknown action "${action}". Use "stats" or "messages".`)
    } catch (err) {
      logger.error('[AnalyzeAgentTool] execute error', { agentId: this.targetAgentId, error: err.message })
      return this._err(`Analysis failed: ${err.message}`)
    }
  }
}

module.exports = { AnalyzeAgentTool }
