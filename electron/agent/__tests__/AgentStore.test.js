import { describe, it, expect } from 'vitest'
import { rowToAgent, agentToRow, serializeIds, deserializeIds } from '../AgentStore.js'

describe('serializeIds', () => {
  it('converts arrays to JSON strings', () => {
    expect(serializeIds(['a', 'b'])).toBe('["a","b"]')
  })
  it('returns "[]" for non-arrays', () => {
    expect(serializeIds(null)).toBe('[]')
    expect(serializeIds(undefined)).toBe('[]')
    expect(serializeIds('x')).toBe('[]')
  })
})

describe('deserializeIds', () => {
  it('parses valid JSON arrays', () => {
    expect(deserializeIds('["a","b"]')).toEqual(['a', 'b'])
  })
  it('returns [] for null/empty/invalid', () => {
    expect(deserializeIds(null)).toEqual([])
    expect(deserializeIds('')).toEqual([])
    expect(deserializeIds('not json')).toEqual([])
    expect(deserializeIds('"a string"')).toEqual([])
  })
})

describe('rowToAgent / agentToRow round-trip', () => {
  it('preserves all 20 fields through round-trip', () => {
    const agent = {
      id: 'test-agent-1',
      type: 'system',
      name: 'Tester',
      avatar: 'a3',
      description: 'desc',
      prompt: 'you are a tester',
      providerId: 'qwen',
      modelId: 'qwen-plus-latest',
      voiceId: 'zh-CN-YunxiaNeural',
      isDefault: false,
      isBuiltin: true,
      createdAt: 1700000000000,
      updatedAt: 1777553009717,
      categoryIds: ['cat1', 'cat2'],
      requiredToolIds: ['tool1'],
      requiredSkillIds: ['skill1', 'skill2'],
      requiredMcpServerIds: [],
      requiredKnowledgeBaseIds: [],
    }
    const row = agentToRow(agent)
    const back = rowToAgent(row)
    expect(back).toMatchObject(agent)
  })

  it('rowToAgent maps kind -> type', () => {
    const row = { id: 'x', kind: 'user', name: 'P', is_default: 0, is_builtin: 0 }
    expect(rowToAgent(row).type).toBe('user')
  })

  it('agentToRow maps type -> kind', () => {
    const a = { id: 'x', type: 'user', name: 'P' }
    expect(agentToRow(a).kind).toBe('user')
  })

  it('rowToAgent coerces is_default/is_builtin INTEGER to boolean', () => {
    const row = { id: 'x', kind: 'system', name: 'P', is_default: 1, is_builtin: 1 }
    const a = rowToAgent(row)
    expect(a.isDefault).toBe(true)
    expect(a.isBuiltin).toBe(true)
  })

  it('agentToRow coerces boolean to 0/1', () => {
    const r = agentToRow({ id: 'x', type: 'system', name: 'P', isDefault: true, isBuiltin: false })
    expect(r.is_default).toBe(1)
    expect(r.is_builtin).toBe(0)
  })

  it('rowToAgent returns null for null input', () => {
    expect(rowToAgent(null)).toBeNull()
  })
})
