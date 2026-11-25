import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import reader from '../aidocWikiReader.js'
import topics from '../aidocWikiTopics.js'

const { listWikiPages, readWikiTopicExcerpt } = reader
const { classifyWikiTopics, MAX_WIKI_TOPIC_EXCERPT } = topics

describe('Wiki article topics', () => {
  let root
  let cachePath

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-wiki-topics-'))
    cachePath = path.join(root, 'cache', 'wiki-topics.json')
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  async function write(rel, text) {
    const file = path.join(root, rel)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, text)
  }

  it('sends bounded article body excerpts and caches classifications by page metadata', async () => {
    const rel = 'wiki/en/incorrect-directory/unrelated-name.md'
    const body = 'Forest ecology and habitats. '.repeat(1000)
    await write(rel, `---\ntitle: Unrelated metadata\n---\n${body}`)
    await write('wiki/en/index.md', '# Index')
    const pages = await listWikiPages(root)
    const readPage = vi.fn(page => readWikiTopicExcerpt({ root, rel: page.rel }))
    const classify = vi.fn(async ({ prompt }) => {
      expect(JSON.parse(prompt)).toMatchObject({
        language: 'en',
        articles: [{ id: '1', body: body.slice(0, MAX_WIKI_TOPIC_EXCERPT) }],
      })
      expect(prompt).not.toMatch(/Unrelated metadata|unrelated-name|incorrect-directory/)
      return '{"1":"Forest ecology"}'
    })

    const expected = new Map([[rel, 'Forest ecology']])
    expect(await classifyWikiTopics({ pages, readPage, classify, cachePath })).toEqual(expected)
    expect(await classifyWikiTopics({ pages, cachePath })).toEqual(expected)
    expect(await classifyWikiTopics({ pages, readPage, classify, cachePath })).toEqual(expected)
    expect(readPage).toHaveBeenCalledTimes(1)
    expect(classify).toHaveBeenCalledTimes(1)

    await write(rel, 'Permafrost and tundra')
    const editedPages = await listWikiPages(root)
    expect(await classifyWikiTopics({ pages: editedPages, cachePath })).toEqual(new Map())
    expect(await readWikiTopicExcerpt({ root, rel: 'wiki/en/index.md' })).toBe('')
    expect(await readWikiTopicExcerpt({ root, rel: 'wiki/../wiki-topics.json' })).toBe('')
  })

  it('recomputes all cached topics and keeps the old cache if a full run fails', async () => {
    const rel = 'wiki/old.md'
    const pages = [{ rel, mtimeMs: 1, size: 12 }]
    const readPage = async () => 'Article body'
    const classify = vi.fn().mockResolvedValueOnce('{"1":"Old"}')
      .mockResolvedValueOnce('invalid').mockResolvedValueOnce('{"1":"New"}')
    const options = { pages, readPage, classify, cachePath }
    expect(await classifyWikiTopics(options)).toEqual(new Map([[rel, 'Old']]))
    expect(await classifyWikiTopics({ ...options, force: true })).toBeNull()
    expect(await classifyWikiTopics({ pages, cachePath })).toEqual(new Map([[rel, 'Old']]))
    expect(await classifyWikiTopics({ ...options, force: true })).toEqual(new Map([[rel, 'New']]))
    expect(await classifyWikiTopics({ pages, cachePath })).toEqual(new Map([[rel, 'New']]))
  })

  it('continues across failed batches and reuses validated subjects for each language', async () => {
    const pages = [
      ...Array.from({ length: 26 }, (_, index) => ({ rel: `wiki/en/${index}.md`, lang: 'en', mtimeMs: 1 })),
      { rel: 'wiki/zh/test.md', lang: 'zh', mtimeMs: 1 },
    ]
    const readPage = vi.fn(async () => 'Article body')
    // Concurrent batches have no fixed order, so answers are chosen from the request.
    let englishCalls = 0
    const classify = vi.fn(async ({ prompt }) => {
      const { task, language, articles } = JSON.parse(prompt)
      if (task === 'framework') return 'no framework'
      if (language === 'zh') return '{"1":"森林生态"}'
      englishCalls++
      if (englishCalls === 1) throw new Error('Model unavailable')
      return articles.length === 12
        ? '```json\n{"1":" Forest Ecology ","2":{},"999":"Unknown ID"}\n```'
        : '{"1":"forest ecology","2":"Bio\\nlogy"}'
    })

    const expected = new Map([
      // The two-article batch finishes first, so its spelling is the one both batches share.
      ['wiki/en/12.md', 'forest ecology'],
      ...pages.slice(14, 24).map(({ rel }) => [rel, '']),
      ['wiki/en/24.md', 'forest ecology'],
      ['wiki/zh/test.md', '森林生态'],
    ])
    expect(await classifyWikiTopics({ pages, readPage, classify, cachePath })).toEqual(expected)
    expect(await classifyWikiTopics({ pages, cachePath })).toEqual(expected)
    expect(classify).toHaveBeenCalledTimes(5)
  })

  it('keeps a compact, case-insensitive hierarchy and rejects paths over three levels', async () => {
    const pages = Array.from({ length: 4 }, (_, index) => ({ rel: `wiki/en/${index}.md`, lang: 'en', mtimeMs: 1 }))
    const classify = vi.fn(async ({ prompt }) => {
      expect(JSON.parse(prompt)).toMatchObject({ maximumRoots: 16, maximumDepth: 3 })
      return JSON.stringify({
        1: ['Cloud', 'Infrastructure', 'Terraform'],
        2: ['cloud', 'Infrastructure', 'Networking'],
        3: ['AI', 'Agents'],
        4: ['Cloud', 'Infrastructure', 'Networking', 'Routing'],
      })
    })
    expect(await classifyWikiTopics({ pages, readPage: async () => 'Article body', classify, cachePath })).toEqual(new Map([
      [pages[0].rel, 'Cloud › Infrastructure › Terraform'],
      [pages[1].rel, 'Cloud › Infrastructure › Networking'],
      [pages[2].rel, 'AI › Agents'],
    ]))
  })
})

