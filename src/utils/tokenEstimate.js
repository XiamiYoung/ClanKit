import { encodingForModel } from 'js-tiktoken'

let enc = null
function getEncoder() {
  if (!enc) enc = encodingForModel('gpt-4o') // cl100k_base — close to Claude tokenizer
  return enc
}

/** Estimate tokens for a string */
export function countTokens(text) {
  if (!text) return 0
  try {
    return getEncoder().encode(text).length
  } catch {
    return Math.ceil(text.length / 4) // fallback
  }
}

/** Estimate tokens for a tool definition (name + description + schema JSON) */
export function estimateToolTokens(tool) {
  const parts = [tool.name || '', tool.description || '']
  if (tool.type === 'code') parts.push(tool.code || '')
  if (tool.type === 'prompt') parts.push(tool.promptText || '')
  if (tool.type === 'http') parts.push(JSON.stringify(tool.headers || {}), tool.bodyTemplate || '')
  // Add ~50 tokens for JSON schema overhead per tool
  return countTokens(parts.join(' ')) + 50
}

/** Estimate tokens for an MCP server's tool definitions */
export function estimateMcpTokens(server, toolCount) {
  // Each MCP tool adds ~150 tokens (name + description + param schema)
  const count = toolCount || (server.toolCount ?? 10)
  return count * 150
}

/** Format token count as human-readable string */
export function formatTokens(count) {
  if (count >= 1000) return `~${(count / 1000).toFixed(1)}K`
  return `~${count}`
}

/** Get percentage of 200K context window */
export function tokenPercentage(count) {
  return ((count / 200_000) * 100).toFixed(1)
}
