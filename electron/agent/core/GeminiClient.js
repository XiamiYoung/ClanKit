/**
 * GeminiClient — wrapper around @google/genai SDK.
 * Interface mirrors AnthropicClient so agentLoop can call it uniformly.
 */
const { GoogleGenAI } = require('@google/genai')
const { logger } = require('../../logger')

class GeminiClient {
  constructor(config) {
    this.config = config
    const apiKey = config.provider?.apiKey || config.apiKey
    if (!apiKey) throw new Error('GeminiClient: apiKey is required')
    this.client = new GoogleGenAI({ apiKey })
    logger.agent('GeminiClient init', { model: this.resolveModel() })
  }

  resolveModel() {
    return this.config.provider?.model || this.config.customModel || 'gemini-2.0-flash-001'
  }

  // Gemini does not use Anthropic-style thinking blocks
  resolveThinkingConfig() { return { thinking: null } }
  markThinkingDowngrade() { return { thinking: null } }
  markUseAdaptiveEffort() { return { thinking: null } }

  getClient() { return this.client }
}

module.exports = { GeminiClient }
