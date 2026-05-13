import { describe, it, expect } from 'vitest'
import { parseToolLogBlock } from '../parseToolLog'

describe('parseToolLogBlock', () => {
  it('returns null for empty / nullish input', () => {
    expect(parseToolLogBlock('')).toBeNull()
    expect(parseToolLogBlock(null)).toBeNull()
    expect(parseToolLogBlock(undefined)).toBeNull()
  })

  it('returns null when there is no log content', () => {
    expect(parseToolLogBlock('just some normal prose\nwith no tool calls')).toBeNull()
  })

  describe('wrapped block', () => {
    it('strips the wrapper and converts entries to tool segments', () => {
      const text = [
        'final answer text',
        '',
        '[Tool execution log from this response:',
        '1. ✓ shell({"cmd":"ls"}) → file_a\nfile_b',
        '2. ✗ write({"path":"/tmp/x"}) → Error: ENOENT',
        ']',
      ].join('\n')

      const r = parseToolLogBlock(text)
      expect(r).not.toBeNull()
      expect(r.cleanedText).toBe('final answer text')
      expect(r.parsedTools).toHaveLength(2)
      expect(r.parsedTools[0]).toMatchObject({
        type: 'tool',
        name: 'shell',
        _fromLog: true,
        toolCallId: null,
      })
      expect(r.parsedTools[0].input).toEqual({ cmd: 'ls' })
      expect(r.parsedTools[0].output).toContain('file_a')
      expect(r.parsedTools[1].name).toBe('write')
      expect(r.parsedTools[1].output).toContain('ENOENT')
    })
  })

  describe('unwrapped fallback', () => {
    it('strips a tail run of ≥2 bare entries and emits tool segments', () => {
      const text = [
        '继续写 MEM-02 状态机？',
        '',
        '1. ✓ dispatch_subagents({"agents":[{"task":"a"}]}) → {',
        '"success": true,',
        '"count": 1',
        '}',
        '2. ✓ dispatch_subagents({"agents":[{"task":"b"}]}) → {',
        '"success": true,',
        '"count": 2',
        '}',
      ].join('\n')

      const r = parseToolLogBlock(text)
      expect(r).not.toBeNull()
      expect(r.cleanedText).toBe('继续写 MEM-02 状态机？')
      expect(r.parsedTools).toHaveLength(2)
      expect(r.parsedTools[0].name).toBe('dispatch_subagents')
      expect(r.parsedTools[1].name).toBe('dispatch_subagents')
      expect(r.parsedTools[0]._fromLog).toBe(true)
    })

    it('does NOT strip a single bare entry (false-positive guard)', () => {
      const text = [
        'some prose',
        '1. ✓ build(npm) → ok',
        'more prose',
      ].join('\n')
      expect(parseToolLogBlock(text)).toBeNull()
    })

    it('does NOT trigger when there are no ✓/✗ markers', () => {
      const text = '1. install deps\n2. run tests\n3. ship'
      expect(parseToolLogBlock(text)).toBeNull()
    })

    it('strips orphaned tool-log debris that sits above the first detected entry', () => {
      // Reproduces the regression: model echoed entries 3-6 only, leaving the
      // truncated payload tail of entries 1-2 dangling above entry 3.
      const text = [
        '要不要把 Launcher 也确认下名字？',
        '}...\')"]}) → {',
        '  "text": "@22023: ...e=\\"16\\" font-weight=\\"600\\" fill=\\"#fff\\"&gt;Teams Bot...",',
        '  "exit_code": 0,',
        '  "truncated": false,',
        '  "totalLines": 2',
        '}',
        '3. ✓ file_operation({"operation":"edit","path":"D:/x.html"}) → {"text":"Edited","replaced":1}',
        '4. ✓ execute_shell({"command":"git"}) → {"text":"ok","exit_code":0}',
      ].join('\n')

      const r = parseToolLogBlock(text)
      expect(r).not.toBeNull()
      expect(r.cleanedText).toBe('要不要把 Launcher 也确认下名字？')
      expect(r.parsedTools).toHaveLength(2)
      expect(r.parsedTools[0].name).toBe('file_operation')
      expect(r.parsedTools[1].name).toBe('execute_shell')
    })

    it('preserves legitimate prose lines that happen to mention JSON-looking words', () => {
      const text = [
        'I will check the "text" field of each response carefully.',
        'Then I ran two commands:',
        '1. ✓ shell({"cmd":"ls"}) → file_a',
        '2. ✓ shell({"cmd":"pwd"}) → /home',
      ].join('\n')

      const r = parseToolLogBlock(text)
      expect(r).not.toBeNull()
      expect(r.cleanedText).toContain('I will check the "text" field')
      expect(r.cleanedText).toContain('Then I ran two commands:')
      expect(r.parsedTools).toHaveLength(2)
    })
  })
})
