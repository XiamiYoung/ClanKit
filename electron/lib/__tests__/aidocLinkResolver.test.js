import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createLinkResolver, resolveLink } = require('../aidocLinkResolver')

describe('AI Doc link resolution', () => {
  it('matches basenames case-insensitively with spaces and Unicode', () => {
    const name = '\u6211\u7684 \u7b14\u8bb0'
    const files = ['wiki/A.md', `wiki/${name}.md`]
    expect(resolveLink('wiki/index.md', ' a ', files)).toEqual({ kind: 'resolved', rel: 'wiki/A.md' })
    expect(resolveLink('wiki/index.md', name, files)).toEqual({ kind: 'resolved', rel: files[1] })
  })

  it('requires an explicit document extension when the target contains one', () => {
    const resolve = createLinkResolver(['wiki/a.md', 'wiki/a.docx.md', 'kb_source/a.docx'])
    expect(resolve('wiki/index.md', 'A.DOCX')).toEqual({ kind: 'resolved', rel: 'kb_source/a.docx' })
    expect(resolve('wiki/index.md', 'wiki/a.docx')).toEqual({ kind: 'unresolved' })
  })

  it('matches whole trailing segments and prioritizes an exact root-relative path', () => {
    const resolve = createLinkResolver([
      'wiki/concept/A.md',
      'wiki/other/wiki/concept/A.md',
      'wiki/superconcept/A.md',
      'kb_source/topic/v1.2.md',
    ])
    expect(resolve('wiki/other/wiki/concept/index.md', 'wiki\\concept\\a')).toEqual({
      kind: 'resolved', rel: 'wiki/concept/A.md',
    })
    expect(resolve('wiki/index.md', 'concept/A.md')).toEqual({
      kind: 'ambiguous', candidates: ['wiki/concept/A.md', 'wiki/other/wiki/concept/A.md'],
    })
    expect(resolve('wiki/index.md', 'kb_source/topic/v1.2')).toEqual({
      kind: 'resolved', rel: 'kb_source/topic/v1.2.md',
    })
    expect(resolve('wiki/index.md', 'cept/a')).toEqual({ kind: 'unresolved' })
  })

  describe('language wiki trees', () => {
    const files = [
      'wiki/en/Topic.md', 'wiki/zh/Topic.md', 'wiki/en/index.md', 'wiki/zh/index.md', 'wiki/Topic.md',
      'wiki/en/sub/Topic.md', 'kb_source/source.md',
    ]
    const resolve = createLinkResolver(files)

    it('resolves a basename inside the language of the linking page', () => {
      expect(resolve('wiki/en/index.md', 'Topic')).toEqual({ kind: 'resolved', rel: 'wiki/en/Topic.md' })
      expect(resolve('wiki/zh/index.md', 'topic')).toEqual({ kind: 'resolved', rel: 'wiki/zh/Topic.md' })
      expect(resolve('wiki/Topic.md', 'Topic')).toEqual({ kind: 'resolved', rel: 'wiki/Topic.md' })
    })

    it('never resolves a wiki link into another tree', () => {
      const lone = createLinkResolver(['wiki/zh/Only.md', 'wiki/Flat.md'])
      expect(lone('wiki/en/index.md', 'Only')).toEqual({ kind: 'unresolved' })
      expect(lone('wiki/en/index.md', 'wiki/zh/Only')).toEqual({ kind: 'unresolved' })
      expect(lone('wiki/zh/index.md', 'Flat')).toEqual({ kind: 'unresolved' })
      expect(lone('wiki/index.md', 'Only')).toEqual({ kind: 'unresolved' })
    })

    it('still reports real ambiguity inside one language tree', () => {
      expect(resolve('wiki/en/other/x.md', 'Topic')).toEqual({
        kind: 'ambiguous', candidates: ['wiki/en/Topic.md', 'wiki/en/sub/Topic.md'],
      })
      expect(resolve('wiki/en/sub/x.md', 'Topic')).toEqual({ kind: 'resolved', rel: 'wiki/en/sub/Topic.md' })
    })

    it('lets wiki pages link to sources of any folder', () => {
      expect(resolve('wiki/zh/index.md', 'source')).toEqual({ kind: 'resolved', rel: 'kb_source/source.md' })
      expect(resolve('wiki/zh/index.md', 'kb_source/source.md')).toEqual({ kind: 'resolved', rel: 'kb_source/source.md' })
    })
  })

  it('prefers the source directory, then wiki, then reports sorted candidates', () => {
    const resolve = createLinkResolver(['wiki/z/X.md', 'kb_source/x.md', 'wiki/a/x.md', 'wiki/a/x.md'])
    expect(resolve('kb_source/y.md', 'x')).toEqual({ kind: 'resolved', rel: 'kb_source/x.md' })
    expect(resolve('wiki/a/y.md', 'x')).toEqual({ kind: 'resolved', rel: 'wiki/a/x.md' })
    expect(resolve('wiki/y.md', 'x')).toEqual({ kind: 'ambiguous', candidates: ['wiki/a/x.md', 'wiki/z/X.md'] })
    expect(resolve('wiki/y.md', 'unknown')).toEqual({ kind: 'unresolved' })
    expect(resolveLink('wiki/elsewhere/y.md', 'x', ['wiki/x.md', 'kb_source/x.md'])).toEqual({
      kind: 'resolved', rel: 'wiki/x.md',
    })
  })
})
