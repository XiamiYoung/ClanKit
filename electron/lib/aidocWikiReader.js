'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { AIDOC_FOLDERS } = require('./aidocLayout')
const { parseFrontmatter } = require('./aidocFrontmatter')
const { scanKnowledgeFiles } = require('./aidocIndex')
const { extractWikiLinks } = require('./aidocLinkParser')
const { createLinkResolver } = require('./aidocLinkResolver')
const { resolveWikiToolPath } = require('../agent/tools/AiDocWikiTool')

const { WIKI, KB_SOURCE } = AIDOC_FOLDERS
const HOME = `${WIKI}/index.md`
const EXCLUDED = new Set([`${WIKI}/schema.md`, `${WIKI}/log.md`])
const HEADER_BYTES = 4096
const MAX_PAGES = 1000

function isWikiPage(rel) {
  return typeof rel === 'string' && rel.startsWith(`${WIKI}/`) &&
    path.posix.extname(rel).toLowerCase() === '.md' && !EXCLUDED.has(rel.toLowerCase())
}

function pageTitle(rel) {
  return path.posix.basename(rel, path.posix.extname(rel))
}

function metadata(rel, data) {
  return {
    title: typeof data.title === 'string' && data.title.trim() ? data.title : pageTitle(rel),
    type: typeof data.type === 'string' && data.type.trim() ? data.type : 'other',
    updated: typeof data.updated === 'string' ? data.updated : '',
    sources: Array.isArray(data.sources) ? data.sources : [],
  }
}

function isMissing(error) {
  return error.code === 'ENOENT' || error.code === 'ENOTDIR'
}

async function findAreaFile(root, area, rel) {
  if (!root || !rel.startsWith(`${area}/`)) return null
  try {
    // Keep the area itself in place, even if a junction points elsewhere in the vault.
    if (!(await fs.lstat(path.resolve(root, area))).isDirectory()) return null
    const target = resolveWikiToolPath(root, rel)
    if (!target.ok || !target.exists || !(await fs.stat(target.abs)).isFile()) return null
    return target
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

async function readHeader(abs, size) {
  const handle = await fs.open(abs, 'r')
  try {
    const buffer = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const header = buffer.toString('utf8', 0, bytesRead)
    return bytesRead < size ? header.slice(0, header.lastIndexOf('\n') + 1) : header
  } finally {
    await handle.close()
  }
}

async function listWikiPages(root) {
  const files = (await scanKnowledgeFiles(root, { folders: [WIKI] })).filter(file => isWikiPage(file.rel))
  files.sort((a, b) => Number(b.rel.toLowerCase() === HOME) - Number(a.rel.toLowerCase() === HOME) ||
    a.rel.localeCompare(b.rel))

  const pages = []
  for (const { rel, size, mtimeMs } of files) {
    if (pages.length === MAX_PAGES) break
    const target = await findAreaFile(root, WIKI, rel)
    if (!target || !isWikiPage(target.rel)) continue
    try {
      const header = await readHeader(target.abs, size)
      const page = { rel, path: target.abs, ...metadata(rel, parseFrontmatter(header).data), mtimeMs }
      if (rel.toLowerCase() === HOME) page.isIndex = true
      pages.push(page)
    } catch (error) {
      if (!isMissing(error)) throw error
    }
  }
  return pages
}

function buildBacklinks(cache, rel) {
  if (!isWikiPage(rel)) return []
  const files = cache?.files ?? {}
  const allRels = Object.keys(files).sort()
  const resolve = createLinkResolver([...allRels, rel])
  return allRels.filter(fromRel => fromRel !== rel && isWikiPage(fromRel) && files[fromRel].links.some(target => {
    const match = resolve(fromRel, target)
    return match.kind === 'resolved' && match.rel === rel
  })).map(fromRel => ({ rel: fromRel, title: files[fromRel].title || pageTitle(fromRel) }))
}

async function readWikiPage({ root, cache, rel }) {
  const target = isWikiPage(rel) && await findAreaFile(root, WIKI, rel)
  if (!target || !isWikiPage(target.rel)) throw new Error('Wiki page is missing or outside the reader scope')

  const { data, body } = parseFrontmatter(await fs.readFile(target.abs, 'utf8'))
  const page = metadata(target.rel, data)
  const resolve = createLinkResolver([...Object.keys(cache?.files ?? {}), target.rel])
  const links = Object.fromEntries(extractWikiLinks(body).map(link => {
    const match = resolve(target.rel, link)
    const destination = match.kind === 'ambiguous' ? match.candidates[0] : match.rel
    return [link, isWikiPage(destination) ? destination : null]
  }))
  const sources = await Promise.all(page.sources.map(async sourceRel => {
    const source = await findAreaFile(root, KB_SOURCE, sourceRel)
    return source ? { rel: sourceRel, path: source.abs, exists: true } : { rel: sourceRel, exists: false }
  }))

  return {
    rel: target.rel,
    path: target.abs,
    ...page,
    sources,
    body,
    links,
    backlinks: buildBacklinks(cache, target.rel),
  }
}

module.exports = { listWikiPages, buildBacklinks, readWikiPage }
