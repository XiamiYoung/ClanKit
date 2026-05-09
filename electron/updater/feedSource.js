/**
 * feedSource — race R2 vs GitHub Releases to find the fastest reachable
 * update manifest, so users behind networks where one mirror is unreachable
 * still get update notifications.
 *
 * The picker is intentionally cheap: a HEAD-style fetch against the manifest
 * (or the GitHub releases JSON), 4 second timeout each, run in parallel.
 *
 * Result shape:
 *   { ok: true,  source: 'r2',     version, ms }
 *   { ok: true,  source: 'github', version, ms, htmlUrl, assets }
 *   { ok: false, error }
 *
 * Preference rule: if BOTH probes succeed, R2 wins regardless of timing —
 * R2 latest.yml is the format electron-updater consumes for delta/blockmap
 * downloads on Windows. GitHub is only used as a manualOnly fallback when R2
 * is unreachable. We still record both timings for diagnostic logging.
 */
const yaml = require('js-yaml')
const { logger } = require('../logger')

const PROBE_TIMEOUT_MS = 4000
const CACHE_TTL_MS = 5 * 60 * 1000

let _cache = null

function _versionFromYaml(text) {
  const doc = yaml.load(text)
  if (!doc || typeof doc !== 'object') throw new Error('manifest: not a YAML object')
  if (!doc.version) throw new Error('manifest: missing version')
  return String(doc.version)
}

async function _probeR2(feedUrl, platform, fetchImpl) {
  const cleanBase = feedUrl.replace(/\/+$/, '')
  const ymlName = platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml'
  const url = `${cleanBase}/${ymlName}?t=${Date.now()}`
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`r2 HTTP ${res.status}`)
    const text = await res.text()
    const version = _versionFromYaml(text)
    return { ok: true, source: 'r2', version, ms: Date.now() - t0 }
  } finally {
    clearTimeout(timer)
  }
}

async function _probeGitHub(githubRepo, fetchImpl) {
  const url = `https://api.github.com/repos/${githubRepo}/releases/latest`
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`github HTTP ${res.status}`)
    const data = await res.json()
    const version = String(data.tag_name || '').replace(/^v/, '')
    if (!version) throw new Error('github: no tag_name')
    return {
      ok: true,
      source: 'github',
      version,
      ms: Date.now() - t0,
      htmlUrl: data.html_url || null,
      assets: Array.isArray(data.assets) ? data.assets : [],
    }
  } finally {
    clearTimeout(timer)
  }
}

async function pickFastestSource({ feedUrl, githubRepo, platform, fetchImpl, force = false } = {}) {
  if (!force && _cache && (Date.now() - _cache.ts) < CACHE_TTL_MS) {
    return _cache.result
  }
  const fetchFn = fetchImpl || globalThis.fetch
  if (typeof fetchFn !== 'function') {
    return { ok: false, error: 'fetch not available' }
  }

  const tasks = []
  if (feedUrl) {
    tasks.push(_probeR2(feedUrl, platform, fetchFn).catch(err => ({ ok: false, source: 'r2', error: err.message || String(err) })))
  }
  if (githubRepo) {
    tasks.push(_probeGitHub(githubRepo, fetchFn).catch(err => ({ ok: false, source: 'github', error: err.message || String(err) })))
  }
  if (tasks.length === 0) {
    return { ok: false, error: 'no feed configured' }
  }

  const results = await Promise.all(tasks)
  const r2 = results.find(r => r.source === 'r2')
  const gh = results.find(r => r.source === 'github')

  let chosen
  if (r2?.ok) {
    chosen = { ok: true, source: 'r2', version: r2.version, ms: r2.ms }
  } else if (gh?.ok) {
    chosen = {
      ok: true,
      source: 'github',
      version: gh.version,
      ms: gh.ms,
      htmlUrl: gh.htmlUrl,
      assets: gh.assets,
    }
  } else {
    chosen = { ok: false, error: r2?.error || gh?.error || 'all probes failed' }
  }

  _cache = { result: chosen, ts: Date.now() }
  logger.info(
    `[updater.feedSource] picked=${chosen.source || 'none'} ok=${chosen.ok} ` +
    `r2=${r2 ? (r2.ok ? r2.ms + 'ms' : 'fail:' + r2.error) : 'skip'} ` +
    `gh=${gh ? (gh.ok ? gh.ms + 'ms' : 'fail:' + gh.error) : 'skip'}`
  )
  return chosen
}

function pickGithubAssetUrl(assets, platform, arch) {
  if (!Array.isArray(assets) || assets.length === 0) return null
  const find = (test) => {
    const a = assets.find(x => x && typeof x.name === 'string' && test(x))
    return a ? a.browser_download_url : null
  }
  if (platform === 'win32') {
    return find(a => /\.exe$/i.test(a.name) && !/blockmap/i.test(a.name))
  }
  if (platform === 'darwin') {
    if (arch === 'arm64') {
      return find(a => /-arm64\.dmg$/i.test(a.name) && !/blockmap/i.test(a.name))
    }
    return find(a => /\.dmg$/i.test(a.name) && !/arm64/i.test(a.name) && !/blockmap/i.test(a.name))
  }
  return null
}

function _resetCacheForTest() { _cache = null }

module.exports = {
  pickFastestSource,
  pickGithubAssetUrl,
  _resetCacheForTest,
  PROBE_TIMEOUT_MS,
  CACHE_TTL_MS,
}
