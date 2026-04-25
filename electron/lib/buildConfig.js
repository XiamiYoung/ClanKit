const path = require('path')
const fs = require('fs')

let cached = null

function load() {
  if (cached) return cached

  const candidates = [
    path.join(__dirname, '..', 'build-config.json'),
    path.join(process.resourcesPath || '', 'app.asar', 'electron', 'build-config.json'),
    path.join(process.resourcesPath || '', 'app', 'electron', 'build-config.json'),
  ]

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        cached = JSON.parse(fs.readFileSync(p, 'utf-8'))
        return cached
      }
    } catch (_) { /* try next */ }
  }

  cached = {}
  return cached
}

module.exports = { load }
