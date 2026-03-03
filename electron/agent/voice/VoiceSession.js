// electron/agent/voice/VoiceSession.js
// Orchestrates STT (Whisper) → LLM → text pipeline. TTS handled by renderer (SpeechSynthesis).

const WhisperSTT = require('./WhisperSTT')

class VoiceSession {
  constructor(opts) {
    this.voiceConfig = opts.voiceConfig
    this.persona = opts.persona || {}
    this.history = opts.history || []
    this.conversationHistory = []

    this.onStatus = opts.onStatus || (() => {})
    this.onTranscript = opts.onTranscript || (() => {})
    this.onAiText = opts.onAiText || (() => {})
    this.onTaskTriggered = opts.onTaskTriggered || (() => {})
    this.onError = opts.onError || (() => {})
    this.llmCall = opts.llmCall

    this.active = false
    this.muted = false

    // Whisper STT
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
      if (this.active) this.onStatus('listening')
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

    try {
      this.onStatus('processing')
      const transcript = await this.stt.transcribe(audioBuffer)
      if (!transcript) {
        this.onStatus('listening')
        return
      }
      this.onTranscript(transcript)
      await this._processTranscript(transcript)
    } catch (err) {
      this.onError(err.message || 'Voice processing error')
      if (this.active) this.onStatus('listening')
    }
  }

  async _processTranscript(transcript) {
    const systemMsg = this._buildSystemMessage()
    // Keep context small — voice calls are conversational, not deep analysis.
    // Only send last 4 chat messages for awareness, last 6 voice turns for continuity.
    const historyContext = this.history.slice(-4).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }))
    const voiceTurns = this.conversationHistory.slice(-6)
    const messages = [
      systemMsg,
      ...historyContext,
      ...voiceTurns,
      { role: 'user', content: transcript },
    ]

    const aiResponse = await this.llmCall(messages, this.voiceConfig)
    if (!aiResponse || !this.active) {
      this.onStatus('listening')
      return
    }

    this.conversationHistory.push(
      { role: 'user', content: transcript },
      { role: 'assistant', content: aiResponse }
    )

    const taskCheck = this._detectTask(aiResponse)
    const displayText = taskCheck.displayText || aiResponse
    this.onAiText(displayText)

    if (taskCheck.isTask) {
      this.onTaskTriggered(taskCheck.instruction)
    }
    // Renderer speaks via SpeechSynthesis, then sets status to 'listening'
  }

  async notifyTaskComplete(summary) {
    if (!this.active) return
    this.onAiText(summary || 'Done! Take a look in the chat.')
  }

  async _greet() {
    const systemMsg = this._buildSystemMessage()
    // Minimal context for greeting — just last 2 messages for awareness
    const historyContext = this.history.slice(-2).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }))
    const messages = [
      systemMsg,
      ...historyContext,
      { role: 'user', content: '[The user just started a voice call with you. Greet them naturally and briefly — like picking up a phone. Keep it short, warm, and in character.]' },
    ]

    const greeting = await this.llmCall(messages, this.voiceConfig)
    if (!greeting || !this.active) {
      this.onStatus('listening')
      return
    }

    this.conversationHistory.push({ role: 'assistant', content: greeting })
    this.onAiText(greeting)
  }

  _buildSystemMessage() {
    const personaPrompt = this.persona.systemPrompt || ''
    const voiceInstructions = `You are in a voice call. RULES:
- Keep ALL responses to 1-3 sentences MAX. This is spoken dialogue — short and natural.
- NEVER write code, lists, detailed explanations, or long analysis. Just talk briefly.
- If the user asks you to DO anything (write code, create files, search, analyze, explain in detail, run commands, etc.), do NOT do it yourself. Instead say a brief acknowledgment and delegate with a task tag:
<task>{"instruction": "the full task description"}</task>
- The task tag hands work to the chat agent which has full capabilities. You are just the voice interface.
- Only answer quick conversational questions yourself (greetings, opinions, simple yes/no, short clarifications).
- When in doubt, delegate to a task rather than giving a long response.`

    return {
      role: 'system',
      content: personaPrompt
        ? `${personaPrompt}\n\n${voiceInstructions}`
        : voiceInstructions,
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
