/**
 * Tests for the IPC serialization utilities (safeClone, safeCloneAll).
 *
 * These functions strip Vue reactive proxies before data crosses
 * the Electron IPC structured-clone boundary.
 */
import { describe, it, expect } from 'vitest'
import { safeClone, safeCloneAll } from '../ipcSerialize'

describe('safeClone', () => {
  it('returns null for null input', () => {
    expect(safeClone(null)).toBe(null)
  })

  it('returns undefined for undefined input', () => {
    expect(safeClone(undefined)).toBe(undefined)
  })

  it('returns number as-is', () => {
    expect(safeClone(42)).toBe(42)
    expect(safeClone(0)).toBe(0)
    expect(safeClone(-3.14)).toBe(-3.14)
  })

  it('returns string as-is', () => {
    expect(safeClone('string')).toBe('string')
    expect(safeClone('')).toBe('')
  })

  it('returns boolean as-is', () => {
    expect(safeClone(true)).toBe(true)
    expect(safeClone(false)).toBe(false)
  })

  it('deep-clones a plain object (not same reference)', () => {
    const original = { a: 1, b: 'two', c: true }
    const cloned = safeClone(original)
    expect(cloned).toEqual({ a: 1, b: 'two', c: true })
    expect(cloned).not.toBe(original)
  })

  it('deep-clones nested objects', () => {
    const original = { outer: { inner: { deep: 'value' } }, list: [1, 2, 3] }
    const cloned = safeClone(original)
    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned.outer).not.toBe(original.outer)
    expect(cloned.outer.inner).not.toBe(original.outer.inner)
    expect(cloned.list).not.toBe(original.list)
  })

  it('deep-clones arrays', () => {
    const original = [1, 'two', { three: 3 }]
    const cloned = safeClone(original)
    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned[2]).not.toBe(original[2])
  })

  it('strips undefined values from object properties (JSON round-trip)', () => {
    const original = { a: 1, b: undefined, c: 'three' }
    const cloned = safeClone(original)
    expect(cloned).toEqual({ a: 1, c: 'three' })
    expect('b' in cloned).toBe(false)
  })

  it('strips functions from objects (JSON round-trip)', () => {
    const original = { a: 1, fn: () => 'hello' }
    const cloned = safeClone(original)
    expect(cloned).toEqual({ a: 1 })
    expect('fn' in cloned).toBe(false)
  })

  it('handles empty object', () => {
    const cloned = safeClone({})
    expect(cloned).toEqual({})
  })

  it('handles empty array', () => {
    const cloned = safeClone([])
    expect(cloned).toEqual([])
  })
})


describe('safeCloneAll', () => {
  it('clones multiple values at once', () => {
    const obj = { key: 'value' }
    const arr = [1, 2, 3]
    const [clonedObj, clonedArr, clonedNum, clonedNull] = safeCloneAll(obj, arr, 42, null)

    expect(clonedObj).toEqual({ key: 'value' })
    expect(clonedObj).not.toBe(obj)
    expect(clonedArr).toEqual([1, 2, 3])
    expect(clonedArr).not.toBe(arr)
    expect(clonedNum).toBe(42)
    expect(clonedNull).toBe(null)
  })

  it('returns empty array when called with no arguments', () => {
    const result = safeCloneAll()
    expect(result).toEqual([])
  })

  it('handles single argument', () => {
    const [cloned] = safeCloneAll({ x: 1 })
    expect(cloned).toEqual({ x: 1 })
  })

  it('handles mixed primitives and objects', () => {
    const result = safeCloneAll('hello', 0, false, undefined, null, { a: 1 })
    expect(result).toEqual(['hello', 0, false, undefined, null, { a: 1 }])
  })
})
