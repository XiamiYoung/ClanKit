// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// memoryStore lazily requires better-sqlite3/vectra, so importing the module
// (for its pure helpers) does not load native bindings.
const { _createSerialQueue } = require('../memoryStore')

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
