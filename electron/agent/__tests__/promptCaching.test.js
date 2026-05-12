// @vitest-environment node
import { describe, it, expect } from 'vitest'

const { applyAnthropicPromptCaching } = require('../agentLoop')

const EPH = { type: 'ephemeral' }

describe('applyAnthropicPromptCaching', () => {
  it('converts string system prompt to text-block array with cache_control', () => {
    const out = applyAnthropicPromptCaching({
      systemPrompt: 'You are a helpful assistant.',
      messages: [],
      tools: [],
    })
    expect(out.system).toEqual([
      { type: 'text', text: 'You are a helpful assistant.', cache_control: EPH },
    ])
  })

  it('leaves empty/falsy system prompt alone (no fabricated block)', () => {
    expect(applyAnthropicPromptCaching({ systemPrompt: '', messages: [], tools: [] }).system).toBe('')
    expect(applyAnthropicPromptCaching({ systemPrompt: null, messages: [], tools: [] }).system).toBe(null)
    expect(applyAnthropicPromptCaching({ systemPrompt: undefined, messages: [], tools: [] }).system).toBe(undefined)
  })

  it('marks only the last tool with cache_control', () => {
    const tools = [
      { name: 'a', input_schema: { type: 'object' } },
      { name: 'b', input_schema: { type: 'object' } },
      { name: 'c', input_schema: { type: 'object' } },
    ]
    const out = applyAnthropicPromptCaching({ systemPrompt: 'x', messages: [], tools })
    expect(out.tools[0]).not.toHaveProperty('cache_control')
    expect(out.tools[1]).not.toHaveProperty('cache_control')
    expect(out.tools[2].cache_control).toEqual(EPH)
  })

  it('handles single-tool array (the only tool gets cache_control)', () => {
    const tools = [{ name: 'only', input_schema: {} }]
    const out = applyAnthropicPromptCaching({ systemPrompt: 'x', messages: [], tools })
    expect(out.tools[0].cache_control).toEqual(EPH)
  })

  it('marks the LAST and 2nd-to-last messages (sliding-window strategy)', () => {
    const messages = [
      { role: 'user', content: 'first turn' },
      { role: 'assistant', content: 'reply 1' },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'output' },
        { type: 'text', text: 'follow-up question' },
      ]},
    ]
    const out = applyAnthropicPromptCaching({ systemPrompt: 'x', messages, tools: [] })
    // First message untouched
    expect(out.messages[0]).toEqual({ role: 'user', content: 'first turn' })
    // 2nd-to-last message ("reply 1") gets cache_control on its (normalized) last block
    expect(out.messages[1].content).toEqual([
      { type: 'text', text: 'reply 1', cache_control: EPH },
    ])
    // Last message's last block marked
    const lastContent = out.messages[2].content
    expect(lastContent).toHaveLength(2)
    expect(lastContent[0]).not.toHaveProperty('cache_control')
    expect(lastContent[1].cache_control).toEqual(EPH)
  })

  it('with only 1 message, marks just that message (no 2nd-to-last)', () => {
    const messages = [
      { role: 'user', content: 'only message' },
    ]
    const out = applyAnthropicPromptCaching({ systemPrompt: 'x', messages, tools: [] })
    expect(out.messages[0].content).toEqual([
      { type: 'text', text: 'only message', cache_control: EPH },
    ])
  })

  it('sliding window: iter N+1 still has a marker at iter N’s last-msg position', () => {
    // Iter N: 3 messages, marker positions = [msg1, msg2]
    const iterN = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]
    const outN = applyAnthropicPromptCaching({ systemPrompt: 'x', messages: iterN, tools: [] })
    // Iter N's "last msg" = idx 2 = q2
    expect(outN.messages[2].content[0].cache_control).toEqual(EPH)
    // Iter N's "2nd-to-last" = idx 1 = a1
    expect(outN.messages[1].content[0].cache_control).toEqual(EPH)

    // Iter N+1: same 3 messages + 2 new (assistant + tool_result)
    const iterN1 = [
      ...iterN,
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' },
    ]
    const outN1 = applyAnthropicPromptCaching({ systemPrompt: 'x', messages: iterN1, tools: [] })
    // Iter N+1's "last" = idx 4 = q3, "2nd-to-last" = idx 3 = a2
    expect(outN1.messages[4].content[0].cache_control).toEqual(EPH)
    expect(outN1.messages[3].content[0].cache_control).toEqual(EPH)
    // CRITICAL: the original messages at idx 0..2 are still in iter N+1 but
    // UNMARKED — so Anthropic only sees markers at idx 3 and 4. This means
    // iter N's cache entry at idx-2 won\'t match exactly, but iter N+1\'s
    // 2nd-to-last (a2) will match an iter N+2 lookup if conversation continues.
    expect(outN1.messages[0].content).toEqual('q1')  // unchanged string
    expect(outN1.messages[1].content).toEqual('a1')
    expect(outN1.messages[2].content).toEqual('q2')
  })

  it('normalizes string-content last message to a text-block array', () => {
    const messages = [
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
    ]
    const out = applyAnthropicPromptCaching({ systemPrompt: 'x', messages, tools: [] })
    expect(out.messages[1].content).toEqual([
      { type: 'text', text: 'second', cache_control: EPH },
    ])
  })

  it('does NOT mutate caller-provided inputs', () => {
    const systemPrompt = 'sys'
    const tools = [{ name: 'a' }, { name: 'b' }]
    const lastBlocks = [
      { type: 'tool_result', tool_use_id: 't1', content: 'output' },
      { type: 'text', text: 'next' },
    ]
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'user', content: lastBlocks },
    ]
    // Snapshot before
    const toolsSnap = JSON.parse(JSON.stringify(tools))
    const messagesSnap = JSON.parse(JSON.stringify(messages))
    const lastBlocksRef = messages[1].content

    applyAnthropicPromptCaching({ systemPrompt, messages, tools })

    expect(tools).toEqual(toolsSnap)
    expect(messages).toEqual(messagesSnap)
    // The original last-block array reference is still the same and unmodified
    expect(messages[1].content).toBe(lastBlocksRef)
    expect(messages[1].content[1]).not.toHaveProperty('cache_control')
  })

  it('skips messages when array is empty or null (no crash)', () => {
    expect(() => applyAnthropicPromptCaching({ systemPrompt: 'x', messages: [], tools: [] })).not.toThrow()
    expect(() => applyAnthropicPromptCaching({ systemPrompt: 'x', messages: null, tools: null })).not.toThrow()
    expect(() => applyAnthropicPromptCaching({ systemPrompt: 'x', messages: undefined, tools: undefined })).not.toThrow()
  })

  it('passes through last message untouched when its content is null/empty', () => {
    const messages = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: null },
    ]
    const out = applyAnthropicPromptCaching({ systemPrompt: 'x', messages, tools: [] })
    expect(out.messages[1]).toEqual({ role: 'assistant', content: null })
  })

  it('uses exactly 4 breakpoints (Anthropic max) on full multi-message input', () => {
    const messages = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: [{ type: 'text', text: 'a' }, { type: 'tool_use', id: 't1', name: 'fn', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'r' }] },
    ]
    const tools = [{ name: 'fn1' }, { name: 'fn2' }]
    const out = applyAnthropicPromptCaching({ systemPrompt: 'sys', messages, tools })

    let count = 0
    if (Array.isArray(out.system)) {
      for (const b of out.system) if (b.cache_control) count++
    }
    for (const t of out.tools) if (t.cache_control) count++
    for (const m of out.messages) {
      if (Array.isArray(m.content)) {
        for (const b of m.content) if (b.cache_control) count++
      }
    }
    // 1 system + 1 last-tool + 2 last-msgs = 4 breakpoints, at Anthropic limit.
    expect(count).toBe(4)
  })

  it('uses exactly 3 breakpoints when only 1 message exists', () => {
    const out = applyAnthropicPromptCaching({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'only' }],
      tools: [{ name: 't' }],
    })
    let count = 0
    if (Array.isArray(out.system)) for (const b of out.system) if (b.cache_control) count++
    for (const t of out.tools) if (t.cache_control) count++
    for (const m of out.messages) {
      if (Array.isArray(m.content)) for (const b of m.content) if (b.cache_control) count++
    }
    expect(count).toBe(3)
  })
})
