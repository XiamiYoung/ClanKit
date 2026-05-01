#!/usr/bin/env node
// One-time: update the built-in Clank agent's prompt + description in agents.db
// to the new productivity-focused version.
//
// Run from the project root with the actual DATA_DIR (or use platform default):
//   node scripts/update-clank-builtin-prompt.js [DATA_DIR]
//
// Idempotent: re-running is safe (it overwrites with the i18n template values).
// Only modifies the row with id='__default_system__'. Skips if not present.

const path = require('node:path')
const fs = require('node:fs')

function defaultDataDir() {
  if (process.env.CLANKIT_DATA_PATH) return process.env.CLANKIT_DATA_PATH
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || `${process.env.USERPROFILE}/AppData/Roaming`, 'clankit', 'data')
  }
  return path.join(process.env.HOME || '~', '.config', 'clankit', 'data')
}

function loadI18nClankFields() {
  // Load the i18n module via require so we don't have to parse the JS by hand.
  // The file is ESM but uses default export shape — read it as a module.
  // Easier path: read file as text and extract the relevant strings via regex.
  const i18nPath = path.join(__dirname, '..', 'src', 'i18n', 'index.js')
  const src = fs.readFileSync(i18nPath, 'utf8')

  function extractBacktickTemplate(label) {
    // Find: <label>: `...multi-line template...`
    const re = new RegExp(`${label}:\\s*\`([\\s\\S]*?)\``, 'g')
    const out = []
    let m
    while ((m = re.exec(src)) !== null) out.push(m[1])
    return out
  }
  function extractSingleQuoteValue(label) {
    // Find: <label>: '...single-line value...'
    const re = new RegExp(`${label}:\\s*'((?:\\\\.|[^'\\\\])*)'`, 'g')
    const out = []
    let m
    while ((m = re.exec(src)) !== null) out.push(m[1])
    return out
  }

  const prompts = extractBacktickTemplate('builtinClankPrompt')
  const descs = extractSingleQuoteValue('builtinClankDescription')

  // Convention in src/i18n/index.js: en block first (~line 919), then zh (~line 3581).
  // We use the en variant for the DB (ClanKit stores a single prompt; runtime
  // language switching happens via the OUTPUT LANGUAGE HARD RULE in the prompt
  // builder, not via per-agent prompt swap).
  if (prompts.length === 0) throw new Error('Could not find builtinClankPrompt in src/i18n/index.js')

  // Heuristic: pick the variant matching the system locale. Default to en.
  // For simplicity, write the EN version. The OUTPUT LANGUAGE rule in
  // systemPromptBuilder.js translates output to user's config.language anyway.
  return {
    prompt: prompts[0],
    description: descs[0] || '',
  }
}

function main() {
  const dataDir = process.argv[2] || defaultDataDir()
  const dbPath = path.join(dataDir, 'agents.db')
  if (!fs.existsSync(dbPath)) {
    console.error(`agents.db not found at ${dbPath}`)
    process.exit(1)
  }

  let Database
  try {
    Database = require('better-sqlite3')
  } catch (e) {
    console.error('better-sqlite3 not loadable. Run from a node version that matches the install, or use Electron node:')
    console.error('  npx electron-rebuild -f -w better-sqlite3')
    console.error('Detail:', e.message)
    process.exit(1)
  }

  const { prompt, description } = loadI18nClankFields()

  const db = new Database(dbPath)
  try {
    const row = db.prepare("SELECT id, prompt, description FROM agents WHERE id = ?").get('__default_system__')
    if (!row) {
      console.error('No __default_system__ row in agents.db. Has the app been started yet?')
      process.exit(1)
    }
    if (row.prompt === prompt && row.description === description) {
      console.log('Clank prompt + description already match the i18n template. No change.')
      return
    }
    const stmt = db.prepare("UPDATE agents SET prompt = ?, description = ?, updated_at = ? WHERE id = ?")
    const info = stmt.run(prompt, description, Date.now(), '__default_system__')
    console.log(`Updated Clank (rows changed: ${info.changes}). Restart the app to see the new prompt take effect.`)
    console.log(`  prompt:      ${prompt.length} chars`)
    console.log(`  description: ${description.length} chars`)
  } finally {
    db.close()
  }
}

if (require.main === module) {
  main()
}

module.exports = { loadI18nClankFields }
