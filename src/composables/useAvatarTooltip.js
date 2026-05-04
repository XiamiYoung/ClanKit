import { reactive } from 'vue'

/**
 * Shared tooltip state and handlers for message/user avatar hover tooltips.
 *
 * @param {object} opts
 * @param {import('vue').ComputedRef<string[]>} opts.activeSystemAgentIds
 * @param {import('vue').ComputedRef<object|null>} opts.activeUserAgent
 * @param {Function} opts.getAgentById
 */
export function useAvatarTooltip({ activeSystemAgentIds, activeUserAgent, getAgentById }) {
  const mentionTooltip = reactive({ visible: false, source: '', text: '', name: '', x: 0, y: 0, side: 'right' })

  function showMsgAvatarTooltip(event, msg) {
    const pid = msg.agentId || activeSystemAgentIds.value[0]
    const agent = pid ? getAgentById(pid) : null
    const name = agent?.name || msg.agentName || 'Assistant'
    const desc = agent?.description || ''
    if (!name) return
    const rect = event.currentTarget.getBoundingClientRect()
    mentionTooltip.source = 'message'
    mentionTooltip.name = name
    mentionTooltip.text = desc
    mentionTooltip.side = 'right'
    mentionTooltip.x = rect.right + 10
    mentionTooltip.y = rect.top + rect.height / 2
    mentionTooltip.visible = true
  }

  function hideMsgAvatarTooltip() {
    mentionTooltip.visible = false
  }

  function showUserAvatarTooltip(event) {
    const agent = activeUserAgent.value
    const name = agent?.name || 'User'
    const desc = agent?.description || ''
    if (!name) return
    const rect = event.currentTarget.getBoundingClientRect()
    mentionTooltip.source = 'message'
    mentionTooltip.name = name
    mentionTooltip.text = desc
    mentionTooltip.side = 'left'
    mentionTooltip.x = rect.left - 10
    mentionTooltip.y = rect.top + rect.height / 2
    mentionTooltip.visible = true
  }

  return {
    mentionTooltip,
    showMsgAvatarTooltip,
    hideMsgAvatarTooltip,
    showUserAvatarTooltip,
  }
}
