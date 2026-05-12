import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../logger', () => ({
  logger: {
    agent: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn(),
  },
}))

import { MemoryExtractor } from '../MemoryExtractor.js'

function makeExtractor() {
  return new MemoryExtractor({ model: 'x', apiKey: 'k', baseURL: '' })
}

describe('MemoryExtractor._parseResponse', () => {
  it('parses a plain memories JSON response', () => {
    const text = `{"memories":[{"target":"user","section":"Preferences","entry":"likes coffee","confidence":0.9}]}`
    const out = makeExtractor()._parseResponse(text)
    expect(out.memories).toHaveLength(1)
    expect(out.memories[0].entry).toBe('likes coffee')
  })

  it('strips ```json fences', () => {
    const text = '```json\n{"memories":[]}\n```'
    expect(makeExtractor()._parseResponse(text).memories).toEqual([])
  })

  it('returns null silently when the model returns a non-extraction JSON shape', () => {
    // Real failure from the log: utility model hallucinated a tool_call
    const text = '好的，先读文件内容。\n\n<tool_call>\n{"name":"read_file","parameters":{"path":"/tmp/foo.html"}}\n</tool_call>'
    expect(makeExtractor()._parseResponse(text)).toBe(null)
  })

  it('returns null silently when JSON is malformed (Windows path with invalid escapes)', () => {
    // The exact log case: \c, \s, \m are illegal JSON escapes
    const text = '好的，先读文件内容。\n\n<tool_call>\n{"name":"read_file","parameters":{"path":"D:\\clankai_docs\\spec\\mars-spec-all.html"}}\n</tool_call>'
    expect(makeExtractor()._parseResponse(text)).toBe(null)
  })

  it('finds the memories object even when wrapped in prose', () => {
    const text = `Here's what I found:\n{"memories":[{"target":"system","section":"Communication","entry":"prefer Chinese","confidence":0.85}]}\nThanks.`
    const out = makeExtractor()._parseResponse(text)
    expect(out.memories[0].target).toBe('system')
  })

  it('skips malformed JSON candidates and picks a valid later one', () => {
    const text = `{"bad":"D:\\foo"}\n{"memories":[{"target":"user","section":"X","entry":"y","confidence":0.9}]}`
    const out = makeExtractor()._parseResponse(text)
    expect(out.memories).toHaveLength(1)
  })

  it('returns null on empty/whitespace input without throwing', () => {
    const ex = makeExtractor()
    expect(ex._parseResponse('')).toBe(null)
    expect(ex._parseResponse(null)).toBe(null)
    expect(ex._parseResponse('   \n  ')).toBe(null)
  })

  // ── High-end model output variations ─────────────────────────────────────

  it('strips <thinking> reasoning wrappers (Claude extended thinking / DeepSeek R1)', () => {
    const text = `<thinking>
Let me analyze the conversation. The user mentioned they prefer Vue. I should record that.
But wait — was it explicit? Yes, they said "I prefer Vue over React".
</thinking>

{"memories":[{"target":"user","section":"Technical","entry":"prefers Vue over React","confidence":0.95}]}`
    const out = makeExtractor()._parseResponse(text)
    expect(out.memories[0].entry).toBe('prefers Vue over React')
  })

  it('strips <think> tags (DeepSeek R1 style)', () => {
    const text = `<think>analyzing...</think>{"memories":[]}`
    expect(makeExtractor()._parseResponse(text).memories).toEqual([])
  })

  it('handles GPT-5 reasoning preamble before JSON', () => {
    const text = `<reasoning>The user mentioned working at OpenAI. This is identity-level info.</reasoning>
{"memories":[{"target":"user","section":"Personal","entry":"works at OpenAI","confidence":0.9}]}`
    const out = makeExtractor()._parseResponse(text)
    expect(out.memories).toHaveLength(1)
  })

  it('unwraps nested {result: {memories: [...]}} schema variant', () => {
    const text = `{"status":"ok","result":{"memories":[{"target":"user","section":"Personal","entry":"x","confidence":0.9}]}}`
    const out = makeExtractor()._parseResponse(text)
    expect(out.memories).toHaveLength(1)
    expect(out.memories[0].entry).toBe('x')
  })

  it('accepts bare array of memory objects without the {memories:} wrapper', () => {
    const text = `[{"target":"user","section":"X","entry":"y","confidence":0.9}]`
    const out = makeExtractor()._parseResponse(text)
    expect(out.memories).toHaveLength(1)
  })

  it('handles Anthropic prefill output (text continuing from a `{` prefill)', () => {
    // Caller already prepended `{` before passing to parser
    const text = `{"memories":[{"target":"user","section":"X","entry":"y","confidence":0.9}]}`
    const out = makeExtractor()._parseResponse(text)
    expect(out.memories).toHaveLength(1)
  })

  it('rejects an array that does not look like memory entries', () => {
    // Random unrelated array — should not be misidentified as memories
    const text = `[1, 2, 3]`
    expect(makeExtractor()._parseResponse(text)).toBe(null)
  })

  it('returns empty memories array (intentional "nothing to remember" response)', () => {
    const text = `{"memories":[]}`
    expect(makeExtractor()._parseResponse(text).memories).toEqual([])
  })

  it('handles mixed prose + multiple JSON candidates, picks the right one', () => {
    const text = `Here's an example of what I'm looking for: {"example":"don't pick me"}
After analysis, here's the result:
{"memories":[{"target":"user","section":"X","entry":"correct one","confidence":0.9}]}
Hope this helps!`
    const out = makeExtractor()._parseResponse(text)
    expect(out.memories[0].entry).toBe('correct one')
  })
})
