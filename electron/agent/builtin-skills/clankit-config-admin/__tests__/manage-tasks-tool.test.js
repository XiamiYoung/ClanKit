import { describe, it, expect } from 'vitest'
import {
  validateTaskInput,
  normalizeTaskInput,
  validatePlanInput,
  normalizePlanInput,
  normalizeStep,
  normalizeSchedule,
  validateCategoryInput,
  normalizeCategoryInput,
} from '../manage-tasks-tool.js'

describe('validateTaskInput', () => {
  it('rejects missing name', () => {
    expect(validateTaskInput({ prompt: 'p' })).toMatch(/name/)
  })
  it('rejects missing prompt', () => {
    expect(validateTaskInput({ name: 'x' })).toMatch(/prompt/)
  })
  it('rejects name > 80 chars', () => {
    expect(validateTaskInput({ name: 'a'.repeat(81), prompt: 'p' })).toMatch(/name/)
  })
  it('accepts valid task', () => {
    expect(validateTaskInput({ name: 'Summarize', prompt: 'Summarize text' })).toBeNull()
  })
})

describe('normalizeTaskInput', () => {
  it('fills defaults', () => {
    const t = normalizeTaskInput({ name: '  Foo  ', prompt: 'p' })
    expect(t.name).toBe('Foo')
    expect(t.icon).toBe('✍️')
    expect(t.description).toBe('')
    expect(t.categoryId).toBeNull()
  })
})

describe('normalizeSchedule', () => {
  it('coerces null/undefined to manual', () => {
    expect(normalizeSchedule(null).type).toBe('manual')
    expect(normalizeSchedule(undefined).type).toBe('manual')
  })
  it('passes through object schedule', () => {
    const s = normalizeSchedule({ type: 'cron', cron: '0 8 * * *', timezone: 'UTC', enabled: true })
    expect(s.type).toBe('cron')
    expect(s.cron).toBe('0 8 * * *')
    expect(s.enabled).toBe(true)
  })
  it('accepts cron string and wraps as object', () => {
    const s = normalizeSchedule('0 8 * * *')
    expect(s.type).toBe('cron')
    expect(s.cron).toBe('0 8 * * *')
  })
  it('defaults enabled=false when not specified', () => {
    expect(normalizeSchedule({ type: 'cron', cron: '0 8 * * *' }).enabled).toBe(false)
  })
})

describe('normalizeStep', () => {
  it('rejects step without taskId', () => {
    expect(() => normalizeStep({})).toThrow(/taskId/)
  })
  it('fills defaults', () => {
    const s = normalizeStep({ taskId: 'abc', defaultAgentIds: ['a1'] })
    expect(s.taskId).toBe('abc')
    expect(s.runCondition).toBe('always')
    expect(s.dependsOn).toEqual([])
    expect(s.promptOverride).toBe('')
    expect(s.id).toBeTruthy()
  })
  it('preserves provided fields', () => {
    const s = normalizeStep({
      id: 'sid', taskId: 'abc', defaultAgentIds: ['a1'],
      promptOverride: 'override', dependsOn: ['s0'], runCondition: 'on_success',
    })
    expect(s.id).toBe('sid')
    expect(s.runCondition).toBe('on_success')
    expect(s.dependsOn).toEqual(['s0'])
  })
})

describe('validatePlanInput', () => {
  it('rejects missing name', () => {
    expect(validatePlanInput({ steps: [{ taskId: 't', defaultAgentIds: ['a'] }] })).toMatch(/name/)
  })
  it('rejects empty steps', () => {
    expect(validatePlanInput({ name: 'P', steps: [] })).toMatch(/step/)
  })
  it('rejects step missing taskId', () => {
    expect(validatePlanInput({ name: 'P', steps: [{ defaultAgentIds: ['a'] }] })).toMatch(/taskId/)
  })
  it('rejects step with no agents', () => {
    expect(validatePlanInput({ name: 'P', steps: [{ taskId: 't', defaultAgentIds: [] }] })).toMatch(/agent/)
  })
  it('accepts valid plan', () => {
    expect(validatePlanInput({
      name: 'P', steps: [{ taskId: 't1', defaultAgentIds: ['a1'] }],
    })).toBeNull()
  })
})

describe('normalizePlanInput', () => {
  it('fills defaults including manual schedule', () => {
    const p = normalizePlanInput({
      name: 'P', steps: [{ taskId: 't', defaultAgentIds: ['a'] }],
    })
    expect(p.permissionMode).toBe('all_permissions')
    expect(p.allowList).toEqual([])
    expect(p.schedule.type).toBe('manual')
    expect(p.steps).toHaveLength(1)
    expect(p.steps[0].id).toBeTruthy()
  })
})

describe('validateCategoryInput', () => {
  it('rejects missing name', () => {
    expect(validateCategoryInput({})).toMatch(/name/)
  })
  it('accepts valid category', () => {
    expect(validateCategoryInput({ name: 'Daily' })).toBeNull()
  })
})

describe('normalizeCategoryInput', () => {
  it('defaults emoji and sortOrder', () => {
    const c = normalizeCategoryInput({ name: 'X' })
    expect(c.emoji).toBe('📁')
    expect(c.sortOrder).toBe(0)
  })
})
