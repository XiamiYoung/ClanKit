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

// Lines that look like leftover fragments of a buildToolLog() dump whose leading
// entry header(s) were dropped (e.g. model echoed entries 3-6 only, leaving the
// truncated payload tail of entry 2 dangling above entry 3). Used to widen the
// strip window in the unwrapped fallback path so JSON debris doesn't leak into
// the rendered bubble.
const RESIDUE_FIELD_RE = /"(?:text|exit_code|truncated|totalLines|totalBytes|replaced|path)"\s*:/
const RESIDUE_ARROW_RE = /\)\s*→\s*[{"]/
const RESIDUE_PUNCT_ONLY_RE = /^[\s){}\[\]"',.;]+$/

function looksLikeToolLogResidue(line) {
  const t = line.trim()
  if (!t) return true
  if (RESIDUE_FIELD_RE.test(t)) return true
  if (RESIDUE_ARROW_RE.test(t)) return true
  if (RESIDUE_PUNCT_ONLY_RE.test(t)) return true
  return false
}

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
 * Walk an array of lines and group them into tool-log entries.
 * An entry starts whenever the trimmed line matches ENTRY_HEADER_RE; following
 * lines that don't match a new header are treated as continuation of the
 * previous entry's (multi-line) output.
 * @param {string[]} lines
 * @returns {Array<{ name: string, input: object|string, output: string, success: boolean }>}
 */
function parseEntriesFromLines(lines) {
  const entries = []
  let currentEntry = ''
  for (const line of lines) {
    if (ENTRY_HEADER_RE.test(line.trim())) {
      if (currentEntry) {
        const parsed = parseEntry(currentEntry.trim())
        if (parsed) entries.push(parsed)
      }
      currentEntry = line.trim()
    } else if (currentEntry) {
      currentEntry += '\n' + line
    }
  }
  if (currentEntry) {
    const parsed = parseEntry(currentEntry.trim())
    if (parsed) entries.push(parsed)
  }
  return entries
}

function toToolSegments(entries) {
  return entries.map(t => ({
    type: 'tool',
    name: t.name,
    input: t.input,
    output: t.output || (t.success ? 'Success' : 'Error'),
    _fromLog: true,
    toolCallId: null,
  }))
}

/**
 * Parse tool execution log blocks from text content.
 *
 * Two formats are recognized:
 *   1. Wrapped: `[Tool execution log from this response:\n…\n]` — the canonical
 *      form emitted by buildToolLog().
 *   2. Unwrapped: a tail run of bare entries (`N. ✓/✗ name(…) → …`) without the
 *      surrounding tags. Models sometimes echo the log this way, leaking the
 *      JSON dump into the rendered text bubble. Requires ≥2 consecutive entries
 *      to avoid stripping innocuous prose like a single "1. ✓ build()".
 *
 * @param {string} text - Message text potentially containing tool log blocks
 * @returns {{ cleanedText: string, parsedTools: Array<{ type: 'tool', name: string, input: object|string, output: string, _fromLog: boolean }> } | null}
 *   Returns null if no log block is found.
 */
export function parseToolLogBlock(text) {
  if (!text) return null

  if (text.includes('[Tool execution log from this response:')) {
    const parsedTools = []
    const cleanedText = text.replace(TOOL_LOG_BLOCK_RE, (match, body) => {
      parsedTools.push(...parseEntriesFromLines(body.split('\n')))
      return ''
    }).replace(/\n{3,}/g, '\n\n').trim()

    if (parsedTools.length === 0 && cleanedText === text.trim()) return null

    return { cleanedText, parsedTools: toToolSegments(parsedTools) }
  }

  // Fallback: unwrapped tail run of ≥2 bare entries.
  const lines = text.split('\n')
  let firstEntryIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (ENTRY_HEADER_RE.test(lines[i].trim())) { firstEntryIdx = i; break }
  }
  if (firstEntryIdx < 0) return null

  const tailEntries = parseEntriesFromLines(lines.slice(firstEntryIdx))
  if (tailEntries.length < 2) return null

  // When the model echoes only entries N..M (not from 1), the truncated tail of
  // entry N-1 — JSON debris like `}...')"]}) → {` and `"exit_code": 0` — sits
  // immediately above the first detected header. Walk backward past contiguous
  // residue lines so they don't leak into the rendered bubble as prose.
  let stripFrom = firstEntryIdx
  while (stripFrom > 0 && looksLikeToolLogResidue(lines[stripFrom - 1])) {
    stripFrom--
  }

  const cleanedText = lines.slice(0, stripFrom).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { cleanedText, parsedTools: toToolSegments(tailEntries) }
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
