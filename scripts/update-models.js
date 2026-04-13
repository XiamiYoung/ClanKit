/**
 * Download the latest LiteLLM model catalog and clear the stale flag.
 * Cross-platform (Windows/macOS/Linux).
 * Usage: npm run update-models
 */
const fs = require('fs')
const path = require('path')

const OUT_FILE = path.join(__dirname, '..', 'electron', 'data', 'litellm-models.json')
const STALE_FLAG = path.join(__dirname, '..', '.models-stale')
const REMOTE_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

async function main() {
  console.log('[update-models] downloading latest litellm-models.json ...')
  try {
    const resp = await fetch(REMOTE_URL, { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const text = await resp.text()
    // Validate JSON
    JSON.parse(text)
    fs.writeFileSync(OUT_FILE, text, 'utf8')
    console.log(`[update-models] saved to ${path.relative(process.cwd(), OUT_FILE)} (${(text.length / 1024).toFixed(0)} KB)`)
  } catch (e) {
    console.error(`\x1b[31m[update-models] ERROR: ${e.message}\x1b[0m`)
    process.exit(1)
  }

  // Clear stale flag
  try { fs.unlinkSync(STALE_FLAG) } catch (_) {}
  console.log('\x1b[32m[update-models] Done ✓\x1b[0m')
}

main()
