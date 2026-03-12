import { defineStore } from 'pinia'
import { ref } from 'vue'

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

  // Device selection — persisted across calls
  const selectedMicId = ref('')
  const selectedSpeakerId = ref('')

  // Real-time cost accumulators for the current call (reset on startCall)
  const callModelId = ref('')
  const callWhisperSecs = ref(0)
  const callWhisperCalls = ref(0)
  const callVoiceInputTokens = ref(0)
  const callVoiceOutputTokens = ref(0)

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
  }

  function setStatus(s) { status.value = s }
  function setMuted(m) { isMuted.value = m }
  function setPip(p) { isPip.value = p }
  function setTranscript(t) { lastTranscript.value = typeof t === 'string' ? t : '' }
  function setAiText(t) { lastAiText.value = t }
  function setMicId(id) { selectedMicId.value = id }
  function setSpeakerId(id) { selectedSpeakerId.value = id }

  return {
    isCallActive, activeChatId, activeAgentId, activeAgentName,
    status, isMuted, isPip, lastTranscript, lastAiText,
    selectedMicId, selectedSpeakerId,
    callModelId, callWhisperSecs, callWhisperCalls,
    callVoiceInputTokens, callVoiceOutputTokens,
    startCall, endCall, setStatus, setMuted, setPip, setTranscript, setAiText,
    setMicId, setSpeakerId, addCallUsage,
  }
})
