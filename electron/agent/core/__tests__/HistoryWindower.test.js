// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { windowHistory } = require('../HistoryWindower')

// Deterministic estimator: 1 token per char of content.
const est = (m) => (m.content || '').length

const U = (c) => ({ role: 'user', content: c })
const A = (c) => ({ role: 'assistant', content: c })

describe('windowHistory', () => {
  it('keeps everything when it fits', () => {
    const msgs = [U('aa'), A('bb'), U('cc'), A('dd')]
    const { kept, evicted } = windowHistory(msgs, 100, { estimateTokens: est })
    expect(kept).toEqual(msgs)
    expect(evicted).toEqual([])
  })

  it('cuts on a turn boundary, never mid-turn', () => {
    // turns: [U1 A1] [U2 A2] [U3 A3], each msg len 10
    const msgs = [U('u'.repeat(10)), A('a'.repeat(10)),
                  U('v'.repeat(10)), A('b'.repeat(10)),
                  U('w'.repeat(10)), A('c'.repeat(10))]
    // budget 25 fits only the last turn (20) — second-to-last turn would push to 40
    const { kept, evicted } = windowHistory(msgs, 25, { estimateTokens: est })
    expect(kept).toEqual([msgs[4], msgs[5]])
    expect(evicted).toEqual([msgs[0], msgs[1], msgs[2], msgs[3]])
  })

  it('keeps at least the last turn even if it exceeds budget', () => {
    const msgs = [U('x'.repeat(100)), A('y'.repeat(100))]
    const { kept, evicted } = windowHistory(msgs, 10, { estimateTokens: est })
    expect(kept).toEqual(msgs)
    expect(evicted).toEqual([])
  })

  it('handles empty input', () => {
    expect(windowHistory([], 100, { estimateTokens: est })).toEqual({ kept: [], evicted: [] })
  })
})
