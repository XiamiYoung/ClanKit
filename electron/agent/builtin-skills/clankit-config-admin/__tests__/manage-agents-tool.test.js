import { describe, it, expect } from 'vitest'
import {
  validateAgentInput,
  normalizeAgentInput,
  validateCategoryInput,
  normalizeCategoryInput,
  formatAgentSummary,
  autoFillProviderModel,
} from '../manage-agents-tool.js'

describe('validateAgentInput', () => {
  it('treats missing type as system (so still requires provider/model)', () => {
    // Default type is system; validation cascades to the provider-required check.
    expect(validateAgentInput({ name: 'x', prompt: 'y' })).toMatch(/provider/)
  })
  it('accepts missing type when provider+model are present (defaults to system)', () => {
    expect(validateAgentInput({
      name: 'x', prompt: 'y', providerId: 'p', modelId: 'm',
    })).toBeNull()
  })
  it('rejects bad type', () => {
    expect(validateAgentInput({ type: 'admin', name: 'x', prompt: 'y' })).toMatch(/type/)
  })
  it('rejects missing name', () => {
    expect(validateAgentInput({ type: 'system', prompt: 'y' })).toMatch(/name/)
  })
  it('rejects name > 50 chars', () => {
    expect(validateAgentInput({ type: 'system', name: 'a'.repeat(51), prompt: 'y' })).toMatch(/name/)
  })
  it('rejects system agent without providerId or modelId', () => {
    expect(validateAgentInput({ type: 'system', name: 'x', prompt: 'y' })).toMatch(/provider/)
  })
  it('accepts valid system agent', () => {
    expect(validateAgentInput({
      type: 'system', name: 'x', prompt: 'y', providerId: 'p', modelId: 'm',
    })).toBeNull()
  })
  it('accepts valid user persona without provider', () => {
    expect(validateAgentInput({
      type: 'user', name: 'x', prompt: 'y',
    })).toBeNull()
  })
})

describe('normalizeAgentInput', () => {
  it('fills defaults', () => {
    const out = normalizeAgentInput({
      type: 'system', name: '  Foo  ', prompt: 'p', providerId: 'q', modelId: 'm',
    })
    expect(out.name).toBe('Foo')
    expect(out.description).toBe('')
    expect(out.requiredToolIds).toEqual([])
    expect(out.requiredSkillIds).toEqual([])
    expect(out.requiredMcpServerIds).toEqual([])
    expect(out.requiredKnowledgeBaseIds).toEqual([])
    expect(out.categoryIds).toEqual([])
    expect(out.isDefault).toBe(false)
    expect(out.isBuiltin).toBe(false)
  })
  it('defaults type to system when missing', () => {
    const out = normalizeAgentInput({ name: 'X', prompt: 'p', providerId: 'q', modelId: 'm' })
    expect(out.type).toBe('system')
  })
  it('defaults type to system for empty string', () => {
    const out = normalizeAgentInput({ type: '', name: 'X', prompt: 'p', providerId: 'q', modelId: 'm' })
    expect(out.type).toBe('system')
  })
  it('preserves explicit user type', () => {
    const out = normalizeAgentInput({ type: 'user', name: 'X', prompt: 'p' })
    expect(out.type).toBe('user')
  })
  it('preserves provided arrays', () => {
    const out = normalizeAgentInput({
      type: 'system', name: 'x', prompt: 'p', providerId: 'q', modelId: 'm',
      requiredToolIds: ['t1', 't2'],
      categoryIds: ['c1'],
    })
    expect(out.requiredToolIds).toEqual(['t1', 't2'])
    expect(out.categoryIds).toEqual(['c1'])
  })
})

describe('validateCategoryInput', () => {
  it('rejects missing type', () => {
    expect(validateCategoryInput({ name: 'x' })).toMatch(/type/)
  })
  it('rejects missing name', () => {
    expect(validateCategoryInput({ type: 'system' })).toMatch(/name/)
  })
  it('accepts valid category', () => {
    expect(validateCategoryInput({ type: 'system', name: 'Work', emoji: 'briefcase' })).toBeNull()
  })
})

describe('normalizeCategoryInput', () => {
  it('defaults emoji to folder', () => {
    const out = normalizeCategoryInput({ type: 'system', name: 'X' })
    expect(out.emoji).toBe('📁')
    expect(out.sortOrder).toBe(0)
  })
})

describe('autoFillProviderModel', () => {
  const cfg = { utilityModel: { provider: 'qwen', model: 'qwen-plus-latest' } }
  it('fills both fields when missing for system agent', () => {
    const out = autoFillProviderModel({ type: 'system', name: 'x' }, cfg)
    expect(out.providerId).toBe('qwen')
    expect(out.modelId).toBe('qwen-plus-latest')
  })
  it('fills missing modelId only', () => {
    const out = autoFillProviderModel({ type: 'system', name: 'x', providerId: 'p' }, cfg)
    expect(out.providerId).toBe('p')
    expect(out.modelId).toBe('qwen-plus-latest')
  })
  it('does not overwrite caller-provided values', () => {
    const out = autoFillProviderModel(
      { type: 'system', name: 'x', providerId: 'custom', modelId: 'custom-m' },
      cfg
    )
    expect(out.providerId).toBe('custom')
    expect(out.modelId).toBe('custom-m')
  })
  it('no-op for user persona', () => {
    const out = autoFillProviderModel({ type: 'user', name: 'x' }, cfg)
    expect(out.providerId).toBeUndefined()
    expect(out.modelId).toBeUndefined()
  })
  it('no-op when config has no utilityModel', () => {
    const out = autoFillProviderModel({ type: 'system', name: 'x' }, {})
    expect(out.providerId).toBeUndefined()
    expect(out.modelId).toBeUndefined()
  })
  it('does not mutate input', () => {
    const input = { type: 'system', name: 'x' }
    autoFillProviderModel(input, cfg)
    expect(input.providerId).toBeUndefined()
  })
})

describe('formatAgentSummary', () => {
  it('returns id + name + type', () => {
    const s = formatAgentSummary({ id: 'abc', type: 'system', name: 'Clank', description: 'd' })
    expect(s).toContain('abc')
    expect(s).toContain('Clank')
    expect(s).toContain('system')
  })
})
