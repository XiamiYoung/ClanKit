'use strict'

/**
 * agentImport.js — IPC handlers for "Import from Chat History → Create Agent" wizard.
 *
 * Channels:
 *   agent:import-check-env        → { ready: bool }
 *   agent:import-setup-env        → streams agent:import-progress → { success, error? }
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
const { spawn } = require('child_process')
const windowRef = require('../lib/windowRef')
const { logger } = require('../logger')

const { isEnvReady, setupChatImportEnv, getChatImportEnvPath, getVenvPythonBin, getSystemPythonPath } = require('../agent/chatImport/setup')
const { extractWhatsAppMessages, extractPlainTextMessages, classifyMessages, buildMessageBlock } = require('../agent/chatImport/chatParser')
const { buildCombinedPrompt, generatePersona } = require('../agent/chatImport/personaBuilder')

// Path to the Python scripts bundled with the app
const SCRIPTS_DIR = path.join(__dirname, '../agent/chatImport')

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

ipcMain.handle('agent:import-check-env', async () => {
  try {
    const ready = await isEnvReady()
    return { ready }
  } catch (err) {
    return { ready: false, error: err.message }
  }
})

// ─── agent:import-setup-env ────────────────────────────────────────────────

ipcMain.handle('agent:import-setup-env', async (event) => {
  try {
    const result = await setupChatImportEnv((payload) => sendProgress(event, payload))
    return result
  } catch (err) {
    logger.error('agent:import-setup-env error', err.message)
    return { success: false, error: err.message }
  }
})

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

    const ready = await isEnvReady()
    if (!ready) {
      return { success: false, error: 'Chat import environment not set up. Please set up the environment first.' }
    }

    const venvPython = getVenvPythonBin(getChatImportEnvPath())
    const decryptorScript = path.join(SCRIPTS_DIR, 'wechat_decryptor.py')
    const ds = require('../lib/dataStore')
    const fs = require('fs')
    const decryptedDir = path.join(ds.paths().DATA_DIR, 'wechat-decrypted')

    // Clean previous decrypted data to avoid leaking other accounts' contacts
    try { fs.rmSync(decryptedDir, { recursive: true, force: true }) } catch {}

    sendProgress(event, { step: 'key', progress: 5, message: 'Starting WeChat decryption...' })
    const result = await runPythonScript(
      venvPython,
      [decryptorScript, '--json-progress', '--output', decryptedDir],
      (data) => sendProgress(event, data)
    )

    if (!result.success) {
      const errMsg = result.error || ''
      const isProcessNotFound = /process not found|WeChat process not found/i.test(errMsg)
      if (process.platform === 'win32' && isProcessNotFound) {
        sendProgress(event, { step: 'elevate', progress: 8, message: 'WeChat process not accessible — requesting administrator privileges...' })
        const elevResult = await _decryptWeChatElevated(event, venvPython, decryptorScript)
        if (!elevResult.success) return { success: false, error: elevResult.error || 'WeChat decryption failed.' }
        return { success: true, decryptedDir: elevResult.output_dir || decryptedDir }
      }
      return { success: false, error: errMsg || 'WeChat decryption failed.' }
    }

    return { success: true, decryptedDir: result.output_dir || decryptedDir }
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
    const parserPython = await _getParserPython()
    if (!parserPython) return { success: false, error: 'No compatible Python found.' }
    const parserScript = path.join(SCRIPTS_DIR, 'wechat_parser.py')

    const args = [parserScript, '--list-contacts', '--json-output']
    if (source === 'imessage') {
      args.push('--imessage')
    } else {
      if (!dbDir) return { success: false, error: 'dbDir is required for WeChat contact list.' }
      args.push('--db-dir', dbDir)
    }

    const result = await runPythonScript(parserPython, args, null)
    if (!result.success) return { success: false, error: result.error }
    return { success: true, contacts: result.jsonData?.contacts || [] }
  } catch (err) {
    logger.error('agent:import-list-contacts error', err.message)
    return { success: false, error: err.message }
  }
})

// ─── agent:import-extract-messages ────────────────────────────────────────

ipcMain.handle('agent:import-extract-messages', async (event, params) => {
  const { source, contactName, dbDir, filePath, text } = params

  try {
    if (source === 'wechat') {
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

ipcMain.handle('agent:import-analyze', async (event, { classified, profile, config, providerType, modelId }) => {
  try {
    sendProgress(event, { step: 'build', progress: 5, message: 'Building prompt...' })
    const targetName = classified.target_name || profile.name || 'Unknown'
    const messageBlock = buildMessageBlock(classified, targetName)
    const language = config.language || 'en'
    const fullPrompt = buildCombinedPrompt(profile, messageBlock, language)

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

    const result = await generatePersona(fullPrompt, effectiveConfig, (payload) => sendProgress(event, payload), profile, contextWindows, language)
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
  const parserScript = path.join(SCRIPTS_DIR, 'wechat_parser.py')
  let resolvedDbDir = dbDir

  // Step 1: decrypt if no dbDir provided (requires venv with pycryptodome)
  if (!resolvedDbDir) {
    const ready = await isEnvReady()
    if (!ready) {
      return { success: false, error: 'Chat import environment not set up. Please set up the environment first.' }
    }
    const venvPython = getVenvPythonBin(getChatImportEnvPath())
    sendProgress(event, { step: 'key', progress: 5, message: 'Starting WeChat decryption...' })
    const decryptorScript = path.join(SCRIPTS_DIR, 'wechat_decryptor.py')
    const ds = require('../lib/dataStore')
    const fs = require('fs')
    const decryptedDir = path.join(ds.paths().DATA_DIR, 'wechat-decrypted')
    // Clean previous decrypted data to avoid leaking other accounts' contacts
    try { fs.rmSync(decryptedDir, { recursive: true, force: true }) } catch {}
    const decryptResult = await runPythonScript(
      venvPython,
      [decryptorScript, '--json-progress', '--output', decryptedDir],
      (data) => { sendProgress(event, data) }
    )
    if (!decryptResult.success) {
      // If process not found, automatically retry with UAC elevation (Windows only)
      const errMsg = decryptResult.error || ''
      const isProcessNotFound = /process not found|未找到微信进程/i.test(errMsg)
      if (process.platform === 'win32' && isProcessNotFound) {
        sendProgress(event, { step: 'elevate', progress: 8, message: 'WeChat process not accessible — requesting administrator privileges...' })
        const elevResult = await _decryptWeChatElevated(event, venvPython, decryptorScript)
        if (!elevResult.success) {
          return { success: false, error: elevResult.error || 'WeChat decryption failed.' }
        }
        resolvedDbDir = elevResult.output_dir
      } else {
        return { success: false, error: errMsg || 'WeChat decryption failed.' }
      }
    } else {
      resolvedDbDir = decryptResult.output_dir
    }
    if (!resolvedDbDir) {
      return { success: false, error: 'Decryption succeeded but output directory was not returned.' }
    }
  }

  // Step 2: parse messages — wechat_parser.py only uses stdlib, system Python is fine
  const parserPython = await _getParserPython()
  if (!parserPython) {
    return { success: false, error: 'No compatible Python found. Please set up the environment.' }
  }

  sendProgress(event, { step: 'parse', progress: 60, message: 'Extracting messages...' })
  const parseResult = await runPythonScript(
    parserPython,
    [parserScript, '--db-dir', resolvedDbDir, '--target', contactName, '--json-output'],
    (data) => sendProgress(event, { ...data, progress: 60 + Math.round((data.progress || 0) * 0.3) })
  )

  if (!parseResult.success) {
    return { success: false, error: parseResult.error || 'Message extraction failed.' }
  }

  const classified = parseResult.jsonData
  if (!classified) {
    return { success: false, error: 'Parser returned no data.' }
  }

  sendProgress(event, { step: 'done', progress: 100, message: 'Extraction complete.' })
  return {
    success: true,
    classified,
    messageCount: classified.total_count || 0,
    theirCount: classified.total_their_count || 0,
    warning: classified.total_their_count < 50
      ? `Only ${classified.total_their_count} messages from ${contactName}. Results may be less accurate.`
      : undefined,
  }
}

/**
 * Re-run WeChat decryption elevated via UAC (Windows only).
 * Uses PowerShell Start-Process -Verb RunAs so the user sees one UAC prompt.
 * Result is communicated via a temp JSON file (stdout is inaccessible cross-elevation).
 *
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} venvPython  - path to venv python binary
 * @param {string} decryptorScript - path to wechat_decryptor.py
 * @returns {Promise<{ success: boolean, output_dir?: string, error?: string }>}
 */
