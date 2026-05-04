import { describe, it, expect } from 'vitest'
import {
  validateMcpInput,
  normalizeMcpInput,
  formatMcpSummary,
} from '../manage-mcp-tool.js'

describe('validateMcpInput', () => {
  it('rejects missing object', () => {
    expect(validateMcpInput(null)).toMatch(/object/)
  })
  it('rejects missing name', () => {
    expect(validateMcpInput({ command: 'node' })).toMatch(/name/)
  })
  it('rejects missing command', () => {
    expect(validateMcpInput({ name: 'x' })).toMatch(/command/)
  })
  it('rejects non-array args', () => {
    expect(validateMcpInput({ name: 'x', command: 'node', args: 'foo' })).toMatch(/args/)
  })
  it('rejects non-string entries in args', () => {
    expect(validateMcpInput({ name: 'x', command: 'node', args: ['ok', 5] })).toMatch(/args/)
  })
  it('rejects array env', () => {
    expect(validateMcpInput({ name: 'x', command: 'node', env: ['a'] })).toMatch(/env/)
  })
  it('accepts valid input', () => {
    expect(validateMcpInput({
      name: 'fs',
      command: 'node',
      args: ['server.js'],
      env: { TOKEN: 'x' },
      description: 'fs server',
    })).toBeNull()
  })
  it('accepts minimal input (just name+command)', () => {
    expect(validateMcpInput({ name: 'x', command: 'node' })).toBeNull()
  })
})

describe('normalizeMcpInput', () => {
  it('trims, fills defaults, clones env', () => {
    const env = { TOKEN: 'secret' }
    const out = normalizeMcpInput({
      name: '  fs  ',
      command: '  node ',
      args: ['server.js'],
      env,
      description: '  d ',
    })
    expect(out.name).toBe('fs')
    expect(out.command).toBe('node')
    expect(out.args).toEqual(['server.js'])
    expect(out.env).toEqual({ TOKEN: 'secret' })
    expect(out.env).not.toBe(env)
    expect(out.description).toBe('d')
  })
  it('defaults missing fields', () => {
    const out = normalizeMcpInput({ name: 'x', command: 'y' })
    expect(out.args).toEqual([])
    expect(out.env).toEqual({})
    expect(out.description).toBe('')
  })
  it('stringifies non-string env values defensively', () => {
    const out = normalizeMcpInput({ name: 'x', command: 'y', env: { N: 5, B: true } })
    expect(out.env).toEqual({ N: '5', B: 'true' })
  })
  it('does not mutate input', () => {
    const input = { name: 'x', command: 'y', args: ['a'], env: { K: 'v' } }
    const before = JSON.stringify(input)
    normalizeMcpInput(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('formatMcpSummary', () => {
  it('renders id/name/command', () => {
    expect(formatMcpSummary({ id: 'a', name: 'fs', command: 'node' }))
      .toBe('id=a | name=fs | command=node')
  })
  it('handles null', () => {
    expect(formatMcpSummary(null)).toBe('(none)')
  })
})
