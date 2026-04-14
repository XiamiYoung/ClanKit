'use strict'

/**
 * agentImport.js — IPC handlers for "Import from Chat History → Create Agent" wizard.
 *
 * Channels:
 *   agent:import-check-env        → { ready: bool }
 *   agent:import-setup-env        → (no-op, Python no longer required)
 *   agent:import-pick-file        → { filePath: string | null }
 *   agent:import-extract-messages → { source, contactName?, dbDir?, filePath?, text? }
 *                                   streams agent:import-progress
 *                                   → { success, classified, messageCount, theirCount, warning? }
 *   agent:import-analyze          → { classified, profile, config }
 *                                   streams agent:import-progress
 *                                   → { success, systemPrompt, suggestedName, error? }
 */

const { ipcMain, dialog } = require('electron')
const path = require('path')
const windowRef = require('../lib/windowRef')
const { logger } = require('../logger')

const { extractWhatsAppMessages, extractPlainTextMessages, classifyMessages, buildMessageBlock, listWhatsAppSenders } = require('../agent/chatImport/chatParser')
const { buildCombinedPrompt, generatePersona } = require('../agent/chatImport/personaBuilder')
const wechatDecryptor = require('../agent/chatImport/wechatDecryptor')
const wechatParser = require('../agent/chatImport/wechatParser')

/**
 * Send a progress event to the renderer (guarded against destroyed sender).
 */
function sendProgress(event, payload) {
  try {
    if (event?.sender && !event.sender.isDestroyed()) {
      event.sender.send('agent:import-progress', payload)
    }
  } catch (_) { /* ignore */ }
}

// ─── agent:import-check-env ────────────────────────────────────────────────
// Kept for backward compatibility — no external environment needed.

ipcMain.handle('agent:import-check-env', async () => ({ ready: true }))
ipcMain.handle('agent:import-setup-env', async () => ({ success: true }))

// ─── agent:import-pick-file ────────────────────────────────────────────────

