/**
 * AgentLoop — enterprise-grade agentic loop using the Anthropic SDK.
 *
 * Features:
 *  - Streaming responses with real-time text + thinking deltas
 *  - Adaptive thinking (Opus 4.6) or budget-based thinking (older models)
 *  - Tool use with automatic dispatch and result handling
 *  - Sub-agent delegation for parallel/focused subtasks
 *  - Background task management
 *  - Context window tracking with compaction (Opus 4.6 beta)
 *  - Todo manager for complex multi-step task planning
 *  - Skill system for domain-specific system prompts
 */
const { logger } = require('../logger')
const { AnthropicClient }  = require('./core/AnthropicClient')
const { ContextManager }   = require('./core/ContextManager')
const { ToolRegistry }     = require('./tools/ToolRegistry')
const { SubAgentManager }  = require('./managers/SubAgentManager')
const { TaskManager }      = require('./managers/TaskManager')

// No hardcoded skill prompts — they arrive dynamically from the UI store

class AgentLoop {
  constructor(config) {
    this.config = config
    this.stopped = false

    // Core components
    this.anthropicClient = new AnthropicClient(config)
    this.contextManager  = new ContextManager(this.anthropicClient)
    this.toolRegistry    = new ToolRegistry()
    this.subAgentManager = new SubAgentManager(this.anthropicClient, this.toolRegistry)
    this.taskManager     = new TaskManager()
    this.contextSnapshot = null

    logger.agent('AgentLoop init', { model: this.anthropicClient.resolveModel() })
  }

  stop() {
    this.stopped = true
  }

  requestCompaction() {
    this._compactionRequested = true
  }

  getContextSnapshot() {
    return this.contextSnapshot
  }

  /**
   * Standalone compaction — makes one API call with compaction enabled
   * to compress the conversation history. Works when the agent loop is NOT running.
   * For Opus 4.6: uses the beta compaction API.
   * For other models: falls back to local message trimming.
   */
  async compactStandalone(messages, enabledAgents, enabledSkills, onChunk, personaPrompts) {
    this.toolRegistry.loadForAgents(enabledAgents)

    this.skillPrompts = new Map()
    for (const skill of enabledSkills || []) {
      if (typeof skill !== 'string' && skill.systemPrompt) {
        this.skillPrompts.set(skill.id, skill.systemPrompt)
      }
    }

    const systemPrompt = this.buildSystemPrompt(enabledAgents, enabledSkills, personaPrompts)
    const conversationMessages = [
      ...messages,
      { role: 'user', content: '[System: Context compaction requested. Summarize our conversation so far in 2-3 sentences, then continue as normal.]' }
    ]

    const client = this.anthropicClient.getClient()
    const model  = this.anthropicClient.resolveModel()
    const isOpus46 = this.anthropicClient.isOpus46()

    // Non-Opus: local trim
    if (!isOpus46) {
      const estimatedTokens = JSON.stringify(conversationMessages).length / 4
      const trimmed = this.contextManager.localTrim(conversationMessages, estimatedTokens)
      this.contextManager.compactionCount++
      const metrics = this.contextManager.getMetrics()
      onChunk({ type: 'context_update', metrics })
      return { assistantContent: '[Older messages trimmed to fit context window]', metrics }
    }

    // Opus 4.6: API compaction
    let createParams = {
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: conversationMessages,
    }

    createParams = this.contextManager.applyCompaction(createParams)
    this.contextManager.compactionCount++

    logger.agent('Standalone compaction', { model, msgCount: messages.length })

    let response
    if (createParams.betas && createParams.betas.length > 0) {
      const { betas, ...restParams } = createParams
      response = await client.beta.messages.create({ ...restParams, betas })
    } else {
      response = await client.messages.create(createParams)
    }

    this.contextManager.updateUsage(response)
    const metrics = this.contextManager.getMetrics()
    onChunk({ type: 'context_update', metrics })

    const textContent = response.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('') || ''

    logger.agent('Standalone compaction done', { inputTokens: metrics.inputTokens, responseLen: textContent.length })

    return { assistantContent: textContent, metrics }
  }

