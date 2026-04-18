'use strict'

/**
 * chatParser.js — Node.js parsers for WhatsApp and plain-text chat exports.
 * WeChat and iMessage parsing lives in wechatParser.js.
 */

const fs = require('fs')
const path = require('path')

// WhatsApp export regex patterns (multiple format variants)
// iOS:         [DD/MM/YYYY, HH:MM:SS] Name: message
// iOS (intl):  [YYYY/M/D, HH:MM:SS] Name: message   ← year-first locales
// Android:     DD/MM/YYYY, HH:MM - Name: message
// US:          M/D/YY, H:MM AM/PM - Name: message
// Date segment: any combo of 1-4 digits separated by / or - or .
const WA_DATE = '[\\d]{1,4}[\\/\\-\\.][\\d]{1,2}[\\/\\-\\.][\\d]{1,4}'
const WA_PATTERNS = [
  // Bracketed format: [date, time] Name: msg
  new RegExp(`^\\[(${WA_DATE}),\\s*\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*[AP]M)?\\]\\s+(.+?):\\s+(.*)$`),
  // Unbracketed with dash separator: date, time - Name: msg
  new RegExp(`^(${WA_DATE}),\\s*\\d{1,2}:\\d{2}(?:\\s*[AP]M)?\\s+-\\s+(.+?):\\s+(.*)$`),
  // Unbracketed AM/PM: date, time AM/PM - Name: msg
  new RegExp(`^(${WA_DATE}),\\s*\\d{1,2}:\\d{2}\\s*[AP]M\\s+-\\s+(.+?):\\s+(.*)$`),
]

// System messages to skip
const WA_SYSTEM_RE = /^(Messages and calls are end-to-end encrypted|This message was deleted|<Media omitted>|image omitted|video omitted|audio omitted|GIF omitted|document omitted|sticker omitted|Contact card omitted)/i

/**
 * Parse a single WhatsApp export line. Returns { timestamp, sender, content } or null.
 */
function parseWhatsAppLine(line) {
  for (const re of WA_PATTERNS) {
    const m = line.match(re)
    if (m) {
      return { timestamp: m[1], sender: m[2].trim(), content: m[3].trim() }
    }
  }
  return null
}

/**
 * Extract messages from a WhatsApp .txt export file.
 * Also handles .zip (single .txt inside) via adm-zip.
 * @param {string} filePath - path to .txt or .zip file
 * @param {function} [onProgress] - optional (pct, msg) callback
 * @returns {{ messages: Array, warning?: string }}
 */
function extractWhatsAppMessages(filePath, onProgress) {
  let text

  if (filePath.endsWith('.zip')) {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(filePath)
    const entries = zip.getEntries().filter(e => e.entryName.endsWith('.txt'))
    if (entries.length === 0) throw new Error('No .txt file found inside the ZIP.')
    text = zip.readAsText(entries[0])
    onProgress && onProgress(20, `Extracted ${entries[0].entryName} from ZIP`)
  } else {
    text = fs.readFileSync(filePath, 'utf8')
    onProgress && onProgress(20, 'Read export file')
  }

  return parseWhatsAppText(text, onProgress)
}

/**
 * Parse WhatsApp text content (already loaded as string).
 */
function parseWhatsAppText(text, onProgress) {
  const lines = text.split('\n')
  const messages = []
  let current = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const parsed = parseWhatsAppLine(line)
    if (parsed) {
      if (current) messages.push(current)
      if (WA_SYSTEM_RE.test(parsed.content)) {
        current = null
        continue
      }
      current = parsed
    } else if (current) {
      // Continuation of previous message
      current.content += '\n' + line
    }
  }
  if (current) messages.push(current)

  onProgress && onProgress(80, `Parsed ${messages.length} messages`)

  if (messages.length === 0) {
    return { messages: [], warning: 'No messages could be parsed. Check the file format.' }
  }
  return { messages }
}

/**
 * Parse a generic plain-text paste.
 * Tries common formats:
 *   - "Name: message" (each line)
 *   - "[timestamp] Name: message"
 *   - "Name\nmessage\n---" (block format)
 * @param {string} text
 * @param {function} [onProgress]
 * @returns {{ messages: Array, warning?: string }}
 */
