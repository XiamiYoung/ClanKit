import { ref, watch } from 'vue'
import { useChatsStore } from '../stores/chats'

/**
 * Grid multi-chat view state and actions.
 *
 * @param {object} opts
 * @param {import('vue').Ref<boolean>} opts.showChatConfigModal - ref to open settings modal
 * @param {Function} opts.triggerMemoryExtractionOnSwitch - called before chat switch
 */
export function useGridMode({ showChatConfigModal, triggerMemoryExtractionOnSwitch }) {
  const chatsStore = useChatsStore()

  const gridMode = ref(false)
  const gridCount = ref(4)
  const gridChatIds = ref([])
  const gridToastMsg = ref('')
  let gridToastTimer = null

  function refreshGridChatIds() {
    const sorted = [...chatsStore.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    gridChatIds.value = sorted.slice(0, gridCount.value).map(c => c.id)
  }

  watch(gridCount, (newCount) => {
    const current = gridChatIds.value
    if (newCount <= current.length) {
      gridChatIds.value = current.slice(0, newCount)
    } else {
      const sorted = [...chatsStore.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      const extras = sorted.filter(c => !current.includes(c.id)).map(c => c.id)
      gridChatIds.value = [...current, ...extras].slice(0, newCount)
    }
  })

  function enterGridMode() {
    refreshGridChatIds()
    gridMode.value = true
  }

  function exitGridMode() {
    gridMode.value = false
  }

  function gridMaximizeChat(chatId) {
    chatsStore.setActiveChat(chatId)
    gridMode.value = false
  }

  function showGridToast(msg) {
    gridToastMsg.value = msg
    clearTimeout(gridToastTimer)
    gridToastTimer = setTimeout(() => { gridToastMsg.value = '' }, 2500)
  }

  async function gridNewChat() {
    const chat = await chatsStore.createChat('New Chat')
    if (chat) {
      chatsStore.setActiveChat(chat.id)
      gridChatIds.value = [chat.id, ...gridChatIds.value.filter(id => id !== chat.id)].slice(0, gridCount.value)
      showGridToast('New chat created')
    }
  }

  function gridSelectChat(chatId) {
    triggerMemoryExtractionOnSwitch(chatsStore.activeChatId)
    chatsStore.setActiveChat(chatId)
  }

  function gridSwapChat(oldChatId, newChatId) {
    const idx = gridChatIds.value.indexOf(oldChatId)
    if (idx === -1) return
    const newIds = [...gridChatIds.value]
    newIds[idx] = newChatId
    gridChatIds.value = newIds
  }

  function gridOpenChatSettings(chatId) {
    chatsStore.setActiveChat(chatId)
    showChatConfigModal.value = true
  }

  return {
    gridMode,
    gridCount,
    gridChatIds,
    gridToastMsg,
    refreshGridChatIds,
    enterGridMode,
    exitGridMode,
    gridMaximizeChat,
    showGridToast,
    gridNewChat,
    gridSelectChat,
    gridSwapChat,
    gridOpenChatSettings,
  }
}
