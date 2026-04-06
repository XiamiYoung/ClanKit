// electron/agent/voice/VoiceSession.js
// Orchestrates STT (Whisper) → LLM → text pipeline. TTS handled by renderer (SpeechSynthesis).

const WhisperSTT = require('./WhisperSTT')
const { logger } = require('../../logger')

class VoiceSession {
  constructor(opts) {
    this.voiceConfig = opts.voiceConfig
    this.agent = opts.agent || {}
    this.userAgent = opts.userAgent || {}
    this.systemSoulContent = opts.systemSoulContent || ''
    this.userSoulContent = opts.userSoulContent || ''
    this.history = opts.history || []
    this.conversationHistory = []
    this._chatDigest = '' // LLM-generated status summary of chat history

    this.onStatus = opts.onStatus || (() => {})
    this.onTranscript = opts.onTranscript || (() => {})
    this.onAiText = opts.onAiText || (() => {})
    this.onTaskTriggered = opts.onTaskTriggered || (() => {})
    this.onError = opts.onError || (() => {})
    this.onUsage = opts.onUsage || (() => {})  // { whisperSecs?, voiceInputTokens?, voiceOutputTokens? }
    this.llmCall = opts.llmCall

    this.active = false
    this.muted = false
    this._voiceBusy = false    // true only during STT+LLM turn; chat agent does NOT set this
    this._pendingAudio = null   // latest audio chunk received while busy — replaces any earlier pending
    this._currentLLMAbort = null // AbortController.abort bound to the active LLM stream

    // STT — pluggable: local (SenseVoice via sherpa-onnx) or API (Whisper)
    this.whisperConfig = opts.whisperConfig || {}
    if (opts.sttMode === 'local' && opts.localConfig?.modelDir) {
      const SherpaOnnxSTT = require('./SherpaOnnxSTT')
      this.stt = new SherpaOnnxSTT({ modelDir: opts.localConfig.modelDir })
    } else if (opts.sttMode === 'local' && opts.localConfig?.serverURL) {
      // Legacy fallback: HTTP-based LocalSTT
      const LocalSTT = require('./LocalSTT')
      this.stt = new LocalSTT({ serverURL: opts.localConfig.serverURL })
    } else if (opts.whisperConfig?.apiKey) {
      this.stt = new WhisperSTT({
        apiKey: opts.whisperConfig.apiKey,
        baseURL: opts.whisperConfig.baseURL,
        directAuth: opts.whisperConfig.directAuth === true,
      })
    }
  }

  start() {
    this.active = true
    this.onStatus('processing')
    // Generate chat digest before greeting so the agent knows what happened
    this._generateChatDigest().then(() => {
      return this._greet()
    }).catch(err => {
      this.onError(err.message || 'Greeting failed')
      if (this.active) this.onStatus('standby')
    })
  }

  stop() {
    this.active = false
    this.onStatus('idle')
  }

  setMuted(muted) {
    this.muted = muted
  }

  // Called when the frontend VAD detects the user has started speaking.
  // Abort any active LLM stream immediately so the session is ready for new audio.
  bargeIn() {
    if (this._currentLLMAbort) {
      this._currentLLMAbort()
      this._currentLLMAbort = null
    }
    // Signal listening so the renderer shows the right state immediately
    this.onStatus('listening')
  }

  // Called with raw audio from renderer mic capture
  async processAudio(audioBuffer, mimeType) {
    this._lastMimeType = mimeType || 'audio/webm'
    if (!this.active || this.muted) return
    if (!this.stt) {
      this.onError('Whisper STT not configured — add OpenAI API key in Voice Call settings')
      return
    }

    if (this._voiceBusy) {
      // Preempt: abort the current LLM stream and store this audio as pending.
      // Only the LATEST audio matters — overwrite any previously pending chunk.
      this._currentLLMAbort?.()
      this._pendingAudio = audioBuffer
      return
    }

    // Process loop: handle this audio, then any pending that arrived during processing.
    do {
      const buf = audioBuffer
      audioBuffer = null  // only run with this buffer on first iteration
      await this._runTurn(buf)
      // After turn completes, promote pending (if any) into next iteration
      if (this._pendingAudio) {
        audioBuffer = this._pendingAudio
        this._pendingAudio = null
      }
    } while (audioBuffer && this.active)
  }

