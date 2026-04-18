/**
 * Normalize a recorded chunk stream so it is deterministic across runs.
 *
 *  - Tool call IDs (toolu_...) → index-based placeholders (tool_0, tool_1, ...)
 *  - permission_request.blockId (UUID) → block_0, block_1, ...
 *  - timestamp fields stripped
 *
 * The Go implementation will emit the same deterministic placeholders when
 * running under the recorder harness, so byte-for-byte JSON diff is meaningful.
 */
const TIMESTAMP_KEYS = new Set(['timestamp', 'ts', 'createdAt', 'updatedAt'])

function normalizeChunks(chunks) {
  const toolIdMap = new Map()
  const blockIdMap = new Map()

  return chunks.map((raw) => {
    const c = deepClone(raw)
    stripKeys(c, TIMESTAMP_KEYS)

    if (c.toolCallId) c.toolCallId = remap(toolIdMap, c.toolCallId, 'tool')
    if (c.type === 'permission_request' && c.blockId) {
      c.blockId = remap(blockIdMap, c.blockId, 'block')
    }
    return c
  })
}

function remap(map, id, prefix) {
  if (!map.has(id)) map.set(id, `${prefix}_${map.size}`)
  return map.get(id)
}

function stripKeys(obj, keys) {
  if (!obj || typeof obj !== 'object') return
  for (const k of Object.keys(obj)) {
    if (keys.has(k)) { delete obj[k]; continue }
    stripKeys(obj[k], keys)
  }
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v))
}

module.exports = { normalizeChunks }
