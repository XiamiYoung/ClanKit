// @vitest-environment node
import { describe, it, expect } from 'vitest'

const { resolveMaxOutputTokens } = require('../agentLoop')

describe('resolveMaxOutputTokens', () => {
  it('returns defaultMax when configuredMax is missing', () => {
    expect(resolveMaxOutputTokens({ configuredMax: null,      providerMax: null, defaultMax: 8000 })).toBe(8000)
    expect(resolveMaxOutputTokens({ configuredMax: undefined, providerMax: null, defaultMax: 4096 })).toBe(4096)
    expect(resolveMaxOutputTokens({ configuredMax: 0,         providerMax: null, defaultMax: 2048 })).toBe(2048)
  })

  it('clamps configuredMax to [1024, 98304] when provided', () => {
    expect(resolveMaxOutputTokens({ configuredMax: 100,    providerMax: null, defaultMax: 8000 })).toBe(1024)
    expect(resolveMaxOutputTokens({ configuredMax: 200000, providerMax: null, defaultMax: 8000 })).toBe(98304)
    expect(resolveMaxOutputTokens({ configuredMax: 32768,  providerMax: null, defaultMax: 8000 })).toBe(32768)
  })

  it('caps result by providerMax when smaller (silent cap — load-bearing)', () => {
    expect(resolveMaxOutputTokens({ configuredMax: 32768, providerMax: 8192, defaultMax: 16000 })).toBe(8192)
    expect(resolveMaxOutputTokens({ configuredMax: null,  providerMax: 1,    defaultMax: 8000  })).toBe(1)
  })

  it('does not apply providerMax when it is missing or larger than configured', () => {
    expect(resolveMaxOutputTokens({ configuredMax: 4096, providerMax: null,  defaultMax: 8000 })).toBe(4096)
    expect(resolveMaxOutputTokens({ configuredMax: 4096, providerMax: 0,     defaultMax: 8000 })).toBe(4096)
    expect(resolveMaxOutputTokens({ configuredMax: 4096, providerMax: 65536, defaultMax: 8000 })).toBe(4096)
  })
})
