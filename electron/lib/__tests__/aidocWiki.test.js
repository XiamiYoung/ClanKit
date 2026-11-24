import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { DEFAULT_SCHEMA_MD, ensureWikiScaffold, appendLog, ensureIndexCoverage } = require('../aidocWiki')

let root
const wikiFile = name => path.join(root, 'wiki', name)
const read = name => fs.readFileSync(wikiFile(name), 'utf8')

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidoc-wiki-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('DEFAULT_SCHEMA_MD', () => {
  it('documents page types, frontmatter, and index format', () => {
    for (const word of ['summary', 'entity', 'concept', 'comparison', 'sources', 'index.md', '[[']) {
      expect(DEFAULT_SCHEMA_MD).toContain(word)
    }
  })

  it('shows kb_source paths in the frontmatter example and names all five types', () => {
    expect(DEFAULT_SCHEMA_MD).toMatch(/sources: \[kb_source\//)
    expect(DEFAULT_SCHEMA_MD).toContain('type: summary | entity | concept | comparison | other')
    expect(DEFAULT_SCHEMA_MD).toContain('`other`')
  })

  it('states ownership, title and index rules', () => {
    expect(DEFAULT_SCHEMA_MD).toContain('`wiki/log.md` and `wiki/SCHEMA.md` are owned by the app and the user')
    expect(DEFAULT_SCHEMA_MD).toContain('Never write them')
    expect(DEFAULT_SCHEMA_MD).toContain('must equal the page file name without `.md`')
    expect(DEFAULT_SCHEMA_MD).toContain('Every page you write or revise must be listed in `index.md`')
  })
})

describe('ensureWikiScaffold', () => {
  it('creates wiki and the three files', () => {
    const { created } = ensureWikiScaffold(root)
    expect(created.sort()).toEqual(['index.md', 'log.md', 'SCHEMA.md'].sort())
    expect(read('SCHEMA.md')).toBe(DEFAULT_SCHEMA_MD)
    expect(read('index.md')).toContain('# Index')
    expect(read('log.md')).toContain('# Log')
  })

  it('never overwrites existing files', () => {
    fs.mkdirSync(wikiFile(''), { recursive: true })
    fs.writeFileSync(wikiFile('SCHEMA.md'), 'my custom schema')
    const { created } = ensureWikiScaffold(root)
    expect(read('SCHEMA.md')).toBe('my custom schema')
    expect(created).not.toContain('SCHEMA.md')
    expect(ensureWikiScaffold(root).created).toEqual([])
  })
})

describe('appendLog', () => {
  it('appends entries in order without losing old content', async () => {
    await appendLog(root, { date: '2026-01-01', sourceRel: 'a.pdf', pages: ['A', 'B'] })
    await appendLog(root, { date: '2026-01-02', sourceRel: 'b.md', pages: ['C'] })
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
    await appendLog(root, { date: '2026-01-01', sourceRel: 'a.md', pages: ['A'] })
    const log = read('log.md')
    expect(log.startsWith('# Log\nold line\n')).toBe(true)
    expect(log).toMatch(/\n## \[2026-01-01\] ingest \| a\.md\n- \[\[A\]\]\n$/)
  })

  it('creates log.md when missing', async () => {
    await appendLog(root, { date: '2026-01-01', sourceRel: 'a.md', pages: [] })
    expect(read('log.md')).toContain('## [2026-01-01] ingest | a.md')
  })
})

describe('ensureIndexCoverage', () => {
  it('does not re-add pages already linked, case-insensitively and with alias/section forms', async () => {
    ensureWikiScaffold(root)
    fs.appendFileSync(wikiFile('index.md'), '\n- [[a|Alias]] - x\n- [[Beta#Intro]] - y\n')
    const before = read('index.md')
    const res = await ensureIndexCoverage(root, [
      { rel: 'A.md', title: 'A' },
      { rel: 'sub/beta.md', title: 'Something else' },
    ])
    expect(res.added).toEqual([])
    expect(read('index.md')).toBe(before)
  })

  it('adds missing pages under Uncategorized once', async () => {
    ensureWikiScaffold(root)
    const pages = [{ rel: 'Gamma.md', title: 'Gamma Title' }]
    expect((await ensureIndexCoverage(root, pages)).added).toEqual(['Gamma'])
    const index = read('index.md')
    expect(index).toContain('## Uncategorized')
    expect(index).toContain('- [[Gamma]] — Gamma Title')
    expect((await ensureIndexCoverage(root, pages)).added).toEqual([])
    expect(read('index.md')).toBe(index)
  })

  it('matches by title as well as file name', async () => {
    ensureWikiScaffold(root)
    fs.appendFileSync(wikiFile('index.md'), '\n- [[Nice Title]] - z\n')
    const res = await ensureIndexCoverage(root, [{ rel: 'file-name.md', title: 'Nice Title' }])
    expect(res.added).toEqual([])
  })

  it('scaffolds first when index is missing', async () => {
    const res = await ensureIndexCoverage(root, [{ rel: 'P.md', title: 'P' }])
    expect(res.added).toEqual(['P'])
    expect(read('SCHEMA.md')).toBe(DEFAULT_SCHEMA_MD)
    expect(read('index.md')).toContain('- [[P]]')
  })

  it('leaves the file untouched for empty pages', async () => {
    ensureWikiScaffold(root)
    const before = read('index.md')
    expect((await ensureIndexCoverage(root, [])).added).toEqual([])
    expect(read('index.md')).toBe(before)
  })

  it('strips unsafe characters from generated link text', async () => {
    ensureWikiScaffold(root)
    const res = await ensureIndexCoverage(root, [{ rel: 'we]ird|na[me.md', title: 'T\nitle' }])
    expect(res.added).toEqual(['weirdname'])
    const line = read('index.md').split('\n').find(l => l.includes('weirdname'))
    expect(line).toBe('- [[weirdname]] — T itle')
  })

  it('appends into an existing Uncategorized section that is not last', async () => {
    ensureWikiScaffold(root)
    fs.appendFileSync(wikiFile('index.md'), '\n## Uncategorized\n\n- [[Old]] - o\n\n## Concepts\n\n- [[C1]] - c\n')
    await ensureIndexCoverage(root, [{ rel: 'New.md', title: 'New' }])
    const index = read('index.md')
    expect(index.indexOf('[[New]]')).toBeGreaterThan(index.indexOf('[[Old]]'))
    expect(index.indexOf('[[New]]')).toBeLessThan(index.indexOf('## Concepts'))
    expect(index.match(/## Uncategorized/g)).toHaveLength(1)
  })

  it.each(['## Uncategorized', '## uncategorized'])('handles CRLF index files with heading %s', async heading => {
    fs.mkdirSync(wikiFile(''), { recursive: true })
    fs.writeFileSync(wikiFile('index.md'), `# Index\r\n\r\n${heading}\r\n\r\n- [[Old]] - o\r\n\r\n## Concepts\r\n\r\n- [[C1]] - c\r\n`)
    await ensureIndexCoverage(root, [{ rel: 'New.md', title: 'New' }])
    await ensureIndexCoverage(root, [{ rel: 'New.md', title: 'New' }])
    const index = read('index.md')
    expect(index.match(/## uncategorized/gi)).toHaveLength(1)
    expect(index).toContain('\r\n- [[New]] — New\r\n')
    expect(index.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(index.indexOf('[[New]]')).toBeLessThan(index.indexOf('## Concepts'))
  })

  it('uses CRLF when appending a new Uncategorized section to a CRLF file', async () => {
    fs.mkdirSync(wikiFile(''), { recursive: true })
    fs.writeFileSync(wikiFile('index.md'), '# Index\r\n\r\n- [[A]] - a\r\n')
    await ensureIndexCoverage(root, [{ rel: 'B.md', title: 'B' }])
    const index = read('index.md')
    expect(index.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(index).toContain('## Uncategorized\r\n\r\n- [[B]]')
  })
})
