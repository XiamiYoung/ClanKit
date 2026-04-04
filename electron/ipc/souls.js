/**
 * IPC handlers for agent soul memory files (personality, memory, knowledge).
 * Channels: souls:*
 */
const path = require('path')
const fs = require('fs')
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')

function ensureSoulsDir(type) {
  const dir = path.join(ds.paths().SOULS_DIR, type)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function register() {
  ipcMain.handle('souls:read', (_, agentId, type) => {
    try {
      const filePath = path.join(ensureSoulsDir(type), `${agentId}.md`)
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf8')
    } catch (err) {
      logger.error('souls:read error', err.message)
      return null
    }
  })

  ipcMain.handle('souls:write', (_, agentId, type, content) => {
    try {
      const filePath = path.join(ensureSoulsDir(type), `${agentId}.md`)
      fs.writeFileSync(filePath, content, 'utf8')
      return { success: true }
    } catch (err) {
      logger.error('souls:write error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('souls:exists', (_, agentId, type) => {
    try {
      const filePath = path.join(ensureSoulsDir(type), `${agentId}.md`)
      return fs.existsSync(filePath)
    } catch { return false }
  })

  ipcMain.handle('souls:list', (_, type) => {
    try {
      const dir = ensureSoulsDir(type)
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''))
    } catch (err) {
      logger.error('souls:list error', err.message)
      return []
    }
  })

  ipcMain.handle('souls:delete', (_, agentId, type) => {
    try {
      const filePath = path.join(ensureSoulsDir(type), `${agentId}.md`)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    } catch (err) {
      logger.error('souls:delete error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Delete all data associated with an agent: soul file + memory directory
  ipcMain.handle('souls:delete-agent-data', (_, agentId, type) => {
    const errors = []
    // 1. Soul file
    try {
      const filePath = path.join(ensureSoulsDir(type), `${agentId}.md`)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (err) {
      errors.push(`soul: ${err.message}`)
    }
    // 2. Agent memory directory (memory/agents/{agentId}/)
    try {
      const memDir = path.join(ds.paths().MEMORY_DIR, 'agents', agentId)
      if (fs.existsSync(memDir)) fs.rmSync(memDir, { recursive: true, force: true })
    } catch (err) {
      errors.push(`memory: ${err.message}`)
    }
    if (errors.length) logger.warn('souls:delete-agent-data partial failure', { agentId, errors })
    return { success: errors.length === 0, errors }
  })
}

// Also export ensureSoulsDir for use by other IPC modules (memory, agent)
module.exports = { register, ensureSoulsDir }
