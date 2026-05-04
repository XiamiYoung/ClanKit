const fs = require('node:fs')
const path = require('node:path')

const MAX_ENTRIES = 50
const MAX_DEPTH = 2
const RECENT_DAYS = 7
const RECENT_TOP = 10
const IGNORE_NAMES = new Set([
  'node_modules', '__pycache__', '.git', '.DS_Store',
  'dist', 'build', '.cache', '.venv', 'venv', '.next', 'target'
])

function _humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function _humanAge(mtimeMs) {
  const diff = Date.now() - mtimeMs
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function _walkTree(rootDir, currentDir, depth, lines, counter) {
  if (depth > MAX_DEPTH) return
  let entries
  try { entries = fs.readdirSync(currentDir, { withFileTypes: true }) }
  catch { return }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const e of entries) {
    if (counter.value >= MAX_ENTRIES) {
      lines.push(`  ...and more. Use file_operation list to explore further.`)
      return
    }
    if (e.name.startsWith('.')) continue
    if (IGNORE_NAMES.has(e.name)) continue
    if (e.isSymbolicLink()) continue
    const full = path.join(currentDir, e.name)
    const indent = '  '.repeat(depth)
    if (e.isDirectory()) {
      lines.push(`${indent}${e.name}/`)
      counter.value += 1
      _walkTree(rootDir, full, depth + 1, lines, counter)
    } else {
      let size = 0
      try { size = fs.statSync(full).size } catch {}
      lines.push(`${indent}${e.name} (${_humanSize(size)})`)
      counter.value += 1
    }
  }
}

function _collectRecent(rootDir, currentDir, depth, results, cutoffMs) {
  if (depth > MAX_DEPTH) return
  let entries
  try { entries = fs.readdirSync(currentDir, { withFileTypes: true }) }
  catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    if (IGNORE_NAMES.has(e.name)) continue
    if (e.isSymbolicLink()) continue
    const full = path.join(currentDir, e.name)
    if (e.isDirectory()) {
      _collectRecent(rootDir, full, depth + 1, results, cutoffMs)
    } else {
      try {
        const st = fs.statSync(full)
        if (st.mtimeMs >= cutoffMs) {
          const rel = path.relative(rootDir, full).split(path.sep).join('/')
          results.push({ rel, size: st.size, mtimeMs: st.mtimeMs })
        }
      } catch {}
    }
  }
}

function buildWorkingFolderContext(workingPath) {
  if (!workingPath) return null
  let st
  try { st = fs.statSync(workingPath) } catch { return null }
  if (!st.isDirectory()) {
    return `## WORKING FOLDER FOR THIS CHAT\n${workingPath}\n\n(folder is empty or unreadable — not a directory)`
  }

  const treeLines = []
  _walkTree(workingPath, workingPath, 0, treeLines, { value: 0 })

  const cutoffMs = Date.now() - RECENT_DAYS * 86400 * 1000
  const recents = []
  _collectRecent(workingPath, workingPath, 0, recents, cutoffMs)
  recents.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const top = recents.slice(0, RECENT_TOP)

  let block = `## WORKING FOLDER FOR THIS CHAT\n${workingPath}\n\nThis is your operating root for this conversation. When the user refers to "the file", "the report", "this document" without a path, look here first. Use absolute paths in tool calls.\n\n### Folder contents (depth ${MAX_DEPTH}, max ${MAX_ENTRIES} entries)\n`
  block += treeLines.length > 0 ? treeLines.join('\n') : '(empty folder)'
  if (top.length > 0) {
    block += `\n\n### Recently modified (last ${RECENT_DAYS} days, top ${top.length})\n`
    block += top.map(r => `- ${r.rel} (${_humanAge(r.mtimeMs)}, ${_humanSize(r.size)})`).join('\n')
  }
  return block
}

module.exports = { buildWorkingFolderContext }
