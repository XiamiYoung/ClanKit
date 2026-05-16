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

  // Pending message to auto-populate chat input (set by "Send to Chat" in AI Edit)
  const pendingChatMessage = ref('')

  // Session-only Y offset (px) for the draggable hamburger toggle tabs in
  // ChatsView and DocsView. null = use the default CSS position.
  const chatHamburgerY = ref(null)
  const docHamburgerY = ref(null)

  let _exitTimer = null

  function enter() {
    isFocusMode.value = true
    showChat.value = true
    showDocs.value = true
    window.electronAPI?.window?.setFullScreen(true)
  }

  // Enter focus mode with explicit doc + chat preselection. Used by the
  // chat-side per-file chip and the AI Doc header button so they can hand
  // a specific file/chat pair to FocusModeView's restore-from-store path.
  function enterWith({ filePath = null, fileName = null, chatId = null } = {}) {
    if (filePath !== null) lastDocPath.value = filePath
    if (fileName !== null) lastDocName.value = fileName
    if (chatId !== null) lastChatId.value = chatId
    enter()
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

  return { isFocusMode, showChat, showDocs, justExited, lastDocPath, lastDocName, lastChatId, pendingChatMessage, chatHamburgerY, docHamburgerY, enter, enterWith, exit, toggleChat, toggleDocs, isMinibarMode, enterMinibar, exitMinibar }
})
