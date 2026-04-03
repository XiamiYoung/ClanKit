/**
 * IPC handlers for voice call sessions and TTS.
 * Channels: voice:*
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { ipcMain } = require('electron')
const { execFile, spawn } = require('child_process')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')
const VoiceSession = require('../agent/voice/VoiceSession')
const LocalVoiceServer = require('../agent/voice/LocalVoiceServer')
const { ensurePython } = require('../agent/voice/pythonManager')

let activeVoiceSession = null

/** Resolve the venv path from saved config (single source of truth). */
function resolveVenvPath() {
  const dataDir = ds.paths().DATA_DIR || ds.paths().CONFIG_FILE.replace(/[/\\]config\.json$/, '')
  const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
  return cfg.voiceCall?.local?.installPath || path.join(dataDir, 'local-voice-env')
}

/** Prefer configured local voice env python; fallback to auto-resolved Python. */
async function resolvePreferredPython() {
  const venvPath = resolveVenvPath()
  const pyBin = process.platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python3')

  if (fs.existsSync(pyBin)) {
    logger.info(`[voice] Using local env python: ${pyBin}`)
    return pyBin
  }

  const dataDir = ds.paths().DATA_DIR || ds.paths().CONFIG_FILE.replace(/[/\\]config\.json$/, '')
  const pyResult = await ensurePython(dataDir)
  const autoPython = pyResult?.path
  if (autoPython) logger.info(`[voice] Using auto-resolved python: ${autoPython}`)
  return autoPython || null
}

/** Ensure edge-tts package is installed; install if missing. */
async function ensureEdgeTts(python) {
  return new Promise((resolve) => {
    execFile(python, ['-m', 'pip', 'show', 'edge-tts'], { timeout: 5000 }, (err) => {
      if (!err) { resolve(true); return }
      logger.info('[voice] edge-tts not found, installing...')
      execFile(python, ['-m', 'pip', 'install', '-q', 'edge-tts'], { timeout: 60000 }, (err2) => {
        if (err2) {
          logger.warn(`[voice] Failed to install edge-tts: ${err2.message}`)
          resolve(false)
        } else {
          logger.info('[voice] edge-tts installed successfully')
          resolve(true)
        }
      })
    })
  })
}

/** Run edge-tts and return base64 mp3 audio (no LocalVoiceServer dependency). */
async function synthesizeEdgeTtsToBase64(python, voice, text, timeoutMs = 60000) {
  if (!voice) return { success: false, error: 'Voice not specified' }
  if (!text) return { success: false, error: 'Text is required' }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clankai-edge-'))
  const outFile = path.join(tempDir, 'tts.mp3')
  const textFile = path.join(tempDir, 'input.txt')
  try {
    fs.writeFileSync(textFile, text, 'utf8')
    const { exitCode, stderr } = await new Promise((resolve) => {
      execFile(python, [
        '-m', 'edge_tts',
        '--voice', voice,
        '-f', textFile,
        '--write-media', outFile,
      ], {
        timeout: timeoutMs,
        windowsHide: true,
      }, (err, stdout, stderr) => {
        if (err) {
          const code = typeof err.code === 'number' ? err.code : 1
          const errDetail = (stderr || '').trim() || err.message
          logger.warn(`[voice:edge-tts] execution failed (code=${code}): ${errDetail}`)
          resolve({ exitCode: code, stderr: errDetail })
          return
        }
        resolve({ exitCode: 0, stderr: '' })
      })
    })

    if (exitCode !== 0) return { success: false, error: stderr || `edge-tts failed with code ${exitCode}` }
    if (!fs.existsSync(outFile)) return { success: false, error: 'No audio generated' }

    const audioBuffer = fs.readFileSync(outFile)
    if (!audioBuffer.length) return { success: false, error: 'No audio generated' }
    return { success: true, audio: audioBuffer.toString('base64'), format: 'mp3' }
  } catch (err) {
    return { success: false, error: err.message }
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
  }
}

