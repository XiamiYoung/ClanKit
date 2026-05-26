// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { ensureSummary } = require('../Summarizer')

function fakeStore(initial = null) {
  let entry = initial
  return {
    getRunningSummary: () => entry,
    saveRunningSummary: vi.fn((_c, _k, e) => { entry = e }),
    _entry: () => entry,
  }
}

// Messages reaching the assembler are stripped to { role, content } — NO id,
// NO timestamp. The Summarizer must work without them (count-based watermark).
const evicted = [
  { role: 'user', content: 'q1' },
  { role: 'assistant', content: 'a1' },
  { role: 'user', content: 'q2' },
]

describe('ensureSummary', () => {
  it('returns native strategy for anthropic without any LLM call', async () => {
    const caller = vi.fn()
    const res = await ensureSummary({ providerType: 'anthropic', evicted, chatStore: fakeStore(), utilityModelCaller: caller })
    expect(res).toEqual({ strategy: 'native' })
    expect(caller).not.toHaveBeenCalled()
  })

  it('summarizes all evicted when no prior, persisting uptoCount', async () => {
    const store = fakeStore()
    const caller = vi.fn(async () => 'SUMMARY TEXT')
    const res = await ensureSummary({
      chatId: 'c1', agentKey: '__shared__', providerType: 'openai',
      evicted, chatStore: store, utilityModelCaller: caller,
    })
    expect(res.strategy).toBe('text')
    expect(res.summaryBlock).toContain('SUMMARY TEXT')
    expect(store.saveRunningSummary).toHaveBeenCalled()
    expect(store._entry().uptoCount).toBe(3) // all evicted folded in
  })

  it('only summarizes evicted beyond the stored uptoCount', async () => {
    const store = fakeStore({ text: 'OLD', uptoCount: 2 })
    const caller = vi.fn(async (args) => {
      expect(args.prompt).toContain('q2')   // index >= 2, not yet summarized
      expect(args.prompt).not.toContain('q1') // already covered by prior
      return 'MERGED'
    })
    const res = await ensureSummary({
      chatId: 'c1', agentKey: '__shared__', providerType: 'openai',
      evicted, chatStore: store, utilityModelCaller: caller,
    })
    expect(res.summaryBlock).toContain('MERGED')
    expect(caller).toHaveBeenCalledOnce()
    expect(store._entry().uptoCount).toBe(3)
  })

  it('degrades gracefully when the caller throws (keeps prior summary)', async () => {
    const store = fakeStore({ text: 'OLD', uptoCount: 1 })
    const caller = vi.fn(async () => { throw new Error('LLM down') })
    const res = await ensureSummary({
      chatId: 'c1', agentKey: '__shared__', providerType: 'openai',
      evicted, chatStore: store, utilityModelCaller: caller,
    })
    expect(res.strategy).toBe('text')
    expect(res.summaryBlock).toContain('OLD')
    expect(store.saveRunningSummary).not.toHaveBeenCalled()
  })

  it('returns empty text block when nothing new and no prior', async () => {
    const res = await ensureSummary({
      chatId: 'c1', agentKey: '__shared__', providerType: 'openai',
      evicted: [], chatStore: fakeStore(), utilityModelCaller: vi.fn(),
    })
    expect(res).toEqual({ strategy: 'text', summaryBlock: '' })
  })
})
