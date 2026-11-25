'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { scanKnowledgeFiles } = require('./aidocIndex')
const { createLinkResolver } = require('./aidocLinkResolver')
const { extractWikiLinks } = require('./aidocLinkParser')
const { wikiLanguageOf } = require('./aidocLanguages')
const { parseFrontmatter, sha256Text } = require('./aidocFrontmatter')
const { updateRegistry } = require('./aidocRegistry')

const fileKey = rel => process.platform === 'win32' ? rel.toLowerCase() : rel
const sourcePaths = value => Array.isArray(value) ? value.filter(rel => typeof rel === 'string') : []

function vaultIdentity(root) {
  const stat = fs.statSync(root)
  if (!stat.isDirectory()) throw new Error(`Knowledge base root is not a directory: ${root}`)
  fs.accessSync(root, fs.constants.R_OK | fs.constants.X_OK)
  return `${stat.dev}:${stat.ino}`
}

function vaultFile(root, rel, area) {
  const segments = rel.split('/')
  if (segments[0] !== area || segments.length < 2 || segments.some(seg => !seg || /^[.]{1,2}$|[. ]$|[:\\\0]/.test(seg))) {
    throw new Error(`Invalid vault path: ${rel}`)
  }
  let abs = root
  for (const [index, segment] of segments.entries()) {
    abs = path.join(abs, segment)
    try {
      const stat = fs.lstatSync(abs)
      if (index === segments.length - 1 ? !stat.isFile() : !stat.isDirectory()) {
        throw new Error(`Unexpected file type at ${abs}`)
      }
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }
  return abs
}

function replaceFile(abs, content) {
  const temp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    fs.writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temp, abs)
  } finally {
    fs.rmSync(temp, { force: true })
  }
}

