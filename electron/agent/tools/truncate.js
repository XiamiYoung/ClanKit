/**
 * truncate.js — output limiting for tool results.
 *
 * Two distinct policies, picked by call site:
 *
 *   truncateOutput(text)      — for EPHEMERAL output (shell, HTTP body, git).
 *                                Silently truncates at the limits below and
 *                                appends a "[Output truncated]" marker so the
 *                                LLM knows output was cut.
 *
 *   MAX_FILE_READ_BYTES       — hard ceiling for ADDRESSABLE file reads.
 *                                FileTool.read uses this as a refuse-to-read
 *                                threshold, not a silent-truncate threshold:
 *                                if a read would return more than this, the
 *                                tool errors and tells the model to paginate
 *                                via offset+limit. Rationale: files are
 *                                stable, line-addressable resources, so
 *                                "refuse + paginate" is cleaner than
 *                                "silently cut the middle".
 */

const DEFAULT_MAX_LINES = 2000
const DEFAULT_MAX_BYTES = 50 * 1024 // 50 KB — ephemeral output cap

// File-read cap. Picked at 1 MB to safely fit even CJK content into a 1M-token
// context window (≈350K tokens English / ≈500K tokens CJK) while still leaving
// room for the system prompt, tools, and conversation history. Files larger
// than this must be paginated by the model via offset+limit, NOT silently cut.
const MAX_FILE_READ_BYTES = 1024 * 1024 // 1 MB

/**
 * Truncate text to fit within line and byte limits.
 *
 * @param {string} text
 * @param {{ maxLines?: number, maxBytes?: number }} [opts]
 * @returns {{ text: string, truncated: boolean, totalLines: number, totalBytes: number }}
 */
function truncateOutput(text, opts = {}) {
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES

  if (!text) return { text: '', truncated: false, totalLines: 0, totalBytes: 0 }

  const totalBytes = Buffer.byteLength(text, 'utf8')
  const lines = text.split('\n')
  const totalLines = lines.length

  // Fast path: within both limits
  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return { text, truncated: false, totalLines, totalBytes }
  }

  // Walk lines accumulating bytes until a limit is hit
  let outLines = 0
  let outBytes = 0
  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line + '\n', 'utf8')
    if (outLines >= maxLines || outBytes + lineBytes > maxBytes) break
    outLines++
    outBytes += lineBytes
  }

  const kept = lines.slice(0, outLines).join('\n')
  const skippedLines = totalLines - outLines
  const notice = `\n[Output truncated: showing ${outLines}/${totalLines} lines, ${_kb(outBytes)}/${_kb(totalBytes)}. ${skippedLines} lines omitted.]`

  return {
    text: kept + notice,
    truncated: true,
    totalLines,
    totalBytes,
  }
}

function _kb(bytes) {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`
}

module.exports = { truncateOutput, DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES, MAX_FILE_READ_BYTES }
