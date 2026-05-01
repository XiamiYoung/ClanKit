// electron/im-bridge/command-handler.js
'use strict'
const fs      = require('fs')
const path    = require('path')
const { v4: uuidv4 } = require('uuid')

const ds = require('../lib/dataStore')
const { normalizeAgents } = require('../agent/dataNormalizers')
const PAGE_SIZE   = 20

function readIndex() {
  try { return JSON.parse(fs.readFileSync(ds.paths().CHATS_INDEX_FILE, 'utf8')) } catch { return [] }
}

function readAgents() {
  // Schema-agnostic flat list sourced from AgentStore (agents.db).
  return normalizeAgents(ds.readAgentsCompat())
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function getDefaultSystemAgentId() {
  const agents = readAgents()
  const def = agents.find(a => a.type === 'system' && a.isDefault)
    || agents.find(a => a.type === 'system')
  return def ? def.id : null
}

function getDefaultUserAgentId() {
  const agents = readAgents()
  const def = agents.find(a => a.type === 'user' && a.isDefault)
  return def ? def.id : null
}

function buildDisplayList(nodes, depth) {
  depth = depth || 0
  const items = []
  for (const node of (nodes || [])) {
    if (node.type === 'folder') {
      const children = buildDisplayList(node.children || [], depth + 1)
      if (children.some(c => c.type === 'chat')) {
        items.push({ type: 'folder', name: node.title || node.name || 'Folder', depth })
        items.push(...children)
      }
    } else if (node.type === 'chat' || node.id) {
      items.push({ type: 'chat', title: node.title || 'Untitled', id: node.id, depth })
    }
  }
  return items
}

function numberChats(items) {
  let n = 0
  return items.map(item => item.type === 'chat' ? { ...item, n: ++n } : item)
}

function findChatByNumber(n) {
  const items = numberChats(buildDisplayList(readIndex()))
  return items.find(item => item.type === 'chat' && item.n === n) || null
}

function writeAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, filePath)
}

function formatList(page) {
  const allItems   = numberChats(buildDisplayList(readIndex()))
  const totalChats = allItems.filter(i => i.type === 'chat').length
  if (!totalChats) return { reply: 'No chats yet. Use /new to create one.' }

  const totalPages = Math.ceil(allItems.length / PAGE_SIZE)
  const safePage   = Math.max(1, Math.min(page, totalPages))
  const start      = (safePage - 1) * PAGE_SIZE
  const pageItems  = allItems.slice(start, start + PAGE_SIZE)

  const indent = d => '  '.repeat(d || 0)
  const lines  = [`📋 Chats (${totalChats} total • page ${safePage}/${totalPages})\n`]

  for (const item of pageItems) {
    if (item.type === 'folder') {
      lines.push(`\n${indent(item.depth)}📁 ${item.name}`)
    } else {
      lines.push(`${indent(item.depth)}${item.n}. ${item.title}`)
    }
  }

  const nav = []
  if (safePage < totalPages) nav.push(`/list ${safePage + 1} → next`)
  if (safePage > 1)          nav.push(`/list ${safePage - 1} → prev`)
  nav.push('/switch <n> to open')
  lines.push(`\n${nav.join('  |  ')}`)

  return { reply: lines.join('\n') }
}

