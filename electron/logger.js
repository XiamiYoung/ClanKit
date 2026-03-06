const fs = require('fs')
const path = require('path')
const os = require('os')

const LOG_DIR = path.join(os.homedir(), '.clankAI', 'logs')
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

const logger = {
  info:  (...args) => write('INFO',  ...args),
  warn:  (...args) => write('WARN',  ...args),
  error: (...args) => write('ERROR', ...args),
  debug: (...args) => write('DEBUG', ...args),
  agent: (...args) => write('AGENT', ...args),
}

module.exports = { logger, LOG_DIR }
