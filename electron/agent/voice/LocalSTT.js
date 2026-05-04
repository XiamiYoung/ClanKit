// electron/agent/voice/LocalSTT.js
// Speech-to-Text via local SenseVoice server (same interface as WhisperSTT)

const FormData = require('form-data')

class LocalSTT {
  constructor({ serverURL }) {
    if (!serverURL) throw new Error('LocalSTT: serverURL is required')
    this.serverURL = serverURL.replace(/\/+$/, '')
  }

  /**
   * Transcribe audio via local SenseVoice server.
   * Returns { text, durationSecs } — same shape as WhisperSTT.transcribe().
   * @param {Buffer} audioBuffer
   * @param {string} [mimeType]
   * @param {object} [opts]
   * @param {string} [opts.language]  BCP-47 language code (e.g. 'en', 'zh')
   * @param {string} [opts.prompt]    Ignored by SenseVoice (kept for interface parity)
   */
  async transcribe(audioBuffer, mimeType = 'audio/webm', opts = {}) {
    const ext = mimeType.includes('wav') ? 'wav' : 'webm'
    const form = new FormData()
    form.append('file', audioBuffer, { filename: `audio.${ext}`, contentType: mimeType })
    if (opts.language) form.append('language', opts.language)

    // 15s timeout — SenseVoice is fast locally but first inference can be slow
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let resp
    try {
      resp = await fetch(`${this.serverURL}/stt`, {
        method: 'POST',
        headers: form.getHeaders(),
        body: form.getBuffer(),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Local STT error ${resp.status}: ${body}`)
    }

    const json = await resp.json()
    let text = (json.text || '').trim()

    // ── trivial-output filter (shared with WhisperSTT) ──────────────────────
    const hasCJK = /[\u3000-\u9FFF\uAC00-\uD7FF\uF900-\uFAFF]/.test(text)
    if (text && (/^[.,!?…\s。！？、，]+$/.test(text) || /^\[.*\]$/.test(text) || (!hasCJK && text.length < 3))) {
      text = ''
    }

    // ── hallucination blocklist (shared with WhisperSTT) ────────────────────
    if (text) {
      const HALLUCINATIONS = [
        '字幕視聴ありがとうございました',
        'ご視聴ありがとうございました',
        '視聴ありがとうございました',
        'ありがとうございました',
        '請不吝點贊訂閱轉發打賞支持明鏡與點點欄目',
        '请不吝点赞订阅转发打赏支持明镜与点点栏目',
        '字幕由',
        'thanks for watching',
        'thank you for watching',
        'please subscribe',
        'don\'t forget to subscribe',
        'like and subscribe',
        'subtitles by the amara.org community',
        'amara.org',
        '시청해주셔서 감사합니다',
        '구독과 좋아요',
      ]
      const lower = text.toLowerCase().replace(/\s+/g, ' ').trim()
      if (HALLUCINATIONS.some(h => lower.includes(h.toLowerCase()))) text = ''
    }

    return {
      text,
      durationSecs: typeof json.duration === 'number' ? json.duration : 0,
    }
  }
}

module.exports = LocalSTT
