import { describe, it, expect } from 'vitest'
import { computeContextBars } from '../contextBars'
import { paletteRgb } from '../chatPalette'

const NAMES = { a1: 'Alice', a2: 'Bob', a3: 'Carol' }
const AVATARS = { a1: 'data:image/svg+xml;base64,AAA', a2: null, a3: 'data:image/svg+xml;base64,CCC' }
const resolveName = (id) => NAMES[id]
const resolveAvatar = (id) => AVATARS[id] ?? null

describe('computeContextBars — group chat', () => {
  it('produces one bar per groupAgentIds entry in stable order', () => {
    const chat = {
      isGroupChat: true,
      groupAgentIds: ['a1', 'a2', 'a3'],
      perAgentContextMetrics: {
        a1: { effectiveInputTokens: 100_000, maxTokens: 1_000_000 },
        a2: { effectiveInputTokens: 500_000, maxTokens: 1_000_000 },
        a3: { effectiveInputTokens: 850_000, maxTokens: 1_000_000 },
      },
    }
    const { bars } = computeContextBars({ chat, resolveName, paletteRgb })
    expect(bars.map(b => b.agentId)).toEqual(['a1', 'a2', 'a3'])
    expect(bars.map(b => b.pct)).toEqual([10, 50, 85])
    expect(bars.map(b => b.agentName)).toEqual(['Alice', 'Bob', 'Carol'])
  })

  it('inputSum sums effectiveInputTokens across all agents', () => {
    const chat = {
      isGroupChat: true,
      groupAgentIds: ['a1', 'a2', 'a3'],
      perAgentContextMetrics: {
        a1: { effectiveInputTokens: 100_000, maxTokens: 1_000_000 },
        a2: { effectiveInputTokens: 500_000, maxTokens: 1_000_000 },
        a3: { effectiveInputTokens: 850_000, maxTokens: 1_000_000 },
      },
    }
    const { inputSum, isGroup } = computeContextBars({ chat, resolveName, paletteRgb })
    expect(isGroup).toBe(true)
    expect(inputSum).toBe(1_450_000)
  })

  it('rotates colors via paletteRgb(agentIdx) — agents get distinct base rgb', () => {
    const chat = {
      isGroupChat: true,
      groupAgentIds: ['a1', 'a2', 'a3'],
      perAgentContextMetrics: {
        a1: { effectiveInputTokens: 1, maxTokens: 100 },
        a2: { effectiveInputTokens: 1, maxTokens: 100 },
        a3: { effectiveInputTokens: 1, maxTokens: 100 },
      },
    }
    const { bars } = computeContextBars({ chat, resolveName, paletteRgb })
    expect(bars[0].baseRgb).toBe(paletteRgb(0))
    expect(bars[1].baseRgb).toBe(paletteRgb(1))
    expect(bars[2].baseRgb).toBe(paletteRgb(2))
    expect(new Set(bars.map(b => b.baseRgb)).size).toBe(3)
  })

  it('threshold colors override palette: >85% red, >65% orange, else palette', () => {
    const chat = {
      isGroupChat: true,
      groupAgentIds: ['a1', 'a2', 'a3'],
      perAgentContextMetrics: {
        a1: { effectiveInputTokens: 300_000, maxTokens: 1_000_000 }, // 30% → palette
        a2: { effectiveInputTokens: 700_000, maxTokens: 1_000_000 }, // 70% → orange
        a3: { effectiveInputTokens: 900_000, maxTokens: 1_000_000 }, // 90% → red
      },
    }
    const { bars } = computeContextBars({ chat, resolveName, paletteRgb })
    expect(bars[0].fillColor).toBe('rgb(' + paletteRgb(0) + ')')
    expect(bars[1].fillColor).toBe('#FF9500')
    expect(bars[2].fillColor).toBe('#FF3B30')
  })

  it('agent with no perAgentContextMetrics entry yields 0% bar, not omitted', () => {
    const chat = {
      isGroupChat: true,
      groupAgentIds: ['a1', 'a2', 'a3'],
      perAgentContextMetrics: {
        a1: { effectiveInputTokens: 100_000, maxTokens: 1_000_000 },
        // a2 missing — agent hasn't sent context_update yet
        a3: { effectiveInputTokens: 850_000, maxTokens: 1_000_000 },
      },
    }
    const { bars, inputSum } = computeContextBars({ chat, resolveName, paletteRgb })
    expect(bars.length).toBe(3)
    expect(bars[1].agentId).toBe('a2')
    expect(bars[1].pct).toBe(0)
    expect(bars[1].inputTokens).toBe(0)
    expect(inputSum).toBe(950_000)
  })

  it('stale perAgentContextMetrics keys (no longer in groupAgentIds) are ignored', () => {
    const chat = {
      isGroupChat: true,
      groupAgentIds: ['a1', 'a2'],
      perAgentContextMetrics: {
        a1: { effectiveInputTokens: 100_000, maxTokens: 1_000_000 },
        a2: { effectiveInputTokens: 500_000, maxTokens: 1_000_000 },
        ghost: { effectiveInputTokens: 9_999_999, maxTokens: 1_000_000 },
      },
    }
    const { bars, inputSum } = computeContextBars({ chat, resolveName, paletteRgb })
    expect(bars.map(b => b.agentId)).toEqual(['a1', 'a2'])
    expect(inputSum).toBe(600_000)
  })

  it('falls back to summing input + cache fields when effectiveInputTokens missing', () => {
    const chat = {
      isGroupChat: true,
      groupAgentIds: ['a1'],
      perAgentContextMetrics: {
        a1: {
          inputTokens: 50_000,
          cacheCreationInputTokens: 30_000,
          cacheReadInputTokens: 20_000,
          maxTokens: 1_000_000,
          // no effectiveInputTokens — legacy snapshot
        },
      },
    }
    const { bars, inputSum } = computeContextBars({ chat, resolveName, paletteRgb })
    expect(bars[0].inputTokens).toBe(100_000)
    expect(bars[0].pct).toBe(10)
    expect(inputSum).toBe(100_000)
  })
})

