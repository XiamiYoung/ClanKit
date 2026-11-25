'use strict'

const { AIDOC_FOLDERS } = require('./aidocLayout')
const { readRegistry, registryPathFor } = require('./aidocRegistry')
const { createLinkResolver } = require('./aidocLinkResolver')
const { isImageWikiTarget } = require('./aidocLinkParser')
const { wikiLanguageOf } = require('./aidocLanguages')
const { isWikiScaffoldFile } = require('./aidocWiki')

async function readIngestedSources(dataDir, root) {
  return (await readRegistry(registryPathFor(dataDir, root))).sources
}

// lang: the preferred wiki language. Its pages are shown when that language folder exists in the vault;
// otherwise every wiki page is shown.
function buildGraph({ files, ingested, lang }) {
  const nodes = new Map()
  const links = []
  const groups = new Set()
  const targetsBySource = new Map()
  const hasLanguageWiki = Boolean(lang) && files.some(file => wikiLanguageOf(file.rel) === lang)
  const inScope = rel => !rel.startsWith(AIDOC_FOLDERS.WIKI + '/') || !hasLanguageWiki || wikiLanguageOf(rel) === lang
  const resolve = createLinkResolver(files.map(file => file.rel).filter(inScope))

  for (const { rel, abs, ext, title } of files) {
    if (!inScope(rel) || isWikiScaffoldFile(rel)) continue
    const segments = rel.split('/')
    const [area] = segments
    if (area !== AIDOC_FOLDERS.WIKI &&
      !(area === AIDOC_FOLDERS.KB_SOURCE && Object.hasOwn(ingested, rel))) continue

    // A language folder is the wiki root: colour wiki pages by their first folder below it.
    const folders = wikiLanguageOf(rel) ? segments.slice(2) : segments.slice(1)
    const group = folders.length > 1 ? area + '/' + folders[0] : area
    nodes.set(rel, { id: rel, path: abs, name: segments.at(-1), title, ext, area, group, kind: 'doc', degree: 0 })
    groups.add(group)
  }

  function addLink(source, target) {
    if (source === target) return
    if (!targetsBySource.has(source)) targetsBySource.set(source, new Set())
    const targets = targetsBySource.get(source)
    if (targets.has(target)) return
    targets.add(target)
    links.push({ source, target })
    nodes.get(source).degree++
    nodes.get(target).degree++
  }

  for (const { rel, links: targets } of files) {
    if (!nodes.has(rel)) continue
    for (const target of targets) {
      if (isImageWikiTarget(target)) continue
      const match = resolve(rel, target)
      if (match.kind === 'resolved' && isWikiScaffoldFile(match.rel)) continue
      if (match.kind === 'resolved' && nodes.has(match.rel)) {
        addLink(rel, match.rel)
        continue
      }

      const kind = match.kind === 'ambiguous' ? 'ambiguous' : 'unresolved'
      const key = target.trim().replace(/\\/g, '/').toLowerCase()
      const id = kind === 'ambiguous' ? 'ambiguous:' + JSON.stringify([key, match.candidates]) : '?' + key
      if (!nodes.has(id)) nodes.set(id, { id, name: target, title: target, kind, degree: 0 })
      addLink(rel, id)
      if (kind === 'ambiguous') {
        for (const candidate of match.candidates) {
          if (nodes.has(candidate)) addLink(id, candidate)
        }
      }
    }
  }

  // A generated page may mention its source only in frontmatter, so the registry also links them.
  for (const [rel, record] of Object.entries(ingested)) {
    if (!nodes.has(rel)) continue
    const pages = [record.pages, ...Object.values(record.langs || {}).map(entry => entry?.pages)]
    for (const page of pages.flatMap(list => list || [])) {
      if (nodes.has(page) && !targetsBySource.get(rel)?.has(page)) addLink(page, rel)
    }
  }

  return { nodes: [...nodes.values()], links, groups: [...groups].sort() }
}

function hueColor(hue) {
  const lightness = 0.63
  const saturation = 0.72
  const strength = saturation * Math.min(lightness, 1 - lightness)
  const channel = offset => {
    const band = (offset + hue / 30) % 12
    const value = lightness - strength * Math.max(-1, Math.min(band - 3, 9 - band, 1))
    return Math.round(255 * value).toString(16).padStart(2, '0')
  }
  return '#' + channel(0) + channel(8) + channel(4)
}

function assignGroupColors(groups) {
  const sorted = [...new Set(groups)].sort()
  const palette = (area, firstHue, lastHue) => {
    const matching = sorted.filter(group => group === area || group.startsWith(area + '/'))
    return matching.map((group, index) => {
      const ratio = matching.length === 1 ? 0.5 : index / (matching.length - 1)
      return [group, hueColor((firstHue + (lastHue - firstHue) * ratio + 360) % 360)]
    })
  }
  return Object.fromEntries([
    ...palette(AIDOC_FOLDERS.WIKI, 225, 180),
    ...palette(AIDOC_FOLDERS.KB_SOURCE, 34, -25),
  ])
}

// Well separated hues, assigned from the largest category down.
const CATEGORY_COLORS = [
  '#4c7ef3', '#f0803c', '#2fb67c', '#a463f2', '#e5484d', '#12a5b8', '#d6a100', '#e45cb0',
  '#6b8e23', '#8d6e63', '#5c6bc0', '#00897b', '#c2185b', '#7cb342', '#ef6c00', '#3949ab',
]
const UNCATEGORIZED_COLOR = '#9aa5b1'

// Regroups document nodes by their top-level topic. Sources have no topic of their own and take the
// most common one among linked pages. Returns null while nothing has been classified.
function applyCategories(graph, topics) {
  const names = new Map()
  const categories = new Map()
  for (const node of graph.nodes) {
    const root = topics.get(node.id)?.split(' › ')[0]
    if (!root) continue
    const key = root.toLowerCase()
    if (!names.has(key)) names.set(key, root)
    categories.set(node.id, names.get(key))
  }
  if (!categories.size) return null

  const votes = new Map()
  for (const { source, target } of graph.links) {
    for (const [from, to] of [[source, target], [target, source]]) {
      if (!from.startsWith(AIDOC_FOLDERS.KB_SOURCE + '/') || !categories.has(to)) continue
      if (!votes.has(from)) votes.set(from, new Map())
      const counts = votes.get(from)
      counts.set(categories.get(to), (counts.get(categories.get(to)) || 0) + 1)
    }
  }
  for (const [id, counts] of votes) categories.set(id, [...counts].sort((a, b) => b[1] - a[1])[0][0])

  const sizes = new Map()
  const nodes = graph.nodes.map(node => {
    if (node.kind !== 'doc') return node
    const group = categories.get(node.id) || ''
    sizes.set(group, (sizes.get(group) || 0) + 1)
    return { ...node, group }
  })
  // Largest first; the uncategorized group is always last.
  const groups = [...sizes.keys()].sort((a, b) => Number(!a) - Number(!b) || sizes.get(b) - sizes.get(a) || a.localeCompare(b))
  const colors = Object.fromEntries(groups.map((group, index) =>
    [group, group ? CATEGORY_COLORS[index % CATEGORY_COLORS.length] : UNCATEGORIZED_COLOR]))
  return { ...graph, nodes, groups, colors }
}

module.exports = {
  applyCategories, assignGroupColors, buildGraph, readIngestedSources }
