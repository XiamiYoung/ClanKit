import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const {
  shouldNotify,
  hardTruncate,
  buildSummary,
  _t,
  setFocus,
  setRoute,
  setActiveChat,
  getState,
} = require('../notifier')

describe('notifier.shouldNotify', () => {
  const focused = { isFocused: true,  currentRoute: '/chats', activeChatId: 'chat-A' }
  const blurred = { isFocused: false, currentRoute: '/chats', activeChatId: 'chat-A' }

  it('returns false when disabled', () => {
    expect(shouldNotify(focused, { chatId: 'chat-B', enabled: false })).toBe(false)
    expect(shouldNotify(blurred, { chatId: null,     enabled: false })).toBe(false)
  })

  it('returns true when window is blurred regardless of route/chat', () => {
    expect(shouldNotify(blurred, { chatId: 'chat-A', enabled: true })).toBe(true)
    expect(shouldNotify(blurred, { chatId: null,     enabled: true })).toBe(true)
  })

  it('returns true when route is not /chats', () => {
    const state = { isFocused: true, currentRoute: '/config', activeChatId: 'chat-A' }
    expect(shouldNotify(state, { chatId: 'chat-A', enabled: true })).toBe(true)
  })

  it('returns true when viewing a different chat', () => {
    expect(shouldNotify(focused, { chatId: 'chat-B', enabled: true })).toBe(true)
  })

  it('returns false when focused on the same chat', () => {
    expect(shouldNotify(focused, { chatId: 'chat-A', enabled: true })).toBe(false)
  })

  it('returns true for task engine (no chatId) when enabled', () => {
    expect(shouldNotify(focused, { chatId: null, enabled: true })).toBe(true)
  })

  it('treats undefined chatId as no-chat context (task engine)', () => {
    expect(shouldNotify(focused, { enabled: true })).toBe(true)
  })
})

