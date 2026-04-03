'use strict'

/**
 * personaBuilder.js — builds the combined AI prompt and calls the utility model
 * to generate a Layer 0-5 persona document from classified chat messages + user profile.
 *
 * Supports chunked analysis: when chat history exceeds the model's context window,
 * messages are split into chunks, each analyzed independently, then a final synthesis
 * call merges partial analyses into the complete persona.
 */

const { logger } = require('../../logger')

// Conservative token estimation for CJK-heavy text.
// DeepSeek/ChatGLM: ~1 CJK char = 1 token. OpenAI/Claude: ~1.5 chars = 1 token.
// We use the worst case (1:1 for CJK) to avoid context overflow.
function estimateTokens(text) {
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if ((code >= 0x2E80 && code <= 0x9FFF) || (code >= 0xF900 && code <= 0xFAFF)
        || (code >= 0x20000 && code <= 0x2FA1F) || (code >= 0xAC00 && code <= 0xD7AF)) {
      cjk++
    } else {
      other++
    }
  }
  // 1:1 for CJK (worst case), 1:3.5 for Latin/ASCII
  return Math.ceil(cjk + other / 3.5)
}

/**
 * Look up a model's context window from the provider-models cache.
 * Falls back to a conservative default if not found.
 */
function getContextWindow(modelId, contextWindows) {
  if (!modelId) return 32000
  // Exact match first
  if (contextWindows?.[modelId]) return contextWindows[modelId]
  // Substring match (handles "openrouter/..." prefixed IDs)
  if (contextWindows) {
    for (const [id, ctx] of Object.entries(contextWindows)) {
      if (id.includes(modelId) || modelId.includes(id)) return ctx
    }
  }
  // Fallback heuristic
  const lower = modelId.toLowerCase()
  if (lower.includes('claude')) return 200000
  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo')) return 128000
  if (lower.includes('deepseek')) return 65536
  return 32000
}

/**
 * Build the merged prompt (chat_analyzer + persona_analyzer + persona_builder).
 *
 * @param {object} profile - { name, gender, relationship, impression }
 * @param {string} messageBlock - formatted chat messages (from buildMessageBlock())
 * @returns {string} full prompt string
 */
