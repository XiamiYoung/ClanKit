/**
 * MemoryExtractor — post-turn memory extraction via Haiku.
 *
 * After each agent turn completes, this module analyses the last exchange
 * (user message + assistant response) against existing soul content and
 * returns candidate memory entries for user confirmation.
 */
const Anthropic = require('@anthropic-ai/sdk')
const { logger } = require('../../logger')

const EXTRACTION_MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 1024

/**
 * Build the extraction prompt dynamically based on whether participants are provided.
 * When participants are present (group chat or named persona), the LLM can route
 * memories to specific personas by name instead of the generic "system" target.
 */
function buildExtractionPrompt(participants) {
  const hasParticipants = participants && participants.length > 0

  let targetInstructions
  if (hasParticipants) {
    const nameList = participants.map(p => `"${p.name}"`).join(', ')
    targetInstructions = `For each memory, specify the target:
- "user" for facts about the human user (their preferences, habits, personal info)
- The exact persona name (one of: ${nameList}) for facts about or relevant to a specific AI persona
  Examples: behavioral feedback for that persona, facts the persona should remember, domain knowledge for their role
- If unsure which persona a fact belongs to, use the persona name that is most relevant to the topic`
  } else {
    targetInstructions = `For each memory, specify the target:
- "user" for facts about the human user (their preferences, habits, personal info)
- "system" for facts about how the AI persona should behave (tone, format, approach preferences)`
  }

  return `You are a memory extraction assistant. Your job is to identify ONLY significant, identity-level facts worth persisting long-term from a conversation exchange.

You will be given:
1. The last user message and assistant response
2. Existing soul/memory content for the user and system persona (if any)
${hasParticipants ? '3. A list of AI personas participating in this conversation' : ''}

WHAT TO EXTRACT (only these categories):
- Key personal facts: name, title, role, employer, location, age
- Personality traits, character, core values, communication style
- Hobbies, interests, passions
- Strong preferences: tools, languages, frameworks, workflows, editors, OS
- Behavioral feedback: how the AI should adjust tone, format, verbosity, approach
- Significant relationships: key people mentioned by name and their roles
- Long-term projects or goals the user is working on
- Soul-defining information: things that shape who this person/persona IS

WHAT TO IGNORE (never extract these):
- General questions and their answers (e.g. "how do I sort an array" — that's a task, not a memory)
- Troubleshooting steps, debugging sessions, code fixes
- One-off requests, transient instructions, session-specific context
- Greetings, small talk, filler, pleasantries ("Hey", "What's up", "How are you")
- Information already present in the existing soul files
- Vague or obvious observations ("user is interested in coding")
- AI persona descriptions, roles, or capabilities that come from the system prompt — these are CONFIGURATION, not learned memories
- Inferred or assumed context — only extract facts EXPLICITLY stated by the user in their message
- Anything the user did NOT actually say — do not fabricate or infer projects, intentions, or goals from thin air

CRITICAL: Only extract from what the USER explicitly said. If the user message is a greeting or contains no substantive personal information, return an EMPTY array. Do not infer, assume, or fabricate. When in doubt, return empty.

Rules:
- ${targetInstructions}
- Choose the most appropriate section: Preferences, Communication, Technical, Projects, Personal, Interaction Notes
- Keep entries concise — one line each, written as bullet-point facts
- If there is nothing worth remembering, return an empty array

Respond with ONLY valid JSON (no markdown fences, no explanation):
{"memories": [{"target": "${hasParticipants ? 'user|<persona_name>' : 'user|system'}", "section": "<section name>", "entry": "<the memory entry>"}]}`
}

class MemoryExtractor {
  /**
   * @param {object} config — must include apiKey (and optionally baseURL)
   */
  constructor(config) {
    this.config = config
    const clientOpts = {}
    const baseURL = config.baseURL || config.anthropic?.baseURL
    if (baseURL && baseURL !== 'https://api.anthropic.com' && !baseURL.includes('openrouter.ai')) {
      clientOpts.baseURL = baseURL
    }
    clientOpts.apiKey = config.apiKey || config.anthropic?.apiKey || ''
    this.client = new Anthropic(clientOpts)
  }

