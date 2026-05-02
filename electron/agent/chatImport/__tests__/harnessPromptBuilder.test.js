// @vitest-environment node
import { describe, it, expect } from 'vitest'

const { buildHarnessPrompt } = require('../harnessPromptBuilder')

const FULL_SYSTEM = '## YOU ARE Lillian — test-description\n\nLillian persona body...\n\n---\nspeech-dna-block-stub'

describe('buildHarnessPrompt', () => {
  describe('siblings injection (cross-pair anti-repetition)', () => {
    it('omits siblings block when siblings is empty (first batch case)', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: '测试消息',
        siblings: [],
        language: 'zh',
      })
      expect(out).not.toContain('你在本次真实度验证中已经产出过这些回复')
      expect(out).not.toContain("In this validation session you've already produced")
    })

    it('omits siblings block when only whitespace strings are provided', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: '测试消息',
        siblings: ['', '  ', '\n'],
        language: 'zh',
      })
      expect(out).not.toContain('你在本次真实度验证中已经产出过')
    })

    it('lists every sibling reply in zh mode', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        siblings: ['回复A', '回复B', '回复C'],
        language: 'zh',
      })
      expect(out).toContain('你在本次真实度验证中已经产出过这些回复')
      expect(out).toContain('- "回复A"')
      expect(out).toContain('- "回复B"')
      expect(out).toContain('- "回复C"')
      expect(out).toContain('换一个不同的口头禅')
    })

    it('lists every sibling reply in en mode', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        siblings: ['Sure thing', 'Got it', 'Hmm interesting'],
        language: 'en',
      })
      expect(out).toContain("In this validation session you've already produced these replies")
      expect(out).toContain('- "Sure thing"')
      expect(out).toContain('- "Got it"')
      expect(out).toContain('- "Hmm interesting"')
      expect(out).toContain('DIFFERENT catchphrase')
    })

    it('truncates sibling replies longer than 120 chars', () => {
      const long = '一'.repeat(200)
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        siblings: [long],
        language: 'zh',
      })
      // The full 200-char string should not appear; truncated to 120.
      expect(out).not.toContain(long)
      expect(out).toContain('一'.repeat(120))
    })

    it('replaces newlines in sibling replies with spaces', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        siblings: ['line1\nline2\nline3'],
        language: 'zh',
      })
      expect(out).toContain('- "line1 line2 line3"')
    })
  })

  describe('previousAttempts feedback (per-pair retry)', () => {
    it('omits feedback block when no dislike attempts', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        previousAttempts: [],
        language: 'zh',
      })
      expect(out).not.toContain('用户认为不像本人')
    })

    it('only counts attempts marked rating: "dislike"', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        previousAttempts: [
          { generatedReply: 'kept-good-attempt', rating: 'like' },
          { generatedReply: 'rejected-bad-attempt', rating: 'dislike' },
        ],
        language: 'zh',
      })
      expect(out).toContain('rejected-bad-attempt')
      expect(out).not.toContain('kept-good-attempt')
    })

    it('includes rating reason when present', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        previousAttempts: [
          { generatedReply: 'r1', rating: 'dislike', reason: '太正式' },
        ],
        language: 'zh',
      })
      expect(out).toContain('"r1"')
      expect(out).toContain('用户反馈: "太正式"')
    })
  })

  describe('engagement directive', () => {
    it('always appears in zh prompts', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        language: 'zh',
      })
      expect(out).toContain('针对用户这条具体消息的内容来回')
      expect(out).toContain('Speech DNA 里的高频短语最多用 1 个')
    })

    it('always appears in en prompts', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        language: 'en',
      })
      expect(out).toContain('Engage with the SPECIFIC content')
      expect(out).toContain('Use AT MOST ONE catchphrase')
    })

    it('appears even when siblings AND previousAttempts both empty', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        language: 'zh',
      })
      expect(out).toContain('针对用户这条具体消息的内容来回')
    })
  })

  describe('user message rendering', () => {
    it('zh: uses the 用户刚说 prefix', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: '今天好累啊',
        language: 'zh',
      })
      expect(out).toContain('用户刚说: "今天好累啊"')
    })

    it('en: uses the "The user just said" prefix', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'how are you',
        language: 'en',
      })
      expect(out).toContain('The user just said: "how are you"')
    })
  })

  describe('closing instruction', () => {
    it('includes agent name in zh closing', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        language: 'zh',
      })
      expect(out).toContain('以 Lillian 的身份回复')
    })

    it('includes agent name in en closing', () => {
      const out = buildHarnessPrompt({
        fullSystem: FULL_SYSTEM,
        agentName: 'Lillian',
        userMessage: 'msg',
        language: 'en',
      })
      expect(out).toContain('Reply as Lillian would')
    })
  })

  describe('full prompt structure (integration)', () => {
    it('combines fullSystem + user message + feedback + siblings + directive in correct order', () => {
      const out = buildHarnessPrompt({
        fullSystem: 'SYSTEM_BLOCK',
        agentName: 'Alice',
        userMessage: 'how are you',
        siblings: ['previous-reply-1'],
        previousAttempts: [
          { generatedReply: 'attempt-A', rating: 'dislike', reason: 'too formal' },
        ],
        language: 'en',
      })
      const sysIdx = out.indexOf('SYSTEM_BLOCK')
      const userIdx = out.indexOf('how are you')
      const feedbackIdx = out.indexOf('attempt-A')
      const siblingsIdx = out.indexOf('previous-reply-1')
      const directiveIdx = out.indexOf('Engage with the SPECIFIC')
      const closingIdx = out.indexOf('Reply as Alice')

      expect(sysIdx).toBeGreaterThanOrEqual(0)
      expect(userIdx).toBeGreaterThan(sysIdx)
      expect(feedbackIdx).toBeGreaterThan(userIdx)
      expect(siblingsIdx).toBeGreaterThan(feedbackIdx)
      expect(directiveIdx).toBeGreaterThan(siblingsIdx)
      expect(closingIdx).toBeGreaterThan(directiveIdx)
    })

    it('simulates the full BATCH=3 sibling-accumulation flow over 9 pairs', () => {
      // Simulates what the batch loop does: batch 1 sees no siblings, batch 2
      // sees batch 1's outputs, batch 3 sees batches 1+2.
      const fakeReplies = [
        'reply-1-A', 'reply-1-B', 'reply-1-C',          // batch 1
        'reply-2-A', 'reply-2-B', 'reply-2-C',          // batch 2
        'reply-3-A', 'reply-3-B', 'reply-3-C',          // batch 3
      ]
      const userMessages = fakeReplies.map((_, i) => `msg-${i + 1}`)

      const siblingsBuf = []
      const promptsByBatch = []
      for (let i = 0; i < userMessages.length; i += 3) {
        const snapshot = siblingsBuf.slice(-9)
        const batchPrompts = userMessages.slice(i, i + 3).map(msg =>
          buildHarnessPrompt({
            fullSystem: 'SYS',
            agentName: 'A',
            userMessage: msg,
            siblings: snapshot,
            language: 'en',
          })
        )
        promptsByBatch.push(batchPrompts)
        // Append this batch's "replies" to the rolling buffer (simulating success path)
        const batchEnd = Math.min(i + 3, fakeReplies.length)
        for (let k = i; k < batchEnd; k++) siblingsBuf.push(fakeReplies[k])
      }

      // Batch 1 — no siblings yet
      for (const p of promptsByBatch[0]) {
        expect(p).not.toContain("In this validation session you've already produced")
      }
      // Batch 2 — should see batch 1's 3 replies
      for (const p of promptsByBatch[1]) {
        expect(p).toContain('- "reply-1-A"')
        expect(p).toContain('- "reply-1-B"')
        expect(p).toContain('- "reply-1-C"')
        expect(p).not.toContain('reply-2')  // batch 2's replies not yet in buffer when batch 2 starts
      }
      // Batch 3 — should see batches 1+2 (6 replies)
      for (const p of promptsByBatch[2]) {
        expect(p).toContain('- "reply-1-A"')
        expect(p).toContain('- "reply-2-C"')
        expect(p).not.toContain('reply-3')
      }
    })
  })
})
