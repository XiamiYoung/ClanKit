/**
 * Compile Electron main-process JS files to V8 bytecode (.jsc) using bytenode.
 *
 * Usage:
 *   node scripts/compile-bytecode.js            # compile (backup originals first)
 *   node scripts/compile-bytecode.js --restore   # restore originals from backup
 *
 * What it does:
 *   1. Backs up electron/ to electron/.backup/
 *   2. Compiles each .js → .jsc via bytenode
 *   3. Deletes the .js source (require() resolves .jsc via bytenode hook)
 *   4. Prepends require('bytenode') to main.js so the hook is active at startup
 *
 * Excluded from compilation:
 *   - electron/main.js            (entry point, must stay as JS)
 *   - electron/preload.js         (loaded by Electron internally)
 *   - electron/drawio-preload.js  (loaded by Electron internally)
 *   - **\/__tests__/**            (test files, not shipped)
 *   - *.mjs                       (ES modules, incompatible with bytenode)
 */

const fs = require('fs')
const path = require('path')
const bytenode = require('bytenode')

const ELECTRON_DIR = path.resolve(__dirname, '..', 'electron')
const BACKUP_DIR = path.join(ELECTRON_DIR, '.backup')

const EXCLUDE = new Set([
  path.join(ELECTRON_DIR, 'main.js'),
  path.join(ELECTRON_DIR, 'preload.js'),
  path.join(ELECTRON_DIR, 'drawio-preload.js'),
])

function isExcluded(filePath) {
  if (EXCLUDE.has(filePath)) return true
  if (filePath.includes('__tests__')) return true
  if (filePath.endsWith('.mjs')) return true
  return false
}

function collectJsFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.name === '.backup' || entry.name === 'node_modules') continue
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.js') && !isExcluded(full)) {
      results.push(full)
    }
  }
  return results
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.backup') continue
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyRecursive(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}

function restoreRecursive(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
      restoreRecursive(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}

// ── Restore mode ────────────────────────────────────────────────────────────

if (process.argv.includes('--restore')) {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('[bytecode] No backup found, nothing to restore.')
    process.exit(0)
  }

  // Remove .jsc files that were created
  const jscFiles = collectJscFiles(ELECTRON_DIR)
  for (const f of jscFiles) {
    fs.unlinkSync(f)
  }

  // Restore originals
  restoreRecursive(BACKUP_DIR, ELECTRON_DIR)
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true })

  // Remove the require('bytenode') line from main.js
  const mainJs = path.join(ELECTRON_DIR, 'main.js')
  let mainContent = fs.readFileSync(mainJs, 'utf-8')
  mainContent = mainContent.replace("require('bytenode');\n", '')
  fs.writeFileSync(mainJs, mainContent)

  console.log('[bytecode] Restored original source files.')
  process.exit(0)
}

function collectJscFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.name === '.backup' || entry.name === 'node_modules') continue
    if (entry.isDirectory()) {
      results.push(...collectJscFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.jsc')) {
      results.push(full)
    }
  }
  return results
}

// ── Compile mode ────────────────────────────────────────────────────────────

async function compile() {
  const files = collectJsFiles(ELECTRON_DIR)
  console.log(`[bytecode] Found ${files.length} files to compile.`)

  // Step 1: Backup (skip if already compiled — prevents overwriting good backup)
  if (files.length === 0) {
    console.log('[bytecode] No .js files to compile (already compiled?). Run --restore first.')
    process.exit(0)
  }
  if (fs.existsSync(BACKUP_DIR)) {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
  }
  console.log('[bytecode] Backing up electron/ ...')
  copyRecursive(ELECTRON_DIR, BACKUP_DIR)

  // Step 2: Compile each file
  let compiled = 0
  let failed = 0

  for (const filePath of files) {
    const rel = path.relative(ELECTRON_DIR, filePath)
    try {
      await bytenode.compileFile({ filename: filePath })
      // Delete the .js source — bytenode hook resolves .jsc
      fs.unlinkSync(filePath)
      compiled++
      process.stdout.write(`  ✓ ${rel}\n`)
    } catch (err) {
      failed++
      process.stdout.write(`  ✗ ${rel}: ${err.message}\n`)
    }
  }

  // Step 3: Add require('bytenode') to main.js
  const mainJs = path.join(ELECTRON_DIR, 'main.js')
  let mainContent = fs.readFileSync(mainJs, 'utf-8')
  if (!mainContent.includes("require('bytenode')")) {
    mainContent = "require('bytenode');\n" + mainContent
    fs.writeFileSync(mainJs, mainContent)
    console.log('[bytecode] Added require(\'bytenode\') to main.js')
  }

  console.log(`\n[bytecode] Done: ${compiled} compiled, ${failed} failed.`)

  if (failed > 0) {
    console.error('[bytecode] Some files failed to compile. Run --restore to undo.')
    process.exit(1)
  }
}

compile().catch(err => {
  console.error('[bytecode] Fatal error:', err)
  process.exit(1)
})
