// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { sliceFromLastCompaction } = require('../messageConverter')

// Compaction checkpoint = a contiguous block of compaction-tagged messages
// (user marker + assistant summary [+ system banner]) inserted by the renderer.
// sliceFromLastCompaction returns [checkpoint block ...everything after], so the
// model sees [summary + recent], not the full pre-checkpoint history.

const U = (c, extra = {}) => ({ role: 'user', content: c, ...extra })
const A = (c, extra = {}) => ({ role: 'assistant', content: c, ...extra })

describe('sliceFromLastCompaction', () => {
  it('returns messages unchanged when there is no checkpoint', () => {
    const msgs = [U('q1'), A('a1'), U('q2')]
    expect(sliceFromLastCompaction(msgs, 'agent-1')).toEqual(msgs)
  })

  it('slices from the last checkpoint, dropping pre-checkpoint history', () => {
    const msgs = [
      U('old1'), A('old2'), U('old3'), A('old4'),
      U('[Context compaction requested]', { compaction: true, _compactionAgentId: 'agent-1' }),
      A('SUMMARY of old1-4', { compaction: true, _compactionAgentId: 'agent-1' }),
      U('new question'), A('new answer'),
    ]
    const out = sliceFromLastCompaction(msgs, 'agent-1')
    expect(out).toEqual([
      U('[Context compaction requested]', { compaction: true, _compactionAgentId: 'agent-1' }),
      A('SUMMARY of old1-4', { compaction: true, _compactionAgentId: 'agent-1' }),
      U('new question'), A('new answer'),
    ])
  })

  it('uses the LAST checkpoint when multiple exist', () => {
    const msgs = [
      U('a'), A('b'),
      U('[Context compaction requested]', { compaction: true, _compactionAgentId: 'x' }),
      A('SUMMARY 1', { compaction: true, _compactionAgentId: 'x' }),
      U('mid'), A('mid2'),
      U('[Context compaction requested]', { compaction: true, _compactionAgentId: 'x' }),
      A('SUMMARY 2', { compaction: true, _compactionAgentId: 'x' }),
      U('latest'),
    ]
    const out = sliceFromLastCompaction(msgs, 'x')
    expect(out[0].content).toBe('[Context compaction requested]')
    expect(out[1].content).toBe('SUMMARY 2')
    expect(out[out.length - 1].content).toBe('latest')
    expect(out).toHaveLength(3)
  })

  it('ignores another agent\'s checkpoint', () => {
    const msgs = [
      U('a'), A('b'),
      U('[Context compaction requested]', { compaction: true, _compactionAgentId: 'other' }),
      A('OTHER SUMMARY', { compaction: true, _compactionAgentId: 'other' }),
      U('c'),
    ]
    // No checkpoint for 'mine' → unchanged
    expect(sliceFromLastCompaction(msgs, 'mine')).toEqual(msgs)
  })

  it('treats a null _compactionAgentId checkpoint as shared (matches any agent)', () => {
    const msgs = [
      U('a'), A('b'),
      U('[Context compaction requested]', { compaction: true, _compactionAgentId: null }),
      A('SHARED SUMMARY', { compaction: true, _compactionAgentId: null }),
      U('c'),
    ]
    const out = sliceFromLastCompaction(msgs, 'anyone')
    expect(out[1].content).toBe('SHARED SUMMARY')
    expect(out).toHaveLength(3)
  })

  it('keeps a contiguous checkpoint block including a system banner', () => {
    const msgs = [
      U('old'), A('old2'),
      U('[Context compaction requested]', { compaction: true, _compactionAgentId: 'x' }),
      A('SUMMARY', { compaction: true, _compactionAgentId: 'x' }),
      { role: 'system', content: 'Context compacted', compaction: true, _compactionAgentId: 'x' },
      U('next'),
    ]
    const out = sliceFromLastCompaction(msgs, 'x')
    expect(out[0].content).toBe('[Context compaction requested]')
    expect(out.length).toBe(4) // marker + summary + banner + next
  })
})
