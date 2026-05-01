/**
 * macFallback — pure functions for the macOS update path.
 *
 * The app on macOS is unsigned, so Squirrel.Mac auto-update can't run.
 * Instead we fetch latest-mac.yml ourselves, compare versions, and (if a
 * newer one exists) hand the user a DMG URL to download manually.
 *
 * Kept dependency-free of Electron so it's straightforward to unit-test.
 */
const yaml = require('js-yaml')

function parseLatestMacYaml(text) {
  const doc = yaml.load(text)
  if (!doc || typeof doc !== 'object') {
    throw new Error('latest-mac.yml: not a YAML object')
  }
  if (!doc.version) {
    throw new Error('latest-mac.yml: missing "version" field')
  }
  return {
    version: String(doc.version),
    files: Array.isArray(doc.files) ? doc.files : [],
    releaseDate: doc.releaseDate || null,
    releaseNotes: doc.releaseNotes || null,
  }
}

function pickDmgUrl(manifest, arch, baseUrl) {
  if (!manifest || !Array.isArray(manifest.files)) return null
  const isArm = arch === 'arm64'
  const file = manifest.files.find(f => {
    if (!f || typeof f.url !== 'string' || !f.url.endsWith('.dmg')) return false
    const isArmFile = /-arm64\.dmg$/.test(f.url)
    return isArm ? isArmFile : !isArmFile
  })
  if (!file) return null
  const cleanBase = baseUrl.replace(/\/+$/, '')
  return `${cleanBase}/${file.url}`
}

/**
 * Strict-greater-than version compare.
 *
 * We don't depend on `semver` here — the project's transitive copy is 6.x
 * and pulling 7.x as a direct dep would force a major bump on a widely
 * shared transitive dep. Our version strings are simple `MAJOR.MINOR.PATCH`
 * with optional `-prerelease`, which a small inline parser handles cleanly.
 */
function compareVersions(currentVersion, remoteVersion) {
  const parse = (v) => {
    const [main, prerelease] = String(v).split('-', 2)
    const parts = main.split('.').map(n => parseInt(n, 10) || 0)
    while (parts.length < 3) parts.push(0)
    return { parts, prerelease: prerelease || null }
  }
  const a = parse(currentVersion)
  const b = parse(remoteVersion)
  for (let i = 0; i < 3; i++) {
    if (b.parts[i] > a.parts[i]) return true
    if (b.parts[i] < a.parts[i]) return false
  }
  // Equal main parts. Convention: 0.0.4 > 0.0.4-beta.1 (release > prerelease).
  if (a.prerelease && !b.prerelease) return true
  if (!a.prerelease && b.prerelease) return false
  if (a.prerelease && b.prerelease) return a.prerelease < b.prerelease
  return false
}

/**
 * Fetch latest-mac.yml from the feed URL and decide whether an update exists.
 * Caller passes app.getVersion() and process.arch.
 *
 * Returns:
 *   { available: false }                                — no update
 *   { available: true, version, downloadUrl, releaseNotes } — update found
 *
 * Throws on network/parse errors so callers can distinguish "no update" from
 * "couldn't tell".
 */
async function checkMacUpdate({ feedUrl, currentVersion, arch, fetchImpl = fetch }) {
  const cleanBase = feedUrl.replace(/\/+$/, '')
  const ymlUrl = `${cleanBase}/latest-mac.yml`
  const res = await fetchImpl(ymlUrl, {
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`latest-mac.yml fetch failed: ${res.status}`)
  }
  const text = await res.text()
  const manifest = parseLatestMacYaml(text)
  if (!compareVersions(currentVersion, manifest.version)) {
    return { available: false }
  }
  const downloadUrl = pickDmgUrl(manifest, arch, cleanBase)
  if (!downloadUrl) {
    throw new Error(`latest-mac.yml lists no DMG for arch=${arch}`)
  }
  return {
    available: true,
    version: manifest.version,
    downloadUrl,
    releaseNotes: manifest.releaseNotes,
  }
}

module.exports = {
  parseLatestMacYaml,
  pickDmgUrl,
  compareVersions,
  checkMacUpdate,
}
