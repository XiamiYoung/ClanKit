/**
 * PermissionGate — evaluates a tool call against the permission rules.
 *
 * Returns:
 *   'allow'  — on allow list, or mode is all_permissions and not on danger list
 *   'block'  — on danger block list (hard deny, skip UI)
 *   'ask'    — mode is sandbox and not on any allow list
 */

/**
 * Build the command string for a tool call.
 * execute_shell: "command arg1 arg2"
 * file_operation: "file_operation:write" or similar
 * mcp_*: "mcp:toolName"
 */
function buildCommandString(toolName, toolInput) {
  if (toolName === 'execute_shell') {
    const cmd = toolInput.command || ''
    const args = Array.isArray(toolInput.args) && toolInput.args.length > 0
      ? ' ' + toolInput.args.join(' ')
      : ''
    return cmd + args
  }
  if (toolName === 'file_operation') {
    return `file_operation:${toolInput.operation || ''}`
  }
  if (toolName.startsWith('mcp_')) {
    return `mcp:${toolName}`
  }
  return toolName
}

/**
 * Simple glob pattern matching where * matches anything.
 * If no * in pattern, uses startsWith match.
 */
function matchesPattern(str, pattern) {
  if (!pattern) return false
  if (!pattern.includes('*')) return str.startsWith(pattern)
  // Escape special regex chars except * which becomes .*
  const regex = new RegExp(
    '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  )
  return regex.test(str)
}

function matchesAnyPattern(commandStr, list) {
  if (!list || list.length === 0) return null
  for (const entry of list) {
    if (entry.pattern && matchesPattern(commandStr, entry.pattern)) {
      return entry
    }
  }
  return null
}

class PermissionGate {
  /**
   * @param {Object} config
   * @param {string} config.globalMode      'sandbox' | 'all_permissions'
   * @param {Array}  config.sandboxAllowList [{id, pattern, description}]
   * @param {Array}  config.dangerBlockList  [{id, pattern, description}]
   * @param {string} config.chatMode         'inherit' | 'chat_only' | 'all_permissions'
   * @param {Array}  config.chatAllowList    [{id, pattern, description}]
   */
  constructor(config = {}) {
    this.globalMode = config.globalMode || 'sandbox'
    this.sandboxAllowList = config.sandboxAllowList || []
    this.dangerBlockList = config.dangerBlockList || []
    this.chatMode = config.chatMode || 'inherit'
    this.chatAllowList = config.chatAllowList || []
  }

  /**
   * Determine whether a tool call is allowed, blocked, or needs user approval.
   *
   * @param {string} toolName
   * @param {Object} toolInput
   * @returns {{ decision: 'allow'|'block'|'ask', reason: string, commandStr: string }}
   */
  check(toolName, toolInput) {
    const commandStr = buildCommandString(toolName, toolInput)

    // 1. Danger block list always wins (checked before mode)
    const blockedEntry = matchesAnyPattern(commandStr, this.dangerBlockList)
    if (blockedEntry) {
      return {
        decision: 'block',
        reason: `Matches danger block list: "${blockedEntry.pattern}" — ${blockedEntry.description || 'blocked'}`,
        commandStr
      }
    }

    // 2. Resolve effective mode (chat overrides global if not 'inherit')
    const effectiveMode = this.chatMode !== 'inherit' ? this.chatMode : this.globalMode

    // 3. In all_permissions mode — allow (danger list already checked above)
    if (effectiveMode === 'all_permissions') {
      return { decision: 'allow', reason: 'all_permissions mode', commandStr }
    }

    // 4. Sandbox mode — check allow lists
    // Chat allow list first (more specific)
    const chatAllowed = matchesAnyPattern(commandStr, this.chatAllowList)
    if (chatAllowed) {
      return { decision: 'allow', reason: `Chat allow list: "${chatAllowed.pattern}"`, commandStr }
    }

    // Global allow list — only consulted when inheriting from global mode.
    // If chatMode is explicitly 'chat_only', the chat allow list is the sole override;
    // the global allow list is intentionally bypassed.
    if (this.chatMode === 'inherit') {
      const globalAllowed = matchesAnyPattern(commandStr, this.sandboxAllowList)
      if (globalAllowed) {
        return { decision: 'allow', reason: `Global allow list: "${globalAllowed.pattern}"`, commandStr }
      }
    }

    // 5. Neither allowed nor blocked — ask the user
    return { decision: 'ask', reason: 'sandbox mode, not on allow list', commandStr }
  }

  /**
   * Add a pattern to the in-memory allow list (chat or global).
   * Call this after user approves with 'allow_chat' or 'allow_global'.
   */
  addToAllowList(pattern, target = 'chat') {
    const entry = { id: `auto-${Date.now()}`, pattern, description: 'Auto-added from chat approval' }
    if (target === 'global') {
      this.sandboxAllowList.push(entry)
    } else {
      this.chatAllowList.push(entry)
    }
  }
}

module.exports = { PermissionGate, buildCommandString, matchesPattern }
