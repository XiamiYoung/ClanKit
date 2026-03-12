// electron/agent/voice/WhisperSTT.js
// Speech-to-Text via OpenAI Whisper API

const FormData = require('form-data')

class WhisperSTT {
  constructor({ apiKey, baseURL, model }) {
    if (!apiKey) throw new Error('WhisperSTT: apiKey is required')
    this.apiKey = apiKey
    this.baseURL = (baseURL || 'https://api.openai.com').replace(/\/+$/, '')
    this.model = model || 'whisper-1'
    // Proxy mode: only for the internal mlaas proxy — all other endpoints
    // (OpenAI, Groq, Deepgram-compatible, etc.) use standard OpenAI format.
    this.isProxy = this.baseURL.includes('mlaas.virtuosgames.com')
  }

  /**
   * Transcribe audio. Returns { text, durationSecs } where durationSecs is the
   * actual audio duration reported by Whisper (used for usage tracking).
   * @param {Buffer} audioBuffer
   * @param {string} [mimeType]
   * @param {object} [opts]
   * @param {string} [opts.language]  BCP-47 language code, e.g. 'en'. Skips auto-detection, improves accuracy.
   * @param {string} [opts.prompt]    Primes the transcription decoder (agent name, context).
   */
  async transcribe(audioBuffer, mimeType = 'audio/webm', opts = {}) {
    const ext = mimeType.includes('wav') ? 'wav' : 'webm'
    const form = new FormData()
    form.append('file', audioBuffer, { filename: `audio.${ext}`, contentType: mimeType })
    form.append('model', this.model)
    form.append('response_format', 'verbose_json')
    // Providing a language avoids Whisper spending inference on language detection
    // and significantly reduces hallucinations on low-signal/background-noise audio.
    if (opts.language) form.append('language', opts.language)
    // A prompt biases the decoder toward real speech and away from hallucinated filler.
    if (opts.prompt) form.append('prompt', opts.prompt)

    const url = this.isProxy
      ? `${this.baseURL}/proxy/openai/v1/audio/transcriptions`
      : `${this.baseURL}/v1/audio/transcriptions`

    const authHeader = this.isProxy
      ? { 'x-api-key': this.apiKey }
      : { 'Authorization': `Bearer ${this.apiKey}` }

    // Abort if the API takes more than 10s — prevents _voiceBusy from getting stuck forever.
    // Normal Whisper: 1–3s. Slow but valid: 4–8s. Hung connection: never resolves.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    let resp
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { ...authHeader, ...form.getHeaders() },
        body: form.getBuffer(),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Whisper API error ${resp.status}: ${body}`)
    }

    const json = await resp.json()
    let text = (json.text || '').trim()

    // ── no_speech_prob guard ──────────────────────────────────────────────────
    // verbose_json returns segments[], each with a no_speech_prob (0–1).
    // When Whisper receives keyboard clicks or ambient noise it hallucinates
    // common YouTube-trained phrases ("Thank you", "Thanks for watching",
    // "bye bye", etc.) but its own no_speech_prob will be high (> 0.7).
    // Threshold is 0.7 (not 0.4) because non-English languages — especially
    // Chinese, Japanese, Korean — legitimately score 0.4–0.6 on no_speech_prob
    // even for real speech, since Whisper is predominantly English-trained.
    // True silence hallucinations score 0.7–1.0.
    const segments = Array.isArray(json.segments) ? json.segments : []
    if (segments.length > 0) {
      const avgNoSpeech = segments.reduce((s, seg) => s + (seg.no_speech_prob || 0), 0) / segments.length
      if (avgNoSpeech > 0.7) text = ''
    }

    // ── trivial-output filter ─────────────────────────────────────────────────
    // Drop punctuation-only, very short, or bracketed noise placeholders
    // like "[BLANK_AUDIO]", "[Music]", "[Applause]".
    // CJK characters (Chinese/Japanese/Korean) are semantically dense — a 2-char
    // word like "继续" (continue) or "好的" (okay) is a complete valid utterance.
    // Only apply the length guard to Latin/ASCII text, not CJK.
    const hasCJK = /[\u3000-\u9FFF\uAC00-\uD7FF\uF900-\uFAFF]/.test(text)
    if (text && (/^[.,!?…\s。！？、，]+$/.test(text) || /^\[.*\]$/.test(text) || (!hasCJK && text.length < 3))) {
      text = ''
    }

    // ── hallucination blocklist ───────────────────────────────────────────────
    // Whisper hallucinates these specific phrases from its training corpus when
    // given silence, keyboard noise, or low-signal audio it cannot parse.
    // These phrases NEVER represent real user speech — discard immediately.
    // Sources: openai/whisper GitHub issues, whisper.cpp hallucination reports.
    if (text) {
      const HALLUCINATIONS = [
        // Japanese sign-offs (extremely common Whisper artifacts)
        '字幕視聴ありがとうございました',
        'ご視聴ありがとうございました',
        '視聴ありがとうございました',
        'ありがとうございました',
        // Chinese media subscription prompts
        '請不吝點贊訂閱轉發打賞支持明鏡與點點欄目',
        '请不吝点赞订阅转发打赏支持明镜与点点栏目',
        '字幕由',
        // English filler artifacts
        'thanks for watching',
        'thank you for watching',
        'please subscribe',
        'don\'t forget to subscribe',
        'like and subscribe',
        'subtitles by the amara.org community',
        'amara.org',
        // Korean sign-offs
        '시청해주셔서 감사합니다',
        '구독과 좋아요',
      ]
      const lower = text.toLowerCase().replace(/\s+/g, ' ').trim()
      const isHallucination = HALLUCINATIONS.some(h => lower.includes(h.toLowerCase()))
      if (isHallucination) text = ''
    }

    return {
      text,
      durationSecs: typeof json.duration === 'number' ? json.duration : 0,
    }
  }
}

module.exports = WhisperSTT
