'use strict'

/**
 * agentAnalysis.js — IPC handlers for agent analysis features.
 *
 * Channels:
 *   agent:analysis-has-history  → { hasHistory: boolean }
 */

const { ipcMain } = require('electron')
const { logger } = require('../logger')

// ─── agent:analysis-has-history ───────────────────────────────────────────
// Check whether an agent has imported chat history available for analysis.

ipcMain.handle('agent:analysis-has-history', async (_event, { agentId }) => {
  try {
    if (!agentId) return { hasHistory: false }
    const ds = require('../lib/dataStore')
    const { HistoryIndex } = require('../memory/HistoryIndex')
    const idx = new HistoryIndex(ds.paths().AGENT_MEMORY_DIR)
    return { hasHistory: idx.hasImportedHistory(agentId) }
  } catch (err) {
    logger.error('agent:analysis-has-history error', err.message)
    return { hasHistory: false }
  }
})

function register() {
  // handlers registered at module load via ipcMain.handle above
}

module.exports = { register }
