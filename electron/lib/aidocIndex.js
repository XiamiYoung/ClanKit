'use strict'

const { createHash, randomUUID } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { AIDOC_FOLDERS } = require('./aidocLayout')
const { extractWikiLinks } = require('./aidocLinkParser')
const { DOCUMENT_EXTS, TEXT_EXTRACTABLE_EXTS, extractDocument } = require('./aidocTextExtract')

const KNOWLEDGE_FOLDERS = [AIDOC_FOLDERS.KB_SOURCE, AIDOC_FOLDERS.WIKI]
const VERSION = 1

function extension(name) {
  return path.extname(name).slice(1).toLowerCase()
}

function isScannableName(name) {
  if (!name || name.startsWith('.') || name.toLowerCase() === 'node_modules' || /[\\/\0]/.test(name)) return false
  if (process.platform !== 'win32') return true
  return !/[:*?"<>|]|[. ]$|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
}

async function scanKnowledgeFiles(root, { folders = KNOWLEDGE_FOLDERS } = {}) {
  const files = []
  if (!root) return files

  async function visit(abs, rel) {
    let entries
    try {
      const stat = await fs.lstat(abs)
      if (stat.isSymbolicLink()) return
      if (!stat.isDirectory()) throw new Error(`Knowledge folder is not a directory: ${abs}`)
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      if (!isScannableName(entry.name)) continue
      const childAbs = path.join(abs, entry.name)
      const childRel = `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        await visit(childAbs, childRel)
      } else if (entry.isFile()) {
        const ext = extension(entry.name)
        if (!DOCUMENT_EXTS.has(ext)) continue
        try {
          const stat = await fs.lstat(childAbs)
          if (stat.isFile()) {
            files.push({ rel: childRel, abs: childAbs, ext, mtimeMs: stat.mtimeMs, size: stat.size })
          }
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
      }
    }
  }

  for (const folder of KNOWLEDGE_FOLDERS) {
    if (folders.includes(folder)) await visit(path.resolve(root, folder), folder)
  }
  return files
}

function rootHash(root) {
  let normalized = path.resolve(root)
  if (process.platform === 'win32') normalized = normalized.replace(/\\/g, '/').toLowerCase()
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16)
}

function cachePathFor(dataDir, root) {
  return path.join(dataDir, 'aidoc-index', `${rootHash(root)}.json`)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValidEntry([rel, entry]) {
  const [area, ...segments] = rel.split('/')
  return KNOWLEDGE_FOLDERS.includes(area) && segments.length > 0 && segments.every(isScannableName) &&
    isRecord(entry) && DOCUMENT_EXTS.has(entry.ext) && entry.ext === extension(rel) &&
    Number.isFinite(entry.mtimeMs) && Number.isSafeInteger(entry.size) && entry.size >= 0 &&
    typeof entry.title === 'string' && Array.isArray(entry.links) &&
    entry.links.every(link => typeof link === 'string' && link.trim()) &&
    (entry.error === undefined || (typeof entry.error === 'string' && entry.error.length > 0))
}

async function loadCache(cacheFile) {
  try {
    const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'))
    if (isRecord(cache) && cache.version === VERSION && isRecord(cache.files) &&
      Object.entries(cache.files).every(isValidEntry)) return cache
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  return { version: VERSION, files: {} }
}

async function saveCache(cacheFile, cache) {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true })
  const temporaryFile = `${cacheFile}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryFile, JSON.stringify(cache), { flag: 'wx' })
    await fs.rename(temporaryFile, cacheFile)
  } catch (error) {
    await fs.rm(temporaryFile, { force: true }).catch(() => {})
    throw error
  }
}

async function indexFile({ abs, rel, ext, mtimeMs, size }) {
  const entry = { mtimeMs, size, ext, title: path.basename(rel, path.extname(rel)), links: [] }
  if (!TEXT_EXTRACTABLE_EXTS.has(ext)) return entry

  try {
    const document = await extractDocument(abs, ext)
    entry.title = document.title
    if (document.error) entry.error = document.error
    else entry.links = extractWikiLinks(document.text)
  } catch (error) {
    entry.error = error.code || error.message || String(error)
  }
  return entry
}

async function updateIndex({ root, cache, full = false, chunk = 10, onProgress }) {
  const previous = cache?.files ?? {}
  const scanned = await scanKnowledgeFiles(root)
  const files = {}
  const stats = { total: scanned.length, parsed: 0, reused: 0, removed: 0, errors: 0 }
  const batchSize = Number.isSafeInteger(chunk) && chunk > 0 ? chunk : 10

  for (const file of scanned) {
    const cached = previous[file.rel]
    if (!full && cached && !cached.error && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
      files[file.rel] = cached
      stats.reused++
    } else {
      const entry = await indexFile(file)
      files[file.rel] = entry
      stats.parsed++
      if (entry.error) stats.errors++
    }

    const done = stats.parsed + stats.reused
    if (done % batchSize === 0 || done === stats.total) {
      onProgress?.({ done, total: stats.total })
      await new Promise(resolve => setImmediate(resolve))
    }
  }
  if (stats.total === 0) onProgress?.({ done: 0, total: 0 })

  stats.removed = Object.keys(previous).filter(rel => !Object.hasOwn(files, rel)).length
  return { cache: { version: VERSION, files }, stats }
}

module.exports = { scanKnowledgeFiles, rootHash, cachePathFor, loadCache, saveCache, updateIndex }
