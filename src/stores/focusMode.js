import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useFocusModeStore = defineStore('focusMode', () => {
  const isFocusMode = ref(false)
  const showChat = ref(true)
  const showDocs = ref(true)
  const justExited = ref(false)
  const isMinibarMode = ref(false)

  // Last selections remembered across focus mode sessions
  const lastDocPath = ref(null)
  const lastDocName = ref(null)
  const lastChatId = ref(null)

  let _exitTimer = null

  function enter() {
    isFocusMode.value = true
    showChat.value = true
    showDocs.value = true
    window.electronAPI?.window?.setFullScreen(true)
  }

  function exit() {
    isFocusMode.value = false
    window.electronAPI?.window?.setFullScreen(false)
    justExited.value = true
    clearTimeout(_exitTimer)
    _exitTimer = setTimeout(() => { justExited.value = false }, 400)
  }

  function enterMinibar() { isMinibarMode.value = true }
  function exitMinibar() { isMinibarMode.value = false }

  function toggleChat() {
    showChat.value = !showChat.value
  }

  function toggleDocs() {
    showDocs.value = !showDocs.value
  }

  return { isFocusMode, showChat, showDocs, justExited, lastDocPath, lastDocName, lastChatId, enter, exit, toggleChat, toggleDocs, isMinibarMode, enterMinibar, exitMinibar }
})