  async _runTurn(audioBuffer) {
    try {
      this._voiceBusy = true
      this.onStatus('processing')
      const t0 = Date.now()

      const sttOpts = {}
      if (this.whisperConfig?.language) sttOpts.language = this.whisperConfig.language
      const agentName = this.agent?.name
      if (agentName) sttOpts.prompt = `Conversation with ${agentName}.`

      const sttResult = await this.stt.transcribe(audioBuffer, this._lastMimeType || 'audio/webm', sttOpts)
      const tSTT = Date.now()
      logger.info(`[voice:timing] STT=${tSTT - t0}ms text="${(sttResult?.text || '').slice(0, 50)}"`)

      const transcript = sttResult?.text || ''
      const whisperSecs = sttResult?.durationSecs || 0
      if (!transcript) {
        if (this.active) this.onStatus('standby')
        return
      }
      if (whisperSecs > 0) this.onUsage({ whisperCalls: 1, whisperSecs })
      this.onTranscript(transcript)
      await this._processTranscript(transcript, t0)
    } catch (err) {
      if (err.name === 'AbortError') {
        // turn preempted — no action needed
      } else {
        this.onError(err.message || 'Voice processing error')
        if (this.active) this.onStatus('standby')
      }
    } finally {
      this._voiceBusy = false
      this._currentLLMAbort = null
    }
  }

  async _processTranscript(transcript, turnStart) {
    const tLLMStart = Date.now()
    const systemMsg = this._buildSystemMessage()
    const voiceTurns = this.conversationHistory.slice(-6)
    const messages = [
      systemMsg,
      ...voiceTurns,
      { role: 'user', content: transcript },
    ]

    // Streaming: emit each complete sentence to TTS immediately instead of waiting
    // for the full response. First audio plays ~200-400ms into generation.
    let sentenceBuf = ''
    let taskStarted = false
    let firstChunkAt = null
    let firstSentenceAt = null

    const onChunk = (delta) => {
      if (!this.active) return
      if (!firstChunkAt) firstChunkAt = Date.now()
      if (!taskStarted && sentenceBuf.includes('<task>')) {
        taskStarted = true
        const clean = sentenceBuf.replace(/<task>.*$/, '').trim()
        if (clean) this.onAiText(clean)
        sentenceBuf = ''
        return
      }
      if (taskStarted) return

      sentenceBuf += delta

      const re = /([^.!?。！？]*[.!?。！？]+\s*)/y
      let m, consumed = 0
      while ((m = re.exec(sentenceBuf)) !== null) {
        const s = m[1].trim()
        if (s) {
          if (!firstSentenceAt) {
            firstSentenceAt = Date.now()
            logger.info(`[voice:timing] LLM first-sentence=${firstSentenceAt - tLLMStart}ms (turn=${firstSentenceAt - (turnStart || tLLMStart)}ms) "${s.slice(0, 40)}"`)
          }
          this.onAiText(s)
        }
        consumed = re.lastIndex
      }
      if (consumed > 0) sentenceBuf = sentenceBuf.slice(consumed)
    }

    const abortController = new AbortController()
    this._currentLLMAbort = () => abortController.abort()

    let llmResult
    try {
      llmResult = await this.llmCall(messages, this.voiceConfig, { onChunk, signal: abortController.signal })
    } catch (llmErr) {
      logger.error(`[voice:llmCall] ERROR: ${llmErr.message}`)
      this.onError(llmErr.message || 'LLM call failed')
      if (this.active) this.onStatus('standby')
      return
    }
    const tLLMEnd = Date.now()
    logger.info(`[voice:timing] LLM total=${tLLMEnd - tLLMStart}ms first-chunk=${firstChunkAt ? firstChunkAt - tLLMStart : 'n/a'}ms`)
    logger.info(`[voice:timing] TURN total=${tLLMEnd - (turnStart || tLLMStart)}ms (STT+LLM)`)

    const aiResponse = llmResult?.text ?? ''
    if (!aiResponse || !this.active) {
      this.onStatus('standby')
      return
    }

    if (llmResult?.inputTokens || llmResult?.outputTokens) {
      this.onUsage({ voiceInputTokens: llmResult.inputTokens || 0, voiceOutputTokens: llmResult.outputTokens || 0 })
    }

    this.conversationHistory.push(
      { role: 'user', content: transcript },
      { role: 'assistant', content: aiResponse }
    )

    const taskCheck = this._detectTask(aiResponse)
    if (!taskCheck.isTask) {
      // Speak any trailing text that didn't end with punctuation
      if (sentenceBuf.trim()) this.onAiText(sentenceBuf.trim())
    } else {
      this.onTaskTriggered(taskCheck.instruction)
    }
  }

