// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { estimateTokens, estimateMessageTokens } = require('../tokenEstimate')

describe('estimateTokens', () => {
  it('estimates a string at ~length/4', () => {
    expect(estimateTokens('a'.repeat(40))).toBe(10)
  })
  it('handles empty / null', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens(null)).toBe(0)
  })
  it('serializes non-strings before estimating', () => {
    const obj = { role: 'user', content: 'x'.repeat(36) }
    expect(estimateMessageTokens(obj)).toBe(Math.ceil(JSON.stringify(obj).length / 4))
  })
})
