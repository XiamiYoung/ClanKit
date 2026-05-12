/**
 * MemoryExtractor — post-turn memory extraction via the configured utility model.
 *
 * After agent turns complete, this module analyses the last exchange
 * (user message + assistant response) against existing memory and
 * returns candidate memory entries with confidence scores for routing.
 *
 * High-confidence (≥0.8): auto-saved directly to the memory store.
 * Medium-confidence (0.5–0.8): injected into next system prompt for conversational confirmation.
 * Low-confidence (<0.5): silently discarded.
 */
const { logger } = require('../../logger')

// Generous budgets so reasoning models (o1, o3, GPT-5 thinking, Claude extended
// thinking, Gemini Deep Think) have headroom for hidden reasoning tokens before
// the visible JSON output. Memory extraction runs at most once per turn so the
// cost is negligible compared to the main chat.
const MAX_TOKENS = 4096
const COLLAB_MAX_TOKENS = 6144

/**
 * Build the extraction prompt dynamically based on whether participants are provided.
 * When participants are present (group chat or named agent), the LLM can route
 * memories to specific agents by name instead of the generic "system" target.
 */
function buildExtractionPrompt(participants, language) {
  const hasParticipants = participants && participants.length > 0

  let targetInstructions
  if (hasParticipants) {
    const nameList = participants.map(p => `"${p.name}"`).join(', ')
    targetInstructions = `For each memory, specify the target:
- "user" for facts about the human user (their preferences, habits, personal info)
- The exact agent name (one of: ${nameList}) for facts about or relevant to a specific AI agent
  Examples: behavioral feedback for that agent, facts the agent should remember, domain knowledge for their role
- If unsure which agent a fact belongs to, use the agent name that is most relevant to the topic`
  } else {
    targetInstructions = `For each memory, specify the target:
- "user" for facts about the human user (their preferences, habits, personal info)
- "system" for facts about how the AI agent should behave (tone, format, approach preferences)`
  }

  return `You are a memory extraction assistant. Your job is to identify ONLY significant, identity-level facts worth persisting long-term from a conversation exchange.

You will be given:
1. The last user message and assistant response
2. Existing memory content for the user and system agent (if any)
${hasParticipants ? '3. A list of AI agents participating in this conversation' : ''}

WHAT TO EXTRACT (only these categories):
- Key personal facts: name, title, role, employer, location, age
- Personality traits, character, core values, communication style
- Hobbies, interests, passions
- Strong preferences: tools, languages, frameworks, workflows, editors, OS
- Behavioral feedback: how the AI should adjust tone, format, verbosity, approach
- Significant relationships: key people mentioned by name and their roles
- Long-term projects or goals the user is working on
- Identity-level information: things that shape who this person/agent IS

WHAT TO IGNORE (never extract these):
- General questions and their answers (e.g. "how do I sort an array" — that's a task, not a memory)
- Troubleshooting steps, debugging sessions, code fixes
- One-off requests, transient instructions, session-specific context
- Greetings, small talk, filler, pleasantries ("Hey", "What's up", "How are you")
- Information already present in the existing memory
- Vague or obvious observations ("user is interested in coding")
- AI agent descriptions, roles, or capabilities that come from the system prompt — these are CONFIGURATION, not learned memories
- Inferred or assumed context — only extract facts EXPLICITLY stated by the user in their message
- Anything the user did NOT actually say — do not fabricate or infer projects, intentions, or goals from thin air

CRITICAL: Only extract from what the USER explicitly said. If the user message is a greeting or contains no substantive personal information, return an EMPTY array. Do not infer, assume, or fabricate. When in doubt, return empty.

CONFIDENCE SCORING:
- 0.9–1.0: Very certain explicit fact directly stated by the user (e.g. "I work at Google", "I prefer TypeScript")
- 0.5–0.8: Plausible but uncertain — implied or mentioned in passing, worth asking about
- Below 0.5: Skip entirely — do not include

Rules:
- ${targetInstructions}
- Choose the most appropriate section: Preferences, Communication, Technical, Projects, Personal, Interaction Notes
- Keep entries concise — one line each, written as bullet-point facts
- If there is nothing worth remembering, return an empty array
- LANGUAGE: Write all memory entries in ${language === 'zh' ? 'Chinese (Simplified)' : 'the same language the user is speaking in the conversation'}. Match the language of the conversation — if the user speaks Chinese, write memories in Chinese; if English, write in English.

Respond with ONLY valid JSON (no markdown fences, no explanation):
{"memories": [{"target": "${hasParticipants ? 'user|<agent_name>' : 'user|system'}", "section": "<section name>", "entry": "<the memory entry>", "confidence": 0.85}]}`
}

