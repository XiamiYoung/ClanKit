import { useChatsStore } from '../stores/chats'
import { useAgentsStore } from '../stores/agents'
import { useConfigStore } from '../stores/config'

/**
 * Minimal collaboration composable — provider credential helpers + _fireGroupAgentsDirect.
 * All orchestration (buildAgentRuns, resolveAddressees, dispatchGroupTasks,
 * triggerAgentCollaboration) has been moved to electron/ipc/agent.js.
 *
 * @param {Object}   deps
 * @param {import('vue').ComputedRef} deps.enabledSkillObjects - computed ref to enabled skills array
 * @param {Function} deps.scrollToBottom        - scrollToBottom(smooth, chatId)
 * @param {Function} deps.dbg                   - dbg(msg, level) debug logger
 * @param {import('vue').Ref} deps.runningAgentKeys - reactive Set from useChunkHandler
 */
export function useAgentCollaboration({
  enabledSkillObjects,
  scrollToBottom,
  dbg,
  collaborationCancelled,
  runningAgentKeys,
  isInCollaborationLoop,
  waitForAgentEnd,
} = {}) {
  const chatsStore = useChatsStore()
  const agentsStore = useAgentsStore()
  const configStore = useConfigStore()

  // ── Provider credential helpers (still needed for compactContextStandalone) ───

  function resolveProviderCreds(cfg, providerType) {
    const providers = cfg.providers || []
    const p = providers.find(p => p.type === providerType || p.id === providerType)
    if (p) return { apiKey: p.apiKey || '', baseURL: p.baseURL || '', model: p.model || '', type: p.type || providerType }
    return { apiKey: '', baseURL: '', model: '', type: providerType }
  }

  function applyProviderCredsToConfig(cfg, providerType) {
    const { apiKey, baseURL, type: resolvedType } = resolveProviderCreds(cfg, providerType)
    providerType = resolvedType || providerType
    if (providerType === 'anthropic') {
      cfg.apiKey  = apiKey
      cfg.baseURL = baseURL
      delete cfg._directAuth
      delete cfg.openaiApiKey
      delete cfg.openaiBaseURL
      cfg._resolvedProvider = undefined
      cfg.defaultProvider   = undefined
    } else if (providerType === 'openrouter') {
      cfg.apiKey  = apiKey
      cfg.baseURL = baseURL
      delete cfg._directAuth
      delete cfg.openaiApiKey
      delete cfg.openaiBaseURL
      cfg._resolvedProvider = undefined
      cfg.defaultProvider   = undefined
    } else if (providerType === 'openai') {
      cfg.openaiApiKey  = apiKey
      cfg.openaiBaseURL = baseURL
      cfg._resolvedProvider = 'openai'
      cfg.defaultProvider   = 'openai'
      delete cfg._directAuth
      delete cfg.apiKey
      delete cfg.baseURL
    } else if (providerType === 'openai_official') {
      cfg.openaiApiKey  = apiKey
      cfg.openaiBaseURL = baseURL.replace(/\/+$/, '')
      cfg._resolvedProvider = 'openai'
      cfg._directAuth       = true
      cfg.defaultProvider   = 'openai'
      delete cfg.apiKey
      delete cfg.baseURL
    } else if (providerType === 'deepseek') {
      cfg.openaiApiKey  = apiKey
      cfg.openaiBaseURL = baseURL.replace(/\/+$/, '')
      cfg._resolvedProvider = 'openai'
      cfg._directAuth       = true
      cfg.defaultProvider   = 'openai'
      delete cfg.apiKey
      delete cfg.baseURL
    } else {
      cfg.openaiApiKey  = apiKey
      cfg.openaiBaseURL = baseURL
      cfg._resolvedProvider = 'openai'
      cfg.defaultProvider   = 'openai'
      delete cfg._directAuth
      delete cfg.apiKey
      delete cfg.baseURL
    }
  }

  // ── _fireGroupAgentsDirect ────────────────────────────────────────────────────
  // Used by the idle-agent queue path (new message arrives while agents already running).
  // Calls the new minimal agent:run-additional IPC — Electron builds agentRuns internally.

  async function _fireGroupAgentsDirect(chatId, targetChat, text, agentIds, pendingAttachments, opts = {}) {
    if (!window.electronAPI?.runAgentAdditional) {
      dbg('runAgentAdditional not available — skipping parallel fire', 'warn')
      return
    }

    const groupIds = targetChat.groupAgentIds || []

    // Add user message (skip if caller already added it, e.g. idle/busy split in sendMessage)
    if (!opts.skipUserMessage) {
      const stampUid = targetChat.userAgentId || agentsStore.defaultUserAgent?.id || null
      await chatsStore.addMessage(chatId, {
        role: 'user',
        content: text,
        ...(stampUid ? { userAgentId: stampUid } : {}),
        ...(pendingAttachments?.length > 0 ? { attachments: pendingAttachments } : {}),
      })
    }

    // Build raw messages from conversation
    const messages = targetChat.messages
      .filter(m => {
        if (m.role === 'user') return !!m.content
        if (m.role === 'assistant' && !m.streaming) return !!(m.content || m.segments?.length)
        return false
      })
      .map(m => ({ role: m.role, content: m.content, agentId: m.agentId || null, userAgentId: m.userAgentId || null }))
      .filter(m => !!m.content)

    const targetChatMeta = {
      permissionMode: targetChat.permissionMode || 'inherit',
      chatAllowList: JSON.parse(JSON.stringify(targetChat.chatAllowList || [])),
      chatDangerOverrides: JSON.parse(JSON.stringify(targetChat.chatDangerOverrides || [])),
      maxAgentRounds: targetChat.maxAgentRounds ?? 10,
      mode: targetChat.mode || 'chat',
      chatWorkingPath: (targetChat.mode === 'productivity' && targetChat.workingPath) ? targetChat.workingPath : null,
      userAgentId: targetChat.userAgentId || null,
      systemAgentId: agentIds[0] || null,
    }

    for (const id of agentIds) runningAgentKeys.add(`${chatId}:${id}`)

    dbg(`_fireGroupAgentsDirect: firing ${agentIds.join(', ')} via runAgentAdditional`)
    try {
      await window.electronAPI.runAgentAdditional({
        chatId,
        messages: JSON.parse(JSON.stringify(messages)),
        agentIds,
        currentAttachments: pendingAttachments?.length > 0 ? JSON.parse(JSON.stringify(pendingAttachments)) : [],
        groupIds: groupIds.length > 0 ? groupIds : agentIds,
        targetChatMeta,
        enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects?.value || [])),
      })
    } catch (err) {
      dbg(`_fireGroupAgentsDirect IPC error: ${err.message}`, 'error')
      for (const id of agentIds) runningAgentKeys.delete(`${chatId}:${id}`)
    }
    scrollToBottom(false, chatId)
  }

  return {
    applyProviderCredsToConfig,
    _fireGroupAgentsDirect,
  }
}
