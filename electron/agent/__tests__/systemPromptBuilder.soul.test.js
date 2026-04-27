/**
 * systemPromptBuilder soul-handling tests.
 *
 * Covers the pure-logic paths that don't need a live SoulStore:
 *   - prepareSoulContent size-gating
 *   - prepareSoulContentSmart with no query (falls through to size-gating)
 *   - extractKeySections boundary behaviour
 *
 * Retrieval-driven paths (resolveSoulContentForPrompt, retrieveTopKSoulContent
 * with a query) require a real SQLite DB and are exercised at runtime —
 * matching the existing HistoryIndex pattern (no native deps in vitest).
 */
import { describe, it, expect } from 'vitest'

const { prepareSoulContent, prepareSoulContentSmart, extractKeySections, SOUL_KEY_SECTIONS } = require('../systemPromptBuilder')

const SMALL_SOUL = `# Soul: A
> Last updated: 2026-04-27Z

## Preferences
- Likes tea
`

function bigSoul(repeats = 200) {
  // Make sure this is > 4KB so the size-gating triggers.
  const block = `\n## Preferences\n${'- some preference line that is long enough to count\n'.repeat(repeats)}`
  return `# Soul: B\n> Last updated: 2026-04-27Z\n${block}\n## Mental Models\n- A model\n`
}

const HUGE_SOUL = bigSoul(1000)  // > 16KB

describe('prepareSoulContent (size-gated)', () => {
  it('returns full content for souls under 4KB', () => {
    const out = prepareSoulContent(SMALL_SOUL)
    expect(out).toBe(SMALL_SOUL)
  })

  it('extracts key sections only for souls between 4KB and 16KB', () => {
    const big = bigSoul(150)  // ~6-8KB
    const size = Buffer.byteLength(big, 'utf8')
    expect(size).toBeGreaterThan(4096)
    expect(size).toBeLessThan(16384)
    const out = prepareSoulContent(big)
    expect(out).toContain('## Preferences')
    expect(out).toContain('Some sections omitted')
  })

  it('appends a pruning warning for souls over 16KB', () => {
    const out = prepareSoulContent(HUGE_SOUL)
    expect(out).toMatch(/Soul memory is large.*pruning/)
  })

  it('returns null for empty input', () => {
    expect(prepareSoulContent(null)).toBe(null)
    expect(prepareSoulContent('')).toBe(null)
  })
})

describe('prepareSoulContentSmart (no-query fallback)', () => {
  it('returns full content for small souls regardless of query', async () => {
    const out = await prepareSoulContentSmart(SMALL_SOUL, 'a', 'system', 'whatever query')
    expect(out).toBe(SMALL_SOUL)
  })

  it('falls through to extractKeySections when no query provided and size is in 4-16KB range', async () => {
    const big = bigSoul(150)
    const out = await prepareSoulContentSmart(big, 'a', 'system', null)
    expect(out).toContain('## Preferences')
    expect(out).toContain('Some sections omitted')
  })

  it('falls through to warning-suffixed key sections for souls over 16KB without query', async () => {
    const out = await prepareSoulContentSmart(HUGE_SOUL, 'a', 'system', '')
    expect(out).toMatch(/Soul memory is large/)
  })

  it('returns null for empty content', async () => {
    expect(await prepareSoulContentSmart(null, 'a', 'system', 'q')).toBe(null)
    expect(await prepareSoulContentSmart('', 'a', 'system', 'q')).toBe(null)
  })
})

describe('extractKeySections', () => {
  it('preserves all SOUL_KEY_SECTIONS when present', () => {
    const lines = ['# Soul: A', '> Last updated: x']
    for (const s of SOUL_KEY_SECTIONS) {
      lines.push(`## ${s}`)
      lines.push(`- entry in ${s}`)
    }
    lines.push('## Memory Updates Log')   // not in key sections
    lines.push('- log entry')
    const md = lines.join('\n')

    const out = extractKeySections(md)
    for (const s of SOUL_KEY_SECTIONS) {
      expect(out).toContain(`## ${s}`)
    }
    expect(out).not.toContain('## Memory Updates Log')
    expect(out).not.toContain('log entry')
  })

  it('preserves the title and timestamp header', () => {
    const md = `# Soul: Alice\n> Last updated: 2026-01-01\n\n## Preferences\n- Foo`
    const out = extractKeySections(md)
    expect(out).toContain('# Soul: Alice')
    expect(out).toContain('> Last updated: 2026-01-01')
  })
})
