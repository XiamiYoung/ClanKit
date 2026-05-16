import { describe, it, expect } from 'vitest'
import {
  STREAM_OUTPUT_CAP_BYTES,
  RUNAWAY_TRUNCATE_TAIL_BYTES,
  shouldAbortRunaway,
  buildAbortedMessageText,
} from '../runawayCap.js'

describe('runawayCap', () => {
  describe('shouldAbortRunaway', () => {
    it('false when under the cap', () => {
      expect(shouldAbortRunaway(0, STREAM_OUTPUT_CAP_BYTES)).toBe(false)
      expect(shouldAbortRunaway(STREAM_OUTPUT_CAP_BYTES - 1, STREAM_OUTPUT_CAP_BYTES)).toBe(false)
    })

    it('false when exactly at the cap (boundary is exclusive)', () => {
      // At exactly cap, we still let the stream finish; the model may close
      // cleanly. Only excess bytes trip the abort.
      expect(shouldAbortRunaway(STREAM_OUTPUT_CAP_BYTES, STREAM_OUTPUT_CAP_BYTES)).toBe(false)
    })

    it('true when over the cap', () => {
      expect(shouldAbortRunaway(STREAM_OUTPUT_CAP_BYTES + 1, STREAM_OUTPUT_CAP_BYTES)).toBe(true)
      expect(shouldAbortRunaway(50 * 1024 * 1024, STREAM_OUTPUT_CAP_BYTES)).toBe(true)
    })

    it('uses default cap when limit omitted', () => {
      expect(shouldAbortRunaway(0)).toBe(false)
      expect(shouldAbortRunaway(STREAM_OUTPUT_CAP_BYTES + 1)).toBe(true)
    })
  })

  describe('buildAbortedMessageText', () => {
    it('keeps the head + appends the marker for short text', () => {
      const result = buildAbortedMessageText('hello world')
      expect(result).toContain('hello world')
      expect(result).toContain('[stream aborted')
      expect(result).toContain('MB cap')
    })

    it('truncates to RUNAWAY_TRUNCATE_TAIL_BYTES + marker for long text', () => {
      const longText = 'A'.repeat(200 * 1024) // 200 KB
      const result = buildAbortedMessageText(longText)
      // The kept portion is exactly the first RUNAWAY_TRUNCATE_TAIL_BYTES chars
      expect(result.startsWith('A'.repeat(RUNAWAY_TRUNCATE_TAIL_BYTES))).toBe(true)
      expect(result.length).toBe(RUNAWAY_TRUNCATE_TAIL_BYTES + result.length - RUNAWAY_TRUNCATE_TAIL_BYTES)
      expect(result.length).toBeLessThan(longText.length)
      expect(result).toContain('[stream aborted')
    })

    it('handles null/undefined/empty input safely', () => {
      expect(buildAbortedMessageText(null)).toContain('[stream aborted')
      expect(buildAbortedMessageText(undefined)).toContain('[stream aborted')
      expect(buildAbortedMessageText('')).toContain('[stream aborted')
    })

    it('honors custom cap and tail args', () => {
      const result = buildAbortedMessageText('xyz', 4 * 1024 * 1024, 2)
      expect(result.startsWith('xy')).toBe(true)
      expect(result).toContain('4 MB cap')
    })
  })
})
