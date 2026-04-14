/**
 * AnalyzeAgentTool — dedicated deep-analysis tool for analysis chats.
 *
 * Only registered when a chat has type='analysis' and an analysisTargetAgentId.
 * Provides three actions:
 *   - 'stats': returns aggregate statistics + monthly heat map for the whole dataset
 *   - 'messages': returns paginated messages (150/page, chronological) for reading all history
 *   - 'analyze_all': performs full parallel chunked analysis and returns partial analyses
 *
 * This bypasses the topK/group-cap limits in the regular search tool, allowing the
 * LLM to read the entire imported chat history to produce comprehensive analysis.
 *
 * Typical LLM workflow:
 *   1. Call analyze_agent_history(action="stats") → understand scope + heat map
 *   2. Call analyze_agent_history(action="analyze_all") → get parallel chunked analysis
 *   3. Write the analysis report as MD or HTML via file_operation
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
   * @param {string} [targetAgentType]  'user' or 'system'
   */
  constructor(memoryDir, targetAgentId, targetAgentName, targetAgentPrompt, dataPath, docPath, targetAgentType) {
    const isSelf = targetAgentType === 'user'
    super(
      'analyze_agent_history',
      isSelf
        ? `Load the complete imported chat history to perform deep self-analysis of "Me" (the user). ` +
          'Step 1: call with action="stats" to get total message count, date range, monthly activity heat map, and sender breakdown. ' +
          'Step 2: call with action="analyze_all" to run parallel chunked analysis of all messages. ' +
          'After receiving the analysis results, write a comprehensive self-analysis report using file_operation.'
        : `Load the complete imported chat history for "${targetAgentName}" to perform deep analysis. ` +
          'Step 1: call with action="stats" to get total message count, date range, monthly activity heat map, and sender breakdown. ' +
          'Step 2: call with action="analyze_all" to run parallel chunked analysis of all messages. ' +
          'After receiving the analysis results, write a comprehensive analysis report using file_operation.',
      'analyze_agent_history'
    )
    this.memoryDir = memoryDir
    this.targetAgentId = targetAgentId
    this.targetAgentName = targetAgentName
    this.targetAgentPrompt = targetAgentPrompt
    this.targetAgentType = targetAgentType || 'system'
    this.dataPath = dataPath
    // Resolve aidoc dir: user-configured DoCPath takes priority over default
    this.aidocPath = docPath || path.join(dataPath || '', 'clank_aidoc')
    this.llmConfig = null
  }

  /**
   * Inject LLM config for parallel analysis. Called by ToolRegistry.setAnalysisConfig().
   */
  setLLMConfig(config) {
    this.llmConfig = config
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['stats', 'messages', 'analyze_all'],
          description: '"stats": get dataset overview (count, date range, monthly heat map, senders). ' +
            '"messages": load messages by page (150 per page, chronological). ' +
            '"analyze_all": perform full parallel chunked analysis of all messages (recommended for comprehensive analysis).',
        },
        page: {
          type: 'integer',
          description: 'For action="messages": which page to load (1-based). Check total_pages from the stats call to know how many pages exist.',
        },
      },
      required: ['action'],
    }
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { action, page = 1 } = params
    const isSelf = this.targetAgentType === 'user'

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

        const nameSlug = this.targetAgentName.replace(/\s+/g, '_')
        const result = {
          agent_name: this.targetAgentName,
          analysis_mode: isSelf ? 'self' : 'other',
          agent_prompt_snippet: promptSnippet,
          ...stats,
          instructions: isSelf
            ? `This is a SELF-ANALYSIS of "Me". Total pages: ${stats.total_pages}. ` +
              'Call analyze_agent_history(action="analyze_all") to run parallel chunked analysis of all "Me" messages. ' +
              'Then write a comprehensive self-analysis report using file_operation.'
            : `Total pages: ${stats.total_pages}. ` +
              'Call analyze_agent_history(action="analyze_all") to run parallel chunked analysis of all messages. ' +
              'Then write a comprehensive analysis report using file_operation.',
          suggested_output_path: path.join(this.aidocPath, `${nameSlug}_analysis.md`),
          suggested_html_path: path.join(this.aidocPath, `${nameSlug}_dashboard.html`),
        }

        logger.agent('[AnalyzeAgentTool] stats', { agentId: this.targetAgentId, total: stats.total_messages, pages: stats.total_pages, mode: isSelf ? 'self' : 'other' })
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

      if (action === 'analyze_all') {
        return await this._analyzeAll(idx, onUpdate)
      }

      return this._err(`Unknown action "${action}". Use "stats", "messages", or "analyze_all".`)
    } catch (err) {
      logger.error('[AnalyzeAgentTool] execute error', { agentId: this.targetAgentId, error: err.message })
      return this._err(`Analysis failed: ${err.message}`)
    }
  }

  /**
   * Parallel chunked analysis: read all messages, split into chunks, analyze in parallel.
   */
  async _analyzeAll(idx, onUpdate) {
    if (!this.llmConfig) {
      return this._err('LLM config not available for parallel analysis. Falling back: use action="messages" to read pages manually.')
    }

    const { estimateTokens, getContextWindow, _splitMessageBlock, _callLLM } = require('../chatImport/personaBuilder')

    // 1. Load ALL messages
    const stats = idx.getStats(this.targetAgentId)
    if (!stats) {
      return this._err(`No imported chat history found for "${this.targetAgentName}".`)
    }

    const emit = (text) => {
      if (onUpdate) onUpdate({ type: 'progress', text })
    }

    emit(`Loading ${stats.total_messages} messages...`)
    const allMessages = []
    for (let p = 1; p <= stats.total_pages; p++) {
      const page = idx.getPagedMessages(this.targetAgentId, p, 150)
      if (page?.messages) allMessages.push(...page.messages)
    }

    if (allMessages.length === 0) {
      return this._err('No messages found in imported history.')
    }

    // 2. Detect language
    const language = this._detectLanguage(allMessages)
    const isSelf = this.targetAgentType === 'user'
    const analyzeTarget = isSelf ? 'self' : 'other'

    // 3. Format as text block
    const messageBlock = allMessages
      .map(m => `[${m.time || ''}] ${m.sender}: ${m.content}`)
      .join('\n')

    // 4. Split by token budget
    const um = this.llmConfig.utilityModel
    const ctxWindow = getContextWindow(um?.model, null)
    const chunkBudget = Math.floor((ctxWindow - 4096 - 800) * 0.8)
    const chunks = _splitMessageBlock(messageBlock, Math.max(chunkBudget, 2000))

    logger.agent('[AnalyzeAgentTool] analyze_all', {
      agentId: this.targetAgentId,
      totalMessages: allMessages.length,
      chunks: chunks.length,
      language,
      mode: analyzeTarget,
    })

    emit(`Split into ${chunks.length} chunks. Starting parallel analysis...`)

    // 5. Parallel LLM calls with concurrency limit
    const profile = { name: this.targetAgentName }
    const CONCURRENCY = 3
    const partialAnalyses = []
    let completed = 0

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, Math.min(i + CONCURRENCY, chunks.length))
      const results = await Promise.all(
        batch.map((chunk, j) => {
          const chunkIdx = i + j
          const prompt = this._buildAnalysisChunkPrompt(profile, chunk, chunkIdx, chunks.length, analyzeTarget, language)
          return _callLLM(prompt, this.llmConfig, 4096)
            .then(text => ({ success: true, text }))
            .catch(err => {
              logger.warn('[AnalyzeAgentTool] chunk analysis failed', { chunk: chunkIdx, error: err.message })
              return { success: false }
            })
        })
      )

      for (const r of results) {
        if (r.success && r.text) partialAnalyses.push(r.text)
      }
      completed += batch.length
      emit(`Analyzed ${completed}/${chunks.length} chunks...`)
    }

    if (partialAnalyses.length === 0) {
      return this._err('All chunk analyses returned empty. Try a model with a larger context window.')
    }

    emit('All chunks analyzed. Returning results for final synthesis...')

    const nameSlug = this.targetAgentName.replace(/\s+/g, '_')
    const result = {
      analysis_mode: analyzeTarget,
      partial_analyses: partialAnalyses,
      chunks_analyzed: partialAnalyses.length,
      total_messages: allMessages.length,
      language,
      instructions: isSelf
        ? 'All message chunks have been analyzed in parallel (focusing on "Me" messages). ' +
          'Use the partial analyses above to write a comprehensive SELF-ANALYSIS report. ' +
          'Write the report using file_operation to the suggested path.'
        : 'All message chunks have been analyzed in parallel. ' +
          'Use the partial analyses above to write a comprehensive CHARACTER ANALYSIS report. ' +
          'Write the report using file_operation to the suggested path.',
      suggested_output_path: path.join(this.aidocPath, `${nameSlug}_analysis.md`),
      suggested_html_path: path.join(this.aidocPath, `${nameSlug}_dashboard.html`),
    }

    logger.agent('[AnalyzeAgentTool] analyze_all done', { chunks: partialAnalyses.length, total: allMessages.length })
    return this._ok(JSON.stringify(result, null, 0), { chunks: partialAnalyses.length, total: allMessages.length })
  }

  /**
   * Build a chunk analysis prompt for parallel processing.
   */
  _buildAnalysisChunkPrompt(profile, messageBlock, chunkIdx, totalChunks, analyzeTarget, language) {
    const name = profile.name || 'Unknown'
    const isSelf = analyzeTarget === 'self'
    const zh = language === 'zh'

    const targetDesc = isSelf
      ? (zh ? `分析标记为 "Me" 的消息（第 ${chunkIdx + 1}/${totalChunks} 块），提取自我性格特征。`
           : `Analyze messages from "Me" (chunk ${chunkIdx + 1} of ${totalChunks}). Focus on "Me"'s personality and communication patterns.`)
      : (zh ? `分析 ${name} 的消息（第 ${chunkIdx + 1}/${totalChunks} 块），提取性格特征。`
           : `Analyze messages about ${name} (chunk ${chunkIdx + 1} of ${totalChunks}). Focus on their personality and communication patterns.`)

    const subjectLabel = isSelf ? (zh ? '"Me"' : '"Me"') : (zh ? `"${name}"` : `"${name}"`)
    const lang = zh ? 'Chinese (Simplified)' : 'English'

    return `You are analyzing chat messages for a comprehensive character analysis report.

${targetDesc}

Extract observations about ${subjectLabel} for EACH category. Be specific, quote actual messages when possible. Output in ${lang}.

1. **Personality Traits**: core personality patterns, strengths, weaknesses
2. **MBTI Indicators**: evidence for extraversion/introversion, sensing/intuition, thinking/feeling, judging/perceiving
3. **Communication Style**: tone, vocabulary, emoji usage, message length, formality, humor
4. **Emotional Patterns**: how they express emotions, stress responses, conflict style
5. **Topics & Interests**: recurring topics, expertise areas, things they care about
6. **Notable Quotes**: 3-5 most characteristic messages that capture their personality

Output your observations as structured notes. Do NOT generate a full report — just observations.

---
## MESSAGES (chunk ${chunkIdx + 1}/${totalChunks})
${messageBlock}`
  }

  /**
   * Detect primary language from message content.
   */
  _detectLanguage(messages) {
    const sample = messages.slice(0, 50).map(m => m.content || '').join('')
    let cjk = 0
    for (const ch of sample) {
      const code = ch.codePointAt(0)
      if ((code >= 0x2E80 && code <= 0x9FFF) || (code >= 0xF900 && code <= 0xFAFF)
          || (code >= 0x20000 && code <= 0x2FA1F)) cjk++
    }
    return cjk > sample.length * 0.3 ? 'zh' : 'en'
  }
}

module.exports = { AnalyzeAgentTool }
