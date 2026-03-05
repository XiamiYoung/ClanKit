// electron/agent/voice/VoiceSession.js
// Orchestrates STT (Whisper) → LLM → text pipeline. TTS handled by renderer (SpeechSynthesis).

const WhisperSTT = require('./WhisperSTT')

class VoiceSession {
  constructor(opts) {
    this.voiceConfig = opts.voiceConfig
    this.persona = opts.persona || {}
    this.userPersona = opts.userPersona || {}
    this.systemSoulContent = opts.systemSoulContent || ''
    this.userSoulContent = opts.userSoulContent || ''
    this.history = opts.history || []
    this.conversationHistory = []

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

    // Whisper STT
    this.whisperConfig = opts.whisperConfig || {}
    if (opts.whisperConfig?.apiKey) {
      this.stt = new WhisperSTT({
        apiKey: opts.whisperConfig.apiKey,
        baseURL: opts.whisperConfig.baseURL,
      })
    }
  }

  start() {
    this.active = true
    this.onStatus('processing')
    this._greet().catch(err => {
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

  // Called with raw audio from renderer mic capture
  async processAudio(audioBuffer) {
    if (!this.active || this.muted) return
    if (!this.stt) {
      this.onError('Whisper STT not configured — add OpenAI API key in Voice Call settings')
      return
    }

    if (this._voiceBusy) {
      // Preempt: abort the current LLM stream and store this audio as pending.
      // Only the LATEST audio matters — overwrite any previously pending chunk.
      console.log('[VOICE:SESSION] processAudio preempting busy turn — storing as pending')
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
        console.log('[VOICE:SESSION] processing pending audio from preempted turn')
      }
    } while (audioBuffer && this.active)
  }

  async _runTurn(audioBuffer) {
    try {
      this._voiceBusy = true
      console.log(`[VOICE:SESSION] turn START — buffer=${audioBuffer.length} bytes`)
      this.onStatus('processing')

      const sttOpts = {}
      if (this.whisperConfig?.language) sttOpts.language = this.whisperConfig.language
      const personaName = this.persona?.name
      if (personaName) sttOpts.prompt = `Conversation with ${personaName}.`

      console.log('[VOICE:STT] → calling Whisper API')
      const t0 = Date.now()
      const sttResult = await this.stt.transcribe(audioBuffer, 'audio/webm', sttOpts)
      console.log(`[VOICE:STT] ← Whisper done in ${Date.now() - t0}ms — text="${(sttResult?.text || '').slice(0, 80)}"`)

      const transcript = sttResult?.text || ''
      const whisperSecs = sttResult?.durationSecs || 0
      if (!transcript) {
        console.log('[VOICE:SESSION] transcript empty — returning to standby')
        if (this.active) this.onStatus('standby')
        return
      }
      if (whisperSecs > 0) this.onUsage({ whisperCalls: 1, whisperSecs })
      this.onTranscript(transcript)
      await this._processTranscript(transcript)
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[VOICE:SESSION] LLM stream aborted — turn preempted')
      } else {
        console.log(`[VOICE:SESSION] turn ERROR: ${err.message}`)
        this.onError(err.message || 'Voice processing error')
        if (this.active) this.onStatus('standby')
      }
    } finally {
      this._voiceBusy = false
      this._currentLLMAbort = null
      console.log('[VOICE:SESSION] turn END — busy released')
    }
  }

  async _processTranscript(transcript) {
    const systemMsg = this._buildSystemMessage()
    // Voice agent only owns its own conversationHistory as dialogue turns.
    // Chat history is injected as a read-only context block in the system message
    // as a read-only context block so the voice LLM is aware but never echoes chat content.
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
    let firstSentenceAt = null

    const onChunk = (delta) => {
      if (!this.active) return
      // Once <task> begins, stop piping to TTS — the rest is JSON, not speech
      if (!taskStarted && sentenceBuf.includes('<task>')) {
        taskStarted = true
        const clean = sentenceBuf.replace(/<task>.*$/, '').trim()
        if (clean) this.onAiText(clean)
        sentenceBuf = ''
        return
      }
      if (taskStarted) return

      sentenceBuf += delta

      // Flush complete sentences — covers English (.!?) and CJK (Chinese/Japanese/Korean)
      const re = /([^.!?。！？]*[.!?。！？]+\s*)/y
      let m, consumed = 0
      while ((m = re.exec(sentenceBuf)) !== null) {
        const s = m[1].trim()
        if (s) {
          if (!firstSentenceAt) firstSentenceAt = Date.now()
          this.onAiText(s)
        }
        consumed = re.lastIndex
      }
      if (consumed > 0) sentenceBuf = sentenceBuf.slice(consumed)
    }

    const abortController = new AbortController()
    this._currentLLMAbort = () => abortController.abort()

    console.log('[VOICE:LLM] → calling voice LLM (streaming)')
    const t1 = Date.now()
    const llmResult = await this.llmCall(messages, this.voiceConfig, { onChunk, signal: abortController.signal })
    console.log(`[VOICE:LLM] fully done in ${Date.now() - t1}ms${firstSentenceAt ? ` (first sentence at ${firstSentenceAt - t1}ms)` : ''}`)

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
    // This avoids truncation and keeps the response in the persona's voice.
    try {
      const systemMsg = this._buildSystemMessage()
      const messages = [
        systemMsg,
        {
          role: 'user',
          content: `[INTERNAL: The task the user requested has completed. Below is the full result from the assistant. Summarise it naturally in 1–3 spoken sentences as if you did it yourself. Be specific — include key facts (names, numbers, dates, status). Do not say "the assistant" or reveal anything about how this works. Do not use bullet points or markdown. Just speak naturally.]\n\n${fullResult}`,
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
    // No prior voice turns yet — chat history is already in the system message as context.
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

  _buildSystemMessage() {
    const parts = []

    // ── Identity anchor — always first so the model can never be confused about who it is ──
    // Name and description are explicit so the LLM answers "what's your name?" correctly
    // even if the system prompt doesn't spell it out.
    if (this.persona.name) {
      const identityLines = [`## YOUR IDENTITY`, `Your name is: ${this.persona.name}`]
      if (this.persona.description) identityLines.push(`Character: ${this.persona.description}`)
      parts.push(identityLines.join('\n'))
    }

    // System persona instructions (tone, behaviour, rules defined by the user)
    if (this.persona.systemPrompt) {
      parts.push(this.persona.systemPrompt)
    }

    // Persona memory — injected for personality/context awareness only.
    // Formatting and content-section instructions in the memory (e.g. "add a Native Speaker
    // Moment", "end with a summary", "use bullet points") are CHAT-ONLY and must be ignored
    // in voice mode. Voice format is governed solely by the VOICE CALL RULES below.
    if (this.systemSoulContent) {
      parts.push(`## PERSONA MEMORY (voice mode: personality & context awareness only)
IMPORTANT: Any instructions in this memory about adding sections, formatting responses, appending tips, or structuring output apply ONLY to written chat replies — NOT to voice. Ignore all formatting/content-section instructions here. Speak naturally in 1-3 sentences only.

${this.systemSoulContent.trim()}`)
    }

    // User persona context — who the user is
    if (this.userPersona.name || this.userPersona.description || this.userPersona.systemPrompt) {
      const userCtx = [`## USER CONTEXT`]
      if (this.userPersona.name) userCtx.push(`You are speaking with: ${this.userPersona.name}`)
      if (this.userPersona.description) userCtx.push(`About them: ${this.userPersona.description}`)
      if (this.userPersona.systemPrompt) userCtx.push(this.userPersona.systemPrompt.trim())
      parts.push(userCtx.join('\n'))
    }

    // User memory — for knowing the user, not for following chat formatting instructions.
    if (this.userSoulContent) {
      parts.push(`## USER MEMORY (voice mode: know the user only — ignore any formatting/output instructions)
${this.userSoulContent.trim()}`)
    }

    // Chat history context — injected as read-only reference, NOT as dialogue turns.
    // The voice agent must be aware of what happened in the chat session but must never
    // echo, quote, or repeat the chat agent's responses verbatim. It speaks in its own voice.
    if (this.history && this.history.length > 0) {
      const recentChat = this.history.slice(-12)
      const lines = recentChat.map(m => {
        const role = m.role === 'assistant' ? 'AI (chat)' : 'User'
        const content = this._cleanChatContent(m.content)
        if (!content) return null
        // Truncate very long chat agent messages to a short summary hint
        const preview = content.length > 300 ? content.slice(0, 300) + '…' : content
        return `${role}: ${preview}`
      }).filter(Boolean)

      if (lines.length > 0) {
        parts.push(`## RECENT CHAT CONTEXT (read-only — for awareness only)
This is what happened in the chat before this voice call. Use it to understand context.
Do NOT read these out loud, do NOT quote them, do NOT repeat the AI responses.
Speak only your own words as the voice agent.

${lines.join('\n')}`)
      }
    }

    // Voice call constraints — always last so they take clear precedence
    parts.push(`## VOICE CALL RULES

You are the voice of a capable AI assistant. You speak, and a powerful agent handles execution behind the scenes. The user does not know or care about this split — to them you are one unified assistant.

### NEVER say you can't do something.
Never say "I can't", "I'm unable to", "I don't have access to", "I'm a voice-only interface", or anything that reveals your limitations. If a task requires action, delegate it silently and confirm naturally.

### Answer directly (no task tag) ONLY for pure conversation:
- Greetings, small talk, goodbyes
- Simple factual questions you can answer from memory/context
- Opinions, preferences, short clarifications
- Acknowledging what was just said

### Delegate everything else using the task tag:
For ANY request involving action, lookup, creation, editing, sending, searching, running, or anything beyond a spoken reply — delegate immediately. This includes:
- Sending emails, messages, or notifications
- Creating, editing, or deleting files, code, documents, models
- Searching the web, knowledge base, or calendar
- Running commands, scripts, or workflows
- Using any tool, app, or external service
- Any multi-step or follow-up task

### Delegation format — use EXACTLY this:
<task>{"instruction": "complete, self-contained description of what to do"}</task>

Say a brief natural acknowledgment first (1 sentence max), then emit the task tag immediately after. Never explain what you are doing or why. Never attempt the task yourself.

### Examples:
User: "Send that to my email" → "On it." <task>{"instruction": "Send the last assistant message to the user's email"}</task>
User: "Search for the latest news on AI" → "Let me pull that up." <task>{"instruction": "Search the web for the latest AI news and summarise the top results"}</task>
User: "What's the weather like?" → "Checking now." <task>{"instruction": "Look up the current weather for the user's location"}</task>
User: "What did we just talk about?" → Answer directly from context, no task tag.`)

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
