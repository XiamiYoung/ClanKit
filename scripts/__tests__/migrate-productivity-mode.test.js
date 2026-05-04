import { describe, it, expect } from 'vitest'
import { migrateChatRecord } from '../migrate-productivity-mode.js'

describe('migrateChatRecord', () => {
  it('codingMode=true sets mode=productivity, keeps workingPath, drops coding fields', () => {
    const c = {
      id: 'x',
      title: 't',
      codingMode: true,
      workingPath: '/proj',
      codingProvider: 'claude-code'
    }
    const out = migrateChatRecord(c)
    expect(out.mode).toBe('productivity')
    expect(out.workingPath).toBe('/proj')
    expect(out).not.toHaveProperty('codingMode')
    expect(out).not.toHaveProperty('codingProvider')
    expect(out.modeTransitions).toEqual([])
    expect(out.modeTransitionPending).toBeNull()
    expect(out.productivityModeNoticeShown).toBe(true)
  })

  it('codingMode=false sets mode=chat and drops coding fields', () => {
    const c = { id: 'b', title: 't', codingMode: false, codingProvider: 'x' }
    const out = migrateChatRecord(c)
    expect(out.mode).toBe('chat')
    expect(out).not.toHaveProperty('codingMode')
    expect(out).not.toHaveProperty('codingProvider')
    expect(out.productivityModeNoticeShown).toBe(false)
  })

  it('codingMode absent sets mode=chat', () => {
    const c = { id: 'a', title: 't' }
    const out = migrateChatRecord(c)
    expect(out.mode).toBe('chat')
    expect(out.productivityModeNoticeShown).toBe(false)
    expect(out.modeTransitions).toEqual([])
    expect(out.modeTransitionPending).toBeNull()
  })

  it('already-migrated chat is left untouched (idempotent)', () => {
    const already = {
      id: 'x',
      title: 't',
      mode: 'productivity',
      modeTransitions: [{ from: 'chat', to: 'productivity', at: 1, afterMessageId: null }],
      modeTransitionPending: null,
      productivityModeNoticeShown: true,
      workingPath: '/keep'
    }
    const out = migrateChatRecord(already)
    expect(out).toEqual(already)
    expect(out).toBe(already)  // same object reference returned for idempotent path
  })

  it('chat with mode=chat is also idempotent', () => {
    const already = {
      id: 'y',
      title: 't',
      mode: 'chat',
      modeTransitions: [],
      modeTransitionPending: null,
      productivityModeNoticeShown: false,
      workingPath: null
    }
    const out = migrateChatRecord(already)
    expect(out).toEqual(already)
  })
})
