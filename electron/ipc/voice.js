/**
 * IPC handlers for voice call sessions and TTS.
 * Channels: voice:*
 */
const path = require('path')
const fs = require('fs')
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')
const VoiceSession = require('../agent/voice/VoiceSession')

let activeVoiceSession = null

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
  ipcMain.handle('voice:start', async (event, { chatId, agentId, history, voiceConfig, agent, userAgent, whisperConfig }) => {
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
        const provider = vc.provider || voiceConfig.provider
        const model = vc.model || voiceConfig.model

        if (provider === 'openai') {
          const { OpenAIClient } = require('../agent/core/OpenAIClient')
          const clientCfg = {
            ...cfg,
            openaiApiKey: cfg.openai?.apiKey || cfg.openaiApiKey,
            openaiBaseURL: cfg.openai?.baseURL || cfg.openaiBaseURL,
            _resolvedProvider: 'openai',
          }
          if (model) clientCfg.customModel = model
          const client = new OpenAIClient(clientCfg)
          const resolvedModel = client.resolveModel()
          const raw = client.getClient()

          if (onChunk) {
            const stream = await raw.chat.completions.create({ model: resolvedModel, messages, max_tokens: 400, stream: true })
            let fullText = ''
            for await (const chunk of stream) {
              if (signal?.aborted) { stream.controller?.abort(); break }
              const delta = chunk.choices?.[0]?.delta?.content || ''
              if (delta) { fullText += delta; onChunk(delta) }
            }
            return { text: fullText, inputTokens: 0, outputTokens: 0 }
          }

          const resp = await raw.chat.completions.create({ model: resolvedModel, messages, max_tokens: 400 })
          return {
            text: resp.choices?.[0]?.message?.content || '',
            inputTokens: resp.usage?.prompt_tokens || 0,
            outputTokens: resp.usage?.completion_tokens || 0,
          }
        } else {
          // Anthropic or OpenRouter — both use AnthropicClient
          const { AnthropicClient } = require('../agent/core/AnthropicClient')
          const provCfg = provider === 'openrouter' ? cfg.openrouter : cfg.anthropic
          const clientCfg = {
            ...cfg,
            apiKey: provCfg?.apiKey || cfg.apiKey,
            baseURL: provCfg?.baseURL || cfg.baseURL,
          }
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

      activeVoiceSession = new VoiceSession({
        voiceConfig,
        whisperConfig,
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

  ipcMain.handle('voice:audio-chunk', async (event, audioBuffer) => {
    if (!activeVoiceSession) return { success: false, error: 'No active voice session' }
    try {
      activeVoiceSession.processAudio(Buffer.from(audioBuffer)) // fire and forget — results come via events
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
}

module.exports = { register }
