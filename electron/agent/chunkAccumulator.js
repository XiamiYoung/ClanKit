/**
 * Accumulate text from streaming chunks into a plain string.
 * Used by runGroupRound in agent.js to build trackMessages for the collaboration loop.
 *
 * AgentLoop emits text chunks as { type: 'text', text: '...' }.
 * The collaboration loop depends on this accumulated text to find @mentions.
 * If this function uses the wrong property name, the entire multi-agent
 * collaboration chain breaks silently.
 */
function createChunkAccumulator() {
  let text = ''
  return {
    onChunk(chunk) {
      if (chunk.type === 'text' && chunk.text) text += chunk.text
    },
    getText() { return text },
  }
}

module.exports = { createChunkAccumulator }
