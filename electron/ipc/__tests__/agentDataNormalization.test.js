/**
 * Tests for the data normalization + chunk accumulation used in agent.js.
 *
 * All functions tested here are imported from REAL production modules:
 * - dataNormalizers.js — used by agent:send-message and agent:run-additional
 * - chunkAccumulator.js — used by runGroupRound for collaboration loop
 */

const { normalizeAgents, normalizeTools, normalizeMcpServers } = require('../../agent/dataNormalizers')


// ── agents.json normalization ───────────────────────────────────────────────

describe('normalizeAgents', () => {
  it('extracts .agents array from object format { categories, agents }', () => {
    const raw = {
      categories: [{ id: 'cat1', name: 'General' }],
      agents: [
        { id: 'a1', name: 'Agent A' },
        { id: 'a2', name: 'Agent B' },
      ],
    }
    const result = normalizeAgents(raw)
    expect(result).toEqual([
      { id: 'a1', name: 'Agent A' },
      { id: 'a2', name: 'Agent B' },
    ])
  })

  it('passes through plain array format', () => {
    const raw = [
      { id: 'a1', name: 'Agent A' },
      { id: 'a3', name: 'Agent C' },
    ]
    const result = normalizeAgents(raw)
    expect(result).toBe(raw) // same reference — no transformation
    expect(result).toHaveLength(2)
  })

  it('returns empty array for object with empty agents', () => {
    const raw = { categories: [], agents: [] }
    const result = normalizeAgents(raw)
    expect(result).toEqual([])
  })

  it('returns empty array for object missing agents key', () => {
    const raw = { categories: [{ id: 'c1' }] }
    const result = normalizeAgents(raw)
    expect(result).toEqual([])
  })

  it('returns empty array for null/undefined', () => {
    expect(normalizeAgents(null)).toEqual([])
    expect(normalizeAgents(undefined)).toEqual([])
  })

  it('returns empty array for empty object', () => {
    expect(normalizeAgents({})).toEqual([])
  })
})


// ── tools.json normalization ────────────────────────────────────────────────

describe('normalizeTools', () => {
  it('converts dict format { id: config } to array with id field', () => {
    const raw = {
      'tool-1': { name: 'HTTP GET', url: 'https://example.com', method: 'GET' },
      'tool-2': { name: 'HTTP POST', url: 'https://api.test.com', method: 'POST' },
    }
    const result = normalizeTools(raw)
    expect(result).toEqual([
      { name: 'HTTP GET', url: 'https://example.com', method: 'GET', id: 'tool-1' },
      { name: 'HTTP POST', url: 'https://api.test.com', method: 'POST', id: 'tool-2' },
    ])
  })

  it('filters out __deletedBuiltins key from dict format', () => {
    const raw = {
      'tool-1': { name: 'Active Tool' },
      __deletedBuiltins: ['builtin-a', 'builtin-b'],
    }
    const result = normalizeTools(raw)
    expect(result).toEqual([{ name: 'Active Tool', id: 'tool-1' }])
    expect(result.some(t => t.id === '__deletedBuiltins')).toBe(false)
  })

  it('passes through array format unchanged', () => {
    const raw = [
      { id: 'tool-1', name: 'Tool A' },
      { id: 'tool-2', name: 'Tool B' },
    ]
    const result = normalizeTools(raw)
    expect(result).toBe(raw) // same reference
    expect(result).toHaveLength(2)
  })

  it('returns empty array for empty dict', () => {
    expect(normalizeTools({})).toEqual([])
  })

  it('returns empty array for null/undefined', () => {
    expect(normalizeTools(null)).toEqual([])
    expect(normalizeTools(undefined)).toEqual([])
  })

  it('preserves all config fields when converting from dict', () => {
    const raw = {
      'my-tool': {
        name: 'Complex Tool',
        url: 'https://api.example.com/endpoint',
        method: 'POST',
        headers: { Authorization: 'Bearer {{token}}' },
        body: '{"query": "test"}',
        enabled: true,
      },
    }
    const result = normalizeTools(raw)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'my-tool',
      name: 'Complex Tool',
      url: 'https://api.example.com/endpoint',
      method: 'POST',
      headers: { Authorization: 'Bearer {{token}}' },
      body: '{"query": "test"}',
      enabled: true,
    })
  })

  it('id field from dict key takes precedence even if config has id', () => {
    // Object.entries spread: { ...c, id } means the dict key overwrites any c.id
    const raw = {
      'dict-key-id': { id: 'config-id', name: 'Tool' },
    }
    const result = normalizeTools(raw)
    expect(result[0].id).toBe('dict-key-id')
  })
})


