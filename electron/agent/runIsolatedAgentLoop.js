/**
 * AgentLoop entry-point Iron Law enforcer.
 *
 * Every code path that constructs `new AgentLoop(...)` MUST go through
 * `withIsolatedAgentLoop` so the 4 mechanical Iron Law clauses are guaranteed:
 *
 *   1. loopConfig is normalized via normalizeLoopConfig (provider/model resolution)
 *   2. loopConfig is validated via validateLoopConfig (credentials present, baseURL set)
 *   3. The loop is registered in ipcAgent.activeLoops under `registrationKey`
 *      BEFORE the user block runs (so `agent:stop` IPC can find and stop it)
 *   4. The loop is unregistered in `finally` (so Esc doesn't dangle a reference
 *      and chat.isRunning doesn't drift out of sync)
 *
 * What stays at the caller (intentionally NOT in the helper):
 *   - Cancellation UX. Each site has its own pre-run cancel shape
 *     (`pendingStops.has(chatId)` early-return that emits a fake `agent_end`
 *     chunk so the renderer can clear `chat.isRunning`). The helper can't
 *     guess the right chunk shape.
 *   - The actual loop method call. Most sites call `loop.run(...)` with 9 args,
 *     but `compactStandalone` is a different method on AgentLoop with 5 args.
 *     Caller invokes whichever method it needs inside the block.
 *   - Pre-run setup: RAG query, pending-memory injection, attachment shaping,
 *     accumulator construction.
 *   - Post-run cleanup: `agent_end` chunk emission, context snapshot capture
 *     (varies per site), usage accumulation, memory-extraction triggers,
 *     site-specific active maps like `_activeDocLoops`.
 *
 * Returning the helper "naked" instead of bundling pre/post setup avoids the
 * historical mistake of designing a "smart" wrapper that ends up with 20
 * boolean opts; each caller keeps full control of its own flow.
 *
 * @param {object}   opts
 * @param {object}   opts.loopConfig       Pre-built loop config (dataPath, chatId,
 *                                         customModel, sandboxConfig, etc.). Will
 *                                         be normalized by this helper.
 * @param {string}   opts.registrationKey  Key for ipcAgent.activeLoops. Conventions:
 *                                           - Solo  : `chatId`
 *                                           - Group : `chatId:agentId`
 *                                           - Subagt: `chatId:sub:<parentAgentId>:<uuid>`
 * @param {object}   opts.registrationMeta { chatId, agentId, agentName, isGroup,
 *                                          type?, parentAgentId? }. Mirrored into
 *                                          activeLoopMeta so the inspector / stop
 *                                          IPC can introspect each running loop.
 * @param {string}   [opts.systemAgentId]  Used by normalizeLoopConfig to look up
 *                                         provider/model from agents.json. Default:
 *                                         registrationMeta.agentId.
 * @param {function} block                 async (loop, normalizedConfig) => result.
 *                                         The caller's loop.run / loop.compactStandalone
 *                                         lives inside this block. Whatever it returns
 *                                         is returned to the caller.
 * @returns The value returned by `block`.
 * @throws  If loopConfig fails validation (missing apiKey / baseURL / etc.).
 */
async function withIsolatedAgentLoop(
  { loopConfig, registrationKey, registrationMeta, systemAgentId } = {},
  block,
) {
  if (!loopConfig || typeof loopConfig !== 'object') {
    throw new Error('withIsolatedAgentLoop: loopConfig is required')
  }
  if (!registrationKey || typeof registrationKey !== 'string') {
    throw new Error('withIsolatedAgentLoop: registrationKey is required')
  }
  if (typeof block !== 'function') {
    throw new Error('withIsolatedAgentLoop: block must be an async function')
  }

  // Lazy require — agentLoop.js indirectly requires ipc/agent.js (via tools),
  // and ipc/agent.js will require this helper. Lazy avoids the circular freeze.
  const { AgentLoop } = require('./agentLoop')
  const ipcAgent      = require('../ipc/agent')
  const { normalizeLoopConfig, validateLoopConfig } = require('../ipc/agentRuntimeUtils')

  const effectiveAgentId = systemAgentId ?? registrationMeta?.agentId ?? null
  const normalized = normalizeLoopConfig(loopConfig, effectiveAgentId)
  const credError  = validateLoopConfig(normalized)
  if (credError) {
    throw new Error(`AgentLoop config invalid: ${credError}`)
  }

  const loop = new AgentLoop(normalized)
  ipcAgent.registerLoop(registrationKey, loop, registrationMeta || {})
  try {
    return await block(loop, normalized)
  } finally {
    ipcAgent.unregisterLoop(registrationKey)
  }
}

module.exports = { withIsolatedAgentLoop }
