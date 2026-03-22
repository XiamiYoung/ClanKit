/**
 * IPC handlers for memory extraction and soul updates.
 * Channels: memory:*
 */
const path = require('path')
const fs = require('fs')
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const { ensureAgentMemoryDirs, appendMemoryFile, getAgentLogPaths } = require('../lib/memoryHelpers')
const { accumulateUtilityUsage } = require('../ipc/store')
const { MemoryExtractor } = require('../agent/core/MemoryExtractor')
const { MemoryFlush }    = require('../agent/core/MemoryFlush')
const { ChatIndex }      = require('../memory/ChatIndex')

/** Read a soul file from disk. Returns null if not found. */
function readSoulFileSync(agentId, agentType) {
  if (!agentId) return null
  try {
    const filePath = path.join(ds.paths().SOULS_DIR, agentType, `${agentId}.md`)
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    logger.error('readSoulFileSync error', err.message)
  }
  return null
}

/**
 * Register memory IPC handlers.
 * @param {Object} deps - Shared state dependencies from main.js
 * @param {Map} deps.lastExtractedMsgCount - chatId -> message count at last extraction
 * @param {Map} deps.pendingMemoryFacts - chatId -> Array of pending fact objects
 * @param {Function} deps.runMemoryExtraction - async (event, chatId, messages, config, agentPrompts, participants)
 */
function register({ lastExtractedMsgCount, pendingMemoryFacts, runMemoryExtraction }) {
  // --- IPC: Memory Accept (post-turn extraction) -----------------------------
  ipcMain.handle('memory:accept', async (_, { agentId, agentType, section, entry }) => {
    try {
      const { SoulUpdateTool: SoulUpdateToolForMemory } = require('../agent/tools/SoulTool')
      const tool = new SoulUpdateToolForMemory(ds.paths().SOULS_DIR)
      return await tool.execute('memory-accept', { agent_id: agentId, agent_type: agentType, section, action: 'add', entry })
    } catch (err) {
      logger.error('memory:accept error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- IPC: Memory extraction on chat switch / window close ------------------
  // Force extraction for any remaining unprocessed messages, bypassing the N=10 threshold.
  ipcMain.handle('memory:extract-on-chat-switch', async (event, { chatId, messages, config, participants, agentPrompts }) => {
    try {
      lastExtractedMsgCount.set(chatId, messages.length)

      // Run memory extraction (existing)
      await runMemoryExtraction(event, chatId, messages, config, agentPrompts, participants)

      // Run memory flush (new) -- fire-and-forget, non-blocking
      const agentId = agentPrompts?.systemAgentId
      if (agentId && messages && messages.length >= 2) {
        const um = config.utilityModel
        if (um?.provider && um?.model) {
          const providerCfg = config[um.provider]
          if (providerCfg?.apiKey && providerCfg?.baseURL) {
            const { logsDir } = ensureAgentMemoryDirs(agentId)
            const flusher = new MemoryFlush({
              model:      um.model,
              apiKey:     providerCfg.apiKey,
              baseURL:    providerCfg.baseURL,
              isOpenAI:   um.provider === 'openai' || um.provider === 'deepseek',
              directAuth: um.provider === 'deepseek',
            })
            flusher.run(messages, agentId, logsDir).catch(err =>
              logger.error('[memory:extract-on-chat-switch] flush error', err.message)
            )
          }
        }
      }

      // Index this chat for keyword search
      if (agentId && messages && messages.length > 0) {
        try {
          const idx = new ChatIndex(ds.paths().AGENT_MEMORY_DIR)
          idx.indexChat(chatId, messages, agentId)
        } catch (err) {
          logger.error('[ChatIndex] indexing on switch failed', err.message)
        }
      }

      return { success: true }
    } catch (err) {
      logger.error('memory:extract-on-chat-switch error', err.message)
      return { success: false, error: err.message }
    }
  })

  // --- IPC: Memory extraction from agent-to-agent collaboration ----------------
  ipcMain.handle('memory:extract-collaboration', async (event, { chatId, transcript, participants, config }) => {
    try {
      const um = config.utilityModel
      if (!um?.provider || !um?.model) return { success: true, count: 0 }
      const providerCfg = config[um.provider]
      if (!providerCfg?.apiKey || !providerCfg?.baseURL) return { success: true, count: 0 }

      const isOpenAI = um.provider === 'openai' || um.provider === 'deepseek'
      const extractor = new MemoryExtractor({
        model: um.model,
        apiKey: providerCfg.apiKey,
        baseURL: providerCfg.baseURL,
        isOpenAI,
        directAuth: um.provider === 'deepseek',
      })

      // Read existing soul files for each participant
      const existingSouls = {}
      for (const p of participants) {
        existingSouls[p.id] = readSoulFileSync(p.id, p.type || 'system')
      }

      const suggestions = await extractor.extractFromCollaboration({ transcript, participants, existingSouls, language: config.language || 'en' })
      if (suggestions.length === 0) return { success: true, count: 0 }

      logger.agent('Collaboration memory extraction', { chatId, count: suggestions.length, model: um.model })

      const autoSave = suggestions.filter(s => s.confidence >= 0.8)
      const pending  = suggestions.filter(s => s.confidence >= 0.5 && s.confidence < 0.8)

      if (autoSave.length > 0) {
        const { SoulUpdateTool: SoulUpdateToolForCollab } = require('../agent/tools/SoulTool')
        const soulTool = new SoulUpdateToolForCollab(ds.paths().SOULS_DIR)
        for (const item of autoSave) {
          await soulTool.execute('memory-auto', {
            agent_id: item.agentId,
            agent_type: item.agentType,
            section: item.section,
            action: 'add',
            entry: item.entry,
          }).catch(err => logger.warn('Collaboration memory auto-save failed', { entry: item.entry, error: err.message }))
        }
        logger.agent('Collaboration memory auto-saved', { chatId, count: autoSave.length })
      }

      if (pending.length > 0) {
        const existing = pendingMemoryFacts.get(chatId) || []
        pendingMemoryFacts.set(chatId, [...existing, ...pending])
        logger.agent('Collaboration memory pending confirmation', { chatId, count: pending.length })
      }

      return { success: true, count: suggestions.length }
    } catch (err) {
      logger.error('memory:extract-collaboration error', err.message)
      return { success: false, error: err.message }
    }
  })
}

module.exports = { register, readSoulFileSync }
