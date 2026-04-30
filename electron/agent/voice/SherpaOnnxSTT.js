/**
 * Speech-to-Text via sherpa-onnx-node (SenseVoice ONNX model).
 * Same interface as LocalSTT / WhisperSTT: transcribe(audioBuffer, mimeType, opts)
 * No Python dependency — runs entirely in Node.js.
 */
const path = require('path')
const { logger } = require('../../logger')

let sherpa_onnx = null
function getSherpa() {
  if (!sherpa_onnx) sherpa_onnx = require('sherpa-onnx-node')
  return sherpa_onnx
}

// Singleton recognizer — expensive to create, reuse across calls
let _recognizer = null
let _recognizerModelDir = null

function getRecognizer(modelDir) {
  if (_recognizer && _recognizerModelDir === modelDir) return _recognizer
  if (_recognizer) { _recognizer = null }

  const modelFile = path.join(modelDir, 'model.int8.onnx')
  const tokensFile = path.join(modelDir, 'tokens.txt')

  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      senseVoice: { model: modelFile, useInverseTextNormalization: 1 },
      tokens: tokensFile,
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
  }

  const sherpa = getSherpa()
  _recognizer = new sherpa.OfflineRecognizer(config)
  _recognizerModelDir = modelDir
  logger.info(`[SherpaOnnxSTT] Recognizer loaded from ${modelDir}`)
  return _recognizer
}

/**
 * Parse WAV buffer → Float32Array samples.
 * Expects 16-bit PCM mono WAV (standard from useVoiceRecording.js).
 */
function parseWav(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

  // Find 'data' chunk
  let dataOffset = 12
  let dataSize = 0
  while (dataOffset < buffer.length - 8) {
    const chunkId = String.fromCharCode(buffer[dataOffset], buffer[dataOffset + 1], buffer[dataOffset + 2], buffer[dataOffset + 3])
    const chunkSize = view.getUint32(dataOffset + 4, true)
    if (chunkId === 'data') {
      dataOffset += 8
      dataSize = chunkSize
      break
    }
    dataOffset += 8 + chunkSize
  }

  if (!dataSize) throw new Error('No data chunk found in WAV')

  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)
  const numSamples = dataSize / (bitsPerSample / 8)
  const samples = new Float32Array(numSamples)

  if (bitsPerSample === 16) {
    for (let i = 0; i < numSamples; i++) {
      samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768.0
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < numSamples; i++) {
      samples[i] = view.getFloat32(dataOffset + i * 4, true)
    }
  }

  return { samples, sampleRate }
}

class SherpaOnnxSTT {
  constructor({ modelDir }) {
    if (!modelDir) throw new Error('SherpaOnnxSTT: modelDir is required')
    this.modelDir = modelDir
    // Eagerly load recognizer so first transcription is fast
    try {
      getRecognizer(modelDir)
    } catch (err) {
      logger.warn(`[SherpaOnnxSTT] Failed to preload recognizer: ${err.message}`)
    }
  }

  /**
   * Transcribe audio buffer.
   * @param {Buffer} audioBuffer - WAV audio (16kHz 16-bit PCM mono from renderer)
   * @param {string} [mimeType] - 'audio/wav' expected for local mode
   * @param {object} [opts]
   * @param {string} [opts.language] - BCP-47 code (unused by SenseVoice but kept for interface parity)
   * @returns {{ text: string, durationSecs: number }}
   */
  async transcribe(audioBuffer, mimeType = 'audio/wav', opts = {}) {
    const recognizer = getRecognizer(this.modelDir)

    let samples, sampleRate
    if (mimeType.includes('wav')) {
      const parsed = parseWav(audioBuffer)
      samples = parsed.samples
      sampleRate = parsed.sampleRate
    } else {
      // Non-WAV: try sherpa's readWave with a temp file as fallback
      const fs = require('fs')
      const os = require('os')
      const tmp = path.join(os.tmpdir(), `clankit-stt-${Date.now()}.webm`)
      try {
        fs.writeFileSync(tmp, audioBuffer)
        const sherpa = getSherpa()
        const wave = sherpa.readWave(tmp)
        samples = wave.samples
        sampleRate = wave.sampleRate
      } finally {
        try { fs.unlinkSync(tmp) } catch {}
      }
    }

    const durationSecs = samples.length / sampleRate

    const t0 = Date.now()
    const stream = recognizer.createStream()
    stream.acceptWaveform({ sampleRate, samples })
    recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    const elapsed = Date.now() - t0

    logger.info(`[SherpaOnnxSTT] ${durationSecs.toFixed(1)}s audio → ${elapsed}ms, text="${(result.text || '').slice(0, 60)}"`)

    let text = (result.text || '').trim()

    // ── trivial-output filter (shared with WhisperSTT / LocalSTT) ──
    const hasCJK = /[\u3000-\u9FFF\uAC00-\uD7FF\uF900-\uFAFF]/.test(text)
    if (text && (/^[.,!?…\s。！？、，]+$/.test(text) || /^\[.*\]$/.test(text) || (!hasCJK && text.length < 3))) {
      text = ''
    }

    // ── hallucination blocklist (shared with WhisperSTT / LocalSTT) ──
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

    return { text, durationSecs }
  }
}

/** Release the singleton recognizer (e.g. on app quit). */
SherpaOnnxSTT.release = function () {
  _recognizer = null
  _recognizerModelDir = null
}

module.exports = SherpaOnnxSTT
