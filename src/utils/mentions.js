/**
 * Parse @mentions from user text against a list of agents.
 *
 * Detects `@AgentName` (case-insensitive) and `@all`.
 * Multi-word agent names are matched greedily.
 *
 * NOTE: This returns every agent whose @Name appears anywhere in the text.
 * Determining *which* of those agents should actually respond (addressees vs.
 * passive references) is handled by the AI resolver in ChatsView — see
 * `resolveAddressees` / `agent:resolve-addressees` IPC channel.
 *
 * @param {string} text      The user's message text
 * @param {Array}  agents    Array of agent objects with { id, name }
 * @returns {{ mentions: string[], mentionAll: boolean }}
 *          mentions = array of agent IDs that were mentioned
 */
export function parseMentions(text, agents) {
  if (!text || !agents || agents.length === 0) {
    return { mentions: [], mentionAll: false }
  }

  const mentionAll = /@all(?=\W|$)/i.test(text)
  const mentions = []

  // Sort agents by name length descending so longer names match first
  const sorted = [...agents].sort((a, b) => b.name.length - a.name.length)

  for (const agent of sorted) {
    const escaped = agent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Use (?=\W|$) instead of \b — \b fails for CJK names because Chinese
    // characters are non-\w, so there's no word boundary between them and
    // following spaces/punctuation.
    const regex = new RegExp(`@${escaped}(?=\\W|$)`, 'i')
    if (regex.test(text)) {
      if (!mentions.includes(agent.id)) {
        mentions.push(agent.id)
      }
    }
  }

  return { mentions, mentionAll }
}

/**
 * Strip @mentions from text, leaving just the message content.
 *
 * @param {string} text    The user's message text
 * @param {Array}  agents  Array of agent objects with { id, name }
 * @returns {string}       Text with @mentions removed
 */
export function stripMentions(text, agents) {
  if (!text) return text
  let cleaned = text.replace(/@all(?=\W|$)/gi, '')
  if (agents) {
    const sorted = [...agents].sort((a, b) => b.name.length - a.name.length)
    for (const agent of sorted) {
      const escaped = agent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      cleaned = cleaned.replace(new RegExp(`@${escaped}(?=\\W|$)`, 'gi'), '')
    }
  }
  return cleaned.trim()
}