// Change only the sources field, preserving other metadata, the body, and original line endings.
function replaceSourceMetadata(content, sources) {
  const frontmatter = /^(\uFEFF?---[^\S\r\n]*\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m.exec(content)
  if (!frontmatter || frontmatter.index !== 0) return null
  const [, opening, header, closing] = frontmatter
  const keys = header.match(/^sources[ \t]*:/gm)
  if (keys?.length !== 1) return null
  const eol = opening.endsWith('\r\n') ? '\r\n' : '\n'
  const values = sources.map(source => {
    if (/[\r\n]/.test(source)) return null
    if (!source.includes("'")) return `'${source}'`
    if (!/["\\]/.test(source)) return `"${source}"`
    return null
  })
  if (values.includes(null)) return null
  const withSources = header.replace(/^sources[ \t]*:[^\r\n]*\r?\n(?:[ \t]*-[ \t]+[^\r\n]*\r?\n)*/m,
    () => `sources:${eol}${values.map(value => `  - ${value}${eol}`).join('')}`)
  return opening + withSources + closing + content.slice(frontmatter[0].length)
}

function removeIndexEntries(content, indexRel, resolve, deleted) {
  let fence = ''
  return content.split(/(?<=\n)/).map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = ''
      return line
    }
    if (marker) { fence = marker; return line }
    if (!/^[ \t]*[-*+] +\[\[/.test(line)) return line
    const links = extractWikiLinks(line)
    if (links.length !== 1) return line
    const target = resolve(indexRel, links[0])
    return target.kind === 'resolved' && deleted.has(fileKey(target.rel)) ? '' : line
  }).join('')
}

async function reconcileRemovedSources({ root, registryFile, removed, shouldStop = () => false }) {
  const result = { removed: [], deletedPages: [], updatedPages: [], warnings: [] }
  if (!removed.length || shouldStop()) return result
  const rollback = []
  try {
    await updateRegistry(registryFile, async registry => {
      const identity = vaultIdentity(root)
      const wiki = await scanKnowledgeFiles(root, { folders: ['wiki'] })
      if (shouldStop()) return registry
      if (vaultIdentity(root) !== identity) throw new Error(`Knowledge base root changed during reconciliation: ${root}`)
      const absent = new Set()
      for (const rel of removed) {
        if (!Object.hasOwn(registry.sources, rel)) continue
        try {
          if (!vaultFile(root, rel, 'kb_source')) absent.add(fileKey(rel))
        } catch (error) {
          result.warnings.push({ rel, step: 'reconcile', detail: error.message })
        }
      }
      if (!absent.size) return registry

      const sources = { ...registry.sources }
      const pages = { ...registry.pages }
      const owners = new Map()
      for (const [rel, record] of Object.entries(sources)) {
        for (const page of sourcePaths(record.pages)) {
          const key = fileKey(page)
          if (!owners.has(key)) owners.set(key, [])
          owners.get(key).push(rel)
        }
        if (absent.has(fileKey(rel))) {
          delete sources[rel]
          result.removed.push(rel)
        }
      }

      const deleted = new Set()
      const affectedIndexes = new Set()
      for (const [rel, record] of Object.entries(pages)) {
        const lang = wikiLanguageOf(rel)
        if (!lang || path.posix.extname(rel).toLowerCase() !== '.md' || /^(index|schema|log)\.md$/i.test(path.posix.basename(rel))) continue
        const references = new Set([...sourcePaths(record.sources), ...(owners.get(fileKey(rel)) || [])])
        if (![...references].some(source => absent.has(fileKey(source)))) continue
        let abs
        try {
          abs = vaultFile(root, rel, 'wiki')
        } catch (error) {
          pages[rel] = { ...record, sources: [...references].filter(source => !absent.has(fileKey(source))), handEdited: true }
          result.warnings.push({ rel, step: 'reconcile', detail: error.message })
          continue
        }
        if (!abs) {
          delete pages[rel]
          deleted.add(fileKey(rel))
          affectedIndexes.add(`wiki/${lang}/index.md`)
          continue
        }
        const before = fs.readFileSync(abs, 'utf8')
        const { data, hasFrontmatter } = parseFrontmatter(before)
        for (const source of sourcePaths(data.sources)) references.add(source)
        const remaining = [...references].filter(source => !absent.has(fileKey(source)))
        const managed = !record.handEdited && sha256Text(before) === record.hash && hasFrontmatter && Array.isArray(data.sources)
        if (!managed) {
          pages[rel] = { ...record, sources: remaining, handEdited: true }
        } else if (!remaining.length) {
          fs.unlinkSync(abs)
          rollback.push(() => fs.writeFileSync(abs, before, { encoding: 'utf8', flag: 'wx' }))
          delete pages[rel]
          deleted.add(fileKey(rel))
          affectedIndexes.add(`wiki/${lang}/index.md`)
          result.deletedPages.push(rel)
        } else {
          const matches = remaining.length === data.sources.length && remaining.every((source, index) => source === data.sources[index])
          const next = matches ? before : replaceSourceMetadata(before, remaining)
          if (next === null) result.warnings.push({ rel, step: 'reconcile', detail: 'Could not safely update source metadata' })
          if (next !== null && next !== before) {
            replaceFile(abs, next)
            rollback.push(() => { if (fs.readFileSync(abs, 'utf8') === next) replaceFile(abs, before) })
            result.updatedPages.push(rel)
          }
          pages[rel] = { ...record, sources: remaining, hash: sha256Text(next ?? before) }
        }
      }

      if (deleted.size) {
        for (const [rel, record] of Object.entries(sources)) {
          if (!sourcePaths(record.pages).some(page => deleted.has(fileKey(page)))) continue
          const prune = items => sourcePaths(items).filter(page => !deleted.has(fileKey(page)))
          sources[rel] = { ...record, pages: prune(record.pages), langs: Object.fromEntries(Object.entries(record.langs)
            .map(([lang, language]) => [lang, { ...language, pages: prune(language.pages) }])) }
        }
        const resolve = createLinkResolver([...wiki.map(file => file.rel), ...result.deletedPages])
        for (const rel of affectedIndexes) {
          const abs = vaultFile(root, rel, 'wiki')
          if (!abs) continue
          const before = fs.readFileSync(abs, 'utf8')
          const next = removeIndexEntries(before, rel, resolve, deleted)
          if (next === before) continue
          replaceFile(abs, next)
          rollback.push(() => { if (fs.readFileSync(abs, 'utf8') === next) replaceFile(abs, before) })
        }
      }
      return { ...registry, sources, pages }
    })
  } catch (error) {
    for (const restore of rollback.reverse()) {
      try { restore() } catch { /* Concurrent user changes take precedence. */ }
    }
    throw error
  }
  return result
}

module.exports = { reconcileRemovedSources }
