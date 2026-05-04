'use strict'

/**
 * harnessPromptBuilder.js — pure prompt construction for the persona
 * validation harness (used by `agent:import-validate-harness`).
 *
 * Extracted as a standalone module so the diversity logic (siblings injection,
 * engagement directive, previousAttempts feedback) can be unit-tested without
 * spinning up an LLM call.
 *
 * Inputs are plain values; output is a single string. No side effects.
 */

/**
 * @param {object} opts
 * @param {string} opts.fullSystem        - Pre-built system prompt block (persona + speechDNA)
 * @param {string} opts.agentName         - Display name of the persona
 * @param {string} opts.userMessage       - The chat-history user message to react to
 * @param {string[]} [opts.siblings]      - Replies already generated for OTHER pairs in this validation
 * @param {Array<{generatedReply:string, reason?:string}>} [opts.previousAttempts]
 *                                          - Replies for THIS pair that the user previously rated 👎
 * @param {string} [opts.language='en']   - 'zh' or 'en'
 * @returns {string} Full prompt to feed into the LLM
 */
function buildHarnessPrompt({ fullSystem, agentName, userMessage, siblings = [], previousAttempts = [], language = 'en' }) {
  const zh = language === 'zh'

  // Per-pair feedback — replies the USER marked 👎 for THIS pair in earlier rounds.
  let feedbackBlock = ''
  const dislikes = Array.isArray(previousAttempts)
    ? previousAttempts.filter(a => a && a.rating === 'dislike')
    : []
  if (dislikes.length > 0) {
    const attempts = dislikes.map((a, k) => {
      let line = zh ? `尝试 ${k + 1}: "${a.generatedReply}"` : `Attempt ${k + 1}: "${a.generatedReply}"`
      if (a.reason) line += zh ? ` — 用户反馈: "${a.reason}"` : ` — feedback: "${a.reason}"`
      return line
    }).join('\n')
    feedbackBlock = zh
      ? `\n\n以下是你之前的回复，用户认为不像本人：\n${attempts}\n\n这次换一种回法，避开之前的问题。`
      : `\n\nYour previous replies were marked "not like them" by the user:\n${attempts}\n\nTry a different approach this time — avoid the issues above.`
  }

  // Cross-pair anti-repetition — replies already produced for OTHER pairs in
  // this validation session. Forces deliberate divergence in catchphrase /
  // angle / structure so the user can actually distinguish responses.
  let siblingsBlock = ''
  if (Array.isArray(siblings) && siblings.length > 0) {
    const lines = siblings
      .filter(s => typeof s === 'string' && s.trim())
      .map(s => `- "${s.replace(/\n+/g, ' ').slice(0, 120)}"`)
      .join('\n')
    if (lines) {
      siblingsBlock = zh
        ? `\n\n你在本次真实度验证中已经产出过这些回复：\n${lines}\n这次要换一个不同的口头禅 / 不同的角度 / 不同的句式结构 — 不要再重复上面这些口头禅或开场。让你的人格表达多样化。`
        : `\n\nIn this validation session you've already produced these replies:\n${lines}\nFor THIS one, use a DIFFERENT catchphrase / DIFFERENT angle / DIFFERENT sentence structure than the above. Do not reuse those openers or catchphrases. Vary your persona expression.`
    }
  }

  // Engagement directive — respond to the actual content of the user's
  // message, do not just deploy catchphrases regardless of context.
  const engageDirective = zh
    ? `针对用户这条具体消息的内容来回 — 你的回复必须响应他们的实际意思，不要不分语境地堆口头禅。Speech DNA 里的高频短语最多用 1 个，且只在自然契合这个具体对话时用。`
    : `Engage with the SPECIFIC content of what the user just said — your reply must address their actual meaning, do not just pile catchphrases regardless of context. Use AT MOST ONE catchphrase from your speech DNA, and only if it naturally fits THIS specific exchange.`

  const userLine = zh
    ? `用户刚说: "${userMessage}"`
    : `The user just said: "${userMessage}"`
  const closing = zh
    ? `以 ${agentName} 的身份回复 — 不要解释，不要旁白，只输出实际回复文字。`
    : `Reply as ${agentName} would — no explanation, no stage directions, just the actual reply text.`

  return `${fullSystem}\n\n---\n${userLine}${feedbackBlock}${siblingsBlock}\n\n${engageDirective}\n\n${closing}`
}

module.exports = { buildHarnessPrompt }
