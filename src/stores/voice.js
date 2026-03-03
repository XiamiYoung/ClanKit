import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useVoiceStore = defineStore('voice', () => {
  const isCallActive = ref(false)
  const activeChatId = ref(null)
  const activePersonaId = ref(null)
  const activePersonaName = ref('')
  const status = ref('idle')  // 'idle' | 'listening' | 'processing' | 'speaking'
  const isMuted = ref(false)
  const isPip = ref(false)    // true when user navigated away from active call's chat
  const lastTranscript = ref('')
  const lastAiText = ref('')

  function startCall(chatId, personaId, personaName) {
    isCallActive.value = true
    activeChatId.value = chatId
    activePersonaId.value = personaId
    activePersonaName.value = personaName || ''
    status.value = 'idle'
    isMuted.value = false
    isPip.value = false
    lastTranscript.value = ''
    lastAiText.value = ''
  }

  function endCall() {
    isCallActive.value = false
    activeChatId.value = null
    activePersonaId.value = null
    activePersonaName.value = ''
    status.value = 'idle'
    isMuted.value = false
    isPip.value = false
    lastTranscript.value = ''
    lastAiText.value = ''
  }

  function setStatus(s) { status.value = s }
  function setMuted(m) { isMuted.value = m }
  function setPip(p) { isPip.value = p }
  function setTranscript(t) { lastTranscript.value = t }
  function setAiText(t) { lastAiText.value = t }

  return {
    isCallActive, activeChatId, activePersonaId, activePersonaName,
    status, isMuted, isPip, lastTranscript, lastAiText,
    startCall, endCall, setStatus, setMuted, setPip, setTranscript, setAiText,
  }
})