/** Format paginated /agents list. */
function formatAgentsList(page) {
  const agents = readAgents()
  if (!agents.length) return { reply: 'No agents configured yet.' }

  const systemAgents = agents.filter(a => a.type === 'system' || !a.type)
  const userAgents   = agents.filter(a => a.type === 'user')

  // Assign sequential numbers across all agents
  let n = 0
  const numbered = []
  for (const a of [...systemAgents, ...userAgents]) {
    numbered.push({ ...a, n: ++n })
  }

  const total      = numbered.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage   = Math.max(1, Math.min(page, totalPages))
  const start      = (safePage - 1) * PAGE_SIZE
  const pageItems  = numbered.slice(start, start + PAGE_SIZE)

  const lines = [`📋 Agents (${total} total • page ${safePage}/${totalPages})\n`]

  const pageSystem = pageItems.filter(a => a.type !== 'user')
  const pageUser   = pageItems.filter(a => a.type === 'user')

  if (pageSystem.length) {
    lines.push('🤖 System:')
    for (const a of pageSystem) {
      const desc = a.description ? ` — ${a.description.slice(0, 60)}` : ''
      lines.push(`${a.n}. ${a.name}${desc}`)
    }
  }

  if (pageUser.length) {
    lines.push('\n👤 User:')
    for (const a of pageUser) {
      const desc = a.description ? ` — ${a.description.slice(0, 60)}` : ''
      lines.push(`${a.n}. ${a.name}${desc}`)
    }
  }

  const nav = []
  if (safePage < totalPages) nav.push(`/agents ${safePage + 1} → next`)
  if (safePage > 1)          nav.push(`/agents ${safePage - 1} → prev`)
  nav.push('/agent <name> for details')
  nav.push('/agent add <name> | /agent remove <name> to manage chat')
  lines.push(`\n${nav.join('  |  ')}`)

  return { reply: lines.join('\n') }
}

/** Find an agent by name (case-insensitive fuzzy match). */
function findAgentByName(nameArg) {
  const agents = readAgents()
  const lower = nameArg.toLowerCase()
  return agents.find(a => a.name.toLowerCase() === lower)
    || agents.find(a => a.name.toLowerCase().startsWith(lower))
    || null
}

/** Format agent detail card. */
function formatAgentDetail(agent) {
  const typeLabel = agent.type === 'user' ? '👤 User' : '🤖 System'
  const promptPreview = agent.prompt
    ? '\n\nPrompt:\n' + agent.prompt.slice(0, 300) + (agent.prompt.length > 300 ? '…' : '')
    : ''
  const modelLine = agent.modelId
    ? `\nModel: ${agent.modelId}  |  Provider: ${agent.providerId || 'anthropic'}`
    : ''
  return `${typeLabel} ${agent.name}` +
    (agent.description ? `\nDescription: ${agent.description}` : '') +
    promptPreview +
    modelLine
}


const HISTORY_SIZE = 10

function formatHistory(chatId, count) {
  const chatPath = path.join(ds.paths().CHATS_DIR, `${chatId}.json`)
  const chat = readJSON(chatPath, null)
  if (!chat) return { reply: 'Chat not found.' }
  const msgs = chat.messages || []
  if (!msgs.length) return { reply: 'No messages in this chat yet.' }

  const recent = msgs.slice(-count)
  const lines = [`📜 History — ${chat.title || 'Untitled'} (last ${recent.length} of ${msgs.length})\n`]

  for (const m of recent) {
    const time = m.timestamp || m.createdAt
    const ts = time ? new Date(time).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : ''
    const role = m.role === 'user' ? '👤' : '🤖'
    const text = (m.content || '').slice(0, 200) + ((m.content || '').length > 200 ? '…' : '')
    lines.push(`${role} ${ts}\n${text}\n`)
  }

  return { reply: lines.join('\n') }
}

const HELP_TEXT = `🤖 IM Bridge commands:

/list [page]     Browse chats and folders
/switch <n>      Switch active chat to #n from /list
/new [title]     Create a new chat and switch to it
/current         Show the currently active chat
/history [n]     Show last n messages (default 10)
/status          Show bridge running status
/agents [page]   List all available agents
/agent <name>    Show agent details
/help            Show this help

Any non-command message is sent to the active chat.
If no chat is active, one is created automatically.`

