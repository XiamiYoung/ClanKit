/**
 * VoiceSession history-injection tests.
 *
 * Covers the pure, no-LLM, no-STT paths that make the voice agent aware of the
 * prior chat:
 *   - _buildChatTranscript: content (not a lossy summary), recency cap,
 *     role filtering, per-message runaway cap, markdown cleaning
 *   - _buildSystemMessage: injects the PRIOR CHAT TRANSCRIPT block and no
 *     longer emits the old lossy CHAT SESSION STATUS digest block
 *
 * STT/LLM are not exercised here — constructing with no sttMode and no whisper
 * key means no recognizer is loaded (no native deps), and llmCall is a stub.
 */
import { describe, it, expect, vi } from 'vitest'

const VoiceSession = require('../VoiceSession')

function makeSession(history) {
  return new VoiceSession({
    agent: { name: 'Aria', description: 'A warm assistant', systemPrompt: 'Be kind.' },
    history,
    llmCall: vi.fn(),
  })
}

describe('VoiceSession._buildChatTranscript', () => {
  it('returns empty string when there is no history', () => {
    expect(makeSession([])._buildChatTranscript()).toBe('')
  })

  it('renders ACTUAL message content, labeled by role', () => {
    const s = makeSession([
      { role: 'user', content: 'Book me a flight to Tokyo' },
      { role: 'assistant', content: 'Done — booked NH847 on Friday.' },
    ])
    const t = s._buildChatTranscript()
    expect(t).toContain('User: Book me a flight to Tokyo')
    expect(t).toContain('Agent: Done — booked NH847 on Friday.')
  })

  it('strips markdown / code / emoji via _cleanChatContent', () => {
    const s = makeSession([
      { role: 'assistant', content: '**Bold** and `code` and 🎉 plain' },
    ])
    const t = s._buildChatTranscript()
    expect(t).not.toContain('**')
    expect(t).not.toContain('`')
    expect(t).toContain('Bold')
    expect(t).toContain('plain')
  })

  it('keeps only the most recent 40 conversation turns', () => {
    const history = []
    for (let i = 0; i < 100; i++) {
      history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg-${i}` })
    }
    const t = makeSession(history)._buildChatTranscript()
    expect(t).not.toContain('msg-0')
    expect(t).not.toContain('msg-59')
    expect(t).toContain('msg-60')
    expect(t).toContain('msg-99')
  })

  it('ignores non user/assistant rows (system banners, summaries)', () => {
    const s = makeSession([
      { role: 'user', content: 'hi' },
      { role: 'system', content: 'context compacted' },
      { role: 'assistant', content: 'hello' },
    ])
    const t = s._buildChatTranscript()
    expect(t).not.toContain('context compacted')
    expect(t).toContain('User: hi')
    expect(t).toContain('Agent: hello')
  })

  it('truncates runaway-long single messages with an ellipsis', () => {
    const big = 'x'.repeat(2000)
    const t = makeSession([{ role: 'user', content: big }])._buildChatTranscript()
    const line = t.split('\n')[0]
    expect(line.length).toBeLessThan(900)
    expect(line.endsWith('…')).toBe(true)
  })
})

describe('VoiceSession._buildSystemMessage', () => {
  it('injects the prior chat transcript with real content', () => {
    const s = makeSession([
      { role: 'user', content: 'What is the capital of France?' },
      { role: 'assistant', content: 'Paris.' },
    ])
    const msg = s._buildSystemMessage()
    expect(msg.role).toBe('system')
    expect(msg.content).toContain('## PRIOR CHAT TRANSCRIPT')
    expect(msg.content).toContain('What is the capital of France?')
    expect(msg.content).toContain('Paris.')
  })

  it('no longer emits the old lossy CHAT SESSION STATUS digest block', () => {
    const s = makeSession([{ role: 'user', content: 'hi' }])
    expect(s._buildSystemMessage().content).not.toContain('CHAT SESSION STATUS')
  })

  it('omits the transcript block entirely when history is empty', () => {
    const msg = makeSession([])._buildSystemMessage()
    expect(msg.content).not.toContain('## PRIOR CHAT TRANSCRIPT')
  })

  it('does not depend on a removed _generateChatDigest method', () => {
    const s = makeSession([{ role: 'user', content: 'hi' }])
    expect(s._generateChatDigest).toBeUndefined()
  })

  it('tells the voice agent to delegate ClanKit persona/agent creation via <task>', () => {
    // Regression guard: without this, the voice model says "I'll create one"
    // but never emits <task>, so nothing actually happens (all talk, no action).
    const content = makeSession([])._buildSystemMessage().content
    expect(content).toMatch(/user personas|用户画像/)
    expect(content).toMatch(/digital personas|数字人/)
    // The "you cannot inspect/build anything yourself" guard must be present.
    expect(content).toMatch(/NO direct access|cannot "check the structure"|that is an ACTION/)
  })
})
