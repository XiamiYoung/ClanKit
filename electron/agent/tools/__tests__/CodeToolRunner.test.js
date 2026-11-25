import { describe, it, expect } from 'vitest'
const { runCodeTool, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } = require('../CodeToolRunner')

describe('CodeToolRunner', () => {
  it('returns the value as a JSON string', async () => {
    const r = await runCodeTool({ code: 'return { a: 1 }' })
    expect(r.ok).toBe(true)
    expect(r.result).toBe('{"a":1}')
  })

  it('passes input to the code as a string', async () => {
    expect((await runCodeTool({ code: 'return input.toUpperCase()', input: 'abc' })).result).toBe('"ABC"')
    expect((await runCodeTool({ code: 'return input', input: { x: 1 } })).result).toBe('"{\\"x\\":1}"')
    expect((await runCodeTool({ code: 'return input' })).result).toBe('""')
  })

  it('captures console.log lines', async () => {
    const r = await runCodeTool({ code: "console.log('hi', 2); return 1" })
    expect(r.ok).toBe(true)
    expect(r.logs).toEqual(['hi 2'])
  })

  it('reports thrown errors without throwing', async () => {
    const r = await runCodeTool({ code: "throw new Error('boom')" })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('boom')
  })

  it('kills a synchronous infinite loop', async () => {
    const t0 = Date.now()
    const r = await runCodeTool({ code: 'while (true) {}', timeoutMs: 300 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('timed out')
    expect(Date.now() - t0).toBeLessThan(3000)
  })

  it('kills an async infinite wait', async () => {
    const r = await runCodeTool({ code: 'await new Promise(() => {})', timeoutMs: 300 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('timed out')
  })

  it('rejects results that cannot be serialised', async () => {
    const circular = await runCodeTool({ code: 'const a = {}; a.a = a; return a' })
    expect(circular.ok).toBe(false)
    expect(circular.error).toMatch(/serialis/i)
    const big = await runCodeTool({ code: 'return 10n' })
    expect(big.ok).toBe(false)
    expect(big.error).toMatch(/serialis/i)
  })

  it('treats an undefined result as empty', async () => {
    const r = await runCodeTool({ code: 'return undefined' })
    expect(r.ok).toBe(true)
    expect(r.result).toBe('')
  })

  it('truncates large results and many log lines', async () => {
    const r = await runCodeTool({ code: "return 'x'.repeat(5e6)" })
    expect(r.ok).toBe(true)
    expect(r.truncated).toBe(true)
    expect(r.result.length).toBeLessThan(200000)
    const logs = await runCodeTool({ code: "for (let i = 0; i < 100000; i++) console.log('line ' + i); return 1" })
    expect(logs.ok).toBe(true)
    expect(logs.logs.length).toBeLessThanOrEqual(200)
    expect(logs.truncated).toBe(true)
  })

  it('keeps total output small enough for the model-visible cap', async () => {
    const logs = await runCodeTool({ code: "for (let i = 0; i < 200; i++) console.log('x'.repeat(600)); return 'ok'" })
    expect(logs.ok).toBe(true)
    expect(logs.logs.join('').length).toBeLessThanOrEqual(12000)
    expect(logs.truncated).toBe(true)
    const quotes = await runCodeTool({ code: "return '\"'.repeat(5e6)" })
    expect(quotes.result.length).toBeLessThanOrEqual(24100)
  })

  it('user code cannot bypass the log caps by touching internals', async () => {
    const r = await runCodeTool({ code: "__logs.push('x'.repeat(1e7)); JSON.stringify = () => '1'; return 1" })
    expect(r.ok).toBe(true)
    expect(Array.isArray(r.logs)).toBe(true)
    expect(r.logs.every(line => typeof line === 'string')).toBe(true)
    expect(r.logs.join('').length).toBeLessThanOrEqual(12000)
  })

  it('has no binary buffers or typed arrays, so memory cannot grow outside the heap limit', async () => {
    const r = await runCodeTool({ code: "return ['ArrayBuffer','SharedArrayBuffer','WebAssembly','Atomics','DataView','Uint8Array','Float64Array','BigInt64Array'].map(n => typeof globalThis[n]).join()" })
    expect(r.result).toBe('"undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined"')
    const big = await runCodeTool({ code: 'return new Uint8Array(1e9).length' })
    expect(big.ok).toBe(false)
  })

  it('cannot reach the host by capturing promise resolve functions', async () => {
    const r = await runCodeTool({ code: `
      let leaked
      const original = Promise.prototype.then
      Promise.prototype.then = function (resolve, reject) { leaked = resolve; return original.call(this, resolve, reject) }
      await 1
      return leaked.constructor('return typeof process')()` })
    if (r.ok) expect(r.result).toBe('"undefined"')
    else expect(r.error).toBeTruthy()
  })

  it('has no host globals', async () => {
    const r = await runCodeTool({ code: 'return [typeof require, typeof process, typeof fetch, typeof setTimeout, typeof module].join()' })
    expect(r.result).toBe('"undefined,undefined,undefined,undefined,undefined"')
  })

  it('cannot reach the host through constructors', async () => {
    const viaThis = await runCodeTool({ code: "return typeof this.constructor.constructor('return process')()" })
    const viaLog = await runCodeTool({ code: "return typeof console.log.constructor('return process')()" })
    for (const r of [viaThis, viaLog]) {
      if (r.ok) expect(r.result).toBe('"undefined"')
      else expect(r.error).toBeTruthy()
    }
  })

  it('enforces the heap limit without killing the host', async () => {
    const r = await runCodeTool({ code: 'const a = []; while (true) a.push(new Array(1e6).fill(1))', timeoutMs: 8000 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/memory|heap/i) // a timeout would not prove the limit works
  })

  it('terminates when the abort signal fires', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)
    const r = await runCodeTool({ code: 'while (true) {}', timeoutMs: 8000, signal: controller.signal })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('aborted')
  })

  it('exposes sane timeout constants', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10000)
    expect(MAX_TIMEOUT_MS).toBe(30000)
  })
})
