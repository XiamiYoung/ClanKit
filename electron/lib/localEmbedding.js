/**
 * Local Embedding Engine — runs sentence-transformers ONNX model via transformers.js.
 * Model: paraphrase-multilingual-MiniLM-L12-v2 (384-dim, ~449MB ONNX, 50+ languages).
 * Download flow mirrors electron/agent/voice/sttModelManager.js pattern.
 */
const path = require('path')
const fs = require('fs')
const { logger } = require('../logger')

const MODEL_ID = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
const MODEL_SUBDIR = path.join('sentence-transformers', 'paraphrase-multilingual-MiniLM-L12-v2')
const ONNX_FILE = path.join('onnx', 'model.onnx')
const TOKENIZER_FILE = 'tokenizer.json'
const EMBEDDING_DIM = 384
const MODEL_SIZE_MB = 449

// Singleton state
let _cacheDir = null
let _pipeline = null
let _loadingPromise = null

/**
 * Set model cache directory. Called once at app startup.
 * @param {string} cacheDir - e.g. {DATA_DIR}/models/
 */
function init(cacheDir) {
  _cacheDir = cacheDir
  fs.mkdirSync(cacheDir, { recursive: true })
}

/**
 * Get the model directory path.
 */
function getModelDir() {
  if (!_cacheDir) throw new Error('localEmbedding.init() not called')
  return path.join(_cacheDir, MODEL_SUBDIR)
}

/**
 * Check if model files exist and are valid.
 * @returns {{ ready: boolean, modelDir: string, reason?: string }}
 */
function isModelReady() {
  const modelDir = getModelDir()
  const onnxPath = path.join(modelDir, ONNX_FILE)
  const tokenizerPath = path.join(modelDir, TOKENIZER_FILE)

  if (!fs.existsSync(onnxPath)) {
    return { ready: false, modelDir, reason: `Model file missing: ${ONNX_FILE}` }
  }
  if (!fs.existsSync(tokenizerPath)) {
    return { ready: false, modelDir, reason: `Tokenizer file missing: ${TOKENIZER_FILE}` }
  }
  const stat = fs.statSync(onnxPath)
  if (stat.size < 1024 * 1024) {
    return { ready: false, modelDir, reason: 'Model file appears corrupt (too small)' }
  }
  return { ready: true, modelDir }
}

/**
 * Lazy-load the transformers.js pipeline (singleton).
 * @returns {Promise<object>} feature-extraction pipeline
 */
async function getPipeline() {
  if (_pipeline) return _pipeline
  if (_loadingPromise) return _loadingPromise

  _loadingPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = _cacheDir
    env.allowLocalModels = true
    // Disable remote fetching during inference — model must already be downloaded
    env.allowRemoteModels = true

    logger.info('[localEmbedding] Loading pipeline...')
    const extractor = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'fp32',
      device: 'cpu',
    })
    logger.info('[localEmbedding] Pipeline ready')
    _pipeline = extractor
    _loadingPromise = null
    return extractor
  })()

  return _loadingPromise
}

/**
 * Embed a single text.
 * @param {string} text
 * @returns {Promise<Float32Array>} 384-dim normalized vector
 */
async function embed(text) {
  const extractor = await getPipeline()
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return output.data
}

/**
 * Embed multiple texts.
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>}
 */
async function embedBatch(texts) {
  const extractor = await getPipeline()
  const results = []
  for (const text of texts) {
    const output = await extractor(text, { pooling: 'mean', normalize: true })
    results.push(output.data)
  }
  return results
}

/**
 * Download the embedding model with progress reporting.
 * Uses @huggingface/transformers built-in download via pipeline creation.
 * @param {function} onProgress - { step, progress (0-100), message }
 * @param {string} source - 'huggingface' or 'mirror'
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function downloadModel(onProgress = () => {}, source = 'huggingface') {
  try {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = _cacheDir
    env.allowLocalModels = true
    env.allowRemoteModels = true
    if (source === 'mirror') {
      env.remoteHost = 'https://hf-mirror.com'
    }

    onProgress({ step: 'download', progress: 0, message: `Downloading embedding model (~${MODEL_SIZE_MB}MB)...` })
    logger.info(`[localEmbedding] Downloading model from ${source === 'mirror' ? 'hf-mirror.com' : 'huggingface.co'}`)

    // Track download via polling model dir size
    const modelDir = getModelDir()
    const expectedBytes = MODEL_SIZE_MB * 1024 * 1024
    const progressInterval = setInterval(() => {
      try {
        const onnxPath = path.join(modelDir, ONNX_FILE)
        // Check for partial download files (transformers.js uses .tmp or writes directly)
        let currentSize = 0
        if (fs.existsSync(onnxPath)) {
          currentSize = fs.statSync(onnxPath).size
        }
        // Also check for any .tmp files in onnx dir
        const onnxDir = path.join(modelDir, 'onnx')
        if (fs.existsSync(onnxDir)) {
          for (const f of fs.readdirSync(onnxDir)) {
            const stat = fs.statSync(path.join(onnxDir, f))
            if (stat.size > currentSize) currentSize = stat.size
          }
        }
        if (currentSize > 0 && expectedBytes > 0) {
          const pct = Math.min(90, Math.round((currentSize / expectedBytes) * 90))
          onProgress({ step: 'download', progress: pct, message: `Downloading model... ${Math.round(currentSize / 1024 / 1024)}/${MODEL_SIZE_MB}MB` })
        }
      } catch { /* ignore stat errors during download */ }
    }, 2000)

    // Creating pipeline triggers download if files are missing
    const extractor = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'fp32',
      device: 'cpu',
    })

    clearInterval(progressInterval)
    _pipeline = extractor
    _loadingPromise = null

    onProgress({ step: 'done', progress: 100, message: 'Model ready' })
    logger.info('[localEmbedding] Model download complete')
    return { success: true }
  } catch (err) {
    logger.error(`[localEmbedding] Download failed: ${err.message}`)
    onProgress({ step: 'error', progress: -1, message: err.message })
    return { success: false, error: err.message }
  }
}

/**
 * Remove model files from disk and clear cached pipeline.
 * @returns {{ success: boolean }}
 */
function removeModel() {
  _pipeline = null
  _loadingPromise = null
  const modelDir = getModelDir()
  if (fs.existsSync(modelDir)) {
    fs.rmSync(modelDir, { recursive: true, force: true })
    logger.info(`[localEmbedding] Removed model at ${modelDir}`)
  }
  return { success: true }
}

/**
 * Get model status info.
 */
function getModelInfo() {
  const check = isModelReady()
  let size = 0
  if (check.ready) {
    const onnxPath = path.join(check.modelDir, ONNX_FILE)
    try { size = fs.statSync(onnxPath).size } catch {}
  }
  return {
    status: check.ready ? 'ready' : 'not_downloaded',
    ready: check.ready,
    reason: check.reason,
    size,
    modelDir: check.modelDir,
    modelId: MODEL_ID,
    dimension: EMBEDDING_DIM,
    sizeMB: MODEL_SIZE_MB,
  }
}

module.exports = {
  init,
  embed,
  embedBatch,
  isModelReady,
  downloadModel,
  removeModel,
  getModelInfo,
  getModelDir,
  MODEL_ID,
  EMBEDDING_DIM,
  MODEL_SIZE_MB,
}
