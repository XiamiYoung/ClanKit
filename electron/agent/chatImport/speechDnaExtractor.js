'use strict'

/**
 * speechDnaExtractor.js — extract structured speech DNA from chat history.
 *
 * Two-stage extraction:
 *   1. Statistics (deterministic, no LLM): word/emoji frequency, sentence length,
 *      reply latency distribution, punctuation habits, message ending characters.
 *   2. Semantic (LLM call): catchphrase validation, conventions (nicknames, inside
 *      jokes), anti-patterns ("never does"), emoji context.
 *
 * Output is a structured JSON blob written to:
 *   {agentArtifactsDir}/{type}/{agentId}.speech.json
 *
 * At runtime, systemPromptBuilder.js reads this file and injects it as a
 * hard-constraint block at the top of the system prompt — this is the
 * "Expression DNA" layer of the Nuwa methodology, applied to private chat data.
 */

const { logger } = require('../../logger')

// Common emoji ranges (covers most use cases including emoticons, symbols, transport)
// Global version for match() / replace(), single-char version for test().
const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}]/gu
const EMOJI_TEST_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}]/u

// Sentence-ending punctuation (CJK + Latin) — non-global for test()
const SENTENCE_END_RE = /[。.？?！!～~]/

function isCjkChar(ch) {
  const code = ch.codePointAt(0)
  return (code >= 0x2E80 && code <= 0x9FFF)
      || (code >= 0xF900 && code <= 0xFAFF)
      || (code >= 0xAC00 && code <= 0xD7AF)
}

/**
 * Generate n-grams for catchphrase mining. Auto-detects script:
 *   - CJK majority → character n-grams (2-4 chars)
 *   - Latin majority → word n-grams (1-3 words)
 */
function ngrams(text, minN, maxN) {
  const result = []
  const trimmed = (text || '').trim()
  if (!trimmed) return result

  let cjk = 0, total = 0
  for (const ch of trimmed) {
    if (/\s/.test(ch)) continue
    if (isCjkChar(ch)) cjk++
    total++
  }
  const isCjkMajority = total > 0 && cjk / total > 0.3

  if (isCjkMajority) {
    const chars = [...trimmed].filter(c => !/\s/.test(c))
    for (let n = minN; n <= maxN; n++) {
      for (let i = 0; i + n <= chars.length; i++) {
        result.push(chars.slice(i, i + n).join(''))
      }
    }
  } else {
    const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
    for (let n = minN; n <= maxN; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        result.push(words.slice(i, i + n).join(' '))
      }
    }
  }
  return result
}

/**
 * Best-effort timestamp parser. Accepts ISO strings, "YYYY-MM-DD HH:mm:ss",
 * Unix ms numbers, and most Date-parseable formats.
 */
function parseTimestamp(ts) {
  if (!ts) return null
  if (typeof ts === 'number') return ts
  if (typeof ts !== 'string') return null
  const d = new Date(ts)
  if (!isNaN(d.getTime())) return d.getTime()
  return null
}

/**
 * Extract deterministic statistics from a list of target messages.
 */
