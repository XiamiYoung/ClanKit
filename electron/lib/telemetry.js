const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const SIGNING_SALT = 'clankai-t3l3m-2026-sg'
const TELEMETRY_ENDPOINT = '' // Set after terraform apply, e.g. https://xxx.execute-api.ap-southeast-1.amazonaws.com/install

/**
 * Get or create a persistent machine fingerprint hash.
 * Uses OS-level hardware identifiers, hashed with SHA-256.
 */
function getMachineHash() {
  const os = require('os')
  const parts = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || '',
    os.totalmem().toString(),
    // Network MAC address (first non-internal interface)
    ...Object.values(os.networkInterfaces())
      .flat()
      .filter(i => !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
      .map(i => i.mac)
      .slice(0, 2),
  ]
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex')
}

/**
 * Derive HMAC signing key from app version + salt.
 * Must match the server-side derivation in handler.py.
 */
function deriveKey(appVersion) {
  return crypto.createHash('sha256').update(`${appVersion}|${SIGNING_SALT}|clank`).digest('hex')
}

/**
 * Sign the telemetry request payload with HMAC-SHA256.
 */
function signPayload(machineHash, appVersion, timestamp) {
  const key = deriveKey(appVersion)
  const payload = `${machineHash}|${appVersion}|${timestamp}`
  return crypto.createHmac('sha256', key).update(payload).digest('hex')
}

/**
 * Send anonymous installation ping. Only runs once per machine.
 * Writes a marker file on success so subsequent launches skip the call.
 * Retries up to 2 times with 5s delay on failure.
 */
async function sendInstallPing() {
  if (!TELEMETRY_ENDPOINT) return

  const dataStore = require('./dataStore')

  // Check if user disabled telemetry
  try {
    const config = dataStore.readJSON(dataStore.paths().CONFIG_FILE, {})
    if (config.telemetryOptOut) return
  } catch (_) { /* proceed if config can't be read */ }

  // Skip if already sent successfully
  const markerPath = path.join(dataStore.paths().SETTINGS_DIR, '.telemetry_sent')
  if (fs.existsSync(markerPath)) return

  const appVersion = app.getVersion()
  const machineHash = getMachineHash()

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 5000))

    const timestamp = Math.floor(Date.now() / 1000)
    const signature = signPayload(machineHash, appVersion, timestamp)

    try {
      const res = await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineHash, appVersion, timestamp, signature }),
        signal: AbortSignal.timeout(10000),
      })
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
