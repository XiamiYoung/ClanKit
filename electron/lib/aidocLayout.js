'use strict'

const fs = require('fs')
const path = require('path')

const AIDOC_FOLDERS = Object.freeze({
  GENERAL: 'general',
  KB_SOURCE: 'kb_source',
  WIKI: 'wiki',
})

function resolveAiDocRoot(config) {
  const cfg = config || {}
  if (cfg.DoCPath) return cfg.DoCPath
  if (cfg.dataPath) return path.join(cfg.dataPath, 'clankit_doc')
  return ''
}

function _norm(p) {
  return path.resolve(p.replace(/\\/g, '/')).replace(/\\/g, '/').replace(/\/+$/, '')
}

function classifyAiDocPath(aidocRoot, targetPath) {
  if (!aidocRoot || !targetPath) return null
  const root = _norm(aidocRoot).toLowerCase()
  const target = _norm(targetPath).toLowerCase()
  if (target !== root && !target.startsWith(root + '/')) return null
  const rel = target.slice(root.length).replace(/^\//, '')
  const first = rel.split('/')[0]
  if (first === AIDOC_FOLDERS.WIKI) return AIDOC_FOLDERS.WIKI
  if (first === AIDOC_FOLDERS.KB_SOURCE) return AIDOC_FOLDERS.KB_SOURCE
  return AIDOC_FOLDERS.GENERAL
}

function ensureAiDocLayout(aidocRoot) {
  const created = []
  if (!aidocRoot) return { created }
  for (const name of Object.values(AIDOC_FOLDERS)) {
    const dir = path.join(aidocRoot, name)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      created.push(name)
    }
  }
  return { created }
}

module.exports = { AIDOC_FOLDERS, resolveAiDocRoot, classifyAiDocPath, ensureAiDocLayout }
