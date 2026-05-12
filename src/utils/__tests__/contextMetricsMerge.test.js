import { describe, it, expect } from 'vitest'
import { mergeContextMetrics } from '../contextMetricsMerge'

describe('mergeContextMetrics', () => {
  it('returns incoming when there is no existing', () => {
    const incoming = { inputTokens: 100, outputTokens: 50, maxTokens: 1000, percentage: 10 }
    expect(mergeContextMetrics(null, incoming)).toEqual(incoming)
  })

  it('returns existing when incoming is null/undefined', () => {
    const existing = { inputTokens: 100, outputTokens: 50 }
    expect(mergeContextMetrics(existing, null)).toEqual(existing)
    expect(mergeContextMetrics(existing, undefined)).toEqual(existing)
  })

  it('returns incoming verbatim when it has real token data', () => {
    const existing = { inputTokens: 100, outputTokens: 50, percentage: 10 }
    const incoming = { inputTokens: 200, outputTokens: 80, percentage: 20 }
    expect(mergeContextMetrics(existing, incoming)).toEqual(incoming)
  })

  it('keeps existing tokens when incoming is the all-zero placeholder', () => {
    // This is the exact bug case — agentLoop emitting fresh-ContextManager zeros
    const existing = {
      inputTokens: 32000, outputTokens: 5000, percentage: 3,
      cacheReadInputTokens: 28000, cacheCreationInputTokens: 0,
      maxTokens: 1000000, compactionCount: 0,
    }
    const placeholder = {
      inputTokens: 0, outputTokens: 0, percentage: 0,
      cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
      maxTokens: 1000000, compactionCount: 0,
    }
    const merged = mergeContextMetrics(existing, placeholder)
    expect(merged.inputTokens).toBe(32000)
    expect(merged.outputTokens).toBe(5000)
    expect(merged.cacheReadInputTokens).toBe(28000)
    expect(merged.percentage).toBe(3)
  })

  it('lets maxTokens through even when the rest of incoming is zero', () => {
    const existing = { inputTokens: 100, outputTokens: 50, maxTokens: 100000 }
    const incoming = { inputTokens: 0, outputTokens: 0, maxTokens: 200000 }
    const merged = mergeContextMetrics(existing, incoming)
    expect(merged.maxTokens).toBe(200000)
    expect(merged.inputTokens).toBe(100)
  })

  it('lets compactionCount increment through even when other fields are zero', () => {
    const existing = { inputTokens: 100, outputTokens: 50, compactionCount: 1 }
    const incoming = { inputTokens: 0, outputTokens: 0, compactionCount: 2 }
    const merged = mergeContextMetrics(existing, incoming)
    expect(merged.compactionCount).toBe(2)
    expect(merged.inputTokens).toBe(100)
  })

  it('treats cache-read-only incoming as real data (not a placeholder)', () => {
    // Caching means raw inputTokens can be tiny but cache_read is large —
    // this is a legitimate update, not the zero placeholder
    const existing = { inputTokens: 100, outputTokens: 50 }
    const incoming = {
      inputTokens: 0, outputTokens: 0,
      cacheReadInputTokens: 5000, cacheCreationInputTokens: 0,
    }
    const merged = mergeContextMetrics(existing, incoming)
    expect(merged).toEqual(incoming)
  })

  it('treats incoming with outputTokens only as real data', () => {
    const existing = { inputTokens: 100, outputTokens: 50 }
    const incoming = { inputTokens: 0, outputTokens: 200 }
    expect(mergeContextMetrics(existing, incoming)).toEqual(incoming)
  })
})