class MemoryExtractor {
  /**
   * @param {object} opts
   * @param {string} opts.model — model ID to use
   * @param {string} opts.apiKey — API key
   * @param {string} opts.baseURL — provider base URL
   * @param {boolean} [opts.isOpenAI] — use OpenAI-compatible API (openai, deepseek, openrouter with OAI compat)
   * @param {boolean} [opts.directAuth] — use standard Bearer auth for direct OpenAI-compatible providers (e.g. DeepSeek)
   */
  constructor({ model, apiKey, baseURL, isOpenAI = false, directAuth = false, providerType = null }) {
    this.model = model
    this.apiKey = apiKey
    this.baseURL = baseURL
    this.isOpenAI = isOpenAI
    this.directAuth = directAuth
    this.isGoogle = providerType === 'google'
  }

  /**
   * Extract candidate memory entries from the last exchange.
   *
   * @param {object} params
   * @param {string} params.lastUserMessage — text of the last user message
   * @param {string} params.lastAssistantMessage — text of the last assistant response
   * @param {string|null} params.userMemoryContent — existing user memory content
   * @param {string|null} params.systemMemoryContent — existing system memory content
   * @param {string} params.userAgentId
   * @param {string} params.systemAgentId
   * @param {Array<{id: string, name: string, type: string}>} [params.participants] — all AI agents in the conversation
   * @param {string} [params.language] — language code ('en' | 'zh') for memory entry language
   * @returns {Promise<Array<{target: string, section: string, entry: string, confidence: number, agentId: string, agentType: string}>>}
   */
  async extract({ lastUserMessage, lastAssistantMessage, userMemoryContent, systemMemoryContent, userAgentId, systemAgentId, participants, language }) {
    if (!lastUserMessage || !lastAssistantMessage) return []

    const userContent = this._buildUserContent(lastUserMessage, lastAssistantMessage, userMemoryContent, systemMemoryContent, participants)
    const systemPrompt = buildExtractionPrompt(participants, language)

    try {
      let text
      if (this.isGoogle) {
        text = await this._callGoogle(systemPrompt, userContent, MAX_TOKENS)
      } else if (this.isOpenAI) {
        text = await this._extractOpenAI(systemPrompt, userContent)
      } else {
        text = await this._extractAnthropic(systemPrompt, userContent)
      }

      const parsed = this._parseResponse(text)
      if (!parsed || !Array.isArray(parsed.memories)) return []

      // Build a name→participant lookup for routing
      const participantByName = new Map()
      if (participants) {
        for (const p of participants) {
          participantByName.set(p.name.toLowerCase(), p)
        }
      }

      // Map each memory to include agent IDs with participant-aware routing
      return parsed.memories
        .filter(m => m.target && m.section && m.entry)
        .filter(m => (m.confidence ?? 1) >= 0.5)   // drop low-confidence before returning
        .map(m => {
          const confidence = typeof m.confidence === 'number' ? m.confidence : 1.0

          // "user" target → user memory
          if (m.target === 'user') {
            return { target: m.target, section: m.section, entry: m.entry, confidence, agentId: userAgentId, agentType: 'users' }
          }

          // Legacy "system" target (no participants) → active agent
          if (m.target === 'system') {
            return { target: m.target, section: m.section, entry: m.entry, confidence, agentId: systemAgentId, agentType: 'system' }
          }

          // Participant name target → route to that agent's memory
          const matched = participantByName.get(m.target.toLowerCase())
          if (matched) {
            return { target: m.target, section: m.section, entry: m.entry, confidence, agentId: matched.id, agentType: matched.type || 'system' }
          }

          // Fallback: unrecognized name → route to active agent
          logger.warn('MemoryExtractor: unrecognized target name, falling back to active agent', { target: m.target })
          return { target: m.target, section: m.section, entry: m.entry, confidence, agentId: systemAgentId, agentType: 'system' }
        })
    } catch (err) {
      logger.error('MemoryExtractor.extract failed', err.message)
      return []
    }
  }

