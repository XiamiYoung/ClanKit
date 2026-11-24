import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const { createCoalescingRunner } = createRequire(import.meta.url)('../aidocQueue')

describe('AI Doc index queue', () => {
  it('shares an incremental run and resolves queued rebuild callers after their own run', async () => {
    let finishIncremental
    const task = vi.fn(({ full }) => full
      ? 'rebuilt'
      : new Promise(resolve => { finishIncremental = resolve }))
    const run = createCoalescingRunner(task)
    const incremental = run()
    expect(run()).toBe(incremental)
    const rebuild = run({ full: true })
    expect(run({ full: true })).toBe(rebuild)
    expect(rebuild).not.toBe(incremental)
    await Promise.resolve()
    expect(task).toHaveBeenCalledTimes(1)
    finishIncremental('incremental')
    await expect(incremental).resolves.toBe('incremental')
    await expect(rebuild).resolves.toBe('rebuilt')
    expect(task).toHaveBeenCalledTimes(2)
    await expect(run({ full: true })).resolves.toBe('rebuilt')
    expect(task).toHaveBeenCalledTimes(3)
  })

  it('runs a pending rebuild even if the incremental update fails', async () => {
    const run = createCoalescingRunner(({ full }) => {
      if (!full) throw new Error('read failed')
      return 'rebuilt'
    })
    const incremental = run()
    const rebuild = run({ full: true })
    await expect(incremental).rejects.toThrow('read failed')
    await expect(rebuild).resolves.toBe('rebuilt')
  })
})
