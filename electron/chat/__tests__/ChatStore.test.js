import { describe, it, expect } from 'vitest'
import {
  rowToChat, chatToRow,
  rowToMessage, messageToRow,
  serializeJsonField, deserializeJsonField,
  extractSearchText,
  OVERSIZE_CONTENT_THRESHOLD_BYTES,
  _buildOversizePlaceholder,
  _mapRowOrOversize,
} from '../ChatStore.js'

describe('serializeJsonField / deserializeJsonField', () => {
  it('round-trips objects', () => {
    expect(deserializeJsonField(serializeJsonField({ a: 1, b: [2, 3] }))).toEqual({ a: 1, b: [2, 3] })
  })
  it('round-trips arrays', () => {
    expect(deserializeJsonField(serializeJsonField(['a', 'b']))).toEqual(['a', 'b'])
  })
  it('serializeJsonField returns null for null/undefined', () => {
    expect(serializeJsonField(null)).toBeNull()
    expect(serializeJsonField(undefined)).toBeNull()
  })
  it('deserializeJsonField returns null for null', () => {
    expect(deserializeJsonField(null)).toBeNull()
  })
  it('deserializeJsonField returns fallback for invalid JSON', () => {
    expect(deserializeJsonField('not json', { default: true })).toEqual({ default: true })
  })
})

describe('extractSearchText', () => {
  it('extracts text from text segments', () => {
    const segments = [
      { type: 'text', content: 'hello world' },
      { type: 'text', content: 'second line' },
    ]
    expect(extractSearchText(segments)).toBe('hello world second line')
  })
  it('skips non-text segments', () => {
    const segments = [
      { type: 'text', content: 'hello' },
      { type: 'tool', name: 'search', input: { q: 'foo' }, output: 'bar' },
      { type: 'image', images: [{ url: 'data:...' }] },
      { type: 'permission', blockId: 'abc', title: 'allow x' },
      { type: 'agent_step', id: 's1', title: 'thinking' },
      { type: 'text', content: 'world' },
    ]
    expect(extractSearchText(segments)).toBe('hello world')
  })
  it('returns empty string for empty/null/non-array input', () => {
    expect(extractSearchText([])).toBe('')
    expect(extractSearchText(null)).toBe('')
    expect(extractSearchText(undefined)).toBe('')
    expect(extractSearchText('not array')).toBe('')
  })
  it('handles segments with missing content fields gracefully', () => {
    const segments = [
      { type: 'text' },
      { type: 'text', content: null },
      { type: 'text', content: 'ok' },
    ]
    expect(extractSearchText(segments)).toBe('ok')
  })
})

