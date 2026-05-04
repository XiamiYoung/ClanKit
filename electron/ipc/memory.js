/**
 * IPC handlers for agent memory.
 *
 * Three groups of channels under one `memory:*` namespace:
 *
 *   1. Markdown blob contract (`memory:read/write/exists/list-agents/delete-agent/delete-agent-data`)
 *      Returns full markdown blobs reconstructed from the SQLite store. Used
 *      by chat-import persona pipeline, the wholesale-replace textarea editor,
 *      and any consumer that wants a single string instead of structured rows.
 *
 *   2. Structured CRUD (`memory:list-entries/add-entry/update-entry/delete-entry/search/reindex`)
 *      Per-entry operations used by the BodyView card UI.
 *
 *   3. Extraction (`memory:accept/extract-on-chat-switch/extract-collaboration`)
 *      Hooks for the post-turn LLM-driven memory extractor.
 *
 * Source of truth: `electron/memory/memoryStore.js` (SQLite + FTS5 + vectra).
 */
const path = require('path')
const fs = require('fs')
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const { MemoryExtractor } = require('../agent/core/MemoryExtractor')
const { HistoryIndex }    = require('../memory/HistoryIndex')
const memoryStoreMod = require('../memory/memoryStore')

function _store() {
  return memoryStoreMod.getInstance(ds.paths().MEMORY_DIR)
}

/** Read agent memory as markdown via the SQLite-backed MemoryStore. Returns null when missing. */
function readMemoryFileSync(agentId, agentType) {
  if (!agentId) return null
  try {
    return _store().readMarkdown(agentId, agentType)
  } catch (err) {
    logger.error('readMemoryFileSync error', err.message)
    return null
  }
}

/**
 * Register memory IPC handlers.
 * @param {Object} deps - Shared state dependencies from main.js
 * @param {Map} deps.lastExtractedMsgCount - chatId -> message count at last extraction
 * @param {Map} deps.pendingMemoryFacts - chatId -> Array of pending fact objects
 * @param {Function} deps.runMemoryExtraction - async (event, chatId, messages, config, agentPrompts, participants)
 */