  /**
   * Build the system prompt from base + enabled agents + enabled skills.
   *
   * @param {Array<{id:string, name:string, description?:string}>} enabledAgents
   *        Agent objects toggled on by the user
   * @param {Array<string|{id:string, name:string, systemPrompt?:string}>} enabledSkills
   *        Either plain skill IDs (legacy) or full skill objects with systemPrompt
   */
  buildSystemPrompt(enabledAgents, enabledSkills, { systemPersonaPrompt, userPersonaPrompt } = {}) {
    let system = `You are SparkAI, a powerful AI assistant running in a desktop application.
You help users with coding, analysis, file management, system tasks, and general knowledge.

CORE TOOLS (always available):
- todo_manager: Plan complex tasks with structured todo lists
- dispatch_subagent: Delegate focused subtasks to specialized sub-agents
- background_task: Run long operations in the background`

    // List active agents/tools
    const agentEntries = (enabledAgents || []).map(a => {
      const name = typeof a === 'string' ? a : a.name
      const desc = typeof a === 'string' ? '' : (a.description || '')
      return desc ? `- ${name}: ${desc}` : `- ${name}`
    })

    if (agentEntries.length > 0) {
      system += `\n\nACTIVE AGENTS (enabled by user):
${agentEntries.join('\n')}`
    } else {
      system += `\n\nACTIVE AGENTS: None enabled. Only core tools are available.`
    }

    // List active skills — frontier only (name + summary).
    // Full skill content is loaded on demand via the load_skill tool.
    const skillEntries = (enabledSkills || [])
      .filter(s => typeof s !== 'string' && s.name)
      .map(s => {
        const summary = s.summary ? `: ${s.summary}` : ''
        return `- ${s.name} (id: ${s.id})${summary}`
      })

    if (skillEntries.length > 0) {
      system += `\n\nACTIVE SKILLS (enabled by user):
${skillEntries.join('\n')}

To use a skill's full instructions, call the load_skill tool with the skill's id.
Load a skill when the user's request clearly matches its description.`
    } else {
      system += `\n\nACTIVE SKILLS: None enabled.`
    }

    system += `\n\nGUIDELINES:
- Be concise and precise. Explain your reasoning when using tools.
- For complex multi-step tasks, ALWAYS create a todo list first using todo_manager.
- When a subtask is independent and focused, delegate it to a sub-agent.
- For long-running commands (builds, test suites), use background_task.
- When asked about your capabilities or tools, report ONLY the agents and skills listed above as active.
- Always report progress on large tasks.`

    // Append persona context if provided
    if (systemPersonaPrompt) {
      system += `\n\n## SYSTEM PERSONA\n${systemPersonaPrompt}`
    }
    if (userPersonaPrompt) {
      system += `\n\n## USER CONTEXT\n${userPersonaPrompt}`
    }

    return system
  }

