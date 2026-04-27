/**
 * soulMarkdown unit tests — pure parse/serialize/diff logic. No DB, no IPC.
 * Covers the contract that the SQLite-backed SoulStore relies on for round-tripping
 * legacy markdown files into structured rows and back.
 */
import { describe, it, expect } from 'vitest'

// CJS module — vitest 4 supports interop
const { parseMarkdownToRows, rowsToMarkdown, diffRows, deterministicId, SECTIONS } = require('../soulMarkdown')

// ── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_MD = `# Soul: Alice

> Last updated: 2026-04-27T12:00:00Z

## Identity
- Type: system
- Created: 2026-04-01

## Preferences
- Likes concise replies
- Speaks Chinese and English

## Communication

- Use bullet points when listing things

## Technical
- Prefers TypeScript over JavaScript
- Editor: VS Code

## Mental Models

## Memory Updates Log
- [2026-04-27] add: Likes concise replies
`

const NUWA_MD = `# Soul: Bob

> Last updated: 2026-04-27T08:00:00Z

## Mental Models
- Treats arguments as collaborative truth-finding
- 把代码当工艺品

## Decision Heuristics
- When in doubt, ship and iterate
`

const EMPTY_MD = ''

const SOUL_NO_HEADER = `## Preferences
- Just an entry without any header
`

// ── parseMarkdownToRows ─────────────────────────────────────────────────────

describe('parseMarkdownToRows', () => {
  it('parses a complete soul file into rows with stable section names', () => {
    const { rows, agentName, headerLines } = parseMarkdownToRows(SAMPLE_MD, 'agent-1', 'system')
    expect(agentName).toBe('Alice')
    expect(headerLines.some(l => l.startsWith('# Soul: Alice'))).toBe(true)

    const sections = new Set(rows.map(r => r.section))
    expect(sections.has('Identity')).toBe(true)
    expect(sections.has('Preferences')).toBe(true)
    expect(sections.has('Communication')).toBe(true)
    expect(sections.has('Technical')).toBe(true)
    expect(sections.has('Memory Updates Log')).toBe(true)
    // Mental Models is empty in the fixture — should produce zero rows for it
    expect(sections.has('Mental Models')).toBe(false)
  })

  it('preserves the exact bullet text including punctuation and CJK', () => {
    const { rows } = parseMarkdownToRows(NUWA_MD, 'agent-2', 'system')
    const contents = rows.map(r => r.content)
    expect(contents).toContain('Treats arguments as collaborative truth-finding')
    expect(contents).toContain('把代码当工艺品')
    expect(contents).toContain('When in doubt, ship and iterate')
  })

  it('skips empty bullets and blank lines', () => {
    const md = `## Preferences
-
-
- Real entry
-
`
    const { rows } = parseMarkdownToRows(md, 'agent-3', 'system')
    expect(rows).toHaveLength(1)
    expect(rows[0].content).toBe('Real entry')
  })

  it('returns empty rows for empty input', () => {
    const { rows, agentName, headerLines } = parseMarkdownToRows(EMPTY_MD, 'agent-x', 'system')
    expect(rows).toEqual([])
    expect(agentName).toBe(null)
    expect(headerLines).toEqual([''])
  })

  it('handles markdown without a Soul header', () => {
    const { rows, agentName } = parseMarkdownToRows(SOUL_NO_HEADER, 'agent-4', 'system')
    expect(agentName).toBe(null)
    expect(rows).toHaveLength(1)
    expect(rows[0].section).toBe('Preferences')
    expect(rows[0].content).toBe('Just an entry without any header')
  })

  it('attaches agentId and agentType to every row', () => {
    const { rows } = parseMarkdownToRows(SAMPLE_MD, 'agent-1', 'system')
    expect(rows.every(r => r.agentId === 'agent-1')).toBe(true)
    expect(rows.every(r => r.agentType === 'system')).toBe(true)
  })

  it('uses provided source and timestamp', () => {
    const { rows } = parseMarkdownToRows(SAMPLE_MD, 'agent-1', 'system', {
      source: 'import-nuwa',
      timestamp: 1700000000000,
    })
    expect(rows.every(r => r.source === 'import-nuwa')).toBe(true)
    expect(rows.every(r => r.createdAt === 1700000000000)).toBe(true)
    expect(rows.every(r => r.updatedAt === 1700000000000)).toBe(true)
  })

  it('produces deterministic IDs when requested (idempotent migration)', () => {
    const a = parseMarkdownToRows(SAMPLE_MD, 'agent-1', 'system', { deterministic: true })
    const b = parseMarkdownToRows(SAMPLE_MD, 'agent-1', 'system', { deterministic: true })
    expect(a.rows.map(r => r.id)).toEqual(b.rows.map(r => r.id))
  })

  it('produces non-deterministic (uuid) IDs by default', () => {
    const a = parseMarkdownToRows(SAMPLE_MD, 'agent-1', 'system')
    const b = parseMarkdownToRows(SAMPLE_MD, 'agent-1', 'system')
    expect(a.rows.map(r => r.id)).not.toEqual(b.rows.map(r => r.id))
  })

  it('drops non-bullet lines inside a section (free-form text is not preserved)', () => {
    const md = `## Preferences

