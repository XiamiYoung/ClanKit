/**
 * ContextManager — tracks token usage and triggers compaction when needed.
 *
 * Uses the Anthropic beta compaction API (compact-2026-01-12) for Opus 4.6.
 * For other models, falls back to local truncation of older messages.
 *
 * Emits context usage metrics: { inputTokens, outputTokens, totalTokens, maxTokens, percentage }
 */
const { logger } = require('../../logger')

const MAX_CONTEXT_TOKENS = 200_000    // Claude context window
const COMPACT_TRIGGER    = 150_000    // Trigger compaction at 75% of context
const LOCAL_TRIM_TARGET  = 100_000    // After local trim, aim for this many tokens

class ContextManager {
  constructor(anthropicClient) {
    this.anthropicClient = anthropicClient
    this.inputTokens  = 0
    this.outputTokens = 0
    this.cacheCreationInputTokens = 0
    this.cacheReadInputTokens = 0
    this.compactionCount = 0
  }

  /** Update usage from an API response */
  updateUsage(response) {
    if (response.usage) {
      this.inputTokens  = response.usage.input_tokens  || 0
      this.outputTokens = response.usage.output_tokens || 0
      this.cacheCreationInputTokens = response.usage.cache_creation_input_tokens || 0
      this.cacheReadInputTokens     = response.usage.cache_read_input_tokens || 0
    }
  }

  /** Get current context metrics */
  getMetrics() {
    const totalTokens = this.inputTokens + this.outputTokens
    return {
      inputTokens:  this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens,
      maxTokens:    MAX_CONTEXT_TOKENS,
      percentage:   Math.round((this.inputTokens / MAX_CONTEXT_TOKENS) * 100),
      cacheCreationInputTokens: this.cacheCreationInputTokens,
      cacheReadInputTokens:     this.cacheReadInputTokens,
      compactionCount:          this.compactionCount,
    }
  }

  /** Check whether we should compact before the next API call */
  shouldCompact() {
    return this.inputTokens >= COMPACT_TRIGGER
  }

  /** Check whether the context window is nearly exhausted (>90%) */
  isExhausted() {
    return this.inputTokens >= MAX_CONTEXT_TOKENS * 0.9
  }

  /**
   * Build API request parameters with compaction enabled.
   * Returns the params with beta headers and context_management set.
   */
  applyCompaction(params) {
    // Use beta endpoint with compaction
    return {
      ...params,
      betas: [...(params.betas || []), 'compact-2026-01-12'],
      context_management: {
        edits: [{ type: 'compact_20260112' }]
      }
    }
  }

  /**
   * Append assistant response content to messages, preserving compaction blocks.
   * CRITICAL: Must append response.content, not just text, to preserve compaction state.
   */
  appendAssistantContent(messages, responseContent) {
    messages.push({ role: 'assistant', content: responseContent })
  }

  /**
   * Two-stage tool result pruning to reduce context before compaction.
   * Stage 1 (soft trim): large tool results → keep head + tail, remove middle.
   * Stage 2 (hard clear): if still too big → replace old tool results with placeholder.
   * Protects last KEEP_LAST_ASSISTANTS assistant messages from any pruning.
   */
  pruneToolResults(messages) {
    const SOFT_TRIM_THRESHOLD_CHARS = 4000
    const HEAD_CHARS = 1500
    const TAIL_CHARS = 1500
    const HARD_CLEAR_RATIO = 0.5
    const KEEP_LAST_ASSISTANTS = 3
    const CHARS_PER_TOKEN = 4

    if (!messages || messages.length === 0) return messages

    // Find cutoff: protect last N assistant messages
    let assistantCount = 0
    let cutoffIdx = messages.length
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        assistantCount++
        if (assistantCount >= KEEP_LAST_ASSISTANTS) {
          cutoffIdx = i
          break
        }
      }
    }

    const msgs = messages.slice()

    // Stage 1: soft trim large tool results before cutoff
    for (let i = 0; i < cutoffIdx; i++) {
      const msg = msgs[i]
      if (msg.role !== 'tool' && !(msg.role === 'user' && Array.isArray(msg.content))) continue

      // Anthropic tool_result format
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const toolResultBlock = msg.content.find(b => b.type === 'tool_result')
        if (toolResultBlock && typeof toolResultBlock.content === 'string') {
          const content = toolResultBlock.content
          if (content.length > SOFT_TRIM_THRESHOLD_CHARS) {
            const trimmed = content.slice(0, HEAD_CHARS) +
              `\n...\n[Tool result trimmed: kept first ${HEAD_CHARS} and last ${TAIL_CHARS} chars of ${content.length} chars]\n...\n` +
              content.slice(-TAIL_CHARS)
            const newContent = msg.content.map(b =>
              b.type === 'tool_result' ? { ...b, content: trimmed } : b
            )
            msgs[i] = { ...msg, content: newContent }
          }
        }
      }
      // OpenAI tool format
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        const content = msg.content
        if (content.length > SOFT_TRIM_THRESHOLD_CHARS) {
          msgs[i] = { ...msg, content:
            content.slice(0, HEAD_CHARS) +
            `\n...\n[Tool result trimmed: kept first ${HEAD_CHARS} and last ${TAIL_CHARS} chars]\n...\n` +
            content.slice(-TAIL_CHARS)
          }
        }
      }
    }

    // Stage 2: hard clear if total chars still over threshold
    const totalChars = msgs.reduce((sum, m) => sum + JSON.stringify(m).length, 0)
    const maxChars = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN
    if (totalChars / maxChars < HARD_CLEAR_RATIO) return msgs

    for (let i = 0; i < cutoffIdx; i++) {
      const msg = msgs[i]
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const hasToolResult = msg.content.some(b => b.type === 'tool_result')
        if (hasToolResult) {
          msgs[i] = { ...msg, content: msg.content.map(b =>
            b.type === 'tool_result' ? { ...b, content: '[Old tool result cleared]' } : b
          )}
        }
      }
      if (msg.role === 'tool') {
        msgs[i] = { ...msg, content: '[Old tool result cleared]' }
      }
    }

    return msgs
  }

  /**
   * Local truncation for non-Opus models: trim older messages keeping
   * the system context and the last N messages.
   */
  localTrim(messages, estimatedTokens) {
    if (estimatedTokens < COMPACT_TRIGGER) return messages
    if (messages.length <= 4) return messages

    logger.agent('ContextManager: local trim triggered', {
      msgCount: messages.length,
      estimated: estimatedTokens
    })

    // Keep first message (usually the first user message) and last 60% of messages
    const keepCount = Math.max(4, Math.floor(messages.length * 0.6))
    const trimmed = [
      // Insert a summary marker
      { role: 'user', content: '[Earlier conversation was trimmed to fit context window]' },
      { role: 'assistant', content: 'Understood. I have the recent context and will continue from here.' },
      ...messages.slice(-keepCount)
    ]

    logger.agent('ContextManager: trimmed', {
      before: messages.length,
      after: trimmed.length
    })

    return trimmed
  }
}

module.exports = { ContextManager, MAX_CONTEXT_TOKENS, COMPACT_TRIGGER }