  /**
   * Build conversation messages, transforming the last user message's
   * attachments into Anthropic multimodal content blocks.
   *
   * @param {Array} messages           Plain [{role, content}] messages
   * @param {Array|undefined} currentAttachments  Attachment objects from the UI
   * @returns {Array} Messages with the last user message potentially multimodal
   */
  _buildConversationMessages(messages, currentAttachments) {
    const msgs = [...messages]
    if (!currentAttachments || currentAttachments.length === 0) return msgs

    // Find the last user message
    let lastUserIdx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return msgs

    const userMsg = msgs[lastUserIdx]
    const contentBlocks = []

    // Add attachment content blocks before the user's text
    for (const att of currentAttachments) {
      if (att.type === 'image' && att.base64 && att.mediaType) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: att.mediaType, data: att.base64 }
        })
      } else if (att.type === 'text' && att.content) {
        contentBlocks.push({
          type: 'text',
          text: `--- Attached file: ${att.name} (${att.path}) ---\n${att.content}\n--- End of ${att.name} ---`
        })
      } else if (att.type === 'folder') {
        contentBlocks.push({
          type: 'text',
          text: `[Attached folder: ${att.path}] The user attached this folder for context. ${att.preview || ''}`
        })
      }
    }

    // Add the original user text
    const textContent = typeof userMsg.content === 'string' ? userMsg.content : ''
    if (textContent) {
      contentBlocks.push({ type: 'text', text: textContent })
    }

    msgs[lastUserIdx] = { role: 'user', content: contentBlocks }
    return msgs
  }

  /**
   * Main entry point — runs the agentic loop.
   *
   * @param {Array}    messages       Conversation messages [{role, content}]
   * @param {Array<{id:string, name:string}>} enabledAgents  Agent objects toggled on by user
   * @param {Array<{id:string, name:string, systemPrompt:string}>} enabledSkills  Skill objects toggled on by user
   * @param {Function} onChunk        Callback for streaming events
   * @param {Array|undefined} currentAttachments  File attachments for current message
   * @param {{systemPersonaPrompt?:string, userPersonaPrompt?:string}} personaPrompts  Persona prompt texts
   * @returns {string} Final text output
   */
  async run(messages, enabledAgents, enabledSkills, onChunk, currentAttachments, personaPrompts) {
    // Load tools for enabled agents
    this.toolRegistry.loadForAgents(enabledAgents)

    // Store full skill prompts for lazy loading via load_skill tool
    this.skillPrompts = new Map()
    for (const skill of enabledSkills || []) {
      if (typeof skill !== 'string' && skill.systemPrompt) {
        this.skillPrompts.set(skill.id, skill.systemPrompt)
      }
    }

    const systemPrompt = this.buildSystemPrompt(enabledAgents, enabledSkills, personaPrompts)
    const conversationMessages = this._buildConversationMessages(messages, currentAttachments)
    let finalText = ''

    // Gather all tool definitions: registry + subagent + background tasks
    const allTools = [
      ...this.toolRegistry.getToolDefinitions(),
      this.subAgentManager.getToolDefinition(),
      this.taskManager.getToolDefinition()
    ]

    // Add load_skill tool when skills are available
    if (this.skillPrompts.size > 0) {
      allTools.push({
        name: 'load_skill',
        description: 'Load the full instructions for an active skill. Call this when the user\'s request is related to a skill listed in ACTIVE SKILLS. Returns the complete skill guide.',
        input_schema: {
          type: 'object',
          properties: {
            skill_id: {
              type: 'string',
              description: 'The ID of the skill to load (from the ACTIVE SKILLS list)'
            }
          },
          required: ['skill_id']
        }
      })
    }

    const client = this.anthropicClient.getClient()
    const model  = this.anthropicClient.resolveModel()
    const isOpus46 = this.anthropicClient.isOpus46()
    const supportsThinking = this.anthropicClient.supportsThinking()

    // Emit initial context metrics
    onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

    try {
      let iteration = 0
      // Safety limit — high enough that the context window (tracked by
      // ContextManager) is the *real* boundary, not this counter.
      // Claude Code uses no hard cap in interactive mode; the loop runs
      // until the model emits end_turn.  We keep a generous upper bound
      // only as a last-resort safeguard against infinite loops.
      const MAX_ITERATIONS = 200

      while (!this.stopped && iteration < MAX_ITERATIONS) {
        iteration++

        // ── Build request params ──
        const createParams = {
          model,
          max_tokens: 16384,
          system: systemPrompt,
          messages: conversationMessages,
          stream: true,
        }

        if (allTools.length > 0) {
          createParams.tools = allTools
        }

        // ── Snapshot context for inspector ──
        this.contextSnapshot = {
          systemPrompt,
          personas: {
            systemPersonaPrompt: personaPrompts?.systemPersonaPrompt || null,
            userPersonaPrompt: personaPrompts?.userPersonaPrompt || null,
          },
          messages: conversationMessages.map(m => {
            const raw = Array.isArray(m.content)
              ? m.content.map(b => b.text || `[${b.type}]`).join(' ')
              : (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
            return {
              role: m.role,
              contentPreview: raw.slice(0, 200),
              contentLength: raw.length,
              fullContent: raw
            }
          }),
          tools: allTools.map(t => ({ name: t.name, description: t.description || '' })),
          model,
          metrics: this.contextManager.getMetrics()
        }

        // ── Thinking configuration ──
        if (isOpus46) {
          createParams.thinking = { type: 'adaptive' }
        } else if (supportsThinking) {
          createParams.thinking = { type: 'enabled', budget_tokens: 8192 }
          // budget_tokens must be < max_tokens
          createParams.max_tokens = Math.max(createParams.max_tokens, 8192 + 1024)
        }

        // ── Context-exhaustion check ──
        // If we're above 90% of the context window even after previous
        // compaction attempts, stop gracefully rather than hitting an API error.
        if (this.contextManager.isExhausted()) {
          logger.warn('AgentLoop: context window exhausted, stopping', {
            iteration,
            inputTokens: this.contextManager.inputTokens
          })
          onChunk({
            type: 'text',
            text: '\n\n[Context window is nearly full. Please start a new conversation to continue.]'
          })
          break
        }

        // ── Manual compaction request from UI ──
        if (this._compactionRequested) {
          this._compactionRequested = false
          if (isOpus46) {
            logger.agent('Manual compaction requested', { inputTokens: this.contextManager.inputTokens })
            Object.assign(createParams, this.contextManager.applyCompaction(createParams))
            this.contextManager.compactionCount++
            onChunk({ type: 'compaction', message: 'Manual compaction applied' })
          }
        }

        // ── Compaction (Opus 4.6 only, when context is large) ──
        if (isOpus46 && this.contextManager.shouldCompact()) {
          logger.agent('Applying compaction', { inputTokens: this.contextManager.inputTokens })
          Object.assign(createParams, this.contextManager.applyCompaction(createParams))
          this.contextManager.compactionCount++
          onChunk({ type: 'compaction', message: 'Context compacted to fit window' })
        }

        // ── Context trimming for non-Opus models ──
        if (!isOpus46 && this.contextManager.shouldCompact()) {
          createParams.messages = this.contextManager.localTrim(
            createParams.messages,
            this.contextManager.inputTokens
          )
          conversationMessages.length = 0
          conversationMessages.push(...createParams.messages)
          onChunk({ type: 'compaction', message: 'Older messages trimmed to fit context' })
        }

        // ── Stream the response ──
        let assistantContent = []
        let currentTextBlock = ''
        let currentToolUse = null
        let stopReason = null

        logger.agent('stream start', {
          iteration,
          model,
          msgs: createParams.messages.length,
          tools: allTools.length,
          thinking: isOpus46 ? 'adaptive' : (supportsThinking ? 'enabled' : 'none')
        })

        let stream
        try {
          // Use beta endpoint when compaction betas are present
          if (createParams.betas && createParams.betas.length > 0) {
            const { betas, ...restParams } = createParams
            stream = await client.beta.messages.stream({ ...restParams, betas })
          } else {
            stream = await client.messages.stream(createParams)
          }
        } catch (streamErr) {
          logger.error('stream open FAILED', streamErr.message, streamErr.status)
          throw streamErr
        }

        for await (const event of stream) {
          if (this.stopped) break

          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'text') {
              currentTextBlock = ''
            } else if (event.content_block.type === 'thinking') {
              // Thinking block started
              onChunk({ type: 'thinking_start' })
            } else if (event.content_block.type === 'tool_use') {
              if (currentTextBlock) {
                assistantContent.push({ type: 'text', text: currentTextBlock })
                currentTextBlock = ''
              }
              currentToolUse = {
                type: 'tool_use',
                id: event.content_block.id,
                name: event.content_block.name,
                input: ''
              }
            }

          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              currentTextBlock += event.delta.text
              finalText += event.delta.text
              onChunk({ type: 'text', text: event.delta.text })
            } else if (event.delta.type === 'thinking_delta') {
              onChunk({ type: 'thinking', text: event.delta.thinking })
            } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
              currentToolUse.input += event.delta.partial_json
            }

          } else if (event.type === 'content_block_stop') {
            if (currentTextBlock) {
              assistantContent.push({ type: 'text', text: currentTextBlock })
              currentTextBlock = ''
            }
            if (currentToolUse) {
              try {
                currentToolUse.input = JSON.parse(currentToolUse.input || '{}')
              } catch {
                currentToolUse.input = {}
              }
              assistantContent.push(currentToolUse)
              currentToolUse = null
            }

          } else if (event.type === 'message_delta') {
            stopReason = event.delta.stop_reason
          }
        }

        // Flush any remaining text
        if (currentTextBlock) {
          assistantContent.push({ type: 'text', text: currentTextBlock })
        }

        // ── Get final message for usage stats ──
        let finalMessage
        try {
          finalMessage = await stream.finalMessage()
        } catch {
          // stream may already be consumed
        }

        // Update context metrics from usage
        if (finalMessage) {
          this.contextManager.updateUsage(finalMessage)
          onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

          // Use the actual content from finalMessage to preserve compaction blocks
          if (isOpus46 && finalMessage.content) {
            this.contextManager.appendAssistantContent(conversationMessages, finalMessage.content)
          } else {
            conversationMessages.push({ role: 'assistant', content: assistantContent })
          }
        } else {
          conversationMessages.push({ role: 'assistant', content: assistantContent })
        }

        logger.agent('stream end', { iteration, stopReason, tokens: this.contextManager.getMetrics() })

        // ── Handle tool_use stop reason ──
        if (stopReason === 'tool_use' && !this.stopped) {
          const toolResults = []

          for (const block of assistantContent) {
            if (block.type !== 'tool_use') continue

            const toolName  = block.name
            const toolInput = block.input

            onChunk({ type: 'tool_call', name: toolName, input: toolInput })

            let result

            if (toolName === 'load_skill') {
              // Lazy skill loading — return full prompt content
              const skillId = toolInput.skill_id
              const prompt = this.skillPrompts.get(skillId)
              if (prompt) {
                logger.agent('load_skill', { skillId, promptLen: prompt.length })
                result = { success: true, skill_id: skillId, content: prompt }
              } else {
                result = { success: false, error: `Skill '${skillId}' not found. Available: ${[...this.skillPrompts.keys()].join(', ')}` }
              }
            } else if (toolName === 'dispatch_subagent') {
              // Sub-agent dispatch
              result = await this.subAgentManager.dispatch(toolInput, (progress) => {
                onChunk({ type: 'subagent_progress', ...progress })
              })
            } else if (toolName === 'background_task') {
              // Background task management
              result = await this.taskManager.execute(toolInput)
            } else {
              // Regular tool execution
              result = await this.toolRegistry.execute(toolName, toolInput)
            }

            onChunk({ type: 'tool_result', name: toolName, result })

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result)
            })
          }

          conversationMessages.push({ role: 'user', content: toolResults })

        } else {
          // end_turn or max_tokens — break
          break
        }
      }

      if (iteration >= MAX_ITERATIONS) {
        logger.warn('AgentLoop hit max iterations', { MAX_ITERATIONS })
        onChunk({ type: 'text', text: '\n\n[Reached maximum iteration limit]' })
      }

      // Final context metrics
      onChunk({ type: 'context_update', metrics: this.contextManager.getMetrics() })

      return finalText
    } catch (err) {
      logger.error('AgentLoop.run error', err.message, err.stack?.split('\n').slice(0, 3).join(' | '))
      throw err
    }
  }
}

module.exports = { AgentLoop }
