import { describe, it, expect, beforeEach } from 'vitest'
import {
  isContextOverflowError,
  parseContextLimit,
  canReactiveCompact,
  markReactiveCompact,
  clearCooldown,
} from '../contextErrorDetector.js'

describe('contextErrorDetector.isContextOverflowError', () => {
  it('detects OpenAI context_length_exceeded code + message', () => {
    const err = {
      status: 400,
      code: 'context_length_exceeded',
      message: "This model's maximum context length is 128000 tokens. However, you requested 200000 tokens (190000 in the messages, 10000 in the completion).",
    }
    expect(isContextOverflowError(err)).toBe(true)
  })

  it('detects OpenRouter-style "maximum context length is N"', () => {
    const err = {
      status: 400,
      message: 'maximum context length is 131072 tokens. However, you requested about 150000 tokens (145000 of text input)',
    }
    expect(isContextOverflowError(err)).toBe(true)
  })

  it('detects Anthropic "prompt is too long"', () => {
    const err = {
      status: 400,
      message: 'prompt is too long: 300000 tokens > 200000 maximum',
    }
    expect(isContextOverflowError(err)).toBe(true)
  })

  it('detects Gemini-style "exceeds the maximum number of tokens"', () => {
    const err = {
      status: 400,
      message: 'Input exceeds the maximum number of tokens allowed',
    }
    expect(isContextOverflowError(err)).toBe(true)
  })

  it('rejects unrelated errors (rate limit)', () => {
    const err = { status: 429, message: 'rate limit exceeded' }
    expect(isContextOverflowError(err)).toBe(false)
  })

  it('rejects auth errors', () => {
    const err = { status: 401, message: 'invalid api key' }
    expect(isContextOverflowError(err)).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isContextOverflowError(null)).toBe(false)
    expect(isContextOverflowError(undefined)).toBe(false)
  })
})

describe('contextErrorDetector.parseContextLimit', () => {
  it('parses full OpenAI breakdown', () => {
    const err = {
      message: "This model's maximum context length is 128000 tokens. However, you requested 200000 tokens (190000 in the messages, 10000 in the completion).",
    }
    expect(parseContextLimit(err)).toEqual({ limit: 128000, input: 190000, output: 10000 })
  })

  it('parses OpenRouter "text input" shape', () => {
    const err = {
      message: 'maximum context length is 131072 tokens. However, you requested about 150000 tokens (145000 of text input)',
    }
    expect(parseContextLimit(err)).toEqual({ limit: 131072, input: 145000, output: null })
  })

  it('parses Anthropic "prompt is too long"', () => {
    const err = { message: 'prompt is too long: 300000 tokens > 200000 maximum' }
    expect(parseContextLimit(err)).toEqual({ limit: 200000, input: 300000, output: null })
  })

  it('returns null when message does not match any pattern', () => {
    expect(parseContextLimit({ message: 'something else' })).toBeNull()
    expect(parseContextLimit(null)).toBeNull()
  })
})

describe('contextErrorDetector cooldown', () => {
  beforeEach(() => {
    clearCooldown('test-chat-1')
    clearCooldown('test-chat-2')
  })

  it('allows reactive compact on first call', () => {
    expect(canReactiveCompact('test-chat-1')).toBe(true)
  })

  it('blocks second compact within cooldown window on same chat', () => {
    markReactiveCompact('test-chat-1')
    expect(canReactiveCompact('test-chat-1')).toBe(false)
  })

  it('different chats have independent cooldowns', () => {
    markReactiveCompact('test-chat-1')
    expect(canReactiveCompact('test-chat-1')).toBe(false)
    expect(canReactiveCompact('test-chat-2')).toBe(true)
  })

  it('clearCooldown lets the next compact through again', () => {
    markReactiveCompact('test-chat-1')
    expect(canReactiveCompact('test-chat-1')).toBe(false)
    clearCooldown('test-chat-1')
    expect(canReactiveCompact('test-chat-1')).toBe(true)
  })

  it('missing chatId does not crash and allows compact', () => {
    expect(canReactiveCompact(null)).toBe(true)
    expect(canReactiveCompact(undefined)).toBe(true)
    markReactiveCompact(null)  // no-op
    expect(canReactiveCompact(null)).toBe(true)
  })
})
