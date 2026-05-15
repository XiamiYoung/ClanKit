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

    it('rejects empty oldText to prevent split("").join(newText) explosion', async () => {
      // Real incident: Qwen called edit with oldText="", occurrences="all" on a
      // 950-byte intro file. body.split("") splits between every char, then
      // join(newText) inserted the replacement between each char, ballooning
      // the file to 760KB of duplicated content interleaved with original chars.
      const f = path.join(tmp, 'a.md')
      const original = '# Self-Introduction\n\nHello world.'
      fs.writeFileSync(f, original)
      const tool = new FileTool()
      const r = await tool.execute('id', {
        operation: 'edit',
        path: f,
        oldText: '',
        newText: '## Replacement section\n\nNew content here.',
        occurrences: 'all',
      })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/non-empty oldText|operation=write/i)
      expect(fs.readFileSync(f, 'utf8')).toBe(original)
    })

    it('occurrences="first" replaces only first (legacy behavior)', async () => {
      const f = path.join(tmp, 'a.md')
      fs.writeFileSync(f, 'foo foo')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'edit', path: f, oldText: 'foo', newText: 'X', occurrences: 'first' })
      expect(r.success).toBe(true)
      expect(fs.readFileSync(f, 'utf8')).toBe('X foo')
    })

    it('preserves CRLF line endings when oldText was passed as LF and match succeeds via normalization', async () => {
      const f = path.join(tmp, 'crlf.md')
      // Write file with CRLF
      fs.writeFileSync(f, '# Title\r\nhello world\r\nbye', 'utf8')
      const tool = new FileTool()
      // LLM passes oldText with LF only
      const r = await tool.execute('id', { operation: 'edit', path: f, oldText: 'hello world', newText: 'HI THERE' })
      expect(r.success).toBe(true)
      const after = fs.readFileSync(f, 'utf8')
      // CRLF preserved on unchanged lines AND on the edited region
      expect(after).toContain('\r\n')
      expect(after).toBe('# Title\r\nHI THERE\r\nbye')
    })

    it('does NOT introduce CRLF when original was pure LF', async () => {
      const f = path.join(tmp, 'lf.md')
      fs.writeFileSync(f, '# Title\nhello world\nbye', 'utf8')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'edit', path: f, oldText: 'hello world', newText: 'HI' })
      expect(r.success).toBe(true)
      const after = fs.readFileSync(f, 'utf8')
      expect(after).toBe('# Title\nHI\nbye')
      expect(after).not.toContain('\r\n')
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

  // --- read: size-based refusal + pagination metadata ---

  describe('read size policy', () => {
    it('whole-file read under 1 MB returns full content with metadata', async () => {
      const f = path.join(tmp, 'small.txt')
      fs.writeFileSync(f, 'line1\nline2\nline3')
      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'read', path: f })
      expect(r.success).toBe(true)
      expect(r.text).toBe('line1\nline2\nline3')
      expect(r.details.totalLines).toBe(3)
      expect(r.details.startLine).toBe(1)
      expect(r.details.numLines).toBe(3)
      expect(r.details.bytes).toBe(17)
    })

    it('whole-file read over 1 MB is REFUSED with pagination hint', async () => {
      const f = path.join(tmp, 'big.txt')
      // Build a >1 MB file: 12000 lines * ~100 bytes each = ~1.2 MB
      const line = 'x'.repeat(99) + '\n'
      const content = line.repeat(12000)
      fs.writeFileSync(f, content)
      expect(fs.statSync(f).size).toBeGreaterThan(1024 * 1024)

      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'read', path: f })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/too large/i)
      expect(r.error).toMatch(/offset.*limit/i) // suggests pagination
      expect(r.details.totalLines).toBeGreaterThan(0)
      expect(r.details.bytes).toBeGreaterThan(1024 * 1024)
      expect(r.details.maxBytes).toBe(1024 * 1024)
    })

    it('paginated read of a >1 MB file works with sensible limit', async () => {
      const f = path.join(tmp, 'big.txt')
      const line = 'x'.repeat(99) + '\n'
      fs.writeFileSync(f, line.repeat(12000))

      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'read', path: f, offset: 1, limit: 100 })
      expect(r.success).toBe(true)
      expect(r.details.totalLines).toBe(12001) // 12000 lines + trailing empty
      expect(r.details.startLine).toBe(1)
      expect(r.details.numLines).toBe(100)
      // 100 lines of 100 bytes = ~10 KB, well under cap
      expect(r.details.bytes).toBeLessThan(20 * 1024)
    })

    it('paginated read with second-page offset returns correct slice metadata', async () => {
      const f = path.join(tmp, 'pages.txt')
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n')
      fs.writeFileSync(f, lines)

      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'read', path: f, offset: 20, limit: 10 })
      expect(r.success).toBe(true)
      expect(r.text).toMatch(/^line 20\n/)
      expect(r.text).toMatch(/line 29$/)
      expect(r.details.totalLines).toBe(50)
      expect(r.details.startLine).toBe(20)
      expect(r.details.numLines).toBe(10)
    })

    it('paginated read with oversized limit is REFUSED with hint to reduce', async () => {
      const f = path.join(tmp, 'big.txt')
      const line = 'x'.repeat(99) + '\n'
      fs.writeFileSync(f, line.repeat(12000))

      const tool = new FileTool()
      const r = await tool.execute('id', { operation: 'read', path: f, offset: 1, limit: 999999 })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/too large/i)
      expect(r.error).toMatch(/reduce limit/i)
    })
  })
})
