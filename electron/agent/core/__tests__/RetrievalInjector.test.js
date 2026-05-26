// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { retrieve, sanitizeFtsQuery } = require('../RetrievalInjector')

describe('sanitizeFtsQuery', () => {
  it('quotes terms and strips FTS operators / quotes', () => {
    expect(sanitizeFtsQuery('the "plan" AND budget*')).toBe('"the" "plan" "AND" "budget"')
  })
  it('returns empty for operator-only / empty input', () => {
    expect(sanitizeFtsQuery('   ')).toBe('')
    expect(sanitizeFtsQuery('"" *')).toBe('')
  })
})

describe('retrieve', () => {
  const store = {
    searchFulltext: vi.fn(() => ([
      { id: 'm-old', role: 'assistant', content: 'we chose plan B for the budget', timestamp: 10 },
      { id: 'm-kept', role: 'user', content: 'irrelevant', timestamp: 99 },
    ])),
  }

  it('returns a block of older hits, excluding verbatim-window ids', async () => {
    const out = await retrieve({
      chatId: 'c1', query: 'what was the plan', excludeIds: new Set(['m-kept']),
      budget: 1000, chatStore: store,
    })
    expect(out.retrievalBlock).toContain('plan B')
    expect(out.retrievalBlock).not.toContain('irrelevant')
  })

  it('returns empty block when query sanitizes to nothing', async () => {
    const out = await retrieve({ chatId: 'c1', query: '   ', excludeIds: new Set(), budget: 1000, chatStore: store })
    expect(out.retrievalBlock).toBe('')
  })

  it('returns empty block when no hits', async () => {
    const empty = { searchFulltext: vi.fn(() => []) }
    const out = await retrieve({ chatId: 'c1', query: 'xyz', excludeIds: new Set(), budget: 1000, chatStore: empty })
    expect(out.retrievalBlock).toBe('')
  })
})