function extractPlainTextMessages(text, onProgress) {
  const lines = text.split('\n')
  const messages = []

  // Try "Name: content" pattern with optional leading timestamp
  const lineRe = /^(?:\[?[\d\/\-: ,APM]+\]?\s+)?([^:：\n]{1,40})[：:]\s+(.+)$/

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(lineRe)
    if (m) {
      messages.push({ sender: m[1].trim(), content: m[2].trim(), timestamp: null })
    }
  }

  onProgress && onProgress(80, `Parsed ${messages.length} messages`)

  if (messages.length === 0) {
    // Fallback: treat every non-empty line as an unknown-sender message
    const fallback = lines
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => ({ sender: 'unknown', content: l, timestamp: null }))
    return {
      messages: fallback,
      warning: 'Could not detect sender names. All lines treated as messages.',
    }
  }
  return { messages }
}

/**
 * Classify raw messages into categories.
 * Classify messages into categories (long, conflict, sweet, daily).
 *
 * @param {Array<{sender: string, content: string}>} messages
 * @param {string} targetName - the name of "them" (the person being studied)
 * @returns {object} classified dict
 */
function classifyMessages(messages, targetName) {
  // Determine which sender is "them"
  const senders = {}
  for (const m of messages) {
    senders[m.sender] = (senders[m.sender] || 0) + 1
  }

  // "them" is the sender matching targetName (case-insensitive partial match)
  // or, if targetName not found, the most frequent non-"me" sender
  let themSender = null
  const nameLower = (targetName || '').toLowerCase()
  for (const s of Object.keys(senders)) {
    if (nameLower && s.toLowerCase().includes(nameLower)) {
      themSender = s
      break
    }
  }
  if (!themSender) {
    // Pick highest-frequency sender that isn't "me/我/I"
    const mePat = /^(me|我|i|myself)$/i
    const candidates = Object.entries(senders)
      .filter(([s]) => !mePat.test(s))
      .sort((a, b) => b[1] - a[1])
    themSender = candidates[0]?.[0] || null
  }

  // Normalize to them/me
  const normalized = messages.map(m => ({
    ...m,
    sender: themSender && m.sender === themSender ? 'them' : 'me',
  }))

  // Long messages (>= 50 chars from them)
  const long_messages = normalized
    .filter(m => m.sender === 'them' && m.content.length >= 50)
    .slice(0, 30)

  // Conflict messages — heuristic: contain conflict keywords
  const conflictKw = /生气|吵|算了|随便|你自己|不想说|冷战|分手|烦|滚|去死|hate|angry|fight|upset|whatever|forget it|leave me|don't talk/i
  const conflict_messages = normalized
    .filter(m => conflictKw.test(m.content))
    .slice(0, 20)

  // Sweet messages — heuristic: contain affectionate keywords
  const sweetKw = /喜欢|爱你|想你|宝|亲爱|心|❤|love|miss you|like you|baby|babe|honey|cute|sweet/i
  const sweet_messages = normalized
    .filter(m => sweetKw.test(m.content))
    .slice(0, 20)

  // Daily messages (recent, from them, short)
  const daily_messages = normalized
    .filter(m => m.sender === 'them' && m.content.length < 50)
    .slice(-50)

  // All messages — full history for storage and analysis tool
  const all_messages = normalized

  // Recent sample for AI prompt building (last 200 to keep context window sane)
  const all_messages_preview = normalized.slice(-200)

  const total_their_count = normalized.filter(m => m.sender === 'them').length

  // Hold-out pairs for Phase 4 validation harness (Code Phase D).
  // Walks backward from the tail and extracts turn-aligned (me-group → them-group)
  // pairs. Merges consecutive same-sender messages into one turn so bursts like
  // "好累 / 今天加班到9点" become a single trigger. Deduplicates on a normalized
  // prefix of the user message so the harness doesn't ask the same thing twice.
  const holdOutPairs = []
  const seenKeys = new Set()
  const HO_JUNK_RE = /^\s*(https?:\/\/|<Media|image omitted|sticker omitted)/i
  let hi = normalized.length - 1
  while (hi >= 0 && holdOutPairs.length < 15) {
    // Find end of a "them" run
    while (hi >= 0 && normalized[hi].sender !== 'them') hi--
    if (hi < 0) break
    const themEnd = hi
    while (hi >= 0 && normalized[hi].sender === 'them') hi--
    const themStart = hi + 1
    // Collect connected "me" run immediately before
    const meEnd = hi
    while (hi >= 0 && normalized[hi].sender === 'me') hi--
    const meStart = hi + 1
    if (meStart > meEnd) continue

    const userMessage = normalized.slice(meStart, meEnd + 1)
      .map(m => (m.content || '').trim()).filter(Boolean).join(' / ')
    const realReply = normalized.slice(themStart, themEnd + 1)
      .map(m => (m.content || '').trim()).filter(Boolean).join(' / ')

    if (userMessage.length < 2 || realReply.length < 4) continue
    if (HO_JUNK_RE.test(userMessage) || HO_JUNK_RE.test(realReply)) continue

    // Dedup on normalized 30-char prefix
    const key = userMessage.toLowerCase().replace(/\s+/g, '').slice(0, 30)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    holdOutPairs.unshift({
      userMessage,
      realReply,
      timestamp: normalized[themStart]?.timestamp || null,
    })
  }

  return {
    long_messages,
    conflict_messages,
    sweet_messages,
    daily_messages,
    all_messages,
    all_messages_preview,
    total_their_count,
    total_count: messages.length,
    target_name: targetName,
    holdOutPairs,
  }
}

