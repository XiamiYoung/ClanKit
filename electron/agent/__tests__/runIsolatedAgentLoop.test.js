/**
 * Tests for withIsolatedAgentLoop — the AgentLoop entry-point Iron Law enforcer.
 *
 * Strategy (per LESSONS.md "Vitest 4.x" rules):
 *   - ESM test file using vitest
 *   - CJS production modules are monkey-patched at the module export level
 *     (vi.mock does NOT reliably intercept `require()` from CJS source files)
 *   - We never construct a real AgentLoop here; we replace the export with a
 *     stub that records constructor args and exposes a configurable run() result
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// ── Monkey-patch production singletons at the module-export level. ──────────
const agentLoopMod      = require('../agentLoop')
const ipcAgentMod       = require('../../ipc/agent')
const runtimeUtilsMod   = require('../../ipc/agentRuntimeUtils')

const originalAgentLoop      = agentLoopMod.AgentLoop
const originalRegister       = ipcAgentMod.registerLoop
const originalUnregister     = ipcAgentMod.unregisterLoop
const originalNormalize      = runtimeUtilsMod.normalizeLoopConfig
const originalValidate       = runtimeUtilsMod.validateLoopConfig

const { withIsolatedAgentLoop } = require('../runIsolatedAgentLoop')

beforeEach(() => {
  // Reset patches before each test
  agentLoopMod.AgentLoop          = class StubLoop {
    constructor(cfg) { this.cfg = cfg; StubLoop.lastConstructorArg = cfg }
  }
  ipcAgentMod.registerLoop        = vi.fn()
  ipcAgentMod.unregisterLoop      = vi.fn()
  runtimeUtilsMod.normalizeLoopConfig = vi.fn((cfg) => ({ ...cfg, _normalized: true }))
  runtimeUtilsMod.validateLoopConfig  = vi.fn(() => null) // null = valid
})

afterEach(() => {
  agentLoopMod.AgentLoop          = originalAgentLoop
  ipcAgentMod.registerLoop        = originalRegister
  ipcAgentMod.unregisterLoop      = originalUnregister
  runtimeUtilsMod.normalizeLoopConfig = originalNormalize
  runtimeUtilsMod.validateLoopConfig  = originalValidate
})

describe('withIsolatedAgentLoop', () => {
  it('normalizes the loopConfig before constructing AgentLoop', async () => {
    await withIsolatedAgentLoop({
      loopConfig:       { chatId: 'c1', customModel: 'foo' },
      registrationKey:  'c1:agent-a',
      registrationMeta: { chatId: 'c1', agentId: 'agent-a' },
      systemAgentId:    'agent-a',
    }, async () => 'ok')

    expect(runtimeUtilsMod.normalizeLoopConfig).toHaveBeenCalledWith(
      { chatId: 'c1', customModel: 'foo' },
      'agent-a',
    )
  })

  it('throws when validateLoopConfig returns an error string', async () => {
    runtimeUtilsMod.validateLoopConfig = vi.fn(() => 'missing apiKey')
    await expect(
      withIsolatedAgentLoop({
        loopConfig:       { chatId: 'c1' },
        registrationKey:  'c1:agent-a',
        registrationMeta: { chatId: 'c1', agentId: 'agent-a' },
      }, async () => 'should-not-run')
    ).rejects.toThrow(/missing apiKey/)
    // Helper threw BEFORE construction — must not have registered.
    expect(ipcAgentMod.registerLoop).not.toHaveBeenCalled()
    expect(ipcAgentMod.unregisterLoop).not.toHaveBeenCalled()
  })

  it('registers the loop under the given key BEFORE invoking the block', async () => {
    let registerCalledBeforeBlock = false
    await withIsolatedAgentLoop({
      loopConfig:       { chatId: 'c1' },
      registrationKey:  'c1:agent-a',
      registrationMeta: { chatId: 'c1', agentId: 'agent-a', agentName: 'A' },
    }, async () => {
      registerCalledBeforeBlock = ipcAgentMod.registerLoop.mock.calls.length === 1
    })
    expect(registerCalledBeforeBlock).toBe(true)
    expect(ipcAgentMod.registerLoop).toHaveBeenCalledTimes(1)
    expect(ipcAgentMod.registerLoop.mock.calls[0][0]).toBe('c1:agent-a')
    expect(ipcAgentMod.registerLoop.mock.calls[0][2]).toMatchObject({
      chatId: 'c1', agentId: 'agent-a', agentName: 'A',
    })
  })

  it('unregisters the loop in finally even when the block throws', async () => {
    await expect(
      withIsolatedAgentLoop({
        loopConfig:       { chatId: 'c1' },
        registrationKey:  'c1:agent-a',
        registrationMeta: { chatId: 'c1', agentId: 'agent-a' },
      }, async () => { throw new Error('boom') })
    ).rejects.toThrow(/boom/)
    expect(ipcAgentMod.unregisterLoop).toHaveBeenCalledWith('c1:agent-a')
  })

  it('returns whatever the block returns', async () => {
    const out = await withIsolatedAgentLoop({
      loopConfig:       { chatId: 'c1' },
      registrationKey:  'c1:agent-a',
      registrationMeta: { chatId: 'c1', agentId: 'agent-a' },
    }, async () => ({ content: 'hello' }))
    expect(out).toEqual({ content: 'hello' })
  })

  it('falls back to registrationMeta.agentId when systemAgentId is omitted', async () => {
    await withIsolatedAgentLoop({
      loopConfig:       { chatId: 'c1' },
      registrationKey:  'c1:agent-b',
      registrationMeta: { chatId: 'c1', agentId: 'agent-b' },
      // systemAgentId omitted
    }, async () => 'ok')
    expect(runtimeUtilsMod.normalizeLoopConfig).toHaveBeenCalledWith(
      { chatId: 'c1' },
      'agent-b',
    )
  })

  it('input-validates required args', async () => {
    await expect(withIsolatedAgentLoop({}, async () => {})).rejects.toThrow(/loopConfig is required/)
    await expect(withIsolatedAgentLoop({ loopConfig: {} }, async () => {})).rejects.toThrow(/registrationKey is required/)
    await expect(withIsolatedAgentLoop({ loopConfig: {}, registrationKey: 'k' }, null)).rejects.toThrow(/block must be an async function/)
  })
})