describe('computeContextBars — solo chat', () => {
  it('produces a single bar using sharedMetrics + soloRgb', () => {
    const chat = {
      isGroupChat: false,
      systemAgentId: 'a1',
      groupAgentIds: [],
      perAgentContextMetrics: {},
    }
    const sharedMetrics = { effectiveInputTokens: 100_000, maxTokens: 1_000_000, percentage: 10 }
    const { bars, inputSum, isGroup } = computeContextBars({
      chat, sharedMetrics, resolveName, paletteRgb, soloRgb: '37, 99, 235',
    })
    expect(isGroup).toBe(false)
    expect(bars.length).toBe(1)
    expect(bars[0].agentId).toBe('a1')
    expect(bars[0].agentName).toBe('Alice')
    expect(bars[0].baseRgb).toBe('37, 99, 235')
    expect(bars[0].pct).toBe(10)
    expect(inputSum).toBe(100_000)
  })

  it('isGroupChat=true but empty groupAgentIds is treated as solo', () => {
    const chat = {
      isGroupChat: true,
      systemAgentId: 'a1',
      groupAgentIds: [],
      perAgentContextMetrics: {},
    }
    const sharedMetrics = { effectiveInputTokens: 50_000, maxTokens: 1_000_000, percentage: 5 }
    const { bars, isGroup } = computeContextBars({
      chat, sharedMetrics, resolveName, paletteRgb, soloRgb: '37, 99, 235',
    })
    expect(isGroup).toBe(false)
    expect(bars.length).toBe(1)
  })

  it('threshold override applies to solo too', () => {
    const chat = { isGroupChat: false, systemAgentId: 'a1', groupAgentIds: [], perAgentContextMetrics: {} }
    const { bars } = computeContextBars({
      chat,
      sharedMetrics: { effectiveInputTokens: 950_000, maxTokens: 1_000_000, percentage: 95 },
      resolveName, paletteRgb, soloRgb: '37, 99, 235',
    })
    expect(bars[0].fillColor).toBe('#FF3B30')
  })

  it('falls back to defaultAgentId when chat.systemAgentId is empty', () => {
    const chat = { isGroupChat: false, systemAgentId: null, groupAgentIds: [], perAgentContextMetrics: {} }
    const { bars } = computeContextBars({
      chat,
      sharedMetrics: { effectiveInputTokens: 0, maxTokens: 1_000_000, percentage: 0 },
      resolveName: () => 'Default Agent',
      defaultAgentId: 'default-1',
      paletteRgb,
      soloRgb: '37, 99, 235',
    })
    expect(bars[0].agentId).toBe('default-1')
    expect(bars[0].agentName).toBe('Default Agent')
  })
})

describe('computeContextBars — agent avatars', () => {
  it('resolveAvatar populates agentAvatar on each group bar', () => {
    const chat = {
      isGroupChat: true,
      groupAgentIds: ['a1', 'a2', 'a3'],
      perAgentContextMetrics: {
        a1: { effectiveInputTokens: 1, maxTokens: 100 },
        a2: { effectiveInputTokens: 1, maxTokens: 100 },
        a3: { effectiveInputTokens: 1, maxTokens: 100 },
      },
    }
    const { bars } = computeContextBars({ chat, resolveName, resolveAvatar, paletteRgb })
    expect(bars[0].agentAvatar).toBe('data:image/svg+xml;base64,AAA')
    expect(bars[1].agentAvatar).toBeNull()
    expect(bars[2].agentAvatar).toBe('data:image/svg+xml;base64,CCC')
  })

  it('solo bar carries the active agent avatar', () => {
    const chat = { isGroupChat: false, systemAgentId: 'a1', groupAgentIds: [], perAgentContextMetrics: {} }
    const { bars } = computeContextBars({
      chat,
      sharedMetrics: { effectiveInputTokens: 10, maxTokens: 100, percentage: 10 },
      resolveName, resolveAvatar, paletteRgb, soloRgb: '37, 99, 235',
    })
    expect(bars[0].agentAvatar).toBe('data:image/svg+xml;base64,AAA')
  })

  it('agentAvatar defaults to null when resolveAvatar is not supplied', () => {
    const chat = {
      isGroupChat: true,
      groupAgentIds: ['a1'],
      perAgentContextMetrics: { a1: { effectiveInputTokens: 1, maxTokens: 100 } },
    }
    const { bars } = computeContextBars({ chat, resolveName, paletteRgb })
    expect(bars[0].agentAvatar).toBeNull()
  })
})

describe('computeContextBars — edge cases', () => {
  it('null chat returns empty bars and inputSum=0', () => {
    expect(computeContextBars({ chat: null, paletteRgb })).toEqual({ bars: [], inputSum: 0, isGroup: false })
  })
})
