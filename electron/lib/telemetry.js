const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app } = require('electron')

// Must match the `signing_salt` field in the AWS Secrets Manager bundle
// (see iac/configs/382888552944.yaml clankit_secrets.keys).
const SIGNING_SALT = 'clankai-t3l3m-2026-sg'

function getTelemetryEndpoint(action) {
  const { load } = require('./buildConfig')
  const base = load().apiBaseUrl
  return base ? `${base.replace(/\/$/, '')}/telemetry/${action}` : ''
}

function getMachineHash() {
  const parts = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || '',
    os.totalmem().toString(),
    ...Object.values(os.networkInterfaces())
      .flat()
      .filter(i => !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
      .map(i => i.mac)
      .slice(0, 2),
  ]
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex')
}

function signBody(rawBody) {
  return crypto.createHmac('sha256', SIGNING_SALT).update(rawBody).digest('hex')
}

async function postSigned(endpoint, payload) {
  const rawBody = JSON.stringify(payload)
  const signature = signBody(rawBody)
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
    body: rawBody,
    signal: AbortSignal.timeout(10000),
  })
}

/**
 * Send anonymous installation ping. Only runs once per machine.
 * Writes a marker file on success so subsequent launches skip the call.
 * Retries up to 2 times with 5s delay on failure.
 */
async function sendInstallPing() {
  const endpoint = getTelemetryEndpoint('install')
  if (!endpoint) return

  const dataStore = require('./dataStore')

  try {
    const config = dataStore.readJSON(dataStore.paths().CONFIG_FILE, {})
    if (config.telemetryOptOut) return
  } catch (_) { /* proceed if config can't be read */ }

  const markerPath = path.join(dataStore.paths().SETTINGS_DIR, '.telemetry_sent')
  if (fs.existsSync(markerPath)) return

  const payload = {
    machine_hash: getMachineHash(),
    app_version: app.getVersion(),
    platform: os.platform(),
    timestamp: String(Math.floor(Date.now() / 1000)),
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 5000))

    try {
      const res = await postSigned(endpoint, payload)
      const data = await res.json()
      if (data.status === 'ok' || data.status === 'exists') {
        fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8')
        console.log('[telemetry] Installation recorded')
        return
      }
    } catch (_) {
      // Retry on next iteration
    }
  }
}

module.exports = { sendInstallPing, getMachineHash }