function extractStatistics(targetMessages, allMessages, targetSender) {
  if (!targetMessages || targetMessages.length === 0) return null

  // Catchphrase / high-freq n-gram mining
  const ngramCounts = new Map()
  for (const m of targetMessages) {
    const grams = ngrams(m.content, 2, 4)
    for (const g of grams) {
      ngramCounts.set(g, (ngramCounts.get(g) || 0) + 1)
    }
  }
  const candidates = [...ngramCounts.entries()]
    .filter(([g, c]) => c >= 3 && g.length >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)

  // Emoji frequency
  const emojiCounts = new Map()
  for (const m of targetMessages) {
    const matches = m.content.match(EMOJI_RE) || []
    for (const e of matches) {
      emojiCounts.set(e, (emojiCounts.get(e) || 0) + 1)
    }
  }
  const topEmoji = [...emojiCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([char, frequency]) => ({ char, frequency }))

  // Sentence length
  const lengths = targetMessages
    .map(m => m.content.length)
    .filter(l => l > 0)
    .sort((a, b) => a - b)
  const avgLength = lengths.length > 0
    ? Math.round(lengths.reduce((s, l) => s + l, 0) / lengths.length)
    : 0
  const median = lengths[Math.floor(lengths.length / 2)] || 0
  const shortCount = lengths.filter(l => l < 10).length
  const shortPct = lengths.length > 0 ? +(shortCount / lengths.length).toFixed(2) : 0

  // Punctuation habit (looking at the LAST char of each message).
  // Use code-point iteration so surrogate-pair emoji don't get split in half.
  let withPunct = 0
  const endChars = new Map()
  for (const m of targetMessages) {
    const trimmed = m.content.trim()
    if (!trimmed) continue
    const codePoints = [...trimmed]
    const last = codePoints[codePoints.length - 1]
    if (!last) continue
    if (SENTENCE_END_RE.test(last)) withPunct++
    // Skip emoji / pictographs from the endings list — they belong in the emoji list
    if (!EMOJI_TEST_RE.test(last)) {
      endChars.set(last, (endChars.get(last) || 0) + 1)
    }
  }
  const punctRate = targetMessages.length > 0 ? withPunct / targetMessages.length : 0
  let punctuation = 'normal'
  if (punctRate < 0.2) punctuation = 'minimal'
  else if (punctRate > 0.7) punctuation = 'heavy'
  const endsWith = [...endChars.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ch]) => ch)

  // Reply latency: time from "other side" message to target's first response
  const otherSender = targetSender === 'them' ? 'me' : 'them'
  const latencies = []
  if (allMessages && allMessages.length > 0) {
    let lastOtherTs = null
    for (const m of allMessages) {
      const ts = parseTimestamp(m.timestamp)
      if (m.sender === otherSender) {
        if (ts) lastOtherTs = ts
      } else if (m.sender === targetSender && lastOtherTs && ts) {
        const delta = (ts - lastOtherTs) / 1000
        if (delta >= 0 && delta < 86400) latencies.push(delta)
        lastOtherTs = null
      }
    }
  }
  let medianLatencySec = 0
  if (latencies.length > 0) {
    latencies.sort((a, b) => a - b)
    medianLatencySec = Math.round(latencies[Math.floor(latencies.length / 2)])
  }

  return {
    catchphraseCandidates: candidates.map(([phrase, frequency]) => ({ phrase, frequency })),
    emoji: topEmoji,
    sentenceStyle: { avgLength, median, shortPct, punctuation, endsWith },
    replyTiming: { medianLatencySec, sampleSize: latencies.length },
  }
}

/**
 * Pick representative sample messages — strided across the timeline for diversity.
 */
function pickSampleMessages(messages, limit) {
  if (messages.length <= limit) return messages.slice()
  const stride = Math.max(1, Math.floor(messages.length / limit))
  const samples = []
  for (let i = 0; i < messages.length && samples.length < limit; i += stride) {
    samples.push(messages[i])
  }
  return samples
}

/**
 * Build the LLM prompt for the semantic part.
 */
