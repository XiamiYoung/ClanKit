#!/usr/bin/env node
/**
 * One-time migration: legacy {DATA_DIR}/souls/{type}/{id}.md files → SQLite SoulStore.
 *
 * Per LESSONS.md, this lives in scripts/ rather than source code so it doesn't
 * pollute the runtime path. Run once after upgrading; subsequent runs are
 * idempotent (deterministic IDs ensure existing rows are not duplicated).
 *
 * Usage:
 *   node scripts/migrate-souls-to-sqlite.js [--dry-run] [--data-dir <path>]
 *
 * What it does:
 *   1. Locate {DATA_DIR}/souls/system/*.md and {DATA_DIR}/souls/users/*.md
 *   2. Parse each via the same soulMarkdown adapter used at runtime
 *   3. Insert rows into {DATA_DIR}/memory/souls.db (creating it if absent)
 *   4. Source = 'migration', deterministic IDs (idempotent)
 *   5. Backs up each .md to .md.bak before any DB mutation. Originals are NOT
 *      deleted — they remain on disk as a safety net. Delete manually if/when
 *      you've verified everything works.
 *
 * Notes:
 *   - The script doesn't depend on Electron's app.getPath. It defaults to the
 *     standard Roaming/clankai/data path on Windows but accepts --data-dir for
 *     custom locations.
 *   - This must run with the SAME Node version Electron uses (NODE_MODULE_VERSION
 *     must match better-sqlite3's binding). On Windows the safest invocation is
 *     to run from inside the Electron app's "Open data folder" terminal, or to
 *     temporarily `npm rebuild better-sqlite3` for local Node first (and rebuild
 *     back for Electron after). The script prints a clear error if the binding
 *     can't load.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const dataDirIdx = args.indexOf('--data-dir')
let dataDir = dataDirIdx >= 0 ? args[dataDirIdx + 1] : null

if (!dataDir) {
  // Default: same logic as electron/lib/dataStore.js → app.getPath('appData')/clankai/data
  if (process.platform === 'win32') {
    dataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'clankai', 'data')
  } else if (process.platform === 'darwin') {
    dataDir = path.join(os.homedir(), 'Library', 'Application Support', 'clankai', 'data')
  } else {
    dataDir = path.join(os.homedir(), '.config', 'clankai', 'data')
  }
  // Honor settings.json override if present
  try {
    const settingsPath = process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Roaming', 'clankai', 'settings.json')
      : path.join(path.dirname(dataDir), 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      if (s.dataDir && typeof s.dataDir === 'string') dataDir = s.dataDir
      else if (s.dataPath && typeof s.dataPath === 'string') dataDir = s.dataPath
    }
  } catch {}
}

const SOULS_DIR  = path.join(dataDir, 'souls')
const MEMORY_DIR = path.join(dataDir, 'memory')

console.log('=== ClankAI souls migration ===')
console.log('Data dir:    ', dataDir)
console.log('Souls dir:   ', SOULS_DIR)
console.log('Memory dir:  ', MEMORY_DIR)
console.log('Dry run:     ', dryRun ? 'YES (no DB writes, no backups)' : 'no')
console.log()

if (!fs.existsSync(SOULS_DIR)) {
  console.log('No souls/ directory found — nothing to migrate. Exit.')
  process.exit(0)
}

// ── Load adapter + store ────────────────────────────────────────────────────
const projectRoot = path.resolve(__dirname, '..')
const soulMarkdown = require(path.join(projectRoot, 'electron', 'memory', 'soulMarkdown'))
const { SoulStore } = require(path.join(projectRoot, 'electron', 'memory', 'soulStore'))

let store = null
if (!dryRun) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true })
  try {
    store = new SoulStore({
      dbPath: path.join(MEMORY_DIR, 'souls.db'),
      vecDir: path.join(MEMORY_DIR, 'souls-vec'),
    })
  } catch (err) {
    console.error('Failed to open SoulStore:', err.message)
    if (err.code === 'ERR_DLOPEN_FAILED' || err.message.includes('NODE_MODULE_VERSION')) {
      console.error('\nbetter-sqlite3 native binding mismatch. The binding is compiled for')
      console.error('a different Node.js version. Run `npm rebuild better-sqlite3` against')
      console.error("Electron's Node version, then try again. See the script header for details.")
    }
    process.exit(2)
  }
}

// ── Walk souls/{type}/*.md ──────────────────────────────────────────────────

const stats = {
  agents: 0,
  rows: 0,
  inserted: 0,
  skipped: 0,
  empty: 0,
  errors: 0,
}

for (const type of ['system', 'users']) {
  const dir = path.join(SOULS_DIR, type)
  if (!fs.existsSync(dir)) continue

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
  console.log(`\n[${type}] ${files.length} .md file(s) found`)

  for (const file of files) {
    const agentId = file.replace(/\.md$/, '')
    const filePath = path.join(dir, file)
    let content
    try {
      content = fs.readFileSync(filePath, 'utf8')
    } catch (err) {
      console.error(`  ✗ ${file} — read failed: ${err.message}`)
      stats.errors++
      continue
    }

    if (!content.trim()) {
      console.log(`  · ${file} — empty, skipped`)
      stats.empty++
      continue
    }

    let parsed
    try {
      parsed = soulMarkdown.parseMarkdownToRows(content, agentId, type, {
        source: 'migration',
        timestamp: Date.now(),
        deterministic: true,
      })
    } catch (err) {
      console.error(`  ✗ ${file} — parse failed: ${err.message}`)
      stats.errors++
      continue
    }

    const rows = parsed.rows
    stats.agents++
    stats.rows += rows.length

    if (dryRun) {
      console.log(`  · ${file} — would insert ${rows.length} rows (agent_name=${parsed.agentName || '?'})`)
      continue
    }

    try {
      // Backup .md before any state change
      const bakPath = filePath + '.bak'
      if (!fs.existsSync(bakPath)) fs.copyFileSync(filePath, bakPath)

      store.upsertMeta(agentId, type, parsed.agentName)
      const result = store.bulkInsert(rows)
      stats.inserted += result.inserted
      stats.skipped += result.skipped
      console.log(`  ✓ ${file} — inserted ${result.inserted}, skipped ${result.skipped}`)
    } catch (err) {
      console.error(`  ✗ ${file} — bulk insert failed: ${err.message}`)
      stats.errors++
    }
  }
}

console.log('\n=== Summary ===')
console.log(`Agents processed: ${stats.agents}`)
console.log(`Rows parsed:      ${stats.rows}`)
if (!dryRun) {
  console.log(`Rows inserted:    ${stats.inserted}`)
  console.log(`Rows skipped:     ${stats.skipped} (already present)`)
}
console.log(`Empty files:      ${stats.empty}`)
console.log(`Errors:           ${stats.errors}`)

if (store) {
  try { store.close() } catch {}
}

if (stats.errors > 0) process.exit(1)
process.exit(0)