/** Read a soul file from disk. Returns null if not found. */
function readSoulFileSync(agentId, agentType) {
  if (!agentId) return null
  try {
    const filePath = path.join(ds.paths().SOULS_DIR, agentType, `${agentId}.md`)
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    logger.error('readSoulFileSync error', err.message)
  }
  return null
}

/** Accumulate usage metrics into chat.usage and save atomically. */
async function accumulateUsage(chatId, metrics, provider, model) {
  if (!chatId || !metrics) return
  const file = path.join(ds.paths().CHATS_DIR, `${chatId}.json`)
  let chat
  try {
    chat = await ds.readJSONAsync(file, null)
  } catch { return }
  if (!chat) return

  const u = chat.usage || {}
  chat.usage = {
    inputTokens:         (u.inputTokens         || 0) + (metrics.inputTokens         || 0),
    outputTokens:        (u.outputTokens        || 0) + (metrics.outputTokens        || 0),
    cacheCreationTokens: (u.cacheCreationTokens || 0) + (metrics.cacheCreationTokens || 0),
    cacheReadTokens:     (u.cacheReadTokens     || 0) + (metrics.cacheReadTokens     || 0),
    voiceInputTokens:    (u.voiceInputTokens    || 0) + (metrics.voiceInputTokens    || 0),
    voiceOutputTokens:   (u.voiceOutputTokens   || 0) + (metrics.voiceOutputTokens   || 0),
    whisperCalls:        (u.whisperCalls        || 0) + (metrics.whisperCalls        || 0),
    whisperSecs:         (u.whisperSecs         || 0) + (metrics.whisperSecs         || 0),
    ttsChars:            (u.ttsChars            || 0) + (metrics.ttsChars            || 0),
  }
  // Stamp provider/model for cost attribution if not already set
  if (provider && !chat.provider) chat.provider = provider
  if (model     && !chat.model)   chat.model     = model
  try {
    await ds.writeJSONAtomic(file, chat)
  } catch (err) {
    logger.warn('accumulateUsage write failed', err.message)
  }
}

