// electron/agent/voice/LocalVoiceServer.js
// Manages the Python local voice server lifecycle (SenseVoice STT + Edge-TTS).

const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { logger } = require('../../logger')

let _instance = null

class LocalVoiceServer {
  constructor({ pythonPath, port, sttModel, dataDir, modelSource, device }) {
    this.pythonPath = pythonPath
    this.port = port || 8199
    this.sttModel = sttModel || 'iic/SenseVoiceSmall'
    this.dataDir = dataDir
    this.modelSource = modelSource || 'modelscope'
    this.device = device || 'auto'
    this.process = null
    this._running = false

    // Script path — co-located with this module
    this.scriptPath = path.join(__dirname, 'local_voice_server.py')
    this.pidFile = path.join(dataDir, 'local-voice-server.pid')
  }

  /** Get the singleton instance (create if needed). */
  static getInstance(opts) {
    if (!_instance && opts) {
      _instance = new LocalVoiceServer(opts)
    }
    return _instance
  }

  /** Clear singleton (for testing). */
  static clearInstance() {
    _instance = null
  }

  /** Resolve python executable inside venv. */
  _venvPython() {
    if (!this.pythonPath) return null
    // If pythonPath points to a venv dir, resolve the python binary inside it
    const venvDir = path.join(this.dataDir, 'local-voice-env')
    if (fs.existsSync(venvDir)) {
      const isWin = process.platform === 'win32'
      const bin = isWin
        ? path.join(venvDir, 'Scripts', 'python.exe')
        : path.join(venvDir, 'bin', 'python')
      if (fs.existsSync(bin)) return bin
    }
    return this.pythonPath
  }

  /** Start the Python server. Resolves when /health responds or timeout. */
  async start() {
    if (this._running || this.isStarting()) return

    // Kill any orphan from a previous session
    await this._killOrphan()

    const pythonBin = this._venvPython()
    if (!pythonBin) throw new Error('Python path not configured')

    const args = [
      this.scriptPath,
      '--port', String(this.port),
      '--stt-model', this.sttModel,
      '--pid-file', this.pidFile,
      '--model-source', this.modelSource,
      '--device', this.device,
    ]

    // Redirect model cache next to the venv (same parent as installPath, e.g. d:\clankai\data\)
    // pythonPath: d:\clankai\data\local-voice-env\Scripts\python.exe
    //           → dirname² = d:\clankai\data\local-voice-env (venv)
    //           → dirname³ = d:\clankai\data\ (parent)
    const venvDir = path.dirname(path.dirname(this.pythonPath))  // Scripts/python.exe → venv dir
    const modelCacheDir = path.join(path.dirname(venvDir), 'model_cache')
    const env = { ...process.env, MODELSCOPE_CACHE: modelCacheDir, HF_HUB_CACHE: modelCacheDir }

    logger.info(`[LocalVoiceServer] Starting: ${pythonBin} ${args.join(' ')}`)

    this.process = spawn(pythonBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    })

    this.process.stdout.on('data', (chunk) => {
      const msg = chunk.toString().trim()
      if (msg) logger.info(`[LocalVoiceServer] ${msg}`)
    })
    this.process.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim()
      if (msg) logger.warn(`[LocalVoiceServer:stderr] ${msg}`)
    })
    this.process.on('exit', (code) => {
      logger.info(`[LocalVoiceServer] Process exited with code ${code}`)
      this._running = false
      this.process = null
    })
    this.process.on('error', (err) => {
      logger.error(`[LocalVoiceServer] Process error: ${err.message}`)
      this._running = false
      this.process = null
    })

    // Wait for /health to respond (model loading can take 30-60s)
    // Model loading can take 30-60s; first-time downloads can take several minutes
    await this._waitForHealth(300000)
    this._running = true
  }

  /** Stop the server gracefully. */
  async stop() {
    if (!this.process) {
      this._running = false
      return
    }
    logger.info('[LocalVoiceServer] Stopping...')
    try {
      this.process.kill('SIGTERM')
      // Wait up to 5s for graceful exit
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL')
          }
          resolve()
        }, 5000)
        if (this.process) {
          this.process.on('exit', () => { clearTimeout(timer); resolve() })
        } else {
          clearTimeout(timer)
          resolve()
        }
      })
    } catch (err) {
      logger.warn('[LocalVoiceServer] Stop error:', err.message)
    }
    this._running = false
    this.process = null
    // Clean PID file
    try { if (fs.existsSync(this.pidFile)) fs.unlinkSync(this.pidFile) } catch {}
  }

  /** Check if server is running and healthy. */
  async healthCheck() {
    try {
      const resp = await fetch(`http://127.0.0.1:${this.port}/health`, {
        signal: AbortSignal.timeout(3000),
      })
      if (resp.ok) return await resp.json()
    } catch {}
    return null
  }

  isRunning() { return this._running }

  isStarting() { return !!this.process && !this._running }

  getServerURL() { return `http://127.0.0.1:${this.port}` }

  /** Poll /health until it responds or timeout. */
  async _waitForHealth(timeoutMs) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const health = await this.healthCheck()
      if (health && health.status === 'ok') return health
      // Check if process died
      if (!this.process || this.process.exitCode !== null) {
        throw new Error('Local voice server process exited unexpectedly')
      }
      await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error(`Local voice server did not become healthy within ${timeoutMs / 1000}s`)
  }

  /** Kill orphan process from a previous session (by PID file). */
  async _killOrphan() {
    if (!fs.existsSync(this.pidFile)) return
    try {
      const pid = parseInt(fs.readFileSync(this.pidFile, 'utf8').trim(), 10)
      if (pid && !isNaN(pid)) {
        process.kill(pid, 'SIGTERM')
        logger.info(`[LocalVoiceServer] Killed orphan PID ${pid}`)
      }
    } catch {}
    try { fs.unlinkSync(this.pidFile) } catch {}
  }
}

module.exports = LocalVoiceServer
