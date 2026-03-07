// electron/im-bridge/command-handler.js
'use strict'
const fs      = require('fs')
const path    = require('path')
const os      = require('os')
const { v4: uuidv4 } = require('uuid')

const DATA_DIR        = process.env.CLANKAI_DATA_PATH || path.join(os.homedir(), '.clankAI')
const CHATS_DIR       = path.join(DATA_DIR, 'chats')
const CHATS_INDEX     = path.join(CHATS_DIR, 'index.json')

function readIndex() {
  try { return JSON.parse(fs.readFileSync(CHATS_INDEX, 'utf8')) } catch { return [] }
}

function flattenIndex(nodes) {
  const result = []
  for (const node of (nodes || [])) {
    if (node.type === 'folder') result.push(...flattenIndex(node.children || []))
    else if (node.type === 'chat' || node.id) result.push(node)
  }
  return result
}

/** Write data atomically. */
function writeAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, filePath)
}

/**
 * Handle a command from an IM user.
 * Returns { reply: string, newChatId?: string }
 */
function handle(command, sessionStore, platform, channelId, notifyRenderer) {
  const parts = command.trim().split(/\s+/)
  const cmd   = parts[0].toLowerCase()

  if (cmd === '/list') {
    const nodes  = flattenIndex(readIndex())
    if (!nodes.length) return { reply: 'No chats yet. Use /new to create one.' }
    const lines = nodes.slice(0, 20).map((c, i) => `${i + 1}. ${c.title || 'Untitled'}`)
    return { reply: 'Chats:\n' + lines.join('\n') + '\n\nUse /switch <n> to switch.' }
  }

  if (cmd === '/current') {
    const chatId = sessionStore.getActiveChatId(platform, channelId)
    if (!chatId) return { reply: 'No active chat. Use /list or /new.' }
    const nodes = flattenIndex(readIndex())
    const chat  = nodes.find(c => c.id === chatId)
    return { reply: `Active chat: ${chat?.title || 'Untitled'} (${chatId.slice(0, 8)}…)` }
  }

  if (cmd === '/switch') {
    const n = parseInt(parts[1], 10)
    if (!n || isNaN(n)) return { reply: 'Usage: /switch <number>  (see /list for numbers)' }
    const nodes = flattenIndex(readIndex())
    const chat  = nodes[n - 1]
    if (!chat) return { reply: `No chat #${n}. Use /list to see available chats.` }
    sessionStore.setActiveChatId(platform, channelId, chat.id, '@' + channelId)
    return { reply: `Switched to: ${chat.title || 'Untitled'}`, newChatId: chat.id }
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
    // Tell the renderer to reload its chat list
    notifyRenderer()
    return { reply: `Created and switched to: ${title}`, newChatId: chatId }
  }

  if (cmd === '/status') {
    return { reply: 'IM Bridge is running. Send a message to chat, or use /list, /switch, /new.' }
  }

  return null  // not a command
}

module.exports = { handle }