function buildSemanticPrompt(name, statistics, sampleMessages, language) {
  const zh = language === 'zh'
  const sampleText = sampleMessages
    .slice(0, 30)
    .map(m => `- "${(m.content || '').replace(/"/g, '\\"').slice(0, 200)}"`)
    .join('\n')

  const statsText = `- Avg sentence length: ${statistics.sentenceStyle.avgLength} chars (median ${statistics.sentenceStyle.median})
- Short messages (<10 chars): ${Math.round(statistics.sentenceStyle.shortPct * 100)}%
- Punctuation habit: ${statistics.sentenceStyle.punctuation}
- Common message endings: ${statistics.sentenceStyle.endsWith.join(', ') || '(none)'}
- Top emoji: ${statistics.emoji.slice(0, 5).map(e => `${e.char} (${e.frequency})`).join(', ') || '(none)'}
- High-freq phrase candidates: ${statistics.catchphraseCandidates.slice(0, 15).map(c => `${c.phrase}(${c.frequency})`).join(', ') || '(none)'}
- Median reply latency: ${statistics.replyTiming.medianLatencySec}s`

  if (zh) {
    return `你是一个语言风格指纹分析专家。下面是 ${name} 在真实聊天里的统计数据 + 30 条样本消息。请提取 TA 的"说话风格指纹"。

## 统计
${statsText}

## 样本消息
${sampleText}

## 任务
输出严格 JSON（不要 markdown 代码块），格式：
{
  "catchphrases": ["..."],
  "conventions": {
    "callsYou": ["..."],
    "selfReference": ["..."],
    "insideJokes": [{"phrase": "...", "meaning": "..."}]
  },
  "neverDoes": ["..."],
  "emojiContext": {"<emoji>": "<语境描述>"}
}

字段说明：
- catchphrases: 从 high-freq 候选里挑出真正像口头禅的，最多 8 个。普通的连接词不算。
- callsYou: TA 怎么称呼"我"（昵称、爱称、外号），从样本中找
- selfReference: TA 怎么自称（"我"、"本宝"、"老娘"等）
- insideJokes: 你们之间的内部黑话/梗，至少出现 2 次以上才算
- neverDoes: TA 绝不会做的事，至少 3 条，覆盖："不用 AI 客服式开场"、"不用 markdown"、"不用句号结尾"等明显反模式
- emojiContext: top emoji 的使用语境（例如"自嘲"、"道歉"）

只输出 JSON。找不到的字段输出空数组或空对象。`
  }

  return `You are a speech style fingerprint analyst. Below are statistics + 30 sample messages from ${name}'s real chat history. Extract their speech style fingerprint.

## Statistics
${statsText}

## Sample Messages
${sampleText}

## Task
Output STRICT JSON (no markdown fences) in this shape:
{
  "catchphrases": ["..."],
  "conventions": {
    "callsYou": ["..."],
    "selfReference": ["..."],
    "insideJokes": [{"phrase": "...", "meaning": "..."}]
  },
  "neverDoes": ["..."],
  "emojiContext": {"<emoji>": "<context description>"}
}

Field guide:
- catchphrases: real catchphrases picked from the high-freq candidates, max 8. Generic connectors don't count.
- callsYou: how they address the user (nicknames, terms of endearment) from samples
- selfReference: how they refer to themselves
- insideJokes: private vocabulary / inside jokes — must appear 2+ times
- neverDoes: things they would NEVER do, 3+ entries covering style anti-patterns like: no AI assistant openings, no markdown, no period at sentence ends, etc.
- emojiContext: usage context for top emoji

Output ONLY JSON. Empty array/object for not-found fields.`
}

/**
 * Tolerant JSON parser — strips markdown fences and finds first {...}.
 */
function parseJsonResponse(raw) {
  if (!raw) return null
  let s = String(raw).trim()
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch (err) {
    logger.warn('[speechDnaExtractor] JSON parse failed:', err.message)
    return null
  }
}

/**
 * Main entry — extract speech DNA from classified messages.
 *
 * @param {object} classified - output of classifyMessages()
 * @param {object} profile - { name, gender }
 * @param {object} config - app config (for utility model access)
 * @param {string} language - 'en' or 'zh'
 * @param {string} analyzeTarget - 'self' or 'other'
 * @returns {Promise<object|null>} speech DNA JSON, or null if too few messages / failure
 */
async function extractSpeechDna(classified, profile, config, language, analyzeTarget = 'other') {
  try {
    const isSelf = analyzeTarget === 'self'
    const targetSender = isSelf ? 'me' : 'them'
    const all = classified?.all_messages || []
    const targetMessages = all.filter(m => m.sender === targetSender && m.content && m.content.trim())

    if (targetMessages.length < 10) {
      logger.warn(`[speechDnaExtractor] too few messages (${targetMessages.length}), skipping`)
      return null
    }

    const statistics = extractStatistics(targetMessages, all, targetSender)
    if (!statistics) return null

    const name = profile?.name || (isSelf ? 'Me' : 'Them')
    const sampleMessages = pickSampleMessages(targetMessages, 30)
    const prompt = buildSemanticPrompt(name, statistics, sampleMessages, language)

    let semantic = null
    try {
      const { _callLLM } = require('./personaBuilder')
      const raw = await _callLLM(prompt, config, 2048, { jsonMode: true })
      semantic = parseJsonResponse(raw)
    } catch (err) {
      logger.warn(`[speechDnaExtractor] LLM call failed: ${err.message}, falling back to statistics-only`)
    }

    // Catchphrases: prefer LLM-validated, fall back to top n-grams
    const catchphraseList = (semantic?.catchphrases && Array.isArray(semantic.catchphrases) && semantic.catchphrases.length > 0)
      ? semantic.catchphrases.slice(0, 8)
      : statistics.catchphraseCandidates.slice(0, 6).map(c => c.phrase)

    // Annotate emoji with context from LLM
    const emoji = statistics.emoji.map(e => ({
      ...e,
      context: semantic?.emojiContext?.[e.char] || '',
    }))

    return {
      version: 1,
      name,
      analyzedAt: new Date().toISOString(),
      catchphrases: catchphraseList.map(p => (typeof p === 'string' ? { phrase: p } : p)),
      emoji,
      sentenceStyle: statistics.sentenceStyle,
      replyTiming: statistics.replyTiming,
      conventions: semantic?.conventions || { callsYou: [], selfReference: [], insideJokes: [] },
      neverDoes: Array.isArray(semantic?.neverDoes) ? semantic.neverDoes : [],
    }
  } catch (err) {
    logger.error('[speechDnaExtractor] extractSpeechDna error:', err.message)
    return null
  }
}