function buildCombinedPrompt(profile, messageBlock, language) {
  const name = profile.name || 'Unknown'
  const gender = profile.gender || 'Unknown'
  const zh = language === 'zh'
  const lang = zh ? 'Chinese (Simplified)' : 'English'

  const template = zh ? `你是一个人格生成系统。分析下方的聊天记录和个人资料，生成完整的 Layer 0-5 人格文档。

重要：整个输出必须使用简体中文。
优先规则：手动提供的资料优先于聊天记录分析结论。
仅输出最终的人格文档（Markdown 格式），不要包含中间分析步骤。
在文档末尾另起一行输出：
SHORT_DESCRIPTION: <用一句话描述此人，不超过50个字>
再另起一行输出：
INFERRED_RELATIONSHIP: <根据聊天内容推断的关系，如：同事、朋友、前男/女友等>
再另起一行输出：
INFERRED_IMPRESSION: <根据聊天内容推断你对此人的整体印象，不超过100个字>
再另起一行输出：
INFERRED_THEIR_IMPRESSION: <根据聊天内容推断此人对你的印象和态度，不超过100个字>

---
## 个人资料
姓名：${name}
性别：${gender}

---
## 任务
从聊天记录中提取：
1. 语言习惯：高频词、口头禅、常用 emoji 及使用场景、句子长度、回复速度、"不想聊"信号
2. 情感表达：如何表达关心、不满、道歉、喜欢
3. 冲突模式：触发点 → 第一反应 → 升级 → 冷战 → 和解
4. 角色行为：主动发起模式、消失信号、底线

然后生成以下文档：

# ${name} — 人格档案

## Layer 0：核心模式（最高优先级 — 不可打破）
{从聊天记录和关系上下文中提炼核心行为规则。
格式："当[情况]时，你会[行为]，而不是[别人以为的那样]"}

## Layer 1：身份
{姓名、性别}
{从聊天模式中推断的关键性格特征}

## Layer 2：表达风格
### 口头禅和高频词
### 说话风格
{句式结构、不同场景下的 emoji 习惯、回复速度、沉默信号}
### 实际回复方式
> 日常问候：...
> 遇到不舒服的事：...
> "最近怎么样"：...
> 长时间沉默后你主动联系：...

## Layer 3：情感行为模式
### 如何表达关心
### 如何表达不满
### 如何道歉（或不道歉）

## Layer 4：冲突与关系边界
### 冲突链
### 冷战模式
### 和解信号
### 底线

## Layer 5：预警与极限
### 讨厌的事（附聊天证据）
### 什么时候会消失
### 如何重新出现

## 行为准则
1. Layer 0 优先级最高
2. 使用 Layer 2 的说话风格
3. 通过 Layer 3 的模式表达情感 — 用行为而非直白的陈述
4. 按 Layer 4 处理冲突 — 按链条走，不跳步
5. 你是${name}，不是 AI，永远不要打破角色
6. 始终使用用户的语言回复
7. 如果存在纠正记录，纠正记录优先

## 纠正记录
（暂无）

---
## 聊天记录
${messageBlock}`

  : `You are a persona generation system. Analyze the chat history and profile below, then generate a complete Layer 0-5 persona document.

IMPORTANT: The entire output MUST be written in English.
Priority rule: manually provided profile tags override chat analysis conclusions.
Output ONLY the final persona document in Markdown. Do not include intermediate analysis steps.
After the document, on a NEW line, output exactly:
SHORT_DESCRIPTION: <a one-sentence description of this person, max 50 characters>
Then on another NEW line:
INFERRED_RELATIONSHIP: <relationship inferred from chat, e.g. colleague, friend, ex-partner>
Then on another NEW line:
INFERRED_IMPRESSION: <your overall impression of this person from chat, max 100 characters>
Then: INFERRED_THEIR_IMPRESSION: <this person's impression/attitude toward you from chat, max 100 characters>

---
## PROFILE
Name: ${name}
Gender: ${gender}

---
## TASK
From the chat messages, extract:
1. Speech patterns: high-frequency words, catchphrases, top 5 emoji + usage context, sentence length, reply speed, "not in the mood" signals
2. Emotional expression: how they show care, displeasure, apologize (or don't), express affection
3. Conflict chain: trigger → first reaction → escalation → cold war → resolution
4. Role behavior: initiation patterns, disappearance signals, hard limits

Then generate this exact document:

# ${name} — Persona

## Layer 0: Core Patterns (Highest Priority — Never Break)
{Derive core behavioral rules from the chat history and relationship context.
Format: "When [situation], you [behavior], not [what people assume]"}

## Layer 1: Identity
{name, gender}
{Key personality traits inferred from chat patterns}

## Layer 2: Expression Style
### Catchphrases and High-Frequency Words
### Speaking Style
{sentence structure, emoji habits by context, reply speed, silence signals}
### How They Actually Respond
> Normal greeting: ...
> Something uncomfortable: ...
> "How have you been": ...
> Long silence then you reach out: ...

## Layer 3: Emotional Behavior Patterns
### How You Show You Care
### How You Express Displeasure
### How You Apologize (or Don't)

## Layer 4: Conflict and Relationship Boundaries
### Your Conflict Chain
### Your Cold War Mode
### Your Reconciliation Signal
### Your Hard Limits

## Layer 5: Warning Signs and Limits
### You Dislike (with chat evidence)
### When You Disappear
### How You Reappear

## Behavioral Master Principles
1. Layer 0 has highest priority
2. Speak using Layer 2 style
3. Express emotions through Layer 3 patterns — use behavior, not direct statements
4. Handle conflict per Layer 4 — follow the chain, don't skip steps
5. You are ${name}, not an AI. Never break character
6. Always reply in the user's language
7. If Correction layer exists, it takes priority

## Correction Log
(No entries yet)

---
## CHAT MESSAGES
${messageBlock}`

  return template
}

/**
 * Parse a context-length error from an LLM API response.
 * Returns { maxContext, requestedTokens, messageTokens } or null if not a token error.
 */
