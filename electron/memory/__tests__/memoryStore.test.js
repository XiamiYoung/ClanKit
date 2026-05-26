// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// memoryStore lazily requires better-sqlite3/vectra, so importing the module
// (for its pure helpers) does not load native bindings.
const { _createSerialQueue, _isVecCorruptionError } = require('../memoryStore')

describe('_createSerialQueue', () => {
  it('runs tasks one at a time, never interleaving', async () => {
    const enqueue = _createSerialQueue()
    const events = []
    const task = (name, ms) => async () => {
      events.push(`${name}:start`)
      await new Promise(r => setTimeout(r, ms))
      events.push(`${name}:end`)
    }
    // Fire concurrently — a (slow) must fully finish before b (fast) starts.
    const pA = enqueue(task('a', 30))
    const pB = enqueue(task('b', 1))
    await Promise.all([pA, pB])
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('a rejected task does not break the chain', async () => {
    const enqueue = _createSerialQueue()
    const pA = enqueue(async () => { throw new Error('boom') })
    const pB = enqueue(async () => 'ok')
    await expect(pA).rejects.toThrow('boom')
    await expect(pB).resolves.toBe('ok')
  })
})

describe('_isVecCorruptionError', () => {
  it('matches vectra JSON-corruption signatures', () => {
    expect(_isVecCorruptionError('Unexpected non-whitespace character after JSON at position 57690')).toBe(true)
    expect(_isVecCorruptionError('Unexpected end of JSON input')).toBe(true)
    expect(_isVecCorruptionError('xxx is not valid JSON')).toBe(true)
    expect(_isVecCorruptionError(new Error('Unexpected token } in JSON at position 5'))).toBe(true)
  })
  it('does not match unrelated errors', () => {
    expect(_isVecCorruptionError('ENOENT: no such file or directory')).toBe(false)
    expect(_isVecCorruptionError('embedding model not ready')).toBe(false)
    expect(_isVecCorruptionError(null)).toBe(false)
    expect(_isVecCorruptionError(undefined)).toBe(false)
  })
})
