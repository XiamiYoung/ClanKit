// @vitest-environment node
import { describe, it, expect } from 'vitest'

const fs = require('fs')
const path = require('path')

const SOURCE_FILE = path.resolve(__dirname, '..', 'personaBuilder.js')
const SOURCE = fs.readFileSync(SOURCE_FILE, 'utf-8')
const { buildCombinedPrompt, _scrubGeneratedPersona } = require('../personaBuilder')

const PROFILE = { name: 'Alice', gender: 'female', relationship: 'friend', impression: '' }
const SAMPLE = '[mock messages]'

describe('personaBuilder template surgery (regression)', () => {
  describe('source-wide forbidden tokens', () => {
    it('does not contain Drift Self-Check sections', () => {
      // Match only real headings (start of line). Negative-directive mentions
      // wrapped in backticks (`## 漂移自检`) are not column-0 and pass.
      expect(SOURCE).not.toMatch(/^##\s*漂移自检/m)
      expect(SOURCE).not.toMatch(/^##\s*Drift Self-Check/m)
    })

    it('does not contain absolute-imperative section headings', () => {
      expect(SOURCE).not.toMatch(/^##\s*铁律/m)
      expect(SOURCE).not.toMatch(/^##\s*The One Rule/m)
    })

    it('does not include "Never break character" / "永远不要打破角色" directives', () => {
      expect(SOURCE).not.toMatch(/Never break character/)
      expect(SOURCE).not.toMatch(/永远不要打破角色/)
    })
  })

  describe('source-wide required tokens', () => {
    it('contains soft Core Tendencies / 核心倾向 headings (full + sketch templates each)', () => {
      const zhCount = (SOURCE.match(/##\s*核心倾向/g) || []).length
      const enCount = (SOURCE.match(/##\s*Core Tendencies/g) || []).length
      // 3 zh: zh self full, zh other full, zh sketch
      // 3 en: en self full, en other full, en sketch
      expect(zhCount).toBeGreaterThanOrEqual(3)
      expect(enCount).toBeGreaterThanOrEqual(3)
    })

    it('contains global verbatim rule in every template (4 full + 2 sketch zh, 4 full + 2 sketch en)', () => {
      const zhMatches = (SOURCE.match(/全局 verbatim 规则/g) || []).length
      const enMatches = (SOURCE.match(/Global verbatim rule/g) || []).length
      expect(zhMatches).toBeGreaterThanOrEqual(3)
      expect(enMatches).toBeGreaterThanOrEqual(3)
    })
  })

  describe('per-template structural assertions', () => {
    for (const lang of ['zh', 'en']) {
      for (const target of ['self', 'other']) {
        const label = `${lang} ${target}`

        it(`[${label}] Decision Heuristics forbids verbatim quoting`, () => {
          const prompt = buildCombinedPrompt(PROFILE, SAMPLE, lang, target)
          if (lang === 'zh') {
            expect(prompt).toMatch(/##\s*决策本能[\s\S]{0,500}不要引用具体口头禅/)
          } else {
            expect(prompt).toMatch(/##\s*Decision Heuristics[\s\S]{0,500}do NOT quote specific catchphrases/)
          }
        })

        it(`[${label}] Speech DNA marks itself as the verbatim-allowed catchphrase home`, () => {
          const prompt = buildCombinedPrompt(PROFILE, SAMPLE, lang, target)
          if (lang === 'zh') {
            expect(prompt).toMatch(/口头禅和高频词[\s\S]{0,300}唯一允许 verbatim/)
          } else {
            expect(prompt).toMatch(/Catchphrases and high-frequency words[\s\S]{0,300}only section[\s\S]{0,200}verbatim catchphrases are allowed/i)
          }
        })

        it(`[${label}] Example Dialogue marks itself as the second verbatim-allowed section`, () => {
          const prompt = buildCombinedPrompt(PROFILE, SAMPLE, lang, target)
          if (lang === 'zh') {
            expect(prompt).toMatch(/##\s*示例对话[\s\S]{0,500}唯二允许 verbatim/)
          } else {
            expect(prompt).toMatch(/##\s*Example Dialogue[\s\S]{0,500}two sections[\s\S]{0,200}verbatim is allowed/i)
          }
        })

        it(`[${label}] Emotion encoding table forbids verbatim phrase quoting`, () => {
          const prompt = buildCombinedPrompt(PROFILE, SAMPLE, lang, target)
          if (lang === 'zh') {
            expect(prompt).toMatch(/情绪编码表[\s\S]{0,400}只描述方式，不引用具体短语/)
          } else {
            expect(prompt).toMatch(/Emotion encoding table[\s\S]{0,500}Describe the method only, do not quote specific phrases/i)
          }
        })

        it(`[${label}] Micro-style / Ambient Voice describes patterns instead of quoting`, () => {
          const prompt = buildCombinedPrompt(PROFILE, SAMPLE, lang, target)
          if (lang === 'zh') {
            expect(prompt).toMatch(/##\s*微观风格[\s\S]{0,500}不引用原话/)
          } else {
            expect(prompt).toMatch(/##\s*Ambient Voice[\s\S]{0,500}do not quote verbatim/i)
          }
        })

        it(`[${label}] Behavioral Master Principles softens the no-AI rule`, () => {
          const prompt = buildCombinedPrompt(PROFILE, SAMPLE, lang, target)
          if (lang === 'zh') {
            expect(prompt).toMatch(/保持角色一致，不主动声明自己是 AI/)
          } else {
            expect(prompt).toMatch(/stay in character and do not volunteer that you are an AI/)
          }
        })

        it(`[${label}] Always-reply-in-user-language rule is preserved`, () => {
          // This is a load-bearing rule; the surgery should not have removed it.
          const prompt = buildCombinedPrompt(PROFILE, SAMPLE, lang, target)
          if (lang === 'zh') {
            expect(prompt).toMatch(/始终使用用户的语言回复/)
          } else {
            expect(prompt).toMatch(/Always reply in the user's language/)
          }
        })
      }
    }
  })

  describe('cross-section verbatim collision (spec)', () => {
    // Hand-crafted markdown that simulates an LLM output following the new
    // template rules. The catchphrase "OK啦" only appears in Speech DNA and
    // Example Dialogue. Other sections describe behaviors abstractly.
    const compliantMarkdown = `# Alice — 人格档案

## 核心模式
当被夸奖时会用自嘲化解，而不是直接接受。

## 决策本能
- 被夸奖时 → 用自嘲转移
- 被质疑时 → 列证据反驳

## 语言 DNA
### 口头禅和高频词
"OK啦", "嗯哼"
### 情绪编码表
共情时倾向用反讽，担心时倾向用具象画面

## 微观风格
日常问候时倾向用单 emoji 起手，节奏短促

## 示例对话
> Alice: OK啦，那我去做了

## 核心倾向
倾向于用事务性短句替代情绪表达。
`

    // Hand-crafted bad markdown: catchphrase leaks across non-allowed sections.
    const violatingMarkdown = `# Alice — 人格档案

## 核心模式
当被夸奖时会说"OK啦"。

## 决策本能
- 被夸奖时 → "OK啦"

## 语言 DNA
### 口头禅
"OK啦"

## 微观风格
日常问候："OK啦"
`

    /**
     * Find quoted phrases that appear in 2+ sections where at least one section
     * is not in the verbatim-allowed list. Used to spec what a future runtime
     * dedup check (or LLM-side prompt enforcement) should catch.
     */
    function findCrossSectionVerbatimCollisions(md) {
      const VERBATIM_ALLOWED_HEADINGS = [
        '## 语言 DNA',
        '## Speech DNA',
        '## 示例对话',
        '## Example Dialogue',
      ]
      const lines = md.split('\n')
      const sections = []
      let cur = null
      for (const line of lines) {
        if (/^##\s+/.test(line) && !/^###/.test(line)) {
          if (cur) sections.push(cur)
          cur = { heading: line.trim(), body: [] }
        } else if (cur) {
          cur.body.push(line)
        }
      }
      if (cur) sections.push(cur)

      const isAllowed = (heading) => VERBATIM_ALLOWED_HEADINGS.some(h => heading.startsWith(h))

      const collisions = []
      for (let i = 0; i < sections.length; i++) {
        const a = sections[i]
        const aBody = a.body.join('\n')
        // Extract quoted phrases (Chinese full-width or ASCII double quotes)
        const phrases = new Set()
        for (const m of aBody.matchAll(/"([^"]{2,40})"|"([^"]{2,40})"/g)) {
          phrases.add(m[1] || m[2])
        }
        for (const phrase of phrases) {
          for (let j = i + 1; j < sections.length; j++) {
            const b = sections[j]
            const bBody = b.body.join('\n')
            if (bBody.includes(phrase)) {
              if (!(isAllowed(a.heading) && isAllowed(b.heading))) {
                collisions.push({ phrase, sections: [a.heading, b.heading] })
              }
            }
          }
        }
      }
      return collisions
    }

    it('does NOT flag a compliant persona', () => {
      expect(findCrossSectionVerbatimCollisions(compliantMarkdown)).toEqual([])
    })

    it('flags a violating persona where a catchphrase repeats across non-allowed sections', () => {
      const collisions = findCrossSectionVerbatimCollisions(violatingMarkdown)
      expect(collisions.length).toBeGreaterThan(0)
      expect(collisions.some(c => c.phrase === 'OK啦')).toBe(true)
    })
  })

  describe('_scrubGeneratedPersona — defensive post-process', () => {
    it('returns null/empty inputs unchanged', () => {
      expect(_scrubGeneratedPersona('', 'Lillian', 'zh')).toBe('')
      expect(_scrubGeneratedPersona(null, 'Lillian', 'zh')).toBe(null)
      expect(_scrubGeneratedPersona(undefined, 'Lillian', 'en')).toBe(undefined)
    })

    it('replaces bare [tracking_id] placeholder with localized phrase', () => {
      expect(_scrubGeneratedPersona('立即发送 [tracking_id] 给对方', 'Lillian', 'zh'))
        .toBe('立即发送 （一次性编号） 给对方')
      expect(_scrubGeneratedPersona('immediately sends [tracking_id]', 'Lillian', 'en'))
        .toBe('immediately sends (one-time identifier)')
    })

    it('replaces quoted [tracking_id] without introducing double quotes', () => {
      // ASCII single quotes
      expect(_scrubGeneratedPersona("'[tracking_id]'", 'Lillian', 'zh'))
        .toBe('（一次性编号）')
      // ASCII double quotes
      expect(_scrubGeneratedPersona('"[tracking_id]"', 'Lillian', 'en'))
        .toBe('(one-time identifier)')
      // CJK quotes
      expect(_scrubGeneratedPersona('"[tracking_id]"', 'Lillian', 'zh'))
        .toBe('（一次性编号）')
    })

    it('replaces [number] placeholder', () => {
      expect(_scrubGeneratedPersona('订单 [number] 已确认', 'Lillian', 'zh'))
        .toBe('订单 （一串数字） 已确认')
    })

    it('replaces [contact_id] with agent display name', () => {
      expect(_scrubGeneratedPersona('联系 [contact_id]', 'Lillian', 'zh'))
        .toBe('联系 Lillian')
      // No agent name → fallback to neutral pronoun-ish
      expect(_scrubGeneratedPersona('contact [contact_id]', '', 'en'))
        .toBe('contact them')
      expect(_scrubGeneratedPersona('联系 [contact_id]', '', 'zh'))
        .toBe('联系 对方')
    })

    it('replaces wxid_xxx leaks with agent display name', () => {
      // Most common: speaker prefix in Example Dialogue blockquote
      expect(_scrubGeneratedPersona('> [2025-09-13] wxid_7930869305912: 你自己裁剪', 'Lillian', 'zh'))
        .toBe('> [2025-09-13] Lillian: 你自己裁剪')
      // Multiple in same line
      expect(_scrubGeneratedPersona('wxid_abc-DEF_123 与 wxid_xyz789', 'Lillian', 'zh'))
        .toBe('Lillian 与 Lillian')
    })

    it('handles a realistic leak fixture (mimics actual qwen output)', () => {
      const input = `
## 核心模式
当对方主动提供解决方案时，你会立刻接受并交付执行细节（如"好嘞👌""稍等""[tracking_id]"），而不是表达感谢。

## 决策本能
冷场时 → 抛出具体事务锚点重启对话（"得宝卫生纸🧻""稍等""[tracking_id]"）

## 情感行为/如何道歉
立即发送"[tracking_id]""稍等"，用结果覆盖情绪。

## 冲突链 5 步
和解信号 → "稍等""[tracking_id]"（重启事务）

## 示例对话
> [2023-05-27 22:21:40] wxid_7930869305912: 准备去寄宿家庭的自我介绍
> [2023-05-27 22:21:44] wxid_7930869305912: 愁死了

## 关系图
对接需要联系 [contact_id]
`
      const out = _scrubGeneratedPersona(input, 'Lillian', 'zh')

      // Zero placeholders should remain
      expect(out).not.toMatch(/\[tracking_id\]/)
      expect(out).not.toMatch(/\[number\]/)
      expect(out).not.toMatch(/\[contact_id\]/)
      // Zero raw wxids
      expect(out).not.toMatch(/wxid_/)

      // Replacements present
      expect(out).toContain('（一次性编号）')
      expect(out).toContain('Lillian:')  // wxid replaced in blockquotes
      expect(out).toContain('联系 Lillian')

      // Quoted occurrences should NOT have double-wrapped quotes
      expect(out).not.toMatch(/"（一次性编号）"|'（一次性编号）'|"（一次性编号）"/)

      // Untouched real content still there
      expect(out).toContain('好嘞👌')
      expect(out).toContain('得宝卫生纸')
      expect(out).toContain('愁死了')
    })

    it('does not mangle legitimate text containing words like "tracking" or "number" outside placeholders', () => {
      const input = '她经常用编号和 tracking number 反映事务节奏'
      const out = _scrubGeneratedPersona(input, 'Lillian', 'zh')
      expect(out).toBe(input)  // unchanged
    })

    it('preserves real model numbers (X5, GLC260) and short numbers', () => {
      const input = 'X5 漏机油，GLC260 进口的，扫地机 5999 块'
      const out = _scrubGeneratedPersona(input, 'Lillian', 'zh')
      expect(out).toBe(input)
    })

    // ── Replay test mirroring a real-world leak shape (synthetic content) ──
    // Structure mirrors the leak pattern observed in qwen-plus outputs: the
    // same placeholder tokens repeated across multiple non-allowed sections,
    // plus wxid speaker prefixes inside Example Dialogue blockquotes. The
    // chat text itself is fully synthetic to keep no real user data in the
    // repository.
    it('cleans a multi-section leak fixture (real-world shape, synthetic content)', () => {
      const fakeWxid = 'wxid_test0000000001'
      const leakFixture = `# TestAgent — 人格档案

## 核心模式（最高优先级——其他章节与此冲突时以此为准）
当对方主动提供具体解决方案时，你会立刻接受并交付执行细节（如"ack-A""ack-B""[tracking_id]"），而不是表达感谢。

## 决策本能
冷场时 → 抛出具体事务锚点重启对话（"item-X""ack-B""[tracking_id]"）。

## 情感行为与冲突链
### 如何道歉（或不道歉）
不单独道歉；通过推进事务弥补：冲突后立即发送"[tracking_id]""ack-B"，用结果覆盖情绪。

### 冲突链 5 步
和解信号（如发送[tracking_id]）→ 底线：事务闭环即关系修复。

### 和解信号
发送带编号/时效性的执行物（[tracking_id]、具体时间点、可点击链接）。

## 关系地图
对接需要联系 [contact_id]

## 示例对话
> [2024-01-01 10:00:00] ${fakeWxid}: synthetic-message-one
> [2024-01-01 10:00:30] ${fakeWxid}: synthetic-message-two
> [2024-01-01 10:01:00] ${fakeWxid}: ack-B[emoji]

> [2024-02-02 11:00:00] ${fakeWxid}: device-X has issue-Y
> [2024-02-02 11:00:15] ${fakeWxid}: hazard signal 🔥

> [2024-03-03 12:00:00] ${fakeWxid}: item-Z costs 5999
`
      const cleaned = _scrubGeneratedPersona(leakFixture, 'TestAgent', 'zh')

      // ── ZERO leak markers must remain ──────────────────────────────
      expect(cleaned).not.toMatch(/\[tracking_id\]/)
      expect(cleaned).not.toMatch(/\[number\]/)
      expect(cleaned).not.toMatch(/\[contact_id\]/)
      expect(cleaned).not.toMatch(/wxid_/)

      // ── Replacements look natural ──────────────────────────────────
      expect(cleaned).toContain('TestAgent: synthetic-message-one')
      expect(cleaned).toContain('TestAgent: synthetic-message-two')
      expect(cleaned).toContain('TestAgent: ack-B[emoji]')
      expect(cleaned).toContain('TestAgent: device-X has issue-Y')

      expect(cleaned).toContain('（一次性编号）')
      expect(cleaned).toContain('对接需要联系 TestAgent')

      // ── Synthetic content must survive untouched ─────────────────
      expect(cleaned).toContain('ack-A')
      expect(cleaned).toContain('item-X')
      expect(cleaned).toContain('item-Z costs 5999')
      expect(cleaned).toContain('🔥')
      expect(cleaned).toContain('# TestAgent — 人格档案')

      // ── No double-quoting from the quoted-replacement pass ────────
      expect(cleaned).not.toMatch(/"（一次性编号）"|'（一次性编号）'|"（一次性编号）"/)
    })
  })
})
