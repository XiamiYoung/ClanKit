import { useRouter } from 'vue-router'
import { useChatsStore } from '../stores/chats'
import { useAgentsStore, BUILTIN_SYSTEM_AGENT_ID } from '../stores/agents'
import { useI18n } from '../i18n/useI18n'

/**
 * Composable for "Create via Chat" flow.
 * Creates a new chat with the system agent, prefills the input box
 * with a guidance message, then navigates to /chats.
 */
export function useChatToCreate() {
  const router = useRouter()
  const chatsStore = useChatsStore()
  const agentsStore = useAgentsStore()
  const { t } = useI18n()

  async function startChatGuide(prefillText, chatTitle) {
    const userAgent = agentsStore.userAgents.find(a => !a.isBuiltin)
    const chat = await chatsStore.createChat(
      chatTitle || t('chats.newChat'),
      [BUILTIN_SYSTEM_AGENT_ID],
      null,
      { userAgentId: userAgent?.id, mode: 'productivity' }
    )
    if (chat?.id) {
      chatsStore.pendingInputPrefill = { text: prefillText, chatId: chat.id }
    }
    router.push('/chats')
  }

  return { startChatGuide }
}