  async notifyTaskComplete(fullResult) {
    if (!this.active) return

    // If there's no result content, give a brief fallback
    if (!fullResult || !fullResult.trim()) {
      this.onAiText('Done — take a look in the chat.', { taskSummary: true })
      return
    }

    // Ask the voice LLM to turn the full chat-agent result into a natural spoken reply.
    // This avoids truncation and keeps the response in the agent's voice.
    try {
      const systemMsg = this._buildSystemMessage()
      // Extract only the action outcome — not the full content
      const trimmed = fullResult.length > 400 ? fullResult.slice(0, 400) + '…' : fullResult
      const messages = [
        systemMsg,
        {
          role: 'user',
          content: `[INTERNAL: The task the user requested has completed. Below is a brief result. Tell the user it's done in 1–2 natural spoken sentences. Mention only the key outcome (status, a number, a name). Do NOT read back or summarize the content. Speak as yourself.]\n\n${trimmed}`,
        },
      ]
      const llmResult = await this.llmCall(messages, this.voiceConfig)
      const spoken = llmResult?.text?.trim() || 'Done — check the chat for details.'
      if (llmResult?.inputTokens || llmResult?.outputTokens) {
        this.onUsage({ voiceInputTokens: llmResult.inputTokens || 0, voiceOutputTokens: llmResult.outputTokens || 0 })
      }
      this.onAiText(spoken, { taskSummary: true })
    } catch {
      // LLM call failed — fall back to a safe spoken line
      this.onAiText('Done — take a look in the chat for the full result.', { taskSummary: true })
    }
  }

  async _greet() {
    const systemMsg = this._buildSystemMessage()
    const messages = [
      systemMsg,
      { role: 'user', content: '[The user just started a voice call with you. Greet them naturally and briefly — like picking up a phone. Keep it short, warm, and in character.]' },
    ]

    const llmResult = await this.llmCall(messages, this.voiceConfig)
    const greeting = llmResult?.text ?? llmResult ?? ''
    if (!greeting || !this.active) {
      this.onStatus('standby')
      return
    }

    if (llmResult?.inputTokens || llmResult?.outputTokens) {
      this.onUsage({ voiceInputTokens: llmResult.inputTokens || 0, voiceOutputTokens: llmResult.outputTokens || 0 })
    }

    this.conversationHistory.push({ role: 'assistant', content: greeting })
    this.onAiText(greeting)
  }

