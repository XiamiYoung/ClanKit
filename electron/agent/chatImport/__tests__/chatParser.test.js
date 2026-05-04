// @vitest-environment node
import { describe, it, expect } from 'vitest'

const { scrubOneTimeIds, buildMessageBlock } = require('../chatParser')

describe('scrubOneTimeIds — one-time identifier scrubber', () => {
  it('replaces EMS-style tracking IDs (E + 8-12 digits)', () => {
    expect(scrubOneTimeIds('单号 E99873940')).toBe('单号 [tracking_id]')
    expect(scrubOneTimeIds('已发件 E12345678901')).toBe('已发件 [tracking_id]')
    // International EMS with CN suffix
    expect(scrubOneTimeIds('E123456789CN')).toBe('[tracking_id]')
  })

  it('replaces letter-prefixed courier tracking IDs (SF / YT / ZTO etc.)', () => {
    expect(scrubOneTimeIds('SF1234567890123')).toBe('[tracking_id]')
    expect(scrubOneTimeIds('YT9876543210')).toBe('[tracking_id]')
    expect(scrubOneTimeIds('JD987654321012')).toBe('[tracking_id]')
  })

  it('replaces long pure-number IDs (12+ digits — order numbers, transaction IDs)', () => {
    expect(scrubOneTimeIds('订单号 123456789012')).toBe('订单号 [number]')
    expect(scrubOneTimeIds('交易 9876543210987654')).toBe('交易 [number]')
  })

  it('replaces WeChat IDs (wxid_xxx)', () => {
    expect(scrubOneTimeIds('联系 wxid_7930869305912')).toBe('联系 [contact_id]')
    expect(scrubOneTimeIds('wxid_abc-DEF_123')).toBe('[contact_id]')
  })

  it('preserves Chinese mobile numbers (11 digits, below threshold)', () => {
    expect(scrubOneTimeIds('我手机 13800138000')).toBe('我手机 13800138000')
  })

  it('preserves 4-digit years and prices', () => {
    expect(scrubOneTimeIds('2024年买的')).toBe('2024年买的')
    expect(scrubOneTimeIds('卖了300000')).toBe('卖了300000')
  })

  it('preserves model numbers (X5, GLC260)', () => {
    expect(scrubOneTimeIds('俺们家 X5 漏机油')).toBe('俺们家 X5 漏机油')
    expect(scrubOneTimeIds('GLC260 是进口')).toBe('GLC260 是进口')
  })

  it('handles mixed content', () => {
    const input = 'wxid_abc123 发了 E99873940，订单 123456789012 — 我手机 13800138000'
    const out = scrubOneTimeIds(input)
    expect(out).toContain('[contact_id]')
    expect(out).toContain('[tracking_id]')
    expect(out).toContain('[number]')
    expect(out).toContain('13800138000')  // phone preserved
    expect(out).not.toContain('wxid_abc123')
    expect(out).not.toContain('E99873940')
    expect(out).not.toContain('123456789012')
  })

  it('returns empty / null inputs unchanged', () => {
    expect(scrubOneTimeIds('')).toBe('')
    expect(scrubOneTimeIds(null)).toBe(null)
    expect(scrubOneTimeIds(undefined)).toBe(undefined)
  })
})

describe('buildMessageBlock — applies scrubbing transparently', () => {
  it('strips tracking IDs and wxids from the rendered chat block', () => {
    const classified = {
      all_messages: [
        { sender: 'them', content: '稍等', timestamp: '2025-09-13 15:53:20' },
        { sender: 'them', content: 'E99873940', timestamp: '2025-09-13 15:53:36' },
        { sender: 'me', content: '收到 wxid_abc123', timestamp: '2025-09-13 15:54:00' },
      ],
      long_messages: [],
      conflict_messages: [],
      sweet_messages: [],
      daily_messages: [],
    }
    const block = buildMessageBlock(classified, 'Lillian', 'other')
    expect(block).not.toContain('E99873940')
    expect(block).not.toContain('wxid_abc123')
    expect(block).toContain('[tracking_id]')
    expect(block).toContain('[contact_id]')
    // Real content stays
    expect(block).toContain('稍等')
    expect(block).toContain('收到')
    // Speaker labels stay (display names, not raw wxids)
    expect(block).toContain('Lillian:')
    expect(block).toContain('Me:')
  })
})
