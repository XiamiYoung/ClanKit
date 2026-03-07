// electron/im-bridge/command-handler.js
'use strict'
const fs      = require('fs')
const path    = require('path')
const os      = require('os')
const { v4: uuidv4 } = require('uuid')

const DATA_DIR    = process.env.CLANKAI_DATA_PATH || path.join(os.homedir(), '.clankAI')
const CHATS_DIR   = path.join(DATA_DIR, 'chats')
const CHATS_INDEX = path.join(CHATS_DIR, 'index.json')
const PAGE_SIZE   = 20

function readIndex() {
  try { return JSON.parse(fs.readFileSync(CHATS_INDEX, 'utf8')) } catch { return [] }
}

/**
 * Build a flat display list preserving folder structure.
 * Returns items: { type: 'folder'|'chat', name, title, id, depth }
 * Folders without any descendant chats are omitted.
 */
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

/**
 * Assign sequential numbers to chat items only (folders are not numbered).
 * Numbers are global — stable across pages so /switch <n> always works.
 */
function numberChats(items) {
  let n = 0
  return items.map(item => item.type === 'chat' ? { ...item, n: ++n } : item)
}

/** Find the nth chat (1-based) across all items. */
function findChatByNumber(n) {
  const items = numberChats(buildDisplayList(readIndex()))
  return items.find(item => item.type === 'chat' && item.n === n) || null
}

/** Write data atomically. */
function writeAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, filePath)
}

/** Format a paginated /list reply. */
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

const HELP_TEXT = `🤖 IM Bridge commands:

/list [page]    Browse chats and folders
/switch <n>     Switch active chat to #n from /list
/new [title]    Create a new chat and switch to it
/current        Show the currently active chat
/status         Show bridge running status
/help           Show this help

Any non-command message is sent to the active chat.
If no chat is active, one is created automatically.`

/**
 * Handle a command from an IM user.
 * Returns { reply: string, newChatId?: string } or null if not a command.
 */
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
    const chat   = {
      type: 'chat', id: chatId, title,
      messages: [], createdAt: now, updatedAt: now,
    }
    writeAtomic(path.join(CHATS_DIR, `${chatId}.json`), chat)
    const index = readIndex()
    index.unshift({ type: 'chat', id: chatId, title, createdAt: now, updatedAt: now })
    writeAtomic(CHATS_INDEX, index)
    sessionStore.setActiveChatId(platform, channelId, chatId, '@' + channelId)
    notifyRenderer()
    return { reply: `Created and switched to: ${title}`, newChatId: chatId }
  }

  if (cmd === '/status') {
    return { reply: 'IM Bridge is running. Send a message to chat, or use /help for commands.' }
  }

  return null  // not a command
}

module.exports = { handle }