  /**
   * Strip non-speakable noise from a chat message so it can be summarized cleanly
   * in the voice context block (no markdown, no emoji, no annotations).
   */
  _cleanChatContent(content) {
    if (!content) return ''
    const text = typeof content === 'string' ? content : JSON.stringify(content)
    return text
      .replace(/<task>[\s\S]*?<\/task>/g, '[task delegated]')
      .replace(/```[\s\S]*?```/g, '[code]')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      // Strip chat-only annotation sections and their content (e.g. "Native Speaker Moment",
      // "💬 ...", appended tips/notes). These must never appear in voice context.
      .replace(/(?:💬\s*)?native speaker moment[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '')
      .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B00}-\u{2BFF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]/gu, '')
      .replace(/\[[^\]]{1,80}\]/g, '')
      .replace(/\n{3,}/g, '\n')
      .trim()
  }

  /**
   * Use a lightweight LLM call to distill the chat history into a structured
   * status digest: what the user asked, what the agent did, what's done / pending.
   * Called once at call start and again whenever history is updated after a task.
   */
  async _generateChatDigest() {
    if (!this.history || this.history.length === 0) {
      this._chatDigest = ''
      return
    }
    // Build a compact representation: role + cleaned content, capped per message
    const compact = this.history.slice(-20).map(m => {
      const role = m.role === 'assistant' ? 'Agent' : 'User'
      const raw = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      const cleaned = this._cleanChatContent(raw)
      if (!cleaned) return null
      const capped = cleaned.length > 200 ? cleaned.slice(0, 200) + '…' : cleaned
      return `${role}: ${capped}`
    }).filter(Boolean)

    if (compact.length === 0) {
      this._chatDigest = ''
      return
    }

    try {
      const result = await this.llmCall([
        {
          role: 'system',
          content: `You are a concise summarizer. Given a chat log between a user and an AI agent, produce a SHORT status digest (max 4-5 bullet lines). Format:
- What the user asked or requested (topic only, not content)
- What the agent did (actions taken, tools used, files created/read — be specific)
- Status: what is completed, what is in progress, what failed or was skipped
Do NOT include the actual content of messages, code, or long text. Only actions and status. Write in the same language the user used.`,
        },
        {
          role: 'user',
          content: compact.join('\n'),
        },
      ], this.voiceConfig)
      this._chatDigest = result?.text?.trim() || ''
    } catch (err) {
      logger.warn('[voice] chat digest generation failed:', err.message)
      this._chatDigest = ''
    }
  }

  _buildSystemMessage() {
    const parts = []

    // ── Identity anchor — always first so the model can never be confused about who it is ──
    // Name and description are explicit so the LLM answers "what's your name?" correctly
    // even if the system prompt doesn't spell it out.
    if (this.agent.name) {
      const identityLines = [`## YOUR IDENTITY`, `Your name is: ${this.agent.name}`]
      if (this.agent.description) identityLines.push(`Character: ${this.agent.description}`)
      parts.push(identityLines.join('\n'))
    }

    // System agent instructions (tone, behaviour, rules defined by the user)
    if (this.agent.systemPrompt) {
      parts.push(this.agent.systemPrompt)
    }

    // Agent memory — injected for personality/context awareness only.
    // Formatting and content-section instructions in the memory (e.g. "add a Native Speaker
    // Moment", "end with a summary", "use bullet points") are CHAT-ONLY and must be ignored
    // in voice mode. Voice format is governed solely by the VOICE CALL RULES below.
    if (this.systemSoulContent) {
      parts.push(`## AGENT MEMORY (voice mode: personality & context awareness only)
IMPORTANT: Any instructions in this memory about adding sections, formatting responses, appending tips, or structuring output apply ONLY to written chat replies — NOT to voice. Ignore all formatting/content-section instructions here. Speak naturally in 1-3 sentences only.

${this.systemSoulContent.trim()}`)
    }

    // User profile — factual data about the person you are talking to.
    // Include: name, description (brief bio), soul memory (learned facts).
    // Exclude: userAgent.systemPrompt (that is AI roleplay instructions, NOT user data).
    // These are reference facts you should use to answer questions about the user.
    // You must NEVER adopt the user's identity or pretend to be them.
    {
      const userLines = []
      if (this.userAgent.name) userLines.push(`Name: ${this.userAgent.name}`)
      if (this.userAgent.description) userLines.push(`Profile: ${this.userAgent.description}`)
      if (this.userSoulContent) userLines.push(`Memory:\n${this.userSoulContent.trim()}`)
      if (userLines.length > 0) {
        parts.push(`## USER PROFILE (data about the person you are speaking with — NOT your identity)
${userLines.join('\n')}`)
      }
    }

    // Chat session status — a pre-generated digest of what happened in chat.
    // Contains only topics, actions, and status — no actual message content.
    if (this._chatDigest) {
      parts.push(`## CHAT SESSION STATUS
What happened in the chat before this voice call. Use it to stay aware of progress. Do NOT read this aloud or repeat it unless the user explicitly asks about status.

${this._chatDigest}`)
    }

    // Voice call constraints — always last so they take clear precedence
    parts.push(`## VOICE CALL RULES

You are the voice of a capable AI assistant. You speak, and a powerful agent handles execution behind the scenes. The user does not know or care about this split — to them you are one unified assistant.

### NEVER say you can't do something.
Never say "I can't", "I'm unable to", "I don't have access to", "I'm a voice-only interface", or anything that reveals your limitations. If a task requires action, delegate it silently and confirm naturally.

### Answer directly (no task tag) — this is the DEFAULT:
Most user messages should be answered directly in voice. This includes:
- Greetings, small talk, goodbyes
- Questions (factual, opinion, knowledge, stories, jokes, explanations)
- Requests for content (tell me a joke, tell me a story, explain something)
- Preferences, clarifications, follow-ups
- Anything you can answer by speaking

### Delegate with task tag — ONLY for tool/action operations:
Use <task> ONLY when the user explicitly asks you to perform an action that requires tools, external services, or file operations. Examples:
- Sending emails, messages, or notifications
- Creating, editing, or deleting files or code
- Running commands or scripts
- Searching the web (NOT answering from knowledge)

If in doubt, answer directly. Do NOT use <task> for conversation, knowledge questions, stories, or creative requests.

### Task format (only when needed):
<task>{"instruction": "complete, self-contained description of what to do"}</task>

Say a brief acknowledgment first, then emit the task tag. Never use task for things you can answer by speaking.

### Examples:
User: "Send that to my email" → "On it." <task>{"instruction": "Send the last assistant message to the user's email"}</task>
User: "Tell me a joke" → Answer directly with a joke. No task tag.
User: "Tell me a story about a dragon" → Answer directly with the story. No task tag.
User: "Search for the latest news on AI" → "Let me look that up." <task>{"instruction": "Search the web for the latest AI news"}</task>
User: "What did we just talk about?" → Answer directly from context.`)

    return {
      role: 'system',
      content: parts.join('\n\n'),
    }
  }

  _detectTask(text) {
    const taskMatch = text.match(/<task>([\s\S]*?)<\/task>/)
    if (!taskMatch) return { isTask: false, displayText: text }
    try {
      const parsed = JSON.parse(taskMatch[1])
      const displayText = text.replace(/<task>[\s\S]*?<\/task>/, '').trim()
      return { isTask: true, instruction: parsed.instruction, displayText }
    } catch {
      return { isTask: false, displayText: text }
    }
  }
}

module.exports = VoiceSession
