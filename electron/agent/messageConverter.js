/**
 * Message conversion utilities — extracted from AgentLoop.
 *
 * Pure functions with no instance state. AgentLoop delegates to these via
 * thin wrapper methods.
 */
const { logger } = require('../logger')

// ── Tool result helpers ──────────────────────────────────────────────────────

/**
 * Serialize a tool result for the LLM context.
 * Tools now return { content: [{type:'text', text}], details } (unified format).
 * Legacy tools (MCP, HTTP, subagent, etc.) still return plain objects — handle both.
 * Hard cap at 100 000 chars to protect context window.
 */
function serializeToolResult(result, toolName) {
  if (!result) return '{}'

  // Unified format from BaseTool subclasses
  if (Array.isArray(result.content) && result.content.length > 0 && result.content[0].type === 'text') {
    let text = result.content[0].text
    if (text.length > 100000) {
      logger.warn(`Tool result too large (${text.length} chars), truncating: ${toolName}`)
      text = text.slice(0, 100000) + '\n[truncated]'
    }
    return text
  }

  // Legacy plain-object format (MCP, HTTP, subagent, built-ins like load_skill)
  let serialized = JSON.stringify(result)
  if (serialized.length > 100000) {
    logger.warn(`Tool result too large (${serialized.length} chars), truncating: ${toolName}`)
    serialized = JSON.stringify({ success: result?.success, data: `[Result truncated: ${serialized.length} chars original.]` })
  }
  return serialized
}

/**
 * Extract the UI-facing result to pass to onChunk.
 * For unified format, expose details (structured data) alongside text.
 */
function uiResult(result) {
  if (Array.isArray(result?.content) && result.content[0]?.type === 'text') {
    // Preserve the `isError` flag so the renderer can show a failure badge
    // instead of the green success badge when a tool returns _err(). Spread
    // before details so a tool's structured details cannot accidentally
    // override the flag.
    return {
      text: result.content[0].text,
      ...(result.isError ? { isError: true } : {}),
      ...result.details,
    }
  }
  return result
}

// ── Message helpers ──────────────────────────────────────────────────────────

/**
 * Slice messages to the last N conversation turns.
 * A "turn" = one user message + all following assistant/tool messages until next user.
 * Always preserves the full last N user messages and their responses.
 */
function sliceToLastNTurns(messages, n) {
  if (!messages || messages.length === 0) return messages
  const userIndices = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') userIndices.push(i)
  }
  if (userIndices.length <= n) return messages
  const startIdx = userIndices[userIndices.length - n]
  return messages.slice(startIdx)
}

/**
 * Build conversation messages, transforming the last user message's
 * attachments into Anthropic multimodal content blocks.
 *
 * @param {Array} messages           Plain [{role, content}] messages
 * @param {Array|undefined} currentAttachments  Attachment objects from the UI
 * @returns {Array} Messages with the last user message potentially multimodal
 */
function buildConversationMessages(messages, currentAttachments) {
  const msgs = [...messages]

  // Find the last user message
  let lastUserIdx = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') { lastUserIdx = i; break }
  }
  if (lastUserIdx === -1) return msgs

  const userMsg = msgs[lastUserIdx]
  const textContent = typeof userMsg.content === 'string' ? userMsg.content : ''

  // Detect 3D model URLs in the user message and annotate them
  const MODEL_URL_RE = /https?:\/\/[^\s<>"')\]]+\.(glb|gltf|obj|stl|babylon|fbx)(\?[^\s<>"')\]]*)?/gi
  const modelMatches = textContent.match(MODEL_URL_RE)

  // If no attachments and no 3D URLs, return as-is
  if ((!currentAttachments || currentAttachments.length === 0) && !modelMatches) return msgs

  const contentBlocks = []

  // Add attachment content blocks before the user's text
  if (currentAttachments && currentAttachments.length > 0) {
    for (const att of currentAttachments) {
      if (att.type === 'image' && att.base64 && att.mediaType) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: att.mediaType, data: att.base64 }
        })
      } else if (att.type === 'text' && att.content) {
        contentBlocks.push({
          type: 'text',
          text: `--- Attached file: ${att.name} (${att.path}) ---\n${att.content}\n--- End of ${att.name} ---`
        })
      } else if (att.type === 'folder') {
        contentBlocks.push({
          type: 'text',
          text: `[Attached folder: ${att.path}] The user attached this folder for context. ${att.preview || ''}`
        })
      }
    }
  }

  // Add the original user text
  if (textContent) {
    contentBlocks.push({ type: 'text', text: textContent })
  }

  // Annotate 3D model URLs so the AI knows they're being rendered
  if (modelMatches) {
    const uniqueUrls = [...new Set(modelMatches)]
    const fileNames = uniqueUrls.map(u => {
      const parts = u.split('/')
      return parts[parts.length - 1].split('?')[0]
    })
    contentBlocks.push({
      type: 'text',
      text: `[System: The chat UI is displaying an interactive 3D viewer for: ${fileNames.join(', ')}. The user can rotate, zoom, and toggle wireframe. Acknowledge the 3D model and offer helpful context about it.]`
    })
  }

  msgs[lastUserIdx] = { role: 'user', content: contentBlocks }
  return msgs
}

