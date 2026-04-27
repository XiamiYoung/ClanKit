/**
 * IPC handlers for agent soul memory.
 *
 * Two contracts exposed:
 *
 *   1. Legacy markdown contract (`souls:read/write/exists/list/delete*`)
 *      Returns full markdown blobs reconstructed from the SQLite store.
 *      Kept stable so older consumers (LLM tool calls via SoulReadTool, the
 *      chat-import nuwa pipeline, the wholesale-replace textarea editor) keep
 *      working unchanged.
 *
 *   2. New structured contract (`memories:list/add/update/delete/search`)
 *      Used by the structured BodyView card UI for per-entry CRUD.
 *
 * Source of truth: `electron/memory/soulStore.js` (SQLite + FTS5 + vectra).
 *
 * NOTE: As of this migration, `souls/{type}/{id}.md` files on disk are no
 * longer the source of truth. They are preserved as a legacy artifact for
 * users who want to grep them but are not read or written. The migration
 * script (scripts/migrate-souls-to-sqlite.js) seeds the SQLite store from
 * any pre-existing .md files on first run.
 */
const path = require('path')
const fs = require('fs')
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const soulStoreMod = require('../memory/soulStore')

function _store() {
  return soulStoreMod.getInstance(ds.paths().MEMORY_DIR)
}

/**
 * Ensure the souls/{type} directory still exists. Other modules import this
 * helper from us — kept around so we don't break dependents (memory.js,
 * agentLoop.js, etc.). The directory is no longer functionally required for
 * persistence but legacy export paths and migration scripts still touch it.
 */
function ensureSoulsDir(type) {
  const dir = path.join(ds.paths().SOULS_DIR, type)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function register() {
  // ── Legacy markdown contract ─────────────────────────────────────────
  ipcMain.handle('souls:read', (_, agentId, type) => {
    try {
      return _store().readMarkdown(agentId, type)
    } catch (err) {
      logger.error('souls:read error', err.message)
      return null
    }
  })

  ipcMain.handle('souls:write', (_, agentId, type, content) => {
    try {
      const result = _store().writeMarkdown(agentId, type, content || '')
      return { success: true, ...result }
    } catch (err) {
      logger.error('souls:write error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('souls:exists', (_, agentId, type) => {
    try {
      return _store().exists(agentId, type)
    } catch { return false }
  })

  ipcMain.handle('souls:list', (_, type) => {
    try {
      return _store().listAgents(type)
    } catch (err) {
      logger.error('souls:list error', err.message)
      return []
    }
  })

  ipcMain.handle('souls:delete', (_, agentId, type) => {
    try {
      _store().deleteAgent(agentId, type)
      return { success: true }
    } catch (err) {
      logger.error('souls:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Delete all data associated with an agent: rows + meta + memory directory
  ipcMain.handle('souls:delete-agent-data', (_, agentId, type) => {
    const errors = []
    try {
      _store().deleteAgent(agentId, type)
    } catch (err) {
      errors.push(`soul: ${err.message}`)
    }
    // Per-agent memory dir (chat history index, reply bank) — same behaviour as before
    try {
      const memDir = path.join(ds.paths().MEMORY_DIR, 'agents', agentId)
      if (fs.existsSync(memDir)) fs.rmSync(memDir, { recursive: true, force: true })
    } catch (err) {
      errors.push(`memory: ${err.message}`)
    }
    if (errors.length) logger.warn('souls:delete-agent-data partial failure', { agentId, errors })
    return { success: errors.length === 0, errors }
  })

  // ── New structured contract: memories:* ──────────────────────────────

  /**
   * memories:list — full row dump for one agent.
   * Returns: { rows, sectionOrder } where rows are sorted by section then createdAt.
   */
  ipcMain.handle('memories:list', (_, agentId, agentType) => {
    try {
      const rows = _store().listRows(agentId, agentType)
      const meta = _store().getMeta(agentId, agentType)
      return { rows, meta }
    } catch (err) {
      logger.error('memories:list error', err.message)
      return { rows: [], meta: null, error: err.message }
    }
  })

  /**
   * memories:add — insert a new entry.
   * @param payload { agentId, agentType, section, content, source?, confidence? }
   */
  ipcMain.handle('memories:add', (_, payload) => {
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
      logger.error('memories:add error', err.message)
      return { success: false, error: err.message }
    }
  })

  /**
   * memories:update — patch an existing entry by id.
   * @param payload { id, content?, section?, confidence? }
   */
  ipcMain.handle('memories:update', (_, payload) => {
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
      logger.error('memories:update error', err.message)
      return { success: false, error: err.message }
    }
  })

  /**
   * memories:delete — remove an entry by id.
   */
  ipcMain.handle('memories:delete', (_, id) => {
    try {
      const ok = _store().deleteRow(id)
      return { success: ok }
    } catch (err) {
      logger.error('memories:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  /**
   * memories:search — hybrid BM25 + semantic for one agent.
   * @param payload { agentId, agentType, query, topK? }
   */
  ipcMain.handle('memories:search', async (_, payload) => {
    try {
      const { agentId, agentType, query, topK } = payload || {}
      if (!agentId || !agentType || !query) return { rows: [] }
      const rows = await _store().searchHybrid(agentId, agentType, query, topK || 5)
      return { rows }
    } catch (err) {
      logger.error('memories:search error', err.message)
      return { rows: [], error: err.message }
    }
  })

  /**
   * memories:reindex — backfill embeddings for rows that don't have a vec entry
   * yet. Called manually after the user installs the embedding model.
   */
  ipcMain.handle('memories:reindex', async () => {
    try {
      const count = await _store().reindexMissingEmbeddings(5000)
      return { success: true, count }
    } catch (err) {
      logger.error('memories:reindex error', err.message)
      return { success: false, error: err.message }
    }
  })
}

module.exports = { register, ensureSoulsDir }
