// electron/im-bridge/message-router.js
'use strict'
const fs      = require('fs')
const path    = require('path')
const { v4: uuidv4 } = require('uuid')
const { AgentLoop } = require('../agent/agentLoop')

const ds = require('../lib/dataStore')
const { normalizeLoopConfig } = require('../ipc/agentRuntimeUtils')

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function writeAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, filePath)
}

function chatFile(chatId) {
  return path.join(ds.paths().CHATS_DIR, `${chatId}.json`)
}

function loadMessages(chatId) {
  const all = readJSON(chatFile(chatId), { messages: [] }).messages || []
  return all
    .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming && m.content))
    .map(m => ({ role: m.role, content: m.content || '[Image]' }))
}

function appendMessage(chatId, msg) {
  const chat = readJSON(chatFile(chatId), { id: chatId, messages: [] })
  chat.messages = [...(chat.messages || []), msg]
  chat.updatedAt = Date.now()
  writeAtomic(chatFile(chatId), chat)

  try {
    const index = readJSON(ds.paths().CHATS_INDEX_FILE, [])
    function touch(nodes) {
      for (const n of nodes) {
        if (n.id === chatId) { n.updatedAt = chat.updatedAt; return true }
        if (n.children && touch(n.children)) return true
      }
      return false
    }
    touch(index)
    writeAtomic(ds.paths().CHATS_INDEX_FILE, index)
  } catch { /* non-fatal */ }
}

function finalizeMessage(chatId, msgId, updates) {
  const chat = readJSON(chatFile(chatId), { id: chatId, messages: [] })
  const msg = (chat.messages || []).find(m => m.id === msgId)
  if (msg) {
    Object.assign(msg, updates)
    chat.updatedAt = Date.now()
    writeAtomic(chatFile(chatId), chat)
  }
}

function removeMessage(chatId, msgId) {
  const chat = readJSON(chatFile(chatId), { id: chatId, messages: [] })
  chat.messages = (chat.messages || []).filter(m => m.id !== msgId)
  chat.updatedAt = Date.now()
  writeAtomic(chatFile(chatId), chat)
}

function readAgents() {
  const data = readJSON(ds.paths().AGENTS_FILE, [])
  return Array.isArray(data) ? data : (data.agents || [])
}


function buildLoopConfig(baseConfig, agent) {
  // Use normalizeLoopConfig so provider type resolution (anthropic vs openai-compat)
  // is identical to the chat window path. This fixes OpenRouter models that only
  // support tool use via the OpenAI-compat API, not the Anthropic-format API.
  const cfg = normalizeLoopConfig({ ...baseConfig }, agent.id)
  if (agent.modelId) cfg.customModel = agent.modelId
  return cfg
}

function parseIMAtMentions(text, agents) {
  if (/@all\b/i.test(text)) {
    return { mentionAll: true, matches: [] }
  }

  const mentioned = []
  const mentionRegex = /@([\w\u00C0-\u024F\u4E00-\u9FFF\uAC00-\uD7FF]+)/g
  let m
  while ((m = mentionRegex.exec(text)) !== null) {
    const name = m[1].toLowerCase()
    const found = agents.find(a => a.name.toLowerCase() === name)
    if (found && !mentioned.includes(found.id)) {
      mentioned.push(found.id)
    }
  }

  return { mentionAll: false, matches: mentioned }
}