  /**
   * Extract memories from an agent-to-agent collaboration transcript.
   * Focuses on inter-agent relationship dynamics rather than user personal info.
   *
   * @param {object} params
   * @param {string} params.transcript — "[AgentName]: text" formatted conversation
   * @param {Array<{id: string, name: string, type: string}>} params.participants — agents involved
   * @param {Object<string, string|null>} params.existingMemories — agentId → memory content
   * @param {string} [params.language] — language code ('en' | 'zh') for memory entry language
   * @returns {Promise<Array<{target: string, section: string, entry: string, confidence: number, agentId: string, agentType: string}>>}
   */
  async extractFromCollaboration({ transcript, participants, existingMemories, language }) {
    if (!transcript || !participants || participants.length < 2) return []

    const nameList = participants.map(p => `"${p.name}"`).join(', ')

    const systemPrompt = `You are a memory extraction assistant specialized in analyzing conversations BETWEEN AI agents.

You will be given:
1. A transcript of a conversation between AI agents (no human participant)
2. Existing memory content for each agent (if any)

Agents in this conversation: ${nameList}

WHAT TO EXTRACT (focus on inter-agent dynamics):
- Relationship dynamics: respect, disagreement, trust, complementary strengths, tension, humor
- Key consensus points: important conclusions or agreements they reached together
- Key disagreements: unresolved differences of opinion or approach
- Personality moments: how an agent's character was revealed through interaction (not just their configured personality, but how it manifested)
- Important conclusions: decisions, insights, or creative ideas that emerged from the collaboration
- Emotional interactions: moments of empathy, frustration, encouragement, or humor between agents
- Collaboration patterns: who tends to lead, who synthesizes, who challenges

WHAT TO IGNORE:
- Generic pleasantries and turn-taking mechanics ("Sure, let me respond", "Thanks for sharing")
- Information that is just restating the agent's configured system prompt or description
- Facts already present in the existing memory
- Trivial exchanges with no lasting significance
- The human user's original prompt/instruction that started the conversation

For each memory, specify the target:
- The exact agent name (one of: ${nameList}) for facts about or relevant to that specific agent
- Use the agent name that the memory is ABOUT (e.g. if Alice showed empathy toward Bob, target is "Alice")

CONFIDENCE SCORING:
- 0.9–1.0: Clear, significant moment or dynamic explicitly demonstrated in the transcript
- 0.7–0.8: Notable pattern observed across multiple exchanges
- 0.5–0.6: Subtle or single-instance observation, worth noting but uncertain
- Below 0.5: Skip entirely

Choose appropriate sections: Relationships, Collaboration Style, Key Insights, Personality, Interaction Notes

LANGUAGE: Write all memory entries in ${language === 'zh' ? 'Chinese (Simplified)' : 'the same language the agents are speaking in the transcript'}. Match the language of the conversation.

Respond with ONLY valid JSON (no markdown fences, no explanation):
{"memories": [{"target": "<agent_name>", "section": "<section name>", "entry": "<the memory entry>", "confidence": 0.85}]}`

    const parts = ['## Agent Collaboration Transcript', transcript]
    if (existingMemories) {
      for (const p of participants) {
        const mem = existingMemories[p.id]
        if (mem) {
          parts.push(`\n## Existing Memory for ${p.name}`)
          parts.push(mem)
        }
      }
    }
    const userContent = parts.join('\n')

    try {
      let text
      if (this.isGoogle) {
        text = await this._callGoogle(systemPrompt, userContent, COLLAB_MAX_TOKENS)
      } else if (this.isOpenAI) {
        text = await this._callOpenAI(systemPrompt, userContent, COLLAB_MAX_TOKENS)
      } else {
        text = await this._callAnthropic(systemPrompt, userContent, COLLAB_MAX_TOKENS)
      }

      const parsed = this._parseResponse(text)
      if (!parsed || !Array.isArray(parsed.memories)) return []

      const participantByName = new Map()
      for (const p of participants) {
        participantByName.set(p.name.toLowerCase(), p)
      }

      return parsed.memories
        .filter(m => m.target && m.section && m.entry)
        .filter(m => (m.confidence ?? 1) >= 0.5)
        .map(m => {
          const confidence = typeof m.confidence === 'number' ? m.confidence : 1.0
          const matched = participantByName.get(m.target.toLowerCase())
          if (matched) {
            return { target: m.target, section: m.section, entry: m.entry, confidence, agentId: matched.id, agentType: matched.type || 'system' }
          }
          // Fallback: unrecognized name → route to first participant
          logger.warn('MemoryExtractor.extractFromCollaboration: unrecognized target', { target: m.target })
          return { target: m.target, section: m.section, entry: m.entry, confidence, agentId: participants[0].id, agentType: participants[0].type || 'system' }
        })
    } catch (err) {
      logger.error('MemoryExtractor.extractFromCollaboration failed', err.message)
      return []
    }
  }