function handle(command, sessionStore, platform, channelId, notifyRenderer) {
  const parts = command.trim().split(/\s+/)
  const cmd   = parts[0].toLowerCase()

  if (cmd === '/help') {
    return { reply: HELP_TEXT }
  }

  if (cmd === '/list') {
    const page = parseInt(parts[1], 10) || 1
    return formatList(page)
  }

  if (cmd === '/current') {
    const chatId = sessionStore.getActiveChatId(platform, channelId)
    if (!chatId) return { reply: 'No active chat. Use /list or /new.' }
    const allItems = buildDisplayList(readIndex())
    const chat     = allItems.find(c => c.type === 'chat' && c.id === chatId)
    return { reply: `Active chat: ${chat?.title || 'Untitled'} (${chatId.slice(0, 8)}…)` }
  }

  if (cmd === '/switch') {
    const n = parseInt(parts[1], 10)
    if (!n || isNaN(n)) return { reply: 'Usage: /switch <number>  (see /list for numbers)' }
    const chat = findChatByNumber(n)
    if (!chat) return { reply: `No chat #${n}. Use /list to see available chats.` }
    sessionStore.setActiveChatId(platform, channelId, chat.id, '@' + channelId)
    return { reply: `Switched to: ${chat.title}`, newChatId: chat.id }
  }

  if (cmd === '/new') {
    const title  = parts.slice(1).join(' ') || 'IM Chat'
    const chatId = uuidv4()
    const now    = Date.now()

    const systemAgentId = getDefaultSystemAgentId()
    const userAgentId   = getDefaultUserAgentId()

    const chat = {
      type: 'chat',
      id: chatId,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
      systemAgentId: systemAgentId || null,
      userAgentId: userAgentId || null,
      provider: null,
      model: null,
      isGroupChat: false,
      groupAgentIds: [],
      groupAgentOverrides: {},
      workingPath: null,
      enabledToolIds: null,
      enabledMcpIds: null,
      permissionMode: 'inherit',
      chatAllowList: [],
      chatDangerOverrides: [],
      maxAgentRounds: null,
      mode: 'chat',
      maxOutputTokens: null,
    }

    // Index entry mirrors persisted metadata (no messages/runtime fields)
    const indexEntry = {
      type: 'chat',
      id: chatId,
      title,
      createdAt: now,
      updatedAt: now,
      systemAgentId: chat.systemAgentId,
      userAgentId: chat.userAgentId,
      provider: null,
      model: null,
      isGroupChat: false,
      groupAgentIds: [],
      groupAgentOverrides: {},
      workingPath: null,
      enabledToolIds: null,
      enabledMcpIds: null,
      permissionMode: 'inherit',
      chatAllowList: [],
      chatDangerOverrides: [],
      maxAgentRounds: null,
      mode: 'chat',
      maxOutputTokens: null,
    }

    writeAtomic(path.join(ds.paths().CHATS_DIR, `${chatId}.json`), chat)
    const index = readIndex()
    index.unshift(indexEntry)
    writeAtomic(ds.paths().CHATS_INDEX_FILE, index)
    sessionStore.setActiveChatId(platform, channelId, chatId, '@' + channelId)
    notifyRenderer()
    return { reply: `Created and switched to: ${title}`, newChatId: chatId }
  }

  if (cmd === '/history') {
    const chatId = sessionStore.getActiveChatId(platform, channelId)
    if (!chatId) return { reply: 'No active chat. Use /list or /new.' }
    const count = parseInt(parts[1], 10) || HISTORY_SIZE
    return formatHistory(chatId, Math.min(count, 50))
  }

  if (cmd === '/status') {
    return { reply: 'IM Bridge is running. Send a message to chat, or use /help for commands.' }
  }

  if (cmd === '/agents') {
    const page = parseInt(parts[1], 10) || 1
    return formatAgentsList(page)
  }

  if (cmd === '/agent') {
    const nameArg = parts.slice(1).join(' ')
    if (!nameArg) return { reply: 'Usage: /agent <name>  (use /agents to list)' }

    const agent = findAgentByName(nameArg)
    if (!agent) return { reply: `Agent "${nameArg}" not found. Use /agents to list available agents.` }

    return { reply: formatAgentDetail(agent) }
  }

  return null  // not a command
}

/** Return the id of the first (most recently updated) chat in the index, or null if none. */
function getFirstChatId() {
  const items = numberChats(buildDisplayList(readIndex()))
  const first = items.find(i => i.type === 'chat')
  return first ? first.id : null
}

function chatExists(chatId) {
  const items = buildDisplayList(readIndex())
  return items.some(i => i.type === 'chat' && i.id === chatId)
}

module.exports = { handle, getFirstChatId, chatExists }
