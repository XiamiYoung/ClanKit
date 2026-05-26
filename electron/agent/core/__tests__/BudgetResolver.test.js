// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { resolveBudget, learnFromOverflow, _resetLearned } = require('../BudgetResolver')

beforeEach(() => _resetLearned())

describe('resolveBudget priority chain', () => {
  it('prefers a known window', () => {
    const b = resolveBudget({ modelId: 'x', providerType: 'openai', modelContextWindow: 400000 })
    expect(b.window).toBe(400000)
    expect(b.source).toBe('known')
  })

  it('uses a learned window over the fallback', () => {
    learnFromOverflow('qwen-max', 90000)
    const b = resolveBudget({ modelId: 'qwen-max', providerType: 'openai' })
    expect(b.window).toBe(90000)
    expect(b.source).toBe('learned')
  })

  it('falls back to 1M for anthropic, 200K for haiku, 128K otherwise', () => {
    expect(resolveBudget({ modelId: 'claude-sonnet-4-6', providerType: 'anthropic' }).window).toBe(1000000)
    expect(resolveBudget({ modelId: 'claude-haiku-4-5', providerType: 'anthropic' }).window).toBe(200000)
    expect(resolveBudget({ modelId: 'llama-3-70b', providerType: 'openai' }).window).toBe(128000)
    expect(resolveBudget({ modelId: 'llama-3-70b', providerType: 'openai' }).source).toBe('fallback')
  })

  it('splits the window 50/25/15/10', () => {
    const b = resolveBudget({ modelId: 'x', providerType: 'openai', modelContextWindow: 100000 })
    expect(b.verbatimBudget).toBe(50000)
    expect(b.summaryReserve).toBe(25000)
    expect(b.retrievalReserve).toBe(15000)
    expect(b.headroom).toBe(10000)
  })
})

describe('learnFromOverflow', () => {
  it('caches the ceiling and calls the persist callback once', () => {
    const persist = vi.fn()
    learnFromOverflow('m1', 120000, persist)
    expect(persist).toHaveBeenCalledWith('m1', 120000)
    expect(resolveBudget({ modelId: 'm1', providerType: 'openai' }).window).toBe(120000)
  })

  it('keeps the smaller ceiling on repeated overflow', () => {
    learnFromOverflow('m2', 120000)
    learnFromOverflow('m2', 90000)
    expect(resolveBudget({ modelId: 'm2', providerType: 'openai' }).window).toBe(90000)
  })
})
