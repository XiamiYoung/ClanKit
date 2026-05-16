/**
 * runawayCap.js — client-side defense against provider-side runaway output.
 *
 * Some provider/model combinations (observed: deepseek-v4-flash on qwen) ignore
 * the max_tokens request parameter and stream millions of output tokens before
 * naturally stopping. Without a client-side guard this:
 *   - inflates a single assistant message to >10 MB on disk
 *   - causes the next iteration's request body to exceed provider limits (qwen
 *     rejects >6 MB with HTTP 400)
 *   - freezes the renderer when the chat reloads
 *
 * The cap is enforced in agentLoop.js's OpenAI and Anthropic streaming loops.
 * Bytes from text deltas + tool_call argument deltas + thinking deltas are
 * summed per single LLM call; crossing the cap aborts via AgentLoop.stop()
 * and emits a 'runaway_output_aborted' chunk for the UI banner.
 *
 * On abort the persisted assistant message is truncated to the first
 * RUNAWAY_TRUNCATE_TAIL_BYTES of text plus a marker, so the row never
 * triggers the read-side oversize defense on reload.
 */

// 2 MB per single LLM call. Picked because:
//   - qwen API rejects request bodies >6 MB. If output stays under 2 MB,
//     the next iteration's history + 2 MB tail leaves headroom under 6 MB.
//   - ~500K tokens of output — 5-10× larger than any legitimate response.
//   - Long markdown explanations top out around 200 KB; 2 MB is 10× safety.
const STREAM_OUTPUT_CAP_BYTES = 2 * 1024 * 1024

// On abort, keep the first 50 KB of text so the user can see what the model
// started writing before going off the rails. The remainder + a marker is
// dropped. 50 KB is large enough for a meaningful preview, small enough that
// the read-side OVERSIZE_CONTENT_THRESHOLD_BYTES (1 MB) never fires on the
// truncated message — i.e. aborted messages render normally on reload.
const RUNAWAY_TRUNCATE_TAIL_BYTES = 50 * 1024

/**
 * Returns true when the accumulated stream byte count crosses the cap.
 * Pure function — extracted for unit testability.
 */
function shouldAbortRunaway(streamedBytes, limit = STREAM_OUTPUT_CAP_BYTES) {
  return streamedBytes > limit
}

/**
 * Build the truncated text for the persisted assistant message after abort.
 * Keeps the first `tailBytes` of `currentText` (UTF-8 byte count would be more
 * accurate but JS string length is what we measured in streamedBytes already,
 * so we stay consistent) and appends a clear marker.
 */
function buildAbortedMessageText(currentText, capBytes = STREAM_OUTPUT_CAP_BYTES, tailBytes = RUNAWAY_TRUNCATE_TAIL_BYTES) {
  const marker = `\n\n[stream aborted: model output exceeded ${(capBytes / (1024 * 1024)).toFixed(0)} MB cap, preventing runaway]`
  const kept = (currentText || '').slice(0, tailBytes)
  return kept + marker
}

module.exports = {
  STREAM_OUTPUT_CAP_BYTES,
  RUNAWAY_TRUNCATE_TAIL_BYTES,
  shouldAbortRunaway,
  buildAbortedMessageText,
}
