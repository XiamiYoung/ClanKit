import { describe, it, expect } from 'vitest'
import {
  validateToolInput,
  normalizeToolInput,
  deriveToolId,
  fallbackToolId,
  formatToolSummary,
} from '../manage-tools-json-tool.js'

describe('deriveToolId', () => {
  it('lowercases and replaces non-alphanumeric with hyphen', () => {
    expect(deriveToolId('My Cool Tool!')).toBe('my-cool-tool')
  })
  it('collapses runs of separators and trims edge hyphens', () => {
    expect(deriveToolId('  --Foo @ Bar / 123 --')).toBe('foo-bar-123')
  })
  it('returns empty string for falsy input', () => {
    expect(deriveToolId('')).toBe('')
    expect(deriveToolId(null)).toBe('')
  })
  it('returns empty string for CJK-only name (lets caller fall back)', () => {
    expect(deriveToolId('天气查询')).toBe('')
    expect(deriveToolId('文档工具')).toBe('')
  })
  it('returns empty string when slug starts with a digit (invalid id)', () => {
    expect(deriveToolId('123 Foo')).toBe('')
  })
  it('best-effort slugifies mixed CJK + ASCII names', () => {
    expect(deriveToolId('AWS 文档工具')).toBe('aws')
  })
})

describe('fallbackToolId', () => {
  it('returns a tool-prefixed short ascii id', () => {
    const id = fallbackToolId()
    expect(id).toMatch(/^tool-[0-9a-f]{8}$/)
  })
  it('returns distinct ids on consecutive calls', () => {
    expect(fallbackToolId()).not.toBe(fallbackToolId())
  })
})

describe('normalizeToolInput http bodyTemplate default', () => {
  it('defaults bodyTemplate to "{}" for GET when caller omits it', () => {
    const out = normalizeToolInput({
      name: 'X', type: 'http', endpoint: 'https://x', method: 'GET',
    })
    expect(out.bodyTemplate).toBe('{}')
  })
  it('defaults bodyTemplate to "{}" for HEAD / DELETE', () => {
    expect(normalizeToolInput({ name: 'X', type: 'http', endpoint: 'https://x', method: 'HEAD' }).bodyTemplate).toBe('{}')
    expect(normalizeToolInput({ name: 'X', type: 'http', endpoint: 'https://x', method: 'DELETE' }).bodyTemplate).toBe('{}')
  })
  it('leaves bodyTemplate empty for POST when caller omits it', () => {
    const out = normalizeToolInput({
      name: 'X', type: 'http', endpoint: 'https://x', method: 'POST',
    })
    expect(out.bodyTemplate).toBe('')
  })
  it('preserves caller-provided non-empty bodyTemplate', () => {
    const out = normalizeToolInput({
      name: 'X', type: 'http', endpoint: 'https://x', method: 'GET',
      bodyTemplate: '{"q":"{q}"}',
    })
    expect(out.bodyTemplate).toBe('{"q":"{q}"}')
  })
})

describe('validateToolInput', () => {
  it('rejects missing object', () => {
    expect(validateToolInput(null)).toMatch(/object/)
  })
  it('rejects missing name', () => {
    expect(validateToolInput({ type: 'http', endpoint: 'https://x' })).toMatch(/name/)
  })
  it('rejects bad type', () => {
    expect(validateToolInput({ name: 'x', type: 'rpc' })).toMatch(/type/)
  })
  it('http requires endpoint', () => {
    expect(validateToolInput({ name: 'x', type: 'http' })).toMatch(/endpoint/)
  })
  it('http accepts valid', () => {
    expect(validateToolInput({
      name: 'x', type: 'http', endpoint: 'https://x', method: 'POST',
    })).toBeNull()
  })
  it('http rejects bad method', () => {
    expect(validateToolInput({
      name: 'x', type: 'http', endpoint: 'https://x', method: 'YEET',
    })).toMatch(/method/)
  })
  it('http rejects array headers', () => {
    expect(validateToolInput({
      name: 'x', type: 'http', endpoint: 'https://x', headers: ['a'],
    })).toMatch(/headers/)
  })
  it('code requires code body', () => {
    expect(validateToolInput({ name: 'x', type: 'code', language: 'js' })).toMatch(/code/)
  })
  it('prompt requires promptText', () => {
    expect(validateToolInput({ name: 'x', type: 'prompt' })).toMatch(/promptText/)
  })
  it('smtp accepts minimal input', () => {
    expect(validateToolInput({ name: 'x', type: 'smtp' })).toBeNull()
  })
})

describe('normalizeToolInput', () => {
  it('trims name and category, fills http defaults', () => {
    const out = normalizeToolInput({
      name: '  Foo  ', category: '  bar ', type: 'http', endpoint: ' /api ',
    })
    expect(out.name).toBe('Foo')
    expect(out.category).toBe('bar')
    expect(out.type).toBe('http')
    expect(out.method).toBe('GET')
    expect(out.endpoint).toBe('/api')
    expect(out.headers).toEqual({})
    expect(out.bodyTemplate).toBe('{}') // GET default
  })
  it('uppercases method and clones headers', () => {
    const headers = { 'X-Foo': '1' }
    const out = normalizeToolInput({
      name: 'x', type: 'http', endpoint: '/y', method: 'post', headers,
    })
    expect(out.method).toBe('POST')
    expect(out.headers).toEqual({ 'X-Foo': '1' })
    expect(out.headers).not.toBe(headers) // cloned
  })
  it('does not mutate input', () => {
    const input = { name: 'x', type: 'code', code: 'return 1' }
    const before = JSON.stringify(input)
    normalizeToolInput(input)
    expect(JSON.stringify(input)).toBe(before)
  })
  it('code defaults language to javascript', () => {
    const out = normalizeToolInput({ name: 'x', type: 'code', code: 'x' })
    expect(out.language).toBe('javascript')
  })
  it('smtp returns only base fields', () => {
    const out = normalizeToolInput({ name: 'x', type: 'smtp', description: 'd' })
    expect(out).toEqual({ name: 'x', description: 'd', category: '', type: 'smtp' })
  })
})

describe('formatToolSummary', () => {
  it('renders id/name/type', () => {
    expect(formatToolSummary({ id: 'a', name: 'b', type: 'http' }))
      .toBe('id=a | name=b | type=http')
  })
  it('handles null', () => {
    expect(formatToolSummary(null)).toBe('(none)')
  })
})
