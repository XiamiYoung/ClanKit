import { describe, it, expect } from 'vitest'
import {
  validateKbInput,
  normalizeKbInput,
  formatKbSummary,
} from '../manage-knowledge-tool.js'

describe('validateKbInput', () => {
  it('rejects missing object', () => {
    expect(validateKbInput(null)).toMatch(/object/)
  })
  it('rejects missing name', () => {
    expect(validateKbInput({})).toMatch(/name/)
  })
  it('rejects empty name after trim', () => {
    expect(validateKbInput({ name: '   ' })).toMatch(/name/)
  })
  it('rejects name over 80 chars', () => {
    expect(validateKbInput({ name: 'a'.repeat(81) })).toMatch(/name/)
  })
  it('rejects description over 500 chars', () => {
    expect(validateKbInput({ name: 'x', description: 'd'.repeat(501) })).toMatch(/description/)
  })
  it('accepts valid input', () => {
    expect(validateKbInput({ name: 'docs', description: 'project docs' })).toBeNull()
  })
  it('accepts minimal name-only', () => {
    expect(validateKbInput({ name: 'x' })).toBeNull()
  })
})

describe('normalizeKbInput', () => {
  it('trims name and description', () => {
    const out = normalizeKbInput({ name: '  docs  ', description: '  d  ' })
    expect(out).toEqual({ name: 'docs', description: 'd' })
  })
  it('defaults description to empty string', () => {
    expect(normalizeKbInput({ name: 'x' })).toEqual({ name: 'x', description: '' })
  })
  it('does not mutate input', () => {
    const input = { name: '  x  ', description: '  d  ' }
    const before = JSON.stringify(input)
    normalizeKbInput(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('formatKbSummary', () => {
  it('renders id/name/docs', () => {
    expect(formatKbSummary({ id: 'a', name: 'docs', documentCount: 3 }))
      .toBe('id=a | name=docs | docs=3')
  })
  it('defaults missing documentCount to 0', () => {
    expect(formatKbSummary({ id: 'a', name: 'd' }))
      .toBe('id=a | name=d | docs=0')
  })
  it('handles null', () => {
    expect(formatKbSummary(null)).toBe('(none)')
  })
})