function register() {
  ipcMain.handle('voice:start', async (event, params) => {
    const { chatId, agentId, history, voiceConfig, agent, userAgent, whisperConfig } = params
    try {
      if (activeVoiceSession) {
        activeVoiceSession.stop()
        activeVoiceSession = null
      }

      // Load soul memory for both agents so the voice LLM has full context
      const systemSoulContent = readSoulFileSync(agent?.id || agentId, 'system')
      const userSoulContent = readSoulFileSync(userAgent?.id, 'users')

      // Build llmCall function that routes to the correct provider.
      // Returns { text, inputTokens, outputTokens } for usage tracking.
      // opts.onChunk(delta) — called with each streamed token when streaming is requested.
      // Voice responses are brief (1–3 sentences) so 400 tokens is a safe cap that also
      // keeps generation fast. Task JSON rarely exceeds 200 tokens.
      const llmCall = async (messages, vc, opts = {}) => {
        const { onChunk, signal } = opts
        const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
        const providerType = vc.provider || voiceConfig.provider
        const model = vc.model || voiceConfig.model

        // Resolve provider using the same logic as normal chat (_buildAgentRuns)
        const { resolveProviderCreds } = require('./agentRuntimeUtils')
        const creds = resolveProviderCreds(cfg, providerType)
        if (!creds.apiKey) throw new Error(`No API key found for provider "${providerType}"`)
        const resolvedType = creds.type || providerType
        logger.info(`[voice:llmCall] lookup="${providerType}" → type=${resolvedType} hasKey=${!!creds.apiKey} model=${model}`)

        const isOpenAI = ['openai', 'openai_official', 'deepseek', 'minimax', 'openrouter'].includes(resolvedType)
        const clientCfg = {
          apiKey: creds.apiKey,
          baseURL: creds.baseURL,
          customModel: model || creds.model,
          _resolvedProvider: isOpenAI ? 'openai' : resolvedType,
          _directAuth: resolvedType !== 'anthropic',
        }

        if (isOpenAI) {
          const { OpenAIClient } = require('../agent/core/OpenAIClient')
          if (model) clientCfg.customModel = model
          const client = new OpenAIClient(clientCfg)
          const resolvedModel = client.resolveModel()
          const raw = client.getClient()

          // Some providers use max_completion_tokens (newer), others max_tokens (older)
          const tryCreate = async (params) => {
            try {
              return await raw.chat.completions.create({ model: resolvedModel, messages, max_completion_tokens: 400, ...params })
            } catch (e) {
              if (e.message?.includes('max_tokens') || e.message?.includes('max_completion_tokens')) {
                return await raw.chat.completions.create({ model: resolvedModel, messages, max_tokens: 400, ...params })
              }
              throw e
            }
          }

          if (onChunk) {
            const stream = await tryCreate({ stream: true })
            let fullText = ''
            for await (const chunk of stream) {
              if (signal?.aborted) { stream.controller?.abort(); break }
              const delta = chunk.choices?.[0]?.delta?.content || ''
              if (delta) { fullText += delta; onChunk(delta) }
            }
            return { text: fullText, inputTokens: 0, outputTokens: 0 }
          }

          const resp = await tryCreate({})
          return {
            text: resp.choices?.[0]?.message?.content || '',
            inputTokens: resp.usage?.prompt_tokens || 0,
            outputTokens: resp.usage?.completion_tokens || 0,
          }
        } else {
          // Anthropic or OpenRouter — both use AnthropicClient
          const { AnthropicClient } = require('../agent/core/AnthropicClient')
          if (model) clientCfg.customModel = model
          const ac = new AnthropicClient(clientCfg)
          const resolvedModel = ac.resolveModel()
          const client = ac.getClient()
          const system = messages.find(m => m.role === 'system')?.content || ''
          const nonSystem = messages.filter(m => m.role !== 'system')

          if (onChunk) {
            const stream = await client.messages.create({ model: resolvedModel, max_tokens: 400, stream: true, system, messages: nonSystem })
            let fullText = ''
            let inputTokens = 0, outputTokens = 0
            for await (const event of stream) {
              if (signal?.aborted) { stream.controller?.abort(); break }
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                const t = event.delta.text || ''
                if (t) { fullText += t; onChunk(t) }
              } else if (event.type === 'message_start' && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens || 0
              } else if (event.type === 'message_delta' && event.usage) {
                outputTokens = event.usage.output_tokens || 0
              }
            }
            return { text: fullText, inputTokens, outputTokens }
          }

          const resp = await client.messages.create({ model: resolvedModel, max_tokens: 400, system, messages: nonSystem })
          return {
            text: resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '',
            inputTokens: resp.usage?.input_tokens || 0,
            outputTokens: resp.usage?.output_tokens || 0,
          }
        }
      }

      const sendToRenderer = (channel, data) => {
        const mainWindow = winRef.get()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(channel, data)
        }
      }

      // Determine STT mode: local (SenseVoice) or openai (Whisper API)
      const sttMode = params.sttMode || 'openai'
      const localConfig = params.localConfig || null

      activeVoiceSession = new VoiceSession({
        voiceConfig,
        whisperConfig,
        sttMode,
        localConfig,
        agent,
        userAgent: userAgent || {},
        systemSoulContent: systemSoulContent || '',
        userSoulContent: userSoulContent || '',
        history: history || [],
        llmCall,
        onStatus:        (s)    => sendToRenderer('voice:status', s),
        onTranscript:    (text) => sendToRenderer('voice:transcription', { text }),
        onAiText:        (text, meta) => sendToRenderer('voice:ai-text', { text, ...meta }),
        onTaskTriggered: (inst) => sendToRenderer('voice:task-triggered', { instruction: inst }),
        onError:         (msg)  => sendToRenderer('voice:error', { message: msg }),
        onUsage:         (u)    => { sendToRenderer('voice:usage', u); accumulateUsage(chatId, u).catch(() => {}) },
      })

      activeVoiceSession.start()
      return { success: true }
    } catch (err) {
      logger.error('voice:start error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('voice:stop', () => {
    if (activeVoiceSession) {
      activeVoiceSession.stop()
      activeVoiceSession = null
    }
    return { success: true }
  })

  ipcMain.handle('voice:audio-chunk', async (event, audioBuffer, mimeType) => {
    if (!activeVoiceSession) return { success: false, error: 'No active voice session' }
    try {
      activeVoiceSession.processAudio(Buffer.from(audioBuffer), mimeType) // fire and forget — results come via events
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('voice:mute', (event, { muted }) => {
    if (activeVoiceSession) activeVoiceSession.setMuted(muted)
    return { success: true }
  })

  ipcMain.handle('voice:update-history', (event, history) => {
    if (activeVoiceSession) activeVoiceSession.history = history || []
    return { success: true }
  })

  ipcMain.handle('voice:task-complete', async (event, summary) => {
    if (activeVoiceSession) {
      activeVoiceSession.notifyTaskComplete(summary)
    }
    return { success: true }
  })

  // OpenAI TTS HD — returns audio buffer as base64 for renderer playback
  ipcMain.handle('voice:tts', async (event, { text, apiKey, baseURL, model, voice }) => {
    try {
      if (!text || !apiKey) return { success: false, error: 'Missing text or API key' }
      const ttsModel = model || 'tts-1' // 'tts-1' = $15/1M chars, 'tts-1-hd' = $30/1M chars
      const base = (baseURL || 'https://api.openai.com').replace(/\/+$/, '')
      const isStandard = base.includes('api.openai.com')
      const url = isStandard
        ? `${base}/v1/audio/speech`
        : `${base}/proxy/openai/v1/audio/speech`
      const authHeader = isStandard
        ? { 'Authorization': `Bearer ${apiKey}` }
        : { 'x-api-key': apiKey }
      const resp = await fetch(url, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ttsModel, input: text, voice: voice || 'alloy', response_format: 'mp3' }),
      })
      if (!resp.ok) {
        const body = await resp.text()
        return { success: false, error: `TTS API error ${resp.status}: ${body.slice(0, 200)}` }
      }
      const arrayBuf = await resp.arrayBuffer()
      return { success: true, audio: Buffer.from(arrayBuf).toString('base64'), format: 'mp3' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ── Local Voice: Setup environment (auto-downloads Python if needed) ────
  ipcMain.handle('voice:local-setup-env', async () => {
    const venvPath = resolveVenvPath()
    const dataDir = ds.paths().DATA_DIR || ds.paths().CONFIG_FILE.replace(/[/\\]config\.json$/, '')
    const setupScript = path.join(__dirname, '../agent/voice/setup_env.py')

    const sendProgress = (data) => {
      const mainWindow = winRef.get()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('voice:setup-progress', data)
      }
    }

    try {
      // Step 1: Find or download a compatible Python (3.10–3.12)
      logger.info(`[voice:setup] Starting environment setup. venvPath=${venvPath}`)
      sendProgress({ step: 'python', progress: 2, message: 'Finding compatible Python...' })
      const py = await ensurePython(dataDir, (pct, msg) => {
        logger.info(`[voice:setup] Python: ${msg}`)
        sendProgress({ step: 'python', progress: 2 + Math.round(pct * 0.18), message: msg })
      })
      const pythonPath = py.path
      logger.info(`[voice:setup] Using Python ${py.version} at ${pythonPath}`)
      sendProgress({ step: 'python', progress: 20, message: `Using Python ${py.version}` })

      // Step 2: Run setup_env.py with the resolved Python
      // Redirect model cache next to the venv (same parent as installPath, e.g. d:\clankai\data\)
      const modelCacheDir = path.join(path.dirname(venvPath), 'model_cache')
      const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
      const modelSource = cfg.voiceCall?.local?.modelSource || 'modelscope'
      const setupEnv = { ...process.env, MODELSCOPE_CACHE: modelCacheDir, HF_HUB_CACHE: modelCacheDir, MODEL_SOURCE: modelSource }
      logger.info(`[voice:setup] Running: ${pythonPath} ${setupScript} --venv-path ${venvPath}`)
      return await new Promise((resolve) => {
        const child = spawn(pythonPath, [setupScript, '--venv-path', venvPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          env: setupEnv,
        })

        let lastError = ''

        child.stdout.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(Boolean)
          for (const line of lines) {
            try {
              const data = JSON.parse(line)
              // Remap setup_env.py progress (0-100) to overall 20-100%
              const mapped = { ...data, progress: 20 + Math.round((data.progress / 100) * 80) }
              sendProgress(mapped)
              logger.info(`[voice:setup] [${data.step}] ${data.progress}% — ${data.message}`)
              if (data.step === 'error') lastError = data.message
            } catch {
              // Non-JSON output (raw pip/model output) — log and show
              logger.info(`[voice:setup] ${line}`)
              sendProgress({ step: 'detail', progress: -1, message: line.slice(0, 120) })
            }
          }
        })

        child.stderr.on('data', (chunk) => {
          const msg = chunk.toString().trim()
          // Filter out pip notices (not real errors)
          const realLines = msg.split('\n').filter(l => !l.trim().startsWith('[notice]'))
          if (realLines.length) {
            lastError = realLines.join('\n')
            logger.warn(`[voice:setup:stderr] ${lastError}`)
          }
        })

        child.on('exit', (code) => {
          if (code === 0) {
            logger.info(`[voice:setup] Setup completed successfully.`)
            resolve({ success: true, venvPath, pythonPath })
          } else {
            logger.error(`[voice:setup] Setup failed with code ${code}: ${lastError}`)
            resolve({ success: false, error: lastError || `Setup exited with code ${code}` })
          }
        })

        child.on('error', (err) => {
          logger.error(`[voice:setup] Process error: ${err.message}`)
          resolve({ success: false, error: err.message })
        })
      })
    } catch (err) {
      sendProgress({ step: 'error', progress: -1, message: err.message })
      return { success: false, error: err.message }
    }
  })

  // ── Local Voice: Start server ───────────────────────────────────────────
  ipcMain.handle('voice:local-start-server', async () => {
    try {
      const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
      const vc = cfg.voiceCall || {}
      const local = vc.local || {}
      const dataDir = ds.paths().DATA_DIR || ds.paths().CONFIG_FILE.replace(/[/\\]config\.json$/, '')

      const venvPath = resolveVenvPath()
      const venvPyBin = process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python')
      if (!fs.existsSync(venvPyBin)) {
        return { success: false, error: 'ENV_NOT_SETUP' }
      }

      // Config stores short model names (e.g. "SenseVoiceSmall"); ensure iic/ namespace
      const ensureNs = (id, fallback) => {
        if (!id) return fallback
        return id.includes('/') ? id : `iic/${id}`
      }
      const server = LocalVoiceServer.getInstance({
        pythonPath: venvPyBin,
        port: local.serverPort || 8199,
        sttModel: ensureNs(local.sttModel, 'iic/SenseVoiceSmall'),
        modelSource: local.modelSource || 'modelscope',
        device: 'auto',
        dataDir,
      })

      await server.start()
      return { success: true, port: server.port }
    } catch (err) {
      logger.error('[voice:local-start-server]', err.message)
      return { success: false, error: err.message }
    }
  })

  // ── Local Voice: Stop server ────────────────────────────────────────────
  ipcMain.handle('voice:local-stop-server', async () => {
    try {
      const server = LocalVoiceServer.getInstance()
      if (server) await server.stop()
      LocalVoiceServer.clearInstance()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ── Local Voice: Verify environment is functional ────────────────────────
  ipcMain.handle('voice:local-check-env', async () => {
    const venvPath = resolveVenvPath()
    logger.info(`[voice:check-env] venvPath=${venvPath}`)
    const pyBin = process.platform === 'win32'
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python')

    const result = { ready: false, packages: false, sttModel: false, reason: '' }

    // 1. Check venv exists
    if (!fs.existsSync(pyBin)) {
      result.reason = 'Python venv not found'
      return result
    }

    // 2. Check key packages can be imported (funasr + edge_tts + torch)
    const importCheck = `import funasr, fastapi, torch, edge_tts; print("ok")`
    try {
      const pkgOk = await new Promise((resolve) => {
        logger.info(`[voice:check-env] running: ${pyBin} -c "${importCheck}"`)
        execFile(pyBin, ['-c', importCheck], { timeout: 60000 }, (err, stdout, stderr) => {
          const out = (stdout || '').trim()
          logger.info(`[voice:check-env] exit=${err ? err.code || err.message : 0} stdout="${out.slice(0, 200)}"`)
          if (stderr) logger.info(`[voice:check-env] stderr: ${stderr.slice(0, 500)}`)
          resolve(!err && out.endsWith('ok'))
        })
      })
      result.packages = pkgOk
      if (!pkgOk) {
        result.reason = 'Missing packages (funasr/edge_tts/fastapi/torch)'
        return result
      }
    } catch (e) {
      result.reason = `Package check failed: ${e.message}`
      return result
    }

    // 3. Check STT model cached on disk
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const modelCache = path.join(path.dirname(venvPath), 'model_cache')

    const hasModelFiles = (dir) => {
      if (!fs.existsSync(dir)) return false
      try {
        const files = fs.readdirSync(dir, { recursive: true })
        return files.some(f => /\.(bin|pt|pth|safetensors|onnx)$/i.test(String(f)))
      } catch { return false }
    }

    result.sttModel = [
      path.join(modelCache, 'hub', 'iic', 'SenseVoiceSmall'),
      path.join(modelCache, 'hub', 'models', 'iic', 'SenseVoiceSmall'),
      path.join(home, '.cache', 'modelscope', 'hub', 'iic', 'SenseVoiceSmall'),
      path.join(home, '.cache', 'modelscope', 'hub', 'models', 'iic', 'SenseVoiceSmall'),
      path.join(modelCache, 'FunAudioLLM--SenseVoiceSmall'),
      path.join(home, '.cache', 'huggingface', 'hub', 'models--FunAudioLLM--SenseVoiceSmall'),
    ].some(hasModelFiles)

    result.ready = result.packages && result.sttModel
    if (!result.ready) {
      const missing = []
      if (!result.sttModel) missing.push('STT model')
      if (!result.packages) missing.push('packages')
      result.reason = `Missing: ${missing.join(', ')}`
    }

    logger.info(`[voice:check-env] packages=${result.packages} sttModel=${result.sttModel} → ready=${result.ready}`)
    return result
  })

  // ── Local Voice: Remove environment ─────────────────────────────────────
  ipcMain.handle('voice:remove-local-env', async () => {
    const venvPath = resolveVenvPath()
    const modelCache = path.join(path.dirname(venvPath), 'model_cache')
    logger.info(`[voice:remove-env] Removing venv=${venvPath} modelCache=${modelCache}`)
    // Stop server if running
    try {
      const server = LocalVoiceServer.getInstance()
      if (server) { await server.stop(); LocalVoiceServer.clearInstance() }
    } catch {}
    // Remove directories
    const rm = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} }
    rm(venvPath)
    rm(modelCache)
    logger.info('[voice:remove-env] Done')
    return { success: true }
  })

  // ── Local Voice: GPU detection ──────────────────────────────────────────
  ipcMain.handle('voice:detect-gpu', async () => {
    try {
      const result = await new Promise((resolve) => {
        execFile('nvidia-smi', [
          '--query-gpu=name,memory.total,compute_cap',
          '--format=csv,noheader,nounits',
        ], { timeout: 10000, windowsHide: true }, (err, stdout) => {
          if (err) return resolve({ available: false, name: '' })
          const line = (stdout || '').trim().split('\n')[0]
          if (!line) return resolve({ available: false, name: '' })
          const parts = line.split(',').map(s => s.trim())
          const name = parts[0] || 'NVIDIA GPU'
          const vramMB = parseInt(parts[1], 10) || 0
          const cap = parseFloat(parts[2]) || 0
          const cudaOk = cap === 0 ? true : cap >= 5.0  // if can't read CC, assume supported
          resolve({
            available: true,
            cudaSupported: cudaOk,
            name,
            vram: vramMB ? `${Math.round(vramMB / 1024 * 10) / 10} GB VRAM` : '',
            computeCap: cap,
            hint: cudaOk ? '' : `Compute Capability ${cap} < 5.0, CUDA not supported — will use CPU`,
          })
        })
      })
      return result
    } catch {
      return { available: false, name: '' }
    }
  })

  // ── Local Voice: Health check ───────────────────────────────────────────
  ipcMain.handle('voice:local-health', async () => {
    const server = LocalVoiceServer.getInstance()
    if (!server) return { running: false, starting: false }
    if (server.isStarting()) return { running: false, starting: true }
    const health = await server.healthCheck()
    return health ? { running: true, starting: false, ...health } : { running: false, starting: false }
  })

  // ── Local Voice: TTS ───────────────────────────────────────────────────
  ipcMain.handle('voice:local-tts', async (event, { text, voice, language }) => {
    try {
      if (!text) return { success: false, error: 'Text is required' }
      const voiceId = voice || 'zh-CN-XiaoxiaoNeural'
      const python = await resolvePreferredPython()
      if (!python) return { success: false, error: 'Python not available' }
      const edgeTtsOk = await ensureEdgeTts(python)
      if (!edgeTtsOk) return { success: false, error: 'Failed to ensure edge-tts package' }
      return await synthesizeEdgeTtsToBase64(python, voiceId, text, 60000)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ── Local Voice: End-to-end test ───────────────────────────────────────
  ipcMain.handle('voice:local-test', async () => {
    try {
      const server = LocalVoiceServer.getInstance()
      if (!server || !server.isRunning()) {
        return { success: false, error: 'Local voice server is not running' }
      }

      // Test health
      const health = await server.healthCheck()
      if (!health) return { success: false, error: 'Server health check failed' }

      // Test TTS with a short phrase
      const form = new (require('form-data'))()
      form.append('text', 'Hello, this is a test.')
      form.append('voice', 'default')

      const ttsResp = await fetch(`${server.getServerURL()}/tts`, {
        method: 'POST',
        headers: form.getHeaders(),
        body: form.getBuffer(),
        signal: AbortSignal.timeout(30000),
      })

      return {
        success: true,
        sttOk: !!health.stt_model,
        ttsOk: ttsResp.ok,
        gpu: health.gpu || false,
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ── Local Voice: List available TTS speakers ───────────────────────────
  // ── Edge-TTS: List voices ──────────────────────────────────────────────
  ipcMain.handle('voice:edge-voices', async () => {
    try {
      const server = LocalVoiceServer.getInstance()
      if (!server || !server.isRunning()) return { voices: [] }
      const resp = await fetch(`${server.getServerURL()}/edge-voices`, {
        signal: AbortSignal.timeout(10000),
      })
      if (resp.ok) return await resp.json()
    } catch {}
    return { voices: [] }
  })

  // ── Edge-TTS: Preview voice ───────────────────────────────────────────
  ipcMain.handle('voice:edge-preview', async (event, { voice, language }) => {
    try {
      if (!voice) return { success: false, error: 'Voice not specified' }
      const previewTexts = {
        'zh-CN': '你好，很高兴认识你。今天天气真不错。',
        'en-US': 'Hello, nice to meet you. How are you today?',
      }
      const locale = voice.split('-').slice(0, 2).join('-')
      const text = previewTexts[locale] || previewTexts['en-US']
      const python = await resolvePreferredPython()
      if (!python) return { success: false, error: 'Python not available' }
      const edgeTtsOk = await ensureEdgeTts(python)
      if (!edgeTtsOk) return { success: false, error: 'Failed to ensure edge-tts package' }
      return await synthesizeEdgeTtsToBase64(python, voice, text, 15000)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

/** Stop the local voice server (called from app.before-quit). */
async function stopLocalServer() {
  try {
    const server = LocalVoiceServer.getInstance()
    if (server) {
      await server.stop()
      LocalVoiceServer.clearInstance()
    }
  } catch (err) {
    logger.warn('[voice] stopLocalServer error:', err.message)
  }
}

module.exports = { register, stopLocalServer }