describe('Wiki full reclassification', () => {
  const makePages = count => Array.from({ length: count }, (_, index) => ({ rel: `wiki/en/${index}.md`, lang: 'en', mtimeMs: 1, size: 1 }))
  const answer = (prompt, label) => {
    const { task, articles } = JSON.parse(prompt)
    if (task === 'framework') return 'no framework'
    return JSON.stringify(Object.fromEntries(articles.map(({ id }) => [id, label])))
  }

  it('saves successful batches and keeps previous topics for the failed ones', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-wiki-partial-'))
    try {
      const options = { pages: makePages(24), readPage: async () => 'Article body', cachePath: path.join(dir, 'topics.json') }
      await classifyWikiTopics({ ...options, classify: async ({ prompt }) => answer(prompt, 'Old') })
      let batches = 0
      const classify = vi.fn(async ({ prompt }) => {
        if (!JSON.parse(prompt).task && ++batches === 1) return 'invalid'
        return answer(prompt, 'New')
      })
      const onFailed = vi.fn()

      const result = await classifyWikiTopics({ ...options, classify, force: true, onFailed })

      expect(onFailed).toHaveBeenCalledWith(12)
      expect(result.get('wiki/en/0.md')).toBe('Old')
      expect(result.get('wiki/en/12.md')).toBe('New')
      expect(await classifyWikiTopics({ pages: options.pages, cachePath: options.cachePath })).toEqual(result)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('classifies a first batch alone when no framework is available, then at most five at a time', async () => {
    let active = 0
    const seen = []
    const classify = async ({ prompt }) => {
      if (JSON.parse(prompt).task) return 'no framework'
      seen.push(++active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active--
      return answer(prompt, 'Topic')
    }

    const result = await classifyWikiTopics({ pages: makePages(120), readPage: async () => 'Article body', classify })

    expect(result.size).toBe(120)
    expect(seen).toHaveLength(10)
    expect(seen.slice(0, 2)).toEqual([1, 1])
    expect(Math.max(...seen)).toBe(5)
  })
})

describe('Wiki topics at scale', () => {
  const makePages = count => Array.from({ length: count }, (_, index) => ({ rel: `wiki/en/${index}.md`, lang: 'en', mtimeMs: 1, size: 1 }))
  const readPage = async () => 'Article body'
  const label = (prompt, value) => JSON.stringify(Object.fromEntries(JSON.parse(prompt).articles.map(({ id }) => [id, value])))
  let dir
  let cachePath

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-wiki-scale-'))
    cachePath = path.join(dir, 'topics.json')
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('plans one framework from a sample before the concurrent batches', async () => {
    const prompts = []
    await classifyWikiTopics({ pages: makePages(400), readPage, classify: async ({ prompt }) => {
      const payload = JSON.parse(prompt)
      prompts.push(payload)
      return payload.task ? '{"paths":[["Cloud"],["Cloud","Storage"]]}' : label(prompt, ['Cloud', 'Storage'])
    } })

    expect(prompts[0]).toMatchObject({ task: 'framework', targetSubjects: 90 })
    expect(prompts[0].articles).toHaveLength(300)
    expect(prompts.slice(1)).toHaveLength(34)
    for (const batch of prompts.slice(1)) {
      expect(batch.existingPaths).toEqual([['Cloud'], ['Cloud', 'Storage']])
    }
  })

  it('grows the subject budget with the collection', async () => {
    const budgets = []
    const classify = async ({ prompt }) => {
      budgets.push(JSON.parse(prompt).maximumSubjects)
      return '{}'
    }
    await classifyWikiTopics({ pages: makePages(3000), readPage, classify })
    expect(budgets.at(-1)).toBe(300)
  })

  it('asks again among existing subjects when the root limit is reached', async () => {
    const roots = Array.from({ length: 16 }, (_, index) => [`Root ${index}`])
    const result = await classifyWikiTopics({ pages: makePages(24), readPage, classify: async ({ prompt }) => {
      const payload = JSON.parse(prompt)
      if (payload.task) return JSON.stringify({ paths: roots })
      return label(prompt, payload.useExistingPathsOnly ? ['Root 3'] : ['Something else'])
    } })

    expect(result.size).toBe(24)
    expect(new Set(result.values())).toEqual(new Set(['Root 3']))
  })

  it('saves finished batches when stopped and resumes the rest of a full redo', async () => {
    const pages = makePages(36)
    await classifyWikiTopics({ pages, readPage, cachePath, classify: async ({ prompt }) =>
      JSON.parse(prompt).task ? 'none' : label(prompt, 'Old') })
    const controller = new AbortController()
    let batches = 0
    const stopped = await classifyWikiTopics({ pages, readPage, cachePath, force: true, signal: controller.signal,
      classify: async ({ prompt }) => {
        if (JSON.parse(prompt).task) return 'none'
        if (++batches === 1) return label(prompt, 'New')
        controller.abort()
        throw new Error('aborted')
      } })

    expect([...stopped.values()].filter(value => value === 'New')).toHaveLength(12)
    expect([...stopped.values()].filter(value => value === 'Old')).toHaveLength(24)
    expect(await classifyWikiTopics({ pages, cachePath })).toEqual(stopped)

    const resumed = vi.fn(async ({ prompt }) => label(prompt, 'New'))
    const result = await classifyWikiTopics({ pages, readPage, cachePath, classify: resumed })
    expect(resumed).toHaveBeenCalledTimes(2)
    expect(new Set(result.values())).toEqual(new Set(['New']))
  })
})

describe('Wiki topic progress', () => {
  it('reports classified article counts after each batch', async () => {
    const pages = Array.from({ length: 26 }, (_, index) => ({ rel: `wiki/en/${index}.md`, lang: 'en', mtimeMs: 1 }))
    const onProgress = vi.fn()

    await classifyWikiTopics({ pages, readPage: async () => 'Article body', classify: async () => '{}', onProgress })

    expect(onProgress.mock.calls.map(([event]) => event)).toEqual([
      { done: 0, total: 26 }, { done: 12, total: 26 }, { done: 14, total: 26 }, { done: 26, total: 26 },
    ])
  })
})
