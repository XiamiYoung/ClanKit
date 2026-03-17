// electron/im-bridge/message-router.js
'use strict'
const fs      = require('fs')
const path    = require('path')
const os      = require('os')
const { v4: uuidv4 } = require('uuid')
const { AgentLoop } = require('../agent/agentLoop')

// Lazy: DATA_DIR is set by main.js via process.env after ensureDataDir()
const { defaultDataPath } = require('../defaultDataPath')
function getDataDir() {
  const d = process.env.CLANKAI_DATA_PATH
  return (d && d !== 'null') ? d : defaultDataPath()
}
function CHATS_DIR()   { return path.join(getDataDir(), 'chats') }
function CHATS_INDEX() { return path.join(CHATS_DIR(), 'index.json') }
function CONFIG_FILE() { return path.join(getDataDir(), 'config.json') }
function AGENTS_FILE() { return path.join(getDataDir(), 'agents.json') }

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
  return path.join(CHATS_DIR(), `${chatId}.json`)
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
    const index = readJSON(CHATS_INDEX(), [])
    function touch(nodes) {
      for (const n of nodes) {
        if (n.id === chatId) { n.updatedAt = chat.updatedAt; return true }
        if (n.children && touch(n.children)) return true
      }
      return false
    }
    touch(index)
    writeAtomic(CHATS_INDEX(), index)
  } catch { /* non-fatal */ }
}

function readAgents() {
  const data = readJSON(AGENTS_FILE(), [])
  return Array.isArray(data) ? data : (data.agents || [])
}

function buildLoopConfig(baseConfig, agent) {
  const cfg = { ...baseConfig }
  const resolvedProvider = agent.providerId || baseConfig.defaultProvider || 'anthropic'

  delete cfg.apiKey
  delete cfg.baseURL
  delete cfg.openaiApiKey
  delete cfg.openaiBaseURL
  delete cfg._directAuth
  delete cfg._resolvedProvider

  if (resolvedProvider === 'anthropic') {
    cfg.apiKey  = baseConfig.anthropic?.apiKey  || ''
    cfg.baseURL = baseConfig.anthropic?.baseURL || ''
  } else if (resolvedProvider === 'openrouter') {
    cfg.apiKey  = baseConfig.openrouter?.apiKey  || ''
    cfg.baseURL = baseConfig.openrouter?.baseURL || ''
  } else if (resolvedProvider === 'openai') {
    cfg.openaiApiKey  = baseConfig.openai?.apiKey  || ''
    cfg.openaiBaseURL = baseConfig.openai?.baseURL || ''
    cfg._resolvedProvider = 'openai'
    cfg.defaultProvider   = 'openai'
  } else if (resolvedProvider === 'deepseek') {
    cfg.openaiApiKey  = baseConfig.deepseek?.apiKey  || ''
    cfg.openaiBaseURL = (baseConfig.deepseek?.baseURL || '').replace(/\/+$/, '')
    cfg._resolvedProvider = 'openai'
    cfg._directAuth       = true
    cfg.defaultProvider   = 'openai'
  }

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

  const config   = readJSON(CONFIG_FILE(), {})
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
    soulsDir:            path.join(getDataDir(), 'souls'),
    dataPath:            getDataDir(),
    chatPermissionMode:  'allow_all',
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

    const loop = new AgentLoop(loopConfig)
    let fullText = ''

    try {
      await loop.run(
        messages,
        [],
        [],
        (chunk) => { if (chunk.type === 'text') fullText += chunk.text || '' },
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

    if (fullText) {
      const assistantMsg = {
        id:        uuidv4(),
        role:      'assistant',
        content:   fullText,
        agentId: pid,
        segments:  [{ type: 'text', content: fullText }],
        timestamp: Date.now(),
        createdAt: Date.now(),
      }
      appendMessage(chatId, assistantMsg)
      notifyRenderer('im:chat-updated', { chatId })

      const replyText = isGroupChat && respondingIds.length > 1
        ? `**${agent.name}**: ${fullText}`
        : fullText
      await sendToIM(replyText)

      // Only accumulate history in single-agent mode; in group mode each
      // agent responds independently to the same snapshot — appending an
      // assistant message here would cause the next agent's call to end
      // with an assistant turn, which some models reject (no prefill support).
      if (respondingIds.length === 1) {
        messages.push({ role: 'assistant', content: fullText })
      }
    }
  }
}

async function runWithBaseConfig(config, chatId, imageAttachment, sendToIM, notifyRenderer) {
  const provider = config.defaultProvider || 'anthropic'
  const loopConfig = {
    ...config,
    soulsDir:            path.join(getDataDir(), 'souls'),
    dataPath:            getDataDir(),
    chatPermissionMode:  'allow_all',
    chatAllowList:       [],
    chatDangerOverrides: [],
    maxOutputTokens:     config.maxOutputTokens || null,
    artifactPath:        config.artifactPath || config.artyfactPath || '',
    skillsPath:          config.skillsPath || '',
    DoCPath:             config.DoCPath || '',
  }

  if (provider === 'anthropic') {
    loopConfig.apiKey  = config.anthropic?.apiKey  || ''
    loopConfig.baseURL = config.anthropic?.baseURL || ''
  } else if (provider === 'openrouter') {
    loopConfig.apiKey  = config.openrouter?.apiKey  || ''
    loopConfig.baseURL = config.openrouter?.baseURL || ''
  } else if (provider === 'openai') {
    loopConfig.openaiApiKey  = config.openai?.apiKey  || ''
    loopConfig.openaiBaseURL = config.openai?.baseURL || ''
    loopConfig._resolvedProvider = 'openai'
    loopConfig.defaultProvider   = 'openai'
  } else if (provider === 'deepseek') {
    loopConfig.openaiApiKey  = config.deepseek?.apiKey  || ''
    loopConfig.openaiBaseURL = (config.deepseek?.baseURL || '').replace(/\/+$/, '')
    loopConfig._resolvedProvider = 'openai'
    loopConfig._directAuth       = true
    loopConfig.defaultProvider   = 'openai'
  }

  const messages = loadMessages(chatId)
  const loop = new AgentLoop(loopConfig)
  let fullText = ''

  try {
    await loop.run(messages, [], [], (chunk) => {
      if (chunk.type === 'text') fullText += chunk.text || ''
    }, imageAttachment ? [imageAttachment] : [], undefined, [], [], null)
  } catch (err) {
    console.error('[im-bridge] agentLoop error:', err.message)
    await sendToIM('Error: ' + err.message)
    return
  } finally {
    loop.stop?.()
  }

  if (fullText) {
    appendMessage(chatId, {
      id:        uuidv4(),
      role:      'assistant',
      content:   fullText,
      segments:  [{ type: 'text', content: fullText }],
      timestamp: Date.now(),
      createdAt: Date.now(),
    })
    await sendToIM(fullText)
    notifyRenderer('im:chat-updated', { chatId })
  }
}

module.exports = { routeMessage }