async function routeMessage({ chatId, userText, displayName, imageAttachment, sendToIM, notifyRenderer }) {
  const now = Date.now()
  const userMsg = {
    id: uuidv4(),
    role: 'user',
    content: userText,
    timestamp: now,
    createdAt: now,
  }
  if (imageAttachment) {
    userMsg.attachments = [{
      id:        uuidv4(),
      name:      imageAttachment.name || 'image.jpg',
      type:      'image',
      mediaType: imageAttachment.mediaType || 'image/jpeg',
      preview:   `data:${imageAttachment.mediaType || 'image/jpeg'};base64,${imageAttachment.base64}`,
    }]
  }
  appendMessage(chatId, userMsg)
  notifyRenderer('im:chat-updated', { chatId })

  const config   = readJSON(ds.paths().CONFIG_FILE, {})
  const chat     = readJSON(chatFile(chatId), { id: chatId, messages: [] })
  const agents = readAgents()

  const agentById = {}
  for (const a of agents) agentById[a.id] = a

  const isGroupChat     = !!(chat.isGroupChat && chat.groupAgentIds && chat.groupAgentIds.length > 0)
  const groupAgentIds = chat.groupAgentIds || []

  let respondingIds = []

  if (isGroupChat) {
    const { mentionAll, matches } = parseIMAtMentions(userText, agents)
    if (mentionAll || matches.length === 0) {
      respondingIds = [...groupAgentIds]
    } else {
      respondingIds = matches.filter(id => groupAgentIds.includes(id))
      if (respondingIds.length === 0) respondingIds = [...groupAgentIds]
    }
  } else {
    const pid = chat.systemAgentId || null
    if (pid && agentById[pid]) {
      respondingIds = [pid]
    } else {
      const defSys = agents.find(a => a.type === 'system' && a.isDefault)
        || agents.find(a => a.type === 'system')
      if (defSys) respondingIds = [defSys.id]
    }
  }

  if (respondingIds.length === 0) {
    await runWithBaseConfig(config, chatId, imageAttachment, sendToIM, notifyRenderer)
    return
  }

  const messages = loadMessages(chatId)

  const baseConfig = {
    ...config,
    soulsDir:            ds.paths().SOULS_DIR,
    dataPath:            ds.paths().DATA_DIR,
    chatPermissionMode:  'all_permissions',
    chatAllowList:       [],
    chatDangerOverrides: [],
    maxOutputTokens:     config.maxOutputTokens || null,
    artifactPath:        config.artifactPath || config.artyfactPath || '',
    skillsPath:          config.skillsPath || '',
    DoCPath:             config.DoCPath || '',
  }

  for (const pid of respondingIds) {
    const agent = agentById[pid]
    if (!agent) continue

    const loopConfig = buildLoopConfig(baseConfig, agent)

    const agentPrompts = {
      systemAgentPrompt: agent.prompt || '',
      systemAgentId:     pid,
      userAgentId:       '__im_user__',
    }

    if (isGroupChat) {
      const otherParticipants = groupAgentIds
        .filter(id => id !== pid)
        .map(id => {
          const a = agentById[id]
          return { id, name: a?.name || 'Unknown', description: a?.description || '', prompt: a?.prompt || '' }
        })
      agentPrompts.groupChatContext = {
        agentName:        agent.name,
        agentDescription: agent.description || '',
        otherParticipants,
      }
    }

    // Create streaming placeholder on disk + notify UI to create bubble in memory
    const msgId = uuidv4()
    const streamingMsg = {
      id: msgId,
      role: 'assistant',
      content: '',
      agentId: pid,
      streaming: true,
      streamingStartedAt: Date.now(),
      segments: [{ type: 'text', content: '' }],
      timestamp: Date.now(),
      createdAt: Date.now(),
    }
    appendMessage(chatId, streamingMsg)
    notifyRenderer('im:agent-stream-start', { chatId, message: streamingMsg })

    const loop = new AgentLoop(loopConfig)
    let fullText = ''
    let flushedLen = 0
    const groupPrefix = isGroupChat && respondingIds.length > 1 ? `**${agent.name}**: ` : ''

    // Flush accumulated text to Teams immediately (fire-and-forget)
    const flushPartial = () => {
      const partial = fullText.slice(flushedLen).trim()
      if (partial) {
        flushedLen = fullText.length
        sendToIM(groupPrefix + partial).catch(() => {})
      }
    }

    try {
      await loop.run(
        messages,
        [],
        [],
        (chunk) => {
          if (chunk.type === 'text') fullText += chunk.text || ''
          // Before a tool runs, send accumulated text to Teams so user sees it immediately
          if (chunk.type === 'tool_call') flushPartial()
          notifyRenderer('im:agent-chunk', { chatId, messageId: msgId, chunk })
        },
        imageAttachment ? [imageAttachment] : [],
        agentPrompts,
        [],
        [],
        null
      )
    } catch (err) {
      console.error(`[im-bridge] agentLoop error (agent ${agent.name}):`, err.message)
      await sendToIM(`Error: ${err.message}`)
      continue
    } finally {
      loop.stop?.()
    }

    // Finalize: replace streaming placeholder with final content
    if (fullText) {
      finalizeMessage(chatId, msgId, {
        content:   fullText,
        streaming: false,
        segments:  [{ type: 'text', content: fullText }],
      })
      notifyRenderer('im:agent-stream-end', { chatId, messageId: msgId })

      // Send any remaining text that wasn't flushed yet
      const remaining = fullText.slice(flushedLen).trim()
      if (remaining) await sendToIM(groupPrefix + remaining)

      // Only accumulate history in single-agent mode; in group mode each
      // agent responds independently to the same snapshot — appending an
      // assistant message here would cause the next agent's call to end
      // with an assistant turn, which some models reject (no prefill support).
      if (respondingIds.length === 1) {
        messages.push({ role: 'assistant', content: fullText })
      }
    } else {
      removeMessage(chatId, msgId)
      notifyRenderer('im:agent-stream-end', { chatId, messageId: msgId })
    }
  }
}

