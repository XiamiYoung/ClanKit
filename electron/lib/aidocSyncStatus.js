'use strict'

const { AIDOC_FOLDERS } = require('./aidocLayout')

const INGESTABLE_EXTS = new Set(['md', 'txt', 'html', 'htm', 'pdf', 'docx', 'pptx'])

function computeSyncStatus({ scanned, cache, ingested }) {
  const present = new Set(scanned.map(file => file.rel))
  const pending = { new: 0, updated: 0, removed: 0 }
  let staleCount = 0

  for (const { rel, ext, mtimeMs, size } of scanned) {
    const cached = cache.files[rel]
    if (!cached || cached.error || cached.mtimeMs !== mtimeMs || cached.size !== size) staleCount++

    if (!rel.startsWith(AIDOC_FOLDERS.KB_SOURCE + '/') || !INGESTABLE_EXTS.has(ext)) continue
    const record = ingested[rel]
    if (!record) pending.new++
    else if (record.mtimeMs != null && (record.mtimeMs !== mtimeMs || record.size !== size)) pending.updated++
  }

  for (const rel of Object.keys(cache.files)) {
    if (!present.has(rel)) staleCount++
  }
  for (const rel of Object.keys(ingested)) {
    if (!present.has(rel)) pending.removed++
  }

  return { indexStale: staleCount > 0, staleCount, pending, total: scanned.length }
}

module.exports = { computeSyncStatus }
