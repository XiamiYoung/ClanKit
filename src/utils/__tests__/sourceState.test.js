import { describe, expect, it } from 'vitest'
import { lookupSourceState, normalizeSourcePathKey } from '../sourceState'

describe('lookupSourceState', () => {
  it('matches Windows paths across separators and drive-letter case', () => {
    const states = { 'C:\\Vault\\kb_source\\a.md': 'new' }
    expect(lookupSourceState(states, 'c:/Vault/kb_source/a.md')).toBe('new')
    expect(lookupSourceState(states, 'C:\\Vault\\kb_source\\a.md')).toBe('new')
    expect(lookupSourceState(states, 'c:/vault/kb_source/a.md')).toBe('new')
    expect(lookupSourceState(states, 'c:/Vault/kb_source/b.md')).toBeUndefined()
  })

  it('keeps POSIX paths case-sensitive and tolerates missing input', () => {
    const states = { '/Vault/kb_source/a.md': 'updated' }
    expect(lookupSourceState(states, '/Vault/kb_source/a.md')).toBe('updated')
    expect(lookupSourceState(states, '/vault/kb_source/a.md')).toBeUndefined()
    expect(lookupSourceState(undefined, '/x')).toBeUndefined()
    expect(lookupSourceState(states, '')).toBeUndefined()
    expect(normalizeSourcePathKey('D:\\A\\b')).toBe('d:/a/b')
  })
})