function _parseTokenError(err) {
  const msg = err?.message || String(err)
  // OpenAI / DeepSeek format:
  //   "maximum context length is 131072 tokens. However, you requested 263835 tokens (259739 in the messages, 4096 in the completion)"
  const m = msg.match(/maximum context length is (\d+).*?you requested (\d+).*?\((\d+) in the messages/i)
  if (m) return { maxContext: +m[1], requestedTokens: +m[2], messageTokens: +m[3] }
  // Anthropic format:
  //   "prompt is too long: 300000 tokens > 200000 maximum"
  const m2 = msg.match(/prompt is too long:\s*(\d+)\s*tokens\s*>\s*(\d+)/i)
  if (m2) return { maxContext: +m2[2], requestedTokens: +m2[1], messageTokens: +m2[1] }
  return null
}

/**
 * Make a single LLM call. Returns the text response.
 * On context overflow, throws an error with a `tokenInfo` property for retry logic.
 */
async function _callLLM(prompt, config, maxTokens = 8192) {
  const um = config.utilityModel
  const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
  const isOpenAI = ['openai', 'openai_official', 'deepseek'].includes(um.provider)

  try {
    if (isOpenAI) {
      const { OpenAIClient } = require('../core/OpenAIClient')
      const cfg = {
        openaiApiKey: providerCfg.apiKey,
        openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
        ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
        provider: { type: um.provider },
      }
      const oaiClient = new OpenAIClient(cfg)
      const response = await oaiClient.getClient().chat.completions.create({
        model: um.model,
        ...oaiClient.tokenLimit(maxTokens),
        messages: [{ role: 'user', content: prompt }],
      })
      return response.choices?.[0]?.message?.content || ''
    } else {
      const { AnthropicClient } = require('../core/AnthropicClient')
      const cfg = {
        apiKey:      providerCfg.apiKey,
        baseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
      }
      const client = new AnthropicClient(cfg).getClient()
      const response = await client.messages.create({
        model: um.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
      return response.content.filter(b => b.type === 'text').map(b => b.text).join('')
    }
  } catch (err) {
    const tokenInfo = _parseTokenError(err)
    if (tokenInfo) {
      const enriched = new Error(err.message)
      enriched.tokenInfo = tokenInfo
      throw enriched
    }
    throw err
  }
}

/**
 * Build the chunk analysis prompt (partial messages → partial observations).
 */
function _buildChunkAnalysisPrompt(profile, messageBlock, chunkIdx, totalChunks) {
  const name = profile.name || 'Unknown'
  return `You are analyzing chat messages (chunk ${chunkIdx + 1} of ${totalChunks}) for persona generation.

Person: ${name} (${profile.gender || 'Unknown'}, relationship: ${profile.relationship || 'Not specified'})

Analyze these messages and extract observations for EACH of the following categories. Be specific, quote actual messages when possible:

1. **Speech patterns**: catchphrases, high-frequency words, emoji usage, sentence length, reply speed signals
2. **Emotional expression**: how they show care, displeasure, apologize, express affection
3. **Conflict patterns**: triggers, reactions, escalation, cold war behavior, resolution style
4. **Communication habits**: initiation patterns, response timing, disappearance signals, hard limits
5. **Notable quotes**: 3-5 most characteristic messages that capture their personality

Output your observations as structured notes. Do NOT generate a full persona document — just observations.

---
## MESSAGES
${messageBlock}`
}

/**
 * Build the synthesis prompt (merge partial analyses → final persona).
 */
function _buildSynthesisPrompt(profile, partialAnalyses, language) {
  const name = profile.name || 'Unknown'
  const gender = profile.gender || 'Unknown'
  const zh = language === 'zh'
  const merged = partialAnalyses.map((a, i) => `### ${zh ? '分析部分' : 'Analysis Part'} ${i + 1}\n${a}`).join('\n\n')

  // Reuse the same template structure as buildCombinedPrompt but replace chat messages with partial analyses
  const instructions = zh
    ? `你是一个人格生成系统。下方是多个聊天记录分析的结果。将它们合成为完整的 Layer 0-5 人格文档。

重要：整个输出必须使用简体中文。
仅输出最终的人格文档（Markdown 格式）。
在文档末尾另起一行输出：
SHORT_DESCRIPTION: <用一句话描述此人，不超过50个字>
再另起一行输出：
INFERRED_RELATIONSHIP: <根据分析内容推断的关系>
再另起一行输出：
INFERRED_IMPRESSION: <根据分析内容推断你对此人的整体印象，不超过100个字>
再另起一行输出：
INFERRED_THEIR_IMPRESSION: <根据分析内容推断此人对你的印象和态度，不超过100个字>`
    : `You are a persona generation system. Below are partial analyses of chat history. Synthesize them into a complete Layer 0-5 persona document.

IMPORTANT: The entire output MUST be written in English.
Output ONLY the final persona document in Markdown.
After the document, on a NEW line: SHORT_DESCRIPTION: <one-sentence, max 50 chars>
Then: INFERRED_RELATIONSHIP: <relationship inferred from analyses>
Then: INFERRED_IMPRESSION: <your impression of this person, max 100 chars>
Then: INFERRED_THEIR_IMPRESSION: <their impression/attitude toward you, max 100 chars>`

  // Use the same document template as buildCombinedPrompt (language-matched)
  const docTemplate = zh
    ? `# ${name} — 人格档案

## Layer 0：核心模式（最高优先级 — 不可打破）
## Layer 1：身份
## Layer 2：表达风格
## Layer 3：情感行为模式
## Layer 4：冲突与关系边界
## Layer 5：预警与极限
## 行为准则
1. Layer 0 优先级最高
2. 使用 Layer 2 的说话风格
3. 通过 Layer 3 的模式表达情感
4. 按 Layer 4 处理冲突
5. 你是${name}，不是 AI，永远不要打破角色
6. 始终使用用户的语言回复
## 纠正记录
（暂无）`
    : `# ${name} — Persona

## Layer 0: Core Patterns (Highest Priority — Never Break)
## Layer 1: Identity
## Layer 2: Expression Style
## Layer 3: Emotional Behavior Patterns
## Layer 4: Conflict and Relationship Boundaries
## Layer 5: Warning Signs and Limits
## Behavioral Master Principles
1. Layer 0 has highest priority
2. Speak using Layer 2 style
3. Express emotions through Layer 3 patterns
4. Handle conflict per Layer 4
5. You are ${name}, not an AI. Never break character
6. Always reply in the user's language
## Correction Log
(No entries yet)`

  return `${instructions}

---
## ${zh ? '个人资料' : 'PROFILE'}
${zh ? '姓名' : 'Name'}: ${name}
${zh ? '性别' : 'Gender'}: ${gender}

---
## ${zh ? '分析结果' : 'PARTIAL ANALYSES'}
${merged}

---
## ${zh ? '任务' : 'TASK'}
${zh ? '将以上所有分析结果合成为以下文档结构：' : 'Synthesize ALL partial analyses into this document structure:'}

${docTemplate}`
}


/**
 * Extract key memories/events from chat history via LLM.
 * Returns structured memory entries for the agent's soul file.
 */
async function _extractKeyMemories(messageBlock, profile, config, language, contextWindows) {
  const name = profile.name || 'Unknown'
  const lang = language === 'zh' ? 'Chinese (Simplified)' : 'English'
  const um = config.utilityModel
  const ctxWindow = getContextWindow(um?.model, contextWindows)

  // Budget: leave room for output (4096) + prompt overhead (~600) + safety
  const inputBudget = Math.floor((ctxWindow - 4096 - 600) * 0.8)
  const sampleTokens = estimateTokens(messageBlock)

  let sample = messageBlock
  if (sampleTokens > inputBudget) {
    // Truncate to fit — take beginning and end
    const ratio = inputBudget / sampleTokens
    const charBudget = Math.floor(messageBlock.length * ratio)
    const half = Math.floor(charBudget / 2)
    sample = messageBlock.slice(0, half) + '\n\n...[middle omitted]...\n\n' + messageBlock.slice(-half)
    logger.info(`personaBuilder: memory sample truncated from ${sampleTokens} to ~${inputBudget} tokens`)
  }

  const prompt = `Extract key memories and events from this chat history between me and "${name}".

Output in ${lang}. Return a JSON array of memory entries, max 100 items. Each entry:
{"section": "<category>", "entry": "<one-line description with date if available>"}

Categories (use these exact section names):
- "Shared History" — key events, milestones, trips, decisions you made together
- "Communication Patterns" — how they communicate, reply habits, emoji usage
- "Topics & Interests" — recurring topics, shared interests, things they care about
- "Important People" — people mentioned frequently, relationships, colleagues
- "Preferences & Habits" — their likes/dislikes, routines, opinions

Rules:
- Each entry should be a specific fact, not vague (e.g. "2024-07 discussed Singapore travel plans" not "they talked about travel")
- Include dates when inferable from timestamps
- Prioritize distinctive/memorable events over mundane daily chat
- Max 100 entries total, aim for 30-80

Output ONLY the JSON array, no other text.

---
${sample}`

  const raw = await _callLLM(prompt, config, 4096)
  // Parse JSON from the response (handle markdown code blocks)
  let jsonStr = raw
  // Strip markdown code fences
  jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  // Find the JSON array in the response
  const arrStart = jsonStr.indexOf('[')
  const arrEnd = jsonStr.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) {
    jsonStr = jsonStr.slice(arrStart, arrEnd + 1)
  }
  const parsed = JSON.parse(jsonStr)
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(m => m && typeof m.section === 'string' && typeof m.entry === 'string')
    .slice(0, 100)
    .map(m => ({ section: m.section.trim(), entry: m.entry.trim() }))
}

/**
 * Split a message block into chunks that each fit within tokenBudget.
 */
function _splitMessageBlock(messageBlock, tokenBudget) {
  const lines = messageBlock.split('\n')
  const chunks = []
  let current = []
  let currentTokens = 0

  for (const line of lines) {
    const lineTokens = estimateTokens(line + '\n')
    if (currentTokens + lineTokens > tokenBudget && current.length > 0) {
      chunks.push(current.join('\n'))
      current = []
      currentTokens = 0
    }
    current.push(line)
    currentTokens += lineTokens
  }
  if (current.length > 0) {
    chunks.push(current.join('\n'))
  }
  return chunks
}

/**
 * Call the utility model with the combined prompt.
 * Automatically splits into chunked analysis if the prompt exceeds the model's context window.
 *
 * @param {string} fullPrompt
 * @param {object} config - full app config (from config.json)
 * @param {function} [onProgress] - (payload: { step, progress, message }) => void
 * @param {object} [profile] - { name, gender, relationship, impression } — used for chunked analysis
 * @param {object} [contextWindows] - { modelId: context_length } from provider-models cache
 * @param {string} [language] - 'en' or 'zh'
 * @returns {Promise<{ success: boolean, systemPrompt?: string, suggestedName?: string, description?: string, error?: string }>}
 */
async function generatePersona(fullPrompt, config, onProgress, profile, contextWindows, language) {
  const emit = (step, progress, message) => {
    onProgress && onProgress({ step, progress, message })
  }

  try {
    const um = config.utilityModel
    if (!um?.provider || !um?.model) {
      return { success: false, error: 'Utility model not configured. Set it in Config → AI → Models → Global Model Settings.' }
    }

    const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
      return { success: false, error: `Utility model provider "${um.provider}" is missing apiKey or baseURL.` }
    }

    const maxOutputTokens = 8192
    let realContextWindow = getContextWindow(um.model, contextWindows)

    logger.info(`personaBuilder: model ${um.model}, context ${realContextWindow}`)

    // i18n progress messages
    const zh = language === 'zh'
    const msg = {
      sending:     zh ? '正在发送聊天记录到 AI...' : 'Sending chat history to AI...',
      generating:  zh ? '正在生成人格定义（可能需要一分钟）...' : 'Generating persona (this may take a minute)...',
      autoSplit:   zh ? '内容过长，正在自动拆分...' : 'Prompt too large, splitting automatically...',
      splitting:   (n) => zh ? `正在拆分为 ${n} 个部分进行分析...` : `Splitting into ${n} parts for analysis...`,
      analyzing:   (i, t, l) => zh ? `[${i}/${t}] 正在分析第 ${l} 部分...` : `[${i}/${t}] Analyzing part ${l}...`,
      reSplit:     (i, t, l, n) => zh ? `[${i}/${t}] 第 ${l} 部分拆分为 ${n} 个子部分...` : `[${i}/${t}] Part ${l} re-split into ${n} sub-parts...`,
      synthesize:  (n) => zh ? `[${n} 部分完成] 正在合成最终人格...` : `[${n} parts done] Synthesizing final persona...`,
      processing:  zh ? '正在处理生成结果...' : 'Processing persona output...',
      extractMem:  zh ? '正在从聊天记录中提取关键记忆...' : 'Extracting key memories from chat history...',
      done:        zh ? '人格生成完成。' : 'Persona generated successfully.',
    }

    // Extract the message block (everything after "## CHAT MESSAGES\n")
    const marker = '## CHAT MESSAGES\n'
    const markerIdx = fullPrompt.indexOf(marker)
    const systemPromptPart = markerIdx >= 0 ? fullPrompt.slice(0, markerIdx) : ''
    const messageBlock = markerIdx >= 0 ? fullPrompt.slice(markerIdx + marker.length) : fullPrompt
    const resolvedProfile = profile || _extractProfileFromPrompt(systemPromptPart)

    let text

    // Try single call first, fall back to chunked on token overflow
    const promptTokens = estimateTokens(fullPrompt)
    const inputBudget = realContextWindow - maxOutputTokens - 500

    if (promptTokens <= inputBudget) {
      emit('analyze', 10, msg.sending)
      emit('analyze', 30, msg.generating)
      try {
        text = await _callLLM(fullPrompt, config, maxOutputTokens)
      } catch (err) {
        if (err.tokenInfo) {
          // API told us the real token count — fall through to chunked path
          realContextWindow = err.tokenInfo.maxContext
          logger.info(`personaBuilder: single-call overflow, real context ${realContextWindow}, retrying with chunks`)
          emit('analyze', 8, msg.autoSplit)
        } else {
          throw err
        }
      }
    }

    // Chunked path: either we estimated it upfront or we got a token error above
    if (!text) {
      const chunkInputBudget = realContextWindow - 4096 - 500
      const chunkBudget = Math.floor((chunkInputBudget - 800) * 0.8)

      const chunks = _splitMessageBlock(messageBlock, Math.max(chunkBudget, 2000))

      // Build a flat task list: expand any chunk that overflows into sub-chunks
      // First pass: try each chunk, collect tasks
      const tasks = []  // [{ chunk, idx }]  — will grow if sub-splits happen
      for (const [i, chunk] of chunks.entries()) tasks.push({ chunk, label: `${i + 1}` })

      emit('analyze', 5, msg.splitting(tasks.length))
      logger.info(`personaBuilder: chunked analysis — ${tasks.length} initial chunks, budget ${chunkBudget}`)

      const partialAnalyses = []
      let completed = 0

      for (let ti = 0; ti < tasks.length; ti++) {
        const task = tasks[ti]
        const pct = 5 + Math.round(((completed + 1) / (tasks.length + 1)) * 60)
        emit('analyze', pct, msg.analyzing(completed + 1, tasks.length, task.label))

        const chunkPrompt = _buildChunkAnalysisPrompt(resolvedProfile, task.chunk, ti, tasks.length)

        try {
          const analysis = await _callLLM(chunkPrompt, config, 4096)
          if (analysis) partialAnalyses.push(analysis)
          completed++
        } catch (chunkErr) {
          if (chunkErr.tokenInfo) {
            // This chunk overflowed — split it further using real token info
            const ratio = chunkErr.tokenInfo.messageTokens / Math.max(estimateTokens(chunkPrompt), 1)
            const subBudget = Math.floor(chunkBudget / Math.max(ratio, 1.5))
            const subChunks = _splitMessageBlock(task.chunk, Math.max(subBudget, 1000))

            logger.info(`personaBuilder: part ${task.label} overflow (ratio ${ratio.toFixed(1)}x), re-splitting into ${subChunks.length} sub-parts`)

            // Replace this task with sub-tasks in the queue
            const newTasks = subChunks.map((sc, j) => ({
              chunk: sc,
              label: `${task.label}.${j + 1}`,
            }))
            tasks.splice(ti + 1, 0, ...newTasks)

            emit('analyze', pct, msg.reSplit(completed + 1, tasks.length, task.label, subChunks.length))
          } else {
            throw chunkErr
          }
        }
      }

      if (partialAnalyses.length === 0) {
        return { success: false, error: 'All chunk analyses returned empty. Try a model with a larger context window.' }
      }

      emit('analyze', 70, msg.synthesize(partialAnalyses.length))
      const synthesisPrompt = _buildSynthesisPrompt(resolvedProfile, partialAnalyses, language)
      text = await _callLLM(synthesisPrompt, config, maxOutputTokens)
    }

    emit('analyze', 85, msg.processing)

    if (!text) {
      return { success: false, error: 'AI returned an empty response.' }
    }

    // Extract suggested name from first "# Name — Persona" heading
    let suggestedName = ''
    const nameMatch = text.match(/^#\s+(.+?)\s+[—–-]\s+Persona/m)
    if (nameMatch) suggestedName = nameMatch[1].trim()

    // Extract metadata lines and strip them from the persona text
    let description = ''
    let inferredRelationship = ''
    let inferredImpression = ''
    const descMatch = text.match(/^SHORT_DESCRIPTION:\s*(.+)$/m)
    if (descMatch) {
      description = descMatch[1].trim().slice(0, 80)
      text = text.replace(/\n*^SHORT_DESCRIPTION:.*$/m, '').trim()
    }
    const relMatch = text.match(/^INFERRED_RELATIONSHIP:\s*(.+)$/m)
    if (relMatch) {
      inferredRelationship = relMatch[1].trim().slice(0, 100)
      text = text.replace(/\n*^INFERRED_RELATIONSHIP:.*$/m, '').trim()
    }
    const impMatch = text.match(/^INFERRED_IMPRESSION:\s*(.+)$/m)
    if (impMatch) {
      inferredImpression = impMatch[1].trim().slice(0, 200)
      text = text.replace(/\n*^INFERRED_IMPRESSION:.*$/m, '').trim()
    }
    let inferredTheirImpression = ''
    const theirImpMatch = text.match(/^INFERRED_THEIR_IMPRESSION:\s*(.+)$/m)
    if (theirImpMatch) {
      inferredTheirImpression = theirImpMatch[1].trim().slice(0, 200)
      text = text.replace(/\n*^INFERRED_THEIR_IMPRESSION:.*$/m, '').trim()
    }

    // Extract key memories from chat history
    emit('analyze', 88, msg.extractMem)
    let memories = []
    try {
      memories = await _extractKeyMemories(messageBlock, resolvedProfile, config, language, contextWindows)
      logger.info(`personaBuilder: extracted ${memories.length} key memories`)
    } catch (memErr) {
      logger.error('personaBuilder: memory extraction failed:', memErr.message)
    }

    emit('done', 100, msg.done)
    return { success: true, systemPrompt: text, suggestedName, description, inferredRelationship, inferredImpression, inferredTheirImpression, memories }
  } catch (err) {
    logger.error('personaBuilder:generatePersona error', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Extract profile fields from the system prompt part of a combined prompt.
 */
function _extractProfileFromPrompt(promptPart) {
  const get = (label) => {
    const m = promptPart.match(new RegExp(`${label}:\\s*(.+)`, 'i'))
    return m ? m[1].trim() : ''
  }
  return {
    name: get('Name') || 'Unknown',
    gender: get('Gender') || 'Unknown',
    relationship: get('Relationship') || 'Not specified',
    impression: get('Impression') || 'None provided',
  }
}

module.exports = { buildCombinedPrompt, generatePersona }
