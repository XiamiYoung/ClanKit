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

let activeVoiceSession = null

/** Resolve the venv path from saved config (single source of truth). */
function resolveVenvPath() {
  const dataDir = ds.paths().DATA_DIR
  const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
  return cfg.voiceCall?.local?.installPath || path.join(dataDir, 'local-voice-env')
}

/** @deprecated resolvePreferredPython removed — no longer needed. */

const memoryStore = require('../memory/memoryStore')

/** Read agent memory as markdown via the SQLite-backed MemoryStore. Returns null when missing. */
function readMemoryFileSync(agentId, agentType) {
  if (!agentId) return null
  try {
    const store = memoryStore.getInstance(ds.paths().MEMORY_DIR)
    return store.readMarkdown(agentId, agentType)
  } catch (err) {
    logger.error('readMemoryFileSync error', err.message)
    return null
  }
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

      // Load memory for both agents.
      // systemMemoryContent = system agent's personality/knowledge
      // userMemoryContent = factual profile data about the user (NOT roleplay instructions)
      const systemMemoryContent = readMemoryFileSync(agent?.id || agentId, 'system')
      const userMemoryContent = readMemoryFileSync(userAgent?.id, 'users')

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

        const isGoogle = resolvedType === 'google'
        const isOpenAI = ['openai', 'openai_official', 'deepseek', 'minimax', 'openrouter'].includes(resolvedType)
        const clientCfg = {
          apiKey: creds.apiKey,
          baseURL: creds.baseURL,
          customModel: model || creds.model,
          _resolvedProvider: isOpenAI ? 'openai' : resolvedType,
          _directAuth: resolvedType !== 'anthropic',
          _scenario: 'voice',
        }

        if (isGoogle) {
          // Google Gemini — use @google/genai SDK directly
          const { GoogleGenAI } = require('@google/genai')
          const genai = new GoogleGenAI({ apiKey: creds.apiKey })
          const resolvedModel = model || creds.model || 'gemini-2.0-flash-001'

          if (onChunk) {
            const response = await genai.models.generateContentStream({
              model: resolvedModel,
              contents: messages.filter(m => m.role !== 'system').map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
              })),
              config: {
                maxOutputTokens: 400,
                systemInstruction: messages.find(m => m.role === 'system')?.content || undefined,
              },
            })
            let fullText = ''
            for await (const chunk of response) {
              if (signal?.aborted) break
              const delta = chunk.text || ''
              if (delta) { fullText += delta; onChunk(delta) }
            }
            return { text: fullText, inputTokens: 0, outputTokens: 0 }
          }

          const response = await genai.models.generateContent({
            model: resolvedModel,
            contents: messages.filter(m => m.role !== 'system').map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
            config: {
              maxOutputTokens: 400,
              systemInstruction: messages.find(m => m.role === 'system')?.content || undefined,
            },
          })
          return {
            text: response.text || '',
            inputTokens: response.usageMetadata?.promptTokenCount || 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
          }
        } else if (isOpenAI) {
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

      // Determine STT mode: local (SenseVoice via sherpa-onnx) or openai (Whisper API)
      const sttMode = params.sttMode || 'openai'
      let localConfig = params.localConfig || null
      // Inject modelDir for sherpa-onnx STT if local mode
      if (sttMode === 'local' && !localConfig?.modelDir) {
        const { getModelDir } = require('../agent/voice/sttModelManager')
        const dataDir = ds.paths().DATA_DIR
        localConfig = { ...(localConfig || {}), modelDir: getModelDir(dataDir) }
      }

      activeVoiceSession = new VoiceSession({
        voiceConfig,
        whisperConfig,
        sttMode,
        localConfig,
        agent,
        userAgent: userAgent || {},
        systemMemoryContent: systemMemoryContent || '',
        userMemoryContent: userMemoryContent || '',
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

  // Barge-in: user started speaking — abort active LLM stream immediately so the
  // session is ready to process the new audio chunk when it arrives.
  ipcMain.handle('voice:barge-in', () => {
    if (activeVoiceSession) activeVoiceSession.bargeIn()
    return { success: true }
  })

  ipcMain.handle('voice:update-history', async (event, history) => {
    if (activeVoiceSession) {
      activeVoiceSession.history = history || []
      // Regenerate the status digest so voice agent stays aware of new actions
      await activeVoiceSession._generateChatDigest()
    }
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

  // ── Local STT: Download ONNX model (replaces Python setup) ─────────────
  ipcMain.handle('voice:local-setup-env', async () => {
    const dataDir = ds.paths().DATA_DIR
    const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
    const modelSource = cfg.voiceCall?.local?.modelSource || 'huggingface'

    const sendProgress = (data) => {
      const mainWindow = winRef.get()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('voice:setup-progress', data)
      }
    }

    try {
      const { downloadModel } = require('../agent/voice/sttModelManager')
      const result = await downloadModel(dataDir, sendProgress, modelSource)
      if (result.success) {
        return { success: true, modelDir: result.modelDir }
      }
      return { success: false, error: result.error }
    } catch (err) {
      sendProgress({ step: 'error', progress: -1, message: err.message })
      return { success: false, error: err.message }
    }
  })

  // ── Legacy Python setup handlers (kept for backward compatibility) ─────
  // The following handlers previously managed Python venv + FastAPI server.
  // They now delegate to sherpa-onnx model management or return no-ops.

  ipcMain.handle('voice:local-start-server', async () => {
    // No server needed — sherpa-onnx runs in-process
    return { success: true, port: 0 }
  })

  ipcMain.handle('voice:local-stop-server', async () => {
    return { success: true }
  })

  ipcMain.handle('voice:local-check-env', async () => {
    const dataDir = ds.paths().DATA_DIR
    const { isModelReady } = require('../agent/voice/sttModelManager')
    const status = isModelReady(dataDir)
    return {
      ready: status.ready,
      packages: status.ready, // sherpa-onnx-node is always available (bundled)
      sttModel: status.ready,
      reason: status.reason || '',
    }
  })

  ipcMain.handle('voice:remove-local-env', async () => {
    const dataDir = ds.paths().DATA_DIR
    const { removeModel } = require('../agent/voice/sttModelManager')
    removeModel(dataDir)
    // Also clean up legacy Python env if exists
    const venvPath = resolveVenvPath()
    const modelCache = path.join(path.dirname(venvPath), 'model_cache')
    const rm = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} }
    rm(venvPath)
    rm(modelCache)
    logger.info('[voice:remove-env] Done')
    return { success: true }
  })

  // Legacy Python setup code removed — replaced by sherpa-onnx model download above.

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

  // ── Local STT: Health check (model-based, no server) ────────────────────
  ipcMain.handle('voice:local-health', async () => {
    const dataDir = ds.paths().DATA_DIR
    const { isModelReady } = require('../agent/voice/sttModelManager')
    const status = isModelReady(dataDir)
    return {
      running: status.ready,
      starting: false,
      stt_model: status.ready ? 'SenseVoice (ONNX)' : null,
      tts_engine: 'Edge-TTS (Node.js)',
      gpu: false,
    }
  })

  // ── Local Voice: TTS (now delegates to Node.js Edge TTS) ────────────────
  ipcMain.handle('voice:local-tts', async (event, { text, voice, language }) => {
    try {
      if (!text) return { success: false, error: 'Text is required' }
      const voiceId = voice || 'zh-CN-XiaoxiaoNeural'
      const { tts } = require('../agent/voice/edgeTtsNode')
      const audioBuffer = await tts(text, { voice: voiceId })
      return { success: true, audio: audioBuffer.toString('base64'), format: 'mp3' }
    } catch (err) {
      logger.warn(`[voice:local-tts] failed: ${err.message}`)
      return { success: false, error: err.message }
    }
  })

  // ── Local STT: End-to-end test (sherpa-onnx, no server) ────────────────
  ipcMain.handle('voice:local-test', async () => {
    try {
      const dataDir = ds.paths().DATA_DIR
      const { isModelReady, getModelDir } = require('../agent/voice/sttModelManager')
      const status = isModelReady(dataDir)
      if (!status.ready) return { success: false, error: status.reason || 'Model not installed' }

      // Quick inference test with silence
      const SherpaOnnxSTT = require('../agent/voice/SherpaOnnxSTT')
      const stt = new SherpaOnnxSTT({ modelDir: getModelDir(dataDir) })

      // Generate a tiny WAV (0.5s silence, 16kHz 16-bit mono)
      const numSamples = 8000
      const wavBuf = Buffer.alloc(44 + numSamples * 2)
      wavBuf.write('RIFF', 0)
      wavBuf.writeUInt32LE(36 + numSamples * 2, 4)
      wavBuf.write('WAVE', 8)
      wavBuf.write('fmt ', 12)
      wavBuf.writeUInt32LE(16, 16)
      wavBuf.writeUInt16LE(1, 20)  // PCM
      wavBuf.writeUInt16LE(1, 22)  // mono
      wavBuf.writeUInt32LE(16000, 24)
      wavBuf.writeUInt32LE(32000, 28)
      wavBuf.writeUInt16LE(2, 32)
      wavBuf.writeUInt16LE(16, 34)
      wavBuf.write('data', 36)
      wavBuf.writeUInt32LE(numSamples * 2, 40)
      // samples are all zeros (silence)

      const result = await stt.transcribe(wavBuf, 'audio/wav')
      return { success: true, sttOk: true, ttsOk: true, gpu: false }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ── Edge-TTS: List voices (Node.js, no Python) ─────────────────────────
  ipcMain.handle('voice:edge-voices', async () => {
    try {
      const { getVoices } = require('../agent/voice/edgeTtsNode')
      const rawVoices = await getVoices()
      const voices = rawVoices.map(v => ({
        id: v.ShortName,
        name: v.FriendlyName || v.ShortName,
        gender: v.Gender,
        locale: v.Locale,
      }))
      return { voices }
    } catch (err) {
      logger.warn(`[voice:edge-voices] failed: ${err.message}`)
      return { voices: [] }
    }
  })

  // ── Edge-TTS Node.js (no Python) ─────────────────────────────────────
  ipcMain.handle('voice:edge-tts-node', async (event, { text, voice }) => {
    try {
      if (!text) return { success: false, error: 'Text is required' }
      const voiceId = voice || 'zh-CN-XiaoxiaoNeural'
      const { tts } = require('../agent/voice/edgeTtsNode')
      const audioBuffer = await tts(text, { voice: voiceId })
      return { success: true, audio: audioBuffer.toString('base64'), format: 'mp3' }
    } catch (err) {
      logger.warn(`[voice:edge-tts-node] failed: ${err.message}`)
      return { success: false, error: err.message }
    }
  })

  // ── Edge-TTS: Chunked synthesis with pipeline playback ──────────────────

  /** Split text into TTS-friendly chunks (paragraphs, with merge/split heuristics). */
  function splitTextForTTS(text) {
    // Split on double newlines (paragraphs)
    let parts = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    if (parts.length === 0) return [text.trim()].filter(Boolean)

    // Merge short paragraphs (<80 chars) with the next one
    const merged = []
    let buf = ''
    for (const p of parts) {
      if (buf) {
        buf += '\n' + p
        if (buf.length >= 80) { merged.push(buf); buf = '' }
      } else if (p.length < 80) {
        buf = p
      } else {
        merged.push(p)
      }
    }
    if (buf) merged.push(buf)

    // Split long chunks (>800 chars) at sentence boundaries
    const result = []
    for (const chunk of merged) {
      if (chunk.length <= 800) { result.push(chunk); continue }
      // Split at sentence-ending punctuation
      const sentences = chunk.split(/(?<=[。！？.!?\n])\s*/).filter(Boolean)
      let cur = ''
      for (const s of sentences) {
        if (cur.length + s.length > 800 && cur) { result.push(cur); cur = '' }
        cur += (cur ? ' ' : '') + s
      }
      if (cur) result.push(cur)
    }
    return result.length > 0 ? result : [text.trim()].filter(Boolean)
  }

  const activeTtsSessions = new Map()

  ipcMain.handle('voice:edge-tts-chunked', async (event, { text, voice, sessionId }) => {
    try {
      if (!text) return { success: false, error: 'Text is required' }
      const voiceId = voice || 'zh-CN-XiaoxiaoNeural'
      const { tts } = require('../agent/voice/edgeTtsNode')
      const chunks = splitTextForTTS(text)

      // Single chunk: return inline (same as voice:edge-tts-node)
      if (chunks.length <= 1) {
        const buf = await tts(chunks[0] || text, { voice: voiceId })
        return { success: true, mode: 'single', audio: buf.toString('base64'), format: 'mp3' }
      }

      // Multi-chunk: parallel synthesis with concurrency limit
      const sessionDir = path.join(os.tmpdir(), `clankit-tts-${sessionId}`)
      await fs.promises.mkdir(sessionDir, { recursive: true })
      activeTtsSessions.set(sessionId, { cancelled: false })

      const CONCURRENCY = 3
      const pending = new Set()

      for (let i = 0; i < chunks.length; i++) {
        if (activeTtsSessions.get(sessionId)?.cancelled) break

        const idx = i
        const promise = (async () => {
          try {
            const buf = await tts(chunks[idx], { voice: voiceId })
            if (activeTtsSessions.get(sessionId)?.cancelled) return
            const filePath = path.join(sessionDir, `${idx}.mp3`)
            await fs.promises.writeFile(filePath, buf)
            event.sender.send('voice:tts-chunk-ready', {
              sessionId, index: idx, total: chunks.length, filePath,
            })
          } catch (err) {
            logger.warn(`[tts-chunked] chunk ${idx} failed: ${err.message}`)
          }
        })()

        pending.add(promise)
        promise.finally(() => pending.delete(promise))
        if (pending.size >= CONCURRENCY) await Promise.race(pending)
      }

      await Promise.allSettled([...pending])
      activeTtsSessions.delete(sessionId)
      return { success: true, mode: 'chunked', totalChunks: chunks.length, sessionDir }
    } catch (err) {
      logger.warn(`[voice:edge-tts-chunked] failed: ${err.message}`)
      activeTtsSessions.delete(sessionId)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('voice:edge-tts-cancel', (_, { sessionId }) => {
    const session = activeTtsSessions.get(sessionId)
    if (session) session.cancelled = true
    activeTtsSessions.delete(sessionId)
    return { success: true }
  })

  ipcMain.handle('voice:edge-tts-cleanup', async (_, { sessionDir }) => {
    try {
      if (sessionDir && sessionDir.includes('clankit-tts-')) {
        await fs.promises.rm(sessionDir, { recursive: true, force: true })
      }
      return { success: true }
    } catch (err) {
      logger.warn(`[voice:edge-tts-cleanup] failed: ${err.message}`)
      return { success: false, error: err.message }
    }
  })

  // ── Edge-TTS: Preview voice (Node.js, no Python) ───────────────────────
  ipcMain.handle('voice:edge-preview', async (event, { voice, language, text: customText }) => {
    try {
      if (!voice) return { success: false, error: 'Voice not specified' }
      const previewTexts = {
        'zh-CN': '你好，很高兴认识你。今天天气真不错。',
        'en-US': 'Hello, nice to meet you. How are you today?',
      }
      const locale = voice.split('-').slice(0, 2).join('-')
      const text = customText || previewTexts[locale] || previewTexts['en-US']
      const { tts } = require('../agent/voice/edgeTtsNode')
      const audioBuffer = await tts(text, { voice, timeout: 15000 })
      return { success: true, audio: audioBuffer.toString('base64'), format: 'mp3' }
    } catch (err) {
      logger.warn(`[voice:edge-preview] failed: ${err.message}`)
      return { success: false, error: err.message }
    }
  })
}

/** Stop/cleanup (called from app.before-quit). No-op since sherpa-onnx runs in-process. */
async function stopLocalServer() {
  try {
    const SherpaOnnxSTT = require('../agent/voice/SherpaOnnxSTT')
    SherpaOnnxSTT.release()
  } catch {}
}

module.exports = { register, stopLocalServer }