describe('rowToChat / chatToRow round-trip', () => {
  it('preserves every persisted field through round-trip', () => {
    const chat = {
      id: 'chat-1',
      title: 'Test chat',
      icon: '💬',
      type: 'chat',
      systemAgentId: 'agent-x',
      userAgentId: 'persona-y',
      provider: 'qwen',
      model: 'qwen-plus-latest',
      usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0,
               voiceInputTokens: 0, voiceOutputTokens: 0, whisperCalls: 0, whisperSecs: 0, ttsChars: 0 },
      contextMetrics: { inputTokens: 100, outputTokens: 50, totalTokens: 150, maxTokens: 200000,
                        percentage: 0.075, compactionCount: 0, voiceInputTokens: 0, voiceOutputTokens: 0,
                        whisperCalls: 0, whisperSecs: 0 },
      perAgentContextMetrics: { 'agent-x': { inputTokens: 100, outputTokens: 50 } },
      lastContextSnapshot: { ts: 1700000000000, summary: 'snap' },
      isGroupChat: true,
      groupAgentIds: ['agent-x', 'agent-y'],
      groupAgentOverrides: { 'agent-x': { name: 'Override' } },
      groupAudienceMode: 'manual',
      groupAudienceAgentIds: ['agent-x'],
      workingPath: '/tmp/work',
      codingMode: true,
      codingProvider: 'claude-code',
      permissionMode: 'chat_only',
      chatAllowList: ['file_operation'],
      chatDangerOverrides: ['execute_shell'],
      maxAgentRounds: 5,
      autoTitleEligible: true,
      autoTitleLocked: false,
      autoTitleAttemptCount: 1,
      analysisTargetAgentId: null,
      isPinned: false,
      mode: 'productivity',
      modeTransitions: [{ from: 'chat', to: 'productivity', at: 1700000001000, afterMessageId: 'm1' }],
      modeTransitionPending: { from: 'chat', to: 'productivity', at: 1700000001000 },
      productivityModeNoticeShown: true,
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
      lastMessageAt: 1700000002000,
    }
    expect(rowToChat(chatToRow(chat))).toMatchObject(chat)
  })

  it('coerces boolean INTEGER columns', () => {
    const chat = { id: 'x', title: 'T', isGroupChat: true, codingMode: false, autoTitleEligible: false,
                   autoTitleLocked: true, isPinned: true, createdAt: 0, updatedAt: 0 }
    const row = chatToRow(chat)
    expect(row.is_group_chat).toBe(1)
    expect(row.coding_mode).toBe(0)
    expect(row.auto_title_eligible).toBe(0)
    expect(row.auto_title_locked).toBe(1)
    expect(row.is_pinned).toBe(1)
    const back = rowToChat(row)
    expect(back.isGroupChat).toBe(true)
    expect(back.codingMode).toBe(false)
    expect(back.isPinned).toBe(true)
  })

  it('rowToChat returns null for null', () => {
    expect(rowToChat(null)).toBeNull()
  })

  it('strips runtime-only fields from chatToRow input', () => {
    const chat = {
      id: 'x', title: 'T', createdAt: 0, updatedAt: 0,
      isRunning: true, isThinking: true, isCallingTool: true,
      isLoadingMessages: true, _imStreaming: true, _imStreamingMsgId: 'abc',
      _nextSegToLoad: 5,
    }
    const row = chatToRow(chat)
    expect(row).not.toHaveProperty('isRunning')
    expect(row).not.toHaveProperty('isThinking')
    expect(row).not.toHaveProperty('isCallingTool')
    expect(row).not.toHaveProperty('isLoadingMessages')
    expect(row).not.toHaveProperty('_imStreaming')
    expect(row).not.toHaveProperty('_imStreamingMsgId')
    expect(row).not.toHaveProperty('_nextSegToLoad')
  })

  it('does not include messages array in row', () => {
    const chat = { id: 'x', title: 'T', createdAt: 0, updatedAt: 0, messages: [{ id: 'm1' }] }
    const row = chatToRow(chat)
    expect(row).not.toHaveProperty('messages')
  })
})

describe('rowToMessage / messageToRow round-trip', () => {
  it('preserves every persisted field including all 5 segment types', () => {
    const message = {
      id: 'msg-1',
      role: 'assistant',
      content: 'hello world',
      segments: [
        { type: 'text', content: 'hello' },
        { type: 'tool', name: 'search', input: { q: 'foo' }, output: 'bar', toolCallId: 'tc1' },
        { type: 'image', images: [{ data: 'iVBOR...', mimeType: 'image/png' }], source: 'file_op' },
        { type: 'permission', blockId: 'p1', title: 'allow shell', description: 'rm -rf', status: 'pending', requesterId: 'agent-x' },
        { type: 'agent_step', id: 'step1', title: 'reasoning', status: 'done', duration: 500, details: { inputTokens: 100 }, timestamp: 1700000000000 },
        { type: 'text', content: ' world' },
      ],
      timestamp: 1700000000000,
      createdAt: 1700000000000,
      durationMs: 1234,
      userAgentId: 'persona-y',
      agentId: 'agent-x',
      agentName: 'TestAgent',
      isError: false,
      errorDetail: null,
      errorCode: null,
      planData: { tasks: [{ name: 'a' }] },
      planState: 'pending',
      tokenUsage: { input: 100, output: 50 },
    }
    const row = messageToRow(message, 'chat-1')
    expect(row.chat_id).toBe('chat-1')
    expect(row.text_for_search).toBe('hello  world')
    const back = rowToMessage(row)
    expect(back).toMatchObject(message)
  })

  it('handles minimal user message', () => {
    const message = { id: 'm', role: 'user', content: 'hi', segments: [{ type: 'text', content: 'hi' }],
                      timestamp: 1700000000000 }
    const row = messageToRow(message, 'c')
    const back = rowToMessage(row)
    expect(back.id).toBe('m')
    expect(back.role).toBe('user')
    expect(back.content).toBe('hi')
    expect(back.segments).toEqual([{ type: 'text', content: 'hi' }])
  })

  it('strips runtime-only fields (streaming, isWaitingIndicator, streamingStartedAt)', () => {
    const message = { id: 'm', role: 'assistant', content: '', segments: [],
                      timestamp: 0, streaming: true, streamingStartedAt: 1234, isWaitingIndicator: true }
    const row = messageToRow(message, 'c')
    expect(row).not.toHaveProperty('streaming')
    expect(row).not.toHaveProperty('streamingStartedAt')
    expect(row).not.toHaveProperty('isWaitingIndicator')
  })

  it('coerces is_error INTEGER', () => {
    const row = messageToRow({ id: 'm', role: 'assistant', segments: [], timestamp: 0, isError: true }, 'c')
    expect(row.is_error).toBe(1)
    expect(rowToMessage(row).isError).toBe(true)
    const row2 = messageToRow({ id: 'n', role: 'assistant', segments: [], timestamp: 0, isError: false }, 'c')
    expect(row2.is_error).toBe(0)
    expect(rowToMessage(row2).isError).toBe(false)
  })
})

