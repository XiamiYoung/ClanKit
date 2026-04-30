/**
 * STT Model Manager — downloads and manages sherpa-onnx SenseVoice ONNX model.
 * Supports two mirror sources: HuggingFace (international) and hf-mirror.com (China).
 */
const path = require('path')
const fs = require('fs')
const { logger } = require('../../logger')

const MODEL_DIRNAME = 'sherpa-sensevoice'
const MODEL_FILENAME = 'model.int8.onnx'
const TOKENS_FILENAME = 'tokens.txt'
const MODEL_SIZE_MB = 155

const HF_REPO = 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17'

const SOURCES = {
  huggingface: {
    label: 'HuggingFace',
    model: `https://huggingface.co/${HF_REPO}/resolve/main/${MODEL_FILENAME}`,
    tokens: `https://huggingface.co/${HF_REPO}/resolve/main/${TOKENS_FILENAME}`,
  },
  mirror: {
    label: 'HF Mirror (China)',
    model: `https://hf-mirror.com/${HF_REPO}/resolve/main/${MODEL_FILENAME}`,
    tokens: `https://hf-mirror.com/${HF_REPO}/resolve/main/${TOKENS_FILENAME}`,
  },
}

/**
 * Get the model directory path.
 * @param {string} dataDir - App data directory
 * @returns {string}
 */
function getModelDir(dataDir) {
  return path.join(dataDir, MODEL_DIRNAME)
}

/**
 * Check if model files are present and ready.
 * @param {string} dataDir
 * @returns {{ ready: boolean, modelDir: string, reason?: string }}
 */
function isModelReady(dataDir) {
  const modelDir = getModelDir(dataDir)
  const modelFile = path.join(modelDir, MODEL_FILENAME)
  const tokensFile = path.join(modelDir, TOKENS_FILENAME)

  if (!fs.existsSync(modelFile)) {
    return { ready: false, modelDir, reason: `Model file missing: ${MODEL_FILENAME}` }
  }
  if (!fs.existsSync(tokensFile)) {
    return { ready: false, modelDir, reason: `Tokens file missing: ${TOKENS_FILENAME}` }
  }

  const stat = fs.statSync(modelFile)
  if (stat.size < 1024 * 1024) {
    return { ready: false, modelDir, reason: 'Model file appears corrupt (too small)' }
  }

  return { ready: true, modelDir }
}

/**
 * Download a single file with progress reporting.
 * @returns {Promise<Buffer>}
 */
async function downloadFile(url, onProgress) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(600000),
    headers: { 'User-Agent': 'ClanKit' },
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`)

  const total = parseInt(resp.headers.get('content-length') || '0', 10)
  const reader = resp.body.getReader()
  const chunks = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (onProgress) onProgress(received, total)
  }

  return Buffer.concat(chunks)
}

/**
 * Download the SenseVoice ONNX model files.
 * @param {string} dataDir
 * @param {function} [onProgress] - Called with { step, progress (0-100), message }
 * @param {string} [source] - 'huggingface' (default) or 'mirror' (China)
 * @returns {Promise<{ success: boolean, modelDir?: string, error?: string }>}
 */
async function downloadModel(dataDir, onProgress = () => {}, source = 'huggingface') {
  const modelDir = getModelDir(dataDir)
  const src = SOURCES[source] || SOURCES.huggingface

  try {
    fs.mkdirSync(modelDir, { recursive: true })

    // Download model file (~155MB)
    onProgress({ step: 'download', progress: 0, message: `Downloading model from ${src.label} (~${MODEL_SIZE_MB}MB)...` })
    logger.info(`[sttModelManager] Downloading model from ${src.model}`)

    const modelBuffer = await downloadFile(src.model, (received, total) => {
      if (total > 0) {
        const pct = Math.round((received / total) * 85)
        onProgress({ step: 'download', progress: pct, message: `Downloading model... ${Math.round(received / 1024 / 1024)}/${Math.round(total / 1024 / 1024)}MB` })
      }
    })
    fs.writeFileSync(path.join(modelDir, MODEL_FILENAME), modelBuffer)
    logger.info(`[sttModelManager] Model downloaded: ${Math.round(modelBuffer.length / 1024 / 1024)}MB`)

    // Download tokens file (~small)
    onProgress({ step: 'download', progress: 90, message: 'Downloading tokens...' })
    const tokensBuffer = await downloadFile(src.tokens, () => {})
    fs.writeFileSync(path.join(modelDir, TOKENS_FILENAME), tokensBuffer)

    onProgress({ step: 'done', progress: 100, message: 'Model ready' })
    logger.info(`[sttModelManager] Model installed at ${modelDir}`)

    return { success: true, modelDir }
  } catch (err) {
    logger.error(`[sttModelManager] Download failed: ${err.message}`)
    return { success: false, error: err.message }
  }
}

/**
 * Remove model files.
 * @param {string} dataDir
 */
function removeModel(dataDir) {
  const modelDir = getModelDir(dataDir)
  if (fs.existsSync(modelDir)) {
    fs.rmSync(modelDir, { recursive: true, force: true })
    logger.info(`[sttModelManager] Removed model at ${modelDir}`)
  }
}

module.exports = { getModelDir, isModelReady, downloadModel, removeModel, MODEL_SIZE_MB, SOURCES }
