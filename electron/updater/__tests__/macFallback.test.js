import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const {
  parseLatestMacYaml,
  pickDmgUrl,
  compareVersions,
} = require('../macFallback')

const SAMPLE_YAML = `
version: 0.0.4
files:
  - url: ClanKit-0.0.4.dmg
    sha512: abc==
    size: 209715200
  - url: ClanKit-0.0.4-arm64.dmg
    sha512: def==
    size: 207618048
  - url: ClanKit-0.0.4-mac.zip
    sha512: ghi==
    size: 200000000
path: ClanKit-0.0.4.dmg
sha512: abc==
releaseDate: '2026-05-01T12:00:00.000Z'
`

describe('parseLatestMacYaml', () => {
  it('extracts version and files', () => {
    const m = parseLatestMacYaml(SAMPLE_YAML)
    expect(m.version).toBe('0.0.4')
    expect(m.files).toHaveLength(3)
    expect(m.files[0].url).toBe('ClanKit-0.0.4.dmg')
  })

  it('throws on missing version', () => {
    expect(() => parseLatestMacYaml('files: []')).toThrow(/version/i)
  })

  it('throws on malformed yaml', () => {
    expect(() => parseLatestMacYaml('::not yaml::')).toThrow()
  })
})

describe('pickDmgUrl', () => {
  const manifest = parseLatestMacYaml(SAMPLE_YAML)

  it('picks x64 dmg for x64 arch', () => {
    const url = pickDmgUrl(manifest, 'x64', 'https://releases.clankit.app/stable')
    expect(url).toBe('https://releases.clankit.app/stable/ClanKit-0.0.4.dmg')
  })

  it('picks arm64 dmg for arm64 arch', () => {
    const url = pickDmgUrl(manifest, 'arm64', 'https://releases.clankit.app/stable')
    expect(url).toBe('https://releases.clankit.app/stable/ClanKit-0.0.4-arm64.dmg')
  })

  it('returns null when no matching dmg', () => {
    const empty = { version: '0.0.4', files: [] }
    expect(pickDmgUrl(empty, 'x64', 'https://x')).toBeNull()
  })

  it('strips trailing slash from base url', () => {
    const url = pickDmgUrl(manifest, 'x64', 'https://releases.clankit.app/stable/')
    expect(url).toBe('https://releases.clankit.app/stable/ClanKit-0.0.4.dmg')
  })
})

describe('compareVersions', () => {
  it('returns true when remote > current', () => {
    expect(compareVersions('0.0.3', '0.0.4')).toBe(true)
  })

  it('returns false when remote == current', () => {
    expect(compareVersions('0.0.4', '0.0.4')).toBe(false)
  })

  it('returns false when remote < current (no downgrade)', () => {
    expect(compareVersions('0.0.5', '0.0.4')).toBe(false)
  })

  it('treats prerelease as older than the same release', () => {
    expect(compareVersions('0.0.4', '0.0.4-beta.1')).toBe(false)
    expect(compareVersions('0.0.4-beta.1', '0.0.4')).toBe(true)
  })
})
