'use strict'

const path = require('path')
const { WIKI_TYPES } = require('./aidocFrontmatter')
const { AIDOC_FOLDERS } = require('./aidocLayout')
const { readRegistrySync, registryPathFor } = require('./aidocRegistry')
const { WIKI_LANGUAGES, normalizeWikiLanguage, wikiLanguageOf } = require('./aidocLanguages')

// The overview describes one wiki tree: the language matching `language` when it has pages, otherwise the first
// language that does. Legacy flat pages (not in a language folder) are only used when no language wiki has pages.
function selectWikiTree(pagesByRel, language) {
  const byTree = new Map()
  for (const [rel, page] of Object.entries(pagesByRel)) {
    const tree = wikiLanguageOf(rel) || ''
    if (!byTree.has(tree)) byTree.set(tree, [])
    byTree.get(tree).push(page)
  }
  const wanted = normalizeWikiLanguage(language)
  const tree = byTree.has(wanted) ? wanted : WIKI_LANGUAGES.find(lang => byTree.has(lang)) ?? (byTree.has('') ? '' : null)
  return tree === null ? null : { tree, pages: byTree.get(tree) }
}

function buildWikiOverview({ dataDir, root, language }) {
  if (!dataDir || !root) return null
  const selected = selectWikiTree(readRegistrySync(registryPathFor(dataDir, root)).pages, language)
  if (!selected) return null
  const { pages } = selected
  const pageCount = pages.length

  const byType = {}
  let lastUpdated = null
  for (const { type, updated } of pages) {
    const category = WIKI_TYPES.includes(type) ? type : 'other'
    byType[category] = (byType[category] || 0) + 1
    if (typeof updated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(updated) && (!lastUpdated || updated > lastUpdated)) {
      lastUpdated = updated
    }
  }

  const wikiPath = path.join(root, AIDOC_FOLDERS.WIKI, ...(selected.tree ? [selected.tree] : [])).split(path.sep).join('/')
  const sourcePath = path.join(root, AIDOC_FOLDERS.KB_SOURCE).split(path.sep).join('/')
  const counts = WIKI_TYPES.filter(type => byType[type]).map(type => `${type}: ${byType[type]}`).join(', ')
  const text = `KNOWLEDGE BASE WIKI OVERVIEW
Location: ${wikiPath}
Pages: ${pageCount} (${counts})
Last updated: ${lastUpdated || 'unknown'}
Before answering questions that may relate to the user's own documents or earlier knowledge, read \`${wikiPath}/index.md\`, then read the relevant pages with file_operation. Say which pages you relied on. Pages are AI-maintained summaries of the user's sources in \`${sourcePath}/\`; check the source when precision matters.`
  return { pageCount, byType, lastUpdated, text }
}

module.exports = { buildWikiOverview }
