import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const { FileTool } = require('../FileTool')

describe('FileTool productivity additions', () => {
  let tmp

  beforeEach(() => {
    tmp = path.join(process.env.TEMP || '/tmp', `ft-prod-${Date.now()}-${Math.floor(Math.random() * 10000)}`)
    fs.mkdirSync(tmp, { recursive: true })
  })

  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true })
  })

  // --- edit uniqueness ---

  describe('edit uniqueness', () => {
    it('default occurrences="unique" succeeds on single match', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, '# Title\nhello world\nbye')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'edit', path: f, oldText: 'hello world', newText: 'HI' })
      expect(r.success).toBe(true)
      expect(fs.readFileSync(f, 'utf8')).toBe('# Title\nHI\nbye')
    })

    it('default occurrences="unique" fails on zero matches without modifying file', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, 'x')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'edit', path: f, oldText: 'nope', newText: 'y' })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/not found/i)
      expect(fs.readFileSync(f, 'utf8')).toBe('x')
    })

    it('default occurrences="unique" fails on multiple matches with helpful count', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, 'foo bar foo baz')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'edit', path: f, oldText: 'foo', newText: 'X' })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/2 times|matches/i)
      expect(fs.readFileSync(f, 'utf8')).toBe('foo bar foo baz')
    })

    it('occurrences="all" replaces every occurrence', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, 'foo bar foo baz')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'edit', path: f, oldText: 'foo', newText: 'X', occurrences: 'all' })
      expect(r.success).toBe(true)
      expect(fs.readFileSync(f, 'utf8')).toBe('X bar X baz')
    })

    it('occurrences="first" replaces only first (legacy behavior)', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, 'foo foo')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'edit', path: f, oldText: 'foo', newText: 'X', occurrences: 'first' })
      expect(r.success).toBe(true)
      expect(fs.readFileSync(f, 'utf8')).toBe('X foo')
    })
  })

  // --- glob ---

  describe('glob', () => {
    it('returns matching files for **/*.md', async () => {
      fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true })
      fs.writeFileSync(path.join(tmp, 'a.md'), 'x')
      fs.writeFileSync(path.join(tmp, 'b.txt'), 'x')
      fs.writeFileSync(path.join(tmp, 'sub', 'c.md'), 'x')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'glob', path: tmp, pattern: '**/*.md' })
      expect(r.success).toBe(true)
      expect(r.text).toContain('a.md')
      expect(r.text).toContain('c.md')
      expect(r.text).not.toContain('b.txt')
    })

    it('caps results with hint', async () => {
      for (let i = 0; i < 250; i++) fs.writeFileSync(path.join(tmp, `f${i}.md`), 'x')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'glob', path: tmp, pattern: '*.md' })
      expect(r.success).toBe(true)
      expect(r.text).toMatch(/more|truncated|omitted/i)
    })

    it('errors on missing dir', async () => {
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'glob', path: '/no/such/dir', pattern: '**/*.x' })
      expect(r.success).toBe(false)
    })

    it('errors when pattern is missing', async () => {
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'glob', path: tmp })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/pattern/i)
    })
  })

  // --- grep ---

  describe('grep', () => {
    it('finds single-line regex match with line number', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, 'line one\ntarget here\nline three')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'grep', path: f, pattern: 'target' })
      expect(r.success).toBe(true)
      expect(r.text).toMatch(/2.*target/)
    })

    it('multiline=true matches across newlines', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, 'start\nfoo\nbar\nend')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'grep', path: f, pattern: 'foo[\\s\\S]*bar', multiline: true })
      expect(r.success).toBe(true)
      expect(r.text).toMatch(/foo|bar/)
    })

    it('grep on directory walks files recursively', async () => {
      fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true })
      fs.writeFileSync(path.join(tmp, 'a.md'), 'apple banana')
      fs.writeFileSync(path.join(tmp, 'sub', 'b.md'), 'cherry banana')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'grep', path: tmp, pattern: 'banana' })
      expect(r.success).toBe(true)
      expect(r.text).toContain('a.md')
      expect(r.text).toContain('b.md')
    })

    it('returns "(no matches)" when no match', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, 'hello')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'grep', path: f, pattern: 'nope' })
      expect(r.success).toBe(true)
      expect(r.text.trim()).toBe('(no matches)')
    })

    it('rejects invalid regex', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, 'hello')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'grep', path: f, pattern: '[invalid' })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/invalid regex/i)
    })

    it('skips binary files by extension', async () => {
      fs.writeFileSync(path.join(tmp, 'doc.md'), 'banana')
      fs.writeFileSync(path.join(tmp, 'image.png'), 'banana')  // pretend binary content with text
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'grep', path: tmp, pattern: 'banana' })
      expect(r.success).toBe(true)
      expect(r.text).toContain('doc.md')
      expect(r.text).not.toContain('image.png')
    })
  })
})
