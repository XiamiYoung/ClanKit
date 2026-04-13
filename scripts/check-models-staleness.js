/**
 * Dev-time check: compare local litellm-models.json against remote.
 * Writes .models-stale flag if content differs.
 * Runs once during `npm run dev` then exits.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const LOCAL_FILE = path.join(__dirname, '..', 'electron', 'data', 'litellm-models.json')
const STALE_FLAG = path.join(__dirname, '..', '.models-stale')
const REMOTE_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function main() {
  // 1. Read local file
  if (!fs.existsSync(LOCAL_FILE)) {
    console.error('\x1b[31m[check-models] ERROR: electron/data/litellm-models.json not found. Run: npm run update-models\x1b[0m')
    fs.writeFileSync(STALE_FLAG, 'missing', 'utf8')
    process.exit(0)
  }
  const localBuf = fs.readFileSync(LOCAL_FILE)
  const localHash = sha256(localBuf)
  console.log(`[check-models] local sha256: ${localHash}`)

  // 2. Fetch remote
  let remoteBuf
  try {
    const resp = await fetch(REMOTE_URL, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    remoteBuf = Buffer.from(await resp.arrayBuffer())
  } catch (e) {
    console.error(`\x1b[31m[check-models] ERROR: failed to fetch remote — ${e.message}\x1b[0m`)
    process.exit(0)
  }
  const remoteHash = sha256(remoteBuf)
  console.log(`[check-models] remote sha256: ${remoteHash}`)

  // 3. Compare
  if (localHash === remoteHash) {
    console.log('\x1b[32m[check-models] litellm-models.json is up to date ✓\x1b[0m')
    // Remove stale flag if it exists from a previous run
    if (fs.existsSync(STALE_FLAG)) fs.unlinkSync(STALE_FLAG)
  } else {
    console.warn('\x1b[33m[check-models] litellm-models.json is OUTDATED — run: npm run update-models\x1b[0m')
    fs.writeFileSync(STALE_FLAG, `local=${localHash}\nremote=${remoteHash}\n`, 'utf8')
  }
}

main()
