// electron/agent/voice/WhisperSTT.js
// Speech-to-Text via OpenAI Whisper API

const FormData = require('form-data')

class WhisperSTT {
  constructor({ apiKey, baseURL }) {
    if (!apiKey) throw new Error('WhisperSTT: apiKey is required')
    this.apiKey = apiKey
    this.baseURL = (baseURL || 'https://api.openai.com').replace(/\/+$/, '')
    this.isStandardOpenAI = this.baseURL.includes('api.openai.com')
  }

  async transcribe(audioBuffer, mimeType = 'audio/webm') {
    const ext = mimeType.includes('wav') ? 'wav' : 'webm'
    const form = new FormData()
    form.append('file', audioBuffer, { filename: `audio.${ext}`, contentType: mimeType })
    form.append('model', 'whisper-1')
    form.append('response_format', 'text')

    const url = this.isStandardOpenAI
      ? `${this.baseURL}/v1/audio/transcriptions`
      : `${this.baseURL}/proxy/openai/v1/audio/transcriptions`

    const authHeader = this.isStandardOpenAI
      ? { 'Authorization': `Bearer ${this.apiKey}` }
      : { 'x-api-key': this.apiKey }

    const resp = await fetch(url, {
      method: 'POST',
      headers: { ...authHeader, ...form.getHeaders() },
      body: form.getBuffer(),
    })

    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Whisper API error ${resp.status}: ${body}`)
    }

    const text = await resp.text()
    return text.trim()
  }
}

module.exports = WhisperSTT
