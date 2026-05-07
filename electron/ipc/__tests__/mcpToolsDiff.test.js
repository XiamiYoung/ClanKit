/**
 * Unit tests for the diff helpers in electron/ipc/mcp.js used by
 * mcp:save-config and tools:save-config to determine which IDs were removed
 * (and therefore must be pruned from agents).
 *
 * Pure logic only — does not exercise the IPC handler or AgentStore.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const { _extractMcpIds, _extractToolIds } = require('../mcp')

describe('_extractMcpIds', () => {
  it('returns IDs from an array of servers', () => {
    expect(_extractMcpIds([{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toEqual(['a', 'b', 'c'])
  })

  it('skips entries missing an id', () => {
    expect(_extractMcpIds([{ id: 'a' }, { name: 'no-id' }, { id: 'b' }])).toEqual(['a', 'b'])
  })

  it('returns [] for non-array input', () => {
    expect(_extractMcpIds(null)).toEqual([])
    expect(_extractMcpIds(undefined)).toEqual([])
    expect(_extractMcpIds({})).toEqual([])
    expect(_extractMcpIds('x')).toEqual([])
  })

  it('returns [] for an empty array', () => {
    expect(_extractMcpIds([])).toEqual([])
  })
})

describe('_extractToolIds', () => {
  it('returns the keys of the dict', () => {
    expect(_extractToolIds({ t1: {}, t2: {}, t3: {} })).toEqual(['t1', 't2', 't3'])
  })

  it('excludes the reserved __deletedBuiltins key', () => {
    expect(_extractToolIds({ t1: {}, __deletedBuiltins: ['builtin-x'], t2: {} })).toEqual(['t1', 't2'])
  })

  it('returns [] for null/undefined input', () => {
    expect(_extractToolIds(null)).toEqual([])
    expect(_extractToolIds(undefined)).toEqual([])
  })

  it('returns [] for an empty dict', () => {
    expect(_extractToolIds({})).toEqual([])
  })
})

describe('removed-ID diff (the pattern used in the IPC handler)', () => {
  it('mcp: detects servers present in prev but absent in next', () => {
    const prev = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const next = [{ id: 'a' }, { id: 'c' }]
    const prevIds = _extractMcpIds(prev)
    const nextIds = _extractMcpIds(next)
    const removed = prevIds.filter(id => !nextIds.includes(id))
    expect(removed).toEqual(['b'])
  })

  it('mcp: returns empty when only adding servers', () => {
    const prev = [{ id: 'a' }]
    const next = [{ id: 'a' }, { id: 'b' }]
    const removed = _extractMcpIds(prev).filter(id => !_extractMcpIds(next).includes(id))
    expect(removed).toEqual([])
  })

  it('tools: detects tools present in prev but absent in next', () => {
    const prev = { t1: {}, t2: {}, t3: {} }
    const next = { t1: {}, t3: {} }
    const removed = _extractToolIds(prev).filter(id => !_extractToolIds(next).includes(id))
    expect(removed).toEqual(['t2'])
  })

  it('tools: __deletedBuiltins changes do not count as removals', () => {
    const prev = { t1: {} }
    const next = { t1: {}, __deletedBuiltins: ['builtin-x'] }
    const removed = _extractToolIds(prev).filter(id => !_extractToolIds(next).includes(id))
    expect(removed).toEqual([])
  })
})
