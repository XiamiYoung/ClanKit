import { describe, it, expect } from 'vitest'
import { isAiDocEnabledForChat } from '../aidocMeta'

describe('isAiDocEnabledForChat', () => {
  it('is true for productivity chat with useAiDoc undefined', () => {
    expect(isAiDocEnabledForChat({ mode: 'productivity' })).toBe(true)
  })
  it('is false when useAiDoc is false', () => {
    expect(isAiDocEnabledForChat({ mode: 'productivity', useAiDoc: false })).toBe(false)
  })
  it('is false for chat mode even when useAiDoc is true', () => {
    expect(isAiDocEnabledForChat({ mode: 'chat', useAiDoc: true })).toBe(false)
  })
  it('is false for null', () => {
    expect(isAiDocEnabledForChat(null)).toBe(false)
  })
})