  /**
   * Extract candidate memory entries from the last exchange.
   *
   * @param {object} params
   * @param {string} params.lastUserMessage — text of the last user message
   * @param {string} params.lastAssistantMessage — text of the last assistant response
   * @param {string|null} params.userSoulContent — existing user soul file content
   * @param {string|null} params.systemSoulContent — existing system soul file content
   * @param {string} params.userPersonaId
   * @param {string} params.systemPersonaId
   * @param {Array<{id: string, name: string, type: string}>} [params.participants] — all AI personas in the conversation
   * @returns {Promise<Array<{target: string, section: string, entry: string, personaId: string, personaType: string}>>}
   */
  async extract({ lastUserMessage, lastAssistantMessage, userSoulContent, systemSoulContent, userPersonaId, systemPersonaId, participants }) {
    if (!lastUserMessage || !lastAssistantMessage) return []

    const userContent = this._buildUserContent(lastUserMessage, lastAssistantMessage, userSoulContent, systemSoulContent, participants)
    const systemPrompt = buildExtractionPrompt(participants)

    try {
      const response = await this.client.messages.create({
        model: EXTRACTION_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      })

      const text = response.content
        ?.filter(b => b.type === 'text')
        .map(b => b.text)
        .join('') || ''

      const parsed = this._parseResponse(text)
      if (!parsed || !Array.isArray(parsed.memories)) return []

      // Build a name→participant lookup for routing
      const participantByName = new Map()
      if (participants) {
        for (const p of participants) {
          participantByName.set(p.name.toLowerCase(), p)
        }
      }

      // Map each memory to include persona IDs with participant-aware routing
      return parsed.memories
        .filter(m => m.target && m.section && m.entry)
        .map(m => {
          // "user" target → user soul file
          if (m.target === 'user') {
            return {
              target: m.target,
              section: m.section,
              entry: m.entry,
              personaId: userPersonaId,
              personaType: 'users',
            }
          }

          // Legacy "system" target (no participants) → active persona
          if (m.target === 'system') {
            return {
              target: m.target,
              section: m.section,
              entry: m.entry,
              personaId: systemPersonaId,
              personaType: 'system',
            }
          }

          // Participant name target → route to that persona's soul file
          const matched = participantByName.get(m.target.toLowerCase())
          if (matched) {
            return {
              target: m.target,
              section: m.section,
              entry: m.entry,
              personaId: matched.id,
              personaType: matched.type || 'system',
            }
          }

          // Fallback: unrecognized name → route to active persona
          logger.warn('MemoryExtractor: unrecognized target name, falling back to active persona', { target: m.target })
          return {
            target: m.target,
            section: m.section,
            entry: m.entry,
            personaId: systemPersonaId,
            personaType: 'system',
          }
        })
    } catch (err) {
      logger.error('MemoryExtractor.extract failed', err.message)
      return []
    }
  }

  _buildUserContent(userMsg, assistantMsg, userSoul, systemSoul, participants) {
    const parts = []
    parts.push('## Last Exchange')
    parts.push(`**User:** ${userMsg}`)
    parts.push(`**Assistant:** ${assistantMsg}`)
    if (participants && participants.length > 0) {
      parts.push('\n## Conversation Participants')
      for (const p of participants) {
        parts.push(`- ${p.name} (AI persona)`)
      }
    }
    if (userSoul) {
      parts.push('\n## Existing User Memory')
      parts.push(userSoul)
    }
    if (systemSoul) {
      parts.push('\n## Existing System Persona Memory')
      parts.push(systemSoul)
    }
    return parts.join('\n')
  }

  _parseResponse(text) {
    try {
      // Strip markdown fences if present
      const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
      return JSON.parse(cleaned)
    } catch {
      logger.warn('MemoryExtractor: failed to parse JSON response', text.slice(0, 200))
      return null
    }
  }
}

module.exports = { MemoryExtractor }