// ── mcp-servers.json normalization ──────────────────────────────────────────

describe('normalizeMcpServers', () => {
  it('passes through array format unchanged', () => {
    const raw = [
      { id: 'srv-1', name: 'Server A', command: 'npx', args: ['-y', 'mcp-server-a'] },
      { id: 'srv-2', name: 'Server B', command: 'node', args: ['server.js'] },
    ]
    const result = normalizeMcpServers(raw)
    expect(result).toBe(raw) // same reference
    expect(result).toHaveLength(2)
  })

  it('converts legacy dict format { name: config } to array', () => {
    const raw = {
      'my-server': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fs'] },
      'another-srv': { command: 'node', args: ['index.js'], env: { PORT: '3000' } },
    }
    const result = normalizeMcpServers(raw)
    expect(result).toEqual([
      { id: 'my-server', name: 'my-server', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fs'] },
      { id: 'another-srv', name: 'another-srv', command: 'node', args: ['index.js'], env: { PORT: '3000' } },
    ])
  })

  it('sets both id and name from the dict key', () => {
    const raw = {
      'filesystem': { command: 'npx', args: [] },
    }
    const result = normalizeMcpServers(raw)
    expect(result[0].id).toBe('filesystem')
    expect(result[0].name).toBe('filesystem')
  })

  it('dict config fields override id/name if they exist in config', () => {
    // Spread order: { id: name, name, ...c } — if c has name, c.name wins
    const raw = {
      'dict-key': { name: 'Custom Name', command: 'node' },
    }
    const result = normalizeMcpServers(raw)
    // { id: 'dict-key', name: 'dict-key', ...{ name: 'Custom Name', command: 'node' } }
    // Spread means c.name ('Custom Name') overwrites the name: 'dict-key'
    expect(result[0].id).toBe('dict-key')
    expect(result[0].name).toBe('Custom Name')
  })

  it('returns empty array for empty dict', () => {
    expect(normalizeMcpServers({})).toEqual([])
  })

  it('returns empty array for null/undefined', () => {
    expect(normalizeMcpServers(null)).toEqual([])
    expect(normalizeMcpServers(undefined)).toEqual([])
  })

  it('returns empty array for empty array input', () => {
    const raw = []
    const result = normalizeMcpServers(raw)
    expect(result).toEqual([])
  })
})


// ── Chunk text accumulation (collaboration loop depends on this) ───────────
// Tests the REAL createChunkAccumulator from production code.
// agent.js uses this to build trackMessages for @mention scanning.
// If this breaks, the entire multi-agent collaboration chain silently dies.

const { createChunkAccumulator } = require('../../agent/chunkAccumulator')

describe('createChunkAccumulator (real production code)', () => {
  it('accumulates text from chunk.text property', () => {
    const acc = createChunkAccumulator()
    acc.onChunk({ type: 'text', text: 'Hello ' })
    acc.onChunk({ type: 'text', text: '@AgentB ' })
    acc.onChunk({ type: 'text', text: 'your turn' })
    expect(acc.getText()).toBe('Hello @AgentB your turn')
  })

  it('does NOT accumulate from chunk.content (the property AgentLoop never uses)', () => {
    const acc = createChunkAccumulator()
    acc.onChunk({ type: 'text', content: 'This should NOT be accumulated' })
    expect(acc.getText()).toBe('')
  })

  it('skips non-text chunk types', () => {
    const acc = createChunkAccumulator()
    acc.onChunk({ type: 'text', text: 'Hello ' })
    acc.onChunk({ type: 'tool_call', name: 'search', input: {} })
    acc.onChunk({ type: 'tool_result', name: 'search', result: 'found' })
    acc.onChunk({ type: 'text', text: 'world' })
    expect(acc.getText()).toBe('Hello world')
  })

  it('handles empty/null text chunks', () => {
    const acc = createChunkAccumulator()
    acc.onChunk({ type: 'text', text: '' })
    acc.onChunk({ type: 'text', text: 'actual content' })
    acc.onChunk({ type: 'text', text: null })
    expect(acc.getText()).toBe('actual content')
  })

  it('preserves @mentions needed by collaboration loop parseMentions', () => {
    const acc = createChunkAccumulator()
    acc.onChunk({ type: 'text', text: '1A\n\n@Yeo Bo Jun — next number.' })
    expect(acc.getText()).toContain('@Yeo Bo Jun')
  })

  it('starts empty', () => {
    const acc = createChunkAccumulator()
    expect(acc.getText()).toBe('')
  })
})