/**
 * Format a Speech DNA JSON object as a system prompt block.
 * This is what gets injected at the top of the system prompt for imported agents.
 */
function formatSpeechDnaBlock(speechDna) {
  if (!speechDna) return ''
  const lines = []
  lines.push('## SPEECH DNA — HARD CONSTRAINTS (overrides everything below)')
  lines.push('You MUST mimic these surface patterns at all times. Failure to match these = breaking character.')
  lines.push('')

  const catchphrases = (speechDna.catchphrases || []).map(c => c.phrase || c).filter(Boolean)
  if (catchphrases.length > 0) {
    lines.push('Catchphrases (use naturally, do not force):')
    lines.push('  ' + catchphrases.join(', '))
    lines.push('')
  }

  const emoji = speechDna.emoji || []
  if (emoji.length > 0) {
    lines.push('Emoji you actually use (NEVER use other emoji):')
    for (const e of emoji.slice(0, 6)) {
      const ctx = e.context ? ` — ${e.context}` : ''
      lines.push(`  ${e.char}${ctx}`)
    }
    lines.push('')
  } else {
    lines.push('Emoji: you rarely or never use emoji. Do NOT add emoji.')
    lines.push('')
  }

  const ss = speechDna.sentenceStyle
  if (ss) {
    lines.push('Sentence style:')
    lines.push(`  - Average length: ${ss.avgLength} chars (median ${ss.median})`)
    lines.push(`  - ${Math.round((ss.shortPct || 0) * 100)}% of your messages are under 10 chars`)
    lines.push(`  - Punctuation: ${ss.punctuation}`)
    if (ss.endsWith && ss.endsWith.length > 0) {
      lines.push(`  - Common message endings: ${ss.endsWith.join(' ')}`)
    }
    lines.push('')
  }

  const rt = speechDna.replyTiming
  if (rt && rt.medianLatencySec > 0) {
    lines.push('Reply timing:')
    lines.push(`  - Median latency: ${rt.medianLatencySec}s (use this to gauge tone — long delays often signal discomfort)`)
    lines.push('')
  }

  const conv = speechDna.conventions || {}
  if (conv.callsYou && conv.callsYou.length > 0) {
    lines.push(`You call the user: ${conv.callsYou.join(', ')}`)
  }
  if (conv.selfReference && conv.selfReference.length > 0) {
    lines.push(`You refer to yourself as: ${conv.selfReference.join(', ')}`)
  }
  if (conv.insideJokes && conv.insideJokes.length > 0) {
    lines.push('Inside jokes / private vocabulary (use when contextually appropriate):')
    for (const j of conv.insideJokes) {
      if (j.phrase) lines.push(`  - "${j.phrase}"${j.meaning ? ` — ${j.meaning}` : ''}`)
    }
  }
  if ((conv.callsYou && conv.callsYou.length > 0) || (conv.selfReference && conv.selfReference.length > 0) || (conv.insideJokes && conv.insideJokes.length > 0)) {
    lines.push('')
  }

  if (speechDna.neverDoes && speechDna.neverDoes.length > 0) {
    lines.push('You NEVER:')
    for (const n of speechDna.neverDoes) {
      lines.push(`  - ${n}`)
    }
  }

  return lines.join('\n').trim()
}

module.exports = {
  extractSpeechDna,
  extractStatistics,
  formatSpeechDnaBlock,
  ngrams,
  parseTimestamp,
}
