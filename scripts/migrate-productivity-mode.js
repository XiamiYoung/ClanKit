#!/usr/bin/env node
// One-time migration: chat.codingMode → chat.mode='productivity'.
// Run: node scripts/migrate-productivity-mode.js [DATA_DIR]
// Default DATA_DIR resolves the same way the runtime data store does:
// 1. CLI arg
// 2. CLANKIT_DATA_PATH env
// 3. %APPDATA%/clankit/data on Windows, ~/.config/clankit/data on POSIX

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function migrateChatRecord(chat) {
  // Idempotent: a chat that already has mode set is left untouched.
  if (chat.mode === 'chat' || chat.mode === 'productivity') {
    return chat
  }
  const out = { ...chat }
  if (chat.codingMode === true) {
    out.mode = 'productivity'
    out.productivityModeNoticeShown = true
  } else {
    out.mode = 'chat'
    out.productivityModeNoticeShown = false
  }
  delete out.codingMode
  delete out.codingProvider
  if (!Array.isArray(out.modeTransitions)) out.modeTransitions = []
  if (out.modeTransitionPending === undefined) out.modeTransitionPending = null
  return out
}

function defaultDataDir() {
  if (process.env.CLANKIT_DATA_PATH) return process.env.CLANKIT_DATA_PATH
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || `${process.env.USERPROFILE}/AppData/Roaming`, 'clankit', 'data')
  }
  return path.join(process.env.HOME || '~', '.config', 'clankit', 'data')
}

function main() {
  const dataDir = process.argv[2] || defaultDataDir()
  const chatsDir = path.join(dataDir, 'chats')
  if (!fs.existsSync(chatsDir)) {
    console.error(`No chats dir at ${chatsDir}`)
    process.exit(1)
  }
  const files = fs.readdirSync(chatsDir).filter(f => f.endsWith('.json') && f !== 'index.json')
  let changed = 0
  for (const f of files) {
    const full = path.join(chatsDir, f)
    const raw = fs.readFileSync(full, 'utf8')
    const before = JSON.parse(raw)
    const after = migrateChatRecord(before)
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      fs.writeFileSync(full, JSON.stringify(after, null, 2))
      changed += 1
      const target = before.codingMode ? 'productivity' : 'chat'
      console.log(`migrated: ${f} → ${target}`)
    }
  }
  console.log(`Done. ${changed}/${files.length} chats updated.`)
}

const _thisFile = path.normalize(fileURLToPath(import.meta.url))
const _calledFile = process.argv[1] ? path.normalize(process.argv[1]) : ''
if (_thisFile === _calledFile) {
  main()
}
