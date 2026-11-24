'use strict'

const path = require('path')
const { WIKI_TYPES } = require('./aidocFrontmatter')
const { AIDOC_FOLDERS } = require('./aidocLayout')
const { readRegistrySync, registryPathFor } = require('./aidocRegistry')

function buildWikiOverview({ dataDir, root }) {
  if (!dataDir || !root) return null
  const pages = Object.values(readRegistrySync(registryPathFor(dataDir, root)).pages)
  const pageCount = pages.length
  if (pageCount === 0) return null

  const byType = {}
  let lastUpdated = null
  for (const { type, updated } of pages) {
    const category = WIKI_TYPES.includes(type) ? type : 'other'
    byType[category] = (byType[category] || 0) + 1
    if (typeof updated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(updated) && (!lastUpdated || updated > lastUpdated)) {
      lastUpdated = updated
    }
  }

  const wikiPath = path.join(root, AIDOC_FOLDERS.WIKI).split(path.sep).join('/')
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