function register({ lastExtractedMsgCount, pendingMemoryFacts, runMemoryExtraction }) {

  // ── Group 1: Markdown blob contract ──────────────────────────────────

  ipcMain.handle('memory:read', (_, agentId, type) => {
    try {
      return _store().readMarkdown(agentId, type)
    } catch (err) {
      logger.error('memory:read error', err.message)
      return null
    }
  })

  ipcMain.handle('memory:write', (_, agentId, type, content) => {
    try {
      const result = _store().writeMarkdown(agentId, type, content || '')
      return { success: true, ...result }
    } catch (err) {
      logger.error('memory:write error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('memory:exists', (_, agentId, type) => {
    try {
      return _store().exists(agentId, type)
    } catch { return false }
  })

  ipcMain.handle('memory:list-agents', (_, type) => {
    try {
      return _store().listAgents(type)
    } catch (err) {
      logger.error('memory:list-agents error', err.message)
      return []
    }
  })

  ipcMain.handle('memory:delete-agent', (_, agentId, type) => {
    try {
      _store().deleteAgent(agentId, type)
      return { success: true }
    } catch (err) {
      logger.error('memory:delete-agent error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Delete all data associated with an agent: rows + meta + per-agent memory dir
  ipcMain.handle('memory:delete-agent-data', (_, agentId, type) => {
    const errors = []
    try {
      _store().deleteAgent(agentId, type)
    } catch (err) {
      errors.push(`memory: ${err.message}`)
    }
    // Per-agent memory dir (chat history index, reply bank) — same as before
    try {
      const memDir = path.join(ds.paths().MEMORY_DIR, 'agents', agentId)
      if (fs.existsSync(memDir)) fs.rmSync(memDir, { recursive: true, force: true })
    } catch (err) {
      errors.push(`agent-dir: ${err.message}`)
    }
    if (errors.length) logger.warn('memory:delete-agent-data partial failure', { agentId, errors })
    return { success: errors.length === 0, errors }
  })

  // ── Group 2: Structured CRUD ─────────────────────────────────────────

  ipcMain.handle('memory:list-entries', (_, agentId, agentType) => {
    try {
      const rows = _store().listRows(agentId, agentType)
      const meta = _store().getMeta(agentId, agentType)
      return { rows, meta }
    } catch (err) {
      logger.error('memory:list-entries error', err.message)
      return { rows: [], meta: null, error: err.message }
    }
  })

  ipcMain.handle('memory:add-entry', (_, payload) => {
    try {
      const { agentId, agentType, section, content, source, confidence } = payload || {}
      if (!agentId || !agentType || !section || !content || !content.trim()) {
        return { success: false, error: 'Missing required fields' }
      }
      const row = _store().addRow({
        agentId,
        agentType,
        section,
        content: content.trim(),
        source: source || 'user',
        confidence: confidence == null ? null : confidence,
      })
      return { success: true, row }
    } catch (err) {
      logger.error('memory:add-entry error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('memory:update-entry', (_, payload) => {
    try {
      const { id, content, section, confidence } = payload || {}
      if (!id) return { success: false, error: 'id required' }
      const patch = {}
      if (content !== undefined) patch.content = String(content).trim()
      if (section !== undefined) patch.section = section
      if (confidence !== undefined) patch.confidence = confidence
      const row = _store().updateRow(id, patch)
      if (!row) return { success: false, error: 'not found' }
      return { success: true, row }
    } catch (err) {
      logger.error('memory:update-entry error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('memory:delete-entry', (_, id) => {
    try {
      const ok = _store().deleteRow(id)
      return { success: ok }
    } catch (err) {
      logger.error('memory:delete-entry error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('memory:search', async (_, payload) => {
    try {
      const { agentId, agentType, query, topK } = payload || {}
      if (!agentId || !agentType || !query) return { rows: [] }
      const rows = await _store().searchHybrid(agentId, agentType, query, topK || 5)
      return { rows }
    } catch (err) {
      logger.error('memory:search error', err.message)
      return { rows: [], error: err.message }
    }
  })

  ipcMain.handle('memory:reindex', async () => {
    try {
      const count = await _store().reindexMissingEmbeddings(5000)
      return { success: true, count }
    } catch (err) {
      logger.error('memory:reindex error', err.message)
      return { success: false, error: err.message }
    }
  })

  // ── Group 3: Extraction ──────────────────────────────────────────────

  ipcMain.handle('memory:accept', async (_, { agentId, agentType, section, entry }) => {
    try {
      const { MemoryUpdateTool } = require('../agent/tools/MemoryTool')
      const tool = new MemoryUpdateTool()
      return await tool.execute('memory-accept', { agent_id: agentId, agent_type: agentType, section, action: 'add', entry })
    } catch (err) {
      logger.error('memory:accept error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Force extraction for any remaining unprocessed messages, bypassing the N=10 threshold.
  ipcMain.handle('memory:extract-on-chat-switch', async (event, { chatId, messages, config, participants, agentPrompts }) => {
    try {
      lastExtractedMsgCount.set(chatId, messages.length)

      await runMemoryExtraction(event, chatId, messages, config, agentPrompts, participants)

      // Index this chat for history search
      const agentId = agentPrompts?.systemAgentId
      if (agentId && messages && messages.length > 0) {
        try {
          const idx = new HistoryIndex(ds.paths().AGENT_MEMORY_DIR)
          idx.indexChat(chatId, messages, agentId)
        } catch (err) {
          logger.error('[HistoryIndex] indexing on switch failed', err.message)
        }
      }

      return { success: true }
    } catch (err) {
      logger.error('memory:extract-on-chat-switch error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('memory:extract-collaboration', async (event, { chatId, transcript, participants, config }) => {
    try {
      const um = config.utilityModel
      if (!um?.provider || !um?.model) return { success: true, count: 0 }
      const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.apiKey)
      if (!providerCfg?.apiKey) return { success: true, count: 0 }
      if (!providerCfg?.baseURL && um.provider !== 'google') return { success: true, count: 0 }

      const isOpenAI = um.provider !== 'anthropic' && um.provider !== 'openrouter' && um.provider !== 'google'
      const extractor = new MemoryExtractor({
        model:        um.model,
        apiKey:       providerCfg.apiKey,
        baseURL:      providerCfg.baseURL,
        isOpenAI,
        directAuth:   isOpenAI && um.provider !== 'openai',
        providerType: um.provider,
      })

      // Read existing memory blobs for each participant
      const existingMemories = {}
      for (const p of participants) {
        existingMemories[p.id] = readMemoryFileSync(p.id, p.type || 'system')
      }

      const suggestions = await extractor.extractFromCollaboration({ transcript, participants, existingMemories, language: config.language || 'en' })
      if (suggestions.length === 0) return { success: true, count: 0 }

      logger.agent('Collaboration memory extraction', { chatId, count: suggestions.length, model: um.model })

      const autoSave = suggestions.filter(s => s.confidence >= 0.8)
      const pending  = suggestions.filter(s => s.confidence >= 0.5 && s.confidence < 0.8)

      if (autoSave.length > 0) {
        const { MemoryUpdateTool } = require('../agent/tools/MemoryTool')
        const tool = new MemoryUpdateTool()
        for (const item of autoSave) {
          await tool.execute('memory-auto', {
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

module.exports = { register, readMemoryFileSync }
