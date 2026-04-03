// electron/agent/voice/pythonManager.js
// Finds or downloads a compatible Python (3.10–3.12) for the local voice environment.
// Uses python-build-standalone (by Astral/indygreg) — full portable Python, no install needed.

const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const https = require('https')
const { logger } = require('../logger')

// Portable Python version to download if no system Python is suitable
const PY_VERSION = '3.11.10'
const PY_TAG = '20241016'

function _downloadUrl() {
  const base = `https://github.com/indygreg/python-build-standalone/releases/download/${PY_TAG}`
  const p = process.platform
  const a = process.arch
  if (p === 'win32')  return `${base}/cpython-${PY_VERSION}+${PY_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz`
  if (p === 'darwin' && a === 'arm64') return `${base}/cpython-${PY_VERSION}+${PY_TAG}-aarch64-apple-darwin-install_only_stripped.tar.gz`
  if (p === 'darwin')  return `${base}/cpython-${PY_VERSION}+${PY_TAG}-x86_64-apple-darwin-install_only_stripped.tar.gz`
  // Linux x64
  return `${base}/cpython-${PY_VERSION}+${PY_TAG}-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz`
}

/** Check if a Python binary is compatible (3.10–3.12) AND functional (can run venv + pip). */
async function _checkPython(pythonPath) {
  // Step 1: version check
  const versionOk = await new Promise((resolve) => {
    execFile(pythonPath, ['--version'], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) return resolve(null)
      const match = (stdout || stderr || '').match(/Python\s+(3\.(\d+)\.\d+)/)
      if (!match) return resolve(null)
      const minor = parseInt(match[2], 10)
      if (minor < 10 || minor > 12) return resolve(null)
      resolve(match[1])
    })
  })
  if (!versionOk) return { ok: false }

  // Step 2: verify Python can actually run `python -m pip` and `python -m venv`
  // Stripped-down installs (e.g. uv-managed) pass --version but crash on -m pip/venv
  // because runpy or other stdlib modules are broken/missing.
  const pipOk = await new Promise((resolve) => {
    execFile(pythonPath, ['-m', 'pip', '--version'], { timeout: 8000 }, (err) => resolve(!err))
  })
  if (!pipOk) {
    logger.info(`[pythonManager] Python ${versionOk} at ${pythonPath}: "python -m pip" failed, skipping`)
    return { ok: false }
  }
  const venvOk = await new Promise((resolve) => {
    execFile(pythonPath, ['-m', 'venv', '--help'], { timeout: 5000 }, (err) => resolve(!err))
  })
  if (!venvOk) {
    logger.info(`[pythonManager] Python ${versionOk} at ${pythonPath}: "python -m venv" failed, skipping`)
    return { ok: false }
  }

  return { ok: true, version: versionOk }
}

/**
 * Find a compatible system Python (3.10–3.12).
 * Returns the path or null.
 */
async function findSystemPython() {
  const candidates = process.platform === 'win32'
    ? ['python3.12', 'python3.11', 'python3.10', 'python', 'python3', 'py -3.12', 'py -3.11', 'py -3.10']
    : ['python3.12', 'python3.11', 'python3.10', 'python3', 'python']

  for (const cmd of candidates) {
    const parts = cmd.split(' ')
    const result = await _checkPython(parts[0])
    if (result.ok) {
      logger.info(`[pythonManager] Found system Python ${result.version}: ${cmd}`)
      return { path: parts[0], version: result.version }
    }
  }
  return null
}

/**
 * Get the path to the portable Python bundled in dataDir.
 * Returns the path if it exists and is compatible, null otherwise.
 */
async function getPortablePython(dataDir) {
  const pyDir = path.join(dataDir, 'python311')
  const pyBin = process.platform === 'win32'
    ? path.join(pyDir, 'python', 'python.exe')
    : path.join(pyDir, 'python', 'bin', 'python3')

  if (!fs.existsSync(pyBin)) return null
  const result = await _checkPython(pyBin)
  if (result.ok) return { path: pyBin, version: result.version }
  return null
}

