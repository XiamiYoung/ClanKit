const fs = require('fs')
const path = require('path')
const os = require('os')

// Fallback log dir used before DATA_DIR is known (early boot messages only).
// Redirected to DATA_DIR/logs via setLogDir() once main.js resolves the data path.
// Use OS temp dir to avoid creating stale directories before DATA_DIR is known.
let LOG_DIR = path.join(os.tmpdir(), 'clankai-logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

const LEVEL_PRIORITY = { DEBUG: 0, AGENT: 1, INFO: 2, WARN: 3, ERROR: 4 }
let minLevel = LEVEL_PRIORITY.AGENT // default: show AGENT and above, skip DEBUG

function logFile() {
  const d = new Date()
  const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return path.join(LOG_DIR, `clankai-${date}.log`)
}

function write(level, ...args) {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level.padEnd(5)}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`
  // Always write to file
  try { fs.appendFileSync(logFile(), line, 'utf8') } catch {}
  // Mirror to terminal only if level meets threshold
  if ((LEVEL_PRIORITY[level] ?? 2) < minLevel) return
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
  /** Set minimum terminal log level: 'DEBUG' | 'AGENT' | 'INFO' | 'WARN' | 'ERROR' */
  setLevel(lvl) { minLevel = LEVEL_PRIORITY[lvl] ?? LEVEL_PRIORITY.INFO },
}

module.exports = { logger, get LOG_DIR() { return LOG_DIR } }
