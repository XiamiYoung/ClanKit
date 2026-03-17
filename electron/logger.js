const fs = require('fs')
const path = require('path')
const os = require('os')

// Fallback log dir used before DATA_DIR is known (early boot messages only).
// Redirected to DATA_DIR/logs via setLogDir() once main.js resolves the data path.
// Use OS temp dir instead of ~/.clankai to avoid creating stale directories.
let LOG_DIR = path.join(os.tmpdir(), 'clankai-logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

function logFile() {
  const d = new Date()
  const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return path.join(LOG_DIR, `clankai-${date}.log`)
}

function write(level, ...args) {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level.padEnd(5)}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`
  // Write to file
  try { fs.appendFileSync(logFile(), line, 'utf8') } catch {}
  // Also mirror to terminal
  if (level === 'ERROR') console.error(line.trimEnd())
  else if (level === 'WARN') console.warn(line.trimEnd())
  else console.log(line.trimEnd())
}

/**
 * Redirect log output to a new directory (called by main.js after DATA_DIR is resolved).
 * Ensures the directory exists, then switches all future log writes to it.
 */
function setLogDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  LOG_DIR = dir
}

const logger = {
  info:  (...args) => write('INFO',  ...args),
  warn:  (...args) => write('WARN',  ...args),
  error: (...args) => write('ERROR', ...args),
  debug: (...args) => write('DEBUG', ...args),
  agent: (...args) => write('AGENT', ...args),
  setLogDir,
}

module.exports = { logger, get LOG_DIR() { return LOG_DIR } }
