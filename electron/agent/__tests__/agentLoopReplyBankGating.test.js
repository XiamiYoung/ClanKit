// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Test the Reply Bank mode gate.
// Strategy: monkey-patch ReplyBank.getInstance + ds.paths so we don't load
// the native vector-store layer. Then call the exported helper directly.

const replyBankMod = require('../../memory/ReplyBank')
const ds = require('../../lib/dataStore')

describe('AgentLoop Reply Bank mode gating', () => {
  let origGetInstance
  let origPaths
  let origFormatFewShotBlock
  let hasSpy, retrieveSpy, formatSpy

  beforeEach(() => {
    origPaths = ds.paths
    ds.paths = () => ({ AGENT_MEMORY_DIR: '/tmp/fake-mem' })

    hasSpy = vi.fn(() => true)
    retrieveSpy = vi.fn(async () => [
      { trigger: 'hi', reply: 'hey there!' }
    ])
    formatSpy = vi.fn(() => '## REAL REPLY EXAMPLES\nhey there!')

    origGetInstance = replyBankMod.getInstance
    replyBankMod.getInstance = () => ({ has: hasSpy, retrieve: retrieveSpy })

    origFormatFewShotBlock = replyBankMod.formatFewShotBlock
    replyBankMod.formatFewShotBlock = formatSpy
  })

  afterEach(() => {
    replyBankMod.getInstance = origGetInstance
    replyBankMod.formatFewShotBlock = origFormatFewShotBlock
    ds.paths = origPaths
  })

  it('roleplay mode (chat) calls retrieve and appends the few-shot block', async () => {
    const { _maybeInjectReplyBank } = require('../agentLoop')
    const messages = [{ role: 'user', content: 'hi' }]
    const result = await _maybeInjectReplyBank('agent-1', messages, 'chat', 'BASE PROMPT')
    expect(retrieveSpy).toHaveBeenCalledOnce()
    expect(result).toContain('REAL REPLY EXAMPLES')
  })

  it('productivity mode does NOT call retrieve and returns prompt unchanged', async () => {
    const { _maybeInjectReplyBank } = require('../agentLoop')
    const messages = [{ role: 'user', content: 'hi' }]
    const result = await _maybeInjectReplyBank('agent-1', messages, 'productivity', 'BASE PROMPT')
    expect(retrieveSpy).not.toHaveBeenCalled()
    expect(result).toBe('BASE PROMPT')
  })

  it('roleplay mode with no agent id is a no-op', async () => {
    const { _maybeInjectReplyBank } = require('../agentLoop')
    const messages = [{ role: 'user', content: 'hi' }]
    const result = await _maybeInjectReplyBank(null, messages, 'chat', 'BASE PROMPT')
    expect(retrieveSpy).not.toHaveBeenCalled()
    expect(result).toBe('BASE PROMPT')
  })
})
