import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../logger', () => ({
  logger: {
    agent: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { ContextManager } from '../ContextManager.js'

describe('ContextManager — unknown window handling', () => {
  it('never auto-compacts when the window is unknown', () => {
    const cm = new ContextManager(null, null)
    cm.inputTokens = 500_000  // huge number
    expect(cm.shouldCompact()).toBe(false)
    expect(cm.isExhausted()).toBe(false)
  })

  it('getMetrics reports 0 maxTokens / 0 percentage when unknown', () => {
    const cm = new ContextManager(null, null)
    cm.inputTokens = 50_000
    const m = cm.getMetrics()
    expect(m.maxTokens).toBe(0)
    expect(m.percentage).toBe(0)
    expect(m.inputTokens).toBe(50_000)
  })

  it('localTrim becomes a no-op without forced estimatedTokens when window is unknown', () => {
    const cm = new ContextManager(null, null)
    const msgs = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: `msg${i}` }))
    const trimmed = cm.localTrim(msgs, 0)
    expect(trimmed.length).toBeLessThanOrEqual(msgs.length + 2)
  })

  it('pruneToolResults stage 2 (hard clear) never triggers when window is unknown', () => {
    const cm = new ContextManager(null, null)
    const bigToolResult = 'x'.repeat(50_000)
    const msgs = [
      { role: 'user', content: [{ type: 'tool_result', content: bigToolResult }] },
      { role: 'assistant', content: 'ok' },
      { role: 'assistant', content: 'ok' },
      { role: 'assistant', content: 'ok' },
    ]
    const pruned = cm.pruneToolResults(msgs)
    const hasHardClearMarker = JSON.stringify(pruned).includes('[Old tool result cleared]')
    expect(hasHardClearMarker).toBe(false)
  })
})

describe('ContextManager — known window handling', () => {
  it('computes thresholds from the supplied window', () => {
    const cm = new ContextManager(null, 100_000)
    expect(cm.compactTrigger).toBe(70_000)
    expect(cm.localTrimTarget).toBe(40_000)
    expect(cm.hasKnownContext).toBe(true)
  })

  it('shouldCompact fires above the 70% trigger', () => {
    const cm = new ContextManager(null, 100_000)
    cm.inputTokens = 60_000
    expect(cm.shouldCompact()).toBe(false)
    cm.inputTokens = 75_000
    expect(cm.shouldCompact()).toBe(true)
  })

  it('isExhausted fires above 90% of the window', () => {
    const cm = new ContextManager(null, 100_000)
    cm.inputTokens = 89_999
    expect(cm.isExhausted()).toBe(false)
    cm.inputTokens = 91_000
    expect(cm.isExhausted()).toBe(true)
  })

  it('getMetrics reports real percentage when known', () => {
    const cm = new ContextManager(null, 100_000)
    cm.inputTokens = 45_000
    cm.outputTokens = 1_000
    const m = cm.getMetrics()
    expect(m.maxTokens).toBe(100_000)
    expect(m.percentage).toBe(45)
  })
})
