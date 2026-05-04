import { ref } from 'vue'
import { useAgentsStore } from '../stores/agents'

// Module-level state — shared across all consumers (sidebar new-chat button,
// agent card "chat with agent" button). Keeps a single dialog instance in App.vue
// authoritative regardless of which page triggered the block.
const blockReason = ref(null) // 'no-user' | 'no-system' | null

export function useNewChatGuard() {
  const agentsStore = useAgentsStore()

  function getBlockReason({ requireSystem = true } = {}) {
    const hasUserAgent = agentsStore.userAgents.some(a => !a.isBuiltin)
    if (!hasUserAgent) return 'no-user'
    if (requireSystem && agentsStore.systemAgents.length === 0) return 'no-system'
    return null
  }

  function blockIfNeeded(opts) {
    const reason = getBlockReason(opts)
    if (reason) {
      blockReason.value = reason
      return true
    }
    return false
  }

  function clearBlock() {
    blockReason.value = null
  }

  return { blockReason, getBlockReason, blockIfNeeded, clearBlock }
}
