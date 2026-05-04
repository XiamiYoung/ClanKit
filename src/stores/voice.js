import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { PREVIEW_LIMITS, isLimitEnforced } from '../utils/guestLimits'

const VOICE_DAILY_KEY = 'clankit_voice_daily'

export const useVoiceStore = defineStore('voice', () => {
  const isCallActive = ref(false)
  const activeChatId = ref(null)
  const activeAgentId = ref(null)
  const activeAgentName = ref('')
  const status = ref('idle')  // 'idle' | 'listening' | 'processing' | 'speaking'
  const isMuted = ref(false)
  const isPip = ref(false)    // true when user navigated away from active call's chat
  const lastTranscript = ref('')
  const lastAiText = ref('')
  // Last error from the active call (LLM 4xx/5xx, STT failure, etc.). Shown
  // in the call overlay so the user knows why nothing's happening.
  const lastError = ref('')

  // Device selection — persisted across calls
  const selectedMicId = ref('')
  const selectedSpeakerId = ref('')

  // Real-time cost accumulators for the current call (reset on startCall)
  const callModelId = ref('')
  const callWhisperSecs = ref(0)
  const callWhisperCalls = ref(0)
  const callVoiceInputTokens = ref(0)
  const callVoiceOutputTokens = ref(0)

  // Daily voice usage tracking (preview limit)
  const voiceDailySecsUsed = ref(0)

  function _loadVoiceDaily() {
    try {
      const raw = localStorage.getItem(VOICE_DAILY_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      const today = new Date().toISOString().slice(0, 10)
      if (saved.date === today) voiceDailySecsUsed.value = saved.secsUsed || 0
      // else: new day, keep 0
    } catch {}
  }

  function _saveVoiceDaily() {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(VOICE_DAILY_KEY, JSON.stringify({ date: today, secsUsed: voiceDailySecsUsed.value }))
  }

  const isDailyVoiceLimitReached = computed(() =>
    isLimitEnforced() && voiceDailySecsUsed.value >= PREVIEW_LIMITS.maxVoiceSecsPerDay
  )

  const voiceDailySecsRemaining = computed(() =>
    Math.max(0, PREVIEW_LIMITS.maxVoiceSecsPerDay - voiceDailySecsUsed.value)
  )

  _loadVoiceDaily()

  function startCall(chatId, agentId, agentName, modelId) {
    isCallActive.value = true
    activeChatId.value = chatId
    activeAgentId.value = agentId
    activeAgentName.value = agentName || ''
    status.value = 'idle'
    isMuted.value = false
    isPip.value = false
    lastTranscript.value = ''
    lastAiText.value = ''
    lastError.value = ''
    callModelId.value = modelId || ''
    callWhisperSecs.value = 0
    callWhisperCalls.value = 0
    callVoiceInputTokens.value = 0
    callVoiceOutputTokens.value = 0
  }

  function endCall() {
    isCallActive.value = false
    activeChatId.value = null
    activeAgentId.value = null
    activeAgentName.value = ''
    status.value = 'idle'
    isMuted.value = false
    isPip.value = false
    lastTranscript.value = ''
    lastAiText.value = ''
    lastError.value = ''
    callModelId.value = ''
    callWhisperSecs.value = 0
    callWhisperCalls.value = 0
    callVoiceInputTokens.value = 0
    callVoiceOutputTokens.value = 0
  }

  function addCallUsage(usage) {
    if (!usage) return
    if (usage.whisperSecs)         callWhisperSecs.value         += usage.whisperSecs
    if (usage.whisperCalls)        callWhisperCalls.value        += usage.whisperCalls
    if (usage.voiceInputTokens)    callVoiceInputTokens.value    += usage.voiceInputTokens
    if (usage.voiceOutputTokens)   callVoiceOutputTokens.value   += usage.voiceOutputTokens
    // Accumulate daily usage for preview limit tracking
    if (usage.whisperSecs && isLimitEnforced()) {
      voiceDailySecsUsed.value += usage.whisperSecs
      _saveVoiceDaily()
    }
  }

  function setStatus(s) { status.value = s }
  function setMuted(m) { isMuted.value = m }
  function setPip(p) { isPip.value = p }
  function setTranscript(t) { lastTranscript.value = typeof t === 'string' ? t : '' }
  function setAiText(t) { lastAiText.value = t }
  function setError(msg) { lastError.value = msg ? String(msg) : '' }
  function setMicId(id) { selectedMicId.value = id }
  function setSpeakerId(id) { selectedSpeakerId.value = id }

  return {
    isCallActive, activeChatId, activeAgentId, activeAgentName,
    status, isMuted, isPip, lastTranscript, lastAiText, lastError,
    selectedMicId, selectedSpeakerId,
    callModelId, callWhisperSecs, callWhisperCalls,
    callVoiceInputTokens, callVoiceOutputTokens,
    voiceDailySecsUsed, voiceDailySecsRemaining, isDailyVoiceLimitReached,
    startCall, endCall, setStatus, setMuted, setPip, setTranscript, setAiText, setError,
    setMicId, setSpeakerId, addCallUsage,
  }
})
