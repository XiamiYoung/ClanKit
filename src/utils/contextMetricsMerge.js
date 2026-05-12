/**
 * Merge an incoming `context_update` metrics payload with the chat's existing
 * metrics. Prevents the "flash to zero" effect where a placeholder emit
 * (inputTokens=0, outputTokens=0, no cache data) momentarily overwrites the
 * real numbers between turns.
 *
 * Rules:
 *   - No existing → use incoming verbatim.
 *   - Incoming is empty (all token-related fields are 0) → keep existing
 *     token fields, but allow non-token fields (maxTokens, compactionCount)
 *     to update in case the model or compaction state changed.
 *   - Otherwise → use incoming verbatim (it has real data).
 */
export function mergeContextMetrics(existing, incoming) {
  if (!incoming) return existing || null
  if (!existing) return { ...incoming }

  const incomingEffectiveInput =
    (incoming.inputTokens || 0) +
    (incoming.cacheReadInputTokens || 0) +
    (incoming.cacheCreationInputTokens || 0)
  const incomingOutput = incoming.outputTokens || 0

  if (incomingEffectiveInput === 0 && incomingOutput === 0) {
    return {
      ...existing,
      maxTokens: incoming.maxTokens || existing.maxTokens,
      compactionCount: incoming.compactionCount ?? existing.compactionCount,
    }
  }

  return { ...incoming }
}
