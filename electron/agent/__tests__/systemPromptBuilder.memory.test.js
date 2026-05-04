/**
 * systemPromptBuilder memory-handling tests.
 *
 * Covers the pure-logic paths that don't need a live MemoryStore:
 *   - prepareMemoryContent size-gating
 *   - prepareMemoryContentSmart with no query (falls through to size-gating)
 *   - extractKeySections boundary behaviour
 *
 * Retrieval-driven paths (resolveMemoryContentForPrompt, retrieveTopKMemoryContent
 * with a query) require a real SQLite DB and are exercised at runtime —
 * matching the existing HistoryIndex pattern (no native deps in vitest).
 */
import { describe, it, expect } from 'vitest'

const { prepareMemoryContent, prepareMemoryContentSmart, extractKeySections, MEMORY_KEY_SECTIONS } = require('../systemPromptBuilder')

const SMALL_MEMORY = `# Memory: A
> Last updated: 2026-04-27Z

## Preferences
- Likes tea
`

function bigMemory(repeats = 200) {
  // Make sure this is > 4KB so the size-gating triggers.
  const block = `\n## Preferences\n${'- some preference line that is long enough to count\n'.repeat(repeats)}`
  return `# Memory: B\n> Last updated: 2026-04-27Z\n${block}\n## Mental Models\n- A model\n`
}

const HUGE_MEMORY = bigMemory(1000)  // > 16KB

describe('prepareMemoryContent (size-gated)', () => {
  it('returns full content for memories under 4KB', () => {
    const out = prepareMemoryContent(SMALL_MEMORY)
    expect(out).toBe(SMALL_MEMORY)
  })

  it('extracts key sections only for memories between 4KB and 16KB', () => {
    const big = bigMemory(150)  // ~6-8KB
    const size = Buffer.byteLength(big, 'utf8')
    expect(size).toBeGreaterThan(4096)
    expect(size).toBeLessThan(16384)
    const out = prepareMemoryContent(big)
    expect(out).toContain('## Preferences')
    expect(out).toContain('Some sections omitted')
  })

  it('appends a pruning warning for memories over 16KB', () => {
    const out = prepareMemoryContent(HUGE_MEMORY)
    expect(out).toMatch(/Memory is large.*pruning/)
  })

  it('returns null for empty input', () => {
    expect(prepareMemoryContent(null)).toBe(null)
    expect(prepareMemoryContent('')).toBe(null)
  })
})

describe('prepareMemoryContentSmart (no-query fallback)', () => {
  it('returns full content for small memories regardless of query', async () => {
    const out = await prepareMemoryContentSmart(SMALL_MEMORY, 'a', 'system', 'whatever query')
    expect(out).toBe(SMALL_MEMORY)
  })

  it('falls through to extractKeySections when no query provided and size is in 4-16KB range', async () => {
    const big = bigMemory(150)
    const out = await prepareMemoryContentSmart(big, 'a', 'system', null)
    expect(out).toContain('## Preferences')
    expect(out).toContain('Some sections omitted')
  })

  it('falls through to warning-suffixed key sections for memories over 16KB without query', async () => {
    const out = await prepareMemoryContentSmart(HUGE_MEMORY, 'a', 'system', '')
    expect(out).toMatch(/Memory is large/)
  })

  it('returns null for empty content', async () => {
    expect(await prepareMemoryContentSmart(null, 'a', 'system', 'q')).toBe(null)
    expect(await prepareMemoryContentSmart('', 'a', 'system', 'q')).toBe(null)
  })
})

describe('extractKeySections', () => {
  it('preserves all MEMORY_KEY_SECTIONS when present', () => {
    const lines = ['# Memory: A', '> Last updated: x']
    for (const s of MEMORY_KEY_SECTIONS) {
      lines.push(`## ${s}`)
      lines.push(`- entry in ${s}`)
    }
    lines.push('## Memory Updates Log')   // not in key sections
    lines.push('- log entry')
    const md = lines.join('\n')

    const out = extractKeySections(md)
    for (const s of MEMORY_KEY_SECTIONS) {
      expect(out).toContain(`## ${s}`)
    }
    expect(out).not.toContain('## Memory Updates Log')
    expect(out).not.toContain('log entry')
  })

  it('preserves the title and timestamp header', () => {
    const md = `# Memory: Alice\n> Last updated: 2026-01-01\n\n## Preferences\n- Foo`
    const out = extractKeySections(md)
    expect(out).toContain('# Memory: Alice')
    expect(out).toContain('> Last updated: 2026-01-01')
  })
})
