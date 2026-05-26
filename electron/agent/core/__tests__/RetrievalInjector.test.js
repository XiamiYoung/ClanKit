// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { retrieve, sanitizeFtsQuery, normalizeContent } = require('../RetrievalInjector')

describe('sanitizeFtsQuery', () => {
  it('OR-joins quoted ASCII words (>=3 chars), stripping FTS operators/quotes', () => {
    expect(sanitizeFtsQuery('the "plan" AND budget*')).toBe('"the" OR "plan" OR "AND" OR "budget"')
  })
  it('windows CJK runs into 3-grams (no whitespace to split on)', () => {
    expect(sanitizeFtsQuery('项目代号')).toBe('"项目代" OR "目代号"')
  })
  it('handles mixed CJK + ASCII', () => {
    expect(sanitizeFtsQuery('项目代号 BlueFalcon')).toBe('"项目代" OR "目代号" OR "BlueFalcon"')
  })
  it('returns empty for operator-only / empty / too-short input', () => {
    expect(sanitizeFtsQuery('   ')).toBe('')
    expect(sanitizeFtsQuery('"" *')).toBe('')
    expect(sanitizeFtsQuery('a 我')).toBe('') // both below 3-char trigram minimum
  })
})

describe('normalizeContent', () => {
  it('strips a leading [Name]: speaker prefix and trims', () => {
    expect(normalizeContent('[薛哥]: 你好')).toBe('你好')
    expect(normalizeContent('  plain text  ')).toBe('plain text')
  })
})

describe('retrieve', () => {
  const store = {
    searchFulltext: vi.fn(() => ([
      { id: 'm-old', role: 'assistant', content: 'we chose plan B for the budget', timestamp: 10 },
      { id: 'm-kept', role: 'user', content: 'irrelevant', timestamp: 99 },
    ])),
  }

  it('returns older hits, excluding ones already in the verbatim window (by content)', async () => {
    const out = await retrieve({
      chatId: 'c1', query: 'what was the plan', excludeContents: new Set(['irrelevant']),
      budget: 1000, chatStore: store,
    })
    expect(out.retrievalBlock).toContain('plan B')
    expect(out.retrievalBlock).not.toContain('irrelevant')
  })

  it('returns empty block when query sanitizes to nothing', async () => {
    const out = await retrieve({ chatId: 'c1', query: '   ', excludeContents: new Set(), budget: 1000, chatStore: store })
    expect(out.retrievalBlock).toBe('')
  })

  it('returns empty block when no hits', async () => {
    const empty = { searchFulltext: vi.fn(() => []) }
    const out = await retrieve({ chatId: 'c1', query: 'xyz query here', excludeContents: new Set(), budget: 1000, chatStore: empty })
    expect(out.retrievalBlock).toBe('')
  })
})
