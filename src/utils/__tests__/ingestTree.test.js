import { describe, expect, it } from 'vitest'
import { buildIngestTree, defaultExpanded, INGEST_ROOT_ID, stripSourceRoot } from '../ingestTree'

const src = rel => ({ rel, size: 1, state: 'new' })
const names = folder => folder.children.map(child => child.name)

describe('ingestTree', () => {
  it('strips the leading kb_source segment only once and only at the start', () => {
    expect(stripSourceRoot('kb_source/a/b.md')).toBe('a/b.md')
    expect(stripSourceRoot('kb_source/kb_source/b.md')).toBe('kb_source/b.md')
    expect(stripSourceRoot('other/b.md')).toBe('other/b.md')
  })

  it('builds nested folders with recursive counts at every level', () => {
    const root = buildIngestTree([
      src('kb_source/top.md'),
      src('kb_source/01-AI/a.md'),
      src('kb_source/01-AI/deep/b.md'),
      src('kb_source/01-AI/deep/c.md'),
      src('kb_source/02-Other/d.md'),
    ])
    expect(root.name).toBe('kb_source')
    expect(root.count).toBe(5)
    const ai = root.children.find(child => child.name === '01-AI')
    expect(ai.count).toBe(3)
    expect(ai.children.find(child => child.name === 'deep').count).toBe(2)
    expect(root.children.find(child => child.name === '02-Other').count).toBe(1)
  })

  it('keeps files directly under the root and attaches the source to file nodes', () => {
    const root = buildIngestTree([src('kb_source/top.md')])
    expect(root.children).toHaveLength(1)
    expect(root.children[0]).toMatchObject({ type: 'file', name: 'top.md', source: { rel: 'kb_source/top.md' } })
    expect(root.count).toBe(1)
  })

  it('sorts folders before files using natural numeric order', () => {
    const root = buildIngestTree([
      src('kb_source/b.md'), src('kb_source/a10.md'), src('kb_source/a2.md'),
      src('kb_source/dir10/x.md'), src('kb_source/dir2/x.md'), src('kb_source/Zdir/x.md'),
    ])
    expect(names(root)).toEqual(['dir2', 'dir10', 'Zdir', 'a2.md', 'a10.md', 'b.md'])
  })

  it('handles unusual characters, empty segments and an empty list', () => {
    const root = buildIngestTree([src('kb_source/a b/%&#(1)/文档 [x].md'), src('kb_source//dup//f.md')])
    const folder = root.children.find(child => child.name === 'a b').children[0]
    expect(folder.name).toBe('%&#(1)')
    expect(folder.children[0].name).toBe('文档 [x].md')
    expect(root.children.find(child => child.name === 'dup').children[0].name).toBe('f.md')
    const empty = buildIngestTree([])
    expect(empty.count).toBe(0)
    expect(empty.children).toEqual([])
    expect(buildIngestTree(undefined).count).toBe(0)
  })

  it('expands only the root by default', () => {
    expect([...defaultExpanded()]).toEqual([INGEST_ROOT_ID])
    const root = buildIngestTree([src('kb_source/a/b.md')])
    expect(root.id).toBe(INGEST_ROOT_ID)
    expect(defaultExpanded().has(root.children[0].id)).toBe(false)
  })

  it('gives distinct ids to a folder and a file with the same name', () => {
    const root = buildIngestTree([src('kb_source/x/y.md'), src('kb_source/x')])
    expect(new Set(root.children.map(child => child.id)).size).toBe(2)
  })
})
