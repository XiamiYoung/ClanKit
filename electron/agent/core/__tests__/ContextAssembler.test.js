// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { assemble } = require('../ContextAssembler')
const { _resetLearned } = require('../BudgetResolver')

beforeEach(() => _resetLearned())

const est = (m) => (m.content || '').length
const baseDeps = (over = {}) => ({
  chatStore: { getRunningSummary: () => null, saveRunningSummary: vi.fn(), searchFulltext: () => [] },
  utilityModelCaller: vi.fn(async () => 'SUM'),
  estimateTokens: est,
  ...over,
})

const U = (id, c) => ({ id, role: 'user', content: c, timestamp: id })
const A = (id, c) => ({ id, role: 'assistant', content: c, timestamp: id })

describe('assemble fast path', () => {
  it('returns messages unchanged when nothing is evicted (no summary/retrieval calls)', async () => {
    const deps = baseDeps()
    const messages = [U(1, 'hi'), A(2, 'yo')]
    const res = await assemble({
      messages, chatId: 'c1', agentKey: '__shared__',
      modelId: 'm', providerType: 'openai', modelContextWindow: 1000000, ...deps,
    })
    expect(res.messages).toEqual(messages)
    expect(deps.utilityModelCaller).not.toHaveBeenCalled()
    expect(deps.chatStore.saveRunningSummary).not.toHaveBeenCalled()
  })
})

describe('assemble with eviction (non-anthropic)', () => {
  it('prepends summary + retrieval blocks ahead of kept turns', async () => {
    const deps = baseDeps({
      chatStore: {
        getRunningSummary: () => null,
        saveRunningSummary: vi.fn(),
        searchFulltext: () => [{ id: 90, role: 'assistant', content: 'older relevant detail', timestamp: 1 }],
      },
    })
    // 3 turns of len-10 messages, small window forces eviction of older turns
    const messages = [U(1, 'a'.repeat(10)), A(2, 'b'.repeat(10)),
                      U(3, 'c'.repeat(10)), A(4, 'd'.repeat(10)),
                      U(5, 'detail please'), A(6, 'e'.repeat(10))]
    const res = await assemble({
      messages, chatId: 'c1', agentKey: '__shared__',
      modelId: 'm', providerType: 'openai', modelContextWindow: 60, ...deps,
    })
    expect(res.summaryStrategy).toBe('text')
    expect(res.messages[0].role).toBe('user')
    expect(JSON.stringify(res.messages[0])).toMatch(/SUM|older relevant detail/)
    // the final message preserves the most recent turn verbatim
    expect(res.messages[res.messages.length - 1]).toEqual(messages[messages.length - 1])
  })
})

describe('assemble anthropic native', () => {
  it('reports native strategy and injects no text summary', async () => {
    const deps = baseDeps()
    const messages = [U(1, 'a'.repeat(40)), A(2, 'b'.repeat(40)), U(3, 'c'.repeat(40)), A(4, 'd'.repeat(40))]
    const res = await assemble({
      messages, chatId: 'c1', agentKey: '__shared__',
      modelId: 'claude-x', providerType: 'anthropic', modelContextWindow: 40, ...deps,
    })
    expect(res.summaryStrategy).toBe('native')
    expect(deps.utilityModelCaller).not.toHaveBeenCalled()
  })
})
