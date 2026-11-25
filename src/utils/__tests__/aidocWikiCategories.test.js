import { describe, expect, it } from 'vitest'
import { groupWikiPages, wikiCategories } from '../aidocWikiCategories'

describe('Wiki topic navigation', () => {
  it('uses inferred topics and leaves path-only pages uncategorized', () => {
    expect(wikiCategories({ sources: ['kb_source/interview/a.md'], topics: ['Satellite Design'] })).toEqual(['Satellite Design'])
    expect(wikiCategories({ sources: ['kb_source/clankit/doc.md'] })).toEqual([''])
  })

  it('groups equal inferred names and sorts pages within the group', () => {
    const alpha = { rel: 'wiki/en/a.md', title: 'Alpha', topics: ['Satellite Design'] }
    const beta = { rel: 'wiki/en/b.md', title: 'Beta', topics: ['satellite design'] }
    const unknown = { rel: 'wiki/en/unknown.md', title: 'Unknown' }
    expect(groupWikiPages([alpha, unknown, beta], () => 'Uncategorized', 'en')).toEqual([
      { key: 'category:satellite design', label: 'Satellite Design', pages: [alpha, beta] },
      { key: 'category:', label: 'Uncategorized', pages: [unknown] },
    ])
  })
})