/**
 * Build the message block string for the AI prompt.
 * Build the message block string for the AI prompt.
 *
 * @param {object} classified - result of classifyMessages()
 * @param {string} targetName
 * @param {string} [analyzeTarget='other'] - 'self' to analyze "Me", 'other' to analyze "Them"
 * @returns {string}
 */
function buildMessageBlock(classified, targetName, analyzeTarget) {
  const isSelf = analyzeTarget === 'self'
  const name = targetName || 'Them'
  const lines = []

  const fmt = (msgs, label) => {
    if (!msgs || msgs.length === 0) return
    lines.push(`\n## ${label} (${msgs.length})\n`)
    for (const m of msgs) {
      const sender = m.sender === 'them' ? name : 'Me'
      const ts = m.timestamp ? `[${m.timestamp}] ` : ''
      lines.push(`${ts}${sender}: ${m.content}`)
    }
  }

  // When analyzing self, use "me" messages for the highlight sections
  // (classified.long_messages / daily_messages always contain "them" messages)
  if (isSelf) {
    const all = classified.all_messages || []
    const myLong = all.filter(m => m.sender === 'me' && m.content.length >= 50).slice(0, 30)
    const myDaily = all.filter(m => m.sender === 'me' && m.content.length < 50).slice(-50)
    fmt(myLong, 'Long Messages (My Detailed Expressions)')
    fmt(classified.conflict_messages, 'Conflict Messages')
    fmt(classified.sweet_messages, 'Sweet / Affectionate Messages')
    fmt(myDaily, 'Daily Chat Samples (Mine)')
  } else {
    fmt(classified.long_messages, 'Long Messages (Their Detailed Expressions)')
    fmt(classified.conflict_messages, 'Conflict Messages')
    fmt(classified.sweet_messages, 'Sweet / Affectionate Messages')
    fmt(classified.daily_messages, 'Daily Chat Samples')
  }

  const all = classified.all_messages_preview || classified.all_messages || []
  const allSlice = all.slice(-200)
  if (allSlice.length > 0) {
    lines.push(`\n## Recent Conversation (last ${allSlice.length} messages, chronological)\n`)
    for (const m of allSlice) {
      const sender = m.sender === 'them' ? name : 'Me'
      const ts = m.timestamp ? `[${m.timestamp}] ` : ''
      lines.push(`${ts}${sender}: ${m.content}`)
    }
  }

  return lines.join('\n')
}

/**
 * List unique senders in a WhatsApp export file, with message counts.
 * Used by the wizard to let the user pick which sender is "them".
 * @param {string} filePath - path to .txt or .zip file
 * @returns {{ senders: Array<{name: string, count: number}>, warning?: string }}
 */
function listWhatsAppSenders(filePath) {
  const { messages, warning } = extractWhatsAppMessages(filePath)
  if (messages.length === 0) {
    return { senders: [], warning: warning || 'No messages could be parsed.' }
  }
  const counts = {}
  for (const m of messages) {
    counts[m.sender] = (counts[m.sender] || 0) + 1
  }
  const senders = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  return { senders, warning }
}

module.exports = {
  extractWhatsAppMessages,
  extractPlainTextMessages,
  classifyMessages,
  buildMessageBlock,
  listWhatsAppSenders,
}