describe('notifier.hardTruncate', () => {
  it('returns empty string for nullish input', () => {
    expect(hardTruncate(null)).toBe('')
    expect(hardTruncate(undefined)).toBe('')
    expect(hardTruncate('')).toBe('')
  })

  it('collapses whitespace and trims', () => {
    expect(hardTruncate('  hello   world  ', 50)).toBe('hello world')
  })

  it('leaves short text unchanged', () => {
    expect(hardTruncate('short', 50)).toBe('short')
  })

  it('truncates with ellipsis when over limit', () => {
    const long = 'a'.repeat(100)
    const out  = hardTruncate(long, 10)
    expect(out.length).toBe(10)
    expect(out.endsWith('…')).toBe(true)
    expect(out).toBe('a'.repeat(9) + '…')
  })

  it('handles CJK characters by length', () => {
    const text = '这是一个测试文本用来验证中文截断功能'
    const out  = hardTruncate(text, 8)
    expect(out.length).toBe(8)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('notifier.buildSummary', () => {
  it('returns empty for null/empty input', async () => {
    expect(await buildSummary(null, {})).toBe('')
    expect(await buildSummary('', {})).toBe('')
    expect(await buildSummary('   ', {})).toBe('')
  })

  it('returns text unchanged when under limit (no AI call)', async () => {
    const aiStub = vi.fn()
    const out    = await buildSummary('hello world', {}, { _aiSummarize: aiStub, maxChars: 50 })
    expect(out).toBe('hello world')
    expect(aiStub).not.toHaveBeenCalled()
  })

  it('calls AI when over limit and returns AI output when within bounds', async () => {
    const longInput = 'a'.repeat(100)
    const aiStub    = vi.fn().mockResolvedValue('AI-generated tight summary')
    const out       = await buildSummary(longInput, {}, { _aiSummarize: aiStub, maxChars: 50 })
    expect(aiStub).toHaveBeenCalledTimes(1)
    expect(out).toBe('AI-generated tight summary')
  })

  it('truncates AI output if AI exceeds maxChars', async () => {
    const longInput = 'a'.repeat(100)
    const aiStub    = vi.fn().mockResolvedValue('x'.repeat(80))
    const out       = await buildSummary(longInput, {}, { _aiSummarize: aiStub, maxChars: 20 })
    expect(out.length).toBe(20)
    expect(out.endsWith('…')).toBe(true)
  })

  it('falls back to hard-truncate when AI returns null', async () => {
    const longInput = 'b'.repeat(100)
    const aiStub    = vi.fn().mockResolvedValue(null)
    const out       = await buildSummary(longInput, {}, { _aiSummarize: aiStub, maxChars: 15 })
    expect(out.length).toBe(15)
    expect(out).toBe('b'.repeat(14) + '…')
  })

  it('falls back when AI returns whitespace only', async () => {
    const longInput = 'c'.repeat(100)
    const aiStub    = vi.fn().mockResolvedValue('   ')
    const out       = await buildSummary(longInput, {}, { _aiSummarize: aiStub, maxChars: 10 })
    expect(out.length).toBe(10)
    expect(out.endsWith('…')).toBe(true)
  })

  it('falls back to hard-truncate when AI impl throws', async () => {
    const longInput = 'd'.repeat(100)
    const aiStub    = vi.fn().mockImplementation(async () => { throw new Error('boom') })
    const out       = await buildSummary(longInput, {}, { _aiSummarize: aiStub, maxChars: 20 })
    expect(out.length).toBe(20)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('notifier._t (translations)', () => {
  it('returns English for en', () => {
    expect(_t('en', 'agentFinished',   { name: 'Alice' })).toBe('Alice finished')
    expect(_t('en', 'scheduledTask',   { name: 'Daily Brief' })).toBe('Scheduled task: Daily Brief')
    expect(_t('en', 'agentFallback')).toBe('Agent')
    expect(_t('en', 'taskFallback')).toBe('task')
    expect(_t('en', 'permissionTitle')).toBe('Permission needed')
    expect(_t('en', 'permissionBody',  { agent: 'Alice', tool: 'shell' }))
      .toBe('Alice is waiting for your approval to run shell.')
  })

  it('returns Chinese for zh', () => {
    expect(_t('zh', 'agentFinished',   { name: '小助手' })).toBe('小助手 已完成')
    expect(_t('zh', 'scheduledTask',   { name: '每日简报' })).toBe('计划任务：每日简报')
    expect(_t('zh', 'agentFallback')).toBe('智能体')
    expect(_t('zh', 'taskFallback')).toBe('任务')
    expect(_t('zh', 'permissionTitle')).toBe('需要授权')
    expect(_t('zh', 'permissionBody',  { agent: '小助手', tool: 'shell' }))
      .toBe('小助手 正在等待你批准执行 shell。')
  })

  it('falls back to English for unknown language', () => {
    expect(_t('de', 'agentFinished', { name: 'X' })).toBe('X finished')
    expect(_t(null, 'taskFallback')).toBe('task')
    expect(_t(undefined, 'agentFallback')).toBe('Agent')
  })

  it('handles missing interpolation vars gracefully', () => {
    expect(_t('en', 'agentFinished')).toBe(' finished')
    expect(_t('en', 'agentFinished', {})).toBe(' finished')
  })

  it('returns the key when key is unknown', () => {
    expect(_t('en', 'nonexistent')).toBe('nonexistent')
  })
})

describe('notifier state setters', () => {
  beforeEach(() => {
    setFocus(true)
    setRoute('/')
    setActiveChat(null)
  })

  it('tracks focus state', () => {
    setFocus(false)
    expect(getState().isFocused).toBe(false)
    setFocus(true)
    expect(getState().isFocused).toBe(true)
  })

  it('tracks route', () => {
    setRoute('/chats')
    expect(getState().currentRoute).toBe('/chats')
    setRoute(null)
    expect(getState().currentRoute).toBe('/')
  })

  it('tracks active chat', () => {
    setActiveChat('chat-123')
    expect(getState().activeChatId).toBe('chat-123')
    setActiveChat(null)
    expect(getState().activeChatId).toBe(null)
  })
})
