import { reactive, ref, onBeforeUnmount } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useConfigStore } from '../stores/config'
import { BUILTIN_DOC_EDITOR_ID } from '../stores/personas'

/**
 * Composable for the AI Doc side panel in DocsView.
 * Manages panel visibility, multi-turn conversation, streaming,
 * full file + selection context, and apply/revert tracking.
 * Now routes through the full agent loop via agent:doc-run.
 */
export function useAiMagic() {
  const configStore = useConfigStore()

  const panelOpen = ref(false)
  const streaming = ref(false)
  const requestId = ref(null)

  // Persona selection — defaults to built-in Doc Editor
  const selectedPersonaId = ref(BUILTIN_DOC_EDITOR_ID)

  // Context — always has the full file, optionally a selection
  const selectionContext = reactive({
    fullFileContent: '',
    selectedText: '',    // empty when no selection (whole file)
    fileName: '',
    filePath: '',
    language: '',
    isWholeFile: true,
  })

  // Messages: { id, role, content, type, replacement, targetText, applied }
  const messages = ref([])

  let _cleanupChunkListener = null

  /** Open the panel with full file content. Clears conversation. */
  function open(fullContent, fileContext) {
    panelOpen.value = true
    selectionContext.fullFileContent = fullContent || ''
    selectionContext.selectedText = ''
    selectionContext.fileName = fileContext?.fileName || ''
    selectionContext.filePath = fileContext?.filePath || ''
    selectionContext.language = fileContext?.language || ''
    selectionContext.isWholeFile = true
    messages.value = []
    streaming.value = false
    requestId.value = null
  }

  /** Update the selection without clearing conversation. */
  function updateSelection(selectedText) {
    selectionContext.selectedText = selectedText || ''
    selectionContext.isWholeFile = !selectedText
  }

  /** Keep fullFileContent in sync when content changes externally. */
  function updateFileContent(content) {
    selectionContext.fullFileContent = content || ''
  }

  function close() {
    if (streaming.value) stop()
    panelOpen.value = false
    messages.value = []
    selectionContext.fullFileContent = ''
    selectionContext.selectedText = ''
    selectionContext.fileName = ''
    selectionContext.filePath = ''
    selectionContext.language = ''
    selectionContext.isWholeFile = true
    if (_cleanupChunkListener) {
      _cleanupChunkListener()
      _cleanupChunkListener = null
    }
  }

  /**
   * Send a user message through the full agent loop.
   * @param {string} userText
   * @param {Object} agentConfig — extra config gathered by DocsView:
   *   { personaPrompt, enabledSkills, mcpServers, httpTools, knowledgeConfig }
   */
  async function send(userText, agentConfig = {}) {
    if (!userText.trim()) return
    if (streaming.value) return

    const userMsg = { id: uuidv4(), role: 'user', content: userText.trim(), type: 'text' }
    messages.value.push(userMsg)

    const aiMsgId = uuidv4()
    const targetText = selectionContext.selectedText || selectionContext.fullFileContent
    const aiMsg = {
      id: aiMsgId, role: 'ai', content: '', type: 'text',
      replacement: null, targetText, applied: false,
      toolCalls: [],
    }
    messages.value.push(aiMsg)

    const rid = uuidv4()
    requestId.value = rid
    streaming.value = true

    if (_cleanupChunkListener) _cleanupChunkListener()
    _cleanupChunkListener = window.electronAPI.onEditChunk((data) => {
      if (data.requestId !== rid) return
      const msg = messages.value.find(m => m.id === aiMsgId)
      if (!msg) return
      if (data.type === 'delta') {
        msg.content += data.text
      } else if (data.type === 'tool_call') {
        msg.toolCalls.push({ name: data.name, input: data.input, id: data.id })
      } else if (data.type === 'tool_result') {
        const tc = msg.toolCalls.find(t => t.id === data.id)
        if (tc) tc.result = data.result
      } else if (data.type === 'permission_request') {
        msg.toolCalls.push({
          _permBlock: true,
          blockId: data.blockId,
          toolName: data.toolName,
          command: data.command,
          toolInput: data.toolInput,
          status: 'pending',
        })
      } else if (data.type === 'done') {
        streaming.value = false
        requestId.value = null
        _parseReplacement(msg)
      } else if (data.type === 'error') {
        streaming.value = false
        requestId.value = null
        msg.type = 'error'
        if (!msg.content) msg.content = data.text || 'Unknown error'
      }
    })

    const apiMessages = _buildApiMessages()
    const config = JSON.parse(JSON.stringify(configStore.config || {}))

    try {
      await window.electronAPI.runDocAgent({
        requestId: rid,
        messages: apiMessages,
        selectedText: selectionContext.selectedText || selectionContext.fullFileContent,
        fullFileContent: selectionContext.fullFileContent,
        fileContext: {
          fileName: selectionContext.fileName,
          filePath: selectionContext.filePath,
          language: selectionContext.language,
        },
        config,
        personaPrompt: agentConfig.personaPrompt || '',
        enabledSkills: agentConfig.enabledSkills || [],
        mcpServers: agentConfig.mcpServers || [],
        httpTools: agentConfig.httpTools || [],
        knowledgeConfig: agentConfig.knowledgeConfig || null,
        permissionMode: agentConfig.permissionMode || 'allow_all',
      })
    } catch (err) {
      if (requestId.value === rid && streaming.value) {
        streaming.value = false
        requestId.value = null
        const msg = messages.value.find(m => m.id === aiMsgId)
        if (msg) {
          msg.type = 'error'
          if (!msg.content) msg.content = err.message || 'Request failed'
        }
      }
    }
  }

  function stop() {
    if (requestId.value) {
      window.electronAPI.stopDocAgent(requestId.value)
    }
    streaming.value = false
    requestId.value = null
  }

  /** Get the replacement text + original target for a message. */
  function getReplacementInfo(msgId) {
    const msg = messages.value.find(m => m.id === msgId)
    if (!msg || !msg.replacement) return null
    return { replacement: msg.replacement, targetText: msg.targetText }
  }

  function markApplied(msgId) {
    const msg = messages.value.find(m => m.id === msgId)
    if (msg) msg.applied = true
  }

  function markReverted(msgId) {
    const msg = messages.value.find(m => m.id === msgId)
    if (msg) msg.applied = false
  }

  function _parseReplacement(msg) {
    const content = msg.content
    const match = content.match(/<replacement>([\s\S]*?)<\/replacement>/)
    if (match) {
      msg.type = 'edit'
      msg.replacement = match[1]
      const before = content.slice(0, content.indexOf('<replacement>')).trim()
      const after = content.slice(content.indexOf('</replacement>') + '</replacement>'.length).trim()
      msg.content = [before, after].filter(Boolean).join('\n\n') || 'Here is the edited version:'
    }
  }

  function _buildApiMessages() {
    const apiMsgs = []
    for (const msg of messages.value) {
      if (msg.role === 'user') {
        apiMsgs.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'ai' && msg.content) {
        apiMsgs.push({ role: 'assistant', content: msg.content })
      }
    }
    // Remove the trailing empty AI placeholder
    if (apiMsgs.length > 0 && apiMsgs[apiMsgs.length - 1].role === 'assistant' && !apiMsgs[apiMsgs.length - 1].content) {
      apiMsgs.pop()
    }
    return apiMsgs
  }

  onBeforeUnmount(() => {
    if (streaming.value) stop()
    if (_cleanupChunkListener) {
      _cleanupChunkListener()
      _cleanupChunkListener = null
    }
  })

  return {
    panelOpen,
    streaming,
    requestId,
    selectionContext,
    messages,
    selectedPersonaId,
    open,
    close,
    send,
    stop,
    updateSelection,
    updateFileContent,
    getReplacementInfo,
    markApplied,
    markReverted,
  }
}
