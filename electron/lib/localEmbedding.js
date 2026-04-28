/**
 * Local Embedding Engine — runs sentence-transformers ONNX model via transformers.js.
 * Model: paraphrase-multilingual-MiniLM-L12-v2 (384-dim, ~449MB ONNX, 50+ languages).
 *
 * As of the bundled-model cutover, the model ships with the installer rather
 * than being downloaded on first use. Resolution order:
 *
 *   1. BUNDLED  — {process.resourcesPath}/models/  (production builds)
 *                 OR  {projectRoot}/electron/models/  (dev mode)
 *   2. USER DATA — {DATA_DIR}/models/  (legacy: model downloaded by older versions)
 *
 * Whichever location is found first wins. The user-data fallback exists purely
 * for backward compat with users who downloaded under the old flow; new
 * installs always hit the bundled path.
 *
 * The download/remove APIs are retained as no-ops so callers don't blow up,
 * but they're now deprecated — surface UI should not expose them.
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
const MODEL_VERSION = '1.0.0'

// Singleton state
let _userCacheDir = null    // {DATA_DIR}/models  — legacy fallback
let _bundledCacheDir = null // resourcesPath/models or electron/models — primary
let _pipeline = null
let _loadingPromise = null

/**
 * Set model cache directories. Called once at app startup.
 *
 * @param {string} userCacheDir       Legacy user data dir, e.g. {DATA_DIR}/models/
 * @param {string} [bundledCacheDir]  Bundled model dir. In production this is
 *                                    `path.join(process.resourcesPath, 'models')`;
 *                                    in dev it's `<projectRoot>/electron/models/`.
 *                                    May be omitted; if so, only the user dir
 *                                    is searched (e.g. for unit tests).
 */
function init(userCacheDir, bundledCacheDir) {
  _userCacheDir = userCacheDir
  _bundledCacheDir = bundledCacheDir || null
  if (userCacheDir) fs.mkdirSync(userCacheDir, { recursive: true })
}

/**
 * Probe a single cache root for a fully-formed model.
 * @returns {string|null}  the resolved model dir, or null if missing/corrupt
 */
function _probeCacheRoot(cacheRoot) {
  if (!cacheRoot) return null
  const modelDir = path.join(cacheRoot, MODEL_SUBDIR)
  const onnxPath = path.join(modelDir, ONNX_FILE)
  const tokenizerPath = path.join(modelDir, TOKENIZER_FILE)
  if (!fs.existsSync(onnxPath) || !fs.existsSync(tokenizerPath)) return null
  try {
    const stat = fs.statSync(onnxPath)
    if (stat.size < 1024 * 1024) return null
  } catch {
    return null
  }
  return modelDir
}

/**
 * Resolve the active cache root — bundled wins, user data falls back.
 * @returns {{ cacheRoot: string|null, source: 'bundled'|'user'|null }}
 */
function _resolveCacheRoot() {
  const bundled = _probeCacheRoot(_bundledCacheDir)
  if (bundled) return { cacheRoot: _bundledCacheDir, source: 'bundled' }
  const user = _probeCacheRoot(_userCacheDir)
  if (user) return { cacheRoot: _userCacheDir, source: 'user' }
  return { cacheRoot: null, source: null }
}

/**
 * Get the resolved model directory path. Returns the bundled path if available,
 * else the legacy user path, else the user path (for downstream "where would
 * download go" type questions — though downloads are no longer offered).
 */
function getModelDir() {
  if (!_userCacheDir && !_bundledCacheDir) {
    throw new Error('localEmbedding.init() not called')
  }
  const { cacheRoot } = _resolveCacheRoot()
  const root = cacheRoot || _userCacheDir || _bundledCacheDir
  return path.join(root, MODEL_SUBDIR)
}

/**
 * Check if model files exist and are valid in either location.
 * @returns {{ ready: boolean, modelDir: string, source?: 'bundled'|'user', reason?: string }}
 */
function isModelReady() {
  if (!_userCacheDir && !_bundledCacheDir) {
    return { ready: false, modelDir: '', reason: 'init() not called' }
  }
  const { cacheRoot, source } = _resolveCacheRoot()
  if (cacheRoot) {
    return { ready: true, modelDir: path.join(cacheRoot, MODEL_SUBDIR), source }
  }
  return {
    ready: false,
    modelDir: path.join(_bundledCacheDir || _userCacheDir, MODEL_SUBDIR),
    reason: 'Model files not found in bundled or user directory',
  }
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
    // Point transformers.js at whichever cache root has the model. Bundled
    // wins; user-data legacy is the fallback. If neither has the model,
    // remote fetching is still allowed so the next launch can recover, but
    // bundled installs should never need it.
    const { cacheRoot } = _resolveCacheRoot()
    env.cacheDir = cacheRoot || _bundledCacheDir || _userCacheDir
    env.allowLocalModels = true
    env.allowRemoteModels = !cacheRoot  // only allow remote if local resolution failed

    logger.info('[localEmbedding] Loading pipeline from', env.cacheDir)
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
 * @deprecated The model now ships with the installer — downloads are no longer
 * exposed in the UI. Retained as a no-op for any stale callers; reports success
 * if the model is already resolvable, otherwise returns the not-found reason.
 */
async function downloadModel(onProgress = () => {}, _source = 'huggingface') {
  const check = isModelReady()
  if (check.ready) {
    onProgress({ step: 'done', progress: 100, message: 'Model already bundled' })
    return { success: true }
  }
  const msg = 'Embedding model not found. The model should ship with the installer; try reinstalling the app.'
  onProgress({ step: 'error', progress: -1, message: msg })
  return { success: false, error: msg }
}

/**
 * @deprecated Bundled models are read-only. We refuse to delete them — uninstall
 * the app instead. Legacy user-data downloads can still be cleared if no
 * bundled copy is present (purely for cleanup of obsolete caches).
 */
function removeModel() {
  const { source } = _resolveCacheRoot()
  if (source === 'bundled') {
    return { success: false, error: 'Bundled model is read-only. Uninstall the app to remove.' }
  }
  // Only the legacy user-data copy is eligible for removal
  if (source === 'user' && _userCacheDir) {
    _pipeline = null
    _loadingPromise = null
    const dir = path.join(_userCacheDir, MODEL_SUBDIR)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
      logger.info(`[localEmbedding] Removed legacy user model at ${dir}`)
    }
  }
  return { success: true }
}

/**
 * Get model status info — used by Config UI for the read-only info card.
 */
function getModelInfo() {
  const check = isModelReady()
  let size = 0
  if (check.ready) {
    const onnxPath = path.join(check.modelDir, ONNX_FILE)
    try { size = fs.statSync(onnxPath).size } catch {}
  }
  return {
    status: check.ready ? 'ready' : 'not_bundled',
    ready: check.ready,
    reason: check.reason,
    source: check.source || null,   // 'bundled' | 'user' | null
    size,
    modelDir: check.modelDir,
    modelId: MODEL_ID,
    dimension: EMBEDDING_DIM,
    sizeMB: MODEL_SIZE_MB,
    version: MODEL_VERSION,
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
  MODEL_VERSION,
  EMBEDDING_DIM,
  MODEL_SIZE_MB,
}
