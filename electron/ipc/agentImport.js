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
const { extractSpeechDna } = require('../agent/chatImport/speechDnaExtractor')
const { extractPersonaSections } = require('../agent/chatImport/personaPipeline')
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

    // Phase A + B: run Speech DNA extraction and the 4-phase Persona pipeline in parallel.
    // Both are purely additive — failure is logged but never blocks the legacy persona output.
    if (result?.success) {
      sendProgress(event, { step: 'persona', progress: 90, message: 'Running 4-phase extraction (Persona pipeline)...' })

      const [speechDnaResult, personaResult] = await Promise.all([
        extractSpeechDna(classified, profile, effectiveConfig, language, analyzeTarget)
          .catch(err => { logger.warn('[analyze] speech DNA failed (non-fatal):', err.message); return null }),
        extractPersonaSections(classified, profile, effectiveConfig, language, analyzeTarget, (payload) => {
          sendProgress(event, { step: payload.phase, progress: payload.progress, message: payload.message })
        }).catch(err => { logger.warn('[analyze] persona pipeline failed (non-fatal):', err.message); return null }),
      ])

      if (speechDnaResult) {
        result.speechDna = speechDnaResult
        logger.info(`agent:import-analyze: extracted speech DNA (${speechDnaResult.catchphrases?.length || 0} catchphrases)`)
      }
      if (personaResult) {
        if (personaResult.sections) result.personaSections = personaResult.sections
        if (personaResult.evidenceIndex) result.evidenceIndex = personaResult.evidenceIndex
        if (personaResult.counts) result.personaCounts = personaResult.counts
        if (personaResult.accuracyTier) result.accuracyTier = personaResult.accuracyTier
        logger.info(`agent:import-analyze: persona pipeline tier=${personaResult.accuracyTier?.tier}, counts=${JSON.stringify(personaResult.counts || {})}`)
      }
    }

    return result
  } catch (err) {
    logger.error('agent:import-analyze error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-validate-harness ────────────────────────────────────────
// Phase 4: run hold-out validation. For each (userMessage, realReply) pair,
// call the utility LLM with the generated persona prompt + speech DNA block
// and return what the agent would say. The wizard shows real vs generated side
// by side and collects user ratings.

ipcMain.handle('agent:import-validate-harness', async (event, { agentName, generatedPrompt, speechDna, providerType, modelId, pairs, language, config }) => {
  try {
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return { success: true, results: [] }
    }

    const effectiveConfig = { ...(config || {}) }
    if (providerType && modelId) {
      effectiveConfig.utilityModel = { provider: providerType, model: modelId }
    }

    // Build the character prompt as a single-shot system simulation. We don't
    // have a real chat session to run through AgentLoop — that path is too
    // heavy for validation. Instead we mimic the prompt structure directly:
    // character block + speech DNA hard constraints + user message.
    const { formatSpeechDnaBlock } = require('../agent/chatImport/speechDnaExtractor')
    const speechBlock = speechDna ? formatSpeechDnaBlock(speechDna) : ''
    const zh = language === 'zh'

    const characterHeader = zh
      ? `你就是 ${agentName}。你不是 AI，是真实的人。不要打破角色，不要用 AI 客服式措辞。用对方的语言回复。下面是你的人格：

${generatedPrompt}`
      : `You ARE ${agentName}. You are a real person, not an AI. Never break character. Never use AI-assistant phrasings. Reply in the user's language. Your persona:

${generatedPrompt}`

    const fullSystem = speechBlock ? `${characterHeader}\n\n---\n${speechBlock}` : characterHeader

    const { _callLLM } = require('../agent/chatImport/personaBuilder')
    const { buildHarnessPrompt } = require('../agent/chatImport/harnessPromptBuilder')

    // Run pairs in small batches. BATCH=3 strikes a balance: faster than fully
    // sequential but still cycles sibling-reply context every 3 pairs so later
    // batches see what was already produced and diversify against it. Without
    // this, the LLM tends to spam the same 2-3 catchphrases across all 15
    // validation pairs, making the validation useless.
    const BATCH = 3
    const results = []
    const siblingReplies = []  // accumulates across batches; injected as anti-repetition signal
    for (let i = 0; i < pairs.length; i += BATCH) {
      const batch = pairs.slice(i, i + BATCH)
      sendProgress(event, {
        step: 'harness',
        progress: 10 + Math.round((i / pairs.length) * 85),
        message: zh ? `正在生成第 ${i + 1}-${Math.min(i + BATCH, pairs.length)}/${pairs.length} 条回复...` : `Generating replies ${i + 1}-${Math.min(i + BATCH, pairs.length)}/${pairs.length}...`,
      })

      // Snapshot siblings BEFORE the batch fires so all parallel calls in this
      // batch see the same set (deterministic, no race).
      const siblingSnapshot = siblingReplies.slice(-9)

      const batchResults = await Promise.all(
        batch.map(async (pair) => {
          try {
            const fullPrompt = buildHarnessPrompt({
              fullSystem,
              agentName,
              userMessage: pair.userMessage,
              siblings: siblingSnapshot,
              previousAttempts: pair.previousAttempts || [],
              language,
            })
            const raw = await _callLLM(fullPrompt, effectiveConfig, 512)
            return {
              userMessage: pair.userMessage,
              realReply: pair.realReply,
              generatedReply: (raw || '').trim().replace(/^["']|["']$/g, ''),
              timestamp: pair.timestamp || null,
            }
          } catch (err) {
            return {
              userMessage: pair.userMessage,
              realReply: pair.realReply,
              generatedReply: '',
              error: err.message,
              timestamp: pair.timestamp || null,
            }
          }
        })
      )
      // Append non-empty replies to the rolling sibling buffer for next batch.
      for (const r of batchResults) {
        if (r.generatedReply) siblingReplies.push(r.generatedReply)
      }
      results.push(...batchResults)
    }

    sendProgress(event, { step: 'harness', progress: 100, message: zh ? '完成' : 'Done' })
    return { success: true, results }
  } catch (err) {
    logger.error('agent:import-validate-harness error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-write-harness ───────────────────────────────────────────
// Persist validation scores to {agentArtifactsDir}/{type}/{agentId}.harness.json
// after the agent is created. Non-blocking; purely informational for now.

ipcMain.handle('agent:import-write-harness', async (_event, { agentId, agentType: _agentType, harness }) => {
  try {
    if (!agentId || !harness) return { success: true, written: false }
    const ds = require('../lib/dataStore')
    const { getInstance: getAgentStore } = require('../agent/AgentStore')
    const store = getAgentStore(ds.paths().DATA_DIR)
    store.upsertImportArtifacts(agentId, { harness })
    logger.info(`agent:import-write-harness: stored for ${agentId}`)
    return { success: true, written: true }
  } catch (err) {
    logger.error('agent:import-write-harness error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-write-persona-sections ────────────────────────────────────
// Persist Persona-pipeline sections to the agent's memory store (structured bulk
// write) and the evidence index to a sidecar JSON. Called by the wizard after
// agent creation. Merges into the existing memory — preserves any runtime
// entries already written.

ipcMain.handle('agent:import-write-persona-sections', async (_event, { agentId, agentName, agentType, sections, evidenceIndex }) => {
  try {
    if (!agentId || !sections || typeof sections !== 'object') {
      return { success: true, written: false }
    }

    const ds = require('../lib/dataStore')
    const type = agentType === 'user' || agentType === 'users' ? 'users' : 'system'

    const { createTemplate, parseMarkdown, serializeMarkdown, updateTimestamp } = require('../agent/tools/MemoryTool')
    const memoryStoreMod = require('../memory/memoryStore')
    const store = memoryStoreMod.getInstance(ds.paths().MEMORY_DIR)

    // Hydrate from store (markdown view), or template if this is a fresh agent.
    let content = store.readMarkdown(agentId, type)
    if (!content) {
      content = createTemplate(agentName || agentId, type === 'users' ? 'user' : 'system')
    }

    const { headerLines, sections: memorySections } = parseMarkdown(content)

    // For each persona section, REPLACE (not merge) the content. These sections are
    // owned by the import pipeline and rewritten wholesale on re-import.
    for (const [sectionName, sectionBody] of Object.entries(sections)) {
      if (!sectionBody || !sectionBody.trim()) continue
      const bodyLines = sectionBody.split('\n')
      if (bodyLines[bodyLines.length - 1] !== '') bodyLines.push('')
      memorySections.set(sectionName, bodyLines)
    }

    updateTimestamp(headerLines)
    const newContent = serializeMarkdown(headerLines, memorySections)

    // Write through the store — its diff preserves IDs of unchanged entries.
    store.upsertMeta(agentId, type, agentName)
    const result = store.writeMarkdown(agentId, type, newContent)

    // Evidence index goes into the import_artifacts table. The persona sections
    // above already wrote into memory.db — that path is unchanged.
    if (evidenceIndex) {
      const { getInstance: getAgentStore } = require('../agent/AgentStore')
      const agentStore = getAgentStore(ds.paths().DATA_DIR)
      agentStore.upsertImportArtifacts(agentId, { evidence: evidenceIndex })
    }

    logger.info(`agent:import-write-persona-sections: wrote (store)`, { agentId, ...result })
    return { success: true, written: true, ...result }
  } catch (err) {
    logger.error('agent:import-write-persona-sections error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-write-speech-dna ────────────────────────────────────────
// Persist the extracted speech DNA to {agentArtifactsDir}/{type}/{agentId}.speech.json.
// Called by the wizard after agent creation, in parallel with writeMemories.

ipcMain.handle('agent:import-write-speech-dna', async (_event, { agentId, agentType, speechDna }) => {
  try {
    if (!agentId || !speechDna) return { success: true, written: false }
    const ds = require('../lib/dataStore')
    const { getInstance: getAgentStore } = require('../agent/AgentStore')
    const store = getAgentStore(ds.paths().DATA_DIR)
    const source = agentType === 'user' || agentType === 'users' ? 'user-import' : 'system-import'
    store.upsertImportArtifacts(agentId, { speechDna, source })
    logger.info(`agent:import-write-speech-dna: stored for ${agentId}`)
    return { success: true, written: true }
  } catch (err) {
    logger.error('agent:import-write-speech-dna error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:recommend-voice ───────────────────────────────────────────────
// Pick a voice id from a candidate list that best fits the imported persona.
// Receives: { personaPrompt, description, gender, language, candidates: [{id,name,gender,locale,vibe}] }
// Returns: { success: true, voiceId } where voiceId is one of the candidate ids.
// Falls back to the first candidate on any failure — non-blocking for the wizard.
ipcMain.handle('agent:recommend-voice', async (_event, { personaPrompt, description, gender, language, candidates, config }) => {
  try {
    const list = Array.isArray(candidates) ? candidates.filter(c => c && c.id) : []
    if (list.length === 0) return { success: false, error: 'No candidate voices' }
    if (list.length === 1) return { success: true, voiceId: list[0].id }

    const ds = require('../lib/dataStore')
    const cfg = config || ds.readJSON(ds.paths().CONFIG_FILE, {})
    if (!cfg.utilityModel?.provider || !cfg.utilityModel?.model) {
      return { success: true, voiceId: list[0].id, fallback: 'no_utility_model' }
    }

    const zh = language === 'zh'
    const personaSnippet = (personaPrompt || '').slice(0, 1500)
    const voiceLines = list.map(v => `- ${v.id} | ${v.name} | ${v.gender} | ${v.vibe || ''}`).join('\n')
    const prompt = zh
      ? `根据下面这个数字人的人格档案，从候选语音中挑选最契合的一个。只返回 voice id，不要任何其他文字。

# 人格档案 (节选)
${personaSnippet}

# 简介
${description || '(无)'}

# 性别
${gender || '未知'}

# 候选语音
${voiceLines}

# 你的输出
（只输出一个 voice id，例如：zh-CN-XiaoxiaoNeural）`
      : `Pick the voice id that best matches this persona. Return only the voice id, nothing else.

# Persona (excerpt)
${personaSnippet}

# Description
${description || '(none)'}

# Gender
${gender || 'unknown'}

# Candidate voices
${voiceLines}

# Your output
(just one voice id, e.g. en-US-AndrewNeural)`

    const { _callLLM } = require('../agent/chatImport/personaBuilder')
    const raw = await _callLLM(prompt, cfg, 64, { maxRetries: 0 })
    const cleaned = String(raw || '').trim().replace(/[`'"]/g, '').split(/\s/)[0]
    const matched = list.find(c => c.id === cleaned)
    if (matched) {
      logger.info(`agent:recommend-voice: picked ${matched.id} for persona`)
      return { success: true, voiceId: matched.id }
    }
    logger.warn(`agent:recommend-voice: LLM returned "${raw}" — not in candidate list, falling back`)
    return { success: true, voiceId: list[0].id, fallback: 'no_match' }
  } catch (err) {
    logger.warn('agent:recommend-voice failed:', err.message)
    // Best-effort: caller already has a gender-based default; this is a soft enhancement.
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

ipcMain.handle('agent:import-save-history', async (event, { agentId, messages, contactName }) => {
  try {
    if (!agentId || !Array.isArray(messages) || messages.length === 0) {
      return { success: true, saved: 0 }
    }

    const ds = require('../lib/dataStore')
    const agentMemDir = path.join(ds.paths().MEMORY_DIR, 'agents', agentId)
    const fs = require('fs')
    fs.mkdirSync(agentMemDir, { recursive: true })

    // Index for history search (BM25, legacy path — so agent can find relevant history at chat time)
    const { HistoryIndex } = require('../memory/HistoryIndex')
    const histIdx = new HistoryIndex(ds.paths().AGENT_MEMORY_DIR)
    histIdx.indexImportedHistory(messages, agentId, contactName)

    // Phase C: build Reply Bank (semantic vector index of trigger→reply pairs).
    // Runs AFTER BM25 indexing so the response to the renderer isn't blocked on
    // the slower embedding step. The wizard already shows a toast; we stream
    // progress via the same agent:import-progress channel.
    const replyBankMod = require('../memory/ReplyBank')
    const replyBank = replyBankMod.getInstance(ds.paths().AGENT_MEMORY_DIR)
    const buildResult = await replyBank.build(agentId, messages, contactName, (payload) => {
      sendProgress(event, { step: `replybank-${payload.step}`, progress: payload.progress, message: payload.message })
    })

    return {
      success: true,
      saved: messages.length,
      replyBank: buildResult,
    }
  } catch (err) {
    logger.error('agent:import-save-history error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-write-memories ──────────────────────────────────────────
// Write extracted memories to an agent's memory store.

ipcMain.handle('agent:import-write-memories', async (_event, { agentId, memories }) => {
  try {
    if (!agentId || !Array.isArray(memories) || memories.length === 0) {
      return { success: true, count: 0 }
    }

    const { MemoryUpdateTool } = require('../agent/tools/MemoryTool')
    const tool = new MemoryUpdateTool()

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
  // partner_names: wxid → human-readable label. Used downstream by self-analysis
  // sections (relationships_map, identity_modes, perceived_views) so the report
  // shows "Alice"/"Mom" instead of the opaque WeChat id.
  const partnerNames = {}
  for (let i = 0; i < contacts.length; i++) {
    const { wxid, displayName } = contacts[i]
    const name = (displayName || wxid || '').toString().trim() || wxid
    partnerNames[wxid] = name
    sendProgress(event, {
      step: 'parse',
      progress: Math.round(10 + 80 * (i / contacts.length)),
      message: `Extracting conversation ${i + 1}/${contacts.length}...`,
    })
    const msgs = wechatParser.extractMessagesFromDir(dbDir, wxid)
    // Tag each message with its partner so messages survive the later merge-sort
    // with partner identity intact. classifyMessages uses spread, so these
    // fields are preserved into `classified.all_messages`.
    for (const m of msgs) {
      m.partner = wxid
      m.partner_name = name
    }
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
  classified.partner_names = partnerNames

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
