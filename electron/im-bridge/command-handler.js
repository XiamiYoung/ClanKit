// electron/im-bridge/command-handler.js
'use strict'
const fs      = require('fs')
const path    = require('path')
const os      = require('os')
const { v4: uuidv4 } = require('uuid')

const DATA_DIR      = process.env.CLANKAI_DATA_PATH || path.join(os.homedir(), '.clankAI')
const CHATS_DIR     = path.join(DATA_DIR, 'chats')
const CHATS_INDEX   = path.join(CHATS_DIR, 'index.json')
const PERSONAS_FILE = path.join(DATA_DIR, 'personas.json')
const PAGE_SIZE     = 20

function readIndex() {
  try { return JSON.parse(fs.readFileSync(CHATS_INDEX, 'utf8')) } catch { return [] }
}

function readPersonas() {
  try {
    const data = JSON.parse(fs.readFileSync(PERSONAS_FILE, 'utf8'))
    return Array.isArray(data) ? data : (data.personas || [])
  } catch { return [] }
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function getDefaultSystemPersonaId() {
  const personas = readPersonas()
  const def = personas.find(p => p.type === 'system' && p.isDefault)
    || personas.find(p => p.type === 'system')
  return def ? def.id : null
}

function getDefaultUserPersonaId() {
  const personas = readPersonas()
  const def = personas.find(p => p.type === 'user' && p.isDefault)
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

/** Format paginated /personas list. */
function formatPersonasList(page) {
  const personas = readPersonas()
  if (!personas.length) return { reply: 'No personas configured yet.' }

  const systemPersonas = personas.filter(p => p.type === 'system' || !p.type)
  const userPersonas   = personas.filter(p => p.type === 'user')

  // Assign sequential numbers across all personas
  let n = 0
  const numbered = []
  for (const p of [...systemPersonas, ...userPersonas]) {
    numbered.push({ ...p, n: ++n })
  }

  const total      = numbered.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage   = Math.max(1, Math.min(page, totalPages))
  const start      = (safePage - 1) * PAGE_SIZE
  const pageItems  = numbered.slice(start, start + PAGE_SIZE)

  const lines = [`📋 Personas (${total} total • page ${safePage}/${totalPages})\n`]

  const pageSystem = pageItems.filter(p => p.type !== 'user')
  const pageUser   = pageItems.filter(p => p.type === 'user')

  if (pageSystem.length) {
    lines.push('🤖 System:')
    for (const p of pageSystem) {
      const desc = p.description ? ` — ${p.description.slice(0, 60)}` : ''
      lines.push(`${p.n}. ${p.name}${desc}`)
    }
  }

  if (pageUser.length) {
    lines.push('\n👤 User:')
    for (const p of pageUser) {
      const desc = p.description ? ` — ${p.description.slice(0, 60)}` : ''
      lines.push(`${p.n}. ${p.name}${desc}`)
    }
  }

  const nav = []
  if (safePage < totalPages) nav.push(`/personas ${safePage + 1} → next`)
  if (safePage > 1)          nav.push(`/personas ${safePage - 1} → prev`)
  nav.push('/persona <name> for details')
  nav.push('/persona add <name> | /persona remove <name> to manage chat')
  lines.push(`\n${nav.join('  |  ')}`)

  return { reply: lines.join('\n') }
}

/** Find a persona by name (case-insensitive fuzzy match). */
function findPersonaByName(nameArg) {
  const personas = readPersonas()
  const lower = nameArg.toLowerCase()
  return personas.find(p => p.name.toLowerCase() === lower)
    || personas.find(p => p.name.toLowerCase().startsWith(lower))
    || null
}

/** Format persona detail card. */
function formatPersonaDetail(persona) {
  const typeLabel = persona.type === 'user' ? '👤 User' : '🤖 System'
  const promptPreview = persona.prompt
    ? '\n\nPrompt:\n' + persona.prompt.slice(0, 300) + (persona.prompt.length > 300 ? '…' : '')
    : ''
  const modelLine = persona.modelId
    ? `\nModel: ${persona.modelId}  |  Provider: ${persona.providerId || 'anthropic'}`
    : ''
  return `${typeLabel} ${persona.name}` +
    (persona.description ? `\nDescription: ${persona.description}` : '') +
    promptPreview +
    modelLine
}


const HISTORY_SIZE = 10

function formatHistory(chatId, count) {
  const chatPath = path.join(CHATS_DIR, `${chatId}.json`)
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
/personas [page] List all available personas
/persona <name>  Show persona details
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

    const systemPersonaId = getDefaultSystemPersonaId()
    const userPersonaId   = getDefaultUserPersonaId()

    const chat = {
      type: 'chat',
      id: chatId,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
      systemPersonaId: systemPersonaId || null,
      userPersonaId: userPersonaId || null,
      provider: null,
      model: null,
      isGroupChat: false,
      groupPersonaIds: [],
      groupPersonaOverrides: {},
      workingPath: null,
      enabledToolIds: null,
      enabledMcpIds: null,
      permissionMode: 'inherit',
      chatAllowList: [],
      chatDangerOverrides: [],
      maxPersonaRounds: null,
      codingMode: false,
      codingProvider: 'claude-code',
      maxOutputTokens: null,
      personaModelOverrides: {},
    }

    // Index entry mirrors persisted metadata (no messages/runtime fields)
    const indexEntry = {
      type: 'chat',
      id: chatId,
      title,
      createdAt: now,
      updatedAt: now,
      systemPersonaId: chat.systemPersonaId,
      userPersonaId: chat.userPersonaId,
      provider: null,
      model: null,
      isGroupChat: false,
      groupPersonaIds: [],
      groupPersonaOverrides: {},
      workingPath: null,
      enabledToolIds: null,
      enabledMcpIds: null,
      permissionMode: 'inherit',
      chatAllowList: [],
      chatDangerOverrides: [],
      maxPersonaRounds: null,
      codingMode: false,
      codingProvider: 'claude-code',
      maxOutputTokens: null,
      personaModelOverrides: {},
    }

    writeAtomic(path.join(CHATS_DIR, `${chatId}.json`), chat)
    const index = readIndex()
    index.unshift(indexEntry)
    writeAtomic(CHATS_INDEX, index)
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

  if (cmd === '/personas') {
    const page = parseInt(parts[1], 10) || 1
    return formatPersonasList(page)
  }

  if (cmd === '/persona') {
    const nameArg = parts.slice(1).join(' ')
    if (!nameArg) return { reply: 'Usage: /persona <name>  (use /personas to list)' }

    const persona = findPersonaByName(nameArg)
    if (!persona) return { reply: `Persona "${nameArg}" not found. Use /personas to list available personas.` }

    return { reply: formatPersonaDetail(persona) }
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