async function runWithBaseConfig(config, chatId, imageAttachment, sendToIM, notifyRenderer) {
  const provider = config.defaultProvider || 'anthropic'
  const loopConfig = {
    ...config,
    soulsDir:            ds.paths().SOULS_DIR,
    dataPath:            ds.paths().DATA_DIR,
    chatPermissionMode:  'all_permissions',
    chatAllowList:       [],
    chatDangerOverrides: [],
    maxOutputTokens:     config.maxOutputTokens || null,
    artifactPath:        config.artifactPath || config.artyfactPath || '',
    skillsPath:          config.skillsPath || '',
    DoCPath:             config.DoCPath || '',
  }

  // Use agentRuntimeUtils for proper provider credential resolution (new providers[] array + legacy fallback)
  const { applyProviderCredsToConfig } = require('../ipc/agentRuntimeUtils')
  applyProviderCredsToConfig(loopConfig, provider)

  const messages = loadMessages(chatId)

  // Create streaming placeholder on disk + notify UI to create bubble in memory
  const msgId = uuidv4()
  const streamingMsg = {
    id: msgId,
    role: 'assistant',
    content: '',
    streaming: true,
    streamingStartedAt: Date.now(),
    segments: [{ type: 'text', content: '' }],
    timestamp: Date.now(),
    createdAt: Date.now(),
  }
  appendMessage(chatId, streamingMsg)
  notifyRenderer('im:agent-stream-start', { chatId, message: streamingMsg })

  const loop = new AgentLoop(loopConfig)
  let fullText = ''
  let flushedLen = 0

  const flushPartial = () => {
    const partial = fullText.slice(flushedLen).trim()
    if (partial) {
      flushedLen = fullText.length
      sendToIM(partial).catch(() => {})
    }
  }

  try {
    await loop.run(messages, [], [], (chunk) => {
      if (chunk.type === 'text') fullText += chunk.text || ''
      if (chunk.type === 'tool_call') flushPartial()
      notifyRenderer('im:agent-chunk', { chatId, messageId: msgId, chunk })
    }, imageAttachment ? [imageAttachment] : [], undefined, [], [], null)
  } catch (err) {
    console.error('[im-bridge] agentLoop error:', err.message)
    await sendToIM('Error: ' + err.message)
    return
  } finally {
    loop.stop?.()
  }

  if (fullText) {
    finalizeMessage(chatId, msgId, {
      content:   fullText,
      streaming: false,
      segments:  [{ type: 'text', content: fullText }],
    })
    const remaining = fullText.slice(flushedLen).trim()
    if (remaining) await sendToIM(remaining)
    notifyRenderer('im:agent-stream-end', { chatId, messageId: msgId })
  } else {
    removeMessage(chatId, msgId)
    notifyRenderer('im:agent-stream-end', { chatId, messageId: msgId })
  }
}

module.exports = { routeMessage }