/**
 * Download portable Python to dataDir/python311/.
 * @param {string} dataDir
 * @param {function} onProgress - (percent, message) callback
 * @returns {Promise<string>} path to python binary
 */
async function downloadPortablePython(dataDir, onProgress = () => {}) {
  const pyDir = path.join(dataDir, 'python311')
  const tarPath = path.join(dataDir, 'python311.tar.gz')

  // Clean up any previous failed download
  if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath)

  const url = _downloadUrl()
  onProgress(0, `Downloading Python ${PY_VERSION}...`)
  logger.info(`[pythonManager] Downloading ${url}`)

  // Download with progress (follows redirects)
  await _download(url, tarPath, (pct) => {
    onProgress(Math.round(pct * 0.7), `Downloading Python ${PY_VERSION}... ${Math.round(pct)}%`)
  })

  onProgress(70, 'Extracting Python...')
  logger.info(`[pythonManager] Extracting to ${pyDir}`)

  // Ensure target dir exists
  if (fs.existsSync(pyDir)) fs.rmSync(pyDir, { recursive: true, force: true })
  fs.mkdirSync(pyDir, { recursive: true })

  // Extract using system tar (available on Windows 10+, macOS, Linux)
  await new Promise((resolve, reject) => {
    execFile('tar', ['xzf', tarPath, '-C', pyDir], { timeout: 120000 }, (err) => {
      if (err) return reject(new Error(`tar extract failed: ${err.message}`))
      resolve()
    })
  })

  // Clean up tar file
  try { fs.unlinkSync(tarPath) } catch {}

  onProgress(90, 'Verifying Python...')

  const pyBin = process.platform === 'win32'
    ? path.join(pyDir, 'python', 'python.exe')
    : path.join(pyDir, 'python', 'bin', 'python3')

  if (!fs.existsSync(pyBin)) {
    throw new Error(`Python binary not found after extraction: ${pyBin}`)
  }

  const check = await _checkPython(pyBin)
  if (!check.ok) {
    throw new Error(`Downloaded Python is not compatible: ${check.version || 'unknown'}`)
  }

  onProgress(100, `Python ${check.version} ready.`)
  logger.info(`[pythonManager] Portable Python ready: ${pyBin}`)
  return { path: pyBin, version: check.version }
}

/**
 * Get a usable Python: system Python 3.10-3.12, portable Python, or download one.
 * @param {string} dataDir
 * @param {function} onProgress
 * @returns {Promise<{path: string, version: string}>}
 */
async function ensurePython(dataDir, onProgress = () => {}) {
  // 1. Check for existing portable Python (fastest)
  const portable = await getPortablePython(dataDir)
  if (portable) {
    onProgress(100, `Using Python ${portable.version}`)
    return portable
  }

  // 2. Check for compatible system Python
  const system = await findSystemPython()
  if (system) {
    onProgress(100, `Using system Python ${system.version}`)
    return system
  }

  // 3. Download portable Python
  onProgress(0, 'No compatible Python found. Downloading...')
  return downloadPortablePython(dataDir, onProgress)
}

/** Download a file with redirect support and progress. */
function _download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const request = (u) => {
      https.get(u, { headers: { 'User-Agent': 'ClankAI' } }, (res) => {
        // Handle redirects (GitHub uses 301/302)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location)
        }
        if (res.statusCode !== 200) {
          file.close()
          fs.unlinkSync(dest)
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`))
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let downloaded = 0
        res.on('data', (chunk) => {
          downloaded += chunk.length
          if (total > 0) onProgress((downloaded / total) * 100)
        })
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', (err) => { fs.unlinkSync(dest); reject(err) })
      }).on('error', (err) => { file.close(); fs.unlinkSync(dest); reject(err) })
    }
    request(url)
  })
}

module.exports = { ensurePython, findSystemPython, getPortablePython }