/**
 * Convert Anthropic-format conversation messages to OpenAI chat format.
 * - System prompt → { role: 'system', content }
 * - User text → { role: 'user', content }
 * - User multimodal → { role: 'user', content: [...parts] }
 * - Assistant with tool_use blocks → { role: 'assistant', content, tool_calls }
 * - tool_result blocks → { role: 'tool', tool_call_id, content }
 */
function toOpenAIMessages(systemPrompt, messages) {
  const out = []
  if (systemPrompt) {
    out.push({ role: 'system', content: systemPrompt })
  }
  for (const msg of messages) {
    if (msg.role === 'user') {
      if (Array.isArray(msg.content)) {
        // Check for tool_result blocks (Anthropic format)
        const toolResults = msg.content.filter(b => b.type === 'tool_result')
        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            out.push({
              role: 'tool',
              tool_call_id: tr.tool_use_id,
              content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content)
            })
          }
        } else {
          // Multimodal content — convert to OpenAI format
          const parts = msg.content.map(block => {
            if (block.type === 'text') return { type: 'text', text: block.text }
            if (block.type === 'image' && block.source) {
              return {
                type: 'image_url',
                image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` }
              }
            }
            return { type: 'text', text: JSON.stringify(block) }
          })
          out.push({ role: 'user', content: parts })
        }
      } else {
        out.push({ role: 'user', content: msg.content })
      }
    } else if (msg.role === 'tool') {
      // Already OpenAI-native tool result — pass through as-is
      out.push({ role: 'tool', tool_call_id: msg.tool_call_id, content: msg.content || '' })
    } else if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        // Anthropic-style content blocks — convert to OpenAI format
        const textParts = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
        const toolUses = msg.content.filter(b => b.type === 'tool_use')
        const entry = { role: 'assistant' }
        if (textParts) entry.content = textParts
        if (toolUses.length > 0) {
          entry.tool_calls = toolUses.map(tu => ({
            id: tu.id,
            type: 'function',
            function: {
              name: tu.name,
              arguments: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input)
            }
          }))
        }
        if (!entry.content && !entry.tool_calls) entry.content = ''
        out.push(entry)
      } else {
        // Already OpenAI-native format (stored directly after streaming).
        // Preserve reasoning_content so DeepSeek thinking mode doesn't 400.
        const entry = { role: 'assistant', content: msg.content || '' }
        if (msg.tool_calls) entry.tool_calls = msg.tool_calls
        if (msg.reasoning_content) entry.reasoning_content = msg.reasoning_content
        out.push(entry)
      }
    }
  }
  return out
}

/**
 * Convert Anthropic-style messages to Gemini `contents` format.
 * System prompt is injected as a user/model turn pair (Gemini has no system role).
 */
function toGeminiContents(systemPrompt, messages) {
  const contents = []
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] })
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] })
  }
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user'
    const parts = []
    if (typeof msg.content === 'string') {
      if (msg.content) parts.push({ text: msg.content })
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          parts.push({ text: block.text })
        } else if (block.type === 'image' && block.source) {
          parts.push({ inlineData: { mimeType: block.source.media_type, data: block.source.data } })
        }
        // tool_result / tool_use blocks are skipped — Gemini image models don't support tool use
      }
    }
    if (parts.length > 0) contents.push({ role, parts })
  }
  return contents
}

module.exports = { serializeToolResult, uiResult, sliceToLastNTurns, buildConversationMessages, toOpenAIMessages, toGeminiContents }
