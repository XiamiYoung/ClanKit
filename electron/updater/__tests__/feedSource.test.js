import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Silence logger output in this test file.
vi.mock('../../logger', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {} } }))

const {
  pickFastestSource,
  pickGithubAssetUrl,
  _resetCacheForTest,
} = require('../feedSource')

const R2_BASE = 'https://releases.example.test/stable'
const GH_REPO = 'Acme/Tool'

const WIN_YML = `version: 0.0.5\npath: Setup.exe\nsha512: x==\n`
const MAC_YML = `version: 0.0.5\nfiles:\n  - url: Tool-0.0.5.dmg\n    sha512: x==\n`

function makeFetch(handlers) {
  return vi.fn(async (url) => {
    for (const h of handlers) {
      if (h.match.test(url)) {
        if (h.delay) await new Promise(r => setTimeout(r, h.delay))
        if (h.fail) throw new Error(h.fail)
        return {
          ok: h.status ? h.status >= 200 && h.status < 300 : true,
          status: h.status || 200,
          text: async () => h.body || '',
          json: async () => h.json || {},
        }
      }
    }
    throw new Error(`unmatched URL: ${url}`)
  })
}

beforeEach(() => { _resetCacheForTest() })

describe('pickFastestSource', () => {
  it('returns ok=false when no feed configured', async () => {
    const r = await pickFastestSource({ platform: 'win32', fetchImpl: makeFetch([]) })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no feed/)
  })

  it('R2 wins when both succeed regardless of timing', async () => {
    const fetchImpl = makeFetch([
      { match: /latest\.yml/, body: WIN_YML, delay: 30 },
      { match: /api\.github\.com/, json: { tag_name: 'v0.0.5', assets: [] }, delay: 1 },
    ])
    const r = await pickFastestSource({
      feedUrl: R2_BASE, githubRepo: GH_REPO, platform: 'win32', fetchImpl, force: true,
    })
    expect(r.ok).toBe(true)
    expect(r.source).toBe('r2')
    expect(r.version).toBe('0.0.5')
  })

  it('falls back to GitHub when R2 fails', async () => {
    const fetchImpl = makeFetch([
      { match: /latest\.yml/, fail: 'r2 down' },
      { match: /api\.github\.com/, json: {
        tag_name: '0.0.6',
        html_url: 'https://github.com/Acme/Tool/releases/tag/0.0.6',
        assets: [{ name: 'Tool-Setup-0.0.6.exe', browser_download_url: 'https://github.com/dl/Tool-Setup-0.0.6.exe' }],
      } },
    ])
    const r = await pickFastestSource({
      feedUrl: R2_BASE, githubRepo: GH_REPO, platform: 'win32', fetchImpl, force: true,
    })
    expect(r.ok).toBe(true)
    expect(r.source).toBe('github')
    expect(r.version).toBe('0.0.6')
    expect(r.htmlUrl).toBe('https://github.com/Acme/Tool/releases/tag/0.0.6')
    expect(r.assets).toHaveLength(1)
  })

  it('returns failure when both probes fail', async () => {
    const fetchImpl = makeFetch([
      { match: /latest\.yml/, fail: 'r2 down' },
      { match: /api\.github\.com/, fail: 'gh down' },
    ])
    const r = await pickFastestSource({
      feedUrl: R2_BASE, githubRepo: GH_REPO, platform: 'win32', fetchImpl, force: true,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('uses latest-mac.yml on darwin', async () => {
    let probedUrl = null
    const fetchImpl = vi.fn(async (url) => {
      probedUrl = url
      return { ok: true, text: async () => MAC_YML, json: async () => ({}) }
    })
    const r = await pickFastestSource({
      feedUrl: R2_BASE, platform: 'darwin', fetchImpl, force: true,
    })
    expect(r.ok).toBe(true)
    expect(probedUrl).toContain('latest-mac.yml')
  })

  it('caches result for subsequent calls', async () => {
    const fetchImpl = makeFetch([
      { match: /latest\.yml/, body: WIN_YML },
    ])
    await pickFastestSource({ feedUrl: R2_BASE, platform: 'win32', fetchImpl, force: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await pickFastestSource({ feedUrl: R2_BASE, platform: 'win32', fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('force=true bypasses cache', async () => {
    const fetchImpl = makeFetch([
      { match: /latest\.yml/, body: WIN_YML },
    ])
    await pickFastestSource({ feedUrl: R2_BASE, platform: 'win32', fetchImpl, force: true })
    await pickFastestSource({ feedUrl: R2_BASE, platform: 'win32', fetchImpl, force: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('handles non-2xx HTTP responses as failure', async () => {
    const fetchImpl = makeFetch([
      { match: /latest\.yml/, status: 503 },
      { match: /api\.github\.com/, status: 404 },
    ])
    const r = await pickFastestSource({
      feedUrl: R2_BASE, githubRepo: GH_REPO, platform: 'win32', fetchImpl, force: true,
    })
    expect(r.ok).toBe(false)
  })

  it('strips leading "v" from GitHub tag_name', async () => {
    const fetchImpl = makeFetch([
      { match: /latest\.yml/, fail: 'down' },
      { match: /api\.github\.com/, json: { tag_name: 'v1.2.3', assets: [] } },
    ])
    const r = await pickFastestSource({
      feedUrl: R2_BASE, githubRepo: GH_REPO, platform: 'win32', fetchImpl, force: true,
    })
    expect(r.version).toBe('1.2.3')
  })
})

describe('pickGithubAssetUrl', () => {
  const assets = [
    { name: 'ClanKit Setup 0.0.5.exe', browser_download_url: 'https://gh/exe' },
    { name: 'ClanKit Setup 0.0.5.exe.blockmap', browser_download_url: 'https://gh/blockmap' },
    { name: 'ClanKit-0.0.5.dmg', browser_download_url: 'https://gh/dmg' },
    { name: 'ClanKit-0.0.5-arm64.dmg', browser_download_url: 'https://gh/dmg-arm' },
  ]

  it('finds the .exe (not blockmap) on win32', () => {
    expect(pickGithubAssetUrl(assets, 'win32', 'x64')).toBe('https://gh/exe')
  })

  it('finds the intel .dmg on darwin x64', () => {
    expect(pickGithubAssetUrl(assets, 'darwin', 'x64')).toBe('https://gh/dmg')
  })

  it('finds the arm64 .dmg on darwin arm64', () => {
    expect(pickGithubAssetUrl(assets, 'darwin', 'arm64')).toBe('https://gh/dmg-arm')
  })

  it('returns null when no asset matches', () => {
    expect(pickGithubAssetUrl([{ name: 'unrelated.zip', browser_download_url: 'x' }], 'win32', 'x64')).toBeNull()
  })

  it('returns null on empty input', () => {
    expect(pickGithubAssetUrl([], 'win32', 'x64')).toBeNull()
    expect(pickGithubAssetUrl(null, 'win32', 'x64')).toBeNull()
  })
})
