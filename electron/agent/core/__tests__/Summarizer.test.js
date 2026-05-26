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

const evicted = [
  { role: 'user', content: 'q1', timestamp: 100 },
  { role: 'assistant', content: 'a1', timestamp: 110 },
  { role: 'user', content: 'q2', timestamp: 200 },
]

describe('ensureSummary', () => {
  it('returns native strategy for anthropic without any LLM call', async () => {
    const caller = vi.fn()
    const res = await ensureSummary({ providerType: 'anthropic', evicted, chatStore: fakeStore(), utilityModelCaller: caller })
    expect(res).toEqual({ strategy: 'native' })
    expect(caller).not.toHaveBeenCalled()
  })

  it('summarizes evicted turns and persists for openai-compat', async () => {
    const store = fakeStore()
    const caller = vi.fn(async () => 'SUMMARY TEXT')
    const res = await ensureSummary({
      chatId: 'c1', agentKey: '__shared__', providerType: 'openai',
      evicted, chatStore: store, utilityModelCaller: caller,
    })
    expect(res.strategy).toBe('text')
    expect(res.summaryBlock).toContain('SUMMARY TEXT')
    expect(store.saveRunningSummary).toHaveBeenCalled()
    expect(store._entry().uptoTs).toBe(200) // newest evicted ts
  })

  it('only re-summarizes turns newer than the stored uptoTs', async () => {
    const store = fakeStore({ text: 'OLD', uptoTs: 110 })
    const caller = vi.fn(async (args) => {
      expect(args.prompt).toContain('q2')   // newer than uptoTs
      expect(args.prompt).not.toContain('q1') // already summarized
      return 'MERGED'
    })
    const res = await ensureSummary({
      chatId: 'c1', agentKey: '__shared__', providerType: 'openai',
      evicted, chatStore: store, utilityModelCaller: caller,
    })
    expect(res.summaryBlock).toContain('MERGED')
    expect(caller).toHaveBeenCalledOnce()
  })

  it('degrades gracefully when the caller throws (keeps prior summary)', async () => {
    const store = fakeStore({ text: 'OLD', uptoTs: 50 })
    const caller = vi.fn(async () => { throw new Error('LLM down') })
    const res = await ensureSummary({
      chatId: 'c1', agentKey: '__shared__', providerType: 'openai',
      evicted, chatStore: store, utilityModelCaller: caller,
    })
    expect(res.strategy).toBe('text')
    expect(res.summaryBlock).toContain('OLD')
    expect(store.saveRunningSummary).not.toHaveBeenCalled()
  })

  it('returns empty text block when nothing to summarize and no prior', async () => {
    const res = await ensureSummary({
      chatId: 'c1', agentKey: '__shared__', providerType: 'openai',
      evicted: [], chatStore: fakeStore(), utilityModelCaller: vi.fn(),
    })
    expect(res).toEqual({ strategy: 'text', summaryBlock: '' })
  })
})
