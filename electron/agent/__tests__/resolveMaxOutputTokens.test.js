// @vitest-environment node
import { describe, it, expect } from 'vitest'

const { resolveMaxOutputTokens } = require('../agentLoop')

describe('resolveMaxOutputTokens', () => {
  it('returns defaultMax when configuredMax is missing', () => {
    expect(resolveMaxOutputTokens({ configuredMax: null,      defaultMax: 8000 })).toBe(8000)
    expect(resolveMaxOutputTokens({ configuredMax: undefined, defaultMax: 4096 })).toBe(4096)
    expect(resolveMaxOutputTokens({ configuredMax: 0,         defaultMax: 2048 })).toBe(2048)
  })

  it('clamps configuredMax to [1024, 98304] when provided', () => {
    expect(resolveMaxOutputTokens({ configuredMax: 100,    defaultMax: 8000 })).toBe(1024)
    expect(resolveMaxOutputTokens({ configuredMax: 200000, defaultMax: 8000 })).toBe(98304)
    expect(resolveMaxOutputTokens({ configuredMax: 32768,  defaultMax: 8000 })).toBe(32768)
  })

  it('ignores any legacy providerMax key passed through', () => {
    // Defensive: callers that still pass providerMax (e.g. stale plugins)
    // must not silently get capped. The argument is no longer read.
    expect(resolveMaxOutputTokens({ configuredMax: 32768, providerMax: 8192, defaultMax: 16000 })).toBe(32768)
    expect(resolveMaxOutputTokens({ configuredMax: null,  providerMax: 1,    defaultMax: 8000  })).toBe(8000)
  })
})