async function _decryptWeChatElevated(event, venvPython, decryptorScript) {
  const os = require('os')
  const fs = require('fs')
  const ds = require('../lib/dataStore')
  const tempOutput = path.join(os.tmpdir(), `wechat_result_${Date.now()}.json`)
  const decryptedDir = path.join(ds.paths().DATA_DIR, 'wechat-decrypted')

  // Build the inner PowerShell command and encode it as base64 UTF-16LE.
  // This avoids ALL quoting/escaping issues with paths that contain spaces or special chars.
  const sq = (s) => s.replace(/'/g, "''")   // single-quote escape for PS literal strings
  const innerCmd = [
    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
    `$env:PYTHONUTF8 = '1'`,
    `$env:PYTHONIOENCODING = 'utf-8'`,
    `& '${sq(venvPython)}' '${sq(decryptorScript)}' '--json-progress' '--output' '${sq(decryptedDir)}' '--output-file' '${sq(tempOutput)}'`,
  ].join('\n')
  const encodedCmd = Buffer.from(innerCmd, 'utf16le').toString('base64')

  sendProgress(event, { step: 'elevate', progress: 12, message: 'A UAC prompt appeared — click Yes to allow WeChat decryption.' })

  // Launch elevated PowerShell and wait for it to finish
  await new Promise((resolve) => {
    const child = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Start-Process powershell -ArgumentList '-NoProfile -EncodedCommand ${encodedCmd}' -Verb RunAs -Wait`,
    ], { stdio: 'ignore', env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } })
    child.on('close', resolve)
    child.on('error', resolve)
  })

  sendProgress(event, { step: 'elevate', progress: 75, message: 'Checking decryption result...' })

  if (!fs.existsSync(tempOutput)) {
    return { success: false, error: 'UAC prompt was cancelled or the decryptor could not start. Try using the "I already have a decrypted directory" option.' }
  }

  try {
    const result = JSON.parse(fs.readFileSync(tempOutput, 'utf-8'))
    try { fs.unlinkSync(tempOutput) } catch (_) { /* ignore */ }
    return result   // { success, output_dir }
  } catch (err) {
    return { success: false, error: `Failed to read decryption result: ${err.message}` }
  }
}

/**
 * Extract messages from iMessage (macOS only).
 */
async function _extractIMessage(event, contactHandle) {
  if (process.platform !== 'darwin') {
    return { success: false, error: 'iMessage extraction is only available on macOS.' }
  }

  // wechat_parser.py iMessage mode only needs stdlib — use system Python, no venv required
  const parserPython = await _getParserPython()
  if (!parserPython) {
    return { success: false, error: 'No compatible Python found. Please set up the environment.' }
  }
  const parserScript = path.join(SCRIPTS_DIR, 'wechat_parser.py')

  sendProgress(event, { step: 'parse', progress: 10, message: 'Reading iMessage database...' })
  const parseResult = await runPythonScript(
    parserPython,
    [parserScript, '--imessage', '--target', contactHandle, '--json-output'],
    (data) => sendProgress(event, data)
  )

  if (!parseResult.success) {
    return { success: false, error: parseResult.error || 'iMessage extraction failed.' }
  }

  const classified = parseResult.jsonData
  sendProgress(event, { step: 'done', progress: 100, message: 'Extraction complete.' })
  return {
    success: true,
    classified,
    messageCount: classified?.total_count || 0,
    theirCount: classified?.total_their_count || 0,
  }
}

/**
 * Returns the best available Python binary for running stdlib-only scripts.
 * Prefers venv python if ready, falls back to system Python.
 */
async function _getParserPython() {
  // Try venv python first (already set up)
  const venvPython = getVenvPythonBin(getChatImportEnvPath())
  const fs = require('fs')
  if (fs.existsSync(venvPython)) return venvPython
  // Fall back to system Python
  return getSystemPythonPath()
}

/**
 * Spawn a Python script and collect stdout/stderr.
 * Stdout lines that are valid JSON objects are parsed; the last one is treated
 * as the final result (for --json-output), and intermediate ones are forwarded
 * as progress (for --json-progress).
 *
 * @returns {Promise<{ success: boolean, jsonData?: object, output_dir?: string, error?: string }>}
 */
function runPythonScript(pythonBin, args, onProgress) {
  return new Promise((resolve) => {
    const child = spawn(pythonBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    })
    const stderrLines = []
    let lastJson = null
    let buffer = ''

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete line
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed)
          lastJson = parsed
          // If it has "step" and "progress", treat as progress event
          if (parsed.step !== undefined) {
            onProgress && onProgress(parsed)
          }
        } catch (_) {
          // Non-JSON stdout — ignore (human-readable output)
        }
      }
    })

    child.stderr.on('data', (chunk) => {
      stderrLines.push(chunk.toString())
    })

    child.on('close', (code) => {
      // Flush remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim())
          if (parsed.step !== undefined) onProgress && onProgress(parsed)
          lastJson = parsed
        } catch (_) { /* ignore */ }
      }

      if (code === 0) {
        resolve({
          success: true,
          jsonData: lastJson,
          output_dir: lastJson?.output_dir,
        })
      } else {
        // Prefer the JSON error message from stdout over raw stderr
        const jsonError = (lastJson?.step === 'error') ? lastJson.message : null
        resolve({
          success: false,
          error: jsonError || stderrLines.join('').trim() || `Python exited with code ${code}`,
        })
      }
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

function register() {
  // handlers registered at module load via ipcMain.handle above
}

module.exports = { register }
