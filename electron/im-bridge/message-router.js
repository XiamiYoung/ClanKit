// electron/im-bridge/message-router.js
'use strict'
const fs      = require('fs')
const path    = require('path')
const os      = require('os')
const { v4: uuidv4 } = require('uuid')
const { AgentLoop } = require('../agent/agentLoop')

const DATA_DIR    = process.env.CLANKAI_DATA_PATH || path.join(os.homedir(), '.clankAI')
const CHATS_DIR   = path.join(DATA_DIR, 'chats')
const CHATS_INDEX = path.join(CHATS_DIR, 'index.json')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')

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
  return path.join(CHATS_DIR, `${chatId}.json`)
}

function loadMessages(chatId) {
  return readJSON(chatFile(chatId), { messages: [] }).messages || []
}

function appendMessage(chatId, msg) {
  const chat = readJSON(chatFile(chatId), { id: chatId, messages: [] })
  chat.messages = [...(chat.messages || []), msg]
  chat.updatedAt = Date.now()
  writeAtomic(chatFile(chatId), chat)

  // Update index entry updatedAt
  try {
    const index = readJSON(CHATS_INDEX, [])
    function touch(nodes) {
      for (const n of nodes) {
        if (n.id === chatId) { n.updatedAt = chat.updatedAt; return true }
        if (n.children && touch(n.children)) return true
      }
      return false
    }
    touch(index)
    writeAtomic(CHATS_INDEX, index)
  } catch { /* non-fatal */ }
}

/**
 * Route an incoming IM message:
 *  1. Append user message to chat file
 *  2. Run AgentLoop
 *  3. Stream chunks to renderer (via webContents) + accumulate full text
 *  4. Append assistant message to chat file
 *  5. Send full text back to IM
 *
 * @param {object} opts
 * @param {string} opts.chatId
 * @param {string} opts.userText
 * @param {string} opts.displayName  - IM username, used as the user message author hint
 * @param {Function} opts.sendToIM   - (text: string) => Promise<void>
 * @param {Function} opts.notifyRenderer - (channel, data) => void  — calls mainWindow.webContents.send(...)
 */
async function routeMessage({ chatId, userText, displayName, sendToIM, notifyRenderer }) {
  const userMsg = {
    id: uuidv4(),
    role: 'user',
    content: userText,
    createdAt: Date.now(),
  }
  appendMessage(chatId, userMsg)

  // Notify renderer: new user message arrived (triggers UI refresh)
  notifyRenderer('agent:chunk', { chatId, chunk: { type: 'im_user_message', message: userMsg } })

  const config = readJSON(CONFIG_FILE, {})
  const messages = loadMessages(chatId)

  const loopConfig = {
    ...config,
    soulsDir: path.join(DATA_DIR, 'souls'),
    chatPermissionMode: 'allow_all',  // IM sessions auto-approve tools
    chatAllowList: [],
    chatDangerOverrides: [],
    maxOutputTokens: config.maxOutputTokens || null,
    artifactPath: config.artifactPath || config.artyfactPath || '',
    skillsPath: config.skillsPath || '',
    DoCPath: config.DoCPath || '',
  }

  const loop = new AgentLoop(loopConfig)
  let fullText = ''

  try {
    await loop.run(
      messages,
      [],   // enabledAgents
      [],   // enabledSkills
      (chunk) => {
        // Forward chunk to renderer for live UI update
        notifyRenderer('agent:chunk', { chatId, chunk })
        // Accumulate text chunks for the IM reply
        if (chunk.type === 'text') fullText += chunk.text || ''
      },
      [],        // currentAttachments
      undefined, // personaPrompts
      [],   // mcpServers
      [],   // httpTools
      null  // ragContext
    )
  } catch (err) {
    console.error('[im-bridge] agentLoop error:', err.message)
    await sendToIM('Error: ' + err.message)
    return
  } finally {
    loop.stop?.()
  }

  // Persist assistant message
  if (fullText) {
    const assistantMsg = {
      id: uuidv4(),
      role: 'assistant',
      content: fullText,
      createdAt: Date.now(),
    }
    appendMessage(chatId, assistantMsg)
    // Send to IM
    await sendToIM(fullText)
  }

  // Signal agent done so the renderer clears the running state
  notifyRenderer('agent:chunk', { chatId, chunk: { type: 'done' } })
}

module.exports = { routeMessage }
