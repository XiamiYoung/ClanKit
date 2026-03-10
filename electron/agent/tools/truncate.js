/**
 * truncate.js — unified output truncation for tool results.
 *
 * Two independent limits — whichever is hit first wins:
 *   - Line limit (default: 2000 lines)
 *   - Byte limit  (default: 50 KB)
 *
 * Returns the truncated string and a human-readable notice appended at the end
 * so the LLM knows output was cut.
 */

const DEFAULT_MAX_LINES = 2000
const DEFAULT_MAX_BYTES = 50 * 1024 // 50 KB

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

module.exports = { truncateOutput, DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES }
