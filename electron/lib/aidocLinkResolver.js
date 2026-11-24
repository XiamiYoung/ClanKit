'use strict'

const path = require('path').posix
const { AIDOC_FOLDERS } = require('./aidocLayout')
const { DOCUMENT_EXTS } = require('./aidocTextExtract')
const { wikiLanguageOf } = require('./aidocLanguages')

function normalize(value) {
  return value.replace(/\\/g, '/').toLowerCase()
}

// The independent wiki a path belongs to: its language folder, '' for legacy flat wiki pages,
// or null outside the wiki. Wikilinks between wiki pages never cross trees.
function wikiTreeOf(rel) {
  if (!rel.startsWith(AIDOC_FOLDERS.WIKI + '/')) return null
  return wikiLanguageOf(rel) || ''
}

function addCandidate(index, key, candidate) {
  const candidates = index.get(key)
  if (candidates) candidates.push(candidate)
  else index.set(key, [candidate])
}

function createLinkResolver(allRels) {
  const exactPaths = new Map()
  const suffixes = new Map()
  const names = new Map()

  function indexPath(rel, candidate) {
    const segments = rel.split('/')
    addCandidate(exactPaths, rel, candidate)
    addCandidate(names, segments.at(-1), candidate)
    for (let offset = 1; offset < segments.length - 1; offset++) {
      addCandidate(suffixes, segments.slice(offset).join('/'), candidate)
    }
  }

  for (const rel of new Set(allRels)) {
    const normalized = normalize(rel)
    const dirname = path.dirname(normalized)
    const ext = path.extname(normalized)
    const candidate = { rel, dirname, wiki: normalized.startsWith(AIDOC_FOLDERS.WIKI + '/'), tree: wikiTreeOf(normalized) }
    indexPath(normalized, candidate)

    const stem = normalized.slice(0, -ext.length)
    if (ext && !DOCUMENT_EXTS.has(path.extname(stem).slice(1))) indexPath(stem, candidate)
  }

  return (fromRel, target) => {
    const key = normalize(target.trim())
    let candidates = key.includes('/') ? exactPaths.get(key) ?? suffixes.get(key) : names.get(key)
    if (!candidates?.length) return { kind: 'unresolved' }

    const fromTree = wikiTreeOf(normalize(fromRel))
    if (fromTree !== null) {
      candidates = candidates.filter(candidate => candidate.tree === null || candidate.tree === fromTree)
      if (!candidates.length) return { kind: 'unresolved' }
    }
    if (candidates.length > 1) {
      const folder = path.dirname(normalize(fromRel))
      const local = candidates.filter(candidate => candidate.dirname === folder)
      if (local.length) candidates = local
    }
    if (candidates.length > 1) {
      const wiki = candidates.filter(candidate => candidate.wiki)
      if (wiki.length) candidates = wiki
    }
    if (candidates.length === 1) return { kind: 'resolved', rel: candidates[0].rel }
    return { kind: 'ambiguous', candidates: candidates.map(({ rel }) => rel).sort() }
  }
}

function resolveLink(fromRel, target, allRels) {
  return createLinkResolver(allRels)(fromRel, target)
}

module.exports = { createLinkResolver, resolveLink }
