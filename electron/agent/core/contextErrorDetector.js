/**
 * contextErrorDetector — unified detection of "context window exceeded" errors
 * across Anthropic / OpenAI / Gemini / DeepSeek / OpenRouter.
 *
 * Used by agentLoop to decide whether a failed request deserves reactive
 * compaction + retry. Each provider phrases the error differently; this module
 * centralises the patterns so every retry path treats them consistently.
 */

// Error shapes seen in the wild:
//   OpenAI:      status=400, code='context_length_exceeded', message includes "maximum context length is N tokens"
//   Anthropic:   status=400, message includes "prompt is too long: N tokens > M maximum"
//   Gemini:      status=400, message includes "exceeds the maximum number of tokens"
//   DeepSeek:    OpenAI-compatible — same as OpenAI
//   OpenRouter:  status=400, message includes "maximum context length is N tokens"
const CONTEXT_OVERFLOW_PATTERNS = [
  /maximum context length/i,
  /context[_ ]length[_ ]exceeded/i,
  /prompt is too long/i,
  /exceeds? (?:the )?maximum number of tokens/i,
  /input is too long/i,
  /request (?:is )?too large/i,
  /too many tokens/i,
]

const CONTEXT_OVERFLOW_CODES = new Set([
  'context_length_exceeded',
  'invalid_request_error',  // Anthropic uses this for "prompt is too long"
])

function isContextOverflowError(err) {
  if (!err) return false
  const msg = err.message || err.error?.message || ''
  const code = err.code || err.error?.code || err.error?.type || ''
  if (CONTEXT_OVERFLOW_CODES.has(code) && CONTEXT_OVERFLOW_PATTERNS.some(p => p.test(msg))) return true
  return CONTEXT_OVERFLOW_PATTERNS.some(p => p.test(msg))
}

/**
 * Parse context-overflow error messages to extract numeric bounds.
 * Returns { limit, input, output } with best-effort fields, or null on miss.
 */
function parseContextLimit(err) {
  const msg = err?.message || err?.error?.message || ''
  if (!msg) return null

  // OpenAI / OpenRouter / DeepSeek: "maximum context length is N tokens. However, you requested M tokens (X in the messages, Y in the completion)"
  const openaiFull = msg.match(/maximum context length is (\d+).*?(\d+) in the messages.*?(\d+) in the completion/i)
  if (openaiFull) return { limit: +openaiFull[1], input: +openaiFull[2], output: +openaiFull[3] }

  // OpenRouter flavour: "maximum context length is N tokens. However, you requested about M tokens (X of text input)"
  const openrouter = msg.match(/maximum context length is (\d+) tokens.*?(\d+) of text input/i)
  if (openrouter) return { limit: +openrouter[1], input: +openrouter[2], output: null }

  // Anthropic: "prompt is too long: N tokens > M maximum"
  const anth = msg.match(/prompt is too long:\s*(\d+)\s*tokens?\s*>\s*(\d+)/i)
  if (anth) return { limit: +anth[2], input: +anth[1], output: null }

  // Bare limit-only: "maximum context length is N"
  const limitOnly = msg.match(/maximum context length is (\d+)/i)
  if (limitOnly) return { limit: +limitOnly[1], input: null, output: null }

  return null
}

// ── Per-chat cooldown for reactive compaction ────────────────────────────────
// Prevents silent re-compaction loops: after one reactive compact per chat,
// further overflows within the cooldown window bubble up to the user instead.
const COOLDOWN_MS = 60_000
const _lastCompactAt = new Map()  // chatId -> timestamp ms

function canReactiveCompact(chatId) {
  if (!chatId) return true
  const last = _lastCompactAt.get(chatId)
  if (!last) return true
  return Date.now() - last > COOLDOWN_MS
}

function markReactiveCompact(chatId) {
  if (!chatId) return
  _lastCompactAt.set(chatId, Date.now())
}

function clearCooldown(chatId) {
  if (!chatId) return
  _lastCompactAt.delete(chatId)
}

module.exports = {
  isContextOverflowError,
  parseContextLimit,
  canReactiveCompact,
  markReactiveCompact,
  clearCooldown,
}
