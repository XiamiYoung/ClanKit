'use strict'

/**
 * setup.js — manages the chat-import Python virtual environment.
 * Uses the shared portable Python from electron/lib/pythonManager.js.
 *
 * Venv location: {DATA_DIR}/chat-import-env/
 * Packages: pycryptodome psutil
 * Note: pymem is no longer required. WeChat 4.x (Weixin.exe) uses ctypes
 * for memory access — no third-party library needed.
 */

const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { ensurePython } = require('../../lib/pythonManager')
const ds = require('../../lib/dataStore')

const VENV_DEPS = ['pycryptodome', 'psutil']
const VENV_DEPS_WIN = ['pycryptodome', 'psutil']

function getChatImportEnvPath() {
  return path.join(ds.paths().DATA_DIR, 'chat-import-env')
}

/**
 * Returns the path to the Python binary inside the venv.
 */
function getVenvPythonBin(envPath) {
  if (process.platform === 'win32') {
    return path.join(envPath, 'Scripts', 'python.exe')
  }
  return path.join(envPath, 'bin', 'python3')
}

/**
 * Returns true if the venv exists and all required packages are importable.
 * On Windows this includes pymem (needed for WeChat memory extraction).
 */
async function isEnvReady() {
  const envPath = getChatImportEnvPath()
  const pythonBin = getVenvPythonBin(envPath)
  if (!fs.existsSync(pythonBin)) return false

  const checkCode = 'import Crypto'

  return new Promise((resolve) => {
    const child = spawn(pythonBin, ['-c', checkCode], { stdio: 'ignore' })
    child.on('close', code => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

/**
 * Set up the chat-import venv if not already ready.
 * @param {function} onProgress - (payload: { step, progress, message }) => void
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function setupChatImportEnv(onProgress) {
  const emit = (step, progress, message) => {
    onProgress && onProgress({ step, progress, message })
  }

  try {
    emit('python', 5, 'Locating Python interpreter...')
    const dataDir = ds.paths().DATA_DIR
    // ensurePython callback receives (progress: number, message: string)
    const pyResult = await ensurePython(dataDir, (pct, msg) => emit('python', Math.round(5 + pct * 0.2), msg))
    const pythonExe = pyResult.path   // extract path string from { path, version }

    const envPath = getChatImportEnvPath()
    emit('venv', 30, 'Creating virtual environment...')

    await runCommand(pythonExe, ['-m', 'venv', envPath])

    const pip = getVenvPythonBin(envPath)
    const deps = process.platform === 'win32' ? VENV_DEPS_WIN : VENV_DEPS

    emit('pip', 50, `Installing packages: ${deps.join(', ')}...`)
    await runCommand(pip, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet'])
    await runCommand(pip, ['-m', 'pip', 'install', ...deps, '--quiet'])

    emit('done', 100, 'Chat import environment ready.')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Run a command and return a promise that resolves/rejects on exit.
 */
function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    })
    const errLines = []
    child.stderr.on('data', d => errLines.push(d.toString()))
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(errLines.join('').trim() || `Exit code ${code}`))
    })
    child.on('error', reject)
  })
}

/**
 * Get the best available system Python path (no venv required).
 * Used for scripts that only need stdlib (wechat_parser.py, iMessage).
 * @returns {Promise<string|null>}
 */
async function getSystemPythonPath() {
  const { findSystemPython, getPortablePython } = require('../../lib/pythonManager')
  const dataDir = ds.paths().DATA_DIR
  const portable = await getPortablePython(dataDir)
  if (portable) return portable.path
  const system = await findSystemPython()
  return system ? system.path : null
}

module.exports = {
  getChatImportEnvPath,
  getVenvPythonBin,
  isEnvReady,
  setupChatImportEnv,
  getSystemPythonPath,
}
