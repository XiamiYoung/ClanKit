/**
 * Tests for the memory date-labeling fix.
 *
 * Bug: system prompt injected "### Today" / "### Yesterday" without absolute
 * dates, causing LLMs to infer the wrong date from memory content.
 *
 * Fix: labels now read "### 2026-04-02 (Today)" / "### 2026-04-01 (Yesterday)"
 *      and MemoryFlush headings include the date.
 *
 * All tests call production code directly — only the logger is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs   from 'fs'
import path from 'path'
import os   from 'os'
import { createRequire } from 'module'

// Stub logger before requiring production modules
vi.mock('../../../electron/logger', () => ({
  logger: {
    debug: vi.fn(),
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    agent: vi.fn(),
  }
}))

const require = createRequire(import.meta.url)
const { buildSystemPrompt } = require('../../../electron/agent/systemPromptBuilder')
const { MemoryFlush }       = require('../../../electron/agent/core/MemoryFlush')

// ─── systemPromptBuilder tests ───

describe('systemPromptBuilder — date labels', () => {
  const minimalConfig = {
    systemPrompt: 'You are a test assistant.',
    mcpServers: [],
    httpTools: [],
  }

  it('should include absolute date in Today label', () => {
    const prompt = buildSystemPrompt(
      minimalConfig, [], [], [], [],
      {}, null, null, null,
      {
        todayLogMd:    '- Did some work\n- Fixed a bug',
        todayDate:     '2026-04-02',
      }
    )
    expect(prompt).toContain('### 2026-04-02 (Today)')
    expect(prompt).not.toMatch(/### Today\n/)
  })

  it('should include absolute date in Yesterday label', () => {
    const prompt = buildSystemPrompt(
      minimalConfig, [], [], [], [],
      {}, null, null, null,
      {
        yesterdayLogMd: '- Yesterday work',
        yesterdayDate:  '2026-04-01',
      }
    )
    expect(prompt).toContain('### 2026-04-01 (Yesterday)')
    expect(prompt).not.toMatch(/### Yesterday\n/)
  })

  it('should include both dates when both logs exist', () => {
    const prompt = buildSystemPrompt(
      minimalConfig, [], [], [], [],
      {}, null, null, null,
      {
        todayLogMd:     '- Today session',
        todayDate:      '2026-04-02',
        yesterdayLogMd:  '- Yesterday session',
        yesterdayDate:   '2026-04-01',
      }
    )
    expect(prompt).toContain('### 2026-04-02 (Today)')
    expect(prompt).toContain('### 2026-04-01 (Yesterday)')
  })

  it('should fall back to plain label when date strings are missing', () => {
    const prompt = buildSystemPrompt(
      minimalConfig, [], [], [], [],
      {}, null, null, null,
      {
        todayLogMd:    '- Some work',
        yesterdayLogMd: '- Some work',
      }
    )
    expect(prompt).toContain('### Today (Today)')
    expect(prompt).toContain('### Yesterday (Yesterday)')
  })

  it('should not inject log sections when no logs exist', () => {
    const prompt = buildSystemPrompt(
      minimalConfig, [], [], [], [],
      {}, null, null, null,
      { todayDate: '2026-04-02', yesterdayDate: '2026-04-01' }
    )
    expect(prompt).not.toContain('Recent Session Logs')
    expect(prompt).not.toContain('(Today)')
    expect(prompt).not.toContain('(Yesterday)')
  })
})

// ─── MemoryFlush._appendToLog tests ───

describe('MemoryFlush._appendToLog — date in heading', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memflush-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should write session heading with YYYY-MM-DD date', () => {
    const flush = new MemoryFlush({
      model: 'test', apiKey: 'test', baseURL: 'http://test',
      isOpenAI: true,
    })

    flush._appendToLog(tmpDir, '- Fixed a critical bug\n- Deployed to staging', 'test-agent', { chatId: 'abc12345-xxxx' })

    const today = new Date().toISOString().slice(0, 10)
    const logFile = path.join(tmpDir, `${today}.md`)
    expect(fs.existsSync(logFile)).toBe(true)

    const content = fs.readFileSync(logFile, 'utf8')
    expect(content).toMatch(new RegExp(`## Session ${today} \\d{2}:\\d{2}`))
    expect(content).not.toMatch(/## Session \d{2}:\d{2} \|/)
  })

  it('should include chat tag and title in heading after date', () => {
    const flush = new MemoryFlush({
      model: 'test', apiKey: 'test', baseURL: 'http://test',
      isOpenAI: true,
    })

    flush._appendToLog(tmpDir, '- One task done', 'agent-1', { chatId: 'deadbeef-1234-5678' })

    const today = new Date().toISOString().slice(0, 10)
    const content = fs.readFileSync(path.join(tmpDir, `${today}.md`), 'utf8')

    expect(content).toContain('| chat:deadbeef')
    expect(content).toContain('| "One task done"')
    expect(content).toMatch(new RegExp(`## Session ${today} \\d{2}:\\d{2} \\|`))
  })

  it('should append multiple sessions to the same dated file', () => {
    const flush = new MemoryFlush({
      model: 'test', apiKey: 'test', baseURL: 'http://test',
      isOpenAI: true,
    })

    flush._appendToLog(tmpDir, '- First session', 'agent-1', {})
    flush._appendToLog(tmpDir, '- Second session', 'agent-1', {})

    const today = new Date().toISOString().slice(0, 10)
    const content = fs.readFileSync(path.join(tmpDir, `${today}.md`), 'utf8')

    const headings = content.match(/## Session /g)
    expect(headings).toHaveLength(2)
    expect(content).toContain('- First session')
    expect(content).toContain('- Second session')
  })
})