ipcMain.handle('agent:import-pick-file', async () => {
  try {
    const win = windowRef.get()
    const result = await dialog.showOpenDialog(win, {
      title: 'Select WhatsApp Export File',
      filters: [
        { name: 'Chat Export', extensions: ['txt', 'zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return { filePath: null }
    return { filePath: result.filePaths[0] }
  } catch (err) {
    return { filePath: null, error: err.message }
  }
})

// ─── agent:import-pick-dir ─────────────────────────────────────────────────

ipcMain.handle('agent:import-pick-dir', async () => {
  try {
    const win = windowRef.get()
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Decrypted WeChat Database Directory',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return { dirPath: null }
    return { dirPath: result.filePaths[0] }
  } catch (err) {
    return { dirPath: null, error: err.message }
  }
})

// ─── agent:import-decrypt-wechat ──────────────────────────────────────────
// Decrypt WeChat databases only (no message parsing). Returns { success, decryptedDir }.

ipcMain.handle('agent:import-decrypt-wechat', async (event, { dbDir } = {}) => {
  try {
    // If the caller already has a decrypted directory, pass it straight through
    if (dbDir) return { success: true, decryptedDir: dbDir }

    const ds = require('../lib/dataStore')
    const fs = require('fs')
    const decryptedDir = path.join(ds.paths().DATA_DIR, 'wechat-decrypted')

    // Clean previous decrypted data to avoid leaking other accounts' contacts
    try { fs.rmSync(decryptedDir, { recursive: true, force: true }) } catch {}

    sendProgress(event, { step: 'key', progress: 5, message: 'Starting WeChat decryption...' })

    const result = wechatDecryptor.decrypt({
      output: decryptedDir,
      emitFn: (step, progress, message) => sendProgress(event, { step, progress, message }),
    })

    if (!result.success) {
      return { success: false, error: result.error || 'WeChat decryption failed.' }
    }

    return { success: true, decryptedDir: result.outputDir || decryptedDir }
  } catch (err) {
    logger.error('agent:import-decrypt-wechat error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-list-contacts ───────────────────────────────────────────
// List contacts with message counts from a decrypted WeChat / iMessage directory.
// Returns { success, contacts: [{wxid, remark, nickname, messageCount}] }.

ipcMain.handle('agent:import-list-contacts', async (_event, { dbDir, source }) => {
  try {
    if (source === 'imessage') {
      const defaultPath = path.join(require('os').homedir(), 'Library', 'Messages', 'chat.db')
      const contacts = wechatParser.listImessageContacts(defaultPath)
      return { success: true, contacts: contacts.map(c => ({ wxid: c.handle, alias: '', remark: '', nickname: c.handle, messageCount: c.count })) }
    }

    if (!dbDir) return { success: false, error: 'dbDir is required for WeChat contact list.' }

    const contacts = wechatParser.listContacts(dbDir)
    const counts = wechatParser.countMessagesByContact(dbDir)
    const avatars = wechatParser.loadAvatars(dbDir)

    for (const c of contacts) {
      c.messageCount = counts[c.wxid] || 0
      if (avatars[c.wxid]) c.avatar = avatars[c.wxid]
    }

    // Detect logged-in user's info for self-analysis auto-fill
    // detectMyWxid requires an account-level dir (e.g. <wxid>_<hash>), not the decrypted root,
    // so iterate account dirs via findAccountDirs and take the first non-empty result
    let myWxid = ''
    try {
      const acctDirs = wechatParser.findAccountDirs
        ? wechatParser.findAccountDirs(dbDir)
        : [dbDir]
      for (const ad of acctDirs) {
        const w = wechatParser.detectMyWxid(ad)
        if (w) { myWxid = w; break }
      }
    } catch (_) { /* ignore */ }

    let myNickname = ''
    let myAvatar = ''
    if (myWxid) {
      const selfContact = contacts.find(c => c.wxid === myWxid)
      if (selfContact) {
        myNickname = selfContact.remark || selfContact.nickname || ''
        myAvatar = selfContact.avatar || ''
      }
      // Self usually isn't in the Contact table — fall back to the avatar cache directly
      if (!myAvatar && avatars[myWxid]) myAvatar = avatars[myWxid]
    }

    // Filter out group chats and self, contacts with messages first
    const filtered = contacts.filter(c => !c.wxid.endsWith('@chatroom') && c.wxid !== myWxid)
    const withMsgs = filtered.filter(c => c.messageCount > 0).sort((a, b) => b.messageCount - a.messageCount)
    const noMsgs = filtered.filter(c => c.messageCount === 0).slice(0, 50)

    return {
      success: true,
      contacts: [...withMsgs, ...noMsgs],
      me: { wxid: myWxid, nickname: myNickname, avatar: myAvatar },
    }
  } catch (err) {
    logger.error('agent:import-list-contacts error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-list-whatsapp-senders ───────────────────────────────────
// Parse a WhatsApp export and return unique senders with message counts.

ipcMain.handle('agent:import-list-whatsapp-senders', async (_event, { filePath }) => {
  try {
    if (!filePath) return { success: false, error: 'filePath is required.' }
    const { senders, warning } = listWhatsAppSenders(filePath)
    return { success: true, senders, warning }
  } catch (err) {
    logger.error('agent:import-list-whatsapp-senders error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-extract-messages ────────────────────────────────────────

ipcMain.handle('agent:import-extract-messages', async (event, params) => {
  const { source, contactName, contacts, dbDir, filePath, text } = params

  try {
    if (source === 'wechat') {
      // Multi-contact extraction (for user self-analysis)
      if (contacts && contacts.length > 0) {
        return await _extractWeChatMulti(event, contacts, dbDir)
      }
      return await _extractWeChat(event, contactName, dbDir)
    }

    if (source === 'imessage') {
      return await _extractIMessage(event, contactName)
    }

    if (source === 'whatsapp') {
      sendProgress(event, { step: 'parse', progress: 10, message: 'Parsing WhatsApp export...' })
      const { messages, warning } = extractWhatsAppMessages(filePath, (pct, msg) => {
        sendProgress(event, { step: 'parse', progress: pct, message: msg })
      })
      const classified = classifyMessages(messages, contactName || '')
      sendProgress(event, { step: 'done', progress: 100, message: 'Extraction complete.' })
      return {
        success: true,
        classified,
        messageCount: classified.total_count,
        theirCount: classified.total_their_count,
        warning,
      }
    }

    if (source === 'text') {
      sendProgress(event, { step: 'parse', progress: 10, message: 'Parsing text...' })
      const { messages, warning } = extractPlainTextMessages(text || '', (pct, msg) => {
        sendProgress(event, { step: 'parse', progress: pct, message: msg })
      })
      const classified = classifyMessages(messages, contactName || '')
      sendProgress(event, { step: 'done', progress: 100, message: 'Extraction complete.' })
      return {
        success: true,
        classified,
        messageCount: classified.total_count,
        theirCount: classified.total_their_count,
        warning,
      }
    }

    return { success: false, error: `Unknown source: ${source}` }
  } catch (err) {
    logger.error('agent:import-extract-messages error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-analyze ─────────────────────────────────────────────────

ipcMain.handle('agent:import-analyze', async (event, { classified, profile, config, providerType, modelId, analyzeTarget }) => {
  try {
    sendProgress(event, { step: 'build', progress: 5, message: 'Building prompt...' })
    const targetName = classified.target_name || profile.name || 'Unknown'
    const messageBlock = buildMessageBlock(classified, targetName, analyzeTarget)
    const language = config.language || 'en'
    const fullPrompt = buildCombinedPrompt(profile, messageBlock, language, analyzeTarget)

    // Allow caller to override the utility model provider/model
    const effectiveConfig = { ...config }
    if (providerType && modelId) {
      effectiveConfig.utilityModel = { provider: providerType, model: modelId }
    }

    // Read context windows from the persisted provider-models cache
    const ds = require('../lib/dataStore')
    let contextWindows = {}
    try {
      const fs = require('fs')
      const raw = fs.readFileSync(ds.paths().PROVIDER_MODELS_FILE, 'utf-8')
      const cache = JSON.parse(raw)
      for (const entry of Object.values(cache)) {
        for (const m of (entry.models || [])) {
          if (m.id && m.context_length) contextWindows[m.id] = m.context_length
        }
      }
    } catch { /* no cache yet, will use fallback */ }

    const result = await generatePersona(fullPrompt, effectiveConfig, (payload) => sendProgress(event, payload), profile, contextWindows, language, analyzeTarget)
    return result
  } catch (err) {
    logger.error('agent:import-analyze error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-cleanup ────────────────────────────────────────────────
// Remove all decrypted WeChat data from disk.

ipcMain.handle('agent:import-cleanup', async () => {
  try {
    const fs = require('fs')
    const ds = require('../lib/dataStore')
    const decryptedDir = path.join(ds.paths().DATA_DIR, 'wechat-decrypted')
    if (fs.existsSync(decryptedDir)) {
      fs.rmSync(decryptedDir, { recursive: true, force: true })
      logger.info('agent:import-cleanup: removed decrypted data')
    }
    return { success: true }
  } catch (err) {
    logger.warn('agent:import-cleanup error', err.message)
    return { success: false }
  }
})

// ─── agent:import-save-history ────────────────────────────────────────────
// Save full chat history locally and index it for keyword search at chat time.

ipcMain.handle('agent:import-save-history', async (_event, { agentId, messages, contactName }) => {
  try {
    if (!agentId || !Array.isArray(messages) || messages.length === 0) {
      return { success: true, saved: 0 }
    }

    const ds = require('../lib/dataStore')
    const agentMemDir = path.join(ds.paths().MEMORY_DIR, 'agents', agentId)
    const fs = require('fs')
    fs.mkdirSync(agentMemDir, { recursive: true })

    // Index for history search (so agent can find relevant history at chat time)
    const { HistoryIndex } = require('../memory/HistoryIndex')
    const histIdx = new HistoryIndex(ds.paths().AGENT_MEMORY_DIR)
    histIdx.indexImportedHistory(messages, agentId, contactName)

    return { success: true, saved: messages.length }
  } catch (err) {
    logger.error('agent:import-save-history error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-write-memories ──────────────────────────────────────────
// Write extracted memories to an agent's soul file.

ipcMain.handle('agent:import-write-memories', async (_event, { agentId, memories }) => {
  try {
    if (!agentId || !Array.isArray(memories) || memories.length === 0) {
      return { success: true, count: 0 }
    }

    const ds = require('../lib/dataStore')
    const soulsDir = ds.paths().SOULS_DIR
    const { SoulUpdateTool } = require('../agent/tools/SoulTool')
    const tool = new SoulUpdateTool(soulsDir)

    let written = 0
    for (const mem of memories.slice(0, 100)) {
      if (!mem.section || !mem.entry) continue
      try {
        await tool.execute('import-memory', {
          agent_id: agentId,
          agent_type: 'system',
          section: mem.section,
          action: 'add',
          entry: mem.entry,
        })
        written++
      } catch (e) {
        logger.warn(`import-write-memories: failed to write entry: ${e.message}`)
      }
    }

    logger.info(`import-write-memories: wrote ${written} entries for agent ${agentId}`)
    return { success: true, count: written }
  } catch (err) {
    logger.error('agent:import-write-memories error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── Internal helpers ─────────────────────────────────────────────────────

/**
 * Extract messages from WeChat databases (with or without decryption).
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} contactName
 * @param {string|null} dbDir - if provided, skip decryption
 */
async function _extractWeChat(event, contactName, dbDir) {
  let resolvedDbDir = dbDir

  // Step 1: decrypt if no dbDir provided
  if (!resolvedDbDir) {
    const ds = require('../lib/dataStore')
    const fs = require('fs')
    const decryptedDir = path.join(ds.paths().DATA_DIR, 'wechat-decrypted')
    // Clean previous decrypted data to avoid leaking other accounts' contacts
    try { fs.rmSync(decryptedDir, { recursive: true, force: true }) } catch {}

    sendProgress(event, { step: 'key', progress: 5, message: 'Starting WeChat decryption...' })
    const decryptResult = wechatDecryptor.decrypt({
      output: decryptedDir,
      emitFn: (step, progress, message) => sendProgress(event, { step, progress, message }),
    })

    if (!decryptResult.success) {
      return { success: false, error: decryptResult.error || 'WeChat decryption failed.' }
    }

    resolvedDbDir = decryptResult.outputDir
    if (!resolvedDbDir) {
      return { success: false, error: 'Decryption succeeded but output directory was not returned.' }
    }
  }

  // Step 2: parse messages directly via Node.js
  sendProgress(event, { step: 'parse', progress: 60, message: 'Extracting messages...' })

  const targetWxid = wechatParser.findContactWxid(resolvedDbDir, contactName)
  if (targetWxid) {
    logger.info(`agent:import: Matched contact wxid: ${targetWxid}`)
  } else {
    logger.warn(`agent:import: No exact match for '${contactName}'`)
  }

  const messages = wechatParser.extractMessagesFromDir(resolvedDbDir, targetWxid)

  if (messages.length === 0) {
    return { success: false, error: `No messages found for '${contactName}'. Use list-contacts to verify the exact name.` }
  }

  const classified = classifyMessages(messages, contactName)
  const theirCount = classified.total_their_count

  sendProgress(event, { step: 'done', progress: 100, message: 'Extraction complete.' })
  return {
    success: true,
    classified,
    messageCount: classified.total_count || 0,
    theirCount,
    warning: theirCount < 50
      ? `Only ${theirCount} messages from ${contactName}. Results may be less accurate.`
      : undefined,
  }
}

/**
 * Extract and merge messages from multiple WeChat contacts (for self-analysis).
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Array<{wxid: string}>} contacts
 * @param {string} dbDir
 */
async function _extractWeChatMulti(event, contacts, dbDir) {
  if (!dbDir) {
    return { success: false, error: 'dbDir is required for multi-contact extraction.' }
  }

  const allMessages = []
  for (let i = 0; i < contacts.length; i++) {
    const wxid = contacts[i].wxid
    sendProgress(event, {
      step: 'parse',
      progress: Math.round(10 + 80 * (i / contacts.length)),
      message: `Extracting conversation ${i + 1}/${contacts.length}...`,
    })
    const msgs = wechatParser.extractMessagesFromDir(dbDir, wxid)
    allMessages.push(...msgs)
  }

  if (allMessages.length === 0) {
    return { success: false, error: 'No messages found for the selected contacts.' }
  }

  // Sort chronologically by timestamp
  allMessages.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0
    if (!a.timestamp) return -1
    if (!b.timestamp) return 1
    return a.timestamp < b.timestamp ? -1 : 1
  })

  // classifyMessages already handles sender:'me'|'them' from wechatParser
  const classified = classifyMessages(allMessages, '')
  classified.target_name = 'me'

  const myCount = classified.all_messages.filter(m => m.sender === 'me').length

  sendProgress(event, { step: 'done', progress: 100, message: 'Extraction complete.' })
  return {
    success: true,
    classified,
    messageCount: classified.total_count || 0,
    myCount,
  }
}

/**
 * Extract messages from iMessage (macOS only).
 */
async function _extractIMessage(event, contactHandle) {
  if (process.platform !== 'darwin') {
    return { success: false, error: 'iMessage extraction is only available on macOS.' }
  }

  sendProgress(event, { step: 'parse', progress: 10, message: 'Reading iMessage database...' })

  const defaultDbPath = path.join(require('os').homedir(), 'Library', 'Messages', 'chat.db')
  const messages = wechatParser.extractImessageMessages(defaultDbPath, contactHandle)

  if (messages.length === 0) {
    return { success: false, error: `No iMessage messages found for '${contactHandle}'. Grant Full Disk Access to the app.` }
  }

  const classified = classifyMessages(messages, contactHandle)

  sendProgress(event, { step: 'done', progress: 100, message: 'Extraction complete.' })
  return {
    success: true,
    classified,
    messageCount: classified.total_count || 0,
    theirCount: classified.total_their_count || 0,
  }
}

function register() {
  // handlers registered at module load via ipcMain.handle above
}

module.exports = { register }
