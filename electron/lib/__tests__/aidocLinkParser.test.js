import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { extractWikiLinks } = require('../aidocLinkParser')

describe('extractWikiLinks', () => {
  it('normalizes targets and preserves order, paths, extensions, and Unicode', () => {
    const unicodeName = '\u6211\u7684 \u7b14\u8bb0'
    expect(extractWikiLinks(`[[a]] [[a|Alias]]\n[[a#Section]] [[a#Section|Alias]] [[ folder/a ]] [[a.docx]] [[${unicodeName}]]`))
      .toEqual(['a', 'folder/a', 'a.docx', unicodeName])
  })

  it('skips empty, incomplete, and missing links', () => {
    expect(extractWikiLinks('[[]] [[ ]] [[#local]] [[|alias]] [[abc')).toEqual([])
    expect(extractWikiLinks('plain text')).toEqual([])
  })

  it('ignores inline code and fenced code blocks, including longer fences', () => {
    const text = [
      '[[before]] `[[inline]]` ```looking inline```',
      '````md',
      '[[inside]]',
      '```',
      '[[still inside]]',
      '````',
      '~~~',
      '[[tilde fence]]',
      '~~~',
      '``a ` [[nested]]`` [[after]]',
      '```',
      '[[unclosed fence]]',
    ].join('\n')
    expect(extractWikiLinks(text)).toEqual(['before', 'after'])
  })
})
