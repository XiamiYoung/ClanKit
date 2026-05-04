import { useRouter } from 'vue-router'
import { useChatsStore } from '../stores/chats'
import { BUILTIN_ANALYST_ID } from '../stores/agents'
import { useI18n } from '../i18n/useI18n'

/**
 * Composable for opening or creating an "analysis" chat for a given agent.
 *
 * The analysis chat lets users ask an LLM to analyze the agent's imported
 * chat history (personality, abilities, relationships, MBTI, …).
 */
export function useAgentAnalysisChat() {
  const router = useRouter()
  const chatsStore = useChatsStore()
  const { t } = useI18n()

  /**
   * Open an existing analysis chat for `agent`, or create a new one.
   *
   * - Checks imported history first; shows alert if none.
   * - On new chat: inserts an assistant "ready to analyze" message.
   * - Navigates to /chats.
   *
   * @param {object} agent  Agent object with at least { id, name }
   * @returns {Promise<boolean>} true if navigated, false if blocked (no history)
   */
  async function openOrCreateAnalysisChat(agent) {
    if (!agent?.id) return false

    // Gate: check imported history exists
    const res = await window.electronAPI?.agentAnalysis?.hasHistory({ agentId: agent.id })
    if (!res?.hasHistory) {
      window.alert?.(t('agents.analysis.noHistory'))
      return false
    }

    // Look for an existing analysis chat targeting this agent
    const existing = chatsStore.chats.find(
      c => c.type === 'analysis' && c.analysisTargetAgentId === agent.id
    )

    if (existing) {
      chatsStore.setActiveChat(existing.id)
      router.push('/chats')
      return true
    }

    // Create a new analysis chat — always use the built-in Analyst agent
    const title = t('agents.analysis.chatTitle', { name: agent.name })

    const chat = await chatsStore.createChat(title, [BUILTIN_ANALYST_ID], null, {
      chatType: 'analysis',
      analysisTargetAgentId: agent.id,
      autoTitleEligible: false,
      mode: 'productivity',
    })

    if (!chat) return false

    // Insert first assistant message asking whether to start analysis
    const readyContent = t('agents.analysis.readyMessage', { name: agent.name })
    await chatsStore.addMessage(chat.id, {
      role: 'assistant',
      content: readyContent,
      segments: [{ type: 'text', content: readyContent }],
      streaming: false,
    })

    chatsStore.setActiveChat(chat.id)
    router.push('/chats')
    return true
  }

  return { openOrCreateAnalysisChat }
}
