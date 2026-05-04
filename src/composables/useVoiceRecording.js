/**
 * useVoiceRecording — voice call, mic/VAD capture, TTS, and voice event listeners.
 *
 * Extracted from ChatsView.vue. Depends on stores only (no Vue component instance).
 * Call handleVoiceTask needs { inputText (Ref), sendMessage (fn) } passed via opts.
 */
import { useVoiceStore } from '../stores/voice'
import { useConfigStore } from '../stores/config'
import { useAgentsStore } from '../stores/agents'
import { useChatsStore } from '../stores/chats'
import { useI18n } from '../i18n/useI18n'

import { ref, watch } from 'vue'

export function useVoiceRecording({ inputText, sendMessage } = {}) {
  const voiceStore = useVoiceStore()
  const configStore = useConfigStore()
  const agentsStore = useAgentsStore()
  const chatsStore = useChatsStore()
  const { t } = useI18n()

  // Exposed error state for voice config dialogs
  const voiceServerError = ref('')  // 'SERVER_NOT_RUNNING' | 'VOICE_DISABLED' | 'WHISPER_NOT_CONFIGURED'
  function _showVoiceError(code) {
    voiceServerError.value = code
  }

  // Preview limit modal state (voice call daily limit)
  const showVoiceLimitModal = ref(false)
  const voiceLimitMessage = ref('')

  // Auto-stop when daily limit is hit during an active call
  watch(() => voiceStore.isDailyVoiceLimitReached, (reached) => {
    if (reached && voiceStore.isCallActive) {
      window.electronAPI?.stopVoiceCall?.()
      voiceStore.endCall()
      voiceLimitMessage.value = t('limits.maxVoiceSecsPerDayAutoStop')
      showVoiceLimitModal.value = true
    }
  })

  // ── Voice call ──
  async function handleStartCall(chatId) {
    // Block if daily voice limit already reached
    if (voiceStore.isDailyVoiceLimitReached) {
      voiceLimitMessage.value = t('limits.maxVoiceSecsPerDay')
      showVoiceLimitModal.value = true
      return
    }

    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (!chat) return
    // Use active agent count, not isGroupChat flag (which stays true after removing agents)
    const activeCount = chat.groupAgentIds?.length > 0 ? chat.groupAgentIds.length : 1
    if (activeCount > 1) return
    if (voiceStore.isCallActive) return

    // Resolve system agent — use same logic as activeSystemAgentIds in ChatHeader
    const agentId = (chat.groupAgentIds?.length > 0 ? chat.groupAgentIds[0] : null)
      || chat.systemAgentId
      || agentsStore.defaultSystemAgent?.id
    const agent = agentId ? agentsStore.getAgentById(agentId) : null

    // Resolve user agent
    const userAgentId = chat.userAgentId || agentsStore.defaultUserAgent?.id
    const userAgent = userAgentId ? agentsStore.getAgentById(userAgentId) : null

    // Resolve provider/model from agent (provider is always on the agent now)
    const chatProvider = agent?.providerId || 'anthropic'
    const chatModel = agent?.modelId || ''

    // Ensure messages loaded
    await chatsStore.ensureMessages(chatId)
    const history = (chat.messages || []).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }))

    // Resolve voice mode config
    const vc = configStore.config.voiceCall || {}
    const voiceMode = vc.mode || 'disabled'

    // Pre-check: voice mode must be configured
    if (voiceMode === 'disabled') {
      _showVoiceError('VOICE_DISABLED')
      return
    }

    // Whisper config (used when mode is 'openai' or unset)
    const whisperConfig = {
      apiKey: vc.whisperApiKey || '',
      baseURL: vc.whisperBaseURL || 'https://api.openai.com',
      directAuth: vc.whisperDirectAuth === true,
      language: vc.language || '',
    }

    // Pre-check: verify local STT model is ready BEFORE showing call overlay
    if (voiceMode === 'local') {
      try {
        const envCheck = await window.electronAPI?.voice?.localCheckEnv()
        if (!envCheck?.ready) {
          _showVoiceError('SERVER_NOT_RUNNING')
          return
        }
      } catch {
        _showVoiceError('SERVER_NOT_RUNNING')
        return
      }
    }

    // Pre-check: OpenAI mode needs whisper API key
    if (voiceMode === 'openai' && !whisperConfig.apiKey) {
      _showVoiceError('WHISPER_NOT_CONFIGURED')
      return
    }

    // Update voice store (shows call overlay)
    voiceStore.startCall(chatId, agentId, agent?.name || 'AI', chatModel)

    // Start backend voice session
    if (window.electronAPI?.voice?.start) {
      const startPayload = {
        chatId,
        agentId,
        history,
        voiceConfig: { provider: chatProvider, model: chatModel },
        agent: {
          id: agentId,
          name: agent?.name,
          description: agent?.description,
          systemPrompt: agent?.prompt,
        },
        userAgent: {
          id: userAgentId || '__default_user__',
          name: userAgent?.name,
          description: userAgent?.description,
          systemPrompt: userAgent?.prompt,
          identityCard: userAgent?.identityCard || '',
        },
      }

      if (voiceMode === 'local') {
        startPayload.sttMode = 'local'
        startPayload.localConfig = {}
      } else {
        startPayload.sttMode = 'openai'
        startPayload.whisperConfig = whisperConfig
      }

      const startResult = await window.electronAPI.voice.start(startPayload)
      if (startResult && startResult.success === false) {
        // Backend refused to start (model load failure, missing config, etc.)
        // 'voice:error' is also emitted from the IPC handler; tear down here
        // so we don't open the mic on a dead session.
        voiceStore.endCall()
        return
      }
    }

    // Subscribe to voice events
    setupVoiceListeners()

    // Start mic capture (MediaRecorder + VAD → audio chunks to backend Whisper)
    startMicCapture()
  }

  // ── Mic capture with VAD (sends audio chunks to backend for Whisper STT) ──
  let micStream = null
  let micRecorder = null
  let micAnalyser = null
  let micAnimFrame = null
  let micSilenceStart = 0
  let micIsRecording = false
  let micSpeechFrames = 0    // frames where isSpeaking=true during current recording
  let micBargeInStart = 0    // timestamp when continuous barge-in speech started (0 = none)
  // VAD constants — read from config at call-start time via vadParam() below
  const MIN_RECORDING_MS = 500
  const MAX_RECORDING_MS = 30000 // Cap at 30s to limit Whisper cost
  function vadParam(key, fallback) {
    return configStore.config.voiceCall?.[key] ?? fallback
  }

  async function startMicCapture() {
    try {
      const deviceId = voiceStore.selectedMicId
      const audioConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      if (deviceId) audioConstraints.deviceId = { exact: deviceId }
      micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      const actx = new AudioContext()
      const source = actx.createMediaStreamSource(micStream)
      micAnalyser = actx.createAnalyser()
      micAnalyser.fftSize = 2048
      source.connect(micAnalyser)

      // Log AudioContext state changes — suspension after browser inactivity kills the VAD loop

      // VAD params are read live from config on every frame so slider changes take
      // effect immediately without restarting the call.

      // Dynamic noise floor: tracks ambient background level with a slow EMA.
      // Only updated while NOT recording, so the user's own voice doesn't raise it.
      // Effective threshold = max(SILENCE_THRESHOLD, ambientFloor × PROXIMITY_MULTIPLIER).
      // This means if background people are chatting at RMS 0.025, the trigger
      // rises to ~0.062 — your voice directly into the mic comfortably exceeds that.
      let ambientFloor = vadParam('vadAmplitude', 0.018) * 0.5  // conservative starting estimate
      const AMBIENT_ALPHA = 0.003  // slow adaptation (~330 frames to fully update)

      // Pre-compute voice-band bin range once (300–3400 Hz).
      // Human speech energy concentrates here. Keyboard clicks and background hiss
      // have proportionally more energy outside this range (especially above 4kHz).
      const binHz = actx.sampleRate / micAnalyser.fftSize
      const voiceLowBin  = Math.round(300  / binHz)
      const voiceHighBin = Math.round(3400 / binHz)
      const fftArray = new Float32Array(micAnalyser.frequencyBinCount)

      const dataArray = new Float32Array(micAnalyser.fftSize)
      let chunks = []
      let recordingStartTime = 0

      micRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' })
      micRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      micRecorder.onstop = async () => {
        const duration = Date.now() - recordingStartTime
        const speechFrames = micSpeechFrames
        micSpeechFrames = 0
        if (chunks.length === 0 || duration < MIN_RECORDING_MS) {
          chunks = []
          return
        }
        if (speechFrames < vadParam('vadSpeechFrames', 20)) {
          chunks = []
          return
        }
        const blob = new Blob(chunks, { type: 'audio/webm' })
        chunks = []

        // For local STT: convert webm → WAV in browser (avoids slow ffmpeg on server)
        const vc = configStore.config.voiceCall || {}
        const useLocalWav = vc.mode === 'local'
        let arrayBuf
        let mimeType = 'audio/webm'

        if (useLocalWav) {
          try {
            const webmBuf = await blob.arrayBuffer()
            const audioBuf = await actx.decodeAudioData(webmBuf.slice(0)) // slice to avoid detached buffer
            const pcm = audioBuf.getChannelData(0) // mono
            const sampleRate = 16000
            // Resample if needed
            let samples = pcm
            if (audioBuf.sampleRate !== sampleRate) {
              const ratio = audioBuf.sampleRate / sampleRate
              const newLen = Math.round(pcm.length / ratio)
              samples = new Float32Array(newLen)
              for (let i = 0; i < newLen; i++) {
                samples[i] = pcm[Math.round(i * ratio)] || 0
              }
            }
            // Encode WAV
            const wavBuf = new ArrayBuffer(44 + samples.length * 2)
            const view = new DataView(wavBuf)
            const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }
            writeStr(0, 'RIFF')
            view.setUint32(4, 36 + samples.length * 2, true)
            writeStr(8, 'WAVE')
            writeStr(12, 'fmt ')
            view.setUint32(16, 16, true)
            view.setUint16(20, 1, true) // PCM
            view.setUint16(22, 1, true) // mono
            view.setUint32(24, sampleRate, true)
            view.setUint32(28, sampleRate * 2, true)
            view.setUint16(32, 2, true)
            view.setUint16(34, 16, true)
            writeStr(36, 'data')
            view.setUint32(40, samples.length * 2, true)
            for (let i = 0; i < samples.length; i++) {
              const s = Math.max(-1, Math.min(1, samples[i]))
              view.setInt16(44 + i * 2, s * 0x7FFF, true)
            }
            arrayBuf = wavBuf
            mimeType = 'audio/wav'
          } catch {
            // Fallback to webm if browser decoding fails
            arrayBuf = await blob.arrayBuffer()
          }
        } else {
          arrayBuf = await blob.arrayBuffer()
        }

        if (window.electronAPI?.voice?.audioChunk && voiceStore.isCallActive) {
          voiceStore.setStatus('processing')  // show "thinking" immediately while backend processes
          window.electronAPI.voice.audioChunk(Array.from(new Uint8Array(arrayBuf)), mimeType)
        }
      }

      function isVoiceBand() {
        // Second gate: require that ≥25% of audio energy sits in the 300–3400 Hz voice band.
        // Keyboard clicks are broadband transients; their voice-band ratio is typically <15%.
        // Real speech always concentrates significant energy in this range.
        micAnalyser.getFloatFrequencyData(fftArray) // values in dB, typically -100..0
        let voicePower = 0
        let totalPower = 0
        for (let i = 1; i < fftArray.length; i++) {
          const p = Math.pow(10, fftArray[i] / 10) // dB → linear power
          totalPower += p
          if (i >= voiceLowBin && i <= voiceHighBin) voicePower += p
        }
        return totalPower > 0 && (voicePower / totalPower) >= vadParam('vadVoiceBandRatio', 0.25)
      }

      function vadLoop() {
        if (!voiceStore.isCallActive) { stopMicCapture(); return }
        // AudioContext can be suspended by the browser after inactivity — resume it silently
        if (actx.state === 'suspended') {
          actx.resume()
        }
        micAnalyser.getFloatTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i]
        const rms = Math.sqrt(sum / dataArray.length)

        // Update ambient floor only when quiet (not recording, not in cooldown).
        // This tracks background chatter level so the dynamic threshold rises with it.
        // Cap at 3× the base threshold so loud background noise can't make the mic
        // completely deaf to the user's voice — this is the safety ceiling.
        if (!micIsRecording && Date.now() >= micCooldownUntil) {
          const newFloor = ambientFloor * (1 - AMBIENT_ALPHA) + rms * AMBIENT_ALPHA
          const floorCeiling = vadParam('vadAmplitude', 0.018) * 3
          ambientFloor = Math.min(newFloor, floorCeiling)
        }

        // Effective threshold: must beat both the fixed floor AND the ambient × multiplier.
        // If background people chat at RMS ~0.025, threshold lifts to ~0.062 —
        // your voice directly into the mic easily clears that.
        const dynamicThreshold = Math.max(
          vadParam('vadAmplitude', 0.018),
          ambientFloor * vadParam('vadProximityMult', 2.5)
        )

        // Gate 1: dynamic amplitude  Gate 2: voice-band frequency ratio
        const isSpeaking = rms > dynamicThreshold && isVoiceBand()
        const isMuted = voiceStore.isMuted
        const inCooldown = Date.now() < micCooldownUntil

        // Barge-in: user speaks while AI is speaking or processing → interrupt immediately.
        // Require continuous speech for 300ms before cutting — prevents noise spikes.
        // On trigger: stop TTS, signal backend to abort LLM, switch to listening state.
        const aiIsActive = ttsIsSpeaking || voiceStore.status === 'processing'
        if (isSpeaking && !isMuted && aiIsActive) {
          if (!micBargeInStart) micBargeInStart = Date.now()
          if (Date.now() - micBargeInStart >= 300) {
            stopSpeaking()
            micCooldownUntil = 0
            micBargeInStart = 0
            // Tell backend to abort the active LLM stream immediately
            window.electronAPI?.voice?.bargeIn?.()
            voiceStore.setStatus('listening')
          }
        } else if (!isSpeaking) {
          micBargeInStart = 0  // reset if speech drops — noise burst didn't sustain
        }

        // Never gate mic on 'processing' — voice LLM and chat agent run independently.
        // VoiceSession.processAudio guards itself; mic must stay open during agent tasks.
        if (isSpeaking && !isMuted && !inCooldown) {
          micSilenceStart = 0
          if (!micIsRecording) {
            micIsRecording = true
            micSpeechFrames = 0
            recordingStartTime = Date.now()
            chunks = []
            if (micRecorder.state === 'inactive') micRecorder.start()
            // Status: actively capturing user speech
            voiceStore.setStatus('listening')
          }
          micSpeechFrames++
        } else if (micIsRecording) {
          if (!micSilenceStart) micSilenceStart = Date.now()
          if (Date.now() - micSilenceStart > vadParam('vadSilenceMs', 700)) {
            micIsRecording = false
            micSilenceStart = 0
            if (micRecorder.state === 'recording') micRecorder.stop()
          }
        } else {
          // Not recording and no speech detected.
          // VAD clears 'listening' if it got stuck.
          // It also clears 'processing' once the backend is done — the backend
          // tries to set 'standby' but that's now blocked, so the VAD does it instead
          // once the mic is idle (not cooldown, not speaking).
          const s = voiceStore.status
          // Only transition listening → standby (silence after speech).
          // Never override 'processing' or 'speaking' — those are managed by backend/TTS.
          if (s === 'listening' && Date.now() >= micCooldownUntil) {
            voiceStore.setStatus('standby')
          }
        }
        // Hard cap: stop recording after MAX_RECORDING_MS to limit Whisper cost
        if (micIsRecording && (Date.now() - recordingStartTime > MAX_RECORDING_MS)) {
          micIsRecording = false
          micSilenceStart = 0
          if (micRecorder.state === 'recording') micRecorder.stop()
        }
        micAnimFrame = requestAnimationFrame(vadLoop)
      }
      micAnimFrame = requestAnimationFrame(vadLoop)
    } catch (err) {
      console.error('Mic capture failed:', err)
    }
  }

  function stopMicCapture() {
    if (micAnimFrame) { cancelAnimationFrame(micAnimFrame); micAnimFrame = null }
    if (micRecorder && micRecorder.state !== 'inactive') { try { micRecorder.stop() } catch {} }
    micRecorder = null
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null }
    micAnalyser = null
    micIsRecording = false
    micSilenceStart = 0
    micBargeInStart = 0
  }

  // ── TTS ──
  // 'browser' = free SpeechSynthesis, 'openai-hd' = OpenAI TTS HD (uses Whisper API key)
  let activeAudioEl = null
  let micCooldownUntil = 0  // timestamp: ignore VAD triggers until this time (post-TTS debounce)
  const MIC_COOLDOWN_MS = 400

  // TTS serial queue — ensures one utterance plays after the previous finishes.
  // Prefetch: audio is fetched concurrently while prior sentence plays, so playback
  // is gapless. ttsIsSpeaking stays true across sentence boundaries so barge-in
  // detection isn't confused by the brief standby between two sentences.
  let ttsQueue = Promise.resolve()
  let ttsIsSpeaking = false  // true whenever audio is queued or playing
  let ttsPending = 0          // count of sentences not yet finished playing
  let ttsGeneration = 0       // incremented on stopSpeaking — invalidates all in-flight items

  function speakText(text) {
    if (!text) return
    ttsIsSpeaking = true
    ttsPending++
    const gen = ttsGeneration  // capture generation at enqueue time
    // Kick off TTS fetch immediately (runs concurrently with whatever is currently playing)
    const audioReady = _fetchTTSAudio(text)
    // Chain playback onto the serial queue — waits for prior sentence to finish, then plays
    ttsQueue = ttsQueue.then(() => _playTTSAudio(text, audioReady, gen))
    return ttsQueue
  }

  // Fetch TTS audio now (does NOT wait for previous sentence to finish).
  // Returns a Promise that resolves to a data URL for API/local TTS, or null for browser TTS.
  async function _fetchTTSAudio(text) {
    const vc = configStore.config.voiceCall || {}

    // Local TTS (Edge-TTS) — when voice mode is 'local'
    if (vc.mode === 'local' && window.electronAPI?.voice?.localTts) {
      try {
        // Per-agent voice overrides global default
        const agent = agentsStore.getAgentById(voiceStore.activeAgentId)
        const edgeVoice = agent?.voiceId || vc.ttsVoice || vc.local?.ttsVoice || 'zh-CN-XiaoxiaoNeural'
        const result = await window.electronAPI.voice.localTts({
          text,
          voice: edgeVoice,
          language: vc.language || 'auto',
        })
        if (result.success && result.audio) {
          return `data:audio/${result.format || 'wav'};base64,${result.audio}`
        }
      } catch { /* fall through to browser TTS */ }
      return null
    }

    // OpenAI TTS — when voice mode is 'openai' (or legacy unset)
    const useOpenAITTS = (vc.ttsMode === 'openai' || vc.ttsMode === 'openai-hd') && vc.whisperApiKey
    if (!useOpenAITTS || !window.electronAPI?.voice?.tts) return null
    try {
      const agent = agentsStore.getAgentById(voiceStore.activeAgentId)
      const voiceId = agent?.voiceId || 'alloy'
      const result = await window.electronAPI.voice.tts({
        text,
        apiKey: vc.whisperApiKey,
        baseURL: vc.whisperBaseURL || 'https://api.openai.com',
        model: vc.ttsMode === 'openai-hd' ? 'tts-1-hd' : 'tts-1',
        voice: voiceId,
      })
      if (result.success && result.audio) {
        return `data:audio/${result.format || 'mp3'};base64,${result.audio}`
      }
    } catch { /* fall through — playback will use browser TTS */ }
    return null
  }

  // Play audio for a sentence. audioReady is the Promise from _fetchTTSAudio (may already be resolved).
  // gen must match ttsGeneration at play time — if stopSpeaking() fired since enqueue, drop silently.
  async function _playTTSAudio(text, audioReady, gen) {
    const isStale = () => gen !== ttsGeneration || !voiceStore.isCallActive

    if (isStale()) {
      ttsPending = Math.max(0, ttsPending - 1)
      if (ttsPending === 0) ttsIsSpeaking = false
      return
    }

    const done = () => {
      ttsPending = Math.max(0, ttsPending - 1)
      if (ttsPending === 0) ttsIsSpeaking = false
      micCooldownUntil = Date.now() + MIC_COOLDOWN_MS
      if (voiceStore.isCallActive) voiceStore.setStatus('standby')
    }

    // Await the prefetched audio (usually already resolved at this point)
    const audioUrl = await audioReady

    // Re-check after await — stopSpeaking() may have fired while fetch was in-flight
    if (isStale()) {
      ttsPending = Math.max(0, ttsPending - 1)
      if (ttsPending === 0) ttsIsSpeaking = false
      return
    }

    if (audioUrl) {
      return new Promise((resolve) => {
        activeAudioEl = new Audio(audioUrl)
        const speakerId = voiceStore.selectedSpeakerId
        if (speakerId && typeof activeAudioEl.setSinkId === 'function') {
          activeAudioEl.setSinkId(speakerId).catch(() => {})
        }
        const finish = () => {
          activeAudioEl = null
          done()
          resolve()
        }
        activeAudioEl.onended = finish
        activeAudioEl.onerror = () => finish()
        voiceStore.setStatus('speaking')
        activeAudioEl.play()
      })
    }

    // Browser SpeechSynthesis fallback
    if (!window.speechSynthesis) { done(); return }
    return new Promise((resolve) => {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0
      const finish = () => { done(); resolve() }
      utterance.onend = finish
      utterance.onerror = () => finish()
      voiceStore.setStatus('speaking')
      window.speechSynthesis.speak(utterance)
    })
  }

  // Cancel currently playing audio only — does NOT reset the queue.
  function cancelCurrentSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (activeAudioEl) { activeAudioEl.pause(); activeAudioEl = null }
  }

  // Full stop: cancel audio AND discard all queued utterances.
  // Used for barge-in interruptions and call end.
  function stopSpeaking() {
    cancelCurrentSpeech()
    ttsGeneration++              // invalidate all in-flight _playTTSAudio calls
    ttsQueue = Promise.resolve() // discard any queued utterances
    ttsPending = 0
    ttsIsSpeaking = false
    // Clear speaking status — the VAD loop will set standby/listening on its next frame
    if (voiceStore.status === 'speaking') voiceStore.setStatus('standby')
  }

  // ── Voice event listeners ──
  let voiceCleanups = []
  function setupVoiceListeners() {
    voiceCleanups.forEach(fn => fn())
    voiceCleanups = []

    const api = window.electronAPI?.voice
    if (!api) return

    voiceCleanups.push(api.onStatus((status) => {
      // The VAD loop exclusively owns 'listening' and 'standby' — it runs at 60fps
      // and knows exactly whether the mic is recording. Letting the backend also write
      // these states causes races (backend 'standby' arrives late, VAD sees stale value).
      // The backend only owns 'processing', 'speaking', and 'idle'.
      if (status === 'listening' || status === 'standby') return
      voiceStore.setStatus(status)
    }))

    // Whisper transcript from backend
    voiceCleanups.push(api.onTranscription(({ text }) => {
      voiceStore.setTranscript(text)
    }))

    // AI response — speak it; don't add to chat (voice is ephemeral, task results go to chat via agent)
    voiceCleanups.push(api.onAiText(({ text, taskSummary }) => {
      voiceStore.setAiText(text)
      if (!taskSummary) {
        speakText(text)
      } else {
        // Task summary: only speak if nothing is currently playing — otherwise drop it.
        // The full result is already visible in the chat; voice is a courtesy notice only.
        if (voiceStore.status !== 'speaking') {
          speakText(text)
        }
      }
    }))

    voiceCleanups.push(api.onError(({ message }) => {
      console.error('Voice error:', message)
      // Surface to the call overlay so the user sees why the turn failed
      // (e.g. provider 4xx, quota exhausted, model misroute, STT crash).
      voiceStore.setError(message || 'Voice error')
      // Snap back to listening so the mic is ready for the next attempt
      // instead of being stuck in 'processing'.
      voiceStore.setStatus('listening')
    }))
    voiceCleanups.push(api.onTaskTriggered(({ instruction }) => handleVoiceTask(instruction)))

    // Accumulate voice + Whisper usage into the active chat's contextMetrics and voice store (for real-time cost)
    if (api.onUsage) {
      voiceCleanups.push(api.onUsage((usage) => {
        voiceStore.addCallUsage(usage)
        const chatId = voiceStore.activeChatId
        if (!chatId) return
        const chat = chatsStore.chats.find(c => c.id === chatId)
        if (!chat) return
        const m = chat.contextMetrics
        if (usage.whisperCalls) m.whisperCalls = (m.whisperCalls || 0) + usage.whisperCalls
        if (usage.whisperSecs)  m.whisperSecs  = (m.whisperSecs  || 0) + usage.whisperSecs
        if (usage.voiceInputTokens)  m.voiceInputTokens  = (m.voiceInputTokens  || 0) + usage.voiceInputTokens
        if (usage.voiceOutputTokens) m.voiceOutputTokens = (m.voiceOutputTokens || 0) + usage.voiceOutputTokens
      }))
    }
  }

  // Add a voice exchange message to the active call's chat
  function addVoiceMessageToChat(role, content) {
    const chatId = voiceStore.activeChatId
    if (!chatId || !content) return
    const extra = {}
    if (role === 'user') {
      const chat = chatsStore.chats.find(c => c.id === chatId)
      const uid = chat?.userAgentId || agentsStore.defaultUserAgent?.id
      if (uid) extra.userAgentId = uid
    }
    chatsStore.addMessage(chatId, { role, content, fromVoice: true, ...extra })
    // If the call's chat isn't the one currently visible, switch to it
    if (chatsStore.activeChatId !== chatId) {
      chatsStore.setActiveChat(chatId)
    }
  }

  // Handle task triggered from voice call.
  // The agent's own agent model runs the task via sendMessage().
  // Voice only speaks a brief completion/failure notice — never the full agent response.
  async function handleVoiceTask(instruction) {
    const chatId = voiceStore.activeChatId
    if (!chatId) return
    if (chatsStore.activeChatId !== chatId) chatsStore.activeChatId = chatId

    // Inject instruction and await the agent run
    if (inputText) inputText.value = instruction
    if (sendMessage) {
      const { nextTick } = await import('vue')
      await nextTick()
      await sendMessage()
    }

    // sendMessage is now done — get the last assistant message as the completion summary
    if (!voiceStore.isCallActive) return
    const chat = chatsStore.chats.find(c => c.id === chatId)
    const lastAssistant = chat?.messages
      ? [...chat.messages].reverse().find(m => m.role === 'assistant' && !m.streaming)
      : null

    // Pass full content — VoiceSession will use the LLM to produce a complete spoken summary
    const summary = lastAssistant?.content || null

    // Push updated chat history back to the voice session so it stays aware of new messages
    const updatedChat = chatsStore.chats.find(c => c.id === chatId)
    if (updatedChat?.messages && window.electronAPI?.voice?.updateHistory) {
      const updatedHistory = updatedChat.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))
      window.electronAPI.voice.updateHistory(updatedHistory)
    }

    if (window.electronAPI?.voice?.notifyTaskComplete) {
      window.electronAPI.voice.notifyTaskComplete(summary)
    }
  }

  function cleanupVoiceListeners() {
    voiceCleanups.forEach(fn => fn())
    voiceCleanups = []
  }

  return {
    handleStartCall,
    voiceServerError,
    showVoiceLimitModal,
    voiceLimitMessage,
    setupVoiceListeners,
    cleanupVoiceListeners,
    addVoiceMessageToChat,
    speakText,
    stopSpeaking,
    cancelCurrentSpeech,
    handleVoiceTask,
    startMicCapture,
    stopMicCapture,
  }
}
