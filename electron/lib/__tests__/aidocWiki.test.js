import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { defaultSchema, ensureWikiScaffold, appendLog, ensureIndexCoverage } = require('../aidocWiki')

let root
const DEFAULT_SCHEMA_EN = defaultSchema('en')
const wikiFile = name => path.join(root, 'wiki', 'en', name)
const read = name => fs.readFileSync(wikiFile(name), 'utf8')

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidoc-wiki-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('default schema', () => {
  it('documents page types, frontmatter, and index format', () => {
    for (const word of ['summary', 'entity', 'concept', 'comparison', 'sources', 'index.md', '[[']) {
      expect(DEFAULT_SCHEMA_EN).toContain(word)
    }
  })

  it('shows kb_source paths in the frontmatter example and names all five types', () => {
    expect(DEFAULT_SCHEMA_EN).toMatch(/sources: \[kb_source\//)
    expect(DEFAULT_SCHEMA_EN).toContain('type: summary | entity | concept | comparison | other')
    expect(DEFAULT_SCHEMA_EN).toContain('`other`')
  })

  it('states ownership, title and index rules', () => {
    expect(DEFAULT_SCHEMA_EN).toContain('`wiki/en/log.md` and `wiki/en/SCHEMA.md` are owned by the app and the user')
    expect(DEFAULT_SCHEMA_EN).toContain('Never write them')
    expect(DEFAULT_SCHEMA_EN).toContain('must equal the page file name without `.md`')
    expect(DEFAULT_SCHEMA_EN).toContain('Every page you write or revise must be listed in `index.md`')
  })
})

describe('ensureWikiScaffold', () => {
  it('creates wiki and the three files', () => {
    const { created } = ensureWikiScaffold(root, 'en')
    expect(created.sort()).toEqual(['index.md', 'log.md', 'SCHEMA.md'].sort())
    expect(read('SCHEMA.md')).toBe(DEFAULT_SCHEMA_EN)
    expect(read('index.md')).toContain('# Index')
    expect(read('log.md')).toContain('# Log')
  })

  it('never overwrites existing files', () => {
    fs.mkdirSync(wikiFile(''), { recursive: true })
    fs.writeFileSync(wikiFile('SCHEMA.md'), 'my custom schema')
    const { created } = ensureWikiScaffold(root, 'en')
    expect(read('SCHEMA.md')).toBe('my custom schema')
    expect(created).not.toContain('SCHEMA.md')
    expect(ensureWikiScaffold(root, 'en').created).toEqual([])
  })
})

describe('appendLog', () => {
  it('appends entries in order without losing old content', async () => {
    await appendLog(root, 'en', { date: '2026-01-01', sourceRel: 'a.pdf', pages: ['A', 'B'] })
    await appendLog(root, 'en', { date: '2026-01-02', sourceRel: 'b.md', pages: ['C'] })
    const log = read('log.md')
    expect(log).toContain('# Log')
    const first = log.indexOf('## [2026-01-01] ingest | a.pdf')
    const second = log.indexOf('## [2026-01-02] ingest | b.md')
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
    expect(log).toContain('- [[A]]\n- [[B]]')
    expect(log).toContain('- [[C]]')
  })

  it('does not corrupt a log without a trailing newline', async () => {
    fs.mkdirSync(wikiFile(''), { recursive: true })
    fs.writeFileSync(wikiFile('log.md'), '# Log\nold line')
    await appendLog(root, 'en', { date: '2026-01-01', sourceRel: 'a.md', pages: ['A'] })
    const log = read('log.md')
    expect(log.startsWith('# Log\nold line\n')).toBe(true)
    expect(log).toMatch(/\n## \[2026-01-01\] ingest \| a\.md\n- \[\[A\]\]\n$/)
  })

  it('creates log.md when missing', async () => {
    await appendLog(root, 'en', { date: '2026-01-01', sourceRel: 'a.md', pages: [] })
    expect(read('log.md')).toContain('## [2026-01-01] ingest | a.md')
  })
})

describe('ensureIndexCoverage', () => {
  it('does not re-add pages already linked, case-insensitively and with alias/section forms', async () => {
    ensureWikiScaffold(root, 'en')
    fs.appendFileSync(wikiFile('index.md'), '\n- [[a|Alias]] - x\n- [[Beta#Intro]] - y\n')
    const before = read('index.md')
    const res = await ensureIndexCoverage(root, 'en', [
      { rel: 'A.md', title: 'A' },
      { rel: 'sub/beta.md', title: 'Something else' },
    ])
    expect(res.added).toEqual([])
    expect(read('index.md')).toBe(before)
  })

  it('adds missing pages under Uncategorized once', async () => {
    ensureWikiScaffold(root, 'en')
    const pages = [{ rel: 'Gamma.md', title: 'Gamma Title' }]
    expect((await ensureIndexCoverage(root, 'en', pages)).added).toEqual(['Gamma'])
    const index = read('index.md')
    expect(index).toContain('## Uncategorized')
    expect(index).toContain('- [[Gamma]] — Gamma Title')
    expect((await ensureIndexCoverage(root, 'en', pages)).added).toEqual([])
    expect(read('index.md')).toBe(index)
  })

  it('matches by title as well as file name', async () => {
    ensureWikiScaffold(root, 'en')
    fs.appendFileSync(wikiFile('index.md'), '\n- [[Nice Title]] - z\n')
    const res = await ensureIndexCoverage(root, 'en', [{ rel: 'file-name.md', title: 'Nice Title' }])
    expect(res.added).toEqual([])
  })

  it('scaffolds first when index is missing', async () => {
    const res = await ensureIndexCoverage(root, 'en', [{ rel: 'P.md', title: 'P' }])
    expect(res.added).toEqual(['P'])
    expect(read('SCHEMA.md')).toBe(DEFAULT_SCHEMA_EN)
    expect(read('index.md')).toContain('- [[P]]')
  })

  it('leaves the file untouched for empty pages', async () => {
    ensureWikiScaffold(root, 'en')
    const before = read('index.md')
    expect((await ensureIndexCoverage(root, 'en', [])).added).toEqual([])
    expect(read('index.md')).toBe(before)
  })

  it('strips unsafe characters from generated link text', async () => {
    ensureWikiScaffold(root, 'en')
    const res = await ensureIndexCoverage(root, 'en', [{ rel: 'we]ird|na[me.md', title: 'T\nitle' }])
    expect(res.added).toEqual(['weirdname'])
    const line = read('index.md').split('\n').find(l => l.includes('weirdname'))
    expect(line).toBe('- [[weirdname]] — T itle')
  })

  it('appends into an existing Uncategorized section that is not last', async () => {
    ensureWikiScaffold(root, 'en')
    fs.appendFileSync(wikiFile('index.md'), '\n## Uncategorized\n\n- [[Old]] - o\n\n## Concepts\n\n- [[C1]] - c\n')
    await ensureIndexCoverage(root, 'en', [{ rel: 'New.md', title: 'New' }])
    const index = read('index.md')
    expect(index.indexOf('[[New]]')).toBeGreaterThan(index.indexOf('[[Old]]'))
    expect(index.indexOf('[[New]]')).toBeLessThan(index.indexOf('## Concepts'))
    expect(index.match(/## Uncategorized/g)).toHaveLength(1)
  })

  it.each(['## Uncategorized', '## uncategorized'])('handles CRLF index files with heading %s', async heading => {
    fs.mkdirSync(wikiFile(''), { recursive: true })
    fs.writeFileSync(wikiFile('index.md'), `# Index\r\n\r\n${heading}\r\n\r\n- [[Old]] - o\r\n\r\n## Concepts\r\n\r\n- [[C1]] - c\r\n`)
    await ensureIndexCoverage(root, 'en', [{ rel: 'New.md', title: 'New' }])
    await ensureIndexCoverage(root, 'en', [{ rel: 'New.md', title: 'New' }])
    const index = read('index.md')
    expect(index.match(/## uncategorized/gi)).toHaveLength(1)
    expect(index).toContain('\r\n- [[New]] — New\r\n')
    expect(index.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(index.indexOf('[[New]]')).toBeLessThan(index.indexOf('## Concepts'))
  })

  it('uses CRLF when appending a new Uncategorized section to a CRLF file', async () => {
    fs.mkdirSync(wikiFile(''), { recursive: true })
    fs.writeFileSync(wikiFile('index.md'), '# Index\r\n\r\n- [[A]] - a\r\n')
    await ensureIndexCoverage(root, 'en', [{ rel: 'B.md', title: 'B' }])
    const index = read('index.md')
    expect(index.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(index).toContain('## Uncategorized\r\n\r\n- [[B]]')
  })
})

describe('per-language scaffold', () => {
  // Localized scaffold texts, written as escapes to keep this file English-only.
  const ZH_INDEX = '\u7d22\u5f15'
  const ZH_LOG = '\u65e5\u5fd7'
  const ZH_UNCATEGORIZED = '\u672a\u5206\u7c7b'
  const ZH_AND = '\u548c'
  const zhFile = name => path.join(root, 'wiki', 'zh', name)

  it('creates a self-contained scaffold per language under wiki/<lang>/', () => {
    ensureWikiScaffold(root, 'en')
    ensureWikiScaffold(root, 'zh')
    expect(fs.readdirSync(path.join(root, 'wiki')).sort()).toEqual(['en', 'zh'])
    for (const dir of ['en', 'zh']) {
      expect(fs.readdirSync(path.join(root, 'wiki', dir)).sort()).toEqual(['SCHEMA.md', 'index.md', 'log.md'])
    }
    expect(fs.existsSync(path.join(root, 'wiki', 'SCHEMA.md'))).toBe(false)
  })

  it('writes the schema of each language with its own wiki path and prose language', () => {
    ensureWikiScaffold(root, 'zh')
    const schema = fs.readFileSync(zhFile('SCHEMA.md'), 'utf8')
    expect(schema).toBe(defaultSchema('zh'))
    expect(schema).toContain(`\`wiki/zh/log.md\` ${ZH_AND} \`wiki/zh/SCHEMA.md\``)
    expect(schema).toContain('type: summary | entity | concept | comparison | other')
    expect(schema).not.toContain('{WIKI}')
    expect(DEFAULT_SCHEMA_EN).toContain('write page prose in English')
    expect(defaultSchema('en')).not.toContain('{WIKI}')
    expect(fs.readFileSync(zhFile('index.md'), 'utf8')).toContain(`# ${ZH_INDEX}`)
    expect(fs.readFileSync(zhFile('log.md'), 'utf8')).toBe(`# ${ZH_LOG}\n`)
  })

  it('rejects an unsupported language and a linked language folder', () => {
    expect(() => ensureWikiScaffold(root, 'fr')).toThrow(/Unsupported wiki language/)
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aidoc-wiki-out-'))
    try {
      fs.mkdirSync(path.join(root, 'wiki'), { recursive: true })
      try {
        fs.symlinkSync(outside, path.join(root, 'wiki', 'en'), 'junction')
      } catch {
        return
      }
      expect(() => ensureWikiScaffold(root, 'en')).toThrow(/must not be a link/)
      expect(fs.readdirSync(outside)).toEqual([])
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('appends the log and index entries inside the language folder only', async () => {
    await appendLog(root, 'zh', { date: '2026-01-01', sourceRel: 'kb_source/a.md', pages: ['PageZh'] })
    await ensureIndexCoverage(root, 'zh', [{ rel: 'wiki/zh/PageZh.md', title: 'PageZh' }])
    expect(fs.readFileSync(zhFile('log.md'), 'utf8')).toContain('## [2026-01-01] ingest | kb_source/a.md\n- [[PageZh]]')
    const index = fs.readFileSync(zhFile('index.md'), 'utf8')
    expect(index).toContain(`## ${ZH_UNCATEGORIZED}`)
    expect(index).toContain('- [[PageZh]] — PageZh')
    expect(fs.existsSync(path.join(root, 'wiki', 'en'))).toBe(false)
  })

  it('keeps adding to the localized Uncategorized section instead of repeating it', async () => {
    await ensureIndexCoverage(root, 'zh', [{ rel: 'A.md', title: 'A' }])
    await ensureIndexCoverage(root, 'zh', [{ rel: 'B.md', title: 'B' }])
    expect(fs.readFileSync(zhFile('index.md'), 'utf8').match(new RegExp(`## ${ZH_UNCATEGORIZED}`, 'g'))).toHaveLength(1)
  })
})
