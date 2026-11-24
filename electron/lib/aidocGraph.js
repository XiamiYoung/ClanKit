'use strict'

const fs = require('fs/promises')
const path = require('path')
const { AIDOC_FOLDERS } = require('./aidocLayout')
const { rootHash } = require('./aidocIndex')
const { createLinkResolver } = require('./aidocLinkResolver')

async function readIngestedSources(dataDir, root) {
  try {
    const file = path.join(dataDir, 'aidoc-ingest', rootHash(root) + '.json')
    const { sources } = JSON.parse(await fs.readFile(file, 'utf8'))
    if (!sources || typeof sources !== 'object' || Array.isArray(sources)) return {}
    return Object.fromEntries(Object.entries(sources).filter(([, record]) =>
      record && typeof record.hash === 'string' &&
      typeof record.ingestedAt === 'string' && Array.isArray(record.pages)
    ))
  } catch {
    return {}
  }
}

function buildGraph({ files, ingested }) {
  const nodes = new Map()
  const links = []
  const groups = new Set()
  const targetsBySource = new Map()
  const resolve = createLinkResolver(files.map(file => file.rel))

  for (const { rel, abs, ext, title } of files) {
    const segments = rel.split('/')
    const [area, folder] = segments
    if (area !== AIDOC_FOLDERS.WIKI &&
      !(area === AIDOC_FOLDERS.KB_SOURCE && Object.hasOwn(ingested, rel))) continue

    const group = segments.length > 2 ? area + '/' + folder : area
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
      const match = resolve(rel, target)
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

module.exports = { assignGroupColors, buildGraph, readIngestedSources }