describe('oversize message detection', () => {
  // Simulate what SQLite would return: row with the LENGTH() aggregates
  // attached as _content_bytes / _total_bytes.
  function _row({ role = 'assistant', contentBytes = 100, segmentsBytes = 50, ...over } = {}) {
    return {
      id: 'm1',
      chat_id: 'c1',
      role,
      content: 'irrelevant — _mapRowOrOversize uses _content_bytes',
      segments: '[]',
      ts: 1700000000000,
      created_at: 1700000000000,
      agent_id: 'a1',
      agent_name: 'Test Agent',
      is_error: 0,
      _content_bytes: contentBytes,
      _total_bytes: contentBytes + segmentsBytes,
      ...over,
    }
  }

  it('returns normal message when content is under threshold', () => {
    const r = _row({ contentBytes: 500 * 1024 })  // 500 KB
    const out = _mapRowOrOversize(r)
    expect(out.oversize).toBeUndefined()
    expect(out.role).toBe('assistant')
  })

  it('returns oversize placeholder when assistant content exceeds threshold', () => {
    const r = _row({ contentBytes: OVERSIZE_CONTENT_THRESHOLD_BYTES + 1, segmentsBytes: 11 * 1024 * 1024 })
    const out = _mapRowOrOversize(r)
    expect(out.oversize).toBe(true)
    expect(out.contentBytes).toBe(OVERSIZE_CONTENT_THRESHOLD_BYTES + 1)
    expect(out.totalBytes).toBe(OVERSIZE_CONTENT_THRESHOLD_BYTES + 1 + 11 * 1024 * 1024)
    // payload drops the heavy fields so IPC stays small
    expect(out.content).toBe('')
    expect(out.segments).toEqual([])
    // identifier + display fields preserved
    expect(out.id).toBe('m1')
    expect(out.agent_name).toBe('Test Agent')
    expect(out.ts).toBe(1700000000000)
  })

  it('user role messages are NEVER flagged oversize even if huge', () => {
    // User pastes (e.g. log dumps) are intentional and should display normally.
    const r = _row({ role: 'user', contentBytes: 5 * 1024 * 1024 })
    const out = _mapRowOrOversize(r)
    expect(out.oversize).toBeUndefined()
  })

  it('segments size is NOT a trigger — only content matters', () => {
    // A tool-heavy assistant turn with small text + many MB of tool segments
    // should display normally. Tool outputs have per-tool caps already.
    const r = _row({ contentBytes: 5 * 1024, segmentsBytes: 20 * 1024 * 1024 })
    const out = _mapRowOrOversize(r)
    expect(out.oversize).toBeUndefined()
  })

  it('_buildOversizePlaceholder preserves identifying fields, drops heavy fields', () => {
    const r = _row({ contentBytes: 2 * 1024 * 1024 })
    const p = _buildOversizePlaceholder(r)
    expect(p.oversize).toBe(true)
    expect(p.content).toBe('')
    expect(p.segments).toEqual([])
    expect(p.id).toBe('m1')
    expect(p.chat_id).toBe('c1')
    expect(p.role).toBe('assistant')
    expect(p.agent_id).toBe('a1')
    expect(p.agent_name).toBe('Test Agent')
  })
})
