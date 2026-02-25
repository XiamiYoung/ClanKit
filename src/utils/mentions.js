/**
 * Parse @mentions from user text against a list of personas.
 *
 * Detects `@PersonaName` (case-insensitive) and `@all`.
 * Multi-word persona names are matched greedily.
 *
 * @param {string} text          The user's message text
 * @param {Array}  personas      Array of persona objects with { id, name }
 * @returns {{ mentions: string[], mentionAll: boolean }}
 *          mentions = array of persona IDs that were mentioned
 */
export function parseMentions(text, personas) {
  if (!text || !personas || personas.length === 0) {
    return { mentions: [], mentionAll: false }
  }

  let mentionAll = false
  const mentions = []

  // Check for @all
  if (/@all\b/i.test(text)) {
    mentionAll = true
  }

  // Sort personas by name length descending so longer names match first
  const sorted = [...personas].sort((a, b) => b.name.length - a.name.length)

  for (const persona of sorted) {
    // Escape regex special characters in persona name
    const escaped = persona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`@${escaped}\\b`, 'i')
    if (regex.test(text)) {
      if (!mentions.includes(persona.id)) {
        mentions.push(persona.id)
      }
    }
  }

  return { mentions, mentionAll }
}

/**
 * Strip @mentions from text, leaving just the message content.
 *
 * @param {string} text      The user's message text
 * @param {Array}  personas  Array of persona objects with { id, name }
 * @returns {string}         Text with @mentions removed
 */
export function stripMentions(text, personas) {
  if (!text) return text
  let cleaned = text.replace(/@all\b/gi, '')
  if (personas) {
    const sorted = [...personas].sort((a, b) => b.name.length - a.name.length)
    for (const persona of sorted) {
      const escaped = persona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      cleaned = cleaned.replace(new RegExp(`@${escaped}\\b`, 'gi'), '')
    }
  }
  return cleaned.trim()
}
