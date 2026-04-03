/**
 * Parse [Tool execution log from this response:...] blocks in message text
 * and convert them into proper tool segments for component rendering.
 *
 * DeepSeek and some OpenAI-compatible models echo the buildToolLog() text
 * as part of their streamed response instead of using structured tool_calls.
 * This module detects that text pattern and converts it to { type: 'tool' } segments.
 */

const TOOL_LOG_BLOCK_RE = /\n?\n?\[Tool execution log from this response:\n([\s\S]*?)\n?\]/g

// Match entries like: "1. ✓ tool_name(...) → output" or "✓ tool_name(...) → output"
// The entry header: optional number + dot, then ✓/✗, then tool name
const ENTRY_HEADER_RE = /^(?:\d+\.\s*)?([✓✗])\s+(\w+)\(/

/**
 * Parse a single tool log entry line.
 * Format: "N. ✓ tool_name(inputJSON) → outputText"
 * Uses ") → " as the delimiter between input and output.
 * @param {string} line
 * @returns {{ name: string, input: object|string, output: string, success: boolean } | null}
 */
function parseEntry(line) {
  const headerMatch = line.match(ENTRY_HEADER_RE)
  if (!headerMatch) return null

  const success = headerMatch[1] === '✓'
  const name = headerMatch[2]

  // Everything after "name(" is the rest to parse
  const afterName = line.slice(headerMatch[0].length)

  // Find ") → " as delimiter between input and output
  const arrowIdx = afterName.indexOf(') \u2192 ')
  if (arrowIdx < 0) {
    // No arrow — treat everything in parens as input, no output
    const closeIdx = afterName.lastIndexOf(')')
    const inputStr = closeIdx >= 0 ? afterName.slice(0, closeIdx) : afterName
    return { name, input: tryParseJSON(inputStr), output: '', success }
  }

  const inputStr = afterName.slice(0, arrowIdx)
  const outputStr = afterName.slice(arrowIdx + 4) // skip ") → "

  return { name, input: tryParseJSON(inputStr), output: outputStr.trim(), success }
}

/**
 * Try to parse a string as JSON. Returns the parsed object on success,
 * or the original string on failure (input may be truncated).
 */
function tryParseJSON(str) {
  try {
    return JSON.parse(str)
  } catch {
    return str
  }
}

/**
 * Parse tool execution log blocks from text content.
 * @param {string} text - Message text potentially containing tool log blocks
 * @returns {{ cleanedText: string, parsedTools: Array<{ type: 'tool', name: string, input: object|string, output: string, _fromLog: boolean }> } | null}
 *   Returns null if no log block is found.
 */
export function parseToolLogBlock(text) {
  if (!text || !text.includes('[Tool execution log from this response:')) return null

  const parsedTools = []
  const cleanedText = text.replace(TOOL_LOG_BLOCK_RE, (match, body) => {
    // Split body into entries. Each entry starts with "N. ✓/✗" or "✓/✗" at line start.
    // Multi-line outputs mean we can't just split by \n — we need to find entry boundaries.
    const lines = body.split('\n')
    let currentEntry = ''

    for (const line of lines) {
      if (ENTRY_HEADER_RE.test(line.trim())) {
        // New entry starts — flush previous
        if (currentEntry) {
          const parsed = parseEntry(currentEntry.trim())
          if (parsed) parsedTools.push(parsed)
        }
        currentEntry = line.trim()
      } else if (currentEntry) {
        // Continuation of current entry (multi-line output)
        currentEntry += '\n' + line
      }
    }
    // Flush last entry
    if (currentEntry) {
      const parsed = parseEntry(currentEntry.trim())
      if (parsed) parsedTools.push(parsed)
    }

    return '' // Remove the block from text
  }).replace(/\n{3,}/g, '\n\n').trim()

  if (parsedTools.length === 0 && cleanedText === text.trim()) return null

  return {
    cleanedText,
    parsedTools: parsedTools.map(t => ({
      type: 'tool',
      name: t.name,
      input: t.input,
      output: t.output || (t.success ? 'Success' : 'Error'),
      _fromLog: true,
      toolCallId: null
    }))
  }
}

/**
 * Remove parsed tool segments that duplicate existing real tool segments.
 * @param {Array} existingToolSegs - Real tool segments from tool_call/tool_result chunks
 * @param {Array} parsedToolSegs - Tool segments parsed from log text
 * @returns {Array} parsedToolSegs with duplicates removed
 */
export function deduplicateToolSegments(existingToolSegs, parsedToolSegs) {
  if (!existingToolSegs || existingToolSegs.length === 0) return parsedToolSegs
  if (!parsedToolSegs || parsedToolSegs.length === 0) return []

  return parsedToolSegs.filter(parsed => {
    return !existingToolSegs.some(existing => {
      if (existing.name !== parsed.name) return false
      // Compare inputs: stringify both and check prefix overlap
      const existStr = typeof existing.input === 'string' ? existing.input : JSON.stringify(existing.input || {})
      const parsedStr = typeof parsed.input === 'string' ? parsed.input : JSON.stringify(parsed.input || {})
      // One is a prefix of the other (log truncates to 500 chars)
      const shorter = existStr.length <= parsedStr.length ? existStr : parsedStr
      const longer = existStr.length > parsedStr.length ? existStr : parsedStr
      return longer.startsWith(shorter.slice(0, 50))
    })
  })
}