  async _extractAnthropic(systemPrompt, userContent) {
    return this._callAnthropic(systemPrompt, userContent, MAX_TOKENS)
  }

  async _extractOpenAI(systemPrompt, userContent) {
    return this._callOpenAI(systemPrompt, userContent, MAX_TOKENS)
  }

  async _callGoogle(systemPrompt, userContent, maxTokens) {
    const { GeminiClient } = require('./GeminiClient')
    const gc = new GeminiClient({ provider: { apiKey: this.apiKey, model: this.model }, customModel: this.model })
    const response = await gc.getClient().models.generateContent({
      model: this.model,
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userContent }] },
      ],
      generationConfig: { maxOutputTokens: maxTokens },
    })
    return response.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
  }

  async _callAnthropic(systemPrompt, userContent, maxTokens) {
    const Anthropic = require('@anthropic-ai/sdk')
    const clientOpts = { apiKey: this.apiKey }
    if (this.baseURL) clientOpts.baseURL = this.baseURL.replace(/\/+$/, '')
    const client = new Anthropic(clientOpts)
    // Assistant prefill: by seeding the response with `{` we force Claude into
    // JSON mode without needing a beta header. Works on Opus/Sonnet/Haiku and
    // is a no-op if extended thinking is also on (thinking blocks emit first,
    // then the prefilled text continuation). We prepend `{` back to the output
    // so downstream parser sees the full object.
    try {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userContent },
          { role: 'assistant', content: '{' },
        ],
      })
      const text = response.content?.filter(b => b.type === 'text').map(b => b.text).join('') || ''
      return text.trimStart().startsWith('{') ? text : '{' + text
    } catch (err) {
      // Some Anthropic-compatible proxies / restricted models reject assistant
      // prefill ("does not support assistant message prefill" / "must end with
      // a user message"). Retry without the prefill — _parseResponse handles
      // markdown fences and leading prose.
      const msg = String(err?.message || err || '')
      const prefillRejected = /assistant message prefill|must end with a user message/i.test(msg)
      if (!prefillRejected) throw err
      logger.debug('MemoryExtractor: assistant prefill rejected, retrying without', msg.slice(0, 160))
      const response = await client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userContent },
        ],
      })
      return response.content?.filter(b => b.type === 'text').map(b => b.text).join('') || ''
    }
  }

  async _callOpenAI(systemPrompt, userContent, maxTokens) {
    const { OpenAIClient } = require('./OpenAIClient')
    const cfg = {
      openaiApiKey: this.apiKey,
      openaiBaseURL: this.baseURL.replace(/\/+$/, ''),
      customModel: this.model,
      _resolvedProvider: 'openai',
      defaultProvider: 'openai',
      _scenario: 'memory-extract',
      _directAuth: this.directAuth,
    }
    const client = new OpenAIClient(cfg).getClient()
    // Try structured JSON mode first — supported by OpenAI (gpt-4o+, gpt-5),
    // DeepSeek, and most OpenAI-compatible providers. Some custom endpoints
    // reject the `response_format` parameter; fall back to a plain request in
    // that case so memory extraction still works (the parser handles prose).
    const baseParams = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }
    try {
      const response = await client.chat.completions.create({
        ...baseParams,
        response_format: { type: 'json_object' },
      })
      return response.choices?.[0]?.message?.content || ''
    } catch (err) {
      // Common error fragments from providers that don't support response_format
      const m = String(err?.message || '')
      const unsupported = /response_format|json_object|not\s+support|unknown\s+param|unrecognized/i.test(m)
      if (!unsupported) throw err
      logger.debug('MemoryExtractor: response_format unsupported, retrying without', m.slice(0, 120))
      const response = await client.chat.completions.create(baseParams)
      return response.choices?.[0]?.message?.content || ''
    }
  }

  _buildUserContent(userMsg, assistantMsg, userMemory, systemMemory, participants) {
    const parts = []
    parts.push('## Last Exchange')
    parts.push(`**User:** ${userMsg}`)
    parts.push(`**Assistant:** ${assistantMsg}`)
    if (participants && participants.length > 0) {
      parts.push('\n## Conversation Participants')
      for (const p of participants) {
        parts.push(`- ${p.name} (AI agent)`)
      }
    }
    if (userMemory) {
      parts.push('\n## Existing User Memory')
      parts.push(userMemory)
    }
    if (systemMemory) {
      parts.push('\n## Existing System Agent Memory')
      parts.push(systemMemory)
    }
    return parts.join('\n')
  }

  _parseResponse(text) {
    if (!text) return null

    // Strip reasoning/thinking wrappers emitted by reasoning models that ignore
    // the system prompt and narrate first. We don't need this for Anthropic
    // (`_callAnthropic` already filters thinking blocks at the SDK level) but
    // OpenAI / OpenRouter / DeepSeek may surface these as inline tags in the
    // content string, and so can poorly-tuned local models.
    let cleaned = String(text)
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
      .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
      // Markdown fences — ```json … ``` or plain ```
      .replace(/```(?:json|JSON)?\s*/g, '')
      .replace(/```/g, '')

    // Fast path: whole cleaned response is valid JSON (the model behaved). Handles
    // a top-level array (`[{...},{...}]`) which the brace iterator below would miss.
    try {
      const obj = JSON.parse(cleaned.trim())
      const found = this._findMemoriesArray(obj)
      if (found) return { memories: found }
    } catch {
      // not a single clean JSON value — try candidate extraction below
    }

    // Try every brace-balanced JSON object in the response. Reasoning models
    // and misbehaving utility models often emit prose + an unrelated `{...}`
    // (e.g. a tool-call payload, an example, a partial schema); we want the
    // one that actually contains a `memories` array.
    for (const candidate of this._iterJsonObjects(cleaned)) {
      try {
        const obj = JSON.parse(candidate)
        const found = this._findMemoriesArray(obj)
        if (found) return { memories: found }
      } catch {
        // Skip malformed candidates (e.g. Windows path: `D:\c...` is not a
        // valid JSON escape, so the substring fails to parse).
      }
    }

    // Best-effort last-ditch: slice from the first `{` to the last `}`. Kept
    // for cases where brace-balance was thrown off by unescaped `{` / `}` in
    // string content (the iterator over-segments those).
    try {
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start !== -1 && end > start) {
        const obj = JSON.parse(cleaned.slice(start, end + 1))
        const found = this._findMemoriesArray(obj)
        if (found) return { memories: found }
      }
    } catch {
      // fall through
    }

    // Memory extraction is best-effort — a turn with no extractable memory or
    // an off-task utility model is normal, not a bug. Log at debug so it stays
    // out of the default console flow.
    logger.debug('MemoryExtractor: no parseable memories in response', text.slice(0, 200))
    return null
  }

  /**
   * Find an array under any `memories` key at any depth of a parsed JSON value.
   * Handles top-level `{memories:[...]}`, wrapper schemas like
   * `{result:{memories:[...]}}`, and array-of-memories without a wrapper.
   * Returns the array or null. Bounded by a small depth limit to avoid
   * pathological inputs.
   */
  _findMemoriesArray(value, depth = 0) {
    if (!value || depth > 6) return null
    if (Array.isArray(value)) {
      // Heuristic: if it's an array of objects with the right shape, treat it
      // as the memories array even if not nested under a `memories` key.
      if (value.length === 0) return value
      if (value.every(m => m && typeof m === 'object' && 'entry' in m && 'section' in m)) return value
      return null
    }
    if (typeof value !== 'object') return null
    if (Array.isArray(value.memories)) return value.memories
    for (const key of Object.keys(value)) {
      const found = this._findMemoriesArray(value[key], depth + 1)
      if (found) return found
    }
    return null
  }

  /**
   * Yield every brace-balanced top-level `{...}` substring in the text, in order.
   * Naive scanner — does not track strings, so it can over-segment inputs with
   * `{` or `}` inside string literals. That's fine here: we hand each candidate
   * to JSON.parse, which rejects invalid ones, and we keep iterating until we
   * find one with the right shape.
   */
  *_iterJsonObjects(text) {
    let depth = 0
    let start = -1
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '{') {
        if (depth === 0) start = i
        depth++
      } else if (ch === '}') {
        if (depth > 0) {
          depth--
          if (depth === 0 && start !== -1) {
            yield text.slice(start, i + 1)
            start = -1
          }
        }
      }
    }
  }
}

module.exports = { MemoryExtractor }