This is some free-form text that should be ignored.

- A real bullet
Stray paragraph.
- Another bullet
`
    const { rows } = parseMarkdownToRows(md, 'agent-5', 'system')
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.content)).toEqual(['A real bullet', 'Another bullet'])
  })
})

// ── rowsToMarkdown ──────────────────────────────────────────────────────────

describe('rowsToMarkdown', () => {
  it('emits a soul header and Last updated line', () => {
    const rows = [
      { section: 'Preferences', content: 'X', agentId: 'a', agentType: 'system' },
    ]
    const md = rowsToMarkdown(rows, { agentName: 'Alice', agentType: 'system', lastUpdated: '2026-04-27T00:00:00Z' })
    expect(md).toMatch(/^# Soul: Alice\n> Last updated: 2026-04-27T00:00:00Z/)
  })

  it('emits sections in canonical SECTIONS order regardless of row insertion order', () => {
    const rows = [
      { section: 'Memory Updates Log', content: 'log', agentId: 'a', agentType: 'system' },
      { section: 'Preferences',         content: 'pref', agentId: 'a', agentType: 'system' },
      { section: 'Mental Models',       content: 'model', agentId: 'a', agentType: 'system' },
    ]
    const md = rowsToMarkdown(rows, { agentName: 'A' })
    const idxMM   = md.indexOf('## Mental Models')
    const idxPref = md.indexOf('## Preferences')
    const idxLog  = md.indexOf('## Memory Updates Log')
    expect(idxMM).toBeLessThan(idxPref)
    expect(idxPref).toBeLessThan(idxLog)
  })

  it('emits unknown sections after all known sections, alphabetically', () => {
    const rows = [
      { section: 'Zeta',  content: 'z',  agentId: 'a', agentType: 'system' },
      { section: 'Alpha', content: 'a',  agentId: 'a', agentType: 'system' },
      { section: 'Preferences', content: 'p', agentId: 'a', agentType: 'system' },
    ]
    const md = rowsToMarkdown(rows, { agentName: 'A' })
    const idxPref  = md.indexOf('## Preferences')
    const idxAlpha = md.indexOf('## Alpha')
    const idxZeta  = md.indexOf('## Zeta')
    expect(idxPref).toBeLessThan(idxAlpha)
    expect(idxAlpha).toBeLessThan(idxZeta)
  })

  it('emits a minimal Identity block when no rows for that section', () => {
    const md = rowsToMarkdown([], { agentName: 'NewAgent', agentType: 'users', createdDate: '2026-04-27' })
    expect(md).toContain('## Identity')
    expect(md).toContain('- Type: user')
    expect(md).toContain('- Created: 2026-04-27')
  })
})

// ── Round-trip ──────────────────────────────────────────────────────────────

describe('parseMarkdownToRows ↔ rowsToMarkdown round-trip', () => {
  it('preserves the set of (section, content) entries through one round-trip', () => {
    const { rows, agentName } = parseMarkdownToRows(SAMPLE_MD, 'agent-1', 'system')
    const out = rowsToMarkdown(rows, { agentName, agentType: 'system', lastUpdated: '2026-04-27T12:00:00Z' })
    const reparsed = parseMarkdownToRows(out, 'agent-1', 'system')

    const original = new Set(rows.map(r => `${r.section}::${r.content}`))
    const final    = new Set(reparsed.rows.map(r => `${r.section}::${r.content}`))
    expect(final).toEqual(original)
  })

  it('preserves CJK and Nuwa-section content', () => {
    const { rows, agentName } = parseMarkdownToRows(NUWA_MD, 'agent-2', 'system')
    const out = rowsToMarkdown(rows, { agentName, agentType: 'system' })
    const reparsed = parseMarkdownToRows(out, 'agent-2', 'system')

    const final = new Set(reparsed.rows.map(r => `${r.section}::${r.content}`))
    expect(final.has('Mental Models::把代码当工艺品')).toBe(true)
    expect(final.has('Decision Heuristics::When in doubt, ship and iterate')).toBe(true)
  })

  it('survives multiple round-trips without drift (semantic stability)', () => {
    let md = SAMPLE_MD
    let firstRows = null
    for (let i = 0; i < 4; i++) {
      const parsed = parseMarkdownToRows(md, 'agent-1', 'system')
      if (i === 0) firstRows = parsed.rows
      md = rowsToMarkdown(parsed.rows, { agentName: parsed.agentName, agentType: 'system', lastUpdated: '2026-04-27T12:00:00Z' })
    }
    const finalRows = parseMarkdownToRows(md, 'agent-1', 'system').rows
    const a = new Set(firstRows.map(r => `${r.section}::${r.content}`))
    const b = new Set(finalRows.map(r => `${r.section}::${r.content}`))
    expect(b).toEqual(a)
  })
})

// ── diffRows ────────────────────────────────────────────────────────────────

describe('diffRows', () => {
  const oldRows = [
    { id: 'id1', section: 'Preferences', content: 'A', agentId: 'a', agentType: 'system', createdAt: 1, updatedAt: 1, source: 'unknown', confidence: null },
    { id: 'id2', section: 'Preferences', content: 'B', agentId: 'a', agentType: 'system', createdAt: 2, updatedAt: 2, source: 'unknown', confidence: null },
    { id: 'id3', section: 'Technical',   content: 'C', agentId: 'a', agentType: 'system', createdAt: 3, updatedAt: 3, source: 'unknown', confidence: null },
  ]

  it('marks identical rows as unchanged and preserves their ids', () => {
    const newRows = [
      { id: 'temp', section: 'Preferences', content: 'A', agentId: 'a', agentType: 'system' },
      { id: 'temp', section: 'Technical',   content: 'C', agentId: 'a', agentType: 'system' },
    ]
    const { inserts, deletes, unchanged } = diffRows(oldRows, newRows)
    expect(unchanged.map(r => r.id).sort()).toEqual(['id1', 'id3'])
    expect(deletes).toEqual(['id2'])
    expect(inserts).toEqual([])
  })

  it('emits inserts for new entries and deletes for missing ones', () => {
    const newRows = [
      { id: 't', section: 'Preferences', content: 'D', agentId: 'a', agentType: 'system' },  // new
      { id: 't', section: 'Technical',   content: 'C', agentId: 'a', agentType: 'system' },  // unchanged
    ]
    const { inserts, deletes, unchanged } = diffRows(oldRows, newRows)
    expect(inserts.map(r => r.content)).toEqual(['D'])
    expect(deletes.sort()).toEqual(['id1', 'id2'])
    expect(unchanged.map(r => r.id)).toEqual(['id3'])
  })

  it('treats trailing whitespace as identical for matching', () => {
    const newRows = [
      { id: 't', section: 'Preferences', content: 'A   ', agentId: 'a', agentType: 'system' },
    ]
    const { unchanged } = diffRows(oldRows, newRows)
    expect(unchanged.map(r => r.id)).toEqual(['id1'])
  })

  it('handles duplicate text in the same section by pairing one-to-one', () => {
    const oldDup = [
      { id: 'a', section: 'Preferences', content: 'X', agentId: 'a', agentType: 'system' },
      { id: 'b', section: 'Preferences', content: 'X', agentId: 'a', agentType: 'system' },
    ]
    const newDup = [
      { id: 't', section: 'Preferences', content: 'X', agentId: 'a', agentType: 'system' },
    ]
    const { unchanged, deletes } = diffRows(oldDup, newDup)
    expect(unchanged).toHaveLength(1)
    expect(deletes).toHaveLength(1)
  })
})

// ── deterministicId ─────────────────────────────────────────────────────────

describe('deterministicId', () => {
  it('produces the same id for the same inputs', () => {
    const a = deterministicId('agent-1', 'system', 'Preferences', 'foo')
    const b = deterministicId('agent-1', 'system', 'Preferences', 'foo')
    expect(a).toBe(b)
  })

  it('produces different ids for different content', () => {
    const a = deterministicId('agent-1', 'system', 'Preferences', 'foo')
    const b = deterministicId('agent-1', 'system', 'Preferences', 'bar')
    expect(a).not.toBe(b)
  })

  it('produces different ids for different sections (same content)', () => {
    const a = deterministicId('agent-1', 'system', 'Preferences', 'foo')
    const b = deterministicId('agent-1', 'system', 'Technical',   'foo')
    expect(a).not.toBe(b)
  })

  it('returns a uuid-shaped string', () => {
    const id = deterministicId('agent-1', 'system', 'Preferences', 'foo')
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
  })

  it('whitespace-trims content for hashing stability', () => {
    const a = deterministicId('agent-1', 'system', 'Preferences', 'foo')
    const b = deterministicId('agent-1', 'system', 'Preferences', '  foo  ')
    expect(a).toBe(b)
  })
})

// ── SECTIONS export ─────────────────────────────────────────────────────────

describe('SECTIONS constant', () => {
  it('matches the original SoulTool section list ordering', () => {
    expect(SECTIONS[0]).toBe('Identity')
    expect(SECTIONS).toContain('Mental Models')
    expect(SECTIONS).toContain('Preferences')
    expect(SECTIONS[SECTIONS.length - 1]).toBe('Memory Updates Log')
  })
})
