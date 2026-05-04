const path = require('path')
const fs = require('fs')

let cached = null

function pickEnv() {
  // Packaged builds are locked to prod — no runtime override allowed.
  try {
    const { app } = require('electron')
    if (app && app.isPackaged) return 'prod'
  } catch (_) { /* not in electron main */ }

  const explicit = (process.env.CLANKIT_ENV || '').toLowerCase()
  if (explicit === 'dev' || explicit === 'prod') return explicit
  if (process.env.ELECTRON_DEV === 'true') return 'dev'
  return 'prod'
}

function load() {
  if (cached) return cached

  const env = pickEnv()
  const filename = `build-config.${env}.json`

  const candidates = [
    path.join(__dirname, '..', filename),
    path.join(process.resourcesPath || '', 'app.asar', 'electron', filename),
    path.join(process.resourcesPath || '', 'app', 'electron', filename),
  ]

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        cached = JSON.parse(fs.readFileSync(p, 'utf-8'))
        cached._env = env
        return cached
      }
    } catch (_) { /* try next */ }
  }

  console.warn(`[buildConfig] Missing ${filename}; using empty config.`)
  cached = { _env: env }
  return cached
}

module.exports = { load }
